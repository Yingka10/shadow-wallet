/**
 * Pure validation + deterministic-fallback logic for weekly-report schedule/recurrence
 * suggestions — no Deno APIs, no network calls. Kept separate from index.ts (which reads
 * Deno.env and calls Deno.serve at module scope) so this file can be imported and
 * unit-tested under Jest/Node as well as Deno.
 */

export type ScheduleClaimPeriod = 'day' | 'week' | 'once';

/** A task that hit its claim-frequency cap this week — a candidate for a schedule-adjustment suggestion. */
export type ScheduleCandidate = {
  taskId: string;
  taskName: string;
  claimPeriod: ScheduleClaimPeriod;
  maxClaimsPerPeriod: number;
  completedThisWeek: number;
};

/**
 * A fixed-days task where the child completed it on fewer weekdays than it's
 * scheduled for — a candidate for narrowing recurrence_days. Weekday numbers
 * follow the project convention: 0=Sunday..6=Saturday.
 */
export type RecurrenceCandidate = {
  taskId: string;
  taskName: string;
  recurrenceDays: number[];
  completedWeekdays: number[];
};

export type ScheduleSuggestion = {
  taskId: string;
  body: string;
  actionLabel: string;
  currentClaimPeriod: ScheduleClaimPeriod;
  currentMaxClaimsPerPeriod: number;
  suggestedClaimPeriod: ScheduleClaimPeriod;
  suggestedMaxClaimsPerPeriod: number;
} | null;

/**
 * 天數由後端決定性算出（見 RecurrenceCandidate），Gemini 只需要挑 taskId 並寫文案 —
 * 不採信、也不要求它回傳任何跟星期幾有關的欄位。
 */
export type RecurrenceSuggestion = {
  taskId: string;
  body: string;
  actionLabel: string;
} | null;

export const CLAIM_PERIOD_LABEL_ZH: Record<ScheduleClaimPeriod, string> = {
  day: '每天', week: '每週', once: '整個任務期間',
};

// 專案慣例：0=週日..6=週六。顯示時固定週一排到週日。
export const WEEKDAY_ZH: Record<number, string> = { 0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function formatWeekdaysZh(days: number[]): string {
  const sorted = [...days].sort((a, b) => WEEKDAY_DISPLAY_ORDER.indexOf(a) - WEEKDAY_DISPLAY_ORDER.indexOf(b));
  return `週${sorted.map(d => WEEKDAY_ZH[d]).join('、')}`;
}

/**
 * Gemini can only be trusted to pick a taskId from the candidate list we gave it —
 * never to invent one. Anything that doesn't match a real candidate, or proposes a
 * cap that isn't actually larger than today's, is dropped rather than written to DB.
 */
export function validateScheduleSuggestion(
  raw: unknown,
  candidates: ScheduleCandidate[],
): ScheduleSuggestion {
  if (raw == null || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.taskId !== 'string' || typeof s.body !== 'string' || typeof s.actionLabel !== 'string') return null;
  if (s.suggestedClaimPeriod !== 'day' && s.suggestedClaimPeriod !== 'week') return null;
  if (typeof s.suggestedMaxClaimsPerPeriod !== 'number' || !Number.isInteger(s.suggestedMaxClaimsPerPeriod) || s.suggestedMaxClaimsPerPeriod <= 0) return null;

  const candidate = candidates.find(c => c.taskId === s.taskId);
  if (!candidate) return null;
  if (s.suggestedMaxClaimsPerPeriod <= candidate.maxClaimsPerPeriod) return null;

  return {
    taskId: s.taskId,
    body: s.body,
    actionLabel: s.actionLabel,
    currentClaimPeriod: candidate.claimPeriod,
    currentMaxClaimsPerPeriod: candidate.maxClaimsPerPeriod,
    suggestedClaimPeriod: s.suggestedClaimPeriod as ScheduleClaimPeriod,
    suggestedMaxClaimsPerPeriod: s.suggestedMaxClaimsPerPeriod,
  };
}

/**
 * Same trust boundary as validateScheduleSuggestion, but stricter: we don't even
 * parse day-of-week values out of Gemini's response — the exact days always come
 * from the matched candidate (computed deterministically from real completion
 * data), never from the model.
 */
export function validateRecurrenceSuggestion(
  raw: unknown,
  candidates: RecurrenceCandidate[],
): RecurrenceSuggestion {
  if (raw == null || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.taskId !== 'string' || typeof s.body !== 'string' || typeof s.actionLabel !== 'string') return null;

  const candidate = candidates.find(c => c.taskId === s.taskId);
  if (!candidate) return null;

  return {
    taskId: s.taskId,
    body: s.body,
    actionLabel: s.actionLabel,
  };
}

/** Deterministic version of the schedule suggestion: pick the most-hit candidate, raise its cap by 1. */
export function computeFallbackScheduleSuggestion(
  candidates: ScheduleCandidate[],
): ScheduleSuggestion {
  if (candidates.length === 0) return null;
  const top = [...candidates].sort((a, b) => b.completedThisWeek - a.completedThisWeek)[0];
  const newMax = top.maxClaimsPerPeriod + 1;
  return {
    taskId: top.taskId,
    body: `「${top.taskName}」這週已經達到次數上限，孩子似乎想做得更多，`
      + `可以考慮從目前${CLAIM_PERIOD_LABEL_ZH[top.claimPeriod]}最多 ${top.maxClaimsPerPeriod} 次，調整為最多 ${newMax} 次。`,
    actionLabel: '放寬次數',
    currentClaimPeriod: top.claimPeriod,
    currentMaxClaimsPerPeriod: top.maxClaimsPerPeriod,
    suggestedClaimPeriod: top.claimPeriod,
    suggestedMaxClaimsPerPeriod: newMax,
  };
}

/** Deterministic version of the recurrence-days suggestion: pick the candidate with the fewest actual days done. */
export function computeFallbackRecurrenceSuggestion(
  candidates: RecurrenceCandidate[],
): RecurrenceSuggestion {
  if (candidates.length === 0) return null;
  const top = [...candidates].sort((a, b) => a.completedWeekdays.length - b.completedWeekdays.length)[0];
  return {
    taskId: top.taskId,
    body: `「${top.taskName}」目前排定在${formatWeekdaysZh(top.recurrenceDays)}，`
      + `但這週實際只有在${formatWeekdaysZh(top.completedWeekdays)}完成，`
      + `可以考慮把排定日縮小到孩子實際做得到的那幾天，減少沒完成的壓力。`,
    actionLabel: '調整排定日',
  };
}
