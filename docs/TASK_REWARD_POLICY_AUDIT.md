# 成長幣政策盤點｜2026-07-28

> 對象：預設任務抽屜第七階段 B。
> 目的：在寫任何幣值程式碼之前，先確定「這個 repo 裡到底有沒有一份能用的正式政策」。
> 結論先講：**有**。`coin-policy-1.0.0` 已定案、有版本、數字填滿，本輪直接對接它，
> 沒有自己發明任何數字。

狀態標記在本文一律照這四種寫：
**已在真實 DB 驗證** / **只有靜態測試** / **尚未實作** / **blocked**。
「程式碼已寫」不等於「production 已驗證」。

---

## 一、目前真正決定幣值的是誰

**兩條路徑並存，而且互不知道對方存在。**

### 路徑 1：完成時計算（DB，正在用）

`complete_task` / `fn_complete_task`
（`supabase/migrations/20260615000002_fn_complete_task.sql:49-60`）

```sql
IF category IN ('A','B') THEN 0
ELSE ROUND(COALESCE(coin_override, ROUND(base_time_min * difficulty))
           * CASE WHEN 前置完成 THEN 1.0 ELSE 0.7 END)
```

輸入欄位只有四個：`category`、`base_time_min`、`difficulty`、`coin_override`。
**不看年齡、不看頻率、不看任務來源、不看難度列舉。**
`difficulty` 在這裡是 numeric 乘數（多半是 1），不是 easy/standard/hard。

這條是孩子錢包實際會增加多少的唯一來源。

### 路徑 2：建立時建議（Edge Function，沒被平板端用到）

`ai-proxy` 的 `analyzeTask`
→ `rewardEligibility.runEligibilityGate`（八步資格閘門）
→ `coinPolicy.calcCoins`（`coin-policy.json`）

這條是 2026-07 新分類之後寫的，語彙與 SPEC 完全對得上。
它**不決定幣值**，只有 `calcCoins` 決定，而 `calcCoins` 的數字全部來自 JSON。

平板家長端目前仍呼叫舊的 `suggestTaskCoin`（DELTA §3），所以這條在正式流程裡是空轉的。

---

## 二、哪些數值是正式依據，哪些只是舊 Demo

| 來源 | 數字 | 判定 |
|---|---|---|
| `coin-policy.json` | 四個年齡段 × C/D × 五個時間分級的 `bandBaseCoins`、`range`、`difficultyDelta` | **正式 policy**。`_meta.status` = `ACTIVE — 已定案（首版）`，`policyVersion` = `coin-policy-1.0.0`，`effectiveDate` 2026-07-22 |
| `aiAgent.suggestTaskCoin` | fallback `coins: 10`、`reason: '預設建議幣值'` | **舊 Demo**。AI 失敗時的安慰數字 |
| `ai-proxy` 的 `handleSuggestTaskCoin` prompt | 「簡單日常 1-5 幣／中等家務 5-15 幣／費力貢獻 15-30 幣／學習練習 10-20 幣」 | **舊 Demo**。寫在 prompt 字串裡的 LLM 提示，不是版本化政策 |
| `classifyTask` fallback | `base_time_min: 5, difficulty: 1.0` | **舊 Demo** |
| `suggestRewardCoin` fallback | `coins: 40` | **舊 Demo**（是獎勵定價不是任務幣值） |
| `taskActions.ts` 建立任務時寫的 `difficulty: 1` | 三處硬寫 1 | **暫定值**，等於「時間就是幣值」 |

`coinPolicy.ts` 的檔頭註解仍寫著「bandBaseCoins 目前為 null（placeholder，待團隊定案）」——
**那句已經過期**，JSON 早就填滿了。註解沒跟上，程式碼行為是對的。

---

## 三、逐項回答

**1. 目前真正決定幣值的是哪支函式**
DB 的 `complete_task`。建立時的 `calcCoins` 只產生建議，而且沒接進平板端。

**2. 它的輸入欄位**
`tasks.category`、`base_time_min`、`difficulty`、`coin_override`，加上呼叫端傳入的
`p_is_prerequisite_met`。

**3. 是否依年齡、分類、時間、頻率與難度**
- `complete_task`：只依**分類**（A/B 不發）與**時間×乘數**。年齡、頻率、難度列舉都沒有。
- `coin-policy.json`：**四項都有** —— 年齡段、C/D 分類、時間分級、難度三值；
  頻率以 `claim_period` / `maxClaimsPerPeriod` 表達（單任務上限，全域上限屬 Phase 2）。

**4. 是否仍只接 taskName**
`suggestTaskCoin` 是（只吃任務名稱，讓 LLM 直接吐數字）。
`analyzeTask` 不是（吃年齡段、來源、期間形式、頻率、重複旗標）。
平板家長端目前用的是前者。

**5. 哪些數值是正式 policy** — 見上表，只有 `coin-policy.json`。

**6. 哪些只是舊 Demo／暫定值** — 見上表，其餘全部。

**7. 完成任務時真正讀的是哪個 DB 欄位**
本輪之前：`coin_override` ?? (`base_time_min` × `difficulty`)。
本輪之後：新任務讀 **`tasks.reward_coin_amount`**；舊任務（`reward_policy IS NULL`）維持原樣。

**8. 家長調整幣值目前是否有上限**
本輪之前：**沒有**。`mark_task_atomic` 只做 `Math.round`，`p_adjusted_coin` 沒有任何界線，
而且 `v_coin_diff < 0` 那一支會**加幣**（`type = 'adjust'`）—— 等於一條繞過政策的加幣後門。
本輪之後：新任務夾在 `[0, reward_coin_max]`，非 coin_eligible 一律 0；舊任務行為不變。

**9. 是否有 policy version**
`coin-policy.json._meta.policyVersion` 有，且 `_meta.notes` 明說「改數字後 bump 版本」。
但**沒有任何一筆任務存過它**。

本輪起任務會存**四種**版本，而不是一個模糊的 `policy_version`
（第七階段 B.5 拆的，見 `TASK_DRAWER_PERSISTENCE_PLAN.md` §L-1）：
`command_schema_version` / `preset_catalog_version` /
`task_policy_version`（分類與回饋資格規則）/
`reward_policy_version`（做出這筆回饋決策的政策）。

**10. 哪些部分可以直接重用**
- `coin-policy.json` 的全部數字（**唯一真相來源**，本輪直接 import 它）
- `calcCoins` 的演算法：band → baseCoins → difficultyDelta → range clamp
- `rewardEligibility` 的步驟 1 硬規則（A/B 不發幣）

**11. 哪些必須停用或重構**
- `suggestTaskCoin`：讓 LLM 直接吐幣值，與「AI 只做理解、規則引擎決定幣值」的架構相反。
  本輪沒有動它（平板端舊畫面還在用），但預設任務抽屜完全不碰它。
- `complete_task` 的 `base_time_min × difficulty`：對新任務停用（改讀 `reward_coin_amount`），
  舊任務保留。
- 前置解鎖 `×0.7`：對新任務不套用。理由不是「覺得不好」，是**它會讓實付金額掉出政策
  允許的 min–max 範圍**。DELTA §5 也已標記這個機制的立足點被新分類動搖、處置未定。
  舊任務行為一個字沒改。

---

## 四、為什麼 policy 存在，coin_eligible 卻不是「全部打開」

`calcCoins` 需要四個輸入：年齡段、C/D、**估計分鐘**、**難度**。

- **估計分鐘**：catalog 裡不是每個 variant 都有。有的（全部 learning_skill 的可發幣版本）
  算得出來；沒有的（`own-challenge-plan`）算不出來。
- **難度**：整個抽屜沒有輸入來源。repo 裡唯一產生難度的地方是 `analyzeTask` 的 AI 理解，
  而本輪明確不呼叫 LLM。

處理方式：
- 難度未指定 → 套 policy 自己的 `difficultyDelta.standard`（= 0，不加不減），
  並在 `explanation` 與 `calculationBasis.difficulty` 記下「套的是 standard」。
  這不是編一個數字，是用政策的中性值；而且事後查得出來。
- 估計分鐘缺席 → **blocked（`COIN_POLICY_UNAVAILABLE`）**，不是回 0。
  這種情況下 UI 根本不列出「可建議成長幣」這個選項。

所以能力是**逐張草稿**判定的，不是一個全域開關：
練琴 30 分鐘算得出來就給選項，自主挑戰沒設分鐘就不給。家長設了分鐘之後選項才出現。

---

## 五、本輪的狀態表

| 項目 | 狀態 |
|---|---|
| `TaskRewardDecision` 契約與 `evaluateTaskReward` | **只有靜態測試**（16 個單元測試，純函式，不需 DB） |
| 幣值數字來源 = `coin-policy.json` | **只有靜態測試**（測試斷言程式碼裡沒有自己的幣值表） |
| `tasks.reward_coin_*` 欄位與 CHECK | **已在真實 DB 驗證** |
| `create_parent_task_v1` 的 coin guard | **已在真實 DB 驗證** |
| 完成流程讀 `reward_coin_amount` | **已在真實 DB 驗證**（coin 10 幣、non-coin 0 幣、legacy 20/14 幣） |
| 完成函式移除 `parents ... LIMIT 1` | **已在真實 DB 驗證**（跨家庭、多家長、多家庭都實測） |
| `mark_task_atomic` override 夾制 | **已在真實 DB 驗證**（9999 → 25） |
| 四種版本語意分離 | **已在真實 DB 驗證** |
| UI 隱藏 time_saving / 算不出幣值的 coin_eligible | **只有靜態測試**（10 個 render 測試，這部分不需要 DB，涵蓋度是完整的） |
| DraftReview 接上建立 service | **尚未實作**（第七階段 C） |
| 時間儲蓄整條鏈路 | **blocked** —— 建立端拒絕、完成端拒絕、兌換端不存在 |
| 難度輸入 | **尚未實作** —— 目前一律套 policy 的 standard |
| 家長微調幣值的 UI | **尚未實作** —— `minAllowed`/`maxAllowed` 已存進 DB，等 slider |
| **真實 Postgres 驗證** | **已在真實 DB 驗證**（PostgreSQL 17.4，2026-07-28，66 條 assertion 全過）——見 `TASK_DRAWER_POSTGRES_VERIFICATION.md` |

---

## 六、真實 Postgres 驗證：**已完成**

> 2026-07-28 更新（第七階段 B.5）。完整紀錄見 `TASK_DRAWER_POSTGRES_VERIFICATION.md`。
>
> 用本機 PostgreSQL 17 的 binaries 另外 `initdb` 一個一次性 cluster（trust 認證、
> port 55432），套用兩支 migration 並跑 66 條 assertion，全數通過，psql exit code 0。
> 沒有碰使用者現有的 5432 cluster，也沒有連正式 Supabase 專案。
>
> 下面這一段是當時（第七階段 B）的判斷，保留作為紀錄。

三條路都不通：

1. **本機 Docker** —— `docker` 指令不存在，`supabase db reset` 起不來。
2. **獨立 staging** —— 沒有。`supabase/config.toml` 的 `project_id` 是
   `mduaghqszbwmoigllpbj`，`.env` 的 `EXPO_PUBLIC_SUPABASE_URL` 也是同一個。
   那是**正式專案**（裡面有承恩的 demo 資料），不可以拿來試 migration。
3. **本機 PostgreSQL 17** —— 服務有在跑（`pg_isready` 通），但需要 postgres 密碼，
   目前不在手上。

還有一個比 Docker 更根本的問題：

> **`supabase/migrations/` 裡沒有任何一支建立核心表。**
> `tasks`、`children`、`parents`、`wallets` 等全部只存在 live DB，從未回填進 migrations
> （與 AUDIT P1-7 記的是同一類問題）。所以就算現在生出一個 Docker，
> `supabase db reset` 一樣會失敗 —— 缺的不是容器，是 schema 起點。

因此本輪提供的是一支**自帶 harness 的可執行驗證腳本**：

```
supabase/verify/task_reward_verification.sql
```

它自己建 `auth.uid()` 替身、三個角色、以及這兩支 migration 會碰到的表，
然後依正式順序套用 migration 一次，再跑 66 項 integration 檢查：
五種建立、政策拒絕、rollback 後沒有孤兒 task、跨家庭拒絕、同 user 多家庭不選錯、
同家庭多家長都能操作、anon 拒絕、coin 任務發正確非零金額、non-coin 0 幣、
legacy 完成行為（含 ×0.7）不變、override 被上限夾住。

跑法：

```bash
createdb -U postgres shadow_wallet_verify
psql -U postgres -d shadow_wallet_verify -v ON_ERROR_STOP=1 \
     -f supabase/verify/task_reward_verification.sql
dropdb -U postgres shadow_wallet_verify
```

全數通過時最後一行是 `ALL CHECKS PASSED`。

~~**在這支腳本真的跑過並通過之前，這兩支 migration 不算 production ready。**~~
→ 2026-07-28 已跑過並通過（PostgreSQL 17.4，exit code 0）。

---

## 七、generated database types checklist

`src/types/database.ts` 是**手寫**的，repo 裡沒有任何 generated header，
`package.json` 也沒有 type generation script。本輪沒有偽造一份。

要真正生成需要一個可連的非 production DB，指令是：

```bash
supabase gen types typescript --db-url "<非 production 的連線字串>" > src/types/database.ts
```

生成之後要處理的落差：

- [ ] `Task` 上本輪新增的欄位目前標成 optional（`reward_coin_amount?: number | null`）。
      DB 是 nullable 但**存在**，generated types 會是 `| null` 而非 optional。
      改回去之後，所有 `Task` 物件字面量（多在測試裡）需要補欄位。
- [ ] `RewardPolicyValue` 是手寫的字面量聯集，對應 `tasks_reward_policy_check`。
      generated types 不會產生它（CHECK 不是 enum），要決定保留手寫還是改成 DB enum。
- [x] ~~20260728000000 新增的其餘 20 個 `tasks` 欄位完全沒有進 `Task`~~
      → 已依真實 schema snapshot 補齊到 30 個（見 `TASK_DRAWER_VERIFIED_SCHEMA.md`）。
- [ ] `create_parent_task_v1` 的 `Args: { p_command: object }` 是手寫的近似；
      generated types 會是 `Json`。
- [ ] `task_change_events` 的 `Insert: never; Update: never` 是刻意寫的
      （client 不可寫稽核 log）。generated types 不會知道這件事，要手動保留。
- [ ] `CreateParentTaskCommand` 與 `TaskRewardDecision` 是 domain type，
      **不可以**被 generated row type 取代。

---

## 八、第七階段 C 之前的 blocker

1. **真實 Postgres 驗證未做**（上面第六節）。這是最大的一個。
2. **核心表沒有進 migrations**。沒有它，任何人都無法從零重建這個資料庫。
3. **難度沒有輸入來源**。目前一律 standard，等於 policy 的難度維度沒有真的被用到。
4. **家長微調 UI 未做**。`minAllowed`/`maxAllowed` 已經存進 DB 但沒有畫面在用。
5. **`suggestTaskCoin` 仍活著**。平板端舊畫面還在用讓 LLM 直接吐幣值的舊路徑。
6. **時間儲蓄整條鏈路不存在**。型別與 catalog 資料保留著，但三端都沒有。

---

## 相關文件

- `docs/TASK_DRAWER_PERSISTENCE_PLAN.md` — 欄位對照與持久化計畫
- `docs/SPEC_task-taxonomy-2026-07.md` — A/B/C/D 的正式定義
- `docs/DELTA_task-taxonomy-2026-07.md` — 分類與現況程式碼的落差（§3 與 §5 與本文直接相關）
- `supabase/functions/ai-proxy/coin-policy.json` — **幣值數字的唯一真相來源**
