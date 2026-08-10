// Shadow Wallet — 孩子提案 service（Supabase adapter）
//
// 職責只有一件事：把命令交給對應的 RPC，再把 jsonb 回覆翻成結構化結果。
//
// 刻意不做的事：不碰 UI、不 refresh 列表、不吞錯誤、不重試。
// 建立與轉換的邏輯全部在 RPC —— 一次動作要寫兩到三張表，
// 前端多次 insert 沒有交易，任何一步失敗都會留下半成品的提案。
//
// 與 parentTaskCreationService 用同一組錯誤分類（mapPostgresErrorCode），
// 呼叫端因此可以共用同一套錯誤處理，不必為提案再寫一份。

import { supabase } from '../supabase';
import { mapPostgresErrorCode } from '../parentTaskCreationService';
import { CHILD_PROPOSAL_STATUSES } from './types';
import type {
  AddChildProposalPlanVersionCommand,
  AddPlanVersionResult,
  ChildProposalFailure,
  ChildProposalFailureCode,
  ChildProposalStatus,
  CreateAdjustmentRequestResult,
  CreateChildProposalAdjustmentRequestCommand,
  CreateChildProposalCommand,
  CreateChildProposalResult,
  RecordChildProposalTrialCommand,
  RecordTrialResult,
  TransitionChildProposalCommand,
  TransitionProposalResult,
} from './types';

/** RPC 名稱。改版時會是 _v2，舊版仍留著給尚未更新的 client。 */
export const CREATE_CHILD_PROPOSAL_RPC = 'create_child_proposal_v1';
export const ADD_CHILD_PROPOSAL_PLAN_VERSION_RPC = 'add_child_proposal_plan_version_v1';
export const TRANSITION_CHILD_PROPOSAL_RPC = 'transition_child_proposal_v1';
export const RECORD_CHILD_PROPOSAL_TRIAL_RPC = 'record_child_proposal_trial_v1';
export const CREATE_CHILD_PROPOSAL_ADJUSTMENT_RPC =
  'create_child_proposal_adjustment_request_v1';

/**
 * 只有這五支。型別上就不接受任意字串 —— 打錯名字要在編譯期就被抓到，
 * 不是等到 PostgREST 回 PGRST202 才發現 migration「沒套用」。
 */
type ChildProposalRpcName =
  | typeof CREATE_CHILD_PROPOSAL_RPC
  | typeof ADD_CHILD_PROPOSAL_PLAN_VERSION_RPC
  | typeof TRANSITION_CHILD_PROPOSAL_RPC
  | typeof RECORD_CHILD_PROPOSAL_TRIAL_RPC
  | typeof CREATE_CHILD_PROPOSAL_ADJUSTMENT_RPC;

const FAILURE_CODES: ChildProposalFailureCode[] = [
  'VALIDATION_FAILED',
  'POLICY_REJECTED',
  'PERSISTENCE_FAILED',
  'UNKNOWN',
];

function isFailureCode(value: unknown): value is ChildProposalFailureCode {
  return typeof value === 'string' && (FAILURE_CODES as string[]).includes(value);
}

/**
 * 送出一個命令，並把回覆正規化。
 *
 * 成功的形狀每支 RPC 都不一樣，所以這裡不解 payload —— 只負責
 * 「有沒有失敗」以及「失敗是哪一種」。形狀檢查交給各自的 caller，
 * 那裡才知道少了哪個欄位算不算成功。
 */
async function callProposalRpc(
  rpcName: ChildProposalRpcName,
  // object 而非 unknown：RPC 簽章要的是一個 jsonb 物件。
  // 具體命令型別由各個 public method 的參數把關。
  command: object,
  fallbackMessage: string,
): Promise<{ ok: true; payload: Record<string, unknown> } | ChildProposalFailure> {
  let data: unknown;
  let error: { code?: string; message?: string } | null = null;

  try {
    const response = await supabase.rpc(rpcName, { p_command: command });
    data = response.data;
    error = response.error;
  } catch (thrown) {
    // 網路層丟出來的東西不是 PostgrestError，沒有 code 可以分類。
    return {
      ok: false,
      code: 'PERSISTENCE_FAILED',
      message: thrown instanceof Error ? thrown.message : fallbackMessage,
    };
  }

  if (error) {
    return {
      ok: false,
      code: mapPostgresErrorCode(error.code),
      message: error.message ?? fallbackMessage,
    };
  }

  const payload = data as Record<string, unknown> | null;

  if (!payload || typeof payload !== 'object' || !('ok' in payload)) {
    // RPC 回了看不懂的東西。不能當成成功 —— 沒有 id 就是沒建立。
    return { ok: false, code: 'UNKNOWN', message: `${fallbackMessage}：回應格式無法辨識` };
  }

  if (payload.ok !== true) {
    return {
      ok: false,
      // RPC 自己給的 code 優先；沒見過的值退回 UNKNOWN，不要硬塞。
      code: isFailureCode(payload.code) ? payload.code : 'UNKNOWN',
      reason: typeof payload.reason === 'string' ? payload.reason : undefined,
      message:
        typeof payload.message === 'string' && payload.message.length > 0
          ? payload.message
          : fallbackMessage,
    };
  }

  return { ok: true, payload };
}

function requireId(
  payload: Record<string, unknown>,
  key: string,
  fallbackMessage: string,
): string | ChildProposalFailure {
  const value = payload[key];
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, code: 'UNKNOWN', message: `${fallbackMessage}：回應缺少 ${key}` };
  }
  return value;
}

/**
 * RPC 回的狀態字串必須是我們認得的五個之一。
 *
 * 不認得就當失敗，不是「先收下再說」—— 一個沒見過的狀態沿著回傳值
 * 流進畫面，會變成一張沒有任何按鈕、也沒有人知道為什麼的卡片。
 */
function requireStatus(
  payload: Record<string, unknown>,
  key: string,
  fallbackMessage: string,
): ChildProposalStatus | ChildProposalFailure {
  const value = payload[key];
  if (!CHILD_PROPOSAL_STATUSES.includes(value as ChildProposalStatus)) {
    return { ok: false, code: 'UNKNOWN', message: `${fallbackMessage}：回應的 ${key} 無法辨識` };
  }
  return value as ChildProposalStatus;
}

function isFailure(value: unknown): value is ChildProposalFailure {
  return typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === false;
}

export class SupabaseChildProposalService {
  /** 孩子提出一個想法。只會落在 draft 或 proposed。 */
  async create(command: CreateChildProposalCommand): Promise<CreateChildProposalResult> {
    const fallback = '建立提案失敗';
    const result = await callProposalRpc(CREATE_CHILD_PROPOSAL_RPC, command, fallback);
    if (result.ok !== true) return result;

    const id = requireId(result.payload, 'proposalId', fallback);
    if (isFailure(id)) return id;

    const status = requireStatus(result.payload, 'status', fallback);
    if (isFailure(status)) return status;

    return { ok: true, proposalId: id, status };
  }

  /** 新增一版計畫。append-only —— 版號由 DB 決定，這裡不傳也不猜。 */
  async addPlanVersion(
    command: AddChildProposalPlanVersionCommand,
  ): Promise<AddPlanVersionResult> {
    const fallback = '儲存計畫版本失敗';
    const result = await callProposalRpc(ADD_CHILD_PROPOSAL_PLAN_VERSION_RPC, command, fallback);
    if (result.ok !== true) return result;

    const id = requireId(result.payload, 'planVersionId', fallback);
    if (isFailure(id)) return id;

    const versionNo = result.payload.versionNo;
    if (typeof versionNo !== 'number') {
      return { ok: false, code: 'UNKNOWN', message: `${fallback}：回應缺少版號` };
    }

    return {
      ok: true,
      planVersionId: id,
      versionNo,
      isCurrent: result.payload.isCurrent === true,
    };
  }

  /** 送出、家長確認、回絕、孩子接受都走這一支。 */
  async transition(
    command: TransitionChildProposalCommand,
  ): Promise<TransitionProposalResult> {
    const fallback = '變更提案狀態失敗';
    const result = await callProposalRpc(TRANSITION_CHILD_PROPOSAL_RPC, command, fallback);
    if (result.ok !== true) return result;

    const id = requireId(result.payload, 'proposalId', fallback);
    if (isFailure(id)) return id;

    const fromStatus = requireStatus(result.payload, 'fromStatus', fallback);
    if (isFailure(fromStatus)) return fromStatus;

    const toStatus = requireStatus(result.payload, 'toStatus', fallback);
    if (isFailure(toStatus)) return toStatus;

    return { ok: true, proposalId: id, fromStatus, toStatus };
  }

  /**
   * 記錄一次試行。
   *
   * ⚠️ 這一支**不會**動到錢包。RPC 端沒有任何 wallets / transactions 的路徑，
   * 回傳固定帶 walletEffect: 'none'。這裡把它原樣傳回去，
   * 讓呼叫端不需要靠「沒有 coin 欄位」推論。
   */
  async recordTrial(command: RecordChildProposalTrialCommand): Promise<RecordTrialResult> {
    const fallback = '記錄試行失敗';
    const result = await callProposalRpc(RECORD_CHILD_PROPOSAL_TRIAL_RPC, command, fallback);
    if (result.ok !== true) return result;

    const id = requireId(result.payload, 'trialEventId', fallback);
    if (isFailure(id)) return id;

    // walletEffect 不是 'none' 代表 RPC 被換成了會入帳的版本，
    // 而這一層還沒跟上。當成失敗處理 —— 靜靜通過的話，
    // 「P0 試行不入帳」就會在沒有人發現的情況下失效。
    if (result.payload.walletEffect !== 'none') {
      return {
        ok: false,
        code: 'POLICY_REJECTED',
        reason: 'TRIAL_WALLET_EFFECT_UNEXPECTED',
        message: '試行紀錄回報了非預期的錢包影響，已中止',
      };
    }

    return {
      ok: true,
      trialEventId: id,
      duplicate: result.payload.duplicate === true,
      walletEffect: 'none',
    };
  }

  /** P0-8 的接點：只建立 open 的調整請求。 */
  async createAdjustmentRequest(
    command: CreateChildProposalAdjustmentRequestCommand,
  ): Promise<CreateAdjustmentRequestResult> {
    const fallback = '建立調整請求失敗';
    const result = await callProposalRpc(
      CREATE_CHILD_PROPOSAL_ADJUSTMENT_RPC,
      command,
      fallback,
    );
    if (result.ok !== true) return result;

    const id = requireId(result.payload, 'adjustmentRequestId', fallback);
    if (isFailure(id)) return id;

    return { ok: true, adjustmentRequestId: id, status: 'open' };
  }
}
