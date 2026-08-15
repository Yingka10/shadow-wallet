// P1-A4A — 家長同意「孩子已經想清楚的完整計畫」
//
// ─────────────────────────────────────────────────────────────────────────────
// 這一組守四件事：
//
//   1. **路由只看 authorship 與 lineage。** 標題、snapshot、model 都不算數。
//   2. **共同條件沒決定 ≠ 錯誤。** 那是「還有事要一起決定」，不是失敗。
//   3. **家長這顆確認不能同時偷偷編計畫。** 命令裡沒有任何計畫欄位。
//   4. **幣值有伺服器端的錨點。** 家長不自由輸入，也不因為過期政策成立。
// ─────────────────────────────────────────────────────────────────────────────

import { TASK_POLICY_VERSION } from '../../../screens/parent/tablet/taskDrawer/taskCatalog';
import { evaluateTaskReward } from '../../../screens/parent/tablet/taskDrawer/taskReward';
import { planEvaluationCommand } from '../../childProposal/directConfirm';
import type {
  ChildProposal,
  ChildProposalPlanVersion,
  ParentProposalCardData,
} from '../../childProposal/types';
import {
  buildChildPlanConfirmCommand,
  childPlanConfirmability,
  childPlanSharedDecisions,
  isChildPlanDirectConfirmable,
  isChildPlanningPlanVersion,
  resolveConfirmRoute,
} from '../parentAgreement';

const AGE_GROUP = '6-9';

const CHILD_CONFIRMED_PLAN = {
  desiredOutcome: '兩週讀完一本書',
  actionPlanSummary: '每天睡前讀 15 分鐘，兩週讀完。',
  currentFocus: '養成睡前讀書的習慣',
  nextAction: { text: '今晚睡前讀 15 分鐘', source: 'child_stated' },
  reviewPoint: { type: 'after_days', days: 7 },
  planningContribution: 'organized_child_plan',
  provenance: { childOriginalGoal: '我想兩週讀完一本書', childStatedApproach: '每天睡前讀 15 分鐘' },
  model: 'test-model',
  goalControlType: 'directly_actionable',
  progressionKind: 'rhythm',
  cadence: { mode: 'weekly_frequency', weeklyFrequency: 5 },
  sessionSize: { kind: 'minutes', minutes: 15 },
  trialPeriod: { days: 7 },
};

function proposal(overrides: Partial<ChildProposal> = {}): ChildProposal {
  return {
    id: 'proposal-1', family_id: 'family-1', child_id: 'child-1', status: 'proposed',
    child_original_goal: '我想兩週讀完一本書', child_original_motivation: null,
    proposal_source: 'child', cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 5,
    cadence_days: null, preferred_time: 'before_bed', preferred_time_custom: null,
    estimated_minutes: null, child_reward_preference: 'hopes_for_coin', child_note: null,
    current_plan_version_id: 'version-child', task_id: null,
    closed_reason: null, closed_at: null, proposed_at: '2026-08-14T00:00:00Z',
    activated_at: null, created_at: '2026-08-14T00:00:00Z', updated_at: '2026-08-14T00:00:00Z',
    ...overrides,
  } as ChildProposal;
}

/**
 * 這份 fixture 在**目前政策**下的判定。
 *
 * 硬寫 'coin-policy@test' 與一個猜的幣值會讓整組測試變成在測 fixture，
 * 而不是在測「錨點對不對得上」。政策表一改，這裡自動跟著走。
 */
const BASELINE = evaluateTaskReward({
  command: planEvaluationCommand({
    proposal: proposal(),
    currentPlanVersion: rawVersion(),
  }),
  childAgeGroup: AGE_GROUP,
});
const POLICY_VERSION = BASELINE.rewardPolicyVersion;
const SESSION_COINS = BASELINE.rewardPolicy === 'coin_eligible' && BASELINE.coin
  ? BASELINE.coin.suggestedAmount
  : null;

function version(overrides: Partial<ChildProposalPlanVersion> = {}): ChildProposalPlanVersion {
  return {
    ...rawVersion(),
    reward_policy_version: POLICY_VERSION,
    // 錨點是正式欄位，不是 snapshot（P1-A4A.1）。snapshot 這裡刻意
    // 留一份**數字不一樣**的 policy 區塊：如果哪天有人把讀取路徑改回
    // 去讀它，整組測試會立刻紅。
    policy_session_coin_reference: SESSION_COINS,
    policy_payout_type: 'per_completion',
    ai_snapshot: {
      snapshotVersion: 1,
      policy: { payoutType: 'per_milestone', sessionCoinReference: 999 },
    },
    ...overrides,
  };
}

/** 政策版本與幣值還沒填進去的骨架 —— 只給 BASELINE 用。 */
function rawVersion(): ChildProposalPlanVersion {
  return {
    id: 'version-child', proposal_id: 'proposal-1', version_no: 1,
    authored_by: 'child', author_user_id: 'user-1',
    plan_title: '兩週讀完一本書', plan_summary: '每天睡前讀 15 分鐘，兩週讀完。',
    purpose_category: 'D', completion_description: '完成一次約定的閱讀時段',
    progress_model: 'weekly_rhythm', next_step: '今晚睡前讀 15 分鐘',
    cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 5, cadence_days: null,
    preferred_time: 'before_bed', preferred_time_custom: null, estimated_minutes: 15,
    duration_type: 'long_term', duration_days: 14, start_date: null, end_date: null,
    reward_policy: 'coin_eligible', reward_eligibility: 'allowed',
    reward_policy_version: 'coin-policy@test', task_policy_version: TASK_POLICY_VERSION,
    ai_snapshot: null,
    ai_model: 'test-model', ai_request_id: null,
    adopted_from_plan_version_id: null, ai_suggested_coin_amount: null,
    source_planning_session_id: 'session-1', planning_schema_version: 1,
    child_confirmed_plan: CHILD_CONFIRMED_PLAN,
    requires_parent_decision: [], enrichment_status: 'enriched',
    policy_session_coin_reference: null, policy_payout_type: null,
    confirmed_reward_policy: null, confirmed_coin_amount: null, confirmed_payout_basis: null,
    confirmed_claim_period: null, confirmed_max_claims_per_period: null,
    confirmed_reward_policy_version: null, confirmed_task_policy_version: null,
    confirmed_source_task_id: null, confirmed_by_user_id: null, confirmed_at: null,
    requires_child_review: false, child_accepted_at: null, parent_confirmed_at: null,
    effective_at: null, superseded_at: null, created_at: '2026-08-14T00:00:00Z',
  };
}

function card(
  planOverrides: Partial<ChildProposalPlanVersion> = {},
  proposalOverrides: Partial<ChildProposal> = {},
): ParentProposalCardData {
  return {
    proposal: proposal(proposalOverrides),
    currentPlanVersion: version(planOverrides),
  };
}

/** 這份 fixture 現在的政策結果。硬寫數字會讓 coin table 一改就整組紅。 */
function freshDecision(target: ParentProposalCardData = card()) {
  return evaluateTaskReward({
    command: planEvaluationCommand(target),
    childAgeGroup: AGE_GROUP,
  });
}

// ---------------------------------------------------------------------------

describe('1. 路由只看 authorship 與 lineage', () => {
  it('child ＋ 完整 lineage → P1', () => {
    expect(resolveConfirmRoute(card())).toBe('child_planning_plan');
  });

  it('ai → legacy，而且完全不經過 P1 的判斷', () => {
    const legacy = card({
      authored_by: 'ai',
      source_planning_session_id: null,
      planning_schema_version: null,
      child_confirmed_plan: null,
      enrichment_status: null,
      ai_suggested_coin_amount: 8,
    });
    expect(resolveConfirmRoute(legacy)).toBe('legacy_ai_plan');
    expect(isChildPlanningPlanVersion(legacy.currentPlanVersion)).toBe(false);
  });

  it('家長調整版沒有直接確認的路徑', () => {
    expect(resolveConfirmRoute(card({
      authored_by: 'parent',
      source_planning_session_id: null,
      planning_schema_version: null,
      child_confirmed_plan: null,
      enrichment_status: null,
    }))).toBe('none');
  });

  it('沒有計畫版本 → none', () => {
    expect(resolveConfirmRoute({ proposal: proposal(), currentPlanVersion: null })).toBe('none');
  });

  it.each([
    ['缺 session id', { source_planning_session_id: null }],
    ['缺 schema version', { planning_schema_version: null }],
    ['缺 canonical plan', { child_confirmed_plan: null }],
  ] as const)('lineage 不完整（%s）就不是 P1', (_name, override) => {
    expect(isChildPlanningPlanVersion(version(override))).toBe(false);
  });

  it('**不看內容**：標題／snapshot／model 長得像什麼都不改變路由', () => {
    // 這是整條路由最容易被寫壞的地方 —— 一旦有人用「標題看起來像孩子寫的」
    // 判斷，某天一份 AI 版本剛好長得像，就會走進它不該走的路徑。
    const disguised = card({
      authored_by: 'ai',
      plan_title: '兩週讀完一本書',
      ai_model: null,
      ai_snapshot: null,
      source_planning_session_id: null,
      planning_schema_version: null,
      child_confirmed_plan: null,
      enrichment_status: null,
      ai_suggested_coin_amount: 8,
    });
    expect(resolveConfirmRoute(disguised)).toBe('legacy_ai_plan');
  });
});

describe('2. 什麼叫「可以直接同意」', () => {
  it('完整的 child plan 可以', () => {
    expect(childPlanConfirmability(card())).toEqual({ ok: true });
    expect(isChildPlanDirectConfirmable(card())).toBe(true);
  });

  it.each([
    ['提案不是 proposed', {}, { status: 'draft' as const }],
    ['current 不是這一版', {}, { current_plan_version_id: 'other' }],
  ])('%s → not_current_proposed', (_name, planOverride, proposalOverride) => {
    const result = childPlanConfirmability(card(planOverride, proposalOverride));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.block).toBe('not_current_proposed');
  });

  it('enrichment 沒完成 → enrichment_incomplete', () => {
    const result = childPlanConfirmability(card({ enrichment_status: 'unavailable' }));
    expect(!result.ok && result.block).toBe('enrichment_incomplete');
  });

  it.each([
    ['缺 next_step', { next_step: null }],
    ['缺 purpose_category', { purpose_category: null }],
    ['缺 completion_description', { completion_description: '' }],
    ['缺 duration_days（long_term）', { duration_days: null }],
    ['缺 estimated_minutes', { estimated_minutes: null }],
    ['資格不是 allowed', { reward_eligibility: 'not_evaluated' as const }],
    ['缺 policy version', { reward_policy_version: '' }],
    ['weekly_frequency 卻沒有 weekly_rhythm', { progress_model: null }],
  ] as const)('%s → system_fields_incomplete（**不自動補值**）', (_name, override) => {
    const result = childPlanConfirmability(card(override));
    expect(!result.ok && result.block).toBe('system_fields_incomplete');
  });
});

describe('3. 共同條件沒決定 —— 不是錯誤，是還有事要一起決定', () => {
  it('列出還缺哪些，而且不當成 system 問題', () => {
    const result = childPlanConfirmability(card({
      requires_parent_decision: ['cadence', 'duration'],
    }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.block).toBe('shared_decision_required');
    expect(!result.ok && result.pending).toEqual(['cadence', 'duration']);
  });

  it('先講共同條件，再講系統欄位', () => {
    // 兩者同時發生時，家長需要知道的是「有事要一起決定」——
    // 那是他做得到的事；「GrowBook 資料不齊」是我們的問題。
    const result = childPlanConfirmability(card({
      requires_parent_decision: ['cadence'],
      next_step: null,
    }));
    expect(!result.ok && result.block).toBe('shared_decision_required');
  });

  it('非 P1 版本一律空陣列', () => {
    expect(childPlanSharedDecisions(version({
      authored_by: 'ai',
      source_planning_session_id: null,
      planning_schema_version: null,
      child_confirmed_plan: null,
      requires_parent_decision: ['cadence'],
    }))).toEqual([]);
  });

  it('A4A 不替家長填 —— 命令根本組不出來', () => {
    const built = buildChildPlanConfirmCommand(
      card({ requires_parent_decision: ['cadence', 'duration'] }),
      AGE_GROUP,
    );
    expect(built.ok).toBe(false);
    expect(built.ok === false && built.reason).toBe('SHARED_DECISION_REQUIRED');
  });
});

describe('4. 家長不能在確認時偷偷編計畫', () => {
  it('命令只有四個鍵', () => {
    const built = buildChildPlanConfirmCommand(card(), AGE_GROUP);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(Object.keys(built.command).sort()).toEqual([
      'expectedPlanVersionId', 'proposalId', 'rewardDecision', 'schemaVersion',
    ]);
  });

  it('沒有任何一份計畫的文字', () => {
    const built = buildChildPlanConfirmCommand(card(), AGE_GROUP);
    const serialized = JSON.stringify(built.ok ? built.command : {});

    // 計畫**內容**一個字都不在命令裡。RPC 從孩子那一版逐欄複製。
    expect(serialized).not.toContain('兩週讀完一本書');
    expect(serialized).not.toContain('今晚睡前讀 15 分鐘');
    expect(serialized).not.toContain('完成一次約定的閱讀時段');

    // 這幾個名字在任何深度都不該出現。
    //
    // （estimatedMinutes / durationType 不在這張清單裡是刻意的：它們出現在
    //   rewardDecision.coin.calculationBasis 裡，那是「這個幣值怎麼算出來的」
    //   的稽核依據，不是家長送進來的計畫內容 —— 而且 RPC 的守衛擋的是
    //   **命令頂層**的鍵，那一層由上一個測試逐鍵釘死。）
    for (const forbidden of [
      'planTitle', 'planSummary', 'nextStep', 'desiredOutcome', 'actionPlanSummary',
      'childConfirmedPlan', 'progressionKind', 'phases', 'targetValue', 'provenance',
    ]) {
      expect({ forbidden, present: serialized.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });

  it('指向的是家長螢幕上那一版', () => {
    const built = buildChildPlanConfirmCommand(card(), AGE_GROUP);
    expect(built.ok && built.command.expectedPlanVersionId).toBe('version-child');
  });
});

describe('5. Reward freshness（沿用既有 evaluator，不是第二套）', () => {
  it('現算的判定就是命令裡那一份', () => {
    const built = buildChildPlanConfirmCommand(card(), AGE_GROUP);
    expect(built.ok && built.command.rewardDecision).toEqual(freshDecision());
  });

  it('幣值錨在正式的 policy evidence 欄位', () => {
    const decision = freshDecision();
    expect(decision.rewardPolicy).toBe('coin_eligible');
    if (decision.rewardPolicy !== 'coin_eligible' || decision.coin === null) return;

    // 錨點對得上 → 過；對不上 → POLICY_CHANGED。
    const aligned = card({
      policy_session_coin_reference: decision.coin.suggestedAmount,
      policy_payout_type: 'per_completion',
    });
    expect(buildChildPlanConfirmCommand(aligned, AGE_GROUP).ok).toBe(true);

    const drifted = card({
      policy_session_coin_reference: decision.coin.suggestedAmount + 1,
      policy_payout_type: 'per_completion',
    });
    const result = buildChildPlanConfirmCommand(drifted, AGE_GROUP);
    expect(result.ok === false && result.reason).toBe('POLICY_CHANGED');
  });

  it('沒有錨點就不成立 —— 否則送什麼金額都沒有東西可比', () => {
    const result = buildChildPlanConfirmCommand(
      card({ policy_session_coin_reference: null, policy_payout_type: null }),
      AGE_GROUP,
    );
    expect(result.ok === false && result.reason).toBe('POLICY_CHANGED');
  });

  it('payoutType 不是 per_completion 就不建成幣任務', () => {
    // staged 不是 per_milestone、accumulation 不是 final_completion。
    // 那兩種目前沒有結算路徑，session 價根本不等於會發的金額。
    //
    // DB 的 CHECK 只允許 per_completion，所以這一列在真的資料庫裡建不出來 ——
    // 這條測的是「就算它出現了，App 端也不會放行」。
    const result = buildChildPlanConfirmCommand(
      card({
        policy_session_coin_reference: 8,
        policy_payout_type: 'per_milestone' as unknown as 'per_completion',
      }),
      AGE_GROUP,
    );
    expect(result.ok === false && result.reason).toBe('POLICY_CHANGED');
  });

  it('ai_snapshot = null 也能確認 —— 稽核證據不是決策條件', () => {
    // 這一條是 P1-A4A.1 的重點。snapshot 的形狀由「某一次 enrichment 回了
    // 什麼」決定；一個家庭能不能開始執行他們的約定，不可以取決於那坨 JSON
    // 裡剛好有沒有某個鍵。
    const built = buildChildPlanConfirmCommand(
      card({ ai_snapshot: null, ai_model: null }), AGE_GROUP);
    expect(built.ok).toBe(true);
    expect(built.ok && built.command.rewardDecision).toEqual(freshDecision());
  });

  it('snapshot 裡放一個不一樣的幣值，結果完全不變', () => {
    // fixture 的 snapshot 本來就寫著 per_milestone / 999（見 version()）。
    // 讀取路徑要是哪天被改回去讀它，這裡與上面那條會同時紅。
    const built = buildChildPlanConfirmCommand(card(), AGE_GROUP);
    expect(built.ok).toBe(true);

    const noisy = buildChildPlanConfirmCommand(
      card({
        ai_snapshot: {
          snapshotVersion: 1,
          policy: { payoutType: 'final_completion', sessionCoinReference: 1 },
        },
      }),
      AGE_GROUP,
    );
    expect(noisy.ok && noisy.command).toEqual(built.ok && built.command);
  });

  it('任務政策版本過期 → POLICY_CHANGED', () => {
    const result = buildChildPlanConfirmCommand(
      card({ task_policy_version: 'task-policy@ancient' }),
      AGE_GROUP,
    );
    expect(result.ok === false && result.reason).toBe('POLICY_CHANGED');
  });

  it('回饋政策版本過期 → POLICY_CHANGED', () => {
    const result = buildChildPlanConfirmCommand(
      card({ reward_policy_version: 'coin-policy@ancient' }),
      AGE_GROUP,
    );
    expect(result.ok === false && result.reason).toBe('POLICY_CHANGED');
  });

  it('孩子的 canonical plan 不受政策變動影響', () => {
    // POLICY_CHANGED 只代表「現在不能確認」，不代表那份計畫壞了。
    const stale = card({ task_policy_version: 'task-policy@ancient' });
    buildChildPlanConfirmCommand(stale, AGE_GROUP);
    expect(stale.currentPlanVersion?.child_confirmed_plan).toEqual(CHILD_CONFIRMED_PLAN);
  });
});
