# 移除閱讀提醒狀況提問

## 目的

孩子完成自主閱讀後，不再被追問「開始閱讀前，有人提醒嗎？」。這個問題容易讓完成動作帶有被檢查的感覺，也不是目前 Demo 必須蒐集的資料。

## 介面行為

- 移除「開始閱讀前，有人提醒嗎？」整段內容。
- 移除「我自己開始的」與「提醒後開始」兩個按鈕。
- 完成閱讀後只保留「今天的閱讀已記下」狀態。
- 保留「晚餐後／睡前」的閱讀時間選擇，因為它用來協助孩子找到適合自己的閱讀節奏。

## 資料行為

- 前端不再寫入 `start_mode`。
- 既有 `task_completions.start_mode` 欄位與歷史資料保留，不修改或刪除 migration。
- 完成閱讀時，若有選擇閱讀時段，仍將 `planned_time_window` 寫入該次完成紀錄。
- `record_completion_context` RPC 改為允許 `p_start_mode` 為空值，讓閱讀時段能獨立保存。

## 程式邊界

- `LongTermGoalDetailView` 不再接收 `onRecordStartMode`。
- `LongTermDetailScreen` 不再維護 `pendingCompletionId` 或提供提醒狀況 callback。
- `completeTask` 成功後，由 Screen 以 completion ID 保存當天閱讀時段。
- 時段寫入失敗不撤銷已完成的閱讀，但顯示可理解的錯誤提示。

## 測試

- 共用詳情元件完成閱讀後，不得出現問題與兩個按鈕。
- Screen 完成閱讀後，會以 completion ID 和選擇時段呼叫 context RPC，`start_mode` 傳入空值。
- context RPC 型別與測試允許 `start_mode = null`。
- 技能型與其他長期任務仍使用同一視覺骨架。

## 不在範圍內

- 不刪除資料庫的 `start_mode` 欄位。
- 不改造週報或新增其他完成後問題。
- 不改變閱讀任務的總進度、里程碑或獎勵規則。
