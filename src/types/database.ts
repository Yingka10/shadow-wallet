import type {
  ChildProposal,
  ChildProposalAdjustmentRequest,
  ChildProposalPlanVersion,
  ChildProposalStatusEvent,
  ChildProposalTrialEvent,
  AcceptChildProposalResult,
  CloseChildProposalResult,
  AcceptAdjustmentResult,
  DeclineAdjustmentResult,
  ConfirmChildProposalResult,
  RequestChildProposalChangesResult,
  ReviseChildProposalResult,
} from '../lib/childProposal/types';

// ── 通用 enum 型別 ───────────────────────────────────────────

export type AgeGroup = '2-4' | '4-6' | '6-9' | '9-12';
export type BaumrindType =
  | 'elite_high_control'
  | 'pragmatic_labor'
  | 'guilt_compensate'
  | 'free_fatigue';
export type MotivationLevel = 'amotivation' | 'external' | 'introjected' | 'internal';
export type PersonalityType = 'competitive' | 'relational' | 'curious';
export type TaskCategory = 'A' | 'B' | 'C' | 'D';
export type DayType = 'weekday' | 'weekend' | 'both' | 'custom' | 'once';
/**
 * long_term_goals.goal_type 與 tasks.long_term_type 的允許值。
 *
 * 以 live DB 的 CHECK 為準（habit / skill / responsibility / challenge）。
 * 這裡原本寫的是 'family' —— 那個值資料庫從來不接受，所有寫入它的路徑
 * 都會被 check constraint 擋下。修正見 migration 20260731000000。
 */
export type LongTermType = 'habit' | 'skill' | 'responsibility' | 'challenge';
export type AccountType = 'SINGLE' | 'DOUBLE';
export type ParentRole = 'primary' | 'co';
export type AiMode = 'conservative' | 'balanced' | 'auto';
export type RedemptionStatus = 'pending' | 'approved' | 'rejected';
export type AiVerdict = 'ok' | 'high';
export type ObsType = 'noaction' | 'quality' | 'bonus' | 'other';
export type WalletType = 'spending' | 'saving';
export type TransactionType = 'earn' | 'redeem' | 'deduct' | 'interest' | 'adjust';
export type RewardType = 'item' | 'privilege' | 'screen_time';
export type RewardAddedBy = 'parent' | 'child';
export type OverrideType = 'partial' | 'none' | 'renegotiate';
export type CompletionStatus = 'completed' | 'flagged';
export type GoalStatus = 'active' | 'completed' | 'paused';
export type PoolType = 'family_time' | 'game_time';
export type ReportedBy = 'child' | 'parent';
export type PreferredTimeWindow = 'after_dinner' | 'before_bed';
export type CompletionStartMode = 'self_started' | 'reminded';

/** Maps day-number (as string key) to coin reward. E.g. {"7": 20, "14": 40, "21": 80} */
export type CheckpointRewards = Record<string, number>;

/**
 * 技能學習類的單一學習階段（里程碑）。
 * 存於 long_term_goals.level_definitions（jsonb array）。
 */
export type SkillMilestone = {
  id: string;     // uuid，建立時 client 端產生
  name: string;   // 階段名稱（已 trim，≤30 字元）
  coin: number;   // 完成此階段的獎勵幣值（1–50）
};

// ── Row 型別（對應 DB 欄位，全必填）──────────────────────────
// 使用 type 而非 interface：TypeScript 5.9+ 中 interface 不滿足
// Record<string, unknown> 的 extends 約束，導致 supabase-js 的
// TablesInsert<T> 退化成 never。type alias 沒有這個問題。

export type Family = {
  id: string;
  family_name: string;
  timezone: string;
  created_by: string | null;
  created_at: string;
};

export type Parent = {
  id: string;
  family_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  role: ParentRole;
  baumrind_type: BaumrindType | null;
  ai_mode: AiMode;
  weekly_time_min: number;
  created_at: string;
};

export type Child = {
  id: string;
  family_id: string;
  nickname: string;
  birth_date: string;
  age_group: AgeGroup;
  account_type: AccountType;
  pin_code: string | null;
  created_at: string;
};

export type ChildProfile = {
  id: string;
  child_id: string;
  motivation_level: MotivationLevel;
  personality_type: PersonalityType | null;
  interest_tags: string[] | null;
  updated_at: string;
};

export type Task = {
  id: string;
  family_id: string;
  name: string;
  category: TaskCategory;
  day_type: DayType;
  long_term_type: LongTermType | null;
  is_long_term: boolean;
  base_time_min: number;
  difficulty: number;
  coin_override: number | null;
  is_system_default: boolean;
  allow_repeat: boolean;
  min_age: number;
  max_age: number;
  is_active: boolean;
  time_saving_min: number;
  recurrence_days: number[] | null;
  due_date: string | null;
  created_at: string;

  // ── 預設任務抽屜新增的欄位（migration 20260728000000 / 20260729000000）──
  //
  // 這些在 DB 都是 nullable 欄位，這裡卻標成 optional：因為這份型別是**手寫**的，
  // 而現有查詢多半只 select 舊欄位。標成必填會讓每一個既有的 Task 物件字面量
  // 突然缺欄位，但那些程式碼其實沒有壞。
  // 真正生成 types 之後要把 optional 改回 `| null`——見
  // docs/TASK_REWARD_POLICY_AUDIT.md 的 generated types checklist。
  // 四個維度（目的仍在 category，其餘在這裡）
  duration_type?: 'one_time' | 'recurring' | 'long_term' | null;
  plan_mode?: 'growth_plan' | 'short_support' | 'family_role' | null;
  task_source?: 'parent' | 'child' | 'co_created' | 'system' | 'system_suggested' | null;
  reward_policy?: RewardPolicyValue | null;
  completion_policy?:
    | 'complete_once' | 'keep_recurring' | 'finish_project'
    | 'review_and_continue' | 'stabilize_and_exit' | null;

  // 內容
  original_expectation?: string | null;
  completion_description?: string | null;
  task_details?: string | null;
  notes?: string | null;

  // 排程
  schedule_mode?: 'one_time' | 'fixed_days' | 'weekly_frequency' | 'plan_schedule' | null;
  weekly_frequency?: number | null;
  start_date?: string | null;
  /** 單次任務安排在哪一天。與 due_date 不同：後者是「過了就隱藏」。 */
  scheduled_date?: string | null;
  preferred_time?: string | null;
  preferred_time_custom?: string | null;
  /** 家長估計的投入分鐘。刻意與 base_time_min 分開，不參與幣值計算。 */
  estimated_minutes?: number | null;
  claim_period?: 'day' | 'week' | 'once' | null;
  max_claims_per_period?: number | null;

  // 回顧與協助
  review_enabled?: boolean | null;
  review_after_days?: number | null;
  support_level?: string | null;

  // 成長幣
  /**
   * 一次 reward event 的成長幣金額。**不一定是「完成一次」** ——
   * 它的單位由 payout_basis 決定：per_completion 是每次完成，
   * per_period 是本期達標一次。新任務的 canonical 來源。
   */
  reward_coin_amount?: number | null;
  reward_coin_suggested_amount?: number | null;
  reward_coin_min?: number | null;
  reward_coin_max?: number | null;

  // 結算語意
  /**
   * 什麼事件才結算。null = legacy（每次完成即結算）。
   * **不得由 claim_period 推導** —— claim_period 是「每期可以 claim 幾次」的
   * 頻率上限，兩者是不同維度。見 docs/CLAIM_PERIOD_VS_PAYOUT_BASIS.md。
   */
  payout_basis?: PayoutBasisValue | null;
  /** per_period 專用：一期內達成幾次才形成一次 reward event（建立當下的約定值）。 */
  period_target_count?: number | null;
  /**
   * 新結算語意從哪一天起適用。technical rollout metadata，不是共同約定內容 ——
   * 不進 material diff、不觸發孩子重新確認。
   */
  payout_basis_effective_from?: string | null;

  // 四種版本
  /** 任務政策（分類／來源／回饋資格／結束規則）的版本。 */
  task_policy_version?: string | null;
  /** 做出這筆回饋決策的政策版本。可發幣是 coin-policy，不發幣是回饋資格政策。 */
  reward_policy_version?: string | null;
  preset_catalog_version?: string | null;
  command_schema_version?: number | null;

  // 溯源
  preset_family_id?: string | null;
  preset_variant_id?: string | null;
  /** DB 上是 NOT NULL DEFAULT false —— 這裡標 optional 只是為了不動既有字面量。 */
  created_from_preset?: boolean;
  /**
   * 建立這筆任務的 client 請求識別碼（migration 20260730000000）。
   * 有 unique index，是「網路重送不會建出第二筆」的唯一依據。legacy 任務為 null。
   */
  creation_request_id?: string | null;
  creation_source?: 'preset' | 'parent_custom' | 'child_proposal' | 'legacy' | null;
  /** P0 目前只有 weekly_rhythm；null 表示沒有可證實的 structured model。 */
  progress_model?: 'weekly_rhythm' | null;
  next_step?: string | null;
};

/** tasks.reward_policy 的允許值（migration 20260728000000 的 CHECK）。 */
export type RewardPolicyValue =
  | 'record_only'
  | 'family_contribution'
  | 'progress_only'
  | 'coin_eligible'
  | 'time_saving_eligible';

/**
 * tasks.payout_basis 的允許值（migration 20260818000000 的 CHECK）。
 *
 * ⚠️ `per_milestone` / `final_completion` 在值域裡但**沒有執行路徑**（Phase 2）：
 * 建立路徑會回 PAYOUT_BASIS_NOT_IMPLEMENTED，complete_task 遇到則只記 progress、
 * 不 mint。它們現在存在的理由只是讓 Phase 2 不必再改一次 CHECK ——
 * 不代表已經支援。
 */
export type PayoutBasisValue =
  | 'per_completion'
  | 'per_period'
  | 'per_milestone'
  | 'final_completion';

export type TaskCompletion = {
  id: string;
  task_id: string;
  child_id: string;
  completed_at: string;
  reported_at: string;
  reported_by: ReportedBy;
  status: CompletionStatus;
  coin_earned: number;
  time_saved_min: number;
  mentor_child_id: string | null;
  override_id: string | null;
  planned_time_window: PreferredTimeWindow | null;
  start_mode: CompletionStartMode | null;
  created_at: string;
};

export type Override = {
  id: string;
  completion_id: string;
  parent_id: string;
  override_type: OverrideType;
  coin_deducted: number;
  credit_flag: boolean;
  reason: string | null;
  created_at: string;
};

export type Wallet = {
  id: string;
  child_id: string;
  wallet_type: WalletType;
  balance: number;
  interest_rate: number;
  last_interest_at: string | null;
  created_at: string;
};

export type Transaction = {
  id: string;
  wallet_id: string;
  amount: number;
  type: TransactionType;
  reference_id: string | null;
  reference_type: string | null;
  note: string | null;
  created_at: string;
};

export type RewardItem = {
  id: string;
  family_id: string;
  child_id: string | null;
  name: string;
  reward_type: RewardType;
  coin_cost: number;
  added_by: RewardAddedBy;
  parent_approved: boolean;
  is_active: boolean;
  is_redeemed: boolean;
  redeemed_at: string | null;
  created_at: string;
  /** 孩子在許願澄清問答裡選的原因／用途。只有走過澄清流程的願望才有值。 */
  child_reason: string | null;
  /** AI 整理後給家長看的一句話摘要。 */
  ai_summary: string | null;
  /** AI 建議幣值，僅供家長參考——最終 coin_cost 仍由家長核可時寫入。 */
  ai_suggested_coins: number | null;
  /** AI 認為家長可能需要另外確認的事（例如尺寸、預算），沒有就是空陣列。 */
  confirm_needed: string[];
  /** 家長判斷「現在不適合」時的簡短原因。 */
  parent_note: string | null;
};

export type LongTermGoal = {
  id: string;
  child_id: string;
  task_id: string;
  goal_type: LongTermType;
  total_days: number | null;
  current_day: number;
  status: GoalStatus;
  checkpoint_rewards: CheckpointRewards | null;
  motivation_note: string | null;
  started_at: string;
  /** 計畫最後一天（含）；新長期任務由 long_term_goals 保存。 */
  end_date?: string | null;
  /** 第幾天做第一次回顧。0 或 null = 家長關掉了。抽屜的長期任務會寫它。 */
  first_review_after_days?: number | null;
  weekend_review_enabled?: boolean | null;
  next_review_at: string | null;
  completed_at: string | null;
  created_at: string;
  // 通用
  min_age: number;
  interrupt_count: number;
  last_active_date: string | null;
  active_days: number[] | null;     // 0=日,1=一,...,6=六; null=every day
  preferred_time_window: PreferredTimeWindow | null;
  // 技能學習專用
  level_definitions: Record<string, any>[] | null;
  current_level: number | null;
  level_count: number | null;
  // 家庭責任專用
  role_title: string | null;
  salary_mode: boolean | null;
  base_salary: number | null;
  weekly_target_rate: number | null;
  privilege_reward: Record<string, any> | null;
  family_time_per_completion: number | null;   // 每次完成記入時間存摺的分鐘數
  target_completions: number | null;            // 應完成總次數 = activeDays.length × commitWeeks
  // 自我挑戰專用
  target_value: number | null;
  current_value: number | null;
  value_unit: string | null;
};

export type TimeSaving = {
  id: string;
  child_id: string;
  completion_id: string;
  minutes_saved: number;
  pool_type: PoolType;
  is_redeemed: boolean;
  redeemed_at: string | null;
  created_at: string;
};

export type WeeklyReport = {
  id: string;
  family_id: string;
  child_id: string;
  week_start: string;
  task_summary: unknown | null;
  motivation_observation: string | null;
  ai_suggestions: unknown | null;
  parent_praise_sent: boolean;
  praise_content: string | null;
  task_adjustments: unknown | null;
  created_at: string;
};

export type MonthlyReport = {
  id: string;
  family_id: string;
  child_id: string;
  month: string;
  growth_summary: string | null;
  parent_reflection: unknown | null;
  meeting_agenda: unknown | null;
  created_at: string;
};

export type CreditLog = {
  id: string;
  child_id: string;
  month: string;
  flagged_count: number;
  repair_task_completed: boolean;
  current_score: number;
  updated_at: string;
};

export type InterventionLog = {
  id: string;
  family_id: string;
  child_id: string;
  parent_id: string | null;
  task_id: string | null;
  task_name_snapshot: string | null;
  override_id: string | null;
  correlation_id: string | null;
  event_type: string;
  trigger_source: string;
  ai_suggested: unknown | null;
  parent_decision: unknown | null;
  context_snapshot: unknown | null;
  created_at: string;
};

export type SiblingRelation = {
  id: string;
  family_id: string;
  mentor_child_id: string;
  mentee_child_id: string;
  is_active: boolean;
  created_at: string;
};

export type RedemptionRequest = {
  id: string;
  family_id: string;
  child_id: string;
  name: string;
  description: string | null;
  coin_cost: number;
  status: RedemptionStatus;
  ai_verdict: AiVerdict | null;
  ai_reason: string | null;
  ai_suggested_coins: number | null;
  adjusted_coins: number | null;
  parent_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type GrowthMoment = {
  id: string;
  child_id: string;
  title: string;
  body: string | null;
  created_at: string;
};

export type ParentObservation = {
  id: string;
  parent_id: string | null;
  task_id: string;
  child_id: string;
  obs_type: ObsType;
  note: string | null;
  reward_adj: string | null;
  created_at: string;
};

export type CustomTask = {
  name: string;
  category: 'B' | 'C';
  base_time_min: number;
  difficulty: number;
  time_saving_min: number;
};

export type SystemTaskTemplate = {
  id: string;
  name: string;
  category: TaskCategory;
  age_group: AgeGroup;
  base_time_min: number;
  difficulty: number;
  time_saving_min: number;
  sort_order: number;
  created_at: string;
};

export type ChildTask = {
  id: string;
  child_id: string;
  task_id: string;
  is_active: boolean;
  created_at: string;
};

// ── 預設任務抽屜的持久化子表（20260728000000_task_drawer_persistence_v1）──
//
// 這些是 application-level 型別，不是 Supabase CLI 產生的。
// 專案沒有提交 generated types（本檔全部手寫），所以照現有慣例補在這裡。

/** 任務目前生效的選項答案。更新採同一交易內 replace，歷史走 task_change_events。 */
export type TaskPresetSelection = {
  id: string;
  task_id: string;
  option_group_id: string;
  option_id: string;
  custom_value: string | null;
  created_at: string;
};

export type TaskPlanMilestone = {
  id: string;
  task_id: string;
  long_term_goal_id: string | null;
  title: string;
  target_day: number | null;
  sort_order: number;
  created_at: string;
};

export type TaskPlanSupportStep = {
  id: string;
  task_id: string;
  long_term_goal_id: string | null;
  text: string;
  sort_order: number;
  is_custom: boolean;
  created_at: string;
};

export type TaskRoleResponsibility = {
  id: string;
  task_id: string;
  long_term_goal_id: string | null;
  text: string;
  sort_order: number;
  is_custom: boolean;
  created_at: string;
};

/** append-only 稽核。snapshot 是當下的命令摘要，不是現況查詢來源。 */
export type TaskChangeEvent = {
  id: string;
  task_id: string;
  event_type:
    | 'created_from_preset'
    | 'created_parent_custom'
    | 'created_from_child_proposal'
    | 'updated_from_preset'
    | 'archived';
  actor_user_id: string | null;
  task_policy_version: string | null;
  reward_policy_version: string | null;
  command_schema_version: number | null;
  snapshot: unknown | null;
  created_at: string;
};

/** create_parent_task_v1 的回傳形狀（jsonb）。 */
export type CreateParentTaskRpcResult =
  | { ok: true; taskId: string; relatedIds: string[] | null }
  | {
      ok: false;
      code: 'VALIDATION_FAILED' | 'POLICY_REJECTED' | 'PERSISTENCE_FAILED' | 'UNKNOWN';
      message: string;
    };

// ── 孩子提案 / 版本契約（P0-1）────────────────────────────────
//
// 實際定義在 src/lib/childProposal/types.ts —— 那裡同時放著命令、
// 狀態機與 RPC 結果型別，一起讀才看得懂欄位的意義。
// 這裡 re-export 是為了讓「DB row 型別從 types/database 拿」這個
// 既有慣例維持成立，不必記住哪幾張表是例外。

export type {
  ChildProposal,
  ChildProposalPlanVersion,
  ChildProposalTrialEvent,
  ChildProposalAdjustmentRequest,
  ChildProposalStatusEvent,
  ChildProposalStatus,
  ChildProposalActorRole,
  ChildProposalSource,
  ChildProposalCadenceMode,
  ChildRewardPreference,
  ChildProposalRewardPolicy,
  ChildProposalRewardEligibility,
  ChildProposalPlanAuthor,
  ChildProposalTrialOutcome,
  ChildProposalAdjustmentKind,
  ChildProposalAdjustmentStatus,
} from '../lib/childProposal/types';

// ── Database 型別（供 createClient<Database> 使用）────────────
//
// supabase-js v2 的 GenericTable 要求每個 table 必須包含：
//   Row / Insert / Update / Relationships
// 缺少 Relationships 會導致 Insert 型別退化成 never。
//
// Insert 規則：有 SQL 預設值的欄位設為 optional（?），
// NOT NULL 且無預設值的欄位設為 required。

export interface Database {
  public: {
    Tables: {
      families: {
        Row: Family;
        Insert: {
          id?: string;
          family_name: string;
          timezone?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          family_name?: string;
          timezone?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      parents: {
        Row: Parent;
        Insert: {
          id?: string;
          family_id: string;
          user_id?: string | null;
          name: string;
          email?: string | null;
          phone?: string | null;
          role?: ParentRole;
          baumrind_type?: BaumrindType | null;
          ai_mode?: AiMode;
          weekly_time_min?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          user_id?: string | null;
          name?: string;
          email?: string | null;
          phone?: string | null;
          role?: ParentRole;
          baumrind_type?: BaumrindType | null;
          ai_mode?: AiMode;
          weekly_time_min?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      children: {
        Row: Child;
        Insert: {
          id?: string;
          family_id: string;
          nickname: string;
          birth_date: string;
          age_group: AgeGroup;
          account_type?: AccountType;
          pin_code?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          nickname?: string;
          birth_date?: string;
          age_group?: AgeGroup;
          account_type?: AccountType;
          pin_code?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      child_profiles: {
        Row: ChildProfile;
        Insert: {
          id?: string;
          child_id: string;
          motivation_level?: MotivationLevel;
          personality_type?: PersonalityType | null;
          interest_tags?: string[] | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          child_id?: string;
          motivation_level?: MotivationLevel;
          personality_type?: PersonalityType | null;
          interest_tags?: string[] | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: Task;
        Insert: {
          id?: string;
          family_id: string;
          name: string;
          category: TaskCategory;
          day_type?: DayType;
          long_term_type?: LongTermType | null;
          is_long_term?: boolean;
          base_time_min?: number;
          difficulty?: number;
          coin_override?: number | null;
          is_system_default?: boolean;
          allow_repeat?: boolean;
          claim_period?: 'day' | 'week';
          max_claims_per_period?: number;
          min_age?: number;
          max_age?: number;
          is_active?: boolean;
          time_saving_min?: number;
          recurrence_days?: number[] | null;
          due_date?: string | null;
          created_at?: string;
        };
        Update: Partial<Task>;
        Relationships: [];
      };
      task_completions: {
        Row: TaskCompletion;
        Insert: {
          id?: string;
          task_id: string;
          child_id: string;
          completed_at?: string;
          reported_at?: string;
          reported_by?: ReportedBy;
          status?: CompletionStatus;
          coin_earned?: number;
          time_saved_min?: number;
          mentor_child_id?: string | null;
          override_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          child_id?: string;
          completed_at?: string;
          reported_at?: string;
          reported_by?: ReportedBy;
          status?: CompletionStatus;
          coin_earned?: number;
          time_saved_min?: number;
          mentor_child_id?: string | null;
          override_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      overrides: {
        Row: Override;
        Insert: {
          id?: string;
          completion_id: string;
          parent_id: string;
          override_type: OverrideType;
          coin_deducted?: number;
          credit_flag?: boolean;
          reason?: string | null;
          created_at?: string;
        };
        Update: Partial<Override>;
        Relationships: [];
      };
      wallets: {
        Row: Wallet;
        Insert: {
          id?: string;
          child_id: string;
          wallet_type: WalletType;
          balance?: number;
          interest_rate?: number;
          last_interest_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          child_id?: string;
          wallet_type?: WalletType;
          balance?: number;
          interest_rate?: number;
          last_interest_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: Transaction;
        Insert: {
          id?: string;
          wallet_id: string;
          amount: number;
          type: TransactionType;
          reference_id?: string | null;
          reference_type?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      reward_items: {
        Row: RewardItem;
        Insert: {
          id?: string;
          family_id: string;
          child_id?: string | null;
          name: string;
          reward_type: RewardType;
          coin_cost: number;
          added_by: RewardAddedBy;
          parent_approved?: boolean;
          is_active?: boolean;
          is_redeemed?: boolean;
          redeemed_at?: string | null;
          created_at?: string;
          child_reason?: string | null;
          ai_summary?: string | null;
          ai_suggested_coins?: number | null;
          confirm_needed?: string[];
          parent_note?: string | null;
        };
        Update: Partial<RewardItem>;
        Relationships: [];
      };
      long_term_goals: {
        Row: LongTermGoal;
        Insert: {
          id?: string;
          child_id: string;
          task_id: string;
          goal_type: LongTermType;
          total_days?: number | null;
          current_day?: number;
          status?: GoalStatus;
          checkpoint_rewards?: CheckpointRewards | null;
          motivation_note?: string | null;
          started_at?: string;
          next_review_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          min_age?: number;
          interrupt_count?: number;
          last_active_date?: string | null;
          active_days?: number[] | null;
          level_definitions?: Record<string, any>[] | null;
          current_level?: number | null;
          level_count?: number | null;
          role_title?: string | null;
          salary_mode?: boolean | null;
          base_salary?: number | null;
          weekly_target_rate?: number | null;
          privilege_reward?: Record<string, any> | null;
          family_time_per_completion?: number | null;
          target_completions?: number | null;
          target_value?: number | null;
          current_value?: number | null;
          value_unit?: string | null;
        };
        Update: Partial<LongTermGoal>;
        Relationships: [];
      };
      time_savings: {
        Row: TimeSaving;
        Insert: {
          id?: string;
          child_id: string;
          completion_id: string;
          minutes_saved: number;
          pool_type?: PoolType;
          is_redeemed?: boolean;
          redeemed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<TimeSaving>;
        Relationships: [];
      };
      weekly_reports: {
        Row: WeeklyReport;
        Insert: {
          id?: string;
          family_id: string;
          child_id: string;
          week_start: string;
          task_summary?: unknown | null;
          motivation_observation?: string | null;
          ai_suggestions?: unknown | null;
          parent_praise_sent?: boolean;
          praise_content?: string | null;
          task_adjustments?: unknown | null;
          created_at?: string;
        };
        Update: Partial<WeeklyReport>;
        Relationships: [];
      };
      monthly_reports: {
        Row: MonthlyReport;
        Insert: {
          id?: string;
          family_id: string;
          child_id: string;
          month: string;
          growth_summary?: string | null;
          parent_reflection?: unknown | null;
          meeting_agenda?: unknown | null;
          created_at?: string;
        };
        Update: Partial<MonthlyReport>;
        Relationships: [];
      };
      credit_logs: {
        Row: CreditLog;
        Insert: {
          id?: string;
          child_id: string;
          month: string;
          flagged_count?: number;
          repair_task_completed?: boolean;
          current_score?: number;
          updated_at?: string;
        };
        Update: Partial<CreditLog>;
        Relationships: [];
      };
      intervention_log: {
        Row: InterventionLog;
        Insert: {
          id?: string;
          family_id: string;
          child_id: string;
          parent_id?: string | null;
          task_id?: string | null;
          task_name_snapshot?: string | null;
          override_id?: string | null;
          correlation_id?: string | null;
          event_type: string;
          trigger_source: string;
          ai_suggested?: unknown | null;
          parent_decision?: unknown | null;
          context_snapshot?: unknown | null;
          created_at?: string;
        };
        Update: Partial<InterventionLog>;
        Relationships: [];
      };
      sibling_relations: {
        Row: SiblingRelation;
        Insert: {
          id?: string;
          family_id: string;
          mentor_child_id: string;
          mentee_child_id: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<SiblingRelation>;
        Relationships: [];
      };
      system_task_templates: {
        Row: SystemTaskTemplate;
        Insert: {
          id?: string;
          name: string;
          category: TaskCategory;
          age_group: AgeGroup;
          base_time_min?: number;
          difficulty?: number;
          time_saving_min?: number;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<SystemTaskTemplate>;
        Relationships: [];
      };
      child_tasks: {
        Row: ChildTask;
        Insert: {
          id?: string;
          child_id: string;
          task_id: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          child_id?: string;
          task_id?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      redemption_requests: {
        Row: RedemptionRequest;
        Insert: {
          id?: string;
          family_id: string;
          child_id: string;
          name: string;
          description?: string | null;
          coin_cost: number;
          status?: RedemptionStatus;
          ai_verdict?: AiVerdict | null;
          ai_reason?: string | null;
          ai_suggested_coins?: number | null;
          adjusted_coins?: number | null;
          parent_note?: string | null;
          created_at?: string;
          reviewed_at?: string | null;
        };
        Update: {
          status?: RedemptionStatus;
          ai_verdict?: AiVerdict | null;
          ai_reason?: string | null;
          ai_suggested_coins?: number | null;
          adjusted_coins?: number | null;
          parent_note?: string | null;
          reviewed_at?: string | null;
        };
        Relationships: [];
      };
      growth_moments: {
        Row: GrowthMoment;
        Insert: {
          id?: string;
          child_id: string;
          title: string;
          body?: string | null;
          created_at?: string;
        };
        Update: {
          title?: string;
          body?: string | null;
        };
        Relationships: [];
      };
      parent_observations: {
        Row: ParentObservation;
        Insert: {
          id?: string;
          parent_id?: string | null;
          task_id: string;
          child_id: string;
          obs_type: ObsType;
          note?: string | null;
          reward_adj?: string | null;
          created_at?: string;
        };
        Update: Partial<ParentObservation>;
        Relationships: [];
      };
      task_preset_selections: {
        Row: TaskPresetSelection;
        Insert: {
          id?: string;
          task_id: string;
          option_group_id: string;
          option_id: string;
          custom_value?: string | null;
          created_at?: string;
        };
        Update: Partial<TaskPresetSelection>;
        Relationships: [];
      };
      task_plan_milestones: {
        Row: TaskPlanMilestone;
        Insert: {
          id?: string;
          task_id: string;
          long_term_goal_id?: string | null;
          title: string;
          target_day?: number | null;
          sort_order: number;
          created_at?: string;
        };
        Update: Partial<TaskPlanMilestone>;
        Relationships: [];
      };
      task_plan_support_steps: {
        Row: TaskPlanSupportStep;
        Insert: {
          id?: string;
          task_id: string;
          long_term_goal_id?: string | null;
          text: string;
          sort_order: number;
          is_custom?: boolean;
          created_at?: string;
        };
        Update: Partial<TaskPlanSupportStep>;
        Relationships: [];
      };
      task_role_responsibilities: {
        Row: TaskRoleResponsibility;
        Insert: {
          id?: string;
          task_id: string;
          long_term_goal_id?: string | null;
          text: string;
          sort_order: number;
          is_custom?: boolean;
          created_at?: string;
        };
        Update: Partial<TaskRoleResponsibility>;
        Relationships: [];
      };
      task_change_events: {
        Row: TaskChangeEvent;
        // client 沒有 INSERT policy —— 只有 SECURITY DEFINER 函式寫得進去。
        Insert: never;
        Update: never;
        Relationships: [];
      };

      // ── 孩子提案 / 版本契約（P0-1，migration 20260810000000）────────────
      //
      // 五張表都只有 SELECT policy —— 寫入一律走 child proposal 的
      // SECURITY DEFINER RPC（見 src/lib/childProposal）。所以 Insert 與
      // Update 一律是 never：型別層直接擋掉「順手 supabase.from().insert()」，
      // 那條路徑會繞過狀態機與所有 actor 檢查。
      child_proposals: {
        Row: ChildProposal;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      child_proposal_plan_versions: {
        Row: ChildProposalPlanVersion;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      child_proposal_trial_events: {
        Row: ChildProposalTrialEvent;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      child_proposal_adjustment_requests: {
        Row: ChildProposalAdjustmentRequest;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      child_proposal_status_events: {
        Row: ChildProposalStatusEvent;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_age_group: {
        Args: { birth_date: string };
        Returns: string;
      };
      calc_task_coin: {
        Args: { base_time_min: number; difficulty: number; coin_override: number | null };
        Returns: number;
      };
      complete_task: {
        Args: {
          p_task_id: string;
          p_child_id: string;
          p_completed_at: string;
          p_is_prerequisite_met: boolean;
          p_goal_id?: string | null;
        };
        Returns: {
          error?: string;
          completionId?: string;
          /** 這一次完成**實際 mint** 的成長幣。只記 progress 時是 0。 */
          coinEarned?: number;
          timeSavedMin?: number;
          payoutBasis?: PayoutBasisValue | null;
          /** 遇到 Phase 2 才實作的 basis：只記了 progress，沒有發幣。 */
          payoutBasisUnsupported?: boolean;
          /** per_period 任務的本期進度。null = 不是 per_period 或還沒生效。 */
          period?: {
            start: string;
            done: number;
            target: number | null;
            settled: boolean;
          } | null;
          /** 這一次完成有沒有形成 reward event。null = 只是 progress。 */
          settlement?: { basis: PayoutBasisValue; coinAmount: number } | null;
          milestone?: { goalId: string; day: number; coinReward: number } | null;
        };
      };
      parent_complete_task_for_child_v1: {
        Args: {
          p_task_id: string;
          p_child_id: string;
          p_completed_at: string;
          p_coin_amount: number;
          p_time_saved_min: number;
        };
        Returns: {
          error?: string;
          completionId?: string;
          coinEarned?: number;
          /** 新語意任務：家長輸入的金額被忽略，幣值由 payout_basis 結算。 */
          coinInputIgnored?: boolean;
        };
      };
      redeem_wish: {
        Args: { p_child_id: string; p_item_id: string; p_cost: number };
        Returns: { ok?: boolean; error?: string };
      };
      settle_weekly_interest: {
        Args: Record<string, never>;
        Returns: {
          ok: boolean;
          walletsPaid: number;
          walletsZeroInterest: number;
          totalInterest: number;
          settledAt: string;
        };
      };
      my_family_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      my_parent_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      create_parent_task_v1: {
        // 整個命令用單一 jsonb 傳，欄位還會長；拆成命名參數之後每次加欄位都要改簽章。
        // 實際形狀是 taskDrawer/taskPersistence 的 CreateParentTaskCommand，
        // 那是 domain contract，刻意不從 types/database.ts 反向 import。
        Args: { p_command: object };
        Returns: CreateParentTaskRpcResult;
      };
      confirm_child_proposal_v1: {
        Args: { p_command: object };
        Returns: ConfirmChildProposalResult;
      };
      revise_child_proposal_plan_v1: {
        Args: { p_command: object };
        Returns: ReviseChildProposalResult;
      };
      accept_child_proposal_plan_v1: {
        Args: { p_command: object };
        Returns: AcceptChildProposalResult;
      };
      request_child_proposal_changes_v1: {
        Args: { p_command: object };
        Returns: RequestChildProposalChangesResult;
      };
      close_child_proposal_unsuitable_v1: {
        Args: { p_command: object };
        Returns: CloseChildProposalResult;
      };
      // ── 進行中共同計畫的時段調整（P0-8M）──────────────────────────
      accept_child_proposal_adjustment_v1: {
        Args: { p_command: object };
        Returns: AcceptAdjustmentResult;
      };
      decline_child_proposal_adjustment_v1: {
        Args: { p_command: object };
        Returns: DeclineAdjustmentResult;
      };
      // ── 孩子提案 / 版本契約（P0-1）────────────────────────────────
      //
      // 五支都是 jsonb 命令進、jsonb 結果出，與 create_parent_task_v1 同一套慣例。
      // 結果型別是 unknown：實際形狀在 src/lib/childProposal/types.ts，
      // 而 childProposalService 會逐鍵驗證再回傳結構化結果 ——
      // 在這裡宣告成功形狀等於允許呼叫端跳過那層驗證。
      create_child_proposal_v1: {
        Args: { p_command: object };
        Returns: unknown;
      };
      add_child_proposal_plan_version_v1: {
        Args: { p_command: object };
        Returns: unknown;
      };
      transition_child_proposal_v1: {
        Args: { p_command: object };
        Returns: unknown;
      };
      record_child_proposal_trial_v1: {
        Args: { p_command: object };
        Returns: unknown;
      };
      create_child_proposal_adjustment_request_v1: {
        Args: { p_command: object };
        Returns: unknown;
      };
      child_proposal_transition_allowed: {
        Args: { p_from: string; p_to: string; p_actor_role?: string | null };
        Returns: boolean;
      };
      // P1-A2：孩子的目標規劃對話。與 Plan Version 是兩條線。
      start_child_goal_planning_session_v1: {
        Args: { p_command: object };
        Returns: unknown;
      };
      record_child_goal_planning_round_v1: {
        Args: { p_command: object };
        Returns: unknown;
      };
      confirm_child_goal_planning_session_v1: {
        Args: { p_command: object };
        Returns: unknown;
      };
      // 放棄規劃 ＋ draft → proposed，同一個交易。
      submit_child_proposal_without_planning_v1: {
        Args: { p_command: object };
        Returns: unknown;
      };
      mark_task_atomic: {
        Args: {
          p_task_id: string;
          p_child_id: string;
          p_override_type: 'partial' | 'none' | 'renegotiate';
          p_adjusted_coin: number;
          p_note?: string | null;
        };
        Returns: { completionId: string; overrideId: string; coinEarned: number };
      };
      review_redemption_request: {
        Args: {
          p_request_id: string;
          p_decision: 'approve' | 'reject';
          p_adjusted_coins?: number | null;
          p_parent_note?: string | null;
        };
        Returns: { ok?: boolean; error?: string; status?: string; finalCoins?: number };
      };
      record_completion_context: {
        Args: {
          p_completion_id: string;
          p_planned_time_window: PreferredTimeWindow;
          p_start_mode: CompletionStartMode | null;
        };
        Returns: { ok: boolean };
      };
      submit_onboarding: {
        Args: {
          p_family_name: string;
          p_parent_name: string;
          p_baumrind_type: string;
          p_child_nickname: string;
          p_child_birth_date: string;
          p_child_age_group: string;
          p_child_account_type: string;
          p_child_pin?: string | null;
        };
        Returns: { familyId: string; childId: string };
      };
      setup_child_tasks: {
        Args: {
          p_family_id: string;
          p_child_id: string;
          p_template_ids: string[];
          p_custom_tasks?: CustomTask[];
          p_reward_name: string;
          p_coin_cost: number;
        };
        Returns: undefined;
      };
      update_task_schedule: {
        Args: {
          p_task_id: string;
          p_claim_period: 'day' | 'week' | 'once';
          p_max_claims_per_period: number;
        };
        Returns: { error?: string; taskId?: string; claimPeriod?: string; maxClaimsPerPeriod?: number };
      };
      update_task_recurrence_days: {
        Args: {
          p_task_id: string;
          p_recurrence_days: number[];
        };
        Returns: { error?: string; taskId?: string; recurrenceDays?: number[] };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type CreateFamilyGoalInput = {
  familyId: string;
  childId: string;
  name: string;
  activeDays: number[];     // 有效完成日，0=日~6=六
  timeMin: number;          // 每次完成記入時間存摺的分鐘數
  commitWeeks: number;      // 承諾週數
};
