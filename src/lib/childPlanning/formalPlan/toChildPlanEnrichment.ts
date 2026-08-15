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
import type { ChildPlanEnrichment } from './types';

export function toChildPlanEnrichment(args: {
  input: ChildProposalPlanDraftInput;
  draft: ChildProposalPlanDraft;
  requestId: string;
  generatedAt: string;
}): ChildPlanEnrichment {
  const { input, draft, requestId, generatedAt } = args;

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

  return {
    purposeCategory,
    completionDescription,
    estimatedMinutes: draft.estimatedMinutes,
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
      sessionCoinReference: draft.sessionCoinReference,
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
