# staging E2E — parent_custom 建立、B/A 回饋矩陣、完成、idempotency。
#
# 與 supabase/verify/parent_custom_persistence.sql 的差別是「經過哪一層」：
# 那一支直接呼叫 plpgsql，授權靠 set_config 假造；這一支經過
# GoTrue 簽出的 access token → PostgREST → RLS → RPC，
# 也就是 App 實際會走的路徑。
#
# 不用 set_config 模擬登入。不寫任何密碼進 repo。
#
# 用法（密碼與 ref 都由環境變數帶入）：
#   STAGING_REF=... FORBIDDEN_REF=... QA_PASSWORD=... \
#   SUPABASE_URL=... SUPABASE_ANON_KEY=... python parent_custom_e2e.py

import json, os, sys, urllib.request, urllib.error, uuid
from datetime import date, datetime, timezone

STAGING_REF = os.environ.get("STAGING_REF", "")
FORBIDDEN_REF = os.environ.get("FORBIDDEN_REF", "")
URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
ANON = os.environ.get("SUPABASE_ANON_KEY", "")
QAPW = os.environ.get("QA_PASSWORD", "")

if not STAGING_REF:
    sys.exit("!! 中止：必須以 STAGING_REF 指定目標，腳本不猜")
if FORBIDDEN_REF and FORBIDDEN_REF in URL:
    sys.exit("!! 中止：URL 指向被禁止的 project")
if STAGING_REF not in URL:
    sys.exit("!! 中止：URL 與 STAGING_REF 不符")
if not (ANON and QAPW):
    sys.exit("!! 中止：需要 SUPABASE_ANON_KEY 與 QA_PASSWORD")

print("目標 project ref : %s\n" % STAGING_REF)

PASS, FAIL = [], []


def check(ok, label):
    (PASS if ok else FAIL).append(label)
    print(("  ok   " if ok else "  FAIL ") + label)


def http(path, body=None, token=None, method="POST", extra=None):
    req = urllib.request.Request(URL + path, method=method)
    req.add_header("apikey", ANON)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    for k, v in (extra or {}).items():
        req.add_header(k, v)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def sign_in(who):
    st, body = http("/auth/v1/token?grant_type=password", {
        "email": "qa-parent-%s@example.invalid" % who,
        "password": QAPW,
    })
    if st != 200 or not body.get("access_token"):
        sys.exit("!! 登入失敗（%s）：HTTP %s" % (who, st))
    return body["access_token"]


def rpc(token, name, args):
    return http("/rest/v1/rpc/" + name, args, token=token)


def rest(token, path, method="GET"):
    return http("/rest/v1/" + path, None, token=token, method=method)


TODAY = date.today().isoformat()
# complete_task 的 p_completed_at 不可為 null —— task_completions 那一欄是 NOT NULL。
NOW_ISO = datetime.now(timezone.utc).isoformat()


def command(child, family, source, purpose, reward, editor="one_time",
            request=None, with_preset=None, intent=None, review_days=None, coin=None):
    use_preset = (source == "preset") if with_preset is None else with_preset
    duration = {"one_time": "one_time", "recurring": "recurring"}.get(editor, "long_term")
    completion = {
        "one_time": "complete_once", "recurring": "ongoing",
        "growth_plan": "plan_complete", "family_role": "review_and_continue",
        "short_support": "stabilize_and_exit",
    }[editor]

    schedule = {
        "mode": "one_time" if editor == "one_time" else "fixed_days",
        "startDate": TODAY, "preferredTime": "after_school",
        "reminderMode": "none", "estimatedMinutes": 20,
    }
    if editor == "one_time":
        schedule["scheduledDate"] = TODAY
    else:
        schedule["recurrenceDays"] = [1, 3, 5]

    cmd = {
        "schemaVersion": 1,
        "creationSource": source,
        "childId": child,
        "familyId": family,
        "task": {
            "title": "E2E 任務",
            "purposeCategory": purpose,
            "durationType": duration,
            "source": "parent",
            "rewardPolicy": reward,
            "completionPolicy": completion,
            "originalExpectation": "希望他能自己完成",
            "completionDescription": "做完並自己確認一次",
        },
        "schedule": schedule,
        "content": {
            "selectedOptions": {"g1": ["o1"]} if use_preset else {},
            "customOptionValues": {},
        },
        "support": {"level": "check_after"},
        "metadata": {
            "ageGroup": "6-9",
            "taskPolicyVersion": "task-taxonomy-2026-07",
            "editorKind": editor,
            "clientRequestId": request or str(uuid.uuid4()),
        },
        "reward": {"decision": {
            "rewardPolicy": reward,
            "eligibility": "allowed",
            "rewardPolicyVersion": "eligibility-policy-2026-07",
            "explanation": "E2E",
        }},
    }

    if duration == "long_term":
        end = date.fromordinal(date.today().toordinal() + 13).isoformat()
        schedule["durationDays"] = 14
        schedule["endDate"] = end
        cmd["plan"] = {
            "durationDays": 14,
            "milestones": ([{"id": "m1", "title": "第一週", "targetDay": 7}]
                           if editor == "growth_plan" else []),
            "supportSteps": ([{"id": "s1", "text": "睡前把書包放門邊"}]
                             if editor == "short_support" else []),
            "focusOptionIds": [],
        }
        cmd["review"] = {"reviewEnabled": True, "firstReviewAfterDays": 7,
                         "weekendReviewEnabled": True}
        cmd["task"]["planMode"] = editor

    if editor == "family_role":
        cmd["role"] = {
            "optionId": "role-table",
            "responsibilities": [{"id": "r1", "text": "開飯前擺好碗筷", "isCustom": False}],
            "scopeDescription": "平日晚餐",
            "exceptionDescription": "外食那天不算",
            "contributionDescription": "讓晚餐可以準時開始",
        }

    if use_preset:
        cmd["preset"] = {"familyId": "fam-e2e", "variantId": "var-e2e"}
        cmd["metadata"]["presetCatalogVersion"] = "2026-07-28"

    if reward == "coin_eligible":
        cmd["reward"]["decision"]["rewardPolicyVersion"] = "coin-policy-1.0.0"
        cmd["reward"]["decision"]["coin"] = {
            "suggestedAmount": coin or 12, "finalAmount": coin or 12,
            "minAllowed": 1, "maxAllowed": 99,
            "calculationBasis": {"ageGroup": "6-9"},
        }

    if intent:
        cmd["rewardSupport"] = {"intent": intent}
        if review_days:
            cmd["rewardSupport"]["reviewAfterDays"] = review_days

    return cmd


# ── 身分 ───────────────────────────────────────────────────────────────────
tok_a = sign_in("a")
tok_c = sign_in("c")

st, kids = rest(tok_a, "children?select=id,family_id&limit=1")
if st != 200 or not kids:
    sys.exit("!! 找不到 QA 孩子")
CHILD, FAMILY = kids[0]["id"], kids[0]["family_id"]

st, kids_c = rest(tok_c, "children?select=id&limit=1")
OTHER_CHILD = kids_c[0]["id"] if st == 200 and kids_c else None

created = []


def create(token, cmd):
    st, body = rpc(token, "create_parent_task_v1", {"p_command": cmd})
    if isinstance(body, dict) and body.get("ok") and body.get("taskId"):
        created.append(body["taskId"])
    return st, body


print("── 建立 ──")
st, r = create(tok_a, command(CHILD, FAMILY, "preset", "learning_skill", "record_only"))
check(st == 200 and r.get("ok"), "1. preset 建立仍正常")
preset_task = r.get("taskId")

for editor in ["one_time", "recurring", "growth_plan", "short_support", "family_role"]:
    purpose = ("family_participation" if editor == "family_role"
               else "life_routine" if editor == "short_support"
               else "learning_skill")
    reward = ("family_contribution" if editor == "family_role"
              else "progress_only" if editor == "short_support"
              else "record_only")
    st, r = create(tok_a, command(CHILD, FAMILY, "parent_custom", purpose, reward, editor))
    check(st == 200 and r.get("ok"), "2. parent_custom %s 建立" % editor)
    if editor == "one_time":
        custom_task = r.get("taskId")

print("\n── preset selection ──")
st, sel = rest(tok_a, "task_preset_selections?select=id&task_id=eq.%s" % custom_task)
check(st == 200 and len(sel) == 0, "3. custom 沒有 preset selection")
st, sel = rest(tok_a, "task_preset_selections?select=id&task_id=eq.%s" % preset_task)
check(st == 200 and len(sel) == 1, "3b. preset 有 1 筆 selection")

print("\n── 來源與稽核 ──")
st, rows = rest(tok_a, "tasks?select=creation_source,created_from_preset,preset_family_id"
                       "&id=in.(%s,%s)" % (preset_task, custom_task))
by_src = {row["creation_source"]: row for row in rows} if st == 200 else {}
check("parent_custom" in by_src and by_src["parent_custom"]["created_from_preset"] is False
      and by_src["parent_custom"]["preset_family_id"] is None,
      "4. audit source 正確且沒有假 preset id")

st, ev = rest(tok_a, "task_change_events?select=event_type&task_id=eq.%s" % custom_task)
check(st == 200 and any(e["event_type"] == "created_parent_custom" for e in ev),
      "4b. 稽核事件是 created_parent_custom")

print("\n── reward support metadata ──")
st, r = create(tok_a, command(CHILD, FAMILY, "parent_custom", "learning_skill",
                             "coin_eligible", intent="temporary_startup_support",
                             review_days=21, coin=12))
check(st == 200 and r.get("ok"), "5a. 暫時支持建立")
if r.get("taskId"):
    st, rows = rest(tok_a, "tasks?select=reward_support_intent,reward_support_review_after_days"
                           "&id=eq.%s" % r["taskId"])
    check(st == 200 and rows and rows[0]["reward_support_intent"] == "temporary_startup_support"
          and rows[0]["reward_support_review_after_days"] == 21,
          "5b. reward support metadata 正確")

st, r = create(tok_a, command(CHILD, FAMILY, "parent_custom", "learning_skill",
                             "coin_eligible", intent="temporary_startup_support", coin=12))
check(not r.get("ok"), "5c. 暫時支持缺回顧時間被拒")

print("\n── A / B 回饋矩陣 ──")
for reward in ["record_only", "progress_only"]:
    st, r = create(tok_a, command(CHILD, FAMILY, "parent_custom", "life_routine", reward,
                                  "recurring" if reward == "progress_only" else "one_time"))
    check(st == 200 and r.get("ok"), "6. A ＋ %s 建立" % reward)

for reward in ["family_contribution", "progress_only", "record_only"]:
    st, r = create(tok_a, command(CHILD, FAMILY, "parent_custom", "family_participation",
                                  reward, "recurring"))
    check(st == 200 and r.get("ok"), "7. B ＋ %s 建立" % reward)

st, r = create(tok_a, command(CHILD, FAMILY, "parent_custom", "family_participation",
                             "coin_eligible", "recurring",
                             intent="family_defined_agreement", coin=12))
check(not r.get("ok") and r.get("reason") == "B_COIN_POLICY_NOT_CONFIGURED",
      "8. B ＋ coin 被 B_COIN_POLICY_NOT_CONFIGURED 拒絕")

print("\n── C/D coin 與完成 ──")
st, r = create(tok_a, command(CHILD, FAMILY, "parent_custom", "autonomous_challenge",
                             "coin_eligible", coin=15))
check(st == 200 and r.get("ok"), "9a. C ＋ coin 建立")
coin_task = r.get("taskId")

st, w0 = rest(tok_a, "wallets?select=balance&child_id=eq.%s&wallet_type=eq.spending" % CHILD)
before = w0[0]["balance"] if st == 200 and w0 else None

st, done = rpc(tok_a, "complete_task", {
    "p_task_id": coin_task, "p_child_id": CHILD,
    "p_completed_at": NOW_ISO, "p_is_prerequisite_met": True})
check(st == 200 and isinstance(done, dict) and done.get("coinEarned") == 15,
      "9b. 完成依 reward_policy 發 15 幣")

st, w1 = rest(tok_a, "wallets?select=balance&child_id=eq.%s&wallet_type=eq.spending" % CHILD)
after = w1[0]["balance"] if st == 200 and w1 else None
check(before is not None and after == before + 15, "10. wallet 金額正確")

st, r = create(tok_a, command(CHILD, FAMILY, "parent_custom", "family_participation",
                             "family_contribution"))
nc_task = r.get("taskId")
st, done = rpc(tok_a, "complete_task", {
    "p_task_id": nc_task, "p_child_id": CHILD,
    "p_completed_at": NOW_ISO, "p_is_prerequisite_met": True})
st, w2 = rest(tok_a, "wallets?select=balance&child_id=eq.%s&wallet_type=eq.spending" % CHILD)
check(st == 200 and w2 and w2[0]["balance"] == after, "11. 非 coin 任務不動 wallet")

print("\n── idempotency ──")
req = str(uuid.uuid4())
st, r1 = create(tok_a, command(CHILD, FAMILY, "parent_custom", "learning_skill",
                              "record_only", request=req))
st, r2 = create(tok_a, command(CHILD, FAMILY, "parent_custom", "learning_skill",
                              "record_only", request=req))
check(r1.get("taskId") == r2.get("taskId") and r2.get("idempotentReplay") is True,
      "12a. custom 重送回同一筆")

st, r3 = create(tok_a, command(CHILD, FAMILY, "preset", "learning_skill",
                              "record_only", request=req))
check(r3.get("idempotentReplay") is True and r3.get("taskId") == r1.get("taskId"),
      "12b. 換來源重送回放原本那一筆，不建新的")

print("\n── 授權 ──")
if OTHER_CHILD:
    st, r = rpc(tok_c, "create_parent_task_v1", {
        "p_command": command(CHILD, FAMILY, "parent_custom", "learning_skill", "record_only",
                             request=req)})
    body = json.dumps(r)
    check(st >= 400 and r1.get("taskId") not in body,
          "13. 跨家庭被拒且不洩漏 task id")

st, r = http("/rest/v1/rpc/create_parent_task_v1",
             {"p_command": command(CHILD, FAMILY, "parent_custom", "learning_skill",
                                   "record_only")})
check(st in (401, 403), "14. 未登入被拒（HTTP %s）" % st)

print("\n%d passed / %d failed" % (len(PASS), len(FAIL)))
if FAIL:
    for f in FAIL:
        print("  FAILED: " + f)
    sys.exit(1)
