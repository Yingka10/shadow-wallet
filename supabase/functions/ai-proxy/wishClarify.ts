// wishClarify — 孩子端許願樹的澄清問答。
//
// 孩子只丟一句話（例如「足球」），這支負責判斷還需不需要再問一題把
// 願望搞清楚。最多三輪，選項式作答為主（也留自由輸入，跟任務端的
// `analyzeTask.clarificationQuestion` 不同——那邊是單輪旗標，這邊要真的
// 來回）。問完或問滿三題後整理成家長要看的結構化資訊，**幣值只是建議**，
// 最終價格由家長在核可時另外決定，這支不寫 `coin_cost`。
//
// 問題的重點依優先順序決定，目的是讓家長不只知道「孩子要什麼」，還知道
// 「為什麼要」跟「範圍多大」，避免日後家長和孩子對「這樣算不算」有爭議：
//   1. 型別不明時才問（item 還是 privilege 看不出來）
//   2. 原因──幾乎每次都要問「為什麼想要」，選項給常見動機，讓家長理解動機
//   3. 範圍──依型別而不同：
//        item（要花錢買的東西）      → 問大概多少錢，選項用金額區間 + 不知道
//        privilege（活動/特權）      → 問時長或次數（依願望性質擇一），把界線問死
// 孩子選「不知道」時不代表卡住——照樣整理，但會在 confirmNeeded 裡明講
// 要家長自己填實際金額，家長端本來就有幣值輸入框可以直接填。
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

/**
 * 從孩子已經回答過的內容猜類型：答案裡出現「分鐘/小時/次/天」這類單位，
 * 代表問過的是範圍題（見主 prompt 的 privilege 分支），不太可能是要花錢買的東西。
 * 只在 fallback 時當救急用——正常路徑的 wishType 是 AI 自己判斷的。
 */
function guessWishTypeFromHistory(history: WishClarifyHistoryTurn[]): 'item' | 'privilege' {
  return history.some(h => /分鐘|小時|次|天/.test(h.answer)) ? 'privilege' : 'item';
}

/**
 * 把 wishText 跟孩子已經回答過的內容接成一句話，**不能因為某一步失敗
 * 就把孩子答過的東西全部丟掉**——這支功能的重點就是把範圍問清楚，
 * 問完了卻在整理這一步吞掉答案，等於白問。
 */
function composeFallbackText(wishText: string, history: WishClarifyHistoryTurn[]): {
  reason: string;
  summary: string;
  confirmNeeded: string[];
} {
  const shortTitle = stripWishFillerPrefix(wishText);
  const answerText = history.map(h => h.answer.trim()).filter(Boolean).join('、');
  return {
    reason: (answerText ? `${wishText}（${answerText}）` : wishText).slice(0, 60),
    summary: (answerText ? `${shortTitle}，${answerText}` : wishText).slice(0, 80),
    confirmNeeded: answerText ? ['請家長確認詳細內容並輸入金額'] : [],
  };
}

function wishClarifyFallback(wishText: string, history: WishClarifyHistoryTurn[] = []): WishClarifyResult {
  const { reason, summary, confirmNeeded } = composeFallbackText(wishText, history);
  return {
    done: true,
    shortTitle: stripWishFillerPrefix(wishText),
    wishType: guessWishTypeFromHistory(history),
    reason,
    summary,
    suggestedCoins: 40,
    confirmNeeded,
  };
}

export async function handleWishClarify(payload: {
  wishText: string;
  ageGroup: string;
  history?: WishClarifyHistoryTurn[];
}): Promise<WishClarifyResult> {
  const wishText = (payload.wishText ?? '').trim();
  if (!wishText) return wishClarifyFallback(wishText, []);

  // 只信任呼叫端傳來的前三輪——多的一律丟棄，不能靠塞歷史硬凹出第四題。
  const history = (payload.history ?? []).slice(0, 3);
  const mustFinalize = history.length >= 3;

  const historyLines = history.length > 0
    ? history.map((h, i) => `第${i + 1}題「${h.question}」孩子選了「${h.answer}」`).join('\n')
    : '（還沒問過任何問題）';

  const prompt = `你是一棵陪孩子許願的許願樹，個性溫暖、有點童趣。孩子（年齡段 ${payload.ageGroup}）剛剛許了一個願望：「${wishText}」

之前的問答：
${historyLines}

你的任務：判斷需不需要再問一個問題，把這個願望的「動機」和「範圍」問清楚——不只是它是什麼，而是具體到家長看了就懂孩子為什麼想要、之後也不會為了「這樣算不算」吵起來的程度。

問題依下面的優先順序決定，**每一輪只問一題**，已經問過的主題不要重複問：

【第一優先：型別，只有看不出來才問】
- 如果從願望原句就看得出是要花錢買的東西還是活動/特權，跳過這題。
- 真的看不出來時才問，選項給具體例子，例如「買東西」「出去玩／做某件事」。

【第二優先：原因，幾乎每次都要問】
- 一定要有一題問孩子「為什麼想要」，讓家長理解動機、不是只知道孩子要什麼。
- 選項給常見、孩子好懂的理由，依願望內容挑合適的 3-4 個，例如「同學/朋友都有」「一直想要很久了」「想跟朋友一起玩」「單純喜歡」「特別的日子想慶祝」，可以視願望調整用詞。
- 一樣可以留「其他」或「不知道」選項。

【第三優先：範圍，依型別決定問法】
- item（要花錢買的東西，例如玩具、卡牌、文具）：
  - 問「大概多少錢」，選項一律用金額區間，**不要**要孩子猜一個精確數字（孩子通常猜不出來）：例如「100元以內」「100-300元」「300-500元」。
  - 選項裡一定要多留一個「不知道」，讓孩子誠實回答，不用硬猜。
- privilege（活動或特權，例如出去玩、多看螢幕、晚睡、出去吃飯）：
  - 依願望性質判斷該問「多久」還是「幾次」：
    - 跟「時間長度」有關的（多玩一下、晚睡、去某個地方玩）→ 問要多久，選項給具體時長，例如「30分鐘」「1小時」「2小時」。
    - 跟「次數/頻率」有關的（出去吃飯、去某個地方、買某樣東西）→ 問要幾次，選項給具體次數，例如「1次」「2次」「這個月都可以」。
  - 一樣可以留「不知道」選項。

問題本身要用孩子聽得懂的口吻，一句話，10 個字以內，不要出現「資訊不足」「審核」「評分」「AI」這些字。一定要給 2-4 個簡短選項（每個選項 6 個字以內），不要開放式提問，孩子只能點選項。

最多再問 1 題，依上面的優先順序挑還沒問過、優先度最高的那個主題問；原因和範圍這兩題除非已經在之前的回答裡問過或答案裡已經講清楚，否則都要問到。${mustFinalize ? '已經問過三題了，這次不能再問，必須直接整理結果（done=true）。' : ''}

如果原因和範圍都已經清楚（型別題只在必要時才算），或已經問滿三題，就直接整理：
  1. shortTitle：把願望濃縮成一個乾淨的短標題，去掉「我想要」「我想」這類贅詞與語助詞，2-10 個字，家長一眼要看得懂在講什麼（例如「我想要去朋友家玩」→「去朋友家玩」）。
  2. 判斷是「item」還是「privilege」。
  3. reason／summary 要把問到的原因和範圍都寫進去，不要只重複願望本身（例如「想去朋友家玩，因為想跟朋友一起玩，大概1小時」而不是只寫「想去朋友家玩」）；孩子沒被問到原因或答「不知道」時，reason 就只寫願望本身，不要編造理由。
  4. 建議幣值（15-200，5的倍數）：item 類請依孩子回答的金額區間換算合理幣值（區間越高幣值越高）；privilege 類請依時長或次數換算（時間越長/次數越多幣值越高）；孩子選「不知道」或沒問到這題時，抓一個保守的中間值，不要亂猜高。
  5. confirmNeeded（家長還要另外確認的事，最多 3 項，沒有就給空陣列）：孩子若對金額題答「不知道」，這裡**一定要**包含類似「請家長輸入實際金額」這樣清楚的項目——家長端本來就有幣值輸入框，可以直接填。其餘視情況列（例如「尺寸」「安全性」）。

只回傳以下兩種 JSON 其中一種，不要其他文字：
沒問完："done":false,"question":"...","options":["...","...","..."]
整理完了："done":true,"shortTitle":"去朋友家玩","wishType":"item","reason":"孩子的原因整理成一句話（含動機與範圍）","summary":"給家長看的整理摘要（含動機與範圍）","suggestedCoins":40,"confirmNeeded":["..."]`;

  try {
    const raw = await callGemini(prompt, true);
    const parsed = parseJson<Record<string, unknown>>(raw);

    if (parsed.done === true) {
      const fallbackText = composeFallbackText(wishText, history);
      const wishType = parsed.wishType === 'privilege' ? 'privilege' as const : 'item' as const;
      const shortTitle = typeof parsed.shortTitle === 'string' && parsed.shortTitle.trim()
        ? parsed.shortTitle.trim().slice(0, 24) : stripWishFillerPrefix(wishText);
      const reason = typeof parsed.reason === 'string' && parsed.reason.trim()
        ? parsed.reason.trim().slice(0, 60) : fallbackText.reason;
      const summary = typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim().slice(0, 80) : fallbackText.summary;
      const coinsRaw = typeof parsed.suggestedCoins === 'number' ? parsed.suggestedCoins : 40;
      const suggestedCoins = Math.min(200, Math.max(15, Math.round(coinsRaw / 5) * 5));
      const confirmNeeded = Array.isArray(parsed.confirmNeeded)
        ? parsed.confirmNeeded
            .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
            .map(c => c.trim().slice(0, 12))
            .slice(0, 3)
        : fallbackText.confirmNeeded;
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

    // AI 沒問完卻又不遵守「必須結束」（mustFinalize 時還回 done:false），
    // 或回應形狀不對：不要在這裡再多打一次 Gemini 硬凹，直接用已經收集到
    // 的 history 保底整理——孩子答過的東西還在，不是憑空回到最原始那句話。
    console.warn('[ai-proxy] handleWishClarify unexpected shape, falling back with history:', JSON.stringify(parsed).slice(0, 200));
  } catch (err) {
    console.warn('[ai-proxy] handleWishClarify error:', err);
  }

  return wishClarifyFallback(wishText, history);
}
