// GrowBook — 孩子確認過的規劃 → 正式提案版本（P1-A3 骨幹）
//
// ─────────────────────────────────────────────────────────────────────────
// 這支最重要的性質是：**enrichment 掛掉不會讓孩子卡住。**
//
// 孩子已經在螢幕上看過一份計畫並且點頭了。那件事已經發生、已經持久化。
// 在這之後，AI policy helper 是否可用只影響「政策欄位有沒有算出來」——
// 不影響那份計畫成不成立，也不影響它能不能送到家長手上。
//
// 兩條路徑，而且**兩條都會送出**：
//
//   A  enrichment 成功 → 正式計畫帶著分類、完成標準、期間、資格
//   B  enrichment 不可用 → 正式計畫只有孩子擁有的欄位，
//      缺的政策欄位列在 requires_parent_decision，
//      enrichment_status = 'unavailable'
//
// B 不是「假裝成功」。它明確地說「這些還沒算」，家長端因此可以正確顯示
// 「還要一起決定的事」，而不是看到一份看起來完整、實際上是猜出來的計畫。
//
// ⚠️ 這支**不會**再跑一輪 planning AI。planning session 已經是終點，
//    confirmed_plan 不再改變。這裡只有 translation + enrichment + publish。
// ─────────────────────────────────────────────────────────────────────────

import {
  buildPlanDraftInput,
  planDraftRequestKey,
} from '../../childProposal/planDraft';
import type {
  ChildProposalPlanDraftClient,
  PlanDraftAgeGroup,
} from '../../childProposal/planDraft/types';
import type { ChildProposal } from '../../childProposal/types';
import { toChildPlanEnrichment } from './toChildPlanEnrichment';
import type { ChildPlanEnrichment, PublishFormalPlanResult } from './types';
import type { PublishChildConfirmedPlanArgs } from './formalPlanService';

/** 這支需要的資料存取。介面而非 service 實體 —— 測試才注入得進去。 */
export interface FormalPlanBridgePort {
  getProposal(proposalId: string): Promise<ChildProposal | null>;
  getChildAgeGroup(childId: string): Promise<PlanDraftAgeGroup | null>;
  publish(args: PublishChildConfirmedPlanArgs): Promise<PublishFormalPlanResult>;
}

export type PublishChildConfirmedPlanDeps = {
  port: FormalPlanBridgePort;
  /** null = 這個環境不提供 policy enrichment。不是「會失敗的 client」。 */
  enrichmentClient: ChildProposalPlanDraftClient | null;
  /** 測試注入固定時間，讓 snapshot 可以逐欄比對。 */
  now?: () => Date;
  signal?: AbortSignal;
};

const AGE_GROUPS: readonly string[] = ['2-4', '4-6', '6-9', '9-12'];

/**
 * 試著算出政策欄位。**永遠不 throw，失敗一律回 null。**
 *
 * 這支的每一個 return null 都代表同一件事：「這一輪沒有政策欄位」，
 * 而不是「提案失敗」。呼叫端因此不需要分辨失敗原因 —— 分辨了也沒有
 * 不同的動作可做。
 */
async function tryEnrich(
  deps: PublishChildConfirmedPlanDeps,
  proposal: ChildProposal,
): Promise<ChildPlanEnrichment | null> {
  const { enrichmentClient, port } = deps;
  if (enrichmentClient === null) return null;

  try {
    const ageGroup = await port.getChildAgeGroup(proposal.child_id);
    // 年齡段決定資格閘門與幣值規則。沒有它就只能猜，而猜出來的政策欄位
    // 會被存成一份看起來很正式的東西。寧可留白。
    if (ageGroup === null || !AGE_GROUPS.includes(ageGroup)) return null;

    const input = buildPlanDraftInput(proposal, ageGroup);
    const result = await enrichmentClient.requestPlanDraft(input, deps.signal);
    if (result.status !== 'draft') return null;

    return toChildPlanEnrichment({
      input,
      draft: result.draft,
      requestId: planDraftRequestKey(proposal.id, input),
      generatedAt: (deps.now ? deps.now() : new Date()).toISOString(),
    });
  } catch {
    // port 或 client 的實作丟了例外。孩子確認過的計畫仍然要送得出去。
    return null;
  }
}

export type PublishChildConfirmedPlanInput = {
  proposalId: string;
  sessionId: string;
};

export async function publishChildConfirmedPlan(
  deps: PublishChildConfirmedPlanDeps,
  input: PublishChildConfirmedPlanInput,
): Promise<PublishFormalPlanResult> {
  const { proposalId, sessionId } = input;

  // 提案讀不到就直接讓 RPC 去判斷授權與狀態 —— 這一層不自己回一個
  // 看起來像業務規則的錯誤。RPC 是唯一的權威。
  let proposal: ChildProposal | null = null;
  try {
    proposal = await deps.port.getProposal(proposalId);
  } catch {
    proposal = null;
  }

  const enrichment = proposal === null ? null : await tryEnrich(deps, proposal);

  const args: PublishChildConfirmedPlanArgs = {
    proposalId,
    sessionId,
    ...(enrichment ? { enrichment } : {}),
  };

  return deps.port.publish(args);
}
