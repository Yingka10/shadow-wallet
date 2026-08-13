# P0 correctness follow-up｜`confirmedReward` 回應必須讀回持久化的快照

> **狀態：已完成 —— `20260821000000_canonical_confirmed_reward.sql`。**
> 實作與驗收見本文件 §5。以下 §1–§4 保留原始工單內容。
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

---

## 5. 實作結果（`20260821000000_canonical_confirmed_reward.sql`）

### 5.1 範圍比 §4 預估的大一支

§4 只點名 `transition_child_proposal_v1`，並說「`20260813` / `20260815` 不必再改」。
**那是錯的。** 它們的 **replay 分支**是各自逐欄手寫 JSON 的，不會因為上游修好
而長出 `periodTargetCount` —— 於是「第一次有這個鍵、replay 沒有」，違反本工單的
核心要求。所以實際 forward-derive 了三支：

| 函式 | 來源 | 改動 |
|---|---|---|
| `transition_child_proposal_v1` | `20260810` | 回應改讀版本列 |
| `confirm_child_proposal_v1` | `20260813` | replay 分支改讀版本列 |
| `accept_child_proposal_plan_v1` | `20260815` | replay 分支改讀版本列 |

三支在動之前都重新確認過「至今只定義過一次」（§4 的風險前提），
並由 contract test 持續釘住 —— 哪天有人在別的 migration 再定義一次，測試會先紅。

### 5.2 形狀只留一份

`child_proposal_confirmed_reward_v1(plan_version_id) RETURNS jsonb` 是回應形狀的
**唯一來源**，四個組裝點全部改成呼叫它。

三份手寫的形狀正是這個 bug 的成因：其中一份加了欄位、另外兩份沒加。
形狀只有一份，就不可能再分岔 —— 這比「這次把三份都補上」更重要。

### 5.3 函式原文不手抄

三支加起來約 1000 行。手抄是本輪最大的風險來源（`20260818` 差點用衍生法把
P0-8G 的欄位清單洗回舊版），所以改由腳本從原始 migration 讀出原文、只做三處
**精確字串替換**，任何一處沒命中就中止；產生時另外檢查衍生結果仍帶著
`assert_child_in_caller_family`、狀態機檢查與快照複製那幾道防線。

contract test 進一步逐行 diff 衍生結果與原始定義，斷言**差異只落在
`confirmedReward` 那幾行**。

### 5.4 驗收（staging 全綠）

`supabase/verify/staging/p0_canonical_confirmed_reward.sql`，self-rolling-back。
CASE A / B 走真正的家長直接確認路徑 `confirm_child_proposal_v1`，**各呼叫兩次**
（第一次成功 + idempotent replay）：

| Case | 計畫 | `claim_period` 推導值 | canonical | 第一次 = replay = 快照 |
|---|---|---|---|---|
| A | `long_term` + `fixed_days` | `per_completion` ❌ | `per_period`，target 3 | ✅ |
| B | `one_time` | `one_time` ❌ | `per_completion`，target null | ✅ |
| C | legacy（`payout_basis IS NULL`） | `per_period` | 維持推導值，target null | ✅ |
| D | 尚未確認的版本 | — | helper 回 `NULL` | ✅ |

CASE A 另外斷言 `periodTargetCount`（3）**不等於** `maxClaimsPerPeriod`，
否則「有沒有混用這兩個數字」根本驗不出來。

> CASE B 原本想用 `recurring` + `weekly_frequency`（推導值 `per_period`，方向相反）。
> 做不到：直接確認路徑要求 `weekly_frequency` 必須配 `progress_model =
> 'weekly_rhythm'`，而 `weekly_rhythm` 只允許 `long_term` —— 那個組合進不了這條
> 路徑。改用 `one_time`，推導值 `one_time` vs canonical `per_completion`，
> 同樣有鑑別力而且是合法計畫。

回歸：`p0_snapshot_payout_basis`（10 cases）、`p0_payout_settlement`、
`p0_6_reward_guard` 全部 VERIFY PASS。

### 5.5 TS 端

`ChildProposalConfirmedReward` 新增 `periodTargetCount: number | null`。

`isConfirmedReward` 的驗證**刻意不寫成**「`payoutBasis === 'per_period'` 就一定要有值」
（§4.5 原本這樣寫）：legacy 快照的 `per_period` 是從 `claim_period` 推導出來的，
那些家庭從來沒有確認過任何次數，它們的 `null` 是正確答案。照 §4.5 寫會讓
**既有共同計畫的重試整個失敗**。改成「有值就必須是正整數」。
