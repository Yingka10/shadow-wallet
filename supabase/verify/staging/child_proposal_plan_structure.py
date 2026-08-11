# staging 驗證 — P0-3 計畫版本的結構化契約（migration 20260812000000）。
#
# 與 src/lib/__tests__/childProposalPlanStructureMigration.test.ts 的差別是
# 「有沒有真的跑」：那一支只讀 SQL 檔案的字串，這一支經過 GoTrue 簽出的
# access token → PostgREST → RLS → RPC，也就是 App 實際會走的路徑。
#
# 用法：
#   STAGING_REF=... FORBIDDEN_REF=... SUPABASE_URL=... SUPABASE_ANON_KEY=... \
#   PARENT_EMAIL=... PARENT_PASSWORD=... python child_proposal_plan_structure.py
#
# 預設會清掉自己建立的提案與版本（CLEANUP=0 可保留）。不碰既有資料。

import json, os, sys, urllib.request, urllib.error, uuid
from concurrent.futures import ThreadPoolExecutor

STAGING_REF = os.environ.get("STAGING_REF", "")
FORBIDDEN_REF = os.environ.get("FORBIDDEN_REF", "")
URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
ANON = os.environ.get("SUPABASE_ANON_KEY", "")
PARENT_EMAIL = os.environ.get("PARENT_EMAIL", "")
PARENT_PW = os.environ.get("PARENT_PASSWORD", "")
CLEANUP = os.environ.get("CLEANUP", "1") != "0"

if not STAGING_REF:
    sys.exit("!! 中止：必須以 STAGING_REF 指定目標，腳本不猜")
if FORBIDDEN_REF and FORBIDDEN_REF in URL:
    sys.exit("!! 中止：URL 指向被禁止的 project")
if STAGING_REF not in URL:
    sys.exit("!! 中止：URL 與 STAGING_REF 不符")
if not (ANON and PARENT_EMAIL and PARENT_PW):
    sys.exit("!! 中止：需要 SUPABASE_ANON_KEY / PARENT_EMAIL / PARENT_PASSWORD")

print("目標 project ref : %s\n" % STAGING_REF)

PASS, FAIL = [], []


def check(ok, label, detail=""):
    (PASS if ok else FAIL).append(label)
    print(("  ok   " if ok else "  FAIL ") + label
          + (("  << " + str(detail)) if (not ok and detail != "") else ""))


def http(path, body=None, token=None, method="POST"):
    req = urllib.request.Request(URL + path, method=method)
    req.add_header("apikey", ANON)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
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


def rpc(name, command, token):
    return http("/rest/v1/rpc/" + name, {"p_command": command}, token)


def get(path, token):
    return http("/rest/v1/" + path, None, token, method="GET")


# ── 0. 登入與提案 ───────────────────────────────────────────────────────────
print("── 0. 準備")
st, body = http("/auth/v1/token?grant_type=password",
                {"email": PARENT_EMAIL, "password": PARENT_PW})
if st != 200:
    sys.exit("!! 中止：登入失敗（%s）：%s" % (st, body))
TOK = body["access_token"]

st, kids = get("children?select=id,nickname&limit=1", TOK)
if st != 200 or not kids:
    sys.exit("!! 中止：讀不到孩子（%s）：%s" % (st, kids))
CHILD = kids[0]["id"]
check(True, "登入並取得孩子 %s" % CHILD)

st, body = rpc("create_child_proposal_v1", {
    "schemaVersion": 1, "childId": CHILD,
    "childOriginalGoal": "我想兩週把這本書讀完",
    "childOriginalMotivation": "因為同學說這本書很好看",
    "cadence": {"mode": "weekly_frequency", "weeklyFrequency": 4},
    "childRewardPreference": "hopes_for_coin",
}, TOK)
PROPOSAL = body.get("proposalId") if isinstance(body, dict) else None
check(st == 200 and body.get("ok") is True and PROPOSAL, "建立 demo 提案", (st, body))

st, body = rpc("transition_child_proposal_v1", {
    "schemaVersion": 1, "proposalId": PROPOSAL,
    "toStatus": "proposed", "actorRole": "child",
}, TOK)
check(st == 200 and body.get("ok") is True, "draft → proposed", (st, body))

REQUEST_ID = "cpd1:%s:staging%s" % (PROPOSAL, uuid.uuid4().hex[:12])

LEGAL = {
    "schemaVersion": 1, "proposalId": PROPOSAL, "authoredBy": "ai",
    "planTitle": "兩週閱讀挑戰",
    "planSummary": "先照你說的一週四次，每次大概十五分鐘。",
    "purposeCategory": "D",
    "completionDescription": "完成一次約定的閱讀時段",
    "progressModel": "weekly_rhythm",
    "nextStep": "選一本想看的書，閱讀約 15 分鐘",
    "cadence": {"mode": "weekly_frequency", "weeklyFrequency": 4},
    "estimatedMinutes": 15,
    "durationType": "long_term", "durationDays": 14,
    "aiRequestId": REQUEST_ID,
    "aiSnapshot": {"model": "staging-smoke", "note": "structured contract smoke"},
    "reward": {"policy": "coin_eligible", "eligibility": "allowed",
               "policyVersion": "coin-policy-1.0.0",
               "taskPolicyVersion": "task-taxonomy-2026-07"},
}

# ── B. 合法的結構化版本 ─────────────────────────────────────────────────────
print("\n── B. 合法結構化 Plan Version")
st, body = rpc("add_child_proposal_plan_version_v1", dict(LEGAL), TOK)
check(st == 200 and isinstance(body, dict) and body.get("ok") is True,
      "結構化版本寫入成功", (st, body))
VERSION = body.get("planVersionId") if isinstance(body, dict) else None
check(body.get("duplicate") is False if isinstance(body, dict) else False,
      "第一次寫入 duplicate=false", body)

st, rows = get("child_proposal_plan_versions?select=*&id=eq.%s" % VERSION, TOK)
row = rows[0] if (st == 200 and rows) else {}
for field, want in (
    ("authored_by", "ai"),
    ("purpose_category", "D"),
    ("completion_description", "完成一次約定的閱讀時段"),
    ("progress_model", "weekly_rhythm"),
    ("next_step", "選一本想看的書，閱讀約 15 分鐘"),
    ("cadence_mode", "weekly_frequency"),
    ("cadence_weekly_frequency", 4),
    ("cadence_days", None),
    ("duration_type", "long_term"),
    ("duration_days", 14),
    ("estimated_minutes", 15),
    ("start_date", None),
    ("end_date", None),
    ("confirmed_at", None),
):
    check(row.get(field, "<missing>") == want,
          "DB 欄位 %s = %r" % (field, want), row.get(field, "<missing>"))

check(row.get("ai_request_id") == REQUEST_ID, "ai_request_id 落地", row.get("ai_request_id"))

# ── B2. 非法資料必須被擋 ────────────────────────────────────────────────────
print("\n── B2. 非法資料被拒")


def illegal(label, overrides, expect_reason=None):
    cmd = dict(LEGAL)
    cmd.update(overrides)
    cmd["aiRequestId"] = "cpd1:%s:illegal%s" % (PROPOSAL, uuid.uuid4().hex[:10])
    st, body = rpc("add_child_proposal_plan_version_v1", cmd, TOK)
    rejected = st != 200 or (isinstance(body, dict) and body.get("ok") is False)
    detail = (st, body)
    if rejected and expect_reason and isinstance(body, dict):
        rejected = body.get("reason") == expect_reason
    check(rejected, label, detail)


illegal("weekly_frequency + cadence_days 被拒",
        {"cadence": {"mode": "weekly_frequency", "weeklyFrequency": 4,
                     "days": [1, 3, 5, 0]}},
        expect_reason="WEEKLY_FREQUENCY_HAS_NO_DAYS")
illegal("purpose_category 超出 A/B/C/D 被拒", {"purposeCategory": "E"})
illegal("progress_model 未知值被拒", {"progressModel": "streak"})
illegal("progress_model 沒有 long_term 證據被拒",
        {"durationType": "one_time", "durationDays": None})
illegal("completion_description 超長被拒", {"completionDescription": "讀" * 200})

st, rows = get("child_proposal_plan_versions?select=id&proposal_id=eq.%s" % PROPOSAL, TOK)
check(st == 200 and len(rows) == 1, "被拒的命令沒有留下任何列", (st, rows))

# 空白的 next_step 不是「非法」，是「沒有」——命令解析器對所有選填文字
# 一律 btrim → NULLIF，所以它會落成 NULL 而不是空字串，也不會被補上
# 一句看起來很合理的假建議。App 端根本不會送出空白（canonicalNextStep
# 驗不過就整個 key 省略），這裡驗的是 RPC 自己的防線。
blank = dict(LEGAL)
blank["nextStep"] = "   "
blank["aiRequestId"] = "cpd1:%s:blank%s" % (PROPOSAL, uuid.uuid4().hex[:10])
st, body = rpc("add_child_proposal_plan_version_v1", blank, TOK)
BLANK_VERSION = body.get("planVersionId") if isinstance(body, dict) else None
check(st == 200 and isinstance(body, dict) and body.get("ok") is True,
      "空白 next_step 不算非法（缺就是缺）", (st, body))
st, rows = get("child_proposal_plan_versions?select=next_step&id=eq.%s" % BLANK_VERSION, TOK)
check(st == 200 and rows and rows[0]["next_step"] is None,
      "空白 next_step 落成 NULL，不是空字串、也沒有被補上假內容",
      (st, rows))

# ── C. 冪等 ─────────────────────────────────────────────────────────────────
print("\n── C. 冪等")
st, body = rpc("add_child_proposal_plan_version_v1", dict(LEGAL), TOK)
check(st == 200 and isinstance(body, dict) and body.get("ok") is True
      and body.get("duplicate") is True,
      "同 key 第二次 → ok=true, duplicate=true", (st, body))
check(body.get("planVersionId") == VERSION if isinstance(body, dict) else False,
      "回的是既有那一版的 id", body)

CONCURRENT_ID = "cpd1:%s:race%s" % (PROPOSAL, uuid.uuid4().hex[:10])


def fire(_):
    cmd = dict(LEGAL)
    cmd["aiRequestId"] = CONCURRENT_ID
    cmd["planTitle"] = "併發測試"
    return rpc("add_child_proposal_plan_version_v1", cmd, TOK)


with ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(fire, range(4)))

oks = [b for (s, b) in results if s == 200 and isinstance(b, dict) and b.get("ok") is True]
ids = {b.get("planVersionId") for b in oks}
check(len(oks) == 4, "四個併發請求都拿到 ok=true（碰撞不是失敗）",
      [(s, b) for (s, b) in results if not (s == 200 and isinstance(b, dict) and b.get("ok"))])
check(len(ids) == 1, "四個請求指向同一版", ids)

st, rows = get("child_proposal_plan_versions?select=id&proposal_id=eq.%s"
               "&ai_request_id=eq.%s" % (PROPOSAL, CONCURRENT_ID), TOK)
check(st == 200 and len(rows) == 1, "DB 只留下一列", (st, rows))

# ── D. 提案本身沒有被 AI 動到 ──────────────────────────────────────────────
print("\n── D. 孩子的原話是權威")
st, rows = get("child_proposals?select=status,child_original_goal,child_original_motivation,"
               "cadence_mode,cadence_weekly_frequency,cadence_days&id=eq.%s" % PROPOSAL, TOK)
p = rows[0] if (st == 200 and rows) else {}
check(p.get("status") == "proposed", "提案仍是 proposed", p.get("status"))
check(p.get("child_original_goal") == "我想兩週把這本書讀完", "原始目標未被覆寫", p.get("child_original_goal"))
check(p.get("child_original_motivation") == "因為同學說這本書很好看", "原始動機未被覆寫", p.get("child_original_motivation"))
check(p.get("cadence_mode") == "weekly_frequency" and p.get("cadence_weekly_frequency") == 4
      and p.get("cadence_days") is None, "孩子的節奏維持一週 4 次、日期彈性", p)

# ── 清理 ────────────────────────────────────────────────────────────────────
if CLEANUP and PROPOSAL:
    print("\n── 清理")
    # 版本沒有 DELETE policy（append-only），提案本身也一樣 —— 這裡只回報，
    # 實際刪除由執行者用 service role / SQL 完成。
    print("  待清理 proposal_id = %s" % PROPOSAL)

print("\n通過 %d／失敗 %d" % (len(PASS), len(FAIL)))
if PROPOSAL:
    print("PROPOSAL_ID=%s" % PROPOSAL)
sys.exit(1 if FAIL else 0)
