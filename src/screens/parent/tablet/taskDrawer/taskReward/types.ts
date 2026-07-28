// Shadow Wallet · Parent Tablet — 回饋決策契約
//
// 為什麼要一個獨立型別，而不是在命令上放一個 coinAmount 數字：
//
// 一個裸數字沒有辦法回答「這是誰算的、依據什麼、家長可以調到多少、為什麼是這個數」。
// 幣值是這個 App 唯一會實際改變孩子錢包的東西，它必須可稽核 ——
// 半年後改政策時要分得出哪些任務是舊版定價的，家長問「為什麼只有 15 幣」時要答得出來。
//
// 三個變體用 eligibility 判別，型別上就保證：
//   * 不發幣的政策不可能夾帶幣值（coin: null）
//   * coin_eligible 且 allowed 時一定有明確金額與範圍
//   * 被擋下的一定帶原因碼

import type { DurationType, PurposeCategory, RewardPolicy } from '../taskCatalog';
import type { CoinDifficulty } from './coinPolicy';

/** 幣值是怎麼算出來的。存進稽核事件，讓事後能重建這個數字。 */
export type TaskRewardCalculationBasis = {
  ageGroup: string;
  purposeCategory: PurposeCategory;
  /** 沒有估計分鐘就對應不到時間分級 —— 這種情況不會有 priced 結果。 */
  estimatedMinutes?: number;
  durationType: DurationType;
  scheduleMode: string;
  weeklyFrequency?: number;
  /** 0 = 週日，沿用專案既有定義。 */
  recurrenceDays?: number[];
  /** 未指定時套用 policy 的 standard（±0），並在 explanation 說明。 */
  difficulty?: CoinDifficulty;
  /** 對應到政策的哪一段時間分級。 */
  band?: string;
};

export type TaskRewardCoin = {
  /** 政策算出來的建議值，正整數。 */
  suggestedAmount: number;
  /** 實際要寫進任務的值。本輪等於建議值（沒有調整 UI）。 */
  finalAmount: number;
  /** 家長可調整的下限，取自政策的 range。 */
  minAllowed: number;
  /** 家長可調整的上限，取自政策的 range。 */
  maxAllowed: number;
  calculationBasis: TaskRewardCalculationBasis;
};

/** 被擋下的原因。 */
export type TaskRewardBlockedCode =
  /** 政策算不出這筆任務的幣值（缺估計分鐘、年齡段不發幣、政策沒填數字）。 */
  | 'COIN_POLICY_UNAVAILABLE'
  /** 時間儲蓄的建立與完成鏈路都還沒打通。 */
  | 'TIME_SAVING_NOT_ENABLED'
  /** 政策明說這個組合不可發幣（例如家庭參與選了 coin_eligible）。 */
  | 'POLICY_REJECTED';

export type TaskRewardDecision =
  | {
      rewardPolicy: 'record_only' | 'family_contribution' | 'progress_only';
      eligibility: 'allowed';
      coin: null;
      rewardPolicyVersion: string;
      explanation: string;
    }
  | {
      rewardPolicy: 'coin_eligible';
      eligibility: 'allowed';
      coin: TaskRewardCoin;
      rewardPolicyVersion: string;
      explanation: string;
    }
  | {
      rewardPolicy: 'coin_eligible' | 'time_saving_eligible';
      eligibility: 'blocked';
      coin: null;
      rewardPolicyVersion: string;
      code: TaskRewardBlockedCode;
      explanation: string;
    };

/**
 * 目前這台裝置上，哪些回饋方式真的能用。
 *
 * 存在的理由是「不要讓家長選完才在 RPC 被拒絕」：能力是先算好的，
 * 選單一開始就只列得出真的走得完的選項。
 */
export type TaskRewardCapabilities = {
  coinRewardsEnabled: boolean;
  timeSavingEnabled: boolean;
};

/** 選單上的一個回饋方式。 */
export type RewardPolicyOption = {
  policy: RewardPolicy;
  /** false = 目前不能用。demo 模式不會拿到這種項目。 */
  available: boolean;
  /** available === false 時的說明，例如「尚未啟用」。 */
  unavailableNote?: string;
};
