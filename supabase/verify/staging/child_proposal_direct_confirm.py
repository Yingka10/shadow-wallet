"""P0-5A staging smoke. This script refuses every project except GrowBook staging."""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

EXPECTED_REF = "lcmzbdgzehjxwuyduqwj"
STAGING_REF = os.environ.get("STAGING_REF", "")
URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
ANON = os.environ.get("SUPABASE_ANON_KEY", "")
EMAIL = os.environ.get("PARENT_EMAIL", "")
PASSWORD = os.environ.get("PARENT_PASSWORD", "")

if STAGING_REF != EXPECTED_REF:
    sys.exit("!! 中止：STAGING_REF 必須明確等於 %s" % EXPECTED_REF)
if EXPECTED_REF not in URL:
    sys.exit("!! 中止：SUPABASE_URL 不是指定 staging project")
if not (ANON and EMAIL and PASSWORD):
    sys.exit("!! 中止：缺 SUPABASE_ANON_KEY / PARENT_EMAIL / PARENT_PASSWORD")

passed, failed = [], []


def check(ok, label, detail=None):
    (passed if ok else failed).append(label)
    print(("  ok   " if ok else "  FAIL ") + label)
    if not ok and detail is not None:
        print("       " + str(detail))


def http(path, body=None, token=None, method="POST"):
    request = urllib.request.Request(URL + path, method=method)
    request.add_header("apikey", ANON)
    request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", "Bearer " + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(request, data) as response:
            raw = response.read().decode()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            return error.code, json.loads(raw)
        except Exception:
            return error.code, raw


def rpc(name, command, token):
    return http("/rest/v1/rpc/" + name, {"p_command": command}, token)


def get(path, token):
    return http("/rest/v1/" + path, None, token, method="GET")


print("P0-5A target project ref: " + EXPECTED_REF)
status, auth = http("/auth/v1/token?grant_type=password", {
    "email": EMAIL, "password": PASSWORD,
})
if status != 200:
    sys.exit("!! staging login failed: %s" % status)
token = auth["access_token"]

status, children = get("children?select=id,family_id,age_group,nickname&limit=1", token)
if status != 200 or not children:
    sys.exit("!! staging child unavailable")
child = children[0]
child_id = child["id"]
family_id = child["family_id"]
check(True, "authenticated parent can read one staging child")


def snapshot_money():
    st_w, wallets = get(
        "wallets?select=id,balance&child_id=eq." + urllib.parse.quote(child_id), token)
    st_c, completions = get(
        "task_completions?select=id&child_id=eq." + urllib.parse.quote(child_id), token)
    wallet_ids = [row["id"] for row in wallets] if st_w == 200 else []
    transactions = []
    for wallet_id in wallet_ids:
        st_t, rows = get(
            "transactions?select=id&wallet_id=eq." + urllib.parse.quote(wallet_id), token)
        if st_t == 200:
            transactions.extend(rows)
    return {
        "wallets": sorted((row["id"], row["balance"]) for row in wallets),
        "transactionIds": sorted(row["id"] for row in transactions),
        "completionIds": sorted(row["id"] for row in completions) if st_c == 200 else None,
    }


money_before = snapshot_money()
goal = "我想兩週把這本書讀完（P0-5A smoke %s）" % uuid.uuid4().hex[:8]
status, result = rpc("create_child_proposal_v1", {
    "schemaVersion": 1,
    "childId": child_id,
    "childOriginalGoal": goal,
    "childOriginalMotivation": "因為同學說這本書很好看",
    "proposalSource": "child",
    "status": "proposed",
    "cadence": {"mode": "weekly_frequency", "weeklyFrequency": 4},
    "estimatedMinutes": 15,
    "childRewardPreference": "hopes_for_coin",
}, token)
proposal_id = result.get("proposalId") if isinstance(result, dict) else None
check(status == 200 and result.get("ok") is True and proposal_id,
      "create proposed reading proposal", (status, result))
if not proposal_id:
    sys.exit(1)

status, result = rpc("add_child_proposal_plan_version_v1", {
    "schemaVersion": 1,
    "proposalId": proposal_id,
    "authoredBy": "ai",
    "planTitle": "兩週閱讀挑戰",
    "planSummary": "用每週節奏累積閱讀投入",
    "purposeCategory": "D",
    "completionDescription": "完成一次約定的閱讀時段",
    "progressModel": "weekly_rhythm",
    "nextStep": "拿出一本想讀的書，先閱讀約 15 分鐘",
    "cadence": {"mode": "weekly_frequency", "weeklyFrequency": 4},
    "estimatedMinutes": 15,
    "durationType": "long_term",
    "durationDays": 14,
    "reward": {
        "policy": "coin_eligible",
        "eligibility": "allowed",
        "policyVersion": "coin-policy-1.0.0",
        "aiSuggestedCoinAmount": 10,
    },
    "taskPolicyVersion": "task-taxonomy-2026-07",
    "aiSnapshot": {"source": "P0-5A-staging-smoke"},
    "aiModel": "staging-smoke",
    "aiRequestId": "p05a:" + proposal_id,
}, token)
ai_version_id = result.get("planVersionId") if isinstance(result, dict) else None
check(status == 200 and result.get("ok") is True and ai_version_id,
      "create structured AI plan", (status, result))

decision = {
    "rewardPolicy": "coin_eligible",
    "eligibility": "allowed",
    "coin": {
        "suggestedAmount": 10,
        "finalAmount": 10,
        "minAllowed": 5,
        "maxAllowed": 25,
        "calculationBasis": {
            "ageGroup": child["age_group"],
            "purposeCategory": "learning_skill",
            "estimatedMinutes": 15,
            "durationType": "long_term",
            "scheduleMode": "weekly_frequency",
            "weeklyFrequency": 4,
            "difficulty": "standard",
            "band": "11-20",
        },
    },
    "rewardPolicyVersion": "coin-policy-1.0.0",
    "explanation": "6-9 歲 D 類、每次約 15 分鐘，GrowBook 建議 10 幣。",
}

# Wrong visible amount must produce no parent version and no canonical task.
wrong = json.loads(json.dumps(decision))
wrong["coin"]["finalAmount"] = 9
status, result = rpc("confirm_child_proposal_v1", {
    "schemaVersion": 1, "proposalId": proposal_id,
    "expectedPlanVersionId": ai_version_id, "rewardDecision": wrong,
}, token)
check(status == 200 and result.get("ok") is False
      and result.get("code") == "POLICY_CHANGED", "invalid reward is typed POLICY_CHANGED",
      (status, result))
_, rows = get("tasks?select=id&creation_request_id=eq." + proposal_id, token)
check(rows == [], "invalid reward leaves zero canonical tasks", rows)
_, rows = get("child_proposal_plan_versions?select=id,authored_by&proposal_id=eq."
              + proposal_id + "&authored_by=eq.parent", token)
check(rows == [], "invalid reward leaves zero parent adoption versions", rows)

status, confirmed = rpc("confirm_child_proposal_v1", {
    "schemaVersion": 1,
    "proposalId": proposal_id,
    "expectedPlanVersionId": ai_version_id,
    "rewardDecision": decision,
}, token)
task_id = confirmed.get("taskId") if isinstance(confirmed, dict) else None
parent_version_id = confirmed.get("planVersionId") if isinstance(confirmed, dict) else None
check(status == 200 and confirmed.get("ok") is True and task_id and parent_version_id,
      "direct confirm succeeds", (status, confirmed))

_, proposals = get("child_proposals?select=*&id=eq." + proposal_id, token)
proposal = proposals[0] if proposals else {}
check(proposal.get("status") == "active" and proposal.get("task_id") == task_id
      and proposal.get("current_plan_version_id") == parent_version_id
      and proposal.get("activated_at"), "proposal is active and linked to parent version/task", proposal)

_, versions = get("child_proposal_plan_versions?select=*&proposal_id=eq."
                  + proposal_id + "&order=version_no.asc", token)
ai_rows = [row for row in versions if row.get("authored_by") == "ai"]
parent_rows = [row for row in versions if row.get("authored_by") == "parent"]
check(len(ai_rows) == 1 and ai_rows[0]["id"] == ai_version_id,
      "AI version remains immutable history", versions)
check(len(parent_rows) == 1
      and parent_rows[0].get("adopted_from_plan_version_id") == ai_version_id
      and parent_rows[0].get("ai_request_id") is None
      and parent_rows[0].get("parent_confirmed_at")
      and parent_rows[0].get("effective_at")
      and parent_rows[0].get("requires_child_review") is False,
      "one parent-authored adoption version with honest lineage", parent_rows)

taipei_today = datetime.now(ZoneInfo("Asia/Taipei")).date()
check(parent_rows[0].get("start_date") == taipei_today.isoformat()
      and parent_rows[0].get("end_date") == (taipei_today + timedelta(days=13)).isoformat(),
      "Asia/Taipei start and inclusive 14-day end", parent_rows[0])

_, tasks = get("tasks?select=*&id=eq." + task_id, token)
task = tasks[0] if tasks else {}
check(task.get("creation_source") == "child_proposal"
      and task.get("schedule_mode") == "weekly_frequency"
      and task.get("weekly_frequency") == 4
      and task.get("recurrence_days") is None
      and task.get("progress_model") == "weekly_rhythm"
      and task.get("long_term_type") == "habit"
      and task.get("reward_coin_amount") == 10,
      "canonical task keeps flexible weekly rhythm and final 10 coins", task)

_, assignments = get("child_tasks?select=id&task_id=eq." + task_id
                     + "&child_id=eq." + child_id, token)
_, goals = get("long_term_goals?select=*&task_id=eq." + task_id, token)
check(len(assignments) == 1, "exactly one child assignment", assignments)
check(len(goals) == 1 and goals[0].get("goal_type") == "habit",
      "exactly one P0-7.1-compatible long-term record", goals)

snapshot = confirmed.get("confirmedReward", {})
check(snapshot.get("sourceTaskId") == task_id
      and snapshot.get("coinAmount") == task.get("reward_coin_amount")
      and snapshot.get("claimPeriod") == "week"
      and snapshot.get("maxClaimsPerPeriod") == 4,
      "confirmed reward snapshot equals canonical task", snapshot)

status, replay = rpc("confirm_child_proposal_v1", {
    "schemaVersion": 1,
    "proposalId": proposal_id,
    "expectedPlanVersionId": ai_version_id,
    "rewardDecision": decision,
}, token)
check(status == 200 and replay.get("ok") is True
      and replay.get("idempotentReplay") is True
      and replay.get("taskId") == task_id
      and replay.get("planVersionId") == parent_version_id,
      "retry returns same task and parent version", (status, replay))

_, task_rows = get("tasks?select=id&creation_request_id=eq." + proposal_id, token)
_, parent_rows_after = get("child_proposal_plan_versions?select=id&proposal_id=eq."
                           + proposal_id + "&authored_by=eq.parent", token)
check(len(task_rows) == 1 and len(parent_rows_after) == 1,
      "double click leaves exactly one task and one adoption", (task_rows, parent_rows_after))

_, still_proposed = get("child_proposals?select=id&id=eq." + proposal_id
                        + "&status=eq.proposed", token)
check(still_proposed == [], "Parent Home proposed query no longer returns the card", still_proposed)

money_after = snapshot_money()
check(money_after == money_before,
      "confirm changes no wallet balance, transaction, or task completion", {
          "before": money_before, "after": money_after,
      })

print("\npassed=%d failed=%d" % (len(passed), len(failed)))
print("STAGING_PROPOSAL_ID=" + proposal_id)
print("STAGING_TASK_ID=" + str(task_id))
print("CLEANUP=requires privileged removal of the smoke proposal/task graph")
sys.exit(1 if failed else 0)
