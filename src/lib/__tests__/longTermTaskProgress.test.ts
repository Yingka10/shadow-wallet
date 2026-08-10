// 第七階段 F — 長期任務進度語意
//
// 這一支盯的是同一個毛病的第二次發作。
//
// 第一次：新建立的成長計畫顯示「第 0 關 / 共 1 關」——`?? 1` 生出來的分母。
// 第二次：改成「已完成 X / Y 個階段」，其中 X 用 `task_completions` 的筆數。
//
// 第二次比第一次更難察覺，因為它看起來很合理。但完成一次閱讀不等於完成一個
// 里程碑，而 `task_plan_milestones` 根本沒有完成狀態欄位 —— 孩子讀了 7 次書、
// 全都還在第一個里程碑範圍內，畫面會說「已完成 5 / 5 個階段」，家長據此
// 以為計畫結束了。
//
// 所以下面每一條都在問：這個數字是家長自己設定的，還是我們推導出來的？

import {
  createLongTermTaskProgressPresentation,
  findNextPlannedMilestone,
  isLegacyLongTermTask,
  progressPercentOf,
  type LongTermMilestone,
  type LongTermProgressGoal,
  type LongTermProgressTask,
} from '../longTermTaskProgress';

const TODAY = '2026-08-01';
const START = '2026-07-28'; // 第 1 天 = 07-28，第 5 天 = 08-01（今天）

/** 抽屜建立的長期任務：一定有 reward_policy。 */
function newTask(planMode: LongTermProgressTask['planMode']): LongTermProgressTask {
  return { rewardPolicy: 'progress_only', planMode };
}

function goal(overrides: Partial<LongTermProgressGoal> = {}): LongTermProgressGoal {
  return {
    goalType: 'habit',
    currentDay: 0,
    totalDays: null,
    currentLevel: null,
    levelCount: null,
    targetCompletions: null,
    currentValue: null,
    targetValue: null,
    valueUnit: null,
    firstReviewAfterDays: null,
    firstReviewDate: null,
    startDate: START,
    ...overrides,
  };
}

function milestone(targetDay: number | null, title = `第 ${targetDay} 天`): LongTermMilestone {
  return { id: `m-${targetDay}`, title, targetDay };
}

function present(
  task: LongTermProgressTask,
  g: LongTermProgressGoal,
  milestones: LongTermMilestone[] = [],
  today = TODAY,
) {
  return createLongTermTaskProgressPresentation({ task, longTermGoal: g, milestones, today });
}

// ---------------------------------------------------------------------------
// 1-2. 成長計畫：規劃，不是完成
// ---------------------------------------------------------------------------

describe('成長計畫', () => {
  const FIVE = [milestone(3), milestone(7), milestone(14), milestone(21), milestone(28)];

  it('有里程碑時講「已規劃 Y 個里程碑」', () => {
    const p = present(newTask('growth_plan'), goal({ goalType: 'skill' }), FIVE);
    expect(p.kind).toBe('planned_milestones');
    expect(p.headline).toBe('已規劃 5 個里程碑');
  });

  it('完成次數再多也不影響 —— 那個參數不再被讀', () => {
    // 舊版會把 completionCount 當成已完成的階段數。現在給它也沒有用。
    const withCompletions = createLongTermTaskProgressPresentation({
      task: newTask('growth_plan'),
      longTermGoal: goal({ goalType: 'skill' }),
      milestones: FIVE,
      completionCount: 99,
      today: TODAY,
    });
    expect(withCompletions.headline).toBe('已規劃 5 個里程碑');
    expect(withCompletions.headline).not.toMatch(/已完成|99/);
  });

  it.each([
    ['已完成 X／Y 個階段', /已完成 \d+ *\/ *\d+ 個階段/],
    ['第 X 關', /第 \d+ 關/],
    ['共 Y 關', /共 \d+ 關/],
    ['完成次數目標', /完成 \d+ 次|目標 \d+ 次/],
  ])('不出現 %s', (_label, pattern) => {
    for (const milestones of [[], FIVE]) {
      const p = present(newTask('growth_plan'), goal({ goalType: 'skill' }), milestones);
      expect(`${p.headline} ${'nextMilestoneLabel' in p ? p.nextMilestoneLabel ?? '' : ''}`)
        .not.toMatch(pattern);
    }
  });

  it('沒有里程碑時只說它是什麼，不編分母', () => {
    const p = present(newTask('growth_plan'), goal({ goalType: 'skill' }), []);
    expect(p).toEqual({
      kind: 'growth_plan', headline: '進行中的成長計畫', showProgressBar: false,
    });
  });

  it('沒有里程碑但有回顧日時補一句回顧', () => {
    const p = present(newTask('growth_plan'),
      goal({ goalType: 'skill', firstReviewAfterDays: 14 }), []);
    expect(p.headline).toBe('進行中的成長計畫，預計兩週後一起回顧');
  });

  // -------------------------------------------------------------------------
  // 3-5. 下一個里程碑
  // -------------------------------------------------------------------------

  it('3. 講得出下一個里程碑是第幾天', () => {
    const p = present(newTask('growth_plan'), goal({ goalType: 'skill' }), FIVE);
    // 今天是第 5 天，下一個是第 7 天。
    expect(p).toMatchObject({ nextMilestoneLabel: '下一個里程碑：第 7 天' });
  });

  it('4. 今天正好是里程碑日期時，它仍然是「下一個」', () => {
    // 第 5 天 = 2026-08-01 = 今天。
    const p = present(newTask('growth_plan'), goal({ goalType: 'skill' }),
      [milestone(5), milestone(9)]);
    expect(p).toMatchObject({ nextMilestoneLabel: '下一個里程碑：第 5 天' });
  });

  it('5. 全部日期都過了就建議一起回顧，不硬指一個過去的日子', () => {
    const p = present(newTask('growth_plan'), goal({ goalType: 'skill' }),
      [milestone(1), milestone(2)]);
    expect(p).toMatchObject({ nextMilestoneLabel: '里程碑時程已到，建議一起回顧' });
  });

  it('6. targetDay 缺失就不猜日期，只講規劃了幾個', () => {
    const p = present(newTask('growth_plan'), goal({ goalType: 'skill' }),
      [milestone(null), milestone(null)]);
    expect(p).toEqual({
      kind: 'planned_milestones', milestoneCount: 2,
      headline: '已規劃 2 個里程碑', showProgressBar: false,
    });
    expect('nextMilestoneLabel' in p && p.nextMilestoneLabel).toBeFalsy();
  });

  it('沒有 startDate 也不猜日期', () => {
    const p = present(newTask('growth_plan'),
      goal({ goalType: 'skill', startDate: null }), FIVE);
    expect(p.headline).toBe('已規劃 5 個里程碑');
    expect('nextMilestoneLabel' in p && p.nextMilestoneLabel).toBeFalsy();
  });

  it('9. 不畫進度條', () => {
    for (const milestones of [[], FIVE, [milestone(null)]]) {
      const p = present(newTask('growth_plan'), goal({ goalType: 'skill' }), milestones);
      expect({ bar: p.showProgressBar, pct: progressPercentOf(p) })
        .toEqual({ bar: false, pct: null });
    }
  });
});

// ---------------------------------------------------------------------------
// 7-8. findNextPlannedMilestone 本身
// ---------------------------------------------------------------------------

describe('findNextPlannedMilestone', () => {
  it('7. 資料亂序也找得到正確的下一個', () => {
    const shuffled = [milestone(28), milestone(3), milestone(14), milestone(7), milestone(21)];
    const next = findNextPlannedMilestone({
      startDate: START, milestones: shuffled, today: TODAY,
    });
    expect(next.milestone?.targetDay).toBe(7);
    expect(next.date).toBe('2026-08-03');
  });

  it('8. 不修改傳進來的陣列', () => {
    const original = [milestone(28), milestone(3), milestone(14)];
    const snapshot = original.map(m => m.targetDay);
    findNextPlannedMilestone({ startDate: START, milestones: original, today: TODAY });
    expect(original.map(m => m.targetDay)).toEqual(snapshot);
  });

  it('targetDay <= 0 的里程碑會被忽略 —— 第 0 天沒有意義', () => {
    const next = findNextPlannedMilestone({
      startDate: START, milestones: [milestone(0), milestone(-3), milestone(9)], today: TODAY,
    });
    expect(next.milestone?.targetDay).toBe(9);
  });

  it('全部過期時回 completedSchedule', () => {
    const next = findNextPlannedMilestone({
      startDate: START, milestones: [milestone(1), milestone(2)], today: TODAY,
    });
    expect(next).toEqual({ completedSchedule: true, milestone: null });
  });

  it('沒有 startDate 或沒有里程碑時不宣稱時程已到', () => {
    expect(findNextPlannedMilestone({ startDate: null, milestones: [milestone(3)] }))
      .toEqual({ completedSchedule: false, milestone: null });
    expect(findNextPlannedMilestone({ startDate: START, milestones: [] }))
      .toEqual({ completedSchedule: false, milestone: null });
  });

  it('第 1 天就是開始日當天，不會差一天', () => {
    const next = findNextPlannedMilestone({
      startDate: '2026-08-01', milestones: [milestone(1)], today: '2026-08-01',
    });
    expect(next.date).toBe('2026-08-01');
    expect(next.completedSchedule).toBe(false);
  });

  it('跨月與跨年都算得對', () => {
    expect(findNextPlannedMilestone({
      startDate: '2026-12-30', milestones: [milestone(5)], today: '2026-12-30',
    }).date).toBe('2027-01-03');
  });
});

// ---------------------------------------------------------------------------
// 10. 短期支援
// ---------------------------------------------------------------------------

describe('短期支援', () => {
  it('講天數', () => {
    for (const [days, expected] of [[14, '14 天生活小計畫'], [28, '28 天生活小計畫']] as const) {
      const p = present(newTask('short_support'), goal({ totalDays: days }));
      expect({ days, headline: p.headline }).toEqual({ days, headline: expected });
    }
  });

  it('有回顧日就補一句', () => {
    const p = present(newTask('short_support'),
      goal({ totalDays: 14, firstReviewAfterDays: 7 }));
    expect(p).toEqual({
      kind: 'short_support', headline: '14 天生活小計畫',
      reviewLabel: '預計一週後一起回顧', showProgressBar: false,
    });
  });

  it('不整週的回顧日講第幾天', () => {
    const p = present(newTask('short_support'),
      goal({ totalDays: 14, firstReviewAfterDays: 10 }));
    expect(p).toMatchObject({ reviewLabel: '預計第 10 天一起回顧' });
  });

  it('連期間都沒有時只說進行中', () => {
    const p = present(newTask('short_support'), goal({ totalDays: null }));
    expect(p.headline).toBe('進行中的生活小計畫');
  });

  it('不出現完成次數、關卡或比例', () => {
    for (const g of [goal({ totalDays: 14 }), goal({ totalDays: null }),
      goal({ totalDays: 14, firstReviewAfterDays: 7 })]) {
      const p = present(newTask('short_support'), g);
      const text = `${p.headline} ${'reviewLabel' in p ? p.reviewLabel ?? '' : ''}`;
      expect(text).not.toMatch(/目標 \d+ 次|完成 \d+ 次|第 \d+ 關/);
      expect({ bar: p.showProgressBar, pct: progressPercentOf(p) })
        .toEqual({ bar: false, pct: null });
    }
  });
});

// ---------------------------------------------------------------------------
// 11. 家庭角色
// ---------------------------------------------------------------------------

describe('家庭角色', () => {
  it('整週講週', () => {
    for (const [days, expected] of [[28, '四週家庭角色'], [14, '兩週家庭角色']] as const) {
      const p = present(newTask('family_role'), goal({ goalType: 'responsibility', totalDays: days }));
      expect({ days, headline: p.headline }).toEqual({ days, headline: expected });
    }
  });

  it('不整週講天', () => {
    const p = present(newTask('family_role'),
      goal({ goalType: 'responsibility', totalDays: 15 }));
    expect(p.headline).toBe('15 天家庭角色');
  });

  it('有回顧日就補一句', () => {
    const p = present(newTask('family_role'),
      goal({ goalType: 'responsibility', totalDays: 28, firstReviewAfterDays: 7 }));
    expect(p).toEqual({
      kind: 'family_role', headline: '四週家庭角色',
      reviewLabel: '預計一週後一起回顧', showProgressBar: false,
    });
  });

  it('日常完成紀錄不會被說成「角色完成了多少」', () => {
    // 家庭角色每天都可能有完成紀錄，但那不是「角色達成度」。
    const p = createLongTermTaskProgressPresentation({
      task: newTask('family_role'),
      longTermGoal: goal({ goalType: 'responsibility', totalDays: 28, currentDay: 12 }),
      completionCount: 12,
      today: TODAY,
    });
    expect(p.headline).toBe('四週家庭角色');
    expect(p.headline).not.toMatch(/12|完成|次/);
    expect(progressPercentOf(p)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 12-13. legacy 不變
// ---------------------------------------------------------------------------

describe('legacy 長期任務（reward_policy 為 null）', () => {
  const legacy: LongTermProgressTask = { rewardPolicy: null };

  it('isLegacyLongTermTask 是唯一的判斷點', () => {
    expect(isLegacyLongTermTask({ rewardPolicy: null })).toBe(true);
    expect(isLegacyLongTermTask({})).toBe(true);
    expect(isLegacyLongTermTask({ rewardPolicy: 'coin_eligible' })).toBe(false);
  });

  it('13. habit 仍然是「第 X 天 / 共 Y 天」', () => {
    const p = present(legacy, goal({ goalType: 'habit', currentDay: 3, totalDays: 21 }));
    expect(p).toEqual({
      kind: 'legacy', headline: '第 3 天 / 共 21 天',
      progressPercent: 14, showProgressBar: true,
    });
  });

  it('13. skill 仍然是「第 X 關 / 共 Y 關」', () => {
    const p = present(legacy, goal({ goalType: 'skill', currentLevel: 2, levelCount: 5 }));
    expect(p.headline).toBe('第 2 關 / 共 5 關');
  });

  it('13. responsibility 仍然是「完成 X 次 / 目標 Y 次」', () => {
    const p = present(legacy,
      goal({ goalType: 'responsibility', currentDay: 4, targetCompletions: 20 }));
    expect(p.headline).toBe('完成 4 次 / 目標 20 次');
  });

  it('13. challenge 仍然帶單位', () => {
    const p = present(legacy, goal({
      goalType: 'challenge', currentValue: 30, targetValue: 100, valueUnit: '頁',
    }));
    expect(p.headline).toBe('30 / 100 頁');
  });

  it('12. legacy 仍然畫進度條', () => {
    const p = present(legacy, goal({ goalType: 'skill', currentLevel: 2, levelCount: 5 }));
    expect({ bar: p.showProgressBar, pct: progressPercentOf(p) })
      .toEqual({ bar: true, pct: 40 });
  });

  it('planMode 不影響 legacy —— 判斷只看 reward_policy', () => {
    const withPlanMode: LongTermProgressTask = { rewardPolicy: null, planMode: 'growth_plan' };
    const p = present(withPlanMode, goal({ goalType: 'habit', currentDay: 3, totalDays: 21 }),
      [milestone(3), milestone(7)]);
    expect(p.headline).toBe('第 3 天 / 共 21 天');
    expect(p.showProgressBar).toBe(true);
  });

  it('新任務永遠不會走到 legacy 分支', () => {
    for (const mode of ['growth_plan', 'short_support', 'family_role'] as const) {
      const p = present(newTask(mode), goal({ goalType: 'skill', currentLevel: 2, levelCount: 5 }));
      expect({ mode, kind: p.kind }).not.toEqual({ mode, kind: 'legacy' });
    }
  });
});

// ---------------------------------------------------------------------------
// 進度條總結
// ---------------------------------------------------------------------------

describe('進度條', () => {
  it('新建立的三種長期任務都不會有進度條，也不會是 0%', () => {
    for (const mode of ['growth_plan', 'short_support', 'family_role'] as const) {
      const p = present(newTask(mode), goal({ totalDays: 28 }));
      expect({ mode, bar: p.showProgressBar, pct: progressPercentOf(p) })
        .toEqual({ mode, bar: false, pct: null });
    }
  });

  it('legacy 的分母是 0 時也不畫（避免除以零）', () => {
    const p = present({ rewardPolicy: null },
      goal({ goalType: 'skill', currentLevel: 0, levelCount: 0 }));
    expect(progressPercentOf(p)).toBeNull();
  });
});
