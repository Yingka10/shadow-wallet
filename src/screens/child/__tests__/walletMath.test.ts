import {
  calculatePatienceBonus,
  calculateWalletTotals,
  summarizeEarnedCoins,
} from '../walletMath';

describe('walletMath', () => {
  it('keeps the hero total separate from spendable and saved coins', () => {
    expect(calculateWalletTotals(142, 20)).toEqual({
      totalBalance: 162,
      spendingBalance: 142,
      savingBalance: 20,
    });
  });

  it('summarizes today and this week from real earn records only', () => {
    const now = new Date('2026-07-07T12:00:00+08:00');

    const stats = summarizeEarnedCoins(
      [
        { amount: 8, type: 'earn', createdAt: '2026-07-07T08:00:00+08:00' },
        { amount: 48, type: 'earn', createdAt: '2026-07-06T08:00:00+08:00' },
        { amount: 57, type: 'earn', createdAt: '2026-06-30T08:00:00+08:00' },
        { amount: 20, type: 'adjust', createdAt: '2026-07-07T09:00:00+08:00' },
      ],
      now,
    );

    expect(stats).toEqual({ todayEarned: 8, weekEarned: 56 });
  });

  it('turns a percentage setting into a child-facing patience bonus', () => {
    expect(calculatePatienceBonus(20, 5)).toBe(1);
    expect(calculatePatienceBonus(0, 5)).toBe(0);
  });
});
