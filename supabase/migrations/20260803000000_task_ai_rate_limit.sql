-- Shadow Wallet — task-ai-recommendation 的 server-side rate limit
--
-- 為什麼需要它：
--
--   B2A 把功能部署到 staging 之後，唯一擋在「付費 AI 呼叫」前面的東西是
--   「你有沒有登入」。一個登入中的家長可以連按二十次，每一次都是一次
--   真實的 Gemini 請求。B2A 的驗證本身就把三個 model 的當日免費額度用完了 ——
--   那不是假想的風險，是已經發生過的事。
--
-- 為什麼是資料庫而不是 Edge Function 記憶體：
--
--   Edge Function instance 會重啟、會水平擴充。in-memory 的 Map 在
--   單一 instance 上看起來有效，實際上每個 instance 各數各的，
--   而且一重啟就歸零。那不是限流，是限流的樣子。
--
-- 為什麼是這張表而不是既有的 intervention_log：
--
--   限流要的是「同一列上的原子遞增」，那需要 PK 與 row lock。
--   append-only 的 log 表做不到，而且會把稽核紀錄與流量控制綁在一起。
--
-- 這支 migration **只在 staging 套用**。production 未部署此功能。

-- ---------------------------------------------------------------------------
-- 計數表
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_ai_rate_limit_counters (
  user_id       uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- 'per_10min' | 'per_day'。用文字而不是 enum：多一種視窗時不必改型別。
  bucket_type   text        NOT NULL,
  -- 視窗的起點（UTC）。同一個視窗內的請求落在同一列上。
  bucket_start  timestamptz NOT NULL,
  request_count integer     NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- 原子遞增靠的就是這個主鍵：ON CONFLICT DO UPDATE 會鎖住那一列，
  -- 並行的請求因此排隊而不是各自讀到舊值。
  CONSTRAINT task_ai_rate_limit_counters_pkey
    PRIMARY KEY (user_id, bucket_type, bucket_start),

  CONSTRAINT task_ai_rate_limit_counters_bucket_type_check
    CHECK (bucket_type IN ('per_10min', 'per_day')),

  CONSTRAINT task_ai_rate_limit_counters_count_check
    CHECK (request_count >= 0)
);

COMMENT ON TABLE public.task_ai_rate_limit_counters IS
  'task-ai-recommendation 的 per-user 限流計數。只由 consume_task_ai_recommendation_quota_v1 寫入。';

-- 清理舊視窗用。沒有這個索引，刪舊資料要掃全表。
CREATE INDEX IF NOT EXISTS task_ai_rate_limit_counters_bucket_start_idx
  ON public.task_ai_rate_limit_counters (bucket_start);

-- ---------------------------------------------------------------------------
-- RLS：啟用但**不給任何 policy**
-- ---------------------------------------------------------------------------
--
-- 這是刻意的。這張表沒有任何合法的直接讀寫情境：
-- 家長不需要看自己的計數（看得到就等於知道還剩幾次，那是在教人怎麼卡邊界），
-- 而寫入只能經由下面那支 SECURITY DEFINER 函式。
--
-- 「啟用 RLS 且沒有 policy」= 除了 service_role 與 SECURITY DEFINER 之外
-- 一律拒絕。這比寫一條 `USING (false)` 更明確。

ALTER TABLE public.task_ai_rate_limit_counters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.task_ai_rate_limit_counters FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 原子消耗
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.consume_task_ai_recommendation_quota_v1(
  p_limit_per_10min integer,
  p_limit_per_day   integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id     uuid;
  v_now         timestamptz := now();
  v_bucket_10   timestamptz;
  v_bucket_day  timestamptz;
  v_count_10    integer;
  v_count_day   integer;
  v_limit_10    integer;
  v_limit_day   integer;
  v_retry       integer;
BEGIN
  -- 呼叫者是誰只看 JWT。**不接受任何 client 傳進來的 user_id** ——
  -- 那樣任何人都可以消耗別人的額度，或用別人的身分繞過自己的。
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'NOT_AUTHENTICATED');
  END IF;

  -- 上限夾在伺服器端。這支 RPC 是 authenticated 可呼叫的，
  -- 所以不能相信參數 —— 不夾的話有人可以帶 p_limit := 999999 自己放行。
  -- （即使那樣做也只是讓自己的計數跳更快，Edge Function 仍然用自己的
  --   env 值再判一次；夾住是為了讓這張表的數字保持有意義。）
  v_limit_10  := greatest(1, least(coalesce(p_limit_per_10min, 6),  30));
  v_limit_day := greatest(1, least(coalesce(p_limit_per_day,   40), 200));

  -- 視窗起點一律用 UTC，不受連線時區影響。
  v_bucket_10 := date_trunc('hour', v_now)
                 + (floor(extract(minute FROM v_now) / 10) * interval '10 minutes');
  v_bucket_day := date_trunc('day', v_now);

  -- 兩次 upsert 都會鎖住對應的那一列，直到本交易結束。
  -- 並行的呼叫者會在這裡排隊，所以不會兩個人同時讀到 count = 5 然後各自 +1。
  INSERT INTO public.task_ai_rate_limit_counters
    (user_id, bucket_type, bucket_start, request_count, updated_at)
  VALUES (v_user_id, 'per_10min', v_bucket_10, 1, v_now)
  ON CONFLICT (user_id, bucket_type, bucket_start) DO UPDATE
    SET request_count = public.task_ai_rate_limit_counters.request_count + 1,
        updated_at    = v_now
  RETURNING request_count INTO v_count_10;

  INSERT INTO public.task_ai_rate_limit_counters
    (user_id, bucket_type, bucket_start, request_count, updated_at)
  VALUES (v_user_id, 'per_day', v_bucket_day, 1, v_now)
  ON CONFLICT (user_id, bucket_type, bucket_start) DO UPDATE
    SET request_count = public.task_ai_rate_limit_counters.request_count + 1,
        updated_at    = v_now
  RETURNING request_count INTO v_count_day;

  IF v_count_10 > v_limit_10 OR v_count_day > v_limit_day THEN
    -- 超額就把剛才那兩個 +1 收回去。
    --
    -- 為什麼可以安全地退回：上面的 upsert 已經鎖住這兩列，
    -- 在本交易 commit 之前沒有別人動得了它們。
    -- 不退回的話，一個被擋下的請求仍然會把計數往上推，
    -- 於是「被擋」本身會延長封鎖時間 —— 家長狂按只會讓自己更久不能用。
    UPDATE public.task_ai_rate_limit_counters
       SET request_count = request_count - 1
     WHERE user_id = v_user_id
       AND ((bucket_type = 'per_10min' AND bucket_start = v_bucket_10)
         OR (bucket_type = 'per_day'   AND bucket_start = v_bucket_day));

    v_retry := 0;
    IF v_count_10 > v_limit_10 THEN
      v_retry := greatest(v_retry,
        ceil(extract(epoch FROM (v_bucket_10 + interval '10 minutes' - v_now)))::integer);
    END IF;
    IF v_count_day > v_limit_day THEN
      v_retry := greatest(v_retry,
        ceil(extract(epoch FROM (v_bucket_day + interval '1 day' - v_now)))::integer);
    END IF;

    -- **不回傳目前用量或上限。** 那會讓呼叫端知道怎麼剛好卡在邊界，
    -- 而家長也不需要看到這種數字。
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'RATE_LIMITED',
      'retry_after_seconds', greatest(v_retry, 1)
    );
  END IF;

  -- 順手清掉這個使用者兩天前的視窗。有界、便宜，而且不需要排 cron。
  DELETE FROM public.task_ai_rate_limit_counters
   WHERE user_id = v_user_id
     AND bucket_start < v_now - interval '2 days';

  RETURN jsonb_build_object('allowed', true);
END;
$$;

COMMENT ON FUNCTION public.consume_task_ai_recommendation_quota_v1(integer, integer) IS
  '原子地消耗一次 task-ai-recommendation 額度。使用 auth.uid()，不接受 client 指定身分。';

REVOKE ALL ON FUNCTION public.consume_task_ai_recommendation_quota_v1(integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.consume_task_ai_recommendation_quota_v1(integer, integer) TO authenticated;
