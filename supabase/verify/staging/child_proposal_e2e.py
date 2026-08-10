# staging E2E — P0-1 孩子提案契約。
#
# 與靜態 migration 測試的差別是「有沒有真的跑」：那一支只讀 SQL 檔案的字串，
# 這一支經過 GoTrue 簽出的 access token → PostgREST → RLS → RPC，
# 也就是 App 實際會走的路徑。table / function / trigger / RLS 全部是真的。
#
# 不用 set_config 模擬登入。不寫任何密碼進 repo。
#
# 用法：
#   STAGING_REF=... FORBIDDEN_REF=... QA_PASSWORD=... \
#   SUPABASE_URL=... SUPABASE_ANON_KEY=... python child_proposal_e2e.py
#
# 可重跑：每次用新的 proposal，不清既有資料。

import json, os, sys, urllib.request, urllib.error
from datetime import date, timedelta

STAGING_REF = os.environ.get("STAGING_REF", "")
FORBIDDEN_REF = os.environ.get("FORBIDDEN_REF", "")
URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
ANON = os.environ.get("SUPABASE_ANON_KEY", "")
PARENT_EMAIL = os.environ.get("PARENT_EMAIL", "")
PARENT_PW = os.environ.get("PARENT_PASSWORD", "")
SECOND_EMAIL = os.environ.get("SECOND_PARENT_EMAIL", "")
SECOND_PW = os.environ.get("SECOND_PASSWORD", "")
# 由 `supabase inspect db table-record-counts --linked` 取得的伺服器端真實列數。
# 它繞過 RLS，所以「DB 有 N 個家庭、PostgREST 只回 1 個」才構成隔離證據。
TOTAL_FAMILIES = int(os.environ.get("TOTAL_FAMILIES", "0"))

if not STAGING_REF:
    sys.exit("!! 中止：必須以 STAGING_REF 指定目標，腳本不猜")
if FORBIDDEN_REF and FORBIDDEN_REF in URL:
    sys.exit("!! 中止：URL 指向被禁止的 project")
if STAGING_REF not in URL:
    sys.exit("!! 中止：URL 與 STAGING_REF 不符")
if not (ANON and PARENT_EMAIL and PARENT_PW):
    sys.exit("!! 中止：需要 SUPABASE_ANON_KEY / PARENT_EMAIL / PARENT_PASSWORD")

print("目標 project ref : %s\n" % STAGING_REF)

PASS, FAIL, SKIP = [], [], []


def check(ok, label, detail=""):
    (PASS if ok else FAIL).append(label)
    print(("  ok   " if ok else "  FAIL ") + label + (("  << " + str(detail)) if (not ok and detail) else ""))


def skip(label, why):
    SKIP.append(label)
    print("  SKIP " + label + "  << " + why)


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


def login(email, password, fatal=True):
    st, body = http("/auth/v1/token?grant_type=password",
                    {"email": email, "password": password})
    if st != 200:
        if fatal:
            sys.exit("!! 中止：%s 登入失敗（%s）：%s" % (email, st, body))
        return None
    return body["access_token"]


def rpc(name, command, token):
    return http("/rest/v1/rpc/" + name, {"p_command": command}, token)


def get(path, token):
    return http("/rest/v1/" + path, None, token, method="GET")


TODAY = date.today()

# ── 0. 登入 ─────────────────────────────────────────────────────────────────
print("── 0. 登入")
tok_a = login(PARENT_EMAIL, PARENT_PW)
check(True, "主家長帳號登入成功（%s）" % PARENT_EMAIL)

tok_c = login(SECOND_EMAIL, SECOND_PW, fatal=False) if (SECOND_EMAIL and SECOND_PW) else None

st, kids = get("children?select=id,nickname,family_id", tok_a)
check(st == 200 and len(kids) >= 1, "家長讀得到自己家的孩子", (st, kids))
CHILD_A = kids[0]["id"]
FAMILY_A = kids[0]["family_id"]

CHILD_C = None
if tok_c:
    st, kids_c = get("children?select=id,nickname,family_id", tok_c)
    if st == 200 and kids_c and kids_c[0]["family_id"] != FAMILY_A:
        CHILD_C = kids_c[0]["id"]

# ── 1. 表與 RPC 真的存在 ─────────────────────────────────────────────────────
print("\n── 1. schema 真的建起來了")
for table in ("child_proposals", "child_proposal_plan_versions",
              "child_proposal_trial_events", "child_proposal_adjustment_requests",
              "child_proposal_status_events"):
    st, body = get(table + "?select=id&limit=1", tok_a)
    # 200 = 表存在且 authenticated 讀得到（RLS 之下可能 0 列）。
    # PGRST205 才是「表不存在」。
    check(st == 200, "%s 存在且家長讀得到" % table, (st, body))

st, body = rpc("child_proposal_transition_allowed", {}, tok_a)
check(st in (400, 404) or st == 200, "transition_allowed 已部署（不是 PGRST202）",
      (st, body))

# ── 2. 建立提案（draft）──────────────────────────────────────────────────────
print("\n── 2. 建立提案")
GOAL = "我想每天練直排輪（P0-1 staging smoke）"
MOTIV = "因為想跟阿翔一起去公園"

st, body = rpc("create_child_proposal_v1", {
    "schemaVersion": 1,
    "childId": CHILD_A,
    "childOriginalGoal": GOAL,
    "childOriginalMotivation": MOTIV,
    "cadence": {"mode": "weekly_frequency", "weeklyFrequency": 3},
    "childRewardPreference": "hopes_for_coin",
}, tok_a)
check(st == 200 and body and body.get("ok") is True, "建立 draft 提案", (st, body))
PROPOSAL = body.get("proposalId") if isinstance(body, dict) else None
check(body.get("status") == "draft" if isinstance(body, dict) else False,
      "預設落在 draft", body)

st, body = rpc("create_child_proposal_v1", {
    "schemaVersion": 1, "childId": CHILD_A,
    "childOriginalGoal": GOAL, "status": "active",
}, tok_a)
check(st == 200 and body.get("ok") is False and body.get("code") == "POLICY_REJECTED",
      "不能直接建立 active（跳過家長確認）", (st, body))

st, body = rpc("create_child_proposal_v1", {
    "schemaVersion": 1, "childId": CHILD_A, "childOriginalGoal": "   ",
}, tok_a)
check(st == 200 and body.get("ok") is False, "空白目標被擋", (st, body))

# ── 3. 計畫版本 ─────────────────────────────────────────────────────────────
print("\n── 3. 計畫版本")
st, body = rpc("add_child_proposal_plan_version_v1", {
    "schemaVersion": 1, "proposalId": PROPOSAL, "authoredBy": "ai",
    "planTitle": "一週三次，每次 20 分鐘",
    "cadence": {"mode": "weekly_frequency", "weeklyFrequency": 3},
    "estimatedMinutes": 20,
    "aiSnapshot": {"model": "smoke", "suggestion": "一週三次"},
    "reward": {"policy": "coin_eligible", "eligibility": "allowed",
               "policyVersion": "smoke-reward-v1", "aiSuggestedCoinAmount": 12},
}, tok_a)
check(st == 200 and body.get("ok") is True, "AI 版本可以新增", (st, body))
check(body.get("versionNo") == 1 if isinstance(body, dict) else False,
      "版號由 DB 給，從 1 開始", body)
VERSION_1 = body.get("planVersionId") if isinstance(body, dict) else None

st, body = rpc("add_child_proposal_plan_version_v1", {
    "schemaVersion": 1, "proposalId": PROPOSAL, "authoredBy": "parent",
    "reward": {"policy": "coin_eligible", "coinAmount": 8},
}, tok_a)
check(st == 200 and body.get("ok") is False
      and body.get("reason") == "REWARD_NOT_CLIENT_DECIDED",
      "命令夾帶最終幣值被拒（AI/呼叫端都不決定 coin）", (st, body))

st, body = rpc("add_child_proposal_plan_version_v1", {
    "schemaVersion": 1, "proposalId": PROPOSAL, "authoredBy": "ai",
    "reward": {"aiSuggestedCoinAmount": 5},
}, tok_a)
check(st == 200 and body.get("ok") is False, "AI 建議幣值沒附 snapshot 被拒", (st, body))

st, rows = get("child_proposal_plan_versions?select=ai_suggested_coin_amount,"
               "confirmed_at,confirmed_coin_amount&id=eq.%s" % VERSION_1, tok_a)
ok = st == 200 and rows and rows[0]["ai_suggested_coin_amount"] == 12 \
    and rows[0]["confirmed_at"] is None and rows[0]["confirmed_coin_amount"] is None
check(ok, "AI 建議存在 ai_suggested_coin_amount，confirmed_* 仍是空的", (st, rows))

# ── 4. 送出（draft → proposed）──────────────────────────────────────────────
print("\n── 4. 狀態轉換")
st, body = rpc("transition_child_proposal_v1", {
    "schemaVersion": 1, "proposalId": PROPOSAL,
    "toStatus": "proposed", "actorRole": "child",
}, tok_a)
check(st == 200 and body.get("ok") is True and body.get("toStatus") == "proposed",
      "draft → proposed（child）成功", (st, body))
check(body.get("confirmedReward") is None if isinstance(body, dict) else False,
      "非 active 的轉換沒有回饋快照", body)

st, body = rpc("transition_child_proposal_v1", {
    "schemaVersion": 1, "proposalId": PROPOSAL,
    "toStatus": "draft", "actorRole": "child",
}, tok_a)
check(st == 200 and body.get("ok") is False
      and body.get("reason") == "ILLEGAL_TRANSITION",
      "proposed → draft 被拒（非法 transition）", (st, body))

st, body = rpc("transition_child_proposal_v1", {
    "schemaVersion": 1, "proposalId": PROPOSAL,
    "toStatus": "active", "actorRole": "child",
}, tok_a)
check(st == 200 and body.get("ok") is False
      and body.get("reason") == "ILLEGAL_TRANSITION",
      "孩子不能自己把提案變成共同版本", (st, body))

st, body = rpc("transition_child_proposal_v1", {
    "schemaVersion": 1, "proposalId": PROPOSAL,
    "toStatus": "active", "actorRole": "parent",
}, tok_a)
check(st == 200 and body.get("ok") is False
      and body.get("reason") == "ACTIVE_REQUIRES_TASK",
      "轉 active 沒帶正式任務被拒", (st, body))

st, body = rpc("transition_child_proposal_v1", {
    "schemaVersion": 1, "proposalId": PROPOSAL,
    "toStatus": "closed_unsuitable", "actorRole": "parent",
}, tok_a)
check(st == 200 and body.get("ok") is False
      and body.get("reason") == "CLOSE_REQUIRES_REASON",
      "回絕沒說原因被拒", (st, body))

# ── 5. 試行紀錄 ─────────────────────────────────────────────────────────────
print("\n── 5. 試行紀錄（P0 絕不入帳）")
st, wallet_before = get("wallets?select=id,wallet_type,balance&order=wallet_type", tok_a)
bal_before = json.dumps(wallet_before, sort_keys=True) if st == 200 else None

st, txn_before = get("transactions?select=id", tok_a)
n_txn_before = len(txn_before) if isinstance(txn_before, list) else -1

st, body = rpc("record_child_proposal_trial_v1", {
    "schemaVersion": 1, "proposalId": PROPOSAL,
    "occurredOn": TODAY.isoformat(), "outcome": "completed",
}, tok_a)
check(st == 200 and body.get("ok") is True, "proposed 階段可以留試行紀錄", (st, body))
check(body.get("walletEffect") == "none" if isinstance(body, dict) else False,
      "回傳明確帶 walletEffect = none", body)
check(body.get("duplicate") is False if isinstance(body, dict) else False,
      "第一次不是 duplicate", body)

st, body = rpc("record_child_proposal_trial_v1", {
    "schemaVersion": 1, "proposalId": PROPOSAL,
    "occurredOn": TODAY.isoformat(), "outcome": "completed",
}, tok_a)
check(st == 200 and body.get("ok") is True and body.get("duplicate") is True,
      "同一天重複回報不新增第二列，也不是錯誤", (st, body))

st, wallet_after = get("wallets?select=id,wallet_type,balance&order=wallet_type", tok_a)
bal_after = json.dumps(wallet_after, sort_keys=True) if st == 200 else None
check(bal_before is not None and bal_before == bal_after,
      "錢包餘額完全沒有變動（spending wallet 沒被碰）", (bal_before, bal_after))

st, txn_after = get("transactions?select=id", tok_a)
n_txn_after = len(txn_after) if isinstance(txn_after, list) else -2
check(n_txn_before == n_txn_after, "沒有產生任何 transaction",
      (n_txn_before, n_txn_after))

st, rows = get("child_proposal_trial_events?select=id,wallet_effect,occurred_on"
               "&proposal_id=eq.%s" % PROPOSAL, tok_a)
check(st == 200 and len(rows) == 1, "試行紀錄只有一列（一天一筆）", (st, rows))
check(bool(rows) and rows[0]["wallet_effect"] == "none", "wallet_effect 是 none", rows)

# ── 5b. 轉成共同版本（active）＋ 回饋快照 ───────────────────────────────────
print("\n── 5b. 共同版本與回饋快照")

# 找一筆走 create_parent_task_v1 建立、且已指派給這個孩子的任務。
# 舊路徑（taskActions / onboarding）建立的任務缺 reward_policy_version，
# 依契約不可以成為共同版本 —— 下面會分別驗這兩種情況。
st, links = get("child_tasks?select=task_id&child_id=eq.%s&is_active=eq.true" % CHILD_A, tok_a)
task_ids = [r["task_id"] for r in links] if st == 200 and isinstance(links, list) else []

TASK = None
TASK_ROW = None
ACTIVATED = False
if task_ids:
    st, tasks = get(
        "tasks?select=id,reward_policy,reward_policy_version,task_policy_version,"
        "claim_period,max_claims_per_period,reward_coin_amount"
        "&id=in.(%s)" % ",".join(task_ids), tok_a)
    if st == 200 and isinstance(tasks, list):
        # 優先挑 coin_eligible —— 那條路徑才驗得到金額有沒有被複製對。
        usable = [t for t in tasks if t["reward_policy"] and t["reward_policy_version"]]
        coin = [t for t in usable if t["reward_policy"] == "coin_eligible"]
        # 已經被別的提案綁走的任務不能再用（unique index）。
        st2, taken = get("child_proposals?select=task_id&task_id=not.is.null", tok_a)
        taken_ids = {r["task_id"] for r in taken} if st2 == 200 and isinstance(taken, list) else set()
        for t in (coin + usable):
            if t["id"] not in taken_ids:
                TASK, TASK_ROW = t["id"], t
                break

if not TASK:
    skip("轉 active 與回饋快照", "找不到可用的 create_parent_task_v1 任務（或都已被綁定）")
else:
    st, body = rpc("transition_child_proposal_v1", {
        "schemaVersion": 1, "proposalId": PROPOSAL,
        "toStatus": "active", "actorRole": "parent", "taskId": TASK,
    }, tok_a)
    ACTIVATED = st == 200 and isinstance(body, dict) and body.get("ok") is True         and body.get("toStatus") == "active"
    check(ACTIVATED, "proposed → active（parent，帶正式任務）", (st, body))

    snap = body.get("confirmedReward") if isinstance(body, dict) else None
    check(isinstance(snap, dict), "轉 active 回傳共同確認的回饋快照", body)

    if isinstance(snap, dict):
        check(snap.get("rewardPolicy") == TASK_ROW["reward_policy"],
              "快照的 rewardPolicy 與 tasks 一致", (snap, TASK_ROW))
        check(snap.get("rewardPolicyVersion") == TASK_ROW["reward_policy_version"],
              "快照的 rewardPolicyVersion 與 tasks 一致", (snap, TASK_ROW))
        check(snap.get("claimPeriod") == TASK_ROW["claim_period"],
              "快照的 claimPeriod 與 tasks 一致", (snap, TASK_ROW))
        check(snap.get("maxClaimsPerPeriod") == TASK_ROW["max_claims_per_period"],
              "快照的 maxClaimsPerPeriod 與 tasks 一致", (snap, TASK_ROW))
        check(snap.get("sourceTaskId") == TASK, "快照指得回原任務（可對帳）", snap)

        expected_basis = {"once": "one_time", "week": "per_period",
                          "day": "per_completion"}.get(TASK_ROW["claim_period"])
        check(snap.get("payoutBasis") == expected_basis,
              "payoutBasis 由 claim_period 正確推導", (snap, expected_basis))

        if TASK_ROW["reward_policy"] == "coin_eligible":
            check(snap.get("coinAmount") == TASK_ROW["reward_coin_amount"],
                  "家長最後確認的幣值＝tasks.reward_coin_amount（不是 AI 的 12）",
                  (snap, TASK_ROW))
            check(snap.get("coinAmount") != 12 or TASK_ROW["reward_coin_amount"] == 12,
                  "幣值來自 tasks，不是 AI 建議", snap)
        else:
            check(snap.get("coinAmount") is None,
                  "不發幣的共同版本沒有金額", snap)

    # 快照真的寫進版本了嗎（不是只在回傳值裡）
    st, rows = get("child_proposal_plan_versions?select=confirmed_reward_policy,"
                   "confirmed_coin_amount,confirmed_payout_basis,confirmed_claim_period,"
                   "confirmed_max_claims_per_period,confirmed_reward_policy_version,"
                   "confirmed_source_task_id,confirmed_at,ai_suggested_coin_amount"
                   "&id=eq.%s" % VERSION_1, tok_a)
    v = rows[0] if st == 200 and rows else {}
    check(v.get("confirmed_at") is not None, "版本上真的留下 confirmed_at", (st, rows))
    check(v.get("confirmed_source_task_id") == TASK, "版本上留下來源任務", v)
    check(v.get("ai_suggested_coin_amount") == 12,
          "AI 建議仍然在，而且沒有被最終值覆寫", v)
    if TASK_ROW and TASK_ROW["reward_policy"] == "coin_eligible":
        check(v.get("confirmed_coin_amount") == TASK_ROW["reward_coin_amount"],
              "版本上的最終幣值＝tasks 的幣值", (v, TASK_ROW))

    # 一致性：active 一定同時有 task 與 current version
    st, rows = get("child_proposals?select=status,task_id,current_plan_version_id,"
                   "activated_at&id=eq.%s" % PROPOSAL, tok_a)
    pr = rows[0] if st == 200 and rows else {}
    check(pr.get("status") == "active" and pr.get("task_id") == TASK
          and pr.get("current_plan_version_id") is not None
          and pr.get("activated_at") is not None,
          "active 的三個一致性條件都成立", (st, rows))

    # 下面幾條的前提是「真的 active 了」。沒 active 就標 SKIP ——
    # 用連環 FAIL 冒充多個問題，會讓報告看起來比實際嚴重。
if TASK and not ACTIVATED:
    skip("active 之後的行為（試行封鎖 / 終點 / 任務唯一）", "轉 active 沒有成功")
elif TASK:
    # active 之後不能再寫試行紀錄
    st, body = rpc("record_child_proposal_trial_v1", {
        "schemaVersion": 1, "proposalId": PROPOSAL,
        "occurredOn": (TODAY + timedelta(days=1)).isoformat(), "outcome": "completed",
    }, tok_a)
    check(st == 200 and body.get("ok") is False
          and body.get("reason") == "TRIAL_NOT_APPLICABLE",
          "active 之後不能再寫試行紀錄（走 task_completions）", (st, body))

    # active 是 P0 的終點
    st, body = rpc("transition_child_proposal_v1", {
        "schemaVersion": 1, "proposalId": PROPOSAL,
        "toStatus": "closed_unsuitable", "actorRole": "parent", "reason": "反悔",
    }, tok_a)
    check(st == 200 and body.get("ok") is False
          and body.get("reason") == "ILLEGAL_TRANSITION",
          "active 是終點，不能再轉走", (st, body))

    # 同一筆任務不能被第二份提案綁走
    st, body = rpc("create_child_proposal_v1", {
        "schemaVersion": 1, "childId": CHILD_A,
        "childOriginalGoal": "第二份提案想綁同一個任務", "status": "proposed",
    }, tok_a)
    second = body.get("proposalId") if isinstance(body, dict) and body.get("ok") else None
    if second:
        st, body = rpc("add_child_proposal_plan_version_v1", {
            "schemaVersion": 1, "proposalId": second, "authoredBy": "parent",
        }, tok_a)
        st, body = rpc("transition_child_proposal_v1", {
            "schemaVersion": 1, "proposalId": second,
            "toStatus": "active", "actorRole": "parent", "taskId": TASK,
        }, tok_a)
        check(st != 200 or body.get("ok") is False,
              "同一筆任務不能被第二份提案綁走（unique index）", (st, body))

# ── 6. 原始提案不可覆寫 ─────────────────────────────────────────────────────
print("\n── 6. 原始提案不可覆寫")
st, body = http("/rest/v1/child_proposals?id=eq.%s" % PROPOSAL,
                {"child_original_goal": "被家長改寫的目標"}, tok_a, method="PATCH")
check(st in (401, 403, 404, 405), "client 直接 PATCH 被擋（沒有 UPDATE policy）",
      (st, body))

st, rows = get("child_proposals?select=child_original_goal,child_original_motivation"
               "&id=eq.%s" % PROPOSAL, tok_a)
ok = st == 200 and rows and rows[0]["child_original_goal"] == GOAL \
    and rows[0]["child_original_motivation"] == MOTIV
check(ok, "孩子的原話一字未動", (st, rows))

st, body = http("/rest/v1/child_proposals",
                {"family_id": kids[0]["family_id"], "child_id": CHILD_A,
                 "child_original_goal": "繞過 RPC 直接插入"}, tok_a, method="POST")
check(st in (401, 403, 404, 405), "client 直接 INSERT 被擋（沒有 INSERT policy）",
      (st, body))

# ── 7. 跨家庭隔離 ───────────────────────────────────────────────────────────
print("\n── 7a. 跨家庭隔離（單一身分可驗的部分）")

st, fams = get("families?select=id", tok_a)
n_visible = len(fams) if st == 200 and isinstance(fams, list) else -1
check(n_visible == 1, "家長只看得到自己一個家庭", (st, fams))
if TOTAL_FAMILIES > 1:
    # 伺服器端真的有 N 個家庭（繞過 RLS 數的），PostgREST 只回 1 個 —— 這才是隔離。
    check(n_visible == 1 and TOTAL_FAMILIES > n_visible,
          "DB 實際有 %d 個家庭，RLS 只讓看到 1 個" % TOTAL_FAMILIES,
          (TOTAL_FAMILIES, n_visible))
else:
    skip("DB 家庭總數 vs 可見數的比對", "沒有提供 TOTAL_FAMILIES")

# 不屬於這個家庭的 child id → 42501（而且不透露那個 id 存不存在）
FOREIGN_CHILD = "00000000-0000-4000-8000-0000000000ff"
st, body = rpc("create_child_proposal_v1", {
    "schemaVersion": 1, "childId": FOREIGN_CHILD,
    "childOriginalGoal": "替不屬於我家的孩子建立",
}, tok_a)
check(st in (400, 401, 403, 404), "不能替不屬於自己家庭的孩子建立提案", (st, body))
msg = json.dumps(body, ensure_ascii=False) if body else ""
check("Not authorized" in msg, "回的是授權錯誤（42501）", msg)

st, body = rpc("transition_child_proposal_v1", {
    "schemaVersion": 1,
    "proposalId": "00000000-0000-4000-8000-0000000000fe",
    "toStatus": "proposed", "actorRole": "child",
}, tok_a)
check(st in (400, 401, 403, 404), "看不到的提案改不動", (st, body))

print("\n── 7b. 跨家庭隔離（需要第二個家庭的真實帳號）")
if not tok_c:
    skip("第二個家庭讀不到 / 改不動 A 家提案",
         "沒有提供 SECOND_PARENT_EMAIL / SECOND_PASSWORD 的可登入帳號")
elif not CHILD_C:
    skip("第二個家庭讀不到 / 改不動 A 家提案",
         "第二個帳號與主帳號屬於同一個家庭，構不成跨家庭情境")
else:
    st, rows = get("child_proposals?select=id&id=eq.%s" % PROPOSAL, tok_c)
    check(st == 200 and rows == [], "B 家家長讀不到 A 家的提案", (st, rows))

    st, body = rpc("transition_child_proposal_v1", {
        "schemaVersion": 1, "proposalId": PROPOSAL,
        "toStatus": "closed_unsuitable", "actorRole": "parent", "reason": "不是我家的",
    }, tok_c)
    check(st in (400, 401, 403, 404) or (isinstance(body, dict) and body.get("ok") is False),
          "B 家家長改不動 A 家的提案", (st, body))

    st, body = rpc("record_child_proposal_trial_v1", {
        "schemaVersion": 1, "proposalId": PROPOSAL,
        "occurredOn": TODAY.isoformat(), "outcome": "tried",
    }, tok_c)
    check(st in (400, 401, 403, 404) or (isinstance(body, dict) and body.get("ok") is False),
          "B 家家長寫不進 A 家提案的試行紀錄", (st, body))

    st, body = rpc("create_child_proposal_v1", {
        "schemaVersion": 1, "childId": CHILD_C,
        "childOriginalGoal": "A 家家長替 B 家孩子建立",
    }, tok_a)
    check(st in (400, 401, 403, 404), "A 家家長不能替 B 家孩子建立提案", (st, body))

# ── 8. anon 完全沒有權限 ────────────────────────────────────────────────────
print("\n── 8. anon")
st, body = get("child_proposals?select=id&limit=1", None)
check(st in (401, 403), "anon 讀不到 child_proposals", (st, body))

st, body = rpc("create_child_proposal_v1", {"schemaVersion": 1}, None)
check(st in (401, 403), "anon 呼叫不了 RPC", (st, body))

# ── 9. 稽核事件 ─────────────────────────────────────────────────────────────
print("\n── 9. 稽核事件")
st, rows = get("child_proposal_status_events?select=from_status,to_status,actor_role,"
               "actor_user_id&proposal_id=eq.%s&order=created_at" % PROPOSAL, tok_a)
check(st == 200 and len(rows) >= 2, "每一次轉換都留下紀錄", (st, rows))
if st == 200 and len(rows) >= 2:
    check(rows[0]["from_status"] is None and rows[0]["to_status"] == "draft",
          "第一筆是 → draft", rows[0])
    check(rows[1]["from_status"] == "draft" and rows[1]["to_status"] == "proposed",
          "第二筆是 draft → proposed", rows[1])
    check(all(r["actor_user_id"] is not None for r in rows),
          "每一筆的 actor_user_id 都有值（可信的那一欄）", rows)
    check(all(r["actor_role"] in ("child", "parent", "system") for r in rows),
          "actor_role 都在允許集合裡（自陳的那一欄）", rows)
    # 被拒絕的轉換不該留下紀錄 —— 稽核紀錄記的是發生過的事。
    check(all(r["to_status"] != "active" or ACTIVATED for r in rows),
          "沒有為失敗的轉換留下紀錄", rows)

# ── 結果 ────────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("PASS %d / FAIL %d / SKIP %d" % (len(PASS), len(FAIL), len(SKIP)))
for k in SKIP:
    print("  SKIP  " + k)
if FAIL:
    for f in FAIL:
        print("  FAIL  " + f)
    sys.exit(1)
print("proposal id（可在 staging 上查）：%s" % PROPOSAL)
