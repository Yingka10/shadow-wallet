import {
  buildGrowthLines,
  computeGrowthLineStatus,
  pickFocusLine,
  weeklyTargetAppliesToWeek,
  type CategoryWeeklyFacts,
  type WeeklyRhythmTaskFact,
} from '../validators';

function facts(overrides: Partial<CategoryWeeklyFacts>): CategoryWeeklyFacts {
  return {
    category: 'B',
    done: 0,
    rhythmTasks: [],
    remindedCount: 0,
    completedTaskNames: [],
    ...overrides,
  };
}

function rhythm(taskName: string, target: number, done: number): WeeklyRhythmTaskFact {
  return { taskName, target, done };
}

describe('computeGrowthLineStatus', () => {
  it('沒有週節奏任務 -> 一律 stable，不管做了幾次', () => {
    expect(computeGrowthLineStatus(facts({ done: 1 }))).toBe('stable');
  });

  it('達標或超過 -> stable', () => {
    expect(computeGrowthLineStatus(facts({ rhythmTasks: [rhythm('畫畫練習', 3, 3)] }))).toBe('stable');
    expect(computeGrowthLineStatus(facts({ rhythmTasks: [rhythm('畫畫練習', 3, 4)] }))).toBe('stable');
  });

  it('沒達標、沒有提醒訊號 -> watch', () => {
    expect(computeGrowthLineStatus(
      facts({ rhythmTasks: [rhythm('畫畫練習', 3, 1)], remindedCount: 0 }),
    )).toBe('watch');
  });

  it('沒達標、而且有提醒訊號 -> needs_discussion', () => {
    expect(computeGrowthLineStatus(
      facts({ rhythmTasks: [rhythm('畫畫練習', 3, 2)], remindedCount: 1 }),
    )).toBe('needs_discussion');
  });

  it('同類別裡沒有週節奏的任務，完成次數不會影響達標判斷', () => {
    // C 類裡「主動掃地」沒有週目標、「畫畫練習」週目標 3 次且已達標。
    // done=5 混了兩者，但判斷只看 rhythmTasks。
    expect(computeGrowthLineStatus(
      facts({ category: 'C', done: 5, rhythmTasks: [rhythm('畫畫練習', 3, 3)] }),
    )).toBe('stable');
  });

  it('回歸：同一類裡兩個週節奏任務不可以互相掩蓋 —— 一個做滿、一個沒動，仍然要被標出來', () => {
    // 真實案例：C 類有「把哈利波特看完」每週 3 次（只做 1 次）與
    // 「畫畫練習」每週 3 次（做滿 3 次）。舊版把目標加總成 6、完成加總成 4，
    // 4 < 6 剛好還是不達標所以沒爆；但只要畫畫多做兩次（總數 6）就會被判成
    // stable，而哈利波特整週只讀一次這件事會被完全蓋掉。
    expect(computeGrowthLineStatus(facts({
      category: 'C',
      done: 4,
      rhythmTasks: [rhythm('把哈利波特看完', 3, 1), rhythm('畫畫練習', 3, 5)],
      remindedCount: 1,
    }))).toBe('needs_discussion');
  });
});

describe('buildGrowthLines 的事實句', () => {
  it('只有一個週節奏任務時，直接講「原訂每週 N 次」', () => {
    const [line] = buildGrowthLines([
      facts({ category: 'C', done: 1, rhythmTasks: [rhythm('把哈利波特看完', 3, 1)], remindedCount: 1 }),
    ]);
    expect(line.facts[0]).toBe('原訂每週 3 次，本週完成 1 次');
  });

  it('多個週節奏任務時，點名沒跟上的那一個 —— 絕不把不同約定的目標加總', () => {
    const [line] = buildGrowthLines([
      facts({
        category: 'C',
        done: 4,
        rhythmTasks: [rhythm('把哈利波特看完', 3, 1), rhythm('畫畫練習', 3, 3)],
        remindedCount: 1,
        completedTaskNames: ['把哈利波特看完', '畫畫練習', '畫畫練習', '畫畫練習'],
      }),
    ]);
    expect(line.facts[0]).toBe('把哈利波特看完：原訂每週 3 次，本週完成 1 次');
    // 「每週 6 次」是兩份分開談定的約定被加起來的數字，沒有人同意過它。
    expect(line.facts.join(' ')).not.toContain('每週 6 次');
  });

  it('多個週節奏任務且全部達標時，不編一個加總目標出來', () => {
    const [line] = buildGrowthLines([
      facts({
        category: 'C',
        done: 6,
        rhythmTasks: [rhythm('把哈利波特看完', 3, 3), rhythm('畫畫練習', 3, 3)],
      }),
    ]);
    expect(line.facts[0]).toBe('本週完成 6 次');
    expect(line.facts.join(' ')).not.toContain('每週 6 次');
  });
});

describe('buildGrowthLines', () => {
  it('每個這週有活動的類別各產生一條線（B/C/D 多類別案例）', () => {
    const lines = buildGrowthLines([
      facts({ category: 'A', done: 0 }),
      facts({ category: 'B', done: 3, completedTaskNames: ['倒垃圾', '幫忙洗碗', '倒垃圾'] }),
      facts({ category: 'C', done: 1, completedTaskNames: ['畫畫練習'] }),
      facts({ category: 'D', done: 2, rhythmTasks: [rhythm('固定看書六週', 3, 2)], remindedCount: 1, completedTaskNames: ['固定看書六週'] }),
    ]);

    expect(lines.map(l => l.key)).toEqual(['B', 'C', 'D']);
    expect(lines.find(l => l.key === 'D')?.status).toBe('needs_discussion');
    expect(lines.find(l => l.key === 'B')?.status).toBe('stable');
    expect(lines.find(l => l.key === 'C')?.status).toBe('stable');
  });

  it('這週完全沒有活動的類別根本不產生線', () => {
    expect(buildGrowthLines([facts({ category: 'A', done: 0 })])).toEqual([]);
  });

  it('生活常規（A）本週缺席不會被當成問題 — 沒有活動就是不出現，不是負向 status', () => {
    const lines = buildGrowthLines([
      facts({ category: 'A', done: 0 }),
      facts({ category: 'D', done: 2, rhythmTasks: [rhythm('練琴', 2, 2)] }),
    ]);
    expect(lines.some(l => l.key === 'A')).toBe(false);
  });

  it('單一成長線的一週：只有一個類別有活動', () => {
    const lines = buildGrowthLines([
      facts({ category: 'A', done: 0 }),
      facts({ category: 'B', done: 0 }),
      facts({ category: 'C', done: 1, completedTaskNames: ['畫畫練習'] }),
      facts({ category: 'D', done: 0, rhythmTasks: [rhythm('練琴', 3, 0)] }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].key).toBe('C');
  });

  it('facts 用的是真實完成過的任務名稱，不是編出來的', () => {
    const lines = buildGrowthLines([
      facts({ category: 'B', done: 2, completedTaskNames: ['倒垃圾', '倒垃圾'] }),
    ]);
    expect(lines[0].facts.join(' ')).toContain('倒垃圾');
    expect(lines[0].facts.join(' ')).not.toContain('、倒垃圾、倒垃圾'); // deduped
  });
});

describe('pickFocusLine', () => {
  it('全部 stable -> 不挑 focus line', () => {
    const lines = buildGrowthLines([
      facts({ category: 'B', done: 3, rhythmTasks: [rhythm('倒垃圾', 3, 3)] }),
      facts({ category: 'C', done: 1 }),
    ]);
    expect(pickFocusLine(lines)).toBeUndefined();
  });

  it('只有一條有明確的沒達標／提醒訊號 -> 只有那一條成為 focus', () => {
    const lines = buildGrowthLines([
      facts({ category: 'B', done: 3 }),
      facts({ category: 'C', done: 1 }),
      facts({ category: 'D', done: 2, rhythmTasks: [rhythm('練琴', 3, 2)], remindedCount: 1 }),
    ]);
    expect(pickFocusLine(lines)).toBe('D');
  });

  it('needs_discussion 優先於 watch', () => {
    const lines = buildGrowthLines([
      facts({ category: 'B', done: 1, rhythmTasks: [rhythm('倒垃圾', 3, 1)], remindedCount: 0 }), // watch
      facts({ category: 'D', done: 1, rhythmTasks: [rhythm('練琴', 3, 1)], remindedCount: 2 }),   // needs_discussion
    ]);
    expect(pickFocusLine(lines)).toBe('D');
  });
});

// 這一週的週目標，只能由「這一週真的存在的任務」貢獻。
// 真實情境：家長週一新建一個「每週三次」的任務，然後回頭看上週的週報 ——
// 上週那條線不該因此變成「原訂每週三次，本週完成 0 次」。
describe('weeklyTargetAppliesToWeek', () => {
  const WEEK = '2026-08-31'; // 週一，該週最後一天是 2026-09-06

  const task = (over: Record<string, unknown> = {}) => ({
    schedule_mode: 'weekly_frequency',
    weekly_frequency: 3,
    start_date: '2026-08-01',
    ...over,
  });

  it('週目標之外的排程模式一律不算', () => {
    expect(weeklyTargetAppliesToWeek(task({ schedule_mode: 'fixed_days' }), WEEK)).toBe(false);
    expect(weeklyTargetAppliesToWeek(task({ schedule_mode: null }), WEEK)).toBe(false);
  });

  it('沒有次數就沒有目標可以加總', () => {
    expect(weeklyTargetAppliesToWeek(task({ weekly_frequency: null }), WEEK)).toBe(false);
  });

  it('沒排開始日 = 一直都在', () => {
    expect(weeklyTargetAppliesToWeek(task({ start_date: null }), WEEK)).toBe(true);
  });

  it('這一週之前就開始的，算', () => {
    expect(weeklyTargetAppliesToWeek(task({ start_date: '2026-08-01' }), WEEK)).toBe(true);
  });

  it('這一週第一天開始的，算', () => {
    expect(weeklyTargetAppliesToWeek(task({ start_date: '2026-08-31' }), WEEK)).toBe(true);
  });

  it('週中才開始的仍然照算 —— 按比例打折是另一個決定，這裡不自己發明', () => {
    expect(weeklyTargetAppliesToWeek(task({ start_date: '2026-09-03' }), WEEK)).toBe(true);
  });

  it('這一週最後一天開始的，算', () => {
    expect(weeklyTargetAppliesToWeek(task({ start_date: '2026-09-06' }), WEEK)).toBe(true);
  });

  it('下一週才開始的，不算 —— 那 N 次從沒在這一週被約定過', () => {
    expect(weeklyTargetAppliesToWeek(task({ start_date: '2026-09-07' }), WEEK)).toBe(false);
    expect(weeklyTargetAppliesToWeek(task({ start_date: '2026-10-01' }), WEEK)).toBe(false);
  });
});
