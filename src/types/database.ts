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

/** Maps day-number (as string key) to coin reward. E.g. {"7": 20, "14": 40, "21": 80} */
export type CheckpointRewards = Record<string, number>;

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
};

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
  created_at: string;
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
  next_review_at: string | null;
  completed_at: string | null;
  created_at: string;
  // 通用
  min_age: number;
  interrupt_count: number;
  last_active_date: string | null;
  active_days: number[] | null;     // 0=日,1=一,...,6=六; null=every day
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
          created_at?: string;
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
      settle_weekly_interest: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      my_family_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      my_parent_id: {
        Args: Record<string, never>;
        Returns: string;
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
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
