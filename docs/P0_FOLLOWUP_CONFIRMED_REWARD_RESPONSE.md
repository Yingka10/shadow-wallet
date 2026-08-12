# P0 correctness follow-up｜`confirmedReward` 回應必須讀回持久化的快照

> 獨立工單。**不阻擋** `feat/p0-long-term-reward-settlement` 的 merge
> （consumer audit clean，見 §3），但它是 correctness 缺口，不是 roadmap 項目。
>
> 來源：`docs/LONG_TERM_REWARD_SETTLEMENT.md` §9.6。

---

## 1. 問題

`20260819000000` / `20260820000000` 之後，共同版本快照的 payout semantics
（`confirmed_payout_basis`、`confirmed_period_target_count`）由 trigger 以
`tasks` 為 canonical truth 寫進 `child_proposal_plan_versions`。

但 `transition_child_proposal_v1`（`20260810000000`）的 `RETURN` 仍然用函式內
先算好的區域變數：

```sql
-- 20260810000000_child_proposal_contract_v1.sql:1823
v_payout_basis := public.child_proposal_payout_basis(v_task.claim_period);
...
-- :1936  ← 回傳的是推導值，不是 trigger 寫進資料列的 canonical 值
'payoutBasis', v_payout_basis,
```

**紀錄是對的，回應是錯的。** 一筆 `long_term` + `fixed_days` 的計畫：

| | 值 | 對不對 |
|---|---|---|
| 資料列 `confirmed_payout_basis` | `per_period` | ✅ |
| 回應 `confirmedReward.payoutBasis` | `per_completion`（`claim_period='day'` 推導） | ❌ |

回應也沒有 `periodTargetCount`。

## 2. 傳播範圍（比原本記的更廣）

不只 `transition_child_proposal_v1` 自己的回應。家長端與孩子端實際呼叫的
兩支 RPC 在**第一次成功**時是直接把它整包轉出去的：

| 位置 | 寫法 | 結果 |
|---|---|---|
| `20260813000000:584` `confirm_child_proposal_v1` | `'confirmedReward', v_transition_result -> 'confirmedReward'` | 推導值 ❌ |
| `20260815000000:737` `accept_child_proposal_review_v1` | 同上 | 推導值 ❌ |
| `20260813000000:308` 同一支的 **idempotent replay** 分支 | `v_parent_plan.confirmed_payout_basis` | canonical ✅ |
| `20260815000000:441` 同一支的 **idempotent replay** 分支 | `v_plan.confirmed_payout_basis` | canonical ✅ |

於是同一個操作**第一次的回應與重試的回應會不一樣** —— 而 idempotent replay
存在的意義就是「重試拿到跟第一次一樣的答案」。這一點比單一個錯值更值得修。

## 3. 為什麼不阻擋 merge（consumer audit 結果）

搜過 `src/`（排除測試）全部 `confirmedReward` / `payoutBasis` /
`periodTargetCount` 的出現位置：

| 位置 | 來源 | 判定 |
|---|---|---|
| `useParentProposals.ts:85` `confirmDirect` | 只讀 `result.ok` / `result.message` | 不依賴 ✅ |
| `useChildProposalReview.ts:70` `acceptReview` | 同上 | 不依賴 ✅ |
| `childProposalService.ts:209` `isConfirmedReward` | 只驗**形狀**（`typeof === 'string'`），不看值 | 不依賴 ✅ |
| `submitChildProposal.ts:85` `service.transition` | 只做 `draft → proposed`，該轉換的 `confirmedReward` 恆為 `null` | 不依賴 ✅ |
| `ParentHomeTablet.tsx:304` / `useParentDashboard.ts:97` | `tasks.payout_basis` 直接讀資料表 | **不同來源**，正確 ✅ |
| `completionFeedback.ts:32` / `taskActions.ts:383` | `complete_task` 的回傳 | **不同來源**，正確 ✅ |
| `aiAgent.ts:136` `payout.payoutBasis` | `ai-proxy` 的 `analyzeTask`，建立任務前的結構化理解 | **不同來源**，與快照無關 ✅ |

**沒有任何 UI 或 business logic 依賴這個值。** 目前是潛在缺口，不是線上錯誤。

## 4. 要做什麼

`confirmedReward` 的每一個鍵都必須從**已經寫下去的版本列**讀回來，
而不是從函式內先算好的區域變數組出來。

1. 新增一支 forward migration（**不改** `20260818` / `20260819` / `20260820`）。
2. `transition_child_proposal_v1`：把 `RETURN` 之前的那段 `UPDATE
   child_proposal_plan_versions ... WHERE id = v_current_ver` 改成
   `... RETURNING` 到一個 `%ROWTYPE`，或 UPDATE 之後重讀一次該列，
   再用那一列組 `confirmedReward`。這樣 trigger 寫了什麼就回什麼。
3. `confirmedReward` 增加 `periodTargetCount`（來自
   `confirmed_period_target_count`）。
4. `20260813` / `20260815` 的第一次成功路徑不必再改 —— 它們是轉出上游的值，
   上游修好就一起對了。但要**驗證**第一次與 replay 的回應完全一致。
5. TS 端：`ChildProposalConfirmedReward` 加 `periodTargetCount: number | null`；
   `isConfirmedReward` 依 `payoutBasis === 'per_period'` 檢查它的存在性。

### 驗收

* `long_term` + `fixed_days` 的直接確認 → 回應 `payoutBasis = 'per_period'`
  （目前是 `per_completion`）。
* `recurring` + `claim_period='week'` → 回應 `payoutBasis = 'per_completion'`。
* per_period → 回應帶 `periodTargetCount`，且等於資料列的
  `confirmed_period_target_count`。
* **第一次成功的回應與 idempotent replay 的回應逐鍵相等。**
* legacy 任務（`tasks.payout_basis IS NULL`）的回應逐字不變。
* 既有 confirmed 版本一列都不改（不 backfill）。

### 風險

唯一的修法是 forward-derive 整支 `transition_child_proposal_v1`（約 230 行）。
該函式自 `20260810000000` 起**只定義過一次**、之後沒有任何 migration 動過它
（已用 `CREATE OR REPLACE FUNCTION public.transition_child_proposal_v1` 全 migration
搜尋確認），所以衍生風險比 `20260817` 那次低得多 —— 但仍是一次整段複製。
動它之前先重新確認一次「至今仍只定義過一次」，那是這個判斷的全部前提。
