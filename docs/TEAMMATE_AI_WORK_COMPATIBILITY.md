# 舊 AI 成果盤點與新契約相容性

> 第八階段 B0。**本輪不呼叫 Gemini、不部署、不接 UI、不改既有 AI 檔案。**
> 本文件不含 API key、prompt secret、project ref 或任何真實家庭資料。
> 分支：`feat/task-ai-recommendation-adapter`

---

## 先講三件會影響判斷的事

**一、我在第八階段 A 說錯了一句話，這裡更正。**
我當時說「平板家長端目前一條 AI 路徑都沒有」。那是**錯的**。
正確的說法是：**新的任務抽屜**沒有 AI 路徑，但**平板首頁右欄有兩條，而且是活的** ——
`ParentHomeTablet.tsx` 的 `AssignTaskPanel`（呼叫 `suggestTaskCoin`）
與 `NewTaskPanel`（呼叫 `classifyTask`），兩者都直接 `supabase.functions.invoke('ai-proxy')`，
沒有經過 `aiAgent.ts`，所以只 grep client 函式名找不到它們。
這改變了淘汰範圍：那兩條讓 LLM 影響幣值的路徑就在正式畫面上跑著。

**二、第八階段 A 的待決事項第 4 條也是錯的。**
我說「`coin-policy.json` 有兩份，接 AI 前先確認是否合併」。
實際上這個 repo 裡**只有一份** `coin-policy.json`（在 `ai-proxy/`），
而 `taskReward/coinPolicy.ts` 是用相對路徑 import 那同一份檔案。
真正重複的是**演算法**（`calcCoins` 與 `priceCoin` 各一份），而那是刻意的，
理由寫在 `coinPolicy.ts` 檔頭。所以沒有「要不要合併」的問題要決定。

這個前例很重要，因為第八階段 B 的 client/server validator 面對的是同一個限制，
而這個 repo 已經有一個可行的答案：**資料一份，演算法兩份，測試釘住。**

**三、程式碼存在不等於產品在用。** 下表的「仍被呼叫」欄位是逐一追進 navigator
與畫面確認的，不是看檔案有沒有被 import。

---

## 一、逐檔盤點

### A. `supabase/functions/ai-proxy/index.ts`

一個檔案六個 action，共用同一支 `callGemini` 與同一支 `parseJson`。
下面拆開看，但**這三個問題是整支共有的**：

| 問題 | 證據 | 後果 |
|---|---|---|
| 完全沒有 timeout | `fetch` 沒有 `signal`，整檔沒有 `AbortController` | Gemini 掛住就一路掛住 |
| `parseJson` 是 cast 不是驗證 | `JSON.parse(cleaned) as T` | 模型回什麼都算合法 |
| prompt 用字串插值 | `任務名稱：${payload.taskName}` | 家長輸入落在指令段落裡 |

`MODEL_CHAIN` 逐一改試三個 model 讓第一項更糟：三次串起來可以遠超任何合理上限。

| # | action | 用途 | 輸入 | 輸出 | 仍被呼叫 | 直接改表單 | LLM 決定幣值 | 用孩子資料 | schema 驗證 | timeout | injection 防護 | 結論 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 | `classifyTask` | 舊 A/B/C/D 分類＋估時＋難度 | `taskName` | `category` / `base_time_min` / `difficulty` | **是** — `ParentHomeTablet` `NewTaskPanel` | 是，寫進 `coins` state | **是（間接）** — 估時×難度直接算成幣值 | 只有任務名 | 只查 category ∈ A-D | 無 | 無 | **淘汰** |
| A2 | `suggestTaskCoin` | 直接建議幣值 1–50 | `taskName` | `coins` / `reason` | **是** — `ParentHomeTablet` `AssignTaskPanel` | 是，寫進建議區間 | **是（直接）** | 只有任務名 | 只 clamp 1–50 | 無 | 無 | **淘汰** |
| A3 | `analyzeTask` | AI 只理解、規則引擎算幣 | `taskName` / `childAgeGroup` / `taskSource` / `durationType` | 類別＋估時＋難度＋`runEligibilityGate`＋`calcCoins` | 是 — 手機版 `ParentTaskCreateScreen`（已註冊路由，但依 CLAUDE.md 手機家長端不再維護） | 是 | **否** — 這是它唯一做對的地方 | 年齡段（分級） | 無（`parseJson as T`） | 無 | 無 | **架構可重用，實作不可** |
| A4 | `suggestRewardCoin` | 獎勵品定價 15–200 | `rewardName` | `coins` / `reason` | 否 — `aiAgent.suggestRewardCoin` 零呼叫點 | — | **是（直接）** | 否 | 只 clamp | 無 | 無 | 與任務建議無關，本輪不動 |
| A5 | `screenRedemptionRequest` | 審核孩子兌換申請的幣值 | `rewardName` / `coinCost` / `description` | `verdict` / `reason` / `suggestedCoins` | **是** — `useParentRedemption.ts:307` | 否，只顯示 | 是（建議值） | 否 | 查 verdict ∈ ok/high | 無 | 無 | 與任務建議無關，本輪不動 |
| A6 | `suggestCoinWithAI` | 兌換目標定價 60–200 | `rewardName` | `coins` / `weeks` / `reason` | **是** — `GoalSetupScreen.tsx:72` | 是 | **是（直接）** | 否 | **完全沒有** | 無 | 無 | 與任務建議無關，本輪不動 |

### B. `src/lib/aiAgent.ts` — client 端封裝

| 函式 | 仍被呼叫 | 說明 |
|---|---|---|
| `classifyTask` | **否** | 畫面直接 invoke ai-proxy，繞過這一層 |
| `suggestTaskCoin` | **否** | 同上 |
| `analyzeTask` | 是（手機版） | fallback 是「不自動發幣、要家長確認」——**方向正確** |
| `suggestRewardCoin` | 否 | — |
| `screenRedemptionRequest` | 是 | — |
| `generateDegradeSuggestion` | 否 | 轉呼叫 WF-5 Edge Function |
| `generateWeeklyInsight` | 否 | 已是空 stub，回 `''` |

**值得留下的一件事：這裡每一個函式都有 fallback，而且 fallback 都是安全的方向。**
`analyzeTask` 失敗時回 `coinEnabled: false` + 「請家長手動確認」，不是回一個猜的幣值。
新契約的 `UnavailableTaskAiRecommendationService` 是同一個想法：**AI 不可用是正常狀態，不是錯誤畫面。**

### C. `src/lib/taskRecommend.ts`

`fetchTemplates` / `recommendTasks` / `calcTotalCoin` 是純規則，與 AI 無關，不在盤點範圍。
`suggestCoinWithAI`（A6）是唯一的 AI 路徑，**連 `error` 以外的驗證都沒有**：
`return data as { coins; weeks; reason }`。

### D. `supabase/functions/generate-degradation-suggestion/index.ts`

| 欄位 | 內容 |
|---|---|
| 用途 | 孩子連續未完成時，給家長一句溫和的建議 |
| 輸入 | 輕量模式 `{taskName, age, days}`；豐富模式 `{taskId, childId}` → **用 service role 讀 tasks / children / task_completions** |
| 輸出 | `{ suggestion: string }` 自由文字 |
| 仍被呼叫 | **否**（`aiAgent.generateDegradeSuggestion` 零呼叫點；`detect-abandonment` 的 cron 也沒排） |
| 直接改表單 | 否 |
| LLM 決定幣值 | 否 |
| 用孩子資料 | **是** — 生日換算年齡、14 天完成率 |
| schema 驗證 | 否（輸出是自由文字，無結構可驗） |
| timeout | **無** |
| injection 防護 | **無** — `任務名稱：${taskName}` 直接插值 |
| 結論 | **不重用**。輸出是散文，沒有 `fieldPath` 可以對應，也不能逐項採用 |

它做對的一件事：把 AI 建議與家長實際決定分開寫進 `intervention_log`
（`ai_suggested` vs `parent_decision`）。那個「建議 ≠ 決定」的資料模型值得沿用到
第八階段 C 的稽核，但那不是 B 的範圍。

### E. `supabase/functions/generate-weekly-report/index.ts`

| 欄位 | 內容 |
|---|---|
| 用途 | 週報的觀察、對話開場、建議、肯定語 |
| 輸入 | `ageGroup`、Baumrind 分類的**白話描述**、四類完成數、幣進出 |
| 輸出 | 五段結構化 JSON |
| 仍被呼叫 | 是 — `useParentWeeklyReport.ts:608`（手動觸發，cron 未排） |
| 直接改表單 | 否 |
| LLM 決定幣值 | 否 |
| 用孩子資料 | **只有 ageGroup 與統計數字，沒有姓名、沒有 id** |
| schema 驗證 | **部分有** — 檢查 `motivation_observation` 非空、`suggestions` 非空陣列，失敗就走 `computeFallbackInsight` |
| timeout | **無** |
| injection 防護 | 無明確框架，但**輸入全是我們自己算出來的數字，沒有家長自由文字**，注入面天然很小 |
| 結論 | **這是六支裡最接近新契約的一支**。資料最小化與 fallback 都做對了 |

三件直接搬得動的判斷：
1. **只送分級與統計，不送姓名與 id。** 新的 input builder 就是這個原則。
2. **明確禁止模型輸出系統代號**（「不要出現 Task-A / 完成率 / 里程碑」）。
   同樣的手法可以用在「不要輸出 `rewardPolicy` 這種欄位名」。
3. **空回應要當成失敗而不是 `{}`。** 它明講了理由：安全過濾擋掉時
   `text` 會是空的，回 `'{}'` 會寫出一份空白週報。新的 `callGemini` 沿用這個判斷。

### F. `ai-proxy/rewardEligibility.ts` + `coinPolicy.ts` + `coin-policy.json`

**不是 AI。** 是 deterministic 規則引擎，被 `analyzeTask` 呼叫。
`coin-policy.json` 是全 repo 唯一的幣值依據，`taskReward/coinPolicy.ts` import 同一份。

**結論：完全保留，而且是新設計的前例。** 見開頭第二點。

### G. `ParentHomeTablet.tsx` 的 `AdvisorPanel` / `AdvisorSideSheet`

UI 上寫著「AI 教養顧問」，**背後沒有任何 LLM** ——
`buildAdvisorReply` 依真實資料組回覆，程式碼註解自己講明了：
「誠實但不是開放式 LLM」。

盤點時要留意這種東西：**畫面上叫 AI，不代表有模型；有模型，也不一定看得出來。**
兩個方向都會讓「AI 到底在哪裡」這個問題答錯。本輪不動它。

### H. 舊的 AI suggestion component / examples / mock data / task rewrite logic

**找不到，因為不存在。**

- 沒有任何舊的「AI 建議卡」元件。舊路徑的產出是一個數字（幣值區間）或一段散文，
  沒有「逐項採用／拒絕」這種互動，所以也沒有對應的 UI 可以合併。
- 沒有 AI 的 mock data 或 fixture。
- **沒有任何一支 AI 相關的測試。** 六個 action、三支 Edge Function，
  測試數是 0。`__tests__` 底下與 AI 有關的檔案全部是第八階段 A 之後才有的。
- 沒有「task rewrite logic」。最接近的是 `analyzeTask` 的
  `needsClarification` / `clarificationQuestion`，但那是**提問**不是**改寫**。

所以「不要直接合併舊 UI」這件事在實作上是自動成立的：沒有舊 UI 可以合併。

---

## 二、Compatibility matrix

### 可重用（映射到既有 kind 與 fieldPath）

| 舊建議 | 新 kind | 新 fieldPath | 結論 |
|---|---|---|---|
| `analyzeTask` 的 `estimatedMinutes`（AI 估時） | `adjust_session_time` | `sessionMinutes` | **修改後重用** — 舊的是「幫你填」，新的是「建議你改」，家長要按下才生效 |
| `analyzeTask` 的 `clarificationQuestion`（哪裡不清楚） | `clarify_completion` | `completionDescription` | **修改後重用** — 從提問改成給具體替代文字，家長才能一鍵採用 |
| `analyzeTask` 的 `clarificationQuestion`（標題語意模糊） | `clarify_title` | `title` | 修改後重用 |
| 週報 `suggestions[].action = increase_difficulty` | `adjust_session_time` / `adjust_duration` | `sessionMinutes` / `durationDays` | **修改後重用** — 只保留「調整難度」的判斷，丟掉自由文字的表達 |
| 週報 `task_recommendations[].suggestion`（某類任務怎麼調） | `reduce_scope` | `completionDescription` / `scopeDescription` | 修改後重用 |
| 週報 `affirmations`（怎麼肯定孩子） | `improve_feedback_language` | `completionDescription` | **修改後重用** — 只在完成標準的語氣層面，不作為獨立的稱讚產生器 |
| `generate-degradation-suggestion`「調整難度或時間」 | `adjust_duration` / `adjust_session_time` | `durationDays` / `sessionMinutes` | 修改後重用 —— 判斷可用，散文輸出不可用 |
| 週報 prompt「不要出現系統代號」的約束 | — | — | **直接重用**，寫進新的 system instruction |
| 週報「只送分級與統計」的資料最小化 | — | — | **直接重用**，已經是 `buildTaskAiInput` 的做法 |
| `aiAgent` 全面 fallback 的習慣 | — | — | **直接重用**，已經是 `UnavailableTaskAiRecommendationService` |

### 淘汰（沒有合法 mapping）

| 舊建議 | 新 kind | 新 fieldPath | 結論 |
|---|---|---|---|
| `suggestTaskCoin`「這個任務值 10 幣」 | — | — | **淘汰**。幣值由規則引擎算，AI 收不到也給不出 |
| `classifyTask` 的 `base_time_min × difficulty` → 幣值 | — | — | **淘汰**。看起來像估時，實際上是換個寫法決定幣值 |
| `suggestCoinWithAI` / `suggestRewardCoin`「這個獎勵值 80 幣」 | — | — | **淘汰**（就任務建議而言）。屬於兌換模組，不是這條線 |
| 把家庭參與改成可發幣 | — | — | **淘汰**。那是對孩子的承諾，不是設定；規則引擎的 blocking finding |
| `classifyTask` / `analyzeTask` 決定 `category` | — | — | **淘汰**。分類決定資格與回饋方式，在 `IMMUTABLE_FIELDS` 裡 |
| 改寫家長的原始期待 | — | — | **淘汰**。`originalExpectation` 是草稿的來源，不是可優化的文案 |
| `analyzeTask` 的 `difficulty`（easy/standard/hard） | — | — | **淘汰**。難度是幣值公式的輸入，讓 AI 給等於讓它調幣值 |
| `analyzeTask` 的 `outcomeBased`（是否結果導向） | — | — | **淘汰**。這是資格判斷，屬於規則引擎 |
| 週報 `motivation_observation` / `dialogue` | — | — | **不淘汰但不屬於這條線**。那是回顧，不是建立任務時的草稿調整 |
| `generate-degradation-suggestion` 的散文建議 | — | — | **淘汰**。沒有 `fieldPath` 可對應，無法逐項採用 |

**沒有硬塞。** 上面兩張表加起來就是舊路徑產出的全部；凡是沒有合法 mapping 的，
一律留在「淘汰」欄，沒有為了湊數而新增 `fieldPath` 或 `kind`。
既有的 11 個 kind 與 12 個 fieldPath **一個都沒有增加**。

### 新契約沒有對應能力的舊項目（記錄，不處理）

`needsClarification` 這個概念在新契約裡沒有位置：新契約的 AI 只能給
「具體的替代值」，不能只說「這裡不清楚，你要不要想一下」。
這是刻意的 —— 一則沒有 `suggestedValue` 的建議沒辦法被「採用」，
只會變成畫面上一句家長不知道要拿它怎麼辦的話。
如果之後真的需要「只提問不給答案」，那要是一個新的 `TaskRuleFinding` warning，
由 deterministic 規則產生，不是 AI。

---

## 三、應淘汰路徑清單（給 B1 的動作項）

按風險排序。**本輪一項都沒有動**，因為刪掉就會動到正在跑的畫面，
超出 B0「不要大規模修改正式檔案」的範圍。

| 優先 | 路徑 | 為什麼 | 動作 |
|---|---|---|---|
| P0 | `ParentHomeTablet` `AssignTaskPanel` → `suggestTaskCoin` | 正式畫面上，LLM 直接決定幣值 | 改讀 `taskReward/` 的 `priceCoin` |
| P0 | `ParentHomeTablet` `NewTaskPanel` → `classifyTask` | 正式畫面上，`base_time_min × difficulty` 就是幣值 | 同上 |
| P1 | `ai-proxy` `suggestTaskCoin` / `classifyTask` handler | 上面兩條移除後就沒有呼叫者 | 一併移除 |
| P2 | `aiAgent.classifyTask` / `suggestTaskCoin` / `suggestRewardCoin` / `generateDegradeSuggestion` / `generateWeeklyInsight` | 零呼叫點的死碼 | 移除 |
| P3 | 手機版 `ParentTaskCreateScreen` → `analyzeTask` | 手機家長端不再維護，但路由還在 | 隨手機版一起處置 |
| — | `screenRedemptionRequest` / `suggestCoinWithAI` | 屬於兌換模組，不是任務建議 | **本輪不動**，但兩者都缺 timeout 與驗證 |

---

## 四、與新契約的落差總表

| 新契約要求 | 舊路徑做到了嗎 |
|---|---|
| AI 只提可選建議，家長逐項決定 | ❌ 全部直接寫進 state |
| AI 不決定幣值 | ❌ 六個 action 有三個直接給幣值，一個間接 |
| 嚴格 output schema validation | ❌ 只有 `generate-weekly-report` 有部分 |
| server-side timeout | ❌ **九支全部沒有** |
| prompt 資料／指令分離 | ❌ 全部字串插值 |
| 資料最小化 | ⚠️ 週報做到了；`generate-degradation-suggestion` 用 service role 讀了完成率與生日 |
| 失敗不阻擋主流程 | ✅ **這一項舊路徑做對了**，每支都有 fallback |
| 不評價孩子人格 | ⚠️ 沒有明文禁止，靠 prompt 語氣自律 |
| 有測試 | ❌ **0 支** |

---

## 相關文件

- `docs/TASK_AI_RECOMMENDATION_CONTRACT.md` — 契約本身（第八階段 A）
- `docs/TASK_AI_RECOMMENDATION_AUDIT.md` — 第八階段 A 的盤點（本文件更正其中兩點，見開頭）
- `docs/TASK_AI_EDGE_FUNCTION_DESIGN.md` — 新 Edge Function 的設計（第八階段 B0）
