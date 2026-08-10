// Shadow Wallet · Parent Tablet — 回饋方式選單
//
// 集中在這裡而不是讓五支 editor 各自 filter：五份判斷一定會有一份忘記更新，
// 而忘記的那一份就是家長選了、按下建立、才被 RPC 拒絕的地方。
//
// demo 與 development 的差別只有「看不看得到不能用的選項」：
//   demo        —— 直接不列出來，家長不會看到選不到的東西
//   development —— 列出來但標示原因，開發時才知道是被能力擋掉而不是漏寫
// 功能本身兩種模式完全一樣：不能用就是不能用。

import type { PurposeCategory, RewardPolicy } from '../taskCatalog';
import type { PresetTaskDrawerDisplayMode } from '../displayMode';
import { priceCoin, type CoinCategory, type CoinDifficulty } from './coinPolicy';
import type { RewardPolicyOption, TaskRewardCapabilities } from './types';

const COIN_CATEGORY_BY_PURPOSE: Record<PurposeCategory, CoinCategory | null> = {
  life_routine: null,
  family_participation: null,
  autonomous_challenge: 'C',
  learning_skill: 'D',
};

/**
 * 時間儲蓄尚未啟用。
 *
 * 三件事都還沒有：建立端（create_parent_task_v1 直接 POLICY_REJECTED）、
 * 完成端（complete_task 回 time_saving_not_enabled）、兌換端（完全不存在）。
 * 型別與 catalog 資料都保留，之後打通時把這個常數改掉即可。
 */
export const TIME_SAVING_ENABLED = false as const;

export const TIME_SAVING_UNAVAILABLE_NOTE = '尚未啟用';
export const COIN_UNAVAILABLE_NOTE = '這個設定算不出幣值';

export type ResolveCapabilitiesInput = {
  /** 與 lib/onboarding 的 AgeGroup 對齊。 */
  ageGroup: string;
  purposeCategory: PurposeCategory;
  /** 沒有估計分鐘就對應不到政策的時間分級。 */
  estimatedMinutes?: number;
  difficulty?: CoinDifficulty;
};

/**
 * 算出這個情境下真的能用哪些回饋方式。
 *
 * coinRewardsEnabled 不是一個全域開關 —— 它問的是「政策現在算不算得出這筆任務的幣值」。
 * 同一台裝置上，有估計分鐘的練琴任務算得出來，沒有估計分鐘的自主挑戰算不出來，
 * 兩者的答案本來就該不同。
 */
export function resolveTaskRewardCapabilities(
  input: ResolveCapabilitiesInput,
): TaskRewardCapabilities {
  const coinCategory = COIN_CATEGORY_BY_PURPOSE[input.purposeCategory];

  if (coinCategory === null || input.estimatedMinutes === undefined) {
    return { coinRewardsEnabled: false, timeSavingEnabled: TIME_SAVING_ENABLED };
  }

  const pricing = priceCoin(
    input.ageGroup,
    coinCategory,
    input.estimatedMinutes,
    input.difficulty,
  );

  return {
    coinRewardsEnabled: pricing.status === 'priced',
    timeSavingEnabled: TIME_SAVING_ENABLED,
  };
}

export type SelectRewardPoliciesInput = {
  allowedRewardPolicies: readonly RewardPolicy[];
  displayMode: PresetTaskDrawerDisplayMode;
  capabilities: TaskRewardCapabilities;
};

function availabilityOf(
  policy: RewardPolicy,
  capabilities: TaskRewardCapabilities,
): { available: boolean; unavailableNote?: string } {
  if (policy === 'time_saving_eligible') {
    return capabilities.timeSavingEnabled
      ? { available: true }
      : { available: false, unavailableNote: TIME_SAVING_UNAVAILABLE_NOTE };
  }
  if (policy === 'coin_eligible') {
    return capabilities.coinRewardsEnabled
      ? { available: true }
      : { available: false, unavailableNote: COIN_UNAVAILABLE_NOTE };
  }
  return { available: true };
}

/**
 * catalog 允許的回饋方式 → 這一刻真的列得出來的選項。
 *
 * demo 只回傳能用的；development 全部回傳並標示原因。
 */
export function selectAvailableRewardPolicies(
  input: SelectRewardPoliciesInput,
): RewardPolicyOption[] {
  const options: RewardPolicyOption[] = [];

  for (const policy of input.allowedRewardPolicies) {
    const { available, unavailableNote } = availabilityOf(policy, input.capabilities);

    if (!available && input.displayMode !== 'development') continue;

    options.push({
      policy,
      available,
      ...(unavailableNote !== undefined && !available ? { unavailableNote } : null),
    });
  }

  return options;
}

/**
 * 草稿一開始要選哪一個回饋方式。
 *
 * catalog 的預設值可能是現在用不了的（例如自主挑戰預設可發幣，但沒有估計分鐘），
 * 這時退到第一個能用的，而不是讓家長進到畫面就看到一個沒有選中項的選單。
 * 完全沒有可用選項時回 undefined —— 呼叫端保留 catalog 預設，讓問題浮出來而不是靜靜吞掉。
 */
export function resolveInitialRewardPolicy(
  allowedRewardPolicies: readonly RewardPolicy[],
  defaultRewardPolicy: RewardPolicy,
  capabilities: TaskRewardCapabilities,
): RewardPolicy | undefined {
  if (availabilityOf(defaultRewardPolicy, capabilities).available) return defaultRewardPolicy;

  for (const policy of allowedRewardPolicies) {
    if (availabilityOf(policy, capabilities).available) return policy;
  }

  return undefined;
}
