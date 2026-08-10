// 第七階段 B — 命令 ＋ 回饋決策
//
// 這一步只做一件事：確保「畫面上顯示的回饋方式」與「實際會發的東西」是同一個，
// 而且可發幣的任務一定帶得出金額、範圍與政策版本。

import { createTaskDraft, type DraftChildContext } from '../../taskDraft';
import { ALL_FAMILIES, TASK_POLICY_VERSION } from '../../taskCatalog';
import { COIN_POLICY_VERSION, evaluateTaskReward } from '../../taskReward';
import type { TaskRewardDecision } from '../../taskReward';
import { mapTaskDraftToCommand } from '../mapTaskDraftToCommand';
import { finalizeCreateParentTaskCommand } from '../finalizeCreateParentTaskCommand';
import type { CreateParentTaskCommandBase } from '../types';

/** 固定的建立請求識別碼。映射本身不看它的內容，只要求它存在。 */
const REQUEST_ID = '6f1c0f7e-2a4b-4c9d-8e12-3b5a7c9d0e11';

const CHILD: DraftChildContext = {
  nickname: '承恩',
  birthDate: '2018-03-05',
  familyId: 'family-1',
};

function baseCommand(familyId: string, variantId?: string): CreateParentTaskCommandBase {
  const family = ALL_FAMILIES.find(f => f.id === familyId);
  if (!family) throw new Error(`family not found: ${familyId}`);
  const variant = variantId
    ? family.variants.find(v => v.id === variantId) ?? family.variants[0]
    : family.variants[0];

  return mapTaskDraftToCommand({
    draft: createTaskDraft(family, variant, CHILD, '6-9'),
    family,
    variant,
    child: { id: 'child-1', familyId: 'family-1', ageGroup: '6-9' },
    taskPolicyVersion: TASK_POLICY_VERSION, clientRequestId: REQUEST_ID,
  });
}

function decisionFor(command: CreateParentTaskCommandBase): TaskRewardDecision {
  return evaluateTaskReward({ command, childAgeGroup: '6-9' });
}

// ---------------------------------------------------------------------------
// 11. 決策被帶進命令
// ---------------------------------------------------------------------------

describe('決策併進命令', () => {
  it('映射本身不算幣值 —— base 命令上沒有 reward', () => {
    const base = baseCommand('learn-reading', 'learn-reading-recurring');
    expect('reward' in base).toBe(false);
  });

  it('finalize 之後命令帶著完整決策', () => {
    const base = baseCommand('learn-reading', 'learn-reading-recurring');
    const result = finalizeCreateParentTaskCommand(base, decisionFor(base));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.command.reward.decision.rewardPolicy).toBe('coin_eligible');
    expect(result.command.reward.decision.rewardPolicyVersion).toBe(COIN_POLICY_VERSION);
  });

  it('其餘欄位原封不動', () => {
    const base = baseCommand('learn-reading', 'learn-reading-recurring');
    const result = finalizeCreateParentTaskCommand(base, decisionFor(base));
    if (!result.ok) throw new Error('unreachable');

    const { reward, ...rest } = result.command;
    expect(reward).toBeTruthy();
    expect(rest).toEqual(base);
  });
});

// ---------------------------------------------------------------------------
// 12. 稽核資料
// ---------------------------------------------------------------------------

describe('稽核資料', () => {
  it('建議值、最終值、範圍與計算依據都在', () => {
    const base = baseCommand('learn-reading', 'learn-reading-recurring');
    const result = finalizeCreateParentTaskCommand(base, decisionFor(base));
    if (!result.ok) throw new Error('unreachable');

    const decision = result.command.reward.decision;
    if (decision.eligibility !== 'allowed' || decision.coin === null) {
      throw new Error('這個 variant 應該算得出幣值');
    }

    expect(decision.coin.suggestedAmount).toBeGreaterThan(0);
    expect(decision.coin.finalAmount).toBeGreaterThan(0);
    expect(decision.coin.minAllowed).toBeGreaterThan(0);
    expect(decision.coin.maxAllowed).toBeGreaterThanOrEqual(decision.coin.minAllowed);
    expect(decision.coin.calculationBasis.ageGroup).toBe('6-9');
    expect(decision.explanation.length).toBeGreaterThan(0);
  });

  it('不發幣的政策不會夾帶假的幣值', () => {
    const base = baseCommand('fam-set-table');
    const result = finalizeCreateParentTaskCommand(base, decisionFor(base));
    if (!result.ok) throw new Error('unreachable');

    expect(result.command.reward.decision.coin).toBeNull();
    expect(JSON.stringify(result.command.reward)).not.toContain('finalAmount');
  });
});

// ---------------------------------------------------------------------------
// 13. 不一致與不合法
// ---------------------------------------------------------------------------

describe('擋下來的情況', () => {
  it('命令的回饋方式與決策不一致 → 拒絕', () => {
    const base = baseCommand('learn-reading', 'learn-reading-recurring');
    const decision = decisionFor(base);
    const mismatched: CreateParentTaskCommandBase = {
      ...base,
      task: { ...base.task, rewardPolicy: 'record_only' },
    };

    const result = finalizeCreateParentTaskCommand(mismatched, decision);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('REWARD_POLICY_MISMATCH');
  });

  it('blocked 的決策不可以拿去建立任務', () => {
    const base = baseCommand('learn-reading', 'learn-reading-recurring');
    const blocked: TaskRewardDecision = {
      rewardPolicy: 'coin_eligible',
      eligibility: 'blocked',
      coin: null,
      rewardPolicyVersion: COIN_POLICY_VERSION,
      code: 'COIN_POLICY_UNAVAILABLE',
      explanation: '沒有估計投入時間',
    };

    const result = finalizeCreateParentTaskCommand(base, blocked);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('REWARD_BLOCKED');
    expect(result.message).toContain('估計投入時間');
  });

  it('0 幣的可發幣任務 → 拒絕', () => {
    const base = baseCommand('learn-reading', 'learn-reading-recurring');
    const zero: TaskRewardDecision = {
      rewardPolicy: 'coin_eligible',
      eligibility: 'allowed',
      coin: {
        suggestedAmount: 10, finalAmount: 0, minAllowed: 5, maxAllowed: 25,
        calculationBasis: {
          ageGroup: '6-9', purposeCategory: 'learning_skill',
          durationType: 'recurring', scheduleMode: 'fixed_days',
        },
      },
      rewardPolicyVersion: COIN_POLICY_VERSION,
      explanation: '',
    };

    const result = finalizeCreateParentTaskCommand(base, zero);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('REWARD_AMOUNT_INVALID');
  });

  it('金額超出政策範圍 → 拒絕', () => {
    const base = baseCommand('learn-reading', 'learn-reading-recurring');
    const tooHigh: TaskRewardDecision = {
      rewardPolicy: 'coin_eligible',
      eligibility: 'allowed',
      coin: {
        suggestedAmount: 15, finalAmount: 999, minAllowed: 5, maxAllowed: 25,
        calculationBasis: {
          ageGroup: '6-9', purposeCategory: 'learning_skill',
          durationType: 'recurring', scheduleMode: 'fixed_days',
        },
      },
      rewardPolicyVersion: COIN_POLICY_VERSION,
      explanation: '',
    };

    const result = finalizeCreateParentTaskCommand(base, tooHigh);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('REWARD_AMOUNT_INVALID');
    expect(result.message).toContain('5–25');
  });

  it('缺政策版本 → 拒絕（之後無法稽核這個數字）', () => {
    const base = baseCommand('fam-set-table');
    const noVersion: TaskRewardDecision = {
      rewardPolicy: 'family_contribution',
      eligibility: 'allowed',
      coin: null,
      rewardPolicyVersion: '',
      explanation: '家庭參與不發幣',
    };

    const result = finalizeCreateParentTaskCommand(base, noVersion);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('REWARD_POLICY_VERSION_MISSING');
  });
});
