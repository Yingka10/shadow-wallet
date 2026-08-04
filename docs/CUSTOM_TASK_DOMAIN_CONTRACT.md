# 自訂任務｜Domain 契約

> 第九階段 A。**只有 domain 與純函式，沒有畫面。**
> 程式在 `src/screens/parent/tablet/taskDrawer/customTask/`。

---

## 一、一句話

**自訂不是第六種 editor，是第二個入口。**

```
preset entry        → createTaskDraft        ─┐
                                              ├→ TaskDraft → editor → 驗證
parent_custom entry → createCustomTaskDraft  ─┘              → 審閱 → 回饋 → 命令 → RPC
```

沒有 `CustomTaskDraft`、沒有 `CustomTaskEditor`、沒有第二支 RPC。

多開一條平行 domain 的代價很具體：「家庭參與不發成長幣」這種規則
會需要在兩個地方各寫一次，而總有一天只有一邊會被更新。

---

## 二、Task Source：兩個不同的概念

這是最容易搞混的一件事，所以型別上完全分開：

| | 問題 | 值 | 存在哪裡 |
|---|---|---|---|
| `TaskSource`（既有） | 這件事**是誰提出的** | parent / child / co_created / system | `tasks.task_source` |
| `TaskCreationSource`（新） | 家長**從哪個入口**建立 | preset / parent_custom | 見第六節（DB 尚未表達） |

一筆 `parent_custom` 建立的任務，`TaskSource` 完全可以是 `co_created` ——
家長打開自訂入口，但內容是親子討論出來的。

**把兩者合成一欄會讓「誰的主意」與「從哪個按鈕進來」永遠分不開**，
而 C 類（自主挑戰）的政策正好依賴前者：來源須為孩子提出或親子協商。
`createCustomTaskDraft` 因此接受 `source` 參數，預設 `parent` 但可覆蓋 ——
寫死的話就永遠建不出一個合規的自主挑戰任務。

### 第一版兩個，未來五個先留位置

```ts
type EnabledTaskCreationSource = 'preset' | 'parent_custom';

type PlannedTaskCreationSource =
  | 'child_proposal' | 'co_created' | 'wish_plan'
  | 'copied_task' | 'system_suggestion';   // 本輪不實作
```

先寫下來不是為了先蓋房子，是為了讓 union 的形狀從一開始就容得下它們。
一個只有兩個值的 union 之後要擴充，會連帶動到每一個 switch ——
而那時候它們已經散在十幾個檔案裡。

### source 不決定任何東西

已由測試釘住：

- source 不決定 `purposeCategory`
- source 不決定 `rewardPolicy`
- source 不決定 `editorKind`
- 只有 preset 有 family / variant selection
- **parent_custom 沒有假的 preset id**
- 不用 `"custom"` 同時代表任務類型與來源
- 舊草稿不會被誤判成 parent_custom

---

## 三、現有流程對 preset 的假設（盤點）

| 路徑 | 現況 | 產品限制還是技術限制 | 分類 | 未來建議 |
|---|---|---|---|---|
| `BaseTaskDraft.familyId / variantId` | ~~必填~~ → **本輪已改為 optional** | 技術 | C 舊假設 | ✅ 已解 |
| `BaseTaskDraft.createdFromPreset` | ~~字面量 `true`~~ → **本輪已放寬成 boolean** | 技術 | C 舊假設 | ✅ 已解 |
| `validateTaskDraft(draft, variant)` | ~~variant 必填~~ → **本輪已改為 optional** | 技術 | C 舊假設 | ✅ 已解 |
| `validators.ts` 短期支援焦點清單 | 依 `familyId` 查 preset 文案 | 技術 | C | ✅ 已解（無 familyId 時視為沒有預設焦點） |
| `validators.ts` `allowedRewardPolicies` | 來自 variant | 產品 | C | ✅ 已解（無 variant 時退回全集，由 capability 篩） |
| `validators.ts` 學校作業第二層防線 | 依 `familyId` 比對 | 產品 | B 保留 | 自訂任務沒有這個 family id，不適用 |
| `CreateParentTaskCommandBase.preset` | **必填** `{familyId, variantId}` | 技術 | **D 阻擋** | 改為 optional ＋ 加 `origin` |
| `command.metadata.createdFromPreset` | **字面量 `true`** | 技術 | **D 阻擋** | 改為 boolean |
| `create_parent_task_v1` INSERT | `created_from_preset` **寫死 true** | 技術 | **D 阻擋** | 需 migration |
| `task_change_events.event_type` | 寫死 `'created_from_preset'`，CHECK 只允許三值 | 技術 | **D 阻擋** | 需 migration |
| `task_preset_selections` | 空 `selectedOptions` → 零列，無必填檢查 | — | ✅ 不是阻礙 | 無需改 |
| `tasks.preset_family_id / variant_id` | nullable，無 NOT NULL | — | ✅ 不是阻礙 | 無需改 |
| `tasks.task_source` CHECK | 允許 parent/child/co_created/system/system_suggested | — | ✅ 不是阻礙 | 與建立來源無關 |
| `clientRequestId` | 與來源完全無關 | — | ✅ 不是阻礙 | idempotency 可共用 |
| `DraftReview.tsx` / `CreatedTaskSummary.tsx` | 收 `family` / `variant` 物件（圖示、safetyNotes、feedbackHint、completionPolicy） | 技術 | C | 第九階段 B 改為 optional |
| `PresetTaskDrawer.tsx` dirty 比對 | 比 `draft.familyId !== selectedFamily.id` | 技術 | C | optional 後仍然成立，無需改 |

### 家庭參與 ＋ 成長幣的硬性限制

| 路徑 | 現況 | 限制性質 | 分類 |
|---|---|---|---|
| `familyParticipation.ts` `allowedRewardPolicies: ['family_contribution']` | catalog 只給一種 | 產品 | C 舊假設 |
| `validators.ts` `validateFamilyParticipationReward` | 硬擋 coin＋要求 family_contribution | 產品 | **A 應改為確認** |
| `ruleFindings.ts` `FAMILY_PARTICIPATION_NOT_COIN_ELIGIBLE` | blocking finding | 產品 | **A 應改為確認** |
| `selectAvailableRewardPolicies.ts` `COIN_CATEGORY_BY_PURPOSE` B → null | 算不出幣值 | 技術 | **D 缺政策** |
| `evaluateTaskReward.ts` 同上 ＋ `POLICY_REJECTED` | 同上 | 技術 | **D 缺政策** |
| `coinPolicy.ts` `CoinCategory = 'C' \| 'D'` | 型別排除 B | 技術 | **D 缺政策** |
| `coin-policy.json` `agePolicies` 只有 C/D | **沒有 B 類數字** | 產品未拍板 | **D blocker** |
| `create_parent_task_v1` guard A | B 只能 family_contribution（連 record_only 都擋） | 產品 | **A，且比其他層更嚴** |
| `create_parent_task_v1` guard C（family_role） | 固定 family_contribution | 產品 | **B 保留 blocking** |
| `fn_complete_task` 第 50 行 | `category IN ('A','B') → 0 幣` | 技術 | **D，且會安靜給 0** |
| `fn_complete_task` 第 107 行 | B 類寫 `time_savings` | 技術 | D，與 DELTA §2 衝突 |
| `ai-proxy/rewardEligibility.ts` | A/B 直接判不發幣 | 產品 | 舊路徑，B3 處置 |
| Edge Function eligibility（B2A.5） | B 不開放 AI | 安全 | **B 保留，與回饋政策無關** |
| `rewardCapability.test.tsx` 等測試 | 釘住舊行為 | — | C，隨政策一起改 |
| `docs/SPEC_task-taxonomy-2026-07.md` | 「B 類不發幣」 | 產品 | **A 需更新** |

分類說明：**A** 應改為 warning／明確確認 ｜ **B** 應保留 blocking ｜
**C** 只是舊假設 ｜ **D** 與 DB／政策相容性有關

---

## 四、Purpose × Duration 路由

```ts
resolveCustomTaskEditor({ purposeCategory, durationChoice }): CustomTaskEditorResolution
```

| 目的 | 單次 | 固定重複 | 持續一段時間 |
|---|---|---|---|
| 生活習慣 | one_time | **needs_confirmation** → short_support | short_support |
| 家庭參與 | one_time | recurring | family_role |
| 自主挑戰 | one_time | recurring | growth_plan |
| 學習技能 | one_time | recurring | growth_plan |

**唯一需要確認的格子**是「生活習慣 ＋ 固定重複」。系統的立場是：
生活自理的目標是變成不用管理的事，不是變成一個永遠掛在清單上的項目。
所以建議改成有結束日的短期支援。

但那是建議不是規定 —— `needs_confirmation` 讓家長看完理由後仍然可以自己決定。
**不會直接建立永久 recurring 生活常規任務。**

### 為什麼不交給 Gemini

不是因為 AI 會做錯。是這個決定會直接改變任務的政策後果：
選到 `family_role` 就會要求責任清單與期滿回顧，選到 `short_support`
就會鎖成 `progress_only` 並要求穩定退場。

一個會幻覺的東西不該有這種權力，而且家長沒有辦法檢查它為什麼這樣選。
純函式可以：它每次都一樣，而且 `rationaleCode` 說得出理由。

---

## 五、AI 在自訂流程的位置

**順序固定：家長先確認 → 才有 AI。**

```
Step 1 想做什麼 → Step 2 為了什麼 → Step 3 怎麼進行 → Step 4 怎麼支持
                                                          ↓
                                              TaskDraft（家長已決定）
                                                          ↓
                                              DraftReview → AI 建議
```

AI **不負責**：自動分類 purpose、自動選 editor、自動選 reward、
決定是否需要外在支持、產生 coin amount。

### 三種狀態必須分得出來

因為第一版 AI eligibility 只開放 C／D（B2A.5 的決定），
自訂任務接進來後家長會遇到三種完全不同的情況：

| 狀態 | 顯示按鈕 | 可重試 | 文案要點 |
|---|---|---|---|
| `available` | 是 | — | 採不採用由你決定 |
| `not_offered_for_this_task` | **否** | **否** | 說明原因 ＋「不影響任務建立」 |
| `service_unavailable` | 是 | 是 | 「不影響任務建立，稍後再試」 |

⚠️ **`TASK_TYPE_NOT_ENABLED` 這種代碼不可以顯示給家長。**
已由測試釘住（文案不得出現任何大寫底線代碼）。

判斷順序也有意義：先問「這種任務開不開放」，再問「服務活著嗎」。
反過來的話，服務掛掉時連 A／B 類任務都會被叫去重試 ——
而它們再試一百次也不會有建議。

### 兩個決策不可混淆

> 「B 類可以使用成長幣」 ← 這一輪修訂的
> 「B 類目前不開放生成式 AI」 ← **沒有改**，維持 B2A.5

兩者沒有關係。後者的理由是內容安全：A／B 類任務的建議天然落在
實體家務操作上，那是安全層最弱的地方。

---

## 六、需要的 DB / RPC 變更（**本輪不執行**）

自訂任務目前可以走到 `TaskDraft`，但**送不進 `create_parent_task_v1`**。
四件事，都需要一支 migration：

1. `CreateParentTaskCommandBase.preset` 改為 optional，並新增
   `origin: { kind: 'preset', familyId, variantId } | { kind: 'parent_custom' }`
2. `metadata.createdFromPreset` 的型別從字面量 `true` 放寬成 `boolean`
3. `create_parent_task_v1` 的 INSERT 改為依命令寫 `created_from_preset`，
   而不是寫死 `true`
4. `task_change_events.event_type` 需要一個能表達 custom 的值
   （CHECK 目前只允許 `created_from_preset` / `updated_from_preset` / `archived`）

**第 4 點也可以不動 CHECK**：snapshot 已經存了完整命令，
只要命令帶著 `origin`，來源就能從 snapshot 還原。
但 `event_type` 的字面意思會是錯的，而錯的標籤比缺的標籤更難發現。

### 為什麼不用假的 preset id 繞過去

因為那會讓「這筆任務是從哪來的」在資料庫裡**永遠答錯**。
一個錯誤的答案比沒有答案更難發現 ——
沒有答案時有人會去查，答錯時沒有人會去查。

`CUSTOM_TASK_COMMAND_GAP` 這個常數與對應測試就是為了讓下一輪
有人想直接送出時，先撞到這個說明。

---

## 七、本輪交付

| 檔案 | 內容 |
|---|---|
| `customTaskContract.ts` | 來源、目的選項、期間選項、支持意圖、命令缺口 |
| `customTaskRouting.ts` | purpose × duration → editor，含 rationale 文案 |
| `customTaskRewardOptions.ts` | 修訂後的回饋選項 ＋ 幣值可用性 |
| `customTaskInitializer.ts` | 從 intake 產生合法 TaskDraft |
| `customTaskAiAvailability.ts` | 三種 AI 狀態與文案 |
| `__tests__/` | 4 支，56 筆 |

**沒有做：** 沒有畫面、沒有 Step 表單、沒有 Drawer 整合、
沒有 migration、沒有部署、沒有呼叫 Gemini。


---

## 八、第九階段 B 更新

第六節列的四項命令／RPC 阻擋 **已全部補上**，見
`docs/CUSTOM_TASK_PERSISTENCE.md`。摘要：

- `command.creationSource` 為必填，`command.preset` 改為 optional
- `metadata.createdFromPreset` 放寬成 boolean，且**由 RPC 依來源推導**
- `tasks.creation_source` 成為 source of truth（`created_from_preset` 保留為相容欄位）
- 自訂任務的稽核事件是 `created_parent_custom`
- `rewardSupport.{intent,reviewAfterDays}` 進入命令與 `tasks` 正式欄位

`mapTaskDraftToCommand` 現在依 `draft.origin` 決定來源；
preset 草稿缺 family/variant、或自訂草稿帶了 family/variant，都會**直接丟例外**
而不是安靜地選一邊 —— 兩種錯法都會產生一筆來源記錯的任務。

**仍然沒有做：** 自訂入口的畫面（第九階段 C）。
