# 自訂任務｜建立流程 UI

> 第九階段 C。**已實作，未經人工 QA（見 §十）。**
> 本輪沒有動資料庫、沒有部署、沒有接 AI。

---

## 一、兩個入口

抽屜打開的第一頁是**起點**，不是預設任務清單。

| 入口 | 標題 | 說明 |
|---|---|---|
| `preset` | 從常用任務開始 | 選擇整理好的常見情境，再依家庭需要調整。 |
| `parent_custom` | 自己建立任務 | 寫下你希望孩子投入的事情，再一起整理安排與回饋。 |

清單由 `ENABLED_TASK_CREATION_SOURCES` 產生，**不是畫面硬寫的**。
`child_proposal` / `co_created` / `wish_plan` / `copied_task` / `system_suggestion`
在型別裡有位置，但一個都不上畫面。

> **沒做的東西不顯示。** 一個灰掉的「孩子提案（即將推出）」
> 只會讓家長每次開抽屜都重新失望一次。

起點頁沒有「上一步」，footer 是「取消 ＋ 下一步」。
選卡片才會亮起下一步 —— 與預設任務清單的操作方式一致。

---

## 二、路由

```
entry ─┬─ preset_catalog ─────────────────┐
       │                                   ├→ editor → review → success
       └─ custom_basics_title              │
          → custom_basics_purpose          │
          → custom_basics_duration ────────┘
```

型別是 discriminated union（`taskCreationRoute.ts`），**不是 `step: 1|2|3|4|5`**。

理由具體：`editor` 的「上一步」在兩個入口下的答案不同
（preset 回目錄、自訂回 Step 3）。用一個數字再靠模式去猜，
等於把導覽規則拆散在每一顆按鈕的 `onPress` 裡，
而漏掉的那一顆會把家長丟回一個他沒去過的畫面。

| 目前畫面 | 上一步 |
|---|---|
| entry | 無（footer 顯示「取消」） |
| preset_catalog | entry |
| custom_basics_title | entry |
| custom_basics_purpose | custom_basics_title |
| custom_basics_duration | custom_basics_purpose |
| editor | preset → preset_catalog／自訂 → custom_basics_duration |
| review | 原本那一支 editor |
| success | **無** —— 任務已經建立，回到草稿只會讓家長以為還能再改 |

**所有返回都保留內容**：不清草稿、不換 `clientRequestId`、不重新呼叫服務。

---

## 三、三個基本設定步驟

### Step 1｜想做什麼

進度：`基本設定 1／3｜想做什麼`

| 欄位 | 必填 | 說明 |
|---|---|---|
| 任務名稱 | 是 | placeholder：`例如：每天閱讀、餐後整理書桌` |
| 你的期待 | 否 | 「系統不會直接覆蓋這段話」 |

兩個刻意的決定：

- **不預填孩子名字。** 「承恩的閱讀習慣」看起來像系統已經幫忙決定了，
  而這一欄整個的用途就是保留家長自己的說法。
- **標籤不掛「必填」標記。** 這一頁只有兩個欄位，其中一個寫著「（選填）」——
  另一個當然就是要填的。漏填時按下一步會直接說「請填寫任務名稱」。
  其餘五支 editor 欄位多、必填與選填交錯，仍然保留 `required` 標記。

### Step 2｜這件事主要是為了什麼

進度：`基本設定 2／3｜這件事主要是為了什麼？`

| 家長看到 | 內部分類 |
|---|---|
| 練習照顧自己 | A 生活常規 |
| 參與家庭生活 | B 家庭參與 |
| 孩子自己想挑戰 | C 自主挑戰 |
| 學習或練習技能 | D 學習與技能 |

> **首次進入四項都不可預選。** 這是整個流程最重要的一條規則。
>
> 任務名稱寫「每天閱讀」時，猜「學習或練習技能」幾乎一定猜得對 ——
> 而那正是問題所在：預選會讓這一步從「你希望孩子學到什麼」
> 變成「確認一下系統猜得對不對」，家長按下一步時根本沒有想過那個問題。

因此這一頁**不呼叫 `classifyTask`、不呼叫 Gemini、不看關鍵字**。
已由測試釘住（原始碼掃描 ＋ 渲染後沒有任何 selected radio）。

「孩子自己想挑戰」選中後才出現一句提醒：
「這類任務最好先和孩子確認，是他自己願意投入的挑戰。」
換一個方向就收起來 —— 它不是畫面裝飾。

### Step 3｜預計怎麼進行

進度：`基本設定 3／3｜預計怎麼進行？`

| 家長看到 | 內部值 |
|---|---|
| 做一次就完成 | `once` |
| 固定重複 | `repeating` |
| 持續一段時間 | `for_a_while` |

這一頁**只處理執行期間**。執行日、每次幾分鐘、時段、完成標準與回饋方式
全部在 editor 裡 —— 塞進這一頁的話，它會變成一份五種形式的聯集表單，
而其中一半的欄位對家長剛選的那一種根本沒有意義。

---

## 四、路由到五種既有 editor

唯一來源是 `resolveCustomTaskEditor(purposeCategory, durationChoice)`。
**React 元件裡沒有第二張表。**

| | 做一次 | 固定重複 | 持續一段時間 |
|---|---|---|---|
| 練習照顧自己 | 單次 | ⚠️ **需要確認** | 短期小計畫 |
| 參與家庭生活 | 單次 | 固定重複 | 家庭角色 |
| 孩子自己想挑戰 | 單次 | 固定重複 | 成長計畫 |
| 學習或練習技能 | 單次 | 固定重複 | 成長計畫 |

**editor 仍然只有五種。** 自訂不是第六種。

### 生活習慣 ＋ 固定重複的確認

畫面上是一塊淡綠色的 inline 區塊（不是警示色 —— 家長沒有做錯任何事）：

> **要不要先設成一段時間的生活小計畫？**
> 生活習慣通常適合先練習一段時間，穩定後就能自然結束，不必一直留在每天的任務中。
>
> ［改成一段時間］ ［仍使用固定重複］

回答之前「下一步」是 disabled。文案裡沒有 `short_support`、
沒有 `needs_confirmation`、也沒有 `rationaleCode`。

兩種回答都由 `confirmCustomTaskEditor()` 決定，**不是在 `onPress` 裡寫兩行**：

| 回答 | 結果 |
|---|---|
| 改成一段時間 | 期間換成 `for_a_while`，路由自然收斂 → 短期小計畫 |
| 仍使用固定重複 | 期間不變，`editorKind = recurring`，記下 `overridesSuggestion: true` |

「仍使用固定重複」不是「什麼都不做」—— 系統原本要給的是 `short_support`，
家長推翻之後要得到的是 `recurring`，那個對應關係是路由的一部分。

換了目的或期間之後，先前對確認的回答會一併清掉。

---

## 五、Editor 重用

**沒有為自訂任務做新的 editor，也沒有做一個通用 editor 取代五種。**

做法是把 `family` / `variant` 改成 optional：

```ts
family?: TaskPresetFamily;
variant?: TaskPresetVariant;
```

自訂任務兩者都是 `undefined`，**不是一組假的 preset 物件** ——
假資料會一路帶到草稿、命令與資料庫，而「這筆任務從哪來」在那之後就永遠答錯了。

少了 variant 時，各處的替代來源：

| 原本 | 自訂任務 |
|---|---|
| `family.title` | `draft.title` |
| `variant.label` | `自訂任務` |
| `variant.optionGroups` | `[]`（這種來源本來就沒有選項組） |
| `variant.completionPolicy` | `completionPolicyForEditor(editorKind)`（與命令映射同一支函式） |
| `variant.defaultDraft.durationDayChoices` | `CUSTOM_DURATION_DAY_CHOICES`（取自 catalog 最常用的組合，不是新數字） |
| `variant.safetyNotes` / `policyFlags` / `feedbackHint` | 不顯示 |
| `family.iconKey` | `CUSTOM_TASK_ICON_KEY[purposeCategory]`（既有 icon 套件，無新 dependency） |

### 家庭角色的兩處差異

自訂的家庭角色沒有角色清單可選，所以：

- `roleOptionId` 初始為 `'other'`（不是 `''`）。停在「尚未選」等於要求家長
  從一個不存在的選單裡挑一項，而 validator 會永遠擋著預覽。
- 角色名稱改成文字輸入；負責內容從空清單開始，可新增到上限
  （`ResponsibilityListEditor` 原本只允許補一項自訂，那是為了「模板 ＋ 一項」設計的）。

### Editor 的 header

進入 editor 之後標題是「建立自訂任務」，階段文字是「詳細設定」。

**刻意不接續成「步驟 4／7」** —— 五種 editor 的欄位數量不一樣，
一個假的總步數只會讓家長以為自己還有六頁要填。

---

## 六、回饋區塊

**沒有獨立的「回饋方式 Step 4」。** 回饋屬於這份任務的內容，不是流程的一站；
拆成獨立步驟會讓家長在還沒看到完整安排之前先決定要不要發幣。

區塊標題是「怎麼被看見」，不是「回饋方式」——
後者問的是設定，前者問的是家長真正在決定的事。

| 家長看到 | 內部值 |
|---|---|
| 一般紀錄 | `record_only` |
| 進度與肯定 | `progress_only` |
| 家庭參與 | `family_contribution` |
| 成長幣回饋 | `coin_eligible` |

選項來自 `evaluateCustomTaskRewardOptions()`，**元件裡沒有 purpose × reward 的規則**。
`RewardPolicyChips` 在 `variant === undefined` 時整段委派給 `CustomTaskRewardSection`。

| availability | 畫面行為 |
|---|---|
| `recommended` | 排最前面，標「建議」 |
| `available` | 正常可選 |
| `available_with_confirmation` | 點一下**不會直接套用**，先出確認區塊 |
| 不可完成（`canFinalizeRewardOption` 為 false） | demo 不列出；development 顯示 disabled ＋ 人話理由 |

### B 類成長幣目前的樣子

- 一般使用模式：**整項不顯示**
- development：顯示但 disabled，理由是「這類任務目前尚未有適用的成長幣規則。」
- 不顯示 `B_COIN_POLICY_NOT_CONFIGURED`、
  `FAMILY_PARTICIPATION_NOT_COIN_ELIGIBLE` 或任何 reason code
- 不顯示 0 枚，也不借用 C／D 的幣值表

措辭是「尚未有」而不是「不可以」：產品概念上已經允許，
缺的是 `coin-policy.json` 的 B 類數字，而那是產品決策。

### 一項連帶修正

`validateFamilyParticipationReward` 舊版要求家庭參與**只能**是
`family_contribution`，連「只留下紀錄」都擋。

第九階段 B 已經把 `create_parent_task_v1` 的 guard 改成只擋成長幣
（B ＋ `record_only`／`progress_only` 可以建立）。這一輪讓 App 跟著對齊 ——
兩邊說法不同的話，家長會遇到「App 說不行、資料庫其實可以」。

家庭角色仍然固定 `family_contribution`（RPC 對它沒有放寬），
那一條移到 `validateFamilyRoleDraft` 單獨守著。

---

## 七、成長幣顯示

- **沒有硬編任何金額。** 有測試掃過自訂流程的原始碼，
  `10 枚`、`finalAmount = 數字`、`estimatedMinutes * ...` 全部不存在。
- 金額來自 `evaluateTaskReward`（與送出時同一組函式），
  DraftReview 顯示的就是等一下真的會寫進資料庫的那個。
- 沒有每次時間就算不出金額，成長幣選項在一般模式不會出現。
- 改掉每次時間之後預覽會重算（有測試：10 分鐘 → 30 分鐘）。
- C／D 既有的幣值行為一個字沒改。

---

## 八、DraftReview 與 CreatedTaskSummary

兩者的 `family` / `variant` 都改成 optional。

**Preset：行為與文案完全不變。**

**Parent custom：**

| 顯示 | 不顯示 |
|---|---|
| 任務名稱 | preset 家族／版本 |
| 「自訂任務｜〈形式〉」 | 空白的 preset 區塊 |
| 生活化的方向（成功畫面） | `parent_custom` / `creation_source` |
| 執行安排、回饋方式 | `created_parent_custom`、政策版本 |
| 家長期待（有值才顯示） | `undefined` |

形式名稱由 `editorFormLabel(editorKind)` 產生，
與 `variantFormLabel(variant)` **逐字相同**（有測試比對兩邊的集合）——
不然同一種任務在自訂與預設下會叫不同名字。

### AI

DraftReview 的 AI 區塊**本輪保持現狀**：抽屜沒有傳 `ai` prop，
所以不顯示、也不呼叫任何服務。沒有 preset 時不會 crash（有測試）。

未來 C／D 的自訂任務會共用同一套 AI Review；A／B 不呼叫 Gemini。

---

## 九、Dirty、關閉與切換入口

| 狀態 | dirty？ |
|---|---|
| 起點頁 | 否 |
| Step 1 打了名稱或期待 | 是 |
| Step 2／3 選了方向或安排 | 是 |
| editor 改過草稿 | 是（沿用既有的 `isDraftDirty`） |

關閉時 dirty 走**既有**的放棄確認（沒有第二套 modal）。

切換建立方式由 `pathSwitchEffect()` 決定：

| | 結果 |
|---|---|
| 自訂的輸入 | **保留**（切去 preset 看一輪回來，剛打的字還在） |
| preset 的家族／版本選擇 | 保留 |
| 目前的草稿與 `clientRequestId` | **丟掉** |

> 兩份草稿共用同一個 `clientRequestId` 是最糟的組合：
> 家長先建 preset 失敗、切去自訂、再送出，RPC 會認為那是重送
> 並回放**第一份**任務 —— 家長拿到一個他已經放棄的東西。

從 editor 返回 Step 3、什麼都沒改再往前時**不重建草稿**，
由 `customBasicsSignature()` 判斷。重建會清掉 editor 裡填的所有東西，
而且換掉 `clientRequestId`。

---

## 十、人工 QA checklist（**尚未執行**）

Claude 無法實際操作 Expo，以下**沒有一項被驗證過**。

1. 開啟任務管理
2. 點「新增任務」
3. 看見兩個入口，而且只有兩個
4. preset flow 從頭到尾仍然正常（選家族 → 版本 → 編輯 → 預覽 → 建立）
5. custom Step 1 的文字與 placeholder 正確，沒有預填孩子名字
6. Step 2 首次進入四項都沒有被選中
7. Step 3 只有三種安排
8. 「練習照顧自己 ＋ 固定重複」出現確認區塊，兩個按鈕都會到正確的 editor
9. 五種 editor 都能各自進入
10. 家庭參與的任務看不到成長幣選項
11. 學習／挑戰類設定每次時間後看得到正確的成長幣金額
12. custom 的預覽上沒有任何 preset 字樣或空白區塊
13. 建立成功
14. 任務出現在正確的分頁（日常／長期）
15. 每一頁的「上一步」都保留內容
16. 有內容時按 X 會出現放棄確認
17. Drawer 寬度與比例和現有系統一致
18. compact 寬度下 footer 不遮住內容

**不要新增自動 seed，不要清空 staging。**

---

## 十一、示意圖的定位

本輪參考了四張視覺示意圖。它們**只是視覺與資訊層級參考**，
以下幾點刻意沒有照抄：

- Step 2 的圖預先選了一個選項 —— 正式版首次進入不可預選
- Step 3 的圖把執行方式、editor 欄位與回饋混在同一頁 ——
  正式版只問執行期間
- 圖中的「成長幣回饋 10 枚」是視覺示例 —— 正式版不硬編任何金額
- 部分圖的步驟數是 1／2 —— 正式版是 1／3
- 圖中偶爾出現的亮藍色選取框不是家長端的顏色 —— 一律用深松綠 ＋ 淡綠底

**圖片沒有 commit 進 repo。**

---

## 十二、本輪沒有做

- 資料庫：沒有 migration、沒有 db push、沒有改 RPC 或完成函式
- production：沒有部署任何東西
- AI：沒有接 `task-ai-recommendation`、沒有呼叫 Gemini
- `ParentHomeTablet` 的舊 AI 幣值路徑（`AssignTaskPanel` / `NewTaskPanel`）
- B 類幣值數字（需產品拍板）
- 孩子提案、願望轉計畫、複製任務、第六種 editor
- 週報／到期提醒仍未讀 `reward_support_*`
- `reward_support_intent` 的 UI：目前唯一會用到它的組合（B ＋ 成長幣）
  在幣值政策補上之前選不到，所以這一輪沒有做支持意圖的選擇畫面
