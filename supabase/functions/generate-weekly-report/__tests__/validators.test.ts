import {
  computeFallbackRecurrenceSuggestion,
  computeFallbackScheduleSuggestion,
  formatWeekdaysZh,
  validateRecurrenceSuggestion,
  validateScheduleSuggestion,
  type RecurrenceCandidate,
  type ScheduleCandidate,
} from '../validators';

const scheduleCandidate: ScheduleCandidate = {
  taskId: 'task-1',
  taskName: '倒垃圾',
  claimPeriod: 'day',
  maxClaimsPerPeriod: 1,
  completedThisWeek: 5,
};

const recurrenceCandidate: RecurrenceCandidate = {
  taskId: 'task-2',
  taskName: '練鋼琴',
  recurrenceDays: [1, 3, 5],
  completedWeekdays: [1, 3],
};

describe('validateScheduleSuggestion', () => {
  it('accepts a valid suggestion that matches a candidate and raises the cap', () => {
    const result = validateScheduleSuggestion(
      {
        taskId: 'task-1',
        body: '可以放寬一點次數',
        actionLabel: '放寬次數',
        suggestedClaimPeriod: 'day',
        suggestedMaxClaimsPerPeriod: 2,
      },
      [scheduleCandidate],
    );
    expect(result).toEqual({
      taskId: 'task-1',
      body: '可以放寬一點次數',
      actionLabel: '放寬次數',
      currentClaimPeriod: 'day',
      currentMaxClaimsPerPeriod: 1,
      suggestedClaimPeriod: 'day',
      suggestedMaxClaimsPerPeriod: 2,
    });
  });

  it('rejects a taskId that is not in the candidate list', () => {
    const result = validateScheduleSuggestion(
      { taskId: 'made-up', body: 'x', actionLabel: 'x', suggestedClaimPeriod: 'day', suggestedMaxClaimsPerPeriod: 2 },
      [scheduleCandidate],
    );
    expect(result).toBeNull();
  });

  it('rejects a cap that is not actually higher than the current one', () => {
    const result = validateScheduleSuggestion(
      { taskId: 'task-1', body: 'x', actionLabel: 'x', suggestedClaimPeriod: 'day', suggestedMaxClaimsPerPeriod: 1 },
      [scheduleCandidate],
    );
    expect(result).toBeNull();
  });

  it('rejects malformed input shapes', () => {
    expect(validateScheduleSuggestion(null, [scheduleCandidate])).toBeNull();
    expect(validateScheduleSuggestion({}, [scheduleCandidate])).toBeNull();
    expect(validateScheduleSuggestion(
      { taskId: 'task-1', body: 'x', actionLabel: 'x', suggestedClaimPeriod: 'month', suggestedMaxClaimsPerPeriod: 2 },
      [scheduleCandidate],
    )).toBeNull();
  });
});

describe('validateRecurrenceSuggestion', () => {
  it('accepts a suggestion whose taskId matches a candidate, ignoring any day fields from the model', () => {
    const result = validateRecurrenceSuggestion(
      { taskId: 'task-2', body: '縮小排定日', actionLabel: '調整排定日', suggestedRecurrenceDays: [0, 6] },
      [recurrenceCandidate],
    );
    // Only taskId/body/actionLabel come from the model — no day-of-week fields are trusted or echoed.
    expect(result).toEqual({ taskId: 'task-2', body: '縮小排定日', actionLabel: '調整排定日' });
  });

  it('rejects a taskId that is not in the candidate list', () => {
    const result = validateRecurrenceSuggestion(
      { taskId: 'made-up', body: 'x', actionLabel: 'x' },
      [recurrenceCandidate],
    );
    expect(result).toBeNull();
  });
});

describe('computeFallbackScheduleSuggestion', () => {
  it('returns null when there are no candidates', () => {
    expect(computeFallbackScheduleSuggestion([])).toBeNull();
  });

  it('picks the candidate with the most completions this week and raises its cap by exactly 1', () => {
    const lessHit: ScheduleCandidate = { ...scheduleCandidate, taskId: 'task-3', completedThisWeek: 2 };
    const result = computeFallbackScheduleSuggestion([lessHit, scheduleCandidate]);
    expect(result?.taskId).toBe('task-1');
    expect(result?.suggestedMaxClaimsPerPeriod).toBe(scheduleCandidate.maxClaimsPerPeriod + 1);
    expect(result?.currentMaxClaimsPerPeriod).toBe(scheduleCandidate.maxClaimsPerPeriod);
  });
});

describe('computeFallbackRecurrenceSuggestion', () => {
  it('returns null when there are no candidates', () => {
    expect(computeFallbackRecurrenceSuggestion([])).toBeNull();
  });

  it('picks the candidate with the fewest actually-completed weekdays', () => {
    const moreDone: RecurrenceCandidate = { ...recurrenceCandidate, taskId: 'task-4', completedWeekdays: [1, 3, 5] };
    const result = computeFallbackRecurrenceSuggestion([moreDone, recurrenceCandidate]);
    expect(result?.taskId).toBe('task-2');
  });
});

describe('formatWeekdaysZh', () => {
  it('orders weekdays Monday-first with Sunday last', () => {
    expect(formatWeekdaysZh([0, 3, 1])).toBe('週一、三、日');
  });
});
