// Shadow Wallet · Parent Tablet — 任務建立命令（持久化契約）
//
// 這一層刻意與 UI 的 TaskDraft 分開。
//
// TaskDraft 是「家長正在編輯的東西」：它有 enabled/disabled 的編輯痕跡、
// 有只在畫面上有意義的欄位（minuteCustomText 之類留在 component）、
// 而且會隨著 editor 的 UX 改動而改動。
//
// CreateParentTaskCommand 是「要被寫下去的東西」：一份不含 React state、
// 不含畫面狀態、也不假設現有 DB 一定存得下的完整描述。未來不論走
// RPC、Edge Function 還是 service，輸入都是這個型別。
//
// 反過來也一樣重要：**不要把 Supabase 的 row type 拿來當 UI Draft**。
// tasks 表現在只有 category 一欄承載四個維度（見 docs/DELTA §4），
// 若讓畫面直接對著 row 寫，抽屜好不容易分開的目的／期間／來源／回饋會被壓回一欄。
//
// 本輪只定義契約與純映射，沒有任何 Supabase 呼叫。

import type {
  CompletionPolicy,
  DurationType,
  PlanMode,
  PurposeCategory,
  RewardPolicy,
  TaskSource,
} from '../taskCatalog';
import type {
  FamilyRoleSupportLevel,
  OneTimeSupportLevel,
  ReminderMode,
  TaskEditorKind,
} from '../taskDraft';
// 只取型別；taskReward 反過來也只取這裡的型別，兩邊都不在執行期互相載入。
import type { TaskRewardDecision } from '../taskReward/types';

/**
 * 契約版本。
 * 之後改變欄位語義（不是新增可選欄位）時要進版，讓 service 能分辨舊命令。
 */
export const TASK_COMMAND_SCHEMA_VERSION = 1 as const;

/** 建立命令要知道的孩子資訊。刻意不是 Supabase 的 Child row。 */
export type CommandChildContext = {
  id: string;
  /** 一律取自這個孩子所屬的家庭，不可用「查到的第一筆 family」。 */
  familyId: string;
  /** 與 lib/onboarding 的 AgeGroup 對齊（'6-9' 等）。由呼叫端算好傳入。 */
  ageGroup: string;
};

// ---------------------------------------------------------------------------
// 排程
// ---------------------------------------------------------------------------

/**
 * 排程模式。
 *   one_time         單次：只有一個 scheduledDate
 *   fixed_days       固定星期：recurrenceDays（0 = 週日，沿用專案既有定義）
 *   weekly_frequency 每週幾次，不指定星期：weeklyFrequency
 */
export type TaskScheduleMode = 'one_time' | 'fixed_days' | 'weekly_frequency';

export type TaskScheduleCommand = {
  mode: TaskScheduleMode;

  /** 任務開始生效的日期，YYYY-MM-DD 本地日期。單次任務等於 scheduledDate。 */
  startDate: string;
  /** mode === 'one_time' 才有：這次要完成的日期。 */
  scheduledDate?: string;

  /** mode === 'fixed_days' 才有意義。0 = 週日。 */
  recurrenceDays?: number[];
  /** mode === 'weekly_frequency' 才有意義。不可被靜靜丟掉（有測試把關）。 */
  weeklyFrequency?: number;

  /** 時段 enum id；'custom' 時看 preferredTimeCustom。 */
  preferredTime: string;
  preferredTimeCustom?: string;

  /** 每次／這次的預估分鐘。undefined = 刻意不設固定分鐘，不是漏填。 */
  estimatedMinutes?: number;

  reminderMode: ReminderMode;

  /** 長期形式（成長計畫／短期支援／家庭角色）才有的期間。 */
  durationDays?: number;
  /** startDate + durationDays - 1；durationDays 存在時一定算得出來。 */
  endDate?: string;
};

// ---------------------------------------------------------------------------
// 回顧
// ---------------------------------------------------------------------------

export type TaskReviewCommand = {
  /** 固定任務的「要不要定期回顧」；長期形式一律 true。 */
  reviewEnabled: boolean;
  /** 長期形式：第幾天做第一次回顧。0 = 家長關掉了。 */
  firstReviewAfterDays?: number;
  /** 由 startDate 推得，方便排程；firstReviewAfterDays > 0 時才有。 */
  firstReviewDate?: string;
  /** 固定任務：幾天後一起看看。 */
  reviewAfterDays?: number;
  weekendReviewEnabled?: boolean;
};

// ---------------------------------------------------------------------------
// 計畫（成長計畫 / 短期支援）
// ---------------------------------------------------------------------------

export type TaskMilestoneCommand = {
  id: string;
  title: string;
  /** 約第幾天達成；沒有明確天數時不帶。 */
  targetDay?: number;
};

export type TaskSupportStepCommand = {
  id: string;
  text: string;
};

export type TaskPlanCommand = {
  durationDays: number;
  /** 只含家長保留（enabled）的項目 —— 見 mapTaskDraftToCommand 的說明。 */
  milestones: TaskMilestoneCommand[];
  supportSteps: TaskSupportStepCommand[];
  /** 短期支援的本次焦點。成長計畫為空陣列。 */
  focusOptionIds: string[];
};

// ---------------------------------------------------------------------------
// 家庭角色
// ---------------------------------------------------------------------------

export type TaskResponsibilityCommand = {
  id: string;
  text: string;
  /** 家長自己加的項目；建立後的顯示與統計會想分辨這件事。 */
  isCustom: boolean;
};

export type TaskRoleCommand = {
  /** 對應角色 optionGroup 的 option id。 */
  optionId: string;
  /** optionId === 'other' 時的自填角色名稱。 */
  customValue?: string;
  /** 只含 enabled 的項目。 */
  responsibilities: TaskResponsibilityCommand[];
  scopeDescription: string;
  exceptionDescription: string;
  contributionDescription: string;
};

/**
 * 家長一開始怎麼協助。
 *
 * 家庭角色與單次任務各有自己的三個值，但講的是同一件事，
 * 所以放在同一個地方而不是在 role 裡放一份、在 schedule 裡再放一份 ——
 * 同一個概念出現兩次，之後一定會有一邊沒跟上。
 */
export type TaskSupportCommand = {
  level: FamilyRoleSupportLevel | OneTimeSupportLevel;
};

// ---------------------------------------------------------------------------
// 命令本體
// ---------------------------------------------------------------------------

/**
 * 命令的前半段：從 TaskDraft 純映射得到、但**還沒有回饋決策**的部分。
 *
 * 為什麼要分兩段：幣值不是畫面上的資料，它是政策算出來的。
 * 讓 mapTaskDraftToCommand 順手算幣，等於把政策綁進 UI 映射層，
 * 之後政策換版要改的地方就從一個變成兩個。
 *
 * 流程固定是：
 *   TaskDraft → mapTaskDraftToCommand → evaluateTaskReward → finalizeCreateParentTaskCommand
 */
export type CreateParentTaskCommandBase = {
  schemaVersion: typeof TASK_COMMAND_SCHEMA_VERSION;

  childId: string;
  familyId: string;

  preset: {
    familyId: string;
    variantId: string;
  };

  task: {
    title: string;
    purposeCategory: PurposeCategory;
    durationType: DurationType;
    planMode?: PlanMode;
    source: TaskSource;
    rewardPolicy: RewardPolicy;
    completionPolicy: CompletionPolicy;

    /** 家長寫下的原始期待。任何後續建議都不得覆蓋這一段。 */
    originalExpectation: string;
    /** 怎樣算完成；短期支援放的是「怎樣算逐漸穩定」。 */
    completionDescription: string;
    /** 單次任務的補充說明；空白時不帶。 */
    notes?: string;
  };

  schedule: TaskScheduleCommand;

  content: {
    /** optionGroup.id → 選中的 option id。single 也是陣列。 */
    selectedOptions: Record<string, string[]>;
    customOptionValues: Record<string, string>;
    /** 單次任務「這次具體要完成什麼」。 */
    taskDetails?: string;
  };

  review?: TaskReviewCommand;
  plan?: TaskPlanCommand;
  role?: TaskRoleCommand;
  support?: TaskSupportCommand;

  metadata: {
    ageGroup: string;
    createdFromPreset: true;
    /**
     * 任務政策的版本（taskCatalog 的 TASK_POLICY_VERSION）。
     *
     * 這是「目的怎麼分、來源要求什麼、哪些回饋方式合法、怎麼結束」的規則版本。
     * **不是幣值版本** —— 幣值版本在 reward.decision.rewardPolicyVersion，
     * 兩者會各自進版，共用一個欄位會讓稽核失去意義。
     */
    taskPolicyVersion: string;
    /**
     * 產生這筆命令時的 catalog 版本。
     * preset id 不設外鍵（catalog 是 TypeScript 常數不是 DB master table），
     * 所以改用版本標記來分辨舊任務是依哪一版 family / variant 定義建立的。
     */
    presetCatalogVersion: string;
    /** 哪一支 editor 產生的。決定要寫哪些子表，不必再從 durationType 反推。 */
    editorKind: TaskEditorKind;
  };
};

/**
 * 要送進 RPC 的完整命令 = 映射結果 ＋ 回饋決策。
 *
 * decision 不是「建議」，是這筆任務的定價依據本身：RPC 會核對它、
 * 把 finalAmount 寫進任務，並把整份 decision 存進稽核事件。
 * task.rewardPolicy 與 decision.rewardPolicy 必須一致（由 finalize 與 RPC 各驗一次）。
 */
export type CreateParentTaskCommand = CreateParentTaskCommandBase & {
  reward: {
    decision: TaskRewardDecision;
  };
};

// ---------------------------------------------------------------------------
// 建立 service 的介面（本輪只有型別與一個明確不可用的實作）
// ---------------------------------------------------------------------------

export type CreateParentTaskFailureCode =
  | 'VALIDATION_FAILED'
  | 'POLICY_REJECTED'
  | 'PERSISTENCE_FAILED'
  | 'UNKNOWN';

export type CreateParentTaskResult =
  | {
      ok: true;
      taskId: string;
      /** child_tasks / long_term_goals 等一併建立的資料列 id。 */
      relatedIds: string[];
    }
  | {
      ok: false;
      code: CreateParentTaskFailureCode;
      message: string;
      /** 型別與 UI 的 TaskDraftValidationErrors 相同，可直接餵回 editor。 */
      fieldErrors?: Record<string, string>;
    };

export interface ParentTaskCreationService {
  create(command: CreateParentTaskCommand): Promise<CreateParentTaskResult>;
}

/**
 * 目前唯一存在的實作：一定失敗。
 *
 * 刻意不是「回傳假的成功」——那會讓抽屜看起來已經接上，
 * 家長回到任務列表卻找不到剛建立的任務。
 * production UI 本輪根本不呼叫它（確認建立仍是 disabled 的靜態元素）。
 */
export class UnavailableParentTaskCreationService implements ParentTaskCreationService {
  async create(_command: CreateParentTaskCommand): Promise<CreateParentTaskResult> {
    return {
      ok: false,
      code: 'PERSISTENCE_FAILED',
      message: '建立流程尚未串接資料庫。',
    };
  }
}
