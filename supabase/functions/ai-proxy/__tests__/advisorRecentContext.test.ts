import { formatAdvisorRecentContext } from '../advisorRecentContext';

describe('formatAdvisorRecentContext', () => {
  it('formats cross-week facts and a confirmed shared-plan change', () => {
    const result = formatAdvisorRecentContext({
      completedWeeks: [
        {
          weekStart: '2026-08-31',
          weekEnd: '2026-09-06',
          tasks: [{
            taskName: '閱讀計畫',
            completedCount: 1,
            selfStartedCount: 0,
            remindedCount: 1,
          }],
        },
        {
          weekStart: '2026-09-07',
          weekEnd: '2026-09-13',
          tasks: [{
            taskName: '閱讀計畫',
            completedCount: 2,
            selfStartedCount: 1,
            remindedCount: 1,
          }],
        },
      ],
      latestSharedPlanChange: {
        taskName: '閱讀計畫',
        changedAt: '2026-09-03T01:00:00.000Z',
        changes: ['執行節奏：每週 4 次 → 每週 3 次'],
      },
    });

    expect(result).toContain('最近幾個已結束週期');
    expect(result).toContain('閱讀計畫：完成 1 次');
    expect(result).toContain('閱讀計畫：完成 2 次');
    expect(result).toContain('最近一次已確認的共同版本變動');
    expect(result).toContain('每週 4 次 → 每週 3 次');
  });

  it('drops malformed rows instead of stringifying untrusted values', () => {
    const result = formatAdvisorRecentContext({
      completedWeeks: [{ weekStart: {}, weekEnd: '2026-09-13', tasks: [] }],
      latestSharedPlanChange: { taskName: '閱讀', changedAt: null, changes: ['x'] },
    });
    expect(result).toBe('');
  });
});
