// P1-A4B2 — 孩子回覆共同條件（App 端）
//
// ─────────────────────────────────────────────────────────────────────────────
// 最重要的一條：**「我同意」不永遠等於「開始了」。**
//
// 還有共同條件沒說定時，孩子按下去的意思是「這一輪我可以」，而不是
// 「任務今天開始」。畫面與回傳值都必須分得出來 —— 分不出來的話，
// 他會去任務清單裡找一個不存在的東西。
// ─────────────────────────────────────────────────────────────────────────────

import { TASK_POLICY_VERSION } from '../../../screens/parent/tablet/taskDrawer/taskCatalog';
import { evaluateTaskReward } from '../../../screens/parent/tablet/taskDrawer/taskReward';
import { planEvaluationCommand } from '../../childProposal/directConfirm';
import type {
  ChildProposal,
  ChildProposalPlanVersion,
  ChildProposalReviewData,
} from '../../childProposal/types';
import {
  buildChildAcceptCommand,
  buildChildRequestChangesCommand,
  childPendingLabels,
  childPlanningReviewability,
  isChildPlanningReview,
} from '../childReview';
import { sharedTermVersionChanges } from '../sharedTerms';

const AGE_GROUP = '6-9';

const CHILD_CONFIRMED_PLAN = {
  desiredOutcome: '兩週讀完一本書',
  actionPlanSummary: '每天睡前讀 15 分鐘，兩週讀完。',
  nextAction: { text: '今晚睡前讀 15 分鐘', source: 'child_stated' },
  progressionKind: 'rhythm',
};

function proposal(overrides: Partial<ChildProposal> = {}): ChildProposal {
  return {
    id: 'proposal-1', family_id: 'family-1', child_id: 'child-1',
    status: 'needs_child_review',
    child_original_goal: '我想兩週讀完一本書', child_original_motivation: null,
    proposal_source: 'child', cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 5,
    cadence_days: null, preferred_time: 'before_bed', preferred_time_custom: null,
    estimated_minutes: null, child_reward_preference: 'hopes_for_coin', child_note: null,
    current_plan_version_id: 'version-parent', task_id: null,
    closed_reason: null, closed_at: null, proposed_at: '2026-08-15T00:00:00Z',
    activated_at: null, created_at: '2026-08-15T00:00:00Z', updated_at: '2026-08-15T00:00:00Z',
    ...overrides,
  } as ChildProposal;
}

function baseVersion(): ChildProposalPlanVersion {
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
    policy_session_coin_reference: null, policy_payout_type: 'per_completion',
    ai_snapshot: null, ai_model: null, ai_request_id: null,
    adopted_from_plan_version_id: null, ai_suggested_coin_amount: null,
    source_planning_session_id: 'session-1', planning_schema_version: 1,
    child_confirmed_plan: CHILD_CONFIRMED_PLAN,
    requires_parent_decision: [], enrichment_status: 'enriched',
    confirmed_reward_policy: null, confirmed_coin_amount: null, confirmed_payout_basis: null,
    confirmed_claim_period: null, confirmed_max_claims_per_period: null,
    confirmed_reward_policy_version: null, confirmed_task_policy_version: null,
    confirmed_source_task_id: null, confirmed_by_user_id: null, confirmed_at: null,
    requires_child_review: false, child_accepted_at: null, parent_confirmed_at: null,
    effective_at: null, superseded_at: null, created_at: '2026-08-15T00:00:00Z',
  };
}

const BASELINE = evaluateTaskReward({
  command: planEvaluationCommand({ proposal: proposal(), currentPlanVersion: baseVersion() }),
  childAgeGroup: AGE_GROUP,
});
const POLICY_VERSION = BASELINE.rewardPolicyVersion;
const SESSION_COINS = BASELINE.rewardPolicy === 'coin_eligible' && BASELINE.coin
  ? BASELINE.coin.suggestedAmount
  : 0;

/** 孩子那一版（第一輪的來源）。 */
function childVersion(overrides: Partial<ChildProposalPlanVersion> = {}): ChildProposalPlanVersion {
  return {
    ...baseVersion(),
    reward_policy_version: POLICY_VERSION,
    policy_session_coin_reference: SESSION_COINS,
    ...overrides,
  };
}

/** 家長草案（孩子現在看到的那一版）。 */
function parentVersion(
  overrides: Partial<ChildProposalPlanVersion> = {},
): ChildProposalPlanVersion {
  return {
    ...childVersion(),
    id: 'version-parent', version_no: 2,
    authored_by: 'parent', author_user_id: 'parent-1',
    adopted_from_plan_version_id: 'version-child',
    source_planning_session_id: null, planning_schema_version: null,
    child_confirmed_plan: null, enrichment_status: null,
    // 家長提出：晚餐後 20 分鐘。
    preferred_time: 'after_dinner', estimated_minutes: 20,
    requires_child_review: true, parent_confirmed_at: '2026-08-15T01:00:00Z',
    child_accepted_at: null, effective_at: null,
    ...overrides,
  };
}

function review(
  parentOverrides: Partial<ChildProposalPlanVersion> = {},
  childOverrides: Partial<ChildProposalPlanVersion> = {},
  proposalOverrides: Partial<ChildProposal> = {},
): ChildProposalReviewData {
  return {
    proposal: proposal(proposalOverrides),
    currentPlanVersion: parentVersion(parentOverrides),
    sourcePlanVersion: childVersion(childOverrides),
  };
}

// ---------------------------------------------------------------------------

describe('1. 誰的畫面', () => {
  it('P1 的家長草案走這條線', () => {
    expect(isChildPlanningReview(review())).toBe(true);
  });

  it('P0 的家長調整版不走 —— 那條路徑的家長本來就能改完成標準', () => {
    const legacy = review({}, {
      authored_by: 'ai', source_planning_session_id: null, planning_schema_version: null,
      child_confirmed_plan: null, enrichment_status: null,
    });
    const reviewability = childPlanningReviewability(legacy);
    expect(reviewability.ok === false && reviewability.block).toBe('not_child_planning_review');
  });

  it('第二輪的來源是上一份草案，一樣算 P1', () => {
    const second = review({
      id: 'version-parent-3', version_no: 3,
      adopted_from_plan_version_id: 'version-parent-2',
    }, {
      id: 'version-parent-2', version_no: 2, authored_by: 'parent',
      adopted_from_plan_version_id: 'version-child',
      source_planning_session_id: null, child_confirmed_plan: null,
    }, { current_plan_version_id: 'version-parent-3' });
    expect(isChildPlanningReview(second)).toBe(true);
  });

  it('已經有任務就不是在等孩子看', () => {
    const active = review({}, {}, { task_id: 'task-1', status: 'active' });
    expect(childPlanningReviewability(active).ok).toBe(false);
  });
});

describe('2. 「我同意」不永遠等於「開始了」', () => {
  it('共同條件都齊了 → 這一顆會讓任務開始', () => {
    const reviewability = childPlanningReviewability(review());
    expect(reviewability.ok && reviewability.activates).toBe(true);
    expect(reviewability.ok && reviewability.pending).toEqual([]);
  });

  it('還有未決條件 → 這一顆**不會**讓任務開始', () => {
    const reviewability = childPlanningReviewability(
      review({ requires_parent_decision: ['reward'] }));
    expect(reviewability.ok && reviewability.activates).toBe(false);
    expect(reviewability.ok && reviewability.pending).toEqual(['完成後怎麼回饋']);
  });

  it('未決條件翻成孩子的話，不是工程字眼', () => {
    expect(childPendingLabels(['cadence', 'session_size', 'duration', 'reward']))
      .toEqual(['一週怎麼安排', '每次大約多久', '這次先試多久', '完成後怎麼回饋']);
  });

  it('系統自己的事不翻譯給孩子看，而且擋住', () => {
    // 「任務分類還沒選」對孩子沒有意義，而且那從來不是他要決定的。
    expect(childPendingLabels(['purpose_category'])).toEqual([]);
    const blocked = childPlanningReviewability(
      review({ requires_parent_decision: ['purpose_category'] }));
    expect(blocked.ok === false && blocked.block).toBe('system_enrichment_required');
  });
});

describe('3. 命令', () => {
  it('完整的那一輪帶現在重算的政策判定', () => {
    const built = buildChildAcceptCommand(review(), AGE_GROUP);
    expect(built.ok).toBe(true);
    if (built.ok !== true) return;
    expect(built.activates).toBe(true);
    expect(built.command.rewardDecision).toBeDefined();
    expect(Object.keys(built.command).sort()).toEqual(
      ['expectedPlanVersionId', 'proposalId', 'rewardDecision', 'schemaVersion'].sort());
  });

  it('還沒說完的那一輪不帶幣值判定 —— 帶了等於說「這是最後一輪」', () => {
    const built = buildChildAcceptCommand(
      review({ requires_parent_decision: ['reward'] }), AGE_GROUP);
    expect(built.ok).toBe(true);
    if (built.ok !== true) return;
    expect(built.activates).toBe(false);
    expect(built.command.rewardDecision).toBeUndefined();
  });

  it('命令裡沒有任何內容欄位 —— 這一步不是編輯器', () => {
    const built = buildChildAcceptCommand(review(), AGE_GROUP);
    const serialized = JSON.stringify(built.ok === true ? built.command : {});
    // estimatedMinutes 不在清單裡：它會出現在 rewardDecision.coin.calculationBasis
    // 裡（那是規則引擎的計算依據，不是孩子送出去的欄位）。禁掉它只會逼
    // 下一個人把計算依據砍掉。
    for (const forbidden of [
      'planTitle', 'nextStep', 'cadenceMode', 'preferredTime',
      'childConfirmedPlan', 'progressionKind',
    ]) {
      expect({ forbidden, present: serialized.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });

  it('孩子想說的話有長度上限，而且只是一句話', () => {
    const built = buildChildRequestChangesCommand(review(), '我還是想睡前做');
    expect(built.ok === true && built.command.reason).toBe('我還是想睡前做');

    const tooLong = buildChildRequestChangesCommand(review(), 'あ'.repeat(121));
    expect(tooLong.ok === false && tooLong.reason).toBe('REASON_TOO_LONG');

    const empty = buildChildRequestChangesCommand(review(), '   ');
    expect(empty.ok === true && 'reason' in empty.command).toBe(false);
  });
});

describe('4. 政策 freshness', () => {
  it('錨點是正式欄位，不是 snapshot', () => {
    const drifted = buildChildAcceptCommand(
      review({ policy_session_coin_reference: SESSION_COINS + 3 }), AGE_GROUP);
    expect(drifted.ok === false && drifted.reason).toBe('POLICY_CHANGED');
  });

  it('snapshot 裡放別的數字完全不影響結果', () => {
    const noisy = buildChildAcceptCommand(review({
      ai_snapshot: { policy: { payoutType: 'per_milestone', sessionCoinReference: 999 } },
    }), AGE_GROUP);
    expect(noisy.ok).toBe(true);
  });

  it('沒有結算語意就不建成幣任務', () => {
    const noPayout = buildChildAcceptCommand(
      review({ policy_payout_type: null }), AGE_GROUP);
    expect(noPayout.ok === false && noPayout.reason).toBe('POLICY_CHANGED');
  });

  it('政策版本過期 → POLICY_CHANGED，而且不動那一版的證據', () => {
    const card = review({ reward_policy_version: 'coin-policy@ancient' });
    const before = card.currentPlanVersion.policy_session_coin_reference;
    const built = buildChildAcceptCommand(card, AGE_GROUP);
    expect(built.ok === false && built.reason).toBe('POLICY_CHANGED');
    expect(card.currentPlanVersion.policy_session_coin_reference).toBe(before);
  });
});

describe('5. 差異只列共同條件', () => {
  it('孩子原本 vs 爸媽提出', () => {
    const changes = sharedTermVersionChanges(childVersion(), parentVersion());
    expect(changes).toEqual([
      { label: '什麼時候做', before: '睡覺前', after: '晚餐後' },
      { label: '每次大約做多久', before: '每次約 15 分鐘', after: '每次約 20 分鐘' },
    ]);
  });

  it('孩子擁有的欄位不出現在差異裡（§6 白名單）', () => {
    // 這幾欄本來就不該有差異；真的有是資料錯了，要在 RPC 層擋下來，
    // 不是排成一行讓孩子挑要不要接受。
    const tampered = parentVersion({
      plan_title: '家長改過的標題', next_step: '家長改過的下一步',
      plan_summary: '家長改過的做法',
    });
    const changes = sharedTermVersionChanges(childVersion(), tampered);
    const serialized = JSON.stringify(changes);
    expect(serialized).not.toContain('家長改過的標題');
    expect(serialized).not.toContain('家長改過的下一步');
    expect(serialized).not.toContain('家長改過的做法');
  });

  it('孩子沒決定過的條件 before 是 null', () => {
    const changes = sharedTermVersionChanges(
      childVersion({ cadence_mode: null, cadence_weekly_frequency: null }),
      parentVersion({ cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 2 }),
    );
    expect(changes[0]).toEqual({ label: '進行頻率', before: null, after: '一週 2 次' });
  });
});
