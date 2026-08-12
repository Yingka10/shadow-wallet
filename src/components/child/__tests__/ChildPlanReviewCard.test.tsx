import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ChildProposalReviewData } from '../../../lib/childProposal';
import { ChildPlanReviewCard } from '../ChildPlanReviewCard';

function review(overrides: Record<string, unknown> = {}): ChildProposalReviewData {
  const common = {
    proposal_id: 'p1', cadence_mode: 'weekly_frequency', cadence_days: null,
    preferred_time: 'after_dinner', preferred_time_custom: null,
    completion_description: '完成一次 15 分鐘閱讀',
  };
  return {
    proposal: {
      id: 'p1', status: 'needs_child_review', child_original_goal: '我想讀完這本書',
    },
    sourcePlanVersion: {
      ...common, id: 'v1', authored_by: 'ai', cadence_weekly_frequency: 4,
      plan_summary: '預計一週安排 4 天閱讀',
    },
    currentPlanVersion: {
      ...common, id: 'v2', authored_by: 'parent', cadence_weekly_frequency: 3,
      adopted_from_plan_version_id: 'v1', ...overrides,
    },
  } as ChildProposalReviewData;
}

describe('ChildPlanReviewCard', () => {
  it('用 structured diff 說明媽媽改了什麼，不顯示 copied free text 或 admin words', () => {
    render(<ChildPlanReviewCard
      review={review()} saving={false} error={null}
      onAccept={jest.fn()} onRequestChanges={jest.fn()} onRetry={jest.fn()}
    />);
    expect(screen.getByText('媽媽調整了一點安排')).toBeTruthy();
    expect(screen.getByText('看看這樣是不是也想試試看')).toBeTruthy();
    expect(screen.getByText('每週安排')).toBeTruthy();
    expect(screen.getByText('一週 4 次')).toBeTruthy();
    expect(screen.getByText('一週 3 次')).toBeTruthy();
    expect(screen.queryByText('預計一週安排 4 天閱讀')).toBeNull();
    expect(screen.queryByText(/核准|版本|RPC|material|差異欄位/)).toBeNull();
  });

  it('兩個自然 CTA 分別呼叫 accept 與想再聊聊', () => {
    const onAccept = jest.fn();
    const onRequestChanges = jest.fn();
    render(<ChildPlanReviewCard
      review={review()} saving={false} error={null}
      onAccept={onAccept} onRequestChanges={onRequestChanges} onRetry={jest.fn()}
    />);
    fireEvent.press(screen.getByText('好，我也想這樣試試看'));
    fireEvent.press(screen.getByText('我想再聊聊'));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onRequestChanges).toHaveBeenCalledTimes(1);
  });

  it('pending 鎖住兩個 action；typed error 可重試', () => {
    const onAccept = jest.fn();
    const onRequestChanges = jest.fn();
    const onRetry = jest.fn();
    render(<ChildPlanReviewCard
      review={review()} saving error="計畫已更新，重新看看就好"
      onAccept={onAccept} onRequestChanges={onRequestChanges} onRetry={onRetry}
    />);
    expect(screen.getByText('正在把計畫準備好…')).toBeTruthy();
    fireEvent.press(screen.getByText('正在把計畫準備好…'));
    fireEvent.press(screen.getByText('我想再聊聊'));
    expect(onAccept).not.toHaveBeenCalled();
    expect(onRequestChanges).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('重新看看'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('沒有真實 material diff 時不生成改動內容', () => {
    render(<ChildPlanReviewCard
      review={review({ cadence_weekly_frequency: 4 })} saving={false} error={null}
      onAccept={jest.fn()} onRequestChanges={jest.fn()} onRetry={jest.fn()}
    />);
    expect(screen.getByText('安排剛剛更新了，重新看看就好')).toBeTruthy();
    expect(screen.queryByText('媽媽調整了一點安排')).toBeNull();
  });
});
