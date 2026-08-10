# staging E2E（§九 建立 / §十 idempotency）—— 走 PostgREST，用真 JWT。
#
# 與 supabase/verify/real_schema_e2e.sql 的差別是「經過哪一層」：
# 那一支直接呼叫 plpgsql，授權靠 set_config 假造；這一支經過
# GoTrue 簽出的 access token → PostgREST → RLS → RPC，
# 也就是 App 實際會走的路徑。

import json, os, re, sys, urllib.request, urllib.error, uuid
from datetime import date, timedelta

ROOT = r"c:\Users\jenny\app\shadow-wallet"
STAGING_REF = os.environ.get("STAGING_REF", "")
FORBIDDEN_REF = os.environ.get("FORBIDDEN_REF", "")

# ── 環境 ───────────────────────────────────────────────────────────────────
env = {}
with open(os.path.join(ROOT, ".env.local"), encoding="utf-8") as fh:
    for line in fh:
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"')

URL = env["EXPO_PUBLIC_SUPABASE_URL"]
ANON = env["EXPO_PUBLIC_SUPABASE_ANON_KEY"]

if not STAGING_REF:
    sys.exit("!! 中止：必須以 STAGING_REF 指定目標，腳本不猜")
if FORBIDDEN_REF and FORBIDDEN_REF in URL:
    sys.exit("!! 中止：URL 指向被禁止的 project")
if STAGING_REF not in URL:
    sys.exit("!! 中止：URL 與 STAGING_REF 不符")
print(f"目標 project ref : {STAGING_REF}")
print(f"目標 URL         : {URL}\n")

QAPW = os.environ.get("QA_PASSWORD", "")
if not QAPW:
    sys.exit("!! 中止：需要 QA_PASSWORD（QA 帳號密碼，不寫進 repo）")
OUT = os.environ.get("QA_OUT", "")

# ── HTTP ───────────────────────────────────────────────────────────────────
def call(path, body=None, token=None, method="POST", apikey=ANON):
    req = urllib.request.Request(URL + path, method=method)
    req.add_header("apikey", apikey)
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data) as r:
            return r.status, json.loads(r.read().decode() or "null")
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, {"raw": raw}

def login(who):
    st, d = call("/auth/v1/token?grant_type=password",
                 {"email": f"qa-parent-{who}@example.invalid", "password": QAPW})
    assert st == 200 and d.get("access_token"), f"登入失敗 {who}: {st} {d}"
    return d["access_token"]

def rpc(token, cmd):
    return call("/rest/v1/rpc/create_parent_task_v1", {"p_command": cmd}, token)

def rest(token, path):
    return call("/rest/v1/" + path, None, token, method="GET")

# ── 斷言 ───────────────────────────────────────────────────────────────────
PASS = 0
FAILED = []
def ok(cond, label):
    global PASS
    if cond:
        PASS += 1
        print(f"  ok   {label}")
    else:
        FAILED.append(label)
        print(f"  FAIL {label}")

# ── 命令樣板（對應 mapTaskDraftToCommand 的輸出）─────────────────────────
TODAY = date.today().isoformat()

def cmd(child, family, title, editor, purpose, duration, plan_mode,
        reward, completion, schedule_mode, decision, request_id, extra=None):
    c = {
        "schemaVersion": 1,
        "childId": child,
        "familyId": family,
        "preset": {"familyId": "qa-preset", "variantId": "qa-variant"},
        "task": {
            "title": title,
            "purposeCategory": purpose,
            "durationType": duration,
            "planMode": plan_mode,
            "source": "co_created",
            "rewardPolicy": reward,
            "completionPolicy": completion,
            "originalExpectation": "QA 期待",
            "completionDescription": "QA 完成標準",
        },
        "schedule": {
            "mode": schedule_mode,
            "startDate": TODAY,
            "scheduledDate": TODAY if schedule_mode == "one_time" else None,
            "recurrenceDays": [1, 3, 5] if schedule_mode == "fixed_days" else [],
            "weeklyFrequency": 3 if schedule_mode == "weekly_frequency" else None,
            "preferredTime": "after_school",
            "estimatedMinutes": 20,
            "reminderMode": "none",
        },
        "content": {"selectedOptions": {"qa_group": ["qa_option"]}, "customOptionValues": {}},
        "review": {"reviewEnabled": True, "firstReviewAfterDays": 7},
        "reward": {"decision": decision},
        "metadata": {
            "ageGroup": "6-9",
            "createdFromPreset": True,
            "taskPolicyVersion": "task-taxonomy-2026-07",
            "presetCatalogVersion": "2026-07-28",
            "editorKind": editor,
            "clientRequestId": request_id,
        },
    }
    if extra:
        c.update(extra)
    return c

def longterm(c, days):
    c["schedule"]["endDate"] = (date.today() + timedelta(days=days - 1)).isoformat()
    c["schedule"]["durationDays"] = days
    c["plan"] = {"durationDays": days, "milestones": [],
                 "supportSteps": [], "focusOptionIds": []}
    return c

def coin(final, lo, hi):
    return {
        "rewardPolicy": "coin_eligible", "eligibility": "allowed",
        "rewardPolicyVersion": "coin-policy-1.0.0",
        "explanation": "6-9 歲段、D 類、每次約 20 分鐘",
        "coin": {"suggestedAmount": final, "finalAmount": final,
                 "minAllowed": lo, "maxAllowed": hi,
                 "calculationBasis": {"ageGroup": "6-9", "purposeCategory": "learning_skill",
                                      "estimatedMinutes": 20, "durationType": "long_term",
                                      "scheduleMode": "fixed_days",
                                      "difficulty": "standard", "band": "11-20"}},
    }

def plain(policy):
    return {"rewardPolicy": policy, "eligibility": "allowed", "coin": None,
            "rewardPolicyVersion": "reward-eligibility-2026-07", "explanation": "不發成長幣"}

# ── 開始 ───────────────────────────────────────────────────────────────────
tok_a, tok_b, tok_c = login("a"), login("b"), login("c")
print("三個 QA 家長都拿到 access token\n")

st, kids = rest(tok_a, "children?select=id,family_id,nickname")
ok(st == 200 and len(kids) == 1, f"RLS：家長 A 只看得到自己家庭的孩子（看到 {len(kids) if st==200 else '?'} 個）")
CHILD = kids[0]["id"]
FAMILY = kids[0]["family_id"]

st, kids_c = rest(tok_c, "children?select=id")
ok(st == 200 and len(kids_c) == 0, "RLS：家長 C（另一個家庭）看不到 A 家的孩子")

created = {}

print("\n── §九 五種任務建立（PostgREST）")

# A. 單次｜record_only
req_a = str(uuid.uuid4())
st, r = rpc(tok_a, cmd(CHILD, FAMILY, "QA 完成一項學校作業", "one_time", "learning_skill",
                       "one_time", None, "record_only", "complete_once", "one_time",
                       plain("record_only"), req_a))
ok(st == 200 and r.get("ok") is True, f"A. 單次任務建立成功（HTTP {st} / {r.get('message') or r}）")
created["once"] = r.get("taskId")

# B. 固定任務｜family_contribution
st, r = rpc(tok_a, cmd(CHILD, FAMILY, "QA 用餐前準備餐桌", "recurring", "family_participation",
                       "recurring", None, "family_contribution", "ongoing", "fixed_days",
                       plain("family_contribution"), str(uuid.uuid4())))
ok(st == 200 and r.get("ok") is True, f"B. 固定任務建立成功（HTTP {st} / {r.get('message') or r}）")
created["recurring"] = r.get("taskId")

# C. 成長計畫｜coin_eligible
st, r = rpc(tok_a, longterm(cmd(CHILD, FAMILY, "QA 四週閱讀計畫", "growth_plan", "learning_skill",
                                "long_term", "growth_plan", "coin_eligible", "plan_complete",
                                "fixed_days", coin(12, 5, 25), str(uuid.uuid4())), 28))
ok(st == 200 and r.get("ok") is True, f"C. 成長計畫建立成功（HTTP {st} / {r.get('message') or r}）")
created["growth"] = r.get("taskId")

# D. 短期支援｜progress_only
st, r = rpc(tok_a, longterm(cmd(CHILD, FAMILY, "QA 整理書包 14 天", "short_support", "life_routine",
                                "long_term", "short_support", "progress_only",
                                "stabilize_and_exit", "fixed_days",
                                plain("progress_only"), str(uuid.uuid4())), 14))
ok(st == 200 and r.get("ok") is True, f"D. 短期支援建立成功（HTTP {st} / {r.get('message') or r}）")
created["support"] = r.get("taskId")

# E. 家庭角色｜family_contribution ── 這一種在修正前於正式 schema 上建不出來
role_extra = {"role": {
    "optionId": "table_helper",
    "responsibilities": [{"id": "r1", "text": "開飯前擺好碗筷", "isCustom": False},
                         {"id": "r2", "text": "飯後把自己的碗拿到水槽", "isCustom": False}],
    "scopeDescription": "QA 負責範圍",
    "exceptionDescription": "QA 可跳過情況",
    "contributionDescription": "QA 貢獻紀錄"}}
st, r = rpc(tok_a, longterm(cmd(CHILD, FAMILY, "QA 四週餐桌小幫手", "family_role",
                                "family_participation", "long_term", "family_role",
                                "family_contribution", "review_and_continue", "fixed_days",
                                plain("family_contribution"), str(uuid.uuid4()),
                                extra=role_extra), 28))
ok(st == 200 and r.get("ok") is True, f"E. 家庭角色建立成功（HTTP {st} / {r.get('message') or r}）")
created["role"] = r.get("taskId")

print("\n── 建立結果經 PostgREST 讀回（RLS 之下）")
ids = ",".join(t for t in created.values() if t)
st, rows = rest(tok_a, f"tasks?select=id,name,duration_type,reward_policy,reward_coin_amount,"
                       f"base_time_min,claim_period,category,plan_mode,long_term_type"
                       f"&id=in.({ids})")
ok(st == 200 and len(rows) == 5, f"五筆都讀得回來（{len(rows) if st==200 else st}）")
by_id = {r["id"]: r for r in rows} if st == 200 else {}

t = by_id.get(created["once"], {})
ok(t.get("reward_policy") == "record_only" and t.get("reward_coin_amount") is None
   and t.get("claim_period") == "once", "A1. 單次：record_only、無幣值、claim once")

t = by_id.get(created["recurring"], {})
ok(t.get("category") == "B" and t.get("reward_policy") == "family_contribution"
   and t.get("reward_coin_amount") is None, "B1. 固定：B 類、家庭貢獻、無幣值")

t = by_id.get(created["growth"], {})
ok(t.get("reward_coin_amount") == 12 and t.get("base_time_min") == 0,
   f"C1. 成長計畫：幣值 12、base_time_min 為 0（實際 {t.get('reward_coin_amount')} / {t.get('base_time_min')}）")

t = by_id.get(created["role"], {})
ok(t.get("long_term_type") == "responsibility",
   f"E1. 家庭角色 long_term_type = responsibility（實際 {t.get('long_term_type')}）")

st, goals = rest(tok_a, f"long_term_goals?select=task_id,goal_type,total_days,status,role_title"
                        f"&task_id=in.({ids})")
g = {x["task_id"]: x for x in goals} if st == 200 else {}
ok(g.get(created["growth"], {}).get("goal_type") == "skill", "C2. long_term_goals：成長計畫 → skill")
ok(g.get(created["support"], {}).get("total_days") == 14, "D1. 短期支援：14 天")
ok(g.get(created["role"], {}).get("role_title") == "table_helper", "E2. long_term_goals 記下角色")

print("\n── §十 idempotency（PostgREST 層）")

req_x = str(uuid.uuid4())
base = lambda: cmd(CHILD, FAMILY, "QA idempotency 測試", "recurring", "family_participation",
                   "recurring", None, "family_contribution", "ongoing", "fixed_days",
                   plain("family_contribution"), req_x)

st1, r1 = rpc(tok_a, base())
ok(st1 == 200 and r1.get("ok") is True, f"1. 首次送出成功（{r1.get('message') or ''}）")
ok(r1.get("idempotentReplay") in (False, None), "2. 首次不是 replay")

st2, r2 = rpc(tok_a, base())
ok(st2 == 200 and r2.get("ok") is True, "3. 同一個 clientRequestId 再送一次仍回成功")
ok(r2.get("taskId") == r1.get("taskId"), "4. 回傳同一個 taskId")
ok(r2.get("idempotentReplay") is True, f"5. 標記為 idempotentReplay（實際 {r2.get('idempotentReplay')}）")

st, rows = rest(tok_a, f"tasks?select=id&creation_request_id=eq.{req_x}")
ok(st == 200 and len(rows) == 1, f"6. 資料庫只有一筆（{len(rows) if st==200 else st}）")

st3, r3 = rpc(tok_b, base())
ok(st3 == 200 and r3.get("taskId") == r1.get("taskId"),
   "7. 同家庭的另一位家長重送同一個識別碼 → 拿到同一筆，不會重複建立")

st4, r4 = rpc(tok_c, base())
leaked = isinstance(r4, dict) and r4.get("taskId") == r1.get("taskId")
ok(not leaked and st4 in (403, 401) or (st4 == 200 and r4.get("ok") is False),
   f"8. 另一個家庭猜中識別碼 → 被拒（HTTP {st4}）")
ok(not leaked, "9. 且沒有洩漏原本的 taskId")

st5, r5 = call("/rest/v1/rpc/create_parent_task_v1", {"p_command": base()}, None)
ok(st5 in (401, 403) or (st5 == 200 and r5.get("ok") is False),
   f"10. 未登入呼叫被拒（HTTP {st5}）")

st, rows = rest(tok_a, f"tasks?select=id&creation_request_id=eq.{req_x}")
ok(st == 200 and len(rows) == 1, "11. 上述嘗試之後仍然只有一筆")

# 換一個識別碼要建出新的一筆
st6, r6 = rpc(tok_a, cmd(CHILD, FAMILY, "QA idempotency 測試", "recurring",
                         "family_participation", "recurring", None, "family_contribution",
                         "ongoing", "fixed_days", plain("family_contribution"), str(uuid.uuid4())))
ok(st6 == 200 and r6.get("ok") is True and r6.get("taskId") != r1.get("taskId"),
   "12. 換新的 clientRequestId → 建出不同的任務")

# 格式不合的識別碼要被擋
st7, r7 = rpc(tok_a, cmd(CHILD, FAMILY, "QA 壞識別碼", "recurring", "family_participation",
                         "recurring", None, "family_contribution", "ongoing", "fixed_days",
                         plain("family_contribution"), "not-a-uuid"))
# RPC 回的鍵是 code，不是 errorCode —— adapter 讀的也是 payload.code。
ok(st7 == 200 and r7.get("ok") is False and r7.get("code") == "VALIDATION_FAILED",
   f"13. 非 UUID 的識別碼被擋下（{r7.get('code')}：{r7.get('message')}）")

print(f"\n通過 {PASS} 項，失敗 {len(FAILED)} 項")
for f in FAILED:
    print("  FAILED:", f)
summary = {"created": created, "idempotency_request": req_x}
print(json.dumps(summary, ensure_ascii=False))
if OUT:
    # completion.py 需要這批 task id；寫到 QA_OUT 指定的位置，不落在 repo 裡。
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(created, fh, ensure_ascii=False)
sys.exit(1 if FAILED else 0)
