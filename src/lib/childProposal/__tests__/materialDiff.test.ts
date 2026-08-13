import type { ChildProposalPlanVersion } from '../types';
import { formatPlanCadence, materialDiff } from '../materialDiff';

function plan(overrides: Partial<ChildProposalPlanVersion> = {}): ChildProposalPlanVersion {
  return {
    id: 'version-1', proposal_id: 'proposal-1', version_no: 1,
    authored_by: 'ai', author_user_id: null,
    plan_title: '兩週閱讀挑戰', plan_summary: '一週安排 4 天閱讀',
    purpose_category: 'D', completion_description: '完成一次 15 分鐘閱讀',
    progress_model: 'weekly_rhythm', next_step: '拿出書讀 15 分鐘',
    cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 4, cadence_days: null,
    preferred_time: 'after_dinner', preferred_time_custom: null, estimated_minutes: 15,
    duration_type: 'long_term', duration_days: 14, start_date: null, end_date: null,
    reward_policy: 'coin_eligible', reward_eligibility: 'allowed',
    reward_policy_version: 'coin-policy-1.0.0', task_policy_version: 'task-taxonomy-2026-07',
    ai_snapshot: null, ai_model: 'test', ai_request_id: 'request-1',
    adopted_from_plan_version_id: null, ai_suggested_coin_amount: 10,
    confirmed_reward_policy: null, confirmed_coin_amount: null,
    confirmed_payout_basis: null, confirmed_claim_period: null,
    confirmed_max_claims_per_period: null, confirmed_reward_policy_version: null,
    confirmed_task_policy_version: null, confirmed_source_task_id: null,
    confirmed_by_user_id: null, confirmed_at: null,
    requires_child_review: false, child_accepted_at: null,
    parent_confirmed_at: null, effective_at: null, superseded_at: null,
    created_at: '2026-08-11T00:00:00Z',
    ...overrides,
  };
}

describe('materialDiff', () => {
  it('把 weekly frequency 4→3 顯示成自然文字', () => {
    expect(materialDiff(plan(), plan({ cadence_weekly_frequency: 3 }))).toEqual([{
      field: 'cadence',
      label: '每週安排',
      before: '一週 4 次',
      after: '一週 3 次',
    }]);
  });

  it('fixed days 會排序去重並顯示星期，不暴露 enum', () => {
    const before = plan({ cadence_mode: 'fixed_days', cadence_weekly_frequency: null, cadence_days: [5, 1, 3] });
    const after = plan({ cadence_mode: 'fixed_days', cadence_weekly_frequency: null, cadence_days: [2, 4, 2] });
    expect(materialDiff(before, after)[0]).toEqual({
      field: 'cadence', label: '每週安排',
      before: '每週一、週三、週五', after: '每週二、週四',
    });
    expect(JSON.stringify(materialDiff(before, after))).not.toContain('fixed_days');
  });

  it('如實顯示 one-time 節奏，不說成還沒決定', () => {
    expect(formatPlanCadence(plan({
      cadence_mode: 'one_time', cadence_weekly_frequency: null, cadence_days: null,
    }))).toBe('先完成一次');
  });

  it('只比較 preferred time/custom 的自然顯示值', () => {
    expect(materialDiff(
      plan(),
      plan({ preferred_time: 'custom', preferred_time_custom: '洗澡前' }),
    )).toContainEqual({
      field: 'preferred_time', label: '適合時間',
      before: '晚餐後', after: '洗澡前',
    });
  });

  it('比較 completion description', () => {
    expect(materialDiff(
      plan(),
      plan({ completion_description: '專心閱讀 15 分鐘並收好書' }),
    )).toContainEqual({
      field: 'completion_description', label: '怎樣算完成',
      before: '完成一次 15 分鐘閱讀', after: '專心閱讀 15 分鐘並收好書',
    });
  });

  it('normalized fixed days 相同時不製造 diff', () => {
    const before = plan({ cadence_mode: 'fixed_days', cadence_weekly_frequency: null, cadence_days: [1, 3, 5] });
    const after = plan({ cadence_mode: 'fixed_days', cadence_weekly_frequency: null, cadence_days: [5, 3, 1, 3] });
    expect(materialDiff(before, after)).toEqual([]);
  });

  it('title/summary/duration/reward 等 readonly 變化全部忽略', () => {
    expect(materialDiff(plan(), plan({
      plan_title: '十天挑戰',
      plan_summary: '一週安排 99 天',
      duration_days: 10,
      reward_policy: 'record_only',
      ai_suggested_coin_amount: null,
      estimated_minutes: 99,
      next_step: '別的下一步',
    }))).toEqual([]);
  });
});
