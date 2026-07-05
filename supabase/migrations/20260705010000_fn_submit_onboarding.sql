-- P1-5 (data layer): atomic onboarding + fix dropped childPin.
--
-- Replaces the 5-step JS sequence in onboarding.ts submitOnboarding()
-- (families → parents → children → child_profiles → wallets), which had two
-- bugs (AUDIT 2-1):
--   1. [high] childPin was accepted by the input type but never written —
--      OnboardingInput.childPin was destructured out and dropped before the
--      children insert, so the PIN the parent set during onboarding was
--      silently discarded.
--   2. [med] no transaction — a failure partway through (e.g. wallet insert
--      fails) left an orphaned family/parent/child with no way to retry
--      cleanly (retrying re-creates a second family under the same account).
--
-- This function fixes both: pin_code is now part of the insert, and the whole
-- sequence is one plpgsql function = one transaction (mirrors setup_child_tasks).
--
-- Authorization: takes no user_id/family_id param — it always uses auth.uid()
-- for the parent row, so there is no way for a caller to onboard on behalf of
-- someone else. A duplicate-onboarding guard rejects if this auth user already
-- has a parent row (defends against retry-after-partial-success creating a
-- second family, now moot since this is atomic, but also guards true re-submits).

CREATE OR REPLACE FUNCTION submit_onboarding(
  p_family_name        text,
  p_parent_name        text,
  p_baumrind_type      text,
  p_child_nickname     text,
  p_child_birth_date   date,
  p_child_age_group    text,
  p_child_account_type text,
  p_child_pin          text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id uuid;
  v_child_id  uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM parents WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'This account has already completed onboarding' USING ERRCODE = '23505';
  END IF;

  INSERT INTO families (family_name)
  VALUES (p_family_name)
  RETURNING id INTO v_family_id;

  INSERT INTO parents (family_id, user_id, name, baumrind_type)
  VALUES (v_family_id, auth.uid(), p_parent_name, p_baumrind_type);

  INSERT INTO children (family_id, nickname, birth_date, age_group, account_type, pin_code)
  VALUES (v_family_id, p_child_nickname, p_child_birth_date, p_child_age_group, p_child_account_type, p_child_pin)
  RETURNING id INTO v_child_id;

  INSERT INTO child_profiles (child_id, motivation_level)
  VALUES (v_child_id, 'external');

  INSERT INTO wallets (child_id, wallet_type, balance)
  VALUES (v_child_id, 'spending', 0);

  IF p_child_account_type = 'DOUBLE' THEN
    INSERT INTO wallets (child_id, wallet_type, balance)
    VALUES (v_child_id, 'saving', 0);
  END IF;

  RETURN jsonb_build_object('familyId', v_family_id, 'childId', v_child_id);
END;
$$;
