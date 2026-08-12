// Shadow Wallet · Parent Tablet — 回饋決策
//
// 純函式。不呼叫 AI、不猜任務名稱的意思、不碰 Supabase。
//
// 唯一的幣值來源是 coin-policy.json（版本化、已定案）。政策算不出來的時候
// 這裡回 blocked，**不是回 0**。0 幣的 coin_eligible 任務是最糟的結果：
// 家長看到「可獲得成長幣」、孩子完成後拿到 0，兩邊都會覺得系統壞了。

import type { PurposeCategory } from '../taskCatalog';
import type { CreateParentTaskCommandBase } from '../taskPersistence/types';
import {
  COIN_POLICY_VERSION,
  priceCoin,
  type CoinCategory,
  type CoinDifficulty,
} from './coinPolicy';
import { rewardPolicyVersionFor } from './rewardPolicyVersion';
import type {
  TaskRewardCalculationBasis,
  TaskRewardDecision,
} from './types';

/**
 * 幣值來源。預設是 repo 裡唯一的正式政策；
 * 抽成參數是為了讓「政策不可用」這條路徑能被測到，不是為了讓呼叫端換算法。
 */
export type TaskRewardPolicySource = {
  version: string;
  price: typeof priceCoin;
};

export const DEFAULT_COIN_POLICY_SOURCE: TaskRewardPolicySource = {
  version: COIN_POLICY_VERSION,
  price: priceCoin,
};

export type EvaluateTaskRewardInput = {
  command: CreateParentTaskCommandBase;
  /** 與 lib/onboarding 的 AgeGroup 對齊（'6-9' 等）。 */
  childAgeGroup: string;
  /** 難度列舉。目前抽屜沒有輸入來源，留給之後的家長選擇或協商流程。 */
  difficulty?: CoinDifficulty;
  policy?: TaskRewardPolicySource;
  /**
   * 家長在建議範圍內手動調整過的金額。undefined = 採用政策建議值。
   *
   * 一律 clamp 到 [minAllowed, maxAllowed]，不信任呼叫端已經擋過範圍 ——
   * 這裡算出的 finalAmount 會直接寫進資料庫，前端擋不住的值不能靠前端擋。
   */
  coinOverride?: number;
};

/** 家長調整的金額 clamp 到政策範圍內，並收成整數。 */
function clampCoinOverride(value: number, minAllowed: number, maxAllowed: number): number {
  return Math.min(Math.max(Math.round(value), minAllowed), maxAllowed);
}

/** A/B 不發幣（rewardEligibility 第一步的硬規則），C/D 才進得了幣值計算。 */
const COIN_CATEGORY_BY_PURPOSE: Record<PurposeCategory, CoinCategory | null> = {
  life_routine: null,
  family_participation: null,
  autonomous_challenge: 'C',
  learning_skill: 'D',
};

function basisOf(
  command: CreateParentTaskCommandBase,
  ageGroup: string,
  extra?: { difficulty?: CoinDifficulty; band?: string },
): TaskRewardCalculationBasis {
  return {
    ageGroup,
    purposeCategory: command.task.purposeCategory,
    ...(command.schedule.estimatedMinutes !== undefined
      ? { estimatedMinutes: command.schedule.estimatedMinutes }
      : null),
    durationType: command.task.durationType,
    scheduleMode: command.schedule.mode,
    ...(command.schedule.weeklyFrequency !== undefined
      ? { weeklyFrequency: command.schedule.weeklyFrequency }
      : null),
    ...(command.schedule.recurrenceDays !== undefined
      ? { recurrenceDays: [...command.schedule.recurrenceDays] }
      : null),
    ...(extra?.difficulty !== undefined ? { difficulty: extra.difficulty } : null),
    ...(extra?.band !== undefined ? { band: extra.band } : null),
  };
}

/**
 * 決定一筆任務的回饋方式與（必要時）幣值。
 *
 * 三種結果：
 *   allowed 不發幣 —— 記錄型政策，coin 恆為 null
 *   allowed 發幣   —— 一定有正整數金額與政策範圍
 *   blocked        —— 一定有原因碼，呼叫端不得自行降級成別的政策
 */
export function evaluateTaskReward(input: EvaluateTaskRewardInput): TaskRewardDecision {
  const { command, childAgeGroup, difficulty, coinOverride } = input;
  const policy = input.policy ?? DEFAULT_COIN_POLICY_SOURCE;
  const rewardPolicy = command.task.rewardPolicy;

  // 「這個決策是哪一份政策做的」。沒進幣值計算的決策不該蓋上幣值政策的版本 ——
  // 之後 coin-policy 進版時，那些從來沒被定價的任務會看起來像是重新算過。
  const byEligibility = rewardPolicyVersionFor('eligibility_policy');
  const byCoinPolicy = rewardPolicyVersionFor('coin_policy', policy.version);

  switch (rewardPolicy) {
    case 'record_only':
      return {
        rewardPolicy,
        eligibility: 'allowed',
        coin: null,
        rewardPolicyVersion: byEligibility,
        explanation: '完成後只留下紀錄，不發成長幣。',
      };

    case 'family_contribution':
      return {
        rewardPolicy,
        eligibility: 'allowed',
        coin: null,
        rewardPolicyVersion: byEligibility,
        explanation: '家庭參與以貢獻紀錄與週報被看見，不發成長幣，也不累積時間儲蓄。',
      };

    case 'progress_only':
      return {
        rewardPolicy,
        eligibility: 'allowed',
        coin: null,
        rewardPolicyVersion: byEligibility,
        explanation: '以進度與肯定回饋，不發成長幣。',
      };

    case 'time_saving_eligible':
      return {
        rewardPolicy,
        eligibility: 'blocked',
        coin: null,
        rewardPolicyVersion: byEligibility,
        code: 'TIME_SAVING_NOT_ENABLED',
        explanation: '時間儲蓄的建立與兌換流程尚未啟用，這個選項目前不能使用。',
      };

    case 'coin_eligible': {
      const coinCategory = COIN_CATEGORY_BY_PURPOSE[command.task.purposeCategory];

      // A（生活常規）／B（家庭參與）在資格層就不發幣。
      if (coinCategory === null) {
        return {
          rewardPolicy,
          eligibility: 'blocked',
          coin: null,
          rewardPolicyVersion: byEligibility,
          code: 'POLICY_REJECTED',
          explanation:
            command.task.purposeCategory === 'family_participation'
              ? '家庭參與不發成長幣，請改用貢獻紀錄。'
              : '生活常規不作固定賺幣來源，請改用進度與肯定回饋。',
        };
      }

      const estimatedMinutes = command.schedule.estimatedMinutes;
      if (estimatedMinutes === undefined) {
        return {
          rewardPolicy,
          eligibility: 'blocked',
          coin: null,
          rewardPolicyVersion: byCoinPolicy,
          code: 'COIN_POLICY_UNAVAILABLE',
          explanation:
            '沒有估計投入時間，幣值政策沒有依據可以定價。設定每次大約做多久之後就能發幣。',
        };
      }

      const pricing = policy.price(childAgeGroup, coinCategory, estimatedMinutes, difficulty);

      if (pricing.status === 'coin_disabled') {
        return {
          rewardPolicy,
          eligibility: 'blocked',
          coin: null,
          rewardPolicyVersion: byCoinPolicy,
          code: 'POLICY_REJECTED',
          explanation: pricing.reason,
        };
      }

      if (pricing.status === 'unpriced') {
        return {
          rewardPolicy,
          eligibility: 'blocked',
          coin: null,
          rewardPolicyVersion: byCoinPolicy,
          code: 'COIN_POLICY_UNAVAILABLE',
          explanation: `${pricing.reason}。在政策補上之前不建立可發幣的任務。`,
        };
      }

      // 政策自己算出來的東西仍然要檢查一次：這條線一旦鬆掉，
      // 就會出現 0 幣或超出範圍的 coin_eligible 任務。這裡只檢查政策的建議值，
      // 跟家長有沒有調整無關 —— coinOverride 一定會被 clamp，不可能落到範圍外。
      if (
        !Number.isInteger(pricing.suggestedAmount)
        || pricing.suggestedAmount <= 0
        || pricing.suggestedAmount < pricing.minAllowed
        || pricing.suggestedAmount > pricing.maxAllowed
      ) {
        return {
          rewardPolicy,
          eligibility: 'blocked',
          coin: null,
          rewardPolicyVersion: byCoinPolicy,
          code: 'COIN_POLICY_UNAVAILABLE',
          explanation: `政策算出的幣值 ${pricing.suggestedAmount} 不在允許範圍 ${pricing.minAllowed}–${pricing.maxAllowed} 內。`,
        };
      }

      const finalAmount = coinOverride === undefined
        ? pricing.suggestedAmount
        : clampCoinOverride(coinOverride, pricing.minAllowed, pricing.maxAllowed);

      const difficultyNote = pricing.difficultySpecified
        ? `難度 ${pricing.difficulty}`
        : `難度未指定，套用政策的 ${pricing.difficulty}（不加不減）`;

      return {
        rewardPolicy,
        eligibility: 'allowed',
        coin: {
          suggestedAmount: pricing.suggestedAmount,
          finalAmount,
          minAllowed: pricing.minAllowed,
          maxAllowed: pricing.maxAllowed,
          calculationBasis: basisOf(command, childAgeGroup, {
            difficulty: pricing.difficulty,
            band: pricing.band,
          }),
        },
        rewardPolicyVersion: byCoinPolicy,
        explanation:
          `${childAgeGroup} 歲段、${coinCategory} 類、每次約 ${estimatedMinutes} 分鐘`
          + `（時間分級 ${pricing.band}，${difficultyNote}）`
          + `，建議 ${pricing.suggestedAmount} 幣，可調整範圍 ${pricing.minAllowed}–${pricing.maxAllowed}。`,
      };
    }
  }
}

/** 對外暴露 basis 建構，讓呼叫端在測試裡比對稽核欄位。 */
export { basisOf as buildCalculationBasis };
