// Shadow Wallet · Parent Tablet — 自訂任務對外入口
//
// 呼叫端一律從這裡 import，不直接引內部檔案 —— 與 taskDraft / taskPersistence
// 的做法一致。
//
// domain（純函式，可在 node 測試）與畫面分開列出：
// 前者沒有任何 React 依賴，被 taskPersistence 直接引用。

// ── domain ──────────────────────────────────────────────────────────────
export * from './customTaskContract';
export * from './customTaskRouting';
export * from './customTaskRewardOptions';
export * from './customTaskInitializer';
export * from './customTaskAiAvailability';
export * from './customTaskCopy';

// ── 畫面（第九階段 C） ───────────────────────────────────────────────────
export { CustomChoiceCard } from './CustomChoiceCard';
export { CustomTaskStart } from './CustomTaskStart';
export { CustomTaskBasicsTitle } from './CustomTaskBasicsTitle';
export { CustomTaskBasicsPurpose } from './CustomTaskBasicsPurpose';
export { CustomTaskBasicsDuration } from './CustomTaskBasicsDuration';
export { CustomTaskSummaryCard } from './CustomTaskSummaryCard';
export { CustomTaskRewardSection } from './CustomTaskRewardSection';
