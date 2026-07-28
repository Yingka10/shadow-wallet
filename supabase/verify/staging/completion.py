# staging 完成流程 E2E（§十三）—— 走 PostgREST，用真 JWT。
#
# 重點不是「完成會不會成功」，而是四種 reward_policy 完成後
# 錢包各自該不該動。不該動的三種若動了，家長對幣的信任就沒了。

import json, os, sys, urllib.request, urllib.error
from datetime import datetime, timezone

ROOT = r"c:\Users\jenny\app\shadow-wallet"
SP = os.path.dirname(__file__)
STAGING_REF = os.environ.get("STAGING_REF", "")
FORBIDDEN_REF = os.environ.get("FORBIDDEN_REF", "")

env = {}
for line in open(os.path.join(ROOT, ".env.local"), encoding="utf-8"):
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"')
URL, ANON = env["EXPO_PUBLIC_SUPABASE_URL"], env["EXPO_PUBLIC_SUPABASE_ANON_KEY"]
if not STAGING_REF:
    sys.exit("!! 中止：必須以 STAGING_REF 指定目標，腳本不猜")
if FORBIDDEN_REF and FORBIDDEN_REF in URL:
    sys.exit("!! 中止：URL 指向被禁止的 project")
if STAGING_REF not in URL:
    sys.exit("!! 中止：URL 與 STAGING_REF 不符")
print(f"目標 project ref : {STAGING_REF}\n")
QAPW = os.environ.get("QA_PASSWORD", "")
if not QAPW:
    sys.exit("!! 中止：需要 QA_PASSWORD（QA 帳號密碼，不寫進 repo）")
CREATED = os.environ.get("QA_OUT", "")
if not CREATED:
    sys.exit("!! 中止：需要 QA_OUT，指向 create_and_idempotency.py 產出的 task id 檔")

def call(path, body=None, token=None, method="POST"):
    req = urllib.request.Request(URL + path, method=method)
    req.add_header("apikey", ANON)
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
    assert st == 200, f"登入失敗 {who}: {st} {d}"
    return d["access_token"]

def rest(token, path):
    return call("/rest/v1/" + path, None, token, method="GET")

PASS, FAILED = 0, []
def ok(cond, label):
    global PASS
    if cond:
        PASS += 1; print(f"  ok   {label}")
    else:
        FAILED.append(label); print(f"  FAIL {label}")

tok_a, tok_c = login("a"), login("c")
created = json.load(open(CREATED, encoding="utf-8"))
st, kids = rest(tok_a, "children?select=id")
CHILD = kids[0]["id"]

def balance():
    st, w = rest(tok_a, f"wallets?select=balance&child_id=eq.{CHILD}&wallet_type=eq.spending")
    return w[0]["balance"]

def complete(token, task_id):
    return call("/rest/v1/rpc/complete_task", {
        "p_task_id": task_id, "p_child_id": CHILD,
        "p_completed_at": datetime.now(timezone.utc).isoformat(),
        "p_is_prerequisite_met": True}, token)

print("── §十三 完成流程（四種 reward_policy 各自的錢包行為）")

# A. coin_eligible → +12
before = balance()
st, r = complete(tok_a, created["growth"])
after = balance()
ok(st == 200 and r.get("coinEarned") == 12 and after - before == 12,
   f"A. coin_eligible 完成發 12 幣，錢包 {before} → {after}")

st, comps = rest(tok_a, f"task_completions?select=coin_earned&task_id=eq.{created['growth']}"
                        f"&order=completed_at.desc&limit=1")
ok(st == 200 and comps and comps[0]["coin_earned"] == 12,
   f"A1. completion log 金額一致（{comps[0]['coin_earned'] if comps else '無紀錄'}）")

st, t = rest(tok_a, f"tasks?select=estimated_minutes,reward_coin_amount&id=eq.{created['growth']}")
ok(t[0]["estimated_minutes"] == 20 and t[0]["reward_coin_amount"] == 12,
   f"A2. 分鐘 {t[0]['estimated_minutes']} 與幣值 {t[0]['reward_coin_amount']} 不同 —— 沒拿分鐘當幣值")

# B. family_contribution → 不動
before = balance()
st, r = complete(tok_a, created["recurring"])
after = balance()
ok(st == 200 and (r.get("coinEarned") or 0) == 0 and after == before,
   f"B. family_contribution 完成 0 幣，錢包不變（{before} → {after}）")
st, ts = rest(tok_a, f"time_savings?select=id&child_id=eq.{CHILD}")
ok(st == 200 and len(ts) == 0, f"B1. 沒有寫 time_savings（{len(ts) if st==200 else st} 筆）")

# C. record_only → 不動
before = balance()
st, r = complete(tok_a, created["once"])
after = balance()
ok(st == 200 and (r.get("coinEarned") or 0) == 0 and after == before,
   f"C. record_only 完成 0 幣，錢包不變（{before} → {after}）")
st, comps = rest(tok_a, f"task_completions?select=id&task_id=eq.{created['once']}")
ok(st == 200 and len(comps) >= 1, "C1. 仍留下完成紀錄")

# D. progress_only → 不動
before = balance()
st, r = complete(tok_a, created["support"])
after = balance()
ok(st == 200 and (r.get("coinEarned") or 0) == 0 and after == before,
   f"D. progress_only 完成 0 幣，錢包不變（{before} → {after}）")

# E. 家庭角色（family_contribution 長期）→ 不動
before = balance()
st, r = complete(tok_a, created["role"])
after = balance()
ok(st == 200 and (r.get("coinEarned") or 0) == 0 and after == before,
   f"E. 家庭角色完成 0 幣，錢包不變（{before} → {after}）")

# F. 單次任務的 claim 規則
st, t = rest(tok_a, f"tasks?select=claim_period,max_claims_per_period&id=eq.{created['once']}")
ok(t[0]["claim_period"] == "once" and t[0]["max_claims_per_period"] == 1,
   "F. 單次任務 claim 規則為整個生命週期一次")

# G. 跨家庭不可完成
st, r = complete(tok_c, created["growth"])
ok(st in (401, 403) or (isinstance(r, dict) and r.get("ok") is False),
   f"G. 跨家庭完成被拒（HTTP {st}）")

# H. 跨家庭讀不到錢包
st, w = rest(tok_c, f"wallets?select=balance&child_id=eq.{CHILD}")
ok(st == 200 and len(w) == 0, f"H. 跨家庭讀不到錢包（{len(w) if st==200 else st} 筆）")

# I. 最終餘額只來自那一次 coin_eligible
final = balance()
ok(final == 12, f"I. 五次完成後餘額為 12 —— 只有可發幣那一種給了幣（實際 {final}）")

print(f"\n通過 {PASS} 項，失敗 {len(FAILED)} 項")
for f in FAILED:
    print("  FAILED:", f)
sys.exit(1 if FAILED else 0)
