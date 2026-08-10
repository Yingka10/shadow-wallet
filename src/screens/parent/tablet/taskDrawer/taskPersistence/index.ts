// Shadow Wallet · Parent Tablet — 持久化契約層對外入口
//
// 契約（types）＋ 純映射（mapTaskDraftToCommand）＋ 政策合成（finalize）
// ＋ 提交管線（submitTaskDraft）。這一層不 import React，也不 import Supabase：
// 真正的 Supabase adapter 在 src/lib/parentTaskCreationService.ts，
// 由畫面上層注入進來（見 ParentTaskManagementTablet）。

export * from './types';
export * from './clientRequestId';
export * from './dbMapping';
export * from './mapTaskDraftToCommand';
export * from './finalizeCreateParentTaskCommand';
export * from './submitTaskDraft';
export * from './tabForCreatedTask';
export * from './persistenceGaps';
