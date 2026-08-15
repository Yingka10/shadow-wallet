// P1-A4B2 — 孩子回覆共同條件的持久化不變式
//
// ─────────────────────────────────────────────────────────────────────────────
// 這一組守六件事：
//
//   1. **legacy 的 accept / request_changes 一個字都沒改。**
//   2. **「我同意」不等於「開始了」** —— 還有未決條件時不建任務。
//   3. **partial accept 不碰 child_accepted_at。**
//   4. **兩種回覆在資料上分得開**（action 欄位，不是靠猜 reason 的語氣）。
//   5. **孩子擁有的欄位對不上就是資料錯**，不是一次合法的協商。
//   6. **政策對不上回錯誤，不是偷偷改掉那一版的證據。**
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations');

function read(name: string): string {
  return readFileSync(join(MIGRATIONS, name), 'utf8').replace(/\r\n/g, '\n');
}

const SQL = read('20260829000000_child_shared_term_review.sql');
const CODE = SQL.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');

function body(source: string, name: string): string {
  const start = source.indexOf(`FUNCTION public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('$$;', start));
}

const ACCEPT = body(CODE, 'accept_child_planning_terms_v1');
const CHANGES = body(CODE, 'request_child_planning_term_changes_v1');
const TRANSITION = body(CODE, 'transition_child_proposal_v1');
const ACCEPT_FLAT = ACCEPT.replace(/\s+/g, ' ');

// CODE 已經把註解行濾掉，所以段落邊界只能用程式碼本身切。
// 未決檢查出現兩次：第一次是 partial accept 的入口，第二次是
// final accept 之前那道防線。
const FIRST_PENDING = ACCEPT.indexOf('IF cardinality(v_pending) > 0 THEN');
const SECOND_PENDING = ACCEPT.indexOf('IF cardinality(v_pending) > 0 THEN', FIRST_PENDING + 1);

/** partial accept 那一段（未決條件非空時走的路）。 */
const PARTIAL = ACCEPT.slice(FIRST_PENDING, SECOND_PENDING);
/** final accept 那一段。 */
const FINAL = ACCEPT.slice(SECOND_PENDING);

// ---------------------------------------------------------------------------

describe('1. legacy P0 review flow 完全沒被動到', () => {
  it('這支 migration 沒有重新定義 legacy 的任何一支', () => {
    for (const legacy of [
      'accept_child_proposal_plan_v1',
      'request_child_proposal_changes_v1',
      'revise_child_proposal_plan_v1',
      'close_child_proposal_unsuitable_v1',
    ]) {
      expect(CODE).not.toContain(`FUNCTION public.${legacy}`);
    }
  });

  it('legacy accept 的 P0 reward 錨點仍然寫在原處', () => {
    const legacy = body(
      read('20260815000000_child_proposal_review_flow.sql'), 'accept_child_proposal_plan_v1');
    expect(legacy).toContain('v_plan.ai_suggested_coin_amount');
    expect(legacy).not.toContain('policy_session_coin_reference');
    expect(legacy).not.toContain('source_planning_session_id');
  });

  it('transition 只多了一個 action 直通，其餘沒動', () => {
    // 舊呼叫端不帶 action，寫進去就是 NULL —— legacy 行為完全不變。
    expect(TRANSITION).toContain("v_action      := NULLIF(btrim(COALESCE(p_command ->> 'action', '')), '')");
    expect(TRANSITION).toContain('reason, action)');
    expect(TRANSITION).toContain('v_reason, v_action);');
    // 既有的 confirmed reward 快照邏輯還在。
    expect(TRANSITION).toContain('TASK_REWARD_SNAPSHOT_INCOMPLETE');
    expect(TRANSITION).toContain('child_accepted_at');
  });
});

describe('2. 兩種「可以」', () => {
  it('走哪一條由資料決定，不由呼叫端指定', () => {
    // 讓 UI 挑路徑的話，隱藏一顆按鈕就等於繞過檢查。
    expect(ACCEPT).toContain('IF cardinality(v_pending) > 0 THEN');
    expect(ACCEPT).toContain('v_pending := v_plan.requires_parent_decision;');
    expect(ACCEPT).not.toMatch(/p_command ->> 'intent'/);
    expect(ACCEPT).not.toMatch(/p_command ->> 'activate'/);
  });

  it('還有未決條件時：不建任務、不轉 active', () => {
    expect(PARTIAL).toContain("'toStatus', 'proposed'");
    expect(PARTIAL).not.toContain('create_parent_task_v1');
    expect(PARTIAL).not.toContain("'toStatus', 'active'");
    expect(PARTIAL).toContain("'activated', false");
    expect(PARTIAL).toContain("'taskId', NULL");
  });

  it('**partial accept 不填 child_accepted_at**', () => {
    // 那一欄的既有語意是「孩子接受了即將成為共同計畫的版本」，而且一向
    // 與 effective_at、正式任務一起出現。在這裡填它，之後每個讀者都要
    // 重新理解它。
    expect(PARTIAL).not.toMatch(/child_accepted_at\s*=\s*/);
    expect(PARTIAL).toContain('v_plan.child_accepted_at IS NOT NULL');
    expect(PARTIAL).toContain('v_plan.effective_at IS NOT NULL');
    expect(PARTIAL).toContain('v_plan.confirmed_at IS NOT NULL');
  });

  it('final accept 之前再驗一次未決集合是空的', () => {
    expect(SECOND_PENDING).toBeGreaterThan(FIRST_PENDING);
    expect(FINAL).toContain('SHARED_DECISION_REQUIRED');
    expect(FINAL).toContain('create_parent_task_v1');
  });

  it('IF 條件裡的 CASE 一定包在括號裡', () => {
    // PL/pgSQL 讀 IF 條件會讀到第一個 paren depth 0 的 THEN 為止 ——
    // 裸 CASE 的內層 THEN 會把條件提前結束，整支 function 連建都建不起來
    // （42601，而且錯誤位置指到幾十行以外）。這一包踩過一次，legacy 的
    // accept 也踩過一次。
    for (const fn of [ACCEPT, CHANGES, TRANSITION]) {
      expect(fn).not.toMatch(/IS DISTINCT FROM\s+CASE WHEN/);
      expect(fn).not.toMatch(/(?:IF|OR|AND)\s+CASE WHEN/);
    }
  });

  it('接受不會產生新版本 —— 那是 lifecycle，不是內容修訂', () => {
    expect(ACCEPT).not.toMatch(/INSERT INTO child_proposal_plan_versions/);
    expect(ACCEPT_FLAT).toContain(
      'OR EXISTS ( SELECT 1 FROM child_proposal_plan_versions v'
      + ' WHERE v.proposal_id = v_proposal.id AND v.version_no > v_plan.version_no )');
  });
});

describe('3. 動作語意', () => {
  it('封閉列舉，不是自由文字', () => {
    expect(CODE).toContain('ADD COLUMN IF NOT EXISTS action text');
    expect(CODE).toContain("'accepted_shared_terms_pending_more'");
    expect(CODE).toContain("'requested_shared_term_changes'");
    expect(CODE).toContain('child_proposal_status_events_action_check');
  });

  it('兩種回覆寫不同的 action', () => {
    expect(PARTIAL).toContain("'action', 'accepted_shared_terms_pending_more'");
    expect(CHANGES).toContain("'action', 'requested_shared_term_changes'");
  });

  it('冪等靠 action 對帳，不是靠猜 reason', () => {
    expect(ACCEPT).toContain("v_latest_event.action = 'accepted_shared_terms_pending_more'");
    expect(CHANGES).toContain("v_latest_event.action = 'requested_shared_term_changes'");
    // 孩子那句話仍然存在事件上，但不是判斷依據。
    expect(CHANGES).toContain('v_latest_event.reason IS NOT DISTINCT FROM v_reason');
  });

  it('孩子那句話不進 canonical 計畫，也不改任何版本', () => {
    expect(CHANGES).not.toContain('child_confirmed_plan =');
    expect(CHANGES).not.toMatch(/UPDATE child_proposal_plan_versions/);
    expect(CHANGES).toContain('REASON_TOO_LONG');
    expect(CHANGES).toContain('char_length(v_reason) > 120');
  });
});

describe('4. 這一步不是編輯器', () => {
  it('接受時不收任何內容欄位', () => {
    expect(ACCEPT).toContain('REVIEW_IS_NOT_AN_EDITOR');
    for (const field of ['planTitle', 'nextStep', 'cadenceMode', 'estimatedMinutes', 'coinAmount']) {
      expect(ACCEPT_FLAT).toContain(`'${field}'`);
    }
  });

  it('想再調整時也不收欄位 —— 下一輪由家長提', () => {
    expect(CHANGES).toContain('REVIEW_IS_NOT_AN_EDITOR');
    expect(CHANGES).toContain("'sharedTerms'");
  });
});

describe('5. lineage 與孩子欄位的完整性', () => {
  it('整條 chain 必須回得到孩子自己規劃的那一份', () => {
    for (const fn of [ACCEPT, CHANGES]) {
      expect(fn).toContain('NOT_CHILD_PLANNING_LINEAGE');
      expect(fn).toContain("chain.authored_by = 'child'");
      expect(fn).toContain('chain.source_planning_session_id IS NOT NULL');
      expect(fn).toContain('chain.depth < 20');
    }
  });

  it('孩子擁有的欄位與來源對不上 → 資料錯，不給孩子選', () => {
    expect(ACCEPT).toContain('CHILD_PLAN_INTEGRITY_VIOLATION');
    expect(ACCEPT).toContain('v_plan.plan_title IS DISTINCT FROM v_source.plan_title');
    expect(ACCEPT).toContain('v_plan.next_step IS DISTINCT FROM v_source.next_step');
    expect(ACCEPT).toContain(
      'v_plan.completion_description IS DISTINCT FROM v_source.completion_description');
    // 頭尾也要對得上：中間任何一版改掉標題都算。
    expect(ACCEPT).toContain('v_plan.plan_title IS DISTINCT FROM v_root.plan_title');
    expect(ACCEPT).toContain('v_plan.next_step IS DISTINCT FROM v_root.next_step');
  });

  it('系統還沒整理完的事不翻譯給孩子', () => {
    expect(ACCEPT).toContain('SYSTEM_ENRICHMENT_REQUIRED');
    expect(ACCEPT_FLAT).toContain("IF 'purpose_category' = ANY (v_pending)");
  });

  it('成立後孩子那份 canonical 計畫仍然原封不動', () => {
    expect(ACCEPT_FLAT).toContain(
      'AND c.child_confirmed_plan IS NOT DISTINCT FROM v_root.child_confirmed_plan');
    expect(ACCEPT_FLAT).toContain('AND c.plan_title IS NOT DISTINCT FROM v_root.plan_title');
  });
});

describe('6. reward', () => {
  it('錨點是正式欄位，不讀 ai_snapshot', () => {
    expect(ACCEPT).toContain('v_coin_ref := v_plan.policy_session_coin_reference;');
    expect(ACCEPT).toContain('v_payout   := v_plan.policy_payout_type;');
    expect(ACCEPT).not.toContain('ai_snapshot');
    expect(ACCEPT).not.toContain('ai_suggested_coin_amount');
  });

  it('政策對不上就回錯誤，不改那一版的證據', () => {
    expect(ACCEPT).toContain('POLICY_CHANGED');
    expect(ACCEPT).not.toMatch(/UPDATE child_proposal_plan_versions[^;]*policy_session_coin/);
    expect(ACCEPT).not.toMatch(/UPDATE child_proposal_plan_versions[^;]*reward_policy/);
    // 這一支唯一會寫的 plan 欄位是生效日期。
    expect(ACCEPT).toContain('SET start_date = v_start_date, end_date = v_end_date');
  });

  it('per_completion 之外不建成幣任務，家長／孩子都不能改金額', () => {
    expect(ACCEPT).toContain("v_payout IS DISTINCT FROM 'per_completion'");
    expect(ACCEPT).toContain("finalAmount', '')::int IS DISTINCT FROM v_coin_ref");
    expect(ACCEPT).toContain("suggestedAmount', '')::int IS DISTINCT FROM v_coin_ref");
  });

  it('任務只由 canonical core 建立，confirmed reward 由 transition 寫', () => {
    expect(ACCEPT).toContain('create_parent_task_v1');
    expect(ACCEPT).toContain("'creationSource', 'child_proposal'");
    expect(ACCEPT).not.toMatch(/INSERT INTO tasks\b/);
    expect(ACCEPT).not.toMatch(/INSERT INTO transactions\b/);
    // 不手組第二套 confirmedReward。
    expect(ACCEPT).toContain("'confirmedReward', v_transition_result -> 'confirmedReward'");
    expect(ACCEPT).not.toMatch(/confirmed_coin_amount\s*=/);
  });
});

describe('7. 冪等、stale、授權', () => {
  it('final accept 的重送拿回同一個任務', () => {
    expect(ACCEPT).toContain("IF v_proposal.status = 'active' THEN");
    expect(ACCEPT).toContain("'idempotentReplay', true");
    expect(ACCEPT).toContain('STALE_PLAN_VERSION');
  });

  it('partial accept 的重送不會被誤判成「已經不在 review」', () => {
    expect(ACCEPT).toContain("IF v_proposal.status = 'proposed'");
    expect(ACCEPT).toContain("v_latest_event.from_status = 'needs_child_review'");
  });

  it('授權收好了', () => {
    for (const fn of [
      'accept_child_planning_terms_v1', 'request_child_planning_term_changes_v1',
    ]) {
      expect(CODE).toContain(`REVOKE ALL ON FUNCTION public.${fn}(jsonb) FROM PUBLIC, anon`);
      expect(CODE).toContain(`GRANT EXECUTE ON FUNCTION public.${fn}(jsonb) TO authenticated`);
    }
    expect(CODE).toContain('REVOKE ALL ON child_proposal_status_events FROM PUBLIC, anon');
  });

  it('已經套過 staging 的 migration 沒有被改', () => {
    for (const name of [
      '20260815000000_child_proposal_review_flow.sql',
      '20260828000000_parent_shared_term_proposal.sql',
      '20260827000000_child_plan_policy_evidence.sql',
    ]) {
      expect(read(name)).not.toContain('accept_child_planning_terms_v1');
      expect(read(name)).not.toContain('accepted_shared_terms_pending_more');
    }
  });
});
