// P1-A4A.1 — canonical policy evidence 的持久化不變式
//
// ─────────────────────────────────────────────────────────────────────────────
// 這一組守一條線：
//
//     **ai_snapshot 是稽核證據，不是 canonical policy authority。**
//
// A4A 出貨時，家長同意那一步的幣值錨點讀的是
// `ai_snapshot -> 'policy' ->> 'sessionCoinReference'`。snapshot 的形狀由
// 「某一次 enrichment 回了什麼」決定，沒有 CHECK、沒有承諾哪個鍵一定在 ——
// 正式任務與 confirmed reward 建不建得起來不可以取決於它。
//
// 所以這一包把同一組數字升格成正式欄位，而下面每一條測試都是在防止
// 那條相依從某個後門走回來。
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations');

function read(name: string): string {
  return readFileSync(join(MIGRATIONS, name), 'utf8').replace(/\r\n/g, '\n');
}

const SQL = read('20260827000000_child_plan_policy_evidence.sql');
const CODE = SQL.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');

function body(source: string, name: string): string {
  const start = source.indexOf(`FUNCTION public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('$$;', start));
}

const PUBLISH = body(CODE, 'publish_child_confirmed_plan_v1');
const CONFIRM = body(CODE, 'confirm_child_planning_proposal_v1');
const GUARD = body(CODE, 'child_proposal_plan_version_guard');
/** 逐欄比對的斷言不該被排版影響 —— 換行也一起收掉（長條件會折行）。 */
const CONFIRM_FLAT = CONFIRM.replace(/\s+/g, ' ');

// ---------------------------------------------------------------------------

describe('1. 正式欄位', () => {
  it('兩欄都是新增的，不是借用 legacy 的 ai_suggested_coin_amount', () => {
    // 借用那一欄可以省一次 migration，但那個數字不是 AI 算的。
    // 兩條線共用一個名字不對的欄位之後，每次讀都要先問「這一列是誰寫的」。
    expect(CODE).toContain('ADD COLUMN IF NOT EXISTS policy_session_coin_reference integer');
    expect(CODE).toContain('ADD COLUMN IF NOT EXISTS policy_payout_type text');
    expect(CODE).not.toMatch(/ai_suggested_coin_amount\s*=/);
  });

  it('payout 的 CHECK 就寫 per_completion 這麼窄', () => {
    // 哪天要支援 per_milestone，會先撞到這一行 —— 而不是安靜地把一個
    // 沒有人實作過的結算語意寫進正式計畫。
    expect(CODE).toContain(
      "CHECK (policy_payout_type IS NULL OR policy_payout_type = 'per_completion')",
    );
    // 兩個沒有結算路徑的語意在 COMMENT ON COLUMN 裡出現是對的（那句話正是
    // 在講「不要推導成它們」），所以只禁止它們被**寫進去**。
    expect(CODE).not.toMatch(/(v_payout|policy_payout_type)\s*:?=\s*'per_milestone'/);
    expect(CODE).not.toMatch(/(v_payout|policy_payout_type)\s*:?=\s*'final_completion'/);
  });

  it('沒有結算語意就不准有參考價', () => {
    const shape = CODE.slice(CODE.indexOf('policy_evidence_shape'));
    expect(shape).toContain('policy_session_coin_reference IS NULL');
    expect(shape).toContain('policy_payout_type IS NOT NULL AND policy_session_coin_reference > 0');
  });

  it('append-only：兩欄都進 guard', () => {
    // 可以原地改的話，「拿現在的規則再算一次跟當時的證據對帳」就沒有意義。
    expect(GUARD).toContain(
      'NEW.policy_session_coin_reference IS DISTINCT FROM OLD.policy_session_coin_reference');
    expect(GUARD).toContain('NEW.policy_payout_type IS DISTINCT FROM OLD.policy_payout_type');
    // 順手確認 A3 那五欄還在 —— 重新宣告 guard 時漏抄是 P0-5B 的舊傷。
    expect(GUARD).toContain('NEW.child_confirmed_plan IS DISTINCT FROM OLD.child_confirmed_plan');
    expect(GUARD).toContain('NEW.requires_parent_decision IS DISTINCT FROM');
    expect(GUARD).toContain('NEW.enrichment_status IS DISTINCT FROM');
    expect(GUARD).toContain('confirmed reward evidence is write-once');
  });
});

describe('2. A3 把 evidence 寫成 canonical', () => {
  it('值來自既有規則鏈的 enrichment，不是這支自己算的', () => {
    expect(PUBLISH).toContain("v_enrich -> 'reward' ->> 'payoutType'");
    expect(PUBLISH).toContain("v_enrich -> 'reward' ->> 'sessionCoinReference'");
    expect(PUBLISH).toContain('policy_session_coin_reference, policy_payout_type');
    expect(PUBLISH).toContain('v_coin_ref, v_payout');
  });

  it('payout 不從 progressionKind 推導', () => {
    // staged 不是 per_milestone、accumulation 不是 final_completion。
    // 猜一個寫進去，會讓一份沒有結算路徑的計畫看起來完全正常 ——
    // 直到孩子完成第一個里程碑、而沒有人發幣。
    const evidence = PUBLISH.slice(
      PUBLISH.indexOf('v_payout := NULL;'),
      PUBLISH.indexOf('v_progress := NULL;'),
    );
    expect(evidence).not.toContain('v_progression');
    expect(evidence).not.toContain('staged');
    expect(evidence).not.toContain('accumulation');
    expect(evidence).toMatch(/v_payout := 'per_completion'/);
  });

  it('只有真的能發幣的計畫才有參考價', () => {
    expect(PUBLISH).toMatch(
      /IF v_policy = 'coin_eligible' AND v_eligibility = 'allowed'\s*\n\s*AND NULLIF/);
  });

  it('算不出證據時把 reward 列進 requires_parent_decision，不猜一個數字', () => {
    expect(PUBLISH).toContain(
      "OR (v_policy = 'coin_eligible' AND v_coin_ref IS NULL) THEN\n"
      + "    v_pending := array_append(v_pending, 'reward');");
    // 「猜」在這裡長這樣：COALESCE(參考價, 某個預設值)。
    expect(PUBLISH).not.toMatch(/COALESCE\(\s*v_coin_ref/);
    expect(PUBLISH).not.toMatch(/v_coin_ref\s*:=\s*\d/);
  });

  it('這支仍然不收決定好的幣值', () => {
    expect(PUBLISH).toContain('REWARD_NOT_CLIENT_DECIDED');
    expect(PUBLISH).toMatch(/'coinAmount', 'confirmedReward'/);
    // 頂層的 payoutType 仍然擋掉：evidence 只能從 reward 區塊進來，
    // 才不會有兩個地方各自說一次結算方式。
    expect(PUBLISH).toMatch(/'aiSuggestedCoinAmount',\s*\n?\s*'payoutType', 'payoutBasis'/);
  });

  it('孩子的計畫內容一個字都沒因為這一包鬆動', () => {
    expect(PUBLISH).toContain('PLAN_NOT_CLIENT_SUPPLIED');
    expect(PUBLISH).toContain('ENRICHMENT_MAY_NOT_OVERRIDE_CHILD');
    expect(PUBLISH).toContain("v_plan -> 'provenance' -> 'fields' ->> 'cadence'");
    expect(PUBLISH).toContain("IN ('child_stated', 'derived_from_child')");
  });
});

describe('3. A4A 改讀正式欄位', () => {
  it('決策路徑完全不出現 ai_snapshot', () => {
    // 這一條是整包的重點。snapshot 可以被複製、可以被讀來稽核，
    // 但**不可以出現在任何決定「能不能建立任務」的條件裡**。
    const decision = CONFIRM.slice(0, CONFIRM.indexOf('INSERT INTO child_proposal_plan_versions'));
    expect(decision).not.toContain('ai_snapshot');
    expect(CONFIRM).not.toContain("ai_snapshot -> 'policy'");
  });

  it('錨點就是那兩欄', () => {
    expect(CONFIRM).toContain('v_coin_ref := v_plan.policy_session_coin_reference;');
    expect(CONFIRM).toContain('v_payout   := v_plan.policy_payout_type;');
  });

  it('freshness 與「家長不改金額」兩條都還在', () => {
    expect(CONFIRM).toContain("v_payout IS DISTINCT FROM 'per_completion'");
    expect(CONFIRM).toContain("suggestedAmount', '')::int IS DISTINCT FROM v_coin_ref");
    expect(CONFIRM).toContain("finalAmount', '')::int IS DISTINCT FROM v_coin_ref");
    expect(CONFIRM).toContain('POLICY_CHANGED');
  });

  it('政策過期不是回頭改孩子那一版', () => {
    // confirm 時靜靜把 child plan 裡的 reward evidence 改掉，等於把
    // 「當時憑什麼」抹掉。過期就 POLICY_CHANGED。
    expect(CONFIRM).not.toMatch(/UPDATE child_proposal_plan_versions[^;]*policy_session_coin/);
    expect(CONFIRM).not.toMatch(/UPDATE child_proposal_plan_versions[^;]*policy_payout/);
    expect(CONFIRM).not.toMatch(/UPDATE child_proposal_plan_versions[^;]*reward_policy/);
  });

  it('共同版本逐欄複製 evidence，來源是 v_plan 不是 p_command', () => {
    const insert = CONFIRM.slice(
      CONFIRM.indexOf('INSERT INTO child_proposal_plan_versions'),
      CONFIRM.indexOf('RETURNING id INTO v_parent_plan_id'),
    );
    expect(insert).toContain('v_plan.policy_session_coin_reference, v_plan.policy_payout_type');
    expect(insert).not.toContain('p_command');
  });

  it('事後驗證比對 evidence 兩個方向', () => {
    // 共同版本等於孩子那一版，而且孩子那一版沒被動過。
    expect(CONFIRM_FLAT).toContain(
      'AND c.policy_session_coin_reference IS NOT DISTINCT FROM v_plan.policy_session_coin_reference');
    expect(CONFIRM_FLAT).toContain(
      'AND c.policy_payout_type IS NOT DISTINCT FROM v_plan.policy_payout_type');
    expect(CONFIRM_FLAT).toContain(
      'OR v_parent_plan.policy_session_coin_reference IS DISTINCT FROM v_plan.policy_session_coin_reference');
    expect(CONFIRM_FLAT).toContain(
      'OR v_parent_plan.policy_payout_type IS DISTINCT FROM v_plan.policy_payout_type');
  });

  it('canonical child plan 仍然只有一份', () => {
    expect(CONFIRM).toContain('CHILD_PLAN_NOT_CLIENT_SUPPLIED');
    expect(CONFIRM).toContain('SHARED_DECISION_REQUIRED');
    expect(CONFIRM).toContain('v_parent_plan.child_confirmed_plan IS NOT NULL');
    expect(CONFIRM).toContain('create_parent_task_v1');
    expect(CONFIRM).not.toMatch(/INSERT INTO tasks\b/);
  });
});

describe('4. 遷移紀律', () => {
  it('已經套過 staging 的兩支 migration 沒有被改', () => {
    // 改它們會讓 history 分岔。新欄位一律走 follow-up。
    for (const name of [
      '20260825000000_child_confirmed_plan_bridge.sql',
      '20260826000000_parent_direct_agreement.sql',
    ]) {
      expect(read(name)).not.toContain('policy_session_coin_reference');
      expect(read(name)).not.toContain('policy_payout_type');
    }
  });

  it('legacy P0 的 ai_suggested_coin_amount 路徑一個字都沒動', () => {
    const legacy = body(
      read('20260821000000_canonical_confirmed_reward.sql'), 'confirm_child_proposal_v1');
    expect(legacy).toContain('ai_suggested_coin_amount');
    expect(legacy).not.toContain('policy_session_coin_reference');
    expect(CODE).not.toContain('FUNCTION public.confirm_child_proposal_v1');
  });

  it('授權沒有因為重新宣告而鬆掉', () => {
    expect(CODE).toContain('REVOKE ALL ON child_proposal_plan_versions FROM PUBLIC, anon');
    expect(CODE).toContain(
      'REVOKE ALL ON FUNCTION public.publish_child_confirmed_plan_v1(jsonb) FROM PUBLIC, anon');
    expect(CODE).toContain(
      'REVOKE ALL ON FUNCTION public.confirm_child_planning_proposal_v1(jsonb) FROM PUBLIC, anon');
    expect(CODE.match(/GRANT EXECUTE ON FUNCTION/g)).toHaveLength(2);
  });
});
