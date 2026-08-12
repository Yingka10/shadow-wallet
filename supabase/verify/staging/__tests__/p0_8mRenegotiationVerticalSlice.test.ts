// staging 驗收 — P0-8M 換時段再協商的完整 vertical slice（Demo Family）。
//
// 讀寫一律走 App 真正的程式碼：
//   getActiveSharedPlanForTask / createAdjustmentRequest /
//   listOpenAdjustmentsForParent / presentParentAdjustment /
//   acceptAdjustment / declineAdjustment / buildGoalPresentation
// 而不是自己下 SQL。「DB 有那一列」和「畫面讀得到那一列」是兩件事，
// 驗收條件是後者。SQL 只用來**旁證**（讀 no-clawback oracle），不用來製造狀態。
//
// 跑法（預設 skip）：
//   STAGING_P0_8M=1 EXPO_PUBLIC_APP_ENV=staging … npx jest supabase/verify/staging
//
// ⚠️ 這一支會動 Demo Family 的共同計畫（會多出第三版）。跑完必須
//    ./run_demo.sh reseed --state=b 讓 staging 回到乾淨的 State B。

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

import { supabase } from '../../../../src/lib/supabase';
import { SupabaseChildProposalService } from '../../../../src/lib/childProposal/childProposalService';
import { presentParentAdjustment } from '../../../../src/screens/parent/tablet/home/parentAdjustmentPresentation';
import { buildGoalPresentation } from '../../../../src/screens/child/longTermGoalPresentation';
import type { LongTermGoal, PreferredTimeWindow, Task } from '../../../../src/types/database';
import type { GoalCompletionRecord } from '../../../../src/screens/child/longTermGoalPresentation';

dayjs.extend(utc);
dayjs.extend(timezone);

const RUN = process.env.STAGING_P0_8M === '1';
const suite = RUN ? describe : describe.skip;

const EMAIL = process.env.STAGING_PARENT_EMAIL ?? '';
const PASSWORD = process.env.STAGING_PARENT_PASSWORD ?? '';

const FAMILY_ID = 'd0e70000-0000-4000-8000-000000000001';
const CHILD_ID = 'd0e70000-0000-4000-8000-000000000021';

jest.setTimeout(300_000);

const service = new SupabaseChildProposalService();

/**
 * 孩子端長期詳情實際用的時段決策順序（LongTermDetailScreen 的
 * resolvePreferredWindow）。這裡照抄同一條規則來驗 §8 的 fallback ——
 * 它的三個輸入全部來自 live DB。
 */
function readingWindowFromTask(value: string | null): PreferredTimeWindow | null {
  return value === 'after_dinner' || value === 'before_bed' ? value : null;
}
function resolvePreferredWindow(
  todayCompletion: GoalCompletionRecord | undefined,
  goal: LongTermGoal,
  task: Task,
): PreferredTimeWindow | null {
  return todayCompletion?.planned_time_window
    ?? goal.preferred_time_window
    ?? readingWindowFromTask(task.preferred_time)
    ?? null;
}

type Snapshot = {
  taskId: string;
  goalId: string;
  taskPreferredTime: string | null;
  goalWindow: string | null;
  versions: Array<Record<string, unknown>>;
  currentVersionId: string | null;
  proposalStatus: string;
  completionIds: string[];
  completionStamps: string[];
  completionCoins: Array<number | null>;
  familyCompletionCount: number;
  transactionIds: string[];
  transactionAmounts: number[];
  walletBalance: number;
  currentDay: number | null;
  presentation: { weekTarget: number; weekCompleted: number; window: PreferredTimeWindow | null };
};

let proposalId = '';
let taskId = '';

async function snapshot(): Promise<Snapshot> {
  const { data: proposal, error: pErr } = await supabase
    .from('child_proposals').select('*').eq('id', proposalId).single();
  expect(pErr).toBeNull();

  const { data: versions, error: vErr } = await supabase
    .from('child_proposal_plan_versions').select('*')
    .eq('proposal_id', proposalId).order('version_no');
  expect(vErr).toBeNull();

  const { data: task, error: tErr } = await supabase
    .from('tasks').select('*').eq('id', taskId).single();
  expect(tErr).toBeNull();

  const { data: goal, error: gErr } = await supabase
    .from('long_term_goals').select('*').eq('task_id', taskId).single();
  expect(gErr).toBeNull();

  const { data: completions, error: cErr } = await supabase
    .from('task_completions')
    .select('id, completed_at, coin_earned, planned_time_window, start_mode, status')
    .eq('task_id', taskId).eq('status', 'completed')
    .order('completed_at');
  expect(cErr).toBeNull();

  const { data: familyTasks } = await supabase
    .from('tasks').select('id').eq('family_id', FAMILY_ID);
  const familyTaskIds = (familyTasks ?? []).map(t => t.id);
  const { count: familyCompletions } = await supabase
    .from('task_completions').select('id', { count: 'exact', head: true })
    .in('task_id', familyTaskIds);

  const { data: wallet, error: wErr } = await supabase
    .from('wallets').select('id, balance').eq('child_id', CHILD_ID).single();
  expect(wErr).toBeNull();

  const { data: transactions, error: trErr } = await supabase
    .from('transactions').select('id, amount, type, reference_id')
    .eq('wallet_id', wallet!.id).order('created_at');
  expect(trErr).toBeNull();

  const records: GoalCompletionRecord[] = (completions ?? []).map(c => ({
    id: c.id,
    completed_at: c.completed_at,
    planned_time_window: c.planned_time_window,
    start_mode: c.start_mode,
  }));
  const today = dayjs().tz('Asia/Taipei');
  const todayCompletion = records.find(r =>
    dayjs(r.completed_at).tz('Asia/Taipei').isSame(today, 'day'));
  const built = buildGoalPresentation(task as Task, goal as LongTermGoal, records);

  return {
    taskId: task!.id,
    goalId: goal!.id,
    taskPreferredTime: task!.preferred_time,
    goalWindow: goal!.preferred_time_window,
    versions: (versions ?? []) as Array<Record<string, unknown>>,
    currentVersionId: proposal!.current_plan_version_id,
    proposalStatus: proposal!.status,
    completionIds: (completions ?? []).map(c => c.id),
    completionStamps: (completions ?? []).map(c => c.completed_at),
    completionCoins: (completions ?? []).map(c => c.coin_earned),
    familyCompletionCount: familyCompletions ?? -1,
    transactionIds: (transactions ?? []).map(t => t.id),
    transactionAmounts: (transactions ?? []).map(t => t.amount),
    walletBalance: wallet!.balance,
    currentDay: goal!.current_day,
    presentation: {
      weekTarget: built.weekTarget,
      weekCompleted: built.weekCompleted,
      window: resolvePreferredWindow(todayCompletion, goal as LongTermGoal, task as Task),
    },
  };
}

/** 錢與完成的部分逐項相同 —— 這是 no-clawback 的 oracle。 */
function expectNoClawback(before: Snapshot, after: Snapshot) {
  expect(after.completionIds).toEqual(before.completionIds);
  expect(after.completionStamps).toEqual(before.completionStamps);
  expect(after.completionCoins).toEqual(before.completionCoins);
  expect(after.familyCompletionCount).toBe(before.familyCompletionCount);
  expect(after.transactionIds).toEqual(before.transactionIds);
  expect(after.transactionAmounts).toEqual(before.transactionAmounts);
  expect(after.walletBalance).toBe(before.walletBalance);
  expect(after.currentDay).toBe(before.currentDay);
  expect(after.presentation.weekTarget).toBe(before.presentation.weekTarget);
  expect(after.presentation.weekCompleted).toBe(before.presentation.weekCompleted);
}

let baseline: Snapshot;
let afterRequest: Snapshot;
let afterAccept: Snapshot;
let requestId = '';
let clientRequestId = '';
let sourceVersionId = '';

suite('P0-8M · staging vertical slice', () => {
  beforeAll(async () => {
    if (!EMAIL || !PASSWORD) throw new Error('缺少 staging 家長憑證');
    const { error } = await supabase.auth.signInWithPassword({
      email: EMAIL, password: PASSWORD,
    });
    if (error) throw new Error(`登入失敗：${error.message}`);

    const { data: proposal, error: pErr } = await supabase
      .from('child_proposals').select('*')
      .eq('family_id', FAMILY_ID).eq('status', 'active').single();
    if (pErr || !proposal) throw new Error(`找不到 active 提案：${pErr?.message}`);
    proposalId = proposal.id;
    taskId = proposal.task_id!;
    sourceVersionId = proposal.current_plan_version_id!;
  });

  afterAll(async () => { await supabase.auth.signOut(); });

  // ── §8 孩子初始畫面 ───────────────────────────────────────────────────
  it('§8 State B 起手：正式時段 before_bed，goal mirror 仍是 NULL', async () => {
    baseline = await snapshot();

    expect(baseline.taskPreferredTime).toBe('before_bed');
    // FOLLOW_UP_PREFERRED_TIME_WINDOW_CREATION_MIRROR —— live 上確認它仍存在。
    expect(baseline.goalWindow).toBeNull();
    expect(baseline.versions).toHaveLength(2);
    expect(baseline.walletBalance).toBe(56);
    expect(baseline.completionIds).toHaveLength(2);
  });

  it('§8 孩子畫面透過 compatibility fallback 顯示「睡前」，而且是 2／3', () => {
    expect(baseline.presentation.window).toBe('before_bed');
    expect(baseline.presentation.weekTarget).toBe(3);
    expect(baseline.presentation.weekCompleted).toBe(2);
  });

  // ── §9–§10 孩子送出請求 ──────────────────────────────────────────────
  it('§9 孩子端 reader 認得這是可協商的共同計畫', async () => {
    const context = await service.getActiveSharedPlanForTask({ taskId, childId: CHILD_ID });
    expect(context).not.toBeNull();
    expect(context!.proposal.id).toBe(proposalId);
    expect(context!.currentPlanVersion.id).toBe(sourceVersionId);
    expect(context!.currentPlanVersion.preferred_time).toBe('before_bed');
    expect(context!.openPreferredTimeRequest).toBeNull();
  });

  it('§9 送出「改成晚餐後」', async () => {
    clientRequestId = crypto.randomUUID();
    const result = await service.createAdjustmentRequest({
      schemaVersion: 1,
      proposalId,
      expectedPlanVersionId: sourceVersionId,
      adjustmentKind: 'preferred_time',
      reason: '這週回顧後，我想改成晚餐後試試看。',
      requestedChanges: { preferredTime: 'after_dinner', preferredTimeCustom: null },
      clientRequestId,
    });
    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    expect(result.idempotentReplay).toBe(false);
    expect(result.status).toBe('open');
    requestId = result.adjustmentRequestId;
  });

  it('§10 DB 恰好一張 open request，內容與 requested_by 都正確', async () => {
    const { data, error } = await supabase
      .from('child_proposal_adjustment_requests').select('*')
      .eq('proposal_id', proposalId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const row = data![0];
    expect(row.id).toBe(requestId);
    expect(row.status).toBe('open');
    expect(row.requested_by).toBe('child');
    expect(row.adjustment_kind).toBe('preferred_time');
    expect(row.based_on_plan_version_id).toBe(sourceVersionId);
    expect(row.requested_changes).toEqual({
      preferredTime: 'after_dinner', preferredTimeCustom: null,
    });
    expect(row.client_request_id).toBe(clientRequestId);
    expect(row.resolved_at).toBeNull();
  });

  it('§10 提出 ≠ 生效：task / version / goal 全部沒有提前變動', async () => {
    afterRequest = await snapshot();

    expect(afterRequest.proposalStatus).toBe('active');
    expect(afterRequest.taskPreferredTime).toBe('before_bed');
    expect(afterRequest.currentVersionId).toBe(sourceVersionId);
    expect(afterRequest.versions).toHaveLength(2);
    expect(afterRequest.goalWindow).toBeNull();
    expect(afterRequest.presentation.window).toBe('before_bed');
  });

  // ── §11 open 當下的 no-clawback ──────────────────────────────────────
  it('§11 open 當下：完成、交易、錢包、2／3 全部一格未動', () => {
    expectNoClawback(baseline, afterRequest);
    expect(afterRequest.walletBalance).toBe(56);
    expect(afterRequest.presentation.weekCompleted).toBe(2);
    expect(afterRequest.presentation.weekTarget).toBe(3);
  });

  // ── §12 孩子 pending UX ──────────────────────────────────────────────
  it('§12 孩子端 reader 現在回報 pending，時段仍是睡前', async () => {
    const context = await service.getActiveSharedPlanForTask({ taskId, childId: CHILD_ID });
    expect(context).not.toBeNull();
    expect(context!.openPreferredTimeRequest?.id).toBe(requestId);
    // 畫面的時段來源仍是 current version / task，不是那張還沒被接受的請求。
    expect(context!.currentPlanVersion.preferred_time).toBe('before_bed');
  });

  // ── §13 idempotency ─────────────────────────────────────────────────
  it('§13 同一個 clientRequestId 重送 → 回原 id、idempotentReplay=true、不增列', async () => {
    const replay = await service.createAdjustmentRequest({
      schemaVersion: 1,
      proposalId,
      expectedPlanVersionId: sourceVersionId,
      adjustmentKind: 'preferred_time',
      reason: '這週回顧後，我想改成晚餐後試試看。',
      requestedChanges: { preferredTime: 'after_dinner', preferredTimeCustom: null },
      clientRequestId,
    });
    expect(replay.ok).toBe(true);
    if (replay.ok !== true) return;
    expect(replay.adjustmentRequestId).toBe(requestId);
    expect(replay.idempotentReplay).toBe(true);

    const { count } = await supabase
      .from('child_proposal_adjustment_requests')
      .select('id', { count: 'exact', head: true }).eq('proposal_id', proposalId);
    expect(count).toBe(1);
  });

  it('§13 換新的 clientRequestId 但同一個 based_on → ADJUSTMENT_ALREADY_OPEN', async () => {
    const second = await service.createAdjustmentRequest({
      schemaVersion: 1,
      proposalId,
      expectedPlanVersionId: sourceVersionId,
      adjustmentKind: 'preferred_time',
      reason: '再試一次',
      requestedChanges: { preferredTime: 'after_dinner', preferredTimeCustom: null },
      clientRequestId: crypto.randomUUID(),
    });
    expect(second.ok).toBe(false);
    if (second.ok !== false) return;
    expect(second.reason).toBe('ADJUSTMENT_ALREADY_OPEN');

    const { count } = await supabase
      .from('child_proposal_adjustment_requests')
      .select('id', { count: 'exact', head: true })
      .eq('proposal_id', proposalId).eq('status', 'open');
    expect(count).toBe(1);
  });

  // ── §17 有請求 ≠ 有修改權 ────────────────────────────────────────────
  it('§17 open request 存在，普通 UPDATE 仍然被擋（真 client、真 RLS）', async () => {
    const { error } = await supabase
      .from('tasks').update({ preferred_time: 'after_dinner' }).eq('id', taskId);

    // 要嘛被 guard 擋（P0001），要嘛連 RLS 都不給寫 —— 兩種都算封住，
    // 但「成功寫進去」絕對不行。
    if (error) {
      expect(error.message).toContain('SHARED_PLAN_REQUIRES_RENEGOTIATION');
    }
    const { data: task } = await supabase
      .from('tasks').select('preferred_time').eq('id', taskId).single();
    expect(task!.preferred_time).toBe('before_bed');
  });

  it('§17 predicate 此刻仍是 false —— 有 open request 不構成授權', async () => {
    const { data, error } = await supabase.rpc(
      'is_authorized_preferred_time_renegotiation_v1' as never,
      {
        p_task_id: taskId, p_old_time: 'before_bed', p_old_custom: null,
        p_new_time: 'after_dinner', p_new_custom: null,
      } as never,
    );
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  // ── §15 家長卡片 ────────────────────────────────────────────────────
  it('§15 家長卡片真的來自 listOpenAdjustmentsForParent', async () => {
    const cards = await service.listOpenAdjustmentsForParent({
      familyId: FAMILY_ID, childId: CHILD_ID,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0].request.id).toBe(requestId);
    expect(cards[0].basedOnPlanVersion.id).toBe(sourceVersionId);

    const view = presentParentAdjustment(cards[0], '承恩');
    expect(view).not.toBeNull();
    expect(view!.title).toBe('承恩想調整閱讀時間');
    expect(view!.reason).toBe('這週回顧後，我想改成晚餐後試試看。');
    expect(view!.diffs).toHaveLength(1);
    expect(view!.diffs[0]).toMatchObject({
      field: 'preferred_time', label: '適合時間',
      before: '睡覺前', after: '晚餐後',
    });

    const rendered = JSON.stringify(view);
    expect(rendered).not.toContain('before_bed');
    expect(rendered).not.toContain('after_dinner');
    expect(rendered).not.toContain('一週 3 次');
    expect(rendered).not.toContain('plan_summary');
  });

  it('§16 另一個孩子的首頁看不到這張卡', async () => {
    const cards = await service.listOpenAdjustmentsForParent({
      familyId: FAMILY_ID, childId: '00000000-0000-4000-8000-0000000000ff',
    });
    expect(cards).toEqual([]);
  });

  // ── §18–§23 家長確認 ────────────────────────────────────────────────
  it('§18 家長按「確認這個調整」', async () => {
    const result = await service.acceptAdjustment({
      schemaVersion: 1,
      adjustmentRequestId: requestId,
      expectedPlanVersionId: sourceVersionId,
    });
    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    expect(result.idempotentReplay).toBe(false);
    expect(result.taskId).toBe(taskId);
    expect(result.proposalId).toBe(proposalId);
    expect(result.planVersionId).not.toBe(sourceVersionId);
  });

  it('§19 Plan Versions 2 → 3，current 指向新版，task 同一張', async () => {
    afterAccept = await snapshot();

    expect(afterAccept.versions).toHaveLength(3);
    expect(afterAccept.proposalStatus).toBe('active');
    expect(afterAccept.taskId).toBe(baseline.taskId);
    expect(afterAccept.currentVersionId).not.toBe(sourceVersionId);
    expect(afterAccept.currentVersionId).toBe(
      (afterAccept.versions[2] as { id: string }).id);
  });

  it('§19+§22 新版本的 lineage 與旗標', () => {
    const v3 = afterAccept.versions[2] as Record<string, unknown>;
    expect(v3.version_no).toBe(3);
    expect(v3.authored_by).toBe('parent');
    expect(v3.adopted_from_plan_version_id).toBe(sourceVersionId);
    expect(v3.requires_child_review).toBe(false);
    expect(v3.parent_confirmed_at).not.toBeNull();
    expect(v3.effective_at).not.toBeNull();
    expect(v3.child_accepted_at).toBeNull();
    expect(v3.confirmed_source_task_id).toBe(taskId);
    expect(v3.superseded_at).toBeNull();
    // 舊版被 supersede，lineage 不分岔。
    expect((afterAccept.versions[1] as Record<string, unknown>).superseded_at).not.toBeNull();
  });

  it('§20 新版本相對舊版只有 preferred_time 不同', () => {
    const src = afterAccept.versions[1] as Record<string, unknown>;
    const next = afterAccept.versions[2] as Record<string, unknown>;
    const volatile = new Set([
      'id', 'version_no', 'created_at', 'preferred_time', 'preferred_time_custom',
      'adopted_from_plan_version_id', 'author_user_id',
      'requires_child_review', 'child_accepted_at', 'parent_confirmed_at',
      'effective_at', 'superseded_at', 'confirmed_at', 'confirmed_by_user_id',
      'ai_request_id',
    ]);
    const differing = Object.keys(next).filter(key =>
      !volatile.has(key)
      && JSON.stringify(next[key]) !== JSON.stringify(src[key]));
    expect(differing).toEqual([]);

    expect(src.preferred_time).toBe('before_bed');
    expect(next.preferred_time).toBe('after_dinner');
    expect(next.preferred_time_custom).toBeNull();
  });

  it('§21 canonical task：同一張、時段變了、其他不變', async () => {
    const { data: task } = await supabase.from('tasks').select('*').eq('id', taskId).single();
    expect(task!.id).toBe(baseline.taskId);
    expect(task!.preferred_time).toBe('after_dinner');
    expect(task!.weekly_frequency).toBe(3);
    expect(task!.recurrence_days).toBeNull();
    expect(task!.progress_model).toBe('weekly_rhythm');
    expect(task!.reward_coin_amount).not.toBeUndefined();

    // 不能生出第二張 canonical task。
    const { count } = await supabase
      .from('tasks').select('id', { count: 'exact', head: true })
      .eq('family_id', FAMILY_ID);
    expect(count).toBe(7);
  });

  it('§22 goal runtime mirror 同步成 after_dinner，goal id 不變', () => {
    expect(afterAccept.goalId).toBe(baseline.goalId);
    expect(afterAccept.goalWindow).toBe('after_dinner');
    expect(afterAccept.currentDay).toBe(baseline.currentDay);
  });

  it('§23 原 request 結案，沒有第二張取代它', async () => {
    const { data } = await supabase
      .from('child_proposal_adjustment_requests').select('*')
      .eq('proposal_id', proposalId);
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(requestId);
    expect(data![0].status).toBe('accepted');
    expect(data![0].resolved_plan_version_id).toBe(afterAccept.currentVersionId);
    expect(data![0].resolved_at).not.toBeNull();
  });

  // ── §24 真正的 no-clawback ──────────────────────────────────────────
  it('§24 accept 前後：completion / transaction / wallet / 2／3 完全相同', () => {
    expectNoClawback(baseline, afterAccept);
    expect(afterAccept.walletBalance).toBe(56);
    expect(afterAccept.familyCompletionCount).toBe(11);
    expect(afterAccept.transactionIds).toHaveLength(5);
  });

  // ── §25 孩子重新 focus ──────────────────────────────────────────────
  it('§25 孩子重新讀取後看到「晚餐後」，本週仍 2／3，pending 消失', async () => {
    const refocused = await snapshot();
    expect(refocused.presentation.window).toBe('after_dinner');
    expect(refocused.presentation.weekTarget).toBe(3);
    expect(refocused.presentation.weekCompleted).toBe(2);

    const context = await service.getActiveSharedPlanForTask({ taskId, childId: CHILD_ID });
    expect(context!.openPreferredTimeRequest).toBeNull();
    expect(context!.currentPlanVersion.preferred_time).toBe('after_dinner');
  });

  it('§25 家長首頁的卡也消失了', async () => {
    const cards = await service.listOpenAdjustmentsForParent({
      familyId: FAMILY_ID, childId: CHILD_ID,
    });
    expect(cards).toEqual([]);
  });

  // ── §26 accept replay ───────────────────────────────────────────────
  it('§26 重送同一個 accept → idempotentReplay，版本仍是 3', async () => {
    const replay = await service.acceptAdjustment({
      schemaVersion: 1,
      adjustmentRequestId: requestId,
      expectedPlanVersionId: sourceVersionId,
    });
    expect(replay.ok).toBe(true);
    if (replay.ok !== true) return;
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.planVersionId).toBe(afterAccept.currentVersionId);
    expect(replay.taskId).toBe(taskId);

    const again = await snapshot();
    expect(again.versions).toHaveLength(3);
    expect(again.currentVersionId).toBe(afterAccept.currentVersionId);
    expectNoClawback(baseline, again);

    // adoption event 認的是 plan_version_id，不是 snapshot ——
    // RPC 把說明寫在 reason，snapshot 保持 NULL。
    const { data: events } = await supabase
      .from('child_proposal_status_events').select('*')
      .eq('proposal_id', proposalId)
      .eq('plan_version_id', afterAccept.currentVersionId!);
    expect(events).toHaveLength(1);
    expect(events![0].to_status).toBe('active');
    expect(events![0].actor_role).toBe('parent');
  });
});
