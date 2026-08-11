# staging 上的兩組資料

> 本文件不含密碼、金鑰、project ref 或任何真實家庭資料。

staging 上同時住著兩組資料，用途相反。搞混它們的後果不對稱：
把 Demo 弄髒只是難看，把 QA 弄壞會讓 regression 再也跑不起來。

| | QA regression | Demo showcase |
|---|---|---|
| 腳本 | `supabase/verify/staging/qa_seed.sql` | `demo_reset.sql` + `demo_seed.sql` |
| 家庭 | QA Family A／B | GrowBook Demo Family |
| 帳號網域 | `@example.invalid` | `@growbook-demo.invalid` |
| 孩子 | QA Child 8 | 承恩（8 歲） |
| 名稱風格 | **刻意技術性** | 家長會唸出口的話 |
| 誰在用 | `create_and_idempotency.py` / `completion.py` | 人 |

**不要為了畫面好看去改 QA seed。** 那些字串是 E2E 的斷言對象 ——
「QA idempotency 測試」這個名字看起來像垃圾，但它是第十二條測試的證據。

---

## Demo State

Demo 資料分成兩個狀態。**Reset Point 是 State A。**

| | 內容 | 狀態 |
|---|---|---|
| **State A**｜Demo Start | 家庭身分 + 六筆背景任務 + 上週與本週的背景生活紀錄 + 兩份週報 | **現在可用** |
| **State B**｜Review Snapshot | State A + 閱讀提案（媽媽 4→3 → 孩子接受）+ 執行紀錄 | `WAITING_FOR_P0_5B` |

State A 的定義是：**「核心閱讀故事還沒開始，但這個家庭已經有一段真實生活歷史。」**

必須存在：家庭／家長／承恩／spending wallet、六筆背景任務與 active 指派、
三個長期目標、上週與本週的完成紀錄、對應 transactions、非 0 錢包餘額、
上週與本週的 `weekly_reports`、顧問看得到的 past-7-days 紀錄。

必須不存在：**任何 `child_proposals`**（含 plan version / status / trial /
adjustment 殘留），以及由閱讀提案產生的 canonical task。
reset 之後 `child_proposals` 在 Demo family 範圍內是 0。

> **每一次教授測試、影片錄製、正式 Demo、重要截圖之前，先 `reseed --state=a`。**
> 不要跨 ISO 週沿用上一輪的 Demo 資料 —— 週界以週一為首，週日 23:59 → 週一 00:00
> 「本週」的定義會整個換掉，前一天 seed 的資料會全部被算進「上一週」，
> 週報看起來會是空的。

### State B 之後要長什麼樣（P0-10B 再實作）

State A ＋ 閱讀提案 ＋ 媽媽把一週 4 次改成 3 次 ＋ 孩子接受
＋ canonical task `weekly_frequency = 3` ＋ 本週不同日期的完成紀錄。

⚠️ **這裡有一個產品一致性問題，P0-10B 要先拍板：**
故事是「4 → 3」，所以孩子接受之後正式計畫的 `weekly_frequency` 就是 **3**，
不是 4。那麼執行畫面正確的顯示是「本週 2/3」或「本週 3/3」，
**不會是「本週 3/4」** —— 3/4 只有在計畫仍是 4 次的情況下才成立，
而那和「媽媽調整成 3 次」互相矛盾。

建議展示 **本週 2/3**：還有進行中的感覺，週報也比較好談
「已經開始穩定進行，但仍有空間」。

---

## Demo 資料

### 內容

| 任務 | 形式 | 回饋 | 附帶 |
|---|---|---|---|
| 完成學校作業 | 單次 | 一般紀錄 | |
| 餐後整理 | 固定 | 家庭參與 | |
| 運動練習 | 固定 | 成長幣回饋 12 枚 | |
| 四週閱讀計畫 | 成長計畫 | 進度與肯定 | 5 個里程碑（第 3/7/14/21/28 天） |
| 整理書包 14 天 | 短期支援 | 進度與肯定 | 3 個支援步驟 |
| 四週餐桌小幫手 | 家庭角色 | 家庭參與 | 3 項負責內容 |

幣值 12 來自正式的 coin policy（6-9 歲、每次 20 分鐘），不是隨手填的數字。

**里程碑刻意都沒有標記完成。** 目前沒有 milestone completion model，
任何「已完成」都會是編的 —— 詳見下一節。

### 建立方式

任務全部走 `create_parent_task_v1`，不是手寫 `INSERT`。
Demo 看到的東西必須和 App 實際建立出來的一模一樣；手寫 INSERT 會在
schema 或 RPC 改動時默默漂移，然後 Demo 展示的是一個沒人跑過的路徑。

psql 裡讓 `auth.uid()` 認得 Demo 家長的方法：

```sql
PERFORM set_config('request.jwt.claims',
                   json_build_object('sub', <user_id>)::text, true);
```

### 背景生活紀錄（State A）

上週 5 筆、本週 4 筆，全部走 **`complete_task` → `record_completion_context`**
這兩支正式 RPC，不直接寫 `task_completions` / `transactions`，
更不直接 `UPDATE wallets SET balance`。

P0-6 已經把 completion／transaction／wallet 收斂進 `complete_task`；
seed 若改用 INSERT，等於複製一份發幣規則出來，之後任何規則改動
Demo 資料都會安靜地跟產品脫節。

| | 內容 |
|---|---|
| 上週 | 週一：運動練習 ＋ 整理書包；週三：餐後整理 ＋ 四週閱讀計畫；週五：運動練習 |
| 本週 | 運動練習、四週閱讀計畫、餐後整理、四週餐桌小幫手，輪流落在已經過去的週一/三/五 |
| 錢包 | **36 枚**（運動練習 12 × 3 次），等於 transactions 之和 |
| 開始方式 | `self_started` 5 ／ `reminded` 4 |
| 完成時段 | `after_dinner` 6 ／ `before_bed` 3 |

幾條刻意的設計：

- **只落在週一／三／五。** 六筆任務的 `recurrence_days` 就是 `[1,3,5]`，
  排定日以外的完成會被 `validRhythmCompletions` 丟掉 —— 孩子端看不到、
  週報卻算得到。那種不一致比少一筆紀錄糟得多。
- **本週只用「已經過去的」排定日。** 週一執行時只有一天可用，四筆就疊在
  那一天（不同任務，合法）；週日執行則自然攤成三天。哪一天跑都有合理資料。
- **長期任務的起點挪到上週一。** 否則背景紀錄會落在 plan window 之前，
  被 `buildGoalPresentation` 整個丟掉。
- **「完成學校作業」刻意不完成。** 它是 `day_type='once'`，完成後
  `child_tasks` 會被停用；留著它當「今天還沒做的那一件」。
- **沒有 C 類任務，而這是對的。** C（自主挑戰）依定義來自孩子自己提出，
  那正是 Demo 要現場 live 跑的那條故事線。State A 的 C 是空的，
  代表「孩子還沒提出想法」，不是資料缺漏。

seed 最後會自我驗證：錢包餘額必須等於交易總和、每一筆 `earn` 都要指得回
一次真的完成、背景紀錄剛好 9 筆。任何一條不成立就整包回滾。

### 週報

`weekly_reports` 由**正式的 `generate-weekly-report` Edge Function** 產生，
不手寫 JSON —— `ai_suggestions` 的欄位形狀決定前端「採用／修改／復原」
按鈕顯不顯示，手寫必然會漂移。

數字仍然是從真實 DB 資料即時彙總來的；deterministic 的只有文字與建議形狀，
而且該列會帶 `used_fallback: true`。**不要對外說那是 Gemini 生成的**，
產品上就叫「本週觀察／建議」。

> ⚠️ **staging 只設 `FORCE_WEEKLY_REPORT_FALLBACK=true`，
> 絕對不要設 `FORCE_AI_FALLBACK`。**
> 後者 `ai-proxy` 也讀，而 Supabase 的 secret 是 project 層級的 ——
> 打開它會把孩子提案的 AI 計畫草稿一起關掉，而那是 Demo 唯一必須 live 的 AI。
> runner 永遠不設舊旗標，有測試盯著。

### 執行

```bash
export DEMO_STAGING_REF=<staging ref>   # 必填，腳本不猜目標
export DEMO_PASSWORD=<Demo 家長的登入密碼>

supabase/verify/staging/run_demo.sh reset
supabase/verify/staging/run_demo.sh seed    --state=a
supabase/verify/staging/run_demo.sh reseed  --state=a   # 兩者依序
supabase/verify/staging/run_demo.sh dry-run --state=a   # 只數不寫
```

預設 `--state=a`。傳 `--state=b` 會回 `STATE_B_NOT_AVAILABLE_YET` 並退出，
**不會偷偷退回 A** —— 拿到 A 的資料卻以為是 B，比直接失敗糟得多。

走 `supabase db query --linked`，用 CLI 的臨時登入角色，**不需要資料庫密碼**。

### 防護

執行前 runner 會依序檢查，任何一項不符就中止：

1. `DEMO_STAGING_REF` 必填 —— 不猜目標
2. `supabase/.temp/project-ref` 必須完全相符
3. 專案名稱必須是 `growbook-staging`（比 ref 更難意外撞上）
4. **production ref 黑名單** —— linked ref／參數／`SUPABASE_URL`
   任何一個 target 證據命中就退出
5. family 必須是 `GrowBook Demo Family`、child 必須是 `承恩`
6. 印出 `PROJECT REF / PROJECT NAME / FAMILY / CHILD / STATE` 給人看
7. reset 內建**破壞性筆數上限**；超過就停手要求人工確認，
   **刻意不提供 `--force` 繞道**

`--dry-run` 只做 `SELECT`／`count`，印出各表將刪幾筆、將建幾筆，一列都不寫。

### reset 的範圍與順序

每一條 `DELETE` 都以 Demo family 的固定 id 為範圍，並在動手前確認
那個 id 的 `family_name` 與 child 的 `nickname` 都對得上。
沒有 `TRUNCATE`、沒有無 `WHERE` 的 `DELETE`、沒有「刪第一個家庭」。

**順序是這支腳本的全部重點。** 決定順序的是非 CASCADE 的外鍵：

```
intervention_log        RESTRICT，必須最早
child_proposals         ← 必須在 tasks 之前（四張子表 CASCADE 自動帶走）
reward_items / redemption_requests   reward_items.child_id 是 NO ACTION
task_completions.override_id 斷開 → overrides → task_completions
transactions → task 附屬表 → child_tasks → long_term_goals → tasks
reports / moments → wallets → children → parents → families
auth.identities → auth.users        （families.created_by 是 NO ACTION）
```

為什麼提案圖一定要排在 `tasks` 之前：
`child_proposals.task_id` 與 `child_proposal_plan_versions.confirmed_source_task_id`
都是 `ON DELETE SET NULL`。刪掉 canonical task 會把它們設成 NULL，
接著撞上 `child_proposals_active_consistency` 與 `..._confirmed_atomic` 兩條 CHECK。

**這不是理論。** 舊版 reset 寫於 P0-1 落地之前，順序是 `… → tasks → children`，
在 staging 上實測會直接噴：

```
ERROR: 23514 new row for relation "child_proposals" violates check
constraint "child_proposals_active_consistency"
CONTEXT: SQL statement "UPDATE ONLY child_proposals SET task_id = NULL ..."
         SQL statement "DELETE FROM tasks WHERE family_id = v_family"
```

也就是說：只要 Demo 真的跑過一次「提案 → 家長確認 → 正式任務」，
舊版 reset 就必定失敗。現在的版本在同一個狀態下清得乾淨。

reset 最後會自我驗證 Demo 範圍歸零、且沒有留下孤兒 plan version。

### 可重複執行

`reset → seed → verify` 在 staging 實跑三輪，結果完全一致：
9 筆完成、3 筆交易、錢包 36、6 筆任務、6 個 active 指派、3 個長期目標、
提案 0、上週 5 筆／本週 4 筆、顧問窗口跨 3 天、零 off-schedule、
零 plan window 外、零孤兒 earn。

身分用固定 id，六筆任務各有固定的 `clientRequestId`，
所以連 DB 層的 idempotency 也會擋一次重複。

---

## ⚠️ 一個踩過的坑：中文在傳輸中被轉壞

第一次跑 seed 時，資料全部建立成功、筆數完全正確，**只有中文名稱是亂碼**。

原因是 runner 用 `sys.stdout.write` 把 SQL 送出去，而 Windows 的
`sys.stdout` 預設走本機 codepage，中文在進入資料庫之前就被轉換了。

這種錯很難用「比對內容」抓到 —— SQL 裡的字串和寫進去的值會一起壞掉，
兩邊仍然相等。所以 `demo_seed.sql` 最後多了一段守門：

```sql
SELECT octet_length(nickname) INTO v_bytes FROM children WHERE id = ...;
IF v_bytes IS DISTINCT FROM 6 THEN   -- 「承恩」= 2 字 = UTF-8 6 位元組
  RAISE EXCEPTION '中文編碼在傳輸中損壞：...';
END IF;
```

期望值 `6` 是檔案裡的 ASCII 數字，不會跟著被轉換，所以這個比對是可靠的。
已實測：走壞掉的路徑會擋下並回滾，走正確路徑通過。

runner 現在用 `sys.stdout.buffer.write(...encode('utf-8'))`，也有測試盯著。

---

## 里程碑完成狀態：**尚未實作**

`task_plan_milestones` 只有 `title` / `target_day` / `sort_order`。
**資料庫裡沒有「這個里程碑達成了沒」這件事。**

所以畫面只講規劃與時程：

- 「已規劃 5 個里程碑」
- 「下一個里程碑：第 14 天」
- 全部日期都過了 →「里程碑時程已到，建議一起回顧」

### 為什麼不能用 task completion 推導

第七階段 D 曾經用 `task_completions` 的筆數當成已完成的里程碑數，
顯示「已完成 X / 5 個階段」。那是假的：

- 完成一次閱讀不等於完成一個里程碑
- 孩子讀了 7 次、全都還在第一個里程碑範圍內，畫面會說「已完成 5 / 5」
- 家長據此以為計畫結束了

一個看起來合理的推導，比一個明顯的空白更危險。

### 未來要真的顯示「已完成 X / Y 個里程碑」，需要

- 一張 milestone completion 表
- `milestone_id`
- `completed_at`
- `completed_by`
- 可撤銷 / 可調整的狀態（孩子和家長對「算不算達成」的看法會不一樣）

在那張表存在之前，任何 X 都是推測。
