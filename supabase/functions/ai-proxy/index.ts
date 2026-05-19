/**
 * ai-proxy — centralized Gemini API proxy.
 * Moves all AI calls server-side so GEMINI_API_KEY is never exposed in the client.
 *
 * Supported `type` values:
 *   classifyTask | suggestTaskCoin | suggestRewardCoin |
 *   screenRedemptionRequest | suggestCoinWithAI
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!;
const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

async function callGemini(prompt: string, model = 'gemini-2.0-flash', jsonMode = false): Promise<string> {
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

  const raw = await callGemini(prompt, 'gemini-2.0-flash', true);
  const parsed = parseJson<{ coins: number; reason: string }>(raw);
  const coins = Math.min(50, Math.max(1, Math.round(parsed.coins)));
  return { coins, reason: parsed.reason ?? '' };
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

  const raw = await callGemini(prompt, 'gemini-2.0-flash', true);
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
    const raw = await callGemini(prompt, 'gemini-2.0-flash', true);
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

async function handleSuggestCoinWithAI(payload: { rewardName: string }) {
  const prompt = `你是一個家庭教養 App 的幣值顧問。
這個 App 使用「幣」作為虛擬貨幣。孩子（6-9歲）每週透過完成家務賺取約 120-150 幣。
家長想設定一個兌換目標：「${payload.rewardName}」
請根據這個獎品的相對吸引力，建議一個合適的幣值（60-200 幣之間）。
回應 JSON（不含其他文字）：{ "coins": number, "weeks": number, "reason": string }`;

  const raw = await callGemini(prompt, 'gemini-1.5-flash', true);
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
