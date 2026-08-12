import { supabase } from './supabase';
import type { TaskCategory } from '../types/database';

async function invokeAiProxy<T>(type: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: { type, payload },
  });
  if (error) throw error;
  return data as T;
}

export type ClassifyTaskResult = {
  category: TaskCategory;
  base_time_min: number;
  difficulty: number;
  reason: string;
};

/**
 * Classifies a task name into Task-A/B/C/D and estimates base_time_min and difficulty.
 * Falls back to category='B', base_time_min=5, difficulty=1.0 on any error.
 */
export async function classifyTask(taskName: string): Promise<ClassifyTaskResult> {
  const fallback: ClassifyTaskResult = { category: 'B', base_time_min: 5, difficulty: 1.0, reason: '預設分類' };
  try {
    const result = await invokeAiProxy<ClassifyTaskResult>('classifyTask', { taskName });
    if (!['A', 'B', 'C', 'D'].includes(result.category)) return fallback;
    return result;
  } catch (err) {
    console.warn('[aiAgent.classifyTask] fallback due to error:', err);
    return fallback;
  }
}

/**
 * Generates a gentle suggestion for a parent when a child fails a task 3+ days in a row.
 * Uses WF-5 generate-degradation-suggestion for richer DB context.
 * Falls back to a template string on any error.
 */
export async function generateDegradeSuggestion(
  taskName: string,
  age: number,
  days: number,
): Promise<string> {
  const fallback = `「${taskName}」連續 ${days} 天未完成，可以試著和孩子討論是否調整難度或時間。`;
  try {
    const { data, error } = await supabase.functions.invoke('generate-degradation-suggestion', {
      body: { taskName, age, days },
    });
    if (error) throw error;
    return (data as { suggestion: string }).suggestion || fallback;
  } catch (err) {
    console.warn('[aiAgent.generateDegradeSuggestion] fallback due to error:', err);
    return fallback;
  }
}

export type ScreenRedemptionResult = {
  verdict: 'ok' | 'high';
  reason: string;
  suggestedCoins: number | null;
};

/**
 * Screens a child's redemption request via ai-proxy Edge Function.
 * Falls back to threshold-based defaults on any error.
 */
export async function screenRedemptionRequest(
  rewardName: string,
  coinCost: number,
  description?: string | null,
): Promise<ScreenRedemptionResult> {
  const fallback: ScreenRedemptionResult = (() => {
    if (coinCost <= 100) {
      return { verdict: 'ok', reason: '幣值合理，符合孩子目前的獲幣速度。', suggestedCoins: null };
    }
    const suggestedCoins = Math.round((coinCost * 0.65) / 5) * 5;
    return { verdict: 'high', reason: `幣值偏高，建議調整至 ${suggestedCoins} 幣左右。`, suggestedCoins };
  })();

  try {
    return await invokeAiProxy<ScreenRedemptionResult>('screenRedemptionRequest', {
      rewardName,
      coinCost,
      description: description ?? null,
    });
  } catch (err) {
    console.warn('[aiAgent.screenRedemptionRequest] fallback due to error:', err);
    return fallback;
  }
}

export type SuggestTaskCoinResult = {
  coins: number;
  reason: string;
};

/**
 * Suggests a per-completion coin reward for a parent-created task (range 1–50).
 * Falls back to 10 coins on any error.
 */
export async function suggestTaskCoin(taskName: string): Promise<SuggestTaskCoinResult> {
  const fallback: SuggestTaskCoinResult = { coins: 10, reason: '預設建議幣值' };
  try {
    return await invokeAiProxy<SuggestTaskCoinResult>('suggestTaskCoin', { taskName });
  } catch (err) {
    console.warn('[aiAgent.suggestTaskCoin] fallback due to error:', err);
    return fallback;
  }
}

export type AnalyzeTaskInput = {
  taskName: string;
  childAgeGroup: '2-4' | '4-6' | '6-9' | '9-12';
  taskSource?: 'parent' | 'child' | 'negotiated' | 'system';
  durationType?: 'single' | 'recurring' | 'long_term';
  frequency?: string | null;
  duplicateOfExisting?: boolean;
  exceedsFrequency?: boolean;
};

/** 規則引擎的算幣結果（見 supabase/functions/ai-proxy/coinPolicy.ts）。 */
export type TaskPricing =
  | { status: 'priced'; coins: number; band: string; policyVersion: string }
  | { status: 'coin_disabled'; reason?: string }
  | { status: 'gated' }
  | { status: 'unpriced'; reason: string; band: string; policyVersion: string };

export type AnalyzeTaskResult = {
  category: TaskCategory;
  reason: string;
  coinEnabled: boolean;
  rewardMode: 'life_progress' | 'family_contribution' | 'coin_or_time';
  estimatedMinutes?: number;
  difficulty?: 'easy' | 'standard' | 'hard';
  payout?: { payoutBasis: string; claimPeriod: string; maxClaimsPerPeriod: number };
  pricing: TaskPricing;
  blockingIssues: string[];
  requiresConfirmation: string[];
  warnings: string[];
  clarificationQuestion: string | null;
  policyVersion: string;
};

/**
 * 新版任務分析：AI 只做結構化理解，資格閘門與幣值由規則引擎決定。
 * 取代 suggestTaskCoin 的架構（後者保留供舊畫面相容）。
 * 任何錯誤時 fallback 成「需家長確認、不自動發幣」的安全狀態。
 */
export async function analyzeTask(input: AnalyzeTaskInput): Promise<AnalyzeTaskResult> {
  const fallback: AnalyzeTaskResult = {
    category: 'C',
    reason: 'AI 分析失敗，請家長手動確認任務類別與幣值。',
    coinEnabled: false,
    rewardMode: 'coin_or_time',
    pricing: { status: 'gated' },
    blockingIssues: [],
    requiresConfirmation: ['AI 分析暫時無法使用，請家長手動設定'],
    warnings: [],
    clarificationQuestion: null,
    policyVersion: 'fallback',
  };
  try {
    return await invokeAiProxy<AnalyzeTaskResult>('analyzeTask', { ...input });
  } catch (err) {
    console.warn('[aiAgent.analyzeTask] fallback due to error:', err);
    return fallback;
  }
}

export type SuggestRewardCoinResult = {
  coins: number;
  reason: string;
};

/**
 * Suggests a coin cost for a parent-proposed reward item (range 15–200).
 * Falls back to 40 coins on any error.
 */
export async function suggestRewardCoin(rewardName: string): Promise<SuggestRewardCoinResult> {
  const fallback: SuggestRewardCoinResult = { coins: 40, reason: '預設建議幣值' };
  try {
    return await invokeAiProxy<SuggestRewardCoinResult>('suggestRewardCoin', { rewardName });
  } catch (err) {
    console.warn('[aiAgent.suggestRewardCoin] fallback due to error:', err);
    return fallback;
  }
}

export type AdvisorScheduleCandidate = {
  taskId: string;
  taskName: string;
  claimPeriod: 'day' | 'week';
  maxClaimsPerPeriod: number;
  completedThisWeek: number;
};

export type AdvisorRecurrenceCandidate = {
  taskId: string;
  taskName: string;
  recurrenceDays: number[];
  completedWeekdays: number[];
};

/**
 * 顧問聊天可能附帶的建議動作。跟週報一樣，taskId 與星期幾一律由後端從候選清單
 * 帶出，不採信 AI 自己編的值（見 supabase/functions/ai-proxy/index.ts 的
 * validateAdvisorSuggestedAction）。
 */
export type AdvisorSuggestedAction =
  | {
      kind: 'adjust_schedule';
      taskId: string;
      taskName: string;
      currentClaimPeriod: 'day' | 'week';
      currentMaxClaimsPerPeriod: number;
      suggestedClaimPeriod: 'day' | 'week';
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

export type AdvisorChatInput = {
  childName: string;
  question: string;
  doneToday: number;
  totalToday: number;
  todayTasks?: { name: string; status: string; rewardKind: 'coins' | 'time' | null }[];
  /** 過去 7 天（不含今天）逐日完成的任務名稱，讓顧問答得出「這禮拜」的問題。 */
  weekHistory?: { dateLabel: string; tasks: string[] }[];
  longTermSummary: { name: string; progressPct: number }[];
  history?: { role: 'parent' | 'ai'; text: string }[];
  /** 這個孩子這週可能值得調整的任務候選清單，讓顧問偶爾能附帶可套用的建議。 */
  scheduleCandidates?: AdvisorScheduleCandidate[];
  recurrenceCandidates?: AdvisorRecurrenceCandidate[];
};

export type AdvisorChatResult = {
  reply: string;
  suggestedAction: AdvisorSuggestedAction | null;
};

/**
 * 家長端「AI 教養顧問」自由問答——只餵入畫面上本來就會顯示的彙總資料，
 * 由 Gemini 產生溫暖白話的回覆，偶爾附帶一個可套用的建議動作。任何錯誤都
 * fallback 成誠實的「暫時無法回答」訊息、不帶建議，不會假裝回答或編造數字。
 */
export async function chatWithAdvisor(input: AdvisorChatInput): Promise<AdvisorChatResult> {
  try {
    const result = await invokeAiProxy<AdvisorChatResult>('advisorChat', { ...input });
    return {
      reply: result.reply || '目前想不到合適的回覆，可以換個方式問問看嗎？',
      suggestedAction: result.suggestedAction ?? null,
    };
  } catch (err) {
    console.warn('[aiAgent.chatWithAdvisor] fallback due to error:', err);
    return { reply: 'AI 顧問暫時連不上，晚點再試試看，或直接看下面的本週紀錄。', suggestedAction: null };
  }
}

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

/** 去掉「我想要」「我想」這類開頭贅詞，當作 ai-proxy 完全連不上時的保底標題。 */
function stripWishFillerPrefix(text: string): string {
  const stripped = text.trim().replace(/^(我想要|我想|我要|想要|我希望|希望)/, '').trim();
  return (stripped || text.trim()).slice(0, 24);
}

/**
 * 保底整理。**不能因為連不上 ai-proxy 就把孩子已經回答過的內容丟掉**——
 * 跟 supabase/functions/ai-proxy/wishClarify.ts 的 wishClarifyFallback
 * 是同一套邏輯（各自維護一份，理由見 aiAgent.ts 檔頭：client 端不能
 * import Deno 專用的檔案）。
 */
function wishClarifyFallback(wishText: string, history: WishClarifyHistoryTurn[] = []): WishClarifyResult {
  const shortTitle = stripWishFillerPrefix(wishText);
  const answerText = history.map(h => h.answer.trim()).filter(Boolean).join('、');
  const hasDurationOrFrequencyAnswer = history.some(h => /分鐘|小時|次|天/.test(h.answer));
  return {
    done: true,
    shortTitle,
    wishType: hasDurationOrFrequencyAnswer ? 'privilege' : 'item',
    reason: (answerText ? `${wishText}（${answerText}）` : wishText).slice(0, 60),
    summary: (answerText ? `${shortTitle}，${answerText}` : wishText).slice(0, 80),
    suggestedCoins: 40,
    confirmNeeded: answerText ? ['請家長確認詳細內容並輸入金額'] : [],
  };
}

/**
 * 許願樹的澄清問答：孩子丟一句話願望，AI 判斷要不要再問一題（選項式，最多兩輪），
 * 問完後整理成家長要看的結構化資訊。幣值只是建議，不是最終價格。
 *
 * 任何錯誤（含格式不對的回應）一律 fallback 成「不追問、直接整理」，
 * 讓許願流程永遠有路可走，不會把孩子卡在問答裡。
 */
export async function clarifyWish(
  wishText: string,
  ageGroup: string,
  history: WishClarifyHistoryTurn[],
): Promise<WishClarifyResult> {
  try {
    const result = await invokeAiProxy<WishClarifyResult>('wishClarify', { wishText, ageGroup, history });
    if (result.done === false) {
      if (typeof result.question === 'string' && result.question.trim() && Array.isArray(result.options) && result.options.length >= 2) {
        return result;
      }
      return wishClarifyFallback(wishText, history);
    }
    if (result.done === true && result.summary) {
      return { ...result, shortTitle: result.shortTitle?.trim() || stripWishFillerPrefix(wishText) };
    }
    return wishClarifyFallback(wishText, history);
  } catch (err) {
    console.warn('[aiAgent.clarifyWish] fallback due to error:', err);
    return wishClarifyFallback(wishText, history);
  }
}

export type SuggestTaskRewardAmountInput = {
  taskTitle: string;
  ageGroupLabel: string;
  categoryLabel: string;
  estimatedMinutes?: number;
  difficultyLabel?: string;
  /** 規則引擎（coinPolicy）算出的建議值與允許範圍——AI 只在這個範圍內微調。 */
  suggestedAmount: number;
  minAllowed: number;
  maxAllowed: number;
};

export type SuggestTaskRewardAmountResult =
  | { status: 'ok'; amount: number; reason: string }
  | { status: 'unavailable' };

/**
 * 任務抽屜幣值卡的「AI 建議」：在規則引擎算好的範圍內，讓 AI 給一個微調值與理由。
 *
 * amount 一律 clamp 到 [minAllowed, maxAllowed]——即使 Gemini 回傳範圍外的數字，
 * 這裡也不會吐出來。這不是唯一一層防護：家長按下「採用」之後，數字還會流進
 * evaluateTaskReward 再 clamp 一次，那一層才是真正決定送進資料庫的金額。
 *
 * 任何錯誤都回 unavailable，不偷偷拿 suggestedAmount 充當「AI 建議」——
 * 那樣家長會以為 AI 真的看過這個任務，其實只是規則引擎的數字被貼了層標籤。
 */
export async function suggestTaskRewardAmount(
  input: SuggestTaskRewardAmountInput,
): Promise<SuggestTaskRewardAmountResult> {
  try {
    const result = await invokeAiProxy<{ amount: unknown; reason: unknown }>(
      'suggestTaskRewardAmount',
      { ...input },
    );
    if (typeof result.amount !== 'number' || !Number.isFinite(result.amount)) {
      return { status: 'unavailable' };
    }
    const amount = Math.min(input.maxAllowed, Math.max(input.minAllowed, Math.round(result.amount)));
    return { status: 'ok', amount, reason: typeof result.reason === 'string' ? result.reason : '' };
  } catch (err) {
    console.warn('[aiAgent.suggestTaskRewardAmount] unavailable due to error:', err);
    return { status: 'unavailable' };
  }
}

export type WeeklyInsightSummary = {
  completionRate: number;
  totalTimeSavedMin: number;
  overrideCount: number;
};

/**
 * Weekly insights are now generated server-side by WF-3 generate-weekly-report.
 * This stub is kept for backward compatibility but should not be called directly.
 */
export async function generateWeeklyInsight(
  _summary: WeeklyInsightSummary,
): Promise<string> {
  return '';
}
