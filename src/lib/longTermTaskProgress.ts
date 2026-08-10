// Shadow Wallet — 長期任務的進度呈現
//
// ─────────────────────────────────────────────────────────────────────────
// 這一層修過兩次，兩次都是同一個毛病：畫面宣稱了資料庫裡不存在的事實。
//
// 第一次：`long_term_goals` 的欄位是為 legacy 長期任務設計的（current_level /
// level_count 服務關卡型、target_completions 服務累積次數型）。抽屜建立的三種
// 長期形式不用那套語意，於是 `?? 1` / `?? 0` 生出了
//   「第 0 關 / 共 1 關」、「完成 0 次 / 目標 1 次」——
// 宣稱了一個孩子從沒同意過的目標，而且永遠停在 0。
//
// 第二次（這一輪修的）：改成「已完成 X / Y 個階段」，其中 X 用的是
// `task_completions` 的筆數。那**同樣是假的**：
//
//   * 完成一次閱讀不等於完成一個里程碑
//   * `task_plan_milestones` 沒有任何完成狀態欄位
//   * 沒有任何地方記錄「哪一個里程碑被達成了」
//
// 一個孩子讀了 7 次書、但那 7 次都還在第一個里程碑的範圍內，畫面會說
// 「已完成 5 / 5 個階段」。家長據此以為計畫結束了。
//
// 所以現在的規則是：**里程碑只講規劃與時程，不講完成**。
// 「已規劃 5 個里程碑、下一個在第 14 天」全部來自家長自己設定的東西，
// 沒有一個字是推導出來的。
// ─────────────────────────────────────────────────────────────────────────

import { addDays, compareDates, isDateOnlyString, todayDateString } from './dateOnly';
import { plannedReviewText, weeksOrDaysText } from './durationCopy';
import type { LongTermType, RewardPolicyValue } from '../types/database';

// ---------------------------------------------------------------------------
// 輸入
// ---------------------------------------------------------------------------

/** 只取這一層真的需要的欄位，不把整個 Task / 目標 row 拖進來。 */
export type LongTermProgressTask = {
  /** null = legacy 任務，維持原本的關卡／次數呈現。 */
  rewardPolicy?: RewardPolicyValue | null;
  planMode?: 'growth_plan' | 'short_support' | 'family_role' | null;
};

export type LongTermProgressGoal = {
  goalType: LongTermType;
  currentDay: number;
  totalDays?: number | null;
  currentLevel?: number | null;
  levelCount?: number | null;
  targetCompletions?: number | null;
  currentValue?: number | null;
  targetValue?: number | null;
  valueUnit?: string | null;
  /** 第幾天做第一次回顧。0 或 null = 家長關掉了。 */
  firstReviewAfterDays?: number | null;
  /** 由 startedAt + firstReviewAfterDays 推得，YYYY-MM-DD。 */
  firstReviewDate?: string | null;
  /** 計畫開始日，YYYY-MM-DD。里程碑的第 N 天從這裡算起。 */
  startDate?: string | null;
};

/**
 * 一個里程碑。
 *
 * **沒有完成狀態，這是刻意的。** `task_plan_milestones` 目前只有 title /
 * target_day / sort_order，資料庫裡就沒有「這個里程碑達成了沒」這件事。
 * 型別上不給，才不會有人再拿別的數字補上去。
 *
 * TODO（需要獨立一輪，本輪不做）：要真的顯示「已完成 X / Y 個里程碑」，
 * 需要一張 milestone completion 表，至少包含
 *   milestone_id / completed_at / completed_by / 可撤銷的狀態。
 * 在那張表存在之前，任何 X 都是推測。
 */
export type LongTermMilestone = {
  id?: string;
  title?: string;
  /** 從 startDate 算起的第 N 天。null = 家長沒有排日期。 */
  targetDay?: number | null;
  sortOrder?: number | null;
};

export type CreateLongTermProgressInput = {
  task: LongTermProgressTask;
  longTermGoal: LongTermProgressGoal;
  /** 依資料庫順序給就好，這裡會自己依 targetDay 重排。 */
  milestones?: LongTermMilestone[];
  /**
   * 已完成次數。**只有 legacy 任務會用到。**
   * 新任務不得用它推導里程碑進度 —— 見檔頭。
   */
  completionCount?: number;
  /** 今天，YYYY-MM-DD。測試注入用；不給就取本機今天。 */
  today?: string;
};

// ---------------------------------------------------------------------------
// 輸出
// ---------------------------------------------------------------------------

/**
 * 一則長期任務在列表上該怎麼被描述。
 *
 * `showProgressBar` 是型別的一部分而不是畫面自己判斷：新任務的四種形式
 * 全部是 `false`，而且是**字面型別 false** —— 有人想在 growth_plan 上
 * 畫進度條時，TypeScript 會先擋下來。
 */
export type LongTermTaskProgressPresentation =
  | {
      kind: 'planned_milestones';
      milestoneCount: number;
      headline: string;
      nextMilestoneLabel?: string;
      showProgressBar: false;
    }
  | { kind: 'growth_plan'; headline: string; showProgressBar: false }
  | { kind: 'short_support'; headline: string; reviewLabel?: string; showProgressBar: false }
  | { kind: 'family_role'; headline: string; reviewLabel?: string; showProgressBar: false }
  | {
      kind: 'legacy';
      headline: string;
      progressPercent?: number;
      showProgressBar: boolean;
    };

/**
 * 是不是 legacy 長期任務。
 *
 * 集中在這裡，不要在各個 component 各寫一次 `reward_policy == null` ——
 * 那樣只要有一處漏掉，legacy 任務就會套到新規則、或反過來。
 */
export function isLegacyLongTermTask(task: LongTermProgressTask): boolean {
  return !task.rewardPolicy;
}

// ---------------------------------------------------------------------------
// 下一個里程碑
// ---------------------------------------------------------------------------

export type NextPlannedMilestone = {
  /** 全部日期都已經過。 */
  completedSchedule: boolean;
  /** 下一個（或今天這一個）里程碑；沒有時為 null。 */
  milestone: LongTermMilestone | null;
  /** 它的日期，YYYY-MM-DD。 */
  date?: string;
};

/**
 * 找出下一個里程碑。
 *
 * 幾條刻意的規則：
 *
 *   * 依 targetDay 排序，**不相信資料原順序** —— sort_order 是家長編輯時的
 *     排列，不保證等於時間順序。
 *   * 今天正好是里程碑日期時，它算「下一個」而不是「已過」。當天才是最該
 *     被提起的一天。
 *   * **不因完成次數跳過任何里程碑。** 完成次數與里程碑無關（見檔頭）。
 *   * 不修改傳進來的陣列。
 */
export function findNextPlannedMilestone({
  startDate,
  milestones,
  today,
}: {
  startDate?: string | null;
  milestones?: LongTermMilestone[];
  today?: string;
}): NextPlannedMilestone {
  const list = milestones ?? [];
  const day = today && isDateOnlyString(today) ? today : todayDateString();

  if (!isDateOnlyString(startDate ?? undefined) || list.length === 0) {
    return { completedSchedule: false, milestone: null };
  }

  // 只留排得出日期的；targetDay 必須 > 0（第 0 天沒有意義）。
  const dated = list
    .filter(m => typeof m.targetDay === 'number' && Number.isFinite(m.targetDay) && m.targetDay > 0)
    .map(m => ({ milestone: m, date: addDays(startDate as string, (m.targetDay as number) - 1) }))
    .filter((entry): entry is { milestone: LongTermMilestone; date: string } => entry.date !== null)
    // slice 一份再排，不動呼叫端的陣列。
    .slice()
    .sort((a, b) => compareDates(a.date, b.date));

  if (dated.length === 0) return { completedSchedule: false, milestone: null };

  const upcoming = dated.find(entry => compareDates(entry.date, day) >= 0);
  if (!upcoming) {
    return { completedSchedule: true, milestone: null };
  }
  return { completedSchedule: false, milestone: upcoming.milestone, date: upcoming.date };
}

// ---------------------------------------------------------------------------
// legacy
// ---------------------------------------------------------------------------

function percent(current: number, total: number): number | undefined {
  if (total <= 0) return undefined;
  return Math.min(100, Math.round((current / total) * 100));
}

/**
 * `reward_policy` 為 null 的舊任務。
 *
 * 這一段是原本 deriveProgress 的行為，**一個字都沒改** ——
 * 既有 Demo 任務的呈現不能因為新功能而變樣。
 */
function legacyPresentation(goal: LongTermProgressGoal): LongTermTaskProgressPresentation {
  switch (goal.goalType) {
    case 'habit': {
      const total = goal.totalDays ?? 1;
      return {
        kind: 'legacy',
        headline: `第 ${goal.currentDay} 天 / 共 ${total} 天`,
        progressPercent: percent(goal.currentDay, total),
        showProgressBar: true,
      };
    }
    case 'skill': {
      const current = goal.currentLevel ?? 0;
      const total = goal.levelCount ?? 1;
      return {
        kind: 'legacy',
        headline: `第 ${current} 關 / 共 ${total} 關`,
        progressPercent: percent(current, total),
        showProgressBar: true,
      };
    }
    case 'responsibility': {
      const total = goal.targetCompletions ?? 1;
      return {
        kind: 'legacy',
        headline: `完成 ${goal.currentDay} 次 / 目標 ${total} 次`,
        progressPercent: percent(goal.currentDay, total),
        showProgressBar: true,
      };
    }
    case 'challenge': {
      const current = goal.currentValue ?? 0;
      const total = goal.targetValue ?? 1;
      const unit = goal.valueUnit ? ` ${goal.valueUnit}` : '';
      return {
        kind: 'legacy',
        headline: `${current} / ${total}${unit}`,
        progressPercent: percent(current, total),
        showProgressBar: true,
      };
    }
    default:
      return { kind: 'legacy', headline: '進行中', showProgressBar: false };
  }
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export function createLongTermTaskProgressPresentation({
  task,
  longTermGoal,
  milestones,
  today,
}: CreateLongTermProgressInput): LongTermTaskProgressPresentation {
  if (isLegacyLongTermTask(task)) return legacyPresentation(longTermGoal);

  switch (task.planMode) {
    case 'growth_plan':
      return growthPlanPresentation(longTermGoal, milestones ?? [], today);

    case 'short_support': {
      const total = longTermGoal.totalDays ?? 0;
      const review = plannedReviewText(longTermGoal.firstReviewAfterDays ?? 0);
      return {
        kind: 'short_support',
        headline: total > 0 ? `${total} 天生活小計畫` : '進行中的生活小計畫',
        ...(review ? { reviewLabel: review } : {}),
        showProgressBar: false,
      };
    }

    case 'family_role': {
      const total = longTermGoal.totalDays ?? 0;
      const review = plannedReviewText(longTermGoal.firstReviewAfterDays ?? 0);
      return {
        kind: 'family_role',
        // 家庭角色講「週」：它是「試行一段時間再一起決定要不要繼續」，
        // 用週講比較像一個約定。日常的完成紀錄可以存在，但那不是
        // 「角色完成了多少」——所以這裡一個完成數字都不出現。
        headline: total > 0 ? `${weeksOrDaysText(total)}家庭角色` : '進行中的家庭角色',
        ...(review ? { reviewLabel: review } : {}),
        showProgressBar: false,
      };
    }

    default: {
      // 新任務但沒有 planMode：只講得出期間就講期間，講不出就不講。
      const total = longTermGoal.totalDays ?? 0;
      return {
        kind: 'growth_plan',
        headline: total > 0 ? `${weeksOrDaysText(total)}的長期任務` : '進行中',
        showProgressBar: false,
      };
    }
  }
}

function growthPlanPresentation(
  goal: LongTermProgressGoal,
  milestones: LongTermMilestone[],
  today?: string,
): LongTermTaskProgressPresentation {
  if (milestones.length === 0) {
    // 沒有里程碑就不編一個分母。講得出期間或回顧日就補一句。
    const review = plannedReviewText(goal.firstReviewAfterDays ?? 0);
    const total = goal.totalDays ?? 0;
    const suffix = review ? `，${review}` : total > 0 ? `，共 ${weeksOrDaysText(total)}` : '';
    return {
      kind: 'growth_plan',
      headline: `進行中的成長計畫${suffix}`,
      showProgressBar: false,
    };
  }

  const next = findNextPlannedMilestone({
    startDate: goal.startDate,
    milestones,
    today,
  });

  // 「已規劃」而不是「已完成」：這個數字是家長自己設定的，不是推導的。
  const headline = `已規劃 ${milestones.length} 個里程碑`;

  let nextMilestoneLabel: string | undefined;
  if (next.completedSchedule) {
    nextMilestoneLabel = '里程碑時程已到，建議一起回顧';
  } else if (next.milestone && typeof next.milestone.targetDay === 'number') {
    nextMilestoneLabel = `下一個里程碑：第 ${next.milestone.targetDay} 天`;
  }
  // 沒有 targetDay（或沒有 startDate）就不猜日期，只講規劃了幾個。

  return {
    kind: 'planned_milestones',
    milestoneCount: milestones.length,
    headline,
    ...(nextMilestoneLabel ? { nextMilestoneLabel } : {}),
    showProgressBar: false,
  };
}

/**
 * 進度條的百分比。
 *
 * **只有 legacy 任務算得出來。** 新任務一律回 null —— 不是 0：
 * 0 會被畫成一條空的進度條，那同樣是在宣稱「一點都沒做」。
 */
export function progressPercentOf(
  presentation: LongTermTaskProgressPresentation,
): number | null {
  if (!presentation.showProgressBar) return null;
  return presentation.kind === 'legacy' ? presentation.progressPercent ?? null : null;
}
