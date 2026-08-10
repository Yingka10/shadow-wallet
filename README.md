# Shadow Wallet (影子貨幣錢包)

Shadow Wallet 是一個家庭教養行動 App，核心是「bookkeeping + 任務分配」，不是監控系統，也不是遊戲化競賽平台。

本專案目前以 6-9 歲族群為 MVP 優先目標，透過每日任務回報、金幣/時間儲蓄、家長調整與週期回饋，幫家庭建立可持續的日常合作節奏。

## 產品核心原則

1. 信任制
- 孩子自行回報任務完成。
- 系統不做強驗證，家長可隨時 Override。

2. 分齡動態參數
- 依年齡段調整任務類型、幣制與互動複雜度。

3. 週期回饋
- 每日記錄、每週彙整、每月對話。

## 三大流程 (Flow)

- Flow 1: 初始設定 (一次性)
  - 問卷 -> Profile -> 兌換目標 -> 任務推薦/確認
- Flow 2: 每日循環 (持續)
  - 孩子每日查看/完成任務 -> 回饋動畫 -> 錢包與紀錄更新
  - 家長可新增任務與調整
- Flow 3: 週期回饋 (每週/每月)
  - 週報、利息結算、棄坑偵測 (目前多數為待完成)

注意: 任務類型 Task-A/B/C/D 與系統流程 Flow 1/2/3 是兩套命名，不可混用。

## 任務類型 (Task Category)

2026-07 改版，代號 A/B/C/D 不變、語義已更新。完整規格見 `docs/SPEC_task-taxonomy-2026-07.md`。

- Task-A: 生活常規 (2-6 歲養成期可少量發幣並遞減退場；6 歲以上預設隱藏)
- Task-B: 家庭參與 (不發幣，也不給時間儲蓄；改以家庭葉片/貢獻紀錄/週報肯定)
- Task-C: 自主挑戰 (發幣或時間儲蓄；來源須為孩子提出或親子協商)
- Task-D: 學習與技能 (發幣或時間儲蓄；獎勵投入與持續，排除結果導向)

任務除了「目的 (A/B/C/D)」還有三個維度: 執行期間 (單次/週期/長期)、任務來源、回饋方式。
長期任務不是第五類，是執行形式。

> 程式碼尚未完全跟上新定義，落差與待辦見 `docs/DELTA_task-taxonomy-2026-07.md`。
> 下方「關鍵業務邏輯」描述的是**現況 code**，其中 Task-A 不發幣與 Task-B 時間儲蓄兩點與新分類牴觸。

## 技術棧

- App: React Native + Expo (SDK 54)
- 語言: TypeScript (strict)
- 導航: React Navigation (Stack)
- Backend: Supabase (PostgreSQL + Auth + Realtime)
- 時區處理: dayjs + timezone/utc
- 測試: Jest + @testing-library/react-native

## 專案架構

```text
App.tsx                      # Root navigator, route 定義
src/
  screens/
    auth/                    # 入口與登入
    onboarding/              # Flow 1
    child/                   # Flow 2 孩子端
    parent/                  # Flow 2 家長端
  components/                # UI 元件與卡片
  hooks/                     # 畫面資料讀取與狀態管理
  lib/                       # Supabase / 業務邏輯 / AI 呼叫
  constants/                 # 設計系統與常數
  types/                     # DB 與 domain type 定義
docs/superpowers/            # 規格與實作計畫文件
```

## 關鍵業務邏輯

1. 幣值計算

```ts
coin = Math.round(base_time_min * difficulty)
```

- Task-A / Task-B: 不發幣 (⚠️ 新分類要求 A 類 2-6 歲可發幣，未實作)
- Task-D: 可用 coin_override

另有一套建立任務時的建議幣值路徑 (`ai-proxy/analyzeTask` → 八步資格閘門 → `coin-policy.json`)，
與上面的完成時計算並存且尚未對齊。

2. 前置解鎖折扣 (6-9 歲)

```ts
displayCoin = Math.round(baseCoin * (allABCompleted ? 1.0 : 0.7))
```

⚠️ 前提已被新分類動搖 (A 類退場、B 類不商品化)，保留/改條件/移除待團隊決定。

3. Task-B 時間儲蓄

```ts
time_saved = task.time_saving_min
```

⚠️ 與新分類牴觸: 新規則的時間儲蓄屬 C/D，B 類改為貢獻紀錄。

4. 時區與日期
- 統一使用 Asia/Taipei
- 日期採 ISO 8601 (YYYY-MM-DD / TIMESTAMPTZ)

5. 長期任務節點
- Task-D habit 會推進 current_day
- 命中 checkpoint_rewards 時發放 milestone coin
- 斷天數後有 soft reset (不低於前一個 checkpoint)

## 資料庫概要 (Supabase)

主要表格:

- 帳號/家庭: families, parents, children, child_profiles
- 任務: tasks, child_tasks, task_completions, overrides, system_task_templates
- 幣值/目標: wallets, transactions, reward_items, long_term_goals, time_savings
- 回饋: weekly_reports, monthly_reports, credit_logs
- 關係: sibling_relations

重要 DB 能力:

- RPC: setup_child_tasks
  - 原子寫入模板任務 + 自訂任務 + child_tasks 綁定 + reward_items 目標

## 快速開始

### 1) 安裝依賴

```bash
npm install
```

### 2) 設定環境變數

建立 .env，至少填入:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

可選:

```env
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key
```

### 3) 啟動開發

```bash
npm run start
```

其他 target:

```bash
npm run android
npm run ios
npm run web
```

## 測試與檢查

```bash
# 單元測試
npx jest

# 型別檢查
npx tsc --noEmit
```

## 目前功能狀態 (依現況)

- 已完成
  - Onboarding 基本流程 (帳號 + 問卷 + child 建立)
  - Flow 1 目標與任務設定三步驟
  - child_tasks 與模板任務推薦串接
  - Flow 2 孩子端 HomeScreen 與任務完成流程
  - 任務完成後的幣值/時間儲蓄/交易寫入
  - 長期任務基本 check-in 與里程碑發幣

- 進行中/待完成
  - Parent 端 Override 全流程
  - Flow 3 週報、月報、利息結算完整實作
  - 棄坑偵測完整產品化
  - 部分畫面仍為 placeholder 或 stub

## 已知限制

- HomeScreen 目前仍有 mock coin balance 顯示。
- ParentScreen 內 ageGroup 尚有 TODO (目前固定示例值)。
- 部分 AI 能力有 fallback，但尚未建立完整觀測與重試策略。

## 主要文件

- CLAUDE.md: 產品定位、資料表、核心規則、開發規範
- docs/SPEC_task-taxonomy-2026-07.md: 任務分類、分齡體驗與回饋規則 (分類的單一來源)
- docs/DELTA_task-taxonomy-2026-07.md: 上述分類與現況程式碼的落差清單
- docs/superpowers/specs/2026-05-09-flow1-goal-task-setup-design.md
- docs/superpowers/plans/2026-05-09-flow1-goal-task-setup.md
- docs/superpowers/plans/2026-05-10-child-daily-cycle.md
- docs/superpowers/plans/2026-05-10-homescreen-design-migration.md

## 開發規範摘要

- 所有 Supabase 操作需包含錯誤處理。
- TypeScript strict，避免 any。
- 幣值統一使用整數與 Math.round。
- DB 操作集中在 src/lib，畫面邏輯在 screens。
- React Native UI 使用 StyleSheet.create，避免 inline style。

---

如果你是新加入的開發者，建議從以下順序閱讀:

1. CLAUDE.md
2. App.tsx 與 src/types/database.ts
3. src/lib/onboarding.ts、src/lib/taskRecommend.ts、src/lib/taskActions.ts
4. src/screens/onboarding 與 src/screens/child/HomeScreen.tsx