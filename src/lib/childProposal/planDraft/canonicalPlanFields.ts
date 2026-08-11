// Shadow Wallet — Plan Draft 的四個 canonical 結構化欄位（P0-3 Final）
//
// ─────────────────────────────────────────────────────────────────────────
// P0-5 Preflight 的結論：**audit snapshot 不能當成 canonical task 的權威來源。**
//
// 所以這四個值要有明確的來源，而且三個裡有兩個**根本不經過模型的自由文字**：
//
//   purpose_category        AI 語意理解 → 既有 rewardEligibility 閘門 → 結構化欄位
//   completion_description  deterministic transformer（固定句型）
//   progress_model          deterministic adapter（依 category/duration/cadence 推導）
//   next_step               通過驗證的 AI 建議，過不了就 null
//
// 為什麼完成標準不能照抄模型：
//
//   D 類學習任務獎勵的是**可控制的投入與練習**，不是最後結果。
//   模型今天寫「完成一次約定的閱讀時段」，明天可能寫「兩週後把整本書讀完」——
//   而那一句會直接變成正式任務的完成標準，孩子讀了 13 天仍然是「沒完成」。
//
//   固定句型讓這件事**結構上寫不出來**：模型只從封閉列舉裡挑一個
//   activityKind，句子是我們自己的。
// ─────────────────────────────────────────────────────────────────────────

import type {
  ChildProposalProgressModel,
  ChildProposalPurposeCategory,
} from '../types';
import type { ChildProposalPlanDraft, PlanDraftActivityKind } from './types';

// ---------------------------------------------------------------------------
// purpose_category
// ---------------------------------------------------------------------------

/**
 * AI 的語意理解，但它已經先通過既有的 rewardEligibility 閘門
 * （閘門就是拿這個 category 去判斷能不能發幣），而且兩端 validator
 * 都確認過它是 A/B/C/D 之一。
 *
 * ⚠️ 這一欄與 duration_type 是兩件事。長期不是第五類。
 */
export function canonicalPurposeCategory(
  draft: ChildProposalPlanDraft,
): ChildProposalPurposeCategory {
  return draft.category;
}

// ---------------------------------------------------------------------------
// completion_description
// ---------------------------------------------------------------------------

/**
 * 每一種活動的「一次」叫什麼。
 *
 * 名詞是我們寫的，模型只負責從封閉列舉挑一個 —— 這是「不照抄自由文字」
 * 在程式裡的樣子。
 */
const SESSION_NOUN: Record<Exclude<PlanDraftActivityKind, 'other'>, string> = {
  reading: '閱讀',
  practice: '練習',
  exercise: '運動',
  creating: '創作',
  learning: '學習',
  helping: '幫忙',
};

/**
 * 正式的完成標準。
 *
 * 句型只有兩種，而且兩種都在講**一次的投入**：
 *
 *   一次性  →「完成這一次約定的閱讀」
 *   其他    →「完成一次約定的閱讀時段」
 *
 * 沒有任何分支寫得出「全部讀完」「達到 X 分」這種結果導向的句子 ——
 * 那不是靠檢查擋下來的，是句型裡根本沒有那個位置。
 */
export function canonicalCompletionDescription(draft: ChildProposalPlanDraft): string {
  const oneTime = draft.durationType === 'one_time' || draft.cadence?.mode === 'one_time';

  if (draft.activityKind === 'other') {
    // 認不出是什麼活動時，退到最保守的說法。仍然是「一次」，仍然是投入。
    return oneTime ? '完成這一次說好的步驟' : '完成一次說好的步驟';
  }

  const noun = SESSION_NOUN[draft.activityKind];
  return oneTime ? `完成這一次約定的${noun}` : `完成一次約定的${noun}時段`;
}

// ---------------------------------------------------------------------------
// progress_model
// ---------------------------------------------------------------------------

/**
 * 進度怎麼看。**不問模型。**
 *
 * 也不再靠「任務名稱有沒有『閱讀』兩個字」這種判斷 —— 那種規則會在
 * 「我想每天練直笛」上安靜地失效。
 *
 * weekly_rhythm 的三個條件都是結構化事實：
 *   · D 類（學習與技能）—— 有進步軌跡，適合看累積
 *   · long_term        —— 有一段期間可以分週
 *   · 有節奏（一週幾次 / 固定哪幾天）—— 才有「本週 X / Y」的 Y
 *
 * 少一個就回 null。**不猜** —— 一個猜出來的進度模型會讓畫面顯示
 * 一個沒有依據的「本週 0/0」。
 */
export function canonicalProgressModel(
  draft: ChildProposalPlanDraft,
): ChildProposalProgressModel | null {
  if (draft.category !== 'D') return null;
  if (draft.durationType !== 'long_term') return null;
  if (draft.cadence === null) return null;
  if (draft.cadence.mode !== 'weekly_frequency' && draft.cadence.mode !== 'fixed_days') {
    return null;
  }
  return 'weekly_rhythm';
}

// ---------------------------------------------------------------------------
// next_step
// ---------------------------------------------------------------------------

export const NEXT_STEP_MAX_LENGTH = 40;
export const NEXT_STEP_MIN_LENGTH = 2;

/**
 * 結果導向的說法。出現任何一個就整句不採用。
 *
 * 「下一步」是孩子今天可以做完的一個動作。「讀完整本書」不是下一步，
 * 是兩週後的結果 —— 把它放進 next_step，孩子每天打開都會看到一件
 * 他今天做不到的事。
 */
const OUTCOME_MARKERS = [
  '讀完', '看完', '做完', '寫完', '學會', '全部', '整本', '整套',
  '考', '分數', '名次', '第一名', '滿分', '一定要', '必須',
];

/** 孩子不該在這裡讀到的東西：系統語言、AI、審核語意。 */
const NON_CHILD_MARKERS = ['AI', '系統', '任務', '審核', '批准', '評分', '目標達成'];

export type NextStepRejection =
  | 'absent'
  | 'too_short'
  | 'too_long'
  | 'outcome_based'
  | 'not_child_language';

export type NextStepResult =
  | { ok: true; value: string }
  | { ok: false; reason: NextStepRejection };

/**
 * 驗證 AI 的下一步建議。
 *
 * 過不了就是 null —— **不修剪、不改寫、不替它想一個**。
 * 一個「幫模型補完」的驗證器產出的是沒有人決定過的內容。
 */
export function validateNextStep(suggestion: string | null): NextStepResult {
  if (suggestion === null) return { ok: false, reason: 'absent' };

  const trimmed = suggestion.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'absent' };
  if (trimmed.length < NEXT_STEP_MIN_LENGTH) return { ok: false, reason: 'too_short' };
  if (trimmed.length > NEXT_STEP_MAX_LENGTH) return { ok: false, reason: 'too_long' };

  for (const marker of OUTCOME_MARKERS) {
    if (trimmed.includes(marker)) return { ok: false, reason: 'outcome_based' };
  }
  for (const marker of NON_CHILD_MARKERS) {
    if (trimmed.includes(marker)) return { ok: false, reason: 'not_child_language' };
  }

  return { ok: true, value: trimmed };
}

/** 通過驗證的下一步，或 null。 */
export function canonicalNextStep(draft: ChildProposalPlanDraft): string | null {
  const result = validateNextStep(draft.nextStepSuggestion);
  return result.ok ? result.value : null;
}

// ---------------------------------------------------------------------------
// 一次拿到四個
// ---------------------------------------------------------------------------

export type CanonicalPlanFields = {
  purposeCategory: ChildProposalPurposeCategory;
  completionDescription: string;
  progressModel: ChildProposalProgressModel | null;
  nextStep: string | null;
};

export function canonicalPlanFields(draft: ChildProposalPlanDraft): CanonicalPlanFields {
  return {
    purposeCategory: canonicalPurposeCategory(draft),
    completionDescription: canonicalCompletionDescription(draft),
    progressModel: canonicalProgressModel(draft),
    nextStep: canonicalNextStep(draft),
  };
}
