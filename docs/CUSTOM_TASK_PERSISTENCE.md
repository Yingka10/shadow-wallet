# 自訂任務｜持久化契約

> 第九階段 B。**已套用到 staging，production 尚未部署。**
> Migration：`20260804000000_parent_custom_task_persistence.sql`

---

## 一、Creation source

`tasks.creation_source text NOT NULL DEFAULT 'legacy'`

| 值 | 意思 |
|---|---|
| `preset` | 從預設抽屜的家族／版本建立 |
| `parent_custom` | 家長自己寫的 |
| `legacy` | 抽屜上線前，或非抽屜的插入路徑（舊 taskActions、onboarding 推薦） |

**採策略 B（保留 `legacy`）。** 抽屜上線前的任務 `created_from_preset` 是 false，
但它們**不是** parent_custom —— 把它們標成 parent_custom 是在偽造歷史。
為了讓欄位 NOT NULL 而假裝知道舊資料的來源，代價是永遠分不出
「家長自己寫的」與「系統當年塞的」。

命令端**只接受 `preset` 與 `parent_custom`**；`legacy` 只會出現在回填與
非 RPC 的插入路徑。

staging 回填結果：既有任務全部是 `preset`（它們都來自抽屜），
`creation_source IS NULL` 為 0 筆，不一致的資料列 0 筆。

---

## 二、created_from_preset 相容策略

**不刪欄位。** 既有查詢一行都不必改。

| creation_source | created_from_preset |
|---|---|
| `preset` | `true` |
| `parent_custom` | `false` |
| `legacy` | 保留歷史值，不改寫 |

由三道守住：

1. RPC 依 `creationSource` 推導後寫入 —— **不接受 client 指定**
2. `tasks_creation_source_preset_consistency` CHECK
3. `tasks_creation_source_preset_ids` CHECK：`parent_custom` 不可有 preset id

> `created_from_preset` 是**相容欄位**，`creation_source` 才是 source of truth。
> 未來要移除前者時，先確認沒有查詢還在讀它。

---

## 三、Reward support metadata

`tasks.reward_support_intent text` ＋ `tasks.reward_support_review_after_days integer`

**選擇正式欄位（方案 A），不是 audit snapshot（方案 C）。**

理由：這兩個值要出現在列表、詳情、週報，並在到期時提醒回顧 ——
那些都是 SELECT，不是稽核回溯。放進 snapshot 等於要求每個查詢解一包 JSON，
而且改不了（snapshot 不可變）。家長之後要能修改意圖，那更不可能改 snapshot。

CHECK 規則：

| 規則 | constraint |
|---|---|
| 意圖只能是三個值之一 | `tasks_reward_support_intent_check` |
| 回顧天數 > 0 | `tasks_reward_support_review_positive` |
| 暫時支持**必須**有回顧天數 | `tasks_reward_support_temporary_needs_review` |
| 回顧天數**只屬於**暫時支持 | `tasks_reward_support_review_scope` |
| 非 coin 只能是 `default` 或 NULL | `tasks_reward_support_requires_coin` |

最後兩條是反向不變量。少了它們，一個掛在 `family_defined_agreement` 上的
回顧天數會變成沒有人知道意義的數字，而週報會照著它提醒。

⚠️ **家庭自訂約定不提醒退場。** 提醒它等於在說那個制度需要被修正，
而那是家庭自己的決定。

---

## 四、A / B 回饋矩陣（修訂後）

| | record_only | progress_only | family_contribution | coin_eligible |
|---|---|---|---|---|
| **A** 生活常規 | ✅ | ✅ | 依既有產品決策 | ❌ 無 A coin policy |
| **B** 家庭參與 | ✅ **新** | ✅ **新** | ✅ 建議 | ⚠️ `B_COIN_POLICY_NOT_CONFIGURED` |
| **C/D** | ✅ | ✅ | — | ✅ 依 coin-policy.json |

「新」= 舊 RPC guard 會拒絕。舊規則是
`v_category = 'B' AND v_reward <> 'family_contribution' → POLICY_REJECTED`，
它擋的不只是成長幣，連「只留下紀錄」都不行。

### 為什麼是 `B_COIN_POLICY_NOT_CONFIGURED` 而不是 `B_COIN_FORBIDDEN`

因為那是事實。產品概念上已經允許；缺的是 `coin-policy.json` 的 B 類數字
（四個年齡段目前都只定義 C 與 D，`CoinCategory` 型別本身就是 `'C' | 'D'`）。

**本輪沒有新增任何 B 類幣值數字，也沒有借用 C／D 的表。**

三層一致地 fail-closed：

- App domain：`canFinalizeRewardOption()` 回 false
- command builder：`evaluateTaskReward` 回 blocked，`finalize` 不放行
- RPC：`B_COIN_POLICY_NOT_CONFIGURED`

家長不會走到最後一步才第一次知道。

### A 類的釐清（更正第九階段 A 的一項描述）

第九階段 A 的報告說「guard A 連 record_only／progress_only 都擋」。
那個 guard **列表編號是 A，但講的是 category B**。
盤點後確認：**RPC 裡沒有任何 A 類專屬 guard**，A ＋ record_only／progress_only
本來就建得出來。A 類的成長幣擋在幣值決策那一層（算不出金額），不是專屬 guard。

---

## 五、Completion 改為 reward-policy-driven

`complete_task` 舊版：

```sql
IF v_task.reward_policy = 'coin_eligible' AND v_task.category NOT IN ('A', 'B') THEN
```

那個 `AND` 讓 **category 暗中覆蓋 reward_policy**。一筆 reward_policy =
coin_eligible 的 B 類任務，建立端說會發幣、完成端給 0，而且**沒有任何錯誤訊息**。

新版只看 `reward_policy`。category 只說明任務目的，不再參與發幣判斷。
金額 ≤ 0 時回 `coin_amount_not_configured` 而不是安靜發 0。

**這不會立刻放行 A／B 發幣** —— 建立端仍然擋著。這一步是為了讓那一天真的
到來時，不會出現「建得出來但完成拿 0」的隱性 bug。

### Legacy 不變

`reward_policy IS NULL` 的舊任務：一個字沒改，仍走
`base_time_min × difficulty` 與前置解鎖 ×0.7，B 類仍寫 `time_savings`。
本機驗證有一條專門釘住這件事（20 幣 = 10 × 2）。

---

## 六、Idempotency 與 replay

`clientRequestId` 與來源完全無關 —— 兩種來源共用同一套。

| 情境 | 結果 |
|---|---|
| preset 重送 | 同一 task id、1 筆 task、1 筆 preset selection |
| custom 重送 | 同一 task id、1 筆 task、**0 筆** preset selection |
| 換來源重送同一 id | 回放**原本那一筆**，不建第二筆，來源不被改寫 |
| 跨家庭猜中 id | 42501，不回傳 task id |

`preset_task_replay_payload` 的 relatedIds 現在同時算入
`created_from_preset` 與 `created_parent_custom` —— 只認前者的話，
自訂任務重送回傳的 relatedIds 會比第一次少一筆。

---

## 七、Audit event

保留 `created_from_preset`，新增 `created_parent_custom`。

**沒有改成單一 `task_created` + `payload.creation_source`**（那是更好的長期形狀），
因為改名需要動歷史資料列，而歷史稽核紀錄是最不該被改寫的東西。
`preset_task_replay_payload` 與既有測試也都依賴那個字面值。

> **未來統一策略：** 等 `child_proposal` / `wish_plan` / `copied_task` 真的出現時，
> 一次改成 `task_created` + source metadata。屆時新增的值才不會又是一個
> 一次性的補丁。

snapshot 現在保存：`creationSource`、`rewardSupport.{intent,reviewAfterDays}`、
四種版本、derived category / completionPolicy、完整 reward 決策。
**不含** token、prompt、Gemini 輸出、API key。

---

## 八、Preset selection 是 optional

`task_preset_selections` 對 parent_custom 是 **0 row**。

- RPC 的寫入迴圈限制在 `WHERE v_creation_source = 'preset'`
- 自訂命令帶 `selectedOptions` 會被拒（VALIDATION_FAILED）
- replay 不會補出假的 preset row

⚠️ **任何依賴 `task_preset_selections` 的查詢都不可以用 inner join** ——
那會讓自訂任務整個從結果裡消失。

---

## 九、驗證

### 本機真實 schema（49 條 assertion）

跑在 `supabase/baseline/public_schema.sql`（正式專案 dump）之上，
不是簡化 harness —— 20260731 那支 migration 就是被簡化 harness 漏掉的。

```bash
psql -f supabase/baseline/public_schema.sql
psql -f supabase/migrations/20260730000000_create_parent_task_idempotency.sql
psql -f supabase/migrations/20260731000000_fix_family_role_long_term_type.sql
psql -f supabase/migrations/20260804000000_parent_custom_task_persistence.sql
psql -f supabase/verify/parent_custom_persistence.sql
```

涵蓋六種建立情境、來源互斥、reward support、A/B 矩陣、completion、
legacy、idempotency、換來源 replay、跨家庭。

一個發現：**0 幣的 coin_eligible 根本插不進去** ——
既有的 `tasks_coin_eligible_needs_amount_check` 已經擋在資料庫層。
`complete_task` 裡的 `coin_amount_not_configured` 是第二道，目前到不了。
兩道都在才叫 fail-closed。

### Staging E2E（26 條，走真 JWT）

`supabase/verify/staging/parent_custom_e2e.py` ——
GoTrue → PostgREST → RLS → RPC，不用 `set_config` 模擬登入。

全部通過。**未涵蓋跨家庭**：QA-c 帳號在 staging 沒有孩子，
那一條只有本機驗證跑到（第 29 條）。

---

## 十、尚未做

- **production 未部署。** 本輪只推 staging。
- 自訂入口的 UI 與 Step 表單（第九階段 C）
- `ParentHomeTablet` 的舊 AI 幣值路徑（B3）
- B 類幣值數字（需產品拍板）
- 週報／到期提醒尚未讀 `reward_support_*`

---

## 十一、第九階段 C：命令由畫面產生

第十節的第一項「自訂入口的 UI 與 Step 表單」**已完成**（見 `CUSTOM_TASK_UI_FLOW.md`）。

這一輪**沒有動任何持久化契約**：沒有 migration、沒有改 `create_parent_task_v1`、
沒有改 `complete_task`、沒有 db push。變的只有「誰來組出那個命令」——
以前只能由程式建構，現在家長按幾下就會產生同一份命令。

有測試釘住送出的內容：

```
creationSource            === 'parent_custom'
preset                    === undefined
metadata.createdFromPreset === false
metadata.presetCatalogVersion === undefined
命令的 JSON 裡沒有任何 preset id 前綴（learn- / life- / fam- / auto-）
```

### 一項連帶修正（App 端）

`validateFamilyParticipationReward` 原本要求家庭參與**只能**是
`family_contribution`。第八節記過這件事：「App 端仍然擋 B ＋ coin，
只是訊息還停在舊說法。」

實際盤點後發現它擋的比 RPC 更多 —— 連 `record_only` 與 `progress_only` 都擋，
而第九階段 B 已經把 RPC 那一條放寬了。這一輪讓 App 對齊：只擋成長幣與時間儲蓄。

**成長幣仍然擋著**（B 類幣值數字仍是 blocker），所以 §四那張矩陣沒有變。
家庭角色固定 `family_contribution` 的規則移到 `validateFamilyRoleDraft` 單獨守著 ——
RPC 對家庭角色沒有放寬。

### 尚未做（更新）

- `reward_support_intent` / `reward_support_review_after_days` 仍然沒有 UI ——
  唯一會寫入它們的組合（B ＋ 成長幣）在幣值政策補上之前選不到
- production 未部署
- 週報／到期提醒仍未讀 `reward_support_*`
- B 類幣值數字（需產品拍板）
