import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type {
  GoalCompletionRecord,
  GoalPresentation,
} from '../../../screens/child/longTermGoalPresentation';
import LongTermGoalDetailSheets, {
  type AdjustmentDraft,
  type LongTermSheet,
  type ReviewDraft,
} from '../LongTermGoalDetailSheets';

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
    focusText: '先找到適合自己的閱讀節奏',
    nextText: '下一個里程碑：完成第 5 次',
    todayTitle: '今天的小步驟',
    todayAction: '自己選一本喜歡的書，閱讀 15 分鐘',
    preferredTimeWindow: 'after_dinner',
    canCompleteToday: true,
    isReadingPlan: true,
    weekDays: [],
    weekSummary: '這週已閱讀 1 次。',
    nextReward: { threshold: 5, coin: 10 },
    milestones: [],
    recentRecords: [],
    planPeriodLabel: '2026-07-28 至 2026-08-24（共 4 週）',
    completionConditionLabel: '完成 20 次',
    adjustableItemsLabel: '時間、書本、目標次數',
    finalRewardText: '四週後一起回顧。',
    reviewTitle: '週末一起回顧',
    reviewPrompt: '這週哪個時間最適合閱讀？',
    sectionOrder: ['hero', 'today', 'week', 'rewards', 'review'],
    ...overrides,
  };
}

const completion: GoalCompletionRecord = {
  id: 'completion-1',
  completed_at: '2026-07-28T12:30:00.000Z',
  planned_time_window: 'after_dinner',
  start_mode: null,
};

const reviewDraft: ReviewDraft = {
  favoriteNote: '',
  preferredWindow: null,
  nextStep: null,
};

function renderSheet(
  activeSheet: LongTermSheet,
  overrides: Partial<React.ComponentProps<typeof LongTermGoalDetailSheets>> = {},
) {
  const props: React.ComponentProps<typeof LongTermGoalDetailSheets> = {
    activeSheet,
    onClose: jest.fn(),
    onOpenSheet: jest.fn(),
    presentation: makePresentation(),
    completion,
    taskMinutes: 15,
    reviewDraft,
    adjustmentDraft: null,
    onSaveReviewDraft: jest.fn(),
    onSaveAdjustmentDraft: jest.fn(),
    onCorrectTimeWindow: jest.fn(async () => undefined),
    ...overrides,
  };

  return { ...render(<LongTermGoalDetailSheets {...props} />), props };
}

describe('LongTermGoalDetailSheets', () => {
  it('renders truthful plan details and opens the adjustment sheet', () => {
    const onOpenSheet = jest.fn();
    renderSheet('details', { onOpenSheet });

    expect(screen.getByText('2026-07-28 至 2026-08-24（共 4 週）')).toBeTruthy();
    expect(screen.getByText('學習與技能')).toBeTruthy();
    expect(screen.getByText('完成 20 次')).toBeTruthy();
    expect(screen.getByText('晚餐後')).toBeTruthy();
    expect(screen.getByText('時間、書本、目標次數')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: '提出調整' }));
    expect(onOpenSheet).toHaveBeenCalledWith('adjustment');
  });

  it('saves the exact review draft locally', () => {
    const onSaveReviewDraft = jest.fn();
    renderSheet('review', { onSaveReviewDraft });

    expect(
      screen.getByText('這份回答目前只保留在這個畫面，尚未送出給家長。'),
    ).toBeTruthy();

    fireEvent.changeText(
      screen.getByPlaceholderText('想記下哪一本書或哪一段？'),
      '神奇樹屋',
    );
    fireEvent.press(screen.getByRole('button', { name: '睡前' }));
    fireEvent.press(screen.getByRole('button', { name: '保留回顧草稿' }));

    expect(onSaveReviewDraft).toHaveBeenCalledWith({
      favoriteNote: '神奇樹屋',
      preferredWindow: 'before_bed',
      nextStep: null,
    });
  });

  it('saves an adjustment draft without claiming it was sent or applied', () => {
    const onSaveAdjustmentDraft = jest.fn();
    renderSheet('adjustment', { onSaveAdjustmentDraft });

    expect(
      screen.getByText('這個選擇目前只保留在這個畫面，尚未送出給家長或套用到計畫。'),
    ).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: '想調整每週次數' }));
    fireEvent.press(screen.getByRole('button', { name: '保留調整草稿' }));

    expect(onSaveAdjustmentDraft).toHaveBeenCalledWith('frequency');
    expect(screen.queryByText('已通知家長')).toBeNull();
    expect(screen.queryByText('已套用')).toBeNull();
    expect(screen.queryByText('送出成功')).toBeNull();
  });

  it('routes pause through adjustment and preselects pause without saving', () => {
    const onSaveAdjustmentDraft = jest.fn();

    function Harness() {
      const [activeSheet, setActiveSheet] = useState<LongTermSheet>('menu');

      return (
        <LongTermGoalDetailSheets
          activeSheet={activeSheet}
          onClose={jest.fn()}
          onOpenSheet={setActiveSheet}
          presentation={makePresentation()}
          completion={completion}
          taskMinutes={15}
          reviewDraft={reviewDraft}
          adjustmentDraft={null}
          onSaveReviewDraft={jest.fn()}
          onSaveAdjustmentDraft={onSaveAdjustmentDraft}
          onCorrectTimeWindow={jest.fn(async () => undefined)}
        />
      );
    }

    render(<Harness />);
    fireEvent.press(screen.getByRole('button', { name: '暫停一下' }));

    expect(screen.getByText('提出調整')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '想先暫停一下' }).props.accessibilityState,
    ).toEqual(expect.objectContaining({ selected: true }));
    expect(onSaveAdjustmentDraft).not.toHaveBeenCalled();
  });

  it('shows the real completion record and corrects its time window', async () => {
    const onCorrectTimeWindow = jest.fn(async () => undefined);
    renderSheet('record', { onCorrectTimeWindow });

    expect(screen.getByText('2026/07/28')).toBeTruthy();
    expect(screen.getByText('15 分鐘')).toBeTruthy();
    expect(screen.getByText('晚餐後')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: '睡前' }));

    await waitFor(() => {
      expect(onCorrectTimeWindow).toHaveBeenCalledWith('before_bed');
    });
  });

  it('does not invent a time window when the completion has none', () => {
    renderSheet('record', {
      completion: { ...completion, planned_time_window: null },
    });

    expect(screen.getByText('尚未記錄時段')).toBeTruthy();
    expect(screen.queryByText('晚餐後記錄')).toBeNull();
    expect(screen.queryByText('睡前記錄')).toBeNull();
  });

  it('menu exposes only safe navigation actions and closes accessibly', () => {
    const onClose = jest.fn();
    const onOpenSheet = jest.fn();
    renderSheet('menu', { onClose, onOpenSheet });

    fireEvent.press(screen.getByRole('button', { name: '查看計畫詳情' }));
    expect(onOpenSheet).toHaveBeenCalledWith('details');

    fireEvent.press(screen.getByLabelText('關閉長期任務選單'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
