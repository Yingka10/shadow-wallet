import React, { useState } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
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
    planWeekLabel: '第 1 週／共 4 週',
    weekProgressLabel: '本週完成 1／5 次',
    weekCompletedActual: 1,
    weekTarget: 5,
    weekTargetReached: false,
    weekExtra: 0,
    weekProgressNote: '還差 4 次到這週約定的節奏',
    progression: 'rhythm',
    targetReached: false,
    planState: 'active',
    categoryLabel: '學習與技能',
    overallLabel: '1 / 20 次',
    overallPercent: 5,
    focusText: '先找到適合自己的閱讀節奏',
    nextText: '下一個里程碑：完成第 5 次',
    todayTitle: '今天的小步驟',
    todayAction: '自己選一本喜歡的書，閱讀 15 分鐘',
    preferredTimeWindow: 'after_dinner',
    canCompleteToday: true,
    completionReason: 'available',
    sessionMinutes: 15,
    agreedTime: { value: 'after_dinner', label: '晚餐後' },
    supportsTimeWindow: true,
    childPlan: null,
    agreedReward: null,
    legacyReward: false,
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

const READING_ONLY_COPY =
  /閱讀時間|最喜歡哪一本書|閱讀時段|閱讀內容|晚餐後還是睡前比較適合/;

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
      screen.getByPlaceholderText('想記下這週最有感的一段嗎？'),
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

  it('discards an unsaved review edit after close and reopen', () => {
    const { props, rerender } = renderSheet('review');

    fireEvent.changeText(
      screen.getByPlaceholderText('想記下這週最有感的一段嗎？'),
      '還沒保留的內容',
    );
    expect(
      screen.getByPlaceholderText('想記下這週最有感的一段嗎？').props.value,
    ).toBe('還沒保留的內容');

    fireEvent.press(screen.getByLabelText('關閉週末回顧'));
    rerender(<LongTermGoalDetailSheets {...props} activeSheet={null} />);
    rerender(<LongTermGoalDetailSheets {...props} activeSheet="review" />);

    expect(
      screen.getByPlaceholderText('想記下這週最有感的一段嗎？').props.value,
    ).toBe('');
  });

  it('saves an adjustment draft without claiming it was sent or applied', () => {
    const onSaveAdjustmentDraft = jest.fn();
    renderSheet('adjustment', { onSaveAdjustmentDraft });

    expect(
      screen.getByText('這個選擇目前只保留在這個畫面，尚未送出給家長或套用到計畫。'),
    ).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: '想調整每週安排' }));
    fireEvent.press(screen.getByRole('button', { name: '保留調整草稿' }));

    expect(onSaveAdjustmentDraft).toHaveBeenCalledWith('frequency');
    expect(screen.queryByText('已通知家長')).toBeNull();
    expect(screen.queryByText('已套用')).toBeNull();
    expect(screen.queryByText('送出成功')).toBeNull();
  });

  it('discards unsaved adjustment edits and clears when the prop becomes null', () => {
    const { props, rerender } = renderSheet('adjustment', {
      adjustmentDraft: 'pause',
    });

    expect(
      screen.getByRole('button', { name: '想先暫停一下' }).props
        .accessibilityState,
    ).toEqual(expect.objectContaining({ selected: true }));

    rerender(
      <LongTermGoalDetailSheets
        {...props}
        activeSheet="adjustment"
        adjustmentDraft={null}
      />,
    );
    expect(
      screen.getByRole('button', { name: '想先暫停一下' }).props
        .accessibilityState,
    ).toEqual(expect.objectContaining({ selected: false }));

    fireEvent.press(screen.getByRole('button', { name: '想調整每週安排' }));
    rerender(
      <LongTermGoalDetailSheets
        {...props}
        activeSheet={null}
        adjustmentDraft={null}
      />,
    );
    rerender(
      <LongTermGoalDetailSheets
        {...props}
        activeSheet="adjustment"
        adjustmentDraft={null}
      />,
    );

    expect(
      screen.getByRole('button', { name: '想調整每週安排' }).props
        .accessibilityState,
    ).toEqual(expect.objectContaining({ selected: false }));
    expect(
      screen.getByRole('button', { name: '保留調整草稿' }).props
        .accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
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
    expect(screen.getByText('計畫時間')).toBeTruthy();
    expect(screen.queryByText('閱讀時間')).toBeNull();
    expect(screen.queryByText('投入時間')).toBeNull();
    expect(screen.getByText('晚餐後')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: '睡前' }));

    await waitFor(() => {
      expect(onCorrectTimeWindow).toHaveBeenCalledWith('before_bed');
    });
    expect(screen.getByText('睡前')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '睡前' }).props.accessibilityState,
    ).toEqual(expect.objectContaining({ selected: true }));
  });

  it('keeps the confirmed record and announces an error when correction fails', async () => {
    const onCorrectTimeWindow = jest.fn(async () => {
      throw new Error('network unavailable');
    });
    renderSheet('record', { onCorrectTimeWindow });

    fireEvent.press(screen.getByRole('button', { name: '睡前' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '更正失敗，請再試一次。',
    );
    expect(screen.getByText('晚餐後')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '晚餐後' }).props.accessibilityState,
    ).toEqual(expect.objectContaining({ selected: true, disabled: false }));
    expect(
      screen.getByRole('button', { name: '睡前' }).props.accessibilityState,
    ).toEqual(expect.objectContaining({ selected: false, disabled: false }));
  });

  it('syncs the confirmed record when completion props change', () => {
    const { props, rerender } = renderSheet('record');

    rerender(
      <LongTermGoalDetailSheets
        {...props}
        completion={{ ...completion, planned_time_window: 'before_bed' }}
      />,
    );

    expect(screen.getByText('睡前')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '睡前' }).props.accessibilityState,
    ).toEqual(expect.objectContaining({ selected: true }));
  });

  it('disables correction choices and prevents duplicate calls while pending', async () => {
    let resolveCorrection!: () => void;
    const pendingCorrection = new Promise<void>((resolve) => {
      resolveCorrection = resolve;
    });
    const onCorrectTimeWindow = jest.fn(() => pendingCorrection);
    renderSheet('record', { onCorrectTimeWindow });

    fireEvent.press(screen.getByRole('button', { name: '睡前' }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '睡前' }).props.accessibilityState,
      ).toEqual(expect.objectContaining({ disabled: true }));
    });
    fireEvent.press(screen.getByRole('button', { name: '睡前' }));
    expect(onCorrectTimeWindow).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCorrection();
      await pendingCorrection;
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

    const detailButton = screen.getByRole('button', { name: '查看計畫詳情' });
    expect(detailButton.props.accessibilityHint).toBe(
      '查看期間、完成方式與可以調整的內容',
    );
    fireEvent.press(detailButton);
    expect(onOpenSheet).toHaveBeenCalledWith('details');

    expect(screen.getAllByLabelText('關閉長期任務選單')).toHaveLength(1);
    fireEvent.press(screen.getByLabelText('關閉長期任務選單'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses skill review copy without changing an existing time-window draft', () => {
    const onSaveReviewDraft = jest.fn();
    const rendered = renderSheet('review', {
      presentation: makePresentation({
        supportsTimeWindow: false,
        progression: 'staged',
        categoryLabel: '可調整的顯示文案',
      }),
      reviewDraft: {
        favoriteNote: '',
        preferredWindow: 'after_dinner',
        nextStep: null,
      },
      onSaveReviewDraft,
    });

    expect(screen.getByText('這週哪一段練習最有感？')).toBeTruthy();
    expect(screen.getByPlaceholderText('想記下這週最有感的一段嗎？')).toBeTruthy();
    expect(screen.getByRole('button', { name: '調整進行方式' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '晚餐後' })).toBeNull();
    expect(screen.queryByRole('button', { name: '睡前' })).toBeNull();
    expect(JSON.stringify(rendered.toJSON())).not.toMatch(READING_ONLY_COPY);

    fireEvent.press(screen.getByRole('button', { name: '調整進行方式' }));
    fireEvent.press(screen.getByRole('button', { name: '保留回顧草稿' }));

    expect(onSaveReviewDraft).toHaveBeenCalledWith({
      favoriteNote: '',
      preferredWindow: 'after_dinner',
      nextStep: 'method',
    });
  });

  it('uses family adjustment copy without reading-only wording', () => {
    const rendered = renderSheet('adjustment', {
      presentation: makePresentation({
        supportsTimeWindow: false,
        progression: 'rhythm',
        categoryLabel: '可調整的顯示文案',
      }),
    });

    expect(screen.getByRole('button', { name: '想調整進行時間' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '想調整每週安排' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '想調整進行內容' })).toBeTruthy();
    expect(JSON.stringify(rendered.toJSON())).not.toMatch(READING_ONLY_COPY);
  });

  it('keeps challenge records generic and hides reading time corrections', () => {
    const onCorrectTimeWindow = jest.fn(async () => undefined);
    const rendered = renderSheet('record', {
      presentation: makePresentation({
        supportsTimeWindow: false,
        progression: 'accumulation',
        categoryLabel: '可調整的顯示文案',
      }),
      onCorrectTimeWindow,
    });

    expect(screen.getByText('完成時段')).toBeTruthy();
    expect(screen.getByText('計畫時間')).toBeTruthy();
    expect(screen.queryByText('投入時間')).toBeNull();
    expect(screen.queryByRole('button', { name: '晚餐後' })).toBeNull();
    expect(screen.queryByRole('button', { name: '睡前' })).toBeNull();
    expect(JSON.stringify(rendered.toJSON())).not.toMatch(READING_ONLY_COPY);
    expect(onCorrectTimeWindow).not.toHaveBeenCalled();
  });

  it('uses challenge review and adjustment wording', () => {
    const review = renderSheet('review', {
      presentation: makePresentation({
        supportsTimeWindow: false,
        progression: 'accumulation',
        categoryLabel: '可調整的顯示文案',
      }),
    });

    expect(screen.getByText('這週哪一步最有感？')).toBeTruthy();
    expect(JSON.stringify(review.toJSON())).not.toMatch(READING_ONLY_COPY);

    review.rerender(
      <LongTermGoalDetailSheets
        {...review.props}
        activeSheet="adjustment"
        presentation={makePresentation({
          supportsTimeWindow: false,
          progression: 'accumulation',
          categoryLabel: '可調整的顯示文案',
        })}
      />,
    );
    expect(screen.getByRole('button', { name: '想調整挑戰內容' })).toBeTruthy();
    expect(JSON.stringify(review.toJSON())).not.toMatch(READING_ONLY_COPY);
  });

  it('shows a warm plan notice above the truthful details', () => {
    renderSheet('details', {
      presentation: makePresentation({
        planNotice: '目前期間最多可安排 10 次，和 20 次目標不一致。',
      }),
    });

    const notice = screen.getByLabelText(
      '計畫提醒：目前期間最多可安排 10 次，和 20 次目標不一致。',
    );
    expect(notice).toBeTruthy();
    expect(notice.props.accessibilityRole).toBe('summary');
    expect(screen.getByText('完成 20 次')).toBeTruthy();
    expect(screen.getByText('2026-07-28 至 2026-08-24（共 4 週）')).toBeTruthy();
  });

  it('uses the general fallback for a non-reading habit', () => {
    const review = renderSheet('review', {
      presentation: makePresentation({
        progression: 'rhythm',
        supportsTimeWindow: false,
        categoryLabel: '學習與技能',
      }),
    });

    expect(screen.getByText('這週哪一段最有感？')).toBeTruthy();
    expect(JSON.stringify(review.toJSON())).not.toMatch(READING_ONLY_COPY);

    review.rerender(
      <LongTermGoalDetailSheets
        {...review.props}
        activeSheet="adjustment"
        presentation={makePresentation({
          progression: 'rhythm',
          supportsTimeWindow: false,
          categoryLabel: '學習與技能',
        })}
      />,
    );
    expect(screen.getByRole('button', { name: '想調整進行內容' })).toBeTruthy();
    expect(JSON.stringify(review.toJSON())).not.toMatch(READING_ONLY_COPY);
  });
});
