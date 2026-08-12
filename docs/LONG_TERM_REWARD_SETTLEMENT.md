# 長期任務的結算｜Check-in 與 Reward Event 的分離

> 前置閱讀：`docs/CLAIM_PERIOD_VS_PAYOUT_BASIS.md`（為什麼 `claim_period` 推導不出 `payout_basis`）。
> 本文件在 Phase 1 期間同時是 design 與 canonical 說明。
> 每一節標了 **[實作]** 或 **[roadmap]**，不要把 roadmap 當現況引用。

---

## 1. 核心 invariant：daily check-in ≠ reward event

孩子今天完成一次長期任務，只代表**今天完成了一次實際行為**。

| | Progress event | Reward event |
|---|---|---|
| 寫進哪 | `task_completions` | `reward_settlements` + `transactions` + `wallets` |
| 何時發生 | 每一次完成 | 只有 `payout_basis` 定義的事件成立時 |
| 頻率由誰管 | `claim_period` / `max_claims_per_period` | `payout_basis`（+ period target / milestone / goal） |
| 孩子看到 | 「已記錄」「本週 3/4」 | 「本週穩定投入達成 +10」 |

**改動前的現況（bug）：** `complete_task` 只認得「一次完成 = 一次結算」，
一個「每週 4 次」的 coin_eligible 計畫一週 mint 四次。共同版本快照上寫的
`confirmed_payout_basis = 'per_period'` 對錢包毫無約束力。

---

## 2. Payout semantics **[實作：per_completion / per_period；roadmap：per_milestone / final_completion]**

`tasks.payout_basis`，四個值，**NULL 有獨立意義**：

| 值 | 結算事件 | Phase |
|---|---|---|
| `NULL` | **legacy** —— 沿用本欄位存在之前的行為（每次完成即結算） | 1 |
| `per_completion` | 每一次完成都是獨立 reward event。單次／非長期按次結算的任務。 | 1 |
| `per_period` | 一個 period 內完成數達到 `period_target_count` 時，結算一次。 | 1 |
| `per_milestone` | 一個正式 milestone 被確認完成時，結算一次。 | 2 |
| `final_completion` | 整段計畫完成時，結算一次。 | 2 |

### 2.1 建立時的 default resolution **[實作]**

在 `create_parent_task_core_v1` 顯式決定，**不從 `claim_period` 推導**。
以下是**建立當下的預設值，不是永久映射**——`payout_basis` 是共同約定的一部分，
Phase 2 打開 creation path 後，同一個 cadence 仍可經正式共同版本改成
`per_milestone` / `final_completion`。

| 條件 | payout_basis | period_target_count |
|---|---|---|
| `duration_type='long_term'` ∧ `progress_model='weekly_rhythm'` | `per_period` | `weekly_frequency`，或 `cadence_days` 為準時取其長度 |
| `duration_type='long_term'` ∧ 無 weekly_rhythm，但週目標可由約定推得（`fixed_days` → 星期數） | `per_period` | `array_length(recurrence_days, 1)` |
| `duration_type='long_term'` ∧ 週目標推不出來 | **拒絕建立**，回 `PAYOUT_BASIS_NOT_IMPLEMENTED`（見 2.3） | — |
| `duration_type ∈ {one_time, recurring}` | `per_completion` | — |

兩件事必須明確：

* **新 long-term 一律不是 `per_completion`**（工單 §5）。推不出週目標時**寧可擋下建立**，
  也不退回每次發幣——那正是本工單要消滅的行為。
* 不因為走 per_period 就偷偷把 `progress_model` 蓋成 `weekly_rhythm`。
  那一欄有自己的語意與 guard，結算不該回頭改它。

**⚠️ Implementation gap（非 blocker，但要記著）：**
家長自建的長期任務目前 `progress_model` 是 NULL —— 它只在孩子提案那條路徑上被寫入。
所以上表第二列（無 weekly_rhythm 但 cadence 推得出週目標）是一條 **fallback**，
存在的理由是不讓這些任務退回 `per_completion`。

這條 fallback **不是把 NULL 重新定義成一個正式的產品語意**。
`progress_model IS NULL` 現在的意思仍然只是「這條路徑沒有寫入它」，不是「一種進度模型」。
正確的收斂是讓家長自建路徑也顯式決定 progress model，**那是另一輪的事**；
本輪不為了 payout 去覆寫或重新定義它。

### 2.2 `period_target_count` 是約定，不是現況 **[實作]**

`period_target_count` 持久化在 `tasks`，代表**建立該共同版本當下約定的次數**。

結算時只讀這一欄，**永遠不從 `weekly_frequency` / `recurrence_days` 重新推導**。
理由：cadence 欄位會被重新協商改寫，而「這一週該做幾次才算達標」是簽下去的那個數字。
兩者一旦分歧，結算必須站在約定那一邊。

### 2.3 未實作模式的建立閘門 **[實作]**

Schema 的 CHECK 允許四個值（Phase 2 不必再動一次 constraint），但 Phase 1 的
**建立與更新路徑必須明確拒絕尚未實作的模式**：

* `create_parent_task_core_v1` / task update RPC / plan version confirm path：
  解析結果或命令顯式帶入 `per_milestone` / `final_completion` →
  回 `{ ok: false, code: 'PAYOUT_BASIS_NOT_IMPLEMENTED' }`，**不建立、不寫入**。
* 命令帶入未知字串 → 同一個 typed error，不落到任何預設值。

`complete_task` 若因任何路徑仍遇到未實作的 basis → **fail closed**：
照常寫 completion（不擋孩子打卡）、`coin_earned = 0`、不 mint、不寫 settlement，
回傳 `settlement: null` 與 `payoutBasisUnsupported: true`。

Phase 2 才打開 creation path。**不會為了填滿 enum 而假造 milestone completion。**

---

## 3. Settlement truth **[實作]**

```
reward_settlements
  id                    uuid pk
  task_id               uuid not null → tasks
  child_id              uuid not null → children
  reward_basis          text not null   -- per_completion / per_period / per_milestone / final_completion
  period_start          date            -- per_period 專用（Asia/Taipei 週一）
  milestone_id          uuid            -- per_milestone 專用（Phase 2）
  goal_id               uuid            -- final_completion 專用（Phase 2）
  completion_id         uuid not null → task_completions   -- 觸發結算的那一次完成
  coin_amount           int  not null check (coin_amount > 0)
  reward_policy_version text
  transaction_id        uuid not null → transactions
  created_at            timestamptz
```

**source event 可追蹤**：任何一筆錢都指得出是哪一次 completion 觸發、屬於哪一個 period。

### 3.1 Idempotency：DB 保證，不靠 UI **[實作]**

四道 partial unique index：

| basis | invariant |
|---|---|
| `per_period` | `unique (task_id, child_id, period_start) where reward_basis='per_period'` |
| `per_completion` | `unique (completion_id) where reward_basis='per_completion'` |
| `per_milestone` | `unique (milestone_id, child_id) where reward_basis='per_milestone'` |
| `final_completion` | `unique (goal_id, child_id) where reward_basis='final_completion'` |

`complete_task` 在整個 RPC 的單一 transaction 內先 INSERT settlement、再動錢包：
撞到 `unique_violation` 就代表這個 reward event 已經結算過，
該次完成降級為「只記 progress」，**不 raise、不回滾 completion**。

重試、雙擊、併發、重新整理因此都不可能 double mint —— 錢包的變更與 unique index
在同一個 transaction 裡，第二個 writer 只能拿到 23505。

`period_start` 用的是 `complete_task` 既有的那個表達式，不另立一套：
`date_trunc('week', completed_at AT TIME ZONE 'Asia/Taipei')::date`（週一起算）。

### 3.2 新制的生效邊界 **[實作]**

新增 `tasks.payout_basis_effective_from date`，
CHECK：`payout_basis IS NULL OR payout_basis_effective_from IS NOT NULL`。

`complete_task` 的判斷：

```
v_use_new := v_task.payout_basis IS NOT NULL
             AND v_period_start >= v_task.payout_basis_effective_from
```

* 為 false → 走與今天**完全相同**的 legacy 程式路徑。
* 為 true → 走 settlement 路徑。

新建立的任務：`effective_from` = 起始日所屬 period 的 period_start（等於立即生效）。
既有任務切換：見 §7.2。

**這一欄是 technical rollout metadata，不是家庭的共同約定內容。**

它存在的唯一理由是避免 mid-period double-pay，家庭從來沒有對「哪一天開始用新結算方式」
表示過意見。因此：

* ✅ DB immutable / guarded / auditable：寫入後不可任意改，變更留稽核。
* ❌ **不進 shared-plan material diff**、不進共同版本快照的 material 欄位、
  **不因為它變動而觸發孩子重新確認**。把 rollout 時間當成 material change，
  會讓孩子收到一則他無法理解也無法決定的確認請求。
* 未來若真的需要「新的家庭約定從某日開始生效」，那是 **agreement-level effective time**，
  另建欄位（plan version 已經有 `effective_at` 這個層級的語意），
  **不與本欄混用**。兩者混用之後就再也分不出「約定從哪天開始」與「程式從哪天換算法」。

---

## 4. Habit weekly rhythm 怎麼算 **[實作]**

「本週閱讀 4 次」＝ `payout_basis='per_period'`、`period_target_count=4`、
`claim_period='week'`、`max_claims_per_period=4`。

* 第 1–3 次：寫 completion，`coin_earned = 0`，錢包不動。
* 第 4 次：寫 completion → 本週 completion 數達 4 → INSERT settlement → mint `reward_coin_amount` 一次，
  該次 completion 的 `coin_earned` 記為實際 mint 的金額（週報統計因此仍然正確）。
* 第 5 次：`max_claims_per_period` 已滿，回 `already_completed`。
  （若家庭把上限放寬到大於 target，第 5 次會寫 completion 但 settlement unique index 擋住第二次 mint。）
* 下一週：`period_start` 換一個值 → 從 0/4 重新開始，**上週的 completion 與 settlement 都不動。**

**不用 perfect streak。** 中間漏一天不清零、不刪除既有 completion、不宣稱失敗——
`count(*)` 只往上加，沒有任何路徑會把它歸零。

---

## 5. Milestone completion truth **[roadmap — Phase 2]**

現況：`task_plan_milestones` 只有 `title / target_day / sort_order`，
**資料庫裡不存在「哪一個里程碑被達成了」這件事。**

因此 Phase 1 維持 `longTermTaskProgress.ts` 既有原則：里程碑**只講規劃與時程，不講完成**，
`showProgressBar` 對新任務是字面型別 `false`，完成次數不得推導里程碑完成。

Phase 2 需要建立的最低真實資料：`milestone_id / completed_at / completed_by /
可識別 completed / reopened / revoked 的狀態 / audit trail`。
在那張表存在之前，`per_milestone` 不會有任何執行路徑（見 2.3 的建立閘門）。

同時要處理的既有斷點：legacy skill 類的 `completeSkillMilestone()` 目前直接
`throw new Error('not yet implemented (P5b)')` —— skill 類長期任務現在**沒有任何方式完成里程碑**。

---

## 6. Review / renegotiation：為什麼不會自動降幣 **[實作]**

**系統沒有任何一條路徑可以在未經共同確認的情況下改變既有幣值。** 三層保證：

1. **不存在降幣邏輯。** 全 repo 沒有 stability / 完成率 / streak → 調整 `reward_coin_amount` 的程式碼。
   唯一的 ×0.7 是前置解鎖折扣，只作用於 legacy 路徑，與穩定度無關。
2. **`reward_coin_amount` 只有兩條寫入路徑**：建立任務、以及走完整 plan version 流程的重新協商。
   review point 到達只產生 suggestion / review state，不寫 tasks。
3. **shared-plan integrity guard**（`20260816`）已經把幣值與節奏欄位列為 active shared plan 的凍結欄位。
   **`payout_basis` 與 `period_target_count` 一併加入**凍結清單、material diff、
   共同版本快照與重新協商流程 —— 它們是共同約定的內容，active shared agreement 不得 silent mutation。

   **`payout_basis_effective_from` 不在此列。** 它受 DB guard 保護且可稽核，
   但屬於 technical rollout metadata，不進 material diff、不觸發孩子重新確認（理由見 §3.2）。

Review 到期時系統只能問：「這段計畫最近已經比較穩定，要不要一起看看下一階段還需要什麼支持？」
可選項目依序是**降低支持頻率**，不是降低單價：

```
每週 checkpoint → 較長週期 checkpoint → 較大的階段 reward → final reward → progress + recognition only
```

material change 一律走既有 plan version 機制：保留舊版本 → 建立新版本 → 記錄 effective time →
必要時重新取得孩子接受 → 生效。**未確認前舊規則仍然有效。**

---

## 7. 既有任務：evidence-based migration **[結論：Phase 1 遷移零列]**

原則：**有 authoritative 共同約定證據的才遷移，沒有的一律不猜。**
無論哪一種，**都不追回、不扣除任何 historical transaction。**

證據要同時通過兩道閘門。**兩道都過才算「家庭已知情共同確認」。**

### 7.0 閘門 B：confirmation presentation（決定性，且目前不成立）

`confirmed_payout_basis` 這一欄在歷史上是由 `claim_period` 推導出來的
（`child_proposal_payout_basis()`）。**欄位存在於 immutable snapshot，不等於家庭知道自己同意了什麼。**
因此必須回去看：家長／孩子確認當下，畫面到底說了什麼。

**Audit 結果（2026-08-12，master@47a7521）：閘門 B 不成立。**

家長確認時，回饋語意的唯一一句文案是
[parentProposalPresentation.ts:120](shadow-wallet/src/screens/parent/tablet/home/parentProposalPresentation.ts#L120)：

```ts
? `建議：每次完成 ${plan.ai_suggested_coin_amount} 成長幣`
```

* 它不只是「沒有揭露 per-period」——它**明確講的是 per-completion**，
  而且對 `weekly_frequency` 的計畫也是同一句（該檔沒有任何依 cadence 分支的回饋文案）。
* 兩支測試把這句話釘住：`parentProposalPresentation.test.ts:112`、`ParentProposalSection.test.tsx:92`。
* 全 repo 沒有任何「以週結算」「達標後才發一筆」「本週達標回饋」的確認文案
  （`每次完成 / 本週達標 / 以週.*結算 / 達標後` 全掃過，命中的都是時間存摺與測試）。
* 孩子端更徹底：確認流程從頭到尾**不出現任何幣值數字**
  （`childProposal/copy.ts` 的三個選項刻意不含數字，孩子不決定幣值）。

**結論：目前沒有任何一筆既有任務具備 authoritative per-period payout agreement。**
家庭在畫面上看到並同意的是「每次完成 N 成長幣」，
那麼「每次完成就發」很可能正是他們同意的事 —— 動它就是靜默改約。

因此 **Phase 1 不執行任何自動遷移，遷移零列**：所有既有任務
（含 `confirmed_payout_basis='per_period'` 的那些）一律維持 `payout_basis = NULL`，legacy 行為原封不動。
既有任務要進新制，只能透過**正式重新協商**：新版本 + 揭露 per-period 語意的確認畫面 + 孩子重新接受。

下面 7.1 的 DB 條件仍然保留在文件裡 —— 它是閘門 A，等未來確認畫面真的揭露 per-period 語意之後，
它就是那時候的遷移條件。**在那之前它不會被寫成 migration script。**

### 7.1 閘門 A：DB 證據條件（保留備用，Phase 1 不執行）

只有同時滿足以下每一條的任務才**具備遷移的 DB 條件**（仍需通過閘門 B）：

```sql
FROM child_proposals cp
JOIN child_proposal_plan_versions v ON v.id = cp.current_plan_version_id
JOIN tasks t                        ON t.id = cp.task_id
WHERE cp.status              = 'active'
  AND cp.activated_at        IS NOT NULL
  AND v.confirmed_at         IS NOT NULL          -- 這一版真的被確認過
  AND v.superseded_at        IS NULL              -- 而且還是現行版本
  AND v.confirmed_source_task_id = t.id           -- 快照確實指回這筆任務
  AND v.confirmed_payout_basis   = 'per_period'   -- 必要但**不充分**，見 7.0 閘門 B
  AND v.confirmed_reward_policy  = 'coin_eligible'
  AND v.confirmed_coin_amount    > 0
  AND t.reward_policy            = 'coin_eligible'
  AND t.reward_coin_amount       = v.confirmed_coin_amount  -- 現況與快照一致
  AND t.payout_basis             IS NULL          -- 冪等：只寫一次
  AND <週目標可由快照推得>
```

`period_target_count` **只從快照推導，不讀 tasks 的 cadence 欄位**：

* `v.cadence_mode = 'weekly_frequency'` → `v.cadence_weekly_frequency`
* `v.cadence_mode = 'fixed_days'` → `array_length(v.cadence_days, 1)`
* 其餘（`one_time` / `plan_schedule` / NULL / 推出 0 或 >7）→ **不遷移**

不滿足任一條 → `payout_basis` 留 NULL，legacy 行為原封不動。
**「看得到舊任務、UI 曖昧、但沒有 authoritative payout agreement」一律屬於這一類。**

未來真的執行時，migration 必須冪等（`payout_basis IS NULL` 這一條就是 guard），可重複套用。

### 7.2 Mid-period transition：不得在 period 中途切換

閘門 B 不成立讓 Phase 1 沒有 bulk migration，
但**這個機制仍然必要**：既有任務經**重新協商**進新制時，風險一模一樣。

**風險：** 任務在週三切換到新制，本週前三次已按 legacy 每次 mint 過；
若新語意立刻生效，第 4 次會再形成一次 period settlement —— 本週被付兩次。

**機制：** 切換時寫入

```
payout_basis_effective_from = date_trunc('week', now() AT TIME ZONE 'Asia/Taipei')::date + 7
```

也就是**下一個 period boundary（下週一，Asia/Taipei）**。

**不會 double-pay 的證明：**

設 M 為切換時間（遷移或重新協商生效），P(M) 為 M 所屬 period 的 period_start，
`effective_from = P(M) + 7`。

1. 任一 completion 的 `period_start = P(M)` → `period_start < effective_from` → 閘門為 false
   → 走 legacy 路徑（每次完成即結算），與遷移前**逐字相同**。
2. settlement row **只在新路徑上被 INSERT**。由 (1)，period P(M) 永遠不會產生 per_period settlement。
   → 「本週舊流程已發過幣」不可能在遷移後又取得一份本週 checkpoint。∎
3. 任一 completion 的 `period_start ≥ P(M) + 7` → 走新路徑。
   該 period 的完成計數只包含該 period 自己的 rows（全部在 M 之後），
   且 `unique (task_id, child_id, period_start)` 保證該 period 至多一次 settlement。
4. 因此**沒有任何 period 會同時被兩種語意結算，也沒有任何 period 會被結算兩次。**
5. M 之前的 transactions 一列都不動（無追回、無扣除）。

**補記（backfill，最多 2 天前）的邊界：** 補記只會往回落在 `P(M)` 或更早的 period，
`period_start < effective_from` 恆成立 → 一律走 legacy 路徑，不影響證明。
補記不可能落進未來的 period。

**新建立的任務不受此機制影響**：`effective_from` = 起始日所屬 period，立即生效，
因為它從來沒有 legacy 付款歷史。

### 7.3 Demo **[待拍板 —— 觸發停止條件]**

Demo 有兩筆不同的東西，處置不同：

**(1) P0-10 Demo Story 的週節奏任務**（`supabase/verify/staging/demo_seed_story.sql`）
是 `coin_eligible` + `weekly_frequency = 3` + `coin = 10`，
它的 explanation 字串是「6-9 歲 D 類、每次約 15 分鐘，GrowBook 建議 10 幣。」——
**session pricing、per-completion 語意**。

它符合 7.1 的每一條 DB 條件，但和所有既有任務一樣**卡在閘門 B**。
要把它改成「本週達標 +10」，就是**改動 Demo Story 共同版本的語意**（從每次 10 幣變成一週 10 幣，
孩子端的可得幣值從一週 30 降為 10），
這超出「修 bug」的範圍，**需要產品拍板，不由本工單自行決定。**

**(2) 誠恩閱讀 Demo（legacy seed）**

Demo 的 `第 5 天 +10 幣` 目前是死的：那筆任務是 legacy（`reward_policy IS NULL`、`coin_override = 0`），
P0-6 的 checkpoint guard 要求 `reward_policy = 'coin_eligible'`，NULL 比較不成立。

**已定案的部分：不重新打開 legacy checkpoint mint 路徑**，legacy baseline 以 P0-6 之後的行為為準。

**待拍板的部分：** 要把它改成「本週達標 +10」，做法是**新建一筆走新制的 demo 任務**
（`payout_basis='per_period'`、`period_target_count`、`reward_coin_amount=10`），
而不是遷移那筆 legacy seed。這同樣改動了 Demo 呈現的語意，與 (1) 綁在一起一起決定。

`+10` 若採用，是 **Demo agreed fixture**，
**不是通用的 weekly pricing formula，不得被任何程式路徑或政策文件當成推導依據**（見 §8.3）。

**10 這個數字的地位見 §8.3 —— 它是 Demo 既有的 agreed fixture，不是通用 weekly pricing。**

---

## 8. 幣值政策

### 8.1 已拍板

`coin-policy.json`（`coin-policy-1.0.0`，ACTIVE，effectiveDate 2026-07-22）
有正式的 **session pricing**：C / D 各年齡段的 `bandBaseCoins` 與 `range` 都是定案數字。
它回答的是「一次投入值多少幣」（錨點註解：練琴 30 分 ≈ 15 幣）。

### 8.2 PRODUCT_POLICY_GAP：per-period 自動定價

**目前沒有正式的 per-period pricing policy。** 因此：

* ❌ **禁止** `session amount × weekly_frequency`。
* ❌ **不得**因為「反正不超過單次上限」就宣稱 weekly amount 有政策依據。
  既有的 `reward_coin_min` / `reward_coin_max` 在 per_period 任務上**只是防呆的越界檢查**，
  它不構成任何特定週結算金額的正當性，文件與程式註解都不得把它寫成 pricing policy。
* ❌ AI 不得決定 payout。ai-proxy 的建議是 session 定價，
  per_period 任務的 UI **不得**把它當成「本週達標回饋」顯示。

**Phase 1 只交付 settlement mechanism，不交付 per-period 自動定價。**
一般 coin_eligible + per_period 任務的週結算金額必須是**家庭顯式決定並寫入共同版本**的數字；
沒有合法金額時回 blocked / unpriced，不猜。
正式的 per-period pricing policy（含它自己的 range）標記為 **PRODUCT_POLICY_GAP，待產品拍板**。

### 8.3 Demo 與測試 fixture

**Demo 決策（已拍板）：Phase 1 不修改 P0-10 Demo Story 的 reward semantics。**
它維持 weekly frequency = 3、每次完成 10 幣、legacy / current shared semantics，
既不改成「本週達標 +10」，也不推導成「本週達標 +30」。

新制改由一筆專用的 staging fixture 驗證（`supabase/verify/staging/p0_payout_settlement.sql`）：
long_term + weekly_rhythm + per_period，走完 1/4 → 4/4 → 第 5 次 → 重試 → 併發 →
下一期歸零的完整序列。

**該 fixture 裡的金額純粹是測試資料，不代表 GrowBook 已有正式的 per-period pricing policy。**
任何程式路徑或政策文件都不得引用它作為推導依據。

### 8.4 其他 gap

**Long-term total reward budget**：目前 policy 沒有任何依據回答
「長期任務是否應先有 total budget 再切給 period / milestone」。
**禁止**用 `每天值 × 天數`（如 15 × 5 × 12 = 900）當作預設 budget。標記為待拍板。

---

## 9. Canon / Known Gaps

本輪確認存在、但**刻意不擴大處理**的問題。寫在這裡是為了它們不會被遺忘成「沒人發現」。

### 9.1 Shared Agreement Reward Disclosure Gap **[已知缺口]**

**孩子端從頭到尾看不到自己正在接受的共同約定裡的回饋內容。**

* 家長確認畫面唯一的回饋文案是「建議：每次完成 N 成長幣」
  （`parentProposalPresentation.ts`），而且對週節奏計畫也是同一句。
* 孩子端的確認流程**完全不出現幣值數字**（`childProposal/copy.ts` 的三個選項刻意不含數字）。

「孩子不決定幣值」是對的 —— 但它**不等於**孩子不需要知道自己正在接受什麼。
一份孩子看不到內容的共同約定，很難說是共同的。

這個缺口有兩個直接後果，一個已經發生、一個還在：

1. **已發生：** 它讓歷史上的 `confirmed_payout_basis = 'per_period'` 不能當成
   informed agreement 的證據 —— 這正是本輪遷移零列的原因（§7.0）。
2. **還在：** 新制的 per_period 任務上線後，孩子仍然只會在達標當下看到
   「+N 成長幣」，而不是在**接受計畫時**就知道「本週做滿 4 次會有 N 幣」。

處理方向（另一輪）：適齡的 reward disclosure —— 讓孩子在接受共同版本前，
用他看得懂的語言看到「什麼時候、因為什麼、會得到什麼」。
在那之前，**不要把任何既有 snapshot 當成孩子已知情的證據**。

### 9.2 progress_model = NULL 的 fallback **[implementation gap]**

見 §2.1。家長自建路徑不寫 `progress_model`，per_period 因此靠 cadence fallback 推導。
不是把 NULL 重新定義成一種進度模型，正確收斂是讓家長自建路徑也顯式決定。

### 9.3 per-period pricing **[PRODUCT_POLICY_GAP]**

見 §8.2。機制已完成，定價沒有政策來源。

### 9.4 快照的 payout basis 仍由 claim_period 推導 **[已收掉 — `20260819000000`]**

> **狀態：已解決。** 以下保留原始問題敘述作為紀錄，解法見本節末的「收掉的方式」。

`transition_child_proposal_v1`（`20260810000000`）與 P0-8M 的重寫（`20260817000000`）
仍然用 `child_proposal_payout_basis(v_task.claim_period)` 產生
`confirmed_payout_basis`，**沒有改讀 `tasks.payout_basis`**。

多數情況兩者一致（`weekly_frequency → claim_period='week' → per_period`），
但有一個組合會不一致：

| 任務 | `tasks.payout_basis` | 快照推導值 |
|---|---|---|
| `long_term` + `fixed_days` | `per_period` | `claim_period='day'` → **`per_completion`** ❌ |

也就是「每週固定三天」的長期計畫，錢包會按 per_period 結算（正確），
但共同版本快照會記成 per_completion（錯誤）。這正是本工單要消滅的那種不一致，
只是換到了快照那一側 —— **錢不會發錯，但紀錄會說謊。**

沒有在 Phase 1 一起改的原因：兩個呼叫點都在大型函式裡，而其中一個
（`20260817000000`）還沒 merge 進 master。

#### 收掉的方式（`20260819000000_snapshot_canonical_payout_basis.sql`）

**沒有**照原本的計畫去改那兩個呼叫點。原計畫是 forward-derive 兩支數百行的函式，
各自加一個 `COALESCE(...)` —— 那正是 `20260818000000` 差點把 P0-8G 的 material
欄位清單洗回舊版的做法（見該檔的獨立 guard trigger 註解）。其中一支剛驗收進
master，複製它一次等於把別人的工作包接管過來。

改成在 `child_proposal_plan_versions` 掛一支 `BEFORE INSERT OR UPDATE` trigger
（`snapshot_canonical_payout_basis_v1`）：快照**第一次成立**時，若來源任務的
`tasks.payout_basis` 非 NULL，就以它覆寫 `confirmed_payout_basis`。

| 決定 | 理由 |
|---|---|
| 掛在資料上而非改寫 RPC | 同時涵蓋 UPDATE 路徑（`transition_child_proposal_v1`）、INSERT 路徑（`accept_child_proposal_adjustment_v1`）與任何未來的寫入者，且既有函式改動面積為零 |
| 只在 `OLD.confirmed_at IS NULL` 時介入 | 既有 confirmed 版本一列都不改。**不 backfill** —— 那是已經簽下去的歷史 |
| `payout_basis IS NULL` 時不動 | legacy 任務（遷移仍是零列）繼續由 `claim_period` 推導，行為逐字不變 |
| 不讀 `payout_basis_effective_from` | 那是 technical rollout metadata，不是共同約定內容（§7.2 / 該欄位的 COMMENT） |
| 放寬快照的 CHECK 值域 | 加入 `per_milestone` / `final_completion`，保留 legacy 的 `one_time`。否則 Phase 2 打開 milestone 建立路徑的第一筆共同版本會在家長按下確認的那一刻吃 23514 |
| `20260818000000` 一個字都沒動 | 它已在 staging 實際套用並驗證過，語意保持不動 |

`child_proposal_payout_basis(claim_period)` 留著、行為不變、不 REVOKE，但 COMMENT
已改寫成 **LEGACY ONLY**：它只在 `payout_basis IS NULL` 時仍決定快照值。

**staging 驗收**（`supabase/verify/staging/p0_snapshot_payout_basis.sql`，
self-rolling-back，八個 case 全綠）。有鑑別力的是這三個 ——
它們在修好之前必然是紅的：

| Case | 任務 | `claim_period` 推導值 | canonical | 快照實得 |
|---|---|---|---|---|
| 2 | `long_term` + `fixed_days` | `per_completion` ❌ | `per_period` | `per_period` ✅ |
| 3 | `recurring`（`claim_period='week'`） | `per_period` ❌ | `per_completion` | `per_completion` ✅ |
| 8 | 同 case 2，走 P0-8M 換時段的 **INSERT** 路徑 | `per_completion` ❌ | `per_period` | `per_period` ✅ |

Case 8 是後來補的。前七個 case 走的都是 UPDATE 路徑，若就此收工，
`accept_child_proposal_adjustment_v1` 會在「孩子提出換時段、家長按下同意」
這個最日常的操作上繼續產生錯的快照，而驗收會顯示全綠。

### 9.5 per_period 快照的達標次數 **[已收掉 — `20260820000000`]**

`20260819000000` 之後，一筆 `per_period` 快照說得出「按週結算」，說不出
「講好一週幾次算達標」。**這兩個都不能代替它**：

| 欄位 | 它是什麼 | 為什麼不是達標次數 |
|---|---|---|
| `confirmed_claim_period` | 結算視窗（day / week / once） | 只說週期，不說次數 |
| `confirmed_max_claims_per_period` | 每期最多 claim 幾次 | 上限 ≠ 目標。「每週 4 次算達標、允許做 5 次」是合法設定，拿上限當目標會讓孩子端的「還差幾次」直接算錯 |

`20260820000000_shared_plan_period_target_snapshot.sql` 加上
`child_proposal_plan_versions.confirmed_period_target_count`，由
`20260819` 那支同一個 trigger 一併從 `tasks.period_target_count` 複製
（不拆第二支 trigger —— 「這一列的 payout semantics 怎麼決定」有兩個地方要對照著讀，
遲早會不同步）。

| 決定 | 理由 |
|---|---|
| legacy 不 backfill | 那些家庭確認的畫面上從來沒出現過這個數字（§7.0 gate B），寫進去等於替他們補簽 |
| `per_period` 缺 target 直接 RAISE | fail closed，不塞預設值。`tasks_period_target_scope_check` 保證正常路徑不會觸發，它擋的是繞過該 CHECK 的任務 |
| 「`per_period` ⇒ 一定有 target」**不寫成 CHECK** | 既有 legacy 快照裡就有 `per_period` + NULL target 的列（`claim_period='week'` 推導的）。直接 ADD 會在既有資料上失敗；`NOT VALID` 也不行 —— 它仍會在 UPDATE 時檢查，而 P0-8M 每次接受換時段都會 UPDATE 舊版本的 `superseded_at`，那一刻就會炸在一列與該次改動無關的歷史資料上 |
| 反方向（有 target ⇒ 必為 `per_period`）寫成 CHECK | 欄位是新加的，既有列全是 NULL，可以直接 VALIDATE |
| write-once 用獨立 trigger | 不 forward-derive `child_proposal_plan_version_guard` —— 那份清單屬於 P0-8 系列 |

staging 十個 case 全綠。針對「不得代用」最直接的兩個證據：case 1 的達標次數是
**3**（cadence）而 claim 上限是 **5**；case 5 把 claim 上限改成 **1** 之後，
達標次數仍然是 **4**。

### 9.6 `confirmedReward` 回傳值仍是推導值 **[已知缺口，本輪未處理]**

`transition_child_proposal_v1` 的 `RETURN` 裡，`confirmedReward.payoutBasis`
用的是函式內先算好的 `v_payout_basis`（`claim_period` 推導值），而**不是**
trigger 寫進資料列的 canonical 值。同一次呼叫因此可能出現：

* 資料列：`confirmed_payout_basis = 'per_period'`（正確）
* 回傳值：`payoutBasis = 'per_completion'`（`fixed_days` 的推導值，錯誤）

`confirmedReward` 也沒有 `periodTargetCount`。

**紀錄是對的，回應是錯的。**

#### merge 前的 consumer audit 補正了兩件事

**(1) 傳播範圍比原本記的廣。** 不只 `transition_child_proposal_v1` 自己的回應 ——
家長端與孩子端實際呼叫的兩支 RPC 在第一次成功時是整包轉出去的
（`20260813000000:584`、`20260815000000:737` 的
`'confirmedReward', v_transition_result -> 'confirmedReward'`），
而它們的 **idempotent replay 分支卻是從版本列讀的**（`:308` / `:441`）。

於是同一個操作**第一次的回應與重試的回應會不一樣** —— 而 idempotent replay
存在的意義正是「重試拿到跟第一次一樣的答案」。這比單一個錯值更值得修。

**(2) 但沒有任何 consumer 依賴這個值。** 逐一查過 `src/`（排除測試）：
`useParentProposals` 與 `useChildProposalReview` 只讀 `result.ok` / `result.message`；
`isConfirmedReward` 只驗形狀不看值；`submitChildProposal` 走的是
`draft → proposed`，該轉換的 `confirmedReward` 恆為 `null`。
其餘出現 `payoutBasis` 的位置（`ParentHomeTablet`、`useParentDashboard`、
`completionFeedback`、`taskActions`、`aiAgent`）都是**不同來源**，各自正確。

所以是潛在缺口而非線上錯誤，不阻擋 merge。

完整工單見 **`docs/P0_FOLLOWUP_CONFIRMED_REWARD_RESPONSE.md`**（獨立 P0 correctness
follow-up）。核心要求：`confirmedReward` 的每一個鍵都必須從已經寫下去的版本列
讀回來，不再從函式內先算好的區域變數組出來；並驗證第一次回應與 replay 逐鍵相等。

---

## 10. 明確不在本輪範圍

新 B 類幣值表、A 類發幣放寬、C/D coin policy 改動、時間儲蓄、3C、動機診斷、
自動判斷「孩子已內化」、自動降低 reward、streak gamification、排行榜／徽章、
用 AI 決定幣值、自行發明 reward budget、重新設計 GrowthPlan Drawer。
