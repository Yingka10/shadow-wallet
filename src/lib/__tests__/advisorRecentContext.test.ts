const mockFrom = jest.fn();

jest.mock('../supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import {
  buildAdvisorWeeklyMemories,
  buildRecentCompletedWeeks,
  buildSharedPlanChange,
  loadAdvisorRecentFamilyContext,
} from '../advisorRecentContext';

function queryResult(result: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'lt', 'order', 'not', 'in']) {
    query[method] = jest.fn(() => query);
  }
  query.then = (
    resolve: (value: { data: unknown; error: unknown }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return query;
}

describe('advisorRecentContext', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

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

  it('keeps at most two salient deterministic lines and prioritizes needs_discussion', () => {
    const memories = buildAdvisorWeeklyMemories([
      {
        week_start: '2026-08-10',
        ai_suggestions: {
          growth_lines: [
            { key: 'A', label: '生活自理', status: 'watch', facts: ['A fact'], summary: '不應進入 memory' },
            { key: 'B', label: '家庭參與', status: 'needs_discussion', facts: ['B fact'] },
            { key: 'C', label: '學習與技能', status: 'needs_discussion', facts: ['C fact'] },
            { key: 'D', label: '自主與負責', status: 'watch', facts: ['D fact'] },
          ],
          next_step: '這也是 AI prose，不應進入 memory',
        },
      },
    ], '2026-09-14');

    expect(memories).toEqual([{
      weekStart: '2026-08-10',
      salientLines: [
        { key: 'B', label: '家庭參與', status: 'needs_discussion', facts: ['B fact'] },
        { key: 'C', label: '學習與技能', status: 'needs_discussion', facts: ['C fact'] },
      ],
      allStable: false,
    }]);
    expect(JSON.stringify(memories)).not.toContain('summary');
    expect(JSON.stringify(memories)).not.toContain('next_step');
  });

  it('compresses a fully valid stable week without carrying four lines of prose', () => {
    const growthLines = (['A', 'B', 'C', 'D'] as const).map(key => ({
      key,
      label: `${key} label`,
      status: 'stable',
      facts: [`${key} fact`],
      summary: `${key} summary`,
    }));
    expect(buildAdvisorWeeklyMemories([
      { week_start: '2026-08-03', ai_suggestions: { growth_lines: growthLines } },
    ], '2026-09-14')).toEqual([{
      weekStart: '2026-08-03',
      salientLines: [],
      allStable: true,
    }]);
  });

  it('skips malformed report data and does not falsely call a partially valid week stable', () => {
    const memories = buildAdvisorWeeklyMemories([
      { week_start: '2026-08-03', ai_suggestions: 'bad-json-shape' },
      {
        week_start: '2026-08-10',
        ai_suggestions: {
          growth_lines: [
            { key: 'A', label: '生活自理', status: 'stable', facts: ['ok'] },
            { key: {}, label: '壞資料', status: 'stable', facts: [] },
          ],
        },
      },
    ], '2026-09-14');
    expect(memories).toEqual([]);
  });

  it('uses the 12-week calendar window and excludes the recent four weeks', () => {
    const line = {
      key: 'C', label: '學習與技能', status: 'watch', facts: ['本週先觀察'], summary: '略',
    };
    const memories = buildAdvisorWeeklyMemories([
      { week_start: '2026-06-15', ai_suggestions: { growth_lines: [line] } }, // 12 週以前
      { week_start: '2026-06-22', ai_suggestions: { growth_lines: [line] } }, // 邊界，可用
      { week_start: '2026-08-10', ai_suggestions: { growth_lines: [line] } }, // 較早 memory 最後一週
      { week_start: '2026-08-17', ai_suggestions: { growth_lines: [line] } }, // 最近四週，排除
      { week_start: '2026-09-14', ai_suggestions: { growth_lines: [line] } }, // 當週，排除
    ], '2026-09-14');
    expect(memories.map(memory => memory.weekStart)).toEqual(['2026-06-22', '2026-08-10']);
  });

  it('keeps the other context sources usable when weekly memory query fails', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'weekly_reports') {
        return queryResult({ data: null, error: new Error('weekly reports unavailable') });
      }
      if (table === 'task_completions' || table === 'child_proposals') {
        return queryResult({ data: [], error: null });
      }
      throw new Error(`unexpected table: ${table}`);
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(loadAdvisorRecentFamilyContext('child-1')).resolves.toEqual({
      completedWeeks: [],
      weeklyMemories: [],
      latestSharedPlanChange: null,
    });
    expect(warn).toHaveBeenCalledWith(
      '[advisorRecentContext] weekly memory unavailable:',
      expect.any(Error),
    );
    warn.mockRestore();
  });
});
