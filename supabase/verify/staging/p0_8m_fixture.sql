-- P0-8M staging acceptance — 隔離 fixture。
--
-- 為什麼要自己開一個家庭，而不是沿用既有的孩子：
-- P0-8M 的驗收本身是破壞性的（會建立 / 關閉 / 重放大量提案與正式任務），
-- 而 staging 上唯一的正式資料是 P0-10A 的 Demo State A。拿 Demo Family 來跑
-- 等於用簡報用的資料當測試場，跑完就算「清乾淨」也已經動過 activated_at、
-- version_no 這類單調遞增的東西。所以這裡開一個只屬於這次驗收的家庭。
--
-- 密碼由執行端以 __P0_8M_PASSWORD__ 佔位符替換，不進 git。
--
-- 跑法：
--   python -c "…替換佔位符…" > run.sql && supabase db query --linked -f run.sql
--   驗完務必跑 p0_8m_cleanup.sql。

DO $fixture$
DECLARE
  v_pw       text := '__P0_8M_PASSWORD__';
  v_email    text := 'p0-8m-verify@example.invalid';
  v_user     uuid;
  v_family   uuid;
  v_child    uuid;
BEGIN
  IF v_pw = '__P0_8M_' || 'PASSWORD__' OR length(btrim(v_pw)) < 6 THEN
    RAISE EXCEPTION '密碼佔位符沒有被替換，或密碼太短';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
    RAISE EXCEPTION 'P0-8M fixture 已存在，先跑 p0_8m_cleanup.sql';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
    'authenticated', 'authenticated', v_email,
    extensions.crypt(v_pw, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ) RETURNING id INTO v_user;

  -- GoTrue 以非 nullable 的 Go 字串掃這幾欄，NULL 會讓登入回
  -- 「Database error querying schema」。手建 user 一定要補成空字串。
  UPDATE auth.users SET
    confirmation_token         = coalesce(confirmation_token, ''),
    recovery_token             = coalesce(recovery_token, ''),
    email_change_token_new     = coalesce(email_change_token_new, ''),
    email_change               = coalesce(email_change, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    phone_change               = coalesce(phone_change, ''),
    phone_change_token         = coalesce(phone_change_token, ''),
    reauthentication_token     = coalesce(reauthentication_token, '')
  WHERE id = v_user;

  INSERT INTO auth.identities (
    id, provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_user::text, v_user,
    jsonb_build_object('sub', v_user::text, 'email', v_email,
                       'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  INSERT INTO families (family_name, created_by)
    VALUES ('P0-8M Verify Family', v_user) RETURNING id INTO v_family;

  INSERT INTO parents (family_id, user_id, name, email)
    VALUES (v_family, v_user, 'P0-8M Verify Parent', v_email);

  INSERT INTO children (family_id, nickname, birth_date, age_group)
    VALUES (v_family, 'P0-8M Kid',
            (current_date - INTERVAL '8 years 2 months')::date, '6-9')
    RETURNING id INTO v_child;

  INSERT INTO wallets (child_id, wallet_type, balance)
    VALUES (v_child, 'spending', 0);

  RAISE NOTICE 'P0-8M family = %  child = %  user = %', v_family, v_child, v_user;
END
$fixture$;
