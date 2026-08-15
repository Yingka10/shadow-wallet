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
import { buildDirectConfirmCommand } from './directConfirm';
import {
  buildChildPlanConfirmCommand,
  type ConfirmChildPlanningProposalResult,
} from '../childPlanning/parentAgreement';
import {
  buildChildPlanningTermsCommand,
  type ChildPlanningSharedTerms,
  type ProposeChildPlanningTermsResult,
} from '../childPlanning/sharedTerms';
import {
  buildChildAcceptCommand,
  buildChildRequestChangesCommand,
  type AcceptChildPlanningTermsResult,
  type RequestChildPlanningTermChangesResult,
} from '../childPlanning/childReview';
import {
  buildAcceptReviewCommand,
  buildCloseUnsuitableCommand,
  buildRequestChangesCommand,
  buildRevisionCommand,
} from './reviewCommands';
import type { AgeGroup } from '../../types/database';
import type {
  AddChildProposalPlanVersionCommand,
  AddPlanVersionResult,
  AcceptChildProposalResult,
  ChildProposalFailure,
  ChildProposal,
  ChildProposalChildAction,
  ChildProposalConfirmedReward,
  ChildProposalFailureCode,
  ChildProposalStatus,
  ChildProposalReviewData,
  CloseChildProposalResult,
  ConfirmChildProposalResult,
  CreateAdjustmentRequestResult,
  CreateAdjustmentRequestSuccess,
  CreateChildProposalAdjustmentRequestCommand,
  AcceptChildProposalAdjustmentCommand,
  DeclineChildProposalAdjustmentCommand,
  AcceptAdjustmentResult,
  DeclineAdjustmentResult,
  ChildProposalAdjustmentCardData,
  ChildProposalAdjustmentRequest,
  ChildProposalPlanVersion,
  ChildSharedPlanContext,
  CreateChildProposalCommand,
  CreateChildProposalResult,
  RecordChildProposalTrialCommand,
  RecordTrialResult,
  TransitionChildProposalCommand,
  TransitionProposalResult,
  ParentProposalCardData,
  ParentProposalMaterialEdits,
  RequestChildProposalChangesResult,
  ReviseChildProposalResult,
} from './types';

/** RPC 名稱。改版時會是 _v2，舊版仍留著給尚未更新的 client。 */
export const CREATE_CHILD_PROPOSAL_RPC = 'create_child_proposal_v1';
export const ADD_CHILD_PROPOSAL_PLAN_VERSION_RPC = 'add_child_proposal_plan_version_v1';
export const TRANSITION_CHILD_PROPOSAL_RPC = 'transition_child_proposal_v1';
export const RECORD_CHILD_PROPOSAL_TRIAL_RPC = 'record_child_proposal_trial_v1';
export const CREATE_CHILD_PROPOSAL_ADJUSTMENT_RPC =
  'create_child_proposal_adjustment_request_v1';
export const CONFIRM_CHILD_PROPOSAL_RPC = 'confirm_child_proposal_v1';
export const REVISE_CHILD_PROPOSAL_PLAN_RPC = 'revise_child_proposal_plan_v1';
export const ACCEPT_CHILD_PROPOSAL_PLAN_RPC = 'accept_child_proposal_plan_v1';
export const REQUEST_CHILD_PROPOSAL_CHANGES_RPC = 'request_child_proposal_changes_v1';
export const CLOSE_CHILD_PROPOSAL_UNSUITABLE_RPC = 'close_child_proposal_unsuitable_v1';
export const ACCEPT_CHILD_PROPOSAL_ADJUSTMENT_RPC = 'accept_child_proposal_adjustment_v1';
export const DECLINE_CHILD_PROPOSAL_ADJUSTMENT_RPC = 'decline_child_proposal_adjustment_v1';
/**
 * P1-A4A：家長同意孩子已經確認且完整的計畫。
 *
 * ⚠️ 是 CONFIRM_CHILD_PROPOSAL_RPC 的 **sibling**，不是它的替代。
 *    AI-authored 的提案永遠走那一支，一個行為都沒改。
 */
export const CONFIRM_CHILD_PLANNING_PROPOSAL_RPC = 'confirm_child_planning_proposal_v1';

/**
 * P1-A4B1：家長對孩子已規劃的計畫提出家庭共同條件。
 *
 * ⚠️ 是 REVISE_CHILD_PROPOSAL_PLAN_RPC 的 **sibling**。那一支服務 P0
 *    （來源是 ai / parent 版本，可改的欄位、reward 語意都不一樣），
 *    一個字都沒改。
 */
export const PROPOSE_CHILD_PLANNING_TERMS_RPC = 'propose_child_planning_terms_v1';

/**
 * P1-A4B2：孩子對家長提出的共同條件的兩個回覆。
 *
 * ⚠️ 是 ACCEPT_CHILD_PROPOSAL_PLAN_RPC / REQUEST_CHILD_PROPOSAL_CHANGES_RPC
 *    的 **sibling**。那兩支用 P0 的 reward 錨點與 P0 的調整版形狀，
 *    一個字都沒改。
 */
export const ACCEPT_CHILD_PLANNING_TERMS_RPC = 'accept_child_planning_terms_v1';
export const REQUEST_CHILD_PLANNING_TERM_CHANGES_RPC =
  'request_child_planning_term_changes_v1';

/**
 * 只有這六支。型別上就不接受任意字串 —— 打錯名字要在編譯期就被抓到，
 * 不是等到 PostgREST 回 PGRST202 才發現 migration「沒套用」。
 */
type ChildProposalRpcName =
  | typeof CREATE_CHILD_PROPOSAL_RPC
  | typeof ADD_CHILD_PROPOSAL_PLAN_VERSION_RPC
  | typeof TRANSITION_CHILD_PROPOSAL_RPC
  | typeof RECORD_CHILD_PROPOSAL_TRIAL_RPC
  | typeof CREATE_CHILD_PROPOSAL_ADJUSTMENT_RPC
  | typeof CONFIRM_CHILD_PROPOSAL_RPC
  | typeof CONFIRM_CHILD_PLANNING_PROPOSAL_RPC
  | typeof REVISE_CHILD_PROPOSAL_PLAN_RPC
  | typeof PROPOSE_CHILD_PLANNING_TERMS_RPC
  | typeof ACCEPT_CHILD_PLANNING_TERMS_RPC
  | typeof REQUEST_CHILD_PLANNING_TERM_CHANGES_RPC
  | typeof ACCEPT_CHILD_PROPOSAL_PLAN_RPC
  | typeof REQUEST_CHILD_PROPOSAL_CHANGES_RPC
  | typeof CLOSE_CHILD_PROPOSAL_UNSUITABLE_RPC
  | typeof ACCEPT_CHILD_PROPOSAL_ADJUSTMENT_RPC
  | typeof DECLINE_CHILD_PROPOSAL_ADJUSTMENT_RPC;

const FAILURE_CODES: ChildProposalFailureCode[] = [
  'VALIDATION_FAILED',
  'POLICY_REJECTED',
  'NO_MATERIAL_CHANGE',
  'STALE_PLAN_VERSION',
  'POLICY_CHANGED',
  'PLAN_NOT_CONFIRMABLE',
  'PROPOSAL_NOT_IN_REVIEW',
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
/** 只收 A4B2 那兩個值。舊的轉換沒有 action，legacy 事件也一律是 null。 */
function isChildAction(value: unknown): value is ChildProposalChildAction {
  return value === 'accepted_shared_terms_pending_more'
    || value === 'requested_shared_term_changes';
}

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

  // 目標次數：有值就必須是正整數，沒值是 null。
  //
  // 刻意**不**寫成「payoutBasis === 'per_period' 就一定要有值」——
  // legacy 快照的 per_period 是從 claim_period 推導出來的，那些家庭
  // 從來沒有確認過任何次數，它們的 null 是正確答案。把它擋掉會讓
  // 既有共同計畫的重試整個失敗。
  if (r.periodTargetCount !== null && r.periodTargetCount !== undefined) {
    if (typeof r.periodTargetCount !== 'number' || r.periodTargetCount <= 0) return false;
  }

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
  }): Promise<ParentProposalCardData[]> {
    const safeLimit = Math.max(1, Math.min(3, Math.trunc(limit)));
    const { data, error } = await supabase
      .from('child_proposals')
      .select('*')
      .eq('family_id', familyId)
      .eq('child_id', childId)
      .in('status', ['proposed', 'needs_child_review'])
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (error) throw new Error(error.message || '讀取孩子提案失敗');
    const proposals = data ?? [];
    const currentIds = proposals
      .map(proposal => proposal.current_plan_version_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (currentIds.length === 0) {
      return proposals.map(proposal => ({ proposal, currentPlanVersion: null }));
    }

    const { data: versions, error: versionError } = await supabase
      .from('child_proposal_plan_versions')
      .select('*')
      .in('id', currentIds);
    if (versionError) throw new Error(versionError.message || '讀取 GrowBook 計畫失敗');

    const byId = new Map((versions ?? []).map(version => [version.id, version]));

    // 孩子在這一版上最後做的事。**這一段拿不到就整張卡片不顯示是錯的** ——
    // 它只是一句話的差別（「他說可以了」vs「他想再聊聊」），讀不到就當沒有，
    // 不要讓一個附註把家長的主流程擋掉。
    const actionByVersion = await this.latestChildActions(currentIds);

    return proposals.map(proposal => {
      const version = proposal.current_plan_version_id
        ? byId.get(proposal.current_plan_version_id) ?? null
        : null;
      // Exact id plus proposal ownership: a mismatched row is not a usable plan.
      const currentPlanVersion = version?.proposal_id === proposal.id ? version : null;
      return {
        proposal,
        currentPlanVersion,
        latestChildAction: currentPlanVersion
          ? actionByVersion.get(currentPlanVersion.id) ?? null
          : null,
      };
    });
  }

  /**
   * 每一版上孩子最後一次的回覆語意。
   *
   * ⚠️ 以 plan_version_id 為鍵，不是 proposal_id：協商到第二輪時，
   *    第一輪的「我想再調整」還躺在同一個提案下面，用提案當鍵會把它
   *    貼到新的一版上。
   */
  private async latestChildActions(
    planVersionIds: readonly string[],
  ): Promise<Map<string, ChildProposalChildAction>> {
    const found = new Map<string, ChildProposalChildAction>();
    if (planVersionIds.length === 0) return found;

    const { data, error } = await supabase
      .from('child_proposal_status_events')
      .select('plan_version_id, action, created_at')
      .in('plan_version_id', [...planVersionIds])
      .not('action', 'is', null)
      .order('created_at', { ascending: false });
    if (error) return found;

    for (const row of data ?? []) {
      const versionId = row.plan_version_id;
      const action = row.action;
      if (typeof versionId !== 'string' || !isChildAction(action)) continue;
      if (!found.has(versionId)) found.set(versionId, action);
    }
    return found;
  }

  /**
   * 孩子端正式 review reader。Current 與 adopted source 都用 exact ids 查回，
   * lineage 不完整就不猜、不顯示一張無法解釋的 diff card。
   */
  async listNeedsReviewForChild({
    familyId,
    childId,
    limit = 3,
  }: {
    familyId: string;
    childId: string;
    limit?: number;
  }): Promise<ChildProposalReviewData[]> {
    const safeLimit = Math.max(1, Math.min(3, Math.trunc(limit)));
    const { data, error } = await supabase
      .from('child_proposals')
      .select('*')
      .eq('family_id', familyId)
      .eq('child_id', childId)
      .eq('status', 'needs_child_review')
      .order('created_at', { ascending: false })
      .limit(safeLimit);
    if (error) throw new Error(error.message || '讀取要一起看的計畫失敗');

    const proposals = data ?? [];
    const currentIds = proposals
      .map(proposal => proposal.current_plan_version_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (currentIds.length === 0) return [];

    const { data: currents, error: currentError } = await supabase
      .from('child_proposal_plan_versions')
      .select('*')
      .in('id', currentIds);
    if (currentError) throw new Error(currentError.message || '讀取家長調整版本失敗');

    const currentById = new Map((currents ?? []).map(version => [version.id, version]));
    const validCurrents = proposals.flatMap(proposal => {
      const current = proposal.current_plan_version_id
        ? currentById.get(proposal.current_plan_version_id)
        : undefined;
      if (!current
        || current.proposal_id !== proposal.id
        || current.authored_by !== 'parent'
        || current.requires_child_review !== true
        || !current.adopted_from_plan_version_id) return [];
      return [{ proposal, current }];
    });
    if (validCurrents.length === 0) return [];

    const sourceIds = [...new Set(validCurrents.map(item => item.current.adopted_from_plan_version_id!))];
    const { data: sources, error: sourceError } = await supabase
      .from('child_proposal_plan_versions')
      .select('*')
      .in('id', sourceIds);
    if (sourceError) throw new Error(sourceError.message || '讀取調整前版本失敗');

    const sourceById = new Map((sources ?? []).map(version => [version.id, version]));
    return validCurrents.flatMap(({ proposal, current }) => {
      const source = sourceById.get(current.adopted_from_plan_version_id!);
      if (!source || source.proposal_id !== proposal.id) return [];
      return [{ proposal, currentPlanVersion: current, sourcePlanVersion: source }];
    });
  }

  /** One UI action, one orchestration RPC. The UI never assembles a task command. */
  async confirmDirect(
    card: ParentProposalCardData,
    childAgeGroup: string,
  ): Promise<ConfirmChildProposalResult> {
    const built = buildDirectConfirmCommand(card, childAgeGroup);
    if (built.ok !== true) return built;

    const fallback = '建立共同計畫失敗';
    const result = await callProposalRpc(CONFIRM_CHILD_PROPOSAL_RPC, built.command, fallback);
    if (result.ok !== true) return result;

    const proposalId = requireId(result.payload, 'proposalId', fallback);
    if (isFailure(proposalId)) return proposalId;
    const planVersionId = requireId(result.payload, 'planVersionId', fallback);
    if (isFailure(planVersionId)) return planVersionId;
    const taskId = requireId(result.payload, 'taskId', fallback);
    if (isFailure(taskId)) return taskId;
    if (!isConfirmedReward(result.payload.confirmedReward)) {
      return {
        ok: false, code: 'UNKNOWN', reason: 'CONFIRMED_REWARD_MISSING',
        message: `${fallback}：共同版本缺少確認的回饋紀錄`,
      };
    }

    return {
      ok: true,
      proposalId,
      planVersionId,
      taskId,
      relatedIds: Array.isArray(result.payload.relatedIds)
        ? result.payload.relatedIds.filter((id): id is string => typeof id === 'string')
        : [],
      confirmedReward: result.payload.confirmedReward,
      idempotentReplay: result.payload.idempotentReplay === true,
    };
  }

  /**
   * P1-A4A：家長同意孩子已經確認且完整的計畫。
   *
   * ⚠️ 與 confirmDirect 是**兩支**，不是一支帶旗標的。路由由
   *    resolveConfirmRoute 決定，而且只看 authorship 與 lineage。
   */
  async confirmChildPlanAgreement(
    card: ParentProposalCardData,
    childAgeGroup: string,
  ): Promise<ConfirmChildPlanningProposalResult> {
    const built = buildChildPlanConfirmCommand(card, childAgeGroup);
    if (built.ok !== true) return built;

    const fallback = '建立共同約定失敗';
    const result = await callProposalRpc(
      CONFIRM_CHILD_PLANNING_PROPOSAL_RPC, built.command, fallback,
    );
    if (result.ok !== true) return result;

    const proposalId = requireId(result.payload, 'proposalId', fallback);
    if (isFailure(proposalId)) return proposalId;
    const planVersionId = requireId(result.payload, 'planVersionId', fallback);
    if (isFailure(planVersionId)) return planVersionId;
    const sourcePlanVersionId = requireId(result.payload, 'sourcePlanVersionId', fallback);
    if (isFailure(sourcePlanVersionId)) return sourcePlanVersionId;
    const taskId = requireId(result.payload, 'taskId', fallback);
    if (isFailure(taskId)) return taskId;
    if (!isConfirmedReward(result.payload.confirmedReward)) {
      return {
        ok: false, code: 'UNKNOWN', reason: 'CONFIRMED_REWARD_MISSING',
        message: `${fallback}：共同版本缺少確認的回饋紀錄`,
      };
    }

    return {
      ok: true,
      proposalId,
      planVersionId,
      sourcePlanVersionId,
      taskId,
      relatedIds: Array.isArray(result.payload.relatedIds)
        ? result.payload.relatedIds.filter((id): id is string => typeof id === 'string')
        : [],
      confirmedReward: result.payload.confirmedReward,
      idempotentReplay: result.payload.idempotentReplay === true,
    };
  }

  /**
   * P1-A4B1：家長提出家庭共同條件 → 家長草案 ＋ needs_child_review。
   *
   * ⚠️ 與 revisePlan 是**兩支**。那一支是 P0 的 material edit；這一支
   *    的來源必須沿 adopted_from 走得回一份孩子自己規劃的計畫，而且
   *    只碰共同條件。合成一支的話，每加一個欄位都要先問「這是哪一條的」。
   *
   * 終點是 needs_child_review，不是 active：不建任務、不發幣。
   */
  async proposeChildPlanningTerms(
    card: ParentProposalCardData,
    terms: ChildPlanningSharedTerms,
    childAgeGroup: string,
  ): Promise<ProposeChildPlanningTermsResult> {
    const built = buildChildPlanningTermsCommand(card, terms, childAgeGroup);
    if (built.ok !== true) return built;

    const fallback = '送出共同條件失敗';
    const result = await callProposalRpc(
      PROPOSE_CHILD_PLANNING_TERMS_RPC, built.command, fallback,
    );
    if (result.ok !== true) return result;

    const proposalId = requireId(result.payload, 'proposalId', fallback);
    if (isFailure(proposalId)) return proposalId;
    const planVersionId = requireId(result.payload, 'planVersionId', fallback);
    if (isFailure(planVersionId)) return planVersionId;
    const sourcePlanVersionId = requireId(result.payload, 'sourcePlanVersionId', fallback);
    if (isFailure(sourcePlanVersionId)) return sourcePlanVersionId;
    const childPlanVersionId = requireId(result.payload, 'childPlanVersionId', fallback);
    if (isFailure(childPlanVersionId)) return childPlanVersionId;
    if (result.payload.status !== 'needs_child_review') {
      return { ok: false, code: 'UNKNOWN', message: `${fallback}：回應狀態無法辨識` };
    }

    return {
      ok: true,
      proposalId,
      planVersionId,
      sourcePlanVersionId,
      childPlanVersionId,
      status: 'needs_child_review',
      requiresParentDecision: Array.isArray(result.payload.requiresParentDecision)
        ? result.payload.requiresParentDecision.filter(
          (term): term is string => typeof term === 'string')
        : [],
      idempotentReplay: result.payload.idempotentReplay === true,
    };
  }

  async revisePlan(
    card: ParentProposalCardData,
    edits: ParentProposalMaterialEdits,
  ): Promise<ReviseChildProposalResult> {
    const built = buildRevisionCommand(card, edits);
    if (built.ok !== true) return built;
    const fallback = '儲存調整失敗';
    const result = await callProposalRpc(REVISE_CHILD_PROPOSAL_PLAN_RPC, built.command, fallback);
    if (result.ok !== true) return result;
    const proposalId = requireId(result.payload, 'proposalId', fallback);
    if (isFailure(proposalId)) return proposalId;
    const planVersionId = requireId(result.payload, 'planVersionId', fallback);
    if (isFailure(planVersionId)) return planVersionId;
    if (result.payload.status !== 'needs_child_review') {
      return { ok: false, code: 'UNKNOWN', message: `${fallback}：回應狀態無法辨識` };
    }
    return {
      ok: true,
      proposalId,
      planVersionId,
      status: 'needs_child_review',
      idempotentReplay: result.payload.idempotentReplay === true,
    };
  }

  /**
   * P1-A4B2：孩子接受家長提出的共同條件。
   *
   * ⚠️ 回傳的 `activated` 才是「這件事開始了沒有」。條件還沒說完的那一輪
   *    也是 ok:true —— 那代表「他同意這一輪」，不是「任務開始了」。
   *    把 ok 當成開始，畫面就會對孩子說謊。
   */
  async acceptChildPlanningTerms(
    review: ChildProposalReviewData,
    childAgeGroup: string,
  ): Promise<AcceptChildPlanningTermsResult> {
    const built = buildChildAcceptCommand(review, childAgeGroup);
    if (built.ok !== true) return built;

    const fallback = '送出你的回覆失敗';
    const result = await callProposalRpc(
      ACCEPT_CHILD_PLANNING_TERMS_RPC, built.command, fallback,
    );
    if (result.ok !== true) return result;

    const proposalId = requireId(result.payload, 'proposalId', fallback);
    if (isFailure(proposalId)) return proposalId;
    const planVersionId = requireId(result.payload, 'planVersionId', fallback);
    if (isFailure(planVersionId)) return planVersionId;

    const activated = result.payload.activated === true;
    const status = result.payload.status;
    if (status !== 'active' && status !== 'proposed') {
      return { ok: false, code: 'UNKNOWN', message: `${fallback}：回應狀態無法辨識` };
    }
    if (activated !== (status === 'active')) {
      return { ok: false, code: 'UNKNOWN', message: `${fallback}：回應狀態前後不一致` };
    }

    let taskId: string | null = null;
    let confirmedReward: ChildProposalConfirmedReward | null = null;
    if (activated) {
      const id = requireId(result.payload, 'taskId', fallback);
      if (isFailure(id)) return id;
      taskId = id;
      if (!isConfirmedReward(result.payload.confirmedReward)) {
        return {
          ok: false, code: 'UNKNOWN', reason: 'CONFIRMED_REWARD_MISSING',
          message: `${fallback}：共同版本缺少確認的回饋紀錄`,
        };
      }
      confirmedReward = result.payload.confirmedReward;
    }

    return {
      ok: true,
      proposalId,
      planVersionId,
      status,
      activated,
      taskId,
      childPlanVersionId: typeof result.payload.childPlanVersionId === 'string'
        ? result.payload.childPlanVersionId
        : null,
      requiresParentDecision: Array.isArray(result.payload.requiresParentDecision)
        ? result.payload.requiresParentDecision.filter(
          (term): term is string => typeof term === 'string')
        : [],
      confirmedReward,
      idempotentReplay: result.payload.idempotentReplay === true,
    };
  }

  /** P1-A4B2：孩子想再和家長談。不建任務、不改任何版本內容。 */
  async requestChildPlanningTermChanges(
    review: ChildProposalReviewData,
    reason?: string,
  ): Promise<RequestChildPlanningTermChangesResult> {
    const built = buildChildRequestChangesCommand(review, reason);
    if (built.ok !== true) return built;

    const fallback = '送出你的想法失敗';
    const result = await callProposalRpc(
      REQUEST_CHILD_PLANNING_TERM_CHANGES_RPC, built.command, fallback,
    );
    if (result.ok !== true) return result;

    const proposalId = requireId(result.payload, 'proposalId', fallback);
    if (isFailure(proposalId)) return proposalId;
    const planVersionId = requireId(result.payload, 'planVersionId', fallback);
    if (isFailure(planVersionId)) return planVersionId;
    if (result.payload.status !== 'proposed') {
      return { ok: false, code: 'UNKNOWN', message: `${fallback}：回應狀態無法辨識` };
    }

    return {
      ok: true,
      proposalId,
      planVersionId,
      status: 'proposed',
      idempotentReplay: result.payload.idempotentReplay === true,
    };
  }

  async acceptReview(
    review: ChildProposalReviewData,
    childAgeGroup: string,
  ): Promise<AcceptChildProposalResult> {
    const built = buildAcceptReviewCommand(review, childAgeGroup);
    if (built.ok !== true) return built;
    const fallback = '建立共同計畫失敗';
    const result = await callProposalRpc(ACCEPT_CHILD_PROPOSAL_PLAN_RPC, built.command, fallback);
    if (result.ok !== true) return result;
    const proposalId = requireId(result.payload, 'proposalId', fallback);
    if (isFailure(proposalId)) return proposalId;
    const planVersionId = requireId(result.payload, 'planVersionId', fallback);
    if (isFailure(planVersionId)) return planVersionId;
    const taskId = requireId(result.payload, 'taskId', fallback);
    if (isFailure(taskId)) return taskId;
    if (!isConfirmedReward(result.payload.confirmedReward)) {
      return {
        ok: false, code: 'UNKNOWN', reason: 'CONFIRMED_REWARD_MISSING',
        message: `${fallback}：共同版本缺少確認的回饋紀錄`,
      };
    }
    return {
      ok: true,
      proposalId,
      planVersionId,
      taskId,
      relatedIds: Array.isArray(result.payload.relatedIds)
        ? result.payload.relatedIds.filter((id): id is string => typeof id === 'string')
        : [],
      confirmedReward: result.payload.confirmedReward,
      idempotentReplay: result.payload.idempotentReplay === true,
    };
  }

  async requestChanges(
    review: ChildProposalReviewData,
    reason?: string,
  ): Promise<RequestChildProposalChangesResult> {
    const fallback = '暫時保留討論失敗';
    const command = buildRequestChangesCommand(review, reason);
    const result = await callProposalRpc(
      REQUEST_CHILD_PROPOSAL_CHANGES_RPC,
      command,
      fallback,
    );
    if (result.ok !== true) return result;
    const proposalId = requireId(result.payload, 'proposalId', fallback);
    if (isFailure(proposalId)) return proposalId;
    const planVersionId = requireId(result.payload, 'planVersionId', fallback);
    if (isFailure(planVersionId)) return planVersionId;
    if (result.payload.status !== 'proposed') {
      return { ok: false, code: 'UNKNOWN', message: `${fallback}：回應狀態無法辨識` };
    }
    return {
      ok: true,
      proposalId,
      planVersionId,
      status: 'proposed',
      idempotentReplay: result.payload.idempotentReplay === true,
    };
  }

  async closeUnsuitable(
    card: ParentProposalCardData,
    reason: string,
  ): Promise<CloseChildProposalResult> {
    if (!reason.trim()) {
      return {
        ok: false, code: 'VALIDATION_FAILED',
        reason: 'CLOSE_REQUIRES_REASON', message: '請留一句話給孩子',
      };
    }
    const fallback = '關閉提案失敗';
    const command = buildCloseUnsuitableCommand(card, reason);
    const result = await callProposalRpc(
      CLOSE_CHILD_PROPOSAL_UNSUITABLE_RPC,
      command,
      fallback,
    );
    if (result.ok !== true) return result;
    const proposalId = requireId(result.payload, 'proposalId', fallback);
    if (isFailure(proposalId)) return proposalId;
    const planVersionId = typeof result.payload.planVersionId === 'string'
      ? result.payload.planVersionId
      : null;
    if (result.payload.status !== 'closed_unsuitable') {
      return { ok: false, code: 'UNKNOWN', message: `${fallback}：回應狀態無法辨識` };
    }
    return {
      ok: true,
      proposalId,
      planVersionId,
      status: 'closed_unsuitable',
      idempotentReplay: result.payload.idempotentReplay === true,
    };
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
   * 這是**省配額**的那一層，不是唯一性保證那一層：兩個同時發出的請求仍然
   * 可能都查不到、於是都往下走。真正的唯一性由 migration 20260812000000 的
   * partial unique index `(proposal_id, ai_request_id)` 保證，RPC 用
   * ON CONFLICT DO NOTHING 接住並回既有那一版（duplicate: true）。
   * 兩層各有各的用處：這一層省掉一次模型呼叫，那一層保證資料庫裡只有一份。
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

  /**
   * 孩子端長期詳情的 Shared Plan 判定。
   *
   * 從任務往回找提案 —— 因為畫面手上只有 goalId / taskId，而共同計畫的身分
   * 記在 plan version 的 `confirmed_source_task_id`。找到提案後**不沿用**那一版
   * 當 current，改用 `proposal.current_plan_version_id` 重新查：家長確認過一次
   * 調整之後，current 已經是新的一版，拿舊版當 expectedPlanVersionId 會讓
   * RPC 直接以 STALE_PLAN_VERSION 退回。
   *
   * 任何一段對不上就回 null。回 null 的意思是「這不是可協商的共同計畫」，
   * 畫面因此維持原本的 local draft 行為 —— 一般家長建立的長期任務走的正是這條。
   */
  async getActiveSharedPlanForTask({
    taskId,
    childId,
  }: {
    taskId: string;
    childId: string;
  }): Promise<ChildSharedPlanContext | null> {
    const { data: linkedVersions, error: linkError } = await supabase
      .from('child_proposal_plan_versions')
      .select('proposal_id')
      .eq('confirmed_source_task_id', taskId)
      .limit(20);
    if (linkError) throw new Error(linkError.message || '讀取共同計畫失敗');

    const proposalIds = [...new Set((linkedVersions ?? []).map(row => row.proposal_id))];
    if (proposalIds.length === 0) return null;

    const { data: proposals, error: proposalError } = await supabase
      .from('child_proposals')
      .select('*')
      .in('id', proposalIds)
      .eq('child_id', childId)
      .eq('status', 'active')
      .limit(2);
    if (proposalError) throw new Error(proposalError.message || '讀取共同計畫失敗');

    // 一個任務對到兩個 active 提案是資料矛盾，不是可以挑一個的選擇題。
    const proposal = proposals?.length === 1 ? proposals[0] : null;
    if (!proposal?.current_plan_version_id) return null;

    const { data: current, error: currentError } = await supabase
      .from('child_proposal_plan_versions')
      .select('*')
      .eq('id', proposal.current_plan_version_id)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message || '讀取目前版本失敗');
    if (!current || current.proposal_id !== proposal.id) return null;

    const { data: openRequests, error: requestError } = await supabase
      .from('child_proposal_adjustment_requests')
      .select('*')
      .eq('proposal_id', proposal.id)
      .eq('status', 'open')
      .eq('adjustment_kind', 'preferred_time')
      .order('created_at', { ascending: false })
      .limit(1);
    if (requestError) throw new Error(requestError.message || '讀取調整請求失敗');

    return {
      proposal,
      currentPlanVersion: current as ChildProposalPlanVersion,
      openPreferredTimeRequest: openRequests?.[0] ?? null,
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

    const status = result.payload.status;
    return {
      ok: true,
      adjustmentRequestId: id,
      status: typeof status === 'string'
        ? (status as CreateAdjustmentRequestSuccess['status'])
        : 'open',
      idempotentReplay: result.payload.idempotentReplay === true,
    };
  }

  /**
   * 家長首頁的 response-needed 區塊要用的資料。
   *
   * 只讀 open 的時段調整 —— 其他 kind 目前沒有 workflow 接得住，撈出來只會
   * 變成一張按了沒反應的卡。
   */
  async listOpenAdjustmentsForParent({
    familyId,
    childId,
  }: {
    familyId: string;
    childId: string;
  }): Promise<ChildProposalAdjustmentCardData[]> {
    const { data: requests, error } = await supabase
      .from('child_proposal_adjustment_requests')
      .select('*')
      .eq('family_id', familyId)
      .eq('status', 'open')
      .eq('adjustment_kind', 'preferred_time')
      .order('created_at', { ascending: false })
      .limit(3);
    if (error) throw new Error(error.message || '讀取調整請求失敗');
    if (!requests?.length) return [];

    const { data: proposals, error: proposalError } = await supabase
      .from('child_proposals')
      .select('*')
      .in('id', [...new Set(requests.map(r => r.proposal_id))])
      .eq('child_id', childId);
    if (proposalError) throw new Error(proposalError.message || '讀取提案失敗');

    const byId = new Map((proposals ?? []).map(p => [p.id, p]));
    const versionIds = requests
      .map(r => r.based_on_plan_version_id)
      .filter((id): id is string => typeof id === 'string');
    if (versionIds.length === 0) return [];

    const { data: versions, error: versionError } = await supabase
      .from('child_proposal_plan_versions')
      .select('*')
      .in('id', versionIds);
    if (versionError) throw new Error(versionError.message || '讀取計畫版本失敗');
    const versionById = new Map((versions ?? []).map(v => [v.id, v]));

    return requests.flatMap(request => {
      const proposal = byId.get(request.proposal_id);
      const basedOn = request.based_on_plan_version_id
        ? versionById.get(request.based_on_plan_version_id)
        : undefined;
      // 提案已經前進到別的版本時，這張卡代表的差異已經不是現況 ——
      // 與其顯示一個過期的「睡前 → 晚餐後」，不如不顯示。
      if (!proposal || !basedOn
        || proposal.status !== 'active'
        || proposal.current_plan_version_id !== basedOn.id) return [];
      return [{ request, proposal, basedOnPlanVersion: basedOn }];
    });
  }

  async acceptAdjustment(
    command: AcceptChildProposalAdjustmentCommand,
  ): Promise<AcceptAdjustmentResult> {
    const fallback = '確認調整失敗';
    const result = await callProposalRpc(
      ACCEPT_CHILD_PROPOSAL_ADJUSTMENT_RPC, command, fallback,
    );
    if (result.ok !== true) return result;

    const requestId = requireId(result.payload, 'adjustmentRequestId', fallback);
    if (isFailure(requestId)) return requestId;
    const proposalId = requireId(result.payload, 'proposalId', fallback);
    if (isFailure(proposalId)) return proposalId;
    const planVersionId = requireId(result.payload, 'planVersionId', fallback);
    if (isFailure(planVersionId)) return planVersionId;
    const taskId = requireId(result.payload, 'taskId', fallback);
    if (isFailure(taskId)) return taskId;

    return {
      ok: true,
      adjustmentRequestId: requestId,
      proposalId,
      planVersionId,
      taskId,
      idempotentReplay: result.payload.idempotentReplay === true,
    };
  }

  async declineAdjustment(
    command: DeclineChildProposalAdjustmentCommand,
  ): Promise<DeclineAdjustmentResult> {
    const fallback = '保留原本安排失敗';
    const result = await callProposalRpc(
      DECLINE_CHILD_PROPOSAL_ADJUSTMENT_RPC, command, fallback,
    );
    if (result.ok !== true) return result;

    const requestId = requireId(result.payload, 'adjustmentRequestId', fallback);
    if (isFailure(requestId)) return requestId;

    return {
      ok: true,
      adjustmentRequestId: requestId,
      status: 'declined',
      idempotentReplay: result.payload.idempotentReplay === true,
    };
  }
}
