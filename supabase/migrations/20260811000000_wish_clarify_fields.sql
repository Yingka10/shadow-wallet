-- 許願澄清流程：孩子一句話許願 → AI 補問 1-2 題 → 家長看整理過的資訊核可。
--
-- 只加欄位，不動既有 column／constraint／RPC：
--   redeem_wish、既有 insert/update 呼叫全部不受影響，這批欄位預設值
--   讓舊資料（沒走過澄清流程的既有願望）維持原本行為。
--
-- 欄位對應（家長端要看到的四件事）：
--   child_reason        孩子在澄清問答裡選的原因／用途
--   ai_summary          AI 整理後給家長看的一句話摘要
--   ai_suggested_coins  AI 建議幣值，僅供家長參考——最終 coin_cost 仍由家長核可時寫入
--   confirm_needed      AI 認為家長可能需要另外確認的事（例如尺寸、預算），沒有就是空陣列
--   parent_note         家長判斷「現在不適合」時的簡短原因
--
-- parent_note 同時修好一個既有 bug：ParentHomeTablet.tsx 的 WishApprovalCard
-- 拒絕願望時一直在寫入這個當時不存在的欄位（被 `as any` 蓋住型別檢查），
-- 每次拒絕都會靜默失敗。加了這欄位後那條路徑會自動恢復正常，不需要另外改程式。

alter table reward_items
  add column if not exists child_reason text,
  add column if not exists ai_summary text,
  add column if not exists ai_suggested_coins integer,
  add column if not exists confirm_needed text[] not null default '{}',
  add column if not exists parent_note text;
