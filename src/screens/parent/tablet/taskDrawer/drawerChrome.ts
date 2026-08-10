// Shadow Wallet · Parent Tablet — 抽屜外框的純計算
//
// 抽出來是為了可以單獨測：寬度與遮罩濃度是「看得到但很難在整合測試裡斷言」的東西，
// 拆成純函式之後 breakpoint 有沒有跑掉一眼就知道。

import { ParentColors, ParentSpacing } from '../../../../constants/parentTheme';

/**
 * 抽屜寬度：480–520，且不得超出 viewport。
 * 768/1024 → 480；1366 → 520。窄於平板下限時再退讓，保留 24 邊界。
 */
export function panelWidthFor(viewportWidth: number): number {
  const preferred = Math.min(520, Math.max(480, viewportWidth * 0.42));
  return Math.max(300, Math.min(preferred, viewportWidth - ParentSpacing[6]));
}

/**
 * 換用較深遮罩的門檻。
 *
 * 768 的 viewport 扣掉 480 抽屜只剩不到 300，主頁的任務名稱會被擠成一字一行；
 * 那種破碎文字比純色更吸睛，所以窄的時候把背景壓得更暗。
 * 900 以上空間夠，維持原本較輕的遮罩，讓家長仍看得出自己在哪一頁。
 */
export const COMPACT_SCRIM_MAX_WIDTH = 900;

export function usesCompactScrim(viewportWidth: number): boolean {
  return viewportWidth < COMPACT_SCRIM_MAX_WIDTH;
}

/** 遮罩顏色。一律走 token，component 內不出現 rgba。 */
export function scrimColorFor(viewportWidth: number): string {
  return usesCompactScrim(viewportWidth) ? ParentColors.scrimCompact : ParentColors.scrim;
}

/**
 * 按下 Escape 時該做什麼。
 *
 * 確認框開著的時候，Escape 是「取消這個確認」而不是「放棄草稿」——
 * 逃離鍵不該變成破壞性操作的捷徑，那會讓家長一鍵清掉剛填完的內容。
 *
 * 抽成純函式是因為實際的 listener 只掛在 web，測試環境跑不到。
 */
export type EscapeAction = 'dismissConfirmation' | 'closeDrawer';

export function escapeActionFor(hasPendingConfirmation: boolean): EscapeAction {
  return hasPendingConfirmation ? 'dismissConfirmation' : 'closeDrawer';
}
