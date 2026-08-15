# Child Goal Planning Contract（P1-A1）

孩子的長期目標 → 必要時釐清或給選項 → 一份可執行的 Plan。

這份文件是之後 UI / persistence 工作包的 source of truth。它回答的是
**「AI 到底要產生什麼」**，不是「最後畫面長什麼樣子」。

- App 端契約：`src/lib/childPlanning/`
- Function 端鏡射：`supabase/functions/ai-proxy/childGoalPlanningLogic.ts`
- canonical 案例：`supabase/functions/ai-proxy/__tests__/childGoalPlanningContract.test.ts`
- ai-proxy request type：`childGoalPlanning`，`schemaVersion = 1`

> ⚠️ 這條鏈與 P0-3 的 `childProposalPlanDraft`（`schemaVersion = 2`）**完全獨立**。
> 兩者共用 ai-proxy 的 transport、model chain 與 timeout 語意，但沒有任何
> 資料或型別依賴。P0-3 的 payout-aware pricing 一個字都沒有改。

---

## 1. 產品原則

### A｜先理解孩子，再提供 AI

AI 不可以假設「孩子講出目標 = 他不知道怎麼做」。

孩子已經有方法時（包括**老師教的、課程安排的**），先整理他的方法。
只有缺少會讓計畫無法成立的資訊時，才補問或提供選項。

> Never suggest before checking whether the child already has an approach.

在程式裡的樣子：`childApproach` 有值時，這一輪不可能回 `needs_choice`；
而且孩子連節奏帶方法都講了的時候，`nextAction` 的來源不可以是
`ai_suggested`（`CHILD_INPUT_OVERWRITTEN`）。

### B｜成果是方向，行動才是計畫

「國文考 100 分」保留在 `desiredOutcome`，**永遠不會**變成 `nextAction`。
下一步一律走既有的 `validateNextStep`（P0-3 的
`canonicalPlanFields.ts`）—— 這份契約沒有第二份關鍵字清單。

### C｜不是所有長期目標都拆成 3–5 steps

由 `progressionKind` 決定怎麼前進。它是 discriminated union 的判別欄位，
所以「rhythm 的計畫有五個階段」在型別上就寫不出來。

### D｜不可以偷偷補決定

孩子沒說的事只能是 `undecided`。沒說時段就不會有時段，也不可以在任何
自由文字裡冒出一個具體鐘點（`UNDECIDED_DETAIL_INVENTED`）。

### E｜不做心理診斷

可以說看得見的事實（「最近幾次星期三比較難照原本安排完成」）。
不可以說「你失去動機」「你不夠自律」「你會更有自信」
（`MENTAL_STATE_DIAGNOSIS`）。staged 的階段完成條件同樣必須可觀察
（`PHASE_NOT_OBSERVABLE`）。

### E-bis｜guard 限制的是模型的話，不是孩子的話

`MENTAL_STATE_DIAGNOSIS` 與 `DOMAIN_AUTHORITY_CLAIM` 限制的是**模型生成／
整理後的內容**。孩子自己用過的字眼（見 `childVocabulary()`）在敘述性欄位裡
不算違規 —— 孩子說「我想找到最有效的讀書方法」，整份計畫因為那三個字被退掉，
等於系統因為他用了某個詞就拒絕幫他，而他什麼都沒做錯。

放寬**只限那幾個他自己講過的詞**，其他一個都沒鬆：孩子講了「最有效」，
模型仍然不可以說「研究顯示」「專業訓練處方」。

**硬性 guard 不吃這個放寬，也不參與證據優先序：**

- `nextAction` / `controllableActions` 一律走完整的 `checkPlanActionText`
- staged 的 `observableDoneWhen` 一律不准是心理狀態

「更有自信」不會因為孩子講過就變成一個看得見的完成條件，「拿第一名」也不會
因為孩子講過就變成他今天做得到的動作。**EVIDENCE_PRIORITY 只排序 planning
content 的 provenance，不是放行清單** —— 一份所有欄位都標成 `child_stated`
的計畫，一樣會被這兩條擋下來。

### F｜AI 是規劃夥伴，不是領域教練

**可以**：澄清目標、整理孩子已有的方法、把遠期目標縮成近期行動、
協助決定 cadence 與 trial period、對明顯是專案的事給一條暫定路線、
提供 2–3 個可能的開始方式。

**不可以**：把模型的一般知識講成領域權威 —— 最佳籃球訓練順序、
最有效的鋼琴課程、科學上最佳複習頻率、專業運動／醫療處方
（`DOMAIN_AUTHORITY_CLAIM`）。

目標涉及明顯的領域專業，而孩子已經有老師、教材、課程或自己的方法時，
**那一套優先**。`phases` 是 **provisional route，不是 authoritative
curriculum** —— 孩子有方法時，phases 的 provenance 只能是
`derived_from_child`，模型另造一套課程會被擋下。

---

## 2. 兩個正交維度

早期版本把 `outcome_to_action` 放在 `progressionKind` 裡是錯的：那把
「成果控制得了嗎」偽裝成一種前進方式，於是每個不可控目標都只能有一種
節奏形狀。現在拆成兩個維度。

### goalControlType —— 這個成果他控制得了嗎

| 值 | 什麼時候 | 附加欄位 |
|---|---|---|
| `directly_actionable` | 做了就會發生（讀完一本書、學會騎車） | — |
| `external_outcome` | 受外部因素影響（考 100 分、拿第一名、進校隊） | `controllableActions`（1–4 條） |

### progressionKind —— 這件事怎麼向前走

| 值 | 什麼時候 | 附加欄位 |
|---|---|---|
| `rhythm` | 固定閱讀、30 天跑步、練琴習慣 | `cadence` / `sessionSize` / `trialPeriod` |
| `staged` | 學會騎車、學一首曲子、做一本漫畫 | `phases`（2–5 個，含 `observableDoneWhen`） |
| `accumulation` | 讀 5 本書、跑 20 公里 | `targetValue` / `targetUnit` / `currentValue` |

**兩者交集才是一份計畫。** 「國文考 100 分」的 goalControlType 是
`external_outcome`，但它的行動計畫「每週複習三次」的 progressionKind 是
`rhythm` —— 這是一個合法而且很常見的形狀。

> ⚠️ `progressionKind` **不是** `progress_model`。後者（`weekly_rhythm`）是 P0
> 的正式欄位，Direct Confirm 依賴它。這三個值**沒有**、也不可以被塞進那個
> enum —— parity 測試會擋下任何一邊出現另一邊的識別字。

---

## 3. Input

孩子已經想到多少，input 就要表達得出來。

```ts
type ChildGoalPlanningInput = {
  schemaVersion: 1;
  ageGroup: '2-4' | '4-6' | '6-9' | '9-12';
  childOriginalGoal: string;          // 原話，只讀
  childOriginalMotivation: string | null;
  childApproach: string | null;       // 「我想每天放學投 20 球」
                                      // 「老師叫我先練右手旋律，再練左手」
                                      // needs_choice 之後他挑的選項也從這裡回來
  cadence: ChildPlanCadence | null;
  preferredTime: string | null;
  planningSupportPreference:
    | 'organize_only' | 'suggest_if_needed'
    | 'give_me_options' | 'first_step_only' | null;
};
```

- `childApproach` 是孩子**自己已經有的做法**，不要塞進 `childOriginalGoal`。
- `planningSupportPreference` 是孩子希望 AI 幫多少，**不是 AI 自己決定要接管多少**。
- 沒有身分資料：沒有 childId、familyId、暱稱或生日，年齡只送分級。

---

## 4. Result —— 四態

```ts
type ChildGoalPlanningResult =
  | NeedsClarification   // 連他想達成什麼都還不清楚
  | NeedsChoice          // 目標清楚，但還沒決定怎麼做
  | ReadyPlan            // 資訊夠了
  | Unavailable;         // 技術性失敗
```

`unavailable` **不可以**被偽裝成 `needs_clarification`。Gemini 逾時的時候把它
塞成一個問題，孩子看到的是「AI 在問我問題」，但他講得一點都沒錯 ——
只是服務掛了。技術狀態與對話狀態是兩件事。

### 4.1 Needs Clarification

**一次只問一題** —— 型別上是單一物件，不是陣列。

`kind`：`goal_focus` / `current_level` / `approach` / `cadence` /
`session_size` / `target_amount`。

### 4.2 Needs Choice

目標已經清楚，但孩子還沒決定「怎麼做」。這時 AI 提供 2–3 個可選的開始
方式，**而不是直接替他生成唯一一份 schedule**。

```ts
{
  status: 'needs_choice',
  knownGoal: string,
  question: string,
  options: { id, text }[],   // 2-3 個，平等，不標「推薦」
  allowCustomAnswer: true,   // 字面量
  model: string,
}
```

`allowCustomAnswer` 的型別只有 `true` 一個值：孩子**永遠**可以說
「我自己想」。一個只能從 AI 選項裡挑的畫面，在這個契約下寫不出來。

孩子已經有方法時給選項是非法的（`CHILD_INPUT_OVERWRITTEN`）——
那是把他的方法換掉的前一步。

### 4.3 Minimal Question Principle（deterministic）

`cadence !== null` 且 `childApproach` 有值時，資訊即為足夠，這一輪
**既不准再問、也不准再給選項**（`UNNECESSARY_CLARIFICATION`）。
兩端各有一份實作，而且它是一個結構條件（有節奏 ＋ 有方法），不是關鍵字清單。

### 4.4 Ready Plan

```ts
{
  desiredOutcome, actionPlanSummary, currentFocus,
  nextAction: { text, source },
  reviewPoint, planningContribution, provenance, model,
  ...goalControlType 的欄位,
  ...progressionKind 的欄位,
}
```

`reviewPoint`（**不是完成／失敗**，是「什麼時候回頭看看這個方法適不適合」）：

```ts
| { type: 'after_days'; days }
| { type: 'after_sessions'; sessions }
| { type: 'after_phase'; phaseId }
| null            // 不強迫每種目標都有 review date
```

`planningContribution`：

| 值 | 意思 |
|---|---|
| `organized_child_plan` | 孩子自己想好了，AI 只是整理 |
| `filled_missing_details` | 孩子有方向，AI 補了缺的細節 |
| `child_chose_option` | 孩子從上一輪 `needs_choice` 的選項裡挑了一個 |

`child_chose_option` 成立的前提是那個選項真的從 `childApproach` 回來了 ——
選項的文字是 AI 寫的，但**決定是孩子做的**，兩件事都要留在資料裡。

---

## 5. Provenance 與證據優先序

這一輪不做完整 event sourcing，但**結果不可以把來源洗平**。

```ts
type ChildPlanProvenance = {
  childOriginalGoal: string;          // 逐字，由組裝端複製
  childStatedApproach: string | null; // 逐字，由組裝端複製
  fields: {
    cadence | sessionSize | preferredTime | nextAction
    | reviewPoint | phases | target | controllableActions
      : ChildPlanFieldSource;
  };
};
```

**證據優先序（低順位不得覆蓋高順位）：**

| 來源 | 意思 |
|---|---|
| `child_stated` | 孩子自己講的（原話裡就有） |
| `derived_from_child` | 從孩子講的內容直接推導（「投 20 球」→ 單次份量 20 球） |
| `deterministic_policy` | GrowBook 自己的規則決定的（不是模型、也不是孩子） |
| `ai_suggested` | 模型提的 |
| `undecided` | 沒有人決定 —— **留白** |

`derived_from_child` 與 `deterministic_policy` 一定要分開：共用一個
`derived` 的話，「從孩子的話推出來的」與「GrowBook 政策決定的」在資料上
長得一模一樣，而它們的證據強度差一級。

> 目前這一版**沒有任何欄位**會是 `deterministic_policy` —— 這條鏈還沒有
> 任何由 GrowBook 政策決定的預設值（例如「預設 7 天回顧」）。這個值先存在
> 於契約與優先序裡，等真的出現政策預設時才會被產出。

執法點（validator）：

- `input.cadence !== null` → `fields.cadence` 必須至少是 `child_stated`
- `input.preferredTime !== null` → `fields.preferredTime` 必須至少是 `child_stated`
- 資訊足夠時 → `fields.nextAction` 必須是 child-owned（`child_stated` 或 `derived_from_child`）
- 孩子有方法 ＋ staged → `fields.phases` 必須是 child-owned
- 欄位不存在 → 來源只能是 `undecided`；反過來也一樣

---

## 6. Deterministic guards

| rejection code | 擋什麼 |
|---|---|
| `SHAPE_INVALID` | 形狀／列舉／長度不對 |
| `NEXT_ACTION_INVALID` | 下一步過不了既有的 `validateNextStep` |
| `OUTCOME_USED_AS_ACTION` | 不可控的成果被寫成 `controllableActions` |
| `MENTAL_STATE_DIAGNOSIS` | 心理狀態推測 |
| `PHASE_NOT_OBSERVABLE` | 階段完成條件看不見 |
| `DOMAIN_AUTHORITY_CLAIM` | 把模型的一般知識講成領域權威 |
| `UNNECESSARY_CLARIFICATION` | 資訊足夠卻還在問或還在給選項 |
| `CHILD_INPUT_OVERWRITTEN` | 孩子的目標／方法／節奏被換掉，或低順位覆蓋高順位 |
| `UNDECIDED_DETAIL_INVENTED` | 孩子沒說的細節被憑空補上 |

**分工**（與 P0-3 一致）：

- Function 端：prompt ＋ 正規化 ＋ deterministic 組裝（孩子講過的東西一定贏）。
- App 端：決定這份計畫能不能用。所有語意 guard 都在這裡，**關鍵字規則只有一份**。

形狀不對 → `INVALID_RESPONSE`（契約漂移，去看部署）。
形狀對但原則不對 → `INVALID_AI_OUTPUT`（模型這次寫錯，去看 prompt）。

---

## 7. Canonical 案例

| # | 孩子說 | 預期 |
|---|---|---|
| 1 | 兩週讀完神奇樹屋＋平日睡前 15 分鐘 | `ready` / `directly_actionable` / `rhythm` / `organized_child_plan`，不新增任何安排 |
| 2 | 我想變厲害 | `needs_clarification`（`goal_focus`），只問一題 |
| 3 | 我想國文考 100 分 | `external_outcome` × `rhythm`，保留成果，下一步不是分數 |
| 4 | 我想投籃更準＋每天放學投 20 球 | 保留他的方法；換成另一套或丟選項 → 擋下 |
| 5 | 我想學會騎腳踏車 | `staged` 或 `current_level` 澄清，不假設「完全不會」 |
| 6 | 我想做一本漫畫 | `staged`，型別上就沒有 cadence 欄位 |
| 7 | 暑假想讀 5 本書 | `accumulation`，型別上就沒有 phases 欄位 |
| 8 | 一週三次／每次 20 分鐘／睡前／先試兩週 | 再問問題或再給選項 → 這一輪無效 |
| 9 | 我要比賽第一名 | 「下一步：拿第一名」→ `NEXT_ACTION_INVALID` |
| 10 | （任何目標） | 「你最近失去動機」→ `MENTAL_STATE_DIAGNOSIS` |
| 11 | 我想兩週讀完這本書，但不知道怎麼安排 | `needs_choice`（2–3 個選項 ＋ 一定可以自己想），不是 clarification、也不是 AI 直接決定 schedule |
| 12 | 我想彈完這首曲子＋老師叫我先練右手旋律 | 整理老師的順序（`derived_from_child`）；另造課程 → `CHILD_INPUT_OVERWRITTEN`；「最有效的順序」→ `DOMAIN_AUTHORITY_CLAIM` |

---

## 7-bis. Real model acceptance（P1-A1.5）

2026-08-13，真實 Gemini，走與 ai-proxy 同一條 MODEL_CHAIN、同一支 prompt、
同一支 normalize/compose/validator。**沒有部署任何東西、沒有碰 staging 資料、
沒有寫任何一列。** 重跑方式：

```
LIVE_MODEL_CHECK=1 npx jest childGoalPlanningLiveCheck
LIVE_CHECK_ONLY=MT ...      # 只補跑某幾個 case
LIVE_CHECK_BUDGET_MS=90000 ... # 量測延遲用，不是驗收用
```

（預設 skip —— 這支會真的花錢。金鑰從 `.env.local` 讀，只讀不印。）

**延遲**：三輪共 69 次呼叫，中位數約 1.3 秒，健康時最大約 3 秒；但會出現
**偶發的長尾**（同一組輸入某一輪 1.1 秒、另一輪 25 秒以上），與 prompt 長度
無關，比較像 API 側的壅塞。原本的 15 秒讓 4/15 直接變成 SERVICE_ERROR，
因此預算改成 **Function 30 秒 / App 40 秒**。

長尾沒辦法靠再加大預算消滅，也不該 —— 契約對它的答案是 fail-soft：
逾時就是 `unavailable`，不是一份編出來的計畫。實測的兩次逾時確實只產生錯誤，
沒有產生任何內容。

**已知缺陷（不在這一包修）**：`gemini.ts` 的 `MODEL_CHAIN` 最後一個
`gemini-2.0-flash` 已被 Google 下架（實測 404：This model is no longer
available）。前兩個 model 撞到配額時，fallback 的最後一跳一定失敗。
這支 chain 是**所有** ai-proxy 呼叫端共用的（週報、顧問聊天、許願澄清、
P0-3 計畫草稿），所以它該有自己的決定與回歸測試，不該在一個 contract
驗收工作包裡順手改掉。

## 8. Non-goals（P1-A1 的邊界）

這一包**沒有**做，而且刻意沒有做：

- 沒有接上正式 Child Proposal 流程（`ChildProposalScreen` 等畫面一個字都沒改）。
- 沒有掛進 `generateChildProposalPlanDraftInBackground()`。
- **沒有任何 DB persistence** —— 先回答「資料應該長什麼樣子」，
  之後再判斷是擴 `child_proposal_plan_versions`、新 JSONB 欄位、還是新表。
- 沒有碰 milestone。這份契約裡的 `phases` **不是** milestone，
  也不可以被拿來當 milestone 的進度來源 —— 現有進度層刻意禁止用
  completion count 假裝 milestone progress，那個邊界保留。
- 沒有幣值、資格、payout、結算、週報。這條鏈連 `rewardEligibility` 與
  `coinPolicy` 都沒有 import。
- 沒有 Dynamic Replan、沒有自動偵測卡住。

## 9. 開關

`EXPO_PUBLIC_CHILD_GOAL_PLANNING_AI_MODE`（自己的開關，**沒有**與 P0-3 共用）。
`fake` 一律降成 `off` —— 一份模型從來沒跑過、但長得像 AI 產出的計畫，
之後沒有人分得出來。

---

## 10. P1-A2：多輪對話與 Planning Session

P1-A1 的邊界（第 8 節）在這一包被移動了兩格：**接上 Child Proposal 的 draft 階段**，
以及**有了自己的 persistence**。其餘邊界原封不動。

### 10.1 對話的答案有自己的位置

P1-A1 的 input 只有四個內容欄位，於是多輪對話的答案無處可放。唯一可行的作法是寫回
既有欄位 —— 而那正是這份契約整包在防的事：

> AI 問「你最想在哪件事變厲害？」孩子答「我想把英文口說變好」。
> 那句話一旦寫進 `childOriginalGoal`，他的原話就被 AI 的提問改掉了，
> 而且事後沒有任何地方看得出來。

所以新增 `responses: ChildPlanningResponse[]`，只 append：

| type | 意義 | 證據強度 |
|---|---|---|
| `clarification_answer` | 他回答了一題（逐字保留問題與答案） | 他的原話 |
| `choice_selection` | 他從選項裡挑了一個 | 文字是 AI 的、**決定是他的** |
| `custom_choice` | 他說「我自己想」並自己輸入 | 他的原話 |

四個內容欄位一個字都不動。「原話不可覆寫」因此是**結構性**的，不靠呼叫端自律
（DB 那一側另有 trigger）。

### 10.2 provenance 拆成兩欄

- `childStatedApproach` —— 他**自己打的字**。挑走的選項不算，寫進來等於宣稱那句話是他講的。
- `childChosenOption` —— 他挑走的選項，逐字 ＋ id。
- `fields.approach` —— 方法的來源。**永遠不會是 `ai_suggested`**：
  他自己打的是 `child_stated`，他挑的是 `derived_from_child`，還沒決定是 `undecided`。

「他挑過沒有」由對話紀錄決定，不由模型自陳：真的挑過就一定標成 `child_chose_option`
（模型忘了標也一樣），沒挑過就不准標。

### 10.3 對話有盡頭

| 常數 | 值 | 擋什麼 |
|---|---|---|
| `CHILD_GOAL_PLANNING_MAX_ROUNDS` | 3 | 孩子被問幾次。**逾時不算** —— 那不是他講得不清楚。 |
| `CHILD_GOAL_PLANNING_MAX_ATTEMPTS` | 5 | 打了幾次模型。「再試一次」的盡頭。 |

三輪問完之後不再問第四題，改為把主導權交回孩子：「我自己寫怎麼開始」與
「先把想法送給爸媽」。這兩條在型別上是字面量 `true`（`ChildPlanningSessionExits`），
所以把它們藏起來的畫面寫不出來。

次數由 **RPC 自己加**，不收呼叫端的值 —— 收的話上限就只是一個建議。

### 10.4 Planning Session ≠ Plan Version

`child_goal_planning_sessions` 存的是**計畫成形之前孩子在想什麼**。它刻意不是
`child_proposal_plan_versions`：後者是正式共同計畫的生命週期（家長會看到、
Direct Confirm 會讀、`confirmed_reward` 掛在上面）。一場還在問「你想先怎麼開始？」
的對話放進去，等於讓一個沒有人同意過的東西出現在那條線上。

不變式（全部在 DB，不在畫面）：

- **A** 一個 proposal 同時只有一場進行中的對話（partial unique index，不是先查再寫）
- **B** 只有 `proposal.status = 'draft'` 可以規劃
- **C** `child_confirmed` 之後 `confirmed_plan` 不可變；對話只能變長；`revision` 不可倒退
- **D** 授權沿用 `assert_child_in_caller_family`，沒有另一套
- **E** `client_request_id` 決定於任何狀態檢查之前 —— 連點兩下不會生出兩場

`confirmed_plan` 由 RPC 從 `latest_result` 複製，**命令裡沒有計畫這個東西**
（與 `confirmed_reward` 從 `tasks` 複製同一個理由）。

### 10.5 這一包停在 draft

孩子確認計畫之後：

```
planning session : child_confirmed
child_proposal   : draft        ← 沒有變
```

不建立 Plan Version、不轉 `proposed`、不碰幣值。正式 Plan Version 需要分類、
完成標準、資格與定價，那是 P1-A3 的 policy enrichment。現在就轉的話，孩子看的是
P1 計畫，而家長會看到背景跑出來的另一份 P0 草稿 —— 兩份「真正的計畫」不可以同時存在。

### 10.6 仍然不做

- 不改 P0-3 Plan Draft 的任何行為（AI mode 關掉時走的是一模一樣的兩步送出）
- 不碰 Direct Confirm、reward、payout、LongTerm UI、WP2
- 不把 provider 概念帶進契約、持久化或孩子端畫面（由 provider-neutrality 測試掃描）

### 10.7 Correction：session 的第二個終點

第一版漏了一個真實的漏洞：孩子按「先把想法送給爸媽」時提案變成 `proposed`，
但那場 session 還停在 `in_progress` / `ready` —— 一份「進行中的規劃」掛在一個
已經送出去的提案上，還佔著「一個提案只有一場對話」的位子、還收得了新的一輪。

所以 status 多了第四個值：

```
in_progress ─┬─→ ready ─→ child_confirmed   （他確認了這份計畫）
             └─────────→ abandoned          （他選擇不規劃，直接送出原始提案）
```

`abandoned` 不是失敗，是一個孩子做的決定。它不得有 `confirmed_plan`／
`child_confirmed_at`，不再接受任何一輪，而且**不可以轉回去**。

**離開必須是原子的。** 由 App 先 abandon 再 transition 的話，中間斷掉會留下
「已放棄但沒送出」或「已送出但規劃還開著」，而那兩步之間正好是孩子按下按鈕、
畫面在轉圈的那一刻。所以新增 `submit_child_proposal_without_planning_v1`：
同一交易內鎖提案 ＋ 鎖 session ＋ 放棄 ＋ `draft → proposed` ＋ 寫 status event，
支援冪等重送，沒有 session 也完全合法。

已經 `child_confirmed` 的 session **一律拒絕**（`PLANNING_ALREADY_CONFIRMED`）——
偷走一份孩子同意過的計畫，等於讓它從來沒發生過。要送出已確認的計畫是 P1-A3 的橋。

### 10.8 Correction：start 失敗不再自動送出

`start` 回 `PERSISTENCE_FAILED` 時，App **無法知道** DB 有沒有其實已經建好那場
對話（回應可能是在 commit 之後掉的）。舊寫法「開不起來就自動送出」等於在一個
可能已經開好對話的提案上直接推去 `proposed`，而孩子從頭到尾沒有選過。

改成把選擇交回孩子：再試一次 ／ 我自己想 ／ 先把想法送給爸媽。
前兩者重用**同一個** `clientRequestId`，讓 start RPC 自己做冪等對帳；
第三個走上面那支 atomic RPC。

---

## 11. P1-A3：Formal Plan Bridge

孩子確認過的規劃 → **正式、可以交給家長看的 Plan Version**，並把提案送出。

```
planning session : child_confirmed
        ↓  publish_child_confirmed_plan_v1（一個交易）
plan version     : authored_by = 'child'
                   source_planning_session_id = session.id
                   child_confirmed_plan = 孩子點頭的那一份
                   parent_confirmed_at = null / effective_at = null
child_proposal   : draft → proposed
        ↓
       STOP    ← 家長最終確認、建任務、發幣都是 P1-A4 以後
```

### 11.1 做法的作者是孩子

`authored_by = 'child'`，而且帶 planning lineage 的列在 CHECK 上寫不出別的作者。

目前 P0 Direct Confirm 硬性要求 current plan 是 `authored_by='ai'`，所以這種版本送
進去仍然會被 `PLAN_NOT_CONFIRMABLE` 擋下 —— **那是對的，這一輪不修它。** 原因不是
功能壞掉，而是我們還沒有正式重新定義 Parent Confirmation 的語意。在那之前用一個
假的 authorship 繞過去，等於把「這是孩子想的」從資料裡抹掉，只為了讓一個還沒設計
好的按鈕變成可按。

### 11.2 Canonical child plan 不會被壓平

既有的扁平欄位（`plan_title` / `plan_summary` / `progress_model` / `next_step`）
表達得了「每週三次、每次 15 分鐘」，但表達不了 staged 的階段、accumulation 的
target、`goalControlType` 底下的可控行動，也表達不了逐欄 provenance。洗掉之後
「做一本漫畫」與「暑假讀五本書」在資料上會長得一模一樣。

所以正式版本多一份 `child_confirmed_plan jsonb` ＋ `planning_schema_version`。

**它不是 `ai_snapshot`**：

| 欄位 | 語意 |
|---|---|
| `child_confirmed_plan` | 已驗證、孩子確認過、產品的 canonical data |
| `ai_snapshot` | 某一次模型／enrichment 回了什麼的稽核證據 |

「AI snapshot 不能當 canonical source」這條原則完全沒有鬆動 —— 前者之所以是
canonical，正是因為它不是模型的輸出，而是孩子在螢幕上看過並且點頭的那一份。

### 11.3 計畫本體由伺服器複製

命令裡出現 `plan` / `confirmedPlan` / `planTitle` / `planSummary` / `nextStep` /
`desiredOutcome` / `actionPlanSummary` 任何一個鍵，整筆以
`PLAN_NOT_CLIENT_SUPPLIED` 拒絕。RPC 自己從 `session.confirmed_plan` 讀。

與 `confirm_child_goal_planning_session_v1` 從 `latest_result` 複製、
`confirmed_reward` 從 `tasks` 複製同一條原則。

### 11.4 孩子擁有的欄位怎麼對應

| 正式欄位 | 來源 |
|---|---|
| `plan_title` | `desiredOutcome`（只去頭尾空白，**不重新命名、不截字**） |
| `plan_summary` | `actionPlanSummary` |
| `next_step` | `confirmed_plan.nextAction.text` |
| `cadence_*` | 見 11.5 |
| `preferred_time` | 孩子在提案上自己選的 |

`next_step` 的內容規則（結果導向、系統語言、長度）在孩子看到這份計畫**之前**就
跑過了 —— `planGuards` 對 `nextAction` 走的是既有的 `validateNextStep`，過不了的
計畫根本不會變成 `ready`。RPC 只做長度與空值的防線，不重寫一份關鍵字清單。

### 11.5 判準是 provenance，不是「這一欄有沒有值」

契約允許模型在孩子沒表態時提一個節奏（provenance 會標 `ai_suggested`）。孩子按
確認是同意**這份計畫的方向**，不是逐欄替每個細節拍板 —— 把 `ai_suggested` 的節奏
直接寫進正式欄位，家長看到的會是一句「孩子想一週三次」，而他從來沒這樣說過。

所以 cadence 與 session size 的順位是：

```
confirmed_plan 裡 provenance 為 child_stated / derived_from_child
  > 孩子原提案上已選的 cadence
    > 未決定 → requires_parent_decision
```

`session_size` 沒有孩子的證據時退回 enrichment 估的投入量（那是 GrowBook 政策層的
數字，不會被說成是孩子的約定）。

### 11.6 progressionKind ≠ progress_model ≠ payout

```
rhythm       ＋ long_term ＋（weekly_frequency / fixed_days） → progress_model = 'weekly_rhythm'
rhythm       但條件不足                                       → null
staged                                                        → null，階段留在 child_confirmed_plan
accumulation                                                  → null，target 留在 child_confirmed_plan
```

`progress_model` 的 enum **沒有被擴充**。塞進去的話孩子畫面會出現一個沒有依據的
「本週 0/0」。LongTerm UI 之後直接讀 planning structure。

**完全沒有 progression → payout 的對應**：`staged` 不是 `per_milestone`，
`accumulation` 不是 `final_completion`。`goalControlType` 也完全不參與回饋判定 ——
它回答的是「成果控制得了嗎」，不是「發不發幣」。

### 11.7 正式計畫可以有還沒決定的共同條件

`requires_parent_decision text[]`，封閉列舉：
`cadence` / `session_size` / `duration` / `reward` / `purpose_category`。

孩子可以很清楚地知道「先決定故事 → 畫角色 → 畫頁面」，同時完全沒有決定一週幾次、
多久完成、有沒有幣。那份計畫仍然成立 —— 沒有決定的是**家庭共同條件**。

**不為了讓 Direct Confirm 過而捏資料。** 自己生一個 `durationDays = 30` 或
`weeklyFrequency = 3` 才是真的錯；Direct Confirm 暫時不能用是可以接受的，
哪些提案可以直接確認由 P1-A4 重新定義。

### 11.8 P0 Plan Draft 只能當 enrichment evidence

重用它的理由：分類、活動種類、投入量、資格與定價已經有一整套驗過的實作
（`rewardEligibility` 八步閘門 → `coinPolicy` → policyVersion）。再造一套
「P1 pricing AI」會有兩套會分岔的數字，而且新的那套沒有人驗過。

| 可以用 | 不可以用 |
|---|---|
| `category` → `purpose_category` | `planTitle` |
| `activityKind` → `canonicalCompletionDescription` 的固定句型 | `planSummary` |
| `estimatedMinutes`（孩子沒講份量時） | `nextStepSuggestion` |
| `durationType` / `durationDays` | AI 建議的 `cadence` |
| 既有 deterministic policy 產出的 reward 判定 | 整份重新設計的計畫 |

即使它們「看起來更漂亮」。三層防線：`ChildPlanEnrichment` 型別上沒有那些鍵、
`toChildPlanEnrichment` 明確挑欄位不寫 spread、RPC 收到就以
`ENRICHMENT_MAY_NOT_OVERRIDE_CHILD` 拒絕。

幣值一個都不收（`REWARD_NOT_CLIENT_DECIDED`）。

### 11.9 enrichment 掛掉不會把孩子鎖在 draft

| 路徑 | 結果 |
|---|---|
| A｜enrichment 成功 | 正式計畫帶政策欄位，`enrichment_status = 'enriched'` |
| B｜enrichment 不可用 | 只有孩子擁有的欄位，缺的列進 `requires_parent_decision`，`enrichment_status = 'unavailable'` |

兩條路徑**都會送出**。B 不是「假裝成功」—— 它明確地說「這些還沒算」。
AI policy helper 掛掉不可以把孩子已經確認的提案永遠鎖在 draft。

### 11.10 冪等與原子性

一場 `child_confirmed` 的對話最多產生**一個**正式版本（`source_planning_session_id`
上的 partial unique index）。重送 publish 回同一個 `planVersionId`，而且冪等分支在
**所有狀態檢查之前** —— 「其實已經成功了但回應掉了」的重試必須拿回原本那一版，
不是撞到「提案已經是 proposed」然後看到紅字。

確認與送出在畫面上是**兩件事**：確認已經持久化了，送出失敗時顯示「你決定的方式
留下來了，還沒送到爸媽那裡」＋「再送一次」，**不把孩子退回對話** —— 退回等於讓他
以為剛剛點的頭不算數。

### 11.11 仍然不做

- 不重寫 Direct Confirm 語意、不重畫家長端 UI、不動 LongTerm Detail、不 merge WP2
- 不建任務、不轉 active、不寫 confirmed reward、不碰錢包與 payout
- 不做 milestone 完成／發放、不做 Dynamic Replan
- 不換付費 provider、不加第三順位模型

---

## 12. P1-A4A：Parent Direct Agreement

孩子確認過的完整計畫 → **家庭共同約定** ＋ 正式任務。

```
child formal plan (authored_by = 'child')
        ↓  confirm_child_planning_proposal_v1（一個交易）
parent agreement version (authored_by = 'parent')
        adopted_from_plan_version_id = child formal plan
canonical task（走既有 create_parent_task_v1）
proposal → active
```

### 12.1 產品語意

不是「家長批准 AI 計畫」，也不是「家長接管孩子的 Plan」：

> 孩子已經確認「我要怎麼做到」；
> 家長現在只確認這份**已經完整**的安排能不能成為家庭共同約定。

### 12.2 兩條線，不是一支通用 function

| | P0 Direct Confirm | P1 Parent Agreement |
|---|---|---|
| RPC | `confirm_child_proposal_v1` | `confirm_child_planning_proposal_v1` |
| 收 | `authored_by = 'ai'` | `authored_by = 'child'` ＋ planning lineage |
| 語意 | 採用 GrowBook 的建議 | 同意孩子的安排 |
| 幣值錨點 | `ai_suggested_coin_amount` | `ai_snapshot.policy.sessionCoinReference` |

把 legacy 的 `authored_by = 'ai'` 放寬成 `IN ('ai','child')` 會得到一支看似通用、
其實語意分叉的 function —— 之後每加一個條件都要先問「這是哪一條的」。
**legacy 一個字都沒改。**

路由（`resolveConfirmRoute`）**只看 authorship 與 lineage**。不看 `plan_title`、
不看 `ai_snapshot`、不看 `ai_model`：內容看起來像什麼，都不能決定一份計畫的 ownership。

### 12.3 什麼叫「可以直接同意」

全部成立才算：`status = proposed` ／ current = `expectedPlanVersionId` ／
`authored_by = 'child'` ／ planning lineage 三欄齊全 ／
`enrichment_status = 'enriched'` ／ `requires_parent_decision = []` ／
正式任務需要的系統欄位全齊。

缺任何一個 → `SHARED_DECISION_REQUIRED`，**不自動補值**。

### 12.4 共同條件沒決定 ≠ 錯誤

`requires_parent_decision = ['cadence','duration']` 時，A4A **不讓家長直接填**。
孩子從來沒答應過那個新節奏 —— 那是 A4B 的協商流程。

畫面顯示「還有安排要一起補充」，並用家長話列出缺什麼
（`cadence` → 進行頻率、`session_size` → 每次大約做多久…），
**不顯示假的「確認」按鈕**，也不說「還不能確認」——後者會讀成孩子的問題。

### 12.5 家長這顆確認不能同時編計畫

命令帶 `planTitle` / `nextStep` / `cadence*` / `duration*` / `estimatedMinutes` /
`childConfirmedPlan` / `progressionKind` / `phases` / `targetValue` … 任何一個
→ `CHILD_PLAN_NOT_CLIENT_SUPPLIED`，整筆拒絕。

命令只有四個鍵：`schemaVersion` / `proposalId` / `expectedPlanVersionId` /
`rewardDecision`。內容全部由 RPC 從孩子那一版逐欄複製。

### 12.6 只有一份 canonical child plan

共同版本**不複製** `child_confirmed_plan`。DB CHECK 本來就不允許
（帶 planning lineage 的列 `authored_by` 必須是 `child`），而語意上更重要：
複製一份的話，「孩子原本怎麼想」會有兩個答案。

回查路徑：

```
task → proposal → current parent agreement version
     → adopted_from_plan_version_id → child formal plan → child_confirmed_plan
```

這條 lineage 是之後 LongTerm Detail、Dynamic Next Step、
「孩子原本怎麼想」的正式來源。

### 12.7 Child-owned 欄位不可在確認時被改寫

RPC 的驗證區塊逐欄比對兩件事：孩子那一版**沒有被動過**
（`authored_by` / lineage / `child_confirmed_plan` / 內容欄位），
以及共同版本的執行內容**逐欄等於**孩子那一版。confirm 時
trim / rewrite / default / AI regenerate 一律不允許。

### 12.8 Reward freshness

家長可能是幾天後才按確認，所以 App 端用**現在的**政策重算一次
（`evaluateTaskReward`，與 P0 完全同一條計算鏈，**沒有第二套 evaluator**），
RPC 再驗那份判定與計畫上的證據一致。

幣值的錨點是正式欄位 `policy_session_coin_reference`（見 §13）。
沒有錨點的話，呼叫端送什麼金額都沒有東西可以比對。

> A4A 出貨時這個錨點讀的是 `ai_snapshot.policy.sessionCoinReference`。
> **P1-A4A.1 改掉了**：稽核快照不是 canonical policy authority。

- 政策／版本對不上 → `POLICY_CHANGED`，**不靜靜改掉計畫上的證據**
- `finalAmount ≠ suggestedAmount` → 拒絕（家長不自由輸入金額）
- `payoutType ≠ per_completion` → 拒絕（staged 不是 per_milestone，
  accumulation 不是 final_completion；那兩種目前沒有結算路徑）
- B 類 ＋ `coin_eligible` → 拒絕

孩子的 canonical plan 本身不受政策變動影響。

### 12.9 原子性、冪等、stale

一個交易：鎖提案 → 鎖 child plan → 驗證 → 建共同版本 → 建任務 →
寫 confirmed reward 快照 → supersede → 轉 active → 回寫 task_id。
任何一步失敗全 rollback（`P0001` subtransaction）。

冪等靠 **lineage** 對帳（`adopted_from_plan_version_id = expectedPlanVersionId`），
不是「這份提案剛好是 active」；對不上的 active 是另一次確認，回 `STALE_PLAN_VERSION`。
current version 換掉了也回 `STALE_PLAN_VERSION`。

### 12.10 這一包不做

家長新增／修改 cadence、duration、next step；孩子二次 review；
A4B 共同條件協商；LongTermDetail redesign；WP2 merge；Dynamic Replan；
付費 provider cutover。

---

## 13. Deterministic Policy Evidence（P1-A4A.1）

### 13.1 為什麼要有這一節

A4A 出貨時，家長同意那一步的幣值錨點讀的是：

```
ai_snapshot -> 'policy' ->> 'sessionCoinReference'
ai_snapshot -> 'policy' ->> 'payoutType'
```

這違反一條既有的界線：**`ai_snapshot` 是稽核證據，不是 canonical policy
authority。** 快照的形狀由「某一次 enrichment 回了什麼」決定，沒有 CHECK、
沒有承諾哪個鍵一定在。正式任務與 confirmed reward 建不建得起來，不可以
取決於一坨稽核 JSON 裡剛好有沒有某個鍵 —— 那條相依一旦成立，snapshot 就
再也不能改形狀，而它本來就是會隨模型與版本演化的那一欄。

### 13.2 兩個正式欄位

| 欄位 | 語意 |
|---|---|
| `policy_session_coin_reference` | 既有規則鏈（`rewardEligibility → coinPolicy`）在建版當時算出的一次投入參考價 |
| `policy_payout_type` | 當時政策**支援**的結算語意。CHECK 只允許 `per_completion` |

它們**不是**孩子決定的、**不是**模型生成的、**不是**最終確認的幣值
（那一個在 `confirmed_coin_amount`）。

不塞進 legacy 的 `ai_suggested_coin_amount`：那個名字說這是 AI 算的，
而這個數字不是。P0 legacy 該欄的語意與行為完全不變。

### 13.3 A3 寫入規則

值來自 enrichment 的 `reward.sessionCoinReference` / `reward.payoutType`，
也就是既有 Plan Draft 那條鏈的輸出。寫入條件：

- `reward_policy = coin_eligible` 且 `eligibility = allowed`
- 且 `payoutType = per_completion`

任一條不成立 → **兩欄都留 NULL**，而且 `reward` 進 `requires_parent_decision`。

**不猜。** 不因 `progressionKind = staged` 寫 `per_milestone`，
不因 `accumulation` 寫 `final_completion`。那兩種結算方式現在沒有實作，
猜一個寫進去只會讓一份沒有結算路徑的計畫看起來完全正常 —— 直到孩子
完成第一個里程碑、而沒有人發幣。

enrichment 不可用時同樣兩欄 NULL，計畫照樣成立（`enrichment_status`
與 `requires_parent_decision` 會說明缺什麼）。

### 13.4 append-only

兩欄都在 `child_proposal_plan_version_guard()` 的內容清單裡。
「拿現在的規則再算一次、跟建版當時的證據對帳」這件事，正是因為證據
不能被原地改才有意義。政策後來變了走 `POLICY_CHANGED`，不是回頭修那一列。

### 13.5 A4A 讀取規則

`confirm_child_planning_proposal_v1` 的**決策路徑一個條件都不讀
`ai_snapshot`**。錨點就是這兩欄；共同約定版本逐欄複製它們；事後驗證
兩個方向都比對（孩子那一版沒被改、共同版本等於孩子那一版）。

`ai_snapshot` 仍然跟著複製到共同版本 —— 它是證據，之後要回答
「當時的政策判定憑什麼」時要找得到。但**它只是證據**。

> **canonical regression**：`ai_snapshot = NULL` 而 policy evidence 完整時，
> A4A 必須仍然可以確認。稽核證據存不存在，不該決定一個家庭能不能
> 開始執行他們的約定。
