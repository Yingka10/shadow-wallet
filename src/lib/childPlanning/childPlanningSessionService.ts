// GrowBook — planning session 的持久化（P1-A2）
//
// ─────────────────────────────────────────────────────────────────────────
// 這一層只做一件事：把 session 的三個真實事件送進三支 RPC，並把回覆
// 正規化成型別看得懂的東西。
//
// 它**不決定規則**。輪數上限、stale、確認後不可變全部在 RPC 與
// childPlanningSession 裡 —— 這裡多寫一份判斷，只會多一個會分岔的地方。
//
// ⚠️ 三個刻意的設計：
//
//   1. **確認時不送計畫。** RPC 從 latest_result 複製。呼叫端送得進來的話，
//      孩子確認的就不一定是他螢幕上那一份。
//   2. **次數不送。** rounds/attempts 由 RPC 自己加，否則上限只是建議。
//   3. **provider 中立。** 這裡沒有一個字提到任何模型或廠商 ——
//      換付費 API 時這個檔案不用動。
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from '../supabase';
import type { ChildPlanningSessionStatus } from './childPlanningSession';
import {
  CHILD_GOAL_PLANNING_SCHEMA_VERSION,
  type ChildGoalPlanningResult,
  type ChildPlanningResponse,
} from './types';

export const START_PLANNING_SESSION_RPC = 'start_child_goal_planning_session_v1';
export const RECORD_PLANNING_ROUND_RPC = 'record_child_goal_planning_round_v1';
export const CONFIRM_PLANNING_SESSION_RPC = 'confirm_child_goal_planning_session_v1';
export const SUBMIT_WITHOUT_PLANNING_RPC = 'submit_child_proposal_without_planning_v1';

/** 只有這四支。打錯名字要在編譯期被抓到，不是等 PostgREST 回 PGRST202。 */
export type PlanningSessionRpcName =
  | typeof START_PLANNING_SESSION_RPC
  | typeof RECORD_PLANNING_ROUND_RPC
  | typeof CONFIRM_PLANNING_SESSION_RPC
  | typeof SUBMIT_WITHOUT_PLANNING_RPC;

export type ChildPlanningSessionFailureCode =
  | 'VALIDATION_FAILED'
  | 'POLICY_REJECTED'
  /** 這場對話已經往前走了 —— 這一次的寫入算的是舊狀態。 */
  | 'STALE_SESSION'
  | 'PERSISTENCE_FAILED'
  | 'UNKNOWN';

const FAILURE_CODES: readonly ChildPlanningSessionFailureCode[] = [
  'VALIDATION_FAILED',
  'POLICY_REJECTED',
  'STALE_SESSION',
  'PERSISTENCE_FAILED',
  'UNKNOWN',
];

export type ChildPlanningSessionFailure = {
  ok: false;
  code: ChildPlanningSessionFailureCode;
  /** RPC 對可預期的拒絕會附機器可讀的理由（REVISION_MISMATCH…）。 */
  reason?: string;
  message: string;
  /** STALE_SESSION 時 RPC 會附上真正的 revision，呼叫端可以直接重讀。 */
  revision?: number;
};

export type ChildPlanningSessionSnapshot = {
  ok: true;
  sessionId: string;
  status: ChildPlanningSessionStatus;
  revision: number;
  roundsUsed: number;
  attemptsUsed: number;
  /** 同一次嘗試的重送。**不是錯誤** —— 重試不該讓孩子看到紅字。 */
  idempotentReplay: boolean;
};

export type ChildPlanningSessionResult = ChildPlanningSessionSnapshot | ChildPlanningSessionFailure;

/** RPC 傳輸層。抽成介面，測試才不需要 Supabase 也不需要網路。 */
export type PlanningSessionRpc = (
  name: PlanningSessionRpcName,
  command: object,
) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;

const SESSION_STATUSES: readonly ChildPlanningSessionStatus[] = [
  'in_progress',
  'ready',
  'child_confirmed',
  'abandoned',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failure(
  code: ChildPlanningSessionFailureCode,
  message: string,
  extra: { reason?: string; revision?: number } = {},
): ChildPlanningSessionFailure {
  return { ok: false, code, message, ...extra };
}

/**
 * 把 RPC 回覆變成型別看得懂的結果。
 *
 * 形狀不對一律當失敗。「ok 是 true 但沒有 sessionId」靜靜放行的話，
 * 畫面會拿到一個 undefined 當 id，然後在下一次寫入時才炸掉 ——
 * 而那時已經看不出來是這一步壞的。
 */
function normalize(payload: unknown, fallbackMessage: string): ChildPlanningSessionResult {
  if (!isRecord(payload)) return failure('UNKNOWN', fallbackMessage);

  if (payload.ok !== true) {
    const code = FAILURE_CODES.includes(payload.code as ChildPlanningSessionFailureCode)
      ? (payload.code as ChildPlanningSessionFailureCode)
      : 'UNKNOWN';
    return failure(
      code,
      typeof payload.message === 'string' ? payload.message : fallbackMessage,
      {
        ...(typeof payload.reason === 'string' ? { reason: payload.reason } : {}),
        ...(typeof payload.revision === 'number' ? { revision: payload.revision } : {}),
      },
    );
  }

  const { sessionId, status, revision } = payload;
  if (
    typeof sessionId !== 'string'
    || typeof status !== 'string'
    || !SESSION_STATUSES.includes(status as ChildPlanningSessionStatus)
    || typeof revision !== 'number'
  ) {
    return failure('UNKNOWN', fallbackMessage);
  }

  return {
    ok: true,
    sessionId,
    status: status as ChildPlanningSessionStatus,
    revision,
    // 確認那一支不回次數 —— 它沒有改變任何一個。缺席時當 0，不是失敗。
    roundsUsed: typeof payload.roundsUsed === 'number' ? payload.roundsUsed : 0,
    attemptsUsed: typeof payload.attemptsUsed === 'number' ? payload.attemptsUsed : 0,
    idempotentReplay: payload.idempotentReplay === true,
  };
}

export type StartPlanningSessionCommand = {
  proposalId: string;
  /** 同一次「開始規劃」的識別碼。連點兩下不會生出兩場對話。 */
  clientRequestId?: string;
};

export type RecordPlanningRoundCommand = {
  sessionId: string;
  /** 讀到的版本。對不上代表這一次算的是舊狀態，RPC 會擋。 */
  expectedRevision: number;
  /** 這一輪之前孩子回的話。沒有就不帶。 */
  childResponse?: ChildPlanningResponse;
  /** **驗證過的**契約結果，不是 provider 的原始回應。 */
  result: ChildGoalPlanningResult;
};

export type ConfirmPlanningSessionCommand = {
  sessionId: string;
  expectedRevision: number;
};

export type SubmitWithoutPlanningCommand = {
  proposalId: string;
};

export type SubmitWithoutPlanningSuccess = {
  ok: true;
  proposalId: string;
  /** 有 session 被放棄時是 'abandoned'；本來就沒有 session 時是 null。 */
  sessionStatus: 'abandoned' | null;
  idempotentReplay: boolean;
};

export type SubmitWithoutPlanningResult =
  | SubmitWithoutPlanningSuccess
  | ChildPlanningSessionFailure;

/**
 * 三支 RPC 的薄包裝。
 *
 * 建構時可以注入 rpc —— 測試因此完整測得到 stale、重送、拒絕，
 * 而且不需要資料庫。
 */
export class ChildPlanningSessionService {
  private readonly rpc: PlanningSessionRpc;

  constructor(rpc: PlanningSessionRpc = defaultRpc) {
    this.rpc = rpc;
  }

  async start(command: StartPlanningSessionCommand): Promise<ChildPlanningSessionResult> {
    return this.call(
      START_PLANNING_SESSION_RPC,
      {
        schemaVersion: CHILD_GOAL_PLANNING_SCHEMA_VERSION,
        proposalId: command.proposalId,
        ...(command.clientRequestId ? { clientRequestId: command.clientRequestId } : {}),
      },
      '沒辦法開始規劃',
    );
  }

  async recordRound(command: RecordPlanningRoundCommand): Promise<ChildPlanningSessionResult> {
    return this.call(
      RECORD_PLANNING_ROUND_RPC,
      {
        schemaVersion: CHILD_GOAL_PLANNING_SCHEMA_VERSION,
        sessionId: command.sessionId,
        expectedRevision: command.expectedRevision,
        ...(command.childResponse ? { childResponse: command.childResponse } : {}),
        result: command.result,
      },
      '沒辦法記下這一輪',
    );
  }

  /** ⚠️ 不送計畫。RPC 從 latest_result 複製 —— 這裡沒有第二個來源。 */
  async confirm(command: ConfirmPlanningSessionCommand): Promise<ChildPlanningSessionResult> {
    return this.call(
      CONFIRM_PLANNING_SESSION_RPC,
      {
        schemaVersion: CHILD_GOAL_PLANNING_SCHEMA_VERSION,
        sessionId: command.sessionId,
        expectedRevision: command.expectedRevision,
      },
      '沒辦法確認這份計畫',
    );
  }

  /**
   * 不規劃、直接把想法送給爸媽。
   *
   * ⚠️ 這**不是**「先 abandon 再 transition」的兩次呼叫。兩件事在 RPC 裡
   *    是同一個交易 —— 中間斷掉會留下「已放棄但沒送出」或
   *    「已送出但規劃還開著」，而那正好是孩子按下按鈕、畫面在轉圈的那一刻。
   *
   * 沒有 planning session 也完全合法（AI 關著、或他根本沒開始規劃）。
   */
  async submitWithoutPlanning(
    command: SubmitWithoutPlanningCommand,
  ): Promise<SubmitWithoutPlanningResult> {
    let data: unknown;
    let error: { code?: string; message?: string } | null = null;

    try {
      const response = await this.rpc(SUBMIT_WITHOUT_PLANNING_RPC, {
        schemaVersion: CHILD_GOAL_PLANNING_SCHEMA_VERSION,
        proposalId: command.proposalId,
      });
      data = response.data;
      error = response.error;
    } catch (thrown) {
      return failure(
        'PERSISTENCE_FAILED',
        thrown instanceof Error ? thrown.message : '沒辦法送出',
      );
    }

    if (error !== null) return failure('PERSISTENCE_FAILED', error.message ?? '沒辦法送出');
    if (!isRecord(data)) return failure('UNKNOWN', '沒辦法送出');

    if (data.ok !== true) {
      const code = FAILURE_CODES.includes(data.code as ChildPlanningSessionFailureCode)
        ? (data.code as ChildPlanningSessionFailureCode)
        : 'UNKNOWN';
      return failure(code, typeof data.message === 'string' ? data.message : '沒辦法送出', {
        ...(typeof data.reason === 'string' ? { reason: data.reason } : {}),
      });
    }

    // 真的到 proposed 才算成功。RPC 回別的狀態一律當失敗 ——
    // 靜靜通過會讓孩子看到一個假的成功畫面。
    if (typeof data.proposalId !== 'string' || data.toStatus !== 'proposed') {
      return failure('UNKNOWN', '提案狀態沒有變成已送出');
    }

    return {
      ok: true,
      proposalId: data.proposalId,
      sessionStatus: data.sessionStatus === 'abandoned' ? 'abandoned' : null,
      idempotentReplay: data.idempotentReplay === true,
    };
  }

  private async call(
    name: PlanningSessionRpcName,
    command: object,
    fallbackMessage: string,
  ): Promise<ChildPlanningSessionResult> {
    let data: unknown;
    let error: { code?: string; message?: string } | null = null;

    try {
      const response = await this.rpc(name, command);
      data = response.data;
      error = response.error;
    } catch (thrown) {
      // 網路層丟出來的不是 PostgrestError，沒有 code 可以分類。
      return failure(
        'PERSISTENCE_FAILED',
        thrown instanceof Error ? thrown.message : fallbackMessage,
      );
    }

    if (error !== null) {
      return failure('PERSISTENCE_FAILED', error.message ?? fallbackMessage);
    }

    return normalize(data, fallbackMessage);
  }
}

const defaultRpc: PlanningSessionRpc = async (name, command) => {
  const response = await supabase.rpc(name, { p_command: command });
  return { data: response.data, error: response.error };
};
