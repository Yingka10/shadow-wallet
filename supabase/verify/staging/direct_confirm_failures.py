# staging 驗收 — P0-5A 的失敗路徑與原子性。
#
# 這一支專門驗「不該成功的時候」。與 vertical slice 分開的理由是：
# 這裡刻意送壞資料，手工組 plan version 是正確做法（要控制哪一欄是壞的），
# 而 golden path 一定要用真的 Gemini 計畫。
#
# 每一個案例都驗兩件事：回的是不是 typed failure、以及**有沒有留下半套資料**。
#
# 用法：
#   STAGING_REF=... FORBIDDEN_REF=... SUPABASE_URL=... SUPABASE_ANON_KEY=... \
#   PARENT_EMAIL=... PARENT_PASSWORD=... python direct_confirm_failures.py

import json, os, sys, urllib.request, urllib.error, uuid

STAGING_REF = os.environ.get("STAGING_REF", "")
FORBIDDEN_REF = os.environ.get("FORBIDDEN_REF", "")
URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
ANON = os.environ.get("SUPABASE_ANON_KEY", "")
PARENT_EMAIL = os.environ.get("PARENT_EMAIL", "")
PARENT_PW = os.environ.get("PARENT_PASSWORD", "")

if not STAGING_REF:
    sys.exit("!! 中止：必須以 STAGING_REF 指定目標，腳本不猜")
if FORBIDDEN_REF and FORBIDDEN_REF in URL:
    sys.exit("!! 中止：URL 指向被禁止的 project")
if STAGING_REF not in URL:
    sys.exit("!! 中止：URL 與 STAGING_REF 不符")

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


st, body = http("/auth/v1/token?grant_type=password",
                {"email": PARENT_EMAIL, "password": PARENT_PW})
if st != 200:
    sys.exit("!! 中止：登入失敗（%s）：%s" % (st, body))
TOK = body["access_token"]

st, kids = get("children?select=id&limit=1", TOK)
CHILD = kids[0]["id"]


def world():
    """所有可能被寫壞的東西，一次抓完。"""
    out = {}
    for name, path in (
        ("tasks", "tasks?select=id"),
        ("child_tasks", "child_tasks?select=id"),
        ("goals", "long_term_goals?select=id"),
        ("versions", "child_proposal_plan_versions?select=id"),
    ):
        s, rows = get(path, TOK)
        out[name] = len(rows) if s == 200 and isinstance(rows, list) else -1
    return out


def new_proposal(goal="我想兩週把這本書讀完"):
    s, b = rpc("create_child_proposal_v1", {
        "schemaVersion": 1, "childId": CHILD,
        "childOriginalGoal": goal,
        "childOriginalMotivation": "因為同學說這本書很好看",
        "cadence": {"mode": "weekly_frequency", "weeklyFrequency": 4},
        "childRewardPreference": "hopes_for_coin",
    }, TOK)
    pid = b.get("proposalId")
    rpc("transition_child_proposal_v1", {
        "schemaVersion": 1, "proposalId": pid,
        "toStatus": "proposed", "actorRole": "child",
    }, TOK)
    return pid


def add_ai_version(pid, **overrides):
    cmd = {
        "schemaVersion": 1, "proposalId": pid, "authoredBy": "ai",
        "planTitle": "兩週閱讀挑戰",
        "planSummary": "用每週節奏累積閱讀投入",
        "purposeCategory": "D",
        "completionDescription": "完成一次約定的閱讀時段",
        "progressModel": "weekly_rhythm",
        "nextStep": "拿出一本想讀的書，先閱讀約 15 分鐘",
        "cadence": {"mode": "weekly_frequency", "weeklyFrequency": 4},
        "estimatedMinutes": 15,
        "durationType": "long_term", "durationDays": 14,
        "reward": {"policy": "coin_eligible", "eligibility": "allowed",
                   "policyVersion": "coin-policy-1.0.0",
                   "aiSuggestedCoinAmount": 10},
        "taskPolicyVersion": "task-taxonomy-2026-07",
        "aiSnapshot": {"source": "P0-5A-failure-suite"},
        "aiModel": "staging-failure-suite",
        "aiRequestId": "p05afail:" + uuid.uuid4().hex,
    }
    cmd.update(overrides)
    s, b = rpc("add_child_proposal_plan_version_v1", cmd, TOK)
    return b.get("planVersionId") if isinstance(b, dict) else None


CREATED = []

# ── A. stale expectedPlanVersionId ──────────────────────────────────────────
print("── A. stale expectedPlanVersionId")
before = world()
pid = new_proposal(); CREATED.append(pid)
add_ai_version(pid)
st, b = rpc("confirm_child_proposal_v1", {
    "schemaVersion": 1, "proposalId": pid,
    "expectedPlanVersionId": str(uuid.uuid4()),
}, TOK)
check(st == 200 and isinstance(b, dict) and b.get("ok") is False
      and b.get("reason") == "STALE_PLAN_VERSION",
      "指向不存在的版本 → STALE_PLAN_VERSION", (st, b))
check(world() == before | {"versions": before["versions"] + 1},
      "除了那一版 AI 計畫，什麼都沒被寫出來", (before, world()))

st, p = get("child_proposals?select=status,task_id&id=eq.%s" % pid, TOK)
check(p[0]["status"] == "proposed" and p[0]["task_id"] is None,
      "提案仍是 proposed，沒有 task", p)

# ── A2. 用「上一版」確認（真正的 stale：版本被取代了）────────────────────────
print("\n── A2. 版本被取代之後拿舊 id 確認")
old_version = add_ai_version(pid)          # 變成 current
new_version = add_ai_version(pid)          # 再一版，old 就過期了
before = world()
st, b = rpc("confirm_child_proposal_v1", {
    "schemaVersion": 1, "proposalId": pid, "expectedPlanVersionId": old_version,
}, TOK)
check(st == 200 and isinstance(b, dict) and b.get("ok") is False
      and b.get("reason") == "STALE_PLAN_VERSION",
      "拿被取代的版本確認 → STALE_PLAN_VERSION", (st, b))
check(world() == before, "零寫入", (before, world()))

# ── B. 跨家庭呼叫 ───────────────────────────────────────────────────────────
print("\n── B. 跨家庭")
before = world()
st, b = rpc("confirm_child_proposal_v1", {
    "schemaVersion": 1, "proposalId": str(uuid.uuid4()),
    "expectedPlanVersionId": str(uuid.uuid4()),
}, TOK)
# 看不到的提案與別人家的提案回同一個錯 —— 分開會變成 id 的列舉工具。
check(st != 200 or (isinstance(b, dict) and b.get("ok") is False),
      "看不見的提案被拒（與跨家庭同一個錯誤）", (st, b))
check(world() == before, "零寫入", (before, world()))

# ── C. 計畫版本不完整 ───────────────────────────────────────────────────────
print("\n── C. 不完整的計畫版本")
pid_c = new_proposal(); CREATED.append(pid_c)
# 缺 nextStep：結構化契約不完整，不該變成正式任務。
bad = add_ai_version(pid_c, nextStep=None)
before = world()
st, b = rpc("confirm_child_proposal_v1", {
    "schemaVersion": 1, "proposalId": pid_c, "expectedPlanVersionId": bad,
}, TOK)
check(st == 200 and isinstance(b, dict) and b.get("ok") is False,
      "不完整的版本無法確認", (st, b))
check(b.get("reason") in ("PLAN_NOT_CONFIRMABLE", "WEEKLY_RHYTHM_INVALID")
      if isinstance(b, dict) else False,
      "回的是 typed failure，不是裸例外", b)
check(world() == before, "零 canonical task／零 child_task／零 long_term_goal",
      (before, world()))
st, p = get("child_proposals?select=status&id=eq.%s" % pid_c, TOK)
check(p[0]["status"] == "proposed", "提案仍是 proposed", p)

# ── D. 幣值與現行政策不符 ───────────────────────────────────────────────────
print("\n── D. 建議幣值與現行政策不符")
pid_d = new_proposal(); CREATED.append(pid_d)
# 政策算出來是 10；宣稱 999 代表家長看到的畫面與現行政策已經對不上。
bad_reward = add_ai_version(pid_d, reward={
    "policy": "coin_eligible", "eligibility": "allowed",
    "policyVersion": "coin-policy-1.0.0", "aiSuggestedCoinAmount": 999,
})
before = world()
st, b = rpc("confirm_child_proposal_v1", {
    "schemaVersion": 1, "proposalId": pid_d, "expectedPlanVersionId": bad_reward,
}, TOK)
check(st == 200 and isinstance(b, dict) and b.get("ok") is False,
      "幣值對不上時不建立正式任務", (st, b))
check(b.get("reason") == "POLICY_CHANGED" if isinstance(b, dict) else False,
      "回的是 POLICY_CHANGED", b)
check(world() == before, "零寫入", (before, world()))

print("\n通過 %d／失敗 %d" % (len(PASS), len(FAIL)))
print("CREATED_PROPOSALS=%s" % ",".join(CREATED))
sys.exit(1 if FAIL else 0)
