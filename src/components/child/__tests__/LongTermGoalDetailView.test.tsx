import React from 'react';
import dayjs from 'dayjs';
import { StyleSheet } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react-native';
import { Colors } from '../../../constants/colors';
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

const TRUSTED_MILESTONES: GoalPresentation['milestones'] = [
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
  // 只放真實 / 持久化的節點。合成的「一起回顧」屬於 Together Review，
  // mapper 已經不會產出這種列，fixture 也不該再假裝它存在。
  {
    id: 'checkpoint-10',
    title: '完成第 10 次閱讀',
    detail: null,
    status: 'upcoming',
  },
];

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
    goalKind: 'habit',
    progression: 'weekly_rhythm',
    planState: 'active',
    categoryLabel: '學習與技能',
    overallLabel: '1 / 20 次',
    overallPercent: 5,
    focusText: '第一週：先找到適合自己的閱讀節奏',
    nextText: '今天繼續就好，已完成的閱讀都會保留',
    planNotice: null,
    todayTitle: '今天的小步驟',
    todayAction: '自己選一本喜歡的書，閱讀 15 分鐘',
    todayStatusText: null,
    preferredTimeWindow: 'after_dinner',
    canCompleteToday: true,
    supportsPreferredTimeWindow: true,
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
    nextReward: null,
    milestones: [],
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
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-visual-state',
    family_id: 'family-1',
    name: '自主閱讀計畫',
    category: 'D',
    day_type: 'custom',
    long_term_type: 'habit',
    is_long_term: true,
    base_time_min: 15,
    difficulty: 1,
    coin_override: null,
    is_system_default: false,
    allow_repeat: false,
    min_age: 6,
    max_age: 9,
    is_active: true,
    time_saving_min: 0,
    recurrence_days: [1, 2, 3, 4, 5],
    due_date: null,
    created_at: '2026-07-27T00:00:00+08:00',
    ...overrides,
  };
}

function makeGoal(overrides: Partial<LongTermGoal> = {}): LongTermGoal {
  return {
    id: 'goal-visual-state',
    child_id: 'child-1',
    task_id: 'task-visual-state',
    goal_type: 'habit',
    total_days: 20,
    current_day: 0,
    status: 'active',
    checkpoint_rewards: null,
    motivation_note: null,
    started_at: '2026-07-27',
    next_review_at: null,
    completed_at: null,
    created_at: '2026-07-27T00:00:00+08:00',
    min_age: 6,
    interrupt_count: 0,
    last_active_date: null,
    active_days: [1, 2, 3, 4, 5],
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

/** Hero 小徑對讀屏是隱藏的，查詢它得明講要看隱藏節點。 */
const HIDDEN = { includeHiddenElements: true } as const;

function journeyMarkers() {
  return screen.getAllByTestId('goal-journey-marker', HIDDEN);
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
  it.each([
    ['weekly rhythm', { progression: 'weekly_rhythm' as const }, '本週 1 / 5'],
    ['fixed days', { progression: 'fixed_days' as const }, '完成'],
    ['staged skill', { progression: 'staged_skill' as const }, '1 / 20 次'],
    ['accumulation', { progression: 'accumulation' as const }, '1 / 20 次'],
    ['challenge', { progression: 'challenge' as const }, '1 / 20 次'],
    ['unplanned', { progression: null }, '尚未安排'],
  ])(
    'uses the shared ordered shell for %s progression',
    (_name, overrides, progressText) => {
      renderView(makePresentation(overrides));

      for (const testID of [
        'goal-current-position',
        'goal-today-section',
        'goal-progress-section',
        'goal-next-stop-section',
        'goal-review-section',
        'goal-more',
      ]) {
        expect(screen.getByTestId(testID)).toBeTruthy();
      }

      const content = screen.getByTestId('goal-shell');
      expect(
        content?.children.map(
          (child: { props: { testID?: string } }) => child.props.testID,
        ),
      ).toEqual([
        'goal-current-position',
        'goal-today-section',
        'goal-progress-section',
        'goal-next-stop-section',
        'goal-review-section',
        'goal-more',
      ]);

      const progress = within(screen.getByTestId('goal-progress'));
      expect(progress.getByText(progressText)).toBeTruthy();
      expect(screen.queryByTestId('goal-rewards')).toBeNull();
    },
  );

  /*
    Hero 只回答一個問題：「我現在走到哪裡？」

    類別 → 目前位置 → 一句目前狀態，加一行安靜的期間。今天做什麼是 Today 的事，
    本週完成幾次是 Progress 的事，Hero 不再把它們各講一次。
  */
  it('answers only where the plan currently is', () => {
    renderView();

    const hero = within(screen.getByTestId('goal-hero'));
    expect(hero.getByText('學習與技能')).toBeTruthy();
    expect(hero.getByText('第 1 週')).toBeTruthy();
    expect(hero.getByText('第一週：先找到適合自己的閱讀節奏')).toBeTruthy();
    expect(hero.getByText('共 4 週')).toBeTruthy();

    // 大字已經是「第 1 週」，整串 planWeekLabel 會把同一件事講兩次。
    expect(hero.queryByText('第 1 週／共 4 週')).toBeNull();
    expect(
      hero.queryByText('今天繼續就好，已完成的閱讀都會保留'),
    ).toBeNull();
    expect(hero.queryByText('本週完成 1／5 次')).toBeNull();
    expect(screen.getByTestId('goal-hero').props.accessibilityLabel).toBeUndefined();
    expect(screen.queryByText('5%')).toBeNull();
    expect(screen.queryByText(/下一站/)).toBeNull();
  });

  /*
    原本 Hero 有一條 overallPercent 進度條。對節奏型計畫那是假的終點進度：
    「一週三次」沒有「走完幾成」這件事，那個百分比只是「排得下幾次」。
  */
  it('does not draw a terminal progress bar for a weekly rhythm', () => {
    renderView(makePresentation({ progression: 'weekly_rhythm' }));

    const hero = within(screen.getByTestId('goal-hero'));
    expect(hero.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByTestId('goal-progress-fill')).toBeNull();
    expect(hero.queryByText('1 / 20 次')).toBeNull();
    expect(hero.queryByText('本週 1 / 5')).toBeNull();
  });

  it('shows the staged-skill current stage without repeating the level timeline', () => {
    const presentation = buildGoalPresentation(
      makeTask({ name: '學鋼琴', long_term_type: 'skill', recurrence_days: null }),
      makeGoal({
        goal_type: 'skill',
        active_days: null,
        checkpoint_rewards: null,
        current_level: 2,
        level_count: 4,
        level_definitions: [
          { name: '基礎指法' },
          { name: '簡單曲目' },
          { name: '雙手合奏' },
          { name: '完整演奏' },
        ],
      }),
      [],
      dayjs('2026-07-30T12:00:00+08:00'),
    );

    renderView(presentation);

    const hero = within(screen.getByTestId('goal-hero'));
    expect(hero.getByText('第 3 階段')).toBeTruthy();
    expect(hero.getByText('目前練習：雙手合奏')).toBeTruthy();
    expect(hero.getByText('共 4 階段')).toBeTruthy();

    // 完整的階段時間軸屬於 Progress，Hero 不再畫一次。
    expect(hero.queryByText('基礎指法')).toBeNull();
    expect(hero.queryByText('完整演奏')).toBeNull();
    expect(hero.queryByTestId('goal-milestones')).toBeNull();
  });

  it.each([
    ['weekly rhythm', { progression: 'weekly_rhythm' as const }],
    ['fixed days', { progression: 'fixed_days' as const }],
    ['staged skill', { progression: 'staged_skill' as const }],
    ['accumulation', { progression: 'accumulation' as const }],
    ['challenge', { progression: 'challenge' as const }],
    ['unplanned', { progression: null }],
  ])(
    'draws one journey marker and no countable path nodes for %s',
    (_name, overrides) => {
      renderView(makePresentation(overrides));

      // 小徑上多幾顆圓點就會被讀成「四個階段」——那是畫面自己發明的資料。
      expect(journeyMarkers()).toHaveLength(1);
      // 小徑是裝飾，讀屏不該逐段唸它；意思由 Hero 的文字負責。
      expect(
        screen.getByTestId('goal-journey-path', HIDDEN).props
          .accessibilityElementsHidden,
      ).toBe(true);
    },
  );

  it('advances the journey marker with the plan state, not with completion counts', () => {
    const markerX = () => Number(journeyMarkers()[0].props.cx);
    const view = renderView(makePresentation({ planState: 'upcoming' }));
    const show = (presentation: GoalPresentation) =>
      view.rerender(
        <LongTermGoalDetailView {...view.props} presentation={presentation} />,
      );

    const notStarted = markerX();
    show(makePresentation({ planState: 'active' }));
    const onTheWay = markerX();
    show(makePresentation({ planState: 'completed' }));
    const arrived = markerX();

    expect(notStarted).toBeLessThan(onTheWay);
    expect(onTheWay).toBeLessThan(arrived);

    // 完成次數變多不會讓 marker 往前——它是位置，不是進度條。
    show(makePresentation({ planState: 'active', overallPercent: 95 }));
    expect(markerX()).toBe(onTheWay);
  });

  /*
    Today 是「旅途中今天要走的一步」，不是待辦清單的一列。這一組守的是那個差別
    在畫面上還在：主要文案原封不動來自 presentation、旁邊那句補充只在真的有一步
    可走時才說、而且整張卡不會混進獎勵／連續天數那種語彙。
  */
  describe('today step card', () => {
    it('shows the structured action verbatim and adds no coaching copy of its own', () => {
      renderView(makePresentation({
        todayAction: '雙手合奏',
        canCompleteToday: true,
      }));

      const today = within(screen.getByTestId('goal-today'));
      expect(today.getByText('雙手合奏')).toBeTruthy();
      // 視覺變好看不能偷渡成 AI coaching：沒有資料的建議一個字都不能生。
      expect(today.queryByText(/慢慢|不用一次|試著|建議/)).toBeNull();
    });

    it('adds the one-step microcopy only when there is a step to take today', () => {
      renderView(makePresentation({ canCompleteToday: true }));
      expect(screen.getByText('今天只走這一步')).toBeTruthy();

      renderView(makePresentation({ canCompleteToday: false }));
      expect(screen.queryByText('今天只走這一步')).toBeNull();
    });

    it('drops the one-step microcopy once today is already recorded', () => {
      renderView(
        makePresentation({ canCompleteToday: true }),
        { isCompletedToday: true },
      );

      expect(screen.queryByText('今天只走這一步')).toBeNull();
    });

    it('keeps the mascot slot decorative and out of the accessibility tree', () => {
      renderView();

      // 對讀屏隱藏——它是氣氛，不是資訊。
      expect(screen.queryByTestId('today-mascot-slot')).toBeNull();
      const slot = screen.getByTestId('today-mascot-slot', HIDDEN);
      expect(slot.props.importantForAccessibility).toBe('no-hide-descendants');
      // 絕對定位：沒有 mascot 時版面照樣成立，也不從 todayAction 身上拿寬度。
      const slotStyle = StyleSheet.flatten(slot.props.style);
      expect(slotStyle.position).toBe('absolute');
      expect(slotStyle.width).toBeGreaterThanOrEqual(48);
      expect(slotStyle.width).toBeLessThanOrEqual(72);
    });

    it('keeps reward and streak vocabulary out of the card', () => {
      renderView(makePresentation({ canCompleteToday: true }));

      const today = within(screen.getByTestId('goal-today'));
      for (const word of ['成長幣', '獎勵', '連續', '天數', '打卡', '領取', '過關']) {
        expect(today.queryByText(new RegExp(word))).toBeNull();
      }
    });

    /*
      Today 有兩種樣貌，共用同一套版面：孩子今天可以自己記錄的，和正在這個
      階段、要家長確認的。差別只在最後那一層是 CTA 還是一句說明——**不是**
      一個有 CTA、一個有一顆長得像 CTA 的灰方塊。
    */
    /*
      排版可以把 presentation 產生的固定句型拆成「前導語 + 主要內容」，
      好讓縮小看的時候先讀到「雙手合奏」而不是整句。

      拆的是**顯示**，不是資料：todayAction 的值與 precedence 沒動，讀屏聽到的
      仍然是完整原句。
    */
    it('splits the fixed stage prefix for display and keeps the action intact', () => {
      renderView(makePresentation({
        progression: 'staged_skill',
        planState: 'active',
        canCompleteToday: false,
        todayAction: '這一階段先練習：雙手合奏',
      }));

      const today = within(screen.getByTestId('goal-today'));
      expect(today.getByText('這一階段先練習')).toBeTruthy();
      expect(today.getByText('雙手合奏')).toBeTruthy();
      expect(today.queryByText('這一階段先練習：雙手合奏')).toBeNull();
      // 讀屏仍然聽到完整原句。
      expect(screen.getByLabelText('這一階段先練習：雙手合奏')).toBeTruthy();
    });

    it.each([
      ['今天先讀 15 分鐘'],
      ['自己選一本喜歡的書，閱讀 15 分鐘'],
      // 有冒號但前綴不在既有 presentation 句型裡：整句照登，不亂拆。
      ['先準備練習材料：鉛筆和譜'],
    ])('shows %s as one whole title when no known prefix matches', (todayAction) => {
      renderView(makePresentation({ todayAction }));

      const today = within(screen.getByTestId('goal-today'));
      expect(today.getByText(todayAction)).toBeTruthy();
    });

    /*
      這條是 tripwire：拆句用的前綴是抄 presentation 的固定句型。哪天那邊改了
      措辭，這裡會紅，而不是默默退回顯示整句。
    */
    it('keeps the display split in step with the real staged-skill action', () => {
      const presentation = buildGoalPresentation(
        makeTask({ name: '學鋼琴', long_term_type: 'skill', recurrence_days: null }),
        makeGoal({
          goal_type: 'skill',
          active_days: null,
          checkpoint_rewards: null,
          current_level: 2,
          level_count: 4,
          level_definitions: [
            { name: '基礎指法' },
            { name: '簡單曲目' },
            { name: '雙手合奏' },
            { name: '完整演奏' },
          ],
        }),
        [],
        dayjs('2026-07-30T12:00:00+08:00'),
      );

      renderView(presentation);

      const today = within(screen.getByTestId('goal-today'));
      expect(today.getByText('這一階段先練習')).toBeTruthy();
      expect(today.getByText('雙手合奏')).toBeTruthy();
      expect(screen.getByLabelText(presentation.todayAction)).toBeTruthy();
    });

    it('makes the step title dominate its lead-in', () => {
      renderView(makePresentation({
        progression: 'staged_skill',
        planState: 'active',
        canCompleteToday: false,
        todayAction: '這一階段先練習：雙手合奏',
      }));

      const titleSize = StyleSheet.flatten(
        screen.getByText('雙手合奏').props.style,
      ).fontSize;
      const leadSize = StyleSheet.flatten(
        screen.getByText('這一階段先練習').props.style,
      ).fontSize;

      // 縮小看的時候要先讀到主要內容，不是先讀到前導語。
      expect(titleSize).toBeGreaterThan(leadSize * 1.6);
    });

    it('gives the current step a visual anchor with real weight', () => {
      renderView();

      const anchor = screen.getByTestId('today-step-anchor', HIDDEN);
      const anchorStyle = StyleSheet.flatten(anchor.props.style);
      // 32px 的小圓看起來就是 list icon；這一格要撐得起構圖。
      // 只守下限——上限交給 mockup，別再用細碎的數字把設計綁死。
      expect(anchorStyle.width).toBeGreaterThanOrEqual(56);
      // 它只負責構圖，不表達任何 domain 資料。
      expect(anchor.props.accessibilityElementsHidden).toBe(true);
    });

    it('gives a parent-confirmed stage a full composition without a fake CTA', () => {
      renderView(makePresentation({
        progression: 'staged_skill',
        planState: 'active',
        canCompleteToday: false,
        todayTitle: '目前階段',
        todayAction: '這一階段先練習：雙手合奏',
        todayStatusText: '這個階段由家長確認完成',
      }));

      const today = within(screen.getByTestId('goal-today'));
      // 主要文案照樣是全卡最強的一句（顯示上拆成前導語 + 主標）
      expect(today.getByText('雙手合奏')).toBeTruthy();
      // 微文案換成階段版本，構圖仍然完整
      expect(screen.getByText('現在先走這一步')).toBeTruthy();
      expect(screen.queryByText('今天只走這一步')).toBeNull();
      // 一句柔和說明，不是假 CTA
      expect(today.getByText('這一階段完成後，再和家人一起確認')).toBeTruthy();
      expect(screen.queryByLabelText('記下今天的完成')).toBeNull();
      expect(screen.queryByText('記下今天的完成')).toBeNull();
    });

    it('keeps every other plan state on its own status copy', () => {
      renderView(makePresentation({
        progression: 'weekly_rhythm',
        planState: 'paused',
        canCompleteToday: false,
        todayStatusText: '這個計畫暫停中',
      }));

      const today = within(screen.getByTestId('goal-today'));
      expect(today.getByText('這個計畫暫停中')).toBeTruthy();
      // 階段版文案只屬於 staged_skill，不能外溢到暫停／未開始／休息日。
      expect(screen.queryByText('這一階段完成後，再和家人一起確認')).toBeNull();
      expect(screen.queryByText('現在先走這一步')).toBeNull();
    });

    it('opens the explanation inline instead of as another card', () => {
      renderView();

      const toggle = screen.getByLabelText('展開小步驟說明');
      // 一句可以點的話，寬度只有一句話那麼寬——不是撐滿一整列的 settings row。
      expect(StyleSheet.flatten(toggle.props.style).alignSelf).toBe('flex-start');
      expect(screen.getByText('看看這一步怎麼算完成')).toBeTruthy();

      fireEvent.press(toggle);
      expect(screen.getByText(/先完成今天最小的一步/)).toBeTruthy();
      // 展開的內容靠細線縮排分層，不再是插進卡裡的另一張米色卡。
      const bodyStyle = StyleSheet.flatten(
        screen.getByTestId('today-explanation').props.style,
      );
      expect(bodyStyle.backgroundColor).toBeUndefined();
      expect(bodyStyle.borderLeftWidth).toBeGreaterThan(0);

      fireEvent.press(screen.getByLabelText('收合小步驟說明'));
      expect(screen.queryByText(/先完成今天最小的一步/)).toBeNull();
      expect(screen.queryByTestId('today-explanation')).toBeNull();
    });

    it('keeps the recorded state calm instead of celebratory', () => {
      renderView(makePresentation(), {
        isCompletedToday: true,
        onOpenRecord: jest.fn(),
      });

      const today = within(screen.getByTestId('goal-today'));
      expect(today.getByText('今天已完成 15 分鐘')).toBeTruthy();
      expect(today.getByText('查看紀錄')).toBeTruthy();
      expect(today.getByText('需要更正')).toBeTruthy();
      expect(today.queryByText(/恭喜|太棒|完成挑戰|獎盃|連續/)).toBeNull();
    });
  });

  /*
    節奏卡上的葉子直接對應 weekTarget / weekCompleted。這一條守的是「不要多長
    出一顆」——畫面上每一顆節點都得有資料撐著。
  */
  it('draws exactly as many rhythm nodes as the week actually plans', () => {
    renderView(makePresentation({
      progression: 'weekly_rhythm',
      weekCompleted: 2,
      weekTarget: 3,
    }));

    const trail = screen.getByTestId('goal-rhythm-trail', HIDDEN);
    expect(trail.children).toHaveLength(3);

    const progress = within(screen.getByTestId('goal-progress'));
    expect(progress.getByText('本週 2 / 3')).toBeTruthy();
  });

  it('moves the plan milestones into their own next-stop section', () => {
    renderView(makePresentation({ milestones: TRUSTED_MILESTONES }));

    const nextStop = within(screen.getByTestId('goal-next-stop-section'));
    expect(nextStop.getByText('這段路上的下一站')).toBeTruthy();
    expect(nextStop.getByTestId('goal-milestones')).toBeTruthy();
    // 節點搬家了，Progress 不該再留一份。
    expect(
      within(screen.getByTestId('goal-progress')).queryByTestId('goal-milestones'),
    ).toBeNull();
  });

  it('uses product icons instead of emoji for formal section headings', () => {
    renderView();

    for (const heading of [
      '今天的小步驟',
      '這週的節奏',
      '週末一起回顧',
    ]) {
      expect(screen.getByText(heading)).toBeTruthy();
    }

    fireEvent.press(screen.getByLabelText('展開更多紀錄與計畫'));
    expect(screen.getByText('最近紀錄')).toBeTruthy();
    expect(screen.getByText('計畫詳情')).toBeTruthy();

    for (const emoji of ['🌱', '📚', '📊', '⭐', '❤️', '🌿', '🌳']) {
      expect(screen.queryByText(emoji)).toBeNull();
    }
  });

  it('gives the Today action and completion CTA stronger visual hierarchy', () => {
    renderView();

    const actionStyle = StyleSheet.flatten(
      screen.getByText('自己選一本喜歡的書，閱讀 15 分鐘').props.style,
    );
    // 只守「主要文案比周邊都大」的下限；確切字級由 mockup 決定。
    expect(actionStyle.fontSize).toBeGreaterThanOrEqual(19);
    expect(actionStyle.lineHeight).toBeGreaterThanOrEqual(26);

    const completeButton = screen.getByLabelText('記下今天的完成');
    const completeButtonStyle = StyleSheet.flatten(completeButton.props.style);
    expect(completeButtonStyle.minHeight).toBeGreaterThanOrEqual(56);
    expect(completeButtonStyle.paddingVertical).toBeGreaterThanOrEqual(12);
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
    expect(screen.getByText(/先完成今天最小的一步/)).toBeTruthy();

    fireEvent.press(collapseButton);
    expect(screen.queryByText(/不知道選哪一本/)).toBeNull();
  });

  it('lets a capable unfinished plan adjust its time and record today', async () => {
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
      fireEvent.press(screen.getByText('記下今天的完成'));
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
    expect(screen.queryByText('記下今天的完成')).toBeNull();

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

    await act(async () => {
      fireEvent.press(screen.getByText('記下今天的完成'));
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('completion-loading')).toBeNull();
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
    expect(screen.getByText('記下今天的完成')).toBeTruthy();
  });

  it('does not expose record, review, or details actions without callbacks', () => {
    renderView(makePresentation(), { isCompletedToday: true });

    expect(screen.queryByText('查看紀錄')).toBeNull();
    expect(screen.queryByText('需要更正')).toBeNull();
    expect(screen.queryByLabelText('開始週末回顧')).toBeNull();
    expect(screen.queryByLabelText('查看計畫詳情')).toBeNull();
    expect(screen.getByText('這週哪個時間最適合閱讀？')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('展開更多紀錄與計畫'));
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

  it('does not show time controls on a rest day', () => {
    renderView(makePresentation({
      todayTitle: '今天是休息日',
      canCompleteToday: false,
      preferredTimeWindow: 'after_dinner',
    }));

    expect(screen.queryByText(/今天預計：/)).toBeNull();
    expect(screen.queryByLabelText('調整今天的預計時段')).toBeNull();
    expect(screen.queryByTestId('time-options')).toBeNull();
  });

  it('does not offer time choices when the presentation capability is absent', () => {
    renderView(makePresentation({
      headerTitle: '鋼琴家之路',
      goalKind: 'skill',
      todayAction: '練習雙手合奏 15 分鐘',
      canCompleteToday: true,
      supportsPreferredTimeWindow: false,
      preferredTimeWindow: null,
      recentRecords: [],
    }));

    expect(screen.queryByText(/今天預計：/)).toBeNull();
    expect(screen.queryByLabelText('選擇今天的預計時段')).toBeNull();
    expect(screen.queryByText('晚餐後')).toBeNull();
    expect(screen.queryByText('睡前')).toBeNull();
    expect(screen.getByText('記下今天的完成')).toBeTruthy();
    expect(screen.queryByText('記錄今天的閱讀')).toBeNull();

    fireEvent.press(screen.getByLabelText('展開小步驟說明'));
    expect(screen.getByText(/先完成今天最小的一步/)).toBeTruthy();
    expect(screen.queryByText(/不知道選哪一本/)).toBeNull();
  });

  it.each([
    ['paused', '暫停中的計畫', '這個計畫暫停中'],
    ['upcoming', '還沒開始的計畫', '計畫還沒開始'],
    ['expired', '已經結束的計畫', '一起回顧這段計畫'],
    ['completed', '完成的計畫', '這段計畫已完成'],
    ['unplanned', '尚未排定的計畫', '這個計畫尚未安排日期'],
  ] as const)(
    'shows the model status for %s',
    (planState, todayTitle, todayStatusText) => {
      renderView(makePresentation({
        planState,
        todayTitle,
        todayStatusText,
        canCompleteToday: false,
      }));

      expect(screen.getByText(todayTitle)).toBeTruthy();
      expect(screen.getByText(todayStatusText)).toBeTruthy();
      expect(
        screen.queryByText('今天先照自己的節奏前進，需要時再和家人一起確認。'),
      ).toBeNull();

      const week = within(screen.getByTestId('goal-progress'));
      expect(week.getByText('本週 1 / 5')).toBeTruthy();
      expect(
        week.getByText('少一天沒有關係，找到適合自己的節奏更重要。'),
      ).toBeTruthy();
      expect(week.queryByTestId('goal-day-caption-1')).toBeNull();
    },
  );

  it.each(['active', 'unplanned'] as const)(
    'shows a quiet accessible plan notice for a %s plan',
    (planState) => {
      const notice = '目前的日期範圍最多可安排 10 次，和原本的 20 次目標不同。';
      renderView(makePresentation({ planState, planNotice: notice }));

      const noticeStrip = screen.getByLabelText(`計畫提醒：${notice}`);
      expect(noticeStrip).toBeTruthy();
      expect(screen.getByText(notice)).toBeTruthy();

      const noticeStyle = StyleSheet.flatten(noticeStrip.props.style);
      expect(noticeStyle.backgroundColor).toBe(Colors.gold100);
      expect(noticeStyle.backgroundColor).not.toBe(Colors.error);
    },
  );

  it.each(['paused', 'completed', 'upcoming', 'expired'] as const)(
    'does not show an adjustment notice for a %s plan',
    (planState) => {
      const notice = '目前期間最多安排 10 次，可以和家人一起調整。';
      renderView(makePresentation({ planState, planNotice: notice }));

      expect(screen.queryByLabelText(`計畫提醒：${notice}`)).toBeNull();
      expect(screen.queryByText(notice)).toBeNull();
    },
  );

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

    const completeButton = screen.getByLabelText('記下今天的完成');
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

    await act(async () => {
      fireEvent.press(screen.getByLabelText('記下今天的完成'));
    });
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('completion-loading')).toBeNull();
  });

  it('contains completion rejection and restores the action for another try', async () => {
    const onComplete = jest
      .fn<Promise<void | boolean>, []>()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(false);

    renderView(makePresentation(), { onComplete });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('記下今天的完成'));
    });
    expect(
      screen.getByText('剛才沒有記錄成功，請再試一次。'),
    ).toBeTruthy();
    expect(screen.queryByTestId('completion-loading')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('記下今天的完成'));
    });
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('completion-loading')).toBeNull();
  });

  it('allows long hero copy to grow and keeps seven-day captions readable', () => {
    const longWeekLabel = '第 1 週，也是慢慢找節奏的一週';
    const longPlanWeek = '第 1 週／這是一段可以依生活節奏慢慢調整的四週計畫';
    const longWeekProgress = '本週已完成一次，也保留接下來依狀況調整的空間';
    const longFocus = '這一週先慢慢找出最適合自己的時間，也可以在需要時和家人一起調整閱讀方式。';
    const longNext = '下一個里程碑：完成第五次閱讀後，一起看看目前的方法是否仍然適合。';
    renderView(makePresentation({
      weekLabel: longWeekLabel,
      planWeekLabel: longPlanWeek,
      weekProgressLabel: longWeekProgress,
      focusText: longFocus,
      nextText: longNext,
      progression: 'fixed_days',
    }));

    expect(screen.getByText(longWeekLabel).props.numberOfLines).toBe(2);
    // planWeekLabel 裡沒有「共 N …」可以取，Hero 就不顯示期間，不自己合成一句。
    expect(screen.queryByText(longPlanWeek)).toBeNull();
    expect(screen.queryByText(/^共 \d+/)).toBeNull();
    expect(screen.queryByText(longWeekProgress)).toBeNull();
    expect(screen.getByText(longFocus)).toBeTruthy();
    expect(screen.queryByText(longNext)).toBeNull();

    const heroStyle = StyleSheet.flatten(screen.getByTestId('goal-hero').props.style);
    expect(heroStyle.minHeight).toBeGreaterThanOrEqual(150);
    expect(heroStyle.height).toBeUndefined();

    const captionStyle = StyleSheet.flatten(
      screen.getByTestId('goal-day-caption-1').props.style,
    );
    expect(captionStyle.fontSize).toBeGreaterThanOrEqual(11);
    expect(captionStyle.lineHeight).toBeGreaterThanOrEqual(14);
    expect(captionStyle.minHeight).toBeGreaterThanOrEqual(28);
  });

  it('describes all seven real schedule states without punitive language', () => {
    renderView(makePresentation({
      progression: 'fixed_days',
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
      '星期四，尚未記錄',
      '星期五，沒有安排',
      '星期六，尚未到',
      '星期日，沒有安排',
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.queryByText(/失敗|連勝|火焰/)).toBeNull();
  });

  it('distinguishes a scheduled missed day from an unscheduled day', () => {
    renderView(makePresentation({
      progression: 'fixed_days',
      weekDays: [
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
      ],
    }));

    expect(screen.getByLabelText('星期四，尚未記錄')).toBeTruthy();
    expect(screen.getByText('尚未記錄')).toBeTruthy();
    expect(screen.getByLabelText('星期五，沒有安排')).toBeTruthy();
    expect(screen.getByText('未安排')).toBeTruthy();
    expect(screen.queryByText('這次跳過')).toBeNull();
  });

  it('renders milestones as status-labelled timeline rows', () => {
    renderView(makePresentation({
      goalKind: 'skill',
      progression: 'staged_skill',
      milestones: TRUSTED_MILESTONES,
    }));
    const milestones = within(screen.getByTestId('goal-next-stop-section'));

    expect(milestones.getByText('完成第 1 次閱讀')).toBeTruthy();
    expect(milestones.getByText('完成第 5 次閱讀')).toBeTruthy();
    expect(milestones.getByText('完成第 10 次閱讀')).toBeTruthy();
    expect(milestones.getByText('成長幣 +10')).toBeTruthy();
    expect(milestones.getByText('已完成')).toBeTruthy();
    expect(milestones.getByText('下一個里程碑')).toBeTruthy();
    expect(milestones.getByText('尚未到')).toBeTruthy();
    expect(screen.queryByText('之後一起回顧')).toBeNull();
    expect(screen.queryByText('下一站')).toBeNull();
    // 回顧只能出現在 Together Review，不能變成 Progress 的一列。
    expect(milestones.queryByText(/回顧/)).toBeNull();
  });

  it('labels a staged-skill timeline with 進行中 instead of 下一個里程碑', () => {
    const presentation = buildGoalPresentation(
      makeTask({ name: '學鋼琴', long_term_type: 'skill', recurrence_days: null }),
      makeGoal({
        goal_type: 'skill',
        active_days: null,
        checkpoint_rewards: null,
        current_level: 2,
        level_count: 4,
        level_definitions: [
          { name: '基礎指法' },
          { name: '簡單曲目' },
          { name: '雙手合奏' },
          { name: '完整演奏' },
        ],
      }),
      [],
      dayjs('2026-07-30T12:00:00+08:00'),
    );

    renderView(presentation);

    // 階段時間軸搬到「這段路上的下一站」，狀態語意一個字沒變。
    const nextStop = within(screen.getByTestId('goal-next-stop-section'));
    expect(nextStop.getAllByText('已完成')).toHaveLength(2);
    expect(nextStop.getByText('進行中')).toBeTruthy();
    expect(nextStop.getByText('下一階段')).toBeTruthy();
    expect(nextStop.queryByText('下一個里程碑')).toBeNull();
    expect(nextStop.queryByText('計畫節點')).toBeNull();

    // 孩子現在練的那一階段，是被標示出來的那一列。
    const progress = within(screen.getByTestId('goal-progress'));
    expect(progress.getByText('已完成 2 / 4 階段')).toBeTruthy();
    expect(progress.getByText('現在正在：雙手合奏')).toBeTruthy();
  });

  it('does not render a milestone timeline when no persisted checkpoint exists', () => {
    renderView(makePresentation({
      progression: 'accumulation',
      milestones: [],
      nextReward: null,
    }));

    expect(screen.getByTestId('goal-progress')).toBeTruthy();
    expect(screen.queryByTestId('goal-milestones')).toBeNull();
  });

  it('labels habit and family checkpoint configuration as a planned node', () => {
    renderView(makePresentation({
      goalKind: 'habit',
      progression: 'fixed_days',
      milestones: [
        {
          id: 'checkpoint-5',
          title: '第 5 次的計畫節點',
          detail: '成長幣 +10（達成時一起確認）',
          status: 'planned',
        },
      ],
    }));

    const milestones = within(screen.getByTestId('goal-next-stop-section'));
    expect(milestones.getByText('計畫節點')).toBeTruthy();
    expect(milestones.queryByText('已完成')).toBeNull();
  });

  it('hides supporting details behind one accessible disclosure and preserves callbacks', () => {
    const onOpenReview = jest.fn();
    const onOpenDetails = jest.fn();
    const onOpenRecord = jest.fn();

    renderView(makePresentation(), {
      onOpenReview,
      onOpenDetails,
      onOpenRecord,
    });

    expect(screen.getByTestId('goal-review')).toBeTruthy();
    expect(screen.queryByText('最近紀錄')).toBeNull();
    expect(screen.queryByTestId('goal-details')).toBeNull();

    const disclosure = screen.getByLabelText('展開更多紀錄與計畫');
    expect(disclosure.props.accessibilityState).toEqual({ expanded: false });
    fireEvent.press(disclosure);

    expect(
      screen.getByLabelText('收合更多紀錄與計畫').props.accessibilityState,
    ).toEqual({ expanded: true });
    expect(screen.getByText('最近紀錄')).toBeTruthy();
    expect(screen.getByTestId('goal-details')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('開始週末回顧'));
    fireEvent.press(screen.getByLabelText('查看今天的紀錄'));
    fireEvent.press(screen.getByLabelText('查看計畫詳情'));
    expect(onOpenReview).toHaveBeenCalledTimes(1);
    expect(onOpenRecord).toHaveBeenCalledWith('completion-today');
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

    fireEvent.press(screen.getByLabelText('展開更多紀錄與計畫'));

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
      goalKind: 'skill',
      weekLabel: '第 3 階段',
      planWeekLabel: '第 3 階段 · 共 4 階段',
      weekProgressLabel: '這週練習 2 次',
      weekSummary: '這週可以依自己的節奏，繼續目前的練習階段。',
      categoryLabel: '學習與技能',
      focusText: '目前練習：雙手合奏',
      nextText: '現在正在：雙手合奏',
      todayTitle: '今天的小步驟',
      todayAction: '練習雙手合奏 15 分鐘',
      preferredTimeWindow: null,
      canCompleteToday: true,
      progression: 'staged_skill',
      milestones: TRUSTED_MILESTONES,
      reviewPrompt: '這週哪一段練習最有進步？',
    }));

    for (const testID of [
      'goal-hero',
      'goal-today',
      'goal-progress',
      'goal-review',
    ]) {
      expect(screen.getByTestId(testID)).toBeTruthy();
    }
    expect(screen.queryByTestId('goal-details')).toBeNull();
    expect(screen.getByText('記下今天的完成')).toBeTruthy();
    expect(screen.queryByText('記錄今天的閱讀')).toBeNull();

    const week = within(screen.getByTestId('goal-progress'));
    expect(week.getByText('1 / 20 次')).toBeTruthy();
    expect(week.getByText('現在正在：雙手合奏')).toBeTruthy();
    expect(week.getByText('這週可以依自己的節奏，繼續目前的練習階段。')).toBeTruthy();
    expect(week.queryByTestId('goal-day-caption-1')).toBeNull();
  });

  it('uses compact weekly progress for challenge goals without fake daily cells', () => {
    renderView(makePresentation({
      goalKind: 'challenge',
      progression: 'challenge',
      weekProgressLabel: '目前累積 25／100 頁',
      weekSummary: '累積進度由家長一起確認。',
      weekTarget: 5,
    }));

    const week = within(screen.getByTestId('goal-progress'));
    expect(week.getByText('目前累積 25／100 頁')).toBeTruthy();
    expect(week.getByText('累積進度由家長一起確認。')).toBeTruthy();
    expect(week.queryByTestId('goal-day-caption-1')).toBeNull();
  });

  it('keeps a weekly rhythm in Progress without a duplicate hero label', () => {
    const presentation = buildGoalPresentation(
      makeTask({
        schedule_mode: 'weekly_frequency',
        weekly_frequency: 3,
        recurrence_days: null,
        due_date: '2026-08-16',
      }),
      makeGoal({
        total_days: 8,
        active_days: null,
        started_at: '2026-08-03',
        end_date: '2026-08-16',
      }),
      [
        { id: 'monday', completed_at: '2026-08-03T19:00:00+08:00', planned_time_window: null, start_mode: null },
        { id: 'thursday', completed_at: '2026-08-06T19:00:00+08:00', planned_time_window: null, start_mode: null },
      ],
      dayjs('2026-08-07T12:00:00+08:00'),
    );

    renderView(presentation);

    const today = within(screen.getByTestId('goal-today'));
    const progress = within(screen.getByTestId('goal-progress'));
    expect(today.queryByText('本週 2 / 3')).toBeNull();
    expect(progress.getByText('本週 2 / 3')).toBeTruthy();
    expect(screen.getAllByText('本週 2 / 3')).toHaveLength(1);

    const hero = within(screen.getByTestId('goal-hero'));
    expect(hero.queryByText(/本週.*2.*3/)).toBeNull();
    expect(screen.getByTestId('goal-hero').props.accessibilityLabel).toBeUndefined();
  });

  it('retains the real fixed-day schedule for a non-reading habit', () => {
    const presentation = buildGoalPresentation(
      makeTask({ name: '晨間伸展', schedule_mode: 'fixed_days' }),
      makeGoal(),
      [],
      dayjs('2026-07-30T12:00:00+08:00'),
    );

    renderView(presentation);

    expect(presentation.goalKind).toBe('habit');
    expect(screen.getByText('這週的節奏')).toBeTruthy();
    const week = within(screen.getByTestId('goal-progress'));
    expect(week.getByTestId('goal-day-caption-1')).toBeTruthy();
    expect(week.getByTestId('goal-day-caption-5')).toBeTruthy();
  });

  it.each([
    ['paused', '計畫暫停中'],
    ['completed', '這段計畫已完成'],
  ] as const)(
    'does not expose active fixed-day states when the plan is %s',
    (planState, statusText) => {
      renderView(makePresentation({
        progression: 'fixed_days',
        planState,
        todayStatusText: statusText,
        canCompleteToday: false,
        weekDays: [
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
        ],
      }));

      const today = within(screen.getByTestId('goal-today'));
      const progress = within(screen.getByTestId('goal-progress'));
      expect(today.getByText(statusText)).toBeTruthy();
      expect(progress.getByText(statusText)).toBeTruthy();
      expect(progress.queryByTestId('goal-day-caption-2')).toBeNull();
      expect(screen.queryByLabelText('星期二，今天待完成')).toBeNull();
      expect(screen.queryByLabelText('星期三，尚未到')).toBeNull();
    },
  );

  it.each([
    [
      'skill',
      makeTask({
        name: '鋼琴家之路',
        long_term_type: 'skill',
      }),
      makeGoal({
        goal_type: 'skill',
        current_level: 2,
        level_count: 4,
        level_definitions: [
          { name: '基礎指法' },
          { name: '簡單曲目' },
          { name: '雙手合奏' },
          { name: '完整演奏' },
        ],
      }),
      '已完成 2 / 4 階段',
      '依自己的節奏練習',
    ],
    [
      'challenge',
      makeTask({
        name: '閱讀一百頁',
        long_term_type: 'challenge',
      }),
      makeGoal({
        goal_type: 'challenge',
        current_value: 25,
        target_value: 100,
        value_unit: '頁',
      }),
      '25 / 100 頁',
      '累積進度由家長確認',
    ],
  ] as const)(
    'renders truthful %s compact progress from the presentation builder',
    (_kind, task, goal, overallLabel, _weekProgressLabel) => {
      const presentation = buildGoalPresentation(
        task,
        goal,
        [],
        dayjs('2026-07-30T12:00:00+08:00'),
      );

      renderView(presentation);

      const week = within(screen.getByTestId('goal-progress'));
      expect(week.getByText(overallLabel)).toBeTruthy();
      expect(week.getByText(presentation.nextText)).toBeTruthy();
      expect(week.getByText(presentation.weekSummary)).toBeTruthy();
      expect(week.queryByTestId('goal-day-caption-1')).toBeNull();
    },
  );

  it('uses compact weekly status when a habit has no scheduled days', () => {
    renderView(makePresentation({
      goalKind: 'habit',
      planState: 'unplanned',
      progression: null,
      weekProgressLabel: '本週尚未安排',
      weekSummary: '先和家人一起選出適合的日子。',
      weekTarget: 0,
    }));

    const week = within(screen.getByTestId('goal-progress'));
    expect(week.getByText('尚未安排')).toBeTruthy();
    expect(week.getByText('先和家人一起選出適合的日子。')).toBeTruthy();
    expect(week.queryByTestId('goal-day-caption-1')).toBeNull();
  });
});
