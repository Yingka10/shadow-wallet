-- staging QA 資料（§七）
-- 只在 staging 執行。不進 repo、不進 production seed。
--
-- 與 supabase/verify/real_schema_e2e.sql 的 fixture 差別：
-- 這裡的 auth.users 需要密碼與 identity，因為 §九/§十 要用真 JWT 走 PostgREST。

\set ON_ERROR_STOP on

-- psql 變數在 dollar-quoted 區塊內不會展開，先落進 temp table 再讀。
CREATE TEMP TABLE qa_secret(pw text);
INSERT INTO qa_secret VALUES (:'qapw');

DO $seed$
DECLARE
  v_pw     text;
  v_user_a uuid;
  v_user_b uuid;
  v_user_c uuid;
  v_fam_a  uuid;
  v_fam_b  uuid;
  v_child  uuid;
BEGIN
  SELECT pw INTO v_pw FROM qa_secret;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email LIKE 'qa-parent-%@example.invalid') THEN
    RAISE EXCEPTION 'QA 資料已存在，先清掉再跑';
  END IF;

  -- auth.users ------------------------------------------------------------
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  SELECT
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated', 'authenticated',
    'qa-parent-' || w || '@example.invalid',
    extensions.crypt(v_pw, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now()
  FROM unnest(ARRAY['a','b','c']) AS w;

  -- GoTrue 以非 nullable 的 Go 字串掃這幾個欄位，NULL 會讓登入回
  -- 「Database error querying schema」。手動建 user 時一定要補成空字串。
  UPDATE auth.users SET
    confirmation_token         = coalesce(confirmation_token, ''),
    recovery_token             = coalesce(recovery_token, ''),
    email_change_token_new     = coalesce(email_change_token_new, ''),
    email_change               = coalesce(email_change, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    phone_change               = coalesce(phone_change, ''),
    phone_change_token         = coalesce(phone_change_token, ''),
    reauthentication_token     = coalesce(reauthentication_token, '')
  WHERE email LIKE 'qa-parent-%@example.invalid';

  INSERT INTO auth.identities (
    id, provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  )
  SELECT
    gen_random_uuid(), u.id::text, u.id,
    jsonb_build_object('sub', u.id::text, 'email', u.email,
                       'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  FROM auth.users u
  WHERE u.email LIKE 'qa-parent-%@example.invalid';

  SELECT id INTO v_user_a FROM auth.users WHERE email = 'qa-parent-a@example.invalid';
  SELECT id INTO v_user_b FROM auth.users WHERE email = 'qa-parent-b@example.invalid';
  SELECT id INTO v_user_c FROM auth.users WHERE email = 'qa-parent-c@example.invalid';

  -- 家庭 ------------------------------------------------------------------
  INSERT INTO families (family_name, created_by) VALUES ('QA Family A', v_user_a)
    RETURNING id INTO v_fam_a;
  INSERT INTO families (family_name, created_by) VALUES ('QA Family B', v_user_c)
    RETURNING id INTO v_fam_b;

  -- 家長：A 與 B 同一家庭；C 在另一個家庭，供跨家庭拒絕測試 --------------
  INSERT INTO parents (family_id, user_id, name, email)
    VALUES (v_fam_a, v_user_a, 'QA Parent A', 'qa-parent-a@example.invalid');
  INSERT INTO parents (family_id, user_id, name, email)
    VALUES (v_fam_a, v_user_b, 'QA Parent B', 'qa-parent-b@example.invalid');
  INSERT INTO parents (family_id, user_id, name, email)
    VALUES (v_fam_b, v_user_c, 'QA Parent C', 'qa-parent-c@example.invalid');

  -- §七 要求「一位家長同時屬於第二個家庭」——真 schema 上做不到，
  -- idx_parents_user_id 是 UNIQUE。這裡把它斷言出來而不是假裝做到。
  BEGIN
    INSERT INTO parents (family_id, user_id, name)
      VALUES (v_fam_b, v_user_a, 'QA Parent A (第二家庭)');
    RAISE EXCEPTION '預期失敗卻成功：parents.user_id 應為 UNIQUE';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'OK：parents.user_id UNIQUE，一個帳號只能屬於一個家庭';
  END;

  -- 孩子（8 歲 → age_group 6-9）與錢包 ------------------------------------
  INSERT INTO children (family_id, nickname, birth_date, age_group)
    VALUES (v_fam_a, 'QA Child 8', (current_date - INTERVAL '8 years 3 months')::date, '6-9')
    RETURNING id INTO v_child;

  INSERT INTO wallets (child_id, wallet_type, balance) VALUES (v_child, 'spending', 0);

  RAISE NOTICE 'QA family A = %', v_fam_a;
  RAISE NOTICE 'QA child    = %', v_child;
END
$seed$;

DROP TABLE qa_secret;

SELECT f.family_name, p.name AS parent, p.user_id IS NOT NULL AS linked
FROM parents p JOIN families f ON f.id = p.family_id
ORDER BY f.family_name, p.name;

SELECT c.nickname, c.age_group, c.birth_date, w.wallet_type, w.balance
FROM children c JOIN wallets w ON w.child_id = c.id;
