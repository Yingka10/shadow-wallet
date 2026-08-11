/**
 * Pure validation logic for AI-proxy suggested actions — no Deno APIs, no network calls.
 * Kept separate from index.ts (which calls Deno.serve at module scope) so this file can
 * be imported and unit-tested under Jest/Node as well as Deno.
 */

export type ScheduleClaimPeriod = 'day' | 'week';

/** A task that hit its claim-frequency cap this week — a candidate for a schedule-adjustment suggestion. */
export type AdvisorScheduleCandidate = {
  taskId: string;
  taskName: string;
  claimPeriod: ScheduleClaimPeriod;
  maxClaimsPerPeriod: number;
  completedThisWeek: number;
};

/** A fixed-days task completed on fewer weekdays than it's scheduled for. */
export type AdvisorRecurrenceCandidate = {
  taskId: string;
  taskName: string;
  recurrenceDays: number[];
  completedWeekdays: number[];
};

export type AdvisorSuggestedAction =
  | {
      kind: 'adjust_schedule';
      taskId: string;
      taskName: string;
      currentClaimPeriod: ScheduleClaimPeriod;
      currentMaxClaimsPerPeriod: number;
      suggestedClaimPeriod: ScheduleClaimPeriod;
      suggestedMaxClaimsPerPeriod: number;
      actionLabel: string;
    }
  | {
      kind: 'adjust_recurrence';
      taskId: string;
      taskName: string;
      currentRecurrenceDays: number[];
      suggestedRecurrenceDays: number[];
      actionLabel: string;
    }
  | { kind: 'create_task'; suggestedTitle: string; actionLabel: string };

export const CLAIM_PERIOD_LABEL_ZH: Record<ScheduleClaimPeriod, string> = { day: '每天', week: '每週' };
export const WEEKDAY_ZH: Record<number, string> = { 0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function formatWeekdaysZh(days: number[]): string {
  const sorted = [...days].sort((a, b) => WEEKDAY_DISPLAY_ORDER.indexOf(a) - WEEKDAY_DISPLAY_ORDER.indexOf(b));
  return `週${sorted.map(d => WEEKDAY_ZH[d]).join('、')}`;
}

/**
 * Gemini can only be trusted to pick a taskId from the candidate list we gave it —
 * never to invent one, and never to invent the actual weekdays for a recurrence
 * suggestion (those come straight from the matched candidate). Anything that
 * doesn't match, or is out of shape, is dropped — the chat reply still goes through.
 */
export function validateAdvisorSuggestedAction(
  raw: unknown,
  scheduleCandidates: AdvisorScheduleCandidate[],
  recurrenceCandidates: AdvisorRecurrenceCandidate[],
): AdvisorSuggestedAction | null {
  if (raw == null || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;

  if (s.kind === 'adjust_schedule') {
    if (typeof s.taskId !== 'string' || typeof s.actionLabel !== 'string') return null;
    if (s.suggestedClaimPeriod !== 'day' && s.suggestedClaimPeriod !== 'week') return null;
    if (typeof s.suggestedMaxClaimsPerPeriod !== 'number' || !Number.isInteger(s.suggestedMaxClaimsPerPeriod) || s.suggestedMaxClaimsPerPeriod <= 0) return null;
    const candidate = scheduleCandidates.find(c => c.taskId === s.taskId);
    if (!candidate) return null;
    if (s.suggestedMaxClaimsPerPeriod <= candidate.maxClaimsPerPeriod) return null;
    return {
      kind: 'adjust_schedule',
      taskId: candidate.taskId,
      taskName: candidate.taskName,
      currentClaimPeriod: candidate.claimPeriod,
      currentMaxClaimsPerPeriod: candidate.maxClaimsPerPeriod,
      suggestedClaimPeriod: s.suggestedClaimPeriod,
      suggestedMaxClaimsPerPeriod: s.suggestedMaxClaimsPerPeriod,
      actionLabel: s.actionLabel,
    };
  }

  if (s.kind === 'adjust_recurrence') {
    if (typeof s.taskId !== 'string' || typeof s.actionLabel !== 'string') return null;
    const candidate = recurrenceCandidates.find(c => c.taskId === s.taskId);
    if (!candidate) return null;
    return {
      kind: 'adjust_recurrence',
      taskId: candidate.taskId,
      taskName: candidate.taskName,
      currentRecurrenceDays: candidate.recurrenceDays,
      suggestedRecurrenceDays: candidate.completedWeekdays,
      actionLabel: s.actionLabel,
    };
  }

  if (s.kind === 'create_task') {
    if (typeof s.suggestedTitle !== 'string' || typeof s.actionLabel !== 'string') return null;
    const title = s.suggestedTitle.trim();
    if (title.length === 0 || title.length > 40) return null;
    return { kind: 'create_task', suggestedTitle: title, actionLabel: s.actionLabel };
  }

  return null;
}
