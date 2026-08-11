// Shadow Wallet — 產生一份 AI Plan Draft 並存成計畫版本（P0-3）
//
// ─────────────────────────────────────────────────────────────────────────
// 這支是整包的骨幹，而它最重要的性質是：**它永遠不會讓提案變糟。**
//
// Proposal 在這支被呼叫之前就已經 proposed 且持久化了。所以無論
// AI 關著、逾時、回一堆亂碼、還是 Edge Function 掛掉，最壞的結果都只是
//
//     「這筆提案目前還沒有 AI 整理的草稿」
//
// 而不是提案消失、退回 draft、建立任務、或孩子看到失敗。
// 這支因此**不 throw**，所有出口都是一個結構化的 outcome。
//
// 順序是刻意的：
//
//   1. AI 關著 → 立刻結束。不查 DB、不花任何一次請求。
//   2. 讀真實的 Proposal 列（AI 必須基於真實提案，不是畫面上的草稿）。
//   3. 算出決定性的 request key，先查有沒有同一把 key 的版本 ——
//      **在呼叫模型之前**。重試因此不會多花一次配額，也不會多一列版本。
//   4. 呼叫模型（帶逾時）。
//   5. 驗證回應。看不懂就結束，不寫任何東西。
//   6. 寫成 authored_by='ai' 的計畫版本。
// ─────────────────────────────────────────────────────────────────────────

import {
  buildPlanDraftInput,
  planDraftRequestKey,
} from './buildPlanDraftInput';
import { toAddPlanVersionCommand } from './toPlanVersionCommand';
import type {
  ChildProposalPlanDraftClient,
  ChildProposalPlanDraftInput,
  PlanDraftAgeGroup,
  PlanDraftUnavailableReason,
} from './types';
import type {
  AddChildProposalPlanVersionCommand,
  AddPlanVersionResult,
  ChildProposal,
  ChildProposalFailureCode,
} from '../types';

/** 這支需要的資料存取。介面而非 service 實體 —— 測試才注入得進去。 */
export interface PlanDraftPort {
  getProposal(proposalId: string): Promise<ChildProposal | null>;
  getChildAgeGroup(childId: string): Promise<PlanDraftAgeGroup | null>;
  findPlanVersionIdByAiRequestId(args: {
    proposalId: string;
    aiRequestId: string;
  }): Promise<string | null>;
  addPlanVersion(
    command: AddChildProposalPlanVersionCommand,
  ): Promise<AddPlanVersionResult>;
}

export type PlanDraftOutcome =
  /** 這一輪本來就不該跑。全部都不是錯誤。 */
  | {
      status: 'skipped';
      reason:
        | 'ai_disabled'
        | 'already_generated'
        | 'proposal_not_found'
        | 'proposal_not_proposed'
        | 'missing_age_group';
      planVersionId?: string;
    }
  /** 跑了但沒有草稿。Proposal 完全不受影響。 */
  | { status: 'unavailable'; reason: PlanDraftUnavailableReason }
  /** 有草稿但沒存進去。Proposal 一樣不受影響。 */
  | { status: 'persist_failed'; code: ChildProposalFailureCode; message: string }
  | {
      status: 'saved';
      planVersionId: string;
      versionNo: number;
      aiRequestId: string;
      /**
       * DB 的 unique index 擋下了這一次插入，回傳的是既有那一版。
       *
       * 仍然是 `saved` —— 結果與預期完全一致（那一版就在那裡）。
       * 分開記是為了讓 log 分得出「真的併發過」與「一次就寫成」。
       */
      duplicateSuppressed: boolean;
    };

const AGE_GROUPS: readonly string[] = ['2-4', '4-6', '6-9', '9-12'];

export type GeneratePlanDraftDeps = {
  /** null = 這個環境不提供 AI。不是「會失敗的 client」——那會讓人一直重試。 */
  client: ChildProposalPlanDraftClient | null;
  port: PlanDraftPort;
  /** 測試注入固定時間，讓 snapshot 可以逐欄比對。 */
  now?: () => Date;
  signal?: AbortSignal;
};

/**
 * 讀提案 → 整理 → 存成計畫版本。
 *
 * 回傳值只給呼叫端記 log 用。孩子端**不看**它，也不該看：
 * 成功頁在這支開始之前就已經成立了。
 */
export async function generateChildProposalPlanDraft(
  deps: GeneratePlanDraftDeps,
  proposalId: string,
): Promise<PlanDraftOutcome> {
  const { client, port } = deps;

  // 1. AI 關著就到此為止 —— 一次 DB 查詢都不做。
  if (client === null) return { status: 'skipped', reason: 'ai_disabled' };

  // 2. 真實的提案列。畫面上的草稿在送出之後就不再是權威。
  const proposal = await port.getProposal(proposalId);
  if (proposal === null) return { status: 'skipped', reason: 'proposal_not_found' };

  // AI 是 proposed 之後的加值。draft 還沒送出、active 已經定案，都不該再整理。
  if (proposal.status !== 'proposed') {
    return { status: 'skipped', reason: 'proposal_not_proposed' };
  }

  const ageGroup = await port.getChildAgeGroup(proposal.child_id);
  if (ageGroup === null || !AGE_GROUPS.includes(ageGroup)) {
    // 年齡段決定資格閘門與幣值規則。沒有它就只能猜，而猜出來的東西
    // 會被存成一份看起來很正式的草稿。寧可沒有草稿。
    return { status: 'skipped', reason: 'missing_age_group' };
  }

  const input: ChildProposalPlanDraftInput = buildPlanDraftInput(proposal, ageGroup);
  const aiRequestId = planDraftRequestKey(proposalId, input);

  // 3. 同一份輸入已經整理過了 → 不重跑。在呼叫模型**之前**擋。
  const existing = await port.findPlanVersionIdByAiRequestId({ proposalId, aiRequestId });
  if (existing !== null) {
    return { status: 'skipped', reason: 'already_generated', planVersionId: existing };
  }

  // 4. 呼叫模型。client 內部負責逾時，這裡只轉達外層的取消訊號。
  const result = await client.requestPlanDraft(input, deps.signal);

  // 5. 看不懂或服務不可用 → 結束。**不寫任何東西。**
  if (result.status !== 'draft') {
    return { status: 'unavailable', reason: result.reason };
  }

  // 6. 存成 authored_by='ai' 的版本。
  const generatedAt = (deps.now ? deps.now() : new Date()).toISOString();
  const command = toAddPlanVersionCommand({
    proposalId,
    input,
    draft: result.draft,
    requestId: aiRequestId,
    generatedAt,
  });

  const saved = await port.addPlanVersion(command);
  if (!saved.ok) {
    return { status: 'persist_failed', code: saved.code, message: saved.message };
  }

  return {
    status: 'saved',
    planVersionId: saved.planVersionId,
    versionNo: saved.versionNo,
    aiRequestId,
    // 呼叫前的查重擋掉大部分重試；真的併發時由 DB 的 unique index 收尾，
    // RPC 回既有那一版並標記 duplicate。兩層都不會留下第二份草稿。
    duplicateSuppressed: saved.duplicate,
  };
}

/**
 * 背景版本：吞掉所有例外，只留下一行 log。
 *
 * 孩子端在成功頁呼叫這支。**不 await** —— 讓孩子等 Gemini 才看得到
 * 「想法記下來了」，等於把一個非必要的加值變成必經的關卡。
 *
 * 存在的理由是 unhandled rejection：`void promise` 在 RN 上會變成一個
 * 沒有人處理的紅字，而這條路徑的失敗本來就是預期內的。
 */
export function generateChildProposalPlanDraftInBackground(
  deps: GeneratePlanDraftDeps,
  proposalId: string,
  onSettled?: (outcome: PlanDraftOutcome | { status: 'crashed'; error: unknown }) => void,
): void {
  generateChildProposalPlanDraft(deps, proposalId)
    .then((outcome) => {
      if (outcome.status === 'unavailable' || outcome.status === 'persist_failed') {
        console.warn('[childProposal.planDraft] 沒有產生草稿：', outcome);
      }
      onSettled?.(outcome);
    })
    .catch((error: unknown) => {
      // 這裡不該被走到 —— generateChildProposalPlanDraft 的每個出口都是結構化的。
      // 走到了代表 port 的實作丟了例外，而那仍然不可以影響提案。
      console.warn('[childProposal.planDraft] 背景工作丟出例外：', error);
      onSettled?.({ status: 'crashed', error });
    });
}
