export type EarnedCoinRecord = {
  amount: number;
  type: string;
  createdAt: string;
};

export function calculateWalletTotals(spendingBalance: number, savingBalance: number) {
  return {
    totalBalance: spendingBalance + savingBalance,
    spendingBalance,
    savingBalance,
  };
}

export function calculatePatienceBonus(amount: number, interestRate: number): number {
  if (amount <= 0) return 0;
  return Math.max(1, Math.round(amount * (interestRate / 100)));
}

export function summarizeEarnedCoins(records: EarnedCoinRecord[], now: Date = new Date()) {
  const todayKey = toDateKey(now);
  const weekStart = startOfLocalWeek(now).getTime();
  const weekEnd = endOfLocalDay(now).getTime();

  return records.reduce(
    (sum, record) => {
      if (record.type !== 'earn' || record.amount <= 0) return sum;

      const created = new Date(record.createdAt);
      const createdTime = created.getTime();
      if (Number.isNaN(createdTime)) return sum;

      if (toDateKey(created) === todayKey) {
        sum.todayEarned += record.amount;
      }
      if (createdTime >= weekStart && createdTime <= weekEnd) {
        sum.weekEarned += record.amount;
      }

      return sum;
    },
    { todayEarned: 0, weekEarned: 0 },
  );
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfLocalWeek(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function endOfLocalDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}
