# P0-5A Parent Direct Confirm 設計

## 目標

把 proposed Child Proposal 的 current AI Plan Version，經家長明確確認後，在單一資料庫交易內形成：parent-authored shared version、canonical task、child assignment、必要的 long-term record，以及 active proposal。確認當下不建立 completion、不改 wallet、不寫 transaction。

## 權威資料與邊界

- 孩子原話與來源只讀 locked `child_proposals` row。
- 計畫內容只讀 `current_plan_version_id` 指向的 structured columns；不解析 `ai_snapshot` 補欄位。
- UI command 只帶 `proposalId`、`expectedPlanVersionId` 與由現行既有 reward policy 算出的 `rewardDecision`。
- 日期由 DB 以 Asia/Taipei 的確認日決定，結束日採 inclusive `start + duration_days - 1`。
- parent adoption 另建一版，保留 AI version；`ai_request_id` 不複製，另以 `adopted_from_plan_version_id` 記 lineage。

## 資料模型

- `tasks.creation_source` 新增 `child_proposal`；它是 non-preset，不得帶 preset IDs/catalog。
- `task_change_events.event_type` 新增 `created_from_child_proposal`。
- `tasks.progress_model` 最小支援 nullable `weekly_rhythm`。
- `tasks.next_step` 保存 structured next step；不用 title 或 snapshot 推導。
- `child_proposal_plan_versions.adopted_from_plan_version_id` 指向被採用的 AI version，只允許 parent-authored version 使用。

## Canonical task 重用

保留既有 `create_parent_task_v1` 對 preset/parent_custom 的全部行為。Migration 把現行實作改名為不對 client 授權的 core，新的同名 wrapper：

1. 非 child proposal 原樣轉交 core。
2. child proposal 先以 core 已支援的 non-preset command 建立／replay canonical rows。
3. 同一交易內把 task source/audit 正規化為 `child_proposal`，保存 `progress_model`、`next_step`。
4. `weekly_rhythm` 明確把 task/goal kind 映射為 P0-7.1 已支援的 `habit`，不靠任務名稱判斷，也不建立 milestone。

## Confirmation transaction

`confirm_child_proposal_v1` 會 `FOR UPDATE` proposal，檢查 family、status、expected current AI version 與完整 structured fields。它以 server date 建 parent version，再呼叫 canonical create wrapper，最後呼叫既有 transition RPC 轉 active並由 transition 從 task 複製 confirmed reward snapshot。

內層 RPC 若回 `{ok:false}`，orchestrator 在 PL/pgSQL subtransaction 中轉成受控 exception；exception 會回滾該 subtransaction 的 parent version/task/assignment/goal/status writes，再在外層轉回 typed failure。成功後再驗證 active、task link、current parent version、activation timestamp 與 confirmed source task。

## Idempotency 與 stale handling

- canonical `creation_request_id = proposal_id`，所以重試與併發最多一個 task。
- proposed 狀態要求 `expectedPlanVersionId === current_plan_version_id`，否則 `STALE_PLAN_VERSION` 且零寫入。
- 已 active 且 task/current parent version 的 `adopted_from_plan_version_id` 等於 expected AI version，回同一 task/version 的 replay success。
- reward policy/version/amount 與 Plan Version 顯示內容不一致時回 `POLICY_CHANGED`，不偷偷換金額。

## Parent UI

家長讀模型以 `{proposal, currentPlanVersion}` 呈現。只有完整、current、AI-authored structured plan 有 CTA。卡片分開顯示孩子原話與 GrowBook 整理；AI 幣值標為「GrowBook 建議」。無有效 plan 時仍顯示原提案與中性狀態，不生成假 plan。成功後 refresh proposed list，卡片自然消失。

## 驗證策略

- 純函式測試：plan completeness、canonical/reward decision、B/non-coin、weekly rhythm mapping、policy drift。
- service/hook/UI 測試：真 plan read model、單一 confirm RPC、loading/success/typed error/no-plan。
- migration static contract：schema constraints、wrapper、locking、rollback subtransaction、lineage、idempotency、dates、wallet zero-write。
- 既有 P0-1/P0-3/P0-4/P0-7.1/canonical creation/reward regressions、typecheck、diff check、full Jest。
- staging history 安全且憑證可用時，僅對明示 project ref `lcmzbdgzehjxwuyduqwj` 執行 smoke。
