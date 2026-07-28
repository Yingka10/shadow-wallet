// Shadow Wallet · Parent Tablet — 任務草稿型別
//
// 刻意用 discriminated union 而不是「全部欄位都 optional 的巨大物件」：
// 成長計畫有里程碑、短期支援有支援步驟，兩者的必填欄位不同。
// 用 editorKind 當判別欄位，editor 才能拿到收斂過的型別，不必到處 optional chaining。
//
// 本輪所有欄位都只存在本地草稿，尚未持久化到 Supabase。

import type {
  DurationType,
  PlanMode,
  PurposeCategory,
  RewardPolicy,
  TaskSource,
} from '../taskCatalog';

/** 對應哪一支 editor。與 catalog 的 durationType/planMode 由 resolveEditorKind 轉換。 */
export type TaskEditorKind =
  | 'growth_plan'
  | 'short_support'
  | 'recurring'
  | 'family_role'
  | 'one_time';

/** 提醒方式。本輪只存本地草稿，沒有任何通知排程。 */
export type ReminderMode = 'none' | 'on_task_day' | 'before_start';

export type GrowthPlanPreferredTime =
  | 'after_school'
  | 'after_dinner'
  | 'before_bed'
  | 'weekend'
  | 'custom';

export type ShortSupportTime =
  | 'morning'
  | 'after_school'
  | 'after_homework'
  | 'after_dinner'
  | 'before_bed'
  | 'custom';

/**
 * 固定任務與單次任務共用的時段。
 * 刻意不為單一 family 加 before_meal —— 用 custom 填「用餐前」。
 * 兩種形式的選項完全相同，所以只定義一次，不複製第二份型別與第二份標籤陣列。
 */
export type RecurringPreferredTime =
  | 'before_school'
  | 'after_school'
  | 'after_dinner'
  | 'before_bed'
  | 'weekend'
  | 'when_needed'
  | 'custom';

/** 固定任務的排程方式。weekly_frequency 目前只存本地草稿（DB 只有 recurrence_days）。 */
export type RecurringScheduleMode = 'fixed_days' | 'weekly_frequency';

/** 單次任務的時段與固定任務相同，用同一個 union，不另外複製七個值。 */
export type OneTimePreferredTime = RecurringPreferredTime;

/**
 * 單次任務家長怎麼協助。
 * 刻意不用「家長監督」——這是安排協助方式，不是盯著孩子做。
 */
export type OneTimeSupportLevel = 'independent' | 'check_after' | 'do_together';

/** 家庭角色一開始由家長協助到什麼程度。刻意不用「完全獨立」這種說法。 */
export type FamilyRoleSupportLevel =
  | 'together_first'
  | 'remind_then_check'
  | 'independent_with_help';

export type ResponsibilityItem = {
  id: string;
  text: string;
  enabled: boolean;
  isCustom: boolean;
};

export type DraftMilestone = {
  id: string;
  title: string;
  /** 第幾天達成；沒有明確天數時為 undefined。 */
  targetDay?: number;
  /** false = 由系統固定產生、家長不可刪（本輪全部為 true）。 */
  isEditable: boolean;
  /** 家長可關掉不想要的里程碑，但至少要留一個。 */
  enabled: boolean;
};

export type DraftSupportStep = {
  id: string;
  text: string;
  enabled: boolean;
};

export type BaseTaskDraft = {
  editorKind: TaskEditorKind;

  familyId: string;
  variantId: string;

  title: string;
  /** 成長計畫＝家長原始期待；短期支援＝目前想改善的情況。 */
  originalExpectation: string;

  purposeCategory: PurposeCategory;
  durationType: DurationType;
  planMode?: PlanMode;

  source: TaskSource;
  rewardPolicy: RewardPolicy;

  /** optionGroup.id → 選中的 option id 陣列（single 也是陣列，長度 0 或 1）。 */
  selectedOptions: Record<string, string[]>;
  /** optionGroup.id → 「其他」的自填內容。 */
  customOptionValues: Record<string, string>;

  /** 本地日期 YYYY-MM-DD，不經 UTC 轉換。 */
  startDate: string;
  reminderMode: ReminderMode;

  createdFromPreset: true;
};

export type GrowthPlanDraft = BaseTaskDraft & {
  editorKind: 'growth_plan';

  durationDays: number;
  /** 0 = 週日，沿用專案既有定義。 */
  recurrenceDays: number[];
  /** undefined = 不設定固定分鐘（階段型投入，例如創作／探索）。 */
  minutesPerSession?: number;

  preferredTime: GrowthPlanPreferredTime;
  preferredTimeCustom?: string;

  firstReviewAfterDays: number;
  weekendReviewEnabled: boolean;

  milestones: DraftMilestone[];

  completionDescription: string;
};

export type ShortSupportDraft = BaseTaskDraft & {
  editorKind: 'short_support';

  durationDays: number;
  recurrenceDays: number[];

  focusOptionIds: string[];

  supportSteps: DraftSupportStep[];

  supportTime: ShortSupportTime;
  supportTimeCustom?: string;

  firstReviewAfterDays: number;
  weekendReviewEnabled: boolean;

  successDescription: string;
};

/**
 * 固定任務：每週或固定日期重複進行相似內容。
 * 不是長期里程碑計畫（沒有 milestones），也不是家庭角色（沒有責任範圍與試行期）。
 */
export type RecurringTaskDraft = BaseTaskDraft & {
  editorKind: 'recurring';

  /** 0 = 週日，沿用專案既有定義。scheduleMode 為 weekly_frequency 時可為空陣列。 */
  recurrenceDays: number[];

  scheduleMode: RecurringScheduleMode;
  /** 每週幾次；只有 scheduleMode === 'weekly_frequency' 時有意義。 */
  weeklyFrequency?: number;

  /** undefined = 不設定固定分鐘。家庭參與多半不設。 */
  minutesPerSession?: number;

  preferredTime: RecurringPreferredTime;
  preferredTimeCustom?: string;

  completionDescription: string;

  reviewEnabled: boolean;
  reviewAfterDays?: number;
};

/**
 * 家庭角色：孩子在一段期間內承擔一個清楚的家庭角色，
 * 試行與回顧後再決定繼續、換角色或結束。回饋固定為家庭貢獻，不發幣。
 */
export type FamilyRoleDraft = BaseTaskDraft & {
  editorKind: 'family_role';

  durationDays: number;
  recurrenceDays: number[];

  /** 對應 role optionGroup 的 option id；'' = 尚未選。 */
  roleOptionId: string;
  customRoleValue?: string;

  responsibilityItems: ResponsibilityItem[];

  scopeDescription: string;

  supportLevel: FamilyRoleSupportLevel;

  exceptionDescription: string;

  firstReviewAfterDays: number;
  weekendReviewEnabled: boolean;

  contributionDescription: string;
};

/**
 * 單次任務：這次完成一次就結束的明確事項。
 *
 * 不是週期任務（沒有 recurrenceDays）、不是成長計畫（沒有 milestones）、
 * 不是短期支援（沒有 supportSteps 與穩定退場），也不是家庭角色（沒有試行期與責任範圍）。
 */
export type OneTimeTaskDraft = BaseTaskDraft & {
  editorKind: 'one_time';

  /** 這次具體要完成什麼。必填 —— 家族說明太籠統，不能拿來代替。 */
  taskDetails: string;

  /** 本地日期 YYYY-MM-DD。未來預計映射到 tasks.due_date，本輪只存草稿。 */
  scheduledDate: string;

  preferredTime: OneTimePreferredTime;
  preferredTimeCustom?: string;

  /** undefined = 不設定固定分鐘。家庭參與預設不顯示這一區。 */
  estimatedMinutes?: number;

  supportLevel: OneTimeSupportLevel;

  completionDescription: string;

  /** 老師要求、家庭例外、要帶的東西、安全提醒等補充。非必填。 */
  notes: string;
};

export type TaskDraft =
  | GrowthPlanDraft
  | ShortSupportDraft
  | RecurringTaskDraft
  | FamilyRoleDraft
  | OneTimeTaskDraft;

// ---------------------------------------------------------------------------
// 驗證
// ---------------------------------------------------------------------------

/**
 * 錯誤的欄位鍵。`option:<groupId>` 與 `customOption:<groupId>` 用樣板字面量，
 * 讓錯誤能顯示在該選項組旁邊，而不是全部擠到最上方一則總錯誤。
 */
export type TaskDraftFieldKey =
  | 'title'
  | 'originalExpectation'
  | 'recurrenceDays'
  | 'durationDays'
  | 'startDate'
  | 'minutesPerSession'
  | 'preferredTimeCustom'
  | 'supportTimeCustom'
  | 'milestones'
  | 'completionDescription'
  | 'focusOptionIds'
  | 'supportSteps'
  | 'successDescription'
  | 'scheduleMode'
  | 'weeklyFrequency'
  | 'reviewAfterDays'
  | 'rewardPolicy'
  | 'roleOptionId'
  | 'customRoleValue'
  | 'responsibilityItems'
  | 'scopeDescription'
  | 'supportLevel'
  | 'exceptionDescription'
  | 'firstReviewAfterDays'
  | 'contributionDescription'
  | 'purposeCategory'
  | 'taskDetails'
  | 'scheduledDate'
  | 'estimatedMinutes'
  | 'notes'
  | 'completionPolicy'
  | `option:${string}`
  | `customOption:${string}`;

export type TaskDraftValidationErrors = Partial<Record<TaskDraftFieldKey, string>>;

// ---------------------------------------------------------------------------
// 型別守衛
// ---------------------------------------------------------------------------

export function isGrowthPlanDraft(draft: TaskDraft): draft is GrowthPlanDraft {
  return draft.editorKind === 'growth_plan';
}

export function isShortSupportDraft(draft: TaskDraft): draft is ShortSupportDraft {
  return draft.editorKind === 'short_support';
}

export function isRecurringDraft(draft: TaskDraft): draft is RecurringTaskDraft {
  return draft.editorKind === 'recurring';
}

export function isFamilyRoleDraft(draft: TaskDraft): draft is FamilyRoleDraft {
  return draft.editorKind === 'family_role';
}

export function isOneTimeDraft(draft: TaskDraft): draft is OneTimeTaskDraft {
  return draft.editorKind === 'one_time';
}

/**
 * 窮盡檢查。switch 已涵蓋所有 editorKind 時 value 會收斂成 never；
 * 之後有人新增 editorKind 卻忘了處理，TypeScript 會在編譯期就報錯，
 * 不必再留一個「永遠到不了」的 placeholder 畫面來掩蓋。
 */
export function assertNever(value: never): never {
  throw new Error(`未處理的 editorKind：${JSON.stringify(value)}`);
}
