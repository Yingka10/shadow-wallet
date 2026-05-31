const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import { calcCoin, checkMilestone, getPrevCheckpoint, OVERRIDE_TYPE_MAP } from '../taskActions';
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
    min_age: 6,
    max_age: 9,
    is_active: true,
    time_saving_min: 0,
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
