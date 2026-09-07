import { readFileSync } from 'fs';
import { join } from 'path';
import {
  computeFallbackRecurrenceSuggestion,
  computeFallbackScheduleSuggestion,
  containsArabicDigit,
  formatWeekdaysZh,
  validateRecurrenceSuggestion,
  validateScheduleSuggestion,
  weeklyFallbackForced,
  WEEKLY_FALLBACK_FLAG,
  LEGACY_FALLBACK_FLAG,
  type RecurrenceCandidate,
  type ScheduleCandidate,
} from '../validators';

// ---------------------------------------------------------------------------
// 週報專用的降級開關
//
// 這一組測的是一件很容易被「共用一個 env 就好」想法弄壞的事：
// ai-proxy 讀 FORCE_AI_FALLBACK，而 Supabase 的 secret 是 project 層級的。
// 如果週報也讀同一個名字，那麼為了讓 Demo 的週報 deterministic 而打開它，
// 就會把孩子提案的 AI 計畫一起關掉 —— 那是 Demo 唯一必須 live 的 AI。
// ---------------------------------------------------------------------------

describe('週報降級開關是專屬的', () => {
  const env = (vars: Record<string, string>) => (name: string) => vars[name];

  it('新旗標打開就降級', () => {
    expect(weeklyFallbackForced(env({ [WEEKLY_FALLBACK_FLAG]: 'true' }))).toBe(true);
  });

  it('什麼都沒設就不降級', () => {
    expect(weeklyFallbackForced(env({}))).toBe(false);
  });

  it('只有字串 true 算數，其他值不算', () => {
    for (const v of ['false', 'TRUE', '1', 'yes', '']) {
      expect(weeklyFallbackForced(env({ [WEEKLY_FALLBACK_FLAG]: v }))).toBe(false);
    }
  });

  it('舊旗標仍然相容 —— 既有 dev workflow 不會突然壞掉', () => {
    expect(weeklyFallbackForced(env({ [LEGACY_FALLBACK_FLAG]: 'true' }))).toBe(true);
  });

  it('新旗標的名字和舊的不同', () => {
    expect(WEEKLY_FALLBACK_FLAG).toBe('FORCE_WEEKLY_REPORT_FALLBACK');
    expect(LEGACY_FALLBACK_FLAG).toBe('FORCE_AI_FALLBACK');
    expect(WEEKLY_FALLBACK_FLAG).not.toBe(LEGACY_FALLBACK_FLAG);
  });

  it('ai-proxy 完全不讀新旗標 —— 設它不可能關掉提案 AI', () => {
    const dir = join(__dirname, '..', '..', 'ai-proxy');
    for (const file of ['gemini.ts', 'index.ts']) {
      expect(readFileSync(join(dir, file), 'utf8')).not.toContain(WEEKLY_FALLBACK_FLAG);
    }
  });

  it('週報 Function 用的是這支純函式，不是自己讀一次 env', () => {
    const index = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');
    expect(index).toContain('weeklyFallbackForced');
    // 只有 validators.ts 可以出現旗標字面值；index.ts 透過 import 拿。
    expect(index).not.toContain(`'${WEEKLY_FALLBACK_FLAG}'`);
  });
});

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

  // 真實線上案例（2026-09-07）：候選是「每天最多 1 次」，Gemini 回
  // 「每週最多 2 次」並在文案裡寫成「放寬上限」。舊版只比數字（2 > 1）就放行，
  // 家長畫面上出現「目前：每天最多 1 次 → 建議：每週最多 2 次」，
  // 而那其實是把每週 7 次砍成 2 次 —— 收緊被講成放寬。
  it('回歸：換算成一週最多幾次再比 —— 每天 1 次改成每週 2 次是收緊，必須拒絕', () => {
    const result = validateScheduleSuggestion(
      { taskId: 'task-1', body: 'x', actionLabel: 'x', suggestedClaimPeriod: 'week', suggestedMaxClaimsPerPeriod: 2 },
      [scheduleCandidate], // day / 1 = 每週 7 次
    );
    expect(result).toBeNull();
  });

  it('每天 1 次改成每週 8 次是真的放寬，接受', () => {
    const result = validateScheduleSuggestion(
      { taskId: 'task-1', body: 'x', actionLabel: 'x', suggestedClaimPeriod: 'week', suggestedMaxClaimsPerPeriod: 8 },
      [scheduleCandidate],
    );
    expect(result?.suggestedClaimPeriod).toBe('week');
    expect(result?.suggestedMaxClaimsPerPeriod).toBe(8);
  });

  it("候選是 'once' 時不比較 —— 整個任務期間的總量跟週期性上限沒有共同單位", () => {
    const result = validateScheduleSuggestion(
      { taskId: 'task-1', body: 'x', actionLabel: 'x', suggestedClaimPeriod: 'week', suggestedMaxClaimsPerPeriod: 99 },
      [{ ...scheduleCandidate, claimPeriod: 'once' as const }],
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

describe('containsArabicDigit', () => {
  it('detects an Arabic digit anywhere in the string', () => {
    expect(containsArabicDigit('這週完成了 4 項任務')).toBe(true);
    expect(containsArabicDigit('第3次做到了')).toBe(true);
    expect(containsArabicDigit('100%')).toBe(true);
  });

  it('returns false for text with no Arabic digits, including Chinese numerals', () => {
    expect(containsArabicDigit('這週辛苦了，繼續保持！')).toBe(false);
    expect(containsArabicDigit('做了好幾次，非常棒')).toBe(false);
    expect(containsArabicDigit('第三次也做到了')).toBe(false);
  });
});
