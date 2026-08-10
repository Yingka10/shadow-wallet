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
    expect(SQL.match(/CREATE TABLE(?! IF NOT EXISTS)/g) ?? []).toEqual([]);
    for (const table of TABLES) {
      expect({ table, created: SQL.includes(`CREATE TABLE IF NOT EXISTS ${table} (`) })
        .toEqual({ table, created: true });
    }
  });

  it('索引用 CREATE INDEX / UNIQUE INDEX IF NOT EXISTS', () => {
    expect(SQL.match(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/g) ?? []).toEqual([]);
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
    expect(SQL.match(/CREATE FUNCTION/g) ?? []).toEqual([]);
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

  it('**不存最終幣值** —— AI 不決定 coin', () => {
    for (const forbidden of [
      'coin_amount',
      'reward_coin',
      'final_amount',
      'suggested_amount',
      'coin_override',
    ]) {
      expect({ forbidden, present: block.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });

  it('RPC 收到任何幣值一律拒絕，而不是靜靜忽略', () => {
    const body = functionBody('add_child_proposal_plan_version_v1');
    expect(body).toContain("p_command -> 'reward' ? 'coinAmount'");
    expect(body).toContain("p_command -> 'reward' ? 'finalAmount'");
    expect(body).toContain("p_command ? 'coinAmount'");
    expect(body).toContain("'code', 'POLICY_REJECTED'");
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
