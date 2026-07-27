import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type {
  CompletionStartMode,
  PreferredTimeWindow,
} from '../../../types/database';
import type { GoalPresentation } from '../../../screens/child/longTermGoalPresentation';
import LongTermGoalDetailView from '../LongTermGoalDetailView';

function makePresentation(
  overrides: Partial<GoalPresentation> = {},
): GoalPresentation {
  return {
    headerTitle: '自主閱讀計畫',
    weekLabel: '第 1 週',
    categoryLabel: '學習與技能',
    overallLabel: '3 / 20 次',
    overallPercent: 15,
    focusText: '第一週：先找到適合自己的閱讀節奏',
    nextText: '下一站：完成第 5 次',
    todayTitle: '今天的小步驟',
    todayAction: '自己選一本喜歡的書，閱讀 15 分鐘',
    preferredTimeWindow: 'after_dinner',
    canCompleteToday: true,
    isReadingPlan: true,
    weekDays: [
      { day: 1, label: '一', state: 'completed' },
      { day: 2, label: '二', state: 'self_started' },
      { day: 3, label: '三', state: 'self_started' },
      { day: 4, label: '四', state: 'today' },
      { day: 5, label: '五', state: 'future' },
    ],
    weekSummary: '這週已閱讀 3 次，其中 2 次是自己開始的。',
    nextReward: { threshold: 5, coin: 10 },
    finalRewardText: '完成四週後，和家人一起選下一本書或慶祝方式',
    reviewTitle: '週末一起回顧',
    reviewPrompt: '哪一本最喜歡？晚餐後還是睡前比較適合？',
    sectionOrder: ['hero', 'today', 'week', 'rewards', 'review'],
    ...overrides,
  };
}

describe('LongTermGoalDetailView', () => {
  it('keeps schedule choices hidden until the child needs to adjust today', () => {
    const onSelectTimeWindow = jest.fn<void, [PreferredTimeWindow]>();

    render(
      <LongTermGoalDetailView
        presentation={makePresentation()}
        isCompletedToday={false}
        checking={false}
        onComplete={jest.fn()}
        onSelectTimeWindow={onSelectTimeWindow}
        onRecordStartMode={jest.fn<void, [CompletionStartMode]>()}
      />,
    );

    expect(screen.getByText('3 / 20 次')).toBeTruthy();
    expect(screen.getByText('第一週：先找到適合自己的閱讀節奏')).toBeTruthy();
    expect(screen.getByText('今天預計：晚餐後')).toBeTruthy();
    expect(screen.queryByTestId('time-options')).toBeNull();

    fireEvent.press(screen.getByText('今天要調整'));

    expect(screen.getByTestId('time-options')).toBeTruthy();
    fireEvent.press(screen.getByText('睡前'));
    expect(onSelectTimeWindow).toHaveBeenCalledWith('before_bed');
  });

  it('asks how reading started only after completion succeeds', async () => {
    const onComplete = jest.fn(async () => undefined);

    render(
      <LongTermGoalDetailView
        presentation={makePresentation()}
        isCompletedToday={false}
        checking={false}
        onComplete={onComplete}
        onSelectTimeWindow={jest.fn()}
        onRecordStartMode={jest.fn()}
      />,
    );

    expect(screen.queryByText('我自己開始的')).toBeNull();
    fireEvent.press(screen.getByText('完成今天閱讀'));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(screen.getByText('我自己開始的')).toBeTruthy();
    });
  });

  it('renders the same section skeleton for skill goals without unsupported actions', () => {
    render(
      <LongTermGoalDetailView
        presentation={makePresentation({
          headerTitle: '鋼琴家之路',
          overallLabel: '第 2 / 4 階段',
          todayTitle: '目前的小步驟',
          todayAction: '這一階段先練習：雙手合奏',
          preferredTimeWindow: null,
          canCompleteToday: false,
          isReadingPlan: false,
          weekSummary: '這週可以依自己的節奏，繼續目前的練習階段。',
        })}
        isCompletedToday={false}
        checking={false}
        onComplete={jest.fn()}
        onSelectTimeWindow={jest.fn()}
        onRecordStartMode={jest.fn()}
      />,
    );

    for (const testID of [
      'goal-hero',
      'goal-today',
      'goal-week',
      'goal-rewards',
      'goal-review',
    ]) {
      expect(screen.getByTestId(testID)).toBeTruthy();
    }
    expect(screen.queryByText('錄一段給自己聽')).toBeNull();
  });
});
