export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      child_profiles: {
        Row: {
          child_id: string
          id: string
          interest_tags: string[] | null
          motivation_level: string
          personality_type: string | null
          updated_at: string
        }
        Insert: {
          child_id: string
          id?: string
          interest_tags?: string[] | null
          motivation_level?: string
          personality_type?: string | null
          updated_at?: string
        }
        Update: {
          child_id?: string
          id?: string
          interest_tags?: string[] | null
          motivation_level?: string
          personality_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_profiles_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: true
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      child_tasks: {
        Row: {
          child_id: string
          created_at: string | null
          id: string
          is_active: boolean
          task_id: string
        }
        Insert: {
          child_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          task_id: string
        }
        Update: {
          child_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_tasks_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      children: {
        Row: {
          account_type: string
          age_group: string
          birth_date: string
          created_at: string
          family_id: string
          id: string
          nickname: string
          pin_code: string | null
        }
        Insert: {
          account_type?: string
          age_group: string
          birth_date: string
          created_at?: string
          family_id: string
          id?: string
          nickname: string
          pin_code?: string | null
        }
        Update: {
          account_type?: string
          age_group?: string
          birth_date?: string
          created_at?: string
          family_id?: string
          id?: string
          nickname?: string
          pin_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "children_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_logs: {
        Row: {
          child_id: string
          current_score: number
          flagged_count: number
          id: string
          month: string
          repair_task_completed: boolean
          updated_at: string
        }
        Insert: {
          child_id: string
          current_score?: number
          flagged_count?: number
          id?: string
          month: string
          repair_task_completed?: boolean
          updated_at?: string
        }
        Update: {
          child_id?: string
          current_score?: number
          flagged_count?: number
          id?: string
          month?: string
          repair_task_completed?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_logs_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          created_at: string
          created_by: string | null
          family_name: string
          id: string
          timezone: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          family_name: string
          id?: string
          timezone?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          family_name?: string
          id?: string
          timezone?: string
        }
        Relationships: []
      }
      growth_moments: {
        Row: {
          body: string | null
          child_id: string
          created_at: string
          id: string
          title: string
        }
        Insert: {
          body?: string | null
          child_id: string
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          body?: string | null
          child_id?: string
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_moments_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      intervention_log: {
        Row: {
          ai_suggested: Json | null
          child_id: string
          context_snapshot: Json | null
          correlation_id: string | null
          created_at: string
          event_type: string
          family_id: string
          id: string
          override_id: string | null
          parent_decision: Json | null
          parent_id: string | null
          task_id: string | null
          task_name_snapshot: string | null
          trigger_source: string
        }
        Insert: {
          ai_suggested?: Json | null
          child_id: string
          context_snapshot?: Json | null
          correlation_id?: string | null
          created_at?: string
          event_type: string
          family_id: string
          id?: string
          override_id?: string | null
          parent_decision?: Json | null
          parent_id?: string | null
          task_id?: string | null
          task_name_snapshot?: string | null
          trigger_source: string
        }
        Update: {
          ai_suggested?: Json | null
          child_id?: string
          context_snapshot?: Json | null
          correlation_id?: string | null
          created_at?: string
          event_type?: string
          family_id?: string
          id?: string
          override_id?: string | null
          parent_decision?: Json | null
          parent_id?: string | null
          task_id?: string | null
          task_name_snapshot?: string | null
          trigger_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "intervention_log_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intervention_log_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intervention_log_override_id_fkey"
            columns: ["override_id"]
            isOneToOne: false
            referencedRelation: "overrides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intervention_log_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intervention_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      long_term_goals: {
        Row: {
          active_days: number[] | null
          base_salary: number | null
          checkpoint_rewards: Json | null
          child_id: string
          completed_at: string | null
          created_at: string
          current_day: number
          current_level: number | null
          current_value: number | null
          end_date: string | null
          family_time_per_completion: number | null
          first_review_after_days: number | null
          goal_type: string
          id: string
          interrupt_count: number | null
          last_active_date: string | null
          level_count: number | null
          level_definitions: Json | null
          min_age: number | null
          motivation_note: string | null
          next_review_at: string | null
          preferred_time_window: string | null
          privilege_reward: Json | null
          role_title: string | null
          salary_mode: boolean | null
          started_at: string
          status: string
          target_completions: number | null
          target_value: number | null
          task_id: string
          total_days: number | null
          value_unit: string | null
          weekend_review_enabled: boolean | null
          weekly_target_rate: number | null
        }
        Insert: {
          active_days?: number[] | null
          base_salary?: number | null
          checkpoint_rewards?: Json | null
          child_id: string
          completed_at?: string | null
          created_at?: string
          current_day?: number
          current_level?: number | null
          current_value?: number | null
          end_date?: string | null
          family_time_per_completion?: number | null
          first_review_after_days?: number | null
          goal_type: string
          id?: string
          interrupt_count?: number | null
          last_active_date?: string | null
          level_count?: number | null
          level_definitions?: Json | null
          min_age?: number | null
          motivation_note?: string | null
          next_review_at?: string | null
          preferred_time_window?: string | null
          privilege_reward?: Json | null
          role_title?: string | null
          salary_mode?: boolean | null
          started_at?: string
          status?: string
          target_completions?: number | null
          target_value?: number | null
          task_id: string
          total_days?: number | null
          value_unit?: string | null
          weekend_review_enabled?: boolean | null
          weekly_target_rate?: number | null
        }
        Update: {
          active_days?: number[] | null
          base_salary?: number | null
          checkpoint_rewards?: Json | null
          child_id?: string
          completed_at?: string | null
          created_at?: string
          current_day?: number
          current_level?: number | null
          current_value?: number | null
          end_date?: string | null
          family_time_per_completion?: number | null
          first_review_after_days?: number | null
          goal_type?: string
          id?: string
          interrupt_count?: number | null
          last_active_date?: string | null
          level_count?: number | null
          level_definitions?: Json | null
          min_age?: number | null
          motivation_note?: string | null
          next_review_at?: string | null
          preferred_time_window?: string | null
          privilege_reward?: Json | null
          role_title?: string | null
          salary_mode?: boolean | null
          started_at?: string
          status?: string
          target_completions?: number | null
          target_value?: number | null
          task_id?: string
          total_days?: number | null
          value_unit?: string | null
          weekend_review_enabled?: boolean | null
          weekly_target_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "long_term_goals_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "long_term_goals_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_reports: {
        Row: {
          child_id: string
          created_at: string
          family_id: string
          growth_summary: string | null
          id: string
          meeting_agenda: Json | null
          month: string
          parent_reflection: Json | null
        }
        Insert: {
          child_id: string
          created_at?: string
          family_id: string
          growth_summary?: string | null
          id?: string
          meeting_agenda?: Json | null
          month: string
          parent_reflection?: Json | null
        }
        Update: {
          child_id?: string
          created_at?: string
          family_id?: string
          growth_summary?: string | null
          id?: string
          meeting_agenda?: Json | null
          month?: string
          parent_reflection?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "monthly_reports_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_reports_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      overrides: {
        Row: {
          coin_deducted: number
          completion_id: string
          created_at: string
          credit_flag: boolean
          id: string
          override_type: string
          parent_id: string
          reason: string | null
        }
        Insert: {
          coin_deducted?: number
          completion_id: string
          created_at?: string
          credit_flag?: boolean
          id?: string
          override_type: string
          parent_id: string
          reason?: string | null
        }
        Update: {
          coin_deducted?: number
          completion_id?: string
          created_at?: string
          credit_flag?: boolean
          id?: string
          override_type?: string
          parent_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "overrides_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "task_completions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overrides_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_observations: {
        Row: {
          child_id: string
          created_at: string
          id: string
          note: string | null
          obs_type: string
          parent_id: string | null
          reward_adj: string | null
          task_id: string
        }
        Insert: {
          child_id: string
          created_at?: string
          id?: string
          note?: string | null
          obs_type: string
          parent_id?: string | null
          reward_adj?: string | null
          task_id: string
        }
        Update: {
          child_id?: string
          created_at?: string
          id?: string
          note?: string | null
          obs_type?: string
          parent_id?: string | null
          reward_adj?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_observations_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_observations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      parents: {
        Row: {
          ai_mode: string
          baumrind_type: string | null
          created_at: string
          email: string | null
          family_id: string
          id: string
          name: string
          phone: string | null
          role: string
          user_id: string | null
          weekly_time_min: number
        }
        Insert: {
          ai_mode?: string
          baumrind_type?: string | null
          created_at?: string
          email?: string | null
          family_id: string
          id?: string
          name: string
          phone?: string | null
          role?: string
          user_id?: string | null
          weekly_time_min?: number
        }
        Update: {
          ai_mode?: string
          baumrind_type?: string | null
          created_at?: string
          email?: string | null
          family_id?: string
          id?: string
          name?: string
          phone?: string | null
          role?: string
          user_id?: string | null
          weekly_time_min?: number
        }
        Relationships: [
          {
            foreignKeyName: "parents_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      redemption_requests: {
        Row: {
          adjusted_coins: number | null
          ai_reason: string | null
          ai_suggested_coins: number | null
          ai_verdict: string | null
          child_id: string
          coin_cost: number
          created_at: string
          description: string | null
          family_id: string
          id: string
          name: string
          parent_note: string | null
          reviewed_at: string | null
          status: string
        }
        Insert: {
          adjusted_coins?: number | null
          ai_reason?: string | null
          ai_suggested_coins?: number | null
          ai_verdict?: string | null
          child_id: string
          coin_cost: number
          created_at?: string
          description?: string | null
          family_id: string
          id?: string
          name: string
          parent_note?: string | null
          reviewed_at?: string | null
          status?: string
        }
        Update: {
          adjusted_coins?: number | null
          ai_reason?: string | null
          ai_suggested_coins?: number | null
          ai_verdict?: string | null
          child_id?: string
          coin_cost?: number
          created_at?: string
          description?: string | null
          family_id?: string
          id?: string
          name?: string
          parent_note?: string | null
          reviewed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "redemption_requests_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemption_requests_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_items: {
        Row: {
          added_by: string
          child_id: string | null
          coin_cost: number
          created_at: string
          family_id: string
          id: string
          is_active: boolean
          is_redeemed: boolean
          name: string
          parent_approved: boolean
          redeemed_at: string | null
          reward_type: string
        }
        Insert: {
          added_by: string
          child_id?: string | null
          coin_cost: number
          created_at?: string
          family_id: string
          id?: string
          is_active?: boolean
          is_redeemed?: boolean
          name: string
          parent_approved?: boolean
          redeemed_at?: string | null
          reward_type: string
        }
        Update: {
          added_by?: string
          child_id?: string | null
          coin_cost?: number
          created_at?: string
          family_id?: string
          id?: string
          is_active?: boolean
          is_redeemed?: boolean
          name?: string
          parent_approved?: boolean
          redeemed_at?: string | null
          reward_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_items_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_items_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      sibling_relations: {
        Row: {
          created_at: string
          family_id: string
          id: string
          is_active: boolean
          mentee_child_id: string
          mentor_child_id: string
        }
        Insert: {
          created_at?: string
          family_id: string
          id?: string
          is_active?: boolean
          mentee_child_id: string
          mentor_child_id: string
        }
        Update: {
          created_at?: string
          family_id?: string
          id?: string
          is_active?: boolean
          mentee_child_id?: string
          mentor_child_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sibling_relations_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sibling_relations_mentee_child_id_fkey"
            columns: ["mentee_child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sibling_relations_mentor_child_id_fkey"
            columns: ["mentor_child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      system_task_templates: {
        Row: {
          age_group: string
          base_time_min: number
          category: string
          created_at: string | null
          difficulty: number
          id: string
          name: string
          sort_order: number
          time_saving_min: number
        }
        Insert: {
          age_group: string
          base_time_min?: number
          category: string
          created_at?: string | null
          difficulty?: number
          id?: string
          name: string
          sort_order?: number
          time_saving_min?: number
        }
        Update: {
          age_group?: string
          base_time_min?: number
          category?: string
          created_at?: string | null
          difficulty?: number
          id?: string
          name?: string
          sort_order?: number
          time_saving_min?: number
        }
        Relationships: []
      }
      task_change_events: {
        Row: {
          actor_user_id: string | null
          command_schema_version: number | null
          created_at: string
          event_type: string
          id: string
          reward_policy_version: string | null
          snapshot: Json | null
          task_id: string
          task_policy_version: string | null
        }
        Insert: {
          actor_user_id?: string | null
          command_schema_version?: number | null
          created_at?: string
          event_type: string
          id?: string
          reward_policy_version?: string | null
          snapshot?: Json | null
          task_id: string
          task_policy_version?: string | null
        }
        Update: {
          actor_user_id?: string | null
          command_schema_version?: number | null
          created_at?: string
          event_type?: string
          id?: string
          reward_policy_version?: string | null
          snapshot?: Json | null
          task_id?: string
          task_policy_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_change_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_completions: {
        Row: {
          child_id: string
          coin_earned: number
          completed_at: string
          created_at: string
          id: string
          mentor_child_id: string | null
          override_id: string | null
          planned_time_window: string | null
          reported_at: string
          reported_by: string
          start_mode: string | null
          status: string
          task_id: string
          time_saved_min: number
        }
        Insert: {
          child_id: string
          coin_earned?: number
          completed_at?: string
          created_at?: string
          id?: string
          mentor_child_id?: string | null
          override_id?: string | null
          planned_time_window?: string | null
          reported_at?: string
          reported_by?: string
          start_mode?: string | null
          status?: string
          task_id: string
          time_saved_min?: number
        }
        Update: {
          child_id?: string
          coin_earned?: number
          completed_at?: string
          created_at?: string
          id?: string
          mentor_child_id?: string | null
          override_id?: string | null
          planned_time_window?: string | null
          reported_at?: string
          reported_by?: string
          start_mode?: string | null
          status?: string
          task_id?: string
          time_saved_min?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_override"
            columns: ["override_id"]
            isOneToOne: false
            referencedRelation: "overrides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_mentor_child_id_fkey"
            columns: ["mentor_child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_plan_milestones: {
        Row: {
          created_at: string
          id: string
          long_term_goal_id: string | null
          sort_order: number
          target_day: number | null
          task_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          long_term_goal_id?: string | null
          sort_order: number
          target_day?: number | null
          task_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          long_term_goal_id?: string | null
          sort_order?: number
          target_day?: number | null
          task_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_plan_milestones_long_term_goal_id_fkey"
            columns: ["long_term_goal_id"]
            isOneToOne: false
            referencedRelation: "long_term_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_plan_milestones_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_plan_support_steps: {
        Row: {
          created_at: string
          id: string
          is_custom: boolean
          long_term_goal_id: string | null
          sort_order: number
          task_id: string
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_custom?: boolean
          long_term_goal_id?: string | null
          sort_order: number
          task_id: string
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          is_custom?: boolean
          long_term_goal_id?: string | null
          sort_order?: number
          task_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_plan_support_steps_long_term_goal_id_fkey"
            columns: ["long_term_goal_id"]
            isOneToOne: false
            referencedRelation: "long_term_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_plan_support_steps_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_preset_selections: {
        Row: {
          created_at: string
          custom_value: string | null
          id: string
          option_group_id: string
          option_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          custom_value?: string | null
          id?: string
          option_group_id: string
          option_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          custom_value?: string | null
          id?: string
          option_group_id?: string
          option_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_preset_selections_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_role_responsibilities: {
        Row: {
          created_at: string
          id: string
          is_custom: boolean
          long_term_goal_id: string | null
          sort_order: number
          task_id: string
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_custom?: boolean
          long_term_goal_id?: string | null
          sort_order: number
          task_id: string
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          is_custom?: boolean
          long_term_goal_id?: string | null
          sort_order?: number
          task_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_role_responsibilities_long_term_goal_id_fkey"
            columns: ["long_term_goal_id"]
            isOneToOne: false
            referencedRelation: "long_term_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_role_responsibilities_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          allow_repeat: boolean
          base_time_min: number
          category: string
          claim_period: string
          coin_override: number | null
          command_schema_version: number | null
          completion_description: string | null
          completion_policy: string | null
          created_at: string
          created_from_preset: boolean
          creation_request_id: string | null
          day_type: string
          difficulty: number
          due_date: string | null
          duration_type: string | null
          estimated_minutes: number | null
          family_id: string
          id: string
          is_active: boolean
          is_long_term: boolean
          is_system_default: boolean
          long_term_type: string | null
          max_age: number
          max_claims_per_period: number
          min_age: number
          name: string
          notes: string | null
          original_expectation: string | null
          plan_mode: string | null
          preferred_time: string | null
          preferred_time_custom: string | null
          preset_catalog_version: string | null
          preset_family_id: string | null
          preset_variant_id: string | null
          recurrence_days: number[] | null
          review_after_days: number | null
          review_enabled: boolean | null
          reward_coin_amount: number | null
          reward_coin_max: number | null
          reward_coin_min: number | null
          reward_coin_suggested_amount: number | null
          reward_policy: string | null
          reward_policy_version: string | null
          schedule_mode: string | null
          scheduled_date: string | null
          start_date: string | null
          support_level: string | null
          task_details: string | null
          task_policy_version: string | null
          task_source: string | null
          time_saving_min: number
          weekly_frequency: number | null
        }
        Insert: {
          allow_repeat?: boolean
          base_time_min?: number
          category: string
          claim_period?: string
          coin_override?: number | null
          command_schema_version?: number | null
          completion_description?: string | null
          completion_policy?: string | null
          created_at?: string
          created_from_preset?: boolean
          creation_request_id?: string | null
          day_type?: string
          difficulty?: number
          due_date?: string | null
          duration_type?: string | null
          estimated_minutes?: number | null
          family_id: string
          id?: string
          is_active?: boolean
          is_long_term?: boolean
          is_system_default?: boolean
          long_term_type?: string | null
          max_age?: number
          max_claims_per_period?: number
          min_age?: number
          name: string
          notes?: string | null
          original_expectation?: string | null
          plan_mode?: string | null
          preferred_time?: string | null
          preferred_time_custom?: string | null
          preset_catalog_version?: string | null
          preset_family_id?: string | null
          preset_variant_id?: string | null
          recurrence_days?: number[] | null
          review_after_days?: number | null
          review_enabled?: boolean | null
          reward_coin_amount?: number | null
          reward_coin_max?: number | null
          reward_coin_min?: number | null
          reward_coin_suggested_amount?: number | null
          reward_policy?: string | null
          reward_policy_version?: string | null
          schedule_mode?: string | null
          scheduled_date?: string | null
          start_date?: string | null
          support_level?: string | null
          task_details?: string | null
          task_policy_version?: string | null
          task_source?: string | null
          time_saving_min?: number
          weekly_frequency?: number | null
        }
        Update: {
          allow_repeat?: boolean
          base_time_min?: number
          category?: string
          claim_period?: string
          coin_override?: number | null
          command_schema_version?: number | null
          completion_description?: string | null
          completion_policy?: string | null
          created_at?: string
          created_from_preset?: boolean
          creation_request_id?: string | null
          day_type?: string
          difficulty?: number
          due_date?: string | null
          duration_type?: string | null
          estimated_minutes?: number | null
          family_id?: string
          id?: string
          is_active?: boolean
          is_long_term?: boolean
          is_system_default?: boolean
          long_term_type?: string | null
          max_age?: number
          max_claims_per_period?: number
          min_age?: number
          name?: string
          notes?: string | null
          original_expectation?: string | null
          plan_mode?: string | null
          preferred_time?: string | null
          preferred_time_custom?: string | null
          preset_catalog_version?: string | null
          preset_family_id?: string | null
          preset_variant_id?: string | null
          recurrence_days?: number[] | null
          review_after_days?: number | null
          review_enabled?: boolean | null
          reward_coin_amount?: number | null
          reward_coin_max?: number | null
          reward_coin_min?: number | null
          reward_coin_suggested_amount?: number | null
          reward_policy?: string | null
          reward_policy_version?: string | null
          schedule_mode?: string | null
          scheduled_date?: string | null
          start_date?: string | null
          support_level?: string | null
          task_details?: string | null
          task_policy_version?: string | null
          task_source?: string | null
          time_saving_min?: number
          weekly_frequency?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      time_savings: {
        Row: {
          child_id: string
          completion_id: string
          created_at: string
          id: string
          is_redeemed: boolean
          minutes_saved: number
          pool_type: string
          redeemed_at: string | null
        }
        Insert: {
          child_id: string
          completion_id: string
          created_at?: string
          id?: string
          is_redeemed?: boolean
          minutes_saved: number
          pool_type?: string
          redeemed_at?: string | null
        }
        Update: {
          child_id?: string
          completion_id?: string
          created_at?: string
          id?: string
          is_redeemed?: boolean
          minutes_saved?: number
          pool_type?: string
          redeemed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_savings_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_savings_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "task_completions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string | null
          reference_id: string | null
          reference_type: string | null
          type: string
          wallet_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          reference_id?: string | null
          reference_type?: string | null
          type: string
          wallet_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          reference_id?: string | null
          reference_type?: string | null
          type?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          child_id: string
          created_at: string
          id: string
          interest_rate: number
          last_interest_at: string | null
          wallet_type: string
        }
        Insert: {
          balance?: number
          child_id: string
          created_at?: string
          id?: string
          interest_rate?: number
          last_interest_at?: string | null
          wallet_type: string
        }
        Update: {
          balance?: number
          child_id?: string
          created_at?: string
          id?: string
          interest_rate?: number
          last_interest_at?: string | null
          wallet_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_reports: {
        Row: {
          ai_suggestions: Json | null
          child_id: string
          created_at: string
          family_id: string
          id: string
          motivation_observation: string | null
          parent_praise_sent: boolean
          praise_content: string | null
          task_adjustments: Json | null
          task_summary: Json | null
          week_start: string
        }
        Insert: {
          ai_suggestions?: Json | null
          child_id: string
          created_at?: string
          family_id: string
          id?: string
          motivation_observation?: string | null
          parent_praise_sent?: boolean
          praise_content?: string | null
          task_adjustments?: Json | null
          task_summary?: Json | null
          week_start: string
        }
        Update: {
          ai_suggestions?: Json | null
          child_id?: string
          created_at?: string
          family_id?: string
          id?: string
          motivation_observation?: string | null
          parent_praise_sent?: boolean
          praise_content?: string | null
          task_adjustments?: Json | null
          task_summary?: Json | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reports_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calc_task_coin: {
        Args: {
          base_time_min: number
          coin_override: number
          difficulty: number
        }
        Returns: number
      }
      complete_task: {
        Args: {
          p_child_id: string
          p_completed_at: string
          p_goal_id?: string
          p_is_prerequisite_met: boolean
          p_task_id: string
        }
        Returns: Json
      }
      create_parent_task_v1: { Args: { p_command: Json }; Returns: Json }
      get_age_group: { Args: { birth_date: string }; Returns: string }
      map_completion_policy: { Args: { p_policy: string }; Returns: string }
      map_purpose_category: { Args: { p_purpose: string }; Returns: string }
      mark_task_atomic: {
        Args: {
          p_adjusted_coin: number
          p_child_id: string
          p_note?: string
          p_override_type: string
          p_task_id: string
        }
        Returns: Json
      }
      my_family_id: { Args: never; Returns: string }
      my_parent_id: { Args: never; Returns: string }
      preset_task_replay_payload: {
        Args: { p_child_id: string; p_family_id: string; p_request_id: string }
        Returns: Json
      }
      record_completion_context: {
        Args: {
          p_completion_id: string
          p_planned_time_window: string
          p_start_mode: string
        }
        Returns: Json
      }
      redeem_wish: {
        Args: { p_child_id: string; p_cost: number; p_item_id: string }
        Returns: Json
      }
      review_redemption_request: {
        Args: {
          p_adjusted_coins?: number
          p_decision: string
          p_parent_note?: string
          p_request_id: string
        }
        Returns: Json
      }
      settle_weekly_interest: { Args: never; Returns: Json }
      setup_child_tasks: {
        Args: {
          p_child_id: string
          p_coin_cost?: number
          p_custom_tasks?: Json
          p_family_id: string
          p_reward_name?: string
          p_template_ids: string[]
        }
        Returns: undefined
      }
      submit_onboarding: {
        Args: {
          p_baumrind_type: string
          p_child_account_type: string
          p_child_age_group: string
          p_child_birth_date: string
          p_child_nickname: string
          p_child_pin?: string
          p_family_name: string
          p_parent_name: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
