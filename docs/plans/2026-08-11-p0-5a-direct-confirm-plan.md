# P0-5A Parent Direct Confirm 實作計畫

1. 先以 failing tests 鎖定 direct-confirm domain、read model、service、hook/UI 與 migration contract。
2. 擴充 TypeScript contract：parent card data、confirm command/result/failure、`child_proposal` creation source、task structured fields。
3. 實作 direct-confirm domain mapper，以既有 reward evaluator 驗證 Plan Version 顯示的政策版本、資格與建議金額。
4. 新增 migration：lineage/task fields/source constraints/audit event、canonical wrapper、atomic `confirm_child_proposal_v1`。
5. 擴充 Supabase child proposal service，一次讀 proposal + exact current version，並只呼叫單一 confirm RPC。
6. 擴充 `useParentProposals` 與 Parent Home card：real plan、CTA/loading/success/typed failure/no-plan fallback。
7. 跑 focused 與跨域 regressions；修正時保持 Proposal/version、wallet、weekly report 與 P0-8 邊界。
8. 跑 typecheck、`git diff --check`、full regression並自我 review。
9. 檢查 origin/master 是否前進及 domain overlap；安全時執行 staging migration/history/smoke。
10. commit 整包、push 一次，不 merge。
