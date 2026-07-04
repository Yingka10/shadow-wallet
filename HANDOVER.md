# 交接說明(給 B 和 C,2026-07)

> 這一頁是入口。目的:讓你在 **30 分鐘內**知道系統現況、你負責什麼、第一週要修什麼。
> 兩份主文件:`AUDIT_2026-07.md`(全系統體檢報告,每條發現都附檔案:行號)、`TEAM_PLAN_2026-07.md`(三人分工)。

---

## 0. 先講三件所有人都要知道的事

1. **文件的信任層級:CLAUDE.md(已修正,可信)> AUDIT(現況事實)> MASTER.md(設計意圖,現況描述多半過時)。** CLAUDE.md 已於 2026-07-04 依審計修正過;想知道「某功能實際做到哪、哪裡是斷的」查 AUDIT(有檔案:行號);MASTER 只拿來理解「當初為什麼這樣設計」。文件更新規則:哪個 PR 讓敘述變真,就在同一個 PR 更新 CLAUDE.md 對應段落,且只由 A 改。
2. **系統骨架是健康的,壞的是幾條「沒接上的線」。** 每日循環(指派→孩子完成→發幣→雙裝置即時同步)完整且品質好;斷的是:許願定價(P0-2)、孩子自建任務無審核(P0-1)、審核管線沒接水(P1-1)、cron 全部沒排(P1-8)。細節見 AUDIT 第 2 章。
3. **分工是按「層」不是按「端」**:A=後端/資料合約、B=兩端前端功能、C=視覺方向/設計系統。地盤與防撞規則見 TEAM_PLAN 第二、三節 —— 動工前務必讀完第三節的 6 條規則,尤其:`types/database.ts` 只有 A 能改、`App.tsx` 只有 B 能改、C 只出「樣式-only PR」、重做級功能先 spec 後開工。

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
1. `TEAM_PLAN` 第二節「B」的 backlog + 第七節交接清單(A 會帶你走一遍家長端)
2. `AUDIT` 第 2 章(黃金路徑,你要修的斷點全在這,每個都有檔案:行號)
3. `AUDIT` 第 3 章的 3-2、3-3 表(每個功能的「深度/裁決」= 你的功能地圖)

**先做這些(P0 批,做完即往 TEAM_PLAN 的 B backlog 下一項)**:
| 事項 | 進入點 | AUDIT |
|---|---|---|
| 許願核可加定價 UI(等 A 的定價合約) | `src/screens/parent/tablet/ParentHomeTablet.tsx` WishApprovalCard、`src/hooks/useParentRedemption.ts:265` approveChildWish | P0-2 / 2-6 |
| 孩子自建任務加待審閘門 | `src/lib/taskActions.ts:755` createChildTask(`is_active:false`)+ 家長端待審列表 | P0-1 / 3-2 #4 |
| 首頁進度條 109/70 + 目標選取邏輯 | `src/hooks/useParentDashboard.ts:143,193-199` | P0-3 / 2-9 #2 |
| 平板 Settings / AddChild 入口 | `src/screens/parent/tablet/ParentManageTablet.tsx`(加設定區) | P0-4 / 1-A |
| 換用 A 的 `taipeiDayRange()` util | `useTodayTasks.ts:87`、`useParentDashboard.ts:147`、`taskActions.ts:52,371` | P0-5 / 2-4 |
| **ParentHomeTablet 拆檔**(純搬移,不改邏輯;讓你和 C 之後不撞) | NewTaskPanel / 右欄 / 側欄抽成獨立檔 | TEAM_PLAN 規則 2 |

**要小心的坑**:
- 時區:所有「今天」的查詢都不能用 `'YYYY-MM-DD'` 字串直接比 `completed_at`(會差 8 小時),一律用 A 的 util。
- 兌換有兩套系統:`reward_items` 直接兌換(現行)vs `redemption_requests` 申請審核(P0 清完後要接的新路)。別在舊路上加新功能。
- 「重做」等級的項目(審核環、連結感迴路、skill 詳情)動工前先寫半頁 mini-spec(意義/流程/完成定義),見 TEAM_PLAN 第一節 —— 這個專題的標準是「想清楚意義再實作」,不是把功能生出來。
- Realtime 訂閱的 channel cleanup pattern(useTodayTasks/useWallet 裡那套)照抄,別自創。

## 3. 給 C(視覺方向 / 設計系統 owner)

**讀這些(順序)**:
1. `TEAM_PLAN` 第二節「C」的任務表 + 第三節規則 4(樣式-only PR)
2. `AUDIT` 4-3(UI 專業度現況:哪裡碎、多碎、為什麼)
3. 現有三個樣式檔:`src/constants/colors.ts`(孩子端)、`parentTheme.ts`(家長端)、`webStyles.ts`

**現況兩句話**:(1) 有 token 系統但沒人守 —— screens/components 裡有 **416 處硬編碼色值**(constants 才 93 處),最重災區 `ParentHomeTablet.tsx` 74 處。(2) 更根本的問題是**版面語言單一**:整個 app 幾乎每頁都是垂直堆疊的圓角卡片,不像市面上成熟的 app。你的任務不是把卡片刷整齊,是**先回答「這個 app 該長什麼樣」**。雙主題(孩子/家長兩套視覺)是刻意設計,要保留。

**先做這些**:
1. **視覺方向研究**(TEAM_PLAN C#1):找 5-8 個參考(GoHenry / Greenlight / BusyKid 等兒童理財 app + 介面語言好的一般 app,Mobbin 是好起點),重點看版面語言 —— 什麼時候用卡片、什麼時候用列表/分區/全幅,層級怎麼用字重與留白做而不是用框。產出 2-3 個方向提案(拼貼 + 拿現有 1-2 頁做 mockup)丟群組定調。**定調前不做大面積重刷**。
2. 定調後把方向落進 `src/constants/` 兩套主題,規範直接寫在檔案註解(不寫獨立 tokens 文件);同時全隊生效一條 review 規則:**PR 裡出現硬編碼 `#` 色碼一律退回**。
3. 定調前唯一可先做的小修:auth 三畫面 emoji 圖示 → 自繪 SVG(參考 `src/components/icons/TaskIcons.tsx` 的畫法)—— 這個不管方向怎麼定都不會白工。

**要小心的坑**:
- 不動邏輯:你的 PR 裡不該出現 hook、state、supabase 呼叫的變更;需要改元件 props 介面時先跟 B 對。
- `src/components/__tests__/` 有針對文案/幣值顯示的測試(如打折文案「打折中 🔓」),改元件後跑 `npm test`。
- `src/_design-ref/` 和 `src/ipad_design-ref/` 是設計原型不是活代碼,可參考視覺、別 import;它們之後會被移出 src(AUDIT 5-5)。
- 週報/月報畫面 demo 會全程展示,精修優先級高;紀錄 tab 目前是殼,先跳過。

## 4. A 目前先做(放這裡讓大家對齊)

- 收尾提交工作樹上的未提交變更(側欄改造)—— 注意它移掉了平板唯一的「新增孩子」入口,B 的 P0-4 會補回。
- 出 `taipeiDayRange()` util + 許願定價合約 → 這兩個是 B 唯二的等待點,最優先。
- 之後照 TEAM_PLAN A backlog 順序:RPC 授權、onboarding 資料層修正、審核環後端、利息重寫 + cron。

## 5. 節奏

- **沒有週次排程**:各自照 TEAM_PLAN 的 backlog 順序做,能多快就多快;依賴就三條(TEAM_PLAN 第四節的圖),其他全平行。
- 進度用三個**狀態檢查點**對齊(CP1 P0 清空 → CP2 審核環+定調+彩排 v1 → CP3 收尾+彩排 v2),到了就辦驗收,不看日曆。
- PR 至少一人 review;跨層的事開 issue,別口頭;每天 rebase master。
- 有事直接在 PR/issue 引用 AUDIT 編號(例如「修 P0-3」),省得重新解釋脈絡。
- **重做級功能先寫半頁 mini-spec 再動工**(意義/流程/完成定義,TEAM_PLAN 第一節)—— 我們在做完整的專題,每個功能要想清楚為什麼存在。
