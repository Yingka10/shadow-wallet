# 預設任務抽屜｜實測 schema snapshot

> 產生方式：`supabase/verify/task_drawer_schema_snapshot.sql`
> 資料來源：**真實 PostgreSQL 17.4 查詢結果**（`information_schema` / `pg_catalog`），不是手寫。
> 取得日期：2026-07-28
> 對照對象：`src/types/database.ts`（手寫型別，非 generated）

只列 `20260728000000` 與 `20260729000000` 這兩支 migration 產生的物件。
harness 自己建的核心表簡化欄位刻意不列 —— 那些不是 migration 的產出，
列出來會讓人誤以為 harness 的簡化 schema 是真相。

---

## tasks — 新增的 31 個欄位

全部 nullable，只有 `created_from_preset` 例外（NOT NULL DEFAULT false）。

第 31 個是第七階段 C 的 `creation_request_id`（migration 20260730000000）：

| 欄位 | 型別 | nullable | 說明 |
|---|---|---|---|
| creation_request_id | **uuid** | YES | client 產生的建立請求識別碼；legacy 任務為 NULL |

| 欄位 | 型別 | nullable |
|---|---|---|
| command_schema_version | smallint | YES |
| completion_description | text | YES |
| completion_policy | text | YES |
| created_from_preset | boolean | **NO**（default false） |
| duration_type | text | YES |
| estimated_minutes | integer | YES |
| notes | text | YES |
| original_expectation | text | YES |
| plan_mode | text | YES |
| preferred_time | text | YES |
| preferred_time_custom | text | YES |
| preset_catalog_version | text | YES |
| preset_family_id | text | YES |
| preset_variant_id | text | YES |
| review_after_days | smallint | YES |
| review_enabled | boolean | YES |
| reward_coin_amount | integer | YES |
| reward_coin_max | integer | YES |
| reward_coin_min | integer | YES |
| reward_coin_suggested_amount | integer | YES |
| reward_policy | text | YES |
| reward_policy_version | text | YES |
| schedule_mode | text | YES |
| scheduled_date | date | YES |
| start_date | date | YES |
| support_level | text | YES |
| task_details | text | YES |
| task_policy_version | text | YES |
| task_source | text | YES |
| weekly_frequency | smallint | YES |

**沒有** `policy_version`（第七階段 B.5 拆成 `task_policy_version` 與
`reward_policy_version`，驗證腳本有一條 assertion 專門確認它不存在）。

## long_term_goals — 新增 3 個欄位

| 欄位 | 型別 | nullable |
|---|---|---|
| end_date | date | YES |
| first_review_after_days | smallint | YES |
| weekend_review_enabled | boolean | YES |

## 五張子表

```
task_change_events        id, task_id, event_type, actor_user_id,
                          task_policy_version, reward_policy_version,
                          command_schema_version, snapshot, created_at
task_plan_milestones      id, task_id, long_term_goal_id, title,
                          target_day, sort_order, created_at
task_plan_support_steps   id, task_id, long_term_goal_id, text,
                          sort_order, is_custom, created_at
task_preset_selections    id, task_id, option_group_id, option_id,
                          custom_value, created_at
task_role_responsibilities id, task_id, long_term_goal_id, text,
                          sort_order, is_custom, created_at
```

`snapshot` 是這五張表裡唯一的 jsonb 欄位。

## CHECK constraint（實際存在於 DB）

```
tasks  tasks_claim_period_check
       tasks_coin_eligible_needs_amount_check
       tasks_command_schema_version_check
       tasks_completion_policy_check
       tasks_duration_type_check
       tasks_estimated_minutes_check
       tasks_non_coin_has_no_amount_check
       tasks_one_time_needs_date_check
       tasks_preset_needs_request_id_check      ← 第七階段 C
       tasks_plan_mode_check
       tasks_review_after_days_check
       tasks_reward_coin_positive_check
       tasks_reward_coin_range_check
       tasks_reward_policy_check
       tasks_schedule_mode_check
       tasks_support_level_check
       tasks_task_source_check
       tasks_weekly_frequency_check
long_term_goals  long_term_goals_date_range_check
                 long_term_goals_first_review_check
task_change_events  task_change_events_type_check
task_plan_milestones  task_plan_milestones_target_day
                      task_plan_milestones_title_len
task_plan_support_steps  task_plan_support_steps_text_len
task_preset_selections  task_preset_selections_custom_value_len
task_role_responsibilities  task_role_responsibilities_text_len
```

## 索引（第七階段 C 新增）

```
CREATE UNIQUE INDEX tasks_creation_request_id_key
  ON public.tasks USING btree (creation_request_id)
  WHERE (creation_request_id IS NOT NULL)
```

部分索引：legacy 任務全部是 NULL，不佔索引空間。
（PostgreSQL 的 NULL 在 unique 裡本來就互不相等，`WHERE` 是為了把意圖寫在 schema 上。）

實測的資料分佈（harness 跑完之後）：

```
reward_policy        任務數  有識別碼
(legacy null)          4       0
coin_eligible          5       5
family_contribution    1       1
progress_only          1       1
record_only            4       4
time_saving_eligible   1       0   ← 直接 INSERT 造出來的，不是 RPC 建立的
```

## RLS

五張表 `relrowsecurity = true`，每張只有一條 SELECT policy：

```
task_change_events          parents can view task change events        SELECT
task_plan_milestones        family members can view plan milestones    SELECT
task_plan_support_steps     family members can view support steps      SELECT
task_preset_selections      family members can view preset selections  SELECT
task_role_responsibilities  family members can view role responsibilities SELECT
```

沒有 INSERT / UPDATE / DELETE policy —— 寫入一律走 SECURITY DEFINER 函式。

## 函式簽章

| 函式 | 參數 | 回傳 | SECURITY DEFINER |
|---|---|---|---|
| create_parent_task_v1 | `p_command jsonb` | jsonb | ✔ |
| preset_task_replay_payload | `p_request_id uuid, p_child_id uuid, p_family_id uuid` | jsonb | ✔ |
| complete_task | `p_task_id uuid, p_child_id uuid, p_completed_at timestamptz, p_is_prerequisite_met boolean, p_goal_id uuid DEFAULT NULL` | jsonb | ✔ |
| mark_task_atomic | `p_task_id uuid, p_child_id uuid, p_override_type text, p_adjusted_coin integer, p_note text DEFAULT NULL` | jsonb | ✔ |
| redeem_wish | `p_child_id uuid, p_item_id uuid, p_cost integer` | jsonb | ✔ |
| map_purpose_category | `p_purpose text` | text | — |
| map_completion_policy | `p_policy text` | text | — |

## 權限（實測）

```
create_parent_task_v1  anon          EXECUTE = false
                       authenticated EXECUTE = true
                       service_role  EXECUTE = false   ← 刻意未開通

preset_task_replay_payload
                       anon          EXECUTE = false
                       authenticated EXECUTE = false   ← 只給 RPC 內部用

五張子表                anon          SELECT = false, INSERT = false
                       authenticated SELECT = true,  INSERT = false
```

---

## 與 `src/types/database.ts` 的差異

**已修正**：`Task` 型別原本只有 9 個新欄位，本輪依這份 snapshot 補齊到 30 個。
四張子表的 Row 型別（`TaskPresetSelection` / `TaskPlanMilestone` /
`TaskPlanSupportStep` / `TaskRoleResponsibility`）與實際 schema **逐欄相符**，未修改。
`TaskChangeEvent` 依 snapshot 補上 `reward_policy_version`。

**仍存在的落差**（不是錯誤，是刻意的，但要記著）：

| 落差 | 為什麼 | 何時處理 |
|---|---|---|
| 新欄位在 TS 標成 optional（`?:`），DB 是 nullable 欄位 | 型別是手寫的，既有查詢多半只 select 舊欄位。標必填會讓每個既有 `Task` 字面量缺欄位，但那些程式碼沒有壞 | 真正 generated types 之後改成 `\| null` |
| `created_from_preset` 在 DB 是 NOT NULL，TS 是 optional | 同上 | 同上 |
| CHECK 的允許值在 TS 是字面量聯集 | CHECK 不是 enum，generated types 不會產生它 | 決定保留手寫或改成 DB enum |
| `create_parent_task_v1` 的 `Args: { p_command: object }` | 手寫近似；generated 會是 `Json` | generated 時取代 |
| `creation_request_id` 在 TS 是 optional `string \| null` | 與其他新欄位相同的理由 | 同上 |
| `task_change_events` 的 `Insert: never; Update: never` | client 不可寫稽核 log。generated types 不會知道 | generated 後手動保留 |

**generated types 尚未產生。** 這份 snapshot 是「用真實查詢核對手寫型別」，
不是 `supabase gen types` 的輸出，也沒有假造 generated header。
要真正生成需要一個可連的非 production Supabase 專案（harness 是裸 Postgres，
沒有 Supabase 的 `auth` / `storage` schema，生出來的東西不會是完整的）。
