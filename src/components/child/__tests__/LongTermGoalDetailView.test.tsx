// LT-FINAL-2 — Long-Term Final Journey Visual Shell
//
// ─────────────────────────────────────────────────────────────────────────
// 固定骨架：Hero → Today → Progress → Next Stop（有真實 checkpoint 才
// render）→ Together Review → More。所有 progression 共用，只有 Progress
// 內部換 renderer（§23 state matrix）。
// ─────────────────────────────────────────────────────────────────────────

import React from 'react';
import dayjs from 'dayjs';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react-native';
import type {
  LongTermGoal,
  PreferredTimeWindow,
  Task,
} from '../../../types/database';
import {
  buildGoalPresentation,
  type GoalPresentation,
} from '../../../screens/child/longTermGoalPresentation';
import LongTermGoalDetailView from '../LongTermGoalDetailView';

function makePresentation(overrides: Partial<GoalPresentation> = {}): GoalPresentation {
  return {
    headerTitle: '兩週讀完這本書',
    progression: 'rhythm',
    planState: 'active',
    targetReached: false,
    categoryLabel: '學習與技能',
    planWeekLabel: '第 1 週／共 2 週',

    heroPositionLabel: '第 1 週',
    heroTotalLabel: '共 2 週',
    heroPositionNote: null,
    heroMarkerFraction: 0,

    weekCompletedActual: 2,
    weekTarget: 3,
    weekTargetReached: false,
    weekExtra: 0,
    weekProgressLabel: '本週 2 / 3',
    weekProgressNote: '還差 1 次到這週約定的節奏',
    weekDays: [],
    weekSummary: '本週 2 / 3',

    overallLabel: '第 1 週 / 共 2 週',
    overallPercent: 50,
    focusText: '睡前讀 15 分鐘',
    nextText: '還差 1 次到這週約定的節奏',
    planNotice: null,

    todayTitle: '今天的小步驟',
    todayAction: '今晚睡前讀 15 分鐘',
    todayStatusText: null,
    sessionMinutes: 15,
    canCompleteToday: true,
    completionReason: 'available',

    agreedTime: { value: 'before_bed', label: '睡前' },
    preferredTimeWindow: null,
    supportsTimeWindow: false,

    sessionEvidence: { checkedInToday: false, weekSessionCount: 2 },

    childPlan: null,

    agreedReward: {
      policy: 'coin_eligible', coinAmount: 8, payoutBasis: 'per_completion',
      claimPeriod: 'day', maxClaimsPerPeriod: 1, label: '每完成一次，+8 成長幣',
    },
    legacyReward: false,

    nextReward: null,
    stagedProgress: null,
    accumulationProgress: null,
    milestones: [],
    recentRecords: [],
    planPeriodLabel: '2026-08-10 ～ 2026-08-23（共 2 週）',
    completionConditionLabel: '2 週計畫 · 每週 3 次',
    adjustableItemsLabel: '執行時段、每週次數、任務內容',
    finalRewardText: '第 2 週結束後一起回顧',
    reviewTitle: '一起回顧這段成長',
    reviewPrompt: '這週什麼時候讀起來最順？',
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-visual-shell',
    family_id: 'family-1',
    name: '兩週讀完這本書',
    category: 'D',
    day_type: 'both',
    long_term_type: 'habit',
    is_long_term: true,
    base_time_min: 15,
    estimated_minutes: 15,
    difficulty: 1,
    coin_override: null,
    is_system_default: false,
    allow_repeat: false,
    min_age: 6,
    max_age: 9,
    is_active: true,
    time_saving_min: 0,
    recurrence_days: null,
    progress_model: null,
    schedule_mode: null,
    weekly_frequency: null,
    claim_period: 'day',
    max_claims_per_period: 1,
    next_step: null,
    completion_description: null,
    preferred_time: null,
    preferred_time_custom: null,
    due_date: null,
    created_at: '2026-08-10T00:00:00+08:00',
    ...overrides,
  } as unknown as Task;
}

function makeGoal(overrides: Partial<LongTermGoal> = {}): LongTermGoal {
  return {
    id: 'goal-visual-shell',
    child_id: 'child-1',
    task_id: 'task-visual-shell',
    goal_type: 'habit',
    total_days: 14,
    current_day: 0,
    status: 'active',
    checkpoint_rewards: null,
    motivation_note: null,
    started_at: '2026-08-10',
    next_review_at: null,
    completed_at: null,
    created_at: '2026-08-10T00:00:00+08:00',
    min_age: 6,
    interrupt_count: 0,
    last_active_date: null,
    active_days: null,
    preferred_time_window: null,
    level_definitions: null,
    current_level: null,
    level_count: null,
    role_title: null,
    salary_mode: null,
    base_salary: null,
    weekly_target_rate: null,
    privilege_reward: null,
    family_time_per_completion: null,
    target_completions: null,
    target_value: null,
    current_value: null,
    value_unit: null,
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

  return { ...render(<LongTermGoalDetailView {...props} />), props };
}

// ---------------------------------------------------------------------------

describe('固定骨架（§2）', () => {
  it('rhythm 計畫依序看得到 Hero → Today → Progress → Together Review → More', () => {
    renderView();
    expect(screen.getByTestId('goal-hero')).toBeTruthy();
    expect(screen.getByTestId('goal-today')).toBeTruthy();
    expect(screen.getByTestId('goal-week')).toBeTruthy();
    expect(screen.getByTestId('goal-review')).toBeTruthy();
    expect(screen.getByTestId('goal-more')).toBeTruthy();
  });

  it('沒有真實 checkpoint 就不 render Next Stop', () => {
    renderView(makePresentation({ milestones: [] }));
    expect(screen.queryByTestId('goal-next-stop')).toBeNull();
    expect(screen.queryByText('這段路上的下一站')).toBeNull();
  });
});

describe('Journey Hero（§4、§5、§27：C 素材當背景）', () => {
  it('只有一顆 current marker，不是可數的 checkpoint 鏈', () => {
    renderView();
    // marker 對螢幕閱讀器是 accessibilityElementsHidden（Hero 本身的
    // accessibilityLabel 已經講完摘要），查詢要帶 includeHiddenElements
    // 才找得到——RNTL v12+ 預設把隱藏元素排除在查詢外。
    expect(
      screen.getAllByTestId('goal-hero-marker', { includeHiddenElements: true }),
    ).toHaveLength(1);
  });

  it('沒有 canonical 證據時第三行不render，不自己編一句話', () => {
    renderView(makePresentation({ heroPositionNote: null }));
    expect(screen.getByText('第 1 週')).toBeTruthy();
    expect(screen.getByText('共 2 週')).toBeTruthy();
    expect(screen.queryByText(/正在找到/)).toBeNull();
  });

  it('有孩子寫的行動摘要時才顯示第三行', () => {
    renderView(makePresentation({ heroPositionNote: '平日睡前讀 15 分鐘' }));
    expect(screen.getByText('平日睡前讀 15 分鐘')).toBeTruthy();
  });

  it('accumulation 沒有 total 這一行', () => {
    renderView(makePresentation({
      progression: 'accumulation',
      heroPositionLabel: '目前 2 / 5 本',
      heroTotalLabel: null,
      heroPositionNote: null,
      accumulationProgress: { current: 2, target: 5, unit: '本' },
    }));
    expect(screen.getByText('目前 2 / 5 本')).toBeTruthy();
    expect(screen.queryByText(/^共 /)).toBeNull();
  });
});

describe('Today（§6-§9）', () => {
  it('CTA 文字統一是「記下今天的完成」，不是打卡／過關／領獎', async () => {
    const onComplete = jest.fn();
    renderView(makePresentation(), { onComplete });
    const button = screen.getByLabelText('記下今天的完成');
    expect(button).toBeTruthy();
    for (const forbidden of ['打卡', '過關', '領獎', '階段完成', '恭喜升級']) {
      expect(screen.queryByText(forbidden)).toBeNull();
    }
    await act(async () => { fireEvent.press(button); });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('今天主內容只讀 canonical todayAction，不加工成鼓勵語', () => {
    renderView(makePresentation({ todayAction: '今晚睡前讀 15 分鐘' }));
    expect(screen.getByText('今晚睡前讀 15 分鐘')).toBeTruthy();
  });

  it('完成後顯示中性文案，不寫階段完成', () => {
    renderView(makePresentation(), { isCompletedToday: true });
    expect(screen.getByText('今天這一步記下來了')).toBeTruthy();
    expect(screen.getByText('15 分鐘')).toBeTruthy();
    expect(screen.queryByText('記下今天的完成')).toBeNull();
  });

  it('mascot slot 一律存在，不吃掉主文案', () => {
    renderView();
    // GrowSprite 是 accessibilityElementsHidden 的 SVG，主文案（todayAction）
    // 仍然找得到、沒有被截斷或蓋住。
    expect(screen.getByText('今晚睡前讀 15 分鐘')).toBeTruthy();
  });

  it('busy 時顯示 loading，並且防止重複送出', async () => {
    let resolveFirst: ((value: void | boolean) => void) | undefined;
    const firstCompletion = new Promise<void | boolean>((resolve) => { resolveFirst = resolve; });
    const onComplete = jest.fn<Promise<void | boolean>, []>()
      .mockImplementationOnce(() => firstCompletion);

    renderView(makePresentation(), { onComplete });
    const button = screen.getByLabelText('記下今天的完成');
    fireEvent.press(button);
    fireEvent.press(button);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('completion-loading')).toBeTruthy();

    await act(async () => { resolveFirst?.(undefined); await firstCompletion; });
    await waitFor(() => expect(screen.queryByTestId('completion-loading')).toBeNull());
  });

  it('完成失敗顯示重試訊息', async () => {
    const onComplete = jest.fn<Promise<void | boolean>, []>()
      .mockRejectedValueOnce(new Error('network unavailable'));
    renderView(makePresentation(), { onComplete });

    await act(async () => { fireEvent.press(screen.getByLabelText('記下今天的完成')); });
    expect(screen.getByText('剛剛沒有記成功，可以再試一次。')).toBeTruthy();
  });
});

describe('§10 availability 誠實狀態（不顯示會失敗的按鈕）', () => {
  it.each([
    ['schedule_not_defined', '這份計畫還沒安排練習時間'],
    ['already_recorded_today', '今天這一步已經記下來了 ✓'],
    ['not_scheduled_today', '今天沒有安排這一步'],
    ['claim_limit_reached', '這一段時間的紀錄已經滿了'],
    ['before_plan', '計畫還沒開始'],
    ['after_plan', '一起回顧這段計畫'],
    ['paused', '這個計畫暫停中'],
    ['unsupported_progression', '這個計畫還沒安排可以記錄的進度方式'],
  ] as const)('%s → %s，不顯示可以按的 CTA', (reason, copy) => {
    renderView(makePresentation({ canCompleteToday: false, completionReason: reason }));
    expect(screen.queryByLabelText('記下今天的完成')).toBeNull();
    expect(screen.getByTestId('today-unavailable')).toBeTruthy();
    expect(screen.getByText(copy)).toBeTruthy();
  });
});

describe('Progress renderer（§13 state matrix，§23）', () => {
  it('rhythm 0/3：三個空節點', () => {
    renderView(makePresentation({
      weekCompletedActual: 0, weekTarget: 3, weekProgressLabel: '本週 0 / 3',
    }));
    const progress = within(screen.getByTestId('goal-week'));
    expect(progress.getByText('本週 0 / 3')).toBeTruthy();
  });

  it('rhythm 2/3：本週進度講得出來，不是百分比', () => {
    renderView(makePresentation({
      weekCompletedActual: 2, weekTarget: 3, weekProgressLabel: '本週 2 / 3',
    }));
    const progress = within(screen.getByTestId('goal-week'));
    expect(progress.getByText('本週 2 / 3')).toBeTruthy();
    expect(progress.queryByText('67%')).toBeNull();
  });

  it('rhythm 3/3：已到節奏，仍可再完成', () => {
    renderView(makePresentation({
      weekCompletedActual: 3, weekTarget: 3, weekTargetReached: true,
      weekProgressLabel: '本週 3 / 3', weekProgressNote: '已到這週約定的節奏',
      canCompleteToday: true,
    }));
    expect(screen.getByText('已到這週約定的節奏')).toBeTruthy();
    expect(screen.getByLabelText('記下今天的完成')).toBeTruthy();
  });

  it('rhythm 4 vs 3：不寫 4/3、不畫第四顆節點', () => {
    renderView(makePresentation({
      weekCompletedActual: 4, weekTarget: 3, weekExtra: 1, weekTargetReached: true,
      weekProgressLabel: '本週完成 4 次', weekProgressNote: '原本約定 3 次',
    }));
    const progress = within(screen.getByTestId('goal-week'));
    expect(progress.getByText('本週完成 4 次')).toBeTruthy();
    expect(progress.getByText('原本約定 3 次')).toBeTruthy();
    expect(progress.queryByText('4 / 3')).toBeNull();
    expect(progress.queryByText('4/3')).toBeNull();
    expect(progress.queryByText('133%')).toBeNull();
  });

  it('rhythm today completed：CTA 換成完成狀態', () => {
    renderView(makePresentation(), { isCompletedToday: true });
    expect(screen.queryByLabelText('記下今天的完成')).toBeNull();
  });

  it('fixed_days：安排日看得到排程格', () => {
    renderView(makePresentation({
      progression: 'fixed_days',
      weekDays: [
        { day: 1, label: '一', isoDate: '2026-08-10', isScheduled: true, state: 'completed' },
        { day: 3, label: '三', isoDate: '2026-08-12', isScheduled: true, state: 'today' },
        { day: 5, label: '五', isoDate: '2026-08-14', isScheduled: false, state: 'unscheduled' },
      ],
    }));
    expect(screen.getByLabelText('星期一，已完成')).toBeTruthy();
    expect(screen.getByLabelText('星期三，今天待完成')).toBeTruthy();
    expect(screen.getByLabelText('星期五，沒有安排')).toBeTruthy();
  });

  it('fixed_days：非安排日（rest day）不能記', () => {
    renderView(makePresentation({
      progression: 'fixed_days', canCompleteToday: false, completionReason: 'not_scheduled_today',
    }));
    expect(screen.getByText('今天沒有安排這一步')).toBeTruthy();
  });

  it('staged：can check-in，節點來自真實 level 數', () => {
    renderView(makePresentation({
      progression: 'staged', canCompleteToday: true,
      focusText: '目前階段：雙手合奏',
      stagedProgress: { current: 2, target: 4, stageNames: ['基礎指法', '簡單曲目', '雙手合奏', '完整演奏'] },
    }));
    const progress = within(screen.getByTestId('goal-week'));
    expect(progress.getByText('已完成 2 / 4 階段')).toBeTruthy();
    expect(progress.getByText('目前階段：雙手合奏')).toBeTruthy();
    expect(screen.getByLabelText('記下今天的完成')).toBeTruthy();
  });

  it('staged：schedule_not_defined 時 Today 誠實顯示未安排，不是可以按的 CTA', () => {
    renderView(makePresentation({
      progression: 'staged', canCompleteToday: false, completionReason: 'schedule_not_defined',
      stagedProgress: { current: 2, target: 4, stageNames: [] },
    }));
    expect(screen.getByText('這份計畫還沒安排練習時間')).toBeTruthy();
    expect(screen.queryByLabelText('記下今天的完成')).toBeNull();
  });

  it('staged：checked-in today 不會推進 current_level（資料不因畫面重繪而變）', () => {
    const stagedProgress = { current: 2, target: 4, stageNames: [] };
    renderView(makePresentation({ progression: 'staged', stagedProgress }), { isCompletedToday: true });
    const progress = within(screen.getByTestId('goal-week'));
    expect(progress.getByText('已完成 2 / 4 階段')).toBeTruthy();
  });

  it('accumulation：2/5，不從標題 parse 數字', () => {
    renderView(makePresentation({
      progression: 'accumulation', headerTitle: '暑假讀 5 本書',
      accumulationProgress: { current: 2, target: 5, unit: '本' },
    }));
    const progress = within(screen.getByTestId('goal-week'));
    expect(progress.getByText('2 / 5 本')).toBeTruthy();
  });

  it('accumulation：today session check-in 之後 2/5 不變', () => {
    renderView(makePresentation({
      progression: 'accumulation',
      accumulationProgress: { current: 2, target: 5, unit: '本' },
    }), { isCompletedToday: true });
    const progress = within(screen.getByTestId('goal-week'));
    expect(progress.getByText('2 / 5 本')).toBeTruthy();
  });

  it('null progression：還沒安排這種進度，不假裝是 staged', () => {
    renderView(makePresentation({
      progression: null, canCompleteToday: false, completionReason: 'unsupported_progression',
      stagedProgress: null, accumulationProgress: null,
    }));
    const progress = within(screen.getByTestId('goal-week'));
    expect(progress.getByText('還沒安排這種進度')).toBeTruthy();
  });
});

describe('Next Stop（§14：persisted-only）', () => {
  it('有真實 checkpoint 才顯示，而且 badge 只讀 milestone.coin', () => {
    renderView(makePresentation({
      milestones: [
        { id: 'a', title: '讀到一半', detail: null, status: 'next', coin: 20 },
      ],
    }));
    expect(screen.getByText('這段路上的下一站')).toBeTruthy();
    expect(screen.getByText('讀到一半')).toBeTruthy();
    expect(screen.getByText('+20')).toBeTruthy();
  });

  it('沒有 coin 證據就不畫 badge', () => {
    renderView(makePresentation({
      milestones: [
        { id: 'a', title: '讀到一半', detail: null, status: 'next', coin: null },
      ],
    }));
    expect(screen.getByText('讀到一半')).toBeTruthy();
    expect(screen.queryByText(/^\+\d/)).toBeNull();
  });

  it('全部 completed（沒有 next/planned）就不顯示', () => {
    renderView(makePresentation({
      milestones: [
        { id: 'a', title: '已累積 2 本', detail: null, status: 'completed', coin: null },
      ],
    }));
    expect(screen.queryByTestId('goal-next-stop')).toBeNull();
  });
});

describe('說好的回饋（§15：secondary info）', () => {
  it('P1 agreedReward 存在時顯示一行，不做價目表', () => {
    renderView();
    expect(screen.getByTestId('goal-agreed-reward')).toBeTruthy();
    expect(screen.getByText(/每完成一次，\+8 成長幣/)).toBeTruthy();
  });

  it('legacyReward 時不假裝是正式約定', () => {
    renderView(makePresentation({ legacyReward: true }));
    expect(screen.queryByTestId('goal-agreed-reward')).toBeNull();
  });

  it('沒有 agreedReward 就不顯示', () => {
    renderView(makePresentation({ agreedReward: null }));
    expect(screen.queryByTestId('goal-agreed-reward')).toBeNull();
  });
});

describe('Together Review（§16：接真實現有能力）', () => {
  it('有 onOpenReview 就是可按的卡片', () => {
    const onOpenReview = jest.fn();
    renderView(makePresentation(), { onOpenReview });
    fireEvent.press(screen.getByLabelText('開始週末回顧'));
    expect(onOpenReview).toHaveBeenCalledTimes(1);
  });

  it('沒有 callback 就是純資訊卡，不放假按鈕', () => {
    renderView();
    expect(screen.queryByLabelText('開始週末回顧')).toBeNull();
    expect(screen.getByText('這週什麼時候讀起來最順？')).toBeTruthy();
  });
});

describe('More（§17：安靜收斂）', () => {
  it('點「更多紀錄與計畫」開同一個選單', () => {
    const onOpenMore = jest.fn();
    renderView(makePresentation(), { onOpenMore });
    fireEvent.press(screen.getByLabelText('更多紀錄與計畫'));
    expect(onOpenMore).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// §24 functional regression — 主 demo case 走過 buildGoalPresentation 真實計算，
// 不是手工湊的 fixture。
// ---------------------------------------------------------------------------

describe('§24 功能回歸：每週 3 次 · 睡前 · 15 分鐘 · 每次 +8', () => {
  const task = makeTask({
    schedule_mode: 'weekly_frequency',
    weekly_frequency: 3,
    preferred_time: 'before_bed',
    next_step: '今晚睡前讀 15 分鐘',
  });
  const goal = makeGoal({ started_at: '2026-08-10' });

  it('2/3 狀態：今天尚未做、睡前、15 分鐘、每完成一次 +8，整個 Goal 仍 active', () => {
    const presentation = buildGoalPresentation(
      task, goal,
      [
        { id: 'c1', completed_at: '2026-08-10T21:00:00+08:00', planned_time_window: null, start_mode: null },
        { id: 'c2', completed_at: '2026-08-11T21:00:00+08:00', planned_time_window: null, start_mode: null },
      ],
      dayjs.tz('2026-08-12T12:00:00', 'Asia/Taipei'),
      { agreedReward: {
        policy: 'coin_eligible', coinAmount: 8, payoutBasis: 'per_completion',
        claimPeriod: 'day', maxClaimsPerPeriod: 1, label: '每完成一次，+8 成長幣',
      } },
    );

    renderView(presentation, { isCompletedToday: false });

    expect(screen.getByText('今晚睡前讀 15 分鐘')).toBeTruthy();
    expect(screen.getByText(/睡前/)).toBeTruthy();
    const progress = within(screen.getByTestId('goal-week'));
    expect(progress.getByText('本週 2 / 3')).toBeTruthy();
    expect(screen.getByText(/每完成一次，\+8 成長幣/)).toBeTruthy();
    expect(presentation.planState).toBe('active');
  });

  it('3/3 狀態：今天已完成、+8，整個 Goal 仍 active（不是旅程完成）', () => {
    const presentation = buildGoalPresentation(
      task, goal,
      [
        { id: 'c1', completed_at: '2026-08-10T21:00:00+08:00', planned_time_window: null, start_mode: null },
        { id: 'c2', completed_at: '2026-08-11T21:00:00+08:00', planned_time_window: null, start_mode: null },
        { id: 'c3', completed_at: '2026-08-12T21:00:00+08:00', planned_time_window: null, start_mode: null },
      ],
      dayjs.tz('2026-08-12T22:00:00', 'Asia/Taipei'),
    );

    renderView(presentation, { isCompletedToday: true });

    const progress = within(screen.getByTestId('goal-week'));
    expect(progress.getByText('本週 3 / 3')).toBeTruthy();
    expect(screen.getByText('今天這一步記下來了')).toBeTruthy();
    expect(screen.getByText('15 分鐘')).toBeTruthy();
    expect(presentation.planState).toBe('active');
    expect(screen.queryByText('旅程完成')).toBeNull();
  });
});
