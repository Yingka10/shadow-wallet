# 預設任務抽屜｜真實 PostgreSQL 驗證紀錄

> 這份記的是**實際跑過什麼**，不是「測試檔存在」。
> 每一條結論都對應一次真的執行。

---

## 摘要

| | |
|---|---|
| 驗證日期 | 2026-07-28 |
| PostgreSQL 版本 | **17.4**（`PostgreSQL 17.4 on x86_64-windows, compiled by msvc-19.42.34436, 64-bit`） |
| 環境 | **local** —— 用本機安裝的 PostgreSQL 17 binaries 另外 `initdb` 出來的一次性 cluster |
| 資料庫名稱 | `growbook_task_verify` |
| 結果 | **ALL CHECKS PASSED**，psql exit code **0** |
| assertion 數 | **66** 條全過，0 個 ERROR |
| generated types | **未產生**。改用真實查詢核對手寫型別，見 `TASK_DRAWER_VERIFIED_SCHEMA.md` |

---

## 環境怎麼來的

原本的計畫是用本機既有的 PostgreSQL 17 服務（port 5432），但它需要
postgres 密碼，而密碼不在手上，且不應該把密碼放進對話或 repo。

改用的做法是**另外開一個一次性 cluster**：用同一套 PostgreSQL 17 binaries
`initdb` 到暫存目錄、trust 認證、跑在 port 55432。

這樣有三個好處：
- 完全不碰使用者現有的 5432 cluster 與其中的資料
- 不需要任何密碼，也不需要改 `pg_hba.conf`
- 用完整個目錄刪掉就乾淨了

**沒有連線到正式 Supabase 專案，沒有執行 `supabase db push`，
沒有把任何密碼或連線字串寫進 repo 或測試檔。**

```bash
initdb -D <暫存目錄> -U postgres --auth=trust --encoding=UTF8 --locale=C
postgres -D <暫存目錄> -p 55432 -c listen_addresses=localhost
```

## 實際執行的命令

```bash
export PGHOST=localhost PGPORT=55432 PGUSER=postgres

dropdb --if-exists growbook_task_verify
createdb growbook_task_verify

psql -d growbook_task_verify -v ON_ERROR_STOP=1 \
     -f supabase/verify/task_reward_verification.sql

# schema snapshot
psql -d growbook_task_verify \
     -f supabase/verify/task_drawer_schema_snapshot.sql

dropdb growbook_task_verify
```

正式環境（port 5432，需要密碼）的等價命令：

```bash
createdb -h localhost -p 5432 -U postgres growbook_task_verify
psql -h localhost -p 5432 -U postgres -d growbook_task_verify \
     -v ON_ERROR_STOP=1 -f supabase/verify/task_reward_verification.sql
dropdb -h localhost -p 5432 -U postgres growbook_task_verify
```

---

## 遇到的問題

### 1. 批次改名把 `jsonb_build_object` 的參數改成奇數個（**在跑之前發現**）

拆分 `policy_version` 語意時用批次取代改欄位名，兩條規則互相咬到，
稽核事件那段變成：

```sql
'policyVersion',    v_task_policy_version, v_reward_policy_version,
```

`jsonb_build_object` 要求成對的 key/value，奇數個參數會在**建立函式時**
就被 Postgres 擋下（`42883 / function jsonb_build_object(...) does not exist`）。

這一條是在執行前 review 檔案時發現並修掉的，所以它沒有出現在 psql 的輸出裡。
修法不是補一個參數，而是把稽核 snapshot 重寫成明確的 `versions` 區塊
（四種版本各一個鍵）。

### 2. Python 批次改寫把兩支 migration 從 LF 變成 CRLF（**Jest 抓到**）

用 Python 改 SQL 檔時沒有指定 `newline='\n'`，Windows 預設把 `\n` 展開成
`\r\n`，整份檔案的行尾都變了。SQL 本身照跑，但既有的靜態測試用
`toContain('...\n...')` 比對多行片段，全部失配。

這是工具用法的問題不是 SQL 的問題，但它示範了一件事：**只有靜態字串測試的時候，
一個純格式的改動看起來會像功能壞掉**。已全部轉回 LF。

### 3. `pg_ctl start` 在這個 shell 裡不會 detach

第一次啟動暫存 cluster 時 `pg_ctl start` 佔住 shell 直到 timeout，
timeout 又把整個 process group 殺掉，於是 server log 顯示「ready」但
`pg_isready` 說連不上。改成直接跑 `postgres` 並放到背景才穩定。

### 4. Postgres 本身回報的錯誤：**沒有**

migration 與 harness 第一次對真實 Postgres 執行就完整通過，
沒有語法錯誤、沒有型別錯誤、沒有 constraint 建立失敗。

---

## 這支腳本真的驗到了什麼

不是搜尋 SQL 文字 —— 它建 schema、跑 migration、呼叫 RPC、查結果、
用 `RAISE EXCEPTION` 主動失敗。`ON_ERROR_STOP=1` 全程開啟。

### Schema 層（12 條）

- 8 條 CHECK constraint 確實建立
- 五張子表 `relrowsecurity = true`，各有一條 SELECT policy
- `create_parent_task_v1` 建立成功且是 SECURITY DEFINER
- grants：`authenticated` 可執行、`anon` 不可、`service_role` **刻意未開通**
- 稽核表 `authenticated` 只有 SELECT 沒有 INSERT
- `tasks` 有四種版本欄位，且**沒有**殘留 `policy_version`

### 建立（五種形式都實測）

| 形式 | 結果 |
|---|---|
| 單次 | 建立成功；`claim_period = once`；`scheduled_date` 有值而 `due_date` 為 NULL |
| 固定星期 | 建立成功；`recurrence_days = {1,3,5}`；幣值寫進 `reward_coin_amount`，`base_time_min` 仍為 0 |
| 每週次數 | 建立成功；`claim_period = week`、`max_claims_per_period = 3`、`weekly_frequency = 3`（次數沒有被丟掉） |
| 成長計畫 | 建立成功；2 個里程碑進子表；`long_term_goals` 一併建立 |
| 短期支援 | 建立成功；支援步驟進子表 |
| 家庭角色 | 建立成功；負責內容進子表；沒有幣值；`reward_policy_version` 是**資格政策**而非幣值政策 |

### 政策拒絕（7 條）

時間儲蓄、0 幣、超出 min/max、決策與命令不一致、缺 `rewardPolicyVersion`、
缺 `taskPolicyVersion`、家庭參與選可發幣 —— 全部被擋，且
`tasks` / `child_tasks` / `long_term_goals` 的列數**完全沒變**。

### Transaction rollback（真的觸發）

送一個同一選項組重複兩次的命令，讓 `task_preset_selections` 的 unique
在 `tasks`、`child_tasks`、子表都已經 insert 之後才爆。
結果：例外拋出，且 `tasks` 與 `child_tasks` 的列數回到操作前 —— **沒有孤兒**。

這不是靠 `DELETE` 補償，函式裡一行 `DELETE FROM` 都沒有。

### 授權（8 條）

- anon 建立 → 42501
- anon 完成 → 42501
- 跨家庭建立 → 42501
- 跨家庭完成 → 42501
- `command.familyId` 與孩子的家庭不符 → 42501
- 任務與孩子不同家庭 → 42501（舊版只驗孩子，這條是本輪補的）
- 同一 user 屬於兩個家庭 → 寫進**正確**的家庭
- 同一家庭第二位家長 → 可正常操作

`redeem_wish` 另外兩條：拿別人家的獎勵扣自己錢包、對別人家的孩子兌換，都被擋。

### 完成與幣值

| 情境 | 實測結果 |
|---|---|
| coin_eligible | 發 10 幣，錢包餘額實際 +10，金額落在 min/max 之間 |
| family_contribution | 0 幣，錢包不動，**沒有**寫 `time_savings` |
| record_only | 0 幣 |
| progress_only | 0 幣 |
| time_saving_eligible | `{"error":"time_saving_not_enabled"}`，沒有降級成 coin 或 record_only |
| legacy（`reward_policy IS NULL`） | `base_time_min 20 × difficulty 1` = **20 幣**，行為不變 |
| legacy + 前置未完成 | **14 幣**（20 × 0.7），折扣行為不變 |

### override 夾制

- 對 coin_eligible 任務請求 9999 → 實際套用 **25**（政策上限）
- 對 family_contribution 任務請求 50 → 實際套用 **0**，錢包不動
- 對 legacy 任務請求 7 → 實際 **7**，舊行為不受影響

### 最終盤點

每一筆 `created_from_preset` 的任務都有 `child_tasks`；
每一筆長期任務都有 `long_term_goals`；每一筆都有 `task_change_events`。

### 四種版本（實測寫入值）

`tasks` 上：

```
task_policy_version    = task-taxonomy-2026-07
reward_policy_version  = coin-policy-1.0.0        （可發幣的任務）
                       = reward-eligibility-2026-07（不發幣的任務）
preset_catalog_version = 2026-07-28
command_schema_version = 1
```

`task_change_events.snapshot -> 'versions'` 四個鍵齊全，
`snapshot -> 'reward'` 保存 `finalAmount` / `suggestedAmount` / `calculationBasis.band`。

---

## 負向對照：確認這支腳本不是空轉

跑完之後另外做了三次故意失敗：

| 對照 | 結果 |
|---|---|
| 直接 INSERT 一筆 0 幣的 coin_eligible task | `ERROR: violates check constraint "tasks_coin_eligible_needs_amount_check"` |
| 直接 INSERT 一筆帶幣值的 family_contribution task | `ERROR: violates check constraint "tasks_non_coin_has_no_amount_check"` |
| `PERFORM vassert(false, ...)` | `ERROR: FAILED: deliberate failure`，psql **exit code 3** |

第三條證明 assertion 失敗真的會中止腳本，不是印出來給人看。

---

## 關於「migration 重複套用」

**刻意不驗證**同一支 migration 跑兩次。

正式的 Supabase migration 歷史不會重複套同一個檔案；把「可任意重跑」當成
驗收條件，只會逼出一堆遮蔽 schema 漂移的 `IF NOT EXISTS`。
既有檔案裡的 `IF NOT EXISTS` / `DROP CONSTRAINT IF EXISTS` 保留著
（它們本來就在，而且對 `CREATE OR REPLACE FUNCTION` 是必要的），
但不是這份驗證的驗收條件。

真正驗證的是：**在正確的 migration 歷史順序下，從乾淨的資料庫可以一次套用成功，
而且套完之後行為正確。**

---

## 哪些是真實 SQL、哪些仍只是 Jest 靜態測試

| 項目 | 驗證方式 |
|---|---|
| migration 可執行、函式可建立、constraint 可建立、RLS 可建立 | **真實 SQL** |
| 五種建立、政策拒絕、rollback、授權、完成幣值、override 夾制 | **真實 SQL** |
| 四種版本寫入與 audit snapshot | **真實 SQL** |
| grants（anon / authenticated / service_role） | **真實 SQL** |
| schema 欄位、型別、nullable | **真實 SQL**（`information_schema`） |
| 「SQL 裡有沒有寫某條規則」（例如沒有 `parents ... LIMIT 1`） | Jest 靜態字串 |
| 「所有 guard 都在第一個 INSERT 之前」 | Jest 靜態字串（行為面由 rollback 測試間接覆蓋） |
| TypeScript domain 層（reward decision、capability selector、命令映射） | Jest 單元測試（純函式，不需要 DB） |
| UI 隱藏 time_saving / coin_eligible | Jest render 測試 |

---

## 尚未驗證的部分

1. **真正的 Supabase 環境**。harness 是裸 Postgres 加一個 `auth.uid()` 替身，
   不是 Supabase。RLS policy 建得起來、SELECT policy 的語句正確，
   但沒有在真的 JWT / PostgREST 之下跑過。
2. **核心表仍不在 migrations 裡**。harness 自己建了 13 張表才跑得起來。
   這代表任何人都無法從 repo 從零重建這個資料庫 —— 這是獨立於本輪的既有問題。
3. **generated database types**。需要一個可連的非 production Supabase 專案。
4. **Drawer 到 service 的串接**。本輪仍未接上（第七階段 C）。
