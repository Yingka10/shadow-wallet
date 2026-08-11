// P0-1 — child_proposal_contract_v1 migration 驗證
//
// 這是**靜態驗證**，不是跑起來的 SQL 測試。
//
// 專案沒有本機 Postgres：supabase CLI 有，但 `supabase db reset` 需要 Docker，
// 而這台機器沒有 Docker。既有的四支 migration 測試
// （settleInterestMigration / readingDemoMigration / taskDrawerPersistence /
// taskReward）用的都是同一種做法：對 migration 檔案的內容做斷言。
//
// 所以這裡驗的是「這支 migration 有沒有寫出該有的保證」——
// 表與欄位、狀態一致性 CHECK、trigger、RLS、grant/revoke、
// 以及最重要的兩件事：
//
//   · 原始提案不可被覆寫
//   · 試行紀錄不可能碰到 spending wallet
//
// 真正跑一次 SQL 要等到有 Docker 或 staging 環境（見完成報告）。

import { readFileSync } from 'fs';
import { join } from 'path';
// 直接指向 transitions／types，不走 barrel：barrel 會連帶載入
// childProposalService → supabase client，而這支測試不需要它，
// 也不該因為環境變數沒設就噴一堆 console.error。
import { CHILD_PROPOSAL_TRANSITIONS } from '../childProposal/transitions';
import type {
  ChildProposalActorRole,
  ChildProposalStatus,
} from '../childProposal/types';

/**
 * 讀檔一律把 CRLF 正規化成 LF。
 *
 * 這個 repo 的 git 設定會在 checkout 時把行尾轉成 CRLF（Windows），
 * 而下面的斷言用多行片段比對 SQL。不正規化的話，一次 `git checkout`
 * 就能讓一堆測試「壞掉」，但程式其實一個字都沒改。
 */
function readText(path: string): string {
  return readFileSync(path, 'utf8').split(/\r\n/).join('\n');
}

const SQL = readText(
  join(process.cwd(), 'supabase', 'migrations', '20260810000000_child_proposal_contract_v1.sql'),
);

/**
 * 去掉註解之後的 SQL。
 * 「這個東西不存在」的斷言必須看實際程式碼 —— 註解裡解釋
 * 「為什麼不存 coin」本身就會讓字串比對命中。
 */
const CODE = SQL
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

const TABLES = [
  'child_proposals',
  'child_proposal_plan_versions',
  'child_proposal_trial_events',
  'child_proposal_adjustment_requests',
  'child_proposal_status_events',
];

const RPCS = [
  'create_child_proposal_v1',
  'add_child_proposal_plan_version_v1',
  'transition_child_proposal_v1',
  'record_child_proposal_trial_v1',
  'create_child_proposal_adjustment_request_v1',
];

/** 抓出某個 CREATE TABLE 區塊（到第一個 `);` 為止）。 */
function tableBlock(name: string): string {
  const start = CODE.indexOf(`CREATE TABLE IF NOT EXISTS ${name} (`);
  expect(start).toBeGreaterThan(-1);
  const end = CODE.indexOf('\n);', start);
  return CODE.slice(start, end);
}

/** 抓出某支函式的主體（CREATE OR REPLACE FUNCTION … $$; 為止）。 */
function functionBody(name: string): string {
  const start = CODE.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start).toBeGreaterThan(-1);
  const end = CODE.indexOf('\n$$;', start);
  expect(end).toBeGreaterThan(start);
  return CODE.slice(start, end);
}

// ---------------------------------------------------------------------------
// 可重複套用（migration 可完整 up，而且 up 兩次也不會炸）
// ---------------------------------------------------------------------------

describe('migration 可以重複套用', () => {
  it('表用 CREATE TABLE IF NOT EXISTS', () => {
    expect(CODE.match(/CREATE TABLE(?! IF NOT EXISTS)/g) ?? []).toEqual([]);
    for (const table of TABLES) {
      expect({ table, created: SQL.includes(`CREATE TABLE IF NOT EXISTS ${table} (`) })
        .toEqual({ table, created: true });
    }
  });

  it('索引用 CREATE INDEX / UNIQUE INDEX IF NOT EXISTS', () => {
    expect(CODE.match(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/g) ?? []).toEqual([]);
  });

  it('ALTER TABLE 加的 constraint 都先 DROP IF EXISTS', () => {
    const added = [...SQL.matchAll(/ALTER TABLE\s+(\w+)\s+ADD CONSTRAINT (\w+)/g)]
      .map((m) => m[2]);
    expect(added.length).toBeGreaterThan(15);
    for (const name of added) {
      expect({ name, dropped: SQL.includes(`DROP CONSTRAINT IF EXISTS ${name}`) })
        .toEqual({ name, dropped: true });
    }
  });

  it('policy 與 trigger 都先 DROP IF EXISTS', () => {
    const policies = [...SQL.matchAll(/CREATE POLICY "([^"]+)"/g)].map((m) => m[1]);
    expect(policies).toHaveLength(5);
    for (const name of policies) {
      expect({ name, dropped: SQL.includes(`DROP POLICY IF EXISTS "${name}"`) })
        .toEqual({ name, dropped: true });
    }

    const triggers = [...SQL.matchAll(/CREATE TRIGGER (\w+)/g)].map((m) => m[1]);
    expect(triggers.length).toBeGreaterThanOrEqual(5);
    for (const name of triggers) {
      expect({ name, dropped: SQL.includes(`DROP TRIGGER IF EXISTS ${name}`) })
        .toEqual({ name, dropped: true });
    }
  });

  it('函式一律 CREATE OR REPLACE', () => {
    expect(CODE.match(/CREATE FUNCTION/g) ?? []).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 不動既有表
// ---------------------------------------------------------------------------

describe('不碰既有的任務系統', () => {
  it('沒有 ALTER 任何既有表 —— proposal 是 task 之前的階段，不是 task 的副本', () => {
    const altered = new Set(
      [...CODE.matchAll(/ALTER TABLE\s+(?:ONLY\s+)?(\w+)/g)].map((m) => m[1]),
    );
    expect([...altered].sort()).toEqual([...TABLES].sort());
  });

  it('沒有改寫 create_parent_task_v1 或任何既有 RPC', () => {
    const functions = [...CODE.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)/g)]
      .map((m) => m[1]);
    expect(functions).not.toContain('create_parent_task_v1');
    expect(functions).not.toContain('complete_task');
    expect(functions).not.toContain('mark_task_atomic');
    expect(functions).not.toContain('preset_task_replay_payload');
  });

  it('沒有把 B 類 reward-support exception 的舊設計搬進來', () => {
    expect(CODE).not.toContain('reward_support_intent');
    expect(CODE).not.toContain('temporary_startup_support');
    expect(CODE).not.toContain('family_defined_agreement');
  });
});

// ---------------------------------------------------------------------------
// A. Proposal
// ---------------------------------------------------------------------------

describe('child_proposals 的欄位與關聯', () => {
  const block = tableBlock('child_proposals');

  it.each([
    'family_id',
    'child_id',
    'status',
    'child_original_goal',
    'child_original_motivation',
    'proposal_source',
    'cadence_mode',
    'cadence_weekly_frequency',
    'cadence_days',
    'preferred_time',
    'estimated_minutes',
    'child_reward_preference',
    'current_plan_version_id',
    'task_id',
    'closed_reason',
    'proposed_at',
    'activated_at',
    'created_at',
    'updated_at',
  ])('有 %s 欄位', (column) => {
    expect(block).toMatch(new RegExp(`^\\s+${column}\\s`, 'm'));
  });

  it('family / child 都是真的外鍵，不是裸 uuid', () => {
    expect(block).toContain('family_id   uuid        NOT NULL REFERENCES families(id)');
    expect(block).toContain('child_id    uuid        NOT NULL REFERENCES children(id)');
  });

  it('linked task 是外鍵，而且任務被刪時不會連帶刪掉提案', () => {
    expect(block).toContain('task_id                  uuid REFERENCES tasks(id) ON DELETE SET NULL');
  });

  it('狀態值就是拍板的那五個，沒有自行新增', () => {
    expect(CODE).toContain(
      "CHECK (status IN ('draft', 'proposed', 'needs_child_review', 'active', 'closed_unsuitable'))",
    );
  });

  it('提案來源只收 child / co_created —— parent 提的不是孩子的提案', () => {
    expect(CODE).toContain("CHECK (proposal_source IN ('child', 'co_created'))");
  });

  it('孩子的回饋期待用自己的詞彙，不共用 reward_policy 的字面值', () => {
    expect(CODE).toContain(
      "CHECK (child_reward_preference IN\n    ('not_specified', 'just_record', 'see_progress', 'hopes_for_coin'))",
    );
    // 共用的話，之後一定有人把它直接寫進 tasks.reward_policy。
    expect(CODE).not.toMatch(/child_reward_preference[^;]*coin_eligible/);
  });

  it('cadence 沿用 tasks.schedule_mode 的詞彙，不另立一套', () => {
    expect(CODE).toContain(
      "cadence_mode IN ('one_time', 'fixed_days', 'weekly_frequency', 'plan_schedule')",
    );
  });

  it('每份提案只能有一個 linked task', () => {
    expect(CODE).toContain('CREATE UNIQUE INDEX IF NOT EXISTS child_proposals_task_unique');
  });

  it('家長端與孩子端的列表查詢都有索引', () => {
    expect(CODE).toContain('child_proposals_family_status_idx');
    expect(CODE).toContain('child_proposals_child_status_idx');
  });
});

// ---------------------------------------------------------------------------
// E. active/shared 一致性
// ---------------------------------------------------------------------------

describe('狀態一致性', () => {
  it('active 一定同時有 linked task 與 current plan version', () => {
    expect(CODE).toContain(`CHECK (
    status <> 'active'
    OR (task_id IS NOT NULL AND current_plan_version_id IS NOT NULL AND activated_at IS NOT NULL)
  )`);
  });

  it('還沒 active 的提案不可以有正式任務', () => {
    expect(CODE).toContain("CHECK (status = 'active' OR task_id IS NULL)");
  });

  it('needs_child_review 一定有一個待接受的版本', () => {
    expect(CODE).toContain(
      "CHECK (status <> 'needs_child_review' OR current_plan_version_id IS NOT NULL)",
    );
  });

  it('回絕一定有原因與時間，沒回絕就不該有', () => {
    expect(CODE).toContain('child_proposals_closed_consistency');
    expect(CODE).toContain("btrim(COALESCE(closed_reason, '')) <> ''");
  });

  it('current plan version 用複合外鍵綁死在同一份提案上', () => {
    // 單欄外鍵只保證「這是某一個版本」，擋不住指向別人家的版本。
    expect(CODE).toContain(`FOREIGN KEY (current_plan_version_id, id)
  REFERENCES child_proposal_plan_versions (id, proposal_id)`);
    expect(CODE).toContain('CONSTRAINT child_proposal_plan_versions_id_proposal_key UNIQUE (id, proposal_id)');
  });

  it('linked task 必須屬於同一個家庭與孩子（CHECK 做不到，用 trigger）', () => {
    const body = functionBody('child_proposal_guard_linked_task');
    expect(body).toContain('SELECT t.family_id INTO v_task_family FROM tasks t');
    expect(body).toContain('FROM child_tasks ct');
    expect(body).toContain('ct.task_id = NEW.task_id AND ct.child_id = NEW.child_id');
  });
});

// ---------------------------------------------------------------------------
// 原始提案不可覆寫
// ---------------------------------------------------------------------------

describe('孩子的原始目標與動機永久可追溯', () => {
  const body = functionBody('child_proposal_guard_immutable');

  it('trigger 擋住任何對原始目標的修改', () => {
    expect(body).toContain('NEW.child_original_goal IS DISTINCT FROM OLD.child_original_goal');
  });

  it('trigger 擋住任何對原始動機的修改', () => {
    expect(body).toContain(
      'NEW.child_original_motivation IS DISTINCT FROM OLD.child_original_motivation',
    );
  });

  it('trigger 擋住把提案搬到別的孩子或家庭名下', () => {
    expect(body).toContain('NEW.child_id IS DISTINCT FROM OLD.child_id');
    expect(body).toContain('NEW.family_id IS DISTINCT FROM OLD.family_id');
  });

  it('trigger 真的掛在 child_proposals 的 BEFORE UPDATE 上', () => {
    expect(CODE).toContain(`CREATE TRIGGER child_proposals_guard_immutable
  BEFORE UPDATE ON child_proposals
  FOR EACH ROW EXECUTE FUNCTION public.child_proposal_guard_immutable();`);
  });

  it('新增 plan version 的 RPC 不會去 UPDATE 原始欄位', () => {
    const body2 = functionBody('add_child_proposal_plan_version_v1');
    expect(body2).not.toContain('child_original_goal');
    expect(body2).not.toContain('child_original_motivation');
  });

  it('沒有任何一支 RPC 會寫原始欄位（除了建立當下）', () => {
    for (const rpc of RPCS.filter((r) => r !== 'create_child_proposal_v1')) {
      expect({ rpc, touches: functionBody(rpc).includes('child_original_goal') })
        .toEqual({ rpc, touches: false });
    }
  });
});

// ---------------------------------------------------------------------------
// B. Plan version
// ---------------------------------------------------------------------------

describe('child_proposal_plan_versions', () => {
  const block = tableBlock('child_proposal_plan_versions');

  it('保存 AI / Plan Draft snapshot', () => {
    expect(block).toMatch(/^\s+ai_snapshot\s+jsonb/m);
    expect(block).toMatch(/^\s+ai_model\s/m);
    expect(block).toMatch(/^\s+ai_request_id\s/m);
  });

  it('保存 reward eligibility 與兩種 policy version', () => {
    expect(block).toMatch(/^\s+reward_policy\s/m);
    expect(block).toMatch(/^\s+reward_eligibility\s/m);
    expect(block).toMatch(/^\s+reward_policy_version\s/m);
    expect(block).toMatch(/^\s+task_policy_version\s/m);
  });

  it('不存任何自己算出來的幣值欄位 —— 沒有第二套 pricing engine', () => {
    // reward_coin_* / coin_override / base_time_min 是 tasks 那條路徑的欄位。
    // 出現在這裡就代表有人開始在版本上算幣值了。
    for (const forbidden of ['reward_coin', 'coin_override', 'final_amount', 'base_time_min']) {
      expect({ forbidden, present: block.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });

  it('RPC 收到任何最終幣值一律拒絕，而不是靜靜忽略', () => {
    const body = functionBody('add_child_proposal_plan_version_v1');
    expect(body).toContain("p_command -> 'reward' ? 'coinAmount'");
    expect(body).toContain("p_command -> 'reward' ? 'finalAmount'");
    expect(body).toContain("p_command -> 'reward' ? 'confirmedCoinAmount'");
    expect(body).toContain("p_command ? 'coinAmount'");
    expect(body).toContain("p_command ? 'confirmedReward'");
    expect(body).toContain("'reason', 'REWARD_NOT_CLIENT_DECIDED'");
  });

  it('reward_policy 排除 time_saving_eligible（3C／時間儲蓄不在本包）', () => {
    expect(CODE).toContain(
      "reward_policy IN\n       ('record_only', 'family_contribution', 'progress_only', 'coin_eligible')",
    );
    expect(CODE).not.toContain("'time_saving_eligible'");
  });

  it('allowed / blocked 的判定一定附政策版本', () => {
    expect(CODE).toContain('child_proposal_plan_versions_eligibility_needs_version');
    expect(CODE).toContain(`CHECK (
    reward_eligibility = 'not_evaluated'
    OR btrim(COALESCE(reward_policy_version, '')) <> ''
  )`);
  });

  it('AI 寫的版本不能自己帶家長確認時間', () => {
    expect(CODE).toContain(
      "CHECK (authored_by <> 'ai' OR parent_confirmed_at IS NULL)",
    );
  });

  it('版本時間語意分開：created / effective / superseded', () => {
    expect(block).toMatch(/^\s+effective_at\s+timestamptz/m);
    expect(block).toMatch(/^\s+superseded_at\s+timestamptz/m);
    expect(block).toMatch(/^\s+created_at\s+timestamptz\s+NOT NULL DEFAULT now\(\)/m);
    expect(block).toMatch(/^\s+child_accepted_at\s/m);
    expect(block).toMatch(/^\s+parent_confirmed_at\s/m);
  });

  it('版號在每份提案內唯一，而且由 DB 算', () => {
    expect(CODE).toContain('CREATE UNIQUE INDEX IF NOT EXISTS child_proposal_plan_versions_no_unique');
    expect(functionBody('add_child_proposal_plan_version_v1'))
      .toContain('SELECT COALESCE(MAX(v.version_no), 0) + 1 INTO v_version_no');
  });

  it('版本是 append-only：內容欄位不可 UPDATE', () => {
    const body = functionBody('child_proposal_plan_version_guard');
    for (const column of [
      'version_no',
      'authored_by',
      'plan_title',
      'cadence_mode',
      'reward_policy',
      'ai_snapshot',
    ]) {
      // 對齊用的多餘空白不算差異 —— 這裡驗的是「有沒有守住這一欄」。
      const guarded = new RegExp(
        `NEW\\.${column}\\s+IS DISTINCT FROM OLD\\.${column}\\b`,
      ).test(body);
      expect({ column, guarded }).toEqual({ column, guarded: true });
    }
  });
});

// ---------------------------------------------------------------------------
// B2. 家庭最後共同確認的回饋（shared version 可追溯）
// ---------------------------------------------------------------------------

describe('shared version 的回饋可追溯', () => {
  const block = tableBlock('child_proposal_plan_versions');

  it.each([
    'confirmed_reward_policy',
    'confirmed_coin_amount',
    'confirmed_payout_basis',
    'confirmed_claim_period',
    'confirmed_max_claims_per_period',
    'confirmed_reward_policy_version',
    'confirmed_task_policy_version',
    'confirmed_source_task_id',
    'confirmed_by_user_id',
    'confirmed_at',
  ])('版本上有 %s', (column) => {
    expect(block).toMatch(new RegExp(`^\\s+${column}\\s`, 'm'));
    // 補欄位那一段也要有，否則已套用舊版本的環境補不齊。
    expect(CODE).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
  });

  it('AI 建議與最終確認是兩組欄位，名字上就分得開', () => {
    expect(block).toMatch(/^\s+ai_suggested_coin_amount\s/m);
    expect(CODE).toContain('ADD COLUMN IF NOT EXISTS ai_suggested_coin_amount');
  });

  it('AI 建議的幣值一定要有 snapshot 撐著', () => {
    expect(CODE).toContain('child_proposal_plan_versions_ai_suggestion_needs_snapshot');
    expect(CODE).toContain(`CHECK (
    ai_suggested_coin_amount IS NULL
    OR (ai_snapshot IS NOT NULL AND ai_suggested_coin_amount >= 0)
  )`);
  });

  it('確認一定掛在一個真實帳號上', () => {
    // 這裡刻意**不**限制 authored_by：AI 起草的計畫當然可以成為共同版本，
    // 確認它的是家長，名字記在 confirmed_by_user_id。
    // （初版寫成 authored_by <> 'ai'，staging 第一次實跑就把它擋下來了。）
    expect(CODE).toContain(
      "CHECK (confirmed_at IS NULL OR confirmed_by_user_id IS NOT NULL)",
    );
    expect(CODE).not.toContain("CHECK (authored_by <> 'ai' OR confirmed_at IS NULL)");
  });

  it('AI 起草的版本仍然可以被確認 —— 沒有任何 constraint 擋 authored_by', () => {
    const confirmedChecks = [
      ...CODE.matchAll(/ADD CONSTRAINT (\w*confirmed\w*)\s+CHECK \(([^;]*)\);/g),
    ].map((m) => ({ name: m[1], body: m[2] }));
    expect(confirmedChecks.length).toBeGreaterThan(0);
    for (const c of confirmedChecks) {
      expect({ name: c.name, mentionsAuthor: c.body.includes('authored_by') })
        .toEqual({ name: c.name, mentionsAuthor: false });
    }
  });

  it('快照是全有全無 —— 不會出現只填一半的確認', () => {
    expect(CODE).toContain('child_proposal_plan_versions_confirmed_atomic');
    expect(CODE).toContain('CASE WHEN confirmed_at IS NULL');
  });

  it('coin_eligible 一定有金額，不發幣一定沒有金額（兩個方向都擋）', () => {
    expect(CODE).toContain('child_proposal_plan_versions_confirmed_coin_scope');
    expect(CODE).toContain(`CASE WHEN confirmed_reward_policy = 'coin_eligible'
        THEN confirmed_coin_amount IS NOT NULL AND confirmed_coin_amount > 0
        ELSE confirmed_coin_amount IS NULL
      END`);
  });

  it('payout basis 與 claim period 都沿用既有詞彙，沒有另立一套', () => {
    expect(CODE).toContain(
      "confirmed_payout_basis IN ('per_completion', 'per_period', 'one_time')",
    );
    expect(CODE).toContain("confirmed_claim_period IN ('day', 'week', 'once')");
  });

  it('payout basis 由 tasks.claim_period 推導，映射只有一份', () => {
    const body = functionBody('child_proposal_payout_basis');
    expect(body).toContain("WHEN 'once' THEN 'one_time'");
    expect(body).toContain("WHEN 'week' THEN 'per_period'");
    expect(body).toContain("WHEN 'day'  THEN 'per_completion'");
    expect(body).toContain('IMMUTABLE');
    // 沒見過的 claim_period 回 NULL，呼叫端必須當錯誤，不可塞預設值。
    expect(body).toContain('ELSE NULL');
  });

  it('**快照的每一個值都從 tasks 複製，一個都不從命令來**', () => {
    const body = functionBody('transition_child_proposal_v1');
    const flat = body.replace(/\s+/g, ' ');

    expect(body).toContain('SELECT * INTO v_task FROM tasks t WHERE t.id = v_task_id;');

    const COPIED: [string, string][] = [
      ['confirmed_reward_policy', 'v_task.reward_policy'],
      ['confirmed_coin_amount', 'v_task.reward_coin_amount'],
      ['confirmed_payout_basis', 'v_payout_basis'],
      ['confirmed_claim_period', 'v_task.claim_period'],
      ['confirmed_max_claims_per_period', 'v_task.max_claims_per_period'],
      ['confirmed_reward_policy_version', 'v_task.reward_policy_version'],
      ['confirmed_task_policy_version', 'v_task.task_policy_version'],
      ['confirmed_source_task_id', 'v_task_id'],
    ];

    for (const [column, source] of COPIED) {
      const escaped = source.replace(/\./g, '\\.');
      const fromTask = new RegExp(`${column} = COALESCE\\([^;]*?${escaped}`).test(flat);
      expect({ column, fromTask }).toEqual({ column, fromTask: true });
    }

    // 命令裡的幣值鍵在這一支根本沒有被讀過 —— 沒有讀就沒有路徑。
    expect(body).not.toContain("p_command ->> 'coinAmount'");
    expect(body).not.toContain("p_command -> 'reward'");
    expect(body).not.toContain("p_command ->> 'rewardPolicy'");
  });

  it('快照殘缺的任務不可以成為共同版本', () => {
    const body = functionBody('transition_child_proposal_v1');
    expect(body).toContain("'reason', 'TASK_REWARD_SNAPSHOT_INCOMPLETE'");
    expect(body).toContain('v_task.reward_policy IS NULL');
    expect(body).toContain("btrim(COALESCE(v_task.reward_policy_version, '')) = ''");
    expect(body).toContain('v_payout_basis IS NULL');
  });

  it('linked task 的家庭邊界在 RPC 就先擋一次', () => {
    expect(functionBody('transition_child_proposal_v1'))
      .toContain('Not authorized: task % belongs to another family');
  });

  it('快照是 write-once —— 填上之後一個字都不能改', () => {
    const body = functionBody('child_proposal_plan_version_guard');
    expect(body).toContain('IF OLD.confirmed_at IS NOT NULL AND (');
    for (const column of [
      'confirmed_reward_policy',
      'confirmed_coin_amount',
      'confirmed_payout_basis',
      'confirmed_claim_period',
      'confirmed_max_claims_per_period',
      'confirmed_reward_policy_version',
      'confirmed_source_task_id',
    ]) {
      const guarded = new RegExp(
        `NEW\\.${column}\\s+IS DISTINCT FROM OLD\\.${column}\\b`,
      ).test(body);
      expect({ column, guarded }).toEqual({ column, guarded: true });
    }
  });

  it('AI 建議的幣值也是不可變的（它是歷史事實）', () => {
    expect(functionBody('child_proposal_plan_version_guard'))
      .toContain('NEW.ai_suggested_coin_amount IS DISTINCT FROM OLD.ai_suggested_coin_amount');
  });

  it('RPC 把快照原樣回傳，P0-5 可以直接對帳', () => {
    const body = functionBody('transition_child_proposal_v1');
    expect(body).toContain("'confirmedReward'");
    expect(body).toContain("'sourceTaskId',       v_task_id");
  });
});

// ---------------------------------------------------------------------------
// C. Trial event —— P0 絕不入帳
// ---------------------------------------------------------------------------

describe('試行紀錄不可能碰到 spending wallet', () => {
  const block = tableBlock('child_proposal_trial_events');

  it('這張表沒有任何錢包 / 交易欄位 —— 沒有欄位就沒有路徑', () => {
    for (const forbidden of [
      'wallet_id',
      'transaction_id',
      'coin',
      'balance',
      'amount',
      'time_saving',
    ]) {
      expect({ forbidden, present: block.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });

  it('wallet_effect 被 CHECK 釘在 none', () => {
    expect(CODE).toContain("CHECK (wallet_effect = 'none')");
    expect(block).toContain("wallet_effect text NOT NULL DEFAULT 'none'");
  });

  it('也沒有回補用的欄位 —— P0 不做試行幣自動回補', () => {
    for (const forbidden of ['backfill', 'settled', 'redeemed', 'granted']) {
      expect({ forbidden, present: block.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });

  it('記錄試行的 RPC 完全不提 wallets / transactions / task_completions', () => {
    const body = functionBody('record_child_proposal_trial_v1');
    for (const forbidden of ['wallets', 'transactions', 'task_completions', 'time_savings']) {
      expect({ forbidden, present: body.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
    // 回傳明確帶 walletEffect，呼叫端不必靠「沒有 coin 欄位」推論。
    expect(body).toContain("'walletEffect', 'none'");
  });

  it('整支 migration 沒有任何地方寫入錢包相關的表', () => {
    expect(CODE).not.toMatch(/INSERT INTO (wallets|transactions|task_completions|time_savings)/);
    expect(CODE).not.toMatch(/UPDATE (wallets|transactions|task_completions|time_savings)\b/);
  });

  it('試行只屬於尚未成立的提案（trigger ＋ RPC 兩層）', () => {
    expect(functionBody('child_proposal_trial_guard'))
      .toContain("v_status NOT IN ('draft', 'proposed', 'needs_child_review')");
    expect(functionBody('record_child_proposal_trial_v1'))
      .toContain("v_status NOT IN ('draft', 'proposed', 'needs_child_review')");
  });

  it('一天一筆，與既有的信任制規則一致', () => {
    expect(CODE).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS child_proposal_trial_events_daily_unique\n  ON child_proposal_trial_events (proposal_id, occurred_on)',
    );
  });
});

// ---------------------------------------------------------------------------
// D. Adjustment request
// ---------------------------------------------------------------------------

describe('child_proposal_adjustment_requests（P0-8 接點）', () => {
  const block = tableBlock('child_proposal_adjustment_requests');

  it('接回同一條版本鏈，不長出第二套版本歷史', () => {
    expect(block).toContain('based_on_plan_version_id');
    expect(block).toContain('resolved_plan_version_id');
    expect(CODE).toContain(
      "CHECK (status <> 'accepted' OR resolved_plan_version_id IS NOT NULL)",
    );
  });

  it('open 沒有結案資訊，結案了一定有時間', () => {
    expect(CODE).toContain('child_proposal_adjustment_requests_resolved_consistency');
  });

  it('本輪只做建立，沒有 accept / decline 的 RPC', () => {
    const functions = [...CODE.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)/g)]
      .map((m) => m[1]);
    expect(functions.filter((f) => f.includes('adjustment')))
      .toEqual(['create_child_proposal_adjustment_request_v1']);
  });
});

// ---------------------------------------------------------------------------
// E. 權限
// ---------------------------------------------------------------------------

describe('權限與家庭邊界', () => {
  it('五張表都開了 RLS', () => {
    for (const table of TABLES) {
      expect({ table, rls: CODE.includes(`ALTER TABLE ${table}`) && CODE.includes('ENABLE ROW LEVEL SECURITY') })
        .toEqual({ table, rls: true });
    }
    expect(CODE.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).toHaveLength(5);
  });

  it('只有 SELECT policy —— 寫入一律走 SECURITY DEFINER RPC', () => {
    const policyKinds = [...CODE.matchAll(/CREATE POLICY "[^"]+"\n\s+ON \w+ FOR (\w+)/g)]
      .map((m) => m[1]);
    expect(policyKinds).toEqual(['SELECT', 'SELECT', 'SELECT', 'SELECT', 'SELECT']);
  });

  it('家庭比對用 parents 子查詢，不是 my_family_id()（後者是 LIMIT 1，雙家長會挑錯家）', () => {
    expect(CODE).toContain('SELECT p.family_id FROM parents p WHERE p.user_id = auth.uid()');
    expect(CODE).not.toContain('my_family_id()');
  });

  it('authenticated 只拿得到 SELECT，anon 什麼都沒有', () => {
    expect(CODE).toContain('REVOKE ALL ON child_proposals, child_proposal_plan_versions, child_proposal_trial_events,\n              child_proposal_adjustment_requests, child_proposal_status_events\n  FROM PUBLIC, anon, authenticated;');
    expect(CODE).toContain('GRANT SELECT ON child_proposals');
    expect(CODE).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]*child_proposal/);
  });

  it('每一支 RPC 都是 SECURITY DEFINER 且鎖住 search_path', () => {
    for (const rpc of RPCS) {
      const body = functionBody(rpc);
      expect({ rpc, definer: body.includes('SECURITY DEFINER') })
        .toEqual({ rpc, definer: true });
      expect({ rpc, searchPath: body.includes('SET search_path = public') })
        .toEqual({ rpc, searchPath: true });
    }
  });

  it('每一支 RPC 都 REVOKE anon 再 GRANT authenticated', () => {
    for (const rpc of RPCS) {
      expect({ rpc, revoked: CODE.includes(`REVOKE ALL ON FUNCTION public.${rpc}(jsonb) FROM PUBLIC, anon;`) })
        .toEqual({ rpc, revoked: true });
      expect({ rpc, granted: CODE.includes(`GRANT EXECUTE ON FUNCTION public.${rpc}(jsonb) TO authenticated;`) })
        .toEqual({ rpc, granted: true });
    }
  });

  it('跨家庭一律擋掉，而且每一支 RPC 都走同一個 assert', () => {
    const assertBody = functionBody('assert_child_in_caller_family');
    expect(assertBody).toContain(
      'SELECT 1 FROM parents p WHERE p.user_id = auth.uid() AND p.family_id = v_family',
    );
    expect(assertBody).toContain("USING ERRCODE = '42501'");

    for (const rpc of RPCS) {
      expect({ rpc, guarded: functionBody(rpc).includes('assert_child_in_caller_family') })
        .toEqual({ rpc, guarded: true });
    }
  });

  it('找不到孩子與跨家庭回同一個錯誤 —— 分開會變成 child id 的列舉工具', () => {
    expect(functionBody('assert_child_in_caller_family')).toContain(
      'IF v_family IS NULL OR NOT EXISTS (',
    );
  });

  it('未登入直接 42501', () => {
    expect(functionBody('assert_child_in_caller_family')).toContain('IF auth.uid() IS NULL THEN');
  });

  it('建立提案不接受 active —— 不能繞過家長確認', () => {
    const body = functionBody('create_child_proposal_v1');
    expect(body).toContain("v_status NOT IN ('draft', 'proposed')");
  });

  it('轉換 RPC 會驗 actor 角色，而且用 FOR UPDATE 擋並發重複確認', () => {
    const body = functionBody('transition_child_proposal_v1');
    expect(body).toContain('public.child_proposal_transition_allowed(v_from, v_to, v_actor)');
    expect(body).toContain('FOR UPDATE');
    expect(body).toContain("v_actor NOT IN ('child', 'parent')");
  });

  it('轉 active 一定要帶 linked task 與 current plan version', () => {
    const body = functionBody('transition_child_proposal_v1');
    expect(body).toContain("'reason', 'ACTIVE_REQUIRES_TASK'");
    expect(body).toContain("'reason', 'ACTIVE_REQUIRES_PLAN_VERSION'");
  });

  it('回絕一定要有原因', () => {
    expect(functionBody('transition_child_proposal_v1'))
      .toContain("'reason', 'CLOSE_REQUIRES_REASON'");
  });
});

// ---------------------------------------------------------------------------
// 身分模型的敘述必須誠實
// ---------------------------------------------------------------------------
//
// 這一段測的是**文件與註解**，看起來不像測試該做的事。
// 做的理由是：這個契約唯一會害人的方式，就是下一個人以為 RLS 已經
// 擋住了 child identity。那不是程式錯誤，是敘述錯誤 ——
// 而敘述錯誤沒有任何其他測試抓得到。
//
// ⚠️ 只讀 **tracked** 的來源（migration SQL、types.ts）。
//
// 這一段原本還讀 docs/CONTRACT_P0-1_child-proposal.md，而 `docs/` 在
// .gitignore 裡（「local analysis & scratch docs」）—— 那份檔案從來沒有
// 進過版本庫。結果是同一個 commit 在兩台機器上結果不同：手邊剛好有那份
// 草稿的機器全套 pass，乾淨 clone 或新開的 worktree 直接 collection fail。
// 而且 `readText` 在 describe 主體執行，所以少一份 scratch 檔案會讓
// **整支測試檔**的一百多條斷言一起倒，看起來像 P0-1 契約壞了。
//
// 那兩句敘述本來就寫在 tracked 的 migration 裡（見下面的 ✅／❌ 斷言），
// 所以這裡改讀真正的來源，不是把斷言刪掉。

describe('child identity 的限制被誠實標示', () => {
  const TYPES = readText(join(process.cwd(), 'src', 'lib', 'childProposal', 'types.ts'));

  it('SQL 明講 actor_role 不是身分證明', () => {
    expect(SQL).toContain('不是身分證明');
    expect(SQL).toContain('稽核 / 畫面用的角色標記');
  });

  it('型別的 doc comment 明講它是 audit / UI role', () => {
    expect(TYPES).toContain('audit / UI role，不是 authentication proof');
    expect(TYPES).toContain('它**不可以**被當成安全控制');
  });

  it('型別也講清楚真正成立的邊界是哪一個', () => {
    // 只說「這個證明不了」而不說「那個成立」，讀的人會以為兩邊都不可靠，
    // 然後在應用層另外做一套家庭過濾 —— 那才是真的會出事的地方。
    expect(TYPES).toContain('真正成立的邊界是**家庭**');
  });

  it('契約把「硬邊界」與「證明不了」分開列出，而且分得出哪個是哪個', () => {
    // 兩句都出現還不夠 —— 重點是下一個人看得出哪一個是保證、
    // 哪一個不是。✅／❌ 的標記就是那個區分，所以連標記一起釘。
    expect(SQL).toContain('✅ 跨家庭隔離是**硬邊界**');
    expect(SQL).toContain('❌ 同一個家庭裡「現在操作的是哪一個孩子」**證明不了**');
  });

  it('沒有任何地方宣稱 RLS 擋得住孩子越權', () => {
    // 這幾種說法都是在承諾一件做不到的事。
    for (const overclaim of [
      'RLS 擋住孩子',
      'RLS 保證孩子',
      'RLS 限制孩子只能',
      'policy 分得出孩子',
    ]) {
      expect({ overclaim, present: SQL.includes(overclaim) || TYPES.includes(overclaim) })
        .toEqual({ overclaim, present: false });
    }
  });

  it('跨家庭仍然是硬邊界，而且說得出是哪一段程式在擋', () => {
    expect(functionBody('assert_child_in_caller_family'))
      .toContain('SELECT 1 FROM parents p WHERE p.user_id = auth.uid() AND p.family_id = v_family');
    expect(SQL).toContain('跨家庭隔離是**硬邊界**');
  });

  it('沒有為了 P0 塞進一套 child auth 子系統', () => {
    // 新增 child credential 會長成這些東西。一個都不該出現。
    for (const forbidden of [
      'child_credentials',
      'child_sessions',
      'child_tokens',
      'pin_hash',
      'CREATE TABLE IF NOT EXISTS child_auth',
    ]) {
      expect({ forbidden, present: CODE.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });
});

// ---------------------------------------------------------------------------
// 狀態機：SQL ↔ TS parity
// ---------------------------------------------------------------------------

describe('狀態機在 SQL 與 TS 兩邊一致', () => {
  /** 從 child_proposal_transition_allowed 的 VALUES 解出轉換表。 */
  function sqlTransitions(): { from: string; to: string; actor: string }[] {
    const body = functionBody('child_proposal_transition_allowed');
    return [...body.matchAll(/\('(\w+)',\s*'(\w+)',\s*'(\w+)'\)/g)]
      .map((m) => ({ from: m[1], to: m[2], actor: m[3] }));
  }

  it('兩邊的轉換數量與內容完全相同', () => {
    const fromSql = sqlTransitions();
    const fromTs = CHILD_PROPOSAL_TRANSITIONS.map((t) => ({
      from: t.from as string,
      to: t.to as string,
      actor: t.actor as string,
    }));
    expect(fromSql).toEqual(fromTs);
  });

  it('SQL 的合法值集合與 TS 的型別窮舉一致', () => {
    const statuses = new Set<string>();
    const actors = new Set<string>();
    for (const t of sqlTransitions()) {
      statuses.add(t.from);
      statuses.add(t.to);
      actors.add(t.actor);
    }
    // draft 只出現在 from，closed_unsuitable 只出現在 to —— 兩個都要在集合裡。
    expect([...statuses].sort()).toEqual(
      (['active', 'closed_unsuitable', 'draft', 'needs_child_review', 'proposed'] as ChildProposalStatus[]),
    );
    expect([...actors].sort()).toEqual(['child', 'parent'] as ChildProposalActorRole[]);
  });

  it('trigger 用形狀模式（actor = NULL）呼叫，不是跳過檢查', () => {
    const body = functionBody('child_proposal_guard_transition');
    expect(body).toContain(
      'public.child_proposal_transition_allowed(OLD.status, NEW.status, NULL)',
    );
    expect(body).toContain('不合法的提案狀態轉換');
  });

  it('轉換函式是 IMMUTABLE，可以安全地放在 CHECK 之外的任何地方', () => {
    expect(functionBody('child_proposal_transition_allowed')).toContain('IMMUTABLE');
  });
});

// ---------------------------------------------------------------------------
// 型別層也要擋住直寫
// ---------------------------------------------------------------------------

describe('types/database.ts 不開放 client 直寫', () => {
  const DB_TYPES = readText(join(process.cwd(), 'src', 'types', 'database.ts'));

  it.each(TABLES)('%s 的 Insert / Update 都是 never', (table) => {
    // RLS 沒有 INSERT policy，但型別如果放行，`supabase.from().insert()`
    // 會一路寫到執行期才失敗 —— 而在 staging 用 service_role 跑的腳本
    // 根本不會失敗，它會繞過整個狀態機成功寫進去。
    const start = DB_TYPES.indexOf(`      ${table}: {`);
    expect({ table, declared: start > -1 }).toEqual({ table, declared: true });

    const block = DB_TYPES.slice(start, DB_TYPES.indexOf('      };', start));
    expect({ table, insert: block.includes('Insert: never;') })
      .toEqual({ table, insert: true });
    expect({ table, update: block.includes('Update: never;') })
      .toEqual({ table, update: true });
  });

  it('五支 RPC 都在 Functions 裡宣告過', () => {
    for (const rpc of RPCS) {
      expect({ rpc, declared: DB_TYPES.includes(`      ${rpc}: {`) })
        .toEqual({ rpc, declared: true });
    }
  });
});
