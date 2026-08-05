// Shadow Wallet · Parent Tablet — 測試與 prototype 用的假 AI 服務
//
// 本輪 production **不注入任何真的 Gemini service**。
//
// 這支存在的理由和 FakeParentTaskCreationService 一樣：AI 的每一種失敗
// 都要能在測試裡重現。真的接上去之後，timeout 與 unsafe output 這兩種
// 情況幾乎不可能在開發時遇到，但它們正是最需要驗的 ——
// 家長按了「取得調整建議」然後畫面卡住，比沒有這個功能更糟。

import { validateTaskAiRecommendationResult } from './validateTaskAiResult';
import type {
  TaskAiRecommendationInput,
  TaskAiRecommendationResult,
  TaskAiRecommendationService,
  TaskAiSuggestion,
} from './types';

export type FakeAiBehaviour =
  | 'suggestions'
  | 'no_change'
  | 'timeout'
  | 'invalid_response'
  | 'unsafe_output'
  | 'service_error';

const DEFAULT_SUGGESTIONS: TaskAiSuggestion[] = [
  {
    id: 'sug-completion',
    kind: 'clarify_completion',
    fieldPath: 'completionDescription',
    currentValue: null,
    suggestedValue: '把當天讀到的一段講給家人聽',
    rationale: '「認真閱讀」很難判斷做到了沒，講一段出來孩子自己也知道結束了。',
    expectedBenefit: 'clearer_expectation',
    confidence: 'high',
  },
  {
    id: 'sug-session',
    kind: 'adjust_session_time',
    fieldPath: 'sessionMinutes',
    currentValue: 45,
    suggestedValue: 20,
    rationale: '這個年齡段一次 20 分鐘比較容易持續，撐完 45 分鐘容易變成應付。',
    expectedBenefit: 'more_age_appropriate',
    confidence: 'medium',
  },
];

/**
 * 假服務。
 *
 * 回傳前**一律走 validator** —— 假資料也要能通過真的驗證，
 * 否則測試會通過一批 production 不會接受的東西。
 */
export class FakeTaskAiRecommendationService implements TaskAiRecommendationService {
  behaviour: FakeAiBehaviour;
  delayMs: number;
  calls: TaskAiRecommendationInput[] = [];
  suggestions: TaskAiSuggestion[];

  constructor(options: {
    behaviour?: FakeAiBehaviour;
    delayMs?: number;
    suggestions?: TaskAiSuggestion[];
  } = {}) {
    this.behaviour = options.behaviour ?? 'suggestions';
    this.delayMs = options.delayMs ?? 0;
    this.suggestions = options.suggestions ?? DEFAULT_SUGGESTIONS;
  }

  get callCount(): number {
    return this.calls.length;
  }

  setBehaviour(behaviour: FakeAiBehaviour): void {
    this.behaviour = behaviour;
  }

  async recommend(
    input: TaskAiRecommendationInput,
    signal?: AbortSignal,
  ): Promise<TaskAiRecommendationResult> {
    this.calls.push(input);

    if (this.delayMs > 0) {
      await this.wait(signal);
    }
    // 已經被取消就不要回傳結果 —— 家長已經離開了那個畫面。
    if (signal?.aborted) throw abortError();

    switch (this.behaviour) {
      case 'no_change':
        return validateTaskAiRecommendationResult({
          status: 'no_change',
          schemaVersion: 1,
          summary: '目前設定已經清楚，可以直接建立。',
          suggestions: [],
        });

      case 'timeout':
        return { status: 'unavailable', schemaVersion: 1, reason: 'TIMEOUT', suggestions: [] };

      case 'service_error':
        return { status: 'unavailable', schemaVersion: 1, reason: 'SERVICE_ERROR', suggestions: [] };

      case 'invalid_response':
        // 故意回一個形狀不對的東西，讓 validator 去判。
        return validateTaskAiRecommendationResult({
          status: 'suggestions',
          schemaVersion: 1,
          summary: '有幾個地方可以再清楚一點。',
          suggestions: [{ id: 'x', kind: 'not_a_real_kind', fieldPath: 'title' }],
        });

      case 'unsafe_output':
        // 想改幣值 —— 這是最該被擋下來的那一種。
        return validateTaskAiRecommendationResult({
          status: 'suggestions',
          schemaVersion: 1,
          summary: '建議調整幣值。',
          suggestions: [
            {
              id: 'sug-coin',
              kind: 'reduce_scope',
              fieldPath: 'rewardCoinAmount',
              currentValue: 12,
              suggestedValue: 30,
              rationale: '孩子會更有動力。',
              expectedBenefit: 'more_achievable',
              confidence: 'high',
            },
          ],
        });

      case 'suggestions':
      default:
        return validateTaskAiRecommendationResult({
          status: 'suggestions',
          schemaVersion: 1,
          summary: '有兩個地方可以再清楚一點，採用與否由你決定。',
          suggestions: this.suggestions,
        });
    }
  }

  private wait(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, this.delayMs);
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortError());
      };
      if (signal?.aborted) {
        clearTimeout(timer);
        reject(abortError());
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}

function abortError(): Error {
  const err = new Error('取得建議已取消');
  err.name = 'AbortError';
  return err;
}

/**
 * 還沒有接上任何 AI 時注入這一支。
 *
 * 它回 `unavailable` 而不是丟錯 —— AI 不可用是一種正常狀態，
 * 不該讓家長看到錯誤畫面，更不該擋住建立任務。
 */
export class UnavailableTaskAiRecommendationService implements TaskAiRecommendationService {
  async recommend(): Promise<TaskAiRecommendationResult> {
    return { status: 'unavailable', schemaVersion: 1, reason: 'SERVICE_ERROR', suggestions: [] };
  }
}
