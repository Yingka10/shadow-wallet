// GrowBook — 孩子確認過的規劃 → 正式 Plan Version 的 App 端契約（P1-A3）
//
// ─────────────────────────────────────────────────────────────────────────
// 這一層只負責兩件事：
//
//   1. 把 **GrowBook 的政策欄位**（分類、完成標準、期間、資格）整理成
//      一個命令附件。
//   2. 呼叫 bridge RPC。
//
// 它**不碰孩子的計畫本體**。desiredOutcome / actionPlanSummary /
// nextAction / phases / provenance 一個字都不經過這裡 —— RPC 自己從
// session.confirmed_plan 複製。呼叫端送得進來的話，家長看到的就不一定是
// 孩子點頭的那一份。
//
// ⚠️ ChildPlanEnrichment 刻意是一個**封閉**型別，而且缺少
//    planTitle / planSummary / nextStep / cadence 這幾個鍵。
//
//    這不是疏漏。P0 Plan Draft 確實會產出那幾個欄位，而且它們常常
//    「看起來更漂亮」—— 整包複製過來的話，孩子確認的計畫會被一份
//    他沒看過的東西取代。型別上沒有那個位置，這件事就寫不出來，
//    不必靠 review 抓。（RPC 端也會擋，兩層都有。）
// ─────────────────────────────────────────────────────────────────────────

import type {
  ChildProposalRewardEligibility,
  ChildProposalRewardPolicy,
} from '../../childProposal/types';
import type { PayoutType } from '../../childProposal/planDraft/types';

/** 命令版本。與 planning session 的三支 RPC 同一數列。 */
export const PUBLISH_CHILD_CONFIRMED_PLAN_SCHEMA_VERSION = 1;

/**
 * 還沒決定、而且屬於**家庭共同條件**的欄位。
 *
 * 這一組值存在的理由是 P1-A3 的一條核心判斷：
 * **正式計畫不需要立刻可以被 Direct Confirm。**
 *
 * 孩子可以非常清楚地知道「先決定故事 → 畫角色 → 畫頁面」，同時完全沒有
 * 決定一週幾次、多久完成、有沒有幣。那份計畫仍然成立 —— 沒有決定的是
 * 共同條件，而共同條件本來就不該由孩子一個人或 AI 決定。
 *
 * 沒有這一組值時，唯一能讓計畫看起來完整的作法是捏一個 durationDays = 30
 * 出來，而那是這一包最想防的事。
 */
export type RequiresParentDecision =
  | 'cadence'
  | 'session_size'
  | 'duration'
  | 'reward'
  | 'purpose_category';

export const REQUIRES_PARENT_DECISION_VALUES: readonly RequiresParentDecision[] = [
  'cadence',
  'session_size',
  'duration',
  'reward',
  'purpose_category',
] as const;

/**
 * GrowBook 政策層補上的欄位。**孩子不決定這些，AI 也不直接決定。**
 *
 * 每一欄都來自既有的正式邏輯：
 *
 *   purposeCategory       模型的語意判斷，但它已經先通過 rewardEligibility 閘門
 *   completionDescription canonicalCompletionDescription 的固定句型（不是模型的自由文字）
 *   estimatedMinutes      模型估的投入量；孩子自己講過份量時**不會用到這一欄**
 *   durationType/Days     模型判斷的執行期間
 *   reward                rewardEligibility → coinPolicy 這條既有的規則鏈
 *
 * ⚠️ 沒有 cadence。孩子的節奏優先，孩子沒決定就是沒決定 ——
 *    AI 不可以偷偷補一個「一週三次」。
 * ⚠️ 沒有任何**決定好的**幣值。這一步不發幣，也不替家長先決定金額。
 *    reward 裡的兩個 policy evidence 欄位是規則引擎的判定，不是承諾 ——
 *    見下方說明。
 */
export type ChildPlanEnrichment = {
  purposeCategory: 'A' | 'B' | 'C' | 'D';
  completionDescription: string;
  estimatedMinutes: number;
  durationType: 'one_time' | 'recurring' | 'long_term';
  durationDays?: number;
  reward: {
    policy: ChildProposalRewardPolicy;
    eligibility: ChildProposalRewardEligibility;
    policyVersion: string;
    /**
     * 規則引擎算出的一次投入參考價（P1-A4A.1）。
     *
     * **不是最終金額**，也不是「AI 建議的幣值」—— 它是既有的
     * rewardEligibility → coinPolicy 那條鏈對「這樣一次投入值多少」的
     * 判定，會被寫進正式欄位 policy_session_coin_reference，
     * 之後家長同意那一步拿現在重算的結果跟它對帳。
     *
     * 算不出來就是 null。RPC 會把 reward 列進 requires_parent_decision，
     * 不會挑一個數字補上。
     */
    sessionCoinReference: number | null;
    /**
     * 這份計畫的結算語意。目前唯一有實作結算路徑的是 per_completion；
     * 其他值一律不寫進正式欄位（RPC 端擋，DB CHECK 再擋一次）。
     *
     * ⚠️ 不由 progressionKind 推導：staged 不是 per_milestone。
     */
    payoutType: PayoutType;
  };
  taskPolicyVersion: string;
  /** 這一次 enrichment 的稽核證據。**不是** canonical 計畫資料。 */
  aiSnapshot: object;
  aiModel: string;
};

export type PublishChildConfirmedPlanCommand = {
  schemaVersion: typeof PUBLISH_CHILD_CONFIRMED_PLAN_SCHEMA_VERSION;
  proposalId: string;
  sessionId: string;
  /** 缺席 = enrichment 當時不可用。孩子的計畫照樣成立。 */
  enrichment?: ChildPlanEnrichment;
};

export type PublishFormalPlanFailureCode =
  | 'VALIDATION_FAILED'
  | 'POLICY_REJECTED'
  | 'PERSISTENCE_FAILED'
  | 'UNKNOWN';

export type PublishFormalPlanFailure = {
  ok: false;
  code: PublishFormalPlanFailureCode;
  /** RPC 對可預期的拒絕會附機器可讀的理由（PLANNING_NOT_CONFIRMED…）。 */
  reason?: string;
  message: string;
};

export type PublishFormalPlanSuccess = {
  ok: true;
  proposalId: string;
  sessionId: string;
  planVersionId: string;
  versionNo: number;
  /** 永遠是 child。回別的值一律當失敗 —— 見 formalPlanService 的說明。 */
  authoredBy: 'child';
  proposalStatus: 'proposed';
  requiresParentDecision: RequiresParentDecision[];
  /** unavailable = 政策 helper 當時不可用；**不是**「假裝成功」。 */
  enrichmentStatus: 'enriched' | 'unavailable';
  /** 同一場對話的重送。**不是錯誤** —— 重試不該讓孩子看到紅字。 */
  idempotentReplay: boolean;
};

export type PublishFormalPlanResult = PublishFormalPlanSuccess | PublishFormalPlanFailure;
