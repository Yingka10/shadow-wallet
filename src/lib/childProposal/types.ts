// Shadow Wallet — 孩子提案 / 版本契約的 domain 型別（P0-1）
//
// ─────────────────────────────────────────────────────────────────────────
// 這個模組是 P0-2／3／4／6／8 的共同依賴。它回答一個問題：
// **「孩子提出的想法」在型別上是什麼？**
//
// 三件事刻意分開，因為它們在產品上就是三件事：
//
//   ChildProposal            孩子的原話 ＋ 目前走到哪一步
//   ChildProposalPlanVersion 這個想法被整理成的第 n 版計畫
//   ChildProposalTrialEvent  孩子在還沒定案之前試了一次
//
// 合成一個型別的話，「孩子當初想做什麼」與「家長最後同意什麼」
// 會變成同一個欄位，而那正是這個產品最不能弄丟的區別。
//
// ⚠️ 這裡沒有任何 coin 欄位，而且不是漏掉的。
//    AI 與計畫版本可以決定節奏、步驟與回饋「方式」，
//    最終幣值由 coin policy 在建立正式任務時決定（P0-5 之後）。
// ─────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// 狀態
// ---------------------------------------------------------------------------

/**
 * 提案的五個狀態。與 DB 的 child_proposals_status_check 一字不差。
 *
 * draft              孩子還沒送出，只屬於孩子。
 * proposed           已提出、家長尚未確認。可以留下試行紀錄，但沒有可花用的回饋。
 * needs_child_review 家長做了重大修改，新版本還沒被孩子接受。
 * active             已形成家庭共同版本 —— 到這裡才有正式任務、才依 policy 入帳。
 * closed_unsuitable  家長認為目前不適合。原始內容與原因都保留，不建立任務。
 */
export type ChildProposalStatus =
  | 'draft'
  | 'proposed'
  | 'needs_child_review'
  | 'active'
  | 'closed_unsuitable';

export const CHILD_PROPOSAL_STATUSES: readonly ChildProposalStatus[] = [
  'draft',
  'proposed',
  'needs_child_review',
  'active',
  'closed_unsuitable',
] as const;

/**
 * 誰做的這個動作。
 *
 * ⚠️ 這**不是**從 auth session 推導出來的，而且推導不出來 ——
 * 孩子在這個 App 沒有自己的登入身分（孩子端跑在家長的 Supabase session 上，
 * 用 PIN 選孩子）。所以 actor role 是呼叫端明講、RPC 驗證後記錄下來的。
 * 它擋得住「家長端畫面誤用孩子的轉換」，擋不住一個惡意的 client 謊報身分。
 *
 * 真正修掉這件事需要孩子有獨立的 auth 身分。見完成報告的風險清單。
 */
export type ChildProposalActorRole = 'child' | 'parent';

/** status event 另外允許 system（cron、資料修補），但 RPC 不接受。 */
export type ChildProposalEventActorRole = ChildProposalActorRole | 'system';

// ---------------------------------------------------------------------------
// 詞彙
// ---------------------------------------------------------------------------

/**
 * 提案的來源。沿用 tasks.task_source 的詞彙，但只收這兩個 ——
 * parent / system 提出的東西不是「孩子的提案」，它走既有的家長建立任務路徑。
 *
 * P0-5 轉換時這一欄直接寫進 tasks.task_source；
 * tasks.creation_source 則會是 'child_proposal'（已定義在 customTaskContract
 * 的 PlannedTaskCreationSource，不必再發明新值）。
 */
export type ChildProposalSource = 'child' | 'co_created';

/**
 * 節奏。與 tasks.schedule_mode 同一組字面值，不另立一套 ——
 * 兩套詞彙表示 P0-5 轉換要寫一張對照表，而對照表會過期。
 */
export type ChildProposalCadenceMode =
  | 'one_time'
  | 'fixed_days'
  | 'weekly_frequency'
  | 'plan_schedule';

/**
 * 孩子**期待**的回饋方式。
 *
 * 刻意不共用 reward_policy 的字面值。用同一組字的話，之後一定有人
 * 把它直接寫進 tasks.reward_policy —— 那等於讓孩子自己決定發不發幣。
 * 名字不一樣，join 就接不起來。
 */
export type ChildRewardPreference =
  | 'not_specified'
  | 'just_record'
  | 'see_progress'
  | 'hopes_for_coin';

/**
 * 計畫版本的回饋方式。沿用 tasks.reward_policy，但**排除 time_saving_eligible**：
 * 3C 與時間儲蓄不在這個工作包，讓它寫得進來等於允許一條沒有實作的路徑先累積資料。
 */
export type ChildProposalRewardPolicy =
  | 'record_only'
  | 'family_contribution'
  | 'progress_only'
  | 'coin_eligible';

/** 回饋資格的判定結果。allowed / blocked 一定要附政策版本（DB 有 CHECK）。 */
export type ChildProposalRewardEligibility = 'not_evaluated' | 'allowed' | 'blocked';

/** 計畫版本是誰寫的。ai 是第一等公民 —— 不記的話事後分不出誰的主意。 */
export type ChildProposalPlanAuthor = 'child' | 'parent' | 'ai';

export type ChildProposalTrialOutcome = 'tried' | 'completed' | 'skipped';

export type ChildProposalAdjustmentKind =
  | 'cadence'
  | 'scope'
  | 'support'
  | 'reward'
  | 'pause'
  | 'stop'
  | 'other';

export type ChildProposalAdjustmentStatus = 'open' | 'accepted' | 'declined' | 'withdrawn';

// ---------------------------------------------------------------------------
// Row 型別（對應 DB 欄位）
// ---------------------------------------------------------------------------

export type ChildProposal = {
  id: string;
  family_id: string;
  child_id: string;
  status: ChildProposalStatus;

  /** 孩子的原話。**永久不可覆寫**（DB 有 trigger）。 */
  child_original_goal: string;
  /** 孩子的原話。允許 null —— 逼孩子填理由會逼出假答案。 */
  child_original_motivation: string | null;

  proposal_source: ChildProposalSource;

  cadence_mode: ChildProposalCadenceMode | null;
  cadence_weekly_frequency: number | null;
  cadence_days: number[] | null;
  preferred_time: string | null;
  preferred_time_custom: string | null;
  estimated_minutes: number | null;

  child_reward_preference: ChildRewardPreference;
  child_note: string | null;

  current_plan_version_id: string | null;
  /** P0-5 轉換後才有。active 之前一律 null。 */
  task_id: string | null;

  closed_reason: string | null;
  closed_at: string | null;

  proposed_at: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChildProposalPlanVersion = {
  id: string;
  proposal_id: string;
  version_no: number;
  authored_by: ChildProposalPlanAuthor;
  author_user_id: string | null;

  plan_title: string | null;
  plan_summary: string | null;

  cadence_mode: ChildProposalCadenceMode | null;
  cadence_weekly_frequency: number | null;
  cadence_days: number[] | null;
  preferred_time: string | null;
  preferred_time_custom: string | null;
  estimated_minutes: number | null;
  duration_type: 'one_time' | 'recurring' | 'long_term' | null;
  duration_days: number | null;
  start_date: string | null;
  end_date: string | null;

  reward_policy: ChildProposalRewardPolicy | null;
  reward_eligibility: ChildProposalRewardEligibility;
  reward_policy_version: string | null;
  task_policy_version: string | null;

  /** AI / Plan Draft 的不可變快照。稽核用，不是現況來源。 */
  ai_snapshot: unknown | null;
  ai_model: string | null;
  ai_request_id: string | null;

  requires_child_review: boolean;
  child_accepted_at: string | null;
  parent_confirmed_at: string | null;
  /** 成為 current 的時間。與 created_at 分開 —— 兩者真的會不一樣。 */
  effective_at: string | null;
  superseded_at: string | null;
  created_at: string;
};

export type ChildProposalTrialEvent = {
  id: string;
  proposal_id: string;
  child_id: string;
  family_id: string;
  plan_version_id: string | null;
  /** Asia/Taipei 的日期。孩子回報的是「今天做了」，不是「14:32 做了」。 */
  occurred_on: string;
  outcome: ChildProposalTrialOutcome;
  reported_by: ChildProposalActorRole;
  note: string | null;
  /**
   * P0 期間永遠是 'none'。
   *
   * 型別上就只有這一個值，而不是 string ——「試行不入帳」因此是一個
   * 編譯期就成立的斷言，不是要靠讀 schema 發現少了 coin 欄位才推論出來。
   */
  wallet_effect: 'none';
  created_at: string;
};

export type ChildProposalAdjustmentRequest = {
  id: string;
  proposal_id: string;
  family_id: string;
  requested_by: ChildProposalActorRole;
  requester_user_id: string | null;
  based_on_plan_version_id: string | null;
  adjustment_kind: ChildProposalAdjustmentKind;
  reason: string;
  requested_changes: unknown | null;
  status: ChildProposalAdjustmentStatus;
  resolved_plan_version_id: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type ChildProposalStatusEvent = {
  id: string;
  proposal_id: string;
  from_status: ChildProposalStatus | null;
  to_status: ChildProposalStatus;
  actor_role: ChildProposalEventActorRole;
  /** 孩子沒有獨立 auth 身分 —— 孩子操作記到的是家長帳號。 */
  actor_user_id: string | null;
  plan_version_id: string | null;
  reason: string | null;
  snapshot: unknown | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// RPC 結果
// ---------------------------------------------------------------------------

/** 與 create_parent_task_v1 同一組失敗代碼，呼叫端可以共用錯誤處理。 */
export type ChildProposalFailureCode =
  | 'VALIDATION_FAILED'
  | 'POLICY_REJECTED'
  | 'PERSISTENCE_FAILED'
  | 'UNKNOWN';

export type ChildProposalFailure = {
  ok: false;
  code: ChildProposalFailureCode;
  /** RPC 對可預期的拒絕會附一個機器可讀的理由（ILLEGAL_TRANSITION 等）。 */
  reason?: string;
  message: string;
};

export type CreateChildProposalSuccess = {
  ok: true;
  proposalId: string;
  status: ChildProposalStatus;
};

export type AddPlanVersionSuccess = {
  ok: true;
  planVersionId: string;
  versionNo: number;
  isCurrent: boolean;
};

export type TransitionProposalSuccess = {
  ok: true;
  proposalId: string;
  fromStatus: ChildProposalStatus;
  toStatus: ChildProposalStatus;
};

export type RecordTrialSuccess = {
  ok: true;
  trialEventId: string;
  /** 同一天重複回報不新增第二列，也不是錯誤。 */
  duplicate: boolean;
  /** 永遠是 'none'。RPC 明確回傳，呼叫端不必靠「沒有 coin 欄位」推論。 */
  walletEffect: 'none';
};

export type CreateAdjustmentRequestSuccess = {
  ok: true;
  adjustmentRequestId: string;
  status: 'open';
};

export type CreateChildProposalResult = CreateChildProposalSuccess | ChildProposalFailure;
export type AddPlanVersionResult = AddPlanVersionSuccess | ChildProposalFailure;
export type TransitionProposalResult = TransitionProposalSuccess | ChildProposalFailure;
export type RecordTrialResult = RecordTrialSuccess | ChildProposalFailure;
export type CreateAdjustmentRequestResult =
  | CreateAdjustmentRequestSuccess
  | ChildProposalFailure;

// ---------------------------------------------------------------------------
// 命令
// ---------------------------------------------------------------------------

/** 所有命令共用。改版時 RPC 會是 _v2，舊值仍被舊 RPC 接受。 */
export const CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION = 1;

export type ChildProposalCadenceInput = {
  mode?: ChildProposalCadenceMode;
  weeklyFrequency?: number;
  /** 0=週日 … 6=週六，與 tasks.recurrence_days 一致。 */
  days?: number[];
  preferredTime?: string;
  preferredTimeCustom?: string;
};

export type CreateChildProposalCommand = {
  schemaVersion: typeof CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION;
  childId: string;
  childOriginalGoal: string;
  childOriginalMotivation?: string;
  proposalSource?: ChildProposalSource;
  /** 只能是 draft 或 proposed —— 直接建立 active 等於跳過家長確認。 */
  status?: Extract<ChildProposalStatus, 'draft' | 'proposed'>;
  cadence?: ChildProposalCadenceInput;
  estimatedMinutes?: number;
  childRewardPreference?: ChildRewardPreference;
  childNote?: string;
};

export type AddChildProposalPlanVersionCommand = {
  schemaVersion: typeof CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION;
  proposalId: string;
  authoredBy: ChildProposalPlanAuthor;
  planTitle?: string;
  planSummary?: string;
  cadence?: ChildProposalCadenceInput;
  estimatedMinutes?: number;
  durationType?: 'one_time' | 'recurring' | 'long_term';
  durationDays?: number;
  startDate?: string;
  endDate?: string;
  /**
   * 回饋**方式與資格**，不含金額。
   *
   * 型別上就沒有 coinAmount / finalAmount 這兩個鍵，而 RPC 收到它們會直接拒絕 ——
   * 兩層都擋是因為命令是 jsonb，型別擋不住手寫的呼叫端。
   */
  reward?: {
    policy?: ChildProposalRewardPolicy;
    eligibility?: ChildProposalRewardEligibility;
    policyVersion?: string;
  };
  taskPolicyVersion?: string;
  aiSnapshot?: unknown;
  aiModel?: string;
  aiRequestId?: string;
  /** 家長做了重大修改時為 true → 這一版要等孩子接受才生效。 */
  requiresChildReview?: boolean;
  /** 預設 true。false 用於「先存一版但不套用」。 */
  makeCurrent?: boolean;
};

export type TransitionChildProposalCommand = {
  schemaVersion: typeof CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION;
  proposalId: string;
  toStatus: ChildProposalStatus;
  actorRole: ChildProposalActorRole;
  reason?: string;
  /** 只有轉 active 時可以帶，而且**必須**帶。由 P0-5 的轉換產生。 */
  taskId?: string;
};

export type RecordChildProposalTrialCommand = {
  schemaVersion: typeof CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION;
  proposalId: string;
  /** Asia/Taipei 的 YYYY-MM-DD，由呼叫端用 taipeiDate 算好。 */
  occurredOn: string;
  outcome: ChildProposalTrialOutcome;
  reportedBy?: ChildProposalActorRole;
  note?: string;
};

export type CreateChildProposalAdjustmentRequestCommand = {
  schemaVersion: typeof CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION;
  proposalId: string;
  requestedBy?: ChildProposalActorRole;
  adjustmentKind: ChildProposalAdjustmentKind;
  reason: string;
  requestedChanges?: unknown;
};
