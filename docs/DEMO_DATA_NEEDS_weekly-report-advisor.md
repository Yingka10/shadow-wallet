# 週報 / AI 顧問 Demo 資料需求

> 給負責 Demo seed / reset 腳本的人看的需求清單，不是實作。
> 背景：`demo_seed.sql` / `qa_seed.sql` 目前完全沒有寫入 `task_completions`
> 或 `weekly_reports`（`DEMO_DATA_GUIDE.md` 也寫明「里程碑刻意都沒有標記完成」）。
> 這代表**週報畫面（`ParentWeeklyTablet`）跟 AI 顧問聊天（`AdvisorSideSheet`）目前沒有一鍵可重現的 Demo 資料**，只能手動下 SQL 湊。
> 這份文件只列「需要什麼」，不建 reset script，避免跟 Demo seed 的既有工作重疊。

## 1. 要哪一週的 task_completions

**一律相對「執行 reset 當下」算，不要寫死日期字串。**

`weekLabel`／週期邊界（`useParentWeeklyReport.ts` 的 `getWeekBounds`）是即時用
`dayjs().tz('Asia/Taipei').add(offset, 'week').startOf('isoWeek')` 算的，
以週一為週首。seed 要的是**「執行當下所在的 ISO 週」**裡的完成紀錄，
不是某個寫死的日曆日期——不然 reset 完隔天再展示就對不上「本週」了。

實務上建議：seed script 算出 `startOfIsoWeek`（週一 00:00, Asia/Taipei），
所有 `completed_at` 都用「週一 + N 天」這種相對寫法，不要用「now() - interval」
往前推（往前推在週一執行時容易跨到上週，見第 5 節）。

## 2. 要呈現哪些完成情境

週報跟顧問聊天的建議候選清單，都是從當週完成紀錄「算」出來的，不是預先寫好的
文字，所以資料本身要真的長成會觸發規則的樣子：

- **至少一個任務要「一週內做到達到 `max_claims_per_period` 上限」**
  （例如 `claim_period='day'`、`max_claims_per_period=1` 的任務，本週完成 ≥1 次）
  → 用來觸發「調整次數上限」建議（週報 + 顧問聊天都會用）
- **至少一個 `day_type='custom'` 且 `recurrence_days` 排 2 天以上的任務，
  本週實際完成的星期數 < 排定的星期數**（例如排週一三五、只做了週一）
  → 用來觸發「調整排定日」建議
- **至少一個任務完全沒完成**（本週 0 次）→ 用來觸發週報裡「還沒開始的目標」
  提示、以及 fallback insight 的「較弱類別」計算
- **`start_mode` 要混合 `self_started` 跟 `reminded`**
  → 週報「本週紀錄概覽」的「開始方式」統計格要有東西可以顯示，不要全部同一種
- **`planned_time_window` 要混合 `after_dinner` 跟 `before_bed`**
  → 同上，「完成時段」統計格
- 涵蓋 A/B/C/D 四個 `category` 至少各一個已排定任務，不用每個都有完成紀錄，
  但要在 `child_tasks` 裡是 active 的，週報的完成率統計才有東西可比

## 3. weekly_reports 要能正常生成/顯示，需要哪些資料

`ParentWeeklyTablet` 讀的東西（見 `useParentWeeklyReport.ts` 的 `fetchAll`）：

- `children`（`nickname`, `family_id`）
- `child_tasks`（該孩子 `is_active=true` 的任務關聯）
- `tasks`（`category`, `claim_period`, `max_claims_per_period`, `day_type`, `recurrence_days`）
- `task_completions`（見上一節，`completed_at` 要落在當週 + 上一週各要有一些，
  上一週的資料只用來算「連續達成」之類的比較，不用太多）
- `wallets`（該孩子的 `wallet_type='spending'` 錢包要存在）
- `transactions`（`type IN ('earn','redeem')`，當週的，用於幣值收支卡片）
- `long_term_goals`（`status='active'`，至少一個，用於長期任務進度卡）
- `time_savings`、`redemption_requests`、`growth_moments`：非必要但有的話畫面更完整，沒有也不會壞（都有空陣列的 fallback）
- **`weekly_reports` 這筆本身**：正確做法是實際呼叫 `generate-weekly-report`
  這支 Edge Function（帶 `childId` + 當週 `weekStart`）讓它真的生一份，
  不要手寫 `ai_suggestions` 的 JSON——這份 JSON 的欄位形狀（`suggestions[]`
  裡每則都要有 `action`/`taskId`/`currentXxx`/`suggestedXxx` 才能被前端的
  「採用/修改/復原」按鈕正確判斷要不要顯示）跟 `demo_seed.sql` 現在的哲學一致：
  「必須和 App 實際跑出來的一模一樣，手寫 INSERT 會在欄位形狀改動時默默漂移」。
  如果想要 100% 可控、不想依賴 Gemini 網路請求，可以呼叫時帶
  `FORCE_AI_FALLBACK=true`（這次新加的環境變數開關，見 P0-2 修復），
  這樣會直接產生 deterministic 規則版內容，格式仍然是真的、只是文案是規則產生的。

## 4. AI 顧問聊天（AdvisorSideSheet）額外需要什麼

顧問聊天**沒有自己專屬的資料表**，候選清單是即時從上面同一批 `tasks` +
`task_completions` 算出來的（`ParentHomeTablet.tsx` 的 `loadCandidates`），
所以只要第 2、3 節的資料備好，顧問聊天就有東西可以用——不需要另外多 seed 什麼。

唯一要注意：顧問聊天用的是「今天」的任務清單（`todayTasks`，來自
`useTodayTasks`／dashboard 的資料），跟週報用的「當週」資料是兩個不同的查詢窗口，
所以 Demo 排練當天最好也備一份「今天」有任務可以完成/未完成的資料，
不要只顧到「這一週」。

## 5. 日期邊界要特別驗證

- **跨週日**：ISO 週以週一為界，週日 23:59 → 週一 00:00 瞬間「本週」的定義會整個換掉。
  如果 reset 排練是在週間測試、但正式展示碰巧在週一早上執行，前一天 seed 的資料
  會全部被算進「上一週」，週報看起來會是空的。**reset script 完成後，
  建議實際在週日跨週一的時間點附近手動跑一次驗證**，不要只在週間測試過一次就當作沒問題。
- **9/22 決賽是週二**：如果彩排是週一測試、正式決賽週二跑，兩次 reset 產生的
  資料在「本週第幾天」的相對位置不同（例如彩排時「今天」是週一、決賽時「今天」
  是週二），跟「開始方式」「完成時段」這類看當天資料的欄位無關，但會影響「本週
  已完成 X/Y 天」這種天數統計的觀感，值得展示前再 reset 一次而不是沿用彩排的舊資料。
- **`weekOffset` 只能回溯到 -4**（`canGoBack: weekOffset > -4`），
  reset 資料不需要往前塞超過 4 週，塞了也看不到。
