// wishClarify — 孩子端許願樹的澄清問答。
//
// 孩子只丟一句話（例如「足球」），這支負責判斷還需不需要再問一題把
// 願望搞清楚。最多兩輪，選項式作答為主（也留自由輸入，跟任務端的
// `analyzeTask.clarificationQuestion` 不同——那邊是單輪旗標，這邊要真的
// 來回）。問完或問滿兩題後整理成家長要看的結構化資訊，**幣值只是建議**，
// 最終價格由家長在核可時另外決定，這支不寫 `coin_cost`。
//
// 任何解析失敗（模型輸出格式不對、逾時、額度用盡）一律 fallback 成
// 「不追問、直接整理」，不讓孩子卡在許願流程裡。

import { callGemini, parseJson } from './gemini.ts';

export type WishClarifyHistoryTurn = { question: string; answer: string };

export type WishClarifyResult =
  | { done: false; question: string; options: string[] }
  | {
      done: true;
      shortTitle: string;
      wishType: 'item' | 'privilege';
      reason: string;
      summary: string;
      suggestedCoins: number;
      confirmNeeded: string[];
    };

/**
 * 去掉「我想要」「我想」這類開頭贅詞，當作 AI 沒給／給的不能用時的保底標題。
 * 只處理最常見的開頭語，抓不到就把整句話截短——寧可保守也不要編內容。
 */
function stripWishFillerPrefix(text: string): string {
  const stripped = text.trim().replace(/^(我想要|我想|我要|想要|我希望|希望)/, '').trim();
  return (stripped || text.trim()).slice(0, 24);
}

function wishClarifyFallback(wishText: string): WishClarifyResult {
  return {
    done: true,
    shortTitle: stripWishFillerPrefix(wishText),
    wishType: 'item',
    reason: wishText,
    summary: wishText,
    suggestedCoins: 40,
    confirmNeeded: [],
  };
}

export async function handleWishClarify(payload: {
  wishText: string;
  ageGroup: string;
  history?: WishClarifyHistoryTurn[];
}): Promise<WishClarifyResult> {
  const wishText = (payload.wishText ?? '').trim();
  if (!wishText) return wishClarifyFallback(wishText);

  // 只信任呼叫端傳來的前兩輪——多的一律丟棄，不能靠塞歷史硬凹出第三題。
  const history = (payload.history ?? []).slice(0, 2);
  const mustFinalize = history.length >= 2;

  const historyLines = history.length > 0
    ? history.map((h, i) => `第${i + 1}題「${h.question}」孩子選了「${h.answer}」`).join('\n')
    : '（還沒問過任何問題）';

  const prompt = `你是一棵陪孩子許願的許願樹，個性溫暖、有點童趣。孩子（年齡段 ${payload.ageGroup}）剛剛許了一個願望：「${wishText}」

之前的問答：
${historyLines}

你的任務：判斷需不需要再問一個問題，把這個願望搞清楚（它是什麼、孩子想拿來做什麼、大概值多少幣值）。
規則：
- 最多再問 1 題，問過的不要重複問。${mustFinalize ? '已經問過兩題了，這次不能再問，必須直接整理結果（done=true）。' : ''}
- 問題要用孩子聽得懂的口吻，一句話，10 個字以內，不要出現「資訊不足」「審核」「評分」「AI」這些字。
- 一定要給 2-4 個簡短選項（每個選項 6 個字以內），不要開放式提問，孩子只能點選項。
- 如果願望已經夠清楚，或已經問滿兩題，就直接整理：
  1. shortTitle：把願望濃縮成一個乾淨的短標題，去掉「我想要」「我想」這類贅詞與語助詞，2-10 個字，家長一眼要看得懂在講什麼（例如「我想要去朋友家玩」→「去朋友家玩」）。
  2. 判斷是「item」(實體物品) 還是「privilege」(活動/特權，例如多玩一下、晚一點睡)。
  3. 寫一句孩子原因的整理、一句給家長看的摘要。
  4. 建議幣值（15-200，5的倍數，參考：小物品15-40、中等物品/活動40-90、較大目標90-200）。
  5. 家長可能還要另外確認的事（最多 3 項，例如「尺寸」「預算上限」「安全性」，沒有就給空陣列）。

只回傳以下兩種 JSON 其中一種，不要其他文字：
沒問完："done":false,"question":"...","options":["...","...","..."]
整理完了："done":true,"shortTitle":"去朋友家玩","wishType":"item","reason":"孩子的原因整理成一句話","summary":"給家長看的整理摘要","suggestedCoins":40,"confirmNeeded":["..."]`;

  try {
    const raw = await callGemini(prompt, true);
    const parsed = parseJson<Record<string, unknown>>(raw);

    if (parsed.done === true) {
      const wishType = parsed.wishType === 'privilege' ? 'privilege' as const : 'item' as const;
      const shortTitle = typeof parsed.shortTitle === 'string' && parsed.shortTitle.trim()
        ? parsed.shortTitle.trim().slice(0, 24) : stripWishFillerPrefix(wishText);
      const reason = typeof parsed.reason === 'string' && parsed.reason.trim()
        ? parsed.reason.trim().slice(0, 60) : wishText;
      const summary = typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim().slice(0, 80) : wishText;
      const coinsRaw = typeof parsed.suggestedCoins === 'number' ? parsed.suggestedCoins : 40;
      const suggestedCoins = Math.min(200, Math.max(15, Math.round(coinsRaw / 5) * 5));
      const confirmNeeded = Array.isArray(parsed.confirmNeeded)
        ? parsed.confirmNeeded
            .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
            .map(c => c.trim().slice(0, 12))
            .slice(0, 3)
        : [];
      return { done: true, shortTitle, wishType, reason, summary, suggestedCoins, confirmNeeded };
    }

    if (parsed.done === false && !mustFinalize) {
      const question = typeof parsed.question === 'string' ? parsed.question.trim().slice(0, 40) : '';
      const options = Array.isArray(parsed.options)
        ? parsed.options
            .filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
            .map(o => o.trim().slice(0, 12))
            .slice(0, 4)
        : [];
      if (question && options.length >= 2) {
        return { done: false, question, options };
      }
    }
  } catch (err) {
    console.warn('[ai-proxy] handleWishClarify error:', err);
  }

  return wishClarifyFallback(wishText);
}
