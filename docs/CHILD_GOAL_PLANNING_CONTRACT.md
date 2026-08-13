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
