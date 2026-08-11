import {
  formatWeekdaysZh,
  validateAdvisorSuggestedAction,
  type AdvisorRecurrenceCandidate,
  type AdvisorScheduleCandidate,
} from '../validators';

const scheduleCandidate: AdvisorScheduleCandidate = {
  taskId: 'task-1',
  taskName: '倒垃圾',
  claimPeriod: 'day',
  maxClaimsPerPeriod: 1,
  completedThisWeek: 5,
};

const recurrenceCandidate: AdvisorRecurrenceCandidate = {
  taskId: 'task-2',
  taskName: '練鋼琴',
  recurrenceDays: [1, 3, 5],
  completedWeekdays: [1, 3],
};

describe('validateAdvisorSuggestedAction', () => {
  it('returns null for non-object input', () => {
    expect(validateAdvisorSuggestedAction(null, [], [])).toBeNull();
    expect(validateAdvisorSuggestedAction('a string', [], [])).toBeNull();
    expect(validateAdvisorSuggestedAction(undefined, [], [])).toBeNull();
  });

  it('returns null for an unknown kind', () => {
    expect(validateAdvisorSuggestedAction({ kind: 'delete_everything' }, [], [])).toBeNull();
  });

  describe('adjust_schedule', () => {
    it('accepts a valid suggestion matching a candidate and raising the cap', () => {
      const result = validateAdvisorSuggestedAction(
        {
          kind: 'adjust_schedule',
          taskId: 'task-1',
          suggestedClaimPeriod: 'day',
          suggestedMaxClaimsPerPeriod: 2,
          actionLabel: '放寬次數',
        },
        [scheduleCandidate],
        [],
      );
      expect(result).toEqual({
        kind: 'adjust_schedule',
        taskId: 'task-1',
        taskName: '倒垃圾',
        currentClaimPeriod: 'day',
        currentMaxClaimsPerPeriod: 1,
        suggestedClaimPeriod: 'day',
        suggestedMaxClaimsPerPeriod: 2,
        actionLabel: '放寬次數',
      });
    });

    it('rejects a taskId not present in the candidate list (no hallucinated tasks)', () => {
      const result = validateAdvisorSuggestedAction(
        {
          kind: 'adjust_schedule',
          taskId: 'made-up-task-id',
          suggestedClaimPeriod: 'day',
          suggestedMaxClaimsPerPeriod: 2,
          actionLabel: '放寬次數',
        },
        [scheduleCandidate],
        [],
      );
      expect(result).toBeNull();
    });

    it('rejects a suggested cap that is not actually higher than today', () => {
      const sameCapResult = validateAdvisorSuggestedAction(
        { kind: 'adjust_schedule', taskId: 'task-1', suggestedClaimPeriod: 'day', suggestedMaxClaimsPerPeriod: 1, actionLabel: 'x' },
        [scheduleCandidate],
        [],
      );
      const lowerCapResult = validateAdvisorSuggestedAction(
        { kind: 'adjust_schedule', taskId: 'task-1', suggestedClaimPeriod: 'day', suggestedMaxClaimsPerPeriod: 0, actionLabel: 'x' },
        [scheduleCandidate],
        [],
      );
      expect(sameCapResult).toBeNull();
      expect(lowerCapResult).toBeNull();
    });

    it('rejects a non-integer or non-positive suggestedMaxClaimsPerPeriod', () => {
      expect(validateAdvisorSuggestedAction(
        { kind: 'adjust_schedule', taskId: 'task-1', suggestedClaimPeriod: 'day', suggestedMaxClaimsPerPeriod: 2.5, actionLabel: 'x' },
        [scheduleCandidate], [],
      )).toBeNull();
      expect(validateAdvisorSuggestedAction(
        { kind: 'adjust_schedule', taskId: 'task-1', suggestedClaimPeriod: 'day', suggestedMaxClaimsPerPeriod: -1, actionLabel: 'x' },
        [scheduleCandidate], [],
      )).toBeNull();
    });

    it('rejects an invalid suggestedClaimPeriod', () => {
      const result = validateAdvisorSuggestedAction(
        { kind: 'adjust_schedule', taskId: 'task-1', suggestedClaimPeriod: 'month', suggestedMaxClaimsPerPeriod: 2, actionLabel: 'x' },
        [scheduleCandidate],
        [],
      );
      expect(result).toBeNull();
    });
  });

  describe('adjust_recurrence', () => {
    it('ignores any weekday values from the model and uses the candidate data instead', () => {
      const result = validateAdvisorSuggestedAction(
        {
          kind: 'adjust_recurrence',
          taskId: 'task-2',
          actionLabel: '調整排定日',
          // an AI hallucinating days that don't match the candidate — must be ignored entirely
          suggestedRecurrenceDays: [0, 2, 4, 6],
        },
        [],
        [recurrenceCandidate],
      );
      expect(result).toEqual({
        kind: 'adjust_recurrence',
        taskId: 'task-2',
        taskName: '練鋼琴',
        currentRecurrenceDays: [1, 3, 5],
        suggestedRecurrenceDays: [1, 3],
        actionLabel: '調整排定日',
      });
    });

    it('rejects a taskId not present in the recurrence candidate list', () => {
      const result = validateAdvisorSuggestedAction(
        { kind: 'adjust_recurrence', taskId: 'made-up', actionLabel: 'x' },
        [],
        [recurrenceCandidate],
      );
      expect(result).toBeNull();
    });
  });

  describe('create_task', () => {
    it('accepts a trimmed, non-empty title within the length limit', () => {
      const result = validateAdvisorSuggestedAction(
        { kind: 'create_task', suggestedTitle: '  練習彈鋼琴  ', actionLabel: '建立這個任務' },
        [],
        [],
      );
      expect(result).toEqual({ kind: 'create_task', suggestedTitle: '練習彈鋼琴', actionLabel: '建立這個任務' });
    });

    it('rejects an empty (or whitespace-only) title', () => {
      const result = validateAdvisorSuggestedAction(
        { kind: 'create_task', suggestedTitle: '   ', actionLabel: 'x' },
        [],
        [],
      );
      expect(result).toBeNull();
    });

    it('rejects a title longer than 40 characters', () => {
      const result = validateAdvisorSuggestedAction(
        { kind: 'create_task', suggestedTitle: 'a'.repeat(41), actionLabel: 'x' },
        [],
        [],
      );
      expect(result).toBeNull();
    });
  });
});

describe('formatWeekdaysZh', () => {
  it('formats and reorders weekdays starting from Monday, wrapping Sunday to the end', () => {
    expect(formatWeekdaysZh([0, 3, 1])).toBe('週一、三、日');
  });

  it('returns an empty weekday label for an empty list', () => {
    expect(formatWeekdaysZh([])).toBe('週');
  });
});
