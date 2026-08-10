# AI 任務調整建議｜契約

> 第八階段 A。本輪**不呼叫 Gemini**、不新增 migration、不改建立 RPC。
> 本文件不含 API key、prompt secret 或任何真實資料。

---

## 產品邊界

一句話：**規則歸規則，建議歸建議。**

| | 規則引擎 | AI |
|---|---|---|
| 產生什麼 | `TaskRuleFinding` | `TaskAiSuggestion` |
| 可以擋住建立嗎 | ✅ `blocking` 會擋 | ❌ 永遠不會 |
| 可以被略過嗎 | ❌ blocking 不可略過 | ✅ 逐項採用或拒絕 |
| 決定幣值嗎 | ✅ 由 `taskReward/` 算 | ❌ 完全碰不到 |
| 是否 deterministic | ✅ 純函式 | ❌ |

兩者混在一起的後果是具體的：

- 如果 AI 能產生 blocking，一次幻覺就會擋住家長建立一個完全正常的任務，
  而 blocking 依定義不可略過 —— 家長沒有任何辦法繞過去。
- 如果規則能被當成建議略過，「家庭參與不發成長幣」就不再是政策，
  只是一個提示。那句話是對孩子的承諾。

型別上就分開：兩者不共用任何型別，`TaskAiSuggestion` 上根本沒有
`severity` 或 `source` 這兩個欄位。

### 八條原則落在哪裡

| 原則 | 落實位置 |
|---|---|
| 規則引擎負責不可違反的政策 | `ruleFindings.ts`，純函式 |
| AI 只提可選建議 | `TaskAiSuggestion` 沒有 severity |
| 家長逐項採用／修改／拒絕 | `AiSuggestionDecision`；**沒有「全部採用」** |
| AI 不覆蓋家長原始期待 | `originalExpectation` 在 `IMMUTABLE_FIELDS` |
| AI 不直接決定幣值 | 幣值路徑不在 allowlist，且在明確禁止清單裡 |
| AI 失敗不阻擋建立 | 能不能建立只看 `hasBlockingFinding` |
| 家庭參與不發幣不可被改寫 | 那是 blocking rule finding，不是建議 |
| 不替孩子建立標籤 | `kind` 是 11 個固定值的 allowlist |

---

## 固定流程

```
validateTaskDraft
  → collectTaskRuleFindings        （deterministic pre-check）
  → buildTaskAiInput
  → 家長按「取得調整建議」            ← 不會自動觸發
  → service.recommend(input, signal)
  → validateTaskAiRecommendationResult
  → 家長逐項 applyTaskAiSuggestion / 拒絕
  → collectTaskRuleFindings         （final check）
  → evaluateTaskReward
  → finalizeCreateParentTaskCommand
  → 家長確認建立
  → create_parent_task_v1
```

AI 在這條線上是**可以整段跳過**的。

---

## Input

`buildTaskAiInput({ draft, variant, ageGroup, childNickname })`

### 送出去的

`schemaVersion` / `childContext.ageGroup` / `taskContext`（editorKind、
purposeCategory、durationType、source、rewardPolicy、completionPolicy）/
`parentIntent.originalExpectation` / `currentDraft`（標題、完成標準、
每次分鐘、排程摘要、期間、回顧天數、選項答案、支援步驟、里程碑、負責內容）/
`immutablePolicies`。

### 不送的

孩子姓名、email、user id、family id、child id、錢包餘額、其他家庭成員、
完整歷史紀錄、原始聊天、access token、Supabase key。

年齡只送**分級**（`6-9`）不送生日：判斷「20 分鐘會不會太長」需要的是級距。

排程送的是一句人話（「固定在週一、週三、週五」）而不是 `[1,3,5]` ——
給原始陣列只會讓它猜 0 是週日還是週一。

### ⚠️ 姓名遮蔽

`createTaskDraft` 的預設標題會帶上名字（「承恩的餐桌任務」），
所以名字會跟著 `title` 一起流出去。這是寫測試時抓到的，不是預想的。

`childNickname` 傳進來**是為了把它拿掉**：文字裡的名字換成「孩子」。
換而不是刪，是為了讓句子仍然讀得通 ——「的餐桌任務」會讓 AI
以為標題殘缺，然後建議把它「補完整」。

自由文字仍可能含真名（家長自己打的），這在 client 端無法完全避免，
但至少不會再由我們主動附加。

### 白名單式建構

input 的每一個欄位都被明確寫出來一次。不用 spread、不用
`pick(draft, [...])` —— 那些寫法會在草稿新增欄位時默默把新欄位一起送出去。

---

## Output

三種 status：`suggestions` / `no_change` / `unavailable`。
`unavailable` 的 reason 是 `TIMEOUT` / `INVALID_RESPONSE` /
`SERVICE_ERROR` / `UNSAFE_OUTPUT`。

### allowlisted fieldPath

| path | 型別 | 對應到 |
|---|---|---|
| `title` | string | 所有 editor |
| `completionDescription` | string | completionDescription / successDescription / contributionDescription |
| `taskDetails` | string | 單次 |
| `scopeDescription` | string | 家庭角色 |
| `notes` | string | 單次 |
| `sessionMinutes` | number | minutesPerSession / estimatedMinutes |
| `durationDays` | number | 三種長期 |
| `weeklyFrequency` | number | 固定任務（僅每週次數模式）|
| `reviewAfterDays` | number | firstReviewAfterDays / reviewAfterDays |
| `supportSteps` | string[] | 短期支援 |
| `milestones` | string[] | 成長計畫 |
| `responsibilityItems` | string[] | 家庭角色 |

AI 講的是**語意名稱**而不是 draft 的實際欄位名：同一件事在五種 editor 上
叫不同名字，讓 AI 記那些差異只會增加它出錯的面。對應在
`applyTaskAiSuggestion` 的 exhaustive switch 裡解一次。

**每週固定日期（recurrenceDays）本輪不開放給 AI**：
`suggestedValue` 的型別是 `string | number | string[]`，
把星期幾塞進 string[] 需要一層解析，而解析錯的後果是排程錯 ——
先不做比做錯好。

### AI 不可修改

`purposeCategory` / `durationType` / `source` / `rewardPolicy` /
`completionPolicy` / `childId` / `familyId` / preset ids /
各種 policy version / `coinAmount` / `rewardDecision` / `safetyPolicy` /
`familyContributionEligibility` / **`originalExpectation`**。

清單會原封不動送進 input 的 `blockedFields` —— 不是因為相信 AI 會遵守
（不能相信），而是為了讓「它被告知過」可稽核。真正的執行在 validator
與 apply：那兩層不接受這些路徑。

---

## Validator

`validateTaskAiRecommendationResult(raw: unknown)`

輸入型別刻意是 `unknown`：呼叫端沒有辦法用一個 cast 繞過去。
既有的 `ai-proxy` 寫 `JSON.parse(x) as T`，那行字讓型別系統對整批資料失效。

檢查：未知 status／未知 kind／未知 fieldPath／明確禁止的路徑／
空的 suggestedValue／值型別與 fieldPath 不符／文字長度上限／
數值合理範圍（每次 ≤180 分鐘等）／suggestion 數量上限 5／id 不重複／
HTML tag／控制字元。

### 壞一項就整批丟掉

**不會只略過壞掉的那一項。** 那會讓家長看到三張建議卡、以為這三張都經過
完整驗證 —— 但第四張已經被默默扔了，而我們不知道它為什麼壞，
也不知道前三張是不是同一批幻覺的產物。一批輸出要嘛整批可信，要嘛整批不可信。

不使用 `dangerouslySetInnerHTML`，不渲染 Markdown HTML；
所有值都以純文字 `<Text>` 呈現。

---

## Apply / Reject / Undo

`applyTaskAiSuggestion({ draft, suggestion })`

- exhaustive switch，**不用任意 path setter**（lodash.set 之類）——
  那種寫法讓 fieldPath 從 allowlist 退化成任意字串，
  validator 擋掉的東西 setter 又幫忙塞回去
- 不修改原 draft
- 一則建議只改一個欄位
- 對不上的欄位回 `PATH_NOT_APPLICABLE`，不硬塞
- 回傳 `affectsRewardDecision`：改到 `sessionMinutes` / `durationDays` 時為
  true，呼叫端必須重跑 `evaluateTaskReward`
- 清單套用**依位置沿用既有項目的 id 與開關** ——
  家長關掉的那一項不該因為換了文字就自己打開

`undoTaskAiSuggestion({ draft, record })` 還原的是**那一個欄位**，
不是整份草稿的快照：採用三項之後想收回中間那一項時，另外兩項不該跟著消失。

`rejected` 在資料層就是不呼叫 apply。`edited` 表示家長在建議值上再改過，
最終以家長輸入為準。

---

## 服務

```ts
interface TaskAiRecommendationService {
  recommend(input, signal?): Promise<TaskAiRecommendationResult>;
}
```

- `FakeTaskAiRecommendationService` —— suggestions / no_change / timeout /
  invalid_response / unsafe_output / service_error / 延遲 / abort。
  回傳前一律走 validator：假資料也要能通過真的驗證。
- `UnavailableTaskAiRecommendationService` —— 回 `unavailable` 而不是丟錯。
  AI 不可用是正常狀態。

**本輪 production 不注入任何 Gemini service。**

---

## Fallback

AI 的任何狀態都不影響建立。以下都必須能確認建立：
尚未取得建議／no_change／unavailable／全部拒絕／只採用一項。

只有 deterministic blocking finding 能擋住建立。

AI request 與 create RPC 的狀態完全分離：AI loading ≠ submitting、
建立時不等 AI、RPC 不攜帶未採用的建議、**AI request 不改變 `clientRequestId`**。

---

## Server 端（第八階段 B1 起）

上面每一條規則在 Edge Function 端**又獨立實作了一次**：
`supabase/functions/task-ai-recommendation/`。細節見 `TASK_AI_EDGE_FUNCTION.md`。

client validator 保護的是**畫面**。它擋不住直接打 API 的人，也擋不住舊版 App。
「只在 client 驗」的實際效果是「只要不用我們的 App 就沒有驗證」。

三件兩端**刻意不同**的事：

| | App | Edge Function |
|---|---|---|
| schema 錯 | `UNSAFE_OUTPUT` | `INVALID_RESPONSE` |
| 越界（幣值／immutable／超量） | `UNSAFE_OUTPUT` | `UNSAFE_OUTPUT` |
| 內容安全（危險家務等） | **不檢查** | `UNSAFE_OUTPUT` |

前兩列是同一個結論的不同標籤 —— 兩端對「這批能不能給家長看」永遠一致，
只有 server 多分了「模型壞了」與「模型想越界」。

第三列是真正的差異：**內容安全只在 server**。一則「讓 6-9 歲孩子清理瓦斯爐」
的建議在 schema 上完全合法，App 端的 validator 沒有理由擋它 ——
schema 不知道瓦斯爐是什麼。這是 client validator 不能取代 server 的具體證據，
兩端的測試都明確釘住了這一點（fixture 上標為 `serverOnlySafety`）。

防漂移：`contract.json` 是兩端共用的唯一資料來源，
`__fixtures__/contractFixtures.json` 是兩端共用的行為 fixture。

---

## 第八階段 B2A.5 的擴充

### 兩個新的 unavailable reason

| reason | 意思 | 對家長 | 對我們 |
|---|---|---|---|
| `NOT_ELIGIBLE` | 這種任務第一版不開放 AI 建議 | 和其他 unavailable 完全一樣 | **不是錯誤**，是預期結果 |
| `SERVICE_DISABLED` | 總開關被關掉 | 同上 | 是我們主動關的，不是它掛了 |

**刻意加在 reason 而不是新增 status。** `TaskAiSection` 對 status 做窮舉，
多一個 status 就要動 UI，而 UI 分支越多、家長越搞不清楚 AI 到底出了什麼事。
這兩件事對家長的意義和其他 unavailable 一樣 —— 沒有建議，但不影響任務建立。
分開記的價值在 log：「這種任務不開放」和「服務掛了」需要不同的處置，
混成一個 `SERVICE_ERROR` 會讓前者看起來像故障，於是有人去修一個沒有壞的東西。

限流走 **HTTP 429 + error envelope**（`code: "rate_limited"`，帶 `retryAfterSeconds`
與 `Retry-After` header），不佔用 reason —— 那是**呼叫端該改變行為**的情況，
和「AI 這次沒有建議」不一樣。

### 使用範圍（context allowlist）

`contract.json` 的 `eligibility` 區塊定義「哪種任務可以送、可以改哪些欄位」。
它永遠是全域 allowlist 的**子集**，只能更窄。

Server output validator 因此檢查**三層**，不是一層：

1. 全域 `allowedFieldPaths`（這個欄位存不存在）
2. 這次的 context allowlist（這種任務有沒有這個欄位）
3. `suggestionKindFieldPaths`（kind 與 fieldPath 相不相符）

第 3 點是 staging 實測長出來的：第一次真實呼叫，模型回了
`kind: "add_support_step"` 搭 `fieldPath: "taskDetails"` —— 兩個分開看都合法。
但 **App 依 fieldPath 決定改哪裡，依 kind 決定畫面上寫什麼**：
不相符等於家長看到「新增支援步驟」，按下去改的是任務細節。
那不是文案瑕疵，是家長在不知情的情況下同意了另一件事。

⚠️ 這三層**都在 server**。prompt 也會列出這次的窄清單與 kind 配對，
但那是「請求」不是「規則」——  prompt 少說一句話不會讓 validator 放行。

---

## 未來的 Gemini adapter

介面已經定好，接上去只需要一個實作 `TaskAiRecommendationService` 的 class
（B2）。B0 audit 列的四項前置條件，現況：

1. ~~`ai-proxy` 補 timeout~~ → **改為不動 `ai-proxy`**。新功能走獨立的
   `task-ai-recommendation`，它有 12 秒 `AbortController`、不重試、不換 model
2. ~~Edge Function 端也要跑一次 validator~~ → **B1 已完成**
3. ~~prompt 需要明確的資料界線~~ → **B1 已完成**（政策走 `systemInstruction`、
   資料走 `contents` 且 `JSON.stringify`、marker 明確不當成安全邊界）
4. ~~`coin-policy.json` 有兩份~~ → **這一條是錯的**。全 repo 只有一份，
   `taskReward/coinPolicy.ts` import 的就是同一個檔案；重複的是演算法而且是刻意的。
   更正記錄在 `TEAMMATE_AI_WORK_COMPATIBILITY.md` 開頭

**B2A 已完成**：部署到 staging、真實 Gemini 呼叫、六種 Demo 任務驗證、
prompt injection red-team、真實 timeout 驗證。紀錄見
`TASK_AI_STAGING_VALIDATION.md`。

**仍未完成**：接 UI、production 部署、per-user rate limit、
Gemini 付費方案（免費層每 model 每天 20 次），以及一個 B2A 發現的
**內容安全缺口** —— 危險任務換句話說就繞得過關鍵字比對。

契約本身沒有因為 B2A 而改變。唯二的調整都在 transport 層：
`responseSchema` 的 `suggestedValue` 用 `anyOf`（實測 API 接受，
三種契約型別都正確回傳），以及 `maxOutputTokens` 2048 → 4096
（2048 會截斷 3 則以上的中文建議，截斷的 JSON 會被算成 `INVALID_RESPONSE`）。

---

## 第八階段 B2B：契約已接上畫面

App 這一側新增了一層 **client 契約**，包在既有的 service 契約外面：

```ts
type TaskAiClientOutcome =
  | { kind: 'result'; result: TaskAiRecommendationResult }
  | { kind: 'rate_limited'; retryAfterSeconds? }
  | { kind: 'auth_required' }
  | { kind: 'request_invalid' }
  | { kind: 'server_unavailable' }
  | { kind: 'aborted' };
```

`TaskAiRecommendationResult` 只回得出「AI 說了什麼」，而 429、401、
「家長自己離開了」不是 AI 說的話。全部壓成 `unavailable` 的話，
登入過期會顯示成「目前無法取得建議」，家長重試一百次都不會成功。

**既有的型別、validator 與 apply switch 一個字都沒有改。**
`buildTaskAiInput` 只有一處：`variant` 改成 optional，自訂任務的
`completionPolicy` 由 `editorKind` 推導（與 `mapTaskDraftToCommand` 同一支函式）。

接線細節、狀態機、過期建議與 abort 見 `TASK_AI_DRAWER_INTEGRATION.md`。
