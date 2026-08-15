// P0-8M — 孩子回顧表單什麼時候才真的把「換時段」送給家長。
//
// 這一組測試的重點不是畫面好不好看，而是**送出的閘門**：
// 少一個條件都不能送，因為送出去的另一端是一支會改變共同計畫的 RPC。

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { GoalPresentation } from '../../../screens/child/longTermGoalPresentation';
import LongTermGoalDetailSheets, {
  type ReviewDraft,
  type SharedPlanTimeAdjustment,
} from '../LongTermGoalDetailSheets';

function makePresentation(
  overrides: Partial<GoalPresentation> = {},
): GoalPresentation {
  return {
    headerTitle: '自主閱讀計畫',
    planWeekLabel: '第 2 週／共 2 週',
    weekProgressLabel: '本週完成 2／3 次',
    weekCompletedActual: 2,
    weekTarget: 3,
    weekTargetReached: false,
    weekExtra: 0,
    weekProgressNote: '還差 1 次到這週約定的節奏',
    progression: 'rhythm',
    targetReached: false,
    planState: 'active',
    categoryLabel: '學習與技能',
    heroPositionLabel: '第 2 週',
    heroTotalLabel: '共 2 週',
    heroPositionNote: null,
    heroMarkerFraction: 0.5,
    overallLabel: '2 / 6 次',
    overallPercent: 33,
    focusText: '先找到適合自己的閱讀節奏',
    nextText: '下一個里程碑：完成第 3 次',
    todayTitle: '今天的小步驟',
    todayAction: '自己選一本喜歡的書，閱讀 15 分鐘',
    preferredTimeWindow: 'before_bed',
    canCompleteToday: true,
    completionReason: 'available',
    sessionMinutes: 15,
    agreedTime: { value: 'after_dinner', label: '晚餐後' },
    supportsTimeWindow: true,
    sessionEvidence: { checkedInToday: false, weekSessionCount: 1 },
    childPlan: null,
    agreedReward: null,
    legacyReward: false,
    weekDays: [],
    weekSummary: '這週已閱讀 2 次。',
    nextReward: { threshold: 3, coin: 10 },
    stagedProgress: null,
    accumulationProgress: null,
    milestones: [],
    recentRecords: [],
    planPeriodLabel: '2026-08-03 至 2026-08-16（共 2 週）',
    completionConditionLabel: '完成 6 次',
    adjustableItemsLabel: '時間、書本、目標次數',
    finalRewardText: '兩週後一起回顧。',
    reviewTitle: '週末一起回顧',
    reviewPrompt: '這週哪個時間最適合閱讀？',
    ...overrides,
  };
}

function makeSharedPlan(
  overrides: Partial<SharedPlanTimeAdjustment> = {},
): SharedPlanTimeAdjustment {
  return {
    currentPreferredTime: 'before_bed',
    pending: false,
    submitting: false,
    error: null,
    submitted: false,
    onSubmit: jest.fn(async () => true),
    ...overrides,
  };
}

const EMPTY_DRAFT: ReviewDraft = {
  favoriteNote: '',
  preferredWindow: null,
  nextStep: null,
};

function renderReview(
  overrides: Partial<React.ComponentProps<typeof LongTermGoalDetailSheets>> = {},
) {
  const props: React.ComponentProps<typeof LongTermGoalDetailSheets> = {
    activeSheet: 'review',
    onClose: jest.fn(),
    onOpenSheet: jest.fn(),
    presentation: makePresentation(),
    completion: null,
    taskMinutes: 15,
    reviewDraft: EMPTY_DRAFT,
    adjustmentDraft: null,
    onSaveReviewDraft: jest.fn(),
    onSaveAdjustmentDraft: jest.fn(),
    onCorrectTimeWindow: jest.fn(async () => undefined),
    ...overrides,
  };
  return { ...render(<LongTermGoalDetailSheets {...props} />), props };
}

/** 走完「選晚餐後 → 選調整時間」這兩步，也就是 golden path 的前半。 */
function chooseAfterDinnerAndTime() {
  fireEvent.press(screen.getByRole('button', { name: '晚餐後' }));
  fireEvent.press(screen.getByRole('button', { name: '調整時間' }));
}

describe('P0-8M · 孩子回顧 → 送出換時段', () => {
  it('選了「晚餐後」＋「調整時間」之後，CTA 變成送給爸媽一起確認', () => {
    renderReview({ sharedPlanTimeAdjustment: makeSharedPlan() });

    expect(screen.getByRole('button', { name: '保留回顧草稿' })).toBeTruthy();
    chooseAfterDinnerAndTime();

    expect(screen.getByRole('button', { name: '送給爸媽一起確認' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '保留回顧草稿' })).toBeNull();
  });

  it('按下去會用孩子選的時段呼叫 onSubmit', () => {
    const onSubmit = jest.fn(async () => true);
    renderReview({ sharedPlanTimeAdjustment: makeSharedPlan({ onSubmit }) });

    chooseAfterDinnerAndTime();
    fireEvent.press(screen.getByRole('button', { name: '送給爸媽一起確認' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('after_dinner');
  });

  it('選到和現在一樣的時段就不送 —— 沒有差異的請求不該存在', () => {
    renderReview({
      sharedPlanTimeAdjustment: makeSharedPlan({ currentPreferredTime: 'before_bed' }),
    });

    fireEvent.press(screen.getByRole('button', { name: '睡前' }));
    fireEvent.press(screen.getByRole('button', { name: '調整時間' }));

    expect(screen.queryByRole('button', { name: '送給爸媽一起確認' })).toBeNull();
    expect(screen.getByRole('button', { name: '保留回顧草稿' })).toBeTruthy();
  });

  it('沒有共同計畫時（一般家長建立的長期任務）永遠只留草稿', () => {
    // sharedPlanTimeAdjustment 不傳 —— 這就是一般長期任務的樣子。
    renderReview();

    chooseAfterDinnerAndTime();

    expect(screen.queryByRole('button', { name: '送給爸媽一起確認' })).toBeNull();
    expect(screen.getByRole('button', { name: '保留回顧草稿' })).toBeTruthy();
  });

  it('下一步選的不是「調整時間」就不送，即使時段真的不一樣', () => {
    renderReview({ sharedPlanTimeAdjustment: makeSharedPlan() });

    fireEvent.press(screen.getByRole('button', { name: '晚餐後' }));
    fireEvent.press(screen.getByRole('button', { name: '維持現在安排' }));

    expect(screen.queryByRole('button', { name: '送給爸媽一起確認' })).toBeNull();
  });

  it('選「都適合／還不確定」不是一個可以寫進計畫的時段，不送', () => {
    renderReview({ sharedPlanTimeAdjustment: makeSharedPlan() });

    fireEvent.press(screen.getByRole('button', { name: '都適合' }));
    fireEvent.press(screen.getByRole('button', { name: '調整時間' }));

    expect(screen.queryByRole('button', { name: '送給爸媽一起確認' })).toBeNull();
  });

  it('已經有一筆等家長確認的請求時，不給第二次送出的入口', () => {
    renderReview({ sharedPlanTimeAdjustment: makeSharedPlan({ pending: true }) });

    chooseAfterDinnerAndTime();

    expect(screen.queryByRole('button', { name: '送給爸媽一起確認' })).toBeNull();
    expect(screen.getByText('已送給爸媽，等一起確認。')).toBeTruthy();
  });

  it('送出中不能再按 —— 按鈕進 busy 狀態', () => {
    const onSubmit = jest.fn(async () => true);
    renderReview({
      sharedPlanTimeAdjustment: makeSharedPlan({ submitting: true, onSubmit }),
    });

    chooseAfterDinnerAndTime();
    const cta = screen.getByRole('button', { name: '送給爸媽一起確認' });
    expect(cta.props.accessibilityState.busy).toBe(true);

    fireEvent.press(cta);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('送出成功後說的是「還沒生效」，不是「已更新」', () => {
    renderReview({ sharedPlanTimeAdjustment: makeSharedPlan({ submitted: true }) });

    expect(
      screen.getByText('已經告訴爸媽了。一起確認後，計畫才會更新。'),
    ).toBeTruthy();
    // 家長還沒確認，任何「已生效」的說法都是假的。
    expect(screen.queryByText(/已更新|已套用|已生效/)).toBeNull();
  });

  it('送出失敗時保留孩子剛剛的選擇，並顯示可以再試一次的訊息', () => {
    renderReview({
      sharedPlanTimeAdjustment: makeSharedPlan({ error: '網路不太穩，可以再試一次。' }),
    });

    chooseAfterDinnerAndTime();

    expect(screen.getByText('網路不太穩，可以再試一次。')).toBeTruthy();
    // 選擇沒有被清掉 —— 兩個選項都還在選中狀態，CTA 也還在。
    expect(
      screen.getByRole('button', { name: '晚餐後' }).props.accessibilityState.selected,
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: '調整時間' }).props.accessibilityState.selected,
    ).toBe(true);
    expect(screen.getByRole('button', { name: '送給爸媽一起確認' })).toBeTruthy();
  });

  it('非閱讀計畫不會出現時段題，也就送不出換時段請求', () => {
    renderReview({
      presentation: makePresentation({ progression: 'staged', supportsTimeWindow: false }),
      sharedPlanTimeAdjustment: makeSharedPlan(),
    });

    expect(screen.queryByRole('button', { name: '晚餐後' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: '調整進行時間' }));
    expect(screen.queryByRole('button', { name: '送給爸媽一起確認' })).toBeNull();
  });
});
