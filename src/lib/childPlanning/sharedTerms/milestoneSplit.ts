// GrowBook — staged 計畫的混合制回饋分配公式（P1-M1B §2.2）
//
// ─────────────────────────────────────────────────────────────────────────
// 方案 A（預算守恆）：同樣的投入，總價不變，只是把一部分錢從「出席」
// 挪到「躍遷」。不選加碼制的理由不是省錢，是它讓「AI 提幾站」在金額上
// 是中性的 —— 加碼制下站數線性推高家庭支出，而站數是 AI 提的。
//
//   r                 = 0.4                      政策常數
//   discountedSession = max(1, round(session × (1 - r)))
//   milestoneCoin      = (session - discountedSession) × (weekCount × targetPerWeek)
//
// ⚠️ 兩種「這一站沒有金額」的原因不一樣，不可以混成同一種：
//
//   沒有 expectedWeeks     連 criterion 都建不出來 —— milestone_agreements
//                          的 completion_criterion（weekly_rhythm_window）
//                          需要 week_count 才知道「什麼時候算走到這一站」。
//                          這一站**不進 segments**，不是「進去但金額是 null」。
//                          它仍然留在孩子的計畫裡（child_confirmed_plan.
//                          phases），只是不會有 milestone_agreements 那一列。
//
//   算出來 milestoneCoin=0 criterion 建得出來、真的追蹤得到，只是這一站
//                          沒有額外的錢 → coinAmount: null，但仍然在
//                          segments 裡（純慶祝站，reward_coin_amount 寫 NULL）。
// ─────────────────────────────────────────────────────────────────────────

/** 政策常數。寫在這裡，不是逐案決定 —— 這一輪不開放調整。 */
export const MILESTONE_SPLIT_POLICY_RATIO = 0.4;

export type MilestoneSplitPhase = {
  title: string;
  /** 判不出來就不給。與 ChildPlanPhase.expectedWeeks 同一個意思。 */
  expectedWeeks?: number;
};

export type MilestoneSplitSegment = {
  title: string;
  weekCount: number;
  targetPerWeek: number;
  /** null = 純慶祝站（criterion 追蹤得到，只是算出來沒有額外的錢）。 */
  coinAmount: number | null;
};

export type MilestoneSplit = {
  policyRatio: number;
  discountedSessionCoins: number;
  segments: MilestoneSplitSegment[];
};

/**
 * 算出混合制回饋的分配。算不出來（沒有 targetPerWeek、或沒有任何一站
 * 帶得出 criterion）就回 null —— 不猜、不硬湊。
 */
export function computeMilestoneSplit(args: {
  /** 折扣前，一次投入的參考價（policy_session_coin_reference）。 */
  session: number;
  /** 家長談定的週目標。cadence 還沒定就是 null。 */
  targetPerWeek: number | null;
  phases: readonly MilestoneSplitPhase[];
}): MilestoneSplit | null {
  const { session, targetPerWeek, phases } = args;
  if (targetPerWeek === null || targetPerWeek <= 0) return null;

  const discountedSessionCoins = Math.max(
    1,
    Math.round(session * (1 - MILESTONE_SPLIT_POLICY_RATIO)),
  );

  const segments: MilestoneSplitSegment[] = [];
  for (const phase of phases) {
    if (phase.expectedWeeks === undefined) continue;
    const sessionsInSegment = phase.expectedWeeks * targetPerWeek;
    const milestoneCoin = (session - discountedSessionCoins) * sessionsInSegment;
    segments.push({
      title: phase.title,
      weekCount: phase.expectedWeeks,
      targetPerWeek,
      coinAmount: milestoneCoin > 0 ? milestoneCoin : null,
    });
  }

  // 沒有任何一站帶得出 criterion，等於這份計畫沒有東西可以拆 ——
  // 跟不是 staged 計畫是同一種「沒有 milestoneSplit」。
  if (segments.length === 0) return null;

  return { policyRatio: MILESTONE_SPLIT_POLICY_RATIO, discountedSessionCoins, segments };
}
