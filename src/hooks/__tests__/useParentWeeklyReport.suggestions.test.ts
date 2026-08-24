import {
  applySuggestionMutation,
  computeRevertTarget,
  mergeSuggestionPatch,
  pickFocusSuggestion,
  type WeeklySuggestion,
} from '../useParentWeeklyReport';
import type { TaskCategory } from '../../types/database';

describe('applySuggestionMutation', () => {
  it('does not change suggestion evidence when the task mutation is guarded', async () => {
    const mutateTask = jest.fn().mockRejectedValue(
      new Error('這是一起確認的計畫，調整內容需要再一起確認。'),
    );
    const patchSuggestion = jest.fn();

    await expect(applySuggestionMutation(mutateTask, patchSuggestion))
      .rejects.toThrow('這是一起確認的計畫，調整內容需要再一起確認。');
    expect(patchSuggestion).not.toHaveBeenCalled();
  });

  it('changes suggestion evidence only after an ordinary task mutation succeeds', async () => {
    const calls: string[] = [];
    const mutateTask = jest.fn(async () => { calls.push('task'); });
    const patchSuggestion = jest.fn(async () => { calls.push('suggestion'); });

    await applySuggestionMutation(mutateTask, patchSuggestion);

    expect(calls).toEqual(['task', 'suggestion']);
  });
});

describe('mergeSuggestionPatch', () => {
  const base: WeeklySuggestion = {
    body: '原始建議文字',
    actionLabel: '放寬次數',
    action: 'adjust_schedule',
    taskId: 'task-1',
    taskName: '倒垃圾',
  };

  it('patches the matching (taskId, action) entry in place, leaving others untouched', () => {
    const other: WeeklySuggestion = { body: 'x', actionLabel: 'x', action: 'adjust_recurrence', taskId: 'task-1' };
    const result = mergeSuggestionPatch(
      [base, other],
      'task-1',
      'adjust_schedule',
      { adopted: true, decidedAt: '2026-08-10T00:00:00.000Z' },
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ ...base, adopted: true, decidedAt: '2026-08-10T00:00:00.000Z' });
    expect(result[1]).toBe(other);
  });

  it('does not patch an entry with the same taskId but a different action', () => {
    const scheduleEntry: WeeklySuggestion = { ...base, action: 'adjust_schedule' };
    const recurrenceEntry: WeeklySuggestion = { ...base, action: 'adjust_recurrence' };
    const result = mergeSuggestionPatch(
      [scheduleEntry, recurrenceEntry],
      'task-1',
      'adjust_schedule',
      { adopted: true },
    );
    expect(result.find(s => s.action === 'adjust_schedule')?.adopted).toBe(true);
    expect(result.find(s => s.action === 'adjust_recurrence')?.adopted).toBeUndefined();
  });

  it('appends a freshly-seeded entry when no matching record exists yet', () => {
    const result = mergeSuggestionPatch(
      [],
      'task-2',
      'pause_or_renegotiate',
      { adopted: true, decidedAt: '2026-08-10T00:00:00.000Z' },
      { body: '建議暫停', actionLabel: '知道了', taskName: '練鋼琴' },
    );
    expect(result).toEqual([{
      body: '建議暫停',
      actionLabel: '知道了',
      taskName: '練鋼琴',
      action: 'pause_or_renegotiate',
      taskId: 'task-2',
      adopted: true,
      decidedAt: '2026-08-10T00:00:00.000Z',
    }]);
  });

  it('appends with empty body/actionLabel and no taskName when no seed is given', () => {
    const result = mergeSuggestionPatch([], 'task-3', 'adjust_reminder', { deferred: true });
    expect(result).toEqual([{
      body: '',
      actionLabel: '',
      action: 'adjust_reminder',
      taskId: 'task-3',
      deferred: true,
    }]);
    expect(result[0]).not.toHaveProperty('taskName');
  });
});

describe('pickFocusSuggestion', () => {
  const catMap = (entries: [string, TaskCategory][]) => new Map<string, TaskCategory>(entries);

  it('needs_discussion line 有可 mapping 的 adjust_schedule suggestion → 挑出來當 focus', () => {
    const sg: WeeklySuggestion = {
      body: '放寬次數', actionLabel: '放寬次數', action: 'adjust_schedule', taskId: 'task-book', taskName: '固定看書六週',
    };
    const other: WeeklySuggestion = { body: '泛用建議', actionLabel: '調整提醒', action: 'adjust_reminder' };
    const result = pickFocusSuggestion(
      [other, sg],
      catMap([['task-book', 'D']]),
      'D',
    );
    expect(result).toBe(sg);
  });

  it('adjust_recurrence / break_down_goal 一樣算可靠 mapping', () => {
    const recurrence: WeeklySuggestion = { body: 'x', actionLabel: 'x', action: 'adjust_recurrence', taskId: 't1' };
    expect(pickFocusSuggestion([recurrence], catMap([['t1', 'B']]), 'B')).toBe(recurrence);

    const breakDown: WeeklySuggestion = { body: 'x', actionLabel: 'x', action: 'break_down_goal', taskId: 't2' };
    expect(pickFocusSuggestion([breakDown], catMap([['t2', 'C']]), 'C')).toBe(breakDown);
  });

  it('泛用建議（adjust_reminder / increase_difficulty / add_contribution）沒有 taskId，永遠不會被選成 focus', () => {
    const generic: WeeklySuggestion = { body: 'x', actionLabel: 'x', action: 'add_contribution' };
    expect(pickFocusSuggestion([generic], catMap([]), 'C')).toBeUndefined();
  });

  it('pause_or_renegotiate 的 taskId 其實是 childId（權宜設計），就算剛好對到 taskCategoryMap 也不採信', () => {
    const abandonment: WeeklySuggestion = {
      body: 'x', actionLabel: 'x', action: 'pause_or_renegotiate', taskId: 'child-1',
    };
    // 刻意讓 taskCategoryMap 剛好有一筆 key 是 'child-1'，模擬「萬一恰好撞名」的情況
    expect(pickFocusSuggestion([abandonment], catMap([['child-1', 'A']]), 'A')).toBeUndefined();
  });

  it('全部 stable、focusLineKey 是 undefined → 不挑任何 suggestion 出來', () => {
    const sg: WeeklySuggestion = { body: 'x', actionLabel: 'x', action: 'adjust_schedule', taskId: 't1' };
    expect(pickFocusSuggestion([sg], catMap([['t1', 'D']]), undefined)).toBeUndefined();
  });

  it('focus line 有，但沒有任何 suggestion 對得到它 → 安全 fallback，不亂猜一個不相關的建議', () => {
    const sg: WeeklySuggestion = { body: 'x', actionLabel: 'x', action: 'adjust_schedule', taskId: 't1' };
    expect(pickFocusSuggestion([sg], catMap([['t1', 'B']]), 'D')).toBeUndefined();
  });

  it('同一批建議裡有多個 category，只挑對到 focusLineKey 的那一個', () => {
    const forB: WeeklySuggestion = { body: 'B', actionLabel: 'x', action: 'adjust_schedule', taskId: 't-b' };
    const forD: WeeklySuggestion = { body: 'D', actionLabel: 'x', action: 'adjust_schedule', taskId: 't-d' };
    const result = pickFocusSuggestion(
      [forB, forD],
      catMap([['t-b', 'B'], ['t-d', 'D']]),
      'D',
    );
    expect(result).toBe(forD);
  });
});

describe('computeRevertTarget', () => {
  it('returns the schedule snapshot for adjust_schedule when both fields are present', () => {
    const result = computeRevertTarget('adjust_schedule', {
      currentClaimPeriod: 'day',
      currentMaxClaimsPerPeriod: 1,
      currentRecurrenceDays: undefined,
    });
    expect(result).toEqual({ kind: 'adjust_schedule', claimPeriod: 'day', maxClaimsPerPeriod: 1 });
  });

  it('returns null for adjust_schedule when the snapshot is incomplete', () => {
    expect(computeRevertTarget('adjust_schedule', {
      currentClaimPeriod: undefined,
      currentMaxClaimsPerPeriod: 1,
      currentRecurrenceDays: undefined,
    })).toBeNull();
    expect(computeRevertTarget('adjust_schedule', {
      currentClaimPeriod: 'day',
      currentMaxClaimsPerPeriod: undefined,
      currentRecurrenceDays: undefined,
    })).toBeNull();
  });

  it('returns the recurrence snapshot for adjust_recurrence when present', () => {
    const result = computeRevertTarget('adjust_recurrence', {
      currentClaimPeriod: undefined,
      currentMaxClaimsPerPeriod: undefined,
      currentRecurrenceDays: [1, 3, 5],
    });
    expect(result).toEqual({ kind: 'adjust_recurrence', recurrenceDays: [1, 3, 5] });
  });

  it('returns null for adjust_recurrence when there is no snapshot', () => {
    expect(computeRevertTarget('adjust_recurrence', {
      currentClaimPeriod: undefined,
      currentMaxClaimsPerPeriod: undefined,
      currentRecurrenceDays: undefined,
    })).toBeNull();
  });

  it('returns null for suggestion kinds that were never written to the DB (nothing to revert)', () => {
    expect(computeRevertTarget('pause_or_renegotiate', {
      currentClaimPeriod: undefined,
      currentMaxClaimsPerPeriod: undefined,
      currentRecurrenceDays: undefined,
    })).toBeNull();
    expect(computeRevertTarget('break_down_goal', {
      currentClaimPeriod: undefined,
      currentMaxClaimsPerPeriod: undefined,
      currentRecurrenceDays: undefined,
    })).toBeNull();
    expect(computeRevertTarget('adjust_reminder', {
      currentClaimPeriod: undefined,
      currentMaxClaimsPerPeriod: undefined,
      currentRecurrenceDays: undefined,
    })).toBeNull();
  });
});
