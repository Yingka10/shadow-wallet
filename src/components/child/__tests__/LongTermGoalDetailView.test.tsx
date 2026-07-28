import React from 'react';
import { StyleSheet } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { PreferredTimeWindow } from '../../../types/database';
import type { GoalPresentation } from '../../../screens/child/longTermGoalPresentation';
import LongTermGoalDetailView from '../LongTermGoalDetailView';

function makePresentation(
  overrides: Partial<GoalPresentation> = {},
): GoalPresentation {
  return {
    headerTitle: '自主閱讀計畫',
    weekLabel: '第 1 週',
    planWeekLabel: '第 1 週／共 4 週',
    weekProgressLabel: '本週完成 1／5 次',
    weekCompleted: 1,
    weekTarget: 5,
    totalWeeks: 4,
    categoryLabel: '學習與技能',
    overallLabel: '1 / 20 次',
    overallPercent: 5,
    focusText: '第一週：先找到適合自己的閱讀節奏',
    nextText: '下一個里程碑：完成第 5 次',
    todayTitle: '今天的小步驟',
    todayAction: '自己選一本喜歡的書，閱讀 15 分鐘',
    preferredTimeWindow: 'after_dinner',
    canCompleteToday: true,
    isReadingPlan: true,
    weekDays: [
      {
        day: 1,
        label: '一',
        isoDate: '2026-07-27',
        isScheduled: true,
        state: 'completed',
      },
      {
        day: 2,
        label: '二',
        isoDate: '2026-07-28',
        isScheduled: true,
        state: 'today',
      },
      {
        day: 3,
        label: '三',
        isoDate: '2026-07-29',
        isScheduled: true,
        state: 'upcoming',
      },
      {
        day: 4,
        label: '四',
        isoDate: '2026-07-30',
        isScheduled: true,
        state: 'upcoming',
      },
      {
        day: 5,
        label: '五',
        isoDate: '2026-07-31',
        isScheduled: true,
        state: 'upcoming',
      },
      {
        day: 6,
        label: '六',
        isoDate: '2026-08-01',
        isScheduled: false,
        state: 'unscheduled',
      },
      {
        day: 0,
        label: '日',
        isoDate: '2026-08-02',
        isScheduled: false,
        state: 'unscheduled',
      },
    ],
    weekSummary: '少一天沒有關係，找到適合自己的節奏更重要。',
    nextReward: { threshold: 5, coin: 10 },
    milestones: [
      {
        id: 'start',
        title: '完成第 1 次閱讀',
        detail: null,
        status: 'completed',
      },
      {
        id: 'checkpoint-5',
        title: '完成第 5 次閱讀',
        detail: '成長幣 +10',
        status: 'next',
      },
      {
        id: 'final-review',
        title: '四週後一起回顧',
        detail: '可以繼續、調整閱讀方式，或讓計畫先告一段落。',
        status: 'upcoming',
      },
    ],
    recentRecords: [
      {
        id: 'completion-today',
        dateLabel: '今天',
        detail: '閱讀 15 分鐘',
        timeWindowLabel: '晚餐後',
      },
      {
        id: 'completion-monday',
        dateLabel: '星期一',
        detail: '閱讀 15 分鐘',
        timeWindowLabel: '睡前',
      },
    ],
    planPeriodLabel: '2026-07-27 ～ 2026-08-23（共 4 週）',
    completionConditionLabel: '完成 20 次',
    adjustableItemsLabel: '時間、書本、目標次數',
    finalRewardText: '四週後一起回顧，可以繼續、調整，或讓計畫先告一段落。',
    reviewTitle: '週末一起回顧',
    reviewPrompt: '這週哪個時間最適合閱讀？',
    sectionOrder: ['hero', 'today', 'week', 'rewards', 'review'],
    ...overrides,
  };
}

function renderView(
  presentation = makePresentation(),
  overrides: Partial<React.ComponentProps<typeof LongTermGoalDetailView>> = {},
) {
  const props: React.ComponentProps<typeof LongTermGoalDetailView> = {
    presentation,
    isCompletedToday: false,
    checking: false,
    onComplete: jest.fn(),
    onSelectTimeWindow: jest.fn(),
    ...overrides,
  };

  return {
    ...render(<LongTermGoalDetailView {...props} />),
    props,
  };
}

describe('LongTermGoalDetailView', () => {
  it('puts the current week first without showing a percentage or game-like next stop', () => {
    renderView();

    expect(screen.getByText('第 1 週／共 4 週')).toBeTruthy();
    expect(screen.getByText('本週完成 1／5 次')).toBeTruthy();
    expect(screen.getByText('第一週：先找到適合自己的閱讀節奏')).toBeTruthy();
    expect(screen.getByText('下一個里程碑：完成第 5 次')).toBeTruthy();
    expect(screen.queryByText('5%')).toBeNull();
    expect(screen.queryByText(/下一站/)).toBeNull();
  });

  it('uses product icons instead of emoji for formal section headings', () => {
    renderView();

    for (const heading of [
      '今天的小步驟',
      '本週安排',
      '成長里程碑',
      '週末一起回顧',
      '最近紀錄',
      '計畫詳情',
    ]) {
      expect(screen.getByText(heading)).toBeTruthy();
    }

    for (const emoji of ['🌱', '📚', '📊', '⭐', '❤️', '🌿', '🌳']) {
      expect(screen.queryByText(emoji)).toBeNull();
    }
  });

  it('expands and collapses the small-step explanation accessibly', () => {
    renderView();

    const expandButton = screen.getByLabelText('展開小步驟說明');
    expect(expandButton.props.accessibilityState).toEqual({ expanded: false });

    fireEvent.press(expandButton);

    const collapseButton = screen.getByLabelText('收合小步驟說明');
    expect(collapseButton.props.accessibilityState).toEqual({ expanded: true });
    expect(
      screen.getAllByText('第一週：先找到適合自己的閱讀節奏').length,
    ).toBeGreaterThan(1);
    expect(screen.getByText(/不知道選哪一本/)).toBeTruthy();

    fireEvent.press(collapseButton);
    expect(screen.queryByText(/不知道選哪一本/)).toBeNull();
  });

  it('lets an unfinished reading plan adjust its time and record today', async () => {
    const onComplete = jest.fn(() => false);
    const onSelectTimeWindow = jest.fn<void, [PreferredTimeWindow]>();

    renderView(makePresentation(), { onComplete, onSelectTimeWindow });

    expect(screen.getByText('今天預計：晚餐後')).toBeTruthy();
    expect(screen.queryByTestId('time-options')).toBeNull();

    fireEvent.press(screen.getByLabelText('調整今天的預計時段'));
    expect(screen.getByTestId('time-options')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('改成睡前'));
    expect(onSelectTimeWindow).toHaveBeenCalledWith('before_bed');

    await act(async () => {
      fireEvent.press(screen.getByText('記錄今天的閱讀'));
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('shows a clear completed status and opens the current record for both actions', () => {
    const onOpenRecord = jest.fn();

    renderView(makePresentation(), {
      isCompletedToday: true,
      onOpenRecord,
    });

    expect(screen.getByText('今天已完成 15 分鐘')).toBeTruthy();
    expect(screen.getByText('晚餐後記錄')).toBeTruthy();
    expect(screen.queryByText('記錄今天的閱讀')).toBeNull();

    fireEvent.press(screen.getByText('查看紀錄'));
    fireEvent.press(screen.getByText('需要更正'));
    expect(onOpenRecord).toHaveBeenNthCalledWith(1, 'completion-today');
    expect(onOpenRecord).toHaveBeenNthCalledWith(2, 'completion-today');
  });

  it('waits for the controlled completion prop and can reset from true to false', async () => {
    const onComplete = jest.fn(async () => undefined);
    const presentation = makePresentation({ recentRecords: [] });
    const { rerender } = render(
      <LongTermGoalDetailView
        presentation={presentation}
        isCompletedToday={false}
        checking={false}
        onComplete={onComplete}
        onSelectTimeWindow={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByText('記錄今天的閱讀'));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('completion-loading')).toBeNull();
    });
    expect(screen.queryByText('今天已完成 15 分鐘')).toBeNull();

    rerender(
      <LongTermGoalDetailView
        presentation={presentation}
        isCompletedToday
        checking={false}
        onComplete={onComplete}
        onSelectTimeWindow={jest.fn()}
      />,
    );
    expect(screen.getByText('今天已完成 15 分鐘')).toBeTruthy();

    rerender(
      <LongTermGoalDetailView
        presentation={presentation}
        isCompletedToday={false}
        checking={false}
        onComplete={onComplete}
        onSelectTimeWindow={jest.fn()}
      />,
    );
    expect(screen.queryByText('今天已完成 15 分鐘')).toBeNull();
    expect(screen.getByText('記錄今天的閱讀')).toBeTruthy();
  });

  it('does not expose record, review, or details actions without callbacks', () => {
    renderView(makePresentation(), { isCompletedToday: true });

    expect(screen.queryByText('查看紀錄')).toBeNull();
    expect(screen.queryByText('需要更正')).toBeNull();
    expect(screen.queryByLabelText('開始週末回顧')).toBeNull();
    expect(screen.queryByLabelText('查看計畫詳情')).toBeNull();
    expect(screen.getByText('這週哪個時間最適合閱讀？')).toBeTruthy();
    expect(screen.getByText('2026-07-27 ～ 2026-08-23（共 4 週） · 完成 20 次')).toBeTruthy();
  });

  it('lets a child choose a time when no preferred window exists', () => {
    const onSelectTimeWindow = jest.fn<void, [PreferredTimeWindow]>();
    renderView(makePresentation({ preferredTimeWindow: null }), {
      onSelectTimeWindow,
    });

    expect(screen.getByText('今天預計：尚未選擇時段')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('選擇今天的預計時段'));
    expect(screen.getByTestId('time-options')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('改成晚餐後'));
    expect(onSelectTimeWindow).toHaveBeenCalledWith('after_dinner');
  });

  it('guards a pending completion from double submission and allows retry afterward', async () => {
    let resolveFirst: ((value: void | boolean) => void) | undefined;
    const firstCompletion = new Promise<void | boolean>((resolve) => {
      resolveFirst = resolve;
    });
    const onComplete = jest
      .fn<Promise<void | boolean>, []>()
      .mockImplementationOnce(() => firstCompletion)
      .mockResolvedValueOnce(false);

    renderView(makePresentation(), { onComplete });

    const completeButton = screen.getByLabelText('記錄今天的閱讀');
    fireEvent.press(completeButton);
    fireEvent.press(completeButton);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('completion-loading')).toBeTruthy();

    await act(async () => {
      resolveFirst?.(undefined);
      await firstCompletion;
    });
    await waitFor(() => {
      expect(screen.queryByTestId('completion-loading')).toBeNull();
    });

    fireEvent.press(screen.getByLabelText('記錄今天的閱讀'));
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(2);
      expect(screen.queryByTestId('completion-loading')).toBeNull();
    });
  });

  it('contains completion rejection and restores the action for another try', async () => {
    const onComplete = jest
      .fn<Promise<void | boolean>, []>()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(false);

    renderView(makePresentation(), { onComplete });

    fireEvent.press(screen.getByLabelText('記錄今天的閱讀'));

    await waitFor(() => {
      expect(
        screen.getByText('剛才沒有記錄成功，請再試一次。'),
      ).toBeTruthy();
    });
    expect(screen.queryByTestId('completion-loading')).toBeNull();

    fireEvent.press(screen.getByLabelText('記錄今天的閱讀'));
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(2);
      expect(screen.queryByTestId('completion-loading')).toBeNull();
    });
  });

  it('allows long hero copy to grow and keeps seven-day captions readable', () => {
    const longFocus = '這一週先慢慢找出最適合自己的時間，也可以在需要時和家人一起調整閱讀方式。';
    const longNext = '下一個里程碑：完成第五次閱讀後，一起看看目前的方法是否仍然適合。';
    renderView(makePresentation({ focusText: longFocus, nextText: longNext }));

    expect(screen.getByText(longFocus)).toBeTruthy();
    expect(screen.getByText(longNext)).toBeTruthy();

    const heroStyle = StyleSheet.flatten(screen.getByTestId('goal-hero').props.style);
    expect(heroStyle.minHeight).toBeGreaterThanOrEqual(150);
    expect(heroStyle.height).toBeUndefined();

    const captionStyle = StyleSheet.flatten(
      screen.getByTestId('goal-day-caption-1').props.style,
    );
    expect(captionStyle.fontSize).toBeGreaterThanOrEqual(9);
    expect(captionStyle.lineHeight).toBeGreaterThanOrEqual(12);
    expect(captionStyle.minHeight).toBeGreaterThanOrEqual(24);
  });

  it('describes all seven real schedule states without punitive language', () => {
    renderView(makePresentation({
      weekDays: [
        {
          day: 1,
          label: '一',
          isoDate: '2026-07-27',
          isScheduled: true,
          state: 'completed',
        },
        {
          day: 2,
          label: '二',
          isoDate: '2026-07-28',
          isScheduled: true,
          state: 'today',
        },
        {
          day: 3,
          label: '三',
          isoDate: '2026-07-29',
          isScheduled: true,
          state: 'upcoming',
        },
        {
          day: 4,
          label: '四',
          isoDate: '2026-07-30',
          isScheduled: true,
          state: 'missed',
        },
        {
          day: 5,
          label: '五',
          isoDate: '2026-07-31',
          isScheduled: false,
          state: 'unscheduled',
        },
        {
          day: 6,
          label: '六',
          isoDate: '2026-08-01',
          isScheduled: true,
          state: 'upcoming',
        },
        {
          day: 0,
          label: '日',
          isoDate: '2026-08-02',
          isScheduled: false,
          state: 'unscheduled',
        },
      ],
    }));

    for (const label of [
      '星期一，已完成',
      '星期二，今天待完成',
      '星期三，尚未到',
      '星期四，這次跳過',
      '星期五，沒有安排',
      '星期六，尚未到',
      '星期日，沒有安排',
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.queryByText(/失敗|連勝|火焰/)).toBeNull();
  });

  it('renders milestones as status-labelled timeline rows', () => {
    renderView();

    expect(screen.getByText('完成第 1 次閱讀')).toBeTruthy();
    expect(screen.getByText('完成第 5 次閱讀')).toBeTruthy();
    expect(screen.getByText('成長幣 +10')).toBeTruthy();
    expect(screen.getByText('已完成')).toBeTruthy();
    expect(screen.getByText('下一個里程碑')).toBeTruthy();
    expect(screen.getByText('之後一起回顧')).toBeTruthy();
  });

  it('opens the weekend review and quiet plan-details entry', () => {
    const onOpenReview = jest.fn();
    const onOpenDetails = jest.fn();

    renderView(makePresentation(), { onOpenReview, onOpenDetails });

    fireEvent.press(screen.getByLabelText('開始週末回顧'));
    fireEvent.press(screen.getByLabelText('查看計畫詳情'));
    expect(onOpenReview).toHaveBeenCalledTimes(1);
    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });

  it('shows at most three real recent records and opens the selected record', () => {
    const onOpenRecord = jest.fn();
    renderView(makePresentation({
      recentRecords: [
        ...makePresentation().recentRecords,
        {
          id: 'completion-last-week',
          dateLabel: '上週五',
          detail: '閱讀 15 分鐘',
          timeWindowLabel: null,
        },
        {
          id: 'completion-hidden',
          dateLabel: '上週四',
          detail: '閱讀 15 分鐘',
          timeWindowLabel: '晚餐後',
        },
      ],
    }), { onOpenRecord });

    expect(screen.getAllByText('今天').length).toBeGreaterThan(0);
    expect(screen.getByText('星期一')).toBeTruthy();
    expect(screen.getByText('上週五')).toBeTruthy();
    expect(screen.queryByText('上週四')).toBeNull();

    fireEvent.press(screen.getByLabelText('查看今天的紀錄'));
    expect(onOpenRecord).toHaveBeenCalledWith('completion-today');
  });

  it('hides the recent-record section when there is no history', () => {
    renderView(makePresentation({ recentRecords: [] }));
    expect(screen.queryByText('最近紀錄')).toBeNull();
  });

  it('keeps skill goals in the same skeleton with a non-reading action', () => {
    renderView(makePresentation({
      headerTitle: '鋼琴家之路',
      planWeekLabel: '第 2 階段／共 4 階段',
      weekProgressLabel: '這週練習 2 次',
      categoryLabel: '學習與技能',
      focusText: '目前階段：雙手合奏',
      nextText: '下一個里程碑：完整演奏',
      todayTitle: '今天的小步驟',
      todayAction: '練習雙手合奏 15 分鐘',
      preferredTimeWindow: null,
      canCompleteToday: true,
      isReadingPlan: false,
      reviewPrompt: '這週哪一段練習最有進步？',
    }));

    for (const testID of [
      'goal-hero',
      'goal-today',
      'goal-week',
      'goal-rewards',
      'goal-review',
      'goal-details',
    ]) {
      expect(screen.getByTestId(testID)).toBeTruthy();
    }
    expect(screen.getByText('記下今天的完成')).toBeTruthy();
    expect(screen.queryByText('記錄今天的閱讀')).toBeNull();
  });
});
