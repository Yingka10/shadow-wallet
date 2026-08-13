// Shadow Wallet — Plan Draft → P0-1 的 addPlanVersion 命令（P0-3）
//
// ─────────────────────────────────────────────────────────────────────────
// 這一層決定「什麼寫進結構欄位、什麼留在 snapshot」。
//
// 規則很簡單：**schema 已經有欄位的，寫欄位。**
// snapshot 是稽核歷史，不是一個什麼都丟得進去的桶子 —— 把 cadence 或
// estimatedMinutes 只塞進 JSON，等於讓 P0-5 之後必須解 JSON 才查得到,
// 而週報想統計「這個月 AI 建議了幾個長期計畫」就得掃全表。
//
// completionDescription 有兩份，而它們是不同的東西：模型寫的那一句是
// **候選／稽核證據**，只進 snapshot；正式欄位寫的是 canonicalPlanFields
// 依 activityKind 組出來的固定句型。正式的完成標準不照抄模型的自由文字。
//
// ⚠️ 命令裡永遠不會出現 coinAmount / finalAmount / confirmedCoinAmount ——
//    RPC 收到任何一個都會以 REWARD_NOT_CLIENT_DECIDED 整筆拒絕。
//    AI 建議的數字只有一個合法出口：reward.aiSuggestedCoinAmount，
//    而且必須同時附 aiSnapshot（沒有出處的建議不予保存）。
// ─────────────────────────────────────────────────────────────────────────

// 直接指向定義它的檔案，不走 taskCatalog 的 barrel（見 planDraftClient 的同一則說明）。
import { TASK_POLICY_VERSION } from '../../../screens/parent/tablet/taskDrawer/taskCatalog/types';
import { canonicalPlanFields, type CanonicalPlanFields } from './canonicalPlanFields';
import {
  CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION,
  type AddChildProposalPlanVersionCommand,
} from '../types';
import type {
  ChildProposalPlanDraft,
  ChildProposalPlanDraftInput,
  PricingBasis,
} from './types';

/** snapshot 的版本。改了內容結構就要改它，讀的人才知道自己在看哪一代。 */
export const PLAN_DRAFT_SNAPSHOT_VERSION = 1;

export type PlanDraftSnapshot = {
  snapshotVersion: typeof PLAN_DRAFT_SNAPSHOT_VERSION;
  /** 這份草稿從哪裡來。人類讀 log 時第一個想知道的事。 */
  source: 'ai-proxy/childProposalPlanDraft';
  generatedAt: string;
  requestId: string;
  model: string;
  /** 模型當時實際看到的東西。少記這一段，之後就無法重現任何一次判斷。 */
  input: ChildProposalPlanDraftInput;
  plan: {
    planTitle: string;
    planSummary: string;
    /**
     * ⚠️ **模型寫的那一句，只是稽核證據。**
     *
     * 正式的完成標準在結構化欄位 `completion_description`，由
     * canonicalCompletionDescription 依 activityKind 組出固定句型。
     * 兩者都記下來，是為了讓「模型當時想寫什麼」與「我們最後用了什麼」
     * 可以被比對 —— 那正是 snapshot 該做的事。
     */
    aiCompletionDescriptionCandidate: string;
    /** 實際寫進結構化欄位的那一句。 */
    canonicalCompletionDescription: string;
    activityKind: ChildProposalPlanDraft['activityKind'];
    purposeCategory: ChildProposalPlanDraft['category'];
    progressModel: string | null;
    /** 模型建議的下一步（不論有沒有通過驗證）。 */
    aiNextStepSuggestion: string | null;
    /** 通過驗證、真的寫進欄位的那一句；沒過就是 null。 */
    canonicalNextStep: string | null;
    cadence: ChildProposalPlanDraft['cadence'];
    /** child = 照抄孩子選的；ai_suggested = 孩子沒選才由 AI 提。 */
    cadenceSource: ChildProposalPlanDraft['cadenceSource'];
    durationType: ChildProposalPlanDraft['durationType'];
    durationDays: number | null;
    estimatedMinutes: number;
  };
  understanding: {
    category: ChildProposalPlanDraft['category'];
    categoryReason: string;
    difficulty: ChildProposalPlanDraft['difficulty'];
  };
  policy: {
    rewardPolicy: ChildProposalPlanDraft['rewardPolicy'];
    rewardEligibility: ChildProposalPlanDraft['rewardEligibility'];
    rewardPolicyVersion: string;
    taskPolicyVersion: string;
    /** 幣值走到哪一步。unpriced = 規則引擎的數字還沒定案，不是壞掉。 */
    pricingStatus: ChildProposalPlanDraft['pricingStatus'];
    /** 結算基準。目前恆為 'per_completion'，見 planDraft/types.ts 的說明。 */
    payoutType: ChildProposalPlanDraft['payoutType'];
    /** 一次投入的參考值。**不是**最終確認的幣值，尤其在 payoutType 不是
     *  per_completion 時。歷史 snapshot 一律保留舊名，不追溯改寫。 */
    sessionCoinReference: number | null;
    /** 算出 sessionCoinReference 的依據；沒有 session price 時是 null。 */
    pricingBasis: PricingBasis | null;
    /** @deprecated 用 sessionCoinReference。保留舊名是因為它是歷史稽核紀錄
     *  的一部分，不追溯改寫已經寫入的 snapshot 形狀。 */
    aiSuggestedCoinAmount: number | null;
  };
  findings: {
    blockingIssues: string[];
    requiresConfirmation: string[];
    warnings: string[];
    clarificationQuestion: string | null;
  };
};

export function buildPlanDraftSnapshot(args: {
  input: ChildProposalPlanDraftInput;
  draft: ChildProposalPlanDraft;
  canonical: CanonicalPlanFields;
  requestId: string;
  generatedAt: string;
}): PlanDraftSnapshot {
  const { input, draft, canonical, requestId, generatedAt } = args;
  return {
    snapshotVersion: PLAN_DRAFT_SNAPSHOT_VERSION,
    source: 'ai-proxy/childProposalPlanDraft',
    generatedAt,
    requestId,
    model: draft.model,
    input,
    plan: {
      planTitle: draft.planTitle,
      planSummary: draft.planSummary,
      aiCompletionDescriptionCandidate: draft.completionDescription,
      canonicalCompletionDescription: canonical.completionDescription,
      activityKind: draft.activityKind,
      purposeCategory: canonical.purposeCategory,
      progressModel: canonical.progressModel,
      aiNextStepSuggestion: draft.nextStepSuggestion,
      canonicalNextStep: canonical.nextStep,
      cadence: draft.cadence,
      cadenceSource: draft.cadenceSource,
      durationType: draft.durationType,
      durationDays: draft.durationDays,
      estimatedMinutes: draft.estimatedMinutes,
    },
    understanding: {
      category: draft.category,
      categoryReason: draft.categoryReason,
      difficulty: draft.difficulty,
    },
    policy: {
      rewardPolicy: draft.rewardPolicy,
      rewardEligibility: draft.rewardEligibility,
      rewardPolicyVersion: draft.rewardPolicyVersion,
      taskPolicyVersion: TASK_POLICY_VERSION,
      pricingStatus: draft.pricingStatus,
      payoutType: draft.payoutType,
      sessionCoinReference: draft.sessionCoinReference,
      pricingBasis: draft.pricing?.basis ?? null,
      aiSuggestedCoinAmount: draft.aiSuggestedCoinAmount,
    },
    findings: {
      blockingIssues: draft.blockingIssues,
      requiresConfirmation: draft.requiresConfirmation,
      warnings: draft.warnings,
      clarificationQuestion: draft.clarificationQuestion,
    },
  };
}

export function toAddPlanVersionCommand(args: {
  proposalId: string;
  input: ChildProposalPlanDraftInput;
  draft: ChildProposalPlanDraft;
  requestId: string;
  generatedAt: string;
}): AddChildProposalPlanVersionCommand {
  const { proposalId, input, draft, requestId, generatedAt } = args;

  // 四個 canonical 欄位。**在這裡算，不是從模型的回應照抄。**
  const canonical = canonicalPlanFields(draft);

  return {
    schemaVersion: CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION,
    proposalId,
    authoredBy: 'ai',

    planTitle: draft.planTitle,
    planSummary: draft.planSummary,

    // ── P0-5 直接讀得到的結構化欄位 ──────────────────────────────────────
    // 這四個不放在 ai_snapshot 裡等人去解 JSON。
    purposeCategory: canonical.purposeCategory,
    completionDescription: canonical.completionDescription,
    ...(canonical.progressModel !== null ? { progressModel: canonical.progressModel } : null),
    ...(canonical.nextStep !== null ? { nextStep: canonical.nextStep } : null),

    ...(draft.cadence
      ? {
          cadence: {
            mode: draft.cadence.mode,
            ...(draft.cadence.weeklyFrequency !== undefined
              ? { weeklyFrequency: draft.cadence.weeklyFrequency }
              : null),
            ...(draft.cadence.days !== undefined ? { days: draft.cadence.days } : null),
            ...(input.preferredTime ? { preferredTime: input.preferredTime } : null),
          },
        }
      : null),

    estimatedMinutes: draft.estimatedMinutes,
    durationType: draft.durationType,
    ...(draft.durationDays !== null ? { durationDays: draft.durationDays } : null),

    // startDate / endDate 刻意不填。
    //
    // 一份還沒被家長確認的草稿沒有可靠的起算日：孩子今天送出、家長明天才看到,
    // 而「開始那天」在產品上是家長確認的那一刻（P0-5）。讓 AI 或 client 現在
    // 猜一個日期出來，之後每一張進度條都會從一個沒有人同意過的日子開始算。

    reward: {
      policy: draft.rewardPolicy,
      eligibility: draft.rewardEligibility,
      policyVersion: draft.rewardPolicyVersion,
      // 只有 payoutType 是 per_completion 且真的 resolved，session 價才等於
      // 最終金額——這個命令的鍵仍然叫 aiSuggestedCoinAmount（RPC／DB 契約，
      // 這次不改），但寫不寫這一鍵現在由 pricing.status 決定，不是單看
      // 「有沒有數字」。payoutType 現階段恆為 per_completion，所以這條路徑
      // 的實際輸出跟改動前一樣；差別只在於未來哪天 payoutType 真的變成
      // per_period，這裡會自動、正確地不再把 session 參考值當最終金額送出去。
      ...(draft.pricing?.status === 'resolved'
        ? { aiSuggestedCoinAmount: draft.pricing.finalRewardCoins }
        : null),
    },
    taskPolicyVersion: TASK_POLICY_VERSION,

    aiSnapshot: buildPlanDraftSnapshot({ input, draft, canonical, requestId, generatedAt }),
    aiModel: draft.model,
    aiRequestId: requestId,

    // AI 整理的草稿**不需要孩子重新接受**：需要孩子接受的是「家長做了重大修改」,
    // 而這一版沒有取代孩子的任何選擇 —— 節奏照抄、原話沒動。
    requiresChildReview: false,
    makeCurrent: true,
  };
}
