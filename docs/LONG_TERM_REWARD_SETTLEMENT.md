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
既有任務遷移：見 §7.2。

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
   **`payout_basis`、`period_target_count`、`payout_basis_effective_from` 一併加入**
   凍結清單、material diff、共同版本快照與重新協商流程 ——
   它們現在是共同約定的一部分，active shared agreement 不得 silent mutation。

Review 到期時系統只能問：「這段計畫最近已經比較穩定，要不要一起看看下一階段還需要什麼支持？」
可選項目依序是**降低支持頻率**，不是降低單價：

```
每週 checkpoint → 較長週期 checkpoint → 較大的階段 reward → final reward → progress + recognition only
```

material change 一律走既有 plan version 機制：保留舊版本 → 建立新版本 → 記錄 effective time →
必要時重新取得孩子接受 → 生效。**未確認前舊規則仍然有效。**

---

## 7. 既有任務：evidence-based migration **[實作]**

原則：**有 authoritative 共同約定證據的才遷移，沒有的一律不猜。**
無論哪一種，**都不追回、不扣除任何 historical transaction。**

### 7.1 遷移條件

只有同時滿足以下每一條的任務才會被寫入 `payout_basis = 'per_period'`：

```sql
FROM child_proposals cp
JOIN child_proposal_plan_versions v ON v.id = cp.current_plan_version_id
JOIN tasks t                        ON t.id = cp.task_id
WHERE cp.status              = 'active'
  AND cp.activated_at        IS NOT NULL
  AND v.confirmed_at         IS NOT NULL          -- 這一版真的被確認過
  AND v.superseded_at        IS NULL              -- 而且還是現行版本
  AND v.confirmed_source_task_id = t.id           -- 快照確實指回這筆任務
  AND v.confirmed_payout_basis   = 'per_period'   -- ← 唯一的 authoritative 證據
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

理由：`confirmed_payout_basis = 'per_period'` 是家庭確認過的快照，
它明說了「以週為結算單位」，而錢包卻按每次完成發 —— 那是 implementation bug，該修。
沒有這份快照時，「每完成一次得到 X 幣」可能才是家庭實際同意的事，動它就是 §14 禁止的靜默改約。

migration 冪等（`payout_basis IS NULL` 這一條就是 guard），可重複套用。

### 7.2 Mid-period transition：不得在 period 中途切換

**風險：** 任務在週三遷移，本週前三次已按 legacy 每次 mint 過；
若新語意立刻生效，第 4 次會再形成一次 period settlement —— 本週被付兩次。

**機制：** 遷移時寫入

```
payout_basis_effective_from = date_trunc('week', now() AT TIME ZONE 'Asia/Taipei')::date + 7
```

也就是**下一個 period boundary（下週一，Asia/Taipei）**。

**不會 double-pay 的證明：**

設 M 為 migration 時間，P(M) 為 M 所屬 period 的 period_start，`effective_from = P(M) + 7`。

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

### 7.3 誠恩閱讀 Demo

Demo 的 `第 5 天 +10 幣` 目前是死的：那筆任務是 legacy（`reward_policy IS NULL`、`coin_override = 0`），
P0-6 的 checkpoint guard 要求 `reward_policy = 'coin_eligible'`，NULL 比較不成立。

**處置：不重新打開 legacy checkpoint mint 路徑。** 改為把 demo seed / story 對齊新制：
以 per_period settlement 呈現「本週達標 +10」，並加入 staging acceptance 驗證。
Legacy baseline 以 P0-6 之後的行為為準。

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

### 8.3 Demo fixture

誠恩 Demo 的 `+10` 沿用該 story 既有的 agreed 金額，作為 **Demo fixture** 使用。
**它不是通用的 weekly pricing formula，不得被任何程式路徑或政策文件當成推導依據。**

### 8.4 其他 gap

**Long-term total reward budget**：目前 policy 沒有任何依據回答
「長期任務是否應先有 total budget 再切給 period / milestone」。
**禁止**用 `每天值 × 天數`（如 15 × 5 × 12 = 900）當作預設 budget。標記為待拍板。

---

## 9. 明確不在本輪範圍

新 B 類幣值表、A 類發幣放寬、C/D coin policy 改動、時間儲蓄、3C、動機診斷、
自動判斷「孩子已內化」、自動降低 reward、streak gamification、排行榜／徽章、
用 AI 決定幣值、自行發明 reward budget、重新設計 GrowthPlan Drawer。
