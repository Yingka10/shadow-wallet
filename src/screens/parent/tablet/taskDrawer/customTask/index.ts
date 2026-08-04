// Shadow Wallet · Parent Tablet — 自訂任務 domain 對外入口
//
// 呼叫端一律從這裡 import，不直接引內部檔案 —— 與 taskDraft / taskPersistence
// 的做法一致。
//
// ⚠️ 第九階段 A：**只有 domain 與純函式，沒有畫面。**
//    自訂入口的 UI、Step 表單與 Drawer 整合都還沒做（第九階段 B）。

export * from './customTaskContract';
export * from './customTaskRouting';
export * from './customTaskRewardOptions';
export * from './customTaskInitializer';
export * from './customTaskAiAvailability';
