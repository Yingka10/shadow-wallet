# LongTerm Detail — Final IA（P1-FINAL 產出，不含實作）

> 這份文件回答一個問題：**一份剛剛談定的共同計畫，在孩子端應該長什麼樣、
> 每一格字從哪裡來。** 它是下一包（LongTerm Detail Final UI）的輸入，
> 這一包不動 `LongTermGoalDetailView` 的版面。
>
> 時間：2026-08-15。基準：`feat/p1-ai-goal-planning-contract` @ P1-A4B2 之後。

---

## 0. 先講結論：現在它是壞的，而且壞在同一個地方

> **⚠️ 更正（2026-08-15，P1-REWARD-FIX 期間發現）。**
>
> 這一節初版說「一份走完 A4A 或 A4B 的長期計畫」會落成階段制而且沒有
> 完成按鈕。**主線不是這樣。** `create_parent_task_v1` 在 child_proposal
> ＋ `progress_model = 'weekly_rhythm'` 的分支會把 `long_term_type` 與
> `long_term_goals.goal_type` 改寫成 `'habit'`（20260818…:826），staging
> 實際資料也是 habit。所以 D 類 ＋ weekly_frequency 的主線計畫
> `isSkill = false`、`canCompleteToday` 成立、進度走完成次數。
>
> 下面描述的死路仍然真實，但範圍是**其他**的長期 child proposal：
> `progress_model` 為 null 時（例如非 D 類的長期計畫），`long_term_type`
> 留在 `'skill'`，於是整套 skill 推導與「沒有完成按鈕」就會發生。
>
> §1–§6 的 mapping、hierarchy 與 precedence **不受影響** —— 它們本來就
> 主張不要用 `goal_type` 判進度，而這次更正正好又是一個例子：
> `goal_type` 現在同時被兩條路徑寫，語意更不可靠了。

一份走完 A4A 或 A4B 的長期計畫（`progress_model` 為 null 的那一類），
在孩子端會變成這樣：

| 畫面上寫什麼 | 為什麼 |
|---|---|
| 第 1 階段／共 1 階段 | `goal.level_count` 是 null，`Math.max(null ?? 1, 1)` |
| 這個階段由家長確認完成 | `isSkill` 分支的固定字串 |
| 依自己的節奏練習 | `isSkill` 蓋掉了「本週 X／Y」 |
| **沒有任何可以按的完成按鈕** | `canCompleteToday` 只給 `habit` / `responsibility` |

家庭花了兩輪談定「一週三次、睡前、每次 15 分鐘」，孩子打開來看到的是
一個他沒規劃過的階段制，而且**做完了沒有地方記**。

長期任務在孩子端只從 `HomeScreen` 的 GoalCard 進得去
（[useTodayTasks.ts:108](../src/hooks/useTodayTasks.ts#L108) 把 `is_long_term`
單獨分桶，不進「今天要做的」），所以這不是「少一個入口」，
是**這份計畫成立之後沒有任何一個地方可以完成**。

### 根因只有一條

`goal_type` 被當成「這件事怎麼往前走」的判準，但它從來不是。

```
duration_type = 'long_term'
  → planMode = 'growth_plan'          buildDirectConfirmCommand.ts:115
  → long_term_type = 'skill'          20260804…:859
  → goal_type = 'skill'               20260804…:952
  → isSkill = true                    longTermGoalPresentation.ts:525

  ⚠️ 但 progress_model = 'weekly_rhythm' 時，20260818…:826 會把上面兩個
     改寫成 'habit'。所以同一個欄位由兩條路徑寫，而且第二條只在
     主線成立 —— 這正是不能拿 goal_type 判進度的理由。
```

而 `planMode` 之所以是 `growth_plan`，是因為**另外兩個模式都不收可發幣的
長期任務**：`short_support` 硬性要求 `reward = 'progress_only'`
（20260804…:681），`family_role` 要求 B 類 ＋ family_contribution。
換句話說 `'skill'` 是「唯一收得下這種任務的模式」留下的副作用，
不是任何人對這份計畫的判斷。

**所以「把 planMode 改成 short_support」不是修法** —— 那會讓所有
可發幣的長期共同計畫在建立時就被 RPC 拒絕。

### 真正的證據一直都在

`create_parent_task_v1` 收到並寫進 `tasks` 的欄位裡已經有正確答案：

```
tasks.progress_model = 'weekly_rhythm'   ← 由 P0 契約推導，證據不足時是 null
tasks.next_step      = '今晚睡前讀 15 分鐘'
tasks.schedule_mode  = 'weekly_frequency' / 'fixed_days'
tasks.weekly_frequency
```

只是沒有人讀它。這就是下一包要做的事。

---

## 1. Final data mapping

一格一格講。**「來源」欄裡沒有出現的東西，就是畫面上不可以寫的東西。**

### 1.1 標題與身分

| 畫面 | canonical 來源 | 備援 | 讀不到時 |
|---|---|---|---|
| 計畫名稱 | `tasks.name` | — | 不顯示畫面（載入失敗） |
| 這是什麼類型 | `tasks.category` A/B/C/D | — | 不顯示分類列 |
| 孩子想達成什麼 | `child_proposal_plan_versions.child_confirmed_plan.desiredOutcome` | `tasks.original_expectation` | 留白 |
| 他打算怎麼做 | `child_confirmed_plan.actionPlanSummary` | — | 留白 |

> ⚠️ `task.name.includes('閱讀')` 必須整條刪掉。它是內容嗅探 ——
> 一個叫「閱讀習慣」的家長自訂任務會被誤判，一個叫「每天練琴 15 分鐘」
> 的閱讀計畫則不會被認出來。同樣的錯在 routing 上已經修過兩次。

### 1.2 節奏與時段（家庭談定的部分）

| 畫面 | canonical 來源 | 備註 |
|---|---|---|
| 一週幾次 | `tasks.weekly_frequency`（`schedule_mode='weekly_frequency'`） | |
| 固定星期 | `long_term_goals.active_days` → `tasks.recurrence_days` | 兩者皆 null 時**不要**回退成週一到週五或整週（現況會，見 [longTermGoalPresentation.ts:241](../src/screens/child/longTermGoalPresentation.ts#L241)）—— 那是憑空發明的行程表 |
| 時段 | `task_completions.planned_time_window`（今天那筆）→ `long_term_goals.preferred_time_window` → `tasks.preferred_time` | 三段式已在 [LongTermDetailScreen.tsx:154](../src/screens/child/LongTermDetailScreen.tsx#L154) |
| 每次大約多久 | `tasks.estimated_minutes` | **不是** `base_time_min` |
| 計畫期間 | `long_term_goals.started_at` / `end_date` | |

> ⚠️ `long_term_goals.preferred_time_window` 在**建立時沒有被同步**
> （見 `FOLLOW_UP_PREFERRED_TIME_WINDOW_CREATION_MIRROR`）。第三段
> fallback 是為此而存在的窄修補，下一包如果補了 mirror，那一段才能刪。

### 1.3 進度

| 畫面 | canonical 來源 |
|---|---|
| 本週完成幾次 | `task_completions`（本週、`status='completed'`） |
| 這是第幾週 | `started_at` → now，對照 `end_date` |
| 今天要做什麼 | `tasks.next_step`（canonical）→ `child_confirmed_plan.nextAction.text` |
| 怎樣算完成一次 | `tasks.completion_description` |

### 1.4 回饋（只讀，不重算）

| 畫面 | canonical 來源 |
|---|---|
| 完成一次有多少 | `child_proposal_plan_versions.confirmed_coin_amount` |
| 什麼時候給 | `confirmed_payout_basis` ＋ `confirmed_claim_period` |
| 政策版本 | `confirmed_reward_policy_version` |

> ⚠️ **不要讀 `tasks.reward_coin_amount` 當畫面上的數字。** 那是現況，
> 會被家長之後的調整改掉；`confirmed_*` 是「當初講好的」。
> 兩者不一致本身是一件要講出來的事，不是拿新的蓋掉舊的。
> 也**不要**讀 `ai_suggested_coin_amount`，那從來不是最終值。

### 1.5 這份計畫是誰的（新增，決定整個畫面的語氣）

| 判準 | 來源 |
|---|---|
| 是不是孩子提出的 | `tasks.creation_source = 'child_proposal'` |
| 是哪一份提案 | `child_proposals.task_id = tasks.id` |
| 孩子確認過的原始計畫 | 該提案 lineage 的根 → `child_confirmed_plan` |

孩子自己規劃的計畫，畫面上第一句話是**他自己寫的那句**，
不是 GrowBook 幫他重寫的標題。

---

## 2. Final information hierarchy

一個殼，五段，順序固定。progression 只換第三段的**內部**，不換段落順序 ——
換順序等於每一種計畫都是一個新畫面，而它們其實是同一件事。

```
① 這是什麼          計畫名稱 · 類型 · 期間
                    （孩子提出的計畫：他自己寫的那句話放在最上面）

② 今天              今天要做什麼（next_step）
                    時段 · 每次大約多久
                    ▸ 可以做 → 完成按鈕
                    ▸ 今天不用做 → 說清楚為什麼（不是空白）
                    ▸ 做完了 → 今天的紀錄 ＋ 補一句話

③ 進度              ← 只有這一段隨 progression 改變（見 §3）

④ 說好的回饋        confirmed_* 快照，只讀
                    現況與當初不一致時明說，不靜靜換數字

⑤ 更多              最近的紀錄 · 計畫細節 · 想調整
```

三條硬規則：

1. **② 永遠有一個明確狀態。** 「今天不用做」也是狀態，空白不是。
2. **④ 不重算。** 這一段是歷史事實。
3. **⑤ 的「想調整」走既有的 shared-plan RPC**，不在這個畫面直接改欄位 ——
   同一條理由和 A4B2 §13 是同一條：改動要對方看過才算數。

---

## 3. Progression-specific rendering rules

### 3.1 判準（precedence 是這份文件最重要的一段）

```
1. tasks.progress_model = 'weekly_rhythm'  → rhythm
2. tasks.schedule_mode = 'weekly_frequency' → rhythm
3. goal.level_count > 0 或 level_definitions 非空 → staged
4. goal.target_value > 0 且 value_unit 有值 → accumulation
5. 有固定星期證據 → fixed_days
6. 以上都沒有 → null（不猜）
```

**`goal.goal_type` 不在這個列表裡。** 它只決定畫面上那個分類詞怎麼講
（`responsibility` → 「家庭」），不決定進度怎麼算。

> ⚠️ WP2 的 `getProgression` 目前是 `if (goal.goal_type === 'skill')
> return 'staged_skill'` 放在**第一條**。照那個順序，所有共同計畫
> 仍然會被判成階段制 —— 合併 WP2 不會修好這件事，反而會把它帶進新殼。
> 這一條是下一包的第一個改動。

### 3.2 各 progression 的第三段長什麼樣

| progression | 進度主體 | 完成條件寫法 | 誰按完成 | 里程碑 |
|---|---|---|---|---|
| `rhythm` | 本週 X／Y ＋ 這是第幾週 | 「N 週計畫 · 每週 X 次」 | **孩子** | 只列真的存在的 checkpoint |
| `fixed_days` | 這週七天的狀態 | 「每週 M 天」 | **孩子** | 同上 |
| `staged` | 第 X／Y 階段 | 「完成 Y 個階段」 | 家長確認 | `level_definitions` |
| `accumulation` | 已累積 X／Y 單位 | 「累積 Y 單位」 | 家長確認 | `checkpoint_rewards` |
| `null` | 不畫進度條 | 「還沒安排週期」 | 不可完成 | 無 |

四條規則：

1. **rhythm 沒有「總共要做 N 次」的終點。** 兩週的節奏計畫做滿 14 次不代表
   完成，做了 9 次也不是失敗 —— 它的終點是日期，不是次數。
   現在的 `hasReachedTarget = current >= target` 會在第 14 次時把計畫標成
   completed，那是錯的（WP2 的 `terminalTarget = null` 已經處理，可直接沿用）。
2. **不要生成不存在的里程碑。** 目前 `buildRhythmMilestones` 會憑空補一條
   「N 週後一起回顧」。沒有人約定過那件事。
3. **staged / accumulation 的「由家長確認」是真的**（那些計畫有 level 或
   target），rhythm 的「由家長確認」是假的 —— 那句話只是 `isSkill` 誤判的
   副作用，不可以留著。
4. **`null` 要說得出為什麼。**「還沒安排週期」是狀態，不是錯誤。

### 3.3 完成能力

```
canCompleteToday =
     planState === 'active'
  && progression ∈ { rhythm, fixed_days }
  && 今天在計畫範圍內
  && （rhythm：本週還沒做滿；fixed_days：今天是安排的日子）
```

**判準是 progression，不是 goal_type。** 這一行是 §0 那個死路的實際修法。

---

## 4. WP2 可以直接拿來用的東西

`feat/long-term-unified-shell`（`05e2104`，code 全綠、待真機驗收）。

### 4.1 直接沿用

| 東西 | 為什麼 |
|---|---|
| 一個殼五段的結構 | 與 §2 一致 |
| 移除 `task.name.includes('閱讀')`／`reading_habit` | §1.1 要求的同一件事 |
| `task.category` A/B/C/D → 分類詞 | 結構化，不嗅探內容 |
| `terminalTarget = null`（duration-based rhythm 不因次數完成） | §3.2 規則 1 |
| 移除生成式 final-review 里程碑 | §3.2 規則 2 |
| `supportsPreferredTimeWindow` capability 化 sheets | 顯示能力與 RPC 授權分開，這個分法是對的 |
| 移除 `sectionOrder` 契約 | 順序由殼決定，不由資料決定 |

### 4.2 要改才能用

| 東西 | 怎麼改 |
|---|---|
| `getProgression` 的 precedence | `goal_type === 'skill'` 從第一條移到 §3.1 的第三條，並改成「真的有 level 才算 staged」 |
| `canCompleteToday` | 改綁 progression（§3.3） |
| `GoalProgressionType` 的 `challenge` | 與 `accumulation` 的差別只是「有沒有數字」，講成兩種 progression 會讓 §3.2 多一列說不出差異的規則；建議併成 `accumulation` ＋ 一個「還沒設定目標值」狀態 |

### 4.3 不要一起帶進來

WP2 分支上還有 payout settlement / snapshot / preferred-time adjustment 等
migration 與 staging 腳本。**那些不屬於這個畫面**，一起合併會讓一次 UI
改版同時動到結算語意。照既有規矩：WP2 仍不 merge、不 cherry-pick，
下一包只**重寫**上面那幾個 presentation 檔案。

---

## 5. Legacy fields to retire

| 欄位／推導 | 現在被誰用 | 處置 |
|---|---|---|
| `task.name.includes('閱讀')` | `isReadingPlan` / `isReadingHabit` | **刪**。內容嗅探 |
| `GoalKind = 'reading_habit'` | presentation 對外型別 | **刪**。閱讀不是一種進度模式 |
| `goal.goal_type` 作為進度判準 | `isSkill` / `isChallenge` / `canCompleteToday` | **降級**成只決定分類詞 |
| `goal.current_day` | `GoalHeroCard` / `TaskCard` / `TaskItem`，以及孩子首頁的 GoalCard | **停用**。建立時寫 0 之後沒有任何地方遞增它，所以那幾張卡永遠顯示 0%。真實進度來自 `task_completions` |
| `goal.target_completions` | 只有 family 分支 | 保留給 family，其他 progression 不得使用 |
| `goal.checkpoint_rewards` | rhythm 與 challenge 都讀 | 只留給 accumulation；rhythm 不該有次數里程碑 |
| `goal.level_definitions` / `level_count` / `current_level` | staged | 保留，但成為 staged 的**判準**而不只是內容 |
| `goal.motivation_note` / `next_review_at` / `min_age` / `salary_mode` / `base_salary` / `weekly_target_rate` / `privilege_reward` / `family_time_per_completion` | 無人讀，proposal 路徑永遠 null | **標為 legacy**，畫面不得依賴；清欄位另開一包 |
| `task.base_time_min` | WP2 用它推 `progressionAction` | 改讀 `estimated_minutes`；`base_time_min` 是舊幣值公式的輸入 |
| `tasks.reward_coin_amount` 當畫面數字 | — | 改讀 `confirmed_*`（§1.4） |

---

## 5.1 入口那張卡也在同一條錯誤上

孩子首頁的 GoalCard 用 [`getGoalProgress`](../src/screens/child/HomeScreen.tsx#L197)：

```
goal_type === 'skill' → 第 {current_level ?? 0} / {level_count ?? 1} 級
其他                  → 第 {current_day} / {total_days} 天
```

共同計畫兩條都踩：`goal_type` 是 `'skill'`、`current_level` 是 null，
所以它永遠顯示**「第 0/1 級」、進度條 0%**。

下一包把 progression 判準修好時，這一支要一起改成同一個來源
（`task_completions` ＋ progression），否則會出現「首頁說 0%、
點進去說本週 2／3」這種兩份真相。`taskIcon` 的 `name.includes` 系列
屬於外觀層，另計（見 §Visual polish 清單）。

---

## 6. 下一包的驗收條件

1. 一份 A4B 兩輪談定的計畫（一週 3 次、睡前、15 分鐘、每次 8 幣），
   孩子端顯示「本週 0／3」、「今晚睡前讀 15 分鐘」、**有完成按鈕**，
   按下去寫進 `task_completions` 並回到「今天做完了」。
2. 同一份計畫做滿 14 次**不會**變成 completed。
3. 一份真的有階段的 drawer skill 計畫，行為一個字都沒變。
4. 畫面上沒有任何一句話依賴 `task.name` 的內容。
5. `④ 說好的回饋` 顯示的是 `confirmed_*`，與 `tasks` 現況不一致時明說。
6. `null` progression 的計畫顯示「還沒安排週期」，而不是空白或 NaN。
