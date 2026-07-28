// 第七階段 D — 長期任務的進度呈現
//
// 這一支存在的原因是一句具體的假話：新建立的成長計畫在列表上顯示
// 「第 0 關 / 共 1 關」。孩子沒有同意過任何關卡，那個 1 是 `?? 1` 生出來的，
// 而 0 讓家長以為孩子完全沒做。
//
// 所以下面每一條的重點都是同一件事：**算不出真實進度時不要顯示進度**。

import {
  createLongTermTaskProgressPresentation,
  progressPercentOf,
  type LongTermProgressGoal,
  type LongTermProgressTask,
} from '../longTermTaskProgress';

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
    ...overrides,
  };
}

function present(
  task: LongTermProgressTask,
  g: LongTermProgressGoal,
  milestoneCount = 0,
  completionCount = 0,
) {
  return createLongTermTaskProgressPresentation({
    task, longTermGoal: g, milestoneCount, completionCount,
  });
}

// ---------------------------------------------------------------------------
// 1. 成長計畫
// ---------------------------------------------------------------------------

describe('成長計畫', () => {
  it('有里程碑時講階段數', () => {
    const p = present(newTask('growth_plan'), goal({ goalType: 'skill' }), 4, 2);
    expect(p).toEqual({
      kind: 'milestone', current: 2, total: 4, label: '已完成 2 / 4 個階段',
    });
  });

  it('沒有里程碑時不編一個分母 —— 只說它是什麼', () => {
    const p = present(newTask('growth_plan'), goal({ goalType: 'skill' }), 0, 0);
    expect(p).toEqual({ kind: 'none', label: '進行中的成長計畫' });
  });

  it('絕對不出現「第 0 關」', () => {
    for (const milestones of [0, 1, 4]) {
      const p = present(newTask('growth_plan'), goal({ goalType: 'skill' }), milestones, 0);
      expect(p.label).not.toMatch(/第 0 關/);
      expect(p.label).not.toMatch(/共 1 關/);
    }
  });

  it('完成次數超過階段數時夾在階段數，不會出現 5 / 4', () => {
    const p = present(newTask('growth_plan'), goal({ goalType: 'skill' }), 4, 9);
    expect(p).toEqual({
      kind: 'milestone', current: 4, total: 4, label: '已完成 4 / 4 個階段',
    });
  });
});

// ---------------------------------------------------------------------------
// 2. 短期支援
// ---------------------------------------------------------------------------

describe('短期支援', () => {
  it('有回顧日就講回顧', () => {
    const p = present(newTask('short_support'),
      goal({ totalDays: 14, firstReviewAfterDays: 7, firstReviewDate: '2026-08-04' }));
    expect(p).toEqual({
      kind: 'support', reviewDate: '2026-08-04',
      label: '預計第 7 天（2026-08-04）一起回顧',
    });
  });

  it('沒有回顧日就講期間', () => {
    const p = present(newTask('short_support'), goal({ totalDays: 14 }));
    expect(p).toEqual({ kind: 'support', label: '14 天生活小計畫' });
  });

  it('連期間都沒有時只說進行中', () => {
    const p = present(newTask('short_support'), goal({ totalDays: null }));
    expect(p).toEqual({ kind: 'none', label: '進行中的生活小計畫' });
  });

  it('絕對不出現「目標 1 次」', () => {
    for (const g of [goal({ totalDays: 14 }), goal({ totalDays: null }),
      goal({ totalDays: 14, firstReviewAfterDays: 7 })]) {
      expect(present(newTask('short_support'), g).label).not.toMatch(/目標 1 次|完成 0 次/);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. 家庭角色
// ---------------------------------------------------------------------------

describe('家庭角色', () => {
  it('有回顧日就講回顧', () => {
    const p = present(newTask('family_role'),
      goal({ goalType: 'responsibility', totalDays: 28, firstReviewAfterDays: 7 }));
    expect(p).toEqual({ kind: 'role_review', label: '預計第 7 天一起回顧' });
  });

  it('沒有回顧日時 28 天說成「4 週家庭角色」', () => {
    const p = present(newTask('family_role'),
      goal({ goalType: 'responsibility', totalDays: 28 }));
    expect(p).toEqual({ kind: 'role_review', label: '4 週家庭角色' });
  });

  it('不是整週的天數就照天數說', () => {
    const p = present(newTask('family_role'),
      goal({ goalType: 'responsibility', totalDays: 15 }));
    expect(p).toEqual({ kind: 'role_review', label: '15 天家庭角色' });
  });

  it('絕對不出現「完成 0 次 / 目標 1 次」', () => {
    for (const days of [null, 28, 15]) {
      const p = present(newTask('family_role'),
        goal({ goalType: 'responsibility', totalDays: days }));
      expect(p.label).not.toMatch(/完成 \d+ 次|目標 \d+ 次/);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. legacy 不變
// ---------------------------------------------------------------------------

describe('legacy 長期任務（reward_policy 為 null）', () => {
  const legacy: LongTermProgressTask = { rewardPolicy: null };

  it('habit 仍然是「第 X 天 / 共 Y 天」', () => {
    const p = present(legacy, goal({ goalType: 'habit', currentDay: 3, totalDays: 21 }));
    expect(p).toEqual({
      kind: 'duration', completedDays: 3, totalDays: 21, label: '第 3 天 / 共 21 天',
    });
  });

  it('skill 仍然是「第 X 關 / 共 Y 關」', () => {
    const p = present(legacy,
      goal({ goalType: 'skill', currentLevel: 2, levelCount: 5 }));
    expect(p).toEqual({
      kind: 'milestone', current: 2, total: 5, label: '第 2 關 / 共 5 關',
    });
  });

  it('responsibility 仍然是「完成 X 次 / 目標 Y 次」', () => {
    const p = present(legacy,
      goal({ goalType: 'responsibility', currentDay: 4, targetCompletions: 20 }));
    expect(p).toEqual({
      kind: 'milestone', current: 4, total: 20, label: '完成 4 次 / 目標 20 次',
    });
  });

  it('challenge 仍然帶單位', () => {
    const p = present(legacy, goal({
      goalType: 'challenge', currentValue: 30, targetValue: 100, valueUnit: '頁',
    }));
    expect(p.label).toBe('30 / 100 頁');
  });

  it('planMode 不影響 legacy 任務 —— 判斷只看 reward_policy', () => {
    const withPlanMode: LongTermProgressTask = { rewardPolicy: null, planMode: 'family_role' };
    expect(present(withPlanMode, goal({ goalType: 'habit', currentDay: 3, totalDays: 21 })).label)
      .toBe('第 3 天 / 共 21 天');
  });
});

// ---------------------------------------------------------------------------
// 10. 無資料時不顯示假進度
// ---------------------------------------------------------------------------

describe('百分比', () => {
  it('算得出比例的才給數字', () => {
    expect(progressPercentOf({
      kind: 'milestone', current: 2, total: 4, label: '',
    })).toBe(50);
    expect(progressPercentOf({
      kind: 'duration', completedDays: 3, totalDays: 21, label: '',
    })).toBe(14);
  });

  it('算不出比例的回 null，不是 0', () => {
    // 0 會被畫成一條空的進度條 —— 那同樣是在宣稱「一點都沒做」。
    expect(progressPercentOf({ kind: 'none', label: '進行中的成長計畫' })).toBeNull();
    expect(progressPercentOf({ kind: 'role_review', label: '4 週家庭角色' })).toBeNull();
    expect(progressPercentOf({ kind: 'support', label: '14 天生活小計畫' })).toBeNull();
    expect(progressPercentOf({
      kind: 'duration', totalDays: 14, label: '',
    })).toBeNull();
    expect(progressPercentOf({
      kind: 'milestone', current: 0, total: 0, label: '',
    })).toBeNull();
  });

  it('新建立的三種長期任務都不會得到 0%', () => {
    const cases: Array<LongTermProgressTask['planMode']> =
      ['growth_plan', 'short_support', 'family_role'];
    for (const planMode of cases) {
      const p = present(newTask(planMode), goal({ totalDays: 28 }));
      expect({ planMode, pct: progressPercentOf(p) }).toEqual({ planMode, pct: null });
    }
  });
});
