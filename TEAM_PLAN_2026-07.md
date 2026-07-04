# 三人分工計畫(2026-07)

> 依據:`AUDIT_2026-07.md`(P0-P3 清單)+ 團隊決策(2026-07-04):
> 3 人;A(原家長端)轉接後端;C(第三人)主導 UI 專業度收斂。
> 原則:**不按「前端/後端 × 孩子/家長」四格切**(P0/P1 幾乎每條都跨格),改按「層」切 —— 每人擁有一層,跨端工作在自己層內完成,天然不撞車。

---

## 一、角色與地盤

### A —— 後端 / 資料合約層 owner(原家長端)

**職責**:Supabase 全部(schema、migrations、RPC、Edge Functions、cron、RLS)+ 資料合約(types/database.ts)+ 文件回真(MASTER/CLAUDE.md)。

**地盤(A 才能動)**:
- `supabase/**`(migrations、functions)
- `src/types/database.ts`(改 schema 後由 A 重新生成/手更,單一來源)
- `src/lib/supabase.ts`
- 兩份文件:MASTER.md、CLAUDE.md 的 schema/後端段落

**任務(對應 AUDIT 條目)**:
| 週次 | 任務 | AUDIT |
|---|---|---|
| W1-2 | tz 邊界修法:寫一個 `taipeiDayRange()` util 供全前端替換(B 套用);RPC 授權檢查(complete_task / redeem_wish / setup_child_tasks 驗 auth.uid() 家庭歸屬) | P0-5、P1-6 |
| W1-2 | `redeem_wish` 端支援定價核可:新 RPC `approve_wish(id, coin_cost)` 或直接讓 B 用 update — 定合約給 B | P0-2 |
| W3-4 | parentMarkTask → `mark_task_atomic` RPC + intervention_log 同 transaction | P1-2 |
| W3-4 | 審核環後端:redemption_requests 管線復活(孩子端申請 insert 的 RLS/欄位確認、adjusted_coins 語義)+ 清 6 列舊資料 | P1-1、5-9 #4 |
| W3-4 | 利息 RPC 重寫(last_interest_at 間隔判斷 = 冪等)+ 3 個 cron job 落地(pg_cron + pg_net,pg_net 需啟用)+ 週報 Edge Fn 加 deterministic fallback | P1-4、P1-8、5-9 #1-2 |
| W5-6 | migrations 補齊(核心表 + 4 個 live-only RPC 入 repo)、submitOnboarding 原子化(RPC)、文件全面回真、`get_advisors` 安全掃描收尾 | P1-5、P1-7、P1-9 |

### B —— 前端功能 owner(原孩子端)

**職責**:兩端的**功能與資料流**(screens 邏輯、hooks),從 A 的合約取數;跨端流程(審核環的孩子端+家長端兩半)由 B 一人串,不切兩人。

**地盤**:
- `src/screens/**`(功能邏輯;樣式部分見與 C 的邊界)
- `src/hooks/**`(A review 資料查詢寫法)
- `App.tsx` 導航

**任務**:
| 週次 | 任務 | AUDIT |
|---|---|---|
| W1-2 | P0 批:許願核可定價 UI(接 A 的合約)、孩子自建任務加待審閘門(`is_active:false` + 家長端待審列表)、首頁 109/70 與目標選取修正、平板 Settings/AddChild 入口(ParentManageTablet 加設定區) | P0-1~P0-4 |
| W1-2 | 用 A 的 `taipeiDayRange()` 替換 4+ 處日期字串比較 | P0-5 |
| W3-4 | 審核環前端:孩子端兌換改申請流(WishScreen 註解區復活改造)+ 家長端右欄審核卡接真管線(AI 建議 + adjusted_coins) | P1-1 |
| W3-4 | 週報畫面補呈現(hook 已有的 longTermGoals 等)、abandonment_tier 警示顯示 | P2-5、P1-8 前端半 |
| W5-6 | 連結感回收迴路(family 期滿結算畫面 + 時間存摺→家庭活動券)、紀錄 tab 補內容(素材:overrides/intervention_log/growth_moments,吃 A 的 P1-2 產出)、skill 型孩子端詳情 | P1-3、P2-2、P2-3 |

### C —— 設計系統 / UI 專業度 owner(第三人)

**職責**:視覺一致性與元件收斂;**只動樣式與純展示元件,不碰資料邏輯** —— 這是 C 與 B 不撞車的關鍵。

**地盤**:
- `src/constants/**`(colors.ts、parentTheme.ts、webStyles.ts → 收斂後的 token 檔)
- `src/components/**`(純展示元件;含測試維護)
- 各 screen 的 `StyleSheet.create` 區塊(以「样式-only PR」形式)

**任務**:
| 週次 | 任務 | AUDIT |
|---|---|---|
| W1-2 | 讀 codebase + token 盤點:定雙主題 token 規範(孩子端/家長端各一套、語義化命名),寫成 `DESIGN_TOKENS.md`(放 repo 根目錄,與本檔並列);先修 auth 三畫面(emoji→SVG、間距對齊 parentTheme) | 4-3 |
| W3-4 | ParentHomeTablet 74 處硬編碼色值回 token(配合 B 的功能改動節奏,避免同檔同週);onboarding 四畫面改掛 parentTheme | P2-1 |
| W5-6 | 任務卡元件收斂(TaskItem/TaskCard vs Duty/Contribution)、全畫面走查一輪(逐畫面 checklist)、demo 畫面精修 | P2-4 |

---

## 二、防撞車規則

1. **層邊界即 PR 邊界**:A=supabase+types+lib、B=screens 邏輯+hooks、C=constants+components+樣式。動到別人層 → 先開 issue 或即時溝通,不默默改。
2. **熱點檔案協議**:`ParentHomeTablet.tsx`(2900 行,B/C 都要動)→ **W1 先做一次純搬移拆檔**(NewTaskPanel、右欄、側欄抽成獨立檔,B 執行、不改邏輯),之後 B/C 各動各檔。`types/database.ts` 只有 A 能改。`App.tsx` 只有 B 能改。
3. **合約先行**:A 改 schema/RPC 簽名 → 先更新 types/database.ts + 在 PR 描述寫明 breaking change,B 才動呼叫端。反向:B/C 需要新欄位/新查詢 → 開 issue 給 A,不自己下 SQL。
4. **樣式-only PR**:C 改 screen 樣式時不動同檔功能碼;B 改功能時沿用現有樣式(醜沒關係,C 會收)。兩人不在同一週排同一個檔案。
5. **git 節奏**:master 保護 + feature branch + PR review(至少一人);每天 rebase;工作樹現有未提交變更(ParentHomeTablet/ParentSettingsScreen/useFamilyChildSummaries)由 A 本週內收尾提交,再開始新節奏。

---

## 三、A 的交接清單(家長端 → B)

A 原持有家長端,轉後端前需交接:
- [ ] 未提交變更收尾提交(側欄 useFamilyChildSummaries 改造 + Settings 的 AddChild onPress — 注意 AUDIT 1-A:此變更移除了平板唯一的 AddChild 入口,交接時連同 P0-4 一起講)
- [ ] 平板三畫面導覽:ParentHomeTablet 結構(側欄/總覽/MarkPanel/NewTaskPanel/右欄)、ParentWeeklyTablet 三 tab、ParentManageTablet 三區
- [ ] hooks 地圖:useParentDashboard / useParentWeeklyReport / useParentMonthlyReport / useParentRedemption / useFamilyChildSummaries 各自的查詢與已知 bug(AUDIT 2-9)
- [ ] MASTER §十五 的平板缺口清單現況

## 四、家長端手機版(明確決策)

- **現在到 demo:不做**(AUDIT P3;團隊共識)。它仍是手機寬度的預設 UI,**不刪不改**,demo 全程用平板即無感。
- **Demo 後若要做**:以平板版為 spec,由 C 的 token 系統重製(不是修舊版,是照平板 IA 重寫窄版佈局);屆時再評估要不要保留四分頁 IA。
- 舊手機版裡「錯的功能」(直接核可無定價等)會因為 P1-1 審核環走新管線而自然過期 —— 不用去修它。

## 五、里程碑對齊(6 週)

| 週 | 出貨物 | 驗收 |
|---|---|---|
| W1-2 | P0 全清 + 拆檔 + token 規範 | 黃金路徑(含許願→定價核可→兌換)手動走通;上午時段測完成回報 |
| W3-4 | 審核環全接通 + cron 落地 + 樣式主戰場收斂 | 雙裝置 demo 彩排 v1:孩子申請→AI 篩選→家長調價核可→扣款,全程留痕(intervention_log 非 0) |
| W5-6 | 連結感迴路 + 紀錄 tab + migrations/文件回真 + 全畫面走查 | demo 彩排 v2 + 錄影備援完成;`supabase db reset` 可從 migrations 重建 schema |

*(撞到計畫沒排到的事:小事直接做並在 PR 註明;影響層邊界的事先丟群組。)*
