// Shadow Wallet · Parent Tablet — 持久化契約層對外入口
//
// 這一層目前沒有任何畫面在用：抽屜的「確認建立」仍是 disabled 的靜態元素。
// 它存在的目的是讓下一階段的 migration 與 service 有一份先寫好的輸入契約，
// 而不是等到要接資料庫時才臨時決定欄位。

export * from './types';
export * from './dbMapping';
export * from './mapTaskDraftToCommand';
export * from './finalizeCreateParentTaskCommand';
export * from './persistenceGaps';
