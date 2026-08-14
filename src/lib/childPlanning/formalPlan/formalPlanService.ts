// GrowBook — bridge RPC 的薄包裝（P1-A3）
//
// 與 ChildPlanningSessionService 同一套慣例：注入得進 rpc、回覆一律正規化、
// 不在這裡重寫任何規則。

import { supabase } from '../../supabase';
import {
  PUBLISH_CHILD_CONFIRMED_PLAN_SCHEMA_VERSION,
  REQUIRES_PARENT_DECISION_VALUES,
  type ChildPlanEnrichment,
  type PublishFormalPlanFailure,
  type PublishFormalPlanFailureCode,
  type PublishFormalPlanResult,
  type RequiresParentDecision,
} from './types';

export const PUBLISH_CHILD_CONFIRMED_PLAN_RPC = 'publish_child_confirmed_plan_v1';

const FAILURE_CODES: readonly PublishFormalPlanFailureCode[] = [
  'VALIDATION_FAILED',
  'POLICY_REJECTED',
  'PERSISTENCE_FAILED',
  'UNKNOWN',
];

export type FormalPlanRpc = (
  name: typeof PUBLISH_CHILD_CONFIRMED_PLAN_RPC,
  command: object,
) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failure(
  code: PublishFormalPlanFailureCode,
  message: string,
  reason?: string,
): PublishFormalPlanFailure {
  return { ok: false, code, message, ...(reason ? { reason } : {}) };
}

function toRequiresParentDecision(value: unknown): RequiresParentDecision[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RequiresParentDecision =>
    REQUIRES_PARENT_DECISION_VALUES.includes(item as RequiresParentDecision),
  );
}

export type PublishChildConfirmedPlanArgs = {
  proposalId: string;
  sessionId: string;
  /** 缺席 = enrichment 當時不可用。**不是**錯誤。 */
  enrichment?: ChildPlanEnrichment;
};

export class ChildFormalPlanService {
  private readonly rpc: FormalPlanRpc;

  constructor(rpc: FormalPlanRpc = defaultRpc) {
    this.rpc = rpc;
  }

  async publish(args: PublishChildConfirmedPlanArgs): Promise<PublishFormalPlanResult> {
    let data: unknown;
    let error: { code?: string; message?: string } | null = null;

    try {
      const response = await this.rpc(PUBLISH_CHILD_CONFIRMED_PLAN_RPC, {
        schemaVersion: PUBLISH_CHILD_CONFIRMED_PLAN_SCHEMA_VERSION,
        proposalId: args.proposalId,
        sessionId: args.sessionId,
        ...(args.enrichment ? { enrichment: args.enrichment } : {}),
      });
      data = response.data;
      error = response.error;
    } catch (thrown) {
      return failure(
        'PERSISTENCE_FAILED',
        thrown instanceof Error ? thrown.message : '沒辦法把計畫送給爸媽',
      );
    }

    if (error !== null) {
      return failure('PERSISTENCE_FAILED', error.message ?? '沒辦法把計畫送給爸媽');
    }
    if (!isRecord(data)) return failure('UNKNOWN', '沒辦法把計畫送給爸媽');

    if (data.ok !== true) {
      const code = FAILURE_CODES.includes(data.code as PublishFormalPlanFailureCode)
        ? (data.code as PublishFormalPlanFailureCode)
        : 'UNKNOWN';
      return failure(
        code,
        typeof data.message === 'string' ? data.message : '沒辦法把計畫送給爸媽',
        typeof data.reason === 'string' ? data.reason : undefined,
      );
    }

    // ── 三個「回了成功但其實不對」的形狀一律當失敗 ────────────────────────
    //
    // 尤其是 authoredBy：正式計畫的做法作者是孩子。回 'ai' 代表某個地方
    // 為了讓 Direct Confirm 能用而偽裝了 authorship —— 那件事必須在這裡
    // 就爆出來，不是等半年後有人去查資料才發現。
    if (typeof data.planVersionId !== 'string' || typeof data.versionNo !== 'number') {
      return failure('UNKNOWN', '計畫版本沒有建立');
    }
    if (data.authoredBy !== 'child') {
      return failure('UNKNOWN', '正式計畫的作者不是孩子');
    }
    if (data.proposalStatus !== 'proposed') {
      return failure('UNKNOWN', '提案狀態沒有變成已送出');
    }

    return {
      ok: true,
      proposalId: typeof data.proposalId === 'string' ? data.proposalId : args.proposalId,
      sessionId: args.sessionId,
      planVersionId: data.planVersionId,
      versionNo: data.versionNo,
      authoredBy: 'child',
      proposalStatus: 'proposed',
      requiresParentDecision: toRequiresParentDecision(data.requiresParentDecision),
      enrichmentStatus: data.enrichmentStatus === 'enriched' ? 'enriched' : 'unavailable',
      idempotentReplay: data.idempotentReplay === true,
    };
  }
}

const defaultRpc: FormalPlanRpc = async (name, command) => {
  const response = await supabase.rpc(name, { p_command: command });
  return { data: response.data, error: response.error };
};
