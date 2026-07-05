# 三人分工計畫(2026-07,v2)

> 依據:`AUDIT_2026-07.md`(P0-P3 清單)+ 團隊決策(2026-07-04)。
> v2 變更:拿掉週次排程(各自照優先序做,能多快就多快);C 的任務從「收斂樣式」升級為「視覺方向重設計」;新增「意義→設計→實作」工作方法;onboarding 重修時機明確化。
> 切法原則不變:**按「層」切,不按「前後端 × 孩子/家長」切** —— 每人擁有一層,跨端工作在自己層內完成,天然不撞車。

---

## 一、這個專題的工作方法(比分工更重要)

目標是**完整的專題**,不是把功能堆出來的系統。所以:

- **「重做 / 深化」等級的項目,動手前先寫半頁 mini-spec**,貼成 issue 讓另外兩人看過(不用會議,留言即可)。內容就三段:
  1. **意義**:這個功能為什麼存在?對應哪個用戶動機/理論概念?(答不出來就該質疑要不要做 —— AUDIT 第 3 章的五題就是這個標準)
  2. **流程**:用戶怎麼走過它,每一步資料怎麼動
  3. **完成的定義**:怎樣算做完(含邊界情況,不是「畫面出來了」)
- **「修 bug / 補洞」等級的項目不用 spec**,直接做,PR 引用 AUDIT 編號。
- 判斷標準:會改變用戶流程或新增畫面的 → 要 spec;行為不變只是修對的 → 不用。

## 二、角色與地盤

### A —— 後端 / 資料合約層(原家長端)

**地盤**:`supabase/**`、`src/types/database.ts`(單一來源,只有 A 改)、`src/lib/supabase.ts`、CLAUDE.md。

**backlog(照序做,完成即往下)**:
| 序 | 任務 | AUDIT | 誰在等它 |
|---|---|---|---|
| 1 | 收尾提交工作樹未提交變更(側欄改造) | 1-A | B 開工前 |
| 2 | `taipeiDayRange()` util + 許願定價合約(RPC 或 update 規格) | P0-5、P0-2 | **B 的前兩項** |
| 3 | RPC 授權檢查(complete_task / redeem_wish / setup_child_tasks) | P1-6 | 無人,盡快 |
| 4 | onboarding 資料層修正:childPin 落地 + submitOnboarding 原子化(RPC)——**不等畫面重做,先修資料正確性** | P1-5 | onboarding 重修(五) |
| 5 | 審核環後端:redemption_requests 管線(欄位/RLS/清 6 列舊資料)+ adjusted_coins 語義 | P1-1 | B 的審核環前端 |
| 6 | `mark_task_atomic` RPC + intervention_log 同 transaction | P1-2 | B 的紀錄 tab |
| 7 | 利息 RPC 重寫(last_interest_at 冪等)+ 3 個 cron 落地(pg_cron + pg_net)+ 週報 Edge Fn deterministic fallback | P1-4、P1-8 | demo |
| 8 | migrations 補齊(核心表 + 4 個 live-only RPC 入 repo) | P1-7 | 可重現性 |
| 9 | 髒資料清理(9 組重複任務、redemption_requests 舊列、0 幣已核可願望) | 5-9 #4 | demo |

### B —— 前端功能(原孩子端)

**地盤**:`src/screens/**`(功能邏輯)、`src/hooks/**`、`App.tsx`。

**backlog**:
| 序 | 任務 | AUDIT | 依賴 |
|---|---|---|---|
| 1 | **ParentHomeTablet 拆檔**(純搬移不改邏輯;之後 B/C 各動各檔不撞) | 規則 2 | A#1 |
| 2 | P0 批:許願定價 UI、孩子自建任務待審閘門、首頁 109/70 與目標選取、平板 Settings/AddChild 入口、tz util 替換 | P0-1~5 | A#2 |
| 3 | 審核環前端:孩子端兌換改申請流 + 家長端審核卡接真管線(AI 建議 + 調價)——**要 mini-spec**(這是流程重做) | P1-1 | A#5 |
| 4 | 週報畫面補呈現 + abandonment_tier 警示顯示 | P2-5 | A#7 |
| 5 | 連結感回收迴路(family 期滿結算 + 時間存摺→家庭活動券)——**要 mini-spec**(全新流程,先想清楚意義:AUDIT 3-5) | P1-3 | 無 |
| 6 | 紀錄 tab 補內容、skill 型孩子端詳情——**skill 要 mini-spec** | P2-2、P2-3 | A#6 |
| 7 | onboarding 流程重做的功能面(見五) | P1-5 後半 | 視覺定調 + #3 完成 |

> **spec 與 P0 並行**:標「要 mini-spec」的三項(#3 審核環、#5 連結感、#7 onboarding)——**寫 spec 不必等 P0 做完**。P0 是純執行(bug 修對就好、沒決策含量),spec 是決策(要想清楚意義才動)。B 一邊做 #2 的 P0、一邊把 #3/#5 的 spec 寫出來貼 issue 讓大家留言;真正卡住功能開工的是「spec 共識 + 技術依賴」兩者到齊,不是排在 P0 後面。

### C —— 視覺方向 / 設計系統(第三人)

**任務升級**:不是「把現有卡片刷整齊」,是**先回答「這個 app 該長什麼樣」再動手**。現況問題(團隊共識):整體太卡片式、每頁都是垂直堆疊的圓角卡,不像市面上成熟的 app。

**地盤**:`src/constants/**`、`src/components/**`(純展示元件)、各 screen 的 StyleSheet 區塊(樣式-only PR)。

**backlog**:
| 序 | 任務 | 產出 |
|---|---|---|
| 1 | **視覺方向研究**:蒐集 5-8 個參考(同類:GoHenry / Greenlight / BusyKid 等兒童理財;非同類但介面語言好的消費 app;Mobbin/Dribbble 找 pattern)。重點看的不是配色,是**版面語言**:什麼時候用卡片、什麼時候用列表/分區/全幅;層級怎麼用字重和留白做而不是用框;孩子端和家長端各自該有的氣質 | 2-3 個方向提案(拼貼 + 拿現有 1-2 頁做 mockup),丟群組**團隊定調** |
| 2 | 定調後:把方向落成 `src/constants/` 的兩套主題(孩子端/家長端),**規範就寫在檔案註解裡,不另寫文件**;同時定「PR 裡出現硬編碼 `#` 色碼一律退回」為 review 規則 | 收斂後的 constants 檔 |
| 3 | 按新方向逐區重刷:順序 = demo 會走到的優先(家長平板三頁 → 孩子端四頁 → auth 三畫面)。**定調前不做大面積重刷,避免白工**;定調前只做無爭議的小修(如 auth 的 emoji 圖示→SVG) | 樣式-only PR 系列 |
| 4 | 元件收斂(四種任務卡 → 一套)+ 全畫面走查 checklist | P2-4 |
| 5 | onboarding 重修的視覺面(見五) | — |


## 三、防撞車規則(不變,+1 條)

1. **層邊界即 PR 邊界**:A=supabase+types+lib、B=screens 邏輯+hooks、C=constants+components+樣式。動到別人層先開 issue。
2. **熱點檔案**:`ParentHomeTablet.tsx` 由 B 先拆檔;`types/database.ts` 只有 A 改;`App.tsx` 只有 B 改。
3. **合約先行**:A 改 schema/RPC 簽名先更新 types + PR 說明;B/C 要新欄位開 issue 給 A,不自己下 SQL。
4. **樣式-only PR**:C 不動功能碼;B 新功能先求對不求美(C 會照定調後的方向收);**兩人不同時排同一個檔**(誰先領走在 issue 上認領)。
5. **git 節奏**:master 保護 + feature branch + 至少一人 review;每天 rebase。
6. **(新)重做級功能先 spec 後開工**(第一節);spec 沒共識前不寫 code。

## 四、順序與檢查點(取代週次 —— 用「狀態」不用「日期」,到了就過)

依賴分兩種,其他全部平行做。**決策工作流(spec / 視覺定調)與 P0 執行同時開跑,不排在 P0 後面 —— 越早定,後面全是便宜的平行執行。**

技術依賴(誰的產出解鎖誰的 code):
```
A#2(util+定價合約) ──→ B#2(P0 批)
A#5(審核環後端)  ──→ B#3(審核環前端)
```
決策工作流(與 P0 並行):
```
C#1(方向定調)                        ──→ C#3(大面積重刷)、五(onboarding 視覺)
B 寫 spec(審核環 / 連結感 / onboarding)──共識──→ 對應功能開工(仍需技術依賴到齊)
```

| 檢查點 | 狀態定義(不是日期) | 驗收動作 |
|---|---|---|
| CP1 | P0 清空 | 手動走一遍黃金路徑:指派→完成→發幣→許願→定價核可→兌換,全通;上午時段測完成回報 |
| CP2 | 審核環接通 + cron 落地 + 視覺定調 | 雙裝置彩排 v1:孩子申請→AI 篩選→家長調價核可→扣款,intervention_log 非 0 |
| CP3 | 連結感迴路 + 重刷完成 + migrations 齊 | 彩排 v2 + 錄影備援;`supabase db reset` 能從 migrations 重建 |

## 五、onboarding 重修(獨立說清楚,因為它跨三人)

現況認知一致:onboarding 是最早生出來的,能動但不是「完整的初始化系統」。重修拆三塊、三個時機:

1. **資料層(現在就修,A#4)**:childPin 落地、五段寫入原子化 —— 這是 bug 不是設計,不用等任何人。
2. **流程與意義(CP2 之後,B 主導 + 全員過 spec)**:回到 WF-01/02/03 的原意重新設計 —— 問卷除了算出 Baumrind 標籤還該影響什麼?初始任務推薦怎麼呈現才不是「勾選清單」?第一個兌換目標要走新的審核/定價語義(所以要等 B#3 做完才知道終形)。這份 mini-spec 是「完整專題 vs 功能堆疊」的分水嶺,值得花時間寫。
3. **視覺(與 2 同步,C 主導)**:等方向定調,onboarding 直接用新視覺語言做,不照舊風格刷兩次。

## 六、家長端手機版(不變)

- 到 demo 為止:不做、不刪、不改;demo 全程平板。
- 之後若做:以平板版為 spec、用 C 定調後的系統重製,不是修舊版;舊版錯誤的核可邏輯會因審核環改版自然過期。

## 七、A 的交接清單(家長端 → B,不變)

- [ ] 未提交變更收尾提交(側欄 useFamilyChildSummaries 改造;注意其移除了平板唯一 AddChild 入口,與 B 的 P0-4 一起講)
- [ ] 平板三畫面導覽(ParentHomeTablet 結構 / ParentWeeklyTablet 三 tab / ParentManageTablet 三區)
- [ ] hooks 地圖與已知 bug(AUDIT 2-9)
- [ ] MASTER §十五 平板缺口清單現況
