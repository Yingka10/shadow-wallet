// GrowBook — Goal Planning 的真實 client 與服務模式（P1-A1）
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支與 P0-3 的 planDraftClient 幾乎逐行對應，而且是刻意的：
// 逾時、取消、服務模式的判斷都**重用既有的那一套**
// （resolveTaskAiServiceMode），不另外做第二套 AI provider 架構。
//
// 只有兩個模式成立：
//
//   off   → client = null。呼叫端整個不跑。
//   live  → 真的打既有的 ai-proxy。
//
// **`fake` 一律降成 off**，理由與 P0-3 相同：一份模型從來沒跑過、
// 但長得像 AI 產出的計畫，之後沒有任何人分得出來。
//
// 開關是**自己的** `EXPO_PUBLIC_CHILD_GOAL_PLANNING_AI_MODE`，
// 沒有跟 P0-3 共用。P1-A1 的契約還在驗證中，共用一個開關會讓
// 「打開孩子提案的草稿」順手把一條還沒驗完的路徑也打開，
// 而那件事沒有人決定過。
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from '../supabase';
import { supabaseEnvironment } from '../environment';
// 直接指向那一支檔案，不走 taskAi 的 barrel —— barrel 會把整個家長端抽屜的
// 建議套用、狀態機、文案一起拉進來，而這裡只需要一個純函式。
import {
  resolveTaskAiServiceMode,
  type TaskAiServiceModeResolution,
} from '../../screens/parent/tablet/taskDrawer/taskAi/taskAiServiceMode';
import {
  childGoalPlanningUnavailable,
  validateChildGoalPlanningResult,
} from './validateChildGoalPlanningResult';
import {
  CHILD_GOAL_PLANNING_REQUEST_TYPE,
  type ChildGoalPlanningClient,
  type ChildGoalPlanningInput,
  type ChildGoalPlanningResult,
} from './types';

/** 與 P0-3 同一支 Edge Function，不另外部署。 */
export const AI_PROXY_FUNCTION_NAME = 'ai-proxy';

/**
 * 等模型的上限。
 *
 * 必須比 Function 端的預算長，才拿得到結構化的 reason —— client 先
 * abort 的話，「模型太慢」與「模型亂寫」會一起變成 TIMEOUT。
 *
 * 40 秒（而不是 P0-3 的 20 秒）來自 2026-08-13 的真實模型量測：這一支的
 * prompt 比 P0-3 長，冷啟動時實測到 26 秒。Function 端拿 30 秒，這裡留
 * 10 秒餘裕。**這不代表要讓孩子盯著轉圈等 40 秒** —— 呼叫端該怎麼呈現
 * 等待是 UI 工作包的事，這一層只負責不要在模型還在寫的時候就放棄。
 */
export const CHILD_GOAL_PLANNING_TIMEOUT_MS = 40_000;

export type InvokeAiProxy = (
  body: { type: string; payload: ChildGoalPlanningInput },
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

export class LiveChildGoalPlanningClient implements ChildGoalPlanningClient {
  constructor(
    private readonly invoke: InvokeAiProxy = invokeAiProxy,
    private readonly timeoutMs: number = CHILD_GOAL_PLANNING_TIMEOUT_MS,
  ) {}

  async requestPlan(
    input: ChildGoalPlanningInput,
    signal?: AbortSignal,
  ): Promise<ChildGoalPlanningResult> {
    if (signal?.aborted) return childGoalPlanningUnavailable('TIMEOUT');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const forwardAbort = () => controller.abort();
    signal?.addEventListener?.('abort', forwardAbort);

    try {
      const { data, error } = await this.invoke(
        { type: CHILD_GOAL_PLANNING_REQUEST_TYPE, payload: input },
        controller.signal,
      );

      if (error !== null && error !== undefined) {
        if (isAbortError(error) || controller.signal.aborted) {
          return childGoalPlanningUnavailable('TIMEOUT');
        }
        return childGoalPlanningUnavailable('SERVICE_ERROR');
      }

      // **不 cast**，走一次 client validator —— 而且帶著 input，
      // 因為有幾條產品原則要對照孩子講過什麼才判斷得出來。
      return validateChildGoalPlanningResult(data, input);
    } catch (thrown) {
      if (isAbortError(thrown) || controller.signal.aborted) {
        return childGoalPlanningUnavailable('TIMEOUT');
      }
      return childGoalPlanningUnavailable('SERVICE_ERROR');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', forwardAbort);
    }
  }
}

export type ChildGoalPlanningClientSetup = {
  resolution: TaskAiServiceModeResolution;
  /** null = 這個環境不提供 Goal Planning。 */
  client: ChildGoalPlanningClient | null;
};

export function createChildGoalPlanningClientSetup(
  rawMode: string | undefined | null,
  invoke: InvokeAiProxy = invokeAiProxy,
): ChildGoalPlanningClientSetup {
  if (!supabaseEnvironment.ok) {
    return { resolution: { mode: 'off', reason: 'unset' }, client: null };
  }

  const resolution = resolveTaskAiServiceMode(rawMode, supabaseEnvironment.info.appEnvironment);

  if (resolution.mode === 'live') {
    return { resolution, client: new LiveChildGoalPlanningClient(invoke) };
  }

  return {
    resolution:
      resolution.mode === 'fake' ? { mode: 'off', reason: 'not_allowed_here' } : resolution,
    client: null,
  };
}

/** 模組載入時就決定好 —— 模式不該在 App 跑到一半改變。 */
export const childGoalPlanningClientSetup: ChildGoalPlanningClientSetup =
  createChildGoalPlanningClientSetup(process.env.EXPO_PUBLIC_CHILD_GOAL_PLANNING_AI_MODE);
