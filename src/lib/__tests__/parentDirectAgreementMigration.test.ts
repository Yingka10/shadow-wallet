// P1-A4A — 家長同意的持久化不變式
//
// ─────────────────────────────────────────────────────────────────────────────
// 這一組守六件事：
//
//   1. **legacy 一個字都沒改。** confirm_child_proposal_v1 仍然只收 AI-authored。
//   2. **家長這顆確認不能同時編計畫。**
//   3. **共同版本逐欄從孩子那一版複製**，而且不複製 canonical child plan。
//   4. **lineage 只有一條**：adopted_from_plan_version_id。
//   5. **不新增第三條建立任務的路徑。**
//   6. **原子性與冪等。**
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations');

function read(name: string): string {
  return readFileSync(join(MIGRATIONS, name), 'utf8').replace(/\r\n/g, '\n');
}

const SQL = read('20260826000000_parent_direct_agreement.sql');
const CODE = SQL.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');

const CONFIRM = 'confirm_child_planning_proposal_v1';

function body(source: string, name: string): string {
  const start = source.indexOf(`FUNCTION public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('$$;', start));
}

const AGREEMENT = body(CODE, CONFIRM);
/** 對齊用的多重空白正規化 —— 逐欄比對的斷言不該被排版影響。 */
const AGREEMENT_FLAT = AGREEMENT.replace(/[ 	]+/g, ' ');

// ---------------------------------------------------------------------------

describe('1. legacy Direct Confirm 完全沒被動到', () => {
  it('這支 migration 沒有重新定義 confirm_child_proposal_v1', () => {
    // 放寬那一支的 authored_by = 'ai' 會得到一支看似通用、其實語意分叉的
    // function：一條線是「採用 GrowBook 的建議」，另一條是「同意孩子的安排」。
    expect(CODE).not.toContain('FUNCTION public.confirm_child_proposal_v1');
    expect(CODE).not.toContain('accept_child_proposal_plan_v1');
    expect(CODE).not.toContain('revise_child_proposal_plan_v1');
  });

  it('legacy 的 AI-authored 前提仍然寫在原處', () => {
    const legacy = body(read('20260821000000_canonical_confirmed_reward.sql'),
      'confirm_child_proposal_v1');
    expect(legacy).toContain("v_plan.authored_by <> 'ai'");
    expect(legacy).toContain('PLAN_NOT_CONFIRMABLE');
    // 沒有被放寬成 'ai' || 'child'。
    expect(legacy).not.toMatch(/authored_by\s+NOT IN \('ai',\s*'child'\)/);
    expect(legacy).not.toContain('source_planning_session_id');
  });

  it('新的這一支才認 child planning lineage', () => {
    expect(AGREEMENT).toContain("v_plan.authored_by <> 'child'");
    expect(AGREEMENT).toContain('v_plan.source_planning_session_id IS NULL');
    expect(AGREEMENT).toContain('PLAN_NOT_CHILD_PLANNING');
  });

  it('路由不看內容 —— 標題／snapshot／model 都不參與判斷', () => {
    const routing = AGREEMENT.slice(
      AGREEMENT.indexOf('PLAN_NOT_CHILD_PLANNING') - 800,
      AGREEMENT.indexOf('PLAN_NOT_CHILD_PLANNING'),
    );
    expect(routing).not.toContain('plan_title');
    expect(routing).not.toContain('ai_model');
    expect(routing).not.toMatch(/ai_snapshot[^;]*IS NULL/);
  });
});

describe('2. 家長不能在確認時偷偷編計畫', () => {
  it('命令帶任何計畫欄位就整筆拒絕', () => {
    expect(AGREEMENT).toContain('CHILD_PLAN_NOT_CLIENT_SUPPLIED');
    for (const key of [
      'planTitle', 'planSummary', 'nextStep', 'desiredOutcome', 'actionPlanSummary',
      'childConfirmedPlan', 'progressionKind', 'phases', 'targetValue', 'targetUnit',
      'cadenceMode', 'cadenceWeeklyFrequency', 'cadenceDays',
      'durationType', 'durationDays', 'estimatedMinutes', 'preferredTime',
      'completionDescription', 'purposeCategory', 'progressModel',
    ]) {
      expect({ key, rejected: AGREEMENT.includes(`'${key}'`) }).toEqual({ key, rejected: true });
    }
  });

  it('拒絕發生在任何寫入之前', () => {
    const guardAt = AGREEMENT.indexOf('CHILD_PLAN_NOT_CLIENT_SUPPLIED');
    const insertAt = AGREEMENT.indexOf('INSERT INTO child_proposal_plan_versions');
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(insertAt);
  });
});

describe('3. 共同條件沒決定就不成立', () => {
  it('requires_parent_decision 非空 → SHARED_DECISION_REQUIRED', () => {
    expect(AGREEMENT).toContain('cardinality(v_plan.requires_parent_decision) > 0');
    expect(AGREEMENT).toContain('SHARED_DECISION_REQUIRED');
    // 缺什麼要講出來，家長才知道要一起決定什麼。
    expect(AGREEMENT).toContain("'pending', to_jsonb(v_plan.requires_parent_decision)");
  });

  it('enrichment 沒完成也不成立', () => {
    expect(AGREEMENT).toContain("v_plan.enrichment_status IS DISTINCT FROM 'enriched'");
  });

  it('**不自動補值**', () => {
    // 生一個 durationDays = 30 出來，等於家長確認了一個沒有人提過的期限。
    expect(AGREEMENT).not.toMatch(/v_plan\.duration_days\s*:?=\s*\d/);
    expect(AGREEMENT).not.toMatch(/COALESCE\(v_plan\.duration_days,\s*\d/);
    expect(AGREEMENT).not.toMatch(/COALESCE\(v_plan\.cadence_weekly_frequency,\s*\d/);
    expect(AGREEMENT).not.toMatch(/COALESCE\(v_plan\.estimated_minutes,\s*\d/);
  });
});

describe('4. 共同版本逐欄從孩子那一版複製', () => {
  it('每一個內容欄位都寫 v_plan.*，沒有一個從 p_command 讀', () => {
    const insert = AGREEMENT.slice(
      AGREEMENT.indexOf('INSERT INTO child_proposal_plan_versions'),
      AGREEMENT.indexOf('RETURNING id INTO v_parent_plan_id'),
    );
    for (const column of [
      'plan_title', 'plan_summary', 'purpose_category', 'completion_description',
      'progress_model', 'next_step', 'cadence_mode', 'cadence_weekly_frequency',
      'cadence_days', 'preferred_time', 'estimated_minutes', 'duration_type', 'duration_days',
      'reward_policy', 'reward_policy_version', 'task_policy_version',
    ]) {
      expect({ column, copied: insert.includes(`v_plan.${column}`) })
        .toEqual({ column, copied: true });
    }
    // p_command 只在 reward decision 與 id 上出現，不在內容上。
    expect(insert).not.toContain('p_command');
  });

  it('**不複製 canonical child plan**', () => {
    const insert = AGREEMENT.slice(
      AGREEMENT.indexOf('INSERT INTO child_proposal_plan_versions'),
      AGREEMENT.indexOf('RETURNING id INTO v_parent_plan_id'),
    );
    // 只有一份 canonical child plan，掛在孩子那一版上。
    // 家長那一版透過 adopted_from_plan_version_id 指回去 ——
    // 複製一份的話，「孩子原本怎麼想」會有兩個答案。
    expect(insert).not.toContain('child_confirmed_plan');
    expect(insert).not.toContain('source_planning_session_id,');
    expect(insert).not.toContain('planning_schema_version');
  });

  it('lineage 只有一條：adopted_from_plan_version_id', () => {
    expect(AGREEMENT).toContain('adopted_from_plan_version_id');
    expect(AGREEMENT).toContain('v_expected_plan_id,');
    // 沒有另外發明一個 parent-source 欄位。
    expect(CODE).not.toMatch(/ADD COLUMN[\s\S]*?source/);
    expect(CODE).not.toContain('ALTER TABLE');
  });

  it('孩子那一版逐欄未改，而且共同版本逐欄等於它', () => {
    // 這是 §9 的執法點：confirm 時 trim / rewrite / default 一律不允許。
    expect(AGREEMENT).toContain('c.child_confirmed_plan IS NOT DISTINCT FROM v_plan.child_confirmed_plan');
    expect(AGREEMENT).toContain('c.plan_title IS NOT DISTINCT FROM v_plan.plan_title');
    expect(AGREEMENT).toContain('c.next_step IS NOT DISTINCT FROM v_plan.next_step');
    for (const column of [
      'plan_title', 'plan_summary', 'next_step', 'completion_description',
      'cadence_mode', 'cadence_weekly_frequency', 'cadence_days',
      'estimated_minutes', 'duration_type', 'duration_days',
    ]) {
      expect({
        column,
        verified: AGREEMENT_FLAT.includes(
          `v_parent_plan.${column} IS DISTINCT FROM v_plan.${column}`,
        ),
      }).toEqual({ column, verified: true });
    }
  });

  it('共同版本不得帶 planning lineage', () => {
    expect(AGREEMENT).toContain('v_parent_plan.source_planning_session_id IS NOT NULL');
    expect(AGREEMENT).toContain('v_parent_plan.child_confirmed_plan IS NOT NULL');
  });
});

describe('5. Reward', () => {
  it('幣值錨在 A3 記下來的 session 價，不是呼叫端說了算', () => {
    // ⚠️ 這一版讀的是 ai_snapshot，而那正是 P1-A4A.1 修掉的事：
    //    稽核快照不能當 canonical policy authority。
    //
    //    這條測試留著讀「當時這支寫了什麼」—— 這個檔案已經套過 staging，
    //    改它會讓 migration history 分岔。**現行行為看 20260827**，
    //    在 childPlanPolicyEvidenceMigration.test.ts 釘住。
    expect(AGREEMENT).toContain("v_plan.ai_snapshot -> 'policy' ->> 'sessionCoinReference'");
    expect(AGREEMENT).toContain("v_plan.ai_snapshot -> 'policy' ->> 'payoutType'");
    expect(AGREEMENT).toContain('IS DISTINCT FROM v_coin_ref');
  });

  it('家長不改金額：final 必須等於錨點', () => {
    expect(AGREEMENT).toMatch(
      /finalAmount'[\s\S]{0,60}IS DISTINCT FROM v_coin_ref/,
    );
  });

  it('progression 不推 payout —— 只有 per_completion 算數', () => {
    expect(AGREEMENT).toContain("v_payout IS DISTINCT FROM 'per_completion'");
    for (const forbidden of ['per_milestone', 'final_completion', 'per_period']) {
      expect({ forbidden, present: CODE.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
    // progressionKind 只出現在「拒絕呼叫端傳入」那張清單裡（見 §2），
    // 沒有任何一條分支拿它去推導什麼。
    expect(AGREEMENT).not.toMatch(/v_plan[^;]*progressionKind/);
  });

  it('B 類不得建成成長幣任務', () => {
    expect(AGREEMENT).toContain("v_plan.purpose_category = 'B' AND v_plan.reward_policy = 'coin_eligible'");
  });

  it('政策對不上就 POLICY_CHANGED，不靜靜改掉計畫上的證據', () => {
    expect(AGREEMENT).toContain('POLICY_CHANGED');
    expect(AGREEMENT).not.toMatch(/UPDATE child_proposal_plan_versions[\s\S]{0,200}reward_policy\s*=/);
  });
});

describe('6. 任務建立與原子性', () => {
  it('重用 create_parent_task_v1，creationSource = child_proposal', () => {
    expect(AGREEMENT).toContain('public.create_parent_task_v1(v_task_command)');
    expect(AGREEMENT).toContain("'creationSource', 'child_proposal'");
  });

  it('沒有第三條建立任務的路徑', () => {
    expect(CODE).not.toContain('INSERT INTO tasks');
    expect(CODE).not.toContain('INSERT INTO child_tasks');
    expect(CODE).not.toContain('INSERT INTO long_term_goals');
    expect(CODE).not.toContain('INSERT INTO transactions');
  });

  it('轉 active 走既有的 transition RPC', () => {
    expect(AGREEMENT).toContain('public.transition_child_proposal_v1');
    expect(AGREEMENT).toContain("'toStatus', 'active'");
  });

  it('任何一步失敗整筆 rollback', () => {
    expect(AGREEMENT).toContain("RAISE EXCEPTION USING ERRCODE = 'P0001'");
    expect(AGREEMENT).toContain("EXCEPTION WHEN SQLSTATE 'P0001'");
    expect(AGREEMENT).toContain('AGREEMENT_VERIFICATION_FAILED');
  });

  it('先鎖提案再鎖計畫版本', () => {
    const proposalLock = AGREEMENT.indexOf('FROM child_proposals\n     WHERE id = (p_command');
    const planLock = AGREEMENT.indexOf('FROM child_proposal_plan_versions\n     WHERE id = v_expected_plan_id');
    expect(proposalLock).toBeGreaterThan(-1);
    expect(planLock).toBeGreaterThan(proposalLock);
    expect(AGREEMENT).toContain('FOR UPDATE');
  });
});

describe('7. 冪等與 stale', () => {
  it('重送靠 lineage 對帳，不是「剛好是 active」', () => {
    expect(AGREEMENT).toContain("v_proposal.status = 'active'");
    expect(AGREEMENT).toContain('adopted_from_plan_version_id = v_expected_plan_id');
    expect(AGREEMENT).toContain("'idempotentReplay', true");
    // 對不上的 active 是另一次確認，不可以假裝成功。
    expect(AGREEMENT).toMatch(/v_parent_plan\.id IS NULL[\s\S]{0,200}STALE_PLAN_VERSION/);
  });

  it('冪等分支在建立任何東西之前', () => {
    const replayAt = AGREEMENT.indexOf("'idempotentReplay', true");
    const insertAt = AGREEMENT.indexOf('INSERT INTO child_proposal_plan_versions');
    expect(replayAt).toBeLessThan(insertAt);
  });

  it('current 換掉了就不能確認舊版', () => {
    expect(AGREEMENT).toContain('v_proposal.current_plan_version_id IS DISTINCT FROM v_expected_plan_id');
    expect(AGREEMENT).toContain('STALE_PLAN_VERSION');
  });
});

describe('8. 授權', () => {
  it('沿用既有家庭邊界，收回 anon 執行權', () => {
    expect(AGREEMENT).toContain('assert_child_in_caller_family');
    expect(CODE).toContain(`REVOKE ALL ON FUNCTION public.${CONFIRM}(jsonb) FROM PUBLIC, anon;`);
    expect(CODE).toContain(`GRANT EXECUTE ON FUNCTION public.${CONFIRM}(jsonb) TO authenticated;`);
  });
});

describe('9. provider 中立', () => {
  it('沒有任何 provider 專屬字眼', () => {
    for (const forbidden of ['gemini', 'google', 'openai', 'anthropic', 'candidates']) {
      expect({ forbidden, present: CODE.toLowerCase().includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });
});
