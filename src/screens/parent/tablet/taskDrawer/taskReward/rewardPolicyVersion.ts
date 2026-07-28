// Shadow Wallet · Parent Tablet — 回饋政策的版本
//
// 「這個回饋決策是哪一份政策做的」有兩個可能的答案，而它們是不同的文件：
//
//   幣值政策     supabase/functions/ai-proxy/coin-policy.json
//                決定 C / D 任務值多少幣。改數字時 bump 它自己的 policyVersion。
//
//   資格政策     docs/SPEC_task-taxonomy-2026-07.md 第 2 節
//                決定「這個任務能不能發幣」——家庭參與不發幣、學校作業只留紀錄、
//                時間儲蓄尚未啟用。它不產生任何數字。
//
// 一筆 record_only 的任務沒有經過幣值計算，把 coin-policy 的版本蓋在它上面
// 是假的：之後 coin-policy 進版時，那些從來沒被定價的任務會看起來像是重新算過。
// 反過來，把任務分類版本（TASK_POLICY_VERSION）寫進 rewardPolicyVersion 也是假的 ——
// 那是「怎麼分類」的版本，不是「怎麼回饋」的版本。
//
// 所以這裡分開兩個常數，由 rewardPolicyVersionFor() 依決策的來源選一個。

import { COIN_POLICY_VERSION } from './coinPolicy';

/**
 * 回饋資格政策的版本。
 *
 * 對應 SPEC 第 2 節的八步資格閘門（實作在 supabase/functions/ai-proxy/
 * rewardEligibility.ts，那支目前沒有版本常數）。
 * 改動「哪一類任務可以發幣」這種規則時要一起進版。
 */
export const REWARD_ELIGIBILITY_POLICY_VERSION = 'reward-eligibility-2026-07';

export { COIN_POLICY_VERSION };

/** 這個決策是哪一份政策做的。 */
export type RewardPolicySource =
  /** 幣值由 coin-policy.json 算出（或它明說算不出來）。 */
  | 'coin_policy'
  /** 沒有進入幣值計算：資格政策就決定了回饋方式。 */
  | 'eligibility_policy';

export function rewardPolicyVersionFor(
  source: RewardPolicySource,
  coinPolicyVersion: string = COIN_POLICY_VERSION,
): string {
  return source === 'coin_policy' ? coinPolicyVersion : REWARD_ELIGIBILITY_POLICY_VERSION;
}
