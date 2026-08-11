# P0-4 家長首頁 Proposal Card 實作計畫

1. 建立 service read-path 測試，驗證 family/child/status/order/limit 與錯誤傳遞；先看失敗，再實作最小 query。
2. 建立 presentation 測試，涵蓋 weekly frequency、fixed days、one time、空 cadence、動機及 `hopes_for_coin` 的誠實文案；先看失敗，再實作 mapper。
3. 建立 hook 測試，涵蓋 loading、empty、error、refresh、child/family 改變與 stale response；先看失敗，再實作 hook。
4. 建立 section component 測試，涵蓋 1–3 張卡與所有狀態，且沒有 mutation/AI/審核操作；先看失敗，再實作元件。
5. 建立 ParentHomeTablet integration regression，驗證 proposal 區在摘要與 AI 前、focus refresh、選中孩子變更，且既有首頁功能不退步；再接線。
6. 跑 P0-4 focused tests、既有 ParentHomeTablet regressions、child proposal regressions、`npx.cmd tsc --noEmit`、`git diff --check`，並做範圍與 mutation/AI 靜態檢查。
7. 確認 origin/master；若未前進則 commit，若前進則 merge 最新 master 並重驗證。最後正常 push 一次到 `feat/p0-4-parent-proposal-card`，不 merge。
