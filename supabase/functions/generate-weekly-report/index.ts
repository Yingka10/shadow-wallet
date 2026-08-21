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
import {
  CLAIM_PERIOD_LABEL_ZH,
  buildGrowthLines,
  computeFallbackRecurrenceSuggestion,
  computeFallbackScheduleSuggestion,
  containsArabicDigit,
  formatWeekdaysZh,
  GROWTH_LINE_LABEL,
  pickFocusLine,
  validateRecurrenceSuggestion,
  validateScheduleSuggestion,
  weeklyFallbackForced,
  WEEKLY_FALLBACK_FLAG,
  type CategoryWeeklyFacts,
  type RecurrenceCandidate,
  type RecurrenceSuggestion,
  type ScheduleCandidate,
  type ScheduleClaimPeriod,
  type ScheduleSuggestion,
  type WeeklyGrowthLine,
} from './validators.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!;
// gemini-2.0-flash has free-tier quota 0 on this key (429 RESOURCE_EXHAUSTED);
// gemini-flash-latest (Gemini 3.7 Flash) hit its free-tier RPD limit on 2026-08-20
// (28/20 requests). gemini-3.6-flash had quota but consistently exceeded the
// GEMINI_TIMEOUT_MS budget below. Switched to gemini-3.5-flash-lite (lower
// latency) same day. Re-check quota/latency before switching back.
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

type TaskCategory = 'A' | 'B' | 'C' | 'D';

type WeeklyContext = {
  childId: string;
  familyId: string;
  ageGroup: string;
  motivationLevel: string;
  baumrindType: string | null;
  weekStart: string;
  taskCounts: Record<TaskCategory, { done: number; total: number }>;
  /**
   * 這週實際完成過的任務名稱，依類別分組、去重。給 Gemini 用來把
   * motivation_observation 這類欄位寫具體——「孩子這週在『主動掃地』上很投入」
   * 比「能感受到內心的成長與踏實」更站得住腳，因為前者指得出是哪件事。
   * 只放名稱（字串），不放次數，所以不會踩到「不能出現阿拉伯數字」那條規則。
   */
  completedTaskNamesByCategory: Record<TaskCategory, string[]>;
  /** 這週各成長線的結構化事實 + 已經算好的 status。純資料，AI 不參與這一步。 */
  growthLines: WeeklyGrowthLine[];
  /** 從 growthLines 挑出來、值得一起討論的一條；全部 stable 時是 undefined。 */
  focusLineKey: TaskCategory | undefined;
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

// 沒有這個限制的話，Gemini 端網路卡住時 fetch 可能懸著不回應很久（遠超正常
// TCP timeout），週報永遠生不出來、processChild 的 fallback 也永遠等不到觸發
// 的機會。硬性中斷比等待「自然失敗」快得多、也更可預期。
const GEMINI_TIMEOUT_MS = 8000;

/**
 * 週報的降級開關現在是 `FORCE_WEEKLY_REPORT_FALLBACK`，**不是**
 * `FORCE_AI_FALLBACK` —— 後者 ai-proxy 也讀，而 Supabase 的 secret 是
 * project 層級的，打開它會把 Demo 唯一必須 live 的提案 AI 一起關掉。
 * 判斷邏輯放在 validators.ts（純函式，可在 Jest 下測）。
 */
async function callGemini(prompt: string): Promise<string> {
  if (weeklyFallbackForced((name) => Deno.env.get(name))) {
    throw new Error(`${WEEKLY_FALLBACK_FLAG} enabled — skipping Gemini call`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Gemini timed out after ${GEMINI_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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
  /** 本週重點——一句 headline，不是段落。先事實、再判斷（見 prompt 規則）。 */
  motivation_observation: string;
  /**
   * 針對 ctx.growthLines 裡「不是 stable」的線，AI 可以把 deterministic 的
   * summary 改寫得更自然——key 是 category（A/B/C/D），沒被改寫的線維持
   * buildGrowthLines() 算出來的規則版句子。stable 的線不需要、也不應該被改寫。
   */
  growthLineSummaries: Record<string, string>;
  /** 只針對 focusLineKey 給的最小下一步；沒有 focusLineKey 時應該是空字串。 */
  nextStep: string;
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
  schedule_suggestion: ScheduleSuggestion;
  /**
   * 天數由後端決定性算出（見 RecurrenceCandidate），Gemini 只需要挑 taskId 並寫文案 —
   * 不採信、也不要求它回傳任何跟星期幾有關的欄位。
   */
  recurrence_suggestion: RecurrenceSuggestion;
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
    .map(cat => {
      const names = ctx.completedTaskNamesByCategory[cat];
      const namesPart = names.length > 0 ? `，實際完成的事包括：${names.join('、')}` : '';
      return `- ${CAT_NAMES[cat]}：這週完成 ${ctx.taskCounts[cat].done} 項，本來安排了 ${ctx.taskCounts[cat].total} 項${namesPart}`;
    })
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

  // 每條成長線的結構化事實——已經算好 status，AI 不判斷、不重算，只負責改寫措辭。
  const growthLineLines = ctx.growthLines
    .map(l => `- [${l.key}] ${l.label}（status=${l.status}）：${l.facts.join('；')}`)
    .join('\n');
  const growthLinesSection = ctx.growthLines.length > 0
    ? `\n【這週各條成長線的事實——status 已經算好，不是你決定的，你只負責把它寫得自然】\n${growthLineLines}\n`
    : '\n【這週沒有任何一條成長線有紀錄，還沒有活動可以整理】\n';
  const focusLine = ctx.growthLines.find(l => l.key === ctx.focusLineKey);
  const focusLineSection = focusLine
    ? `\n【本週的 focus line 已經選好，是「${focusLine.label}」（原因：${focusLine.status === 'needs_discussion' ? '沒達到平常節奏，而且常常需要提醒' : '沒達到平常節奏'}）——nextStep 只能針對這一條寫，其他線不用給 nextStep】\n`
    : '\n【這週所有成長線都是 stable，沒有 focus line——nextStep 請填空字串，不要硬找一條來講】\n';

  const prompt = `你是一位溫柔、細心的親職陪伴顧問，正在幫一位家長看懂孩子這一週的狀況。
你的讀者是「家長本人」，不是專業人士，所以說話要像跟一位朋友聊他的孩子一樣自然、有溫度。

GrowBook 的核心價值：同一個孩子同時有好幾條不同的成長線。你的工作是「先把每一條的事實整理清楚，再幫家長看出這週真正值得注意的是哪一條」——不是每一條都要給建議，多數線穩定的時候，直接說「其他安排先維持即可」就好。

【這週孩子的情況】（以下是給你參考的背景，請不要原封不動抄進回覆裡）
- 孩子年齡大約：${ctx.ageGroup} 歲
- 這位家長平常的教養傾向：${styleLabel}
  （請用這個來拿捏你給建議的方式與語氣，但回覆裡「絕對不要」提到這段描述，也不要出現任何教養分類或理論名詞）
- 這週各方面的完成情況：
${catLines}
- 成長幣：這週賺到 ${ctx.coinIncome} 枚（來自 ${ctx.coinIncomeCount} 次），花掉 ${ctx.coinSpend} 枚（${ctx.coinSpendCount} 次兌換）
${scheduleSection}${recurrenceSection}${growthLinesSection}${focusLineSection}
【非常重要：說話方式】
1. 語氣溫和但**偏觀察式，不是稱讚式**。不要寫「有好好地倒垃圾、洗碗」這種幼兒園式稱讚，改寫成「倒垃圾、洗碗這週都有持續完成紀錄」這種系統整理式的觀察句——講的是「發生了什麼、看得出什麼」，不是「你好棒」。
2. 用生活化的白話，想像你在跟一位不熟教育理論的家長講話。
3. 絕對不要出現任何專有名詞或系統代號，包括但不限於：
   「Task-A / A 類 / B 類」「完成率」「動機類型」「教養風格」「里程碑」「幣值流動」這類詞。
   例如：不要說「里程碑」，改說「一個小目標」；不要說「完成率偏低」，改說「這週做起來比較吃力」。
4. **motivation_observation（headline）要寫成三段，各自負責不同的事，不能只是一句空泛結論：**
   - **第一段：總覽判斷**——這週大致穩不穩定、有沒有一條特別值得留意（如果有 focus line 就直接點名）。
   - **第二段：穩定線的具體依據**——**最多只挑 1-2 條 stable 線當代表**，不要把每一條都寫進去（清單裡標記 stable 的線可能不只 1-2 條，其餘的留給下面的 growth-line 卡片顯示，這裡不用交代完）。用「實際做的事」清單裡的**真實任務名稱**當佐證，寫成類似「OO、OO這週都有持續完成紀錄」。**「沒有 reminded 次數」只能證明「這份紀錄裡沒有提醒訊號」，不能證明「孩子完全不需要提醒」**——沒被記到的事不等於沒發生過。所以某條 stable 線完全沒有提醒訊號時，只能寫「目前沒有明顯需要調整的訊號」這種留有餘地的講法，**不能寫「多數不需要提醒就能順利完成」這種聽起來像是掌握了完整提醒紀錄的話**。沒有任何 stable 線時，這段可以省略。
   - **第三段：focus line 的具體診斷 + 下一步**——這段是全文重點，**只能照 facts 字面講到哪裡，不能多推一步下診斷**：
     · 如果 focus line 是 needs_discussion，正確的講法是「這週沒有完全跟上原本安排，其中有 X 次是在提醒後才開始的」（X 用不精確講法，見規則7）——**這是在轉述兩個事實（沒達標＋出現過提醒），不是在下「問題出在哪一層」的診斷**。**禁止寫「主要卡在『開始』」「這是啟動的問題、不是能力問題」這種聽起來像已經找到 root cause 的話**——事實只夠證明「有一次是提醒後才開始的」，證明不了「所有沒做到的原因都是同一個」。同理**禁止寫「完成的部分不差」這種模糊評價**，事實是什麼就直接照事實講（例如目標次數與完成次數），不要另外加一句形容詞總結。
     · 如果 focus line 是 watch（沒有「提醒」訊號，純粹是完成次數比目標安排少），就直說是「這週做的次數比原本安排少一些」，不要硬套「需要提醒」這種清單裡沒給的訊號上去。
     · 段落最後帶一句下一步方向（例如「其他安排先維持即可，下週可以先看看目前的開始時段或方式是不是合適」）。
   - **全部（或大部分）線都是 stable、沒有 focus line 時**，不要硬湊三段、更不要為了「一定要有建議」硬編一句「可以再多鼓勵孩子」「可以嘗試新方法」這種空話——直接明確講清楚，例如「這週各面向大致維持原本節奏，目前沒有特別需要調整的地方」，一句就好，nextStep 對應填空字串。
8. **只能根據清單裡給的 facts 做判斷，不能自己加因果或心理推論**。清單只給了「completion count / target」「reminded 次數」這兩種事實，禁止在 motivation_observation、growthLineSummaries 裡寫這些清單沒有支持的話：
   「有好好地……」「很棒」「很令人驚喜」「很投入」「很願意」「變得更有責任感」「很自律」「已經養成」「已經內化」「節奏有點慢」「表現很好」「更努力一點就好」——這些詞要嘛是空泛評價、要嘛是清單資料支持不了的動機/人格推論，一律不能用。
   優先改用資料撐得住的講法：「有持續完成紀錄」「多數不需要提醒」「較常需要提醒」「目前主要卡在……」「這週沒有明顯需要調整的地方」「這一條較值得一起看看」。
5. **growthLineSummaries 只能改寫上面清單裡真的列出來的線，key 用 A/B/C/D，不能發明清單以外的線，也不能改變 status（那是算好的，不是你決定）**。改寫時一樣要點出清單裡的具體事實（例如提到的任務名稱、或「常常需要提醒」這種已給的訊號），語氣一樣要偏觀察式、不要用「有好好地」這種稱讚語氣，不能自己加一個沒出現過的原因。
6. **nextStep 最多給一件事、90 字內，只能對應 focus line 給的事實**，不可以是「多陪伴孩子」「保持耐心」這種放諸四海皆準的通用教養建議，措辭跟上面第三段的下一步保持一致。沒有 focus line 就填空字串，不要硬湊。
7. **motivation_observation、growthLineSummaries、nextStep、dialogue、affirmations、suggestions 這幾個給人看的欄位，絕對不要出現任何阿拉伯數字**（次數、天數、幾項、百分比都算）——這些數字畫面上其他地方（growthLines 的 facts）會用真實資料顯示，你這裡寫的數字沒辦法保證跟畫面對得上，一律用不精確但不會出錯的講法代替。**但「不精確」不代表可以誇大或縮小**：facts 給的是「1 次」提醒，就只能用「有一次」「偶爾」這種對應單一次數的講法，不能寫成「好幾次」「常常」「這幾天都」——那些字眼只能用在 facts 真的給多次訊號的時候。方向寧可寫得保守（少講）也不要誇大（多講），因為誇大等於編造家長查不到根據的訊息。只有 schedule_suggestion／recurrence_suggestion 這兩個欄位例外，那裡才需要、也才可以寫具體數字。

請只回傳 JSON（前後不要有任何其他文字或說明）：
{
  "motivation_observation": "本週重點，依照上面規則4寫成三段（總覽／穩定線依據／focus line 診斷+下一步），每段之間用換行分開，總長度約120~200字，不能包含任何數字，不能是空泛鼓勵文，不能是幼兒園式稱讚。",
  "growthLineSummaries": {"A/B/C/D 其中幾個 key，只放上面清單裡真的列出來的線": "改寫過的一句話，不能包含任何數字"},
  "nextStep": "只針對 focus line 的最小下一步，90字內，不能包含任何數字；沒有 focus line 就填空字串",
  "dialogue": "一段家長可以直接對孩子說出口的開場白（3~4句、90字內），用『我』的口吻，先真心肯定這週看到的一件具體小事，再用一個溫柔的開放式問題，邀請孩子聊聊還沒開始或覺得困難的部分。語氣像關心，不像檢討。不能包含任何數字。",
  "suggestions": [
    {"body": "給家長的貼心建議，40~60字、白話、可以馬上做，說明為什麼這樣做對孩子好，不能包含任何數字", "actionLabel": "按鈕文字（5字內）", "action": "adjust_reminder"},
    {"body": "給家長的貼心建議，40~60字、白話、具體，不能包含任何數字", "actionLabel": "按鈕文字（5字內）", "action": "increase_difficulty"},
    {"body": "給家長的貼心建議，40~60字、白話、具體，不能包含任何數字", "actionLabel": "按鈕文字（5字內）", "action": "add_contribution"}
  ],
  "affirmations": [
    "一句家長可以直接傳給孩子的溫暖讚美，25字內，講到具體的事，不能包含任何數字",
    "另一句溫暖讚美，25字內，不能包含任何數字",
    "再一句溫暖讚美，25字內，不能包含任何數字"
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

  // motivation_observation 是報告開頭最顯眼的一段——AI 亂寫的數字最容易被抓包，
  // 寧可整份報告退回 fallback（那邊的數字是真的算出來的），也不要冒風險寫出去。
  if (containsArabicDigit(parsed.motivation_observation)) {
    throw new Error('motivation_observation contains an AI-generated number');
  }

  const safeDialogue = typeof parsed.dialogue === 'string' && !containsArabicDigit(parsed.dialogue)
    ? parsed.dialogue
    : '';
  const safeAffirmations = Array.isArray(parsed.affirmations)
    ? parsed.affirmations.filter((a): a is string => typeof a === 'string' && !containsArabicDigit(a))
    : [];

  // growthLineSummaries：只接受 key 真的出現在這週 growthLines 裡、且沒有數字的改寫。
  // 亂編的 key、含數字的句子，一律不採用——保留 buildGrowthLines() 的規則版 summary。
  const validKeys = new Set(ctx.growthLines.map(l => l.key));
  const rawSummaries = parsed.growthLineSummaries;
  const safeGrowthLineSummaries: Record<string, string> = {};
  if (rawSummaries && typeof rawSummaries === 'object') {
    for (const [key, value] of Object.entries(rawSummaries as Record<string, unknown>)) {
      if (validKeys.has(key as TaskCategory) && typeof value === 'string' && value.trim() !== '' && !containsArabicDigit(value)) {
        safeGrowthLineSummaries[key] = value;
      }
    }
  }

  // nextStep 只有在有 focus line 時才採信；沒有 focus line 卻硬給一句，一律丟掉。
  const safeNextStep = ctx.focusLineKey && typeof parsed.nextStep === 'string' && !containsArabicDigit(parsed.nextStep)
    ? parsed.nextStep
    : '';

  return {
    motivation_observation: parsed.motivation_observation,
    growthLineSummaries: safeGrowthLineSummaries,
    nextStep: safeNextStep,
    dialogue: safeDialogue,
    suggestions: parsed.suggestions,
    affirmations: safeAffirmations,
    task_recommendations: Array.isArray(parsed.task_recommendations) ? parsed.task_recommendations : [],
    schedule_suggestion: validateScheduleSuggestion(parsed.schedule_suggestion, ctx.scheduleCandidates),
    recurrence_suggestion: validateRecurrenceSuggestion(parsed.recurrence_suggestion, ctx.recurrenceCandidates),
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

  // Weakest category = lowest completion rate among categories with at least one task.
  // 只用在 task_recommendations（既有功能，跟 growth line 分開），不影響 headline。
  const weakest = categories
    .filter(c => ctx.taskCounts[c].total > 0)
    .sort((a, b) =>
      (ctx.taskCounts[a].done / ctx.taskCounts[a].total) - (ctx.taskCounts[b].done / ctx.taskCounts[b].total))[0]
    ?? 'B';

  // headline／dialogue／nextStep 現在跟其他線的邏輯共用同一份 growthLines/focusLineKey，
  // AI 掛掉時也不會退回「這週完成了 X/Y 項任務」這種扁平句子——growth line 卡片本身
  // （facts 都是真數字）已經把細節顯示出來了，這裡只需要一句總覽。
  const focusLine = ctx.growthLines.find(l => l.key === ctx.focusLineKey);
  const motivation_observation = ctx.growthLines.length === 0
    ? '這週還沒有任務完成紀錄，可以和孩子一起看看想從哪件事開始。'
    : focusLine
      ? `這週多數安排大致穩定，「${focusLine.label}」這條線比較值得一起看看。`
      : '這週各方面的安排大致穩定，其他安排先維持即可。';

  const dialogue = ctx.growthLines.length === 0
    ? '這週我們還沒開始記錄，我想聽聽看，有沒有你會想試試看的任務？我們可以一起挑一個。'
    : focusLine
      ? `我看到你這週在好幾件事上都有努力，「${focusLine.label}」那邊最近比較常需要提醒，想聽聽看是不是哪裡卡住了？`
      : '這週我有看到你把好幾件事穩穩地做完，這點很棒，想聊聊還有沒有想試試看的新挑戰？';

  const nextStep = focusLine
    ? `下週可以先維持其他安排，針對「${focusLine.label}」一起確認時段或方式是不是需要調整。`
    : '';

  return {
    motivation_observation,
    growthLineSummaries: {},
    nextStep,
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
        suggestion: `「${GROWTH_LINE_LABEL[weakest]}」這週完成率較低，可以和孩子討論是不是任務難度或時間安排需要調整。`,
      },
    ],
    schedule_suggestion: computeFallbackScheduleSuggestion(ctx.scheduleCandidates),
    recurrence_suggestion: computeFallbackRecurrenceSuggestion(ctx.recurrenceCandidates),
  };
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
      .select('task_id, coin_earned, completed_at, start_mode')
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
      ? supabase.from('tasks').select('id, name, category, claim_period, max_claims_per_period, day_type, recurrence_days, schedule_mode, weekly_frequency').in('id', taskIds).eq('is_active', true)
      : Promise.resolve({
          data: [] as {
            id: string; name: string; category: string; claim_period: string; max_claims_per_period: number;
            day_type: string; recurrence_days: number[] | null;
            schedule_mode: string | null; weekly_frequency: number | null;
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
  const completedTaskNamesByCategory: Record<TaskCategory, string[]> = {
    A: [], B: [], C: [], D: [],
  };
  // 這個類別「一週該做幾次」——只加總真的有 weekly_frequency 節奏的任務。
  // 沒有任何這種任務的類別，weeklyTarget 維持 null（不用達標與否判斷這條線）。
  const weeklyTargetByCategory: Record<TaskCategory, number | null> = {
    A: null, B: null, C: null, D: null,
  };
  for (const t of tasksRes.data ?? []) {
    const cat = t.category as TaskCategory;
    taskCounts[cat].total += 1;
    if (completedIds.has(t.id)) {
      taskCounts[cat].done += 1;
      completedTaskNamesByCategory[cat].push(t.name);
    }
    if (t.schedule_mode === 'weekly_frequency' && typeof t.weekly_frequency === 'number') {
      weeklyTargetByCategory[cat] = (weeklyTargetByCategory[cat] ?? 0) + t.weekly_frequency;
    }
  }

  // 這週各類別完成紀錄裡，start_mode='reminded' 的筆數——用來分辨「沒做滿但都是
  // 自己開始」跟「沒做滿而且常常要提醒」，兩者不該給一樣的 status。
  const taskCategoryById = new Map<string, TaskCategory>(
    (tasksRes.data ?? []).map(t => [t.id, t.category as TaskCategory]),
  );
  // 只有這些 task_id 有週目標——targetDone 只能算它們的完成次數，不能算同類別
  // 裡沒有週目標的其他任務，否則「達標與否」會被無關任務的完成次數混進去。
  const weeklyFrequencyTaskIds = new Set(
    (tasksRes.data ?? []).filter(t => t.schedule_mode === 'weekly_frequency').map(t => t.id),
  );
  const remindedCountByCategory: Record<TaskCategory, number> = { A: 0, B: 0, C: 0, D: 0 };
  const targetDoneByCategory: Record<TaskCategory, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const c of completions as { task_id: string; start_mode: string | null }[]) {
    const cat = taskCategoryById.get(c.task_id);
    if (!cat) continue;
    if (c.start_mode === 'reminded') remindedCountByCategory[cat] += 1;
    if (weeklyFrequencyTaskIds.has(c.task_id)) targetDoneByCategory[cat] += 1;
  }

  const categoryFacts: CategoryWeeklyFacts[] = (['A', 'B', 'C', 'D'] as TaskCategory[]).map(cat => ({
    category: cat,
    done: taskCounts[cat].done,
    weeklyTarget: weeklyTargetByCategory[cat],
    targetDone: targetDoneByCategory[cat],
    remindedCount: remindedCountByCategory[cat],
    completedTaskNames: completedTaskNamesByCategory[cat],
  }));
  const growthLines = buildGrowthLines(categoryFacts);
  const focusLineKey = pickFocusLine(growthLines);

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
    completedTaskNamesByCategory,
    coinIncome: earnTxs.reduce((s, t) => s + t.amount, 0),
    coinIncomeCount: earnTxs.length,
    coinSpend: Math.abs(redeemTxs.reduce((s, t) => s + t.amount, 0)),
    coinSpendCount: redeemTxs.length,
    scheduleCandidates,
    recurrenceCandidates,
    growthLines,
    focusLineKey,
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

  // AI（若可用）只被允許改寫 summary 這一句，key／status／facts 全部維持
  // buildGrowthLines() 算好的版本——這是 deterministic 與 AI 分工的實際落地處。
  const finalGrowthLines = growthLines.map(line => ({
    ...line,
    summary: insight.growthLineSummaries[line.key] ?? line.summary,
  }));

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
        growth_lines: finalGrowthLines,
        focus_line_key: focusLineKey ?? null,
        next_step: insight.nextStep ?? '',
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
