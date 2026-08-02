# task-ai-recommendation

> **狀態：第八階段 B0 骨架，尚未部署，也還沒有任何 client 呼叫它。**
> 設計說明在 `docs/TASK_AI_EDGE_FUNCTION_DESIGN.md`。

拿一份家長寫好的任務草稿，回一組**可選的**文字調整建議。

## 這支不做什麼

不寫 `tasks`、不寫 `child_tasks`、不建立任務、不計算幣值、不讀錢包、
不讀家庭歷史、不用 service role。它讀得到的只有請求本身。

幣值由 `taskReward/` 的規則引擎算。AI 連幣值欄位都收不到，
更不可能建議金額——`explicitlyForbiddenPaths` 裡有一整排幣值路徑，
validator 看到就整批丟掉。

## 檔案

| 檔案 | 負責 |
|---|---|
| `contract.json` | allowlist、上限、timeout。**與 App 端共用的唯一資料來源** |
| `prompt.ts` | 系統政策（常數）＋ 把 input 包成資料區塊 |
| `validateInput.ts` | 嚴格 allowlist；不認識的欄位一律拒收 |
| `validateOutput.ts` | 模型回傳的逐欄檢查；壞一項整批丟 |
| `index.ts` | auth → 驗 input → timeout → Gemini → 驗 output |
| `__fixtures__/contractFixtures.json` | 六種 Demo 任務 × 四種情境 |

`contract.json` 與 App 端 `taskAi/types.ts` 的一致性由
`src/screens/parent/tablet/taskDrawer/taskAi/__tests__/contractParity.test.ts` 釘住。
改了任何一邊而沒改另一邊，那支測試會紅。

## 部署前檢查（B1）

1. `deno check index.ts` —— 本 repo 的 tsc 排除 `supabase/functions`，這裡沒被編譯過
2. Deno 端測試：讀同一份 fixture，逐筆比對 `validateModelOutput` 的結論
3. 設定 secret `GEMINI_API_KEY`（**不要寫進任何 tracked 檔案**）
4. 確認部署目標是 staging，不是 production
5. 加上 rate limit —— 目前只擋「未登入」，沒擋「登入後狂按」
6. 補內容安全層：`injection-06` 這一筆形狀合法但內容不安全，
   現在會通過。在那之前不要宣稱 prompt injection 已經處理完
