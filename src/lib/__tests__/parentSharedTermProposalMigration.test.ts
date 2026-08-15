// P1-A4B1 — 家長共同條件草案的持久化不變式
//
// ─────────────────────────────────────────────────────────────────────────────
// 這一組守六件事：
//
//   1. **legacy 的三支 review RPC 一個字都沒改。**
//   2. **孩子擁有的欄位拒絕，不是忽略。**
//   3. **終點是 needs_child_review，不是 active。** 不建任務、不發幣、
//      不寫 confirmed reward。
//   4. **來源必須沿 adopted_from 走得回一份孩子自己規劃的計畫。**
//   5. **未決集合重算，不是照抄、也不是清空。**
//   6. **政策證據沿用 A4A.1 的正式欄位，而且不讀 ai_snapshot。**
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations');

function read(name: string): string {
  return readFileSync(join(MIGRATIONS, name), 'utf8').replace(/\r\n/g, '\n');
}

const SQL = read('20260828000000_parent_shared_term_proposal.sql');
const CODE = SQL.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');

function body(source: string, name: string): string {
  const start = source.indexOf(`FUNCTION public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('$$;', start));
}

const PROPOSE = body(CODE, 'propose_child_planning_terms_v1');
const PUBLISH = body(CODE, 'publish_child_confirmed_plan_v1');
const FLAT = PROPOSE.replace(/\s+/g, ' ');

// ---------------------------------------------------------------------------

describe('1. legacy P0 review flow 完全沒被動到', () => {
  it('這支 migration 沒有重新定義 legacy 的任何一支', () => {
    for (const legacy of [
      'revise_child_proposal_plan_v1',
      'accept_child_proposal_plan_v1',
      'request_child_proposal_changes_v1',
      'close_child_proposal_unsuitable_v1',
    ]) {
      expect(CODE).not.toContain(`FUNCTION public.${legacy}`);
    }
  });

  it('legacy revise 的 P0 前提仍然寫在原處', () => {
    const legacy = body(
      read('20260815000000_child_proposal_review_flow.sql'), 'revise_child_proposal_plan_v1');
    expect(legacy).toContain("v_source.authored_by NOT IN ('ai', 'parent')");
    // 沒有被放寬成把 child 也收進去。
    expect(legacy).not.toContain('source_planning_session_id');
    expect(legacy).not.toContain('child_confirmed_plan');
  });

  it('新的這一支才認 P1 lineage', () => {
    expect(PROPOSE).toContain('NOT_CHILD_PLANNING_LINEAGE');
    expect(PROPOSE).toContain("chain.authored_by = 'child'");
    expect(PROPOSE).toContain('chain.source_planning_session_id IS NOT NULL');
    expect(PROPOSE).toContain('chain.child_confirmed_plan IS NOT NULL');
  });
});

describe('2. 孩子擁有的欄位', () => {
  it('命令帶了就整筆拒絕', () => {
    // 忽略的話，家長端顯示「已送出」，而他以為自己改掉的那句話沒有變 ——
    // 兩邊看到的是兩份計畫。
    expect(PROPOSE).toContain('CHILD_PLAN_FIELD_NOT_EDITABLE');
    for (const field of [
      'desiredOutcome', 'actionPlanSummary', 'nextAction', 'childConfirmedPlan',
      'planTitle', 'planSummary', 'nextStep',
      'progressionKind', 'phases', 'targetValue', 'targetUnit', 'goalControlType',
    ]) {
      expect(FLAT).toContain(`'${field}'`);
    }
  });

  it('sharedTerms 是白名單，不是黑名單', () => {
    expect(PROPOSE).toContain('SHARED_TERM_NOT_EDITABLE');
    expect(FLAT).toContain(
      "key NOT IN ( 'cadenceMode', 'cadenceWeeklyFrequency', 'cadenceDays', "
      + "'preferredTime', 'preferredTimeCustom', 'sessionMinutes', 'durationDays', "
      + "'rewardChoice' )");
  });

  it('孩子擁有的欄位逐欄從來源複製，一欄都不從命令讀', () => {
    const insert = PROPOSE.slice(
      PROPOSE.indexOf('INSERT INTO child_proposal_plan_versions'),
      PROPOSE.indexOf('RETURNING id INTO v_parent_plan_id'),
    );
    expect(insert).toContain('v_source.plan_title, v_source.plan_summary');
    expect(insert).toContain('v_source.next_step');
    expect(insert).toContain('v_source.completion_description');
    expect(insert).not.toContain('p_command');
  });

  it('事後驗證孩子那一版逐欄未改', () => {
    expect(FLAT).toContain('AND c.child_confirmed_plan IS NOT DISTINCT FROM v_root.child_confirmed_plan');
    expect(FLAT).toContain('AND c.cadence_mode IS NOT DISTINCT FROM v_root.cadence_mode');
    expect(FLAT).toContain('AND c.estimated_minutes IS NOT DISTINCT FROM v_root.estimated_minutes');
    expect(FLAT).toContain('AND c.requires_parent_decision IS NOT DISTINCT FROM v_root.requires_parent_decision');
  });
});

describe('3. 終點是 needs_child_review，不是 active', () => {
  it('不建任務、不碰錢包', () => {
    expect(PROPOSE).not.toContain('create_parent_task_v1');
    expect(PROPOSE).not.toMatch(/INSERT INTO tasks\b/);
    expect(PROPOSE).not.toMatch(/INSERT INTO child_tasks\b/);
    expect(PROPOSE).not.toMatch(/INSERT INTO transactions\b/);
    expect(PROPOSE).not.toMatch(/INSERT INTO long_term_goals\b/);
  });

  it('轉的是 needs_child_review', () => {
    expect(PROPOSE).toContain("'toStatus', 'needs_child_review'");
    expect(PROPOSE).not.toContain("'toStatus', 'active'");
    expect(PROPOSE).toContain('transition_child_proposal_v1');
  });

  it('草案版本的形狀：孩子還沒看過，所以什麼都還沒生效', () => {
    expect(PROPOSE).toContain('TRUE, NULL, v_now, NULL');
    expect(PROPOSE).toContain('v_parent.effective_at IS NOT NULL');
    expect(PROPOSE).toContain('v_parent.child_accepted_at IS NOT NULL');
    expect(PROPOSE).toContain('v_parent.requires_child_review IS NOT TRUE');
    expect(PROPOSE).toContain('v_verified.task_id IS NOT NULL');
  });

  it('confirmed reward 一欄都不寫', () => {
    expect(PROPOSE).toContain('v_parent.confirmed_at IS NOT NULL');
    expect(PROPOSE).toContain('v_parent.confirmed_coin_amount IS NOT NULL');
    expect(PROPOSE).toContain('v_parent.confirmed_reward_policy IS NOT NULL');
    expect(PROPOSE).toContain('v_parent.confirmed_source_task_id IS NOT NULL');
    // INSERT 裡沒有任何 confirmed reward 欄位。
    //
    // 用 (?<![a-z_]) 而不是直接找 'confirmed_'：parent_confirmed_at 是
    // **家長自己這一步的時間戳**（他確實做了決定），不是確認過的回饋。
    // 兩者名字很像，語意差很遠 —— 把它一起禁掉會逼下一個人拆掉草案
    // 版本的時間紀錄。
    const insert = PROPOSE.slice(
      PROPOSE.indexOf('INSERT INTO child_proposal_plan_versions'),
      PROPOSE.indexOf('RETURNING id INTO v_parent_plan_id'),
    );
    expect(insert).not.toMatch(
      /(?<![a-z_])confirmed_(at|coin_amount|reward_policy|payout_basis|source_task_id|by_user_id)/);
    expect(insert).toContain('parent_confirmed_at');
  });
});

describe('4. lineage', () => {
  it('只重用 adopted_from，不新增第二條 root 欄位', () => {
    expect(PROPOSE).toContain('adopted_from_plan_version_id');
    expect(CODE).not.toContain('root_child_plan_id');
    expect(CODE).not.toMatch(/ADD COLUMN[^;]*root_/);
  });

  it('canonical child plan 只有一份', () => {
    expect(PROPOSE).toContain('v_parent.child_confirmed_plan IS NOT NULL');
    expect(PROPOSE).toContain('v_parent.source_planning_session_id IS NOT NULL');
  });

  it('chain 有深度上限，不會被自我指涉的資料卡住', () => {
    expect(PROPOSE).toContain('chain.depth < 20');
  });
});

describe('5. 未決集合', () => {
  it('重算，不是照抄來源', () => {
    expect(PROPOSE).toContain("v_pending := array_append(v_pending, 'cadence')");
    expect(PROPOSE).toContain("v_pending := array_append(v_pending, 'session_size')");
    expect(PROPOSE).toContain("v_pending := array_append(v_pending, 'duration')");
    expect(PROPOSE).toContain("v_pending := array_append(v_pending, 'reward')");
    // 沒有「整包搬過來」也沒有「一律清空」。
    expect(PROPOSE).not.toContain('v_pending := v_source.requires_parent_decision');
    expect(PROPOSE).not.toMatch(/requires_parent_decision,\s*\n?\s*ARRAY\[\]::text\[\]/);
  });

  it('系統還沒整理完的事不丟給家長', () => {
    expect(PROPOSE).toContain('ENRICHMENT_REQUIRED');
    expect(FLAT).toContain("IF 'purpose_category' = ANY (v_source.requires_parent_decision)");
    // duration_type 也是系統判定 —— 不請家長猜一個。
    expect(PROPOSE).toContain('v_source.duration_type IS NULL');
    // 家長沒有任何一條路徑可以寫 purpose_category 或 duration_type。
    expect(PROPOSE).toContain('v_source.purpose_category');
    expect(PROPOSE).toContain('v_source.duration_type, v_duration_days');
  });

  it('A3 也把「先試多久」的判斷換成同一支 helper', () => {
    expect(PUBLISH).toContain(
      'IF public.child_planning_pending_duration(v_duration, v_duration_days) THEN');
    expect(CODE).toContain('FUNCTION public.child_planning_pending_duration');
    expect(CODE).toContain("p_duration_type = 'long_term'");
  });

  it('草案可以帶著未決集合（scope CHECK 放寬到有 adoption lineage）', () => {
    expect(CODE).toContain('OR adopted_from_plan_version_id IS NOT NULL');
    expect(CODE).toContain('cardinality(requires_parent_decision) = 0');
  });
});

describe('6. reward', () => {
  it('只准往下，不准往上', () => {
    expect(PROPOSE).toContain('REWARD_UPGRADE_NOT_ALLOWED');
    expect(FLAT).toContain("v_policy := CASE WHEN v_source.reward_policy = 'coin_eligible'"
      + " THEN 'progress_only' ELSE v_source.reward_policy END;");
    // B 類仍然不能建成幣任務。
    expect(FLAT).toContain("IF v_source.purpose_category = 'B' AND v_policy = 'coin_eligible'");
  });

  it('家長送不進任何金額', () => {
    expect(PROPOSE).toContain('REWARD_NOT_CLIENT_DECIDED');
    expect(FLAT).toContain("'coinAmount', 'finalAmount', 'confirmedCoinAmount'");
  });

  it('政策證據沿用 A4A.1 的正式欄位，而且不讀 ai_snapshot', () => {
    expect(PROPOSE).toContain('policy_session_coin_reference, policy_payout_type');
    expect(PROPOSE).not.toContain("ai_snapshot -> 'policy'");
    expect(PROPOSE).toContain("v_payout := 'per_completion'");
    // progressionKind 不推 payout。
    expect(PROPOSE).not.toMatch(/v_payout := 'per_milestone'/);
    expect(PROPOSE).not.toMatch(/v_payout := 'final_completion'/);
  });

  it('改了每次多久就一定要重算，不能沿用舊的參考價', () => {
    expect(PROPOSE).toContain('REWARD_REEVALUATION_REQUIRED');
    expect(FLAT).toContain('IF v_minutes IS DISTINCT FROM v_source.estimated_minutes THEN');
  });

  it('什麼都沒改卻報一個不同的幣值 → 擋下來', () => {
    expect(PROPOSE).toContain('POLICY_EVIDENCE_MISMATCH');
    expect(FLAT).toContain('IF v_minutes IS NOT DISTINCT FROM v_source.estimated_minutes'
      + ' AND v_source.policy_session_coin_reference IS NOT NULL'
      + ' AND v_coin_ref IS DISTINCT FROM v_source.policy_session_coin_reference THEN');
  });
});

describe('7. 冪等與 stale', () => {
  it('沒有實質改變就不產生新版本', () => {
    expect(PROPOSE).toContain('NO_MATERIAL_CHANGE');
  });

  it('同一組條件重送拿回同一版，不同內容不能覆蓋第一份草案', () => {
    expect(PROPOSE).toContain("IF v_proposal.status = 'needs_child_review' THEN");
    expect(PROPOSE).toContain("'idempotentReplay', true");
    expect(PROPOSE).toContain('STALE_PLAN_VERSION');
    expect(PROPOSE).toContain('REVISION_ALREADY_EXISTS');
    expect(PROPOSE).toContain('child_proposal_plan_versions_one_adoption_per_source');
  });

  it('已經有任務的提案不走這一步', () => {
    expect(PROPOSE).toContain('REVIEW_MUST_NOT_HAVE_TASK');
    expect(PROPOSE).toContain("v_proposal.status <> 'proposed'");
  });

  it('授權收好了', () => {
    expect(CODE).toContain(
      'REVOKE ALL ON FUNCTION public.propose_child_planning_terms_v1(jsonb) FROM PUBLIC, anon');
    expect(CODE).toContain(
      'GRANT EXECUTE ON FUNCTION public.propose_child_planning_terms_v1(jsonb) TO authenticated');
    expect(CODE).toContain('REVOKE ALL ON child_proposal_plan_versions FROM PUBLIC, anon');
  });
});

describe('8. 遷移紀律', () => {
  it('已經套過 staging 的 migration 沒有被改', () => {
    for (const name of [
      '20260825000000_child_confirmed_plan_bridge.sql',
      '20260826000000_parent_direct_agreement.sql',
      '20260827000000_child_plan_policy_evidence.sql',
      '20260815000000_child_proposal_review_flow.sql',
    ]) {
      expect(read(name)).not.toContain('propose_child_planning_terms_v1');
      expect(read(name)).not.toContain('child_planning_pending_duration');
    }
  });
});
