// Shadow Wallet · Parent Tablet — 命令 ＋ 回饋決策 → 完整建立命令
//
// 這一步存在的唯一理由是「不要讓兩個地方各自記著這筆任務的回饋方式」。
// task.rewardPolicy 來自家長在畫面上選的，decision.rewardPolicy 來自政策評估；
// 兩者不一致就代表中間有人改過其中一邊 —— 那不是可以靜靜修正的小事，
// 而是「畫面顯示的回饋」與「實際會發的東西」不同，必須擋下來。

import type { TaskRewardDecision } from '../taskReward/types';
import type { CreateParentTaskCommand, CreateParentTaskCommandBase } from './types';

export type FinalizeCommandFailureCode =
  /** 決策的政策與命令上的不同。 */
  | 'REWARD_POLICY_MISMATCH'
  /** 決策本身是 blocked，不可以拿去建立任務。 */
  | 'REWARD_BLOCKED'
  /** coin_eligible 但金額不合法（0、非整數、超出範圍）。 */
  | 'REWARD_AMOUNT_INVALID'
  /** 缺 rewardPolicyVersion，事後無法稽核這個結果是哪一版政策做的。 */
  | 'REWARD_POLICY_VERSION_MISSING';

export type FinalizeCommandResult =
  | { ok: true; command: CreateParentTaskCommand }
  | { ok: false; code: FinalizeCommandFailureCode; message: string };

/**
 * 把回饋決策併進命令，並在此擋下所有「看起來可以建立、實際會發錯東西」的組合。
 *
 * 這些檢查在 RPC 裡還會再做一次。重複是刻意的：
 * 前端這一份讓家長早一點看到原因，SQL 那一份讓繞過前端的呼叫也擋得住。
 */
export function finalizeCreateParentTaskCommand(
  base: CreateParentTaskCommandBase,
  decision: TaskRewardDecision,
): FinalizeCommandResult {
  if (base.task.rewardPolicy !== decision.rewardPolicy) {
    return {
      ok: false,
      code: 'REWARD_POLICY_MISMATCH',
      message: `任務的回饋方式是 ${base.task.rewardPolicy}，決策的是 ${decision.rewardPolicy}。`,
    };
  }

  if (!decision.rewardPolicyVersion) {
    return {
      ok: false,
      code: 'REWARD_POLICY_VERSION_MISSING',
      message: '回饋決策沒有政策版本，之後無法稽核這個結果是依哪一版算的。',
    };
  }

  if (decision.eligibility === 'blocked') {
    return {
      ok: false,
      code: 'REWARD_BLOCKED',
      message: decision.explanation,
    };
  }

  if (decision.rewardPolicy === 'coin_eligible') {
    const { finalAmount, minAllowed, maxAllowed } = decision.coin;

    if (!Number.isInteger(finalAmount) || finalAmount <= 0) {
      return {
        ok: false,
        code: 'REWARD_AMOUNT_INVALID',
        message: '可獲得成長幣的任務必須有正整數幣值，不能建立 0 幣任務。',
      };
    }
    if (finalAmount < minAllowed || finalAmount > maxAllowed) {
      return {
        ok: false,
        code: 'REWARD_AMOUNT_INVALID',
        message: `幣值 ${finalAmount} 不在政策允許的 ${minAllowed}–${maxAllowed} 範圍內。`,
      };
    }
  }

  return { ok: true, command: { ...base, reward: { decision } } };
}
