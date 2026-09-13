jest.mock('../supabase', () => ({ supabase: {} }));

import {
  buildRecentCompletedWeeks,
  buildSharedPlanChange,
} from '../advisorRecentContext';

describe('advisorRecentContext', () => {
  it('groups only completed weeks in Taipei time and keeps an empty current week out', () => {
    const weeks = buildRecentCompletedWeeks(
      [
        { task_id: 'read', completed_at: '2026-08-31T13:00:00.000Z', start_mode: 'reminded' },
        { task_id: 'read', completed_at: '2026-09-02T13:00:00.000Z', start_mode: 'self_started' },
        { task_id: 'read', completed_at: '2026-09-08T13:00:00.000Z', start_mode: 'self_started' },
        // 9/14 是 current week，不能跟四個完整週直接相比。
        { task_id: 'read', completed_at: '2026-09-14T13:00:00.000Z', start_mode: 'self_started' },
        // 超過四週窗口。
        { task_id: 'read', completed_at: '2026-08-10T13:00:00.000Z', start_mode: 'self_started' },
      ],
      new Map([['read', '四週閱讀計畫']]),
      '2026-09-14',
    );

    expect(weeks).toEqual([
      {
        weekStart: '2026-08-31',
        weekEnd: '2026-09-06',
        tasks: [{
          taskName: '四週閱讀計畫',
          completedCount: 2,
          selfStartedCount: 1,
          remindedCount: 1,
        }],
      },
      {
        weekStart: '2026-09-07',
        weekEnd: '2026-09-13',
        tasks: [{
          taskName: '四週閱讀計畫',
          completedCount: 1,
          selfStartedCount: 1,
          remindedCount: 0,
        }],
      },
    ]);
  });

  it('describes only confirmed differences between a source and current shared plan', () => {
    const common = {
      cadence_mode: 'weekly_frequency' as const,
      cadence_days: null,
      preferred_time: 'before_bed',
      preferred_time_custom: null,
      duration_days: 14,
      effective_at: null,
      parent_confirmed_at: null,
      created_at: '2026-09-01T00:00:00.000Z',
    };
    const change = buildSharedPlanChange({
      taskName: '閱讀計畫',
      source: {
        ...common,
        id: 'source',
        adopted_from_plan_version_id: null,
        cadence_weekly_frequency: 4,
      },
      current: {
        ...common,
        id: 'current',
        adopted_from_plan_version_id: 'source',
        cadence_weekly_frequency: 3,
        effective_at: '2026-09-03T01:00:00.000Z',
      },
    });

    expect(change).toEqual({
      taskName: '閱讀計畫',
      changedAt: '2026-09-03T01:00:00.000Z',
      changes: ['執行節奏：每週 4 次 → 每週 3 次'],
    });
  });

  it('does not invent a change when the two versions are equivalent', () => {
    const version = {
      id: 'same',
      adopted_from_plan_version_id: null,
      cadence_mode: 'fixed_days' as const,
      cadence_weekly_frequency: null,
      cadence_days: [1, 3, 5],
      preferred_time: 'after_dinner',
      preferred_time_custom: null,
      duration_days: 14,
      effective_at: '2026-09-03T01:00:00.000Z',
      parent_confirmed_at: null,
      created_at: '2026-09-01T00:00:00.000Z',
    };
    expect(buildSharedPlanChange({ taskName: '運動', source: version, current: version })).toBeNull();
  });
});
