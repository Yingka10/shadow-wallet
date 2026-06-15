# Shadow Wallet｜CLAUDE.md

> Claude Code 每次啟動自動讀取此檔案。
> 此專案所有 coding 決策都在這個脈絡下進行。

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

| 代號 | 名稱 | 說明 |
|------|------|------|
| Task-A | 基本生活自理 | 6-9 歲已退出幣制 |
| Task-B | 家庭本分 | 不發幣，給時間儲蓄（time_saving_min） |
| Task-C | 超出本分貢獻 | 發幣，幣值較高 |
| Task-D | 學習成長里程碑 | 拆解成子任務節點，節點完成才發幣 |

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
任務系統：tasks, task_completions, overrides
幣值系統：wallets, transactions, reward_items
長期任務：long_term_goals, time_savings
回饋系統：weekly_reports, monthly_reports, credit_logs
手足關係：sibling_relations
事件記錄：intervention_log
```

### intervention_log 說明

append-only 業務事件記錄，服務 audit log 頁、週報/月報統計、家長諮詢 AI。
關鍵設計：
- `context_snapshot jsonb`：觸發當下的指標快照，讓 AI 問答重建因果不需回算歷史
- `ai_suggested` / `parent_decision` jsonb：保留 AI 建議 vs 家長實際決定的對比
- `override_id`：家長標記事件同時寫 `overrides`（金流真相）與此表（可追溯事件），兩表在同一 transaction 內寫入
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

### 前置解鎖制（6-9 歲）
```typescript
// Task-A 和 Task-B 未完成時，Task-C/D 幣值打折
const discount = allABCompleted ? 1.0 : 0.7
displayCoin = Math.round(baseCoin * discount)
// 不完全隱藏，只是顯示打折幣值並說明原因
```

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

### 利息結算（週日自動）
```typescript
// 儲蓄帳戶（wallet_type='saving'）
interest = Math.round(balance * 0.05)
// 寫一筆 Transaction（type='interest'）
```

### 棄坑偵測
```typescript
// 第一層（3天）：孩子端顯示溫和詢問卡，不通知家長
// 第二層（7天）：週報加入警示
// 第三層（14天）：建議暫停
// 觸發時機：App 開啟時執行
```

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

- [x] 流程一：問卷與 Profile 生成
- [x] 流程一：兌換目標設定
- [x] 流程一：初始任務推薦
- [x] 流程二：孩子端每日循環（6-9 歲）
- [x] 流程二：家長端 Override + 臨時任務
- [x] 流程三：週報生成（模板字串）
- [ ] 流程三：棄坑偵測（lib/abandonDetection.ts 尚未建立）
- [ ] 整合測試

> 每完成一個模組，把對應的 [ ] 改成 [x]