-- Shadow Wallet — 孩子提案 / 版本契約（競賽版 P0-1）
--
-- ─────────────────────────────────────────────────────────────────────────
-- 這支解決一件事：**「孩子提出想法 → 家長確認」目前不存在於資料層。**
--
-- 現況是拿 active task 或前端 local state 冒充。兩個都不行：
--
--   · tasks 一被建立就是「已成立的共同版本」——
--     它沒有辦法表達「孩子提了、家長還沒看」，也沒有辦法表達
--     「家長改了、孩子還沒接受」。硬塞的話，任何一個依賴
--     tasks.is_active 的查詢（今日任務、週報、幣值結算）都會把
--     未確認的提案當成正式任務跑進去。
--
--   · React state 撐不過跨幕次。Demo 走到第三幕重新掛載，
--     前兩幕的提案就消失了。
--
-- ⚠️ 這支**不做** proposal → task 的轉換（那是 P0-5）。
--    它只把轉換之後要對得起來的欄位先定出來：linked task 與
--    current plan version。P0-5 只需要填這兩個欄位並轉 active。
--
-- ⚠️ 這支**不碰任何既有表**。tasks / child_tasks / long_term_goals /
--    task_change_events / intervention_log 一個欄位都沒改。
--    proposal 不是 task 的副本 —— 它是 task **之前**的階段。
--
-- ⚠️ **P0 期間試行不入帳。** trial event 這張表刻意沒有任何
--    wallet / transaction 欄位或外鍵，而且有 CHECK 把它釘死。
--    詳見第 5 節。
-- ─────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- 0. 狀態語意與合法轉換
--
-- 五個狀態，語意由產品拍板，這裡只是落地：
--
--   draft               孩子還沒送出，只屬於孩子。家長看不到。
--   proposed            已提出、家長尚未確認。低風險自主行為可以在這個
--                       階段留下試行紀錄，但**沒有可花用的回饋**。
--   needs_child_review  家長做了重大修改，新版本還沒被孩子接受。
--   active              已形成家庭共同版本。到這裡才有正式任務、
--                       才依 policy 入帳。
--   closed_unsuitable   家長認為目前不適合。原始內容與原因都保留，
--                       不建立正式任務。
--
-- 為什麼抽成 IMMUTABLE 函式而不是直接寫在 trigger 裡：
-- 這張轉換表同時要被 trigger（DB 底線）、RPC（帶 actor 的完整檢查）
-- 與前端型別（src/lib/childProposal/transitions.ts）用。
-- 寫三份的話，遲早有一份忘了改，而那一份會是最寬鬆的那個。
--
-- p_actor_role 傳 NULL = 只檢查形狀（from → to 本身合不合法），
-- 不檢查是誰做的。trigger 用這個模式：它看不到 actor，
-- 但它必須擋住「proposed 直接跳回 draft」這種形狀錯誤。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.child_proposal_transition_allowed(
  p_from       text,
  p_to         text,
  p_actor_role text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM (VALUES
      -- 孩子送出提案。draft 只屬於孩子，所以送出也只有孩子能做。
      ('draft',              'proposed',           'child'),

      -- 家長做了重大修改 → 新版本要孩子接受。
      -- 「重大」的判準在 RPC（是否 requires_child_review），不在這裡。
      ('proposed',           'needs_child_review', 'parent'),

      -- 家長確認，形成共同版本。這一步一定要帶 linked task 與
      -- current plan version —— 見第 3 節的一致性 CHECK。
      ('proposed',           'active',             'parent'),

      -- 家長認為目前不適合。內容與原因都留著，不建立任務。
      ('proposed',           'closed_unsuitable',  'parent'),

      -- 孩子接受了家長的修改版本。
      ('needs_child_review', 'active',             'child'),

      -- 孩子不接受 → 退回 proposed，讓家長再改一版。
      -- 不退回 draft：draft 的語意是「家長還沒看過」，
      -- 而這份提案家長已經看過而且動過了，退回去是在改寫歷史。
      ('needs_child_review', 'proposed',           'child'),

      -- 孩子遲遲不接受，家長仍可收掉。
      ('needs_child_review', 'closed_unsuitable',  'parent')
    ) AS t(from_status, to_status, actor_role)
    WHERE t.from_status = p_from
      AND t.to_status   = p_to
      AND (p_actor_role IS NULL OR t.actor_role = p_actor_role)
  );
$$;

COMMENT ON FUNCTION public.child_proposal_transition_allowed(text, text, text) IS
  '孩子提案的合法狀態轉換。p_actor_role 為 NULL 時只檢查形狀，不檢查角色。'
  'active 與 closed_unsuitable 在 P0 都是終點：後續調整走 P0-8 的 adjustment request。';

REVOKE ALL ON FUNCTION public.child_proposal_transition_allowed(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.child_proposal_transition_allowed(text, text, text)
  TO authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. child_proposals
--
-- 為什麼不是在 tasks 上加一個 status：
--
--   tasks 的每一列都代表「這個家庭現在有這件事要做」。二十幾個查詢
--   依賴這個前提（今日任務、週報統計、幣值結算、棄坑偵測）。
--   加一個 proposal_status 之後，那些查詢全部要記得加 WHERE ——
--   而漏掉的那一個會讓未確認的提案直接發幣。
--
--   分開一張表的代價是 P0-5 要做一次轉換；混在一起的代價是
--   每一個既有查詢都變成潛在的錯誤來源。
--
-- 為什麼欄位是結構化的而不是一包 JSON：
--
--   cadence、preferred time、reward preference 都要被查詢 ——
--   家長端要列出「這週孩子提了什麼」，AI 要讀出目前的節奏。
--   塞進 JSON 的話每個查詢都要解包，而且改欄位沒有任何保護。
--   JSON 只留給 AI snapshot（第 4 節），那才是真正的不可變快照。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS child_proposals (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- family_id 冗餘存一份（child 也查得到）。理由是 RLS：
  -- 每一次讀取都要判斷家庭邊界，走 children 的子查詢等於每列多一次 join。
  family_id   uuid        NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id    uuid        NOT NULL REFERENCES children(id) ON DELETE CASCADE,

  status      text        NOT NULL DEFAULT 'draft',

  -- ── 孩子的原話。**永久不可覆寫。** ──────────────────────────────────────
  --
  -- 這兩欄是整張表存在的理由。AI 會重寫、家長會調整、版本會迭代 ——
  -- 三個月後回頭看「當初孩子到底想做什麼」時，唯一沒有被加工過的
  -- 就是這兩欄。第 7 節有 trigger 擋住任何 UPDATE。
  --
  -- motivation 允許 NULL：孩子不一定講得出理由，逼他填會逼出假答案。
  -- goal 不允許空白：沒有目標的提案沒有東西可以確認。
  child_original_goal       text NOT NULL,
  child_original_motivation text,

  -- ── 來源 ────────────────────────────────────────────────────────────────
  --
  -- 沿用 tasks.task_source 的詞彙，但只收 child 與 co_created ——
  -- 一份 parent 或 system 提出的東西不是「孩子的提案」，它走既有的
  -- 家長建立任務路徑。P0-5 轉換時這一欄直接寫進 tasks.task_source，
  -- 而 tasks.creation_source 會是 'child_proposal'（customTaskContract
  -- 已經把它列在 PlannedTaskCreationSource 裡，這裡不必再發明一個值）。
  proposal_source text NOT NULL DEFAULT 'child',

  -- ── 提案內容（可查詢欄位）──────────────────────────────────────────────
  --
  -- cadence 沿用 tasks.schedule_mode 的四個值，不另立一套。
  -- 兩套詞彙表示 P0-5 轉換時要寫一張對照表，而對照表會過期。
  cadence_mode             text,
  cadence_weekly_frequency smallint,
  cadence_days             integer[],
  preferred_time           text,
  preferred_time_custom    text,
  estimated_minutes        integer,

  -- 孩子**期待**的回饋方式。刻意不用 reward_policy 的詞彙。
  --
  -- 這一欄是願望，不是政策。用同一組字面值的話，之後一定有人
  -- 把它當成 tasks.reward_policy 直接寫下去 —— 那等於讓孩子
  -- 自己決定發不發幣。名字不一樣，join 就接不起來。
  child_reward_preference  text NOT NULL DEFAULT 'not_specified',

  child_note               text,

  -- ── 版本與任務關聯 ──────────────────────────────────────────────────────
  --
  -- current_plan_version_id 在 draft / 剛 proposed 時可以是 NULL：
  -- 孩子還沒有計畫，只有一句話。第一版計畫可能來自 AI，也可能來自家長。
  --
  -- 複合外鍵（第 4 節末）保證這個版本一定屬於這份提案 ——
  -- 單欄外鍵擋不住「指向別人家提案的版本」。
  current_plan_version_id  uuid,

  -- P0-5 建立正式任務後才填。active 之前一律 NULL。
  task_id                  uuid REFERENCES tasks(id) ON DELETE SET NULL,

  -- ── 收掉的理由 ──────────────────────────────────────────────────────────
  -- closed_unsuitable 一定要有理由。沒有理由的拒絕對孩子等於沒有回應，
  -- 而這個產品的整個前提是「孩子被認真對待」。
  closed_reason  text,
  closed_at      timestamptz,

  proposed_at    timestamptz,
  activated_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE child_proposals IS
  '孩子提出、家長尚未確認的想法。active 之後才有正式任務（task_id）。'
  'child_original_goal / child_original_motivation 永久不可覆寫（見 trigger）。';

COMMENT ON COLUMN child_proposals.child_reward_preference IS
  '孩子期待的回饋方式，是願望不是政策。刻意不共用 tasks.reward_policy 的字面值，'
  '避免有人直接把它當政策寫下去。';

COMMENT ON COLUMN child_proposals.task_id IS
  'P0-5 轉換後的正式任務。active 之前一律 NULL —— 未確認的提案不可以有任務。';


-- ── 狀態與詞彙 ────────────────────────────────────────────────────────────

ALTER TABLE child_proposals DROP CONSTRAINT IF EXISTS child_proposals_status_check;
ALTER TABLE child_proposals ADD CONSTRAINT child_proposals_status_check
  CHECK (status IN ('draft', 'proposed', 'needs_child_review', 'active', 'closed_unsuitable'));

ALTER TABLE child_proposals DROP CONSTRAINT IF EXISTS child_proposals_source_check;
ALTER TABLE child_proposals ADD CONSTRAINT child_proposals_source_check
  CHECK (proposal_source IN ('child', 'co_created'));

ALTER TABLE child_proposals DROP CONSTRAINT IF EXISTS child_proposals_cadence_mode_check;
ALTER TABLE child_proposals ADD CONSTRAINT child_proposals_cadence_mode_check
  CHECK (
    cadence_mode IS NULL
    OR cadence_mode IN ('one_time', 'fixed_days', 'weekly_frequency', 'plan_schedule')
  );

ALTER TABLE child_proposals DROP CONSTRAINT IF EXISTS child_proposals_reward_preference_check;
ALTER TABLE child_proposals ADD CONSTRAINT child_proposals_reward_preference_check
  CHECK (child_reward_preference IN
    ('not_specified', 'just_record', 'see_progress', 'hopes_for_coin'));

-- 空白的目標等於沒有提案。NOT NULL 擋不住空字串，而空字串在畫面上
-- 看起來就是一張空卡片 —— 家長不知道要確認什麼。
ALTER TABLE child_proposals DROP CONSTRAINT IF EXISTS child_proposals_goal_not_blank;
ALTER TABLE child_proposals ADD CONSTRAINT child_proposals_goal_not_blank
  CHECK (btrim(child_original_goal) <> '');

ALTER TABLE child_proposals DROP CONSTRAINT IF EXISTS child_proposals_weekly_frequency_range;
ALTER TABLE child_proposals ADD CONSTRAINT child_proposals_weekly_frequency_range
  CHECK (
    cadence_weekly_frequency IS NULL
    OR (cadence_weekly_frequency >= 1 AND cadence_weekly_frequency <= 7)
  );

-- 每週次數只屬於 weekly_frequency，固定星期只屬於 fixed_days。
-- 掛錯地方的話兩個值會同時存在，而讀的人不知道該信哪一個。
ALTER TABLE child_proposals DROP CONSTRAINT IF EXISTS child_proposals_cadence_shape;
ALTER TABLE child_proposals ADD CONSTRAINT child_proposals_cadence_shape
  CHECK (
    (cadence_weekly_frequency IS NULL OR cadence_mode = 'weekly_frequency')
    AND (cadence_days IS NULL OR cadence_mode = 'fixed_days')
  );

ALTER TABLE child_proposals DROP CONSTRAINT IF EXISTS child_proposals_estimated_minutes_positive;
ALTER TABLE child_proposals ADD CONSTRAINT child_proposals_estimated_minutes_positive
  CHECK (estimated_minutes IS NULL OR estimated_minutes > 0);


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. 狀態一致性
--
-- 這幾條是整個 P0-1 最重要的保證。少了它們，一筆 active 卻沒有任務的
-- 提案會在家長端顯示成「已確認」，孩子點下去卻沒有東西可以做 ——
-- 而那看起來像 UI bug，實際上是資料層允許了不該存在的狀態。
-- ═══════════════════════════════════════════════════════════════════════════

-- active/shared 一定同時有 linked task 與 current plan version。
-- 兩者缺一，這份提案就不是「家庭共同版本」，只是一個 status 字串。
ALTER TABLE child_proposals DROP CONSTRAINT IF EXISTS child_proposals_active_consistency;
ALTER TABLE child_proposals ADD CONSTRAINT child_proposals_active_consistency
  CHECK (
    status <> 'active'
    OR (task_id IS NOT NULL AND current_plan_version_id IS NOT NULL AND activated_at IS NOT NULL)
  );

-- 反過來也要成立：還沒 active 的提案不可以有正式任務。
-- 有任務就代表已經在孩子的今日任務裡了 —— 那個狀態不是「尚未確認」。
ALTER TABLE child_proposals DROP CONSTRAINT IF EXISTS child_proposals_task_requires_active;
ALTER TABLE child_proposals ADD CONSTRAINT child_proposals_task_requires_active
  CHECK (status = 'active' OR task_id IS NULL);

-- needs_child_review 一定有一個「待孩子接受」的版本。
-- 沒有版本的話，孩子被要求接受的是什麼？
ALTER TABLE child_proposals DROP CONSTRAINT IF EXISTS child_proposals_review_needs_version;
ALTER TABLE child_proposals ADD CONSTRAINT child_proposals_review_needs_version
  CHECK (status <> 'needs_child_review' OR current_plan_version_id IS NOT NULL);

-- 收掉一定要有理由與時間；沒收掉就不該有這兩個值。
ALTER TABLE child_proposals DROP CONSTRAINT IF EXISTS child_proposals_closed_consistency;
ALTER TABLE child_proposals ADD CONSTRAINT child_proposals_closed_consistency
  CHECK (
    CASE WHEN status = 'closed_unsuitable'
      THEN closed_at IS NOT NULL AND btrim(COALESCE(closed_reason, '')) <> ''
      ELSE closed_at IS NULL AND closed_reason IS NULL
    END
  );

-- draft 還沒送出，不該有送出時間。
ALTER TABLE child_proposals DROP CONSTRAINT IF EXISTS child_proposals_draft_not_proposed;
ALTER TABLE child_proposals ADD CONSTRAINT child_proposals_draft_not_proposed
  CHECK (
    CASE WHEN status = 'draft' THEN proposed_at IS NULL ELSE proposed_at IS NOT NULL END
  );

ALTER TABLE child_proposals DROP CONSTRAINT IF EXISTS child_proposals_activated_requires_active;
ALTER TABLE child_proposals ADD CONSTRAINT child_proposals_activated_requires_active
  CHECK (status = 'active' OR activated_at IS NULL);


-- ── 索引 ──────────────────────────────────────────────────────────────────

-- 家長端「這個家庭有哪些待確認的提案」。status 放在中間是因為
-- 家長端幾乎一定會過濾狀態（待確認 vs 已成立）。
CREATE INDEX IF NOT EXISTS child_proposals_family_status_idx
  ON child_proposals (family_id, status, created_at DESC);

-- 孩子端「我提過什麼」。
CREATE INDEX IF NOT EXISTS child_proposals_child_status_idx
  ON child_proposals (child_id, status, created_at DESC);

-- P0-5 之後的反向查詢：從任務找回它的提案來源。
CREATE INDEX IF NOT EXISTS child_proposals_task_idx
  ON child_proposals (task_id) WHERE task_id IS NOT NULL;

-- 一個任務只能來自一份提案。少了這條，重跑一次 P0-5 的轉換
-- 會產生兩份都指向同一個任務的提案，而「原始目標」就有兩個版本了。
CREATE UNIQUE INDEX IF NOT EXISTS child_proposals_task_unique
  ON child_proposals (task_id) WHERE task_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. child_proposal_plan_versions
--
-- 一份提案的計畫會被改很多次：AI 整理一版、家長調一版、孩子不接受、
-- 家長再調一版。每一版都要留著，理由有兩個：
--
--   1. 「家長最後確認的是哪一版」在 active 之後要查得到。
--      只存最新版的話，孩子接受的版本與最後生效的版本可能不是同一個，
--      而那正是親子衝突的來源。
--
--   2. 原始提案不可以被版本覆寫。分表之後這件事是結構性保證，
--      不是靠所有人記得不要 UPDATE child_proposals。
--
-- ⚠️ **這張表不「計算」幣值，但必須「追溯」最後確認的幣值。**
--
--    兩件事要分清楚，混在一起就會長出第二套 pricing engine：
--
--    · AI 建議（ai_snapshot、ai_suggested_coin_amount）
--        誰都不該把它當成最終值。它是「當時 AI 說了什麼」。
--
--    · 家庭最後共同確認的回饋（confirmed_* 那一組）
--        這是 shared version 的一部分 —— 三個月後家長問
--        「我們當初講好一次幾個幣」，答案要在版本上找得到，
--        而不是去翻現在的 tasks（那張表之後還會被調整）。
--
--    關鍵設計：**confirmed_* 不接受呼叫端傳值。**
--    它由 transition_child_proposal_v1 在轉成 active 時，
--    直接從 tasks 那一列**複製**過來（見第 9c 節）。
--
--    所以幣值仍然只有一個來源：既有的 rewardEligibility → coinPolicy
--    → create_parent_task_v1 → tasks.reward_coin_amount。
--    這裡存的是那個結果的不可變快照，不是另一條計算路徑。
--    confirmed_source_task_id 指回那筆任務，隨時對得起來。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS child_proposal_plan_versions (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid    NOT NULL REFERENCES child_proposals(id) ON DELETE CASCADE,

  -- 每份提案自己從 1 開始數。用全域序號的話，家長看到「第 47 版」
  -- 會以為自己改了 47 次。
  version_no  integer NOT NULL,

  -- 誰寫的這一版。ai 是第一等公民 —— 不記的話，三個月後分不出
  -- 「這個節奏是孩子想要的」還是「AI 建議的、大家沒有異議就過了」。
  authored_by     text NOT NULL,
  author_user_id  uuid,

  plan_title    text,
  plan_summary  text,

  -- ── 計畫內容（可查詢）──────────────────────────────────────────────────
  -- 與 child_proposals 同一組詞彙。差異本身就是資訊：
  -- 「孩子提的是每天，家長改成一週三次」要用兩張表的同名欄位比出來，
  -- 而不是去解 JSON。
  cadence_mode             text,
  cadence_weekly_frequency smallint,
  cadence_days             integer[],
  preferred_time           text,
  preferred_time_custom    text,
  estimated_minutes        integer,
  duration_type            text,
  duration_days            integer,
  start_date               date,
  end_date                 date,

  -- ── 回饋資格（不是幣值）─────────────────────────────────────────────────
  --
  -- reward_policy 沿用 tasks.reward_policy 的字面值，但排除
  -- time_saving_eligible —— 3C 與時間儲蓄不在這個工作包，
  -- 讓它可以被寫進來等於允許一條沒有實作的路徑先累積資料。
  reward_policy         text,
  reward_eligibility    text NOT NULL DEFAULT 'not_evaluated',
  reward_policy_version text,
  task_policy_version   text,

  -- ── AI / Plan Draft snapshot ────────────────────────────────────────────
  --
  -- 這裡才是 JSON 的正當用途：它是「當時那一次 AI 回了什麼」的
  -- 不可變快照，不是任何查詢的現況來源。上面那些結構化欄位才是。
  ai_snapshot     jsonb,
  ai_model        text,
  ai_request_id   text,

  -- AI 建議的幣值。**這不是最終值，永遠不是。**
  --
  -- 攤成欄位而不是留在 ai_snapshot 裡，理由是它有一個明確的消費端：
  -- 「AI 建議 12、家長最後給 8」這個對比要能用一句 SQL 查出來
  -- （intervention_log 的 ai_suggested / parent_decision 就是同一個需求）。
  -- 名字裡的 ai_suggested_ 是刻意的 —— 任何人看到這一欄都不會
  -- 誤以為它可以拿去入帳。
  ai_suggested_coin_amount integer,

  -- ── 家庭最後共同確認的回饋（shared version 的一部分）─────────────────
  --
  -- 全部由 transition_child_proposal_v1 從 tasks 複製，呼叫端傳不進來。
  -- 寫一次之後不可修改（見 child_proposal_plan_version_guard）。
  --
  -- 為什麼不是「需要時再 join tasks」：tasks 是**現況**，會被家長調整、
  -- 會被 P0-8 改節奏。而「當初講好的是什麼」是一個歷史事實，
  -- 被現況覆寫之後就永遠找不回來了。
  confirmed_reward_policy         text,
  confirmed_coin_amount           integer,
  confirmed_payout_basis          text,
  confirmed_claim_period          text,
  confirmed_max_claims_per_period integer,
  confirmed_reward_policy_version text,
  confirmed_task_policy_version   text,
  -- 這個快照是從哪一筆任務複製來的。它是「這裡沒有第二套定價」的證據 ——
  -- 任何時候都可以拿它回去比對 tasks.reward_coin_amount。
  confirmed_source_task_id        uuid REFERENCES tasks(id) ON DELETE SET NULL,
  confirmed_by_user_id            uuid,
  confirmed_at                    timestamptz,

  -- ── 版本時間語意 ────────────────────────────────────────────────────────
  --
  -- created_at   這一版被寫下來的時間
  -- effective_at 這一版成為 current 的時間（家長確認前可能永遠不會有）
  -- superseded_at 被下一版取代的時間
  --
  -- 三個分開是因為它們真的會不一樣：家長晚上改了一版（created），
  -- 隔天早上孩子才接受（effective）。只有一個 timestamp 的話，
  -- 「孩子接受的是不是他看到的那一版」永遠答不出來。
  requires_child_review boolean     NOT NULL DEFAULT false,
  child_accepted_at     timestamptz,
  parent_confirmed_at   timestamptz,
  effective_at          timestamptz,
  superseded_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),

  -- 複合唯一鍵。存在的唯一理由是讓 child_proposals 可以用複合外鍵
  -- 指回來，保證 current_plan_version 一定屬於同一份提案。
  CONSTRAINT child_proposal_plan_versions_id_proposal_key UNIQUE (id, proposal_id)
);

COMMENT ON TABLE child_proposal_plan_versions IS
  '提案的計畫版本。append-only：改計畫是新增一版，不是 UPDATE 舊版。'
  '刻意不存最終幣值 —— AI 建議節奏與步驟，coin policy 決定幣值。';

COMMENT ON COLUMN child_proposal_plan_versions.ai_snapshot IS
  'AI / Plan Draft 的不可變快照。稽核用，不是現況來源；現況一律讀同表的結構化欄位。';

ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_version_no_positive;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_version_no_positive
  CHECK (version_no >= 1);

ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_authored_by_check;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_authored_by_check
  CHECK (authored_by IN ('child', 'parent', 'ai'));

ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_cadence_mode_check;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_cadence_mode_check
  CHECK (
    cadence_mode IS NULL
    OR cadence_mode IN ('one_time', 'fixed_days', 'weekly_frequency', 'plan_schedule')
  );

ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_duration_type_check;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_duration_type_check
  CHECK (
    duration_type IS NULL
    OR duration_type IN ('one_time', 'recurring', 'long_term')
  );

-- 排除 time_saving_eligible —— 見上面的說明。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_reward_policy_check;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_reward_policy_check
  CHECK (
    reward_policy IS NULL
    OR reward_policy IN
       ('record_only', 'family_contribution', 'progress_only', 'coin_eligible')
  );

ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_eligibility_check;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_eligibility_check
  CHECK (reward_eligibility IN ('not_evaluated', 'allowed', 'blocked'));

-- allowed / blocked 是一個**判定**，判定一定有依據的政策版本。
-- 沒有版本的判定，半年後政策改了就分不出這一版當初是依什麼判的。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_eligibility_needs_version;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_eligibility_needs_version
  CHECK (
    reward_eligibility = 'not_evaluated'
    OR btrim(COALESCE(reward_policy_version, '')) <> ''
  );

-- **AI 不決定最終版本。**
--
-- 一個 AI 寫的版本可以被家長採用，但採用這個動作要留下家長的名字 ——
-- 所以 authored_by = 'ai' 的列不可以自己帶 parent_confirmed_at。
-- 家長採用時是新增一版 authored_by = 'parent'（ai_snapshot 照抄），
-- 不是把 AI 那一版直接蓋章。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_ai_not_confirmable;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_ai_not_confirmable
  CHECK (authored_by <> 'ai' OR parent_confirmed_at IS NULL);

-- 需要孩子接受的版本，在孩子接受之前不可以是生效版本。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_review_before_effective;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_review_before_effective
  CHECK (
    NOT requires_child_review
    OR effective_at IS NULL
    OR child_accepted_at IS NOT NULL
  );

ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_date_order;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_date_order
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);

-- ── 家庭最後共同確認的回饋 ────────────────────────────────────────────────
--
-- 補欄位用 ADD COLUMN IF NOT EXISTS 再來一次：上面的 CREATE TABLE 有
-- IF NOT EXISTS，所以在「已經套用過這支 migration 的舊版本」的環境上
-- 整段會被跳過。這一段讓那種環境也補得齊。

ALTER TABLE child_proposal_plan_versions
  ADD COLUMN IF NOT EXISTS ai_suggested_coin_amount        integer,
  ADD COLUMN IF NOT EXISTS confirmed_reward_policy         text,
  ADD COLUMN IF NOT EXISTS confirmed_coin_amount           integer,
  ADD COLUMN IF NOT EXISTS confirmed_payout_basis          text,
  ADD COLUMN IF NOT EXISTS confirmed_claim_period          text,
  ADD COLUMN IF NOT EXISTS confirmed_max_claims_per_period integer,
  ADD COLUMN IF NOT EXISTS confirmed_reward_policy_version text,
  ADD COLUMN IF NOT EXISTS confirmed_task_policy_version   text,
  ADD COLUMN IF NOT EXISTS confirmed_source_task_id        uuid,
  ADD COLUMN IF NOT EXISTS confirmed_by_user_id            uuid,
  ADD COLUMN IF NOT EXISTS confirmed_at                    timestamptz;

COMMENT ON COLUMN child_proposal_plan_versions.ai_suggested_coin_amount IS
  'AI 建議的幣值。永遠不是最終值 —— 最終值看 confirmed_coin_amount，'
  '而那一欄由 RPC 從 tasks 複製，呼叫端傳不進來。';

COMMENT ON COLUMN child_proposal_plan_versions.confirmed_coin_amount IS
  '家長最後確認的幣值，從 tasks.reward_coin_amount 複製。'
  '這裡不做任何計算 —— 幣值的唯一來源仍是 rewardEligibility → coinPolicy → tasks。';

COMMENT ON COLUMN child_proposal_plan_versions.confirmed_source_task_id IS
  '這份回饋快照是從哪一筆任務複製來的。存在的理由是可對帳：'
  '任何時候都能拿它回去比對 tasks，證明這裡沒有第二套定價。';

ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_confirmed_source_fkey;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_confirmed_source_fkey
  FOREIGN KEY (confirmed_source_task_id) REFERENCES tasks(id) ON DELETE SET NULL;

-- 確認是一個整體，不是十一個各自獨立的欄位。
-- 只填一半的快照比沒有快照更糟 —— 它看起來像是有答案的。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_confirmed_atomic;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_confirmed_atomic
  CHECK (
    CASE WHEN confirmed_at IS NULL
      THEN confirmed_reward_policy IS NULL
       AND confirmed_coin_amount IS NULL
       AND confirmed_payout_basis IS NULL
       AND confirmed_claim_period IS NULL
       AND confirmed_max_claims_per_period IS NULL
       AND confirmed_reward_policy_version IS NULL
       AND confirmed_task_policy_version IS NULL
       AND confirmed_source_task_id IS NULL
      ELSE confirmed_reward_policy IS NOT NULL
       AND confirmed_by_user_id IS NOT NULL
       AND confirmed_payout_basis IS NOT NULL
       AND confirmed_claim_period IS NOT NULL
       AND confirmed_max_claims_per_period IS NOT NULL
       AND btrim(COALESCE(confirmed_reward_policy_version, '')) <> ''
       AND confirmed_source_task_id IS NOT NULL
    END
  );

ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_confirmed_policy_check;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_confirmed_policy_check
  CHECK (
    confirmed_reward_policy IS NULL
    OR confirmed_reward_policy IN
       ('record_only', 'family_contribution', 'progress_only', 'coin_eligible')
  );

-- payout basis 只有三個值，而且每一個都由 tasks.claim_period 推導得出來
-- （見 child_proposal_payout_basis）。多留「未來也許會用到」的值等於
-- 現在就猜 —— D 類節點式發幣真的要進來時，那需要一支看得見的 migration。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_payout_basis_check;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_payout_basis_check
  CHECK (
    confirmed_payout_basis IS NULL
    OR confirmed_payout_basis IN ('per_completion', 'per_period', 'one_time')
  );

-- 沿用 tasks.claim_period 的三個值，不另立一套。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_confirmed_claim_period_check;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_confirmed_claim_period_check
  CHECK (
    confirmed_claim_period IS NULL
    OR confirmed_claim_period IN ('day', 'week', 'once')
  );

ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_confirmed_max_claims_positive;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_confirmed_max_claims_positive
  CHECK (confirmed_max_claims_per_period IS NULL OR confirmed_max_claims_per_period > 0);

-- 幣值只屬於 coin_eligible，而且 coin_eligible 一定要有幣值。
--
-- 兩個方向都要擋。少了前半，一筆「只記錄」的任務會帶著一個幣值數字，
-- 而週報總有一天會把它加進去；少了後半，家長會看到「可獲得成長幣」
-- 但版本上查不到到底是幾個。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_confirmed_coin_scope;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_confirmed_coin_scope
  CHECK (
    confirmed_reward_policy IS NULL
    OR (
      CASE WHEN confirmed_reward_policy = 'coin_eligible'
        THEN confirmed_coin_amount IS NOT NULL AND confirmed_coin_amount > 0
        ELSE confirmed_coin_amount IS NULL
      END
    )
  );

-- **確認一定要有一個人的名字。**
--
-- ⚠️ 這裡曾經寫成 `authored_by <> 'ai' OR confirmed_at IS NULL`，
--    而 staging 的第一次實跑就把它擋下來了。那條規則是錯的，
--    錯在把兩件不同的事混成一件：
--
--      authored_by         這一版的**計畫內容**是誰起草的
--      confirmed_by_user_id 這一份**回饋**是誰確認的
--
--    AI 起草的計畫當然可以成為家庭共同版本 —— 那正是 AI 該做的事。
--    確認它的是家長，而且家長的帳號就記在 confirmed_by_user_id。
--    禁止 AI 起草的版本被確認，只會逼出一個「把 AI 那版原封不動抄成
--    parent 版本」的假動作，而且會讓共同版本再也對不回 AI 當初提了什麼。
--
--    真正要守住的是「AI 不決定幣值」，而那件事由三個地方保證：
--    confirmed_* 只由 RPC 從 tasks 複製、命令帶幣值一律拒絕、
--    AI 的建議只能進 ai_suggested_coin_amount。與 authored_by 無關。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_ai_not_reward_confirmable;
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_confirmed_needs_actor;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_confirmed_needs_actor
  CHECK (confirmed_at IS NULL OR confirmed_by_user_id IS NOT NULL);

-- AI 建議的幣值一定要有 AI 回應撐著。沒有 snapshot 的「AI 建議」
-- 就只是一個沒有出處的數字。
ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_ai_suggestion_needs_snapshot;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_ai_suggestion_needs_snapshot
  CHECK (
    ai_suggested_coin_amount IS NULL
    OR (ai_snapshot IS NOT NULL AND ai_suggested_coin_amount >= 0)
  );

CREATE INDEX IF NOT EXISTS child_proposal_plan_versions_confirmed_idx
  ON child_proposal_plan_versions (confirmed_source_task_id)
  WHERE confirmed_source_task_id IS NOT NULL;


-- ── payout basis 的推導 ───────────────────────────────────────────────────
--
-- 抽成 IMMUTABLE 函式而不是在 RPC 裡寫 CASE：這條映射之後 P0-5 與
-- 家長端的顯示都會用到，寫兩份就會有一份先過期。
-- 對照的是 create_parent_task_v1 第 9 節推導 claim_period 的那段。

CREATE OR REPLACE FUNCTION public.child_proposal_payout_basis(p_claim_period text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_claim_period
    WHEN 'once' THEN 'one_time'       -- 單次任務，完成一次就結束
    WHEN 'week' THEN 'per_period'     -- 每週 n 次，以週為結算單位
    WHEN 'day'  THEN 'per_completion' -- 每天一次，每完成一次算一次
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.child_proposal_payout_basis(text) IS
  'tasks.claim_period → 版本快照的 payout basis。回 NULL 代表遇到沒見過的 claim_period，'
  '呼叫端必須當成錯誤，不可以塞一個預設值。';

REVOKE ALL ON FUNCTION public.child_proposal_payout_basis(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.child_proposal_payout_basis(text)
  TO authenticated, service_role;


-- 每份提案的版號不重複。並發寫入兩個「第 3 版」時，其中一個拿 23505，
-- 呼叫端重算版號重試 —— 這比事後發現版本歷史缺一格好。
CREATE UNIQUE INDEX IF NOT EXISTS child_proposal_plan_versions_no_unique
  ON child_proposal_plan_versions (proposal_id, version_no);

CREATE INDEX IF NOT EXISTS child_proposal_plan_versions_proposal_idx
  ON child_proposal_plan_versions (proposal_id, created_at DESC);


-- ── 複合外鍵：current version 必須屬於這份提案 ────────────────────────────
--
-- 單欄外鍵（current_plan_version_id → plan_versions.id）只能保證
-- 「這是某一個版本」。它擋不住指向另一份提案（甚至另一個家庭）的版本，
-- 而那種資料列在畫面上完全看不出異常：家長會看到別人家的計畫內容。
--
-- DEFERRABLE 是必要的：刪除提案時，cascade 會同時刪掉兩邊的列，
-- 立即檢查會撞到中間狀態。
ALTER TABLE child_proposals
  DROP CONSTRAINT IF EXISTS child_proposals_current_version_fkey;
ALTER TABLE child_proposals
  ADD CONSTRAINT child_proposals_current_version_fkey
  FOREIGN KEY (current_plan_version_id, id)
  REFERENCES child_proposal_plan_versions (id, proposal_id)
  DEFERRABLE INITIALLY DEFERRED;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. child_proposal_trial_events
--
-- 「孩子試過一次」在 proposed 階段就會發生 —— 那正是 trial 的意義：
-- 低風險的自主行為不需要等家長批准才能做。
--
-- ⚠️ **P0 期間試行不入帳，而且這件事在結構上被釘死：**
--
--   1. 這張表沒有 wallet_id、transaction_id、coin_amount 或任何
--      指向 wallets / transactions 的外鍵。沒有欄位就沒有路徑。
--   2. wallet_effect 有 CHECK 釘在 'none'。它存在的理由是讓
--      「不入帳」變成一個**寫得出來的斷言**，而不是靠讀 schema
--      發現少了欄位才推論出來。之後真的要開放時，那次 migration
--      必須明確改掉這條 CHECK —— 那是一個看得見的決定。
--   3. 第 7 節有 trigger 擋住「active / closed 的提案還在寫 trial」。
--      active 之後完成紀錄走 task_completions，那條路徑才有 coin policy。
--
-- P0 也不做試行幣的自動回補：正式入帳從家長確認共同版本之後才開始。
-- 這張表因此**沒有** backfilled / settled 之類的欄位 ——
-- 加了就等於承諾之後會回補。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS child_proposal_trial_events (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid    NOT NULL REFERENCES child_proposals(id) ON DELETE CASCADE,

  -- child_id / family_id 冗餘存：RLS 與統計都要用，走 proposal 的 join
  -- 等於每一列多一次查表。
  child_id    uuid    NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  family_id   uuid    NOT NULL REFERENCES families(id) ON DELETE CASCADE,

  -- 試的是哪一版計畫。可以是 NULL —— 孩子在有計畫之前就試過了，
  -- 那是很正常的事，而且那個事實本身就是資訊。
  plan_version_id uuid REFERENCES child_proposal_plan_versions(id) ON DELETE SET NULL,

  -- 日期而非 timestamp：孩子回報的是「今天做了」，不是「14:32 做了」。
  -- 時區以 Asia/Taipei 為準（與 taipeiDate.ts 一致），由呼叫端算好。
  occurred_on date    NOT NULL,

  outcome     text    NOT NULL,
  reported_by text    NOT NULL,
  note        text,

  -- 見檔頭。這一欄是斷言，不是設定。
  wallet_effect text NOT NULL DEFAULT 'none',

  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE child_proposal_trial_events IS
  '提案試行紀錄。P0 期間絕對不入帳：本表沒有任何 wallet / transaction 關聯，'
  'wallet_effect 由 CHECK 釘在 none。正式入帳從 active 之後的 task_completions 開始。';

COMMENT ON COLUMN child_proposal_trial_events.wallet_effect IS
  '永遠是 none。存在的理由是讓「試行不入帳」成為可以被查詢與測試的斷言，'
  '而不是一個要靠「schema 裡沒有那個欄位」推論出來的隱含事實。';

ALTER TABLE child_proposal_trial_events
  DROP CONSTRAINT IF EXISTS child_proposal_trial_events_outcome_check;
ALTER TABLE child_proposal_trial_events
  ADD CONSTRAINT child_proposal_trial_events_outcome_check
  CHECK (outcome IN ('tried', 'completed', 'skipped'));

ALTER TABLE child_proposal_trial_events
  DROP CONSTRAINT IF EXISTS child_proposal_trial_events_reported_by_check;
ALTER TABLE child_proposal_trial_events
  ADD CONSTRAINT child_proposal_trial_events_reported_by_check
  CHECK (reported_by IN ('child', 'parent'));

-- 這一條就是「P0 試行不入帳」本身。
ALTER TABLE child_proposal_trial_events
  DROP CONSTRAINT IF EXISTS child_proposal_trial_events_no_wallet_effect;
ALTER TABLE child_proposal_trial_events
  ADD CONSTRAINT child_proposal_trial_events_no_wallet_effect
  CHECK (wallet_effect = 'none');

-- 一天一筆，與既有的信任制規則一致（task_completions 也是一天一筆）。
-- 讓孩子一天按五次「我做到了」對他沒有幫助，而且會讓試行統計失真。
CREATE UNIQUE INDEX IF NOT EXISTS child_proposal_trial_events_daily_unique
  ON child_proposal_trial_events (proposal_id, occurred_on);

CREATE INDEX IF NOT EXISTS child_proposal_trial_events_child_time_idx
  ON child_proposal_trial_events (child_id, occurred_on DESC);


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. child_proposal_adjustment_requests
--
-- P0-8 的接點。這一輪**只建立資料結構**，不做畫面也不做完整的調整流程。
--
-- 為什麼現在就建：P0-8 要接的是「已經 active 的共同版本要怎麼改」，
-- 而那個流程一定會產生新的 plan version。如果 adjustment 到那時候
-- 才設計，它很可能會長成一套獨立的版本機制 —— 於是同一份提案
-- 會有兩套版本歷史。現在先把 resolved_plan_version_id 定出來，
-- P0-8 就只能接回同一條版本鏈。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS child_proposal_adjustment_requests (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid    NOT NULL REFERENCES child_proposals(id) ON DELETE CASCADE,
  family_id   uuid    NOT NULL REFERENCES families(id) ON DELETE CASCADE,

  requested_by     text NOT NULL,
  requester_user_id uuid,

  -- 依據哪一版提出的。少了它，一個月後看到「想改成一週兩次」
  -- 會不知道當時是從幾次改過來的。
  based_on_plan_version_id uuid REFERENCES child_proposal_plan_versions(id) ON DELETE SET NULL,

  adjustment_kind text NOT NULL,
  reason          text NOT NULL,

  -- 這裡用 JSON 是刻意的：調整的內容形狀跟著 adjustment_kind 變，
  -- 而 P0-8 還沒拍板要支援哪些。攤成欄位等於現在就猜。
  -- 一旦 P0-8 定案，會被查詢的那幾個再升成欄位。
  requested_changes jsonb,

  status          text NOT NULL DEFAULT 'open',
  resolved_plan_version_id uuid REFERENCES child_proposal_plan_versions(id) ON DELETE SET NULL,
  resolution_note text,
  resolved_at     timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE child_proposal_adjustment_requests IS
  'P0-8 的最小接點。本輪只有資料結構，沒有 workflow 與畫面。'
  'accepted 一定要接回 plan version，確保調整不會長出第二套版本歷史。';

ALTER TABLE child_proposal_adjustment_requests
  DROP CONSTRAINT IF EXISTS child_proposal_adjustment_requests_requested_by_check;
ALTER TABLE child_proposal_adjustment_requests
  ADD CONSTRAINT child_proposal_adjustment_requests_requested_by_check
  CHECK (requested_by IN ('child', 'parent'));

ALTER TABLE child_proposal_adjustment_requests
  DROP CONSTRAINT IF EXISTS child_proposal_adjustment_requests_kind_check;
ALTER TABLE child_proposal_adjustment_requests
  ADD CONSTRAINT child_proposal_adjustment_requests_kind_check
  CHECK (adjustment_kind IN ('cadence', 'scope', 'support', 'reward', 'pause', 'stop', 'other'));

ALTER TABLE child_proposal_adjustment_requests
  DROP CONSTRAINT IF EXISTS child_proposal_adjustment_requests_status_check;
ALTER TABLE child_proposal_adjustment_requests
  ADD CONSTRAINT child_proposal_adjustment_requests_status_check
  CHECK (status IN ('open', 'accepted', 'declined', 'withdrawn'));

ALTER TABLE child_proposal_adjustment_requests
  DROP CONSTRAINT IF EXISTS child_proposal_adjustment_requests_reason_not_blank;
ALTER TABLE child_proposal_adjustment_requests
  ADD CONSTRAINT child_proposal_adjustment_requests_reason_not_blank
  CHECK (btrim(reason) <> '');

-- open 還沒結案；結案了就一定有時間。
ALTER TABLE child_proposal_adjustment_requests
  DROP CONSTRAINT IF EXISTS child_proposal_adjustment_requests_resolved_consistency;
ALTER TABLE child_proposal_adjustment_requests
  ADD CONSTRAINT child_proposal_adjustment_requests_resolved_consistency
  CHECK (
    CASE WHEN status = 'open'
      THEN resolved_at IS NULL AND resolved_plan_version_id IS NULL
      ELSE resolved_at IS NOT NULL
    END
  );

-- accepted 一定產生新版本。接受了卻沒有新版本，代表「調整」只存在於
-- 對話裡 —— 孩子隔天看到的還是舊計畫。
ALTER TABLE child_proposal_adjustment_requests
  DROP CONSTRAINT IF EXISTS child_proposal_adjustment_requests_accepted_needs_version;
ALTER TABLE child_proposal_adjustment_requests
  ADD CONSTRAINT child_proposal_adjustment_requests_accepted_needs_version
  CHECK (status <> 'accepted' OR resolved_plan_version_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS child_proposal_adjustment_requests_proposal_idx
  ON child_proposal_adjustment_requests (proposal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS child_proposal_adjustment_requests_open_idx
  ON child_proposal_adjustment_requests (family_id, status, created_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. child_proposal_status_events
--
-- append-only 的狀態轉換紀錄。
--
-- 為什麼不共用 task_change_events：那張表的 task_id 是 NOT NULL 且
-- 外鍵指向 tasks。提案在 active 之前根本沒有任務 —— 硬接的話要把
-- task_id 改成可為 NULL，那會鬆掉既有稽核紀錄的保證。
--
-- 為什麼不共用 intervention_log：那張表的每一列都有 child_id 與
-- 明確的 override / AI 對比語意，而且 CLAUDE.md 記錄它現在全表 0 列、
-- 寫入路徑還在補。把提案狀態塞進去會讓它的 event_type 詞彙
-- 一次膨脹一倍，而兩邊的消費端（週報統計、AI 問答）都要跟著改。
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS child_proposal_status_events (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid    NOT NULL REFERENCES child_proposals(id) ON DELETE CASCADE,

  from_status text,
  to_status   text    NOT NULL,

  -- ⚠️ actor_role 是**稽核 / 畫面用的角色標記，不是身分證明**。
  --
  -- 它由呼叫端在命令裡自陳，RPC 只檢查值在不在允許集合裡 ——
  -- 沒有辦法驗證「說自己是 child 的那一次真的是孩子按的」，
  -- 因為這個 App 一個家庭共用一個 auth session（孩子靠 PIN 選 profile）。
  --
  -- 能保證的只有 actor_user_id 這一欄：它是 auth.uid()，
  -- 也就是「這個家庭的某一個已登入帳號」。孩子操作記到的會是家長帳號。
  --
  -- 讀這張表時請照著這個強度理解：
  --   actor_user_id  = 可信（GoTrue 簽出來的）
  --   actor_role     = 自陳（給人看的脈絡，不可拿來做安全判斷）
  -- 完整說明見第 8 節。
  actor_role     text NOT NULL,
  actor_user_id  uuid,

  plan_version_id uuid REFERENCES child_proposal_plan_versions(id) ON DELETE SET NULL,
  reason          text,
  snapshot        jsonb,

  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE child_proposal_status_events IS
  'append-only 的提案狀態轉換紀錄。'
  'actor_user_id 可信（auth.uid()）；actor_role 是呼叫端自陳的稽核 / 畫面角色，'
  '不是身分證明 —— 一個家庭共用一個 auth session，child identity 無法在 DB 層證明。';

ALTER TABLE child_proposal_status_events
  DROP CONSTRAINT IF EXISTS child_proposal_status_events_actor_role_check;
ALTER TABLE child_proposal_status_events
  ADD CONSTRAINT child_proposal_status_events_actor_role_check
  CHECK (actor_role IN ('child', 'parent', 'system'));

ALTER TABLE child_proposal_status_events
  DROP CONSTRAINT IF EXISTS child_proposal_status_events_to_status_check;
ALTER TABLE child_proposal_status_events
  ADD CONSTRAINT child_proposal_status_events_to_status_check
  CHECK (to_status IN ('draft', 'proposed', 'needs_child_review', 'active', 'closed_unsuitable'));

CREATE INDEX IF NOT EXISTS child_proposal_status_events_proposal_idx
  ON child_proposal_status_events (proposal_id, created_at);


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Trigger —— DB 層底線
--
-- RPC 會做完整檢查（含 actor 角色）。這些 trigger 是**繞過 RPC 時**
-- 的最後一道防線：service_role 的腳本、psql 手動修資料、
-- 之後某個人「只是快速改一下狀態」的 UPDATE。
--
-- 型別擋得住我們自己的程式碼，擋不住 psql。
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 7a. 原始提案不可覆寫 ──────────────────────────────────────────────────
--
-- 整個 P0-1 最核心的產品規則。用 trigger 而不是「大家記得不要改」：
-- 一個 UPDATE child_proposals SET ... 的 RPC 只要多寫一欄就會覆寫掉它，
-- 而那種錯誤在測試裡看不出來 —— 資料還在，只是變成了 AI 潤飾過的版本。
--
-- child_id 與 family_id 一起鎖：把提案搬到另一個孩子名下，
-- 等於偽造「這是誰提的」。

CREATE OR REPLACE FUNCTION public.child_proposal_guard_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.child_original_goal IS DISTINCT FROM OLD.child_original_goal THEN
    RAISE EXCEPTION
      '孩子的原始目標不可修改（proposal %）：改計畫請新增 plan version', OLD.id
      USING ERRCODE = '23514';
  END IF;

  IF NEW.child_original_motivation IS DISTINCT FROM OLD.child_original_motivation THEN
    RAISE EXCEPTION
      '孩子的原始動機不可修改（proposal %）：改計畫請新增 plan version', OLD.id
      USING ERRCODE = '23514';
  END IF;

  IF NEW.child_id IS DISTINCT FROM OLD.child_id
    OR NEW.family_id IS DISTINCT FROM OLD.family_id THEN
    RAISE EXCEPTION
      '提案不可改變所屬孩子或家庭（proposal %）', OLD.id
      USING ERRCODE = '23514';
  END IF;

  -- 送出時間是事實，不是狀態。允許從 NULL 填上（draft → proposed），
  -- 但不允許改寫或清空。
  IF OLD.proposed_at IS NOT NULL AND NEW.proposed_at IS DISTINCT FROM OLD.proposed_at THEN
    RAISE EXCEPTION '送出時間不可修改（proposal %）', OLD.id USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS child_proposals_guard_immutable ON child_proposals;
CREATE TRIGGER child_proposals_guard_immutable
  BEFORE UPDATE ON child_proposals
  FOR EACH ROW EXECUTE FUNCTION public.child_proposal_guard_immutable();


-- ── 7b. 非法狀態轉換一律拒絕 ──────────────────────────────────────────────
--
-- trigger 看不到 actor，所以這裡只檢查形狀（p_actor_role => NULL）。
-- 角色檢查在 RPC。兩層加起來才是完整的閘門，但**形狀這一層必須在 DB**：
-- 一筆 closed_unsuitable 被改回 active 的提案，會讓一個被拒絕的想法
-- 突然出現在孩子的今日任務裡。

CREATE OR REPLACE FUNCTION public.child_proposal_guard_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT public.child_proposal_transition_allowed(OLD.status, NEW.status, NULL) THEN
    RAISE EXCEPTION
      '不合法的提案狀態轉換：% → %（proposal %）', OLD.status, NEW.status, OLD.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS child_proposals_guard_transition ON child_proposals;
CREATE TRIGGER child_proposals_guard_transition
  BEFORE UPDATE OF status ON child_proposals
  FOR EACH ROW EXECUTE FUNCTION public.child_proposal_guard_transition();


-- ── 7c. plan version 是 append-only ───────────────────────────────────────
--
-- 只允許改「這一版後來怎麼了」（被接受、生效、被取代），
-- 不允許改「這一版是什麼」。後者改掉的話，孩子接受的內容
-- 與資料庫裡的內容會不一樣，而沒有任何地方看得出來。

CREATE OR REPLACE FUNCTION public.child_proposal_plan_version_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
    OR NEW.version_no  IS DISTINCT FROM OLD.version_no
    OR NEW.authored_by IS DISTINCT FROM OLD.authored_by
    OR NEW.plan_title  IS DISTINCT FROM OLD.plan_title
    OR NEW.plan_summary IS DISTINCT FROM OLD.plan_summary
    OR NEW.cadence_mode IS DISTINCT FROM OLD.cadence_mode
    OR NEW.cadence_weekly_frequency IS DISTINCT FROM OLD.cadence_weekly_frequency
    OR NEW.cadence_days IS DISTINCT FROM OLD.cadence_days
    OR NEW.duration_type IS DISTINCT FROM OLD.duration_type
    OR NEW.duration_days IS DISTINCT FROM OLD.duration_days
    OR NEW.reward_policy IS DISTINCT FROM OLD.reward_policy
    OR NEW.ai_snapshot IS DISTINCT FROM OLD.ai_snapshot
    OR NEW.ai_suggested_coin_amount IS DISTINCT FROM OLD.ai_suggested_coin_amount THEN
    RAISE EXCEPTION
      'plan version 是不可變的（version %）：改計畫請新增一版', OLD.id
      USING ERRCODE = '23514';
  END IF;

  -- 家庭最後共同確認的回饋是 write-once。
  --
  -- 允許從 NULL 填上（P0-5 轉成 active 的那一刻），但填上之後一個字都不能改。
  -- 可改的話，「我們當初講好一次幾個幣」就會跟著現在的 tasks 一起被改寫 ——
  -- 而那正是這組欄位存在的理由：tasks 是現況，這裡是當初講好的事。
  IF OLD.confirmed_at IS NOT NULL AND (
       NEW.confirmed_at                    IS DISTINCT FROM OLD.confirmed_at
    OR NEW.confirmed_reward_policy         IS DISTINCT FROM OLD.confirmed_reward_policy
    OR NEW.confirmed_coin_amount           IS DISTINCT FROM OLD.confirmed_coin_amount
    OR NEW.confirmed_payout_basis          IS DISTINCT FROM OLD.confirmed_payout_basis
    OR NEW.confirmed_claim_period          IS DISTINCT FROM OLD.confirmed_claim_period
    OR NEW.confirmed_max_claims_per_period IS DISTINCT FROM OLD.confirmed_max_claims_per_period
    OR NEW.confirmed_reward_policy_version IS DISTINCT FROM OLD.confirmed_reward_policy_version
    OR NEW.confirmed_task_policy_version   IS DISTINCT FROM OLD.confirmed_task_policy_version
    OR NEW.confirmed_source_task_id        IS DISTINCT FROM OLD.confirmed_source_task_id
  ) THEN
    RAISE EXCEPTION
      '已確認的回饋快照不可修改（version %）：要改回饋請走調整流程並產生新版本', OLD.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS child_proposal_plan_versions_guard ON child_proposal_plan_versions;
CREATE TRIGGER child_proposal_plan_versions_guard
  BEFORE UPDATE ON child_proposal_plan_versions
  FOR EACH ROW EXECUTE FUNCTION public.child_proposal_plan_version_guard();


-- ── 7d. 試行紀錄只屬於「尚未成立」的提案 ──────────────────────────────────
--
-- active 之後完成紀錄走 task_completions —— 那條路徑才有 coin policy
-- 與信任制的一天一筆保證。同一件事同時存在兩張表的話，
-- 週報會算兩次，而其中一次沒有經過任何幣值政策。
--
-- closed_unsuitable 之後也不該再寫：那份提案已經被回絕了。

CREATE OR REPLACE FUNCTION public.child_proposal_trial_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status    text;
  v_child_id  uuid;
  v_family_id uuid;
BEGIN
  SELECT p.status, p.child_id, p.family_id
    INTO v_status, v_child_id, v_family_id
  FROM child_proposals p
  WHERE p.id = NEW.proposal_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION '找不到提案 %', NEW.proposal_id USING ERRCODE = '23503';
  END IF;

  IF v_status NOT IN ('draft', 'proposed', 'needs_child_review') THEN
    RAISE EXCEPTION
      '提案 % 目前是 %，試行紀錄只在尚未成立的提案上有意義（成立後走 task_completions）',
      NEW.proposal_id, v_status
      USING ERRCODE = '23514';
  END IF;

  -- 冗餘欄位必須與提案本身一致。不一致的話，依 child_id 做的統計
  -- 與依 proposal_id 做的統計會各說一套。
  IF NEW.child_id IS DISTINCT FROM v_child_id
    OR NEW.family_id IS DISTINCT FROM v_family_id THEN
    RAISE EXCEPTION
      '試行紀錄的孩子或家庭與提案 % 不符', NEW.proposal_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS child_proposal_trial_events_guard ON child_proposal_trial_events;
CREATE TRIGGER child_proposal_trial_events_guard
  BEFORE INSERT OR UPDATE ON child_proposal_trial_events
  FOR EACH ROW EXECUTE FUNCTION public.child_proposal_trial_guard();


-- ── 7e. active 的 linked task 必須屬於同一個家庭與孩子 ────────────────────
--
-- CHECK 做不到（需要子查詢）。少了它，P0-5 只要傳錯一個 task_id，
-- 孩子的今日任務就會出現另一個家庭的任務 —— 而 tasks 的 RLS
-- 擋的是「讀得到嗎」，擋不住這裡寫進一個不屬於這個家庭的 id。

CREATE OR REPLACE FUNCTION public.child_proposal_guard_linked_task()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_task_family uuid;
BEGIN
  IF NEW.task_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.family_id INTO v_task_family FROM tasks t WHERE t.id = NEW.task_id;

  IF v_task_family IS DISTINCT FROM NEW.family_id THEN
    RAISE EXCEPTION
      '提案 % 的任務不屬於同一個家庭', NEW.id
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM child_tasks ct
    WHERE ct.task_id = NEW.task_id AND ct.child_id = NEW.child_id
  ) THEN
    RAISE EXCEPTION
      '提案 % 的任務沒有指派給這個孩子', NEW.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS child_proposals_guard_linked_task ON child_proposals;
CREATE TRIGGER child_proposals_guard_linked_task
  BEFORE INSERT OR UPDATE OF task_id ON child_proposals
  FOR EACH ROW EXECUTE FUNCTION public.child_proposal_guard_linked_task();


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. RLS
--
-- 邊界是**家庭**，而且只給 SELECT。
--
-- ── 這個 App 實際的身分模型（不要照著別的假設寫程式）─────────────────────
--
-- 一個家庭共用一個 Supabase auth session（家長帳號）。孩子端跑在同一個
-- session 上，用 PIN 選 child profile（見 ChildLoginScreen）。
-- 所以對資料庫而言，家長操作與孩子操作的 auth.uid() **完全一樣**。
--
-- 這帶來一條清楚的分界，兩邊都不要誇大：
--
--   ✅ 跨家庭隔離是**硬邊界**。
--      auth.uid() → parents.family_id 是真的、由 GoTrue 簽出來的。
--      RLS 與每一支 RPC 的 assert_child_in_caller_family 都擋在這一層，
--      而且擋得住惡意 client。
--
--   ❌ 同一個家庭裡「現在操作的是哪一個孩子」**證明不了**。
--      沒有 child 層級的 credential，就沒有任何 policy、trigger 或 RPC
--      能夠驗證這件事。p_command.actorRole 是呼叫端自己講的。
--
-- 所以 actor_role 在這份契約裡的定位是**稽核與畫面用的角色標記**，
-- 不是身分證明（authentication proof）。它的用途是：
--
--   · 讓家長端與孩子端的畫面共用同一組狀態機（哪些按鈕該出現）
--   · 讓 status event 留下「這一步是誰按的」以供事後閱讀
--
-- 它**不是**安全控制。一個惡意的同家庭 client 可以自稱任何角色。
-- 這是已知且被接受的 P0 限制 —— 修掉它需要孩子有獨立 credential，
-- 那是一整套 auth 子系統，不在這個工作包，也不該為了 P0 硬做。
--
-- 為什麼沒有 INSERT / UPDATE / DELETE policy：所有寫入都走第 9 節的
-- SECURITY DEFINER RPC。這樣做**不會**變出 child identity 保證 ——
-- 它換到的是另外三件實在的東西：狀態機一定跑到、跨家庭一定被 assert、
-- 稽核事件一定被寫。RLS 直接開放寫入的話，這三件都會有人繞過。
--
-- 家庭比對用 parents 子查詢而非 my_family_id()：後者是 LIMIT 1，
-- 一個 auth 帳號有多筆 parents 時會挑錯家。與 20260728 的做法一致。
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE child_proposals                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_proposal_plan_versions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_proposal_trial_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_proposal_adjustment_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_proposal_status_events        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family members can view child proposals" ON child_proposals;
CREATE POLICY "family members can view child proposals"
  ON child_proposals FOR SELECT TO authenticated
  USING (family_id IN (SELECT p.family_id FROM parents p WHERE p.user_id = auth.uid()));

DROP POLICY IF EXISTS "family members can view proposal plan versions"
  ON child_proposal_plan_versions;
CREATE POLICY "family members can view proposal plan versions"
  ON child_proposal_plan_versions FOR SELECT TO authenticated
  USING (proposal_id IN (
    SELECT cp.id FROM child_proposals cp
    WHERE cp.family_id IN (SELECT p.family_id FROM parents p WHERE p.user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "family members can view proposal trial events"
  ON child_proposal_trial_events;
CREATE POLICY "family members can view proposal trial events"
  ON child_proposal_trial_events FOR SELECT TO authenticated
  USING (family_id IN (SELECT p.family_id FROM parents p WHERE p.user_id = auth.uid()));

DROP POLICY IF EXISTS "family members can view proposal adjustment requests"
  ON child_proposal_adjustment_requests;
CREATE POLICY "family members can view proposal adjustment requests"
  ON child_proposal_adjustment_requests FOR SELECT TO authenticated
  USING (family_id IN (SELECT p.family_id FROM parents p WHERE p.user_id = auth.uid()));

DROP POLICY IF EXISTS "family members can view proposal status events"
  ON child_proposal_status_events;
CREATE POLICY "family members can view proposal status events"
  ON child_proposal_status_events FOR SELECT TO authenticated
  USING (proposal_id IN (
    SELECT cp.id FROM child_proposals cp
    WHERE cp.family_id IN (SELECT p.family_id FROM parents p WHERE p.user_id = auth.uid())
  ));

REVOKE ALL ON child_proposals, child_proposal_plan_versions, child_proposal_trial_events,
              child_proposal_adjustment_requests, child_proposal_status_events
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON child_proposals, child_proposal_plan_versions, child_proposal_trial_events,
                child_proposal_adjustment_requests, child_proposal_status_events
  TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 9. 寫入 RPC
--
-- 命令一律是 jsonb、回傳一律是 jsonb {ok, ...}，與 create_parent_task_v1
-- 同一套慣例（VALIDATION_FAILED / POLICY_REJECTED，授權失敗拋 42501）。
-- 呼叫端因此可以共用同一組錯誤處理。
--
-- 共同的授權底線抽成 assert_child_in_caller_family：
-- 每一支 RPC 都要做同一件事，寫五遍就會有一遍寫錯。
-- ═══════════════════════════════════════════════════════════════════════════

-- 這一支是**跨家庭隔離的硬邊界**，而且只做這件事。
--
-- 它證明的是「auth.uid() 屬於這個孩子所在的家庭」—— 那是 GoTrue 簽出來的，
-- 惡意 client 偽造不了。它**不**證明、也不可能證明「現在操作的是哪一個孩子」。
-- 不要在呼叫端把它讀成後者。
CREATE OR REPLACE FUNCTION public.assert_child_in_caller_family(p_child_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized: an authenticated session is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.family_id INTO v_family FROM children c WHERE c.id = p_child_id;

  -- 找不到孩子與不屬於這個家庭回同一個錯誤，而且不透露哪一種 ——
  -- 兩種錯誤分開的話，任何人都可以用它列舉出系統裡有哪些 child id。
  IF v_family IS NULL OR NOT EXISTS (
    SELECT 1 FROM parents p WHERE p.user_id = auth.uid() AND p.family_id = v_family
  ) THEN
    RAISE EXCEPTION 'Not authorized: child % is not in the caller family', p_child_id
      USING ERRCODE = '42501';
  END IF;

  RETURN v_family;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_child_in_caller_family(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_child_in_caller_family(uuid) TO authenticated;


-- ── 9a. 建立提案 ──────────────────────────────────────────────────────────
--
-- 提案的來源只收 child / co_created。家長想建立任務走既有的
-- create_parent_task_v1 —— 一份 parent 提出的東西不是「孩子的提案」。
--
-- ⚠️ 這是**產品語意上的區分，不是安全控制**。來源欄位一樣是呼叫端自陳，
--    同家庭的 client 可以寫 'child'。這裡擋的是「畫面走錯入口」，
--    不是「家長冒充孩子」—— 後者在這個身分模型下擋不住（第 8 節）。

CREATE OR REPLACE FUNCTION public.create_child_proposal_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child_id    uuid;
  v_family_id   uuid;
  v_goal        text;
  v_motivation  text;
  v_source      text;
  v_status      text;
  v_cadence     text;
  v_weekly      smallint;
  v_days        integer[];
  v_preference  text;
  v_proposal_id uuid;
  v_now         timestamptz := now();
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('不支援的命令版本：%s', COALESCE(p_command ->> 'schemaVersion', 'null'))
    );
  END IF;

  v_child_id := NULLIF(p_command ->> 'childId', '')::uuid;
  IF v_child_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少 childId');
  END IF;

  v_family_id := public.assert_child_in_caller_family(v_child_id);

  v_goal := NULLIF(btrim(COALESCE(p_command ->> 'childOriginalGoal', '')), '');
  IF v_goal IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '提案缺少孩子的原始目標'
    );
  END IF;

  v_motivation := NULLIF(btrim(COALESCE(p_command ->> 'childOriginalMotivation', '')), '');
  v_source     := COALESCE(NULLIF(btrim(COALESCE(p_command ->> 'proposalSource', '')), ''), 'child');
  IF v_source NOT IN ('child', 'co_created') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('提案來源只能是 child 或 co_created：%s', v_source)
    );
  END IF;

  -- 建立時只能落在 draft 或 proposed。直接建立一筆 active 的提案
  -- 等於跳過家長確認 —— 那正是這個工作包要消滅的事。
  v_status := COALESCE(NULLIF(btrim(COALESCE(p_command ->> 'status', '')), ''), 'draft');
  IF v_status NOT IN ('draft', 'proposed') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'message', format('提案只能以 draft 或 proposed 建立：%s', v_status)
    );
  END IF;

  v_cadence    := NULLIF(btrim(COALESCE(p_command -> 'cadence' ->> 'mode', '')), '');
  v_weekly     := NULLIF(btrim(COALESCE(p_command -> 'cadence' ->> 'weeklyFrequency', '')), '')::smallint;
  v_preference := COALESCE(
    NULLIF(btrim(COALESCE(p_command ->> 'childRewardPreference', '')), ''), 'not_specified'
  );

  -- 空陣列時 array_agg 回 NULL，那正是要的：cadence_days 只在
  -- fixed_days 模式下才可以有值（見 child_proposals_cadence_shape）。
  SELECT array_agg(value::int ORDER BY value::int)
  INTO v_days
  FROM jsonb_array_elements_text(COALESCE(p_command -> 'cadence' -> 'days', '[]'::jsonb));

  INSERT INTO child_proposals (
    family_id, child_id, status,
    child_original_goal, child_original_motivation, proposal_source,
    cadence_mode, cadence_weekly_frequency, cadence_days,
    preferred_time, preferred_time_custom, estimated_minutes,
    child_reward_preference, child_note,
    proposed_at
  ) VALUES (
    v_family_id, v_child_id, v_status,
    v_goal, v_motivation, v_source,
    v_cadence, v_weekly, v_days,
    NULLIF(btrim(COALESCE(p_command -> 'cadence' ->> 'preferredTime', '')), ''),
    NULLIF(btrim(COALESCE(p_command -> 'cadence' ->> 'preferredTimeCustom', '')), ''),
    NULLIF(btrim(COALESCE(p_command ->> 'estimatedMinutes', '')), '')::int,
    v_preference,
    NULLIF(btrim(COALESCE(p_command ->> 'childNote', '')), ''),
    CASE WHEN v_status = 'proposed' THEN v_now ELSE NULL END
  )
  RETURNING id INTO v_proposal_id;

  -- actor_role 記 'child'：建立提案這個動作在產品上一律歸給孩子
  -- （co_created 也是孩子在場）。同樣是稽核標記，不是身分證明。
  INSERT INTO child_proposal_status_events
    (proposal_id, from_status, to_status, actor_role, actor_user_id, reason)
  VALUES
    (v_proposal_id, NULL, v_status, 'child', auth.uid(),
     NULLIF(btrim(COALESCE(p_command ->> 'reason', '')), ''));

  RETURN jsonb_build_object('ok', true, 'proposalId', v_proposal_id, 'status', v_status);
END;
$$;

COMMENT ON FUNCTION public.create_child_proposal_v1(jsonb) IS
  '建立孩子提案。只能落在 draft 或 proposed —— 直接建立 active 等於跳過家長確認。';

REVOKE ALL ON FUNCTION public.create_child_proposal_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_child_proposal_v1(jsonb) TO authenticated;


-- ── 9b. 新增計畫版本 ──────────────────────────────────────────────────────
--
-- 一律新增，永不 UPDATE。版號由 DB 算（MAX + 1），不由 client 傳 ——
-- client 算的話兩個裝置會算出同一個號碼，而 unique index 會讓
-- 其中一個看到一個看不懂的 23505。

CREATE OR REPLACE FUNCTION public.add_child_proposal_plan_version_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal_id uuid;
  v_child_id    uuid;
  v_status      text;
  v_authored_by text;
  v_requires    boolean;
  v_make_current boolean;
  v_policy      text;
  v_eligibility text;
  v_ai_suggested_coin int;
  v_version_no  int;
  v_version_id  uuid;
  v_weekly      smallint;
  v_days        integer[];
  v_now         timestamptz := now();
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本'
    );
  END IF;

  v_proposal_id := NULLIF(p_command ->> 'proposalId', '')::uuid;
  IF v_proposal_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VALIDATION_FAILED', 'message', '命令缺少 proposalId');
  END IF;

  SELECT cp.child_id, cp.status INTO v_child_id, v_status
  FROM child_proposals cp WHERE cp.id = v_proposal_id;

  IF v_child_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: proposal % is not visible to the caller', v_proposal_id
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_child_in_caller_family(v_child_id);

  IF v_status = 'closed_unsuitable' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED', 'message', '已回絕的提案不能再新增計畫版本'
    );
  END IF;

  v_authored_by := NULLIF(btrim(COALESCE(p_command ->> 'authoredBy', '')), '');
  IF v_authored_by IS NULL OR v_authored_by NOT IN ('child', 'parent', 'ai') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('未知的版本作者：%s', COALESCE(v_authored_by, 'null'))
    );
  END IF;

  v_policy      := NULLIF(btrim(COALESCE(p_command -> 'reward' ->> 'policy', '')), '');
  v_eligibility := COALESCE(
    NULLIF(btrim(COALESCE(p_command -> 'reward' ->> 'eligibility', '')), ''), 'not_evaluated'
  );

  -- 這裡是「AI 建議 ≠ 最終確認」在 RPC 層的落實。
  --
  -- **最終幣值不接受呼叫端傳值，一個字都不接受。**
  -- confirmed_* 只由 transition_child_proposal_v1 從 tasks 複製。
  -- 靜靜忽略的話，呼叫端會以為它存進去了，然後家長端會顯示一個
  -- 從來沒有被寫進資料庫的數字。
  IF p_command -> 'reward' ? 'coinAmount'
    OR p_command -> 'reward' ? 'finalAmount'
    OR p_command -> 'reward' ? 'confirmedCoinAmount'
    OR p_command ? 'coinAmount'
    OR p_command ? 'confirmedReward' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'REWARD_NOT_CLIENT_DECIDED',
      'message',
      '計畫版本不接受幣值：AI 建議請用 reward.aiSuggestedCoinAmount，'
      '最終確認的回饋由家長確認時從正式任務複製'
    );
  END IF;

  -- AI 建議的幣值可以存，但它進的是 ai_suggested_coin_amount，
  -- 而且 CHECK 要求同時要有 ai_snapshot —— 沒有出處的數字不算建議。
  v_ai_suggested_coin :=
    NULLIF(btrim(COALESCE(p_command -> 'reward' ->> 'aiSuggestedCoinAmount', '')), '')::int;

  IF v_ai_suggested_coin IS NOT NULL AND p_command -> 'aiSnapshot' IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', 'AI 建議幣值必須附上 aiSnapshot —— 沒有出處的建議不予保存'
    );
  END IF;

  v_requires := COALESCE((p_command ->> 'requiresChildReview')::boolean, false);
  v_make_current := COALESCE((p_command ->> 'makeCurrent')::boolean, true);

  v_weekly := NULLIF(btrim(COALESCE(p_command -> 'cadence' ->> 'weeklyFrequency', '')), '')::smallint;
  SELECT array_agg(value::int ORDER BY value::int)
  INTO v_days
  FROM jsonb_array_elements_text(COALESCE(p_command -> 'cadence' -> 'days', '[]'::jsonb));

  SELECT COALESCE(MAX(v.version_no), 0) + 1 INTO v_version_no
  FROM child_proposal_plan_versions v WHERE v.proposal_id = v_proposal_id;

  INSERT INTO child_proposal_plan_versions (
    proposal_id, version_no, authored_by, author_user_id,
    plan_title, plan_summary,
    cadence_mode, cadence_weekly_frequency, cadence_days,
    preferred_time, preferred_time_custom, estimated_minutes,
    duration_type, duration_days, start_date, end_date,
    reward_policy, reward_eligibility, reward_policy_version, task_policy_version,
    ai_snapshot, ai_model, ai_request_id, ai_suggested_coin_amount,
    requires_child_review,
    -- 需要孩子接受的版本不會立刻生效；其餘的以「成為 current」為生效時間。
    effective_at,
    parent_confirmed_at
  ) VALUES (
    v_proposal_id, v_version_no, v_authored_by, auth.uid(),
    NULLIF(btrim(COALESCE(p_command ->> 'planTitle', '')), ''),
    NULLIF(btrim(COALESCE(p_command ->> 'planSummary', '')), ''),
    NULLIF(btrim(COALESCE(p_command -> 'cadence' ->> 'mode', '')), ''),
    v_weekly, v_days,
    NULLIF(btrim(COALESCE(p_command -> 'cadence' ->> 'preferredTime', '')), ''),
    NULLIF(btrim(COALESCE(p_command -> 'cadence' ->> 'preferredTimeCustom', '')), ''),
    NULLIF(btrim(COALESCE(p_command ->> 'estimatedMinutes', '')), '')::int,
    NULLIF(btrim(COALESCE(p_command ->> 'durationType', '')), ''),
    NULLIF(btrim(COALESCE(p_command ->> 'durationDays', '')), '')::int,
    NULLIF(btrim(COALESCE(p_command ->> 'startDate', '')), '')::date,
    NULLIF(btrim(COALESCE(p_command ->> 'endDate', '')), '')::date,
    v_policy, v_eligibility,
    NULLIF(btrim(COALESCE(p_command -> 'reward' ->> 'policyVersion', '')), ''),
    NULLIF(btrim(COALESCE(p_command ->> 'taskPolicyVersion', '')), ''),
    p_command -> 'aiSnapshot',
    NULLIF(btrim(COALESCE(p_command ->> 'aiModel', '')), ''),
    NULLIF(btrim(COALESCE(p_command ->> 'aiRequestId', '')), ''),
    v_ai_suggested_coin,
    v_requires,
    CASE WHEN v_make_current AND NOT v_requires THEN v_now ELSE NULL END,
    CASE WHEN v_authored_by = 'parent' THEN v_now ELSE NULL END
  )
  RETURNING id INTO v_version_id;

  IF v_make_current THEN
    UPDATE child_proposal_plan_versions
       SET superseded_at = v_now
     WHERE proposal_id = v_proposal_id
       AND id <> v_version_id
       AND superseded_at IS NULL;

    UPDATE child_proposals
       SET current_plan_version_id = v_version_id
     WHERE id = v_proposal_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'planVersionId', v_version_id, 'versionNo', v_version_no,
    'isCurrent', v_make_current
  );
END;
$$;

COMMENT ON FUNCTION public.add_child_proposal_plan_version_v1(jsonb) IS
  '新增一個計畫版本（append-only，版號由 DB 決定）。'
  '命令帶任何幣值一律拒絕 —— 成長幣由 coin policy 在建立正式任務時決定。';

REVOKE ALL ON FUNCTION public.add_child_proposal_plan_version_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_child_proposal_plan_version_v1(jsonb) TO authenticated;


-- ── 9c. 狀態轉換 ──────────────────────────────────────────────────────────
--
-- 送出、家長確認、回絕、孩子接受都走這一支。分成四支的話，
-- 那張轉換表會被複製四份。

CREATE OR REPLACE FUNCTION public.transition_child_proposal_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal_id uuid;
  v_child_id    uuid;
  v_from        text;
  v_to          text;
  v_actor       text;
  v_reason      text;
  v_task_id     uuid;
  v_current_ver uuid;
  v_task        tasks%ROWTYPE;
  v_payout_basis text;
  v_now         timestamptz := now();
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本'
    );
  END IF;

  v_proposal_id := NULLIF(p_command ->> 'proposalId', '')::uuid;
  v_to          := NULLIF(btrim(COALESCE(p_command ->> 'toStatus', '')), '');
  v_actor       := NULLIF(btrim(COALESCE(p_command ->> 'actorRole', '')), '');
  v_reason      := NULLIF(btrim(COALESCE(p_command ->> 'reason', '')), '');
  v_task_id     := NULLIF(p_command ->> 'taskId', '')::uuid;

  IF v_proposal_id IS NULL OR v_to IS NULL OR v_actor IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '命令缺少 proposalId、toStatus 或 actorRole'
    );
  END IF;

  -- actorRole 只檢查「值認不認得」，不檢查「你是不是真的是這個角色」——
  -- 後者在這個身分模型下驗證不了（第 8 節）。這一段是輸入驗證，不是授權。
  -- 真正的授權在下面的 assert_child_in_caller_family：呼叫者必須屬於這個家庭。
  IF v_actor NOT IN ('child', 'parent') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('未知的操作者角色：%s', v_actor)
    );
  END IF;

  -- FOR UPDATE：兩個裝置同時確認同一份提案時，第二個會讀到已經
  -- 轉換後的狀態，然後在下面的合法性檢查被擋下 —— 而不是兩個都成功。
  SELECT cp.child_id, cp.status, cp.current_plan_version_id
    INTO v_child_id, v_from, v_current_ver
  FROM child_proposals cp WHERE cp.id = v_proposal_id
  FOR UPDATE;

  IF v_child_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: proposal % is not visible to the caller', v_proposal_id
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_child_in_caller_family(v_child_id);

  IF NOT public.child_proposal_transition_allowed(v_from, v_to, v_actor) THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'ILLEGAL_TRANSITION',
      'message', format('%s 不能把提案從 %s 轉成 %s', v_actor, v_from, v_to)
    );
  END IF;

  -- active 的前置條件在 CHECK 也有一份，這裡先擋是為了回一個看得懂的訊息，
  -- 而不是讓呼叫端收到 23514。
  IF v_to = 'active' THEN
    IF v_task_id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'reason', 'ACTIVE_REQUIRES_TASK',
        'message', '形成共同版本必須帶正式任務（由 P0-5 的轉換建立）'
      );
    END IF;
    IF v_current_ver IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'reason', 'ACTIVE_REQUIRES_PLAN_VERSION',
        'message', '形成共同版本必須有一個生效的計畫版本'
      );
    END IF;

    -- ══ 讀出正式任務，作為回饋快照的唯一來源 ════════════════════════════
    --
    -- 快照的每一個值都從這一列複製。命令裡就算夾帶幣值也進不來 ——
    -- 這一支 RPC 根本沒有讀 p_command 的幣值欄位。
    SELECT * INTO v_task FROM tasks t WHERE t.id = v_task_id;

    IF v_task.id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'VALIDATION_FAILED',
        'message', format('找不到任務 %s', v_task_id)
      );
    END IF;

    -- 家庭邊界。下面的 trigger 也會擋一次，這裡先擋是為了回一個看得懂的訊息。
    IF v_task.family_id IS DISTINCT FROM
       (SELECT cp.family_id FROM child_proposals cp WHERE cp.id = v_proposal_id) THEN
      RAISE EXCEPTION 'Not authorized: task % belongs to another family', v_task_id
        USING ERRCODE = '42501';
    END IF;

    v_payout_basis := public.child_proposal_payout_basis(v_task.claim_period);

    -- 快照必須是完整的。缺一半的快照比沒有快照更糟 —— 它看起來像有答案。
    --
    -- 走 create_parent_task_v1 建立的任務一定填得齊這些欄位；
    -- 填不齊代表這個 task_id 是舊路徑（taskActions / onboarding）建立的，
    -- 那種任務不該被當成孩子提案的共同版本。
    IF v_task.reward_policy IS NULL
      OR btrim(COALESCE(v_task.reward_policy_version, '')) = ''
      OR v_payout_basis IS NULL
      OR v_task.max_claims_per_period IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'reason', 'TASK_REWARD_SNAPSHOT_INCOMPLETE',
        'message',
        '這筆任務缺少回饋方式或政策版本，無法留下共同確認的回饋紀錄；'
        '請以 create_parent_task_v1 建立的任務進行轉換'
      );
    END IF;

    IF v_task.reward_policy = 'coin_eligible'
      AND COALESCE(v_task.reward_coin_amount, 0) <= 0 THEN
      RETURN jsonb_build_object(
        'ok', false, 'code', 'POLICY_REJECTED',
        'reason', 'TASK_REWARD_SNAPSHOT_INCOMPLETE',
        'message', '可獲得成長幣的任務缺少幣值，無法留下共同確認的回饋紀錄'
      );
    END IF;
  ELSIF v_task_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '只有轉為 active 才可以帶任務'
    );
  END IF;

  -- 「家長改了、等孩子接受」必須有一版可以接受的東西。
  -- CHECK 也擋得住，但那會回一個 23514，呼叫端讀不出是哪裡少了。
  IF v_to = 'needs_child_review' AND v_current_ver IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'REVIEW_REQUIRES_PLAN_VERSION',
      'message', '要孩子確認之前，必須先有一個家長修改後的計畫版本'
    );
  END IF;

  IF v_to = 'closed_unsuitable' AND v_reason IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'CLOSE_REQUIRES_REASON',
      'message', '回絕提案必須說明原因'
    );
  END IF;

  UPDATE child_proposals
     SET status       = v_to,
         task_id      = CASE WHEN v_to = 'active' THEN v_task_id ELSE task_id END,
         proposed_at  = CASE WHEN proposed_at IS NULL AND v_to <> 'draft'
                             THEN v_now ELSE proposed_at END,
         activated_at = CASE WHEN v_to = 'active' THEN v_now ELSE activated_at END,
         closed_reason = CASE WHEN v_to = 'closed_unsuitable' THEN v_reason ELSE closed_reason END,
         closed_at    = CASE WHEN v_to = 'closed_unsuitable' THEN v_now ELSE closed_at END
   WHERE id = v_proposal_id;

  -- 孩子接受了家長的版本 → 記在版本上，不只記在提案上。
  -- 「他接受的是哪一版」之後要查得出來。
  IF v_to = 'active' AND v_current_ver IS NOT NULL THEN
    UPDATE child_proposal_plan_versions
       SET effective_at      = COALESCE(effective_at, v_now),
           child_accepted_at = CASE WHEN v_actor = 'child'
                                    THEN COALESCE(child_accepted_at, v_now)
                                    ELSE child_accepted_at END,

           -- ══ 家庭最後共同確認的回饋快照 ══════════════════════════════
           --
           -- 全部**從 tasks 複製**，一個值都不從命令來。
           -- 這是「不建立第二套 pricing engine」在程式碼裡的落實：
           -- 幣值仍然只由 rewardEligibility → coinPolicy →
           -- create_parent_task_v1 決定，這裡只留一份不可變的副本。
           --
           -- COALESCE 是因為 write-once：重複轉 active 不該蓋掉第一次的快照
           -- （雖然狀態機本來就不允許，但這裡不依賴那個保證）。
           confirmed_reward_policy         = COALESCE(confirmed_reward_policy, v_task.reward_policy),
           confirmed_coin_amount           = COALESCE(confirmed_coin_amount,
                                                      CASE WHEN v_task.reward_policy = 'coin_eligible'
                                                           THEN v_task.reward_coin_amount END),
           confirmed_payout_basis          = COALESCE(confirmed_payout_basis, v_payout_basis),
           confirmed_claim_period          = COALESCE(confirmed_claim_period, v_task.claim_period),
           confirmed_max_claims_per_period = COALESCE(confirmed_max_claims_per_period,
                                                      v_task.max_claims_per_period),
           confirmed_reward_policy_version = COALESCE(confirmed_reward_policy_version,
                                                      v_task.reward_policy_version),
           confirmed_task_policy_version   = COALESCE(confirmed_task_policy_version,
                                                      v_task.task_policy_version),
           confirmed_source_task_id        = COALESCE(confirmed_source_task_id, v_task_id),
           confirmed_by_user_id            = COALESCE(confirmed_by_user_id, auth.uid()),
           confirmed_at                    = COALESCE(confirmed_at, v_now)
     WHERE id = v_current_ver;
  END IF;

  INSERT INTO child_proposal_status_events
    (proposal_id, from_status, to_status, actor_role, actor_user_id, plan_version_id, reason)
  VALUES
    (v_proposal_id, v_from, v_to, v_actor, auth.uid(), v_current_ver, v_reason);

  RETURN jsonb_build_object(
    'ok', true, 'proposalId', v_proposal_id, 'fromStatus', v_from, 'toStatus', v_to,
    'planVersionId', v_current_ver,
    -- 轉 active 時把快照原樣回傳，P0-5 可以直接比對它與 tasks 是否一致，
    -- 不必再查一次。非 active 的轉換這一鍵是 null。
    'confirmedReward', CASE WHEN v_to = 'active' THEN jsonb_build_object(
      'rewardPolicy',       v_task.reward_policy,
      'coinAmount',         CASE WHEN v_task.reward_policy = 'coin_eligible'
                                 THEN v_task.reward_coin_amount END,
      'payoutBasis',        v_payout_basis,
      'claimPeriod',        v_task.claim_period,
      'maxClaimsPerPeriod', v_task.max_claims_per_period,
      'rewardPolicyVersion', v_task.reward_policy_version,
      'taskPolicyVersion',  v_task.task_policy_version,
      'sourceTaskId',       v_task_id
    ) END
  );
END;
$$;

COMMENT ON FUNCTION public.transition_child_proposal_v1(jsonb) IS
  '孩子提案的狀態轉換閘門。合法性由 child_proposal_transition_allowed 判定；'
  'active 必須同時帶 linked task 與 current plan version，'
  '並把該任務的回饋（policy / amount / payout basis / claim 規則 / 政策版本）'
  '複製成計畫版本上不可變的共同確認快照 —— 快照的值一律從 tasks 讀，不從命令來。'
  'p_command.actorRole 是 audit / UI 角色，不是身分證明（見檔頭第 8 節）。';

REVOKE ALL ON FUNCTION public.transition_child_proposal_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_child_proposal_v1(jsonb) TO authenticated;


-- ── 9d. 試行紀錄 ──────────────────────────────────────────────────────────
--
-- **這一支不碰 wallets、transactions 或 task_completions。**
-- 它只寫一列 trial event。P0-6 要接入帳時，那是另一支 RPC 的事，
-- 而且要先改掉第 4 節的 wallet_effect CHECK。

CREATE OR REPLACE FUNCTION public.record_child_proposal_trial_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal_id uuid;
  v_child_id    uuid;
  v_family_id   uuid;
  v_status      text;
  v_current_ver uuid;
  v_outcome     text;
  v_reported_by text;
  v_occurred    date;
  v_event_id    uuid;
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本'
    );
  END IF;

  v_proposal_id := NULLIF(p_command ->> 'proposalId', '')::uuid;
  v_outcome     := NULLIF(btrim(COALESCE(p_command ->> 'outcome', '')), '');
  v_reported_by := COALESCE(NULLIF(btrim(COALESCE(p_command ->> 'reportedBy', '')), ''), 'child');
  v_occurred    := NULLIF(btrim(COALESCE(p_command ->> 'occurredOn', '')), '')::date;

  IF v_proposal_id IS NULL OR v_outcome IS NULL OR v_occurred IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '命令缺少 proposalId、outcome 或 occurredOn'
    );
  END IF;

  IF v_outcome NOT IN ('tried', 'completed', 'skipped') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', format('未知的試行結果：%s', v_outcome)
    );
  END IF;

  SELECT cp.child_id, cp.family_id, cp.status, cp.current_plan_version_id
    INTO v_child_id, v_family_id, v_status, v_current_ver
  FROM child_proposals cp WHERE cp.id = v_proposal_id;

  IF v_child_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: proposal % is not visible to the caller', v_proposal_id
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_child_in_caller_family(v_child_id);

  IF v_status NOT IN ('draft', 'proposed', 'needs_child_review') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POLICY_REJECTED',
      'reason', 'TRIAL_NOT_APPLICABLE',
      'message', '提案已經成立或已回絕，完成紀錄請走正式任務'
    );
  END IF;

  INSERT INTO child_proposal_trial_events (
    proposal_id, child_id, family_id, plan_version_id,
    occurred_on, outcome, reported_by, note
  ) VALUES (
    v_proposal_id, v_child_id, v_family_id, v_current_ver,
    v_occurred, v_outcome, v_reported_by,
    NULLIF(btrim(COALESCE(p_command ->> 'note', '')), '')
  )
  ON CONFLICT (proposal_id, occurred_on) DO NOTHING
  RETURNING id INTO v_event_id;

  -- 同一天重複回報不是錯誤，也不新增第二列 —— 與信任制的一天一筆一致。
  IF v_event_id IS NULL THEN
    SELECT e.id INTO v_event_id FROM child_proposal_trial_events e
    WHERE e.proposal_id = v_proposal_id AND e.occurred_on = v_occurred;

    RETURN jsonb_build_object(
      'ok', true, 'trialEventId', v_event_id, 'duplicate', true, 'walletEffect', 'none'
    );
  END IF;

  -- walletEffect 明確回傳，讓呼叫端不需要靠「沒有 coin 欄位」推論。
  RETURN jsonb_build_object(
    'ok', true, 'trialEventId', v_event_id, 'duplicate', false, 'walletEffect', 'none'
  );
END;
$$;

COMMENT ON FUNCTION public.record_child_proposal_trial_v1(jsonb) IS
  '記錄一次提案試行。P0 期間絕不入帳：本函式不碰 wallets / transactions / task_completions，'
  '回傳固定帶 walletEffect = none。';

REVOKE ALL ON FUNCTION public.record_child_proposal_trial_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_child_proposal_trial_v1(jsonb) TO authenticated;


-- ── 9e. 調整請求（P0-8 接點）──────────────────────────────────────────────
--
-- 只有建立。accept / decline 的 workflow 是 P0-8 的事 ——
-- 現在做的話會在沒有畫面的情況下先鎖死流程。

CREATE OR REPLACE FUNCTION public.create_child_proposal_adjustment_request_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal_id uuid;
  v_child_id    uuid;
  v_family_id   uuid;
  v_current_ver uuid;
  v_requested   text;
  v_kind        text;
  v_reason      text;
  v_request_id  uuid;
BEGIN
  IF COALESCE((p_command ->> 'schemaVersion')::int, 0) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED', 'message', '不支援的命令版本'
    );
  END IF;

  v_proposal_id := NULLIF(p_command ->> 'proposalId', '')::uuid;
  v_requested   := COALESCE(NULLIF(btrim(COALESCE(p_command ->> 'requestedBy', '')), ''), 'child');
  v_kind        := NULLIF(btrim(COALESCE(p_command ->> 'adjustmentKind', '')), '');
  v_reason      := NULLIF(btrim(COALESCE(p_command ->> 'reason', '')), '');

  IF v_proposal_id IS NULL OR v_kind IS NULL OR v_reason IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'VALIDATION_FAILED',
      'message', '命令缺少 proposalId、adjustmentKind 或 reason'
    );
  END IF;

  SELECT cp.child_id, cp.family_id, cp.current_plan_version_id
    INTO v_child_id, v_family_id, v_current_ver
  FROM child_proposals cp WHERE cp.id = v_proposal_id;

  IF v_child_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: proposal % is not visible to the caller', v_proposal_id
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_child_in_caller_family(v_child_id);

  INSERT INTO child_proposal_adjustment_requests (
    proposal_id, family_id, requested_by, requester_user_id,
    based_on_plan_version_id, adjustment_kind, reason, requested_changes
  ) VALUES (
    v_proposal_id, v_family_id, v_requested, auth.uid(),
    v_current_ver, v_kind, v_reason, p_command -> 'requestedChanges'
  )
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object('ok', true, 'adjustmentRequestId', v_request_id, 'status', 'open');
END;
$$;

COMMENT ON FUNCTION public.create_child_proposal_adjustment_request_v1(jsonb) IS
  'P0-8 的最小接點：只建立 open 的調整請求，不做 accept / decline workflow。';

REVOKE ALL ON FUNCTION public.create_child_proposal_adjustment_request_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_child_proposal_adjustment_request_v1(jsonb) TO authenticated;
