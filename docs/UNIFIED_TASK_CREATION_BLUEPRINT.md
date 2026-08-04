# 統一建立任務中心｜藍圖

> 第九階段 A 起草，A／B／C 三輪的進度記在文末。
> **兩個入口現在都真的可以建立任務**（第九階段 C）。
> UI 細節見 `CUSTOM_TASK_UI_FLOW.md`。

---

## 一、目前的 preset flow

```
ParentTaskManagementTablet
  └─ PresetTaskDrawer
       Step 1 選家族（26 個）
       Step 2 選版本（36 個）
         └─ createTaskDraft(family, variant, child, ageGroup)
              └─ TaskDraft（五種之一）
                   └─ editor（GrowthPlan / ShortSupport / Recurring / FamilyRole / OneTime）
                        └─ validateTaskDraft
                             └─ DraftReview（規則檢查 ＋ AI 建議）
                                  └─ mapTaskDraftToCommand
                                       └─ evaluateTaskReward
                                            └─ finalizeCreateParentTaskCommand
                                                 └─ create_parent_task_v1
```

這條鏈**已經在跑**，而且是原子的（單一 RPC ＋ idempotency）。
第九階段的目標不是重做它，是讓第二個入口接進**同一條鏈**。

---

## 二、第一版兩個入口

### 1. preset —— 「從常用任務開始」

> 選擇整理好的常見情境，再依家庭需要調整。

### 2. parent_custom —— 「自己建立任務」

> 寫下你希望孩子投入的事情，再一起整理安排與回饋。

```
┌─ preset ────────────┐
│ 選家族 → 選版本      │──┐
└─────────────────────┘  │
                          ├──→ TaskDraft ──→ 同一套 editor / 驗證 / 審閱 / 回饋 / 命令 / RPC
┌─ parent_custom ─────┐  │
│ 想做什麼 → 為了什麼   │──┘
│ → 怎麼進行 → 怎麼支持 │
└─────────────────────┘
```

**分岔只在最前面四步，之後完全一樣。**

---

## 三、自訂任務的四個前置步驟

| Step | 問題 | 收集 | 內部對應 |
|---|---|---|---|
| 1 | 想做什麼 | 任務名稱、家長原始期待 | `CustomTaskIntake` |
| 2 | 這件事主要是為了什麼 | 四選一（生活化文字） | `purposeCategory` |
| 3 | 預計怎麼進行 | 三選一 | `durationChoice` |
| 4 | 希望怎麼支持孩子 | 回饋方式 ＋（必要時）支持意圖 | `rewardPolicy` |
| 5 | — | 路由到五種 editor | `resolveCustomTaskEditor` |

**畫面上永遠不出現 A／B／C／D。** 那四個代號是內部分類語言，
對家長沒有意義，而且會誘導出「A 是不是比較低階」這種完全不存在的階序。
已由測試釘住（選項文案不得包含任何內部識別字）。

Step 4 的選項不是全部合法 —— 由 deterministic policy 決定：
`recommended` / `available` / `available_with_confirmation` / `unavailable`，
外加一個 `coinAmountStatus` 區分「理念上允許」與「現在算得出金額」。

---

## 四、共用的建立生命週期

| 階段 | preset | parent_custom | 共用？ |
|---|---|---|---|
| 初始草稿 | `createTaskDraft` | `createCustomTaskDraft` | 不同（唯一分岔） |
| 草稿型別 | `TaskDraft` | `TaskDraft` | ✅ 同一個 |
| Editor | 五種 | 五種 | ✅ 同一組 |
| 欄位驗證 | `validateTaskDraft` | `validateTaskDraft` | ✅ 同一支 |
| 規則檢查 | `collectTaskRuleFindings` | 同左 | ✅ |
| AI 建議 | DraftReview | 同左（C／D 才有） | ✅ |
| 回饋決策 | `evaluateTaskReward` | 同左 | ✅ |
| 建立命令 | `CreateParentTaskCommand` | **尚未支援** | ⚠️ 見 §六 |
| RPC | `create_parent_task_v1` | **尚未支援** | ⚠️ 見 §六 |
| idempotency | `clientRequestId` | 同左 | ✅ 與來源無關 |

**editor 仍然只有五種。** 自訂不是第六種 —— 已由測試釘住。

---

## 五、未來入口（extension points，本輪不實作）

| 入口 | 意思 | 前置條件 |
|---|---|---|
| `child_proposal` | 孩子提案，家長審核 | 需要提案審核閘門（AUDIT P0-1，目前直接上架） |
| `co_created` | 親子共同建立 | 需要孩子端參與流程 |
| `wish_plan` | 願望轉成計畫 | 需要許願→定價鏈路（AUDIT P0-2，目前是斷的） |
| `copied_task` | 複製既有任務 | 需要決定複製哪些欄位（幣值決策不可複製） |
| `system_suggestion` | 系統建議 | 需要推薦品質依據 |

型別上已經留好位置（`PlannedTaskCreationSource`），
但 `isEnabledTaskCreationSource()` 對它們一律回 `false`。

**本輪不做：** 孩子提案 UI、孩子端長期任務、願望轉任務、複製任務、
系統自動產生任務、24 小時自動通過、AI draft generator、語音建立。

---

## 六、目前的阻擋

自訂任務可以走到 `TaskDraft` 並通過所有驗證，
但**送不進 RPC**。四件事需要一支 migration，詳見
`CUSTOM_TASK_DOMAIN_CONTRACT.md` §六。

摘要：`command.preset` 必填、`createdFromPreset` 是字面量 `true`、
RPC 的 INSERT 與稽核事件都寫死了 preset。

**沒有用假的 preset id 繞過去** —— 那會讓「這筆任務從哪來」
在資料庫裡永遠答錯。

---

## 七、舊平板首頁的 B3 淘汰計畫

`ParentHomeTablet.tsx`（3000+ 行）目前仍有**兩條活的 AI 幣值路徑**，
本輪與前幾輪都沒有碰：

| 元件 | 呼叫 | 問題 |
|---|---|---|
| `AssignTaskPanel` | `ai-proxy` `suggestTaskCoin` | LLM 直接決定幣值 |
| `NewTaskPanel` | `ai-proxy` `classifyTask` | `base_time_min × difficulty` 就是幣值 |

兩者都直接 `supabase.functions.invoke('ai-proxy')`，不經過 `aiAgent.ts`。

**不得讓新舊兩套 AI 幣值哲學長期共存。** 一邊寫著「AI 碰不到幣值」，
另一邊 LLM 正在決定金額 —— 那不是兩個功能，是同一個產品在對自己說謊。

### 淘汰順序（建議）

1. 統一建立中心的兩個入口都能真的建立任務（第九階段 B）
2. 首頁的兩個 Panel 改為導向 Drawer，不再自己建任務
3. 移除 `suggestTaskCoin` / `classifyTask` 的呼叫點
4. `ai-proxy` 那兩個 handler 標為 deprecated

**第 2 步之前不要刪任何東西** —— 現在移除等於家長在首頁完全建不了任務。

---

## 八、與 AI recommendation 的關係

第一版 AI eligibility 只開放 C／D（B2A.5）。自訂任務接進來後：

- C／D 自訂任務 → 可取得 AI 建議
- A／B 自訂任務 → **不呼叫 Gemini**，但仍可正常建立
- 三種狀態的文案見 `CUSTOM_TASK_DOMAIN_CONTRACT.md` §五

> **未來可能的新工作流：** 「從一句話協助產生草稿」。
> 那是一個 **draft-generation workflow**，與目前的
> `task-ai-recommendation`（對已完成草稿提出調整建議）**不是同一件事** ——
> 前者的失敗模式是產生一個家長沒想過的任務，後者是建議一句更清楚的文案。
> 兩者的安全模型完全不同，不可共用同一支 Edge Function。
> **本輪只記錄，不實作。**


---

## 九、第九階段 B 進度

第六節的「目前的阻擋」**已解除**：自訂任務現在可以一路走到
`create_parent_task_v1` 並真的建立成功（staging 已驗證）。

第四節那張表的最後兩列更新：

| 階段 | preset | parent_custom | 共用？ |
|---|---|---|---|
| 建立命令 | `CreateParentTaskCommand` | 同左（`creationSource` 區分） | ✅ |
| RPC | `create_parent_task_v1` | 同左，**沒有第二支 RPC** | ✅ |

分岔仍然只有一處：初始草稿（`createTaskDraft` vs `createCustomTaskDraft`），
以及 RPC 裡的 preset selection 寫入那一段。

**仍然沒有做：** 兩個入口的畫面。第一層 Drawer 現在只有 preset 入口，
`parent_custom` 目前只能由程式建構命令 —— 那是第九階段 C。

---

## 十、第九階段 C 進度

第九節最後那句話**已經不成立**：兩個入口的畫面都做好了。

抽屜的外層改名為 `TaskCreationDrawer`（原 `PresetTaskDrawer`），
由它負責起點、preset 流程、自訂三步、close／back／dirty、預覽與成功。
畫面由 discriminated union `TaskCreationDrawerRoute` 決定，**不是數字 step**。

第三節那張表對應到的實作：

| Step | 畫面 | 元件 |
|---|---|---|
| — | 起點：兩個入口 | `CustomTaskStart` |
| 1 | 想做什麼 | `CustomTaskBasicsTitle` |
| 2 | 這件事主要是為了什麼 | `CustomTaskBasicsPurpose` |
| 3 | 預計怎麼進行 | `CustomTaskBasicsDuration`（含唯一的 needs_confirmation） |
| 4 | 希望怎麼支持孩子 | **不是獨立步驟** —— 放在 editor 內（`CustomTaskRewardSection`） |
| 5 | 路由 | `resolveCustomTaskEditor`，UI 沒有第二張表 |

Step 4 從獨立步驟改成 editor 內的一區：回饋屬於這份任務的內容，
不是流程的一站。拆出去會讓家長在還沒看到完整安排之前先決定要不要發幣。

第四節那張表現在整條都是 ✅ —— 唯一的分岔仍然是初始草稿
（`createTaskDraft` vs `createCustomTaskDraft`），以及 RPC 裡
preset selection 的寫入那一段。

**仍然沒有做：** AI 尚未接上自訂流程（DraftReview 的 AI 區塊保持現狀）、
`ParentHomeTablet` 的兩條舊 AI 幣值路徑（第七節的 B3 淘汰計畫第 2 步）、
B 類幣值數字。
