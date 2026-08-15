# P1 Flow Consolidation — 盤點與分級（2026-08-15）

基準：`feat/p1-ai-goal-planning-contract`，A4B2（`a48fb14`）之後。
這份文件記錄 P1-FINAL 這一包**看到什麼、修了什麼、刻意沒修什麼**。

---

## 1. 兩條流程的實際路徑

### A4A｜家長直接同意孩子的安排

```
孩子  ChildProposalScreen  四個問題 → 一起想怎麼開始 → 送出
      （提案 draft → proposed，canonical child plan 寫在版本上）
家長  ParentHomeTablet → 需要一起看看
      卡片 state = child_plan（共同條件都齊）
      「確認這份約定」→ confirm_child_planning_proposal_v1
      → 正式任務 ＋ active ＋ confirmed_* 快照
孩子  首頁「我的成長目標」出現這張卡 → LongTermDetail
```

### A4B｜家長提出共同條件，孩子回覆

```
家長  卡片 state = child_plan_needs_terms（或 child_plan 但想提不同安排）
      「一起補幾個安排」→ ParentSharedTermsSheet
      「送給孩子看看」→ propose_child_planning_terms_v1
      → 家長草案版本 ＋ needs_child_review（不建任務）
孩子  首頁 ChildSharedTermsReviewCard
      ▸ 都說定了 →「可以，就照這樣開始」→ active ＋ 任務
      ▸ 還有沒說完 →「這些安排可以」→ 回 proposed，不建任務
      ▸ 「我想再調整」→ 回 proposed ＋ 一句話
家長  卡片回到「需要一起看看」，補上還沒說定的 → 第二輪
```

### 真機驗收狀態

**這一包沒有跑真機。** 環境裡沒有可連的裝置或模擬器
（Expo MCP server 未授權，無法在此 session 完成 OAuth）。

已經驗過的是：
- 兩條 RPC 鏈的 staging E2E（A4A.1 39/39、A4B1 47/47、A4B2 39/39，
  含兩輪協商完整走通）
- UI 與命令層的單元／元件測試（本包後 3331 passed / 0 failed）
- 逐檔追過兩條路徑的 routing、loading、stale 與錯誤呈現

**還沒驗的是**：真的用手指按過一遍。下面 §4 的第 6 項就是在真機上才會
第一時間看見的問題 —— 它是靠讀 code 找到的，但它會讓真機驗收在最後一步停住。

---

## 2. Functional blocker（本包已修）

### F1. 孩子端 routing 把「能不能按」當成「是不是 P1」

`isChildPlanningReview()` 回的是 `childPlanningReviewability().ok`，
而 `HomeScreen` 與 `useChildProposalReview` 都拿它決定走哪一張卡、哪一支 RPC。

於是一份**此刻按不了**的 P1 草案（例如系統還沒整理完 purpose_category）
會掉進 legacy 那張卡片，再送進 `accept_child_proposal_plan_v1` ——
而那一支要求 `parent_confirmed_at IS NOT NULL`，A4B1 的草案一律留 NULL，
所以孩子拿到的是「目前版本不是可由孩子確認的家長調整版」，
按幾次都一樣。

**修法**：新增 `isChildPlanningReviewCard()`，只看 authorship 與 lineage；
按不了的狀態留給 P1 卡片自己說，而且**分 block 說不同的話**
（系統還沒整理完 → 「這份安排 GrowBook 還在整理」，不是「重新看看就好」）。

### F2. 家長端第二輪會撞進 P0 的 material edit

協商到第二輪時 current 是家長自己的共同條件草案 —— 它也是
`authored_by='parent'`、也 `requires_child_review`，所以
`state === 'child_revisit'` 成立，「再調整一下」就出現了。

按下去走 `revise_child_proposal_plan_v1`，那一支會照 source 重建一版而
**不帶** `requires_parent_decision` 與 `policy_*` evidence，還允許改
`completion_description`（P1 裡那一欄是孩子自己寫的）。結果二選一：

- 沒改到孩子的欄位 → 未決條件被靜靜清空，一件沒人決定過的事變成已決定
- 改到了 → 孩子端 `CHILD_PLAN_INTEGRITY_VIOLATION`，這份協商再也走不到 active

**修法**：`isParentSharedTermDraft()` 以 `parent_confirmed_at IS NULL`
把兩者分開（A4B1 §13 不寫任何 `confirmed_*`，這是唯一穩定的差別）。
UI 用 `canRevise` 收掉按鈕，`buildRevisionCommand` 再擋一層。

> **殘留缺口（刻意）**：DB 層沒有第三道防線。`revise_child_proposal_plan_v1`
> 是 P0 的函式，這一包不得修改；而下游 A4B2 的 integrity guard 已經保證
> 被汙染的版本**不會成立**（最壞是走不動，不是算錯錢）。要補的話是
> 在那一支加一條 `NOT_CHILD_PLANNING_LINEAGE`，另包處理。

---

## 3. Semantic blocker（本包已修）

### S1. 孩子說「可以」，家長讀到「他想再聊聊」

partial accept 與 request-changes **都**把提案送回 `proposed`，而且
留在同一個版本上 —— 版本資料裡分不出來。這正是 A4B2 在
`child_proposal_status_events.action` 上放封閉列舉的原因，但家長端
從來沒讀過那一欄。

於是孩子按完「這些安排可以」，家長看到的是「孩子想再一起聊聊」——
把一次同意回報成一次異議。

**修法**：`listProposedForParent` 以 `plan_version_id` 為鍵讀回這一版上
最後一次的 action（讀不到就當沒有，不擋主流程），新增 view state
`child_agreed_pending_terms`：

```
孩子說這些可以
他說這些安排可以，還有幾件說定之後就會開始
[ 把還沒說定的補上 ]
```

---

## 4. Visual polish（列出，不在本包動）

| # | 問題 | 位置 |
|---|---|---|
| 1 | P1 卡片同時有「孩子想怎麼做」與「家庭約定」兩塊，`plan_title` 與 `next_step` 各印一次 | `ParentProposalSection` |
| 2 | 「還有安排要一起補充」在 sharedDecisions 區塊與 waitingMessage 講了兩次 | 同上 |
| 3 | 孩子卡片的差異列固定「你原本 → 爸媽提出」，四項都改時會有四段一樣的版型 | `ChildSharedTermsReviewCard` |
| 4 | `taskIcon` 用 `name.includes('碗'/'垃圾'/'鋼琴')` 挑 emoji | `HomeScreen:211` |
| 5 | 家長卡片的成功／錯誤訊息是 section 級的一行字，三張卡共用一個位置 | `ParentProposalSection:86` |
| 6 | 協商第二輪時「補上還沒說定的」與「目前不適合」視覺權重相近 | 同上 |

---

## 5. Deferred（有意識地不做）

| # | 事情 | 為什麼現在不做 |
|---|---|---|
| 1 | **LongTerm Detail 對共同計畫的呈現** —— 一份談定的計畫在孩子端顯示成階段制，而且**沒有完成按鈕** | 這是本包最嚴重的發現，但修法是整個 progression 判準的重寫，正是這一包被要求先產出 IA 而不要動的部分。完整分析與 final mapping 見 `LONG_TERM_DETAIL_FINAL_IA.md` |
| 2 | 首頁 GoalCard 對共同計畫永遠顯示「第 0/1 級、0%」 | 同一個根因（`goal_type` 當進度判準），跟 ① 一起修才不會出現兩份真相 |
| 3 | 孩子 partial accept 之後，那件事在他的畫面上消失 | 需要一個「等家長」的新表面；而且 P0 送出提案後也一樣沒有痕跡 —— 這是既有缺口，不是 P1 帶進來的 |
| 4 | `revise_child_proposal_plan_v1` 的 DB 層 lineage guard | 本包不得修改 P0 函式（見 §2 F2 殘留缺口） |
| 5 | enrichment refresh 的重試路徑 | A4B1 §18 已回報：沒有現成 RPC，需要新的 orchestration |
| 6 | WP2 合併 | 仍不 merge、不 cherry-pick；可重用的部分列在 IA §4 |

---

## 6. 新舊 UI 重疊盤點（A1–A4B2 vs legacy）

| 位置 | 新（P1） | 舊（P0） | 現在怎麼分 |
|---|---|---|---|
| 孩子首頁 review 槽 | `ChildSharedTermsReviewCard` | `ChildPlanReviewCard` | lineage（本包修正） |
| 孩子端確認動作 | `accept_child_planning_terms_v1` | `accept_child_proposal_plan_v1` | 同上 |
| 家長改計畫 | `ParentSharedTermsSheet` | `ParentProposalEditSheet` | `parent_confirmed_at`（本包修正） |
| 家長確認 | `confirm_child_planning_proposal_v1` | `confirm_child_proposal_v1` | `resolveConfirmRoute`（A4A 已定） |
| 提案卡片內容 | `childPlan` 區塊 | `planBlock` | 兩塊並存，內容有重複（Visual polish ①） |
| 進行中的計畫調整 | — | `ParentAdjustmentSection`（P0-8M 換時段） | **不衝突**：那是 active 計畫的協商，A4B 是成立前的協商。兩者對象不同，不要合併 |
| 長期計畫詳情 | — | `LongTermDetailScreen` | **尚未接上**（Deferred ①） |

---

## 7. 本包改動範圍

```
src/lib/childPlanning/childReview/isChildPlanningReview.ts   路由述詞
src/lib/childPlanning/sharedTerms/isChildPlanningNegotiable.ts  isParentSharedTermDraft
src/lib/childProposal/reviewCommands.ts                      P0 edit 拒絕 P1 草案
src/lib/childProposal/childProposalService.ts                讀回 action
src/lib/childProposal/types.ts                               ChildProposalChildAction
src/hooks/useChildProposalReview.ts                          路由
src/screens/child/HomeScreen.tsx                             路由
src/components/child/ChildSharedTermsReviewCard.tsx          blocked 狀態文案
src/screens/parent/tablet/home/parentProposalPresentation.ts canRevise / 新 state
src/screens/parent/tablet/home/ParentProposalSection.tsx     按鈕條件
```

零 migration、零 schema、零 RPC 變更、零 reward policy 變更。
