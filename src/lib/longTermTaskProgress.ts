// Shadow Wallet — 長期任務的進度呈現
//
// 為什麼需要這一層：
//
// long_term_goals 的欄位是為 legacy 長期任務設計的 —— current_level /
// level_count 服務「關卡型」目標，target_completions 服務「累積次數型」目標。
// 抽屜建立的三種長期形式不用那套語意：成長計畫用里程碑、短期支援與家庭角色
// 用「一段期間 + 期滿回顧」。
//
// 舊的 deriveProgress 對缺值一律 `?? 1` / `?? 0`，於是新任務顯示成
//   「第 0 關 / 共 1 關」   （成長計畫）
//   「完成 0 次 / 目標 1 次」（家庭角色）
//
// 那兩行不是「還沒開始」，是**假的**：它宣稱有一個孩子從沒同意過的目標，
// 而且永遠停在 0。家長看到會以為任務壞了或孩子完全沒做。
//
// 這裡的原則是：算不出真實進度時，就不要顯示進度。說明任務是什麼形式、
// 什麼時候一起回顧，比一個編造的分母有用。

import type { LongTermType, RewardPolicyValue } from '../types/database';

/**
 * 一則長期任務在列表上該怎麼被描述。
 *
 * kind 不只是給畫面選樣式用的 —— 它同時說明了「這個數字有沒有意義」。
 * duration / role_review / support 都**沒有** current/total，因為那兩個數字
 * 對它們不存在；型別上就不給，避免有人再補一次 `?? 1`。
 */
export type LongTermTaskProgressPresentation =
  | { kind: 'milestone'; current: number; total: number; label: string }
  | { kind: 'duration'; completedDays?: number; totalDays: number; label: string }
  | { kind: 'role_review'; reviewDate?: string; label: string }
  | { kind: 'support'; reviewDate?: string; label: string }
  | { kind: 'none'; label: string };

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
  /** 由 started_at + firstReviewAfterDays 推得，YYYY-MM-DD。 */
  firstReviewDate?: string | null;
};

export type CreateLongTermProgressInput = {
  task: LongTermProgressTask;
  longTermGoal: LongTermProgressGoal;
  /** 這個任務有幾個里程碑。0 = 家長沒有設定階段。 */
  milestoneCount: number;
  /** 已完成的次數（task_completions）。 */
  completionCount: number;
};

/**
 * 家庭角色講「週」，生活小計畫講「天」。
 *
 * 不是隨便挑的：家庭角色是「試行一段時間再一起決定要不要繼續」，
 * 用週講比較像一個約定；生活小計畫是「處理一個具體卡點，穩定就結束」，
 * 家長設定時填的也是天數，講回天數才對得上他剛才做的選擇。
 */
function weekText(totalDays: number): string {
  if (totalDays > 0 && totalDays % 7 === 0) return `${totalDays / 7} 週`;
  return `${totalDays} 天`;
}

function reviewText(goal: LongTermProgressGoal): string | null {
  const days = goal.firstReviewAfterDays ?? 0;
  if (days <= 0) return null;
  return goal.firstReviewDate
    ? `預計第 ${days} 天（${goal.firstReviewDate}）一起回顧`
    : `預計第 ${days} 天一起回顧`;
}

// ---------------------------------------------------------------------------
// legacy
// ---------------------------------------------------------------------------

/**
 * reward_policy 為 null 的舊任務。
 *
 * 這一段是原本 deriveProgress 的行為，**一個字都沒改** ——
 * 既有 Demo 任務的呈現不能因為新功能而變樣。
 */
function legacyPresentation(goal: LongTermProgressGoal): LongTermTaskProgressPresentation {
  switch (goal.goalType) {
    case 'habit': {
      const total = goal.totalDays ?? 1;
      return {
        kind: 'duration',
        completedDays: goal.currentDay,
        totalDays: total,
        label: `第 ${goal.currentDay} 天 / 共 ${total} 天`,
      };
    }
    case 'skill': {
      const current = goal.currentLevel ?? 0;
      const total = goal.levelCount ?? 1;
      return {
        kind: 'milestone',
        current,
        total,
        label: `第 ${current} 關 / 共 ${total} 關`,
      };
    }
    case 'responsibility': {
      const total = goal.targetCompletions ?? 1;
      return {
        kind: 'milestone',
        current: goal.currentDay,
        total,
        label: `完成 ${goal.currentDay} 次 / 目標 ${total} 次`,
      };
    }
    case 'challenge': {
      const current = goal.currentValue ?? 0;
      const total = goal.targetValue ?? 1;
      const unit = goal.valueUnit ? ` ${goal.valueUnit}` : '';
      return {
        kind: 'milestone',
        current,
        total,
        label: `${current} / ${total}${unit}`,
      };
    }
    default:
      return { kind: 'none', label: '進行中' };
  }
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export function createLongTermTaskProgressPresentation({
  task,
  longTermGoal,
  milestoneCount,
  completionCount,
}: CreateLongTermProgressInput): LongTermTaskProgressPresentation {
  // legacy 任務走原本那套，不受新規則影響。
  if (!task.rewardPolicy) return legacyPresentation(longTermGoal);

  switch (task.planMode) {
    case 'growth_plan': {
      // 有里程碑才談「幾個階段」。沒有的話不編一個分母出來。
      if (milestoneCount > 0) {
        const current = Math.min(completionCount, milestoneCount);
        return {
          kind: 'milestone',
          current,
          total: milestoneCount,
          label: `已完成 ${current} / ${milestoneCount} 個階段`,
        };
      }
      return { kind: 'none', label: '進行中的成長計畫' };
    }

    case 'short_support': {
      const review = reviewText(longTermGoal);
      if (review) return { kind: 'support', ...reviewDateOf(longTermGoal), label: review };
      const total = longTermGoal.totalDays ?? 0;
      return total > 0
        ? { kind: 'support', label: `${total} 天生活小計畫` }
        : { kind: 'none', label: '進行中的生活小計畫' };
    }

    case 'family_role': {
      const review = reviewText(longTermGoal);
      if (review) return { kind: 'role_review', ...reviewDateOf(longTermGoal), label: review };
      const total = longTermGoal.totalDays ?? 0;
      return total > 0
        ? { kind: 'role_review', label: `${weekText(total)}家庭角色` }
        : { kind: 'none', label: '進行中的家庭角色' };
    }

    default: {
      // 新任務但沒有 planMode：只講得出期間就講期間，講不出就不講。
      const total = longTermGoal.totalDays ?? 0;
      return total > 0
        ? {
            kind: 'duration',
            completedDays: longTermGoal.currentDay,
            totalDays: total,
            label: `${weekText(total)}的長期任務`,
          }
        : { kind: 'none', label: '進行中' };
    }
  }
}

function reviewDateOf(goal: LongTermProgressGoal): { reviewDate?: string } {
  return goal.firstReviewDate ? { reviewDate: goal.firstReviewDate } : {};
}

/**
 * 進度條的百分比。
 *
 * 只有真的算得出比例的那兩種才回數字；其餘回 null ——
 * **不是 0**。0 會被畫成一條空的進度條，那同樣是在宣稱「一點都沒做」。
 */
export function progressPercentOf(
  presentation: LongTermTaskProgressPresentation,
): number | null {
  if (presentation.kind === 'milestone') {
    if (presentation.total <= 0) return null;
    return Math.min(100, Math.round((presentation.current / presentation.total) * 100));
  }
  if (presentation.kind === 'duration') {
    if (presentation.totalDays <= 0 || presentation.completedDays === undefined) return null;
    return Math.min(100, Math.round((presentation.completedDays / presentation.totalDays) * 100));
  }
  return null;
}
