// Shadow Wallet · Parent Tablet — TaskDraft → CreateParentTaskCommand
//
// 純函式：不 import Supabase、不寫資料庫、不做 UI 驗證，**也不計算幣值**。
// 產物是 CreateParentTaskCommandBase；回饋決策由 evaluateTaskReward 產生，
// 再由 finalizeCreateParentTaskCommand 合成完整命令。
//
// 前提：draft 已經通過 validateTaskDraft。這裡不重驗一次 ——
// 驗證只有一份來源（validators.ts），映射再驗一次只會讓兩邊慢慢分歧。
// 呼叫端的責任是先擋住無效草稿（抽屜的 handlePreview 已經這麼做）。
//
// enabled / disabled 的決定：**只輸出 enabled 的項目**。
// 里程碑、支援步驟與負責內容的 enabled 是「家長看過、決定這次不要」的編輯痕跡，
// 不是任務內容；validator 已經保證至少留一項。把關掉的一起寫下去，孩子端會看到
// 沒人同意過的項目，而建立之後也沒有任何介面能重新開啟它們。
// 這個行為有測試固定住（mapTaskDraftToCommand.test.ts）。

import { PRESET_CATALOG_VERSION } from '../taskCatalog';
import type { TaskPresetFamily, TaskPresetVariant } from '../taskCatalog';
import {
  assertNever,
  dateStringPlusDays,
  taskDraftOrigin,
  type FamilyRoleDraft,
  type GrowthPlanDraft,
  type OneTimeTaskDraft,
  type RecurringTaskDraft,
  type ShortSupportDraft,
  type TaskDraft,
} from '../taskDraft';
// 只取一支純函式（editorKind → completionPolicy）。
// 刻意不從 customTask/index 進來 —— 那會連帶拉進 initializer 與 reward options，
// 而持久化層不需要認識它們。
import { completionPolicyForEditor } from '../customTask/customTaskRouting';
import {
  TASK_COMMAND_SCHEMA_VERSION,
  type CommandChildContext,
  type CreateParentTaskCommandBase,
  type TaskMilestoneCommand,
  type TaskResponsibilityCommand,
  type TaskCreationSource,
  type TaskScheduleCommand,
  type TaskSupportStepCommand,
} from './types';

export type MapTaskDraftArgs = {
  draft: TaskDraft;
  /**
   * preset 的家族與版本。
   *
   * **自訂任務不傳** —— 來源由 `draft.origin` 決定，不是由這兩個參數
   * 有沒有值決定。傳了但 draft 是 parent_custom 的話，下面會直接丟例外：
   * 那種組合代表呼叫端搞錯了，安靜地選一邊會產生一筆來源錯誤的任務。
   */
  family?: TaskPresetFamily;
  variant?: TaskPresetVariant;
  child: CommandChildContext;
  taskPolicyVersion: string;
  /**
   * 這份草稿的建立請求識別碼。
   *
   * 刻意是必填參數而不是在這裡現產：映射會被呼叫很多次（每次提交前都重跑一遍），
   * 每次產生新 id 等於完全沒有 idempotency。它的生命週期屬於草稿，不屬於映射。
   */
  clientRequestId: string;
};

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

/** 空白字串一律不進命令 —— 「有這個欄位但是空的」和「沒有這個欄位」不該混在一起。 */
function trimmedOrUndefined(value: string | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** 期間的最後一天。第 1 天就是 startDate，所以是 +(durationDays - 1)。 */
function endDateOf(startDate: string, durationDays: number): string | undefined {
  return dateStringPlusDays(startDate, durationDays - 1) ?? undefined;
}

function milestonesOf(draft: GrowthPlanDraft): TaskMilestoneCommand[] {
  return draft.milestones
    .filter(milestone => milestone.enabled)
    .map(milestone => ({
      id: milestone.id,
      title: milestone.title.trim(),
      ...(milestone.targetDay !== undefined ? { targetDay: milestone.targetDay } : null),
    }));
}

function supportStepsOf(draft: ShortSupportDraft): TaskSupportStepCommand[] {
  return draft.supportSteps
    .filter(step => step.enabled)
    .map(step => ({ id: step.id, text: step.text.trim() }));
}

function responsibilitiesOf(draft: FamilyRoleDraft): TaskResponsibilityCommand[] {
  return draft.responsibilityItems
    .filter(item => item.enabled)
    .map(item => ({ id: item.id, text: item.text.trim(), isCustom: item.isCustom }));
}

/** 五種形式共用的排程骨架：開始日、時段、提醒。 */
function baseSchedule(draft: TaskDraft): Pick<
  TaskScheduleCommand,
  'startDate' | 'reminderMode'
> {
  return { startDate: draft.startDate, reminderMode: draft.reminderMode };
}

// ---------------------------------------------------------------------------
// 各形式的排程 / 回顧
// ---------------------------------------------------------------------------

function growthPlanSchedule(draft: GrowthPlanDraft): TaskScheduleCommand {
  return {
    ...baseSchedule(draft),
    mode: 'fixed_days',
    recurrenceDays: [...draft.recurrenceDays],
    preferredTime: draft.preferredTime,
    ...(trimmedOrUndefined(draft.preferredTimeCustom)
      ? { preferredTimeCustom: draft.preferredTimeCustom!.trim() }
      : null),
    ...(draft.minutesPerSession !== undefined
      ? { estimatedMinutes: draft.minutesPerSession }
      : null),
    durationDays: draft.durationDays,
    ...(endDateOf(draft.startDate, draft.durationDays)
      ? { endDate: endDateOf(draft.startDate, draft.durationDays)! }
      : null),
  };
}

function shortSupportSchedule(draft: ShortSupportDraft): TaskScheduleCommand {
  return {
    ...baseSchedule(draft),
    mode: 'fixed_days',
    recurrenceDays: [...draft.recurrenceDays],
    preferredTime: draft.supportTime,
    ...(trimmedOrUndefined(draft.supportTimeCustom)
      ? { preferredTimeCustom: draft.supportTimeCustom!.trim() }
      : null),
    durationDays: draft.durationDays,
    ...(endDateOf(draft.startDate, draft.durationDays)
      ? { endDate: endDateOf(draft.startDate, draft.durationDays)! }
      : null),
  };
}

function recurringSchedule(draft: RecurringTaskDraft): TaskScheduleCommand {
  const usesFrequency = draft.scheduleMode === 'weekly_frequency';
  return {
    ...baseSchedule(draft),
    mode: usesFrequency ? 'weekly_frequency' : 'fixed_days',
    // weekly_frequency 模式下 recurrenceDays 通常是空的，但家長之前選過的值
    // 仍然保留 —— 切回固定星期時不該憑空消失。
    recurrenceDays: [...draft.recurrenceDays],
    // 每週次數是家長明確做過的選擇。DB 目前沒有對應欄位，但那是 schema 的問題，
    // 不是丟掉它的理由；persistenceGaps 會標成 schema_required。
    ...(draft.weeklyFrequency !== undefined
      ? { weeklyFrequency: draft.weeklyFrequency }
      : null),
    preferredTime: draft.preferredTime,
    ...(trimmedOrUndefined(draft.preferredTimeCustom)
      ? { preferredTimeCustom: draft.preferredTimeCustom!.trim() }
      : null),
    ...(draft.minutesPerSession !== undefined
      ? { estimatedMinutes: draft.minutesPerSession }
      : null),
  };
}

function familyRoleSchedule(draft: FamilyRoleDraft): TaskScheduleCommand {
  return {
    ...baseSchedule(draft),
    mode: 'fixed_days',
    recurrenceDays: [...draft.recurrenceDays],
    // 家庭角色沒有時段欄位；用「需要時」而不是留空，避免下游要處理空字串。
    preferredTime: 'when_needed',
    durationDays: draft.durationDays,
    ...(endDateOf(draft.startDate, draft.durationDays)
      ? { endDate: endDateOf(draft.startDate, draft.durationDays)! }
      : null),
  };
}

function oneTimeSchedule(draft: OneTimeTaskDraft): TaskScheduleCommand {
  return {
    ...baseSchedule(draft),
    mode: 'one_time',
    scheduledDate: draft.scheduledDate,
    preferredTime: draft.preferredTime,
    ...(trimmedOrUndefined(draft.preferredTimeCustom)
      ? { preferredTimeCustom: draft.preferredTimeCustom!.trim() }
      : null),
    ...(draft.estimatedMinutes !== undefined
      ? { estimatedMinutes: draft.estimatedMinutes }
      : null),
  };
}

/** 長期形式共用的回顧設定。 */
function longTermReview(draft: GrowthPlanDraft | ShortSupportDraft | FamilyRoleDraft) {
  const firstReviewDate = draft.firstReviewAfterDays > 0
    ? dateStringPlusDays(draft.startDate, draft.firstReviewAfterDays)
    : null;
  return {
    reviewEnabled: draft.firstReviewAfterDays > 0 || draft.weekendReviewEnabled,
    firstReviewAfterDays: draft.firstReviewAfterDays,
    ...(firstReviewDate ? { firstReviewDate } : null),
    weekendReviewEnabled: draft.weekendReviewEnabled,
  };
}

// ---------------------------------------------------------------------------
// 主要入口
// ---------------------------------------------------------------------------

export function mapTaskDraftToCommand({
  draft,
  family,
  variant,
  child,
  taskPolicyVersion,
  clientRequestId,
}: MapTaskDraftArgs): CreateParentTaskCommandBase {
  const origin = taskDraftOrigin(draft);
  const creationSource: TaskCreationSource =
    origin.kind === 'preset' ? 'preset' : 'parent_custom';

  // 來源與參數對不上時直接丟例外，不要安靜地選一邊。
  //
  // 兩種錯法都會產生一筆**來源記錯**的任務，而那種錯誤在資料庫裡
  // 看起來完全正常 —— 沒有人會去查一個看起來正常的欄位。
  if (origin.kind === 'preset' && (family === undefined || variant === undefined)) {
    throw new Error('preset 草稿必須提供 family 與 variant');
  }
  if (origin.kind === 'parent_custom' && (family !== undefined || variant !== undefined)) {
    throw new Error('自訂草稿不可提供 family 或 variant');
  }

  const shared = {
    schemaVersion: TASK_COMMAND_SCHEMA_VERSION,
    childId: child.id,
    // family_id 一律來自這個孩子；不可用「查到的第一筆家庭」。
    familyId: child.familyId,
    creationSource,
    ...(origin.kind === 'preset'
      ? { preset: { familyId: origin.familyId, variantId: origin.variantId } }
      : null),
    content: {
      selectedOptions: { ...draft.selectedOptions },
      customOptionValues: { ...draft.customOptionValues },
    },
    metadata: {
      ageGroup: child.ageGroup,
      // 相容欄位。RPC 會依 creationSource 重新推導後才寫入 ——
      // 這裡送什麼都不影響資料庫，送對只是為了讓命令自己讀起來一致。
      createdFromPreset: origin.kind === 'preset',
      taskPolicyVersion,
      // 自訂任務不屬於任何 catalog 版本。帶著它會被 RPC 拒絕。
      ...(origin.kind === 'preset'
        ? { presetCatalogVersion: PRESET_CATALOG_VERSION }
        : null),
      editorKind: draft.editorKind,
      clientRequestId,
    },
  };

  const task = {
    title: draft.title.trim(),
    purposeCategory: draft.purposeCategory,
    durationType: draft.durationType,
    ...(draft.planMode ? { planMode: draft.planMode } : null),
    source: draft.source,
    rewardPolicy: draft.rewardPolicy,
    // 結束方式不是草稿欄位 —— 家長改不了它。
    //
    // preset 的來源是 catalog 的 variant；自訂任務沒有 variant，
    // 改由 editorKind 推導。兩者必須一致，否則同一種 editor 會因為
    // 來源不同而有不同的結束方式，而 RPC 的 guard 只認一種
    // （家庭角色必須 review_and_continue、短期支援必須 stabilize_and_exit）。
    //
    // 直接 import 那支純函式而不是在這裡抄一份 switch：抄一份就等於
    // 兩份會各自演化，而不一致的那一天只會在 RPC 被拒絕時才發現。
    completionPolicy: variant?.completionPolicy ?? completionPolicyForEditor(draft.editorKind),
    originalExpectation: draft.originalExpectation.trim(),
  };

  switch (draft.editorKind) {
    case 'growth_plan':
      return {
        ...shared,
        task: { ...task, completionDescription: draft.completionDescription.trim() },
        schedule: growthPlanSchedule(draft),
        review: longTermReview(draft),
        plan: {
          durationDays: draft.durationDays,
          milestones: milestonesOf(draft),
          supportSteps: [],
          focusOptionIds: [],
        },
      };

    case 'short_support':
      return {
        ...shared,
        task: {
          ...task,
          // 短期支援的「怎樣算逐漸穩定」就是它的完成描述，不另開一個欄位。
          completionDescription: draft.successDescription.trim(),
        },
        schedule: shortSupportSchedule(draft),
        review: longTermReview(draft),
        plan: {
          durationDays: draft.durationDays,
          milestones: [],
          supportSteps: supportStepsOf(draft),
          focusOptionIds: [...draft.focusOptionIds],
        },
      };

    case 'recurring':
      return {
        ...shared,
        task: { ...task, completionDescription: draft.completionDescription.trim() },
        schedule: recurringSchedule(draft),
        review: {
          reviewEnabled: draft.reviewEnabled,
          ...(draft.reviewAfterDays !== undefined
            ? { reviewAfterDays: draft.reviewAfterDays }
            : null),
        },
      };

    case 'family_role':
      return {
        ...shared,
        task: {
          ...task,
          // 家庭角色的「完成」就是把負責範圍做到；貢獻紀錄說明是它的對外描述。
          completionDescription: draft.contributionDescription.trim(),
        },
        schedule: familyRoleSchedule(draft),
        review: longTermReview(draft),
        plan: {
          durationDays: draft.durationDays,
          milestones: [],
          supportSteps: [],
          focusOptionIds: [],
        },
        role: {
          optionId: draft.roleOptionId,
          ...(trimmedOrUndefined(draft.customRoleValue)
            ? { customValue: draft.customRoleValue!.trim() }
            : null),
          responsibilities: responsibilitiesOf(draft),
          scopeDescription: draft.scopeDescription.trim(),
          exceptionDescription: draft.exceptionDescription.trim(),
          contributionDescription: draft.contributionDescription.trim(),
        },
        support: { level: draft.supportLevel },
      };

    case 'one_time':
      return {
        ...shared,
        task: {
          ...task,
          completionDescription: draft.completionDescription.trim(),
          ...(trimmedOrUndefined(draft.notes) ? { notes: draft.notes.trim() } : null),
        },
        schedule: oneTimeSchedule(draft),
        content: { ...shared.content, taskDetails: draft.taskDetails.trim() },
        support: { level: draft.supportLevel },
      };

    default:
      return assertNever(draft);
  }
}
