# P0-7 長期任務誠實進度設計

## 目標

孩子端長期任務詳情頁只呈現資料庫能支持的進度。閱讀 Demo 以「本週完成次數／本週安排次數」與累積真實投入為主；漏掉一天只標示未記錄，不清除先前完成紀錄、不顯示失敗或重新開始。

## 資料規則

- 進度來源限於 `task_completions`、task 排程、goal 起訖與既有 goal/task 欄位。
- 日常節奏型任務以 Asia/Taipei 日曆日計算；同一排程日多筆 completion 只計一次。
- 非排程日、計畫開始日前與有效結束日後的 completion 不計入節奏目標。
- 本週目標是本週內且落在計畫期間的排程日數，不硬寫 Demo 數字。
- `missed` 只是過去排程日沒有 completion 的事實，不改變累積完成數。
- 閱讀下一步優先使用非空的 `long_term_goals.motivation_note`；沒有時使用 task 名稱組成中性 fallback，不生成 milestone。

## 依 goal kind 區分

- `reading_habit`：隱藏 milestone/checkpoint reward timeline；不從 `current_day`、日期或 completion 數推導 milestone completion。可顯示 task 本身已確認的 per-completion 幣值簡單文字，但不放入 checkpoint timeline，也不宣稱尚未發放的獎勵狀態。
- `habit` / `family`：週節奏與累積投入使用真實 completion；checkpoint 設定若顯示，只能是中性計畫節點，不用 `current_day` 宣稱完成或回饋已記下。
- `skill`：保留 `current_level` / `level_definitions`，因為資料模型有明確階段狀態。
- `challenge`：保留 `current_value` / `target_value` 與依實際累積值呈現的節點；不額外推導獎勵已發放。

## UI

- 保留既有頁面結構與視覺。
- 閱讀 Hero 顯示本週真實 `completed / target`、累積真實投入與溫和的下一步。
- milestone 陣列為空時不渲染「成長里程碑」區塊。
- missed day 文案使用「今天／下一次繼續就好」語氣，不使用 streak、失敗、歸零或重新開始。

## 測試

- 本週 3/4、missed day 不歸零、同日重複 completion 去重、非排程日不計入。
- 計畫開始／結束邊界與 Asia/Taipei 日曆邊界。
- 閱讀不顯示假 milestone completion，沒有 completion state 時不推導完成。
- habit、family、skill、challenge 的關鍵 regression。
- 相關 component / screen tests 與 TypeScript typecheck。

## 不包含

- proposal / version domain、parent home、weekly report、wallet / coin policy。
- milestone completion schema、P0-8 調整 persistence、P0-9 或新 AI。
