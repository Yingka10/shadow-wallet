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

### 執行

```bash
export DEMO_STAGING_REF=<staging ref>   # 必填，腳本不猜目標
export DEMO_PASSWORD=<Demo 家長的登入密碼>

supabase/verify/staging/run_demo.sh reset
supabase/verify/staging/run_demo.sh seed
supabase/verify/staging/run_demo.sh reseed   # 兩者依序
```

走 `supabase db query --linked`，用 CLI 的臨時登入角色，**不需要資料庫密碼**。

執行前 runner 會：確認 `supabase/.temp/project-ref` 等於 `DEMO_STAGING_REF`、
確認專案名稱是 `growbook-staging`、印出目標。任何一項不符就中止。

### reset 的範圍

每一條 `DELETE` 都以 Demo family 的固定 id 為範圍，並在動手前確認
那個 id 的 `family_name` 真的是 `GrowBook Demo Family`。

沒有 `TRUNCATE`、沒有無 `WHERE` 的 `DELETE`、沒有「刪第一個家庭」這種
不穩定的判斷。有一支測試逐條檢查這件事。

### 可重複執行

`reset → seed → reset → seed` 的結果完全一致（實測比對過所有計數）。
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
