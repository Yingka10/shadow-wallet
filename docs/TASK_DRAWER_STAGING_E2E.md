# 預設任務抽屜｜staging E2E 驗收

> 這份記的是**實際跑過什麼**，以及**還沒跑什麼**。
> 沒有跑過的段落一律標著「⛔ 未執行」，不會用 runbook 的存在冒充驗收結果。

---

## 摘要

| | |
|---|---|
| 日期 | 2026-07-28 |
| Supabase staging | **不存在**。整個帳號只有一個 project，那就是正式專案 |
| 因此 §六～§十、§十三～§十四 | ⛔ **未執行** |
| schema baseline | ✅ 已從正式專案取得（schema-only，唯讀） |
| bootstrap 策略 | ✅ 已決定並**在本機 PostgreSQL 17.4 實測通過** |
| 真實 schema 上的 RPC 驗證 | ✅ 36 條 assertion，`REAL SCHEMA E2E PASSED` |
| database types | ⛔ **未產生**（機制已驗證，缺 staging ref） |
| 長期任務進度標籤 | ✅ 已修 |
| 列表分組語意 | ✅ 已修 |
| 發現的 production bug | **1 個 P0**（家庭角色任務在正式資料庫上建不出來） |

---

## 1. 為什麼沒有 staging

```
$ supabase projects list
LINKED | REFERENCE ID   | NAME
  ●    | <PROD_REF>     | (正式專案)
```

整個帳號只有這一個 project，`supabase/config.toml` 的 `project_id` 與 `.env` 的
`EXPO_PUBLIC_SUPABASE_URL` 指向的都是它，而它裝著承恩的 Demo 資料。

依規格 §四：**沒有 staging 時不可拿正式專案代替**。建立 project 是會產生
計費資源的動作，需要由使用者在 Supabase Dashboard 執行。

### 使用者需要做的事

1. 在 Supabase 建立一個新 project（名稱建議 `growbook-staging`）
2. 把它的 URL 與 anon key 寫進 `.env.local`
   （`.gitignore` 第 45 行已經擋著，不會進 Git）
3. 把 **project ref** 告訴我 —— 只要 ref，**不要貼 key**

拿到 ref 之後的第一件事是確認它與正式專案的 ref 不同、且裡面沒有家庭資料，
確認完才會套任何 migration。

---

## 2. schema baseline（§五）✅

`supabase/migrations/` 從來沒有建立過核心表（AUDIT P1-7），
所以 staging 需要一份 schema 起點。

### 取得方式

```bash
supabase db dump --linked --schema public -f supabase/baseline/public_schema.sql
```

`--schema-only` **不存在** —— schema-only 是預設，`--data-only` 才是選項。

### 實際遇到的問題

CLI 的 `db dump` 需要 Docker（pg_dump 跑在容器裡），而這台機器沒有 Docker。
改用 CLI 自己產生的腳本（`--dry-run`）搭配本機 PostgreSQL 17.4 的 pg_dump：

```bash
supabase db dump --linked --schema public --dry-run > dump_raw.txt
awk '/^#!\/usr\/bin\/env bash/{f=1} f' dump_raw.txt > dump.sh
# Supabase 的 pg_dump 是 patch 過的：--quote-all-identifier（單數）
# stock pg_dump 是 --quote-all-identifiers（複數），另外拿掉空的 --exclude-schema ""
bash dump.sh > supabase/baseline/public_schema.sql
```

⚠️ `--dry-run` 會把 CLI 臨時建立的登入角色密碼印到 stdout。
那份腳本用完就刪，沒有進 repo。

### 驗證結果

| 檢查 | 結果 |
|---|---|
| 核心表 | families / parents / children / child_profiles / tasks / child_tasks / task_completions / long_term_goals / wallets / transactions / reward_items / redemption_requests / overrides / intervention_log / time_savings / weekly_reports 全在（27 張表） |
| `COPY` / `INSERT INTO` | **0**（沒有任何資料） |
| 家庭真實資料（「承恩」） | **0** |
| `auth.users` 資料 | **0**（只有外鍵參照） |
| vault / 正式 URL / project ref / 密碼 | **0** |
| verification harness 的表 | **0** |
| OWNER | 只有 `postgres` 與 `pg_database_owner`，沒有個人帳號 |

檔案大小 124 KB，3176 行。

---

## 3. bootstrap 策略：**A** ✅

`supabase migration list --linked` 顯示遠端已經套到 `20260729000000`：

```
20260728000000 | 20260728000000 | ← 已套用
20260729000000 | 20260729000000 | ← 已套用
20260730000000 |                | ← 只在本機
```

而 dump 出來的 schema 確實含 `reward_policy`、`task_policy_version` +
`reward_policy_version`（沒有殘留舊的模糊 `policy_version`）、
`create_parent_task_v1`，但**沒有** `creation_request_id`。

所以 baseline = 「所有舊 migration 套用完成後的基準」，採 **策略 A**：

> staging 先套 `supabase/baseline/public_schema.sql`，
> 之後**只套 `20260730000000` 起的新 migration**。

重複套 20260728/20260729 會造成 duplicate column，絕對不要做。

### Supabase 平台提供、baseline 不含的前置條件

在真 staging 上這些由平台提供；本機模擬時要自己建：

```sql
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;   -- families.id 的 default
CREATE EXTENSION pgcrypto     WITH SCHEMA extensions;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
CREATE ROLE anon / authenticated / service_role / supabase_admin;
```

`public` schema 有三條外鍵指向 `auth.users`
（families.created_by、parents.user_id、parent_observations.parent_id）。

---

## 4. 在真實 schema 上驗證 RPC ✅

staging 沒有，但 baseline 有 —— 所以在本機一次性 PostgreSQL 17.4 cluster 上
用**正式專案的 schema** 跑了一輪。

```bash
initdb -D <tmp> -U postgres --auth=trust
postgres -D <tmp> -p 55433
createdb growbook_staging_sim
psql -f <前置條件>
psql -v ON_ERROR_STOP=1 -f supabase/baseline/public_schema.sql       # 0 errors
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20260730000000_*.sql  # 0 errors
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20260731000000_*.sql  # 0 errors
psql -v ON_ERROR_STOP=1 -f supabase/verify/real_schema_e2e.sql
```

結果：**36 條 assertion 全過，`REAL SCHEMA E2E PASSED`**。

### 這比既有的 harness 強在哪裡

`supabase/verify/task_reward_verification.sql` 自己建 13 張**簡化**的表。
它的 93 條 assertion 全過，卻抓不到下面這個 bug ——
因為簡化的 `tasks` 表沒有真的 CHECK。

### 🔴 發現的 production bug（P0）

```
ERROR: new row for relation "tasks"
       violates check constraint "tasks_long_term_type_check"
```

**家庭角色任務在正式資料庫上完全建不出來。**

| | |
|---|---|
| DB 的 CHECK 允許 | `habit` / `skill` / `responsibility` / `challenge` |
| `create_parent_task_v1` 為 `family_role` 寫的 | `family` ← 不在允許值裡 |

一路沒被發現的原因有三層：

1. 這兩個 CHECK（`tasks.long_term_type`、`long_term_goals.goal_type`）
   **從來不在 repo 的 migration 裡**，只存在 live DB。
2. harness 的簡化表沒有這條 CHECK。
3. App 端也一路用 `'family'`：`LongTermType`、`useParentLongTermGoals`、
   `useLongTermTasks`、孩子端的 `longTermGoalPresentation`，
   以及 **`taskActions.createFamilyGoal`** —— 也就是說
   **既有的家庭長期任務建立路徑同樣是壞的**，只是沒有測試覆蓋。

修正：

- `supabase/migrations/20260731000000_fix_family_role_long_term_type.sql`
  （只改一個 CASE 分支）
- App 端 `'family'` → `'responsibility'`（DB 值）。
  孩子端 presentation 自己的 `goalKind: 'family'` **保留** ——
  那是給孩子看的說法，不是資料庫的值。

不需要資料修補：CHECK 擋著，資料庫裡不可能有 `long_term_type = 'family'` 的列。

### ⚠️ 規格 §七 與真實 schema 的衝突

§七 要求「1 個 parent 額外屬第二個家庭，用來驗證多家庭」。
**真實 schema 做不到**：

```sql
CREATE UNIQUE INDEX idx_parents_user_id ON public.parents (user_id);
```

一個 auth 帳號只能屬於一個家庭。E2E 改成把這個約束本身斷言出來
（嘗試把同一個 user 加進第二個家庭 → `unique_violation`）。

順帶一提：第七階段 B 修 `parents ... LIMIT 1` 授權時，
理由之一是「同一個 auth 帳號在兩個家庭時會挑到錯的那一個」。
有了這個 unique index，**那個情境目前不可能發生**。
改成集合比對仍然是對的（它同時修掉了「比對某一個 family 而不是這個孩子的 family」
這個真的 bug），但當時對多家庭風險的描述講過頭了。

### 實測涵蓋

| 分類 | 內容 |
|---|---|
| 建立 | 五種形式全部成功；子表、稽核事件、四種版本欄位、`creation_request_id` 都正確 |
| idempotency | 同識別碼重送回原任務、tasks 沒增加、子表與稽核事件沒重複 |
| 授權 | 跨家庭重用識別碼 → 42501；未登入 → 42501；跨家庭完成／adjust → 42501 |
| 完成 | coin_eligible +12 幣（completion log 一致、不是拿 `estimated_minutes` 當幣值）；family_contribution / record_only / progress_only 全部 0 幣、錢包不動、不寫 `time_savings` |
| 單次任務 | `claim_period = once`、`max_claims_per_period = 1` |

### 這**不能**取代 staging E2E

沒有 PostgREST、沒有真的 JWT、RLS 沒有以 `authenticated` 身分執行過、
`auth.uid()` 是替身。真正要驗的是那一層。

---

## 5. database types（§八）⛔ 未產生

`gen types --db-url` 與 `--local` 都需要 Docker。
`--linked` / `--project-id` 走 management API，**不需要 Docker** —— 已驗證可行。

所以指令本身沒有問題，缺的只是 staging ref：

```bash
supabase gen types typescript \
  --project-id <STAGING_REF> \
  --schema public \
  > src/types/database.generated.ts
```

**沒有 commit 任何 generated 檔案。** 從正式專案產生的那一份缺
`creation_request_id`（20260730 沒套用在那裡），把它放進 repo 會和 App
實際寫入的欄位矛盾 —— 規格 §八 明文禁止「同一 RPC 在兩份型別裡互相矛盾」。

### 採用的策略：**B**

- `database.generated.ts` 描述真實的 Row / Insert / Functions（DB source of truth）
- 現有的 `Task` 等 application interface 保留為**投影型別**：畫面真的 select 的欄位
- 兩者之間用 mapper 銜接

理由：`tasks` 現在有 40 多欄、大部分 nullable。讓它們直接流進每個
component，會讓每一處都要處理一堆與該畫面無關的 `| null`。

### 已經核對過的一件事（§十六 #11）

從正式專案產生的 types 裡：

```ts
create_parent_task_v1: { Args: { p_command: Json }; Returns: Json }
```

與 `SupabaseParentTaskCreationService` 的
`supabase.rpc(CREATE_PARENT_TASK_RPC, { p_command: command })` 一致。

---

## 6. 長期任務進度標籤（§十一）✅

新建立的長期任務原本顯示「第 0 關 / 共 1 關」、「完成 0 次 / 目標 1 次」——
那兩行是 `?? 1` / `?? 0` 生出來的，宣稱一個孩子從沒同意過的目標。

`src/lib/longTermTaskProgress.ts`：

| 形式 | 顯示 |
|---|---|
| 成長計畫（有里程碑） | 已完成 X / Y 個階段 |
| 成長計畫（無里程碑） | 進行中的成長計畫 |
| 短期支援 | 預計第 7 天一起回顧／14 天生活小計畫 |
| 家庭角色 | 預計第 7 天一起回顧／4 週家庭角色 |
| legacy（`reward_policy` 為 null） | **原本的關卡／次數，一字未改** |

`progressPercentOf` 算不出比例時回 **null 而不是 0**，
畫面據此**不渲染進度條** —— 空的進度條同樣是在說「一點都沒做」。

### ⚠️ 已知不精確

成長計畫的「已完成 X 個階段」用的是 `task_completions` 的次數。
**完成次數不等於階段數**：沒有任何一張表記錄「哪個里程碑被達成了」。
規格 §十一 指定了 `completionCount` 這個參數，所以照做，
但要真的準確需要里程碑完成紀錄（列入待辦）。

---

## 7. 列表分組語意（§十二）✅

第七階段 C 把 `family_contribution` 與 `progress` 併進「生活紀錄」當作
「不讓任務消失」的權宜。現在一對一：

| 分區 | 名稱 | 副標 |
|---|---|---|
| `family_contribution` | 家庭參與 | 記錄孩子對共同生活的投入，不發成長幣 |
| `progress` | 進度與肯定 | 回饋投入、持續與進步，不直接發成長幣 |
| `coin_reward` | 成長幣任務 | 完成後可獲得成長幣 |
| `record_only` | 一般紀錄 | 完成後保留紀錄，不發成長幣 |
| `legacy_time_saving` | 時間儲蓄任務 | 完成後累積親子共處時間 |
| `legacy_life_record` | 生活紀錄 | 日常自理與家庭分工，不兌換成長幣 |

頁面不會因此變碎：空的區塊本來就不渲染，一個家庭同時只會有兩三種。
`displayGroupShowsCoins` 只對 `coin_reward` 回 true。

---

## 8. ⛔ 未執行的段落

| 規格段落 | 內容 | 為什麼 |
|---|---|---|
| §六 | 在 staging 套 migration | 沒有 staging |
| §七 | staging 測試資料 | 同上（本機模擬版已寫在 `real_schema_e2e.sql`） |
| §八 | 產生 types | 同上 |
| §九 | App 連 staging 人工建立五種任務 | 同上 |
| §十 | PostgREST 層 idempotency | 同上 |
| §十三 | staging 完成行為 | 同上（DB 層已驗，PostgREST 層未驗） |
| §十四 | 成功／刷新人工驗收 | 同上 |

§九、§十三、§十四 的**資料庫層**已經在真實 schema 上驗過；
沒驗的是 PostgREST、真 JWT、RLS 以 `authenticated` 身分執行，以及 App 的手動操作。

---

## 9. production 部署前 checklist

- [ ] 建立 staging project，跑完 §六～§十、§十三～§十四
- [ ] **先確認 `20260731000000` 已套用**，否則家庭角色任務會建立失敗
- [ ] 產生 `database.generated.ts` 並與手寫型別對齊
- [ ] 核心表 schema 回填進 migrations（AUDIT P1-7；目前無法從 repo 重建資料庫）
- [ ] 確認 `preset_task_replay_payload` 在 Supabase 的 owner 下，
      `REVOKE ... FROM authenticated` 真的生效
- [ ] `taskActions.createFamilyGoal` 的 `'responsibility'` 修正需要實際回歸測試
      （它先前是壞的，沒有測試覆蓋）
- [ ] 成長計畫的階段完成紀錄（目前用完成次數近似）
- [ ] 確認 `.env.local` 沒有被 commit

---

## 附錄：本文件不含

anon key、service role key、DB 密碼、家庭真實資料、正式 project URL。
正式 project ref 一律以 `<PROD_REF>` 表示。
