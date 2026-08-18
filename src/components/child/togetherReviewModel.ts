// Shadow Wallet — CHILD-REVIEW-V2：「一起回顧」的純模型層
//
// 這一支不畫任何東西，只回答四個問題：
//
//   A  這一段實際發生了什麼            → buildReviewEvidence
//   B  孩子怎麼描述這段體驗            → REVIEW_EXPERIENCE_OPTIONS（固定四個）
//   C  下一段他想不想換一種方式        → REVIEW_DIRECTION_OPTIONS ＋ buildLighterDimensions
//   D  這個調整要不要重新找家長確認    → classifyAdjustment
//
// ⚠️ 這四件事**不互相推導**。特別是：
//
//     完成 2 次 / 約定 3 次  ✗→  建議把目標改成 2 次
//
//   數字只是 evidence。孩子可能想維持 3 次、想換做法、只是這週比較忙。
//   方向永遠由孩子選，這裡沒有任何一條分支會從進度反推 adjustment。

import type { LongTermProgression } from '../../lib/longTerm';
import type { GoalPresentation } from '../../screens/child/longTermGoalPresentation';

/** 家人的稱謂。沒有 canonical 名字時用既有畫面一直在用的中性集合稱呼。 */
export const DEFAULT_PARENT_LABEL = '爸媽';

// ── Step 1：這段做起來，哪個最像你 ──────────────────────────────────────
//
// 這是孩子**自己描述經驗**，不是系統診斷原因。所以四個選項都是感受詞，
// 沒有「你缺乏動力」「你時間管理不好」這種把孩子當問題的判定。
// 四個選項與 progression 無關 —— 閱讀、跳繩、練琴的感受是同一組。

export type ReviewExperience =
  | 'going_well'
  | 'hard_to_start'
  | 'too_much'
  | 'something_else';

export type ReviewOption<T extends string> = {
  value: T;
  label: string;
  /** 2×2 tile 上的 native icon。不是 emoji、也不是閱讀專屬插畫。 */
  icon: ReviewTileIcon;
};

/**
 * 一整套**同一株芽的不同狀態**，不是八個互不相干的通用 icon。
 * 每一格說的是「這段長成什麼樣子」或「下一段想長成什麼樣子」。
 */
export type ReviewTileIcon =
  // Step 1：這段長成什麼樣子
  | 'sprout_healthy'      // 舒展、對稱，站得穩
  | 'sprout_emerging'     // 才剛冒出來，莖短、葉小
  | 'leaf_heavy'          // 葉子偏大、微微下垂 —— 有點太多／太久
  | 'seed_thought'        // 還在土裡的種子 ＋ 想法泡泡
  // Step 2：下一段想怎麼長
  | 'sprout_steady'       // 和 healthy 同型，加一圈穩定的底線
  | 'sprout_light'        // 同一株，但小一號、葉子少一片
  | 'path_branch'         // 從同一點分出兩條路
  | 'pencil_idea';        // 鉛筆 ＋ 一點想法的火花

export const REVIEW_EXPERIENCE_OPTIONS: ReadonlyArray<ReviewOption<ReviewExperience>> = [
  { value: 'going_well', label: '現在這樣滿順的', icon: 'sprout_healthy' },
  { value: 'hard_to_start', label: '有時候不太好開始', icon: 'sprout_emerging' },
  { value: 'too_much', label: '做起來有點太多／太久', icon: 'leaf_heavy' },
  { value: 'something_else', label: '我有別的想法', icon: 'seed_thought' },
];

// ── Step 2：下一段，你想怎麼走 ─────────────────────────────────────────

export type ReviewDirection = 'keep' | 'lighter' | 'different_way' | 'own_idea';

export const REVIEW_DIRECTION_OPTIONS: ReadonlyArray<ReviewOption<ReviewDirection>> = [
  { value: 'keep', label: '就照現在這樣', icon: 'sprout_steady' },
  { value: 'lighter', label: '想讓它輕鬆一點', icon: 'sprout_light' },
  { value: 'different_way', label: '想換一種做法', icon: 'path_branch' },
  { value: 'own_idea', label: '我自己有想法', icon: 'pencil_idea' },
];

// ── Evidence（§3：只呈現事實，不評分）────────────────────────────────────

export type ReviewEvidence = {
  /** sheet 開場那句話。不含「讀」這種任務專屬動詞。 */
  contextSentence: string;
  /**
   * 原本說好的節奏。只有真的有每週次數時才有值 ——
   * 沒有週目標的計畫（階段型、累積型）不該憑空長出一個「約定」。
   */
  agreedFact: string | null;
};

/**
 * ⚠️ 這裡**刻意不接受**任務名稱。
 *
 * mockup 寫的是「這週已經讀了 2 次」，但「讀」不是 canonical 資料 ——
 * task.category 只有 A/B/C/D 四個粗桶，childPlan 是自由文字。從那裡猜動詞
 * 等於把閱讀 demo 的措辭寫死進一個要重用於畫畫／跳繩／練琴的元件。
 *
 * 所以一律用 spec §3 允許的中性 fallback：「這週已經完成 N 次」。
 */
export function buildReviewEvidence(presentation: GoalPresentation): ReviewEvidence {
  const done = Math.max(presentation.sessionEvidence.weekSessionCount, 0);
  const target = Math.max(presentation.weekTarget, 0);

  const contextSentence = done > 0
    ? `這週已經完成 ${done} 次，一起看看這段怎麼樣。`
    : '這週還沒有留下紀錄，也可以一起看看現在的安排。';

  return {
    contextSentence,
    agreedFact: target > 0 ? `原本約定每週 ${target} 次` : null,
  };
}

// ── Branch B：可以從哪裡調整（§6：由這份計畫真的可調的維度產生）─────────
//
// 不是 global hardcode 三個選項。沒有「每次多久」的計畫就沒有「每次短一點」；
// 沒有每週次數的計畫就沒有「一週少一次」。

export type LighterDimension = 'shorter_session' | 'fewer_per_week' | 'own_words';

export type LighterDimensionOption = {
  value: LighterDimension;
  label: string;
};

/**
 * `capabilities` 是**這個 build 真的接得通的通道**，不是「這個計畫理論上有
 * 哪些欄位」。兩者刻意分開：
 *
 *   presentation 說「這份計畫有每次多久」   → 這個維度存在
 *   capabilities 說「每次多久沒有協商通道」 → 這個維度**不該出現在選單上**
 *
 * 少了第二層，孩子會選到一個按下去沒有下一步的選項。寧可少給一個選擇，
 * 也不要給一個走不到終點的選擇。
 */
export type ReviewAdjustmentCapabilities = {
  /** 每週次數可以重新協商（P1 cadence lane）。 */
  cadence: boolean;
  /** 每次多久可以重新協商。目前沒有通道。 */
  sessionLength: boolean;
  /** 換時段可以重新協商（P0-8M preferred_time lane）。 */
  preferredTime: boolean;
  /** 自由描述可以送成一筆待談的調整。目前沒有通道。 */
  freeform: boolean;
};

export const NO_ADJUSTMENT_CAPABILITIES: ReviewAdjustmentCapabilities = {
  cadence: false,
  sessionLength: false,
  preferredTime: false,
  freeform: false,
};

export function buildLighterDimensions(
  presentation: GoalPresentation,
  capabilities: ReviewAdjustmentCapabilities,
): LighterDimensionOption[] {
  const options: LighterDimensionOption[] = [];

  const minutes = presentation.sessionMinutes;
  if (capabilities.sessionLength && minutes !== null && minutes > 0) {
    options.push({ value: 'shorter_session', label: '每次短一點' });
  }

  // 只有節奏型計畫的「每週幾次」才是一個可以少一次的東西，而且要真的還有
  // 得少（每週 1 次再少就是不做了，那是暫停，不是調整）。
  if (capabilities.cadence
    && isRhythmLike(presentation.progression)
    && presentation.weekTarget > 1) {
    options.push({ value: 'fewer_per_week', label: '一週少一次' });
  }

  if (capabilities.freeform) {
    options.push({ value: 'own_words', label: '我自己說' });
  }

  return options;
}

function isRhythmLike(progression: LongTermProgression | null): boolean {
  return progression === 'rhythm';
}

// ── Branch C：想換一種做法（§6）────────────────────────────────────────
//
// spec 給的例子第一個就是「換一個比較容易開始的時機」—— 那正是 P0-8M 已經
// 做完、而且是**唯一一條真的能送出去**的換做法。所以這裡不叫 AI 生一串
// 可能性，先把既有的具體選項列出來。AI alternatives 是後面的事。
//
// ⚠️ 目前的時段只有兩個值可以寫進計畫（long_term_goals 的 CHECK），
//    所以候選清單一定是「另一個時段」，不是一個開放集合。

export type ReviewTimeWindow = 'after_dinner' | 'before_bed';

const TIME_WINDOW_LABEL: Record<ReviewTimeWindow, string> = {
  after_dinner: '晚餐後',
  before_bed: '睡前',
};

export const REVIEW_TIME_WINDOWS: ReadonlyArray<ReviewTimeWindow> = [
  'after_dinner',
  'before_bed',
];

export type AlternativeApproach = {
  value: string;
  label: string;
  /** 非 null 代表這個做法就是換成這個時段。 */
  timeWindow: ReviewTimeWindow | null;
};

export function buildAlternativeApproaches(
  presentation: GoalPresentation,
  capabilities: ReviewAdjustmentCapabilities,
): AlternativeApproach[] {
  const options: AlternativeApproach[] = [];

  if (capabilities.preferredTime && presentation.supportsTimeWindow) {
    const current = presentation.agreedTime?.value ?? null;
    for (const window of REVIEW_TIME_WINDOWS) {
      // 選到和現在一樣的時段不是一個調整，不該存在於選單上。
      if (window === current) continue;
      options.push({
        value: `time:${window}`,
        label: `改成${TIME_WINDOW_LABEL[window]}試試`,
        timeWindow: window,
      });
    }
  }

  if (capabilities.freeform) {
    options.push({ value: 'own_words', label: '我自己想', timeWindow: null });
  }

  return options;
}

export type TimeWindowDiff = {
  fromLabel: string;
  toLabel: string;
  toValue: ReviewTimeWindow;
};

export function buildTimeWindowDiff(
  presentation: GoalPresentation,
  next: ReviewTimeWindow,
): TimeWindowDiff {
  return {
    fromLabel: presentation.agreedTime?.label ?? '目前的時段',
    toLabel: TIME_WINDOW_LABEL[next],
    toValue: next,
  };
}

// ── §7：Child-owned vs Shared-term ──────────────────────────────────────
//
// 這是整輪最重要的一條線。分類錯的代價是不對稱的：
//
//   把 shared 當 child-owned  →  孩子單方面改掉雙方說好的事
//   把 child-owned 當 shared  →  只是多問一次家長，煩但不會壞
//
// 所以無法判定的一律當 shared。

export type AdjustmentClassification =
  | { kind: 'shared_term'; dimension: LighterDimension }
  | { kind: 'child_owned'; dimension: LighterDimension }
  | { kind: 'none' };

export function classifyAdjustment(
  direction: ReviewDirection | null,
  dimension: LighterDimension | null,
): AdjustmentClassification {
  if (direction === null || direction === 'keep') return { kind: 'none' };
  if (direction !== 'lighter' || dimension === null) return { kind: 'none' };

  switch (dimension) {
    // 每週次數與每次多久都是 A4B1 定義的家庭共同條件，不是孩子的執行細節。
    case 'fewer_per_week':
    case 'shorter_session':
      return { kind: 'shared_term', dimension };
    // 自由輸入分不出來是方法還是共同條件 —— 分不出來就當共同條件。
    case 'own_words':
      return { kind: 'shared_term', dimension };
  }
}

/** 只有真的可能動到共同約定時才顯示那一條 strip（§12）。 */
export function needsFamilyConfirmation(
  classification: AdjustmentClassification,
): boolean {
  return classification.kind === 'shared_term';
}

/**
 * 兩種說法刻意不同（§7）。
 *
 *   shared_term   每週次數這類**家庭共同條件** —— 改了就是改到雙方的約定。
 *   agreed_time   這份計畫當初一起談定的那個時段。
 *
 * 後者用比較窄的說法，是因為 Review V2 **不可以讓孩子學到「任何跟時間有關的
 * 個人調整都要家長同意」**。這裡要談的只是「這一份計畫當初一起說好的那個
 * 時段」，不是他每天幾點做事的自由。
 */
export type SharedTermNoticeKind = 'shared_term' | 'agreed_time';

export function buildSharedTermNotice(
  parentLabel: string = DEFAULT_PARENT_LABEL,
  kind: SharedTermNoticeKind = 'shared_term',
): { message: string; cta: string } {
  return {
    message: kind === 'agreed_time'
      ? '這個時段是當初一起說好的，改之前先一起確認。'
      : '這會改到你們原本說好的安排。',
    cta: `和${parentLabel}一起調整 →`,
  };
}

// ── §13：CTA 跟著 state 走，不是一句話硬套所有分支 ───────────────────────

/**
 * null 代表**這一刻不該出現 CTA**：
 *   - Step 1 還沒選 → 按鈕不出現
 *   - Step 1 選完但 Step 2 還沒選 → 讓孩子看見 Step 2，不急著給結束的按鈕
 */
export function buildPrimaryCta(
  experience: ReviewExperience | null,
  direction: ReviewDirection | null,
): string | null {
  if (experience === null || direction === null) return null;

  switch (direction) {
    case 'keep':
      return '繼續這樣走';
    case 'lighter':
      return '看看可以怎麼調整';
    case 'different_way':
      return '看看其他方式';
    case 'own_idea':
      return '說說我的想法';
  }
}

/** Branch A 的確認語。不再問任何設定，也不建立新的共同版本。 */
export const KEEP_CONFIRMATION_COPY = '好，那下一段先照現在的方式。';

// ── Branch B 的差異描述（§17 State B）────────────────────────────────────

export type CadenceDiff = {
  fromLabel: string;
  toLabel: string;
  fromValue: number;
  toValue: number;
};

/**
 * 「一週少一次」是**孩子選的方向**，不是系統從 2/3 推出來的目標。
 * 起點永遠是目前談定的週次數，不是這週實際完成幾次。
 */
export function buildFewerPerWeekDiff(
  presentation: GoalPresentation,
): CadenceDiff | null {
  const current = presentation.weekTarget;
  if (!isRhythmLike(presentation.progression) || current <= 1) return null;

  const next = current - 1;
  return {
    fromValue: current,
    toValue: next,
    fromLabel: `每週 ${current} 次`,
    toLabel: `每週 ${next} 次`,
  };
}
