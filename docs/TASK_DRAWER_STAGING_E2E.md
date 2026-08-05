# 預設任務抽屜｜staging E2E 驗收

> 這份記的是**實際跑過什麼**，以及**還沒跑什麼**。
> 沒有跑過的段落一律標著「⛔ 未執行」，不會用 runbook 的存在冒充驗收結果。

---

## 摘要

| | |
|---|---|
| 日期 | 2026-07-28 |
| Supabase staging | ✅ 已建立（`growbook-staging`，Singapore），ref 與正式專案不同 |
| §六 bootstrap | ✅ baseline + `20260730` + `20260731` 已套用 |
| §七 QA 資料 | ✅ 1 家庭 / 2 家長 / 1 個 8 歲孩子 / 1 錢包（＋第二家庭供跨家庭測試） |
| §八 database types | ✅ 已從 staging 產生並 commit |
| §九 五種任務建立 | ✅ 走 PostgREST + 真 JWT，通過 |
| §十 idempotency | ✅ PostgREST 層通過 |
| §十三 完成流程 | ✅ 通過（13 條） |
| §十四 App 人工驗收 | ⛔ **未執行**（需要人在 Expo 上實際操作） |
| 長期任務進度標籤（§十一） | ✅ 已修 |
| 列表分組語意（§十二） | ✅ 已修 |
| 發現的 production bug | **1 個 P0**（家庭角色任務在正式資料庫上建不出來） |
| 對 production 的操作 | **只有一次唯讀 schema dump**。沒有推送任何 migration |

staging 的 project ref 在本文件一律寫成 `<STAGING_REF>`，正式的寫成 `<PROD_REF>`。

---

## 1. 目標確認（§二～§四）

```
$ supabase projects list
LINKED | REFERENCE ID   | NAME               | REGION
       | <PROD_REF>     | (正式專案)          | Sydney
  ●    | <STAGING_REF>  | growbook-staging   | Singapore
```

執行前的檢查，全部通過：

| 檢查 | 結果 |
|---|---|
| staging ref ≠ 正式 ref | ✅ |
| `.env.local` 指向 staging | ✅ 0 次正式 ref |
| `.env.local` 被 Git 忽略 | ✅ `.gitignore:45`，且未被追蹤 |
| staging 沒有正式家庭資料 | ✅ `public` 0 張表、`auth.users` 0 筆（正式專案有 27 張表） |
| 有沒有連過 production 的 DB | **沒有**。對正式專案只跑過 `projects list`（管理 API 列 metadata） |

每一個會寫入的指令執行前都先印出目標 ref，不符就中止。

### ⚠️ `.env` 仍指向 production

`.env`（未追蹤、`.gitignore:44` 有擋）裡的 `EXPO_PUBLIC_SUPABASE_URL` 是正式專案。
Expo 的載入順序讓 `.env.local` 蓋過它，所以現在 App 連的是 staging；
但只要 `.env.local` 被刪掉或改名，**App 會無聲地退回連正式專案**，畫面上看不出差別。
QA 期間值得留意。

### 修正過的一個設定錯誤

`.env.local` 原本填的是 `https://<STAGING_REF>.supabase.co/rest/v1/`（REST endpoint）。
`EXPO_PUBLIC_SUPABASE_URL` 要的是專案根 URL —— supabase-js 會自己接 `/rest/v1`，
填了會組出 `.../rest/v1//rest/v1`。已改成根 URL。

---

## 2. schema baseline（§五）✅

`supabase/migrations/` 從來沒有建立過核心表（AUDIT P1-7），所以 staging 需要一份 schema 起點。

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

⚠️ `--dry-run` 會把 CLI 臨時建立的登入角色密碼印到 stdout。那份腳本用完就刪，沒有進 repo。

### 驗證結果

| 檢查 | 結果 |
|---|---|
| 核心表 | 27 張全在 |
| top-level `INSERT` / `COPY` / `FROM stdin` / `setval` | **0**（沒有任何資料） |
| 檔內的 `INSERT INTO` | 32 處，**全部縮排在 plpgsql 函式主體內**，不是資料 |
| 家庭真實資料（「承恩」） | **0** |
| `auth.users` 資料 | **0**（只有外鍵參照） |
| vault / 正式 URL / project ref / 密碼 | **0** |
| verification harness 的表 | **0** |
| OWNER | 只有 `postgres` 與 `pg_database_owner`，沒有個人帳號 |
| RLS | 27 張表啟用，48 條 policy |

檔案 124 KB / 3176 行。

---

## 3. bootstrap 策略：**A** ✅ 已在 staging 執行

正式專案的 migration history 停在 `20260729000000`，baseline 就是「所有舊 migration
套用完成後的基準」，所以採 **策略 A**：baseline 先落地，之後只套 `20260730` 起。

### 為什麼不能直接 `db push` 27 支

staging 是全新專案，migration history 是空的，`db push --dry-run` 一開始列出全部 27 支。
**不能就這樣跑** —— 這正是這一輪 P0 的成因：

```
supabase/baseline/public_schema.sql:1988
    CONSTRAINT "tasks_long_term_type_check" CHECK (long_term_type = ANY
      (ARRAY['habit','skill','responsibility','challenge']))
```

這條 CHECK **不存在於任何一支 repo migration**，只活在 live DB。
用 27 支 migration 建出來的 staging 會缺這條約束，E2E 會全過，然後 production 一樣爆掉 ——
等於重演 §三 禁止的「假設 harness 等於 production schema」。

### 實際執行順序

```bash
# 1. 25 支歷史 migration 標記為已套用（只寫 migration history，不執行 SQL）
supabase migration repair --status applied 20260518000000 … 20260729000000

# 2. baseline 灌進 staging（單一 transaction，ON_ERROR_STOP）
psql "$POOLER_URL" -v ON_ERROR_STOP=1 --single-transaction \
     -f supabase/baseline/public_schema.sql          # exit 0，無錯誤

# 3. 確認只剩該套的兩支
supabase db push --dry-run
#  • 20260730000000_create_parent_task_idempotency.sql
#  • 20260731000000_fix_family_role_long_term_type.sql

# 4. 套用
supabase db push
```

全程沒有在 Dashboard 手動點過任何欄位。

### 套用後驗證

| 物件 | 結果 |
|---|---|
| `tasks.creation_request_id` | `uuid` |
| `tasks_creation_request_id_key` | UNIQUE INDEX（partial，`WHERE creation_request_id IS NOT NULL`） |
| `tasks_preset_needs_request_id_check` | `CHECK (NOT created_from_preset OR creation_request_id IS NOT NULL)` |
| `preset_task_replay_payload` | 存在；`EXECUTE` 只給 `postgres` 與 `service_role`，**`anon` / `authenticated` 都沒有** |
| `create_parent_task_v1` 的 `long_term_type` | `family_role → 'responsibility'`（不再是 `'family'`） |

---

## 4. QA 資料（§七）✅

`supabase/verify/staging/qa_seed.sql`。**沒有使用任何正式 Demo 的真實帳號資料**，
也沒有寫進 `supabase/seed.sql` 或任何 production 路徑。

| | |
|---|---|
| 家庭 | QA Family A（主要）、QA Family B（跨家庭測試用） |
| 家長 | QA Parent A、QA Parent B（同 A 家）、QA Parent C（B 家） |
| 孩子 | QA Child 8，`age_group = 6-9` |
| 錢包 | spending，初始 0 |
| auth | 三個帳號都有真實可登入的 `auth.users` + `auth.identities` |

QA 帳號密碼以 `QA_PASSWORD` 環境變數傳入，**不寫進 repo**。

### 兩個踩過的坑

**GoTrue「Database error querying schema」**：手動建 `auth.users` 時，
`confirmation_token` / `recovery_token` / `email_change_token_new` / `email_change`
沒有 default，會是 NULL；GoTrue 以非 nullable 的 Go 字串掃這些欄位，一 NULL 就 500。
補成空字串即可，已寫進 seed。

**GoTrue 的 email 驗證與寄信 rate limit**：`signup` 端點會擋掉沒有 MX 的網域，
而且預設每小時只能寄兩封。改成直接建 `auth.users` 再用
`/auth/v1/token?grant_type=password` 登入，兩個限制都不會碰到。

### ⚠️ 規格 §七 與真實 schema 的衝突

§七 要求「1 個 parent 額外屬第二個家庭」。**真實 schema 做不到**：

```sql
CREATE UNIQUE INDEX idx_parents_user_id ON public.parents (user_id);
```

一個 auth 帳號只能對應一個 parent 列、也就是一個家庭。
seed 改成把這個約束本身斷言出來（把同一個 user 塞進第二個家庭 → `unique_violation`），
而不是假裝做到了。

順帶一提：第七階段 B 修 `parents ... LIMIT 1` 授權時，理由之一是
「同一個 auth 帳號在兩個家庭時會挑到錯的那一個」。有了這個 unique index，
**那個情境目前不可能發生**。改成集合比對仍然是對的（它同時修掉了
「比對某一個 family 而不是這個孩子的 family」這個真的 bug），
但當時對多家庭風險的描述講過頭了。

---

## 5. database types（§八）✅

```bash
supabase gen types typescript --linked --schema public > src/types/database.generated.ts
```

用 `--linked`，**指令裡不出現 project ref**（`--db-url` / `--local` 需要 Docker；
`--linked` / `--project-id` 走 management API 不需要）。

產出 1715 行，含 `creation_request_id`（Row / Insert / Update 三處），0 個 project ref。
`npx tsc --noEmit` 加入這個檔案後仍是既有的 2 個 baseline error，沒有增加。

### 採用的策略：**B**

- `database.generated.ts` 描述真實的 Row / Insert / Functions（DB source of truth）
- 現有的 `Task` 等 application interface 保留為**投影型別**：畫面真的 select 的欄位
- 兩者之間用 mapper 銜接

理由：`tasks` 現在有 40 多欄、大部分 nullable。讓它們直接流進每個 component，
會讓每一處都要處理一堆與該畫面無關的 `| null`。

### 核對（§十六 #11）

```ts
create_parent_task_v1: { Args: { p_command: Json }; Returns: Json }
```

與 `SupabaseParentTaskCreationService` 的
`supabase.rpc(CREATE_PARENT_TASK_RPC, { p_command: command })` 一致。

`preset_task_replay_payload` 也出現在 generated 的 Functions 裡 —— 那只是
`gen types` 會列出 public schema 所有函式，它的 `EXECUTE` 並沒有給
`authenticated`，客戶端呼叫不到。

---

## 6. staging E2E（§九／§十／§十三）✅

腳本在 `supabase/verify/staging/`，可重跑：

```bash
export STAGING_REF=<STAGING_REF>          # 必填，腳本不猜目標
export FORBIDDEN_REF=<PROD_REF>           # 選填，多一道保險
export QA_PASSWORD=...                    # QA 帳號密碼，不寫進 repo
export QA_OUT=/tmp/created.json

python supabase/verify/staging/create_and_idempotency.py   # 28 條
python supabase/verify/staging/completion.py               # 13 條
```

不給 `STAGING_REF`、或 ref 與 `.env.local` 的 URL 不符，腳本直接中止（已實測）。

**走的是 App 實際的路徑**：GoTrue 簽出的 access token → PostgREST → RLS → RPC。
不是 `set_config('test.uid', …)` 假造的授權。

### §九 五種任務建立（28 條中的前 15 條）

| 形式 | reward_policy | 結果 |
|---|---|---|
| 單次｜學校作業 | `record_only` | ✅ 無幣值、`claim_period = once` |
| 固定｜餐桌 | `family_contribution` | ✅ B 類、無幣值 |
| 成長計畫｜四週閱讀 | `coin_eligible` | ✅ 幣值 12、`base_time_min = 0`、`long_term_goals.goal_type = skill` |
| 短期支援｜整理書包 | `progress_only` | ✅ `total_days = 14` |
| 家庭角色｜餐桌小幫手 | `family_contribution` | ✅ `long_term_type = responsibility`、角色與兩項負責內容都寫入 |

RLS 一併驗了：家長 A 只看得到自己家庭的孩子，家長 C 看不到 A 家的孩子。

### §十 idempotency（PostgREST 層）

| # | 情境 | 結果 |
|---|---|---|
| 1-2 | 首次送出 | ✅ 成功，`idempotentReplay` 不為 true |
| 3-5 | 同一個 `clientRequestId` 再送 | ✅ 回同一個 `taskId`，`idempotentReplay: true` |
| 6 | 資料庫列數 | ✅ 只有一筆 |
| 7 | 同家庭的另一位家長重送同一個識別碼 | ✅ 拿到同一筆，不重複建立 |
| 8-9 | **另一個家庭猜中識別碼** | ✅ HTTP **403**，且沒有洩漏 `taskId` |
| 10 | 未登入呼叫 | ✅ HTTP **401** |
| 11 | 上述嘗試之後 | ✅ 仍然只有一筆 |
| 12 | 換新的識別碼 | ✅ 建出不同的任務 |
| 13 | 非 UUID 的識別碼 | ✅ `VALIDATION_FAILED`，不進資料庫 |

失敗回應的鍵是 `code`（不是 `errorCode`），與 adapter 的 `payload.code` 一致。

### §十三 完成流程（13 條）

| 形式 | 錢包 | 結果 |
|---|---|---|
| `coin_eligible` | 0 → 12 | ✅ completion log 金額一致；`estimated_minutes` 是 20 而幣值是 12 —— **沒有拿分鐘當幣值** |
| `family_contribution` | 12 → 12 | ✅ 0 幣，且**沒有寫 `time_savings`** |
| `record_only` | 12 → 12 | ✅ 0 幣，仍留下完成紀錄 |
| `progress_only` | 12 → 12 | ✅ 0 幣 |
| 家庭角色 | 12 → 12 | ✅ 0 幣 |

跨家庭完成 → **403**；跨家庭讀錢包 → 0 筆。
五次完成後餘額是 12：**只有可發幣那一種給了幣**。

上述結果是把 staging 清空、用 repo 裡的腳本從頭重跑一次得到的，
不是開發過程中累積的狀態。

---

## 7. 🔴 發現的 production bug（P0）

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
2. `supabase/verify/task_reward_verification.sql` 自己建 13 張**簡化**的表，
   沒有這條 CHECK —— 它的 93 條 assertion 全過。
3. App 端也一路用 `'family'`：`LongTermType`、`useParentLongTermGoals`、
   `useLongTermTasks`、孩子端的 `longTermGoalPresentation`，
   以及 **`taskActions.createFamilyGoal`** —— 也就是說
   **既有的家庭長期任務建立路徑同樣是壞的**，只是沒有測試覆蓋。

修正：

- `supabase/migrations/20260731000000_fix_family_role_long_term_type.sql`（只改一個 CASE 分支）
- App 端 `'family'` → `'responsibility'`（DB 值）。
  孩子端 presentation 自己的 `goalKind: 'family'` **保留** —— 那是給孩子看的說法，不是資料庫的值。

不需要資料修補：CHECK 擋著，資料庫裡不可能有 `long_term_type = 'family'` 的列。

這個 bug 是「用正式 schema 而不是簡化 harness」才抓到的，
也是 §三 那條規則實際發揮作用的例子。

---

## 8. 長期任務進度標籤 ✅（第七階段 F 修正過一次）

新建立的長期任務原本顯示「第 0 關 / 共 1 關」、「完成 0 次 / 目標 1 次」——
那兩行是 `?? 1` / `?? 0` 生出來的，宣稱一個孩子從沒同意過的目標。

第一次修正改成「已完成 X / Y 個階段」，其中 X 是 `task_completions` 的筆數。
**那同樣是假的**，而且更難察覺，因為它看起來很合理 ——
孩子讀了 7 次書、全都還在第一個里程碑範圍內，畫面會說「已完成 5 / 5 個階段」。

現在的規則是：**里程碑只講規劃與時程，不講完成**。

`src/lib/longTermTaskProgress.ts`：

| 形式 | 顯示 |
|---|---|
| 成長計畫（有里程碑） | 已規劃 5 個里程碑＋「下一個里程碑：第 14 天」 |
| 成長計畫（時程都過了） | 已規劃 5 個里程碑＋「里程碑時程已到，建議一起回顧」 |
| 成長計畫（無里程碑） | 進行中的成長計畫 |
| 短期支援 | 14 天生活小計畫＋「預計一週後一起回顧」 |
| 家庭角色 | 四週家庭角色＋「預計一週後一起回顧」 |
| legacy（`reward_policy` 為 null） | **原本的關卡／次數／進度條，一字未改** |

`showProgressBar` 是型別的一部分：新任務的四種形式全部是**字面型別 `false`**，
有人想在成長計畫上畫進度條時 TypeScript 會先擋下來。
`progressPercentOf` 只有 legacy 算得出數字，其餘一律 null（**不是 0** ——
空的進度條同樣是在說「一點都沒做」）。

「下一個里程碑」由 `findNextPlannedMilestone` 算：依 `targetDay` 重排
（不相信資料原順序）、今天正好是里程碑日期時仍算「下一個」、
**不因完成次數跳過任何里程碑**、不修改傳入陣列、全程用 `YYYY-MM-DD`
字串與 `Date.UTC` 計算避免時區位移。

### ⚠️ milestone completion 尚未實作

`task_plan_milestones` 只有 `title` / `target_day` / `sort_order`。
要真的顯示「已完成 X / Y 個里程碑」，需要一張 completion 表
（`milestone_id` / `completed_at` / `completed_by` / 可撤銷的狀態）。
在那之前任何 X 都是推測。詳見 [DEMO_DATA_GUIDE.md](DEMO_DATA_GUIDE.md)。

---

## 8b. staging 上的兩組資料

| | QA regression | Demo showcase |
|---|---|---|
| 腳本 | `qa_seed.sql` | `demo_reset.sql` / `demo_seed.sql` / `run_demo.sh` |
| 家庭 | QA Family A／B | GrowBook Demo Family |
| 孩子 | QA Child 8 | 承恩（8 歲） |
| 名稱 | **刻意技術性**，E2E 會斷言 | 家長會唸出口的話 |

`demo_reset.sql` 的每一條 DELETE 都以 Demo family 的固定 id 為範圍，
動手前先確認那個 id 的 `family_name` 真的是 `GrowBook Demo Family`。
沒有 TRUNCATE、沒有無 WHERE 的 DELETE。**QA 那組不會被波及**（有測試盯著）。

reset → seed 連跑兩次結果完全一致，實測比對過所有計數。

完整說明見 [DEMO_DATA_GUIDE.md](DEMO_DATA_GUIDE.md)。

---

## 9. 列表分組語意（§十二）✅

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

## 10. ⛔ 未執行

| 規格段落 | 內容 | 為什麼 |
|---|---|---|
| §十四 | App 人工驗收：在抽屜裡建立任務、看成功摘要、確認列表刷新與分頁切換 | 需要人在 Expo 上實際點擊，不是程式能代跑的 |

§九／§十／§十三 的**後端行為**已經在 staging 上以真 JWT 走 PostgREST 驗過；
沒驗的是 App UI 本身的操作與畫面。

### §十四 要怎麼跑

```bash
# .env.local 已指向 staging
npx expo start
```

用 `qa-parent-a@example.invalid` 登入（密碼即 `QA_PASSWORD`），
然後照 §十四 的項目逐條操作。要重置資料就重跑 `qa_seed.sql`。

---

## 11. production 部署前 checklist

- [ ] **先確認 `20260731000000` 已套用**，否則家庭角色任務會建立失敗
- [ ] 跑完 §十四 App 人工驗收
- [ ] 核心表 schema 回填進 migrations（AUDIT P1-7；目前無法從 repo 重建資料庫）
- [ ] `taskActions.createFamilyGoal` 的 `'responsibility'` 修正需要實際回歸測試
      （它先前是壞的，沒有測試覆蓋）
- [ ] 成長計畫的階段完成紀錄（目前用完成次數近似）
- [ ] 移除 `.env.local` 的 `SUPABASE_DB_PASSWORD`（QA 結束後就不需要了）
- [ ] 處理 `.env` 仍指向 production 的無聲退回風險
- [ ] 確認 `.env.local` 沒有被 commit

---

## 附錄：本文件不含

anon key、service role key、DB 密碼、QA 帳號密碼、家庭真實資料、正式 project URL。
project ref 一律以 `<PROD_REF>` / `<STAGING_REF>` 表示。
