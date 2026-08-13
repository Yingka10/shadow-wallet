import { decideCompletionFeedback } from '../completionFeedback';
import type { CompletionResult } from '../../../lib/taskActions';

function result(patch: Partial<CompletionResult> = {}): CompletionResult {
  return {
    completionId: 'c1',
    coinEarned: 0,
    timeSavedMin: 0,
    payoutBasis: null,
    payoutBasisUnsupported: false,
    period: null,
    settlement: null,
    milestone: null,
    ...patch,
  };
}

describe('per_period：達標之前一個幣值都不出現', () => {
  it.each([
    [1, 4, 3],
    [2, 4, 2],
    [3, 4, 1],
  ])('第 %i 次（本週 %i 次目標）只顯示投入紀錄', (done, target) => {
    const feedback = decideCompletionFeedback(
      result({
        payoutBasis: 'per_period',
        period: { start: '2026-08-10', done, target, settled: false },
      }),
      'D',
    );

    expect(feedback.type).toBe('period-progress');
    expect(feedback.value).toBe(0);
    expect(feedback.periodDone).toBe(done);
    expect(feedback.periodTarget).toBe(target);
  });

  it('達標那一次才是幣值畫面，金額用 settlement 的數字', () => {
    const feedback = decideCompletionFeedback(
      result({
        payoutBasis: 'per_period',
        coinEarned: 10,
        period: { start: '2026-08-10', done: 4, target: 4, settled: true },
        settlement: { basis: 'per_period', coinAmount: 10 },
      }),
      'D',
    );

    expect(feedback).toEqual({ type: 'task-c', value: 10 });
  });

  it('本期已結算過又完成一次：回到投入紀錄，不再播幣值', () => {
    const feedback = decideCompletionFeedback(
      result({
        payoutBasis: 'per_period',
        coinEarned: 0,
        period: { start: '2026-08-10', done: 5, target: 4, settled: true },
        settlement: null,
      }),
      'D',
    );

    expect(feedback.type).toBe('period-progress');
    expect(feedback.value).toBe(0);
  });

  it('D 類長期任務的普通打卡不會因為類別就播成 task-c', () => {
    // 這是本輪要修的那個 bug 的直接斷言：類別不是判斷依據，settlement 才是。
    const feedback = decideCompletionFeedback(
      result({
        payoutBasis: 'per_period',
        period: { start: '2026-08-10', done: 1, target: 3, settled: false },
      }),
      'D',
    );

    expect(feedback.type).not.toBe('task-c');
  });
});

describe('未實作的結算方式', () => {
  it('只確認做到了，不發幣、不宣稱進度', () => {
    const feedback = decideCompletionFeedback(
      result({ payoutBasis: 'per_milestone', payoutBasisUnsupported: true }),
      'D',
    );

    expect(feedback).toEqual({ type: 'task-a', value: 0 });
  });
});

describe('per_completion', () => {
  it('有結算就照 settlement 顯示', () => {
    const feedback = decideCompletionFeedback(
      result({
        payoutBasis: 'per_completion',
        coinEarned: 8,
        settlement: { basis: 'per_completion', coinAmount: 8 },
      }),
      'C',
    );

    expect(feedback).toEqual({ type: 'task-c', value: 8 });
  });

  it('不發幣的政策：沒有 settlement 就不播幣值', () => {
    const feedback = decideCompletionFeedback(
      result({ payoutBasis: 'per_completion', coinEarned: 0 }),
      'C',
    );

    expect(feedback).toEqual({ type: 'task-a', value: 0 });
  });
});

describe('legacy 任務：行為一個字都沒變', () => {
  it('A 類只打勾', () => {
    expect(decideCompletionFeedback(result(), 'A')).toEqual({ type: 'task-a', value: 0 });
  });

  it('B 類講時間存摺', () => {
    expect(decideCompletionFeedback(result({ timeSavedMin: 20 }), 'B')).toEqual({
      type: 'task-b',
      value: 20,
    });
  });

  it('C 類用 coinEarned', () => {
    expect(decideCompletionFeedback(result({ coinEarned: 12 }), 'C')).toEqual({
      type: 'task-c',
      value: 12,
    });
  });

  it('checkpoint 命中時仍然是 milestone 畫面', () => {
    expect(
      decideCompletionFeedback(
        result({ coinEarned: 0, milestone: { goalId: 'g1', day: 5, coinReward: 10 } }),
        'D',
      ),
    ).toEqual({ type: 'milestone', value: 10 });
  });
});
