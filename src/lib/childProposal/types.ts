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
// ⚠️ 幣值有兩組欄位，永遠不要互相代入：
//
//    ai_suggested_coin_amount  AI 說的。**永遠不是最終值。**
//    confirmed_coin_amount     家庭最後共同確認的。由 RPC 從 tasks 複製，
//                              呼叫端寫不進來。
//
//    這裡不計算任何幣值。唯一的計算路徑仍然是既有的
//    rewardEligibility → coinPolicy → create_parent_task_v1 → tasks，
//    confirmed_* 只是那個結果在確認當下的不可變快照。
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
 * 這個動作在畫面與稽核上算誰做的。
 *
 * ⚠️ **這是 audit / UI role，不是 authentication proof。**
 *
 * 這個 App 一個家庭共用一個 Supabase auth session（家長帳號），
 * 孩子端在同一個 session 上用 PIN 選 child profile。所以資料庫看到的
 * `auth.uid()` 在家長操作與孩子操作時完全一樣，沒有任何 policy、
 * trigger 或 RPC 分得出來。
 *
 * 它的正當用途只有兩個：
 *   · 讓兩端畫面共用同一組狀態機（決定哪些按鈕該出現）
 *   · 讓 status event 留下「這一步是誰按的」以供事後閱讀
 *
 * 它**不可以**被當成安全控制。同家庭的 client 可以自稱任何角色。
 *
 * 真正成立的邊界是**家庭**：`auth.uid() → parents.family_id` 由 GoTrue
 * 簽出，RLS 與每支 RPC 的 assert 都擋在那一層，惡意 client 偽造不了。
 *
 * 這是已知且被接受的 P0 限制。修掉它需要孩子有獨立 credential，
 * 那是一整套 auth 子系統，不在這個工作包的範圍。
 */
export type ChildProposalActorRole = 'child' | 'parent';

/** status event 另外允許 system（cron、資料修補），但 RPC 不接受。 */
export type ChildProposalEventActorRole = ChildProposalActorRole | 'system';

/**
 * 回饋的發放依據。由 `tasks.claim_period` 推導，不是另一套設定：
 *
 *   once → one_time / week → per_period / day → per_completion
 */
export type ChildProposalPayoutBasis = 'per_completion' | 'per_period' | 'one_time';

/** 沿用 tasks.claim_period 的三個值。 */
export type ChildProposalClaimPeriod = 'day' | 'week' | 'once';

/**
 * 家庭最後共同確認的回饋 —— shared version 的一部分。
 *
 * ⚠️ **每一個值都是從 `tasks` 複製來的，不是在這裡算出來的。**
 *
 * 幣值的唯一來源仍然是既有的
 * `rewardEligibility` → `coinPolicy` → `create_parent_task_v1` → `tasks`。
 * 這裡存的是那個結果在「家長確認的那一刻」的不可變快照，
 * 而 `sourceTaskId` 讓它隨時可以回去對帳。
 *
 * 為什麼不是需要時再 join tasks：tasks 是**現況**，會被家長調整、
 * 會被 P0-8 改節奏。「當初講好的是什麼」是歷史事實，被現況覆寫之後
 * 就永遠找不回來了。
 *
 * 與 AI 建議（`ChildProposalPlanVersion.ai_suggested_coin_amount`）
 * 是兩組欄位，永遠不要互相代入。
 */
export type ChildProposalConfirmedReward = {
  rewardPolicy: ChildProposalRewardPolicy;
  /** 只有 coin_eligible 才有值，而且一定 > 0。 */
  coinAmount: number | null;
  payoutBasis: ChildProposalPayoutBasis;
  claimPeriod: ChildProposalClaimPeriod;
  maxClaimsPerPeriod: number;
  rewardPolicyVersion: string;
  taskPolicyVersion: string | null;
  /** 這份快照複製自哪一筆任務。對帳用。 */
  sourceTaskId: string;
};

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
  /**
   * AI 建議的幣值。**永遠不是最終值。**
   *
   * 最終值看 confirmed_coin_amount —— 那一欄由 RPC 從 tasks 複製，
   * 呼叫端傳不進來。兩者放在同一列是為了讓「AI 建議 12、家長給 8」
   * 這個對比查得出來，不是為了讓其中一個代替另一個。
   */
  ai_suggested_coin_amount: number | null;

  // ── 家庭最後共同確認的回饋（write-once，由 P0-5 轉 active 時寫入）──
  //
  // 結構化版本見 ChildProposalConfirmedReward。這裡逐欄攤平是因為
  // 它們要能被查詢與統計（週報要能算「這個月確認了幾個 coin_eligible」）。
  confirmed_reward_policy: ChildProposalRewardPolicy | null;
  confirmed_coin_amount: number | null;
  confirmed_payout_basis: ChildProposalPayoutBasis | null;
  confirmed_claim_period: ChildProposalClaimPeriod | null;
  confirmed_max_claims_per_period: number | null;
  confirmed_reward_policy_version: string | null;
  confirmed_task_policy_version: string | null;
  /** 快照複製自哪一筆任務。對帳用 —— 證明這裡沒有第二套定價。 */
  confirmed_source_task_id: string | null;
  confirmed_by_user_id: string | null;
  confirmed_at: string | null;

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
  /** 生效中的計畫版本。沒有版本的轉換（例如 draft → proposed）是 null。 */
  planVersionId: string | null;
  /**
   * 轉成 active 時，RPC 從 tasks 複製下來的共同確認回饋快照。
   * 其餘轉換一律 null。
   *
   * 原樣回傳的用意是讓 P0-5 可以直接比對它與剛建立的任務是否一致，
   * 不必再查一次 —— 對不上就代表中間有人動了 tasks。
   */
  confirmedReward: ChildProposalConfirmedReward | null;
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
   * 回饋**方式、資格與 AI 建議**。
   *
   * 這裡**沒有**最終幣值，而且不是漏掉的：最終幣值（confirmed_*）只由
   * transition_child_proposal_v1 在轉成 active 時從 tasks 複製，
   * 任何呼叫端都寫不進來。命令裡夾帶 coinAmount / finalAmount /
   * confirmedCoinAmount 會被 RPC 以 REWARD_NOT_CLIENT_DECIDED 拒絕 ——
   * 型別擋不住手寫的 jsonb 呼叫端，所以兩層都擋。
   */
  reward?: {
    policy?: ChildProposalRewardPolicy;
    eligibility?: ChildProposalRewardEligibility;
    policyVersion?: string;
    /**
     * AI 建議的幣值。必須同時附 aiSnapshot —— 沒有出處的建議不予保存。
     * 存進 ai_suggested_coin_amount，永遠不會被當成最終值。
     */
    aiSuggestedCoinAmount?: number;
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
