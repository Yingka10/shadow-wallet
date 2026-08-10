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
