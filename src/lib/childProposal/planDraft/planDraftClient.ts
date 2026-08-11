// Shadow Wallet — Plan Draft 的真實 client 與服務模式（P0-3）
//
// ─────────────────────────────────────────────────────────────────────────
// 模式判斷**重用** taskAi 的 resolveTaskAiServiceMode，不另外寫一套 ——
// 那支已經把「猜錯模式的兩種災難」處理完了（猜成 live 會花錢、
// 猜成 fake 更糟因為看起來是成功的），沒有理由再實作一次。
//
// 只有兩個模式在這裡成立：
//
//   off   → client = null。呼叫端整個不跑，不寫任何計畫版本。
//   live  → 真的打 ai-proxy。
//
// **`fake` 一律降成 off。** 這是與 taskAi 刻意不同的地方，理由是下游不同：
// taskAi 的假建議只出現在畫面上，家長看得到「AI 服務模式：fake」；
// 而這一包的產出會被**寫進資料庫**，變成一列 authored_by='ai' 的計畫版本。
// 一列宣稱是 AI 寫的、但模型從來沒跑過的資料，之後沒有任何人分得出來。
// 要在沒有配額的情況下 demo，就把它關掉、誠實地沒有草稿。
//
// ⚠️ live 失敗**不會**退回任何一種本機產物。降級只降到「這一輪沒有草稿」。
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from '../../supabase';
import { supabaseEnvironment } from '../../environment';
// 直接指向那一支檔案，不走 taskAi 的 barrel —— barrel 會把整個家長端抽屜的
// 建議套用、狀態機、文案一起拉進孩子端的 bundle，而這裡只需要一個純函式。
import {
  resolveTaskAiServiceMode,
  type TaskAiServiceModeResolution,
} from '../../../screens/parent/tablet/taskDrawer/taskAi/taskAiServiceMode';
import { planDraftUnavailable, validatePlanDraftResult } from './validatePlanDraftResult';
import {
  CHILD_PROPOSAL_PLAN_DRAFT_REQUEST_TYPE,
  type ChildProposalPlanDraftClient,
  type ChildProposalPlanDraftInput,
  type ChildProposalPlanDraftResult,
} from './types';

/** ai-proxy 的名稱。與 aiAgent 用同一支 Edge Function，不另外部署。 */
export const AI_PROXY_FUNCTION_NAME = 'ai-proxy';

/**
 * 等模型的上限。
 *
 * 這條路徑是背景工作，沒有人在畫面前面等 —— 但也不能無限期掛著：
 * 一個永遠不 resolve 的 promise 會讓孩子退出畫面之後仍然佔著連線。
 */
export const PLAN_DRAFT_TIMEOUT_MS = 20_000;

/** 呼叫 Function 的那一步。抽成函式型別，測試才不需要網路與金鑰。 */
export type InvokeAiProxy = (
  body: { type: string; payload: ChildProposalPlanDraftInput },
  signal: AbortSignal | undefined,
) => Promise<{ data: unknown; error: unknown }>;

const invokeAiProxy: InvokeAiProxy = async (body, signal) =>
  supabase.functions.invoke(AI_PROXY_FUNCTION_NAME, {
    body,
    ...(signal ? { signal } : null),
  });

function isAbortError(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const name = (value as { name?: unknown }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

export class LiveChildProposalPlanDraftClient implements ChildProposalPlanDraftClient {
  constructor(
    private readonly invoke: InvokeAiProxy = invokeAiProxy,
    private readonly timeoutMs: number = PLAN_DRAFT_TIMEOUT_MS,
  ) {}

  async requestPlanDraft(
    input: ChildProposalPlanDraftInput,
    signal?: AbortSignal,
  ): Promise<ChildProposalPlanDraftResult> {
    if (signal?.aborted) return planDraftUnavailable('TIMEOUT');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    // 外層的取消（例如整個流程被關掉）也要能中止這一次請求。
    const forwardAbort = () => controller.abort();
    signal?.addEventListener?.('abort', forwardAbort);

    try {
      const { data, error } = await this.invoke(
        { type: CHILD_PROPOSAL_PLAN_DRAFT_REQUEST_TYPE, payload: input },
        controller.signal,
      );

      if (error !== null && error !== undefined) {
        // 逾時與「服務掛了」對產品的意義不同：前者可以晚點再試，
        // 後者代表這個環境現在沒有這個能力。分開記，log 才有用。
        if (isAbortError(error) || controller.signal.aborted) {
          return planDraftUnavailable('TIMEOUT');
        }
        return planDraftUnavailable('SERVICE_ERROR');
      }

      // 這裡是重點：**不 cast**，走一次 client validator。
      return validatePlanDraftResult(data);
    } catch (thrown) {
      if (isAbortError(thrown) || controller.signal.aborted) {
        return planDraftUnavailable('TIMEOUT');
      }
      return planDraftUnavailable('SERVICE_ERROR');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', forwardAbort);
    }
  }
}

export type PlanDraftClientSetup = {
  resolution: TaskAiServiceModeResolution;
  /** null = 這個環境不提供 Plan Draft。 */
  client: ChildProposalPlanDraftClient | null;
};

/**
 * 從環境變數決定要不要提供 Plan Draft。
 *
 * 用**專屬**的 `EXPO_PUBLIC_CHILD_PROPOSAL_AI_MODE`，不共用家長端那支的開關：
 * 兩個功能打不同的 Edge Function、面對不同的使用者、成本也不同。
 * 一個共用開關會讓「幫家長打開建議」順手把孩子端的模型呼叫也打開，
 * 而那件事沒有人決定過。判斷邏輯仍然是同一支函式。
 */
export function createPlanDraftClientSetup(
  rawMode: string | undefined | null,
  invoke: InvokeAiProxy = invokeAiProxy,
): PlanDraftClientSetup {
  if (!supabaseEnvironment.ok) {
    return { resolution: { mode: 'off', reason: 'unset' }, client: null };
  }

  const resolution = resolveTaskAiServiceMode(
    rawMode,
    supabaseEnvironment.info.appEnvironment,
  );

  if (resolution.mode === 'live') {
    return { resolution, client: new LiveChildProposalPlanDraftClient(invoke) };
  }

  // off 與 fake 都不提供 client。fake 降級的理由見檔頭。
  return {
    resolution: resolution.mode === 'fake'
      ? { mode: 'off', reason: 'not_allowed_here' }
      : resolution,
    client: null,
  };
}

/**
 * 模組載入時就決定好，與 taskAiClientSetup 同一個理由：
 * 模式不該在 App 跑到一半改變。
 */
export const planDraftClientSetup: PlanDraftClientSetup = createPlanDraftClientSetup(
  process.env.EXPO_PUBLIC_CHILD_PROPOSAL_AI_MODE,
);
