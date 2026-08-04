// Shadow Wallet · Parent Tablet — 自訂任務的初始草稿
//
// ─────────────────────────────────────────────────────────────────────────
// preset 入口有 `createTaskDraft(family, variant, child)`。
// 自訂入口需要對等的東西，差別只有一個：**沒有 family 也沒有 variant。**
//
// 這件事的重點在於它產出的是**同一個 TaskDraft**。
//
//   preset entry        → createTaskDraft        ─┐
//                                                 ├→ TaskDraft → editor → 驗證
//   parent_custom entry → createCustomTaskDraft  ─┘              → 審閱 → 回饋 → 命令
//
// 沒有 CustomTaskDraft、沒有第六種 editor、沒有第二支 RPC。
// 多開一條平行的 domain 會讓「家庭參與不發成長幣」這種規則
// 需要在兩個地方各寫一次 —— 而總有一天只有一邊會被更新。
//
// ⚠️ 這支函式產出的草稿**還不能送進 create_parent_task_v1**。
//    原因不在草稿本身（它完全合法），在命令與 RPC 那一側 ——
//    見 customTaskContract.ts 的 CUSTOM_TASK_COMMAND_GAP。
// ─────────────────────────────────────────────────────────────────────────

import {
  DRAFT_FALLBACKS,
  localDateWithOffset,
  type DraftChildContext,
  type FamilyRoleDraft,
  type GrowthPlanDraft,
  type OneTimeTaskDraft,
  type RecurringTaskDraft,
  type ShortSupportDraft,
  type TaskDraft,
  type TaskEditorKind,
} from '../taskDraft';
import type { RewardPolicy, TaskSource } from '../taskCatalog';
import {
  purposeCategoryOf,
  type CustomTaskIntake,
  type RewardSupportIntent,
} from './customTaskContract';
import {
  durationTypeForEditor,
  planModeForEditor,
  resolveCustomTaskEditor,
  type CustomTaskEditorResolution,
} from './customTaskRouting';
import { evaluateCustomTaskRewardOptions } from './customTaskRewardOptions';

export type CreateCustomTaskDraftInput = {
  intake: CustomTaskIntake;
  child: DraftChildContext;
  /** 與 lib/onboarding 的 AgeGroup 對齊。呼叫端算好傳入（理由同 createTaskDraft）。 */
  ageGroup?: string;
  /**
   * 家長在 needs_confirmation 之後確認要用的 editor。
   *
   * 省略就用路由的建議值。**這個參數是家長的決定，不是系統的** ——
   * 沒有它的話 needs_confirmation 就只是一句話而已，家長改不了任何東西。
   */
  confirmedEditorKind?: TaskEditorKind;
  /** 家長已經選好的回饋方式。省略就用第一個 recommended。 */
  rewardPolicy?: RewardPolicy;
  /**
   * 誰提出的。
   *
   * **預設 parent，但這是可以改的** —— 自訂入口不代表一定是家長的主意。
   * C 類（自主挑戰）的政策要求來源是孩子提出或親子協商，
   * 如果這裡寫死 parent，家長就永遠建立不出一個合規的自主挑戰任務。
   */
  source?: TaskSource;
};

export type CreateCustomTaskDraftResult =
  | { status: 'created'; draft: TaskDraft; resolution: CustomTaskEditorResolution }
  /** 路由要家長先確認。呼叫端顯示理由後帶著 confirmedEditorKind 再呼叫一次。 */
  | { status: 'needs_confirmation'; resolution: CustomTaskEditorResolution }
  | { status: 'unsupported'; reasonCode: string };

/**
 * 自訂任務的初始草稿。
 *
 * 純函式，除了 `localDateWithOffset` 讀今天的日期 —— 那一點與
 * `createTaskDraft` 完全相同，兩邊的可測性也因此一致。
 */
export function createCustomTaskDraft(
  input: CreateCustomTaskDraftInput,
): CreateCustomTaskDraftResult {
  const purposeCategory = purposeCategoryOf(input.intake.purposeChoice);
  const resolution = resolveCustomTaskEditor({
    purposeCategory,
    durationChoice: input.intake.durationChoice,
  });

  if (resolution.status === 'unsupported') {
    return { status: 'unsupported', reasonCode: resolution.reasonCode };
  }

  // 需要確認、而家長還沒確認 —— 不要先斬後奏建一份草稿出來。
  // 建了再改的話，家長是在「已經有一份成長計畫」的畫面上被問要不要改成別的，
  // 那個提問已經不中立了。
  if (resolution.status === 'needs_confirmation' && input.confirmedEditorKind === undefined) {
    return { status: 'needs_confirmation', resolution };
  }

  const editorKind = input.confirmedEditorKind
    ?? (resolution.status === 'resolved' ? resolution.editorKind : resolution.suggestedEditorKind);

  const rewardPolicy = input.rewardPolicy ?? defaultRewardPolicyFor({
    ageGroup: input.ageGroup ?? '6-9',
    purposeCategory,
    editorKind,
  });

  const base = {
    editorKind,
    // **沒有 familyId、沒有 variantId、沒有假的 preset id。**
    origin: { kind: 'parent_custom' } as const,
    title: input.intake.title.trim(),
    originalExpectation: input.intake.originalExpectation.trim(),
    purposeCategory,
    durationType: durationTypeForEditor(editorKind),
    ...(planModeForEditor(editorKind) ? { planMode: planModeForEditor(editorKind) } : null),
    source: input.source ?? ('parent' as TaskSource),
    rewardPolicy,
    // 選項組來自 preset variant，自訂任務沒有 —— 空物件不是「還沒填」，
    // 是「這種來源本來就沒有」。
    selectedOptions: {},
    customOptionValues: {},
    startDate: localDateWithOffset(0),
    reminderMode: 'none' as const,
    createdFromPreset: false,
  };

  const firstReview = DRAFT_FALLBACKS.firstReviewDays;
  const recurrenceDays = [...DRAFT_FALLBACKS.recurrenceDays];

  switch (editorKind) {
    case 'growth_plan': {
      const draft: GrowthPlanDraft = {
        ...base,
        editorKind: 'growth_plan',
        durationDays: DRAFT_FALLBACKS.growthPlanDurationDays,
        recurrenceDays,
        preferredTime: 'after_school',
        firstReviewAfterDays: firstReview,
        weekendReviewEnabled: true,
        // 里程碑留空由家長自己加。預設任務的里程碑來自 catalog 模板，
        // 自訂任務沒有模板 —— 我們不知道這件事該怎麼拆，猜出來的里程碑
        // 只會讓家長先刪一輪。
        milestones: [],
        completionDescription: '',
      };
      return { status: 'created', draft, resolution };
    }

    case 'short_support': {
      const draft: ShortSupportDraft = {
        ...base,
        editorKind: 'short_support',
        durationDays: DRAFT_FALLBACKS.shortSupportDurationDays,
        recurrenceDays,
        focusOptionIds: [],
        supportSteps: [],
        supportTime: 'after_school',
        firstReviewAfterDays: firstReview,
        weekendReviewEnabled: true,
        successDescription: '',
      };
      return { status: 'created', draft, resolution };
    }

    case 'recurring': {
      const draft: RecurringTaskDraft = {
        ...base,
        editorKind: 'recurring',
        recurrenceDays,
        scheduleMode: 'fixed_days',
        preferredTime: 'after_school',
        completionDescription: '',
        reviewEnabled: true,
        reviewAfterDays: DRAFT_FALLBACKS.familyRecurringReviewDays,
      };
      return { status: 'created', draft, resolution };
    }

    case 'family_role': {
      const draft: FamilyRoleDraft = {
        ...base,
        editorKind: 'family_role',
        durationDays: DRAFT_FALLBACKS.growthPlanDurationDays,
        recurrenceDays,
        // 角色來自 preset 的 optionGroup，自訂任務沒有清單可選 ——
        // 家長會直接填自訂角色名稱。
        roleOptionId: '',
        responsibilityItems: [],
        scopeDescription: '',
        supportLevel: 'together_first',
        exceptionDescription: '',
        firstReviewAfterDays: firstReview,
        weekendReviewEnabled: true,
        contributionDescription: '',
      };
      return { status: 'created', draft, resolution };
    }

    case 'one_time': {
      const draft: OneTimeTaskDraft = {
        ...base,
        editorKind: 'one_time',
        taskDetails: '',
        scheduledDate: localDateWithOffset(0),
        preferredTime: 'after_school',
        supportLevel: 'check_after',
        completionDescription: '',
        notes: '',
      };
      return { status: 'created', draft, resolution };
    }
  }
}

/**
 * 沒有指定回饋方式時用哪一個。
 *
 * 取第一個 recommended —— 那是這個組合下產品建議的做法。
 * 一個都沒有 recommended 時退到 record_only：它對任何組合都合法，
 * 而讓草稿帶著一個「選不了的預設值」進畫面，家長會看到一個
 * 一開始就是錯的表單。
 */
function defaultRewardPolicyFor(input: {
  ageGroup: string;
  purposeCategory: ReturnType<typeof purposeCategoryOf>;
  editorKind: TaskEditorKind;
}): RewardPolicy {
  const options = evaluateCustomTaskRewardOptions(input);
  return options.find((o) => o.availability === 'recommended')?.rewardPolicy ?? 'record_only';
}
