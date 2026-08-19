// GrowBook — 把孩子確認過的計畫講給家長聽（P1-A4A §18 / §19）
//
// ─────────────────────────────────────────────────────────────────────────
// 這一層只做一件事：**把 canonical child plan 翻成家長讀得懂的句子。**
//
// 兩個硬規則：
//
//   1. **不直接印工程欄名。** `progressionKind`、`session_size`、
//      `purpose_category` 這些字不可以出現在畫面上。家長不需要知道
//      GrowBook 內部怎麼分類，他需要知道孩子想做什麼。
//
//   2. **讀不到就留白，不猜。** child_confirmed_plan 是 jsonb，型別上是
//      unknown。缺欄位時回 null，讓卡片少一段 —— 補一句「（未提供）」
//      只是讓畫面看起來完整，但那不是資料。
// ─────────────────────────────────────────────────────────────────────────

import type {
  ChildPlanSharedDecision,
  ChildProposalPlanVersion,
} from '../../../../lib/childProposal/types';

/** 家長讀得懂的說法。**不是**工程欄名。 */
const SHARED_DECISION_COPY: Record<ChildPlanSharedDecision, string> = {
  cadence: '進行頻率',
  session_size: '每次大約做多久',
  duration: '這次先試多久',
  reward: '怎麼給回饋',
  // 這一項是 GrowBook 自己還沒整理完，不是家長要決定的事 ——
  // 說法要讓家長知道「不用你做什麼」。
  purpose_category: 'GrowBook 還在整理這件事的類型',
};

export function sharedDecisionLabels(
  pending: readonly ChildPlanSharedDecision[],
): string[] {
  return pending.map((item) => SHARED_DECISION_COPY[item]).filter((copy) => Boolean(copy));
}

export type ChildPlanCardSummary = {
  /** 孩子想達成的成果。原話，不是改寫版。 */
  desiredOutcome: string | null;
  /** 他打算怎麼做到。 */
  actionPlanSummary: string | null;
  /** 下一次可以直接做的一個小動作。 */
  nextAction: string | null;
  /**
   * 這件事怎麼往前走，講成一句話。
   *
   * rhythm 不需要這一句（節奏本身在「家庭約定」那半部已經講了），
   * staged 與 accumulation 需要 —— 否則家長只會看到一句摘要，
   * 完全看不出來孩子其實已經把事情拆成三個階段。
   */
  shape: string | null;
};

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** progression 講成一句家長話。讀不懂就回 null。 */
function describeShape(plan: Record<string, unknown>): string | null {
  const kind = plan.progressionKind;

  if (kind === 'staged') {
    const phases = Array.isArray(plan.phases) ? plan.phases : [];
    const titles = phases
      .map((phase) => str(record(phase)?.title))
      .filter((title): title is string => title !== null);
    // 「先決定故事 → 畫角色 → 畫頁面」比「staged（3 phases）」有用得多。
    return titles.length > 0 ? `分成幾步：${titles.join(' → ')}` : null;
  }

  if (kind === 'accumulation') {
    const target = plan.targetValue;
    const unit = str(plan.targetUnit);
    if (typeof target === 'number' && unit !== null) {
      const current = typeof plan.currentValue === 'number' ? plan.currentValue : 0;
      return current > 0
        ? `目標 ${target} ${unit}，已經完成 ${current}`
        : `目標 ${target} ${unit}`;
    }
    return null;
  }

  return null;
}

/**
 * 家長卡片上半部「孩子想怎麼做」的內容。
 *
 * 來源是 canonical child plan —— 也就是孩子真的在螢幕上看過、
 * 而且按下確認的那一份。不是 plan_title / plan_summary 那幾個
 * 扁平欄位的重述（雖然它們的值就是從這裡來的）。
 */
export function childPlanCardSummary(
  version: ChildProposalPlanVersion | null,
): ChildPlanCardSummary | null {
  const plan = record(version?.child_confirmed_plan);
  if (plan === null) return null;

  return {
    desiredOutcome: str(plan.desiredOutcome),
    actionPlanSummary: str(plan.actionPlanSummary),
    nextAction: str(record(plan.nextAction)?.text),
    shape: describeShape(plan),
  };
}
