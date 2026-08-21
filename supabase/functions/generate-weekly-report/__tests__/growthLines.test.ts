import {
  buildGrowthLines,
  computeGrowthLineStatus,
  pickFocusLine,
  type CategoryWeeklyFacts,
} from '../validators';

function facts(overrides: Partial<CategoryWeeklyFacts>): CategoryWeeklyFacts {
  return {
    category: 'B',
    done: 0,
    weeklyTarget: null,
    targetDone: 0,
    remindedCount: 0,
    completedTaskNames: [],
    ...overrides,
  };
}

describe('computeGrowthLineStatus', () => {
  it('no weekly target -> stable regardless of count', () => {
    expect(computeGrowthLineStatus(facts({ done: 1, weeklyTarget: null }))).toBe('stable');
  });

  it('met or exceeded target -> stable', () => {
    expect(computeGrowthLineStatus(facts({ weeklyTarget: 3, targetDone: 3 }))).toBe('stable');
    expect(computeGrowthLineStatus(facts({ weeklyTarget: 3, targetDone: 4 }))).toBe('stable');
  });

  it('under target, no reminded signal -> watch', () => {
    expect(computeGrowthLineStatus(facts({ weeklyTarget: 3, targetDone: 1, remindedCount: 0 }))).toBe('watch');
  });

  it('under target with reminded signal -> needs_discussion', () => {
    expect(computeGrowthLineStatus(facts({ weeklyTarget: 3, targetDone: 2, remindedCount: 1 }))).toBe('needs_discussion');
  });

  it('regression: a category with a mix of targeted and untargeted tasks must not blend their counts — ' +
     '達標判斷只能看「有週目標的那個任務」自己的完成次數，不能跟同類別其他沒有目標的任務混在一起算', () => {
    // 真實案例：C 類裡「主動掃地」沒有週目標、「畫畫練習」週目標 3 次。
    // done=2（兩個任務合計）看起來像沒達標，但 targetDone=1（只算畫畫練習自己）
    // 才是正確的比較基準——這裡刻意用一組「用 done 算會誤判、用 targetDone 才對」的數字。
    const result = computeGrowthLineStatus(
      facts({ category: 'C', done: 2, weeklyTarget: 3, targetDone: 3, remindedCount: 0 }),
    );
    expect(result).toBe('stable'); // targetDone(3) 已達標，即使 done(2，含另一個未達標的無關任務) 比較小
  });
});

describe('buildGrowthLines', () => {
  it('produces one line per category that has activity this week (multi-category B/C/D case)', () => {
    const lines = buildGrowthLines([
      facts({ category: 'A', done: 0, weeklyTarget: null }),
      facts({ category: 'B', done: 3, weeklyTarget: null, completedTaskNames: ['倒垃圾', '幫忙洗碗', '倒垃圾'] }),
      facts({ category: 'C', done: 1, weeklyTarget: null, completedTaskNames: ['畫畫練習'] }),
      facts({ category: 'D', done: 2, weeklyTarget: 3, targetDone: 2, remindedCount: 1, completedTaskNames: ['固定看書六週'] }),
    ]);

    expect(lines.map(l => l.key)).toEqual(['B', 'C', 'D']);
    expect(lines.find(l => l.key === 'D')?.status).toBe('needs_discussion');
    expect(lines.find(l => l.key === 'B')?.status).toBe('stable');
    expect(lines.find(l => l.key === 'C')?.status).toBe('stable');
  });

  it('a category with zero activity this week does not produce a line at all', () => {
    const lines = buildGrowthLines([facts({ category: 'A', done: 0, weeklyTarget: null })]);
    expect(lines).toEqual([]);
  });

  it('生活常規（A）本週缺席不會被當成問題 — 沒有活動就是不出現，不是負向 status', () => {
    const lines = buildGrowthLines([
      facts({ category: 'A', done: 0, weeklyTarget: null }),
      facts({ category: 'D', done: 2, weeklyTarget: 2, targetDone: 2 }),
    ]);
    expect(lines.some(l => l.key === 'A')).toBe(false);
  });

  it('single growth line week: only one category has activity', () => {
    const lines = buildGrowthLines([
      facts({ category: 'A', done: 0, weeklyTarget: null }),
      facts({ category: 'B', done: 0, weeklyTarget: null }),
      facts({ category: 'C', done: 1, weeklyTarget: null, completedTaskNames: ['畫畫練習'] }),
      facts({ category: 'D', done: 0, weeklyTarget: 3 }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].key).toBe('C');
  });

  it('facts include the real completed task names, not invented ones', () => {
    const lines = buildGrowthLines([
      facts({ category: 'B', done: 2, completedTaskNames: ['倒垃圾', '倒垃圾'] }),
    ]);
    expect(lines[0].facts.join(' ')).toContain('倒垃圾');
    expect(lines[0].facts.join(' ')).not.toContain('、倒垃圾、倒垃圾'); // deduped
  });
});

describe('pickFocusLine', () => {
  it('all stable -> no focus line', () => {
    const lines = buildGrowthLines([
      facts({ category: 'B', done: 3, weeklyTarget: 3, targetDone: 3 }),
      facts({ category: 'C', done: 1, weeklyTarget: null }),
    ]);
    expect(pickFocusLine(lines)).toBeUndefined();
  });

  it('exactly one line has a clear reminded/missed signal -> only that one becomes focus', () => {
    const lines = buildGrowthLines([
      facts({ category: 'B', done: 3, weeklyTarget: null }),
      facts({ category: 'C', done: 1, weeklyTarget: null }),
      facts({ category: 'D', done: 2, weeklyTarget: 3, targetDone: 2, remindedCount: 1 }),
    ]);
    expect(pickFocusLine(lines)).toBe('D');
  });

  it('needs_discussion outranks watch when both exist', () => {
    const lines = buildGrowthLines([
      facts({ category: 'B', done: 1, weeklyTarget: 3, targetDone: 1, remindedCount: 0 }), // watch
      facts({ category: 'D', done: 1, weeklyTarget: 3, targetDone: 1, remindedCount: 2 }), // needs_discussion
    ]);
    expect(pickFocusLine(lines)).toBe('D');
  });
});
