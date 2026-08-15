# LONG_TERM_REWARD_SEMANTIC_MISMATCH

> LT-FINAL-1 §5 的 completion audit 結果。**這是 STOP。**
> 日期 2026-08-15，基準 `feat/p1-ai-goal-planning-contract` @ `1ff4a36`。
>
> 這份文件只做一件事：把「畫面上家庭同意了什麼」與「錢包實際怎麼做」
> 並排放好。**不提修法方向**，因為選哪一邊是產品決定，不是實作決定。

---

## 1. 一句話

家庭在畫面上同意的是「**完成一次給成長幣**」，
資料庫實際執行的是「**一週做滿 N 次，給一次的錢**」。

以主案例（兩週讀完一本書 · 每週 3 次 · 每次 8 幣）計：

| | 一週做 3 次，孩子拿到 |
|---|---|
| 畫面上說好的 | 24 幣 |
| 錢包實際 | 8 幣 |

不是文案差異，是**三倍的金額差**。

---

## 2. 畫面上家庭同意了什麼

### 孩子端（A4B2 的回覆卡）

`sharedTermDiff.ts:62` 的 `rewardText()`：

```ts
if (plan.reward_policy === 'coin_eligible') return '完成一次給成長幣';
```

這一行會出現在孩子的差異列裡：

```
怎麼給回饋
原本：還沒決定  →  爸媽提出：完成一次給成長幣
[ 可以，就照這樣開始 ]
```

**孩子按下去的那一刻，同意的就是這句話。**

### 家長端

- `ParentSharedTermsSheet` 的差異區塊：同一支 `rewardText()`，同一句話。
- `parentProposalPresentation.ts:192`：
  `建議：每次完成 ${ai_suggested_coin_amount} 成長幣`（標籤「GrowBook 建議」）。

兩端沒有任何一個地方出現過「每週」「達標」「本週做滿」。

---

## 3. 資料庫實際怎麼做

### 3.1 建立當下

A4A / A4B 的確認命令**不帶** `payoutBasis`，所以由 BEFORE INSERT trigger
`tasks_resolve_payout_basis_v1` 解析（20260818…:151）：

```
duration_type = 'long_term'
schedule_mode = 'weekly_frequency'
weekly_frequency = 3
  → basis = 'per_period', periodTargetCount = 3      resolve_payout_basis_v1:113
```

寫進 `tasks`：

```
payout_basis                = 'per_period'
period_target_count         = 3
payout_basis_effective_from = 起始日所屬那一週的週一
```

### 3.2 結算

`complete_task`（20260818…:595）：

```sql
IF v_task.payout_basis = 'per_period' THEN
  SELECT count(*) INTO v_period_done
    FROM task_completions
   WHERE ... date_trunc('week', completed_at AT TIME ZONE 'Asia/Taipei') = v_settle_period;
END IF;

ELSIF v_task.payout_basis = 'per_period' THEN
  v_should_settle := v_period_done >= v_task.period_target_count;
```

而金額（20260818…:551）：

```sql
v_settle_amount := v_coin_earned;   -- = tasks.reward_coin_amount
v_coin_earned   := 0;               -- 完成本身不再入帳
```

`tasks.reward_coin_amount` 是**每次（session）**的定價 —— P1 的錨點欄位
名字就寫著：`policy_session_coin_reference`。

所以：做 3 次 → 結算 1 次 → 入帳 1 次 session 的錢。

---

## 4. 最尖銳的證據：同一列上的兩欄互相矛盾

`child_proposal_plan_versions` 這一列同時有：

| 欄位 | 值 | 來源 |
|---|---|---|
| `policy_payout_type` | `'per_completion'` | A4A.1 的 canonical policy evidence，CHECK **只允許這一個值** |
| `confirmed_payout_basis` | `'per_period'` | 20260819 的 trigger 以 `tasks.payout_basis` 為準覆寫 |

**同一份共同版本，對「什麼時候給錢」這個問題給了兩個不同答案。**

A4A.1 那一欄是「家庭同意的時候，政策說這是每次完成給」；
`confirmed_payout_basis` 是「任務建立之後，錢包實際照什麼給」。
兩者在 P1 這條路徑上從來沒有對過帳。

---

## 5. 這件事之前被看見過一半

`docs/LONG_TERM_REWARD_SETTLEMENT.md §7.0`（20260818 的檔頭引用）寫著：

> 家長確認畫面上寫的是「建議：每次完成 N 成長幣」，所以歷史的
> `confirmed_payout_basis='per_period'` 不構成「家庭已知情共同確認 per-period」
> 的證據。既有任務只能經正式重新協商進新制。

也就是說：**當時已經知道畫面說的是「每次完成」**，並以此為理由讓既有任務
留在 legacy。但新任務從 20260818 起一律進新制，而那句畫面文案
**從來沒有跟著改**。所以缺口不在既有任務，在**之後建立的每一筆**。

---

## 6. 為什麼 LT-FINAL-1 到這裡停

§3 要打開的是 rhythm 的 `canCompleteToday`。打開之後第一次完成會發生：

```
孩子按「我完成了」
→ task_completions +1
→ 錢包 +0
→ 畫面（依 §14）顯示「今天做完了 ✓」
```

他同意的是「完成一次給成長幣」，他完成了一次，然後什麼都沒有。
**這一顆按鈕會把一個目前看不見的矛盾，變成孩子每天都會遇到的事。**

而且這個矛盾的解法會**反過來改寫 §3 自己的規則**：

- 若判定「per_period 是對的，文案要改」→ 「本週 3/3」是**發幣門檻**，
  §3 寫的「本週完成次數 < weekly target 才可完成」會在達標後鎖住打卡，
  等於做滿就不准再做，那顯然不對。
- 若判定「每次完成給錢是對的，payout 要改」→ 那是 payout 變更，
  §5 明文禁止在這一包做。

兩個方向都會動到本包 §3／§4／§11／§15 的規則本身，所以先把它們寫進 code
只會製造之後要拆掉的東西。

---

## 7. 目前受影響的範圍

| | 狀態 |
|---|---|
| 已建立的 A4A / A4B 長期計畫 | 資料一致（DB 內部沒有矛盾），但**與家庭同意的文字不符** |
| 錢包 / transactions | 沒有多付也沒有少付**相對於 DB 規則**；相對於家庭的理解是少付 |
| 孩子目前是否已經受影響 | **否** —— 這些計畫在孩子端根本沒有完成按鈕（P1-FINAL §Deferred ①），所以還沒有人因此少拿過幣 |
| production | 零筆（P1 從未上 production） |

**這是目前唯一一次可以在沒有任何既有家庭受影響的情況下修正它的時機。**

---

## 8. 需要決定的問題（產品，不是實作）

1. 一個「每週 3 次」的共同計畫，家庭真正同意的是每次 8 幣（週 24），
   還是每週達標 8 幣？
2. 若是前者：`resolve_payout_basis_v1` 對 long_term + weekly rhythm 的
   `per_period` 預設要不要改；既有列如何處理。
3. 若是後者：`rewardText()` 與家長卡片的「每次完成」文案要怎麼改寫，
   而且 A4B1 的協商畫面必須在**家長送出前**就講清楚（不是事後補說明）。
4. `policy_payout_type` 與 `confirmed_payout_basis` 這兩欄要怎麼對齊 ——
   目前 CHECK 讓前者只能是 `per_completion`。

以上任何一個決定之後，LT-FINAL-1 的 §3／§4／§11／§15 才能定稿。
