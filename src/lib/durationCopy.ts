// Shadow Wallet — 期間與回顧的說法
//
// 抽屜的預覽、任務列表的長期任務卡都要講「多久」與「什麼時候一起回顧」。
// 這些字先前散在兩個地方各寫一次，於是同一個 28 天在預覽叫「28 天後一起看看」、
// 在列表叫「4 週家庭角色」。集中在這裡，兩邊讀同一份。

// 量詞用的中文數字。二 → 兩：「兩週」是口語，「二週」不是中文說法。
const CN_WEEKS = ['零', '一', '兩', '三', '四', '五', '六', '七', '八', '九', '十'];

function weekLabel(weeks: number): string {
  return weeks < CN_WEEKS.length ? CN_WEEKS[weeks] : String(weeks);
}

/** 整週講週、不整週講天。`28` → `四週`；`10` → `10 天`。 */
export function weeksOrDaysText(days: number): string {
  if (days > 0 && days % 7 === 0) return `${weekLabel(days / 7)}週`;
  return `${days} 天`;
}

/**
 * 固定任務的定期回顧。
 *
 * 原本是「28 天後一起看看」。家長設定時想的是「四週」而不是 28 天，
 * 而「看看」聽起來像順便瞄一眼 —— 那是這個產品裡最需要坐下來談的一次對話。
 */
export function reviewCycleText(days: number): string {
  if (days > 0 && days % 7 === 0) return `${weekLabel(days / 7)}週後一起回顧`;
  return `${days} 天後一起回顧`;
}

/**
 * 長期任務的期滿回顧。
 *
 * 整週講「預計四週後一起回顧」，不整週講「預計第 10 天一起回顧」——
 * 後者對得上家長設定時填的那個數字。
 */
export function plannedReviewText(days: number): string {
  if (days <= 0) return '';
  if (days % 7 === 0) return `預計${weekLabel(days / 7)}週後一起回顧`;
  return `預計第 ${days} 天一起回顧`;
}
