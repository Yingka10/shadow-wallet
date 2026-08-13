// GrowBook — Planning contract 的 deterministic guards（P1-A1）
//
// ─────────────────────────────────────────────────────────────────────────
// 這裡是**產品原則變成程式**的地方。每一條都不是 prompt 裡的一句請求，
// 而是一個過不了就整份不放行的檢查。
//
// ⚠️ 下一步的規則**重用既有的 validateNextStep**（P0-3 的
//    canonicalPlanFields.ts），不 copy 第二份關鍵字清單。理由不只是 DRY：
//    兩份清單一定會分岔，而分岔之後「讀完整本書」會在某一條路徑上
//    安靜地變成合法的下一步。
//
// 這個檔案唯一新增的關鍵字清單是**心理狀態**，因為既有的兩份清單
// （OUTCOME_MARKERS / NON_CHILD_MARKERS）都沒有涵蓋它 —— 它們擋的是
// 「結果導向」與「系統語言」，而「你最近失去動機」兩者都不是。
//
// 這些 guard 只住在 App 端。Function 端不重複實作（parity 測試會確認
// 它沒有第二份清單）—— 與 canonical 完成標準同一個分工：
// Function 回「理解」，App 決定「能不能用」。
// ─────────────────────────────────────────────────────────────────────────

import { validateNextStep } from '../childProposal/planDraft/canonicalPlanFields';
import {
  EVIDENCE_PRIORITY,
  type ChildGoalPlanningInput,
  type ChildPlanFieldSource,
} from './types';

// ---------------------------------------------------------------------------
// 心理狀態推測
// ---------------------------------------------------------------------------

/**
 * AI 不可以診斷孩子的內在狀態。
 *
 * 可以說：「最近幾次星期三比較難照原本安排完成」——那是可觀察的事實。
 * 不可以說：「你最近失去動機」「你不夠自律」——那是對一個孩子的心理判斷，
 * 而做出這個判斷的是一個從來沒見過他的模型。
 *
 * 同一組詞也讓 staged 的 phase 完成條件不可能寫成「更有自信」：
 * 一個看不見的完成條件沒有人有辦法說它到了沒有。
 */
export const MENTAL_STATE_MARKERS = [
  '失去動機', '沒有動機', '缺乏動機', '動機不足',
  '不夠自律', '缺乏自律', '沒有自律',
  '沒有毅力', '缺乏毅力', '意志力', '三分鐘熱度',
  '厭倦', '倦怠', '排斥', '抗拒',
  '更有自信', '有自信', '沒自信', '沒有信心', '更有信心',
  '真正理解', '真的理解', '發自內心', '打從心裡',
  '建立熱情', '培養熱情', '愛上', '更喜歡', '產生興趣', '失去興趣', '沒興趣',
  '專注力不足', '不專心', '不夠認真', '態度不佳', '懶惰', '偷懶',
] as const;

/**
 * 出現任何一個心理狀態詞就是 true。
 *
 * `allowed` 是**孩子自己講過的**字眼（見 childVocabulary）。孩子說
 * 「我想更有自信」的時候，AI 把它整理成 desiredOutcome 不是診斷，
 * 是保留他的話 —— 而弄丟他的話比誤判更糟。
 */
export function containsMentalStateDiagnosis(
  value: string,
  allowed: readonly string[] = [],
): boolean {
  return MENTAL_STATE_MARKERS.some(
    (marker) => !allowed.includes(marker) && value.includes(marker),
  );
}

// ---------------------------------------------------------------------------
// 沒有人決定過的具體時間
// ---------------------------------------------------------------------------

/**
 * 「晚上 8:00」「八點」這種具體鐘點。
 *
 * 孩子沒說時段時，計畫裡不可以冒出一個 —— 那是模型替家庭做的決定，
 * 而且它會長得跟孩子自己選的一模一樣，事後分不出來。
 *
 * 只擋**鐘點**，不擋「睡前」「放學後」這類相對描述：後者通常是從孩子
 * 自己的話裡整理出來的，而且不會被誤讀成一個約定好的時刻。
 */
const CLOCK_TIME_PATTERNS = [
  /\d{1,2}\s*[:：]\s*\d{2}/,
  /[0-9０-９一二三四五六七八九十兩]{1,3}\s*點/,
  /\b\d{1,2}\s*(am|pm)\b/i,
];

export function containsClockTime(value: string): boolean {
  return CLOCK_TIME_PATTERNS.some((pattern) => pattern.test(value));
}

// ---------------------------------------------------------------------------
// 領域權威
// ---------------------------------------------------------------------------

/**
 * GrowBook 的 AI 是**規劃夥伴**，不是各領域的專業教練。
 *
 * 它可以：澄清目標、整理孩子已有的方法、把遠期目標縮成近期行動、
 * 幫忙決定節奏與試行期、對明顯是專案的事給一條暫定路線、提供 2-3 種
 * 可能的開始方式。
 *
 * 它**不可以**把模型的一般知識講成領域權威 ——「最有效的鋼琴練習順序」
 * 「科學上最佳的複習頻率」「專業的重訓處方」。理由不是謙虛：
 * 一個十歲孩子（和他的家長）沒有辦法分辨那句話是教練說的還是模型編的，
 * 而如果他真的有老師，模型的版本會直接和老師的版本打架。
 *
 * 所以 staged 的 phases 一律是 **provisional route**，不是 curriculum。
 */
export const DOMAIN_AUTHORITY_MARKERS = [
  '最佳', '最有效', '最正確', '最科學', '最專業',
  '正確順序', '標準課程', '標準流程', '正規訓練', '專業訓練', '專業課程',
  '科學證明', '研究顯示', '研究證實', '實證',
  '教練建議', '醫師建議', '營養師', '處方', '療程',
  '權威', '必修', '一定要照這個順序', '正統',
] as const;

/** 出現任何一個權威宣稱就是 true。`allowed` 的意義同上。 */
export function containsDomainAuthorityClaim(
  value: string,
  allowed: readonly string[] = [],
): boolean {
  return DOMAIN_AUTHORITY_MARKERS.some(
    (marker) => !allowed.includes(marker) && value.includes(marker),
  );
}

// ---------------------------------------------------------------------------
// 孩子自己的用詞
// ---------------------------------------------------------------------------

/**
 * 這些 guard 限制的是**模型生成／整理後的內容**，不是孩子的輸入。
 *
 * 孩子說「我想找到最有效的讀書方法」，那句話裡的「最有效」是他的願望；
 * 整份計畫因為這三個字被退掉，等於系統因為孩子用了某個詞就拒絕幫他 ——
 * 而他根本沒有做錯任何事，畫面上只會顯示「這一輪沒有計畫」。
 *
 * 所以：**孩子自己用過的字眼，在整理後的敘述裡不算 AI 宣稱。**
 * 其他字眼一個都沒有放寬 —— 孩子講了「最有效」，模型仍然不可以說
 * 「研究顯示」「專業訓練處方」。
 *
 * ⚠️ 這個放寬**只適用於敘述性欄位**（desiredOutcome、摘要、目前重點、
 *    選項、問題）。硬性 guard 不吃這一套：
 *
 *      · nextAction / controllableActions 一律走完整的 checkPlanActionText
 *      · staged 的 observableDoneWhen 一律不准是心理狀態
 *
 *    「更有自信」不會因為孩子講過就變成一個看得見的完成條件，
 *    「拿第一名」也不會因為孩子講過就變成他下一次做得到的動作。
 *    這兩類是 safety guard，不參與證據優先序，也不被 child-stated 覆蓋。
 */
export type ChildVocabulary = {
  mentalState: string[];
  domainAuthority: string[];
};

export function childVocabulary(input: ChildGoalPlanningInput): ChildVocabulary {
  const childText = [
    input.childOriginalGoal,
    input.childApproach ?? '',
    input.childOriginalMotivation ?? '',
  ].join('\n');

  return {
    mentalState: MENTAL_STATE_MARKERS.filter((marker) => childText.includes(marker)),
    domainAuthority: DOMAIN_AUTHORITY_MARKERS.filter((marker) => childText.includes(marker)),
  };
}

// ---------------------------------------------------------------------------
// 證據優先序
// ---------------------------------------------------------------------------

/**
 * 低順位證據不得覆蓋高順位。
 *
 *   孩子講的 > 從孩子的內容推導 > GrowBook 的決定性規則 > AI 建議 > 沒有人決定
 *
 * 這支回答的是「actual 這個來源，夠不夠格代表 expected 那個等級的東西」。
 * 孩子講過節奏，provenance 卻標成 ai_suggested，就是一次覆蓋。
 */
export function evidenceSatisfies(
  actual: ChildPlanFieldSource,
  atLeast: ChildPlanFieldSource,
): boolean {
  return EVIDENCE_PRIORITY[actual] <= EVIDENCE_PRIORITY[atLeast];
}

// ---------------------------------------------------------------------------
// 下一步 / 可控制的行動
// ---------------------------------------------------------------------------

export type PlanActionCheck = { ok: true; value: string } | { ok: false; reason: string };

/**
 * 一句話能不能當成「下一次可以直接做的動作」。
 *
 * 完全走既有的 validateNextStep —— 「讀完整本書」「國文考 100 分」
 * 「拿第一名」都在那份清單上，這裡不需要、也不應該再寫一次。
 */
export function checkPlanActionText(value: string): PlanActionCheck {
  const result = validateNextStep(value);
  if (!result.ok) return { ok: false, reason: result.reason };
  if (containsMentalStateDiagnosis(result.value)) {
    return { ok: false, reason: 'mental_state' };
  }
  if (containsDomainAuthorityClaim(result.value)) {
    return { ok: false, reason: 'domain_authority' };
  }
  return { ok: true, value: result.value };
}

// ---------------------------------------------------------------------------
// Minimal Question Principle
// ---------------------------------------------------------------------------

export type InformationSufficiency = 'sufficient' | 'insufficient';

/**
 * 孩子講的東西夠不夠形成一份行動計畫。
 *
 * 「夠」的定義刻意窄：**節奏有了，而且孩子自己講過要做什麼**。
 * 兩個都有的時候，再問「你想一週幾次？」「你完成的標準是什麼？」
 * 就不是釐清，是多嘴 —— 而多嘴一次，孩子下次就不會想再打字了。
 *
 * 注意這支**不判斷計畫好不好**，只判斷「還需不需要再問一題」。
 */
export function informationSufficiency(input: ChildGoalPlanningInput): InformationSufficiency {
  const hasCadence = input.cadence !== null;
  const hasApproach =
    typeof input.childApproach === 'string' && input.childApproach.trim().length > 0;
  return hasCadence && hasApproach ? 'sufficient' : 'insufficient';
}

// ---------------------------------------------------------------------------
// 孩子講過的節奏
// ---------------------------------------------------------------------------

/** 兩個節奏是不是同一個。孩子選過的節奏必須原封不動出現在計畫裡。 */
export function cadenceEquals(
  a: ChildGoalPlanningInput['cadence'],
  b: ChildGoalPlanningInput['cadence'],
): boolean {
  if (a === null || b === null) return a === b;
  if (a.mode !== b.mode) return false;
  if (a.mode === 'weekly_frequency') return a.weeklyFrequency === b.weeklyFrequency;
  if (a.mode === 'fixed_days') {
    const left = [...(a.days ?? [])].sort((x, y) => x - y);
    const right = [...(b.days ?? [])].sort((x, y) => x - y);
    return left.length === right.length && left.every((day, i) => day === right[i]);
  }
  return true;
}
