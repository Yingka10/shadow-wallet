# task-ai-recommendation

> **狀態：第八階段 B1 —— 已實作、已 `deno check`、81 筆 Deno 測試通過。**
> **尚未部署、尚未接 UI、本輪 0 次真實 Gemini 呼叫。**
> 完整說明在 `docs/TASK_AI_EDGE_FUNCTION.md`。

拿一份家長寫好的任務草稿，回一組**可選的**文字調整建議。

## 這支不做什麼

不寫 `tasks`、不寫 `child_tasks`、不建立任務、不計算幣值、不讀錢包、
不讀家庭歷史、**不用 service role**。它讀得到的只有請求本身。

幣值由 `taskReward/` 的規則引擎算。AI 連幣值欄位都收不到，
更不可能建議金額 —— `explicitlyForbiddenPaths` 裡有一整排幣值路徑，
validator 看到就整批丟掉。

## 檔案

| 檔案 | 負責 |
|---|---|
| `index.ts` | entry —— 只有 `Deno.serve(handleRequest)` |
| `handler.ts` | HTTP / CORS / method / auth / 編排 / logging |
| `contract.ts` | Edge 端型別與 enum；**不依賴 RN module graph** |
| `contract.json` | allowlist、上限、timeout。**與 App 共用的唯一資料來源** |
| `inputValidator.ts` | `unknown` → `ValidatedInput`（白名單重建，不是清洗）|
| `prompt.ts` | 固定 system instruction ＋ 結構化資料區塊 |
| `geminiClient.ts` | transport ＋ 12 秒 abort；不含產品欄位邏輯 |
| `outputValidator.ts` | `unknown` → `RecommendationResult`；壞一項整批丟 |
| `contentSafety.ts` | deterministic 年齡與任務安全檢查 |
| `__fixtures__/` | 24 筆任務案例 ＋ 17 筆 validator 案例（**雙端共用**）|
| `tests/` | 81 筆 Deno 測試（全部走 fetch stub）|

## 跑測試

```bash
deno check supabase/functions/task-ai-recommendation/*.ts \
           supabase/functions/task-ai-recommendation/tests/*.ts
deno test --allow-read --allow-env supabase/functions/task-ai-recommendation/tests/
```

App 端對應的 parity 測試：

```bash
npx jest src/screens/parent/tablet/taskDrawer/taskAi/__tests__/contractParity.test.ts
```

兩邊讀同一份 `contract.json` 與同一份 fixture。改了任何一邊而沒改另一邊，
其中一支會紅。

> 測試檔名用 Deno 慣例的 `*_test.ts` 而不是 `*.test.ts`，
> 目錄用 `tests/` 而不是 `__tests__/` —— 兩者都是為了讓 jest 的
> `testMatch` 撿不到它們。改名之前先確認 `npx jest --listTests`
> 不會出現 `supabase/functions` 底下的檔案。

## 部署前檢查（B2）

1. 設定 secret `GEMINI_API_KEY`（**不要寫進任何 tracked 檔案**）
2. 確認部署目標是 **staging**，不是 production
3. 實測 timeout 路徑 —— 要真的看到 12 秒後回 `TIMEOUT`，不是相信它會
4. 加 rate limit —— 目前只擋「未登入」，沒擋「登入後狂按」，
   每一次都是一次付費呼叫
5. 真實模型的 red-team fixtures —— 目前所有 fixture 都是**我們寫的**模型輸出，
   真實模型會用我們沒想到的講法（見 docs §8 限制 4）

`deno check` 通過**不代表** Supabase Edge Runtime 收得下。在真的部署過之前，
不要說這支「可以部署」。
