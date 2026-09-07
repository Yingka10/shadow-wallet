// P1-M1B §2.2 — 混合制回饋的分配公式
//
// ─────────────────────────────────────────────────────────────────────────
// 方案 A（預算守恆）：同樣的投入，總價不變，只是把一部分錢從「出席」
// 挪到「躍遷」。r=0.4 是政策常數。
//
//   discountedSession = max(1, round(session × (1 - r)))
//   milestoneCoin      = (session - discountedSession) × (weekCount × targetPerWeek)
//
// 兩種「沒有金額」的站，原因不一樣，不可以混成同一種：
//
//   沒有 expectedWeeks   → 連 criterion 都建不出來（milestone_agreements
//                          的 completion_criterion 需要 week_count 才知道
//                          「什麼時候算走到這一站」）→ 這一站**不進 segments**，
//                          不是「進去但 coinAmount 是 null」。
//   算出來 milestoneCoin=0 → criterion 建得出來、真的追蹤得到，
//                          只是這一站沒有額外的錢 → coinAmount: null，
//                          但仍然在 segments 裡（純慶祝站）。
// ─────────────────────────────────────────────────────────────────────────

import { computeMilestoneSplit } from '../milestoneSplit';

describe('computeMilestoneSplit', () => {
  it('照公式折現在每次、算出每站的躍遷金額', () => {
    const split = computeMilestoneSplit({
      session: 8,
      targetPerWeek: 3,
      phases: [
        { title: '想好故事', expectedWeeks: 2 },
        { title: '畫完分鏡', expectedWeeks: 2 },
      ],
    });

    expect(split).toEqual({
      policyRatio: 0.4,
      discountedSessionCoins: 5, // max(1, round(8*0.6)) = 5
      segments: [
        { title: '想好故事', weekCount: 2, targetPerWeek: 3, coinAmount: 18 }, // (8-5)*6
        { title: '畫完分鏡', weekCount: 2, targetPerWeek: 3, coinAmount: 18 },
      ],
    });
  });

  it('session 小到折後還是 1 時，那一站自動變成純慶祝站', () => {
    const split = computeMilestoneSplit({
      session: 1,
      targetPerWeek: 3,
      phases: [{ title: '第一步', expectedWeeks: 2 }],
    });

    expect(split?.discountedSessionCoins).toBe(1);
    expect(split?.segments[0].coinAmount).toBeNull();
  });

  it('沒有 expectedWeeks 的站不進 segments —— 連 criterion 都建不出來', () => {
    const split = computeMilestoneSplit({
      session: 8,
      targetPerWeek: 3,
      phases: [
        { title: '想好故事', expectedWeeks: 2 },
        { title: '沒判斷出來的站' },
      ],
    });

    expect(split?.segments).toHaveLength(1);
    expect(split?.segments[0].title).toBe('想好故事');
  });

  it('全部的站都沒有 expectedWeeks → 整個 milestoneSplit 是 null，不是空陣列', () => {
    const split = computeMilestoneSplit({
      session: 8,
      targetPerWeek: 3,
      phases: [{ title: '沒判斷出來的站' }],
    });

    expect(split).toBeNull();
  });

  it('targetPerWeek 算不出來（cadence 還沒定）→ null，不猜', () => {
    const split = computeMilestoneSplit({
      session: 8,
      targetPerWeek: null,
      phases: [{ title: '想好故事', expectedWeeks: 2 }],
    });

    expect(split).toBeNull();
  });
});
