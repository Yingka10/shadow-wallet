// Shadow Wallet · Parent Tablet — preset → 草稿的唯一轉換點
//
// 所有「catalog 的值怎麼變成表單初始值」的規則都收在這支。
// Editor 只負責改草稿，不做初始化，也不在 UI 裡散寫 `?? 14` 這種 fallback。

import type {
  OptionGroup,
  RewardPolicy,
  TaskPresetFamily,
  TaskPresetVariant,
} from '../taskCatalog';
import {
  resolveInitialRewardPolicy,
  resolveTaskRewardCapabilities,
} from '../taskReward';
import {
  DRAFT_FALLBACKS,
  FAMILY_ROLE_CONTRIBUTION_DEFAULT,
  FAMILY_ROLE_EXCEPTION_DEFAULT,
  buildResponsibilityItems,
  familyRoleCopy,
  growthPlanCopy,
  oneTimeCopy,
  recurringCopy,
  roleScopeFallback,
  shortSupportCopy,
  stepTextForCatalogOption,
} from './draftLabels';
import type {
  DraftMilestone,
  DraftSupportStep,
  FamilyRoleDraft,
  GrowthPlanDraft,
  OneTimeSupportLevel,
  OneTimeTaskDraft,
  RecurringTaskDraft,
  ShortSupportDraft,
  TaskDraft,
  TaskEditorKind,
} from './types';

/** 抽屜傳進來的孩子資料（與 TaskCreationDrawer 的 props 同形）。 */
export type DraftChildContext = {
  nickname: string;
  birthDate: string;
  familyId: string;
};

/**
 * 草稿一開始選哪個回饋方式。
 *
 * catalog 的預設可能在這個情境下用不了 —— 例如自主挑戰預設「可獲得成長幣」，
 * 但它沒有估計分鐘，幣值政策對應不到時間分級。讓草稿從一個真的走得完的選項開始，
 * 家長才不會遇到「選單上看不到、草稿卻記著它」的狀態。
 *
 * ageGroup 未提供時保留 catalog 預設：年齡段是能不能發幣的條件之一，
 * 用猜的去決定回饋方式比不調整更糟。抽屜一定會傳（它已經算過 calcAgeGroup），
 * 這個分支只服務直接測欄位映射的單元測試。
 */
function initialRewardPolicy(
  variant: TaskPresetVariant,
  ageGroup: string | undefined,
): RewardPolicy {
  if (ageGroup === undefined) return variant.defaultRewardPolicy;

  const capabilities = resolveTaskRewardCapabilities({
    ageGroup,
    purposeCategory: variant.purposeCategory,
    ...(variant.defaultDraft.estimatedMinutes !== undefined
      ? { estimatedMinutes: variant.defaultDraft.estimatedMinutes }
      : null),
  });

  // 完全沒有可用選項時保留 catalog 預設，讓問題在驗證與 RPC 浮出來，
  // 而不是靜靜換成一個家長沒有選過的回饋方式。
  return (
    resolveInitialRewardPolicy(
      variant.allowedRewardPolicies,
      variant.defaultRewardPolicy,
      capabilities,
    ) ?? variant.defaultRewardPolicy
  );
}

// ---------------------------------------------------------------------------
// 日期
// ---------------------------------------------------------------------------

/**
 * 本地日期 YYYY-MM-DD。
 * 刻意不用 toISOString() —— 那會轉成 UTC，台北時間凌晨會被推前一天。
 */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 從今天起算 offset 天的本地日期字串。 */
export function localDateWithOffset(offsetDays: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + offsetDays);
  return toLocalDateString(d);
}

/** 只接受 YYYY-MM-DD，且必須是真實存在的日期（擋 2026-02-31）。 */
export function isValidLocalDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const probe = new Date(y, m - 1, d);
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d;
}

/** startDate + offset，回傳本地日期字串；startDate 不合法時回 null。 */
export function dateStringPlusDays(startDate: string, offsetDays: number): string | null {
  if (!isValidLocalDateString(startDate)) return null;
  const [y, m, d] = startDate.split('-').map(Number);
  return localDateWithOffset(offsetDays, new Date(y, m - 1, d));
}

// ---------------------------------------------------------------------------
// editorKind
// ---------------------------------------------------------------------------

/**
 * catalog 的 durationType/planMode → 要用哪一支 editor。
 *
 * **planMode 優先於 durationType**：家庭角色即使帶有 recurrenceDays，
 * 也必須走 FamilyRoleEditor，不能因為「看起來像重複任務」就掉進 RecurringTaskEditor
 * —— 它有試行期、責任範圍與期滿回顧，欄位完全不同。
 *
 * 同理不把 recurring / one_time 併進 growth_plan：混用會產生錯誤的必填。
 */
export function resolveEditorKind(variant: TaskPresetVariant): TaskEditorKind {
  if (variant.planMode === 'growth_plan') return 'growth_plan';
  if (variant.planMode === 'short_support') return 'short_support';
  if (variant.planMode === 'family_role') return 'family_role';

  if (variant.durationType === 'recurring') return 'recurring';
  if (variant.durationType === 'one_time') return 'one_time';

  // 長期但沒指定 planMode：當成成長計畫處理（catalog 目前不會走到）。
  return 'growth_plan';
}

// ---------------------------------------------------------------------------
// 里程碑
// ---------------------------------------------------------------------------

/**
 * 把 n 個里程碑平均攤在期間上，但第一個刻意壓在第 3 天以內
 * （第一個里程碑通常是「選定內容」，排到第 6 天不合理）。最後一個一律等於期末。
 */
export function spreadMilestoneDays(count: number, durationDays: number): number[] {
  if (count <= 0) return [];
  const first = Math.max(1, Math.min(3, durationDays));
  const days: number[] = [first];
  for (let i = 1; i < count; i++) {
    days.push(Math.max(first + i, Math.round((durationDays * (i + 1)) / count)));
  }
  days[count - 1] = Math.max(durationDays, days[count - 1]);
  return days;
}

function buildMilestones(familyId: string, durationDays: number): DraftMilestone[] {
  const titles = growthPlanCopy(familyId).milestones;
  const days = spreadMilestoneDays(titles.length, durationDays);
  return titles.map((title, index) => ({
    id: `milestone-${index + 1}`,
    title,
    targetDay: days[index],
    isEditable: true,
    enabled: true,
  }));
}

// ---------------------------------------------------------------------------
// 選項
// ---------------------------------------------------------------------------

function emptySelections(groups: OptionGroup[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const group of groups) out[group.id] = [];
  return out;
}

function emptyCustomValues(groups: OptionGroup[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const group of groups) {
    if (group.allowCustom) out[group.id] = '';
  }
  return out;
}

// ---------------------------------------------------------------------------
// 支援步驟
// ---------------------------------------------------------------------------

/** 短期支援的焦點選項：catalog 有 optionGroups 就用 catalog，否則用 draftLabels 的 family 專屬清單。 */
export function focusChoicesFor(
  family: TaskPresetFamily | undefined,
  variant: TaskPresetVariant | undefined,
): Array<{ id: string; label: string; step: string }> {
  const group = variant?.optionGroups[0];
  if (group) {
    return group.options.map(option => ({
      id: option.id,
      label: option.label,
      step: stepTextForCatalogOption(family?.id, option.id) ?? option.label,
    }));
  }
  // 自訂任務兩者都是 undefined —— 通用文案的焦點清單是空的，
  // 家長改為自己新增支援步驟（validator 對「沒有焦點可選」已有對應分支）。
  return shortSupportCopy(family?.id).focusChoices;
}

/**
 * 依目前選中的焦點同步支援步驟：
 * 保留已存在（含家長改過文字、關掉）的步驟、移除取消選取的、補上新選的，
 * 家長自訂步驟（custom- 開頭）永遠保留。
 */
export function syncSupportSteps(
  currentSteps: DraftSupportStep[],
  focusIds: string[],
  choices: Array<{ id: string; step: string }>,
): DraftSupportStep[] {
  const byId = new Map(currentSteps.map(step => [step.id, step]));
  const next: DraftSupportStep[] = [];

  for (const focusId of focusIds) {
    const existing = byId.get(focusId);
    if (existing) {
      next.push(existing);
      continue;
    }
    const choice = choices.find(c => c.id === focusId);
    next.push({ id: focusId, text: choice?.step ?? '', enabled: true });
  }

  for (const step of currentSteps) {
    if (step.id.startsWith('custom-')) next.push(step);
  }

  return next;
}

// ---------------------------------------------------------------------------
// 主要入口
// ---------------------------------------------------------------------------

/**
 * 從 preset 產生初始草稿。
 * family 或 variant 一改就整份重建（呼叫端負責保存 snapshot 供 dirty 比對）。
 */
export function createTaskDraft(
  family: TaskPresetFamily,
  variant: TaskPresetVariant,
  child: DraftChildContext,
  /**
   * 孩子的年齡段（與 lib/onboarding 的 AgeGroup 對齊）。
   * 刻意由呼叫端傳入而不是在這裡算：算年齡段的 lib/onboarding 會連帶載入
   * Supabase client，把整個草稿層變成需要環境變數才能測的東西。
   */
  ageGroup?: string,
): TaskDraft {
  const editorKind = resolveEditorKind(variant);
  const name = child.nickname;

  const rewardPolicy = initialRewardPolicy(variant, ageGroup);

  const base = {
    editorKind,
    familyId: family.id,
    variantId: variant.id,
    purposeCategory: variant.purposeCategory,
    durationType: variant.durationType,
    ...(variant.planMode ? { planMode: variant.planMode } : null),
    source: variant.suggestedSource,
    rewardPolicy,
    selectedOptions: emptySelections(variant.optionGroups),
    customOptionValues: emptyCustomValues(variant.optionGroups),
    startDate: localDateWithOffset(0),
    reminderMode: 'none' as const,
    createdFromPreset: true as const,
  };

  const firstReview = variant.defaultDraft.firstReviewDays ?? DRAFT_FALLBACKS.firstReviewDays;
  const recurrenceDays = variant.defaultDraft.recurrenceDays ?? DRAFT_FALLBACKS.recurrenceDays;

  if (editorKind === 'growth_plan') {
    const copy = growthPlanCopy(family.id);
    const durationDays =
      variant.defaultDraft.durationDays ?? DRAFT_FALLBACKS.growthPlanDurationDays;

    const draft: GrowthPlanDraft = {
      ...base,
      editorKind: 'growth_plan',
      title: variant.defaultDraft.titleOverride ?? copy.titleTemplate(name),
      originalExpectation: copy.expectation(name),
      durationDays,
      recurrenceDays: [...recurrenceDays],
      ...(variant.defaultDraft.estimatedMinutes !== undefined
        ? { minutesPerSession: variant.defaultDraft.estimatedMinutes }
        : null),
      preferredTime: 'after_school',
      firstReviewAfterDays: firstReview,
      weekendReviewEnabled: true,
      milestones: buildMilestones(family.id, durationDays),
      completionDescription: copy.completion,
    };
    return draft;
  }

  if (editorKind === 'short_support') {
    const copy = shortSupportCopy(family.id);
    const durationDays =
      variant.defaultDraft.durationDays ?? DRAFT_FALLBACKS.shortSupportDurationDays;

    const draft: ShortSupportDraft = {
      ...base,
      editorKind: 'short_support',
      title: variant.defaultDraft.titleOverride ?? copy.titleTemplate(name),
      originalExpectation: copy.observation(name),
      // 短期支援一律只記進度與肯定，不受 defaultRewardPolicy 影響。
      rewardPolicy: 'progress_only',
      durationDays,
      recurrenceDays: [...recurrenceDays],
      focusOptionIds: [],
      supportSteps: [],
      supportTime: 'after_school',
      firstReviewAfterDays: firstReview,
      weekendReviewEnabled: true,
      successDescription: copy.success,
    };
    return draft;
  }

  if (editorKind === 'recurring') {
    const isFamilyParticipation = variant.purposeCategory === 'family_participation';
    const copy = recurringCopy(family.id, isFamilyParticipation);

    const draft: RecurringTaskDraft = {
      ...base,
      editorKind: 'recurring',
      title: variant.defaultDraft.titleOverride ?? copy.titleTemplate(name),
      originalExpectation: copy.expectation(name),
      recurrenceDays: [...recurrenceDays],
      scheduleMode: 'fixed_days',
      ...(variant.defaultDraft.weeklyFrequency !== undefined
        ? { weeklyFrequency: variant.defaultDraft.weeklyFrequency }
        : null),
      // 家庭參與預設不顯示分鐘，所以也不預填；學習類才帶 catalog 的估時。
      ...(copy.showMinutes && variant.defaultDraft.estimatedMinutes !== undefined
        ? { minutesPerSession: variant.defaultDraft.estimatedMinutes }
        : null),
      preferredTime: copy.preferredTime,
      ...(copy.preferredTimeCustom !== undefined
        ? { preferredTimeCustom: copy.preferredTimeCustom }
        : null),
      completionDescription: copy.completion,
      reviewEnabled: true,
      reviewAfterDays: isFamilyParticipation
        ? DRAFT_FALLBACKS.familyRecurringReviewDays
        : DRAFT_FALLBACKS.learningRecurringReviewDays,
    };
    return draft;
  }

  if (editorKind === 'family_role') {
    const copy = familyRoleCopy(family.id);
    const durationDays =
      variant.defaultDraft.durationDays ?? DRAFT_FALLBACKS.familyRoleDurationDays;

    // role option group 有預設值就沿用；catalog 目前不給 default，所以是空字串。
    const roleGroup = variant.optionGroups[0];
    const roleOptionId = roleGroup?.defaultOptionId ?? '';

    const draft: FamilyRoleDraft = {
      ...base,
      editorKind: 'family_role',
      title: variant.defaultDraft.titleOverride ?? copy.titleTemplate(name),
      originalExpectation: copy.expectation(name),
      // 家庭角色的回饋固定為家庭貢獻，不吃 defaultRewardPolicy。
      rewardPolicy: 'family_contribution',
      ...(roleGroup && roleOptionId
        ? { selectedOptions: { ...base.selectedOptions, [roleGroup.id]: [roleOptionId] } }
        : null),
      durationDays,
      recurrenceDays: [...recurrenceDays],
      roleOptionId,
      responsibilityItems: buildResponsibilityItems(roleOptionId),
      scopeDescription: roleScopeFallback(roleOptionId) || copy.scopeFallback,
      supportLevel: 'together_first',
      exceptionDescription: FAMILY_ROLE_EXCEPTION_DEFAULT,
      firstReviewAfterDays: variant.defaultDraft.firstReviewDays
        ?? DRAFT_FALLBACKS.familyRoleFirstReviewDays,
      weekendReviewEnabled: true,
      contributionDescription: FAMILY_ROLE_CONTRIBUTION_DEFAULT,
    };
    return draft;
  }

  // one_time
  const copy = oneTimeCopy(family.id);
  const isFamilyParticipation = variant.purposeCategory === 'family_participation';
  // 家庭參與、或版本本身帶安全提醒時，第一次一律先由家長確認過再算完成。
  const needsParentCheck = isFamilyParticipation || (variant.safetyNotes?.length ?? 0) > 0;
  const supportLevel: OneTimeSupportLevel = needsParentCheck ? 'check_after' : copy.supportLevel;

  const draft: OneTimeTaskDraft = {
    ...base,
    editorKind: 'one_time',
    title: variant.defaultDraft.titleOverride ?? copy.titleTemplate(name),
    originalExpectation: copy.expectation(name),
    // 家庭參與不吃 defaultRewardPolicy，一律家庭貢獻。
    ...(isFamilyParticipation ? { rewardPolicy: 'family_contribution' as const } : null),
    // 例子只當 helper 顯示，不預填 —— 預填的具體頁數、題數都是編出來的。
    taskDetails: '',
    scheduledDate: localDateWithOffset(0),
    preferredTime: copy.preferredTime,
    // 家庭參與不顯示分鐘區塊，所以也不預填；適合估算的家族才帶 catalog 的估時。
    ...(copy.showMinutes && variant.defaultDraft.estimatedMinutes !== undefined
      ? { estimatedMinutes: variant.defaultDraft.estimatedMinutes }
      : null),
    supportLevel,
    completionDescription: copy.completion,
    notes: '',
  };
  return draft;
}

/**
 * 依角色重建責任項目。純函式，切換角色時由呼叫端決定要不要覆蓋
 * （已修改過就要先走 discard 確認，不可無聲覆蓋）。
 */
export function applyRoleSelection(
  draft: FamilyRoleDraft,
  roleOptionId: string,
  roleGroupId: string | null,
): FamilyRoleDraft {
  return {
    ...draft,
    roleOptionId,
    responsibilityItems: buildResponsibilityItems(roleOptionId),
    scopeDescription: roleScopeFallback(roleOptionId),
    ...(roleOptionId === 'other' ? null : { customRoleValue: undefined }),
    ...(roleGroupId
      ? { selectedOptions: { ...draft.selectedOptions, [roleGroupId]: [roleOptionId] } }
      : null),
  };
}

/** 責任項目是否已被家長改過（用來決定切換角色要不要先確認）。 */
export function responsibilitiesTouched(
  draft: FamilyRoleDraft,
  baseline: FamilyRoleDraft | null,
): boolean {
  if (!baseline) return false;
  if (draft.responsibilityItems.length !== baseline.responsibilityItems.length) return true;
  return draft.responsibilityItems.some((item, index) => {
    const other = baseline.responsibilityItems[index];
    return (
      item.id !== other.id
      || item.text !== other.text
      || item.enabled !== other.enabled
      || item.isCustom !== other.isCustom
    );
  });
}
