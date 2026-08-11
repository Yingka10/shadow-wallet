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
import type { AgeGroup } from '../../types/database';
import type {
  AddChildProposalPlanVersionCommand,
  AddPlanVersionResult,
  ChildProposalFailure,
  ChildProposal,
  ChildProposalConfirmedReward,
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

/**
 * 共同確認的回饋快照長得對不對。
 *
 * 逐鍵檢查而不是直接 cast：這一包會被家長端顯示成「我們講好一次 8 個幣」，
 * 少一個鍵就會變成畫面上的 undefined。而且 coin_eligible 一定要有金額 ——
 * DB 有 CHECK 擋，但回傳值經過 PostgREST，這裡再確認一次不算多餘。
 */
function isConfirmedReward(value: unknown): value is ChildProposalConfirmedReward {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;

  if (typeof r.rewardPolicy !== 'string') return false;
  if (typeof r.payoutBasis !== 'string') return false;
  if (typeof r.claimPeriod !== 'string') return false;
  if (typeof r.maxClaimsPerPeriod !== 'number') return false;
  if (typeof r.rewardPolicyVersion !== 'string' || r.rewardPolicyVersion.length === 0) {
    return false;
  }
  if (typeof r.sourceTaskId !== 'string' || r.sourceTaskId.length === 0) return false;

  // 幣值與回饋方式必須互相對得上，兩個方向都查。
  const hasCoin = typeof r.coinAmount === 'number' && r.coinAmount > 0;
  if (r.rewardPolicy === 'coin_eligible') return hasCoin;
  return r.coinAmount === null || r.coinAmount === undefined;
}

export class SupabaseChildProposalService {
  /**
   * 家長首頁的唯讀入口。
   *
   * family / child / status 都在 DB query 篩選，不能先撈回前端再過濾；後者會讓
   * 換孩子時短暫看到手足資料，也會把不屬於這個家庭的列帶進 client memory。
   */
  async listProposedForParent({
    familyId,
    childId,
    limit = 3,
  }: {
    familyId: string;
    childId: string;
    limit?: number;
  }): Promise<ChildProposal[]> {
    const safeLimit = Math.max(1, Math.min(3, Math.trunc(limit)));
    const { data, error } = await supabase
      .from('child_proposals')
      .select('*')
      .eq('family_id', familyId)
      .eq('child_id', childId)
      .eq('status', 'proposed')
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (error) throw new Error(error.message || '讀取孩子提案失敗');
    return data ?? [];
  }

  /**
   * 讀一筆提案。P0-3 的 AI 草稿以**資料庫這一列**為輸入，不是畫面上的草稿 ——
   * 送出之後畫面的值就不再是權威（RPC 會 trim、預設值由 DB 決定）。
   *
   * 找不到就回 null，不丟例外：呼叫端是背景工作，「不存在」是它要處理的
   * 正常結果之一，不是需要 catch 的意外。
   */
  async getProposal(proposalId: string): Promise<ChildProposal | null> {
    const { data, error } = await supabase
      .from('child_proposals')
      .select('*')
      .eq('id', proposalId)
      .maybeSingle();

    if (error) throw new Error(error.message || '讀取提案失敗');
    return data ?? null;
  }

  /**
   * 這個孩子的年齡段。
   *
   * 只取 age_group 一欄 —— AI 判斷需要的是分級，不是生日。少送一個欄位
   * 就少一個外流面，而年齡段本來就是 children 上算好存著的值。
   */
  async getChildAgeGroup(childId: string): Promise<AgeGroup | null> {
    const { data, error } = await supabase
      .from('children')
      .select('age_group')
      .eq('id', childId)
      .maybeSingle();

    if (error) throw new Error(error.message || '讀取孩子年齡段失敗');
    return data?.age_group ?? null;
  }

  /**
   * 這一份輸入是不是已經整理過了。
   *
   * P0-3 的 idempotency 靠這一支：request key 是決定性的（同樣的提案內容
   * 永遠算出同一把），所以查得到就代表「這次重試不需要再問一次模型」。
   *
   * ⚠️ 這**不是**資料庫層的唯一性保證 —— ai_request_id 沒有 unique index。
   *    兩個同時發出的請求仍然可能都查不到、於是都寫入。實務上這條路徑是
   *    孩子送出後的單一背景工作，不會併發；要根治需要動 schema。
   */
  async findPlanVersionIdByAiRequestId({
    proposalId,
    aiRequestId,
  }: {
    proposalId: string;
    aiRequestId: string;
  }): Promise<string | null> {
    const { data, error } = await supabase
      .from('child_proposal_plan_versions')
      .select('id')
      .eq('proposal_id', proposalId)
      .eq('ai_request_id', aiRequestId)
      .limit(1);

    if (error) throw new Error(error.message || '讀取計畫版本失敗');
    return data && data.length > 0 ? data[0].id : null;
  }

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
      // 舊版 RPC 不回這個鍵 —— 沒有就當成「這是新的一版」，
      // 而不是把 undefined 當成 true 讓呼叫端以為什麼都沒發生。
      duplicate: result.payload.duplicate === true,
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

    const planVersionId =
      typeof result.payload.planVersionId === 'string' ? result.payload.planVersionId : null;

    // 轉成 active 卻沒有回饋快照，代表 RPC 是舊版本或 migration 沒套齊。
    // 當成失敗處理：一份沒有共同確認回饋的 shared version 不是 shared version，
    // 而讓它靜靜通過的話，這件事要等到家長三個月後回頭查才會被發現。
    if (toStatus === 'active' && !isConfirmedReward(result.payload.confirmedReward)) {
      return {
        ok: false,
        code: 'UNKNOWN',
        reason: 'CONFIRMED_REWARD_MISSING',
        message: `${fallback}：共同版本缺少確認的回饋紀錄`,
      };
    }

    return {
      ok: true,
      proposalId: id,
      fromStatus,
      toStatus,
      planVersionId,
      confirmedReward: isConfirmedReward(result.payload.confirmedReward)
        ? result.payload.confirmedReward
        : null,
    };
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
