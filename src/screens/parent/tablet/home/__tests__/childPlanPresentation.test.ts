// P1-A4A §18 / §19 / §20 — 家長卡片
//
// ─────────────────────────────────────────────────────────────────────────────
// 三件事：
//
//   1. **兩半分開。** 上半是「孩子想怎麼做」，下半是「家庭約定」。
//      家長要看得出來哪些是孩子決定的、哪些是現在要一起談的。
//   2. **還有共同條件沒決定時不顯示假的「確認」**，而且用家長話講缺什麼。
//   3. **legacy AI 提案一個行為都沒變。**
// ─────────────────────────────────────────────────────────────────────────────

import { TASK_POLICY_VERSION } from '../../taskDrawer/taskCatalog';
import type {
  ChildProposal,
  ChildProposalPlanVersion,
  ParentProposalCardData,
} from '../../../../../lib/childProposal/types';
import { childPlanCardSummary, sharedDecisionLabels } from '../childPlanSummary';
import { presentParentProposal } from '../parentProposalPresentation';

function proposal(overrides: Partial<ChildProposal> = {}): ChildProposal {
  return {
    id: 'proposal-1', family_id: 'family-1', child_id: 'child-1', status: 'proposed',
    child_original_goal: '我想兩週讀完一本書', child_original_motivation: null,
    proposal_source: 'child', cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 5,
    cadence_days: null, preferred_time: 'before_bed', preferred_time_custom: null,
    estimated_minutes: null, child_reward_preference: 'hopes_for_coin', child_note: null,
    current_plan_version_id: 'version-1', task_id: null,
    closed_reason: null, closed_at: null, proposed_at: '2026-08-14T00:00:00Z',
    activated_at: null, created_at: '2026-08-14T00:00:00Z', updated_at: '2026-08-14T00:00:00Z',
    ...overrides,
  } as ChildProposal;
}

function version(overrides: Partial<ChildProposalPlanVersion> = {}): ChildProposalPlanVersion {
  return {
    id: 'version-1', proposal_id: 'proposal-1', version_no: 1,
    authored_by: 'child', author_user_id: 'user-1',
    plan_title: '兩週讀完一本書', plan_summary: '每天睡前讀 15 分鐘，兩週讀完。',
    purpose_category: 'D', completion_description: '完成一次約定的閱讀時段',
    progress_model: 'weekly_rhythm', next_step: '今晚睡前讀 15 分鐘',
    cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 5, cadence_days: null,
    preferred_time: 'before_bed', preferred_time_custom: null, estimated_minutes: 15,
    duration_type: 'long_term', duration_days: 14, start_date: null, end_date: null,
    reward_policy: 'coin_eligible', reward_eligibility: 'allowed',
    reward_policy_version: 'coin-policy-1.0.0', task_policy_version: TASK_POLICY_VERSION,
    ai_snapshot: { policy: { payoutType: 'per_completion', sessionCoinReference: 10 } },
    ai_model: null, ai_request_id: null,
    adopted_from_plan_version_id: null, ai_suggested_coin_amount: null,
    source_planning_session_id: 'session-1', planning_schema_version: 1,
    child_confirmed_plan: {
      desiredOutcome: '兩週讀完一本書',
      actionPlanSummary: '每天睡前讀 15 分鐘，兩週讀完。',
      nextAction: { text: '今晚睡前讀 15 分鐘', source: 'child_stated' },
      progressionKind: 'rhythm',
    },
    requires_parent_decision: [], enrichment_status: 'enriched',
    policy_session_coin_reference: 10, policy_payout_type: 'per_completion',
    confirmed_reward_policy: null, confirmed_coin_amount: null, confirmed_payout_basis: null,
    confirmed_claim_period: null, confirmed_max_claims_per_period: null,
    confirmed_reward_policy_version: null, confirmed_task_policy_version: null,
    confirmed_source_task_id: null, confirmed_by_user_id: null, confirmed_at: null,
    requires_child_review: false, child_accepted_at: null, parent_confirmed_at: null,
    effective_at: null, superseded_at: null, created_at: '2026-08-14T00:00:00Z',
    ...overrides,
  };
}

function card(
  planOverrides: Partial<ChildProposalPlanVersion> = {},
  proposalOverrides: Partial<ChildProposal> = {},
): ParentProposalCardData {
  return { proposal: proposal(proposalOverrides), currentPlanVersion: version(planOverrides) };
}

// ---------------------------------------------------------------------------

describe('孩子想怎麼做', () => {
  it('讀的是 canonical child plan，不是扁平欄位的重述', () => {
    const summary = childPlanCardSummary(version());
    expect(summary).toEqual({
      desiredOutcome: '兩週讀完一本書',
      actionPlanSummary: '每天睡前讀 15 分鐘，兩週讀完。',
      nextAction: '今晚睡前讀 15 分鐘',
      shape: null,
    });
  });

  it('staged 講成一句話，不是「staged（3 phases）」', () => {
    const summary = childPlanCardSummary(version({
      child_confirmed_plan: {
        desiredOutcome: '做一本漫畫',
        actionPlanSummary: '先想故事，再畫角色，最後畫成頁面。',
        nextAction: { text: '寫下三句故事大綱' },
        progressionKind: 'staged',
        phases: [
          { id: 'story', title: '決定故事' },
          { id: 'characters', title: '畫角色' },
          { id: 'pages', title: '畫頁面' },
        ],
      },
    }));
    expect(summary?.shape).toBe('分成幾步：決定故事 → 畫角色 → 畫頁面');
  });

  it('accumulation 講目標量', () => {
    expect(childPlanCardSummary(version({
      child_confirmed_plan: {
        desiredOutcome: '暑假讀 5 本書',
        progressionKind: 'accumulation',
        targetValue: 5, targetUnit: '本書', currentValue: 0,
      },
    }))?.shape).toBe('目標 5 本書');
  });

  it('讀不到就留白，不補「（未提供）」', () => {
    expect(childPlanCardSummary(version({ child_confirmed_plan: { progressionKind: 'rhythm' } })))
      .toEqual({ desiredOutcome: null, actionPlanSummary: null, nextAction: null, shape: null });
    expect(childPlanCardSummary(version({ child_confirmed_plan: null }))).toBeNull();
    expect(childPlanCardSummary(null)).toBeNull();
  });

  it('不把工程欄名印出來', () => {
    const summary = childPlanCardSummary(version({
      child_confirmed_plan: {
        desiredOutcome: '做一本漫畫',
        progressionKind: 'staged',
        phases: [{ id: 'story', title: '決定故事' }, { id: 'art', title: '畫角色' }],
      },
    }));
    const serialized = JSON.stringify(summary);
    for (const forbidden of ['progressionKind', 'staged', 'accumulation', 'phases', 'targetUnit']) {
      expect({ forbidden, present: serialized.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });
});

describe('還有安排要一起補充', () => {
  it('用家長話講，不是工程字眼', () => {
    expect(sharedDecisionLabels(['cadence', 'session_size', 'duration', 'reward']))
      .toEqual(['進行頻率', '每次大約做多久', '這次先試多久', '怎麼給回饋']);
  });

  it('purpose_category 講成 GrowBook 自己的事，不是要家長決定', () => {
    const [copy] = sharedDecisionLabels(['purpose_category']);
    expect(copy).toContain('GrowBook');
    expect(copy).not.toContain('purpose');
    expect(copy).not.toContain('分類代號');
  });

  it('卡片不顯示假的「確認」，而且不責怪孩子沒想完', () => {
    const view = presentParentProposal(card({ requires_parent_decision: ['cadence', 'duration'] }), '承恩');
    expect(view.state).toBe('child_plan_needs_terms');
    expect(view.canConfirm).toBe(false);
    expect(view.sharedDecisions).toEqual(['進行頻率', '這次先試多久']);
    // 「還不能確認」會讀成孩子的問題。他把「怎麼做到」想得很清楚。
    expect(view.waitingMessage).toBe('孩子的想法已經很完整，還有幾件要一起說定');
    expect(view.statusLabel).toBe('還有安排要一起補充');
  });
});

describe('完整的 child plan', () => {
  const view = presentParentProposal(card(), '承恩');

  it('可以確認，而且按鈕講的是「約定」不是「採用建議」', () => {
    expect(view.state).toBe('child_plan');
    expect(view.canConfirm).toBe(true);
    expect(view.confirmLabel).toBe('確認這份約定');
    expect(view.sharedDecisions).toEqual([]);
  });

  it('上半部有孩子的計畫', () => {
    expect(view.childPlan?.desiredOutcome).toBe('兩週讀完一本書');
    expect(view.childPlan?.nextAction).toBe('今晚睡前讀 15 分鐘');
  });

  it('下半部有家庭要一起約定的條件', () => {
    expect(view.planCadence).toBe('一週 5 次');
    expect(view.estimatedTime).toBe('每次約 15 分鐘');
    expect(view.completionDescription).toBe('完成一次約定的閱讀時段');
  });
});

describe('§20 legacy AI 提案一個行為都沒變', () => {
  const legacy = card({
    authored_by: 'ai',
    source_planning_session_id: null,
    planning_schema_version: null,
    child_confirmed_plan: null,
    enrichment_status: null,
    requires_parent_decision: [],
    ai_suggested_coin_amount: 10,
  });
  const view = presentParentProposal(legacy, '承恩');

  it('仍然是 fresh_ai，仍然可以確認', () => {
    expect(view.state).toBe('fresh_ai');
    expect(view.canConfirm).toBe(true);
    expect(view.confirmLabel).toBe('確認這個計畫');
    expect(view.statusLabel).toBe('GrowBook 已經整理好');
  });

  it('沒有孩子計畫那一半，也沒有共同條件清單', () => {
    expect(view.childPlan).toBeNull();
    expect(view.sharedDecisions).toEqual([]);
  });

  it('AI 建議幣值照舊顯示', () => {
    expect(view.rewardSuggestion).toBe('建議：每次完成 10 成長幣');
    expect(view.rewardSuggestionLabel).toBe('GrowBook 建議');
  });

  it('家長調整版仍然是 waiting_child / child_revisit', () => {
    const parentReview = card({
      authored_by: 'parent', requires_child_review: true,
      source_planning_session_id: null, planning_schema_version: null,
      child_confirmed_plan: null, enrichment_status: null,
    }, { status: 'needs_child_review' });
    expect(presentParentProposal(parentReview, '承恩').state).toBe('waiting_child');
  });
});
