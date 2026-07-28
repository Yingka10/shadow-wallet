# GrowBook 孩子端長期任務詳情頁精修設計

## 目標

將現有長期任務詳情頁從「閱讀打卡活動頁」整理為成熟的長期成長計畫頁。孩子進入頁面後，應先理解：

1. 現在是第幾週，這週完成幾次。
2. 今天要做什麼，今天是否已記錄。
3. 下一個里程碑是什麼。
4. 計畫不合適時，可以提出調整並和家長討論。

頁面延續 GrowBook 的米白、深松綠、葉綠與少量金色。保留樹屋作為情感識別，但降低遊戲活動卡的視覺重量。

## 範圍與限制

本輪只修改孩子端長期任務詳情頁、呈現模型、相關共用元件與測試。

禁止修改：

- `src/screens/parent/tablet/taskDrawer/**`
- `src/screens/parent/tablet/ParentTaskManagementTablet.tsx`
- `src/constants/parentTheme.ts`
- 家長端任務建立流程與 persistence mapping
- Supabase migration
- `package.json` 與 lock file

週末回顧與調整提案目前沒有後端資料表。本輪可以提供可操作的本機草稿 Sheet，但必須清楚顯示「尚未送出」，不得宣稱家長已收到或規則已生效。

## 現況盤點

- 頁面入口：`HomeScreen` 的長期任務卡導向 `LongTermDetail` Stack route。
- 畫面容器：`LongTermDetailScreen.tsx`。
- 共用內容：`LongTermGoalDetailView.tsx`。
- 呈現資料：`longTermGoalPresentation.ts`。
- 長期任務資料：`long_term_goals`、`tasks`、`task_completions`。
- recurrence：優先使用 `long_term_goals.active_days`，其次依任務類型採既有預設。
- 今日完成：以台北時區判斷今天是否已有 completion。
- 里程碑：來自 `checkpoint_rewards` 或技能型 `level_definitions`。
- BottomNav：目前由詳情頁自己渲染，且 active tab 寫死為 `wallet`。本輪移除，因為此頁是 Stack 深層頁。
- 現有能力只有完成與記錄偏好時段；沒有查看／更正紀錄、週末回顧、調整提案或暫停流程。

## 資訊架構

### Header

- 返回按鈕。
- 任務名稱。
- 小型週次狀態。
- 更多按鈕。
- 不顯示 BottomNav。

更多選單提供：

- 查看計畫詳情。
- 提出調整。
- 暫停一下。

「暫停一下」只會帶入調整提案草稿，不直接修改正式目標狀態。

### 精簡計畫摘要

- 深色樹屋摘要高度較現況減少約 20%。
- 樹屋縮小並固定在角落，不壓縮主要文字。
- 主資訊顯示「第 N 週／共 N 週」與「本週完成 N／N 次」。
- 保留整體進度條，但不另外顯示百分比。
- 顯示本週目標與下一個里程碑。
- 分類標籤改用正式 SVG icon，不使用 emoji。

### 今天的小步驟

預設精簡顯示：

- 今日具體行動。
- 預計時段。
- 深綠主要 CTA。

可展開顯示說明與提示。

完成後改為淡綠狀態區：

- 今天已完成與實際分鐘數。
- 有資料時顯示記錄時段。
- 查看紀錄。
- 需要更正。

更正流程只允許修正現有 completion 的偏好時段；若資料能力不足，顯示尚未支援的說明，不刪除 completion、不假造成功。

### 本週安排

固定顯示一週七天，並以 recurrence 判斷是否安排。支援：

- `completed`
- `today`
- `upcoming`
- `missed`
- `unscheduled`

本輪沒有「跳過」資料來源，因此不假造 `skipped`。呈現模型保留擴充能力，但畫面只顯示可由真實資料判斷的狀態。

週摘要只描述完成次數，不再顯示「自己開始」，因為目前孩子端不記錄 start mode。

### 成長里程碑

改為平面 timeline：

- 已完成的起點或里程碑。
- 下一個里程碑。
- 四週後共同回顧。

成長幣以次要文字顯示。狀態 badge 使用小尺寸淡色，不像 CTA。

### 週末一起回顧

卡片可開啟 Sheet，最多三題：

1. 喜歡的內容或原因，可不填。
2. 較合適的時段。
3. 下週是否想調整。

答案只存在目前畫面的本機草稿。Sheet 明確說明尚未送出家長端；關閉後可以再次打開繼續編輯。

### 計畫詳情與調整提案

計畫詳情 Sheet 顯示真實資料能提供的：

- 計畫期間。
- 任務類型。
- 完成條件。
- 建議時段。
- 可提出調整的項目。

調整 Sheet 可選：

- 更換時段。
- 調整每週次數。
- 更換閱讀方式或內容。
- 暫停一下。
- 和家長討論。

操作為「保留調整草稿」，不更新正式 task 或 goal。保留後顯示本機草稿狀態，不顯示已送出。

### 最近紀錄

使用現有 completion 顯示最近三筆：

- 日期。
- 任務分鐘數。
- 已有資料時顯示偏好時段。

目前沒有書名、心得或開始方式，因此不顯示這些欄位。

## 元件與資料邊界

`longTermGoalPresentation.ts` 負責：

- 週次與週目標計算。
- 七日狀態。
- 整體與本週進度。
- 里程碑狀態。
- 最近紀錄格式化。
- 計畫期間與詳情文案。

`LongTermGoalDetailView.tsx` 負責：

- 頁面區塊與 SVG icon。
- 展開／收合。
- 完成狀態。
- 查看紀錄 Sheet。
- 週末回顧本機草稿。
- 計畫詳情與調整本機草稿。

`LongTermDetailScreen.tsx` 負責：

- Supabase 讀取。
- 真實 completion 寫入。
- completion 時段 context 更新。
- Header、更多選單與 Sheet 狀態協調。

不建立新的資料表，不把草稿塞入不相關欄位。

## 響應式與無障礙

- 支援 360、375、390、430px 寬度。
- Header 標題保留可閱讀空間，週次與更多按鈕不擠壓標題。
- 七日進度使用穩定等寬欄位。
- 所有按鈕至少提供合理點擊範圍。
- icon-only 按鈕有 accessibility label。
- 展開控制提供 expanded state。
- 每日狀態提供完整 accessibility label。
- 已完成狀態同時使用圖示與文字。
- Sheet 關閉後焦點與背景操作依 React Native Modal 慣例處理。

## 測試

以 TDD 補齊：

- recurrence 產生七日狀態與未安排日。
- 本週完成數與總週數。
- 不再顯示 self-started 摘要。
- 精簡摘要不重複顯示百分比。
- 完成前 CTA 與完成後狀態區。
- 今日步驟展開／收合。
- 里程碑 timeline 狀態。
- 最近紀錄只使用真實 completion 欄位。
- 更多選單、計畫詳情、調整草稿與週末回顧 Sheet。
- 詳情頁不渲染 BottomNav。
- 360px 相關的穩定樣式與 accessibility props。

完成後執行相關 Jest 測試與 TypeScript 檢查，並把既有 baseline 錯誤與本輪新增錯誤分開回報。
