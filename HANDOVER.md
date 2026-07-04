# 交接說明(給 B 和 C,2026-07)

> 這一頁是入口。目的:讓你在 **30 分鐘內**知道系統現況、你負責什麼、第一週要修什麼。
> 兩份主文件:`AUDIT_2026-07.md`(全系統體檢報告,每條發現都附檔案:行號)、`TEAM_PLAN_2026-07.md`(三人分工)。

---

## 0. 先講三件所有人都要知道的事

1. **文件的信任層級:CLAUDE.md(已修正,可信)> AUDIT(現況事實)> MASTER.md(設計意圖,現況描述多半過時)。** CLAUDE.md 已於 2026-07-04 依審計修正過;想知道「某功能實際做到哪、哪裡是斷的」查 AUDIT(有檔案:行號);MASTER 只拿來理解「當初為什麼這樣設計」。文件更新規則:哪個 PR 讓敘述變真,就在同一個 PR 更新 CLAUDE.md 對應段落,且只由 A 改。
2. **系統骨架是健康的,壞的是幾條「沒接上的線」。** 每日循環(指派→孩子完成→發幣→雙裝置即時同步)完整且品質好;斷的是:許願定價(P0-2)、孩子自建任務無審核(P0-1)、審核管線沒接水(P1-1)、cron 全部沒排(P1-8)。細節見 AUDIT 第 2 章。
3. **分工是按「層」不是按「端」**:A=後端/資料合約、B=兩端前端功能、C=樣式/設計系統。地盤與防撞規則見 TEAM_PLAN 第一、二節 —— 動工前務必讀完第二節的 5 條規則,尤其:`types/database.ts` 只有 A 能改、`App.tsx` 只有 B 能改、C 只出「樣式-only PR」。

## 1. 環境設定(兩人都要)

```
npm install
cp .env.example .env   # 跟 A 拿 EXPO_PUBLIC_SUPABASE_URL / ANON_KEY
npx expo start         # Expo Go 掃 QR;平板畫面要 width ≥ 768 才會出現
npm test               # jest;現有 8 個測試檔要保持綠燈
```

- Supabase 專案由 A 管理(project: mduaghqszbwmoigllpbj);**不要直接在 dashboard 改 schema 或下 SQL**,需要新欄位/新查詢開 issue 給 A。
- 測試帳號/測試家庭資料跟 A 拿;live DB 目前有髒資料(9 組同名重複任務、6 筆舊 redemption_requests),A 會清,見 AUDIT 5-9 #4。

## 2. 給 B(前端功能 owner)

**讀這些(順序)**:
1. `TEAM_PLAN` 第一節「B」的任務表 + 第三節交接清單(A 會帶你走一遍家長端)
2. `AUDIT` 第 2 章(黃金路徑,你要修的斷點全在這,每個都有檔案:行號)
3. `AUDIT` 第 3 章的 3-2、3-3 表(每個功能的「深度/裁決」= 你的功能地圖)

**第一週的活(P0,照 AUDIT 編號)**:
| 事項 | 進入點 | AUDIT |
|---|---|---|
| 許願核可加定價 UI(等 A 的合約,約 D1-D2 就緒) | `src/screens/parent/tablet/ParentHomeTablet.tsx` WishApprovalCard、`src/hooks/useParentRedemption.ts:265` approveChildWish | P0-2 / 2-6 |
| 孩子自建任務加待審閘門 | `src/lib/taskActions.ts:755` createChildTask(`is_active:false`)+ 家長端待審列表 | P0-1 / 3-2 #4 |
| 首頁進度條 109/70 + 目標選取邏輯 | `src/hooks/useParentDashboard.ts:143,193-199` | P0-3 / 2-9 #2 |
| 平板 Settings / AddChild 入口 | `src/screens/parent/tablet/ParentManageTablet.tsx`(加設定區) | P0-4 / 1-A |
| 換用 A 的 `taipeiDayRange()` util | `useTodayTasks.ts:87`、`useParentDashboard.ts:147`、`taskActions.ts:52,371` | P0-5 / 2-4 |
| **ParentHomeTablet 拆檔**(純搬移,不改邏輯;讓你和 C 之後不撞) | NewTaskPanel / 右欄 / 側欄抽成獨立檔 | TEAM_PLAN 規則 2 |

**要小心的坑**:
- 時區:所有「今天」的查詢都不能用 `'YYYY-MM-DD'` 字串直接比 `completed_at`(會差 8 小時),一律用 A 的 util。
- 兌換有兩套系統:`reward_items` 直接兌換(現行)vs `redemption_requests` 申請審核(W3-4 要接的新路)。別在舊路上加新功能。
- Realtime 訂閱的 channel cleanup pattern(useTodayTasks/useWallet 裡那套)照抄,別自創。

## 3. 給 C(設計系統 owner)

**讀這些(順序)**:
1. `TEAM_PLAN` 第一節「C」的任務表 + 第二節規則 4(樣式-only PR)
2. `AUDIT` 4-3(UI 專業度現況:哪裡碎、多碎、為什麼)
3. 現有三個樣式檔:`src/constants/colors.ts`(孩子端)、`parentTheme.ts`(家長端)、`webStyles.ts`

**現況一句話**:有 token 系統但沒人守 —— screens/components 裡有 **416 處硬編碼色值**(constants 才 93 處),最重災區 `ParentHomeTablet.tsx` 74 處。雙主題(孩子/家長兩套視覺)是刻意設計,**要保留**,你的工作是讓每一端內部一致。

**第一週的活**:
1. 盤點 + 定規範:寫 `DESIGN_TOKENS.md`(語義化命名、兩主題各一套、間距/圓角/陰影也收進來)—— 這份文件之後就是仲裁標準。
2. 第一個實戰:auth 三畫面(`src/screens/auth/`)—— emoji 圖示換自繪 SVG(參考 `src/components/icons/TaskIcons.tsx` 和 ParentTabNavigator 裡的畫法)、間距對齊 parentTheme。這組是使用者看到的第一眼,也是目前最粗糙的一組(AUDIT 4-3)。

**要小心的坑**:
- 不動邏輯:你的 PR 裡不該出現 hook、state、supabase 呼叫的變更;需要改元件 props 介面時先跟 B 對。
- `src/components/__tests__/` 有針對文案/幣值顯示的測試(如打折文案「打折中 🔓」),改元件後跑 `npm test`。
- `src/_design-ref/` 和 `src/ipad_design-ref/` 是設計原型不是活代碼,可參考視覺、別 import;它們之後會被移出 src(AUDIT 5-5)。
- 週報/月報畫面 demo 會全程展示,精修優先級高;紀錄 tab 目前是殼,先跳過。

## 4. A 自己的第一週(放這裡讓大家對齊)

- 收尾提交工作樹上的未提交變更(側欄改造)—— 注意它移掉了平板唯一的「新增孩子」入口,B 的 P0-4 會補回。
- 出 `taipeiDayRange()` util + 許願定價合約(D1-D2)→ 解除 B 的兩個依賴。
- RPC 授權檢查、利息 RPC 重寫、cron 落地(見 TEAM_PLAN A 表)。

## 5. 每週節奏

- 里程碑與驗收:TEAM_PLAN 第五節(W1-2 P0 全清 → W3-4 審核環+彩排 v1 → W5-6 收尾+彩排 v2)。
- PR 至少一人 review;跨層的事開 issue,別口頭;每天 rebase master。
- 有事直接在 PR/issue 引用 AUDIT 編號(例如「修 P0-3」),省得重新解釋脈絡。
