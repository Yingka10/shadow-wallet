// GrowBook — P0 Plan Draft → P1 政策 enrichment（P1-A3 §9 / §10）
//
// ─────────────────────────────────────────────────────────────────────────
// 這支是整包最重要的一個閘門，因為它是**唯一**一個 P0 AI 的輸出可以進到
// P1 正式計畫的地方。
//
// 為什麼要重用 P0 Plan Draft：分類、活動種類、投入量、資格與定價都已經有
// 一整套經過驗證的實作（rewardEligibility 八步閘門 → coinPolicy →
// policyVersion）。再造一套「P1 pricing AI」會有兩個結果都不好：兩套數字
// 會分岔，而且新的那一套沒有人驗過。
//
// 但**只能拿政策層那幾欄**：
//
//   ✅ category / activityKind / estimatedMinutes / durationType
//   ✅ 以及由它們進既有 deterministic policy 產生的 reward 判定
//
//   ❌ planTitle          孩子的目標由他自己講
//   ❌ planSummary        做法是他確認過的那一份
//   ❌ nextStepSuggestion P1 的 nextAction 已經通過同一個 validateNextStep
//   ❌ AI 建議的 cadence  孩子沒決定就是沒決定（§11）
//   ❌ 整份重新設計的計畫
//
// 即使它們「看起來更漂亮」。一份更漂亮但孩子沒看過的計畫，
// 在這個產品裡就是一份別人的計畫。
//
// 型別已經擋掉大部分（ChildPlanEnrichment 根本沒有那些鍵），RPC 端再擋
// 一次。這裡是第三層：明確地只挑該挑的欄位，不寫 spread。
// ─────────────────────────────────────────────────────────────────────────

import { TASK_POLICY_VERSION } from '../../../screens/parent/tablet/taskDrawer/taskCatalog/types';
import {
  buildPlanDraftSnapshot,
  canonicalCompletionDescription,
  canonicalPurposeCategory,
} from '../../childProposal/planDraft';
import type {
  ChildProposalPlanDraft,
  ChildProposalPlanDraftInput,
} from '../../childProposal/planDraft/types';
import type { ChildProposalPurposeCategory } from '../../childProposal/types';
import type { ChildPlanEnrichment } from './types';
import { PURPOSE } from '../../childProposal/directConfirm/buildDirectConfirmCommand';
import {
  COIN_CATEGORY_BY_PURPOSE,
} from '../../../screens/parent/tablet/taskDrawer/taskReward/evaluateTaskReward';
import { priceCoin } from '../../../screens/parent/tablet/taskDrawer/taskReward/coinPolicy';

export function toChildPlanEnrichment(args: {
  input: ChildProposalPlanDraftInput;
  draft: ChildProposalPlanDraft;
  requestId: string;
  generatedAt: string;
  /**
   * 孩子在規劃裡自己選的單次份量。null = 他沒講，草稿說了算。
   *
   * publish RPC 的規則是「份量孩子講過就照他的」，所以正式欄位的
   * estimated_minutes 會是這個數字。錨點必須跟著它一起走 ——
   * 不然那一列自己就矛盾（10 分鐘的計畫掛著 15 分鐘的價），
   * 而家長端拿計畫份量重算之後永遠對不上，確認鍵形同壞掉。
   */
  childSessionMinutes?: number | null;
}): ChildPlanEnrichment {
  const { input, draft, requestId, generatedAt } = args;
  const childSessionMinutes = args.childSessionMinutes ?? null;

  // completion_description 走既有的固定句型，不照抄模型的自由文字 ——
  // 與 P0-3 同一個理由：模型今天寫「完成一次約定的閱讀時段」，
  // 明天可能寫「兩週後把整本書讀完」，而那一句會變成正式的完成標準。
  const purposeCategory = canonicalPurposeCategory(draft);
  const completionDescription = canonicalCompletionDescription(draft);

  // progressModel 刻意不算在這裡。
  //
  // P0 的 canonicalProgressModel 是依 P0 的 category/duration/cadence 推的，
  // 而 P1 的正確依據是孩子確認過的 progressionKind —— 那份資料在 RPC 手上，
  // 不在這裡。算了再送過去，等於讓兩個地方各自推導同一個欄位。

  // 份量與幣值錨點是同一件事的兩面，必須一起決定。
  //
  // 沒有分歧就原封不動沿用草稿 —— 重算一個相同的數字，等於讓同一件事
  // 多一個計算來源，而那正是這顆 bug 的形狀。
  const estimatedMinutes = childSessionMinutes ?? draft.estimatedMinutes;
  const sessionCoinReference = estimatedMinutes === draft.estimatedMinutes
    ? draft.sessionCoinReference
    : repriceSessionCoin(purposeCategory, input.ageGroup, estimatedMinutes);

  return {
    purposeCategory,
    completionDescription,
    estimatedMinutes,
    durationType: draft.durationType,
    ...(draft.durationDays !== null ? { durationDays: draft.durationDays } : null),
    reward: {
      policy: draft.rewardPolicy,
      eligibility: draft.rewardEligibility,
      policyVersion: draft.rewardPolicyVersion,
      // 決定好的幣值一個都不帶：P1-A3 不發幣，也不替家長先決定金額。
      //
      // 但參考價與結算語意要帶（P1-A4A.1）。它們是既有規則鏈
      // （rewardEligibility → coinPolicy）的判定，會寫進正式欄位當
      // deterministic policy evidence —— 家長同意那一步拿現在重算的
      // 結果跟它對帳，才知道政策有沒有在這段期間變過。
      //
      // 以前這兩個值只留在 ai_snapshot 裡。稽核快照的形狀由「某一次
      // enrichment 回了什麼」決定，正式任務建不建得起來不可以取決於它。
      sessionCoinReference,
      payoutType: draft.payoutType,
    },
    taskPolicyVersion: TASK_POLICY_VERSION,
    aiSnapshot: buildPlanDraftSnapshot({
      input,
      draft,
      // snapshot 記的是「模型當時想寫什麼」與「我們最後用了什麼」的對比。
      // progressModel / nextStep 在 P1 不由這條鏈決定，所以記 null ——
      // 記一個沒有被採用的值會讓之後讀 snapshot 的人以為它生效過。
      canonical: {
        purposeCategory,
        completionDescription,
        progressModel: null,
        nextStep: null,
      },
      requestId,
      generatedAt,
    }),
    aiModel: draft.model,
  };
}

/**
 * 用孩子選的份量重算單次參考價。
 *
 * 走的是**家長端確認時會走的同一條鏈**（purpose → coin category →
 * coinPolicy），這不是巧合而是要求：錨點的意義就是「拿現在重算的結果
 * 跟它對帳」，兩邊用不同的鏈算，對帳必然失敗。
 *
 * 不發幣的類別回 null —— 重算不可以讓一份本來不發幣的計畫長出幣值。
 */
function repriceSessionCoin(
  purposeCategory: ChildProposalPurposeCategory,
  ageGroup: ChildProposalPlanDraftInput['ageGroup'],
  estimatedMinutes: number,
): number | null {
  const coinCategory = COIN_CATEGORY_BY_PURPOSE[PURPOSE[purposeCategory]];
  if (coinCategory === null) return null;
  const pricing = priceCoin(ageGroup, coinCategory, estimatedMinutes);
  return pricing.status === 'priced' ? pricing.suggestedAmount : null;
}
