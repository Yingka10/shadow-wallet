jest.mock('../supabase', () => ({ supabase: {} }));

import { recommendTasks, calcTotalCoin } from '../taskRecommend';
import type { SystemTaskTemplate } from '../../types/database';

function makeTemplate(overrides: Partial<SystemTaskTemplate>): SystemTaskTemplate {
  return {
    id: 'test-id',
    name: 'Test',
    category: 'B',
    age_group: '6-9',
    base_time_min: 10,
    difficulty: 1,
    time_saving_min: 10,
    sort_order: 0,
    created_at: '2026-01-01',
    ...overrides,
  };
}

const TEMPLATES: SystemTaskTemplate[] = [
  makeTemplate({ id: 'b1', category: 'B', sort_order: 1 }),
  makeTemplate({ id: 'b2', category: 'B', sort_order: 2 }),
  makeTemplate({ id: 'b3', category: 'B', sort_order: 3 }),
  makeTemplate({ id: 'b4', category: 'B', sort_order: 4 }),
  makeTemplate({ id: 'c1', category: 'C', base_time_min: 15, difficulty: 2, sort_order: 5 }),
  makeTemplate({ id: 'c2', category: 'C', base_time_min: 20, difficulty: 2, sort_order: 6 }),
  makeTemplate({ id: 'c3', category: 'C', base_time_min: 20, difficulty: 2.5, sort_order: 7 }),
];

describe('recommendTasks', () => {
  it('returns 3 Task-B and 2 Task-C by default', () => {
    const { taskB, taskC } = recommendTasks(TEMPLATES);
    expect(taskB).toHaveLength(3);
    expect(taskC).toHaveLength(2);
    taskB.forEach(t => expect(t.category).toBe('B'));
    taskC.forEach(t => expect(t.category).toBe('C'));
  });

  it('returns remaining templates when showAlt=true', () => {
    const { taskB, taskC } = recommendTasks(TEMPLATES, true);
    expect(taskB).toHaveLength(1);
    expect(taskC).toHaveLength(1);
  });

  it('alt batch has no overlap with primary batch', () => {
    const primary = recommendTasks(TEMPLATES);
    const alt = recommendTasks(TEMPLATES, true);
    const primaryIds = new Set([...primary.taskB, ...primary.taskC].map(t => t.id));
    [...alt.taskB, ...alt.taskC].forEach(t => {
      expect(primaryIds.has(t.id)).toBe(false);
    });
  });

  it('returns empty arrays when templates is empty', () => {
    const { taskB, taskC } = recommendTasks([]);
    expect(taskB).toHaveLength(0);
    expect(taskC).toHaveLength(0);
  });
});

describe('calcTotalCoin', () => {
  it('sums Math.round(base_time_min * difficulty) for each template', () => {
    const c1 = makeTemplate({ base_time_min: 15, difficulty: 2 });   // 30
    const c2 = makeTemplate({ base_time_min: 20, difficulty: 2 });   // 40
    expect(calcTotalCoin([c1, c2])).toBe(70);
  });

  it('rounds fractional results', () => {
    const c = makeTemplate({ base_time_min: 20, difficulty: 2.5 });  // 50.0
    expect(calcTotalCoin([c])).toBe(50);
  });

  it('returns 0 for empty array', () => {
    expect(calcTotalCoin([])).toBe(0);
  });

  it('uses Math.round (not floor or ceil)', () => {
    // 10 * 1.5 = 15.0 → round → 15
    const c = makeTemplate({ base_time_min: 10, difficulty: 1.5 });
    expect(calcTotalCoin([c])).toBe(15);
  });
});
