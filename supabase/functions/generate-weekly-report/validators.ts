/**
 * Pure validation + deterministic-fallback logic for weekly-report schedule/recurrence
 * suggestions — no Deno APIs, no network calls. Kept separate from index.ts (which reads
 * Deno.env and calls Deno.serve at module scope) so this file can be imported and
 * unit-tested under Jest/Node as well as Deno.
 */

/**
 * 週報專用的降級開關名稱。
 *
 * 為什麼不能沿用 `FORCE_AI_FALLBACK`：**ai-proxy 讀的是同一個名字**
 * （見 supabase/functions/ai-proxy/gemini.ts）。Supabase 的 secret 是
 * project 層級的，所以在 staging 打開 `FORCE_AI_FALLBACK` 只為了讓週報
 * deterministic，會連帶把孩子提案的 AI 計畫草稿一起關掉 —— 而那正是
 * Demo 唯一必須 live 的 AI。
 */
export const WEEKLY_FALLBACK_FLAG = 'FORCE_WEEKLY_REPORT_FALLBACK';

/** 舊名字。既有 dev workflow 還在用，所以保留相容；Demo runner 一律不設它。 */
export const LEGACY_FALLBACK_FLAG = 'FORCE_AI_FALLBACK';

/**
 * 週報是否被要求走 deterministic fallback。
 *
 * 注入 getEnv 而不是直接讀 Deno.env，這個檔案才能在 Jest 下被測到 ——
 * 「新旗標有效、舊旗標仍相容、而且 ai-proxy 不讀新旗標」這三件事
 * 必須是可測的，不能只靠註解宣稱。
 */
export function weeklyFallbackForced(
  getEnv: (name: string) => string | undefined,
): boolean {
  return getEnv(WEEKLY_FALLBACK_FLAG) === 'true'
    || getEnv(LEGACY_FALLBACK_FLAG) === 'true';
}

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
 * motivation_observation／dialogue／affirmations 是 AI 自由生成的敘述文字，
 * 家長看到的數字（幾項、幾次、幾天）一律要跟畫面上其他地方（由 DB 算出來的
 * 統計）一致——AI 生成的數字沒有這個保證，寧可讓這段文字完全不提數字，
 * 也不要冒著跟畫面對不上的風險。schedule_suggestion／recurrence_suggestion
 * 的 body 不用（也不能）套這個檢查：那兩個是唯一被明確要求要寫出具體數字
 * 的欄位，且數字最終會被 validateScheduleSuggestion 換成候選清單裡的真值。
 */
export function containsArabicDigit(text: string): boolean {
  return /[0-9]/.test(text);
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
