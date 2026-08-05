// eslint-disable-next-line prefer-const -- let allows reassignment in beforeEach
let mockRpc = jest.fn();
// eslint-disable-next-line prefer-const
let mockFrom = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    // closures evaluated at call-time, not at mock-factory-time
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

beforeEach(() => {
  mockRpc = jest.fn();
  mockFrom = jest.fn();
});

import {
  MAX_SKILL_MILESTONE_COIN,
  OVERRIDE_TYPE_MAP,
  applyHabitResume,
  calcCoin,
  calcSkillDefaultCoins,
  checkMilestone,
  clampSkillCoin,
  getPrevCheckpoint,
  isActiveDayForHabit,
  parentMarkTask,
  recordCompletionContext,
  skillCoinsAreValid,
} from '../taskActions';
import type { Task, CheckpointRewards } from '../../types/database';

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 'task-1',
    family_id: 'fam-1',
    name: 'Test',
    category: 'C',
    day_type: 'weekday',
    long_term_type: null,
    is_long_term: false,
    base_time_min: 10,
    difficulty: 2,
    coin_override: null,
    is_system_default: false,
    allow_repeat: false,
    claim_period: 'day',
    max_claims_per_period: 1,
    min_age: 6,
    max_age: 9,
    is_active: true,
    time_saving_min: 0,
    // 這兩個在 Task 上是必填（`number[] | null` / `string | null`），不是 optional。
    // 少了它們，`...overrides` 會把型別放寬成 `| undefined`，makeTask 就回不出 Task。
    recurrence_days: null,
    due_date: null,
    created_at: '2026-01-01',
    ...overrides,
  };
}

// ── calcCoin ─────────────────────────────────────────────────────────────────

describe('calcCoin', () => {
  it('returns 0 for Task-A regardless of prerequisite', () => {
    const t = makeTask({ category: 'A', base_time_min: 5, difficulty: 1 });
    expect(calcCoin(t, true)).toBe(0);
    expect(calcCoin(t, false)).toBe(0);
  });

  it('returns 0 for Task-B regardless of prerequisite', () => {
    const t = makeTask({ category: 'B', base_time_min: 5, difficulty: 1 });
    expect(calcCoin(t, true)).toBe(0);
    expect(calcCoin(t, false)).toBe(0);
  });

  it('returns Math.round(base_time_min * difficulty) for Task-C when prereqs met', () => {
    const t = makeTask({ category: 'C', base_time_min: 10, difficulty: 2 });
    expect(calcCoin(t, true)).toBe(20);
  });

  it('applies 0.7 discount for Task-C when prereqs not met', () => {
    const t = makeTask({ category: 'C', base_time_min: 10, difficulty: 2 }); // base=20
    expect(calcCoin(t, false)).toBe(14); // Math.round(20 * 0.7)
  });

  it('uses coin_override if set, ignoring base_time_min * difficulty', () => {
    const t = makeTask({ category: 'C', base_time_min: 10, difficulty: 2, coin_override: 50 });
    expect(calcCoin(t, true)).toBe(50);
  });

  it('applies 0.7 discount to coin_override when prereqs not met', () => {
    const t = makeTask({ category: 'D', coin_override: 100 });
    expect(calcCoin(t, false)).toBe(70); // Math.round(100 * 0.7)
  });

  it('rounds fractional results', () => {
    // base=10*1.5=15, discount=0.7 → 10.5 → round → 11
    const t = makeTask({ category: 'C', base_time_min: 10, difficulty: 1.5 });
    expect(calcCoin(t, false)).toBe(11);
  });
});

// ── checkMilestone ────────────────────────────────────────────────────────────

describe('checkMilestone', () => {
  const rewards: CheckpointRewards = { '7': 20, '14': 40, '21': 80 };

  it('returns milestone result when currentDay hits a checkpoint', () => {
    const result = checkMilestone('goal-1', 7, rewards);
    expect(result).toEqual({ goalId: 'goal-1', day: 7, coinReward: 20 });
  });

  it('returns null when currentDay is not a checkpoint', () => {
    expect(checkMilestone('goal-1', 5, rewards)).toBeNull();
    expect(checkMilestone('goal-1', 8, rewards)).toBeNull();
  });

  it('returns null when checkpoints is null', () => {
    expect(checkMilestone('goal-1', 7, null)).toBeNull();
  });

  it('handles day 21 checkpoint', () => {
    const result = checkMilestone('goal-1', 21, rewards);
    expect(result).toEqual({ goalId: 'goal-1', day: 21, coinReward: 80 });
  });
});

// ── getPrevCheckpoint ─────────────────────────────────────────────────────────

describe('getPrevCheckpoint', () => {
  const rewards: CheckpointRewards = { '7': 20, '14': 40, '21': 80 };

  it('returns the largest checkpoint strictly less than currentDay', () => {
    expect(getPrevCheckpoint(8, rewards)).toBe(7);
    expect(getPrevCheckpoint(15, rewards)).toBe(14);
    expect(getPrevCheckpoint(22, rewards)).toBe(21);
  });

  it('returns 0 when currentDay is at or before first checkpoint', () => {
    expect(getPrevCheckpoint(7, rewards)).toBe(0);
    expect(getPrevCheckpoint(3, rewards)).toBe(0);
  });

  it('returns 0 when checkpoints is null', () => {
    expect(getPrevCheckpoint(10, null)).toBe(0);
  });
});

// ── OVERRIDE_TYPE_MAP ─────────────────────────────────────────────────────────

describe('OVERRIDE_TYPE_MAP', () => {
  it('maps exceeded → renegotiate', () => {
    expect(OVERRIDE_TYPE_MAP.exceeded).toBe('renegotiate');
  });
  it('maps partial → partial', () => {
    expect(OVERRIDE_TYPE_MAP.partial).toBe('partial');
  });
  it('maps none → none', () => {
    expect(OVERRIDE_TYPE_MAP.none).toBe('none');
  });
  it('maps other → renegotiate', () => {
    expect(OVERRIDE_TYPE_MAP.other).toBe('renegotiate');
  });
});

// ── skill milestone helpers ───────────────────────────────────────────────────

describe('calcSkillDefaultCoins', () => {
  it('distributes 10→50 evenly for 2 milestones', () => {
    expect(calcSkillDefaultCoins(2)).toEqual([10, 50]);
  });
  it('distributes 10→50 evenly for 3 milestones', () => {
    expect(calcSkillDefaultCoins(3)).toEqual([10, 30, 50]);
  });
  it('distributes 10→50 evenly for 5 milestones', () => {
    expect(calcSkillDefaultCoins(5)).toEqual([10, 20, 30, 40, 50]);
  });
  it('starts at 10 and ends at MAX for any valid count', () => {
    for (const n of [2, 3, 4, 5]) {
      const coins = calcSkillDefaultCoins(n);
      expect(coins[0]).toBe(10);
      expect(coins[coins.length - 1]).toBe(MAX_SKILL_MILESTONE_COIN);
    }
  });
});

describe('clampSkillCoin', () => {
  it('floors at 1', () => {
    expect(clampSkillCoin(0)).toBe(1);
    expect(clampSkillCoin(-5)).toBe(1);
  });
  it('caps at MAX_SKILL_MILESTONE_COIN', () => {
    expect(clampSkillCoin(999)).toBe(MAX_SKILL_MILESTONE_COIN);
  });
  it('rounds fractional input', () => {
    expect(clampSkillCoin(23.4)).toBe(23);
    expect(clampSkillCoin(23.6)).toBe(24);
  });
});

describe('skillCoinsAreValid', () => {
  it('accepts non-decreasing sequences', () => {
    expect(skillCoinsAreValid([10, 30, 50])).toBe(true);
    expect(skillCoinsAreValid([10, 10, 20])).toBe(true);
    expect(skillCoinsAreValid([5])).toBe(true);
  });
  it('rejects any decrease', () => {
    expect(skillCoinsAreValid([10, 5, 50])).toBe(false);
    expect(skillCoinsAreValid([50, 40])).toBe(false);
  });
});

// ── parentMarkTask helpers ────────────────────────────────────────────────────

// helper: build a supabase from()-chain whose .single() resolves to `result`
function makeReadChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    select:      () => chain,
    eq:          () => chain,
    gte:         () => chain,
    lt:          () => chain,
    maybeSingle: () => Promise.resolve(result),
    single:      () => Promise.resolve(result),
  };
  return chain;
}

// helper: build a from()-chain whose insert().select().single() resolves to `result`
function makeInsertChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    insert: () => insertChain,
  };
  const insertChain: Record<string, unknown> = {
    select: () => insertChain,
    single: () => Promise.resolve(result),
  };
  return chain;
}

// helper: build a from()-chain whose update().eq() resolves to `{ error: null }`
function makeUpdateChain() {
  return {
    update: () => ({
      eq: () => Promise.resolve({ error: null }),
    }),
  };
}

// helper: build a from()-chain whose insert() (no .select()) resolves to `{ error: null }`
function makeInsertOnlyChain() {
  return {
    insert: () => Promise.resolve({ error: null }),
  };
}

describe('parentMarkTask', () => {
  it('throws when my_parent_id returns null', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      parentMarkTask('task-1', 'child-1', 'exceeded', 10, null),
    ).rejects.toThrow('找不到家長帳號');
  });

  it('throws when my_parent_id rpc errors', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'auth error' } });
    await expect(
      parentMarkTask('task-1', 'child-1', 'exceeded', 10, null),
    ).rejects.toThrow('找不到家長帳號');
  });

  it('creates a parent completion when today completion is not found', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'parent-uuid', error: null });
    mockFrom.mockReturnValueOnce(
      makeReadChain({ data: null, error: null }),
    );
    mockFrom.mockReturnValueOnce(
      makeInsertChain({ data: { id: 'completion-created', coin_earned: 0 }, error: null }),
    );
    mockFrom.mockReturnValueOnce(
      makeInsertChain({ data: { id: 'override-1' }, error: null }),
    );
    mockFrom.mockReturnValueOnce(makeUpdateChain());

    await expect(
      parentMarkTask('task-1', 'child-1', 'exceeded', 0, null),
    ).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledTimes(4);
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'task_completions');
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'task_completions');
    expect(mockFrom).toHaveBeenNthCalledWith(3, 'overrides');
    expect(mockFrom).toHaveBeenNthCalledWith(4, 'task_completions');
  });
});

// ── isActiveDayForHabit ───────────────────────────────────────────────────────

describe('isActiveDayForHabit', () => {
  it('returns true for any dow when activeDays is null (every day active)', () => {
    expect(isActiveDayForHabit(0, null)).toBe(true);
    expect(isActiveDayForHabit(3, null)).toBe(true);
    expect(isActiveDayForHabit(6, null)).toBe(true);
  });

  it('returns true when dow is in activeDays', () => {
    expect(isActiveDayForHabit(1, [1, 2, 3, 4, 5])).toBe(true);
    expect(isActiveDayForHabit(0, [0, 6])).toBe(true);
  });

  it('returns false when dow is not in activeDays', () => {
    expect(isActiveDayForHabit(0, [1, 2, 3, 4, 5])).toBe(false);
    expect(isActiveDayForHabit(6, [1, 2, 3, 4, 5])).toBe(false);
  });

  it('returns false when activeDays is empty array', () => {
    expect(isActiveDayForHabit(1, [])).toBe(false);
    expect(isActiveDayForHabit(0, [])).toBe(false);
  });
});

// ── applyHabitResume — active_days gating ─────────────────────────────────────

// Builds a .select().eq().eq().gte().lt().limit() chain resolving to `result`
function makeReadLimitChain(result: { data: unknown }) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq:     () => chain,
    gte:    () => chain,
    lt:     () => chain,
    limit:  () => Promise.resolve(result),
  };
  return chain;
}

describe('applyHabitResume — active_days gating', () => {
  it('skips all DB calls when activeDays is empty (no valid days)', async () => {
    await applyHabitResume('goal-1', 'child-1', 'task-1', 5, { '7': 20 }, []);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('queries DB and updates when activeDays is null and yesterday was missed', async () => {
    mockFrom.mockReturnValueOnce(makeReadLimitChain({ data: [] }));      // completions: missed
    mockFrom.mockReturnValueOnce(makeUpdateChain());                      // update current_day

    await applyHabitResume('goal-1', 'child-1', 'task-1', 5, { '7': 20 }, null);

    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'task_completions');
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'long_term_goals');
  });

  it('queries DB and updates when all 7 days active and yesterday was missed', async () => {
    mockFrom.mockReturnValueOnce(makeReadLimitChain({ data: [] }));
    mockFrom.mockReturnValueOnce(makeUpdateChain());

    await applyHabitResume('goal-1', 'child-1', 'task-1', 5, { '7': 20 }, [0,1,2,3,4,5,6]);

    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it('does not update when currentDay is 0 even if yesterday missed', async () => {
    mockFrom.mockReturnValueOnce(makeReadLimitChain({ data: [] }));

    await applyHabitResume('goal-1', 'child-1', 'task-1', 0, null, null);

    expect(mockFrom).toHaveBeenCalledTimes(1); // completions checked, no update
  });

  it('does not update when yesterday was completed', async () => {
    mockFrom.mockReturnValueOnce(makeReadLimitChain({ data: [{ id: 'comp-1' }] }));

    await applyHabitResume('goal-1', 'child-1', 'task-1', 5, null, null);

    expect(mockFrom).toHaveBeenCalledTimes(1); // completions checked, no update
  });
});

describe('recordCompletionContext', () => {
  it('records the selected window without requiring a start mode', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: true }, error: null });

    await recordCompletionContext('completion-1', 'after_dinner', null);

    expect(mockRpc).toHaveBeenCalledWith('record_completion_context', {
      p_completion_id: 'completion-1',
      p_planned_time_window: 'after_dinner',
      p_start_mode: null,
    });
  });

  it('surfaces an rpc error without changing the completed task', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'context failed' } });

    await expect(
      recordCompletionContext('completion-1', 'before_bed', 'reminded'),
    ).rejects.toThrow('context failed');
  });
});
