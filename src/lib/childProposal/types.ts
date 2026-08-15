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
  /**
   * per_period 快照當初約定「一個 period 內幾次算達標」。
   *
   * **不是 `maxClaimsPerPeriod`。** 後者是每期 claim 次數上限，兩者會不一樣
   * （「每週 4 次算達標、允許做 5 次」是合法設定），
   * 見 `docs/CLAIM_PERIOD_VS_PAYOUT_BASIS.md`。
   *
   * 兩種情況會是 null，而且都是正確的：
   *   · 非 per_period 的 basis —— 目標次數只屬於 per_period
   *   · legacy 快照 —— 那時的 per_period 是從 claim_period 推導出來的，
   *     家庭從來沒有確認過任何次數（遷移零列，不 backfill）
   */
  periodTargetCount: number | null;
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

/**
 * 這件事「為什麼做」。與 tasks 的 A/B/C/D 同一組語意
 * （見 docs/SPEC_task-taxonomy-2026-07.md）。
 *
 * ⚠️ 長期**不是**第五類。那是 duration_type ——
 *    混進來的話，一個兩週的閱讀挑戰會變成一種新的任務種類。
 */
export type ChildProposalPurposeCategory = 'A' | 'B' | 'C' | 'D';

/**
 * 進度怎麼看。
 *
 * `weekly_rhythm` —— 以每週節奏看「本週 X / Y」：
 *   · 累積真實完成次數
 *   · 中斷一次不歸零（不以 streak 為主進度）
 *   · 不宣稱有不存在的里程碑完成
 *
 * P0 只有這一個值，而且是**推導**出來的，不是 AI 說了算。
 * 證據不足時是 null —— 不猜。
 */
export type ChildProposalProgressModel = 'weekly_rhythm';

export type ChildProposalTrialOutcome = 'tried' | 'completed' | 'skipped';

export type ChildProposalAdjustmentKind =
  // P0-8M 開的唯一一條：進行中的共同計畫換閱讀時段。
  | 'preferred_time'
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

/**
 * 還沒決定、而且屬於家庭共同條件的欄位（P1-A3 寫入，P1-A4A 讀）。
 *
 * 這裡與 `childPlanning/formalPlan` 的 `RequiresParentDecision` 是同一組值。
 * 兩邊各宣告一次是刻意的：childProposal 不 import childPlanning，
 * 否則 P0 的提案契約會開始依賴 P1 的規劃契約。由 parity 測試釘住同值。
 */
export type ChildPlanSharedDecision =
  | 'cadence'
  | 'session_size'
  | 'duration'
  | 'reward'
  | 'purpose_category';

export type ChildProposalPlanVersion = {
  id: string;
  proposal_id: string;
  version_no: number;
  authored_by: ChildProposalPlanAuthor;
  author_user_id: string | null;

  plan_title: string | null;
  plan_summary: string | null;

  // ── P0-5 直接讀的結構化欄位 ────────────────────────────────────────────
  //
  // 這四欄刻意**不只**存在 ai_snapshot 裡。snapshot 是「當時 AI 回了什麼」
  // 的稽核紀錄，形狀會隨 prompt 改版而變、也沒有任何 CHECK 擋得住裡面的值。
  // 讓建立正式任務去解那段 JSON，等於讓任務的分類與完成標準取決於
  // 一段沒有 schema 的東西。

  purpose_category: ChildProposalPurposeCategory | null;
  /**
   * 一次怎樣才算完成。
   *
   * ⚠️ 由 deterministic transformer 產生的固定句型，**不是 LLM 的自由文字**。
   *    D 類學習任務獎勵的是可控制的投入與練習，不是最後結果 ——
   *    句型永遠是「完成一次…時段」，結構上就寫不出「讀完整本書」。
   */
  completion_description: string | null;
  progress_model: ChildProposalProgressModel | null;
  /** 孩子下一次最小可做的步驟。沒有可靠建議時是 null —— 不生成假內容。 */
  next_step: string | null;

  cadence_mode: ChildProposalCadenceMode | null;
  /**
   * 一週要完成幾次，**日期彈性**。
   *
   * 「一週 4 次」不是「系統替孩子挑了四個固定星期」——
   * 所以 weekly_frequency 的列，cadence_days 一定是 null（DB 有 CHECK）。
   * 要指定星期是 fixed_days，那才有 scheduled day / missed day 的語意。
   */
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
   * Parent adoption 指向被採用的來源 version；不重用 ai_request_id。
   *
   * 兩條線都用它，而且**只用它**：
   *   P0  parent agreement → 被採用的 AI version
   *   P1  parent agreement → 孩子確認過的 child formal version（P1-A4A）
   * 再造第二條 parent-source lineage 等於讓「這一版從哪來」有兩個答案。
   */
  adopted_from_plan_version_id: string | null;

  // ── P1-A3 Planning lineage ─────────────────────────────────────────────
  //
  // 四欄同進同出（DB CHECK）。有 lineage 的列 authored_by 一定是 'child'，
  // 所以 parent agreement version 上這四欄永遠是 null / 空 —— 孩子確認過的
  // canonical 計畫只有一份，家長那一版透過 adopted_from_plan_version_id 指回去。

  /** 這一版正式計畫是從哪一場孩子確認過的規劃對話來的。 */
  source_planning_session_id: string | null;
  planning_schema_version: number | null;
  /**
   * 孩子確認過的 canonical 計畫（含 progression 結構與逐欄 provenance）。
   *
   * ⚠️ 這是產品資料，**不是** ai_snapshot 那種稽核快照。
   */
  child_confirmed_plan: unknown | null;
  /** 還沒決定、而且屬於家庭共同條件的欄位。空陣列不代表可以直接確認。 */
  requires_parent_decision: ChildPlanSharedDecision[];
  /** enriched = 政策欄位算完了；unavailable = 當時 policy helper 不可用。 */
  enrichment_status: 'enriched' | 'unavailable' | null;

  // ── P1-A4A.1 Deterministic policy evidence ─────────────────────────────
  //
  // 既有規則鏈（rewardEligibility → coinPolicy）在建版當時算出來的證據。
  // **不是孩子決定的、不是模型寫的、也不是最終會發的金額。**
  //
  // 之所以是正式欄位而不是留在 ai_snapshot 裡：家長同意那一步要拿它跟
  // 現在重算的結果對帳，而稽核快照的形狀由「某一次 enrichment 回了什麼」
  // 決定 —— 正式任務建不建得起來，不可以取決於一坨 JSON 裡剛好有沒有
  // 某個鍵。與 legacy 的 ai_suggested_coin_amount 是不同的兩欄，因為
  // 這個數字不是 AI 算的。

  /** 規則引擎算出的一次投入參考價。最終金額在 confirmed_coin_amount。 */
  policy_session_coin_reference: number | null;
  /** 當時政策支援的結算語意。目前只可能是 per_completion。 */
  policy_payout_type: 'per_completion' | null;
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
  /**
   * 家長完成自己對這一版的決定；不代表家庭共同版本已生效。
   * 共同成立看 proposal active + effective_at，走 child review 時另看 child_accepted_at。
   */
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
  /**
   * 同一次送出的識別碼（P0-8M）。重送同一個 id 回原本那筆，不新增。
   * 舊資料是 NULL —— 這個欄位是 20260817 才加的。
   */
  client_request_id: string | null;
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
  | 'NO_MATERIAL_CHANGE'
  | 'STALE_PLAN_VERSION'
  | 'POLICY_CHANGED'
  | 'PLAN_NOT_CONFIRMABLE'
  | 'PROPOSAL_NOT_IN_REVIEW'
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
  /**
   * 同一把 aiRequestId 已經有一版了，這次沒有新增。
   *
   * **這不是錯誤。** 背景重試撞到既有版本時，正確的結果是「早就存好了」，
   * 而不是「儲存失敗」—— 後者會讓呼叫端一直重試一件已經完成的事。
   */
  duplicate: boolean;
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
  /** replay 會回原本那筆，所以狀態不一定還是 open。 */
  status: ChildProposalAdjustmentStatus;
  idempotentReplay: boolean;
};

export type CreateChildProposalResult = CreateChildProposalSuccess | ChildProposalFailure;
export type AddPlanVersionResult = AddPlanVersionSuccess | ChildProposalFailure;
export type TransitionProposalResult = TransitionProposalSuccess | ChildProposalFailure;
export type RecordTrialResult = RecordTrialSuccess | ChildProposalFailure;
export type CreateAdjustmentRequestResult =
  | CreateAdjustmentRequestSuccess
  | ChildProposalFailure;

/** 家長首頁的一張卡：Proposal 原話加上 exact current Plan Version。 */
export type ParentProposalCardData = {
  proposal: ChildProposal;
  currentPlanVersion: ChildProposalPlanVersion | null;
};

/** 孩子 review reader 的完整 lineage；source 由 DB 欄位讀取，不由 UI 猜。 */
export type ChildProposalReviewData = {
  proposal: ChildProposal;
  currentPlanVersion: ChildProposalPlanVersion;
  sourcePlanVersion: ChildProposalPlanVersion;
};

/** P0-5B 唯一可由家長修改的 structured material fields。 */
export type ParentProposalMaterialEdits = {
  cadenceMode: Extract<ChildProposalCadenceMode, 'weekly_frequency' | 'fixed_days'>;
  cadenceWeeklyFrequency: number | null;
  cadenceDays: number[] | null;
  preferredTime: string | null;
  preferredTimeCustom: string | null;
  completionDescription: string;
};

export type ChildProposalRewardDecision = {
  rewardPolicy: ChildProposalRewardPolicy;
  eligibility: 'allowed';
  coin: {
    suggestedAmount: number;
    finalAmount: number;
    minAllowed: number;
    maxAllowed: number;
    calculationBasis: unknown;
  } | null;
  rewardPolicyVersion: string;
  explanation: string;
};

export type ConfirmChildProposalCommand = {
  schemaVersion: typeof CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION;
  proposalId: string;
  expectedPlanVersionId: string;
  rewardDecision: ChildProposalRewardDecision;
};

export type ConfirmChildProposalSuccess = {
  ok: true;
  proposalId: string;
  planVersionId: string;
  taskId: string;
  relatedIds: string[];
  confirmedReward: ChildProposalConfirmedReward;
  idempotentReplay: boolean;
};

export type ConfirmChildProposalResult = ConfirmChildProposalSuccess | ChildProposalFailure;

export type ReviseChildProposalPlanCommand = {
  schemaVersion: typeof CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION;
  proposalId: string;
  expectedPlanVersionId: string;
  materialEdits: ParentProposalMaterialEdits;
};

export type AcceptChildProposalPlanCommand = {
  schemaVersion: typeof CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION;
  proposalId: string;
  expectedPlanVersionId: string;
  rewardDecision: ChildProposalRewardDecision;
};

export type RequestChildProposalChangesCommand = {
  schemaVersion: typeof CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION;
  proposalId: string;
  expectedPlanVersionId: string;
  reason?: string;
};

export type CloseChildProposalUnsuitableCommand = {
  schemaVersion: typeof CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION;
  proposalId: string;
  /** Explicit null 仍是 stale guard；undefined 不屬於合法 command。 */
  expectedPlanVersionId: string | null;
  reason: string;
};

export type ReviseChildProposalSuccess = {
  ok: true;
  proposalId: string;
  planVersionId: string;
  status: 'needs_child_review';
  idempotentReplay: boolean;
};

export type ReviewProposalTransitionSuccess = {
  ok: true;
  proposalId: string;
  planVersionId: string | null;
  status: 'proposed' | 'closed_unsuitable';
  idempotentReplay: boolean;
};

export type ReviseChildProposalResult = ReviseChildProposalSuccess | ChildProposalFailure;
export type AcceptChildProposalResult = ConfirmChildProposalSuccess | ChildProposalFailure;
export type RequestChildProposalChangesResult =
  | (ReviewProposalTransitionSuccess & { status: 'proposed'; planVersionId: string })
  | ChildProposalFailure;
export type CloseChildProposalResult =
  | (ReviewProposalTransitionSuccess & { status: 'closed_unsuitable' })
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

  /**
   * P0-5 直接讀的結構化欄位。
   *
   * 每一個都有明確的權威來源，而且**都不是 LLM 的自由文字**：
   *   purposeCategory       AI 語意理解 → 既有 rewardEligibility 閘門
   *   completionDescription deterministic transformer（固定句型）
   *   progressModel         deterministic adapter（依 category/duration/cadence 推導）
   *   nextStep              通過長度與內容驗證的 AI 建議，不合格就 null
   */
  purposeCategory?: ChildProposalPurposeCategory;
  completionDescription?: string;
  progressModel?: ChildProposalProgressModel;
  nextStep?: string;

  /**
   * ⚠️ mode = 'weekly_frequency' 時**不可以**帶 days —— RPC 會以
   * WEEKLY_FREQUENCY_HAS_NO_DAYS 拒絕。一週幾次是彈性的週目標，
   * 不是排定的星期幾。
   */
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

/**
 * P0-8M：孩子對進行中的共同計畫提出換時段。
 *
 * `requestedChanges` 刻意不是 `unknown` —— RPC 只收這兩個鍵，型別在這裡就把
 * 形狀定死，免得畫面送出一份 RPC 一定會拒絕的 JSON 才發現。
 *
 * `clientRequestId` 是同一次送出的識別碼。重送同一個 id 回原本那筆，不新增；
 * 沒有它就只能靠「JSON 看起來一樣」猜是不是重試，而那會猜錯。
 */
export type ChildProposalPreferredTimeChanges = {
  preferredTime: ChildProposalReadingTimeWindow;
  preferredTimeCustom?: null;
};

/** long_term_goals.preferred_time_window 的 CHECK 只允許這兩個值。 */
export type ChildProposalReadingTimeWindow = 'after_dinner' | 'before_bed';

export type CreateChildProposalAdjustmentRequestCommand = {
  schemaVersion: typeof CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION;
  proposalId: string;
  expectedPlanVersionId: string;
  adjustmentKind: 'preferred_time';
  reason: string;
  requestedChanges: ChildProposalPreferredTimeChanges;
  clientRequestId?: string;
};

export type AcceptChildProposalAdjustmentCommand = {
  schemaVersion: typeof CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION;
  adjustmentRequestId: string;
  expectedPlanVersionId: string;
};

export type DeclineChildProposalAdjustmentCommand = {
  schemaVersion: typeof CHILD_PROPOSAL_COMMAND_SCHEMA_VERSION;
  adjustmentRequestId: string;
  resolutionNote?: string;
};

export type AcceptAdjustmentSuccess = {
  ok: true;
  adjustmentRequestId: string;
  proposalId: string;
  planVersionId: string;
  taskId: string;
  idempotentReplay: boolean;
};

export type AcceptAdjustmentResult = AcceptAdjustmentSuccess | ChildProposalFailure;

export type DeclineAdjustmentSuccess = {
  ok: true;
  adjustmentRequestId: string;
  status: 'declined';
  idempotentReplay: boolean;
};

export type DeclineAdjustmentResult = DeclineAdjustmentSuccess | ChildProposalFailure;

/** 家長首頁那張「承恩想調整閱讀計畫」的卡需要的全部資料。 */
export type ChildProposalAdjustmentCardData = {
  request: ChildProposalAdjustmentRequest;
  proposal: ChildProposal;
  basedOnPlanVersion: ChildProposalPlanVersion;
};

/**
 * 孩子端長期詳情要判斷「這是不是一份可以重新協商的共同計畫」所需的全部資料。
 *
 * 三個欄位都是必要的：沒有 proposal 就沒有協商對象；沒有 current version 就
 * 不知道要 append 在哪一版之後（也就湊不出 expectedPlanVersionId）；
 * 沒有 openRequest 的資訊，畫面就會讓孩子重複送出同一件事。
 *
 * 讀不到任何一項時整個回 null —— 半套的 context 會讓 UI 開始猜，
 * 而猜錯的代價是把一般家長任務送進 Shared Plan 的協商 RPC。
 */
export type ChildSharedPlanContext = {
  proposal: ChildProposal;
  currentPlanVersion: ChildProposalPlanVersion;
  /** 已經送出、家長還沒回應的換時段請求。沒有就是 null。 */
  openPreferredTimeRequest: ChildProposalAdjustmentRequest | null;
};
