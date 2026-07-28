// 第七階段 B — 回饋決策
//
// 這一支盯的是一件事：**不可以出現 0 幣的「可獲得成長幣」任務**。
// 政策算不出來的時候要 blocked，不是回 0；也不可以自己編一個看起來合理的數字。

import { createTaskDraft, type DraftChildContext } from '../../taskDraft';
import { mapTaskDraftToCommand } from '../../taskPersistence';
import type { CreateParentTaskCommandBase } from '../../taskPersistence/types';
import {
  ALL_FAMILIES,
  TASK_POLICY_VERSION,
  type TaskPresetFamily,
  type TaskPresetVariant,
} from '../../taskCatalog';
import { COIN_POLICY_VERSION, priceCoin } from '../coinPolicy';
import {
  DEFAULT_COIN_POLICY_SOURCE,
  evaluateTaskReward,
  type TaskRewardPolicySource,
} from '../evaluateTaskReward';
import { REWARD_ELIGIBILITY_POLICY_VERSION } from '../rewardPolicyVersion';
import type { RewardPolicy } from '../../taskCatalog';

const CHILD: DraftChildContext = {
  nickname: '承恩',
  birthDate: '2018-03-05',
  familyId: 'family-1',
};

function pick(familyId: string, variantId?: string): [TaskPresetFamily, TaskPresetVariant] {
  const family = ALL_FAMILIES.find(f => f.id === familyId);
  if (!family) throw new Error(`family not found: ${familyId}`);
  const variant = variantId
    ? family.variants.find(v => v.id === variantId)
    : family.variants[0];
  if (!variant) throw new Error(`variant not found: ${variantId}`);
  return [family, variant];
}

/** 用真的 catalog 造一份命令，再視需要覆寫回饋方式。 */
function commandFor(
  familyId: string,
  variantId?: string,
  overrides?: { rewardPolicy?: RewardPolicy; estimatedMinutes?: number | undefined },
): CreateParentTaskCommandBase {
  const [family, variant] = pick(familyId, variantId);
  const draft = createTaskDraft(family, variant, CHILD, '6-9');
  const command = mapTaskDraftToCommand({
    draft,
    family,
    variant,
    child: { id: 'child-1', familyId: 'family-1', ageGroup: '6-9' },
    taskPolicyVersion: TASK_POLICY_VERSION,
  });

  const schedule = { ...command.schedule };
  if (overrides && 'estimatedMinutes' in overrides) {
    if (overrides.estimatedMinutes === undefined) delete schedule.estimatedMinutes;
    else schedule.estimatedMinutes = overrides.estimatedMinutes;
  }

  return {
    ...command,
    task: { ...command.task, ...(overrides?.rewardPolicy ? { rewardPolicy: overrides.rewardPolicy } : null) },
    schedule,
  };
}

function evaluate(command: CreateParentTaskCommandBase, ageGroup = '6-9', policy?: TaskRewardPolicySource) {
  return evaluateTaskReward({
    command,
    childAgeGroup: ageGroup,
    ...(policy ? { policy } : null),
  });
}

// ---------------------------------------------------------------------------
// 1-3. 不發幣的政策
// ---------------------------------------------------------------------------

describe('不發幣的回饋方式', () => {
  it('家庭參與：允許，但不帶任何幣值', () => {
    const decision = evaluate(commandFor('fam-set-table'));
    expect(decision.rewardPolicy).toBe('family_contribution');
    expect(decision.eligibility).toBe('allowed');
    expect(decision.coin).toBeNull();
  });

  it('只留下紀錄（學校作業）：允許，不帶幣值', () => {
    const decision = evaluate(commandFor('learn-school-assignment'));
    expect(decision.rewardPolicy).toBe('record_only');
    expect(decision.eligibility).toBe('allowed');
    expect(decision.coin).toBeNull();
  });

  it('只記進度（生活小計畫）：允許，不帶幣值', () => {
    const command = commandFor('learn-reading', 'learn-reading-recurring', {
      rewardPolicy: 'progress_only',
    });
    const decision = evaluate(command);
    expect(decision.rewardPolicy).toBe('progress_only');
    expect(decision.eligibility).toBe('allowed');
    expect(decision.coin).toBeNull();
  });

  it('帶的是回饋資格政策的版本，不是幣值政策的版本', () => {
    // 這些任務從來沒有經過幣值計算。蓋上 coin-policy 的版本是假的：
    // 之後 coin-policy 進版時，它們會看起來像是被重新定價過。
    for (const familyId of ['fam-set-table', 'learn-school-assignment']) {
      const decision = evaluate(commandFor(familyId));
      expect(decision.rewardPolicyVersion).toBe(REWARD_ELIGIBILITY_POLICY_VERSION);
      expect(decision.rewardPolicyVersion).not.toBe(COIN_POLICY_VERSION);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. 時間儲蓄
// ---------------------------------------------------------------------------

describe('時間儲蓄', () => {
  it('一律 blocked，而且不降級成 coin 或 record_only', () => {
    const command = commandFor('learn-reading', 'learn-reading-recurring', {
      rewardPolicy: 'time_saving_eligible',
    });
    const decision = evaluate(command);

    expect(decision.eligibility).toBe('blocked');
    if (decision.eligibility !== 'blocked') throw new Error('unreachable');
    expect(decision.code).toBe('TIME_SAVING_NOT_ENABLED');
    // 回饋方式沒有被偷偷換掉。
    expect(decision.rewardPolicy).toBe('time_saving_eligible');
    expect(decision.coin).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5-7. 可發幣
// ---------------------------------------------------------------------------

describe('可獲得成長幣', () => {
  it('有估計分鐘時算得出正整數幣值，並帶著政策允許範圍', () => {
    const decision = evaluate(commandFor('learn-reading', 'learn-reading-recurring'));

    expect(decision.rewardPolicy).toBe('coin_eligible');
    expect(decision.eligibility).toBe('allowed');
    if (decision.eligibility !== 'allowed' || decision.coin === null) {
      throw new Error('unreachable');
    }
    expect(Number.isInteger(decision.coin.suggestedAmount)).toBe(true);
    expect(decision.coin.suggestedAmount).toBeGreaterThan(0);
    expect(decision.coin.finalAmount).toBeGreaterThanOrEqual(decision.coin.minAllowed);
    expect(decision.coin.finalAmount).toBeLessThanOrEqual(decision.coin.maxAllowed);
  });

  it('金額與政策直接算出來的一致 —— 沒有在中間加自己的係數', () => {
    const command = commandFor('learn-reading', 'learn-reading-recurring');
    const minutes = command.schedule.estimatedMinutes;
    if (minutes === undefined) throw new Error('這個 variant 應該有估計分鐘');

    const pricing = priceCoin('6-9', 'D', minutes);
    if (pricing.status !== 'priced') throw new Error('這個組合應該算得出幣值');

    const decision = evaluate(command);
    if (decision.eligibility !== 'allowed' || decision.coin === null) {
      throw new Error('unreachable');
    }
    expect(decision.coin.finalAmount).toBe(pricing.suggestedAmount);
    expect(decision.coin.minAllowed).toBe(pricing.minAllowed);
    expect(decision.coin.maxAllowed).toBe(pricing.maxAllowed);
  });

  it('計算依據被保存下來：年齡、目的、分鐘、期間形式、排程、難度、時間分級', () => {
    const decision = evaluate(commandFor('learn-reading', 'learn-reading-recurring'));
    if (decision.eligibility !== 'allowed' || decision.coin === null) {
      throw new Error('unreachable');
    }
    const basis = decision.coin.calculationBasis;

    expect(basis.ageGroup).toBe('6-9');
    expect(basis.purposeCategory).toBe('learning_skill');
    expect(basis.estimatedMinutes).toBeGreaterThan(0);
    expect(basis.durationType).toBe('recurring');
    expect(basis.scheduleMode).toBe('fixed_days');
    expect(basis.recurrenceDays?.length).toBeGreaterThan(0);
    // 抽屜沒有難度輸入，套用 policy 的中性值 —— 但仍然要記下來套的是哪一個。
    expect(basis.difficulty).toBe('standard');
    expect(basis.band).toBeTruthy();
  });

  it('難度會改變金額，而且是政策的 difficultyDelta 在改', () => {
    const command = commandFor('learn-reading', 'learn-reading-recurring');
    const easy = evaluateTaskReward({ command, childAgeGroup: '6-9', difficulty: 'easy' });
    const hard = evaluateTaskReward({ command, childAgeGroup: '6-9', difficulty: 'hard' });

    if (easy.eligibility !== 'allowed' || easy.coin === null) throw new Error('unreachable');
    if (hard.eligibility !== 'allowed' || hard.coin === null) throw new Error('unreachable');
    expect(hard.coin.finalAmount).toBeGreaterThan(easy.coin.finalAmount);
    expect(easy.coin.calculationBasis.difficulty).toBe('easy');
  });

  it('每週次數模式的次數也在計算依據裡', () => {
    const base = commandFor('learn-reading', 'learn-reading-recurring');
    const command: CreateParentTaskCommandBase = {
      ...base,
      schedule: { ...base.schedule, mode: 'weekly_frequency', weeklyFrequency: 3 },
    };
    const decision = evaluate(command);
    if (decision.eligibility !== 'allowed' || decision.coin === null) {
      throw new Error('unreachable');
    }
    expect(decision.coin.calculationBasis.weeklyFrequency).toBe(3);
    expect(decision.coin.calculationBasis.scheduleMode).toBe('weekly_frequency');
  });
});

// ---------------------------------------------------------------------------
// 8-10. 政策算不出來的時候
// ---------------------------------------------------------------------------

describe('政策算不出幣值時', () => {
  it('沒有估計分鐘 → blocked，不是 0 幣', () => {
    const command = commandFor('learn-reading', 'learn-reading-recurring', {
      estimatedMinutes: undefined,
    });
    const decision = evaluate(command);

    expect(decision.eligibility).toBe('blocked');
    if (decision.eligibility !== 'blocked') throw new Error('unreachable');
    expect(decision.code).toBe('COIN_POLICY_UNAVAILABLE');
    expect(decision.coin).toBeNull();
    // 沒有任何地方出現 0 這個「看起來像答案」的數字。
    expect(JSON.stringify(decision)).not.toContain('"finalAmount"');
  });

  it('2-4 歲：政策明說不發幣 → blocked', () => {
    const decision = evaluate(commandFor('learn-reading', 'learn-reading-recurring'), '2-4');
    expect(decision.eligibility).toBe('blocked');
    if (decision.eligibility !== 'blocked') throw new Error('unreachable');
    expect(decision.code).toBe('POLICY_REJECTED');
  });

  it('政策整份不可用（模擬未定案）→ blocked，不 fallback 成 0', () => {
    const unavailable: TaskRewardPolicySource = {
      version: 'coin-policy-unreleased',
      price: () => ({ status: 'unpriced', reason: '政策尚未定案' }),
    };
    const decision = evaluate(
      commandFor('learn-reading', 'learn-reading-recurring'),
      '6-9',
      unavailable,
    );

    expect(decision.eligibility).toBe('blocked');
    if (decision.eligibility !== 'blocked') throw new Error('unreachable');
    expect(decision.code).toBe('COIN_POLICY_UNAVAILABLE');
    expect(decision.rewardPolicyVersion).toBe('coin-policy-unreleased');
  });

  it('政策算出 0 或超出範圍時也擋下來，不寫進任務', () => {
    const broken: TaskRewardPolicySource = {
      version: 'coin-policy-broken',
      price: () => ({
        status: 'priced',
        suggestedAmount: 0,
        minAllowed: 5,
        maxAllowed: 25,
        band: '11-20',
        difficulty: 'standard',
        difficultySpecified: false,
      }),
    };
    const decision = evaluate(
      commandFor('learn-reading', 'learn-reading-recurring'),
      '6-9',
      broken,
    );
    expect(decision.eligibility).toBe('blocked');
  });

  it('家庭參與選了可發幣 → blocked（A/B 不發幣是硬規則）', () => {
    const command = commandFor('fam-set-table', undefined, { rewardPolicy: 'coin_eligible' });
    const decision = evaluate(command);

    expect(decision.eligibility).toBe('blocked');
    if (decision.eligibility !== 'blocked') throw new Error('unreachable');
    expect(decision.code).toBe('POLICY_REJECTED');
    expect(decision.explanation).toContain('家庭參與');
  });
});

// ---------------------------------------------------------------------------
// 政策版本
// ---------------------------------------------------------------------------

describe('政策版本', () => {
  it('每一種結果都帶版本，包含 blocked', () => {
    const cases: CreateParentTaskCommandBase[] = [
      commandFor('fam-set-table'),
      commandFor('learn-reading', 'learn-reading-recurring'),
      commandFor('learn-reading', 'learn-reading-recurring', {
        rewardPolicy: 'time_saving_eligible',
      }),
      commandFor('learn-reading', 'learn-reading-recurring', { estimatedMinutes: undefined }),
    ];
    for (const command of cases) {
      expect(evaluate(command).rewardPolicyVersion).toBeTruthy();
    }
  });

  it('版本來源依決策路徑而定：算過幣的是幣值政策，沒算過的是資格政策', () => {
    const byCoin = [
      // 真的定過價
      commandFor('learn-reading', 'learn-reading-recurring'),
      // 幣值政策說「這個設定我算不出來」——仍然是幣值政策做的判斷
      commandFor('learn-reading', 'learn-reading-recurring', { estimatedMinutes: undefined }),
    ];
    for (const command of byCoin) {
      expect(evaluate(command).rewardPolicyVersion).toBe(COIN_POLICY_VERSION);
    }

    const byEligibility = [
      // 不發幣的政策：沒有進幣值計算
      commandFor('fam-set-table'),
      // 時間儲蓄：資格層就擋掉
      commandFor('learn-reading', 'learn-reading-recurring', {
        rewardPolicy: 'time_saving_eligible',
      }),
      // 家庭參與選了可發幣：資格層的硬規則擋掉，沒有走到定價
      commandFor('fam-set-table', undefined, { rewardPolicy: 'coin_eligible' }),
    ];
    for (const command of byEligibility) {
      expect(evaluate(command).rewardPolicyVersion).toBe(REWARD_ELIGIBILITY_POLICY_VERSION);
    }
  });

  it('rewardPolicyVersion 與 taskPolicyVersion 是不同的東西，值也不同', () => {
    const command = commandFor('learn-reading', 'learn-reading-recurring');
    expect(command.metadata.taskPolicyVersion).toBe(TASK_POLICY_VERSION);
    expect(evaluate(command).rewardPolicyVersion).not.toBe(TASK_POLICY_VERSION);
  });

  it('幣值政策換版時，任務政策版本不跟著動', () => {
    const command = commandFor('learn-reading', 'learn-reading-recurring');
    const other = evaluate(command, '6-9', {
      version: 'coin-policy-9.9.9',
      price: DEFAULT_COIN_POLICY_SOURCE.price,
    });
    expect(other.rewardPolicyVersion).toBe('coin-policy-9.9.9');
    // 命令上的任務政策版本完全不受影響。
    expect(command.metadata.taskPolicyVersion).toBe(TASK_POLICY_VERSION);
  });

  it('catalog 換版時，回饋政策版本不跟著動', () => {
    const command = commandFor('learn-reading', 'learn-reading-recurring');
    const bumped: CreateParentTaskCommandBase = {
      ...command,
      metadata: { ...command.metadata, presetCatalogVersion: '2099-01-01' },
    };
    expect(evaluate(bumped).rewardPolicyVersion).toBe(evaluate(command).rewardPolicyVersion);
  });
});
