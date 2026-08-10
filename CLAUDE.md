# Shadow Wallet｜CLAUDE.md

> Claude Code 每次啟動自動讀取此檔案。
> 此專案所有 coding 決策都在這個脈絡下進行。
> **系統現況(哪些做了、哪些是斷的)以 `AUDIT_2026-07.md` 為準;MASTER.md 是設計意圖,不是現況。**
> **任務分類 A/B/C/D 的定義以 `docs/SPEC_task-taxonomy-2026-07.md` 為準**(2026-07 改版,代號沒變、語義變了);
> 該分類與現況程式碼的落差見 `docs/DELTA_task-taxonomy-2026-07.md`。
> 本檔 2026-07-04 依審計結果修正過一輪;之後的規則:哪個 PR 讓敘述變真/變假,就在同一個 PR 更新對應段落。

---

## 平台策略（重要）

**家長端以平板（≥768px）為唯一開發目標。** 手機版家長端（< 768px）不再維護。
- 平板端用 `ParentHomeTablet`、`ParentWeeklyTablet`、`ParentManageTablet`
- 手機版的 `ParentDashboardScreen`、`ParentWeeklyReportScreen` 保留但不再加功能
- 所有家長端新功能只做平板 UI

---

## 系統定位

**Shadow Wallet（影子貨幣錢包）** 是一個家庭教養行動 App。

核心定位是 **bookkeeping 加上任務分配工具**，不是監控系統，不是遊戲。
三個設計原則驅動所有設計決策：

| 原則 | 說明 | 對應流程 |
|------|------|---------|
| 信任制 | 孩子自行回報，系統不驗證，家長隨時可 Override | 流程二 |
| 分齡動態參數 | 年齡段決定任務類型、幣制、介面複雜度 | 流程一 |
| 週期回饋 | 每日記錄，每週彙整，每月月會 | 流程三 |

---

## 技術棧

| 分類 | 套件 | 版本 |
|------|------|------|
| 框架 | React Native + Expo | RN 0.81.5 / Expo ~54 |
| 後端 | @supabase/supabase-js | ^2.105 |
| 語言 | TypeScript（strict: true） | ~5.9 |
| 路由 | React Navigation（Stack + BottomTabs） | ^7.x |
| 日期 | dayjs | ^1.11 |
| 圖示 | react-native-svg | 15.12 |
| 測試 | jest-expo + @testing-library/react-native | - |

**測試方式：** Expo Go App 掃 QR code，不需要 Apple Developer 帳號

---

## MVP 範圍

- **年齡段：** 6-9 歲優先
- **流程一：** 問卷 → Profile 生成 → 任務推薦 → 兌換目標設定
- **流程二：** 孩子端每日循環 + 家長端 Override + 臨時任務
- **流程三：** 週報（模板字串版）+ 利息結算 + 棄坑偵測

---

## 命名規則（重要：避免混淆）

### 任務類型（Task Category）

> **分類定義已於 2026-07 改版**，正式規格見 `docs/SPEC_task-taxonomy-2026-07.md`。
> 代號 A/B/C/D 沒變，**語義變了**；程式碼尚未完全跟上，落差清單見 `docs/DELTA_task-taxonomy-2026-07.md`。
> 下表左半是新定義（設計依據），右半是**目前 code 的實際行為**（寫程式時以右半為準）。

| 代號 | 新名稱（2026-07） | 新規則 | code 現況 |
|------|------|------|------|
| Task-A | 生活常規 | 2-6 歲養成初期可少量發幣，隨 skill_status 遞減退場；6 歲以上預設隱藏 | 一律不發幣（`fn_complete_task.sql:50`）；`skill_status` 欄位不存在 |
| Task-B | 家庭參與 | 不發幣，**也不給時間儲蓄**；改以家庭葉片／貢獻紀錄／週報肯定 | 不發幣，但仍寫 `time_savings`（`fn_complete_task.sql:107`） |
| Task-C | 自主挑戰 | 發幣或時間儲蓄；**來源須為孩子提出或親子協商** | 發幣；`source` 欄位不存在，來源未落地 |
| Task-D | 學習與技能 | 發幣或時間儲蓄；獎勵投入與持續，**排除結果導向** | 節點式發幣（`fn_complete_task.sql:121`） |

**任務目的（A/B/C/D）之外還有三個維度**：執行期間（單次／週期／長期）、任務來源、回饋方式。
長期任務**不是第五類**，是執行形式。目前 DB 只有 `category` 一欄，其餘維度未落地（DELTA §4）。

幣值資格與計算的規則引擎已實作於 `supabase/functions/ai-proxy/`：
`rewardEligibility.ts`（資格閘門）→ `coinPolicy.ts` + `coin-policy.json`（幣值，policyVersion 版本化）。
⚠️ 平板家長端目前仍呼叫舊的 `suggestTaskCoin`，這套沒跑到（DELTA §3）。

### 系統流程（Flow）

- **流程一** = 初始設定（一次性）
- **流程二** = 每日循環（持續）
- **流程三** = 週期性回饋（每週/每月）

> ⚠️ 任務類型 A/B/C/D 和流程一/二/三是完全不同的命名系統，不要混用。

---

## 資料庫 Schema

主要 Table（已在 Supabase 建好）：

```
核心帳號：families, parents, children, child_profiles
任務系統：tasks, child_tasks, task_completions, overrides, system_task_templates
幣值系統：wallets, transactions, reward_items, redemption_requests
長期任務：long_term_goals, time_savings
回饋系統：weekly_reports, monthly_reports, growth_moments, parent_observations, credit_logs
手足關係：sibling_relations
事件記錄：intervention_log
```

注意：`credit_logs`、`sibling_relations` 目前零使用（AUDIT 1-C）；`setup_child_tasks`、`my_parent_id`、`my_family_id`、`settle_weekly_interest` 四個 DB 函數只存在 live DB、不在 migrations（回填中，AUDIT P1-7）。

### intervention_log 說明

append-only 業務事件記錄，服務 audit log 頁、週報/月報統計、家長諮詢 AI。
關鍵設計：
- `context_snapshot jsonb`：觸發當下的指標快照，讓 AI 問答重建因果不需回算歷史
- `ai_suggested` / `parent_decision` jsonb：保留 AI 建議 vs 家長實際決定的對比
- `override_id`：**設計意圖**是家長標記同時寫 `overrides` 與此表、同一 transaction。**現況並非如此**：`parentMarkTask` 完全沒寫 intervention_log，全表 0 列（AUDIT 3-3 #14、5-9 #5）；P1-2 的 `mark_task_atomic` RPC 會兌現這條
- ON DELETE RESTRICT（family_id、child_id）：保護 audit log 不被連帶刪除；未來實作 GDPR 個資刪除前需先匿名化本表 log

---

## 核心業務邏輯

### 幣值計算
```typescript
// 一般任務
coin = Math.round(base_time_min * difficulty)

// D 類里程碑任務
coin = coin_override  // 家長直接設定

// Task-B 不計算幣，改計算時間儲蓄
time_saved = task.time_saving_min
```
⚠️ 上面是 `fn_complete_task` 的**現況**。兩點與 2026-07 新分類牴觸：
Task-B 不該再有時間儲蓄（DELTA §2）；Task-A 在 2-6 歲該能發幣（DELTA §1）。改動前先看 DELTA。

另有一套**新的建議幣值路徑**（建立任務時算，非完成時算）：
`ai-proxy` 的 `analyzeTask` → `runEligibilityGate`（八步資格閘門）→ `calcCoins`
（時間分級 band → baseCoins → 難度加減 → range clamp，數字在 `coin-policy.json`）。
兩條路徑目前並存且未對齊，不要假設誰是唯一來源。

### 前置解鎖制（6-9 歲）
```typescript
// Task-A 和 Task-B 未完成時，Task-C/D 幣值打折
const discount = allABCompleted ? 1.0 : 0.7
displayCoin = Math.round(baseCoin * discount)
// 不完全隱藏，只是顯示打折幣值並說明原因
```
⚠️ **前提已被新分類動搖、處置未定**（DELTA §5）：6 歲以上 A 類預設退場、B 類不再商品化，
「前置任務」實際只剩 B 類。團隊決定保留／改條件／移除之前，**不要改這段邏輯**。

### 信任制底線
```typescript
// 同一任務、同一孩子、同一天，只能有一筆 TaskCompletion
// 資料庫層有 unique constraint，應用層不需要額外判斷
// allow_repeat = true 的任務例外（由應用層控制）
```

### 補記規則
```typescript
// 可以補記最多 2 天前的任務
const maxBackfillDays = 2
```

### 年齡段判斷
```typescript
function getAgeGroup(birthDate: Date): AgeGroup {
  const ageMonths =
    (new Date().getFullYear() - birthDate.getFullYear()) * 12 +
    (new Date().getMonth() - birthDate.getMonth())
  if (ageMonths < 48)  return '2-4'
  if (ageMonths < 72)  return '4-6'
  if (ageMonths < 108) return '6-9'
  return '9-12'
}
```

### Baumrind 教養類型
```typescript
type BaumrindType =
  | 'elite_high_control'   // 高要求 × 高回應
  | 'pragmatic_labor'      // 高要求 × 低回應
  | 'guilt_compensate'     // 低要求 × 高回應
  | 'free_fatigue'         // 低要求 × 低回應
```

### 利息結算
```sql
-- 實況（live RPC settle_weekly_interest，AUDIT 5-9 #2）：
-- 利率不是寫死 5%，存於 wallets.interest_rate 欄位
interest = round(balance * wallets.interest_rate)
-- 寫一筆 Transaction（type='interest'）
```
⚠️ 現況：**無 cron 排程（從未自動跑過）、無 idempotency（跑一次加息一次）、無雙週判斷**。P1-8 會重寫此 RPC（用 last_interest_at 做間隔判斷）並排 cron。在那之前**不要手動呼叫它**。

### 棄坑偵測
```typescript
// 設計：三層（3天孩子端詢問卡 / 7天週報警示 / 14天建議暫停）
```
⚠️ 現況(AUDIT 3-2 #12):後端 `supabase/functions/detect-abandonment/` 存在(寫 weekly_reports.abandonment_tier + intervention_log),但 **cron 未排、前端三層 UI 全未實作、abandonment_tier 無人讀取**。「App 開啟時執行」的舊描述不成立;`lib/abandonDetection.ts` 不存在也不會建(邏輯在 Edge Function)。

---

## 資料夾結構

```
src/
  screens/
    auth/              # 登入入口（EntryScreen、ParentLoginScreen、ChildLoginScreen）
    onboarding/        # 流程一（Onboarding、GoalSetup、TaskSelection、Overview）
    child/             # 流程二孩子端（Home、Wallet、Wish、Profile、LongTermDetail）
    parent/            # 流程二家長端 + 流程三週報
                       #   ParentTabNavigator（底部 Tab）
                       #   Dashboard、TaskList、TaskDetail、TaskCreate
                       #   LongTermCreate、Redemption、WeeklyReport
                       #   ObservationHistory、Settings
  components/          # 共用元件（TaskItem、GoalHeroCard、FeedbackAnimation 等）
  context/
    SelectedChildContext.tsx   # 家長端跨 Tab 共用的選中孩子狀態
  lib/
    supabase.ts
    taskActions.ts
    onboarding.ts
    taskRecommend.ts
    aiAgent.ts         # AI 輔助（任務建議等）
  hooks/
    useTodayTasks.ts
    useWallet.ts
    useParentDashboard.ts
    useParentTaskList.ts
    useParentRedemption.ts
    useParentWeeklyReport.ts
  types/
    database.ts
    index.ts
  constants/
    colors.ts
    parentTheme.ts
```

---

## Coding 規則

1. 所有 Supabase 操作加 try/catch
2. TypeScript 嚴格模式，不用 `any`
3. 日期時間統一 ISO 8601，時區 `Asia/Taipei`
4. 幣值計算一律整數（`Math.round()`）
5. 資料庫操作放 `src/lib/`，畫面邏輯放 `screens/`
6. 不寫 inline style，用 `StyleSheet.create()`
7. 每個 lib 函數加 JSDoc 說明

---

## 環境變數（.env）

```
EXPO_PUBLIC_SUPABASE_URL=你的 Supabase URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=你的 anon key
```

---

## 目前進度

> 細項與斷點以 `AUDIT_2026-07.md` 為準;行動清單見 `TEAM_PLAN_2026-07.md`。

- [x] 流程一：問卷與 Profile 生成、兌換目標設定、初始任務推薦
- [x] 流程二：孩子端每日循環（6-9 歲）＋ 家長端 Override（非原子,P1-2 RPC 化中）＋ 臨時任務
- [x] 流程二：長期任務 habit / skill / family（skill 孩子端詳情是殼、challenge 未做）
- [x] 流程三：週報生成（Gemini,手動觸發;cron 未排 → P1-8）
- [ ] 流程二：許願→定價核可→兌換（定價缺失,鏈是斷的 → P0-2）
- [ ] 流程二：孩子提案審核閘門（目前直接上架 → P0-1）
- [ ] 流程三：棄坑偵測（後端 Edge Fn 有;cron 與前端三層 UI 皆無）
- [ ] 整合測試

> 每完成一個模組，把對應的 [ ] 改成 [x]（只由 A 改本檔）