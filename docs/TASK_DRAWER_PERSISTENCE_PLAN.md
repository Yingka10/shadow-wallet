# 預設任務抽屜｜持久化方案

> 對象：家長平板端「預設任務抽屜」（`src/screens/parent/tablet/taskDrawer/`）
> 建立日期：2026-07-28（第六階段 B）
> 更新：2026-07-28（第七階段 A —— 方案已實作，見 §J）
> 狀態：**已實作**。migration 與 RPC 已寫好（`20260728000000_task_drawer_persistence_v1.sql`），
> service adapter 已寫好（`src/lib/parentTaskCreationService.ts`）。
> **UI 尚未串接** —— DraftReview 的「確認建立」仍是 disabled 的靜態元素，留到第七階段 B。
>
> 機器可讀版本在 `taskPersistence/persistenceGaps.ts`（`getTaskPersistenceGaps()`）。
> 兩份不同步時以程式為準 —— 它有測試把關，這份文件沒有。
>
> schema 事實以 repo 內的 `supabase/migrations/*` 與 `src/types/database.ts` 為準，
> 不以任何既有文件的描述為準（本文件的每一項都是回去讀過程式碼才寫的）。

---

## A. 現有建立流程

### A-1. 一般任務：`ParentTaskCreateScreen.handleSave`

`src/screens/parent/ParentTaskCreateScreen.tsx:275-325`

```
1. parents.select('family_id').limit(1).single()      ← 見 §G
2. insert tasks        (回傳 id)
3. insert child_tasks  (appliesTo 每個孩子一列)
4. navigation.goBack()
```

**不是原子的。** 步驟 2 成功、步驟 3 失敗時，`tasks` 會留下一列沒有任何孩子指派的任務：
它不會出現在任何孩子的清單裡，家長端也沒有介面看得到它，只能在 DB 裡看到。
沒有補償刪除，也沒有重試。

### A-2. 長期任務：`lib/taskActions.ts`

`createLongTermGoal`（:428-490）、`createSkillGoal`（:595 起）、
`createFamilyResponsibilityGoal`（:700 起）、`createChallengeGoal`（:790 起）四支結構相同：

```
1. insert tasks (is_long_term = true) → id
2. insert child_tasks           失敗 → 刪掉 tasks
3. insert long_term_goals       失敗 → 刪掉 child_tasks + tasks
```

有手寫補償，比 A-1 好，但**補償本身也可能失敗**（網路斷、RLS 拒絕），
而且補償用的是 `delete` 而不是交易回滾 —— 中間若有其他人讀到這筆資料，讀到的是半成品。

### A-3. family_id 的取得

見 §G。兩條路徑都不是從「這個孩子屬於哪一家」推得。

### A-4. 沒有任何建立用的 RPC

`supabase/migrations/` 目前的 function 只有：
`redeem_wish` / `complete_task` / `setup_child_tasks` / `submit_onboarding` /
`review_redemption_request` / `mark_task_atomic` / `settle_weekly_interest` /
`record_completion_context`。

**沒有 `create_task` 之類的東西。** 建立一律走前端多次 insert。

---

## B. 現有 schema 能存什麼

### `tasks`

`id, family_id, name, category, day_type, long_term_type, is_long_term,
base_time_min, difficulty, coin_override, is_system_default, allow_repeat,
min_age, max_age, is_active, time_saving_min, recurrence_days, due_date,
claim_period, max_claims_per_period, created_at`

### `child_tasks`

`id, child_id, task_id, is_active, created_at`

### `long_term_goals`

`id, child_id, task_id, goal_type, total_days, current_day, status,
checkpoint_rewards, motivation_note, started_at, next_review_at, completed_at,
min_age, interrupt_count, last_active_date, active_days, preferred_time_window,
level_definitions, current_level, level_count, role_title, salary_mode,
base_salary, weekly_target_rate, privilege_reward, family_time_per_completion,
target_completions, target_value, current_value, value_unit, created_at`

### 逐欄對照 `CreateParentTaskCommand`

| 命令欄位 | 現有落點 | 結論 |
|---|---|---|
| `childId` | `child_tasks.child_id` | supported |
| `familyId` | `tasks.family_id` | transform（取值方式要換，見 §G） |
| `task.title` | `tasks.name` | supported |
| `schedule.recurrenceDays` | `tasks.recurrence_days` | supported（同為 0 = 週日） |
| `schedule.durationDays` | `long_term_goals.total_days` | supported |
| `metadata.ageGroup` | `children.age_group` | supported（不必再存一份） |
| `role.customValue` | `long_term_goals.role_title` | supported |
| `task.purposeCategory` | `tasks.category` | transform（四值 → A/B/C/D） |
| `task.durationType` | `day_type` + `is_long_term` | transform（反推不回來） |
| `schedule.mode` | `tasks.day_type` | transform |
| `schedule.startDate` | `long_term_goals.started_at`（僅長期） | transform |
| `schedule.scheduledDate` | `tasks.due_date` | transform（截止 ≠ 安排） |
| `schedule.estimatedMinutes` | `tasks.base_time_min` | transform（與幣值基礎糾纏） |
| `schedule.endDate` | 由 `started_at + total_days` 推得 | transform |
| `review.firstReviewAfterDays` | `long_term_goals.next_review_at` | transform |
| `role.optionId` | `long_term_goals.role_title` | transform |
| 其餘 | — | 見 §C |

---

## C. 現有 schema **存不下**的欄位

按規格 §7C 逐項確認，一項不漏：

| 欄位 | 現況 | 為什麼不能將就 |
|---|---|---|
| `purposeCategory` | 壓成 `category` 一個字母 | 可轉，但 A/B/C/D 已被 `fn_complete_task` 綁死舊語義（DELTA §1、§2） |
| `durationType` | 由兩欄隱含 | `day_type='custom'` 同時代表固定任務與長期計畫，反推會錯 |
| `planMode` | `goal_type`（habit/skill/family/challenge） | 與 growth_plan / short_support / family_role 不是同一套切法 |
| `source` | **無** | C 類「須為孩子提出或親子協商」在資料層沒有依據（DELTA §4） |
| `rewardPolicy` | **無**，由 category 隱含 | 同一 category 可對應幣／進度／純紀錄三種；「家庭參與不發幣」失去資料層依據 |
| `completionPolicy` | **無** | 單次完成即停、短期穩定退場、角色期滿回顧，排程端都讀不到 |
| `originalExpectation` | `motivation_note`（僅長期） | 單次與固定任務也有；且它是「不得被 AI 覆蓋」的內容，必須獨立保存 |
| `selectedOptions` | **無** | 唯一能回答「多少家庭讓孩子自己閱讀」的資料 |
| `customOptionValues` | **無** | 「其他」的自填內容 |
| `scheduledDate` | `due_date`（語義不同） | 見上 |
| `startDate` | 僅長期有 | 家長選的「明天開始」目前會被忽略 |
| `preferredTime` | `preferred_time_window`（僅兩值、僅長期） | 抽屜有七個時段 |
| `estimatedMinutes` | `base_time_min`（幣值基礎） | 寫進去等於偷偷改幣值 |
| `reminderMode` | **無** | 通知系統本身不存在 → not_planned |
| `scheduleMode` | `day_type` | `weekly_frequency` 沒有對應值 |
| `weeklyFrequency` | **無** | 不可退化成隨便挑三天寫進 `recurrence_days` |
| `firstReviewAfterDays` | `next_review_at`（時間點） | 天數要反推，重排時容易算錯 |
| `weekendReviewEnabled` | **無** | 週報要讀 |
| `milestones` | `level_definitions` / `checkpoint_rewards` | 兩者形狀都綁著幣值；成長計畫的里程碑刻意沒有幣值 |
| `supportSteps` | **無** | 孩子端要照著做的清單，需要順序 |
| `role responsibilities` | **無** | 要逐項顯示、逐項回顧 |
| `policyVersion` | **無** | 沒有它就無法解釋「為什麼同一種任務去年給的幣不一樣」 |
| `preset family / variant id` | **無** | 沒有溯源就無法評估抽屜有沒有被採用 |

---

## D. 建議資料策略

> 原則：**會被查詢、排序、統計、或被規則引擎讀的欄位進主表或子表；
> 只是給人看的長文字才考慮主表 text；沒有任何欄位丟進「一大包 JSONB」。**
>
> 「全部存 JSONB」在這裡是明確錯誤的答案：週報要按目的與回饋方式分組、
> 規則引擎要在完成時讀 `source` 與 `reward_policy`、任務列表要按期間形式分群、
> 稽核要按 `policy_version` 回溯。這些都不該是 `metadata->>'x'`。

### D-1. 進 `tasks` 主表（新欄位）

語義維度與排程，全部要查詢：

```
purpose_category   text        -- 與 category 並存，過渡期雙寫
duration_type      text
task_source        text
reward_policy      text
completion_policy  text
start_date         date
preferred_time     text
preferred_time_custom text
estimated_minutes  integer     -- 與 base_time_min 分開
weekly_frequency   smallint
review_after_days  smallint
weekend_review_enabled boolean
support_level      text
original_expectation   text
completion_description text
task_details       text
notes              text
created_from_preset boolean not null default false
preset_family_id   text
preset_variant_id  text
policy_version     text
preset_schema_version smallint
```

### D-2. 進 `long_term_goals`（新欄位）

只跟長期形式有關：

```
plan_mode              text     -- 與 goal_type 分開
role_option_id         text     -- role_title 留給顯示名稱
scope_description      text
exception_description  text
contribution_description text
```

### D-3. 新子表（三張）

要逐項顯示、逐項調整、或要當統計維度的東西：

```
task_preset_selections (task_id, group_id, option_id, custom_value)
  ← selectedOptions / customOptionValues / focusOptionIds 都放這裡
task_plan_milestones   (goal_id, seq, title, target_day)
task_plan_support_steps(goal_id, seq, text)
task_role_responsibilities (goal_id, seq, text, is_custom)
```

`task_preset_selections` 是最重要的一張：它讓「多少家庭選了共讀」「哪些焦點最常被選」
變成一句 `group by`，而不是全表掃 JSONB。

### D-4. 暫不持久化

- `reminderMode` —— 通知排程不存在。存一個沒人讀的欄位只會製造「看起來會提醒」的假象。
- `metadata.editorKind` —— 可由 `duration_type` + `plan_mode` 完整還原，另存一欄只是多一個會不同步的來源。
- `schedule.endDate` —— 由 `start_date + duration_days` 推得；若之後排程查詢需要索引，再加 generated column。

---

## E. 五種 editor 的 table mapping

| editor | tasks | child_tasks | long_term_goals | 子表 |
|---|---|---|---|---|
| `one_time` | ✔（`day_type='once'`, `start_date`, `task_details`, `notes`） | ✔ | — | `task_preset_selections` |
| `recurring` | ✔（`day_type='custom'`, `recurrence_days` 或 `weekly_frequency`） | ✔ | — | `task_preset_selections` |
| `growth_plan` | ✔（`is_long_term`） | ✔ | ✔（`plan_mode='growth_plan'`, `total_days`） | `task_preset_selections`, `task_plan_milestones` |
| `short_support` | ✔（`is_long_term`） | ✔ | ✔（`plan_mode='short_support'`） | `task_preset_selections`, `task_plan_support_steps` |
| `family_role` | ✔（`is_long_term`） | ✔ | ✔（`plan_mode='family_role'`, `role_option_id`, `scope_*`） | `task_preset_selections`, `task_role_responsibilities` |

最少 2 張表（單次／固定），最多 5 張表（家庭角色）。**這正是不能沿用前端多次 insert 的原因。**

---

## F. 原子建立方案

| 方案 | 原子性 | 授權 | 前端複雜度 | 評語 |
|---|---|---|---|---|
| 1. 前端依序 insert | ✘ | RLS | 高（要手寫補償） | 就是現在的做法。家庭角色要連寫 5 張表，任何一步失敗都留半成品 |
| 2. Supabase RPC（plpgsql function） | ✔ 單一交易 | `SECURITY DEFINER` + 明確 authz 檢查 | 低（一次呼叫） | 專案已有四支同型 RPC 的成熟寫法 |
| 3. Edge Function / service orchestration | ✘（除非內部再呼叫 RPC） | service role | 中 | 多一次網路來回，仍要自己處理部分失敗 |

### 推薦：方案 2（Supabase RPC）

理由：

1. **真正的交易**。plpgsql function 整段在一個交易裡，任何一步 `RAISE` 就整批回滾，
   不需要手寫補償 delete —— 而手寫補償正是 `taskActions.ts` 目前最脆弱的地方。
2. **專案已經走這條路**。`mark_task_atomic`（`20260705040000`）就是為了同樣的問題引入的，
   `complete_task`、`redeem_wish`、`submit_onboarding` 也都是 RPC。
   再開一種新做法只會讓建立與完成兩端的錯誤處理長得不一樣。
3. **政策檢查跟資料在同一側**。「家庭參與不得發幣」「學校作業不得成為固定幣源」
   這類硬規則放在 RPC 裡，前端繞不過去；放在 Edge Function 裡，任何拿到 anon key 的人都能直接對表寫。
4. **授權有現成範式**。`20260705000000_rpc_authz_checks.sql` 已經示範過
   「service_role 直通、其餘檢查 `children.family_id = 呼叫者的 family`」的寫法，照抄即可。

Edge Function 只在需要呼叫外部服務（AI）時才進場，而 AI 不在建立的關鍵路徑上（見 §H）。

### 建議簽章

```sql
create_parent_task(p_command jsonb) returns jsonb
-- 回傳 { ok, task_id, related_ids[] } 或 { ok:false, code, message }
```

命令整包用 jsonb 傳，理由是欄位還會長；RPC 內部再拆到各表。
`CreateParentTaskCommand` 的 `schemaVersion` 就是給 RPC 分辨版本用的。

前端側對應 `ParentTaskCreationService`（`taskPersistence/types.ts`），
之後只要換掉 `UnavailableParentTaskCreationService` 的實作，抽屜完全不用改。

---

## G. family_id 的取得

**目前仍有問題，兩條路徑都是。**

```ts
// src/screens/parent/ParentTaskCreateScreen.tsx:277
const { data: parent } = await supabase.from('parents').select('family_id').limit(1).single();

// src/screens/parent/ParentLongTermCreateScreen.tsx:147-152
.from('parents').select('family_id') ... // 同樣模式
```

`limit(1)` 取的是「RLS 允許看到的第一筆 parents」。單一家庭、單一家長時碰巧正確，
但雙家長帳號或一個 user 對到多個 family 時，會把任務建到別的家庭底下。
`.single()` 也會在有多筆時直接丟錯。

**正式方案必須改為由當前 child 推得：**

```ts
// children.family_id 才是唯一正確來源
familyId = child.family_id
```

`CreateParentTaskCommand.familyId` 的來源就是 `CommandChildContext.familyId`
（`mapTaskDraftToCommand` 只從這裡拿，有測試把關），
RPC 端再做一次 `children.family_id = p_family_id` 的檢查，兩層都不靠「第一筆」。

> 本輪沒有修改 `ParentTaskCreateScreen`（規格明確禁止）。這一項留給 migration 階段一併處理。

---

## H. AI 建議放在哪一步

**結論：放在 DraftReview／最終確認階段，不插進五種 editor 的中間。**

未來流程：

```
1. TaskDraft validation
2. 規則引擎必要檢查（rewardEligibility 的資格閘門）
3. AI 產生可選調整建議
4. 家長逐項採用或保留
5. 產生 CreateParentTaskCommand
6. 家長確認建立
7. 原子寫入
```

理由：

1. **不覆蓋家長原始期待。** `originalExpectation` 是家長自己寫的那一段。
   若 AI 在 Step 2 中途改寫欄位，家長會分不清畫面上哪一句是自己寫的、哪一句是被改的。
   放在最後，「原始」與「建議」始終並排，採不採用是明確的一次動作。
2. **不讓 Step 2 變得更長。** 第六階段 A 才把五種 editor 的垂直長度壓下來，
   在中間插入建議卡等於把剛省下的空間又吃回去，而且家長會在還沒填完時就被打斷。
3. **政策不可被 AI 改寫。** 家庭參與不發幣、學校作業不作固定幣源、
   短期支援穩定後結束 —— 這些是 catalog 與 validator 的硬規則。
   把 AI 排在規則引擎之後，它能建議的只剩規則允許的範圍，順序本身就是防線。
4. **AI 失敗仍可完成建立。** preset draft 本來就是完整可用的。
   AI 逾時或回傳格式錯誤時，最終確認畫面照常顯示、確認建立照常可按，
   只是少了一區建議 —— 不會讓建立流程被外部服務綁架。

本輪不做任何 AI UI，也**不做 mock 建議**。

---

## I. 下一階段 migration 前仍待決的事項

1. **`category` 要雙寫還是切換。** `fn_complete_task` 仍讀 `category` 判斷發幣
   （DELTA §1、§2）。新增 `purpose_category` 之後，是雙寫過渡還是同時改 RPC？
   改 RPC 會連動 A 類發幣與 B 類時間儲蓄兩個未決議題。
2. **時間儲蓄這條線的去留。** DELTA §2 指出 `time_savings.is_redeemed` 全 codebase 零寫入。
   `rewardPolicy = 'time_saving_eligible'` 要不要真的落地，取決於這個決策。
3. **`long_term_goals` 是否拆表。** 目前一張表同時承載 habit / skill / family / challenge
   四種型態的專屬欄位（共 12 個只有一種型態會用到的欄位）。再加五個家庭角色欄位會更寬。
   要不要改成「共用表 + 型態子表」是個獨立決策。
4. **`preset_family_id` 的參照完整性。** catalog 是 TypeScript 常數不是 DB 資料。
   要不要建一張 `task_preset_catalog` 種子表來做外鍵，還是接受它是自由文字。
5. **`selectedOptions` 子表的刪除語義。** 家長之後編輯任務改了選項，是覆蓋還是保留歷史？
   若要做「任務設定變更史」，子表就需要 `valid_from` / `valid_to`。
6. **claim_period / max_claims_per_period 的預設值。** 抽屜目前不讓家長設定這兩欄，
   建立時要沿用 DB 預設（1 次／天）還是依 `completionPolicy` 決定。
7. **RPC 的權限邊界。** `create_parent_task` 要不要允許 service_role 直呼（供匯入／種子用），
   還是一律要求 `auth.uid()` 對得上 `parents`。


---

## J. 第七階段 A 的實作結果

本節記錄 §A–§I 的規劃實際落地成什麼。與規劃不同的地方都寫在下面。

### J-1. 與 §D 規劃不同的四點

| 規劃 | 實作 | 為什麼 |
|---|---|---|
| 新增 `tasks.purpose_category` | **沒有新增**，`tasks.category` 仍是 canonical | 兩個欄位並存必然有一天不同步，而 `fn_complete_task` 讀的是 `category`。改為在 TS 與 SQL 各有一份明確映射（`dbMapping.ts` / `map_purpose_category()`），並有測試比對兩份一致 |
| `tasks.start_date` 只是補欄位 | 同時新增 `claim_period = 'once'` | 單次任務的「只能完成一次」不是「每天一次」。原本的 `day` + `due_date` 會讓沒有截止日的一次性任務隔天又能領一次 |
| `completion_policy` 沿用 catalog 名稱 | DB canonical 用 `keep_recurring` / `finish_project` | 規格指定的 DB 值與 catalog 的 `ongoing` / `plan_complete` 不同名。改 catalog 要動 36 個 variant 與所有既有測試，改為在 RPC 映射一次 |
| `long_term_goals` 新增 `duration_days` / `start_date` | 沿用既有的 `total_days` / `started_at` | 已有真正等價的欄位，再開一個只會有兩個來源 |

### J-2. `base_time_min` 與幣值

新任務一律寫 `base_time_min = 0`、`coin_override = NULL`。

`estimated_minutes` 是獨立欄位，**不寫進 `base_time_min`** —— 後者是幣值計算的乘數基礎。

代價是：`reward_policy = 'coin_eligible'` 的 preset 任務目前完成時得到 **0 幣**。
這不是 bug 也不是假裝，是「幣值還沒決定」的忠實表現：抽屜這一輪不計算幣值，
規則引擎（`ai-proxy` 的 `calcCoins`）也還沒接進建立流程。

**這是第七階段 B 的 blocker**：UI 串接之前必須先決定 coin_eligible 的幣值從哪裡來，
否則家長會建立出一個寫著「可獲得成長幣」卻給 0 幣的任務。

> **第七階段 B 已解決。** 幣值改由 `coin-policy.json`（`coin-policy-1.0.0`，已定案）
> 在建立時決定，寫進新欄位 `tasks.reward_coin_amount`；`base_time_min` 仍然是 0，
> 兩條路徑不共用欄位。政策算不出金額時 **不建立**（RPC 回 POLICY_REJECTED），
> UI 也不會列出那個選項 —— 0 幣的 coin_eligible 任務現在連建都建不出來。
> 完整盤點見 `docs/TASK_REWARD_POLICY_AUDIT.md`。

### J-3. 回退策略

migration 只做加法，沒有 `DROP COLUMN`、沒有 `DROP TABLE`、沒有資料 backfill。
所以回退分三層，由輕到重：

1. **停用功能**（最常用）：`REVOKE EXECUTE ON FUNCTION public.create_parent_task_v1(jsonb) FROM authenticated;`
   之後就沒有任何路徑會寫入新欄位。既有資料完全不受影響。
2. **還原完成流程**：`complete_task` 與 `mark_task_atomic` 是 `CREATE OR REPLACE`，
   重新套用 `20260724000000_task_frequency_cap.sql` 與 `20260705040000_fn_mark_task_atomic.sql`
   就回到本輪之前的定義。唯一要注意的是 `claim_period = 'once'` 的任務會退回按天計算，
   所以還原前要先把那些任務改成 `'day'`。
3. **完全移除**（不建議）：新表可以 `DROP TABLE ... CASCADE`，
   新欄位可以 `DROP COLUMN`。但只要已經有 preset 任務建立過，這會刪掉唯一的資料來源。

沒有寫 down migration 檔：專案沒有這個慣例（`supabase/migrations/` 全部是單向的），
硬加一支只會多一個沒有人跑過、也不會被驗證的檔案。

---

## K. 第七階段 B 的實作結果

### K-1. 新增了什麼

| 項目 | 位置 |
|---|---|
| 幣值決策契約與純函式 | `taskDrawer/taskReward/`（`coinPolicy` / `evaluateTaskReward` / `selectAvailableRewardPolicies`） |
| 命令的 reward 段 | `CreateParentTaskCommandBase` → `evaluateTaskReward` → `finalizeCreateParentTaskCommand` |
| DB 幣值欄位 | `tasks.reward_coin_amount` / `reward_coin_suggested_amount` / `reward_coin_min` / `reward_coin_max` |
| RPC coin guard | `create_parent_task_v1` 的 guard G（決策）與 H（金額），全在 insert 之前 |
| 完成流程授權修正 | `complete_task` / `mark_task_atomic` / `redeem_wish` 移除 `parents ... LIMIT 1` |
| 可執行的 DB 驗證腳本 | `supabase/verify/task_reward_verification.sql` |

migration：`20260729000000_task_reward_and_completion_authz.sql`。
**沒有修改 `20260728000000`** —— 已套用的 migration 視為不可變。

### K-2. 幣值欄位為什麼是新的，不是重用

| 既有欄位 | 為什麼不用 |
|---|---|
| `base_time_min` | 它是舊公式的分鐘輸入，會被 `× difficulty`。語義是時間不是幣 |
| `coin_override` | 語義是「手動覆寫算出來的值」，而且會被前置解鎖 `×0.7` 打折 —— 政策決定的金額被打折後會掉出 min–max |
| `estimated_minutes` | 家長估計的投入時間，本來就不該等於幣值 |

三個都不是「這個任務值多少幣」。

### K-3. 新任務不套前置解鎖 ×0.7

不是因為覺得那個機制不好，是因為**打折會讓實付金額掉出政策允許範圍**。
DELTA §5 也已標記這個機制的立足點被 2026-07 新分類動搖、處置未定。
舊任務（`reward_policy IS NULL`）行為一個字沒改。

### K-4. 回退策略（補充 J-3）

`20260729000000` 一樣只做加法。額外的兩層：

1. 只要把 `20260728000000` 的 `create_parent_task_v1` / `complete_task` /
   `mark_task_atomic` 重新套用一次，就回到第七階段 A 的行為
   （`redeem_wish` 則重新套用 `20260705000000_rpc_authz_checks.sql`）。
   代價是完成流程會退回 `parents ... LIMIT 1` 授權，以及 coin_eligible 新任務發 0 幣。
2. 新的四個 CHECK constraint 可以單獨 `DROP CONSTRAINT` 而不影響資料。
   若要退回「允許 0 幣的 coin_eligible」，只需 drop `tasks_coin_eligible_needs_amount_check`。

---

## L. 第七階段 B.5 的實作結果

### L-1. 四種版本語意分離（P0）

`tasks.policy_version` 原本一欄裝兩件事：第七階段 A 寫的是「任務政策版本」，
第七階段 B 又拿它裝 coin-policy 的版本。兩者的變更頻率與影響範圍完全不同 ——
改幣值數字不該讓分類版本跟著動，反之亦然。

拆成四個：

| 版本 | 常數／來源 | 現值 | 什麼時候會動 |
|---|---|---|---|
| commandSchemaVersion | `TASK_COMMAND_SCHEMA_VERSION` | `1` | 命令結構改語義時 |
| presetCatalogVersion | `PRESET_CATALOG_VERSION` | `2026-07-28` | 26 family / 36 variant 的**內容**改動 |
| taskPolicyVersion | `TASK_POLICY_VERSION` | `task-taxonomy-2026-07` | 目的分類／來源／回饋資格／結束**規則**改動 |
| rewardPolicyVersion | `COIN_POLICY_VERSION` 或 `REWARD_ELIGIBILITY_POLICY_VERSION` | `coin-policy-1.0.0` ／ `reward-eligibility-2026-07` | 幣值數字或回饋資格規則改動 |

`rewardPolicyVersion` 依決策路徑選來源：**算過幣的**（含「幣值政策說我算不出來」）
是 coin-policy 的版本；**沒進幣值計算的**（不發幣的政策、時間儲蓄、A/B 硬規則擋下）
是回饋資格政策的版本。不發幣的任務蓋上幣值政策版本是假的 ——
之後 coin-policy 進版時，那些從來沒被定價的任務會看起來像被重新算過。

DB 對應：`tasks.task_policy_version` + `tasks.reward_policy_version`
（`policy_version` 已不存在，驗證腳本有一條 assertion 專門確認）。
`task_change_events` 同樣兩欄，snapshot 另有一個 `versions` 區塊裝四種版本。

### L-2. migration 修改而非新增

`20260728000000` 尚未套用到任何真實資料庫，所以直接在它裡面改欄位名，
而不是加一支「改名 migration」。改名 migration 會在歷史上留下一個
「曾經有個叫 policy_version 的東西」的疑問，而那個東西從來沒有真的存在過。

### L-3. 真實 PostgreSQL 驗證

**已完成。** PostgreSQL 17.4，66 條 assertion 全過。
詳見 `docs/TASK_DRAWER_POSTGRES_VERIFICATION.md` 與
`docs/TASK_DRAWER_VERIFIED_SCHEMA.md`。

發現並修正的問題、負向對照、以及「哪些是真實 SQL、哪些仍是 Jest 靜態測試」
都記在那兩份文件裡。
