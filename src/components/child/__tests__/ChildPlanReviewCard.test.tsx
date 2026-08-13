import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ChildProposalReviewData } from '../../../lib/childProposal';
import { ChildPlanReviewCard } from '../ChildPlanReviewCard';

function review({
  sourceOverrides = {},
  currentOverrides = {},
}: {
  sourceOverrides?: Record<string, unknown>;
  currentOverrides?: Record<string, unknown>;
} = {}): ChildProposalReviewData {
  const common = {
    proposal_id: 'p1',
    cadence_mode: 'weekly_frequency',
    cadence_days: null,
    preferred_time_custom: null,
    completion_description: '完成一次 15 分鐘閱讀',
  };

  return {
    proposal: {
      id: 'p1',
      status: 'needs_child_review',
      child_original_goal: '我想讀完這本書',
      parent_reason: '因為媽媽覺得這樣比較有效率',
    },
    sourcePlanVersion: {
      ...common,
      id: 'v1',
      authored_by: 'ai',
      cadence_weekly_frequency: 4,
      preferred_time: null,
      plan_summary: 'AI 建議：一週安排 4 天閱讀並獲得獎勵',
      ai_snapshot: { summary: 'AI 摘要不應顯示' },
      reward_explanation: '完成後可以得到 12 枚金幣',
      ...sourceOverrides,
    },
    currentPlanVersion: {
      ...common,
      id: 'v2',
      authored_by: 'parent',
      cadence_weekly_frequency: 3,
      preferred_time: 'before_bed',
      adopted_from_plan_version_id: 'v1',
      ...currentOverrides,
    },
  } as unknown as ChildProposalReviewData;
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

  it('saving 時鎖住接受與再聊聊', () => {
    const onAccept = jest.fn();
    const onRequestChanges = jest.fn();
    renderCard({ saving: true, onAccept, onRequestChanges });

    const accept = screen.getByRole('button', { name: '正在把計畫準備好…' });
    const requestChanges = screen.getByRole('button', { name: '我想再聊聊' });
    expect(accept.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(requestChanges.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    fireEvent.press(accept);
    fireEvent.press(requestChanges);
    expect(onAccept).not.toHaveBeenCalled();
    expect(onRequestChanges).not.toHaveBeenCalled();
  });

  it('顯示錯誤並可重試', () => {
    const onRetry = jest.fn();
    renderCard({ error: '計畫已更新，重新看看就好', onRetry });

    expect(screen.getByText('計畫已更新，重新看看就好')).toBeTruthy();
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
