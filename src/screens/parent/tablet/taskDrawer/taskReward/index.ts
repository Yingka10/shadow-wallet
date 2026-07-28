// Shadow Wallet · Parent Tablet — 回饋決策層對外入口
//
// 這一層是純 domain：沒有 React、沒有 Supabase、沒有 AI。
// 幣值數字全部來自 supabase/functions/ai-proxy/coin-policy.json（版本化、已定案）。

export {
  COIN_POLICY_EFFECTIVE_DATE,
  COIN_POLICY_VERSION,
  DEFAULT_COIN_DIFFICULTY,
  priceCoin,
  resolveBand,
  type CoinAgeGroup,
  type CoinBandId,
  type CoinCategory,
  type CoinDifficulty,
  type CoinPricing,
} from './coinPolicy';

export {
  REWARD_ELIGIBILITY_POLICY_VERSION,
  rewardPolicyVersionFor,
  type RewardPolicySource,
} from './rewardPolicyVersion';

export {
  DEFAULT_COIN_POLICY_SOURCE,
  buildCalculationBasis,
  evaluateTaskReward,
  type EvaluateTaskRewardInput,
  type TaskRewardPolicySource,
} from './evaluateTaskReward';

export {
  COIN_UNAVAILABLE_NOTE,
  TIME_SAVING_ENABLED,
  TIME_SAVING_UNAVAILABLE_NOTE,
  resolveInitialRewardPolicy,
  resolveTaskRewardCapabilities,
  selectAvailableRewardPolicies,
  type ResolveCapabilitiesInput,
  type SelectRewardPoliciesInput,
} from './selectAvailableRewardPolicies';

export type {
  RewardPolicyOption,
  TaskRewardBlockedCode,
  TaskRewardCalculationBasis,
  TaskRewardCapabilities,
  TaskRewardCoin,
  TaskRewardDecision,
} from './types';
