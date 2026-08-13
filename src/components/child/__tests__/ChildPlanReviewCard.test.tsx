import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type {
  ChildProposal,
  ChildProposalPlanVersion,
  ChildProposalReviewData,
} from '../../../lib/childProposal';
import { ChildPlanReviewCard } from '../ChildPlanReviewCard';

function review({
  sourceOverrides = {},
  currentOverrides = {},
}: {
  sourceOverrides?: Partial<ChildProposalPlanVersion>;
  currentOverrides?: Partial<ChildProposalPlanVersion>;
} = {}): ChildProposalReviewData {
  const proposal = Object.assign({
    id: 'p1',
    family_id: 'family-1',
    child_id: 'child-1',
    status: 'needs_child_review',
    child_original_goal: '我想讀完這本書',
    child_original_motivation: null,
    proposal_source: 'child',
    cadence_mode: 'weekly_frequency',
    cadence_weekly_frequency: 4,
    cadence_days: null,
    preferred_time: null,
    preferred_time_custom: null,
    estimated_minutes: 15,
    child_reward_preference: 'see_progress',
    child_note: null,
    current_plan_version_id: 'v2',
    task_id: null,
    closed_reason: null,
    closed_at: null,
    proposed_at: '2026-08-13T00:00:00.000Z',
    activated_at: null,
    created_at: '2026-08-13T00:00:00.000Z',
    updated_at: '2026-08-13T00:00:00.000Z',
  } satisfies ChildProposal, {
    parent_reason: '因為媽媽覺得這樣比較有效率',
  });

  const commonPlan = {
    proposal_id: 'p1',
    version_no: 1,
    author_user_id: null,
    plan_title: '閱讀安排',
    plan_summary: null,
    purpose_category: 'D',
    progress_model: 'weekly_rhythm',
    next_step: '拿出書讀 15 分鐘',
    cadence_mode: 'weekly_frequency',
    cadence_days: null,
    preferred_time_custom: null,
    completion_description: '完成一次 15 分鐘閱讀',
    estimated_minutes: 15,
    duration_type: 'long_term',
    duration_days: 14,
    start_date: null,
    end_date: null,
    reward_policy: 'progress_only',
    reward_eligibility: 'allowed',
    reward_policy_version: 'coin-policy-1.0.0',
    task_policy_version: 'task-taxonomy-2026-07',
    ai_snapshot: null,
    ai_model: null,
    ai_request_id: null,
    adopted_from_plan_version_id: null,
    ai_suggested_coin_amount: null,
    confirmed_reward_policy: null,
    confirmed_coin_amount: null,
    confirmed_payout_basis: null,
    confirmed_claim_period: null,
    confirmed_max_claims_per_period: null,
    confirmed_reward_policy_version: null,
    confirmed_task_policy_version: null,
    confirmed_source_task_id: null,
    confirmed_by_user_id: null,
    confirmed_at: null,
    requires_child_review: false,
    child_accepted_at: null,
    parent_confirmed_at: null,
    effective_at: null,
    superseded_at: null,
    created_at: '2026-08-13T00:00:00.000Z',
  } satisfies Omit<
    ChildProposalPlanVersion,
    'id' | 'authored_by' | 'cadence_weekly_frequency' | 'preferred_time'
  >;

  const sourcePlanVersion = Object.assign({
    ...commonPlan,
    id: 'v1',
    authored_by: 'ai',
    cadence_weekly_frequency: 4,
    preferred_time: null,
    plan_summary: 'AI 建議：一週安排 4 天閱讀並獲得獎勵',
    ai_snapshot: { summary: 'AI 摘要不應顯示' },
    ...sourceOverrides,
  } satisfies ChildProposalPlanVersion, {
    reward_explanation: '完成後可以得到 12 枚金幣',
  });

  const currentPlanVersion = {
    ...commonPlan,
    id: 'v2',
    version_no: 2,
    authored_by: 'parent',
    cadence_weekly_frequency: 3,
    preferred_time: 'before_bed',
    adopted_from_plan_version_id: 'v1',
    requires_child_review: true,
    parent_confirmed_at: '2026-08-13T01:00:00.000Z',
    ...currentOverrides,
  } satisfies ChildProposalPlanVersion;

  return {
    proposal,
    sourcePlanVersion,
    currentPlanVersion,
  } satisfies ChildProposalReviewData;
}

function renderCard(props: Partial<React.ComponentProps<typeof ChildPlanReviewCard>> = {}) {
  const callbacks = {
    onAccept: jest.fn(),
    onRequestChanges: jest.fn(),
    onRetry: jest.fn(),
  };

  render(
    <ChildPlanReviewCard
      review={review()}
      saving={false}
      error={null}
      {...callbacks}
      {...props}
    />,
  );

  return callbacks;
}

describe('ChildPlanReviewCard', () => {
  it('只用 structured diff 說明同一份 review 的每週 4→3 與未決定→睡覺前', () => {
    renderCard();

    expect(screen.getByText('一起決定')).toBeTruthy();
    expect(screen.getByText('媽媽調整了一點安排')).toBeTruthy();
    expect(screen.getByText('看看這樣是不是也適合你。')).toBeTruthy();
    expect(screen.getByLabelText('每週安排，一週 4 次改成一週 3 次')).toBeTruthy();
    expect(screen.getByLabelText('適合時間，還沒決定改成睡覺前')).toBeTruthy();

    expect(screen.queryByText('AI 建議：一週安排 4 天閱讀並獲得獎勵')).toBeNull();
    expect(screen.queryByText('AI 摘要不應顯示')).toBeNull();
    expect(screen.queryByText('完成後可以得到 12 枚金幣')).toBeNull();
    expect(screen.queryByText('我想讀完這本書')).toBeNull();
    expect(screen.queryByText('因為媽媽覺得這樣比較有效率')).toBeNull();
    expect(screen.queryByText(/核准|版本|RPC|material|差異欄位/)).toBeNull();
  });

  it('讓孩子接受或提出再聊聊，並提供大型、可存取的按鈕', () => {
    const onAccept = jest.fn();
    const onRequestChanges = jest.fn();
    renderCard({ onAccept, onRequestChanges });

    const accept = screen.getByRole('button', { name: '好，我也想這樣試試看' });
    const requestChanges = screen.getByRole('button', { name: '我想再聊聊' });
    fireEvent.press(accept);
    fireEvent.press(requestChanges);

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onRequestChanges).toHaveBeenCalledTimes(1);
    const acceptStyle = StyleSheet.flatten(accept.props.style);
    const requestChangesStyle = StyleSheet.flatten(requestChanges.props.style);
    expect(acceptStyle.minHeight).toBeGreaterThanOrEqual(48);
    expect(requestChangesStyle.minHeight).toBeGreaterThanOrEqual(48);
    expect(requestChangesStyle).toEqual(expect.objectContaining({ borderWidth: 1 }));
  });

  it('最大長度的自訂時間與完成文字可在窄卡片中自然換行', () => {
    const beforeTime = '早'.repeat(60);
    const afterTime = '晚'.repeat(60);
    const beforeCompletion = '甲'.repeat(120);
    const afterCompletion = '乙'.repeat(120);
    renderCard({
      review: review({
        sourceOverrides: {
          preferred_time: 'custom',
          preferred_time_custom: beforeTime,
          completion_description: beforeCompletion,
        },
        currentOverrides: {
          preferred_time: 'custom',
          preferred_time_custom: afterTime,
          completion_description: afterCompletion,
        },
      }),
    });

    for (const value of [beforeTime, afterTime, beforeCompletion, afterCompletion]) {
      expect(StyleSheet.flatten(screen.getByText(value).props.style)).toEqual(
        expect.objectContaining({ flexShrink: 1, minWidth: 0 }),
      );
    }
    for (const arrow of screen.getAllByText('→')) {
      expect(StyleSheet.flatten(arrow.props.style)).toEqual(
        expect.objectContaining({ flexShrink: 1, minWidth: 0 }),
      );
    }
  });

  it('saving 時鎖住接受與再聊聊', () => {
    const onAccept = jest.fn();
    const onRequestChanges = jest.fn();
    renderCard({ saving: true, onAccept, onRequestChanges });

    const accept = screen.getByRole('button', { name: '正在把計畫準備好…' });
    const requestChanges = screen.getByRole('button', { name: '我想再聊聊' });
    expect(accept.props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(requestChanges.props.accessibilityState).toEqual({ disabled: true, busy: true });
    fireEvent.press(accept);
    fireEvent.press(requestChanges);
    expect(onAccept).not.toHaveBeenCalled();
    expect(onRequestChanges).not.toHaveBeenCalled();
  });

  it('顯示錯誤並可重試', () => {
    const onRetry = jest.fn();
    renderCard({ error: '計畫已更新，重新看看就好', onRetry });

    expect(screen.getByText('計畫已更新，重新看看就好')).toBeTruthy();
    const alert = screen.getByRole('alert');
    expect(alert.props.accessibilityLiveRegion).toBe('polite');
    fireEvent.press(screen.getByRole('button', { name: '重新看看' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('零差異的 stale review 不生成改動內容並可重試', () => {
    const onRetry = jest.fn();
    renderCard({
      review: review({
        currentOverrides: {
          cadence_weekly_frequency: 4,
          preferred_time: null,
        },
      }),
      onRetry,
    });

    expect(screen.getByText('安排剛剛更新了，重新看看就好')).toBeTruthy();
    expect(screen.queryByText('媽媽調整了一點安排')).toBeNull();
    expect(screen.queryByLabelText(/改成/)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: '重新看看' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
