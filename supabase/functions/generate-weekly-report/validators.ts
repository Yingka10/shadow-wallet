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

// ---------------------------------------------------------------------------
// Growth lines — multi-line weekly aggregation (2026-08 改版)
//
// GrowBook 沿用既有的 canonical task purpose（A/B/C/D），不另創第二套分類。
// 這裡只是把同一批 category 換成給家長看的生活化名稱，並且把「這一類這週
// 有沒有活動、達不達得到自己的節奏」整理成可以直接顯示、也可以餵給 AI 的
// 結構化事實 —— counts/target/reminded 這些 code 算得出來的東西，不問 AI。
// ---------------------------------------------------------------------------

export type TaskCategory = 'A' | 'B' | 'C' | 'D';

/** 給家長看的生活化名稱。資料來源仍是既有 canonical purpose，不是新分類。 */
export const GROWTH_LINE_LABEL: Record<TaskCategory, string> = {
  A: '生活與自我管理',
  B: '家庭參與與關係',
  C: '自主目標與興趣',
  D: '學習與技能',
};

export type GrowthLineStatus = 'stable' | 'watch' | 'needs_discussion';

/** 一個類別這週的原始事實——全部由 code 算，AI 不參與這一步。 */
export type CategoryWeeklyFacts = {
  category: TaskCategory;
  /** 這週這個類別「所有任務」實際完成次數（不分有沒有週目標）。 */
  done: number;
  /**
   * 這個類別「一週該做幾次」的目標，取這個類別裡所有 schedule_mode='weekly_frequency'
   * 任務的 weekly_frequency 加總。null 代表這個類別本來就沒有週目標概念
   * （例如只有 one_time/fixed_days 任務）——這時候不判斷達不達標，只看有沒有活動。
   */
  weeklyTarget: number | null;
  /**
   * 這週「有週目標的那些任務」自己的完成次數——只能拿這個跟 weeklyTarget 比。
   * 不能用 done（可能混了同類別裡沒有週目標的其他任務），不然一個類別裡只要
   * 有一個任務剛好有週目標，其他任務的完成次數會被誤算進「達標與否」，
   * 判斷結果會失真。weeklyTarget 是 null 時這欄一定也是 0，沒有意義。
   */
  targetDone: number;
  /** 這週這個類別的完成紀錄裡，start_mode='reminded' 的筆數。 */
  remindedCount: number;
  /** 這週實際完成過的任務名稱（可重複，同一任務做兩次會出現兩次）。 */
  completedTaskNames: string[];
};

export type WeeklyGrowthLine = {
  key: TaskCategory;
  label: string;
  status: GrowthLineStatus;
  /** 1-3 條、可由 facts 直接支持的敘述，可以含數字（這裡不是 AI 自由文字）。 */
  facts: string[];
  /** 一句話。deterministic 版本先填規則產生的句子，AI 可用同一批 facts 改寫得更自然。 */
  summary: string;
};

/**
 * status 判斷規則：
 *   沒有週目標，或這週已達標／超過 → stable（不是「有任務就要有建議」）。
 *   有週目標、沒達標、但這週沒有 reminded 訊號 → watch（節奏慢一點，先觀察）。
 *   有週目標、沒達標、而且這週有 reminded 訊號 → needs_discussion（值得一起看看）。
 * 只用「達標與否」不夠——一個任務沒做滿但都是孩子自己開始的，跟另一個沒做滿
 * 又常常要提醒的，不該給一樣的緊急程度。
 */
export function computeGrowthLineStatus(facts: CategoryWeeklyFacts): GrowthLineStatus {
  if (facts.weeklyTarget != null && facts.targetDone < facts.weeklyTarget) {
    return facts.remindedCount > 0 ? 'needs_discussion' : 'watch';
  }
  return 'stable';
}

function buildCategoryFacts(facts: CategoryWeeklyFacts): string[] {
  const lines: string[] = [];
  lines.push(
    facts.weeklyTarget != null
      ? `本週目標 ${facts.weeklyTarget} 次，完成 ${facts.targetDone} 次`
      : `本週完成 ${facts.done} 次`,
  );
  if (facts.remindedCount > 0) {
    lines.push(`其中 ${facts.remindedCount} 次是提醒後才開始的`);
  }
  const uniqueNames = [...new Set(facts.completedTaskNames)];
  if (uniqueNames.length > 0) {
    lines.push(`實際做的事：${uniqueNames.join('、')}`);
  }
  return lines.slice(0, 3);
}

/** AI 不可用時也要能顯示的規則版一句話——跟 computeFallbackInsight 同一個降級哲學。 */
function deterministicLineSummary(status: GrowthLineStatus): string {
  switch (status) {
    case 'stable':
      return '本週有持續完成紀錄。';
    case 'watch':
      return '本週節奏比平常慢一點。';
    case 'needs_discussion':
      return '這條線這週值得一起看看。';
  }
}

/**
 * 本週完全沒有活動的類別直接不產生線，不當成缺失顯示——
 * 6-9 歲的孩子本週沒有生活常規任務排定，不代表有問題，是 Task-A 政策現況本來就會發生的事。
 */
export function buildGrowthLines(categoryFacts: CategoryWeeklyFacts[]): WeeklyGrowthLine[] {
  return categoryFacts
    .filter(f => f.done > 0)
    .map(f => {
      const status = computeGrowthLineStatus(f);
      return {
        key: f.category,
        label: GROWTH_LINE_LABEL[f.category],
        status,
        facts: buildCategoryFacts(f),
        summary: deterministicLineSummary(status),
      };
    });
}

/**
 * 挑本週最值得討論的一條：needs_discussion 優先於 watch，都沒有就不挑
 * （全部 stable 時，focusLineKey 就該是 undefined，不用硬湊一條出來講）。
 * 同一個優先層有多條時取第一條——避免每次重新整理排序不穩定。
 */
export function pickFocusLine(lines: WeeklyGrowthLine[]): TaskCategory | undefined {
  return lines.find(l => l.status === 'needs_discussion')?.key
    ?? lines.find(l => l.status === 'watch')?.key
    ?? undefined;
}
