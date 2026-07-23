import {
  resolveBand,
  calcCoins,
  defaultPayout,
  POLICY_VERSION,
} from '../../../supabase/functions/ai-proxy/coinPolicy';

describe('resolveBand — 估時落到時間分級', () => {
  it.each([
    [3, '5-10'], // 低於最小併入第一段
    [5, '5-10'],
    [10, '5-10'],
    [11, '11-20'],
    [20, '11-20'],
    [21, '21-30'],
    [30, '21-30'],
    [31, '31-45'],
    [45, '31-45'],
    [46, '46+'],
    [120, '46+'],
  ])('%i 分 → band %s', (mins, expected) => {
    expect(resolveBand(mins as number)).toBe(expected);
  });
});

describe('calcCoins — band → baseCoins → 難度加減 → clamp', () => {
  it('6-9 D 練琴 30 分 standard → 15 幣（錨點）', () => {
    const r = calcCoins('6-9', 'D', 30, 'standard');
    expect(r).toEqual({ status: 'priced', coins: 15, band: '21-30', policyVersion: POLICY_VERSION });
  });

  it('6-9 C 25 分 hard → base 18 +2 = 20 幣', () => {
    const r = calcCoins('6-9', 'C', 25, 'hard');
    expect(r.status).toBe('priced');
    if (r.status === 'priced') expect(r.coins).toBe(20);
  });

  it('難度加減是加法不是乘法：easy = base − 1', () => {
    // 6-9 D band 11-20 base = 10 → easy 9
    const r = calcCoins('6-9', 'D', 15, 'easy');
    if (r.status === 'priced') expect(r.coins).toBe(9);
  });

  it('觸頂：6-9 C 46+ base 30 hard +2 = 32 → clamp 至 max 30', () => {
    const r = calcCoins('6-9', 'C', 60, 'hard');
    if (r.status === 'priced') expect(r.coins).toBe(30);
  });

  it('觸底：4-6 D band 5-10 base 2 easy −1 = 1 → 不低於 min 1', () => {
    const r = calcCoins('4-6', 'D', 8, 'easy');
    if (r.status === 'priced') expect(r.coins).toBe(1);
  });

  it('2-4 歲 C/D 不發幣 → coin_disabled', () => {
    expect(calcCoins('2-4', 'C', 20, 'standard').status).toBe('coin_disabled');
    expect(calcCoins('2-4', 'D', 20, 'standard').status).toBe('coin_disabled');
  });

  it('9-12 已定案，回 priced（非 unpriced）', () => {
    const r = calcCoins('9-12', 'D', 30, 'standard');
    expect(r.status).toBe('priced');
    if (r.status === 'priced') {
      expect(r.band).toBe('21-30');
      expect(r.coins).toBe(18); // base 18 + 0
    }
  });

  it('回傳一律帶目前 policyVersion 供稽核', () => {
    const r = calcCoins('6-9', 'C', 10, 'standard');
    if (r.status === 'priced') expect(r.policyVersion).toBe('coin-policy-1.0.0');
  });
});

describe('defaultPayout / POLICY_VERSION', () => {
  it('預設發放單位為每次完成、每天一次', () => {
    expect(defaultPayout()).toEqual({
      payoutBasis: 'per_completion',
      claimPeriod: 'day',
      maxClaimsPerPeriod: 1,
    });
  });

  it('POLICY_VERSION 為 coin-policy-1.0.0', () => {
    expect(POLICY_VERSION).toBe('coin-policy-1.0.0');
  });
});
