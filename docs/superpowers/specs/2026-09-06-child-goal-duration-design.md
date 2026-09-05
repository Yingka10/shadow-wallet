# 孩子目標的期限由孩子決定（A1）

日期：2026-09-06
狀態：待實作

## 問題

「把哈利波特讀完」這種**有終點但孩子沒講天數**的目標，會同時觸發兩個症狀：
家長不能直接確認，而且確認之後建出來是「日常任務」而不是「長期挑戰」。

兩者是**同一個根因**。

### 根因鏈

`ai-proxy` 的 `resolveDurationType`
（`supabase/functions/ai-proxy/childProposalPlanDraftLogic.ts:574-582`）：

```ts
if (cadence?.mode === 'one_time') return 'one_time';
if (durationDays !== null) return 'long_term';   // 唯一一條通往 long_term 的路
if (cadence === null) return 'recurring';
return 'recurring';
```

`durationDays` 的唯一來源是 prompt 第 396 行：「如果孩子的話裡有講到期間…**沒講就給 null**」。
孩子沒說「兩週」，就一律 `recurring`。

**症狀二（日常任務）**：
`duration_type='recurring'` → confirm RPC 的 `planMode` 是 NULL →
`is_long_term = (v_duration_type = 'long_term')` = false
（`supabase/migrations/20260730000000_create_parent_task_idempotency.sql` 第 10 節）
→ `ParentTaskManagementTablet.tsx:324` 顯示「日常任務」。

**症狀一（不能直接確認）** 是一個跨層死結：

| 層 | 規則 |
|---|---|
| DB CHECK（`20260812000000_child_proposal_plan_structure.sql:81-89`） | `progress_model='weekly_rhythm'` 必須 `duration_type='long_term'` |
| Client（`src/lib/childPlanning/parentAgreement/isChildPlanDirectConfirmable.ts`） | `cadence_mode='weekly_frequency'` 必須 `progress_model='weekly_rhythm'` |

兩條合起來：`recurring` + `weekly_frequency` 的計畫，`progress_model` 在資料庫層
就不可能是 `weekly_rhythm`，於是 client 永遠判定系統欄位不齊，永遠不能直接確認。

### 補救缺口

`src/lib/childPlanning/sharedTerms/projectSharedTerms.ts:48-50` 只有在**已經是**
`long_term` 時才吃家長填的 `durationDays`。一旦判成 `recurring`，家長連事後補期限
都補不了。

### 為什麼期限現在到不了

P1 正式計畫的 `duration_type` / `duration_days` 來自
`src/lib/childPlanning/formalPlan/toChildPlanEnrichment.ts`，它照抄 P0 plan draft 的
`draft.durationType`。而那份 draft 由
`src/lib/childPlanning/formalPlan/publishChildConfirmedPlan.ts:75` 的
`buildPlanDraftInput(proposal, ageGroup)` 產生，輸入只有**孩子最初打的那段話**：

```ts
export type ChildProposalPlanDraftInput = {
  schemaVersion; ageGroup;
  childOriginalGoal; childOriginalMotivation;
  proposalSource; cadence; preferredTime; childRewardPreference;
};   // 沒有任何期限欄位
```

也就是說：規劃對話裡孩子講了什麼，**完全不影響** `durationDays`。那條鏈是拿他的
原話重新問一次 P0 模型。所以「在對話裡追問期限」這件事，答案現在沒有地方可去。

## 決策

期限走 **planning 契約**，由 RPC 決定 duration；**不動 P0 plan draft 的契約**。

這沿用 `toChildPlanEnrichment.ts` 對 `progressModel` 已經立下的分工：

> progressModel 刻意不算在這裡。P1 的正確依據是孩子確認過的 progressionKind ——
> 那份資料在 RPC 手上，不在這裡。算了再送過去，等於讓兩個地方各自推導同一個欄位。

`duration_type` / `duration_days` 完全適用同一個論證。

**被否決的替代方案**：把期限塞進 `ChildProposalPlanDraftInput`。那要 bump
`schemaVersion`、兩端鏡射宣告與 parity 測試一起改，而且會讓 P0 那條鏈開始知道
P1 的事——正好是 `toChildPlanEnrichment` 檔頭在防的方向。

### 已驗證：改寫 duration_type 不影響定價

`durationType` 在 `supabase/functions/ai-proxy/rewardEligibility.ts:25` 只出現在
輸入型別宣告，**函式本體從未讀取**。`coinPolicy.ts` 與 `coin-policy.json` 完全
沒有期間這個維度。全 ai-proxy 唯一讀 `.durationType` 的地方是 `index.ts:103`，
屬於 `analyzeTask`（家長抽屜）那條獨立的鏈。

因此 RPC 改寫 `duration_type` 不會動到 `policy_session_coin_reference`，
A1 是自我封閉的。

## 設計

### §1 規劃對話新增期限這一輪

規劃對話在進 `ready` 之前，若孩子原話沒有期間，插一輪期限。

「有沒有講期間」由**規劃模型**判斷（它本來就在讀孩子的原話），不另外做一套
deterministic 抽取——那會變成第二套 `durationDays` 解析邏輯，與 P0 那套分岔。
判斷錯的代價是多問一輪，不是產生錯誤資料：孩子仍然可以在選項裡選他原本就講過
的那個期間。

新增獨立 status `needs_duration`。**不沿用 `needs_choice`** —— 後者的選項形狀是
`{title, detail, rhythmHint}`，為「怎麼開始」設計，硬塞期限會讓兩種語意共用一個型別。

選項分兩段：

- **模型生成 2–4 個**具體期間，依目標而定（讀一本書給「兩週／一個月」，
  學游泳給「兩個月／半年」），每個帶 `days`
- **固定尾巴兩個，不由模型生成**（客戶端加，模型改不掉）：
  - 「我想自己說」→ 自由輸入
  - 「這件事沒有終點，我想一直做下去」→ `open_ended`

`ready` payload 多一欄：

```ts
goalDuration:
  | { kind: 'days'; days: number }
  | { kind: 'open_ended' }
```

設計理由：孩子看得到每一個數字才點下去，所以這**不是猜**；而「有沒有終點」由他
決定，不由模型判。這與 repo 既有立場一致——`isChildPlanDirectConfirmable.ts` 的
註解明講「缺 durationDays 就生一個 30 出來，等於家長確認了一個沒有人提過的期限」。

### §2 RPC 決定 duration

`publish_child_confirmed_plan_v1` 讀 `child_confirmed_plan.goalDuration`：

| 孩子的選擇 | duration_type | duration_days |
|---|---|---|
| `{ kind:'days', days:N }` | `long_term` | `N` |
| `{ kind:'open_ended' }` | `recurring` | `null` |

同時**停止採用** enrichment 的 `durationType` / `durationDays`。
`resolveDurationType` 不動——它繼續服務 P0 那條鏈。

### §3 解死結

`child_proposal_plan_versions_progress_model_evidence` 的值域從
「只允許 `long_term`」改成「排除 `one_time`」，讓 `recurring` + `weekly_frequency`
也能有 `weekly_rhythm`。這樣選 `open_ended` 的孩子也走得到直接確認。

⚠️ **需要原作者確認。** 該 CHECK 的註解理由是：

> 沒有這條的話，一個 one_time 的計畫也可以宣稱自己用每週節奏看進度，
> 而畫面會去算一個永遠是 0/0 的「本週」。

這個理由只涵蓋 `one_time`。`recurring` + `weekly_frequency` 明明有每週節奏可看，
卻被同一條規則擋掉，看起來是寫過頭而非刻意。但我只能證明註解沒有涵蓋 `recurring`，
不能證明當初沒有別的考量。實作前要確認。

### §4 期限邊界：1–180 天，超出擋下

`duration_days` 這一欄**已經有**一套人為輸入的驗證：家長透過共同條件設定期限時，
RPC 檢查 `v_duration_days NOT BETWEEN 1 AND 180`
（`20260828000000_parent_shared_term_proposal.sql:691`、
`20260830000000_shared_term_pending_reward_fix.sql:185`）。

採用同一組邊界，理由：孩子若能選 300 天，家長之後想調整就會被自己的 RPC 擋下來，
造成一個「建得起來但改不動」的值。

`PLAN_DRAFT_LIMITS.maxDurationDays: 365` **不採用**——那是模型輸出的理智檢查
（註解：「期間是 5000 天代表這一輪的理解整個壞掉」），不是產品邊界。

模型生成的選項也必須落在 1–180。

**超出範圍擋下並說明，不靜默收斂。** 把 200 悄悄改成 180，就是讓孩子確認一個
他沒說過的期限——與 §1 的設計理由同一條。這也與既有作法一致：
`childProposalPlanDraftLogic.ts:536` 是 `if (durationDaysGiven && durationDays === null) return null`，
拒絕而非 clamp。

### §5 舊資料：拒絕發布

已存在的 `child_confirmed_plan` 沒有 `goalDuration`。RPC 讀不到時**拒絕發布**，
要求重跑規劃。

理由：demo 前要的是一條完整正確的路徑，不是兩套行為並存。相容分支會讓
「這份計畫的期限是誰決定的」在之後永遠有兩個答案。

代價是進行中的 planning session 會被作廢，可接受——目前沒有真實使用者資料。

## 測試

- **ai-proxy contract test**：`needs_duration` 的解析與拒收（模型亂回、選項超過
  上限、`days` 超出 1–180 時退成什麼）
- **`planning_schema_version` 要不要 bump**：`child_confirmed_plan` 的形狀變了，
  且 §5 決定拒絕舊形狀——版本號是表達這件事的正確位置
- **migration test**：新舊 CHECK 值域；`recurring` + `weekly_frequency` +
  `weekly_rhythm` 必須能寫入
- **`isChildPlanDirectConfirmable`**：`recurring` + `weekly_frequency` +
  `weekly_rhythm` 的 case 要能通過 `systemFieldsComplete`
- **端到端**：`open_ended` → 日常節奏任務可直接確認；`days:42` → 長期挑戰
  （`is_long_term = true`）

## 待驗證項

- `record_child_goal_planning_round_v1` 能不能接受新的 round status
  （尚未讀該 RPC，plan 階段確認）
- `tasks` 端有沒有與 §3 平行的約束要一起改
- §3 的 CHECK 是否有註解之外的考量（需原作者確認）

## 分支

⚠️ 實作必須開在 **master** 之上。撰寫本文件時的 worktree 停在
`feat/weekly-report-growth-lines`，落後 master 64 個 commit，且完全沒有
`src/lib/childPlanning/` 這條線。
