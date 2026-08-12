# Correction note｜`claim_period` 不是 `payout_basis`

> 狀態：correction note，Phase 1 design 的前置。
> 適用範圍：`tasks`、`child_proposal_plan_versions`、`complete_task`、ai-proxy `coinPolicy`。
> 這份文件只做一件事：**把兩個一直被混用的概念分開，並宣告從此不得互相推導。**

---

## 1. 兩個概念

### `claim_period` + `max_claims_per_period` ——「可以 claim 幾次／每期」

這是**頻率上限**，一道防重複的閘門。它回答的是：

> 這個任務，在一個 day / week / 整個生命週期裡，最多可以被記錄完成幾次？

它的語意邊界很明確：

* 它是**上限**，不是目標。`max_claims_per_period = 4` 不代表「要做滿 4 次」，只代表第 5 次會被 `already_completed` 擋掉。
* 它作用在 **completion 這一層**（`task_completions` 能不能再寫一列），與錢包無關。
* 它由 `schedule_mode` 推導：`one_time → once/1`、`weekly_frequency → week/weekly_frequency`、其餘 `→ day/1`
  （`create_parent_task_core_v1` 第 9 節）。

### `payout_basis` ——「什麼事件才結算」

這是**結算單位**，回答的是：

> 錢包餘額因為什麼事件而改變？

四個值：

| 值 | 結算事件 |
|---|---|
| `per_completion` | 每一次完成本身就是一次獨立的 reward event |
| `per_period` | 一個 period 內達成共同約定的次數時，結算一次 |
| `per_milestone` | 一個正式 milestone 被確認完成時，結算一次 |
| `final_completion` | 整段計畫完成時，結算一次 |

它作用在 **settlement 這一層**（要不要 mint、mint 幾次），與「能不能再記一次完成」無關。

---

## 2. 為什麼不能互相推導

現況把 `payout_basis` 定義成 `claim_period` 的純函式
（`child_proposal_payout_basis(p_claim_period)`，`20260810000000_child_proposal_contract_v1.sql`）：

```sql
SELECT CASE p_claim_period
  WHEN 'once' THEN 'one_time'
  WHEN 'week' THEN 'per_period'
  WHEN 'day'  THEN 'per_completion'
  ELSE NULL
END;
```

這個映射之所以看起來成立，是因為當時只有一種長期形式。把兩個維度攤開就會看到它是滿的：

|  | `payout_basis = per_completion` | `payout_basis = per_period` | `payout_basis = per_milestone` |
|---|---|---|---|
| `claim_period = day`（每天最多一次） | 每天做、每天發。**單次／短期任務**。 | 每天最多做一次，**做滿本週約定次數才發**。← 現況推導不出來 | 每天最多練一次，**達成階段才發**。← 現況推導不出來 |
| `claim_period = week` + max 4（每週最多四次） | 每週最多做四次，**每次都發**。← 這就是現在正在發生的 bug | 每週最多做四次，**滿 4 次結算一次** | 每週最多練四次，**達成階段才發** |
| `claim_period = once` | 只能做一次，做完就發 | 無意義 | 只能做一次，那一次就是 final |

同一格 `claim_period` 對到三種不同的結算行為，**所以它推導不出 payout basis**。

反向也不行：`per_period` 沒有規定「一個 period 內最多能記幾次完成」。工單 §5 明確要求「第 5 次完成可以留下額外投入紀錄」——
那正是 `claim_period` 放寬、而 `payout_basis` 不變的情況。

---

## 3. 這條錯誤推導現在造成什麼

一個「每週閱讀 4 次」的成長計畫：

* `schedule_mode = 'weekly_frequency'`、`weekly_frequency = 4`
* → `claim_period = 'week'`、`max_claims_per_period = 4`
* → 共同版本快照 `confirmed_payout_basis = 'per_period'`（看起來對）
* 但 `complete_task` **完全不讀 payout basis**（它不在 SELECT 清單裡），只認 `reward_policy = 'coin_eligible'` → 每次完成 mint `reward_coin_amount`
* → 本週實際 mint **4 次**

也就是：**共同版本上寫著「以週為結算單位」，錢包按「每次完成」發。**
家長在共同版本上看到的字，與孩子錢包實際發生的事，是兩回事。

---

## 4. 從此的規則

1. **`claim_period` 只負責頻率上限**，只影響 `task_completions` 能不能再寫一列。
2. **`payout_basis` 只負責結算事件**，只影響 settlement 與錢包。
3. **兩者不得互相推導，也不得互為預設值。** 新任務兩個都要顯式決定並各自持久化。
   * 同理，`max_claims_per_period`（每期 claim 上限）**不得**當成 `period_target_count`（達標次數）。上限與目標會不一樣：「每週 4 次算達標、允許做 5 次」是合法設定。共同版本快照自 `20260820000000` 起有自己的 `confirmed_period_target_count`，不從任何 claim 欄位推導。
4. `child_proposal_payout_basis(claim_period)` **不再是 canonical truth**。**已落地**：
   * `20260818000000`：`tasks.payout_basis` 成為 canonical。
   * `20260819000000`：快照改以 `tasks.payout_basis` 為準。做法不是改那兩個呼叫點（`20260810000000` / `20260817000000` 各自都在數百行的函式裡，其中一支剛驗收進 master），而是在 `child_proposal_plan_versions` 掛 `snapshot_canonical_payout_basis_v1` trigger，在快照第一次成立時覆寫。兩條寫入路徑（UPDATE 與 INSERT）都涵蓋，既有函式一個字都沒動。
   * 函式本身**沒有刪除** —— 它被既有 plan version 的歷史快照依賴，刪掉會讓舊版本回填不出來。COMMENT 已改寫為 **LEGACY ONLY**，只在 `tasks.payout_basis IS NULL` 時仍決定快照值。
5. 詞彙統一為 `per_completion` / `per_period` / `per_milestone` / `final_completion`。
   * ai-proxy `coinPolicy.ts` 目前用的是 `per_session`，**它指的是 `per_completion` 的舊名**，Phase 1 一併對齊。
   * `child_proposal_plan_versions.confirmed_payout_basis` 的值域已由 `20260819000000` 放寬為 `per_completion` / `per_period` / `per_milestone` / `final_completion` / `one_time`。`one_time` 是 `final_completion` 的舊名，**保留而不改寫** —— 既有列還在用它，改寫等於竄改已簽下的快照。新寫入不會再產生 `one_time`（canonical 值域沒有這個值）。

---

## 5. 一個必須分開講的東西：pricing

**「什麼時候發」與「發多少」是兩件事，本文件只處理前者。**

`coin-policy.json`（`coin-policy-1.0.0`，ACTIVE，`effectiveDate: 2026-07-22`）已有 C/D 各年齡段的正式數字。
但要說清楚它是什麼：

> 它是**一次投入（session）的定價**：時間分級 band → baseCoins → 難度加減 → range clamp。
> 錨點註解自己寫得很明白：「練琴 30 分 ≈ 15 幣」——**那是一次 30 分鐘的練習值多少**。

因此：

* ✅ 它可以回答「這個任務做一次值多少」。
* ❌ 它**回答不了**「本週做滿 4 次，達標回饋應該是多少」。
* ❌ **禁止** `單次幣值 × weekly_frequency`（15 × 4 = 60）。那不是政策推導，是把一個沒被定義的數字算出來，而且會讓 per-period 的總支出直接等於 per-completion —— 等於這次修改對錢包毫無效果。

**結論：per-period 的「自動定價」能力標記為 `PRODUCT_POLICY_GAP`。**

Phase 1 不自動計算 period reward。金額必須是**家庭顯式決定並寫入共同版本**的數字，
沒有合法金額時回 `unpriced` / blocked，不猜。

一併講清楚一件容易被拿來當擋箭牌的事：既有的 `reward_coin_min` / `reward_coin_max`
是 session 定價推出來的，用在 per_period 任務上**只是防呆的越界檢查**。
「反正不超過單次上限」**不構成**任何特定週結算金額的政策依據——
程式註解與文件都不得把它寫成 pricing policy。正式的 per-period pricing（含它自己的 range）待產品拍板。

---

## 附錄：本文件修正的一項 audit 錯誤

Phase 0 audit 曾回報「`coin-policy.json` 的 `bandBaseCoins` 全是 null，所以 Phase 1 是 unpriced」。**這是錯的。**

錯誤來源：`coinPolicy.ts` 檔頭第 5 行的註解仍停在定案前的狀態——

```
⚠️ coin-policy.json 內所有 bandBaseCoins 目前為 null（placeholder，待團隊定案）。
```

而數字早在 `27d5228 feat: coin-policy 數字定案（v1.0.0）` 就已寫入，`_meta.status` 也已是 `ACTIVE — 已定案（首版）`。
repo 內只有一份 `coin-policy.json`，沒有第二份副本。

該註解在 Phase 1 一併修正，避免下一個人重複踩同一個坑。
`calcCoins` 的 `unpriced` 分支本身是對的（防禦未來新增 band），保留。
