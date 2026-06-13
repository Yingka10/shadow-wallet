-- ─────────────────────────────────────────────────────────────────────────────
-- intervention_log
-- 業務事件 append-only 記錄。服務四個消費端：
--   1. Audit log 紀錄頁（家長看 AI 建議 vs 自己實際決定）
--   2. 週報統計（COUNT by event_type in week range）
--   3. 月報統計（COUNT by event_type in month range）
--   4. 家長諮詢 AI（context_snapshot 讓 LLM 重建因果，不回頭重算歷史）
--
-- 寫入路徑（均為 service_role 或 SECURITY DEFINER function，不開放 client 直寫）：
--   - detect-abandonment cron（service_role key，parent_id = null）
--   - 未來 complete_task_override_atomic RPC（SECURITY DEFINER）
--   - generate-degradation-suggestion（service_role key）
--
-- 不設計 UPDATE / DELETE 路徑（append-only）。
-- ─────────────────────────────────────────────────────────────────────────────
create table public.intervention_log (
  id                  uuid        primary key default gen_random_uuid(),

  -- 定位欄位
  family_id           uuid        not null
    references public.families(id)
    -- ⚠️  RESTRICT（而非 CASCADE）：保護 audit log 不被連帶刪除。
    --    注意：此 RESTRICT 會阻擋直接 DELETE families。
    --    未來若實作「刪除孩子/家庭資料」（GDPR 兒童個資刪除權），
    --    必須先處理本表的 log：匿名化（family_id / child_id 改寫為固定 sentinel UUID）
    --    或整批刪除本表對應 log，才能再刪 families / children。
    --    這與其他表（redemption_requests 等）用 CASCADE 是有意識的設計差異。
    on delete restrict,

  child_id            uuid        not null
    references public.children(id)
    -- ⚠️  同上，RESTRICT 保護 audit log。GDPR 刪除前需先處理本表。
    on delete restrict,

  parent_id           uuid
    references public.parents(id)
    -- parent_id = null 代表系統觸發（detect-abandonment cron 等）
    on delete set null,

  task_id             uuid
    references public.tasks(id)
    -- 任務刪除後 task_id 變 null，task_name_snapshot 保留當時事實
    on delete set null,

  task_name_snapshot  text,
  -- 任務名快照：tasks.name 可能改名或軟刪除，log 須保留觸發當時的正確名稱

  -- 家長標記時：同一 transaction 先 INSERT overrides，再填入 override_id
  -- 非家長標記事件（abandonment_flagged 等）：override_id = null
  override_id         uuid
    references public.overrides(id)
    on delete set null,

  -- 預留追蹤欄：同一業務動作產生多筆 log 時關聯用（目前不強制非 null）
  correlation_id      uuid,

  -- ── 事件分類 ─────────────────────────────────────────────────────────────
  event_type          text        not null,
  -- 目前已知值（用 text 不用 enum，加新值不需 migration）：
  --
  --   家長標記類（同步寫 overrides + intervention_log，override_id 非 null）：
  --     'parent_override_partial'             沒達標：扣部分幣，可重做
  --     'parent_override_none'                根本沒做：扣全幣，credit_flag = true
  --     'parent_override_renegotiate'         重新討論：進議價，暫不結算（第一段）
  --     'parent_override_renegotiate_resolved' 議價完成，parent_decision 記錄最終協商幣值
  --
  --   棄坑偵測類（parent_id = null，override_id = null）：
  --     'abandonment_flagged'                 系統偵測到棄坑
  --
  --   AI 建議類：
  --     'ai_suggestion_generated'             generate-degradation-suggestion 產生建議
  --     'ai_coin_suggested'                   AI 建議幣值調整（未來金流 RPC）
  --
  --   兌換審核類：
  --     'redemption_reviewed'                 家長審核兌換申請（approved / rejected）

  trigger_source      text        not null,
  -- 目前已知值：
  --   'detect-abandonment-cron' detect-abandonment Edge Function (cron)
  --   'parent_manual'           家長手動觸發（Override 頁面）
  --   'generate-degradation-suggestion' generate-degradation-suggestion Edge Function
  --   'ai_proxy'                        ai-proxy Edge Function（其他 AI 觸發路徑）
  --   'complete_task_atomic'            未來 Postgres RPC（缺口三 atomic 設計）

  -- ── AI 建議 vs 家長實際決定（保留對比，供 audit log 頁與 AI 問答）──────
  ai_suggested        jsonb,
  -- 範例：{ "coins": 30, "action": "lower_difficulty", "reason": "連續3天未完成" }

  parent_decision     jsonb,
  -- 範例（override）：
  --   { "override_type": "partial", "coin_deducted": 5, "credit_flag": false, "reason": "有解釋" }
  -- 範例（renegotiate 第二段完成）：
  --   { "agreed_coins": 8, "renegotiate_resolved": true }

  -- ── 觸發當下的關鍵指標快照（AI 問答重建因果的核心）──────────────────────
  context_snapshot    jsonb,
  -- 讓 LLM 不需回頭重算歷史即可理解事件前因。
  -- 範例（abandonment_flagged）：
  --   {
  --     "abandonment_tier": 2,
  --     "completion_rate_7d": 0.43,
  --     "last_completion_date": "2026-05-23",
  --     "consecutive_misses": 7
  --   }
  -- 範例（parent_override_none）：
  --   {
  --     "coin_earned_original": 10,
  --     "wallet_balance_before": 280,
  --     "credit_score_before": 85,
  --     "task_category": "C"
  --   }

  created_at          timestamptz not null default now()
);

-- ── 索引 ──────────────────────────────────────────────────────────────────────

-- 主要查詢：週報/月報 range query、家長諮詢 AI 撈近 N 天事件
-- WHERE child_id = $1 AND created_at >= $week_start AND created_at < $week_end
create index idx_intervention_log_child_time
  on public.intervention_log (child_id, created_at desc);

-- Audit log UI：家長查自己 family 全部事件
-- WHERE family_id = $1 ORDER BY created_at DESC LIMIT 50
-- child_id 索引無法涵蓋 family 層級查詢，此索引避免全表掃描
create index idx_intervention_log_family_time
  on public.intervention_log (family_id, created_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.intervention_log enable row level security;

-- 家長只能 SELECT 自己 family 的記錄
-- my_family_id() 與現有所有表的 RLS 寫法一致（redemption_requests、tasks 等）
create policy "intervention_log_family_select"
  on public.intervention_log
  for select
  to authenticated
  using (family_id = public.my_family_id());

-- INSERT：不開放 authenticated 直接寫
-- service_role（Edge Function）與 SECURITY DEFINER function（Postgres RPC）均繞過 RLS

-- Append-only：明確封鎖 authenticated 的 UPDATE / DELETE
create policy "intervention_log_no_update"
  on public.intervention_log
  for update
  to authenticated
  using (false);

create policy "intervention_log_no_delete"
  on public.intervention_log
  for delete
  to authenticated
  using (false);

-- ── 授權 ──────────────────────────────────────────────────────────────────────
-- 與現有 grant_table_permissions migration 的模式一致
-- SELECT 開放給 authenticated（受 RLS 約束，只能看自己 family）
-- INSERT / UPDATE / DELETE 由 service_role 承擔，不額外授權
grant select on public.intervention_log to authenticated;
