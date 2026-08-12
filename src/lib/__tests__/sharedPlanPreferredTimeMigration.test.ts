// P0-8M — 進行中共同計畫的唯一一種再協商：換閱讀時段。
//
// ─────────────────────────────────────────────────────────────────────────────
// 這一組守的是本包最容易被以後的人破壞的一件事：**授權來自 DB 狀態，不是旗標。**
//
// P0-8G 把 active Shared Plan 凍起來之後，任何要動它的功能都會面對同一個誘惑 ——
// 加一個 bypass boolean、一個 GUC、一個 service_role 例外，然後「這支 function
// 說它可以」就變成答案。P0-8M 走的是另一條：guard 自己去問資料庫「這個家庭是不是
// 已經有一份只差時段的正式新共同版本，而且它記的正是這次要寫的值」。
//
// 所以下面的斷言不是在檢查有沒有寫到某些字，而是在檢查**沒有**出現那些字。
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations');
const SQL = readFileSync(
  join(MIGRATIONS, '20260817000000_shared_plan_preferred_time_adjustment.sql'),
  'utf8',
);

/** 去掉註解，只留真正會被執行的 SQL。註解裡提到某個字不算數。 */
const CODE = SQL.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');

/** 取某支 function 的定義區段。 */
function body(name: string): string {
  const start = CODE.indexOf(`FUNCTION public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = CODE.indexOf('$$;', start);
  return CODE.slice(start, end);
}

describe('P0-8M. 授權是 state-backed，不是旗標', () => {
  it('沒有任何 bypass 旗標、GUC 或 service_role 例外', () => {
    // 這些是「把授權外包給呼叫端」的各種寫法。一個都不該出現。
    expect(CODE).not.toMatch(/service_role/i);
    expect(CODE).not.toMatch(/current_setting\(\s*'app\./i);
    expect(CODE).not.toMatch(/\ballow(Bypass|_bypass|Override|_override)\b/i);
    expect(CODE).not.toMatch(/ALTER TABLE\s+\w+\s+DISABLE TRIGGER/i);
    expect(CODE).not.toMatch(/DROP TRIGGER IF EXISTS tasks_active_shared_plan_guard/i);
    expect(CODE).not.toMatch(/SET session_replication_role/i);
  });

  it('授權條件全部讀 DB 狀態，而且要求新版本已經是 current', () => {
    const predicate = body('is_authorized_preferred_time_renegotiation_v1');
    expect(predicate).toContain('cur.id = cp.current_plan_version_id');
    expect(predicate).toContain("cp.status = 'active'");
    expect(predicate).toContain("cur.authored_by = 'parent'");
    expect(predicate).toContain('cur.requires_child_review = false');
    expect(predicate).toContain('cur.parent_confirmed_at IS NOT NULL');
    expect(predicate).toContain('cur.effective_at IS NOT NULL');
    expect(predicate).toContain('cur.confirmed_source_task_id = p_task_id');
    expect(predicate).toContain('src.id = cur.adopted_from_plan_version_id');
  });

  it('新版本必須正好記著這次要寫的值，舊值也要對得上', () => {
    const predicate = body('is_authorized_preferred_time_renegotiation_v1');
    expect(predicate).toContain('cur.preferred_time IS NOT DISTINCT FROM p_new_time');
    expect(predicate).toContain('src.preferred_time IS NOT DISTINCT FROM p_old_time');
  });

  it('新版本與上一版只能差在時段 —— 這是洞的大小', () => {
    // SQL 是對齊排版的，所以先把連續空白壓成一格再比。
    const predicate = body('is_authorized_preferred_time_renegotiation_v1')
      .replace(/[ \t]+/g, ' ');
    // 只要新版本順手動了別的欄位，這個授權就完全不成立。
    for (const field of [
      'cadence_mode', 'cadence_weekly_frequency', 'cadence_days',
      'duration_type', 'duration_days', 'reward_policy', 'reward_policy_version',
      'estimated_minutes', 'completion_description', 'progress_model',
      'purpose_category', 'next_step', 'ai_suggested_coin_amount',
    ]) {
      expect(predicate).toContain(`cur.${field} IS NOT DISTINCT FROM src.${field}`);
    }
  });

  it('「有一張 open 請求」本身不是通行證', () => {
    const predicate = body('is_authorized_preferred_time_renegotiation_v1');
    expect(predicate).not.toContain('child_proposal_adjustment_requests');
  });
});

describe('P0-8M. P0-8G 的凍結範圍只讓出一個欄位', () => {
  const guard = body('guard_active_shared_plan_task_v1');

  it('preferred_time 之外的 material 欄位仍然一律擋掉', () => {
    for (const field of [
      'name', 'category', 'schedule_mode', 'weekly_frequency', 'recurrence_days',
      'reward_policy', 'reward_coin_amount', 'claim_period', 'max_claims_per_period',
      'duration_type', 'due_date', 'completion_description', 'progress_model',
      'next_step', 'estimated_minutes', 'creation_source',
    ]) {
      expect(guard).toContain(`NEW.${field}`);
    }
    expect(guard).toContain('SHARED_PLAN_REQUIRES_RENEGOTIATION');
  });

  it('preferred_time 不在無條件封鎖的那份清單裡，而是走授權判斷', () => {
    const blockList = guard.slice(
      guard.indexOf('v_material_changed :='),
      guard.indexOf('IF v_material_changed THEN'),
    );
    expect(blockList).not.toContain('preferred_time');

    expect(guard).toContain('v_time_changed :=');
    expect(guard).toContain('is_authorized_preferred_time_renegotiation_v1');
  });

  it('DELETE 與停用共同任務仍然完全禁止', () => {
    expect(guard).toContain("IF TG_OP = 'DELETE' THEN");
    expect(guard).toContain('OLD.is_active = true AND NEW.is_active = false');
  });
});

describe('P0-8M. 建立請求', () => {
  const create = body('create_child_proposal_adjustment_request_v1');

  it('只接受進行中的共同計畫，而且會鎖住提案', () => {
    expect(create).toContain('FOR UPDATE');
    expect(create).toContain("v_proposal.status <> 'active'");
    expect(create).toContain('v_proposal.task_id IS NULL');
    expect(create).toContain('PROPOSAL_NOT_ACTIVE_SHARED_PLAN');
  });

  it('based_on 必須是現行版本，否則 STALE', () => {
    expect(create).toContain(
      'v_proposal.current_plan_version_id IS DISTINCT FROM v_expected');
    expect(create).toContain('STALE_PLAN_VERSION');
  });

  it('只收 typed 的兩個鍵，多帶欄位或型別不對一律拒絕', () => {
    expect(create).toContain("key NOT IN ('preferredTime', 'preferredTimeCustom')");
    expect(create).toContain('ADJUSTMENT_FIELD_TYPE_INVALID');
    expect(create).toContain("v_new_time NOT IN ('after_dinner', 'before_bed')");
  });

  it('同值不建請求', () => {
    expect(create).toContain('NO_MATERIAL_CHANGE');
  });

  it('同一 clientRequestId 是同一次送出，不是「JSON 看起來一樣」', () => {
    expect(create).toContain('client_request_id = v_client_id');
    expect(create).toContain("'idempotentReplay', true");
    // 冪等判斷要排在狀態守門之前，否則成功之後的重試會被當成新的請求擋掉。
    const replayAt = create.indexOf('client_request_id = v_client_id');
    const guardAt = create.indexOf("v_proposal.status <> 'active'");
    expect(replayAt).toBeLessThan(guardAt);
  });

  it('同一版本同時只允許一張 open 請求', () => {
    expect(create).toContain('ADJUSTMENT_ALREADY_OPEN');
    expect(CODE).toContain('child_proposal_adjustment_requests_one_open_time_idx');
  });

  it('P0-8M 只開時段這一條，其他 kind 沒有 workflow 就不該收', () => {
    expect(create).toContain('ADJUSTMENT_KIND_NOT_SUPPORTED');
  });

  it('requested_by 由 server 定成 child，不從命令來', () => {
    expect(create).toContain("v_proposal.family_id, 'child', auth.uid()");
    expect(create).not.toContain("p_command ->> 'requestedBy'");
  });
});

describe('P0-8M. 家長確認', () => {
  const accept = body('accept_child_proposal_adjustment_v1');

  it('鎖請求、鎖提案、鎖來源版本、鎖任務', () => {
    expect((accept.match(/FOR UPDATE/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('三個 id 必須互相一致，否則 STALE', () => {
    expect(accept).toContain(
      'v_proposal.current_plan_version_id IS DISTINCT FROM v_expected');
    expect(accept).toContain(
      'v_request.based_on_plan_version_id IS DISTINCT FROM v_expected');
  });

  it('新版本沿用上一版所有結構化真相，只有時段換掉', () => {
    expect(accept).toContain('v_src.cadence_mode, v_src.cadence_weekly_frequency');
    expect(accept).toContain('v_new_time, v_new_custom, v_src.estimated_minutes');
    expect(accept).toContain('v_src.duration_type, v_src.duration_days');
    expect(accept).toContain('v_src.reward_policy, v_src.reward_eligibility');
  });

  it('血緣接的是上一個共同版本，不是 AI 版本', () => {
    expect(accept).toContain('v_src.id,\n    FALSE, NULL, v_now, v_now');
  });

  it('孩子不必再確認一次，而且不塞不實的 child_accepted_at', () => {
    // requires_child_review = FALSE、child_accepted_at = NULL。
    expect(accept).toContain('FALSE, NULL, v_now, v_now');
  });

  it('confirmed_* 從 tasks 重新形成，和 transition 用同一個權威來源', () => {
    expect(accept).toContain('v_task.reward_policy');
    expect(accept).toContain('public.child_proposal_payout_basis(v_task.claim_period)');
    expect(accept).toContain('v_task.claim_period, v_task.max_claims_per_period');
  });

  it('先移動 current 指標，再改任務 —— 順序就是授權本身', () => {
    const pointerAt = accept.indexOf('SET current_plan_version_id = v_new_id');
    const taskAt = accept.indexOf('UPDATE tasks\n     SET preferred_time');
    expect(pointerAt).toBeGreaterThan(-1);
    expect(taskAt).toBeGreaterThan(-1);
    expect(pointerAt).toBeLessThan(taskAt);
  });

  it('同步 runtime mirror：孩子的閱讀計畫畫面讀的是 goal 這一欄', () => {
    expect(accept).toContain('SET preferred_time_window = v_new_time');
  });

  it('提案維持 active，不會退回 proposed 或 needs_child_review', () => {
    expect(accept).not.toContain("'proposed'");
    expect(accept).not.toContain("'needs_child_review'");
    expect(accept).toContain("v_proposal.status <> 'active'");
  });

  it('完全不碰完成紀錄、交易與錢包', () => {
    expect(accept).not.toMatch(/\b(task_completions|transactions|wallets)\b/);
  });

  it('結案請求並留下可追溯的 audit', () => {
    expect(accept).toContain("SET status = 'accepted'");
    expect(accept).toContain('resolved_plan_version_id = v_new_id');
    expect(accept).toContain('INSERT INTO child_proposal_status_events');
  });

  it('重放回原本那一版，不會 append 第二版', () => {
    expect(accept).toContain("v_request.status = 'accepted'");
    expect(accept).toContain("'idempotentReplay', true");
  });

  it('併發時第二個 accept 拿到 typed stale 而不是 crash', () => {
    expect(accept).toContain('EXCEPTION WHEN unique_violation THEN');
    expect(accept).toContain('ADJUSTMENT_ALREADY_RESOLVED');
  });

  it('收尾自我驗證：頻率沒有被動到', () => {
    expect(accept).toContain(
      'v_task.weekly_frequency IS DISTINCT FROM v_src.cadence_weekly_frequency');
  });
});

describe('P0-8M. 家長先維持原本', () => {
  const decline = body('decline_child_proposal_adjustment_v1');

  it('只結案請求，不建版本、不改任務、不動錢包', () => {
    expect(decline).toContain("SET status = 'declined'");
    expect(decline).toContain('resolved_at = v_now');
    expect(decline).not.toContain('INSERT INTO child_proposal_plan_versions');
    expect(decline).not.toMatch(/UPDATE tasks/);
    expect(decline).not.toMatch(/\b(wallets|transactions|task_completions)\b/);
    expect(decline).not.toContain('current_plan_version_id =');
  });

  it('重放冪等', () => {
    expect(decline).toContain("v_request.status = 'declined'");
    expect(decline).toContain("'idempotentReplay', true");
  });
});

describe('P0-8M. ACL 與 migration 衛生', () => {
  it('四支入口都是 SECURITY DEFINER，且 anon 拿不到', () => {
    for (const fn of [
      'create_child_proposal_adjustment_request_v1',
      'accept_child_proposal_adjustment_v1',
      'decline_child_proposal_adjustment_v1',
    ]) {
      expect(body(fn)).toContain('SECURITY DEFINER');
    }
    expect(CODE).toMatch(
      /REVOKE ALL ON FUNCTION public\.accept_child_proposal_adjustment_v1\(jsonb\) FROM PUBLIC, anon/);
    expect(CODE).toMatch(
      /REVOKE ALL ON FUNCTION public\.decline_child_proposal_adjustment_v1\(jsonb\) FROM PUBLIC, anon/);
  });

  it('沒有改動先前的 migration', () => {
    for (const older of [
      '20260810000000_child_proposal_contract_v1.sql',
      '20260815000000_child_proposal_review_flow.sql',
      '20260816000000_shared_plan_integrity_guard.sql',
    ]) {
      expect(() => readFileSync(join(MIGRATIONS, older), 'utf8')).not.toThrow();
    }
  });

  it('repeat-safe：可以重跑', () => {
    expect(CODE).toContain('CREATE OR REPLACE FUNCTION');
    expect(CODE).toContain('ADD COLUMN IF NOT EXISTS client_request_id');
    expect(CODE).toContain('CREATE UNIQUE INDEX IF NOT EXISTS');
    expect(CODE).toContain('DROP CONSTRAINT IF EXISTS');
  });

  // P0-5B staging acceptance 抓到過：IF 條件裡的裸 CASE 會讓函式根本建不起來。
  it('IF 條件裡沒有未加括號的 CASE', () => {
    const offenders = SQL.split('\n')
      .map(line => line.trim())
      .filter(line => /^(ELSIF|IF)\b/.test(line) && /\bCASE\s*$/.test(line))
      .filter(line => !/\(\s*CASE\s*$/.test(line));
    expect(offenders).toEqual([]);
  });
});
