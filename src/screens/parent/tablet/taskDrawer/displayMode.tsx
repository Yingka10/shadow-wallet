// Shadow Wallet · Parent Tablet — 抽屜顯示模式
//
// 開發過程需要看到「這個欄位還沒接上後端」，但正式 Demo 不該讓家長看到半成品說明。
// 兩者的差別只有「要不要顯示實作狀態」，所以用一個由 Drawer 最上層往下傳的輕量 context，
// 而不是在每個 component 裡各自判斷 __DEV__ —— 那樣既無法在 Demo 機器上關掉，
// 也讓截圖結果取決於 build 設定。
//
// 刻意不做成全域設定系統：這個旗標只服務這個抽屜。

import React, { createContext, useContext, type ReactNode } from 'react';

export type PresetTaskDrawerDisplayMode = 'demo' | 'development';

/** 預設 demo —— 忘記傳的時候要是乾淨畫面，不是開發畫面。 */
export const DEFAULT_DISPLAY_MODE: PresetTaskDrawerDisplayMode = 'demo';

const DisplayModeContext = createContext<PresetTaskDrawerDisplayMode>(DEFAULT_DISPLAY_MODE);

export function DisplayModeProvider({
  mode,
  children,
}: {
  mode: PresetTaskDrawerDisplayMode;
  children: ReactNode;
}) {
  return <DisplayModeContext.Provider value={mode}>{children}</DisplayModeContext.Provider>;
}

export function useDisplayMode(): PresetTaskDrawerDisplayMode {
  return useContext(DisplayModeContext);
}

/**
 * 是否顯示「尚未串接後端」這類實作狀態說明。
 *
 * 注意：這只控制**說明文字**。功能本身（確認建立 disabled、不寫資料庫）
 * 在兩種模式下完全一樣 —— demo 模式不會假裝功能已經完成。
 */
export function useShowsImplementationNotes(): boolean {
  return useDisplayMode() === 'development';
}
