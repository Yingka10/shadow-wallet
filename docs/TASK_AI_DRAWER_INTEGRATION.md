# 任務 AI 建議｜接進統一建立抽屜

> 第八階段 B2B。**已實作，未經人工 QA，未對 staging 跑真實 smoke test（見 §十一）。**
> 本輪沒有改 Edge Function、沒有動資料庫、沒有部署 production。

---

## 一、可直接重用的 prototype

第八階段 A 寫的東西**幾乎全部沒動**。動的只有它們外面那一層。

| 能力 | 既有 | B2B 的改動 |
|---|---|---|
| input builder | `buildTaskAiInput`（白名單 ＋ 名字遮蔽） | `variant` 改 optional（自訂任務沒有版本） |
| client validator | `validateTaskAiRecommendationResult` | **一行未改** |
| apply / undo | `applyTaskAiSuggestion` 的 exhaustive switch | **一行未改**，外面加了三道 guard |
| rule findings | `collectTaskRuleFindings` | 未改；接上 DraftReview |
| 假服務 | `FakeTaskAiRecommendationService` | 未改；由 `taskAiClientFromService` 包成 client |
| AI 區塊 | `TaskAiSection` | **改由狀態機驅動**（原本是四個 boolean） |
| live service | 不存在 | 新增 |
| 錯誤映射 | 不存在 | 新增 |
| 過期建議 | 不存在 | 新增 |
| abort | service 介面已有 `signal` 參數 | 抽屜端接上 AbortController ＋ request token |

> 沒有重寫已經通過測試的 validator 與 apply。它們的價值就在於這一輪沒有碰它們。

---

## 二、服務模式

環境變數 `EXPO_PUBLIC_TASK_AI_MODE`，三個值：`off` / `fake` / `live`。

| 環境 | 允許 | 沒設定 |
|---|---|---|
| development | off / fake / live | **off** |
| staging | off / fake / live | **off** |
| production | off / live | **off** |
| test | off（不看環境變數） | off |

三條硬規則：

1. **production 不接受 `fake`。** 對真實家庭顯示一批寫死的建議，
   比完全沒有這個功能糟糕得多 —— 家長會照著那些字調整孩子的任務。
2. **缺值、看不懂、這個環境不允許 → 一律 off。** 那是唯一一種
   「壞掉的時候看得出來壞掉」的模式。
3. **live 失敗不會退回 fake。** 降級只能降到「目前無法取得建議」。

`off` 回傳的是 **null client**，不是「按了會失敗的 client」——
畫面上因此整個不出現 AI 區塊，而不是給一顆永遠不會成功的按鈕。

讀取點只有一個：`src/lib/taskAiRecommendationClient.ts`。
development 面板上顯示一行 `AI 服務模式：fake（明確設定）`，
**不含 URL、project ref 或任何設定值**。

---

## 三、Live adapter

`taskAi/liveTaskAiRecommendationClient.ts`

```
App → TaskAiRecommendationClient → Edge Function → provider adapter
```

App **只認 GrowBook 契約**：沒有 model 名稱、沒有 candidate、沒有
responseSchema、沒有 token 數、沒有 Google 的錯誤格式、沒有 API key。
有一條測試掃過這支檔案的程式碼（去掉註解後）確認一個 provider 詞彙都沒有。

比賽前換 provider 時，理論上只改 Edge Function 的 transport，
App 的契約、UI 與測試一行都不動。

### 不 cast

```ts
const result = data as TaskAiRecommendationResult;   // ← 不可以
```

server 已經驗過一次，但那是 server。這裡拿到的是網路上回來的 `unknown`，
中間可能有代理、快取，或一個部署到一半的舊版 Function。
所以 200 的 `result` 一律再走一次 client validator。

adapter 吃的是一支 `InvokeTaskAiFunction`，不是 `SupabaseClient` ——
因此可以在 jest 裡完整測試，不需要 URL 與金鑰，也不會有人不小心讓 CI 連上網。

---

## 四、HTTP 與錯誤映射

Edge Function 的 envelope 是互斥的：`200 → { requestId, result }`、
`4xx/5xx → { requestId, error: { code, retryAfterSeconds? } }`。

| HTTP | outcome | 家長看到 |
|---|---|---|
| 200 + suggestions / no_change / unavailable | `result` | 見 §七 |
| 400 / 404 / 405 / 422 | `request_invalid` | 「目前無法取得建議，不影響任務建立。」 |
| 401 / 403 | `auth_required` | 「登入狀態已失效，請重新登入後再試。」 |
| 429 | `rate_limited` | 「目前暫時無法再取得建議，稍後再試；你仍可以直接建立任務。」 |
| 5xx / 網路不通 | `server_unavailable` | 同 400 那一句 |
| abort | `aborted` | **什麼都不顯示** |

`retryAfterSeconds` 先看 body，再看標準的 `Retry-After` header，
兩者都沒有就不給數字 —— 猜一個「大概五分鐘」出來，家長會照著等，
然後在第五分鐘再撞一次同一道牆。顯示時一律向上取整到分鐘，超過一小時就不顯示。

**畫面上不會出現** 429、TIMEOUT、INVALID_RESPONSE、UNSAFE_OUTPUT、
SERVICE_ERROR、stack trace 或 provider 錯誤。
development 只多一行固定代號（`服務狀態：TIMEOUT`），不顯示原始回傳。

---

## 五、送出去的東西

沿用既有白名單 builder，**沒有繞過它**。

送出：年齡分級、任務脈絡（editorKind / purpose / duration / source /
rewardPolicy / completionPolicy）、家長期待、草稿中允許分析的欄位、
不可修改欄位清單。

不送：孩子暱稱、姓名、家長姓名、email、child id、family id、access token、
錢包餘額、任務歷史、週報、其他家庭成員、preset 內部 id、稽核事件、API key。

### 名字遮蔽

預設標題長成「承恩的閱讀計畫」。builder 把名字換成「孩子」而不是刪掉 ——
「的閱讀計畫」會讓模型以為標題殘缺，然後建議「把它補完整」。

> 這一層**不依賴 UI 文案的假設**。第九階段 C 的自訂流程不會預填孩子名字，
> 但家長自己打進去的名字一樣要被清掉，所以最小化仍然是 builder 的責任。

`rewardPolicy` 有送（模型需要知道這筆任務會不會發幣，那會影響建議的語氣），
**金額沒有送**，而且 `coinAmount` 明確出現在 `blockedFields` 裡。

system instruction 完全屬於 Edge Function —— 有測試確認 `buildTaskAiInput.ts`
裡沒有任何 prompt 字樣。

---

## 六、Eligibility

第一版範圍由 B2A.5 決定，這一輪沒有改：

| 目的 | 可取得建議 |
|---|---|
| 孩子自己想挑戰（C） | ✅ |
| 學習或練習技能（D） | ✅ |
| 練習照顧自己（A） | ❌ |
| 參與家庭生活（B） | ❌ |

preset 與 parent_custom **一視同仁**。

A／B 類**不顯示按鈕**（不是 disabled，是整個不出現），只留一句：

> 這類任務先由家長直接確認，不影響建立。

畫面上不會出現 `TASK_TYPE_NOT_ENABLED`、`HIGH_RISK_CONTEXT`、
`UNSUPPORTED_CATEGORY` 或任何 reason code，也不會說 A／B 是
「不安全」「AI 不會做」「系統無法分析」「任務設定錯誤」——
那是第一版 AI 的開放範圍，不是對任務本身的判斷。

---

## 七、DraftReview 的狀態機

```ts
type TaskAiReviewState =
  | { kind: 'idle' }
  | { kind: 'loading'; requestToken; inputSignature }
  | { kind: 'suggestions'; inputSignature; summary; items }
  | { kind: 'no_change'; inputSignature; summary }
  | { kind: 'unavailable'; reason: 'temporary' | 'not_offered'; developerCode? }
  | { kind: 'rate_limited'; retryAfterSeconds? }
  | { kind: 'auth_required' }
```

不是 `isLoading` / `hasSuggestions` / `hasError` / `isRateLimited` 四個 boolean。
那四個的組合在型別上合法、在畫面上是三段互相矛盾的文字同時出現，
而它一定會發生 —— rate limit 回來時忘記把 `isLoading` 設回 false 就有了。

家長看得懂的 unavailable 只有兩種，因為家長只需要做兩種決定：
**再試一次**，或**不用管它**。TIMEOUT / SERVICE_ERROR / INVALID_RESPONSE /
UNSAFE_OUTPUT 對家長完全是同一件事。`not_offered` 不給重試按鈕。

---

## 八、Loading、重複點擊與 abort

- **不自動呼叫。** 進到預覽不會產生任何請求 —— 那是一筆付費請求。
- loading 期間按鈕仍在但 disabled（拿掉會讓畫面少一塊又長回來）。
- **同一時間只允許一個請求。** 重複點擊不會送出第二次。
- 不自動 retry、不 fallback model、不輪詢。
- loading **不擋建立**：家長仍可確認建立、返回修改、關閉抽屜。

### 什麼時候 abort

關閉抽屜、返回 editor、切換 preset／custom 入口、換孩子、元件卸載。

abort 之後**不顯示任何東西** —— 家長是自己離開的，為此跳一則
「取得建議失敗」等於因為他做了正常的事而責備他。

三道保護取了兩道半：

| 機制 | 作用 |
|---|---|
| `AbortController` | 請求真的停下來，不再耗配額 |
| request token | 已經送出、來不及取消的那一次回來時對不上號而被丟掉 |
| `inputSignature` | 見 §九 |

**只靠元件卸載是不夠的** —— 抽屜不會因為離開預覽就卸載。

---

## 九、Input signature 與過期建議

`createTaskAiInputSignature(input)` 是確定性序列化（鍵排序），
**不含** clientRequestId、時間戳、隨機值或 UI 展開狀態 ——
那些每次都不一樣，會讓每一批建議一回來就立刻過期。

用途一：回來時確認仍是同一份輸入。
用途二：家長改過草稿後顯示「任務內容已調整，需要時可重新取得建議。」
**不自動重呼叫。**

### 兩層判斷

整批的 signature 只用來顯示那一句提示。**每一項的存活與否是各自算的**：

| item 狀態 | 意思 |
|---|---|
| `pending` | 還沒決定，而且 `currentValue` 仍對得上目前草稿 |
| `applied` | 已採用，欄位仍是建議值 → 可以安全復原 |
| `applied_edited` | 已採用，但家長之後又改過那個欄位 → **不提供復原** |
| `kept` | 家長選擇保留原設定（與欄位值無關） |
| `stale` | 目標欄位已經和「目前設定」不同，不可套用 |

所以：

- 採用第一項之後，指向**其他欄位**的第二項仍然可用
- 家長手動改了標題，只有指向 `title` 的那一項變 stale
- 改回去就恢復 —— 一次手滑不該永久廢掉一則建議

> **不在任何草稿變動後清空整批建議。** 那會讓這個功能變成「只能採用一項」。

item 狀態是**每次用當下的草稿算出來的**，不是記下來的：
會改到草稿的地方有七、八處，每一處都要記得更新旗標的話，
漏掉的那一處就是「套用了一個對不上的建議」。

---

## 十、Apply、Keep、Undo

**沒有「全部採用」。** 一鍵套用四項等於沒有人讀過那四項，
而這個功能的整個價值就在家長讀過並且做了決定。

### 按下「採用這項」時再驗一次

1. 這則建議重新通過 client validator（欄位、型別、長度、禁止路徑）
2. 這一項仍是 `pending`（`currentValue` 對得上）
3. 套用後 `purposeCategory` / `rewardPolicy` / `durationType` / `source` /
   `editorKind` 全部沒變
4. 套用後 `validateTaskDraft` 仍然通過

任何一條不過 → **不套用、保留原草稿**，顯示
「這項建議和目前設定不相容，請手動調整。」（不顯示任何內部代碼）

用的仍然是既有的 exhaustive apply switch：沒有任意 path setter、
沒有 deep mutation、沒有把 AI 輸出 spread 進 draft，
AI 也碰不到 command 與資料庫。

### Undo

只還原**那一個欄位**，不是整份草稿的快照 —— 家長採用三項之後想收回中間
那一項時，另外兩項不該跟著消失，他自己在 editor 改過的東西也是。

家長在採用之後又改過同一欄位時**不提供復原**（fail-safe）：
復原會把他剛打的字換成一個舊值。寧可少一個按鈕。

---

## 十一、幣值

AI **不能修改**：`rewardPolicy`、`rewardSupportIntent`、
`rewardSupportReviewAfterDays`、coin amount、min／max、
`category`、`purposeCategory`。

AI **可以**建議 `sessionMinutes` / `durationDays`。家長採用之後：

1. 草稿改變
2. `validateTaskDraft` ＋ `collectTaskRuleFindings` 重跑
3. `evaluateTaskReward` 重新估算（DraftReview 的預覽本來就是 useMemo）

畫面上的說法是：

> 依更新後的時間與任務設定，系統重新估算了成長幣。

**不是**「AI 把成長幣改成 8 枚」。主詞是規則，不是 AI ——
幣值一直都是 `coin-policy` 算的。有測試釘住這一條。

---

## 十二、preset 與 parent_custom

**同一個 TaskDraft、同一支 service、同一套 apply／undo。**

- 沒有 custom 專用 Edge Function
- 沒有 custom 專用 suggestion UI
- 自訂任務不需要假的 preset（`buildTaskAiInput` 的 `variant` 是 optional，
  `completionPolicy` 由 `editorKind` 推導）
- 採用建議之後 `creationSource` 不變，preset selection 也不變

有測試比對兩個入口送出去的 input 形狀完全一樣。

---

## 十三、Step 2 的任務目的（extension point，**本輪未實作**）

自訂流程的 Step 2 仍然是**純人工選擇**：不呼叫 `classifyTask`、
不呼叫 `ai-proxy`、不自動預選 A／B／C／D、不拿 `task-ai-recommendation` 兼任分類。

未來的「目的建議」是**另一支工作流**，安全模型與這一支不同：

| | task-ai-recommendation | 未來的 purpose suggestion |
|---|---|---|
| 對象 | 已經成形的草稿 | 一句話 |
| 失敗模式 | 建議一句更清楚的文案 | 把任務歸到錯的類別，連帶決定回饋方式 |
| 家長可檢查性 | 逐項比對「目前 vs 建議」 | 只有一個結果，看不出依據 |

所以不可共用同一支 Function。**本輪只留下這個記錄。**

---

## 十四、驗證

| 項目 | 結果 |
|---|---|
| `deno check --frozen` | 0 errors |
| `deno test --frozen`（`--allow-read --allow-env`） | 146 passed |
| `npx tsc --noEmit` | 0 errors |
| `npx jest` | 73 suites / 1436 tests passed |
| 0 `any` / `@ts-ignore` / `@ts-expect-error` | ✅ |
| 新 dependency | 無 |
| lock file | 未改 |

### 真實 staging smoke test：**沒有執行**

原因很具體：`liveCheck.ts` 需要四個從 shell 傳入的環境變數
（`TASK_AI_STAGING_URL` / `TASK_AI_STAGING_ANON_KEY` /
`TASK_AI_TEST_EMAIL` / `TASK_AI_TEST_PASSWORD`），這一輪的 shell 裡一個都沒有。
密碼不會從 repo 讀，也不該由我去翻。

已確認的部分：`supabase projects list` 顯示 linked 是
**growbook-staging**，production 未 linked。

要跑的話（由持有憑證的人執行，預算預設 8 次／日、跨次數累計）：

```bash
deno run --allow-env --allow-net --allow-read --allow-write \
  supabase/functions/task-ai-recommendation/scripts/liveCheck.ts \
  --mode=e2e --out=<repo 以外的資料夾>
```

> ⚠️ 本輪**沒有改 Edge Function**（`supabase/` 一個檔案都沒動），
> 所以 B2A.5 的 staging 驗證結果仍然有效。新的部分是 App 這一側的
> adapter 與狀態機，那些由 jest 以注入的 invoker 完整覆蓋 ——
> 但「`supabase.functions.invoke` 對上真的 Function」這一段確實沒有實測過。

---

## 十五、人工 QA checklist（**尚未執行**）

Claude 無法實際操作 Expo，以下沒有一項被驗證過。

1. 開啟 preset D 任務（閱讀與共讀）
2. 走到 DraftReview
3. **AI 不自動呼叫**（畫面上是「取得調整建議」按鈕，不是 loading）
4. 點「取得調整建議」
5. loading 期間仍可按「確認建立」
6. 顯示建議卡
7. 採用一項 → 預覽上的欄位真的變了
8. 幣值重新計算，而且說法是「系統重新估算」
9. 復原該項
10. 其他建議不受影響
11. 返回 editor 改一個欄位再回來 → 只有相關的那一項標成「設定已變更」
12. custom D 任務同樣可用
13. custom C 任務同樣可用
14. A 任務沒有 AI 按鈕
15. B 任務沒有 AI 按鈕
16. circuit breaker 關閉時正常降級（不影響建立）
17. rate limit 正常降級
18. timeout 正常降級
19. 關閉抽屜時請求真的停止
20. 返回 editor 時請求真的停止
21. production mode 不會變成 live
22. STAGING badge 正常
23. 直接建立仍成功
24. 建立後任務出現在正確列表

---

## 十六、本輪沒有做

- Edge Function：**一個檔案都沒動**
- 資料庫：沒有 migration、沒有改 RPC 或完成函式
- production：沒有部署、沒有 secrets、沒有 SQL
- Step 2 的 AI 預選（見 §十三）
- `ParentHomeTablet` 的兩條舊 AI 幣值路徑（B3）
- 更換 Gemini provider、開通付費、provider fallback
- 大量 live red-team（B2A.5 已跑過，本輪沒有改 Function）
- B 類幣值政策、孩子提案、願望轉計畫、複製任務、AI draft generator
- 「全部採用」與任何形式的自動套用
