/**
 * rewardEligibility — 回饋資格閘門（docs/coin-policy-draft.md 第 2 節，八步判斷）。
 *
 * 純函式，不呼叫 AI、不碰 DB、不動現有 handler。輸入 AI 的結構化理解 + 後端確定資料，
 * 輸出「能不能發幣、預設回饋方式、三級 flags」。
 *
 * 定位：這是 coinPolicy.calcCoins() 之前的閘門。
 *   category ∈ {A,B} → coinEnabled=false，直接回傳，不進入幣值計算。
 *   category ∈ {C,D} → coinEnabled=true，呼叫端再走 calcCoins。
 *
 * 幣值數字不在此檔（見 coin-policy.json）；此檔只做「資格」與「風險標記」。
 */

export type Category = 'A' | 'B' | 'C' | 'D';
export type AgeGroup = '2-4' | '4-6' | '6-9' | '9-12';
export type TaskSource = 'parent' | 'child' | 'negotiated' | 'system';
export type DurationType = 'single' | 'recurring' | 'long_term';

/** AI 結構化理解 + 後端確定資料，餵進閘門。 */
export interface EligibilityInput {
  category: Category;
  alternativeCategory?: Category | null;
  ageGroup: AgeGroup;
  taskSource: TaskSource;
  durationType: DurationType;
  /** AI 標記：是否偏獎勵單次成績（結果導向）。 */
  outcomeBased?: boolean;
  /** AI 標記：類別/來源是否存在歧義，需家長澄清。 */
  needsClarification?: boolean;
  clarificationQuestion?: string | null;
  /** 由 DB 查詢得出：是否疑似與現有任務重複刷幣。不交給 AI 主觀判斷。 */
  duplicateOfExisting?: boolean;
  /** 是否超過該任務預期的頻率上限（由頻率規則得出）。 */
  exceedsFrequency?: boolean;
}

export type RewardMode =
  | 'life_progress' // A：完成動畫、連續進度、口語肯定
  | 'family_contribution' // B：家庭葉片、貢獻紀錄、週報被看見
  | 'coin_or_time'; // C/D：成長幣或時間儲蓄

export interface EligibilityResult {
  coinEnabled: boolean;
  rewardMode: RewardMode;
  /** 三級 flags（修改.txt 第 8 點）。 */
  blockingIssues: string[];
  requiresConfirmation: string[];
  warnings: string[];
  /** coinEnabled=false，或有 blocking / confirmation 時為 true → 不直接算幣。 */
  gateBlocked: boolean;
  /** 需要向家長顯示的澄清問題（若有）。 */
  clarificationQuestion?: string | null;
}

/**
 * 跑完第 2 節八步資格閘門。
 *
 * 八步：1 類別 → 2 適齡 → 3 來源 → 4 家庭責任偽裝 → 5 結果導向
 *       → 6 重複/頻率 → 7 發放單位(呼叫端) → 8 算幣(呼叫端)
 * 本函式負責 1–6 的資格與風險判斷；7、8 由 coinPolicy 與呼叫端處理。
 */
export function runEligibilityGate(input: EligibilityInput): EligibilityResult {
  const blockingIssues: string[] = [];
  const requiresConfirmation: string[] = [];
  const warnings: string[] = [];

  // 步驟 1：類別 → 回饋資格（硬規則，第 2.1 節）
  if (input.category === 'A' || input.category === 'B') {
    return {
      coinEnabled: false,
      rewardMode: input.category === 'A' ? 'life_progress' : 'family_contribution',
      blockingIssues,
      requiresConfirmation,
      warnings,
      gateBlocked: true,
      clarificationQuestion: null,
    };
  }

  // 以下僅 C / D。
  // 步驟 2：適齡性 —— 2-4 歲原則上不獨立發幣。
  if (input.ageGroup === '2-4') {
    blockingIssues.push('2-4 歲原則上不獨立呈現、不發幣');
  }

  // 步驟 3：來源 —— C 類必須孩子提出或親子協商，不能只看名稱。
  if (input.category === 'C' && input.taskSource === 'parent') {
    requiresConfirmation.push(
      'C 類（自主挑戰）通常應由孩子提出或親子協商；此任務來源為家長提出，請確認是否其實為 B 類家庭參與',
    );
  }

  // 步驟 4：家庭責任偽裝 —— AI 標記可能是 B，或 alternativeCategory=B。
  if (input.needsClarification && (input.alternativeCategory === 'B' || input.category === 'C')) {
    requiresConfirmation.push(
      input.clarificationQuestion ?? '這可能是固定家庭分工（B），也可能是額外挑戰（C），請確認主要目的',
    );
  }

  // 步驟 5：結果導向 —— 擋下，要求改寫成投入/持續。
  if (input.outcomeBased) {
    blockingIssues.push('偏獎勵單次成績（結果導向），請改寫為獎勵投入或持續，例如「每週完成三次訂正與複習」');
  }

  // 步驟 6：重複任務與超頻率 —— 擋下（配合單任務頻率上限）。
  if (input.duplicateOfExisting) {
    blockingIssues.push('疑似與現有任務重複，避免重複刷幣');
  }
  if (input.exceedsFrequency) {
    blockingIssues.push('超過該任務預期的頻率／週期上限');
  }

  const gateBlocked = blockingIssues.length > 0 || requiresConfirmation.length > 0;

  return {
    coinEnabled: true,
    rewardMode: 'coin_or_time',
    blockingIssues,
    requiresConfirmation,
    warnings,
    gateBlocked,
    clarificationQuestion: gateBlocked ? (input.clarificationQuestion ?? null) : null,
  };
}
