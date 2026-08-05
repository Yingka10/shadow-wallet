// Shadow Wallet · Parent Tablet — 草稿驗證
//
// 回傳 field-keyed errors 而不是 boolean，讓錯誤能顯示在對應欄位旁邊。
// 純函式、不碰 UI，方便單元測試。

import type { OptionGroup, RewardPolicy, TaskPresetVariant } from '../taskCatalog';
import { DRAFT_FALLBACKS, shortSupportCopy } from './draftLabels';
import { isValidLocalDateString } from './createTaskDraft';
import { draftEstimatedMinutes } from './draftReward';
import {
  resolveTaskRewardCapabilities,
  selectAvailableRewardPolicies,
} from '../taskReward';
import { assertNever } from './types';
import type {
  FamilyRoleDraft,
  GrowthPlanDraft,
  OneTimeTaskDraft,
  RecurringTaskDraft,
  ShortSupportDraft,
  TaskDraft,
  TaskDraftValidationErrors,
} from './types';

/** 家庭參與在任何形式下都不得走成長幣或時間儲蓄。 */
const COIN_LIKE_POLICIES = ['coin_eligible', 'time_saving_eligible'];

/**
 * 沒有 preset variant 時的回饋方式候選集合。
 *
 * 自訂任務沒有 catalog 的 allowedRewardPolicies —— 那份清單是
 * 「這個預設版本提供哪幾種」，而自訂任務不屬於任何版本。
 * 所以這裡放全部，交給下面的 capability 檢查去篩：
 * 篩掉的理由會是「算不出幣值」或「時間儲蓄未啟用」，
 * 那是**真的做不到**，而不是「這張卡片沒有提供」。
 */
const ALL_REWARD_POLICIES: RewardPolicy[] = [
  'record_only',
  'family_contribution',
  'progress_only',
  'coin_eligible',
  'time_saving_eligible',
];

/** 學校作業是本來就該完成的事，只能留下紀錄或以進度肯定，不得成為固定幣源。 */
const SCHOOL_ASSIGNMENT_FAMILY_ID = 'learn-school-assignment';
const SCHOOL_ASSIGNMENT_POLICIES: RewardPolicy[] = ['record_only', 'progress_only'];

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function validateDurationDays(
  durationDays: number,
  errors: TaskDraftValidationErrors,
): void {
  if (!Number.isInteger(durationDays) || durationDays < DRAFT_FALLBACKS.minDurationDays) {
    errors.durationDays = `計畫期間至少 ${DRAFT_FALLBACKS.minDurationDays} 天`;
  } else if (durationDays > DRAFT_FALLBACKS.maxDurationDays) {
    errors.durationDays = `計畫期間請不要超過 ${DRAFT_FALLBACKS.maxDurationDays} 天`;
  }
}

function validateCommon(draft: TaskDraft, errors: TaskDraftValidationErrors): void {
  if (isBlank(draft.title)) errors.title = '請填寫名稱';
  if (!isValidLocalDateString(draft.startDate)) {
    errors.startDate = '請填寫正確日期，格式為 YYYY-MM-DD';
  }
}

/**
 * required 的選項組必須有選；選到 allowCustom 的「其他」時，自填內容不可空白。
 *
 * 五種 draft 都會走到這裡（家庭角色只跳過角色群組本身，見 validateFamilyRoleDraft）。
 * 導出是為了讓測試能直接掃過全部 required 群組，不必每種 editor 各拼一份草稿。
 */
export function validateRequiredOptionGroups(
  groups: OptionGroup[],
  draft: TaskDraft,
  errors: TaskDraftValidationErrors,
): void {
  for (const group of groups) {
    const selected = draft.selectedOptions[group.id] ?? [];

    if (group.required && selected.length === 0) {
      errors[`option:${group.id}`] = '請選擇一項';
      continue;
    }

    if (!group.allowCustom) continue;

    const customOption = group.options.find(option => option.id === 'other');
    if (!customOption || !selected.includes(customOption.id)) continue;

    const value = draft.customOptionValues[group.id] ?? '';
    if (isBlank(value)) {
      errors[`customOption:${group.id}`] = '選擇「其他」時請補充說明';
    }
  }
}

export function validateGrowthPlanDraft(
  draft: GrowthPlanDraft,
  variant: TaskPresetVariant | undefined,
): TaskDraftValidationErrors {
  const errors: TaskDraftValidationErrors = {};

  validateCommon(draft, errors);
  validateRequiredOptionGroups(variant?.optionGroups ?? [], draft, errors);
  validateDurationDays(draft.durationDays, errors);

  if (draft.recurrenceDays.length === 0) {
    errors.recurrenceDays = '請至少選一天';
  }

  validateMinutes(draft.minutesPerSession, 'minutesPerSession', errors);

  if (draft.preferredTime === 'custom' && isBlank(draft.preferredTimeCustom ?? '')) {
    errors.preferredTimeCustom = '請描述適合的時段';
  }

  if (draft.milestones.filter(m => m.enabled).length === 0) {
    errors.milestones = '請至少保留一個里程碑';
  } else if (draft.milestones.some(m => m.enabled && isBlank(m.title))) {
    errors.milestones = '里程碑名稱不可空白';
  }

  if (isBlank(draft.completionDescription)) {
    errors.completionDescription = '請描述怎樣算完成';
  }

  return errors;
}

export function validateShortSupportDraft(
  draft: ShortSupportDraft,
  variant: TaskPresetVariant | undefined,
): TaskDraftValidationErrors {
  const errors: TaskDraftValidationErrors = {};

  validateCommon(draft, errors);
  validateRequiredOptionGroups(variant?.optionGroups ?? [], draft, errors);
  validateDurationDays(draft.durationDays, errors);

  if (draft.recurrenceDays.length === 0) {
    errors.recurrenceDays = '請至少選一天';
  }

  /*
    有些生活小計畫既沒有 catalog optionGroups、draftLabels 也沒有焦點清單
    （life-morning、life-after-school、life-own-space、life-transition、life-selfcare）。
    對這些家族要求「至少選一個焦點」等於要求家長從空清單裡選一項 ——
    預覽會被永久擋住，而畫面上沒有任何可以修的東西。
    所以焦點與支援步驟只在真的有選項可選時才是必填；沒有選項時改由家長自己新增步驟。
  */
  // 自訂任務沒有 familyId，也就沒有 preset 的焦點清單可查。
  // 那不是「查不到」，是這種來源本來就沒有 —— 所以直接視為沒有預設焦點，
  // 由家長自己新增支援步驟。
  const hasFocusChoices =
    (variant?.optionGroups.length ?? 0) > 0
    || (draft.familyId !== undefined && shortSupportCopy(draft.familyId).focusChoices.length > 0);

  if (hasFocusChoices && draft.focusOptionIds.length === 0) {
    errors.focusOptionIds = '請至少選一個焦點';
  }

  if (draft.supportTime === 'custom' && isBlank(draft.supportTimeCustom ?? '')) {
    errors.supportTimeCustom = '請描述執行時段';
  }

  const enabledSteps = draft.supportSteps.filter(step => step.enabled);
  if (hasFocusChoices && enabledSteps.length === 0) {
    errors.supportSteps = '請至少保留一個支援步驟';
  } else if (enabledSteps.some(step => isBlank(step.text))) {
    // 有寫但寫成空白，兩種情況都要擋。
    errors.supportSteps = '支援步驟內容不可空白';
  }

  if (isBlank(draft.successDescription)) {
    errors.successDescription = '請描述怎樣算逐漸穩定';
  }

  return errors;
}

/**
 * 家庭參與的發幣防線（第二層）。
 *
 * 第一層是 catalog 的 allowedRewardPolicies 不含 coin_eligible；
 * 這一層擋的是「catalog 寫錯」或未來有人改壞資料的情況 —— 規格明確要求即使
 * catalog 錯誤包含 coin_eligible，validator 也必須擋下。
 *
 * ⚠️ 只擋成長幣與時間儲蓄。
 *
 * 舊版還多擋一件事：家庭參與**只能**是 `family_contribution`，
 * 連「只留下紀錄」與「進度與肯定」都不行。第九階段 B 已經把資料庫那一條
 * 對應的 guard 改掉了（B ＋ record_only／progress_only 可以建立），
 * 這一層跟著對齊 —— 兩邊說法不一致的話，家長會遇到
 * 「App 說不行、資料庫其實可以」這種沒有人能解釋的狀態。
 *
 * 家庭貢獻仍然是**建議**做法（見 evaluateCustomTaskRewardOptions 的
 * recommended），只是不再是唯一合法的選擇。
 */
function validateFamilyParticipationReward(
  draft: TaskDraft,
  errors: TaskDraftValidationErrors,
): void {
  if (draft.purposeCategory !== 'family_participation') return;
  if (COIN_LIKE_POLICIES.includes(draft.rewardPolicy)) {
    errors.rewardPolicy = '家庭參與不發成長幣，也不記時間儲蓄';
  }
}

export function validateRecurringTaskDraft(
  draft: RecurringTaskDraft,
  variant: TaskPresetVariant | undefined,
): TaskDraftValidationErrors {
  const errors: TaskDraftValidationErrors = {};

  validateCommon(draft, errors);
  validateRequiredOptionGroups(variant?.optionGroups ?? [], draft, errors);
  validateFamilyParticipationReward(draft, errors);

  if (draft.scheduleMode === 'fixed_days') {
    if (draft.recurrenceDays.length === 0) errors.recurrenceDays = '請至少選一天';
  } else {
    const freq = draft.weeklyFrequency;
    if (
      freq === undefined
      || !Number.isInteger(freq)
      || freq < DRAFT_FALLBACKS.minWeeklyFrequency
      || freq > DRAFT_FALLBACKS.maxWeeklyFrequency
    ) {
      errors.weeklyFrequency =
        `請選擇每週 ${DRAFT_FALLBACKS.minWeeklyFrequency}–${DRAFT_FALLBACKS.maxWeeklyFrequency} 次`;
    }
  }

  validateMinutes(draft.minutesPerSession, 'minutesPerSession', errors);

  if (draft.preferredTime === 'custom' && isBlank(draft.preferredTimeCustom ?? '')) {
    errors.preferredTimeCustom = '請描述適合的時段';
  }

  if (isBlank(draft.completionDescription)) {
    errors.completionDescription = '請描述怎樣算完成';
  }

  if (draft.reviewEnabled && draft.reviewAfterDays !== undefined) {
    const d = draft.reviewAfterDays;
    if (!Number.isInteger(d) || d < 1 || d > DRAFT_FALLBACKS.maxDurationDays) {
      errors.reviewAfterDays = '請選擇合理的回顧天數';
    }
  }

  return errors;
}

export function validateFamilyRoleDraft(
  draft: FamilyRoleDraft,
  variant: TaskPresetVariant | undefined,
): TaskDraftValidationErrors {
  const errors: TaskDraftValidationErrors = {};

  validateCommon(draft, errors);
  validateFamilyParticipationReward(draft, errors);

  /*
    角色群組（optionGroups[0]）不走 validateRequiredOptionGroups：
    它的答案存在 roleOptionId，自填值也存在 customRoleValue 而不是 customOptionValues，
    交給下面那段驗。掃其餘群組是為了「五種 draft 都覆蓋到」這件事對未來也成立 ——
    catalog 之後替家庭角色加第二組選項時，不會安靜地漏掉。
  */
  const roleGroupId = variant?.optionGroups[0]?.id;
  validateRequiredOptionGroups(
    (variant?.optionGroups ?? []).filter(group => group.id !== roleGroupId),
    draft,
    errors,
  );

  if (draft.purposeCategory !== 'family_participation') {
    errors.purposeCategory = '家庭角色必須屬於家庭參與';
  }

  /*
    家庭角色仍然固定 family_contribution。
    上面的 validateFamilyParticipationReward 放寬之後，這一條要單獨留著 ——
    create_parent_task_v1 的 guard 對家庭角色沒有跟著放寬，
    少了這一行的話，一個「只留下紀錄」的家庭角色會一路走到 RPC 才被拒絕。
  */
  if (!errors.rewardPolicy && draft.rewardPolicy !== 'family_contribution') {
    errors.rewardPolicy = '家庭角色固定以家庭貢獻記錄';
  }

  if (isBlank(draft.roleOptionId)) {
    errors.roleOptionId = '請選擇一個角色';
  } else if (draft.roleOptionId === 'other' && isBlank(draft.customRoleValue ?? '')) {
    errors.customRoleValue = '請填寫角色名稱';
  }

  if (draft.recurrenceDays.length === 0) {
    errors.recurrenceDays = '請至少選一天';
  }

  validateDurationDays(draft.durationDays, errors);
  const choices = variant?.defaultDraft.durationDayChoices;
  if (!errors.durationDays && choices && choices.length > 0
    && !choices.includes(draft.durationDays)) {
    errors.durationDays = `請從 ${choices.join('、')} 天中選擇`;
  }

  const enabledItems = draft.responsibilityItems.filter(item => item.enabled);
  if (draft.responsibilityItems.length > DRAFT_FALLBACKS.maxResponsibilityItems) {
    errors.responsibilityItems =
      `負責內容最多 ${DRAFT_FALLBACKS.maxResponsibilityItems} 項`;
  } else if (enabledItems.length < DRAFT_FALLBACKS.minResponsibilityItems) {
    errors.responsibilityItems = '請至少保留一項負責內容';
  } else if (enabledItems.some(item => isBlank(item.text))) {
    errors.responsibilityItems = '負責內容不可空白';
  }

  if (isBlank(draft.scopeDescription)) {
    errors.scopeDescription = '請說清楚負責的範圍';
  }

  const validLevels = ['together_first', 'remind_then_check', 'independent_with_help'];
  if (!validLevels.includes(draft.supportLevel)) {
    errors.supportLevel = '請選擇家長一開始的協助方式';
  }

  if (isBlank(draft.exceptionDescription)) {
    errors.exceptionDescription = '請描述可以跳過或重新討論的情況';
  }

  const review = draft.firstReviewAfterDays;
  if (!Number.isInteger(review) || review < 1 || review > draft.durationDays) {
    errors.firstReviewAfterDays = '第一次回顧請落在試行期間之內';
  }

  if (isBlank(draft.contributionDescription)) {
    errors.contributionDescription = '請描述家庭貢獻如何被記錄';
  }

  return errors;
}

function validateMinutes(
  minutes: number | undefined,
  key: 'minutesPerSession' | 'estimatedMinutes',
  errors: TaskDraftValidationErrors,
): void {
  if (minutes === undefined) return;
  if (
    !Number.isInteger(minutes)
    || minutes < DRAFT_FALLBACKS.minMinutes
    || minutes > DRAFT_FALLBACKS.maxMinutes
  ) {
    errors[key] =
      `請填 ${DRAFT_FALLBACKS.minMinutes}–${DRAFT_FALLBACKS.maxMinutes} 之間的整數分鐘`;
  }
}

export function validateOneTimeDraft(
  draft: OneTimeTaskDraft,
  variant: TaskPresetVariant | undefined,
): TaskDraftValidationErrors {
  const errors: TaskDraftValidationErrors = {};

  if (isBlank(draft.title)) errors.title = '請填寫名稱';
  validateRequiredOptionGroups(variant?.optionGroups ?? [], draft, errors);
  validateFamilyParticipationReward(draft, errors);

  if (isBlank(draft.taskDetails)) {
    errors.taskDetails = '請寫下這次具體要完成什麼';
  }

  if (!isValidLocalDateString(draft.scheduledDate)) {
    errors.scheduledDate = '請填寫正確日期，格式為 YYYY-MM-DD';
  }

  const validTimes = [
    'before_school', 'after_school', 'after_dinner',
    'before_bed', 'weekend', 'when_needed', 'custom',
  ];
  if (!validTimes.includes(draft.preferredTime)) {
    errors.preferredTimeCustom = '請選擇適合的時段';
  } else if (draft.preferredTime === 'custom' && isBlank(draft.preferredTimeCustom ?? '')) {
    errors.preferredTimeCustom = '請描述適合的時段';
  }

  validateMinutes(draft.estimatedMinutes, 'estimatedMinutes', errors);

  const validLevels = ['independent', 'check_after', 'do_together'];
  if (!validLevels.includes(draft.supportLevel)) {
    errors.supportLevel = '請選擇家長這次怎麼協助';
  }

  if (isBlank(draft.completionDescription)) {
    errors.completionDescription = '請描述怎樣算完成';
  }

  // 回饋方式必須在這個版本允許的範圍內（家庭參與的更嚴格規則已在上面擋過）。
  if (variant !== undefined
    && !errors.rewardPolicy
    && !variant.allowedRewardPolicies.includes(draft.rewardPolicy)) {
    errors.rewardPolicy = '這個版本不提供這種回饋方式';
  }

  // 第二層防線：即使 catalog 被改壞，學校作業也不得走幣或時間儲蓄。
  if (
    !errors.rewardPolicy
    && draft.familyId === SCHOOL_ASSIGNMENT_FAMILY_ID
    && !SCHOOL_ASSIGNMENT_POLICIES.includes(draft.rewardPolicy)
  ) {
    errors.rewardPolicy = '學校作業只能留下紀錄或以進度與肯定回饋';
  }

  if (variant !== undefined && variant.completionPolicy !== 'complete_once') {
    errors.completionPolicy = '單次任務的結束方式必須是完成一次即結束';
  }

  return errors;
}

/**
 * 依 editorKind 分派。
 * 用窮盡 switch —— 之後新增 editorKind 卻忘了寫 validator，TypeScript 會直接報錯。
 */
export function validateTaskDraft(
  draft: TaskDraft,
  variant: TaskPresetVariant | undefined,
  ageGroup?: string,
): TaskDraftValidationErrors {
  const errors = ((): TaskDraftValidationErrors => {
    switch (draft.editorKind) {
      case 'growth_plan':
        return validateGrowthPlanDraft(draft, variant);
      case 'short_support':
        return validateShortSupportDraft(draft, variant);
      case 'recurring':
        return validateRecurringTaskDraft(draft, variant);
      case 'family_role':
        return validateFamilyRoleDraft(draft, variant);
      case 'one_time':
        return validateOneTimeDraft(draft, variant);
      default:
        return assertNever(draft);
    }
  })();

  if (ageGroup !== undefined) validateRewardAvailability(draft, variant, ageGroup, errors);

  return errors;
}

/**
 * 選中的回饋方式現在真的能用嗎。
 *
 * 家長可以在選了「可獲得成長幣」之後把每次分鐘清掉 —— 那一刻政策就算不出幣值了。
 * 沒有這道檢查的話，畫面上的選項會默默消失、草稿卻還記著一個發不出來的政策，
 * 一路撐到 RPC 才被拒絕。
 *
 * ageGroup 未提供時（單元測試直接測欄位映射的情境）跳過，
 * 不用一個猜來的年齡段去決定能不能發幣。
 */
export function validateRewardAvailability(
  draft: TaskDraft,
  variant: TaskPresetVariant | undefined,
  ageGroup: string,
  errors: TaskDraftValidationErrors,
): void {
  const minutes = draftEstimatedMinutes(draft);
  const capabilities = resolveTaskRewardCapabilities({
    ageGroup,
    purposeCategory: draft.purposeCategory,
    ...(minutes !== undefined ? { estimatedMinutes: minutes } : null),
  });

  const options = selectAvailableRewardPolicies({
    allowedRewardPolicies: variant?.allowedRewardPolicies ?? ALL_REWARD_POLICIES,
    displayMode: 'demo',
    capabilities,
  });

  if (options.some(option => option.policy === draft.rewardPolicy)) return;

  errors.rewardPolicy =
    draft.rewardPolicy === 'time_saving_eligible'
      ? '時間儲蓄尚未啟用，請改選其他回饋方式'
      : '目前的設定算不出成長幣，請補上每次大約做多久，或改選其他回饋方式';
}

export function hasErrors(errors: TaskDraftValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}
