# P0-5B Parent Material Edit → Child Review 設計

## 目標與範圍

P0-5B 讓家長在 Child Proposal 的 current AI／parent Plan Version 上調整少量 material structured fields，再交回孩子確認。孩子接受後才建立 canonical task 並讓 Proposal active；孩子也可以要求再聊聊。家長可將目前不適合的提案關閉，但必須留下自然語氣的原因。

這個流程發生在第一個 shared version 成立之前。它不處理 active task 的後續調整（P0-8），不修改 Proposal/Plan Version 的 generic schema、不碰 wallet、completion、weekly report、P0-6 reward guard，也不重構已在 staging 通過的 P0-5A direct confirm。

## 採用方案

新增四支窄用途、單一交易 orchestration RPC：

- `revise_child_proposal_plan_v1`
- `accept_child_proposal_plan_v1`
- `request_child_proposal_changes_v1`
- `close_child_proposal_unsuitable_v1`

前端不串接多支 generic RPC。P0-5A 的 `confirm_child_proposal_v1` 保持原有 direct-confirm contract；P0-5B 不為共用 SQL 而大幅抽取或改寫它。

## 權威資料與 material fields

P0-5B 可編輯且會觸發 child review 的 material fields 只有：

- cadence：`cadence_mode`、`cadence_weekly_frequency`、`cadence_days`
- preferred time：`preferred_time`、`preferred_time_custom`
- `completion_description`

`duration_days` 在 P0-5B 改為 readonly，與 `estimated_minutes`、`purpose_category`、`progress_model`、`plan_title`、`plan_summary`、`next_step`、`duration_type`、reward policy、AI suggested coin、reward range、start/end date 一樣不可由 client 修改。Duration adjustment 留給 P0-8 或後續版本化調整。

資料庫以 structured columns 做 material equality、validation 與 review 判定。Client 不能用 snapshot、free text 或自行送入的 readonly 欄位改變結果。`NO_MATERIAL_CHANGE` 必須零寫入：不新增 version、不換 current version、不寫 status event。

## Structured truth 與 free text

Parent-authored revision 可以複製 `plan_summary` 以保留 provenance，但 Parent／Child review UI 不得把它當成目前計畫內容的 authority。`plan_title` 同樣只作 readonly provenance/display metadata，不用來推導期間、cadence 或完成標準。

Parent／Child review UI 的目前計畫真相只從下列 structured fields render：

- cadence
- readonly duration
- preferred time
- completion description
- readonly reward snapshot

Child diff 只比較本包允許編輯的 structured fields，不解析或比較 `plan_summary`、`plan_title` 或 `ai_snapshot`。因此 AI summary 即使仍寫著「一週 4 天」，家長將 cadence 改為一週 3 次後，review 畫面只會把 structured `一週 3 次` 當作目前安排，不會再次呈現舊 summary 為真相。

## Version 與 lineage

沿用 `adopted_from_plan_version_id` 形成線性 lineage：

```text
AI version → Parent revision 1 → Parent revision 2
```

不新增第二套 lineage schema。每次 revise 必須先 `FOR UPDATE` 鎖定 Proposal，再驗證 `expectedPlanVersionId === current_plan_version_id`，並將新版本的 `adopted_from_plan_version_id` 精確設為該 expected current version。

Parent revision 是 append-only，欄位語意如下：

- `authored_by = 'parent'`
- `author_user_id = auth.uid()`
- `requires_child_review = true`
- `parent_confirmed_at = server now()`
- `effective_at = NULL`
- `child_accepted_at = NULL`
- `ai_request_id = NULL`
- `start_date = NULL`
- `end_date = NULL`
- readonly、reward 與 audit fields 由 server 從 source version 複製

`parent_confirmed_at` 的正式語意是「家長完成自己對這一版的決定」，不是「家庭共同版本已正式成立」。共同版本成立以 `child_proposals.status = 'active'` 且 `effective_at IS NOT NULL` 為準；經 child review 的版本另須 `child_accepted_at IS NOT NULL`。同一支 P0-5B migration 會加入 `COMMENT ON COLUMN child_proposal_plan_versions.parent_confirmed_at`，TypeScript row contract 也同步記載。

Proposal lock 會序列化同一提案的 revision。若仍遇到 lineage unique collision，只辨認 exact constraint `child_proposal_plan_versions_one_adoption_per_source`；可辨認為已完成的同一 request 時回 replay success，否則回 typed `STALE_PLAN_VERSION`（reason `REVISION_ALREADY_EXISTS`），不得把 raw `23505` 或其他 unique violation 丟給 UI。

## RPC contracts

### `revise_child_proposal_plan_v1(p_command jsonb)`

Command：

```text
schemaVersion
proposalId
expectedPlanVersionId
materialEdits {
  cadenceMode
  cadenceWeeklyFrequency
  cadenceDays
  preferredTime
  preferredTimeCustom
  completionDescription
}
```

交易流程：

1. 驗證 schema version，`FOR UPDATE` proposal，驗證 authenticated parent/family。
2. 正常入口要求 Proposal `proposed`，expected version 必須是 exact current AI 或 parent version。
3. 拒絕 command 內所有未允許的欄位；server 從 source version 複製 readonly/reward/audit fields。
4. 驗證 cadence shape：`weekly_frequency` 必須有有效 frequency 且沒有 days；`fixed_days` 必須有有效、去重、排序後的 days 且沒有 weekly frequency；preferred custom shape 與 completion description 必須有效。
5. DB 比較 normalized material fields。相同回 `NO_MATERIAL_CHANGE` 且零寫入。
6. 插入 parent version、設為 current，呼叫既有 transition 將 `proposed → needs_child_review`（actor parent）；`task_id` 保持 NULL。
7. 驗證 proposal status/current version、version lineage、review timestamps 與 task absence後回 success。

重試：成功回覆遺失後，若狀態已是 `needs_child_review`、current parent version 的 source 正是 expected version，且 material fields 與 command 相同，回同一 version 並標示 `idempotentReplay: true`，不新增 version/event。其他 stale input 回 `STALE_PLAN_VERSION`。

### `accept_child_proposal_plan_v1(p_command jsonb)`

Command：

```text
schemaVersion
proposalId
expectedPlanVersionId
rewardDecision
```

交易流程：

1. `FOR UPDATE` proposal，驗證 family、`needs_child_review`、expected exact current version。
2. Current version 必須由 parent authored、`requires_child_review = true`、`parent_confirmed_at IS NOT NULL`、尚未 effective／child accepted，且 structured fields 完整。
3. 驗證 rewardDecision（詳見 Reward authority）。
4. DB 以 Asia/Taipei 當日計算 `start_date`，以 inclusive `start + duration_days - 1` 計算 `end_date`；只在本交易內寫入 current version 的 start/end，並用這組日期建立 canonical task。
5. 透過既有 canonical creation path 建立 task、child assignment 與必要的 long-term record；`weekly_frequency` 仍保存 frequency 且 `recurrence_days = NULL`。
6. 呼叫既有 `transition_child_proposal_v1`，使用 `needs_child_review → active`、`actorRole = child` 與新 task id。
7. 驗證 active proposal、task/current version link、dates、assignment、必要 long-term record、`effective_at`、`child_accepted_at` 與 confirmed reward source後回 success。

Accept RPC 不另寫 `effective_at`、`child_accepted_at` 或任何 `confirmed_*`。這些 activation semantics 唯一由現有 transition RPC 負責：它會更新 Proposal、current Plan Version、從正式 task 複製 confirmed reward snapshot並寫 status event。Canonical creation、start/end update 與 transition 位於同一 PL/pgSQL transaction/subtransaction；任何 transition failure 都必須讓本次 task、assignment、goal、dates 與其他 write 一起 rollback，再轉成 typed failure。

重試：Proposal 已 active，且 current version、task、confirmed source、child acceptance 都與同一 expected version一致時，回同一 task/version 並標示 `idempotentReplay: true`，不建立第二個 task或 event。

### `request_child_proposal_changes_v1(p_command jsonb)`

Command 包含 schema version、proposal id、expected current version及 optional trimmed reason。RPC lock proposal，要求 `needs_child_review`、current parent-authored review version與 exact expected version，接著呼叫 transition 執行 `needs_child_review → proposed`（actor child）。Current version保持不變，task_id 保持 NULL，不碰 wallet。

同一 command 重試時，若 proposal 已是 `proposed` 且 current 仍為同一 parent review version，回 replay success，不重複寫 status event。這個狀態讓家長 UI 顯示「孩子想再一起聊聊」，只可再調整或關閉，不可 direct confirm。

### `close_child_proposal_unsuitable_v1(p_command jsonb)`

Command 包含 schema version、proposal id、nullable expected current version與 required trimmed reason。RPC lock proposal並驗證 parent/family，只允許從 `proposed` 或 `needs_child_review` 關閉。Expected current version（包含 null）必須與 proposal 精確吻合，讓尚無 AI draft 的原始提案也能誠實關閉；Proposal 必須仍無 task。RPC 呼叫 transition 轉 `closed_unsuitable`（actor parent），保留孩子原始目標、motivation、version history 與 reason，不建立 task、不碰 wallet。

相同 reason/version 的已關閉重試回 replay success；不同 reason 或 stale version 回 typed failure且零寫入。

## Reward authority

SQL 端不是 coin policy engine，不描述成「DB 重新跑 coin policy」。孩子按接受時：

1. Client/service 使用 P0-5A 已有 canonical reward policy evaluator，依目前 policy 產生 fresh `rewardDecision`。
2. Accept RPC 驗證 reward policy 與 parent version 相同、reward policy version 相同；`coin_eligible` 時，suggested/final amount 必須仍精確等於 parent version 保留的 `ai_suggested_coin_amount`，policy range/basis 也必須符合 RPC 所需 contract。
3. Client 不可自行換 policy 或幣值。Fresh decision 若因 policy 更新而與 parent version 不一致，回 `POLICY_CHANGED` 且零寫入；不把舊幣值偷偷改成新數值。

Parent revision RPC 完全不接受 reward edits，只從 source version 複製 reward evidence。Accept 最終仍以 canonical task 為正式 reward snapshot，並由 `transition_child_proposal_v1` 複製到 current Plan Version 的 `confirmed_*`。

## Material diff

新增 `src/lib/childProposal/materialDiff.ts`，提供純函式將 source version 與 current parent version轉成：

```ts
type ChildProposalMaterialDiff = {
  field: 'cadence' | 'preferred_time' | 'completion_description';
  label: string;
  before: string;
  after: string;
};
```

它只讀 structured material fields，使用自然語言，例如「一週 4 次 → 一週 3 次」及「每週一、三、五」。同日/順序等 normalized 等價 cadence 不製造假 diff；readonly fields、duration、title、summary、snapshot與 reward 變化一律忽略。資料庫仍是 material change 的 authority；TS helper 只負責呈現同一白名單欄位，設計可供 P0-8 未來擴充但本包不預建 adjustment schema。

## Parent experience

Parent reader 會載入 selected child 的 `proposed` 與 `needs_child_review` proposal及 exact current version，保留既有 stale-response guard。

- AI-authored proposed：主要動作「確認這個計畫」、次要「調整一下」、低強度「現在不適合」。
- needs child review：顯示「等孩子看看」，不可 direct confirm。
- proposed 且 current 是 parent review version：顯示「孩子想再一起聊聊」，只有「再調整一下」與「現在不適合」。

新增 `ParentProposalEditSheet`，只提供 cadence、preferred time與 completion description controls；按鈕為「存下來，讓孩子看看」。Duration、coin、reward、category、progress、estimated time、title、summary、next step、start/end 都不提供 editor。Sheet 顯示 field validation、saving state、typed error，pending時避免重複送出。

「現在不適合」使用小型自然語氣 sheet：

- 「最近安排比較滿，我們晚一點再一起想」
- 「這個做法現在可能不太適合」
- 「我們先從別的方法開始」
- 「自己寫一句」才展開文字輸入

點選 preset 即構成 required reason；custom 必須有 trimmed non-empty value才能送出。

## Child experience

正式 reader/list 依 selected child 與 family boundary 讀取 `needs_child_review` proposal、current parent version及其 `adopted_from_plan_version_id` source version。沿用目前 parent Supabase session + child PIN 的家庭模型；`actorRole = child` 只作 audit，不在本包處理獨立 child auth。

Child Home 在既有 proposal entry 附近顯示 `ChildPlanReviewCard`：

- 標題「媽媽調整了一點內容」
- 副標「看看新的安排是不是你也想試試看」
- 只顯示 source → current 的 structured material diff
- 動作「好，我想這樣試試看」與「我想再跟爸媽說說看」

卡片處理初次 loading、read error/retry、accept/request pending與 typed action error。Hook 對 selected child 使用 request generation/stale-response guard；切換孩子後，舊 child 的 response或 action completion不得覆蓋目前畫面。

## Atomicity、failure 與 zero-effect guarantees

四支 RPC 都以 proposal row lock 作為狀態/version競爭的 serialization point。所有預期拒絕回 typed result；`NO_MATERIAL_CHANGE`、`STALE_PLAN_VERSION`、`POLICY_CHANGED`、validation/policy rejection均不得有部分 write。

Review、request changes與close都不建立 completion、task、wallet transaction或 coin。Accept 只建立 canonical task及其必要關聯，不發幣；後續正式 completion 才沿既有 reward path處理。

除明確辨認的 lineage constraint外，不吞任何 unique violation。Canonical creation failure或 transition failure必須回滾整個 accept orchestration，不留下 orphan task、assignment、long-term goal、version dates或 active proposal。

## 預計修改檔案

設計核准後的 implementation 預計集中在：

- `supabase/migrations/20260815000000_child_proposal_review_flow.sql`
- `src/types/database.ts`
- `src/lib/childProposal/types.ts`
- `src/lib/childProposal/childProposalService.ts`
- `src/lib/childProposal/materialDiff.ts`
- `src/hooks/useParentProposals.ts`
- child review 專用 reader/hook（置於既有 childProposal domain）
- `src/screens/parent/tablet/home/ParentProposalSection.tsx`
- `src/screens/parent/tablet/home/ParentProposalEditSheet.tsx`
- parent unsuitable reason sheet/dialog
- `src/screens/parent/tablet/ParentHomeTablet.tsx`
- `src/components/child/ChildPlanReviewCard.tsx`
- `src/screens/child/HomeScreen.tsx`
- 對應 migration、service、diff、hook、Parent UI、Child UI tests
- 必要的 staging verifier asset（只建立資產，不在未證明安全時執行或宣稱 PASS）

實作時若能在既有檔案內用窄改動完成，避免為抽象而新增通用層；不修改 P0-6 migration/function、complete-task Edge、wallet、weekly report、P0-8 或 P0-5A activation contract。

## 驗證計畫

### Database

- revise happy path、parent version欄位語意、exact lineage
- readonly injection blocked、duration edit blocked
- normalized no-op → `NO_MATERIAL_CHANGE` 零寫入
- stale version、concurrent/retry與constraint-specific collision handling
- cadence/preferred time/completion description validation
- accept canonical task/start/end/weekly frequency mapping
- accept stale、idempotent retry、reward tamper、policy drift
- transition failure時 canonical task與dates原子 rollback
- request changes與retry；current parent version保留
- close reason required、allowed states、retry與zero effects

### TypeScript 與 UI

- material diff涵蓋每個 editable field、normalized no diff、readonly/duration忽略
- Parent AI/review/child-wants-talk states、edit sheet field whitelist、loading/error
- unsuitable presets/custom validation
- Child card structured diff、accept/request actions、loading/error/retry
- selected-child stale read/action response guard

### Regression

- P0-1 Proposal state/ACL/transition parity
- P0-3 Plan Version structured contract與AI draft
- P0-5A direct confirm、canonical task與reward evaluator
- Parent Home、Child Proposal/Home、Task Drawer
- P0-7.1 weekly rhythm/fixed days
- canonical task creation與reward regressions
- focused suites、full Jest、`npx.cmd tsc --noEmit`、`git diff --check`

Staging 只有在 migration history與明示 project ref `lcmzbdgzehjxwuyduqwj` 均證明安全時才可執行；不得依賴 linked project或 `supabase/config.toml`，production 完全不碰。

## 主要 regression 風險與控制

- **P0-5A activation drift：** accept 只負責編排，activation state與 confirmed snapshot仍由既有 transition RPC唯一實作。
- **舊 free text 誤導：** revised review UI只render structured authority，不把 copied summary當目前安排。
- **Reward authority分裂：** client用既有 evaluator產生 fresh decision；DB只比對 current version evidence，不自稱 policy engine、不改價。
- **版本競爭：** proposal lock、exact expected current、linear lineage與constraint-specific handling阻止分叉。
- **跨孩子畫面污染：** parent/child hooks都保留 request generation guard並在 child切換時清除 action state。
- **範圍擴張：** duration保持 readonly；不碰 active-task adjustment、P0-6或 wallet。
