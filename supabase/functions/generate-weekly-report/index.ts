/**
 * generate-weekly-report — AI-powered weekly report workflow.
 *
 * Trigger modes:
 *   - Cron: every Sunday 23:00 Asia/Taipei (UTC 15:00), processes all active families
 *   - HTTP POST {childId}: on-demand regeneration for a specific child
 *
 * Writes to weekly_reports:
 *   - motivation_observation: 2-3 sentence AI insight
 *   - ai_suggestions: JSON { suggestions: [...], affirmations: [...], used_fallback }
 *   - task_adjustments: JSON { recommendations: [...] } (WF-4 appends abandonment_tier here)
 *
 * Degradation (P1-8): if Gemini fails or returns malformed JSON,
 * computeFallbackInsight() produces the same shape from data already fetched
 * for the prompt — no throw ever propagates out of processChild, so a report
 * is always written for the week (MASTER §三).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!;
// gemini-2.0-flash has free-tier quota 0 on this key (429 RESOURCE_EXHAUSTED);
// gemini-flash-latest is the model confirmed to return 200 on this key's free tier.
const GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

type TaskCategory = 'A' | 'B' | 'C' | 'D';

type ScheduleClaimPeriod = 'day' | 'week' | 'once';

/** A task that hit its claim-frequency cap this week — a candidate for a schedule-adjustment suggestion. */
type ScheduleCandidate = {
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
type RecurrenceCandidate = {
  taskId: string;
  taskName: string;
  recurrenceDays: number[];
  completedWeekdays: number[];
};

type WeeklyContext = {
  childId: string;
  familyId: string;
  ageGroup: string;
  motivationLevel: string;
  baumrindType: string | null;
  weekStart: string;
  taskCounts: Record<TaskCategory, { done: number; total: number }>;
  coinIncome: number;
  coinIncomeCount: number;
  coinSpend: number;
  coinSpendCount: number;
  scheduleCandidates: ScheduleCandidate[];
  recurrenceCandidates: RecurrenceCandidate[];
};

// 家長教養傾向的中文說明。只當作「給 AI 參考的背景」，用來拿捏建議口吻；
// prompt 會明確要求 AI 不要把這個分類名詞寫進給家長看的內容裡。
const BAUMRIND_LABELS: Record<string, string> = {
  elite_high_control: '比較重視規矩，同時也給孩子很多關心與回應',
  pragmatic_labor: '對孩子要求較高，日常互動比較務實、少著墨情感',
  guilt_compensate: '要求較寬鬆，但很願意回應孩子的需求',
  free_fatigue: '給孩子很大空間，日常較少主動介入',
};

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  // Empty text = response blocked by safety filter or no candidate returned.
  // Throw (not return '{}') so processChild's catch triggers computeFallbackInsight.
  if (!text || !text.trim()) throw new Error('Gemini returned no text (blocked or empty)');
  return text;
}

type GeminiInsightResult = {
  motivation_observation: string;
  dialogue: string;
  suggestions: Array<{
    body: string;
    actionLabel: string;
    action: 'adjust_reminder' | 'increase_difficulty' | 'add_contribution' | 'adjust_schedule' | 'adjust_recurrence';
    taskId?: string;
    taskName?: string;
    currentClaimPeriod?: ScheduleClaimPeriod;
    currentMaxClaimsPerPeriod?: number;
    suggestedClaimPeriod?: ScheduleClaimPeriod;
    suggestedMaxClaimsPerPeriod?: number;
    currentRecurrenceDays?: number[];
    suggestedRecurrenceDays?: number[];
  }>;
  affirmations: string[];
  task_recommendations: Array<{
    category: string;
    suggestion: string;
  }>;
  schedule_suggestion: {
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
  recurrence_suggestion: {
    taskId: string;
    body: string;
    actionLabel: string;
  } | null;
};

async function generateInsight(ctx: WeeklyContext): Promise<GeminiInsightResult> {
  // 用白話的分類名稱餵給 AI，避免它在輸出裡照抄「Task-A」這種代號。
  const CAT_NAMES: Record<TaskCategory, string> = {
    A: '自己的事自己做（例如刷牙、收書包、整理玩具）',
    B: '幫忙做家事',
    C: '額外的付出與貢獻',
    D: '學習與成長的目標',
  };
  const catLines = (['A', 'B', 'C', 'D'] as TaskCategory[])
    .map(cat => `- ${CAT_NAMES[cat]}：這週完成 ${ctx.taskCounts[cat].done} 項，本來安排了 ${ctx.taskCounts[cat].total} 項`)
    .join('\n');

  const styleLabel = BAUMRIND_LABELS[ctx.baumrindType ?? ''] ?? '沒有特別設定';

  const candidateLines = ctx.scheduleCandidates
    .map((c, i) =>
      `${i + 1}. taskId="${c.taskId}"，任務名稱「${c.taskName}」，`
      + `目前規則是${CLAIM_PERIOD_LABEL_ZH[c.claimPeriod]}最多完成 ${c.maxClaimsPerPeriod} 次，`
      + `這週已經完成 ${c.completedThisWeek} 次（已經到達上限）`)
    .join('\n');
  const scheduleSection = ctx.scheduleCandidates.length > 0
    ? `\n【這週有任務常常一次就做到上限，可能代表孩子想做得更多】\n${candidateLines}\n`
    : '';

  const recurrenceCandidateLines = ctx.recurrenceCandidates
    .map((c, i) =>
      `${i + 1}. taskId="${c.taskId}"，任務名稱「${c.taskName}」，`
      + `目前排定在${formatWeekdaysZh(c.recurrenceDays)}，`
      + `這週實際只有在${formatWeekdaysZh(c.completedWeekdays)}完成`)
    .join('\n');
  const recurrenceSection = ctx.recurrenceCandidates.length > 0
    ? `\n【這週有任務排定的天數比實際做到的天數多】\n${recurrenceCandidateLines}\n`
    : '';

  const prompt = `你是一位溫柔、細心的親職陪伴顧問，正在幫一位家長看懂孩子這一週的狀況。
你的讀者是「家長本人」，不是專業人士，所以說話要像跟一位朋友聊他的孩子一樣自然、有溫度。

【這週孩子的情況】（以下是給你參考的背景，請不要原封不動抄進回覆裡）
- 孩子年齡大約：${ctx.ageGroup} 歲
- 這位家長平常的教養傾向：${styleLabel}
  （請用這個來拿捏你給建議的方式與語氣，但回覆裡「絕對不要」提到這段描述，也不要出現任何教養分類或理論名詞）
- 這週各方面的完成情況：
${catLines}
- 成長幣：這週賺到 ${ctx.coinIncome} 枚（來自 ${ctx.coinIncomeCount} 次），花掉 ${ctx.coinSpend} 枚（${ctx.coinSpendCount} 次兌換）
${scheduleSection}${recurrenceSection}
【非常重要：說話方式】
1. 全程用溫暖、鼓勵、體貼的語氣，多看見孩子的努力，少批評。
2. 用生活化的白話，想像你在跟一位不熟教育理論的家長講話。
3. 絕對不要出現任何專有名詞或系統代號，包括但不限於：
   「Task-A / A 類 / B 類」「完成率」「動機類型」「教養風格」「里程碑」「幣值流動」這類詞。
   例如：不要說「里程碑」，改說「一個小目標」；不要說「完成率偏低」，改說「這週做起來比較吃力」。
4. 內容要具體、要有畫面感，避免空泛的場面話；可以自然帶到上面看到的實際情況。

請只回傳 JSON（前後不要有任何其他文字或說明）：
{
  "motivation_observation": "給家長看的一段觀察，3~5句、溫暖具體，說說這週孩子的狀態、看到的亮點、以及可以多留意的地方。像在跟家長分享，不要說教。",
  "dialogue": "一段家長可以直接對孩子說出口的開場白（3~4句、90字內），用『我』的口吻，先真心肯定這週看到的一件具體小事，再用一個溫柔的開放式問題，邀請孩子聊聊還沒開始或覺得困難的部分。語氣像關心，不像檢討。",
  "suggestions": [
    {"body": "給家長的貼心建議，40~60字，白話、可以馬上做，說明為什麼這樣做對孩子好", "actionLabel": "按鈕文字（5字內）", "action": "adjust_reminder"},
    {"body": "給家長的貼心建議，40~60字，白話、具體", "actionLabel": "按鈕文字（5字內）", "action": "increase_difficulty"},
    {"body": "給家長的貼心建議，40~60字，白話、具體", "actionLabel": "按鈕文字（5字內）", "action": "add_contribution"}
  ],
  "affirmations": [
    "一句家長可以直接傳給孩子的溫暖讚美，25字內，講到具體的事",
    "另一句溫暖讚美，25字內",
    "再一句溫暖讚美，25字內"
  ],
  "task_recommendations": [
    {"category": "B", "suggestion": "針對某一方面給家長的調整建議，40~60字，白話、溫柔、可執行"}
  ],
  "schedule_suggestion": ${
    ctx.scheduleCandidates.length > 0
      ? `{"taskId": "從上面清單挑一個最值得調整的 taskId，原封不動照抄，不要自己編", "body": "給家長的建議，40~60字，白話說明為什麼放寬這個任務的次數上限對孩子好，一定要在句子裡明確寫出「目前每週/每天最多幾次」跟「建議調整成最多幾次」這兩個具體數字，不要只寫「調高一點」「放寬一些」這種模糊講法", "actionLabel": "按鈕文字（5字內）", "suggestedClaimPeriod": "day 或 week 二選一（直接沿用清單裡那個任務目前的規則，不要換成別的週期）", "suggestedMaxClaimsPerPeriod": 一個比目前上限更大的整數}`
      : 'null（這週沒有任務到達次數上限，不用勉強生一個建議，直接填 null）'
  },
  "recurrence_suggestion": ${
    ctx.recurrenceCandidates.length > 0
      ? `{"taskId": "從【這週有任務排定的天數比實際做到的天數多】清單挑一個最值得調整的 taskId，原封不動照抄，不要自己編", "body": "給家長的建議，40~60字，白話說明為什麼把這個任務的排定日縮小到孩子實際做得到的那幾天比較好，不需要在句子裡列出具體是星期幾（系統會自己補上）", "actionLabel": "按鈕文字（5字內）"}`
      : 'null（這週沒有這種任務，不用勉強生一個建議，直接填 null）'
  }
}

補充規則：
- "action" 這個欄位的值只能是 "adjust_reminder"、"increase_difficulty"、"add_contribution" 其中之一（這是系統用的，家長不會看到，照填即可）。
- "category" 這個欄位請填 A、B、C、D 其中一個字母（A=自己的事自己做、B=幫忙家事、C=額外付出、D=學習成長），這也是系統用的，家長不會看到。
- "schedule_suggestion" 只能從【這週有任務常常一次就做到上限】清單裡選一個 taskId，不能自己編一個 id、也不能選清單以外的任務；如果清單是空的，或你覺得沒有哪個任務真的值得調整，就填 null，不要硬湊。
- "suggestedMaxClaimsPerPeriod" 一定要比清單裡寫的「目前上限」大，不要填一樣或更小的數字。
- "recurrence_suggestion" 只能從【這週有任務排定的天數比實際做到的天數多】清單裡選一個 taskId，不能自己編、也不能選清單以外的任務；如果清單是空的就填 null，不要硬湊。這個建議完全不需要你自己判斷是星期幾，具體天數系統會直接從資料算好帶入，你只要負責把 body/actionLabel 寫得溫暖有說服力。
- 除了上面兩個系統欄位，其他所有給人看的文字，一律用溫暖白話的繁體中文，不要出現代號或專有名詞。`;

  const raw = await callGemini(prompt);
  const cleaned = raw.trim().replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
  const parsed = JSON.parse(cleaned) as Partial<GeminiInsightResult>;

  // Validate the shape before trusting it. A syntactically-valid but empty/partial
  // object (e.g. Gemini returned `{}`) must NOT pass silently — throw so the caller
  // falls back to computeFallbackInsight instead of writing a blank report.
  if (
    typeof parsed.motivation_observation !== 'string' ||
    parsed.motivation_observation.trim() === '' ||
    !Array.isArray(parsed.suggestions) ||
    parsed.suggestions.length === 0
  ) {
    throw new Error('Gemini response missing required fields');
  }

  return {
    motivation_observation: parsed.motivation_observation,
    dialogue: typeof parsed.dialogue === 'string' ? parsed.dialogue : '',
    suggestions: parsed.suggestions,
    affirmations: Array.isArray(parsed.affirmations) ? parsed.affirmations : [],
    task_recommendations: Array.isArray(parsed.task_recommendations) ? parsed.task_recommendations : [],
    schedule_suggestion: validateScheduleSuggestion(parsed.schedule_suggestion, ctx.scheduleCandidates),
    recurrence_suggestion: validateRecurrenceSuggestion(parsed.recurrence_suggestion, ctx.recurrenceCandidates),
  };
}

/**
 * Gemini can only be trusted to pick a taskId from the candidate list we gave it —
 * never to invent one. Anything that doesn't match a real candidate, or proposes a
 * cap that isn't actually larger than today's, is dropped rather than written to DB.
 */
function validateScheduleSuggestion(
  raw: unknown,
  candidates: ScheduleCandidate[],
): GeminiInsightResult['schedule_suggestion'] {
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
function validateRecurrenceSuggestion(
  raw: unknown,
  candidates: RecurrenceCandidate[],
): GeminiInsightResult['recurrence_suggestion'] {
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

/**
 * Deterministic, non-AI fallback — used when Gemini fails or returns
 * malformed JSON. Computes the same shape from data already in `ctx`, so the
 * caller (processChild) never needs to change how it consumes the result.
 * This is a safety net, not a creative-writing replacement (MASTER §三:
 * 可降級,AI 失敗仍輸出 deterministic 指標).
 */
function computeFallbackInsight(ctx: WeeklyContext): GeminiInsightResult {
  const categories: TaskCategory[] = ['A', 'B', 'C', 'D'];
  const totalDone = categories.reduce((s, c) => s + ctx.taskCounts[c].done, 0);
  const totalTasks = categories.reduce((s, c) => s + ctx.taskCounts[c].total, 0);
  const completionRate = totalTasks > 0 ? totalDone / totalTasks : 0;

  // Weakest category = lowest completion rate among categories with at least one task.
  const weakest = categories
    .filter(c => ctx.taskCounts[c].total > 0)
    .sort((a, b) =>
      (ctx.taskCounts[a].done / ctx.taskCounts[a].total) - (ctx.taskCounts[b].done / ctx.taskCounts[b].total))[0]
    ?? 'B';

  const motivation_observation = totalTasks === 0
    ? '這週還沒有任務紀錄，可以和孩子一起看看有沒有想嘗試的新任務。'
    : completionRate >= 0.8
      ? `這週完成了 ${totalDone}/${totalTasks} 項任務，表現穩定，是值得肯定的一週。`
      : completionRate >= 0.5
        ? `這週完成了 ${totalDone}/${totalTasks} 項任務，有進展但還有進步空間，可以聊聊卡關的地方。`
        : `這週完成了 ${totalDone}/${totalTasks} 項任務，比較吃力，建議找時間了解孩子這週遇到的狀況。`;

  const dialogue = totalTasks === 0
    ? '這週我們還沒開始記錄，我想聽聽看，有沒有你會想試試看的任務？我們可以一起挑一個。'
    : completionRate >= 0.5
      ? '這週我有看到你把好幾件事慢慢完成，這點很棒。想問問你，這週哪一件事做起來最順、哪一件比較卡？'
      : '這週好像有點吃力，沒關係。我想聽你說說看，這週最難開始的是哪一段？我們一起想辦法。';

  return {
    motivation_observation,
    dialogue,
    suggestions: [
      { body: '確認提醒時間是否符合孩子的作息，太早或太晚都容易被忽略。', actionLabel: '調整提醒', action: 'adjust_reminder' },
      { body: '如果任務常常很快完成，可以試著調高一點難度維持挑戰感。', actionLabel: '調整難度', action: 'increase_difficulty' },
      { body: '找一件孩子擅長的事，鼓勵他多做一點家庭貢獻任務。', actionLabel: '增加任務', action: 'add_contribution' },
    ],
    affirmations: [
      '這週辛苦了，繼續保持！',
      '你的努力我們都看在眼裡。',
      '一步一步來，你做得很好。',
    ],
    task_recommendations: [
      {
        category: weakest,
        suggestion: `Task-${weakest} 這週完成率較低，可以和孩子討論是不是任務難度或時間安排需要調整。`,
      },
    ],
    schedule_suggestion: computeFallbackScheduleSuggestion(ctx.scheduleCandidates),
    recurrence_suggestion: computeFallbackRecurrenceSuggestion(ctx.recurrenceCandidates),
  };
}

/** Deterministic version of the schedule suggestion: pick the most-hit candidate, raise its cap by 1. */
function computeFallbackScheduleSuggestion(
  candidates: ScheduleCandidate[],
): GeminiInsightResult['schedule_suggestion'] {
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
function computeFallbackRecurrenceSuggestion(
  candidates: RecurrenceCandidate[],
): GeminiInsightResult['recurrence_suggestion'] {
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

const CLAIM_PERIOD_LABEL_ZH: Record<ScheduleClaimPeriod, string> = {
  day: '每天', week: '每週', once: '整個任務期間',
};

// 專案慣例：0=週日..6=週六。顯示時固定週一排到週日。
const WEEKDAY_ZH: Record<number, string> = { 0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };
const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
function formatWeekdaysZh(days: number[]): string {
  const sorted = [...days].sort((a, b) => WEEKDAY_DISPLAY_ORDER.indexOf(a) - WEEKDAY_DISPLAY_ORDER.indexOf(b));
  return `週${sorted.map(d => WEEKDAY_ZH[d]).join('、')}`;
}

function getIsoWeekStart(date: Date): string {
  // Get Monday of the ISO week containing `date`
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon...6=Sat
  const diff = (day === 0 ? -6 : 1 - day); // days to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

async function processChild(
  supabase: ReturnType<typeof createClient>,
  childId: string,
  familyId: string,
  weekStart: string,
): Promise<void> {
  // weekStart 是 Asia/Taipei 在地日期（週一）。用 UTC 午夜去解析會早算 8 小時，
  // 讓週一台北時間午夜前後的紀錄被排除在這週範圍外 —— 這裡明確用 +08:00。
  const weekStartDate = new Date(weekStart + 'T00:00:00+08:00');
  const weekEndDate = new Date(weekStartDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weekStartISO = weekStartDate.toISOString();
  const weekEndISO = weekEndDate.toISOString();

  // Fetch child profile + parent baumrind type
  const [profileRes, parentRes, ctRes, completionsRes, walletRes] = await Promise.all([
    supabase.from('child_profiles').select('motivation_level').eq('child_id', childId).single(),
    supabase.from('parents').select('baumrind_type').eq('family_id', familyId).limit(1).single(),
    supabase.from('child_tasks').select('task_id').eq('child_id', childId).eq('is_active', true),
    supabase
      .from('task_completions')
      .select('task_id, coin_earned, completed_at')
      .eq('child_id', childId)
      .gte('completed_at', weekStartISO)
      .lt('completed_at', weekEndISO),
    supabase.from('wallets').select('id').eq('child_id', childId).eq('wallet_type', 'spending').single(),
  ]);

  const taskIds = (ctRes.data ?? []).map(r => r.task_id);
  const completions = completionsRes.data ?? [];
  const walletId = walletRes.data?.id ?? null;

  const [tasksRes, txRes, childRes, existingReportRes] = await Promise.all([
    taskIds.length > 0
      ? supabase.from('tasks').select('id, name, category, claim_period, max_claims_per_period, day_type, recurrence_days').in('id', taskIds).eq('is_active', true)
      : Promise.resolve({
          data: [] as {
            id: string; name: string; category: string; claim_period: string; max_claims_per_period: number;
            day_type: string; recurrence_days: number[] | null;
          }[],
          error: null,
        }),
    walletId
      ? supabase
          .from('transactions')
          .select('amount, type')
          .eq('wallet_id', walletId)
          .in('type', ['earn', 'redeem'])
          .gte('created_at', weekStartISO)
          .lt('created_at', weekEndISO)
      : Promise.resolve({ data: [] as { amount: number; type: string }[], error: null }),
    supabase.from('children').select('age_group').eq('id', childId).single(),
    supabase
      .from('weekly_reports')
      .select('task_adjustments')
      .eq('family_id', familyId)
      .eq('child_id', childId)
      .eq('week_start', weekStart)
      .maybeSingle(),
  ]);

  // Build task counts per category
  const taskCounts: Record<TaskCategory, { done: number; total: number }> = {
    A: { done: 0, total: 0 },
    B: { done: 0, total: 0 },
    C: { done: 0, total: 0 },
    D: { done: 0, total: 0 },
  };
  const completedIds = new Set(completions.map(c => c.task_id));
  const completionCountByTask = new Map<string, number>();
  for (const c of completions) {
    completionCountByTask.set(c.task_id, (completionCountByTask.get(c.task_id) ?? 0) + 1);
  }
  for (const t of tasksRes.data ?? []) {
    const cat = t.category as TaskCategory;
    taskCounts[cat].total += 1;
    if (completedIds.has(t.id)) taskCounts[cat].done += 1;
  }

  // 這週已經達到次數上限的任務 —— 值得問「要不要放寬」的候選。
  // 只讓 Gemini 從這份清單挑，不讓它自己生 taskId（見 validateScheduleSuggestion）。
  const taskRows = (tasksRes.data ?? []) as {
    id: string; name: string; category: string; claim_period: string; max_claims_per_period: number;
    day_type: string; recurrence_days: number[] | null;
  }[];
  const scheduleCandidates: ScheduleCandidate[] = taskRows
    .map((t): ScheduleCandidate => ({
      taskId: t.id,
      taskName: t.name,
      claimPeriod: t.claim_period as ScheduleClaimPeriod,
      maxClaimsPerPeriod: t.max_claims_per_period,
      completedThisWeek: completionCountByTask.get(t.id) ?? 0,
    }))
    .filter((c: ScheduleCandidate) =>
      // 'once' 是「整個任務期間只能做幾次」的單次任務語意，跟這裡「這週建議放寬」
      // 的框架不合，不當候選。
      (c.claimPeriod === 'day' || c.claimPeriod === 'week')
      && c.maxClaimsPerPeriod > 0
      && c.completedThisWeek >= c.maxClaimsPerPeriod)
    .sort((a: ScheduleCandidate, b: ScheduleCandidate) => b.completedThisWeek - a.completedThisWeek)
    .slice(0, 3);

  // 這週排定天數比實際完成天數多的固定星期任務 —— 值得問「要不要縮小排定日」的候選。
  // 天數完全從資料算出來，不讓 Gemini 自己判斷（見 validateRecurrenceSuggestion）。
  const completedWeekdaysByTask = new Map<string, Set<number>>();
  for (const c of completions as { task_id: string; completed_at: string }[]) {
    // Asia/Taipei = UTC+8，先加 8 小時再取星期幾，才不會在日界附近算錯天。
    const taipeiMs = new Date(c.completed_at).getTime() + 8 * 60 * 60 * 1000;
    const weekday = new Date(taipeiMs).getUTCDay(); // 0=週日..6=週六，跟專案慣例一致
    if (!completedWeekdaysByTask.has(c.task_id)) completedWeekdaysByTask.set(c.task_id, new Set());
    completedWeekdaysByTask.get(c.task_id)!.add(weekday);
  }
  const recurrenceCandidates: RecurrenceCandidate[] = taskRows
    .filter(t => t.day_type === 'custom' && Array.isArray(t.recurrence_days) && t.recurrence_days.length > 1)
    .map((t): RecurrenceCandidate => ({
      taskId: t.id,
      taskName: t.name,
      recurrenceDays: t.recurrence_days as number[],
      completedWeekdays: [...(completedWeekdaysByTask.get(t.id) ?? new Set<number>())].sort((a, b) => a - b),
    }))
    .filter(c =>
      c.completedWeekdays.length > 0
      && c.completedWeekdays.length < c.recurrenceDays.length
      && c.completedWeekdays.every(d => c.recurrenceDays.includes(d)))
    .sort((a, b) => a.completedWeekdays.length - b.completedWeekdays.length)
    .slice(0, 2);

  // Build coin flow
  const txData = txRes.data ?? [];
  const earnTxs = txData.filter(t => t.type === 'earn');
  const redeemTxs = txData.filter(t => t.type === 'redeem');

  const ctx: WeeklyContext = {
    childId,
    familyId,
    ageGroup: childRes.data?.age_group ?? '6-9',
    motivationLevel: profileRes.data?.motivation_level ?? 'external',
    baumrindType: parentRes.data?.baumrind_type ?? null,
    weekStart,
    taskCounts,
    coinIncome: earnTxs.reduce((s, t) => s + t.amount, 0),
    coinIncomeCount: earnTxs.length,
    coinSpend: Math.abs(redeemTxs.reduce((s, t) => s + t.amount, 0)),
    coinSpendCount: redeemTxs.length,
    scheduleCandidates,
    recurrenceCandidates,
  };

  let insight: GeminiInsightResult;
  let usedFallback: boolean;
  try {
    insight = await generateInsight(ctx);
    usedFallback = false;
  } catch (err) {
    console.warn(`[generate-weekly-report] AI failed for child ${childId}, using fallback:`, err);
    insight = computeFallbackInsight(ctx);
    usedFallback = true;
  }

  // Preserve abandonment_tier (and any other fields) written by detect-abandonment
  const existingAdjustments =
    (existingReportRes.data?.task_adjustments as Record<string, unknown> | null) ?? {};

  // 把排程建議併進一般建議清單，補上前端要顯示用的任務名稱。
  const scheduleSuggestionEntry = insight.schedule_suggestion == null ? [] : [{
    body: insight.schedule_suggestion.body,
    actionLabel: insight.schedule_suggestion.actionLabel,
    action: 'adjust_schedule' as const,
    taskId: insight.schedule_suggestion.taskId,
    taskName: scheduleCandidates.find(c => c.taskId === insight.schedule_suggestion?.taskId)?.taskName,
    currentClaimPeriod: insight.schedule_suggestion.currentClaimPeriod,
    currentMaxClaimsPerPeriod: insight.schedule_suggestion.currentMaxClaimsPerPeriod,
    suggestedClaimPeriod: insight.schedule_suggestion.suggestedClaimPeriod,
    suggestedMaxClaimsPerPeriod: insight.schedule_suggestion.suggestedMaxClaimsPerPeriod,
  }];

  // 同樣併進去，但天數一律取候選資料算好的值，不用 insight.recurrence_suggestion 裡的任何天數欄位
  // （它本來就沒有——見 validateRecurrenceSuggestion 的設計）。
  const matchedRecurrenceCandidate = recurrenceCandidates.find(c => c.taskId === insight.recurrence_suggestion?.taskId);
  const recurrenceSuggestionEntry = insight.recurrence_suggestion == null || matchedRecurrenceCandidate == null ? [] : [{
    body: insight.recurrence_suggestion.body,
    actionLabel: insight.recurrence_suggestion.actionLabel,
    action: 'adjust_recurrence' as const,
    taskId: insight.recurrence_suggestion.taskId,
    taskName: matchedRecurrenceCandidate.taskName,
    currentRecurrenceDays: matchedRecurrenceCandidate.recurrenceDays,
    suggestedRecurrenceDays: matchedRecurrenceCandidate.completedWeekdays,
  }];

  const allSuggestions = [...insight.suggestions, ...scheduleSuggestionEntry, ...recurrenceSuggestionEntry];

  // Upsert weekly_reports.
  // The error MUST be checked: a swallowed write failure (missing unique index
  // for onConflict, RLS, bad column) would let processChild "succeed" while
  // nothing lands, and the parent UI would show 生成中 forever with no error.
  const { error: upsertErr } = await supabase.from('weekly_reports').upsert(
    {
      family_id: familyId,
      child_id: childId,
      week_start: weekStart,
      motivation_observation: insight.motivation_observation,
      ai_suggestions: {
        suggestions: allSuggestions,
        affirmations: insight.affirmations,
        dialogue: insight.dialogue ?? '',
        used_fallback: usedFallback,
      },
      task_adjustments: {
        ...existingAdjustments,
        recommendations: insight.task_recommendations,
      },
    },
    { onConflict: 'family_id,child_id,week_start' },
  );
  if (upsertErr) {
    throw new Error(`weekly_reports upsert failed for child ${childId}: ${upsertErr.message}`);
  }

  console.log(`[generate-weekly-report] processed child ${childId} week ${weekStart} (fallback=${usedFallback})`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Determine which week to generate for (default: last completed ISO week)
    const now = new Date();
    const lastWeekDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const defaultWeekStart = getIsoWeekStart(lastWeekDate);

    // HTTP mode: single child on-demand
    let targetChildId: string | null = null;
    let weekStart = defaultWeekStart;
    if (req.method === 'POST') {
      try {
        const body = await req.json() as { childId?: string; weekStart?: string };
        targetChildId = body.childId ?? null;
        if (body.weekStart) weekStart = body.weekStart;
      } catch { /* no body = cron mode */ }
    }

    if (targetChildId) {
      // On-demand: generate for specific child
      console.log('[generate-weekly-report] on-demand childId:', targetChildId, 'weekStart:', weekStart);
      const { data: child, error: childErr } = await supabase
        .from('children')
        .select('id, family_id')
        .eq('id', targetChildId)
        .single();
      console.log('[generate-weekly-report] child lookup result:', JSON.stringify(child), 'err:', childErr?.message);
      if (!child) throw new Error(`Child not found: id=${targetChildId} dbErr=${childErr?.message ?? 'none'}`);

      await processChild(supabase, child.id, child.family_id, weekStart);
      return new Response(
        JSON.stringify({ ok: true, childId: targetChildId, weekStart }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Cron mode: process all active children
    const { data: children } = await supabase
      .from('children')
      .select('id, family_id');

    const results = await Promise.allSettled(
      (children ?? []).map(c => processChild(supabase, c.id, c.family_id, defaultWeekStart)),
    );

    const failed = results.filter(r => r.status === 'rejected').length;
    console.log(`[generate-weekly-report] cron done: ${results.length} children, ${failed} failed`);

    return new Response(
      JSON.stringify({ ok: true, total: results.length, failed, weekStart: defaultWeekStart }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[generate-weekly-report] error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
