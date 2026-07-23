import {
  runEligibilityGate,
  type EligibilityInput,
} from '../../../supabase/functions/ai-proxy/rewardEligibility';

/** 產生一個「C 類、孩子提出、無風險」的基準輸入，各測試再覆寫需要的欄位。 */
function base(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    category: 'C',
    alternativeCategory: null,
    ageGroup: '6-9',
    taskSource: 'child',
    durationType: 'single',
    outcomeBased: false,
    needsClarification: false,
    clarificationQuestion: null,
    duplicateOfExisting: false,
    exceedsFrequency: false,
    ...overrides,
  };
}

describe('runEligibilityGate — 類別資格（硬規則）', () => {
  it('A 類禁止發幣，回饋方式為 life_progress，直接擋下', () => {
    const r = runEligibilityGate(base({ category: 'A' }));
    expect(r.coinEnabled).toBe(false);
    expect(r.rewardMode).toBe('life_progress');
    expect(r.gateBlocked).toBe(true);
  });

  it('B 類禁止發幣，回饋方式為 family_contribution（非時間儲蓄）', () => {
    const r = runEligibilityGate(base({ category: 'B' }));
    expect(r.coinEnabled).toBe(false);
    expect(r.rewardMode).toBe('family_contribution');
    expect(r.gateBlocked).toBe(true);
  });

  it('C 類（孩子提出、無風險）可發幣且不被擋下', () => {
    const r = runEligibilityGate(base());
    expect(r.coinEnabled).toBe(true);
    expect(r.rewardMode).toBe('coin_or_time');
    expect(r.gateBlocked).toBe(false);
    expect(r.blockingIssues).toHaveLength(0);
    expect(r.requiresConfirmation).toHaveLength(0);
  });

  it('D 類（無風險）可發幣', () => {
    const r = runEligibilityGate(base({ category: 'D' }));
    expect(r.coinEnabled).toBe(true);
    expect(r.gateBlocked).toBe(false);
  });
});

describe('runEligibilityGate — 來源與家庭責任偽裝', () => {
  it('C 類但來源為家長提出 → 需家長確認 B/C', () => {
    const r = runEligibilityGate(base({ taskSource: 'parent' }));
    expect(r.coinEnabled).toBe(true);
    expect(r.gateBlocked).toBe(true);
    expect(r.requiresConfirmation.join()).toMatch(/家長提出|B 類|確認/);
  });

  it('needsClarification 且 alternativeCategory=B → 需確認', () => {
    const r = runEligibilityGate(
      base({
        category: 'C',
        taskSource: 'child',
        needsClarification: true,
        alternativeCategory: 'B',
        clarificationQuestion: '這是固定分工還是額外幫忙？',
      }),
    );
    expect(r.requiresConfirmation).toContain('這是固定分工還是額外幫忙？');
    expect(r.gateBlocked).toBe(true);
    expect(r.clarificationQuestion).toBe('這是固定分工還是額外幫忙？');
  });
});

describe('runEligibilityGate — 擋下型風險', () => {
  it('結果導向 → blockingIssues 且擋下', () => {
    const r = runEligibilityGate(base({ outcomeBased: true }));
    expect(r.blockingIssues.join()).toMatch(/結果導向/);
    expect(r.gateBlocked).toBe(true);
  });

  it('2-4 歲不獨立發幣 → blockingIssues', () => {
    const r = runEligibilityGate(base({ ageGroup: '2-4' }));
    expect(r.blockingIssues.join()).toMatch(/2-4/);
    expect(r.gateBlocked).toBe(true);
  });

  it('重複任務 → blockingIssues', () => {
    const r = runEligibilityGate(base({ duplicateOfExisting: true }));
    expect(r.blockingIssues.join()).toMatch(/重複/);
    expect(r.gateBlocked).toBe(true);
  });

  it('超過頻率上限 → blockingIssues', () => {
    const r = runEligibilityGate(base({ exceedsFrequency: true }));
    expect(r.blockingIssues.join()).toMatch(/頻率|週期/);
    expect(r.gateBlocked).toBe(true);
  });
});
