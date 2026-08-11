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
// 反過來，completionDescription 目前**沒有**欄位（正式任務才有），
// 所以它留在 snapshot 等 P0-5 取用。不為一個還沒有人讀的欄位改 schema。
//
// ⚠️ 命令裡永遠不會出現 coinAmount / finalAmount / confirmedCoinAmount ——
//    RPC 收到任何一個都會以 REWARD_NOT_CLIENT_DECIDED 整筆拒絕。
//    AI 建議的數字只有一個合法出口：reward.aiSuggestedCoinAmount，
//    而且必須同時附 aiSnapshot（沒有出處的建議不予保存）。
// ─────────────────────────────────────────────────────────────────────────

// 直接指向定義它的檔案，不走 taskCatalog 的 barrel（見 planDraftClient 的同一則說明）。
import { TASK_POLICY_VERSION } from '../../../screens/parent/tablet/taskDrawer/taskCatalog/types';
import {
  CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION,
  type AddChildProposalPlanVersionCommand,
} from '../types';
import type {
  ChildProposalPlanDraft,
  ChildProposalPlanDraftInput,
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
    /** 目前沒有結構欄位可放，P0-5 建立正式任務時取用。 */
    completionDescription: string;
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
    /** 規則引擎算出來的建議值。**永遠不是最終確認的幣值。** */
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
  requestId: string;
  generatedAt: string;
}): PlanDraftSnapshot {
  const { input, draft, requestId, generatedAt } = args;
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
      completionDescription: draft.completionDescription,
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

  return {
    schemaVersion: CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION,
    proposalId,
    authoredBy: 'ai',

    planTitle: draft.planTitle,
    planSummary: draft.planSummary,

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
      // 規則引擎算得出數字才有這一鍵。模型講的數字到不了這裡。
      ...(draft.aiSuggestedCoinAmount !== null
        ? { aiSuggestedCoinAmount: draft.aiSuggestedCoinAmount }
        : null),
    },
    taskPolicyVersion: TASK_POLICY_VERSION,

    aiSnapshot: buildPlanDraftSnapshot({ input, draft, requestId, generatedAt }),
    aiModel: draft.model,
    aiRequestId: requestId,

    // AI 整理的草稿**不需要孩子重新接受**：需要孩子接受的是「家長做了重大修改」,
    // 而這一版沒有取代孩子的任何選擇 —— 節奏照抄、原話沒動。
    requiresChildReview: false,
    makeCurrent: true,
  };
}
