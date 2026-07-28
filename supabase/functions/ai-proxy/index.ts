/**
 * ai-proxy — centralized Gemini API proxy.
 * Moves all AI calls server-side so GEMINI_API_KEY is never exposed in the client.
 *
 * Supported `type` values:
 *   classifyTask | suggestTaskCoin | analyzeTask | suggestRewardCoin |
 *   screenRedemptionRequest | suggestCoinWithAI
 */

import {
  runEligibilityGate,
  type AgeGroup as GateAgeGroup,
  type Category,
  type DurationType,
  type TaskSource,
} from './rewardEligibility.ts';
import { calcCoins, defaultPayout, POLICY_VERSION, type AgeGroup, type Difficulty } from './coinPolicy.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!;
const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

// 依序嘗試的 model 鏈：某個配額用盡（429）或不存在（404）時自動換下一個。
// 用 *-latest 別名當首選：它永遠指向 Google 當前可用的 flash，
// 不會被「舊 model 對新用戶下架」咬到（gemini-2.5-flash 已對新 key 下架）。
// 目前 gemini-flash-latest 實際指向 gemini-3.6-flash。
const MODEL_CHAIN = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.0-flash'];

async function callGeminiOnce(prompt: string, model: string, jsonMode: boolean): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
  };
  if (jsonMode) {
    body.generationConfig = { responseMimeType: 'application/json' };
  }

  const res = await fetch(GEMINI_URL(model), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);

  const data = await res.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  return data.candidates[0]?.content.parts[0]?.text ?? '';
}

/**
 * 呼叫 Gemini，依 MODEL_CHAIN 逐一嘗試。
 * 遇到 429（配額）或 404（model 不存在）時換下一個 model；其他錯誤直接拋出。
 */
async function callGemini(prompt: string, jsonMode = false): Promise<string> {
  let lastErr: unknown;
  for (const model of MODEL_CHAIN) {
    try {
      return await callGeminiOnce(prompt, model, jsonMode);
    } catch (err) {
      lastErr = err;
      const msg = String(err);
      if (!msg.includes('429') && !msg.includes('404')) throw err;
      console.warn(`[ai-proxy] model ${model} 失敗，改試下一個：${msg.slice(0, 100)}`);
    }
  }
  throw lastErr;
}

function parseJson<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(cleaned) as T;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleClassifyTask(payload: { taskName: string }) {
  const prompt = `你是一個兒童教養任務分類助手。
根據以下任務名稱，判斷它屬於哪個類別，並估算完成時間和難度。
任務名稱：${payload.taskName}
類別定義：
A = 基本生活自理（刷牙、整理書包）
B = 家庭本分（倒垃圾、洗碗）
C = 超出本分貢獻（照顧弟妹、主動幫忙）
D = 學習成長里程碑（連續練習、學習新技能）
回傳 JSON：{"category":"B","base_time_min":5,"difficulty":1.0,"reason":"這是家庭成員的基本分工"}
只回傳 JSON，不要其他文字。`;

  const raw = await callGemini(prompt);
  const parsed = parseJson<{ category: string; base_time_min: number; difficulty: number; reason: string }>(raw);
  if (!['A', 'B', 'C', 'D'].includes(parsed.category)) {
    return { category: 'B', base_time_min: 5, difficulty: 1.0, reason: '預設分類' };
  }
  return parsed;
}

async function handleSuggestTaskCoin(payload: { taskName: string }) {
  const prompt = `你是一個兒童教養 App 的幣值顧問。
孩子（6-9歲）每週完成所有任務約賺 120-150 幣。
請為以下任務建議每次完成的合理幣值（範圍 1-50 幣）。

任務名稱：${payload.taskName}

參考基準：
- 簡單日常（整理書包、刷牙）：1-5 幣
- 中等家務（倒垃圾、洗碗）：5-15 幣
- 費力貢獻（打掃、照顧弟妹）：15-30 幣
- 學習練習（練琴 30 分鐘）：10-20 幣

reason 請在 40 字以內說明。
只回傳 JSON：{"coins":10,"reason":"說明"}`;

  const raw = await callGemini(prompt, true);
  const parsed = parseJson<{ coins: number; reason: string }>(raw);
  const coins = Math.min(50, Math.max(1, Math.round(parsed.coins)));
  return { coins, reason: parsed.reason ?? '' };
}

/**
 * analyzeTask — 新版任務分析（取代 suggestTaskCoin 的架構）。
 * AI 只做結構化理解，不決定幣值；資格閘門與幣值計算由規則引擎負責。
 * 流程：AI 理解 → runEligibilityGate → calcCoins（見 docs/coin-policy-draft.md）。
 */
async function handleAnalyzeTask(payload: {
  taskName: string;
  childAgeGroup: AgeGroup;
  taskSource?: TaskSource;
  durationType?: DurationType;
  frequency?: string | null;
  duplicateOfExisting?: boolean;
  exceedsFrequency?: boolean;
}) {
  const ageGroup = payload.childAgeGroup;
  const taskSource: TaskSource = payload.taskSource ?? 'parent';
  const durationType: DurationType = payload.durationType ?? 'single';

  // 1. AI 結構化理解（不吐幣值）。難度為列舉、估時為分鐘。
  const prompt = `你是兒童教養 App 的任務理解助手。只「理解」任務，**不要**決定幣值。
任務名稱：${payload.taskName}
孩子年齡段：${ageGroup}
任務來源：${taskSource}（parent=家長提出 / child=孩子提出 / negotiated=親子協商 / system=系統建議）
執行形式：${durationType}

類別定義：
A = 生活常規（刷牙、整理書包）
B = 家庭參與 / 家庭本分（倒垃圾、洗碗等固定家務）
C = 自主挑戰（孩子主動提出、明顯超出本分的額外貢獻）
D = 學習與技能（連續練習、學習新技能、有進步軌跡）

判斷原則：
- 固定家務即使「幫忙」也是 B，不是 C。C 必須是孩子主動提出或親子協商。
- 若獎勵的是單次成績（考一百分），outcomeBased=true。
- 若類別/來源存在歧義，needsClarification=true 並給 clarificationQuestion。

只回傳 JSON：
{"category":"D","alternativeCategory":null,"estimatedMinutes":20,"difficulty":"standard","outcomeBased":false,"needsClarification":false,"clarificationQuestion":null,"reason":"40字內說明"}
difficulty 只能是 easy / standard / hard。`;

  const raw = await callGemini(prompt, true);
  const ai = parseJson<{
    category: Category;
    alternativeCategory: Category | null;
    estimatedMinutes: number;
    difficulty: Difficulty;
    outcomeBased: boolean;
    needsClarification: boolean;
    clarificationQuestion: string | null;
    reason: string;
  }>(raw);

  // 2. 資格閘門（八步）。
  const gate = runEligibilityGate({
    category: ai.category,
    alternativeCategory: ai.alternativeCategory,
    ageGroup: ageGroup as GateAgeGroup,
    taskSource,
    durationType,
    outcomeBased: ai.outcomeBased,
    needsClarification: ai.needsClarification,
    clarificationQuestion: ai.clarificationQuestion,
    duplicateOfExisting: payload.duplicateOfExisting,
    exceedsFrequency: payload.exceedsFrequency,
  });

  // 3. A/B 或被閘門擋下 → 不算幣，回傳資格結果。
  if (!gate.coinEnabled || gate.gateBlocked) {
    return {
      category: ai.category,
      reason: ai.reason,
      coinEnabled: gate.coinEnabled,
      rewardMode: gate.rewardMode,
      pricing: { status: gate.coinEnabled ? 'gated' : 'coin_disabled' as const },
      blockingIssues: gate.blockingIssues,
      requiresConfirmation: gate.requiresConfirmation,
      warnings: gate.warnings,
      clarificationQuestion: gate.clarificationQuestion,
      policyVersion: POLICY_VERSION,
    };
  }

  // 4. C/D 通過 → 規則引擎算幣（placeholder 未填時回 unpriced，不亂猜）。
  const calc = calcCoins(ageGroup, ai.category as 'C' | 'D', ai.estimatedMinutes, ai.difficulty);

  return {
    category: ai.category,
    reason: ai.reason,
    coinEnabled: true,
    rewardMode: gate.rewardMode,
    estimatedMinutes: ai.estimatedMinutes,
    difficulty: ai.difficulty,
    payout: defaultPayout(),
    pricing: calc,
    blockingIssues: gate.blockingIssues,
    requiresConfirmation: gate.requiresConfirmation,
    warnings: gate.warnings,
    clarificationQuestion: null,
    policyVersion: POLICY_VERSION,
  };
}

async function handleSuggestRewardCoin(payload: { rewardName: string }) {
  const prompt = `你是一個兒童教養 App 的幣值顧問。
孩子（6-9歲）每週賺取約 120-150 幣，用來兌換獎勵。
請為以下獎勵建議合理的兌換幣值（範圍 15-200 幣）。

獎勵名稱：${payload.rewardName}

參考基準：
- 小確幸（多 15 分看電視、選擇晚餐菜色）：15-30 幣
- 中等獎勵（看一場電影、買一本繪本）：40-80 幣
- 較大目標（出遊、特別體驗）：80-150 幣

reason 請在 40 字以內說明。
只回傳 JSON：{"coins":40,"reason":"說明"}`;

  const raw = await callGemini(prompt, true);
  const parsed = parseJson<{ coins: number; reason: string }>(raw);
  const coins = Math.min(200, Math.max(15, Math.round(parsed.coins / 5) * 5));
  return { coins, reason: parsed.reason ?? '' };
}

async function handleScreenRedemptionRequest(payload: {
  rewardName: string;
  coinCost: number;
  description?: string | null;
}) {
  const prompt = `你是家庭教養 App 的幣值審核助手。
孩子（6-9歲）每週透過完成任務賺取約 120-150 幣。

孩子的兌換申請：
- 獎勵名稱：${payload.rewardName}
- 幣值：${payload.coinCost} 幣
${payload.description ? `- 補充說明：${payload.description}` : ''}

請判斷這個幣值是否合理，以繁體中文回覆。
- "ok"：幣值合理（2個月內可達成）
- "high"：幣值偏高（超過2個月才能達成）

若 verdict 為 "high"，suggestedCoins 給出建議幣值（5的倍數）；否則為 null。
reason 請在 60 字以內，直接說明。
只回傳 JSON：{"verdict":"ok","reason":"說明文字","suggestedCoins":null}`;

  try {
    const raw = await callGemini(prompt, true);
    const parsed = parseJson<{ verdict: string; reason: string; suggestedCoins: number | null }>(raw);
    if (!['ok', 'high'].includes(parsed.verdict)) throw new Error('invalid verdict');
    return parsed;
  } catch {
    // Fallback: threshold-based
    if (payload.coinCost <= 100) {
      return { verdict: 'ok', reason: '幣值合理，符合孩子目前的獲幣速度。', suggestedCoins: null };
    }
    const suggestedCoins = Math.round((payload.coinCost * 0.65) / 5) * 5;
    return { verdict: 'high', reason: `幣值偏高，建議調整至 ${suggestedCoins} 幣左右。`, suggestedCoins };
  }
}

/**
 * handleAdvisorChat — 家長端「AI 教養顧問」自由問答。
 * 只餵入家長端畫面本來就會顯示、或家長打開紀錄頁就查得到的資料
 * （今日任務清單、過去 7 天逐日完成紀錄、長期任務進度），不碰孩子的
 * 原始逐筆時間戳記或任何隱私細節——顧問看得到的東西跟家長一樣多。
 */
async function handleAdvisorChat(payload: {
  childName: string;
  question: string;
  doneToday: number;
  totalToday: number;
  todayTasks?: { name: string; status: string; rewardKind: 'coins' | 'time' | null }[];
  weekHistory?: { dateLabel: string; tasks: string[] }[];
  longTermSummary: { name: string; progressPct: number }[];
  history?: { role: 'parent' | 'ai'; text: string }[];
}) {
  const STATUS_LABEL: Record<string, string> = {
    done: '已完成',
    pending: '待完成',
    missed: '沒做到',
    review: '待家長確認',
  };
  const taskLines = (payload.todayTasks ?? []).length > 0
    ? (payload.todayTasks ?? [])
        .map(t => `- ${t.name}（${STATUS_LABEL[t.status] ?? t.status}）`)
        .join('\n')
    : '（今天沒有排定任務）';

  const weekLines = (payload.weekHistory ?? []).length > 0
    ? (payload.weekHistory ?? [])
        .map(d => `- ${d.dateLabel}：${d.tasks.join('、')}`)
        .join('\n')
    : '（過去 7 天沒有其他完成紀錄）';

  const ltLines = payload.longTermSummary.length > 0
    ? payload.longTermSummary.map(i => `- ${i.name}：進度 ${Math.round(i.progressPct)}%`).join('\n')
    : '（目前沒有進行中的長期任務）';

  const historyLines = (payload.history ?? [])
    .slice(-6)
    .map(h => `${h.role === 'parent' ? '家長' : '顧問'}：${h.text}`)
    .join('\n');

  const prompt = `你是一位溫柔、細心的親職陪伴顧問，正在跟一位家長聊聊孩子「${payload.childName}」的狀況。你就是家長身邊的助手，不是在幫某個系統代言。

孩子的任務是自己回報完成的，實際情況可能比你手上的紀錄更豐富。你能看到的資料如下，看不到的部分（例如逐筆完成時間、孩子的原話）就別假裝知道、也別提到「系統」「資料庫」「我看得到的資料」這類詞——需要提醒家長資訊有限時，用「這幾天還沒特別看到相關紀錄」「可以再多留意一下」這種自然口吻帶過就好，不要解釋原因或提到任何技術性字眼。

目前可參考的資料：
- 今日任務完成：${payload.doneToday}/${payload.totalToday}
- 今日任務清單：
${taskLines}
- 過去 7 天完成紀錄（不含今天）：
${weekLines}
- 長期任務進度：
${ltLines}

${historyLines ? `之前的對話：\n${historyLines}\n` : ''}
家長現在問：「${payload.question}」

回覆規則：
1. 全程用溫暖、體貼、鼓勵的白話繁體中文，不要出現「Task-A」「B類」這種代號或專有名詞。
2. 100 字以內，簡短直接回答問題，不需要重述資料。
3. 只根據上面給的資料回答，不要編造數字或具體事件；資料不夠判斷時自然帶過（見上），不要提「系統」「資料庫」「目前只記錄到」這類字眼，也不要交代資料從哪裡來。
4. 不要用條列式或標題，用一般說話的口吻，像朋友聊天，不要像在報告或客服回覆。
5. 只回傳回覆內容本身，不要加引號或其他格式。`;

  const reply = await callGemini(prompt);
  return { reply: reply.trim() };
}

async function handleSuggestCoinWithAI(payload: { rewardName: string }) {
  const prompt = `你是一個家庭教養 App 的幣值顧問。
這個 App 使用「幣」作為虛擬貨幣。孩子（6-9歲）每週透過完成家務賺取約 120-150 幣。
家長想設定一個兌換目標：「${payload.rewardName}」
請根據這個獎品的相對吸引力，建議一個合適的幣值（60-200 幣之間）。
回應 JSON（不含其他文字）：{ "coins": number, "weeks": number, "reason": string }`;

  const raw = await callGemini(prompt, true);
  return parseJson<{ coins: number; weeks: number; reason: string }>(raw);
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { type, payload } = await req.json() as { type: string; payload: Record<string, unknown> };

    let result: unknown;

    switch (type) {
      case 'classifyTask':
        result = await handleClassifyTask(payload as { taskName: string });
        break;
      case 'suggestTaskCoin':
        result = await handleSuggestTaskCoin(payload as { taskName: string });
        break;
      case 'analyzeTask':
        result = await handleAnalyzeTask(payload as {
          taskName: string;
          childAgeGroup: AgeGroup;
          taskSource?: TaskSource;
          durationType?: DurationType;
          frequency?: string | null;
          duplicateOfExisting?: boolean;
          exceedsFrequency?: boolean;
        });
        break;
      case 'suggestRewardCoin':
        result = await handleSuggestRewardCoin(payload as { rewardName: string });
        break;
      case 'screenRedemptionRequest':
        result = await handleScreenRedemptionRequest(
          payload as { rewardName: string; coinCost: number; description?: string | null },
        );
        break;
      case 'suggestCoinWithAI':
        result = await handleSuggestCoinWithAI(payload as { rewardName: string });
        break;
      case 'advisorChat':
        result = await handleAdvisorChat(payload as {
          childName: string;
          question: string;
          doneToday: number;
          totalToday: number;
          todayTasks?: { name: string; status: string; rewardKind: 'coins' | 'time' | null }[];
          weekHistory?: { dateLabel: string; tasks: string[] }[];
          longTermSummary: { name: string; progressPct: number }[];
          history?: { role: 'parent' | 'ai'; text: string }[];
        });
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unknown type: ${type}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[ai-proxy] error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
