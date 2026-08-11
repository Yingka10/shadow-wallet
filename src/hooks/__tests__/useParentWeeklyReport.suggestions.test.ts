import {
  applySuggestionMutation,
  computeRevertTarget,
  mergeSuggestionPatch,
  type WeeklySuggestion,
} from '../useParentWeeklyReport';

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
