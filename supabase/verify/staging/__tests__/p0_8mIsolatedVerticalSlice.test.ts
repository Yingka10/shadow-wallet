// staging 驗收 — P0-8M 的破壞性項目，全部跑在隔離家庭裡。
//
// 上一輪這裡是手刻 row 去建 active Shared Plan，連撞五道 invariant 之後放棄。
// 這一版**完全走正式 contract**：
//   create_child_proposal_v1 → transition proposed → add AI plan version
//   → revise_child_proposal_plan_v1 → accept_child_proposal_plan_v1
// direct confirm 走 confirm_child_proposal_v1，完成走 complete_task。
// 沒有任何一列是為了繞過 constraint 而手寫的。
//
// 前置：先跑 p0_8m_fixture.sql（會建 'P0-8M Verify Family' 與可登入的 auth user）
// 收尾：務必跑 p0_8m_cleanup.sql
//
// 跑法（預設 skip）：
//   STAGING_P0_8M_ISO=1 … npx jest supabase/verify/staging

import { supabase } from '../../../../src/lib/supabase';
import { SupabaseChildProposalService } from '../../../../src/lib/childProposal/childProposalService';
import { completeTask, recordCompletionContext } from '../../../../src/lib/taskActions';
import type { Task } from '../../../../src/types/database';

const RUN = process.env.STAGING_P0_8M_ISO === '1';
const suite = RUN ? describe : describe.skip;

const ISO_EMAIL = process.env.STAGING_ISO_EMAIL ?? '';
const ISO_PASSWORD = process.env.STAGING_ISO_PASSWORD ?? '';
const DEMO_EMAIL = process.env.STAGING_PARENT_EMAIL ?? '';
const DEMO_PASSWORD = process.env.STAGING_PARENT_PASSWORD ?? '';

jest.setTimeout(600_000);

const service = new SupabaseChildProposalService();

let familyId = '';
let childId = '';

async function signInIso() {
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({
    email: ISO_EMAIL, password: ISO_PASSWORD,
  });
  if (error) throw new Error(`隔離家長登入失敗：${error.message}`);
}

async function signInDemo() {
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL, password: DEMO_PASSWORD,
  });
  if (error) throw new Error(`Demo 家長登入失敗：${error.message}`);
}

/** 家長端那張卡需要的真實 row。 */
async function cardOf(proposalId: string) {
  const { data: proposal } = await supabase
    .from('child_proposals').select('*').eq('id', proposalId).single();
  const { data: current } = await supabase
    .from('child_proposal_plan_versions').select('*')
    .eq('id', proposal!.current_plan_version_id!).single();
  return { proposal: proposal!, currentPlanVersion: current! } as never;
}

/** 孩子 review 需要 current 與它 adopted 的 source，兩個都要是真的。 */
async function reviewOf(proposalId: string) {
  const { data: proposal } = await supabase
    .from('child_proposals').select('*').eq('id', proposalId).single();
  const { data: current } = await supabase
    .from('child_proposal_plan_versions').select('*')
    .eq('id', proposal!.current_plan_version_id!).single();
  const { data: source } = await supabase
    .from('child_proposal_plan_versions').select('*')
    .eq('id', current!.adopted_from_plan_version_id!).single();
  return {
    proposal: proposal!, currentPlanVersion: current!, sourcePlanVersion: source!,
  } as never;
}

/** 一份走完正式流程、已經 active 的共同閱讀計畫。 */
type SharedPlan = {
  proposalId: string;
  aiVersionId: string;
  parentVersionId: string;
  taskId: string;
};

async function buildSharedPlan(goal: string): Promise<SharedPlan> {
  const created = await service.create({
    schemaVersion: 1,
    childId,
    childOriginalGoal: goal,
    childOriginalMotivation: '因為我自己想試試看',
    cadence: { mode: 'weekly_frequency', weeklyFrequency: 4 },
    childRewardPreference: 'hopes_for_coin',
  });
  if (created.ok !== true) throw new Error(`建立提案失敗：${created.message}`);
  const proposalId = created.proposalId;

  const moved = await service.transition({
    schemaVersion: 1, proposalId, toStatus: 'proposed', actorRole: 'child',
  });
  if (moved.ok !== true) throw new Error(`轉 proposed 失敗：${moved.message}`);

  const ai = await service.addPlanVersion({
    schemaVersion: 1,
    proposalId,
    authoredBy: 'ai',
    planTitle: '兩週閱讀挑戰',
    planSummary: '用每週節奏累積閱讀投入',
    purposeCategory: 'D',
    completionDescription: '完成一次約定的閱讀時段',
    progressModel: 'weekly_rhythm',
    nextStep: '拿出想讀的那本書，先讀大約 15 分鐘',
    cadence: { mode: 'weekly_frequency', weeklyFrequency: 4 },
    estimatedMinutes: 15,
    durationType: 'long_term',
    durationDays: 14,
    reward: {
      policy: 'coin_eligible', eligibility: 'allowed',
      policyVersion: 'coin-policy-1.0.0', aiSuggestedCoinAmount: 10,
    },
    taskPolicyVersion: 'task-taxonomy-2026-07',
    aiSnapshot: { source: 'p0-8m-isolated' },
    aiModel: 'p0-8m-iso',
    aiRequestId: `p0-8m-iso:${proposalId}`,
  });
  if (ai.ok !== true) throw new Error(`建立 AI 版本失敗：${ai.message}`);

  // command builder 會逐項檢查 lineage 與狀態，所以要餵**真正的 row**，
  // 不是只有 id 的替身 —— 替身會直接被判成「沒有可調整的完整計畫」。
  const revised = await service.revisePlan(
    await cardOf(proposalId),
    {
      cadenceMode: 'weekly_frequency',
      cadenceWeeklyFrequency: 3,
      cadenceDays: null,
      preferredTime: 'before_bed',
      preferredTimeCustom: null,
      completionDescription: '完成一次約定的閱讀時段',
    },
  );
  if (revised.ok !== true) throw new Error(`家長調整失敗：${revised.message}`);

  const accepted = await service.acceptReview(
    await reviewOf(proposalId), '6-9',
  );
  if (accepted.ok !== true) throw new Error(`孩子接受失敗：${accepted.message}`);

  const { data: proposal } = await supabase
    .from('child_proposals').select('*').eq('id', proposalId).single();
  if (!proposal?.task_id) throw new Error('接受後沒有正式任務');

  return {
    proposalId,
    aiVersionId: ai.planVersionId,
    parentVersionId: revised.planVersionId,
    taskId: proposal.task_id,
  };
}

async function openRequest(plan: SharedPlan, basedOn: string) {
  const created = await service.createAdjustmentRequest({
    schemaVersion: 1,
    proposalId: plan.proposalId,
    expectedPlanVersionId: basedOn,
    adjustmentKind: 'preferred_time',
    reason: '這週回顧後，我想改成晚餐後試試看。',
    requestedChanges: { preferredTime: 'after_dinner', preferredTimeCustom: null },
    clientRequestId: crypto.randomUUID(),
  });
  if (created.ok !== true) throw new Error(`建立請求失敗：${created.message}`);
  return created.adjustmentRequestId;
}

type World = {
  requests: number;
  versions: number;
  taskTime: string | null;
  currentVersionId: string | null;
  goalWindow: string | null;
  completions: number;
  transactions: number;
  balance: number;
};

async function world(plan: SharedPlan): Promise<World> {
  const { count: requests } = await supabase
    .from('child_proposal_adjustment_requests')
    .select('id', { count: 'exact', head: true }).eq('proposal_id', plan.proposalId);
  const { count: versions } = await supabase
    .from('child_proposal_plan_versions')
    .select('id', { count: 'exact', head: true }).eq('proposal_id', plan.proposalId);
  const { data: task } = await supabase
    .from('tasks').select('preferred_time').eq('id', plan.taskId).single();
  const { data: proposal } = await supabase
    .from('child_proposals').select('current_plan_version_id')
    .eq('id', plan.proposalId).single();
  const { data: goal } = await supabase
    .from('long_term_goals').select('preferred_time_window')
    .eq('task_id', plan.taskId).maybeSingle();
  const { count: completions } = await supabase
    .from('task_completions').select('id', { count: 'exact', head: true })
    .eq('child_id', childId);
  const { data: wallet } = await supabase
    .from('wallets').select('id, balance').eq('child_id', childId).single();
  const { count: transactions } = await supabase
    .from('transactions').select('id', { count: 'exact', head: true })
    .eq('wallet_id', wallet!.id);

  return {
    requests: requests ?? -1,
    versions: versions ?? -1,
    taskTime: task?.preferred_time ?? null,
    currentVersionId: proposal?.current_plan_version_id ?? null,
    goalWindow: goal?.preferred_time_window ?? null,
    completions: completions ?? -1,
    transactions: transactions ?? -1,
    balance: wallet?.balance ?? -1,
  };
}

function expectUntouched(before: World, after: World) {
  expect(after).toEqual(before);
}

suite('P0-8M · 隔離家庭的破壞性驗收', () => {
  beforeAll(async () => {
    if (!ISO_EMAIL || !ISO_PASSWORD) throw new Error('缺少隔離家長憑證');
    await signInIso();
    const { data: family, error } = await supabase
      .from('families').select('id').eq('family_name', 'P0-8M Verify Family').single();
    if (error || !family) throw new Error(`找不到隔離家庭：${error?.message}`);
    familyId = family.id;
    const { data: child } = await supabase
      .from('children').select('id').eq('family_id', familyId).single();
    childId = child!.id;
  });

  afterAll(async () => { await supabase.auth.signOut(); });

  // ── §14 invalid request ──────────────────────────────────────────────
  describe('§14 不合法的請求一律 zero-write', () => {
    let plan: SharedPlan;
    let before: World;

    beforeAll(async () => {
      plan = await buildSharedPlan('我想每天讀一點書（§14）');
      before = await world(plan);
    });

    const cases: Array<{ name: string; patch: Record<string, unknown>; code?: string }> = [
      {
        name: 'stale expectedPlanVersionId → STALE_PLAN_VERSION',
        patch: { expectedPlanVersionId: '00000000-0000-4000-8000-000000000099' },
        code: 'STALE_PLAN_VERSION',
      },
      {
        name: '同值 → NO_MATERIAL_CHANGE',
        patch: { requestedChanges: { preferredTime: 'before_bed', preferredTimeCustom: null } },
        code: 'NO_MATERIAL_CHANGE',
      },
      {
        name: 'requestedChanges 多帶欄位 → blocked',
        patch: {
          requestedChanges: {
            preferredTime: 'after_dinner', preferredTimeCustom: null,
            cadenceWeeklyFrequency: 5,
          },
        },
      },
      {
        name: 'preferredTime 是 object → blocked',
        patch: { requestedChanges: { preferredTime: { v: 'after_dinner' }, preferredTimeCustom: null } },
      },
      {
        name: 'preferredTime 是 array → blocked',
        patch: { requestedChanges: { preferredTime: ['after_dinner'], preferredTimeCustom: null } },
      },
      {
        name: '不支援的 enum → blocked',
        patch: { requestedChanges: { preferredTime: 'after_school', preferredTimeCustom: null } },
      },
      {
        name: '不支援的 adjustment kind → 不進 P0-8M workflow',
        patch: { adjustmentKind: 'reward' },
      },
    ];

    it.each(cases)('$name', async ({ patch, code }) => {
      const result = await service.createAdjustmentRequest({
        schemaVersion: 1,
        proposalId: plan.proposalId,
        expectedPlanVersionId: plan.parentVersionId,
        adjustmentKind: 'preferred_time',
        reason: '測試用',
        requestedChanges: { preferredTime: 'after_dinner', preferredTimeCustom: null },
        ...patch,
      } as never);

      expect(result.ok).toBe(false);
      if (result.ok === false && code) {
        expect([result.code, result.reason]).toContain(code);
      }
      expectUntouched(before, await world(plan));
    });

    it('提案不是 active 時也擋掉', async () => {
      // 還停在 proposed 的提案：有版本、沒有共同計畫，也沒有正式任務。
      // （active 的提案不能用 close_unsuitable 收掉 —— 那是給還沒成立的想法用的。）
      const created = await service.create({
        schemaVersion: 1,
        childId,
        childOriginalGoal: '我想學摺紙（§14 non-active）',
        childOriginalMotivation: '想摺一隻紙鶴',
        cadence: { mode: 'weekly_frequency', weeklyFrequency: 2 },
        childRewardPreference: 'just_record',
      });
      expect(created.ok).toBe(true);
      if (created.ok !== true) return;
      const moved = await service.transition({
        schemaVersion: 1, proposalId: created.proposalId,
        toStatus: 'proposed', actorRole: 'child',
      });
      expect(moved.ok).toBe(true);
      const { data: proposal } = await supabase
        .from('child_proposals').select('current_plan_version_id')
        .eq('id', created.proposalId).single();

      const result = await service.createAdjustmentRequest({
        schemaVersion: 1,
        proposalId: created.proposalId,
        expectedPlanVersionId:
          proposal?.current_plan_version_id ?? '00000000-0000-4000-8000-0000000000aa',
        adjustmentKind: 'preferred_time',
        reason: '測試用',
        requestedChanges: { preferredTime: 'after_dinner', preferredTimeCustom: null },
      });
      expect(result.ok).toBe(false);
    });
  });

  // ── §28 decline ──────────────────────────────────────────────────────
  describe('§28 家長選「先維持原本」', () => {
    let plan: SharedPlan;
    let requestId = '';
    let before: World;

    beforeAll(async () => {
      plan = await buildSharedPlan('我想睡前讀一本故事書（§28）');
      requestId = await openRequest(plan, plan.parentVersionId);
      before = await world(plan);
    });

    it('request 變 declined，其餘一律不動', async () => {
      const result = await service.declineAdjustment({
        schemaVersion: 1, adjustmentRequestId: requestId,
      });
      expect(result.ok).toBe(true);

      const { data: row } = await supabase
        .from('child_proposal_adjustment_requests').select('*').eq('id', requestId).single();
      expect(row!.status).toBe('declined');
      expect(row!.resolved_at).not.toBeNull();
      expect(row!.resolved_plan_version_id).toBeNull();

      const after = await world(plan);
      expect(after.versions).toBe(before.versions);
      expect(after.taskTime).toBe('before_bed');
      expect(after.currentVersionId).toBe(before.currentVersionId);
      expect(after.goalWindow).toBe(before.goalWindow);
      expect(after.completions).toBe(before.completions);
      expect(after.transactions).toBe(before.transactions);
      expect(after.balance).toBe(before.balance);
    });

    it('家長卡片消失', async () => {
      const cards = await service.listOpenAdjustmentsForParent({ familyId, childId });
      expect(cards.filter(c => c.request.id === requestId)).toEqual([]);
    });
  });

  // ── §29 stale accept ─────────────────────────────────────────────────
  //
  // 「request 還 open、但 current 已經越過它的 based_on」在這個 schema 裡做不出來：
  // active 共同計畫唯一能推進版本的路徑就是 accept，而 accept 會把那張 request
  // 一併結案；同一個 based_on 又只允許一張 open。
  //
  // 真正**可達**的 stale 是另一種：家長的畫面停在舊版本，送 accept 時帶的
  // expectedPlanVersionId 已經不是 current 了。那正是 UI 沒重新整理的樣子。
  describe('§29 帶著過期的 expectedPlanVersionId 來 accept', () => {
    let plan: SharedPlan;
    let staleVersionId = '';
    let freshRequestId = '';

    beforeAll(async () => {
      plan = await buildSharedPlan('我想每週讀三次（§29）');
      staleVersionId = plan.parentVersionId;

      // 先合法推進一次：current 從 V2 前進到 V3。
      const first = await openRequest(plan, staleVersionId);
      const accepted = await service.acceptAdjustment({
        schemaVersion: 1,
        adjustmentRequestId: first,
        expectedPlanVersionId: staleVersionId,
      });
      if (accepted.ok !== true) throw new Error(`推進版本失敗：${accepted.message}`);

      // 再開一張 open 的請求，based_on 是新的 current。
      const { data: proposal } = await supabase
        .from('child_proposals').select('current_plan_version_id')
        .eq('id', plan.proposalId).single();
      freshRequestId = await service.createAdjustmentRequest({
        schemaVersion: 1,
        proposalId: plan.proposalId,
        expectedPlanVersionId: proposal!.current_plan_version_id!,
        adjustmentKind: 'preferred_time',
        reason: '再改回睡前試試看',
        requestedChanges: { preferredTime: 'before_bed', preferredTimeCustom: null },
        clientRequestId: crypto.randomUUID(),
      }).then(r => {
        if (r.ok !== true) throw new Error(`建立第二張請求失敗：${r.message}`);
        return r.adjustmentRequestId;
      });
    });

    it('回 STALE_PLAN_VERSION，而且 zero writes', async () => {
      const before = await world(plan);
      const result = await service.acceptAdjustment({
        schemaVersion: 1,
        adjustmentRequestId: freshRequestId,
        expectedPlanVersionId: staleVersionId,
      });
      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect([result.code, result.reason]).toContain('STALE_PLAN_VERSION');
      }
      expectUntouched(before, await world(plan));
    });
  });

  // ── §30 concurrency ──────────────────────────────────────────────────
  describe('§30 兩個 accept 同時進來', () => {
    let plan: SharedPlan;
    let requestId = '';

    beforeAll(async () => {
      plan = await buildSharedPlan('我想晚餐後讀書（§30）');
      requestId = await openRequest(plan, plan.parentVersionId);
    });

    it('只成立一版，另一個是 typed replay / stale，lineage 不分岔', async () => {
      const command = {
        schemaVersion: 1 as const,
        adjustmentRequestId: requestId,
        expectedPlanVersionId: plan.parentVersionId,
      };
      const [a, b] = await Promise.all([
        service.acceptAdjustment(command),
        service.acceptAdjustment(command),
      ]);

      const oks = [a, b].filter(r => r.ok === true);
      expect(oks.length).toBeGreaterThanOrEqual(1);

      // 不論兩邊各自回什麼，DB 只能有一個新版本。
      const { data: versions } = await supabase
        .from('child_proposal_plan_versions').select('id, version_no, adopted_from_plan_version_id')
        .eq('proposal_id', plan.proposalId).order('version_no');
      expect(versions).toHaveLength(3);

      // lineage 不分岔：沒有兩個版本認同一個父親。
      const parents = (versions ?? [])
        .map(v => v.adopted_from_plan_version_id).filter(Boolean);
      expect(new Set(parents).size).toBe(parents.length);

      const { data: events } = await supabase
        .from('child_proposal_status_events').select('id')
        .eq('proposal_id', plan.proposalId)
        .eq('plan_version_id', versions![2].id);
      expect(events).toHaveLength(1);

      const failures = [a, b].filter(r => r.ok !== true);
      failures.forEach(f => {
        if (f.ok === false) {
          expect(['STALE_PLAN_VERSION', 'ADJUSTMENT_ALREADY_RESOLVED'])
            .toContain(f.reason ?? f.code);
        }
      });
    });
  });

  // ── §31 unauthorized family ─────────────────────────────────────────
  describe('§31 別的家庭動不了這張請求', () => {
    let plan: SharedPlan;
    let requestId = '';
    let before: World;

    beforeAll(async () => {
      await signInIso();
      plan = await buildSharedPlan('我想讀繪本（§31）');
      requestId = await openRequest(plan, plan.parentVersionId);
      before = await world(plan);
      // 換成**另一個真正的 authenticated 家長**（Demo 家庭），不是同一個 session。
      await signInDemo();
    });

    afterAll(async () => { await signInIso(); });

    it('list 看不到別人家的請求', async () => {
      const cards = await service.listOpenAdjustmentsForParent({ familyId, childId });
      expect(cards).toEqual([]);
    });

    it('連 raw select 都讀不到（RLS 層就擋住）', async () => {
      const { data } = await supabase
        .from('child_proposal_adjustment_requests').select('id').eq('id', requestId);
      expect(data ?? []).toEqual([]);
    });

    it('accept 不得成功', async () => {
      const result = await service.acceptAdjustment({
        schemaVersion: 1,
        adjustmentRequestId: requestId,
        expectedPlanVersionId: plan.parentVersionId,
      });
      expect(result.ok).toBe(false);
    });

    it('decline 不得成功', async () => {
      const result = await service.declineAdjustment({
        schemaVersion: 1, adjustmentRequestId: requestId,
      });
      expect(result.ok).toBe(false);
    });

    it('Family A 的資料一列都沒被寫', async () => {
      await signInIso();
      expectUntouched(before, await world(plan));
      const { data: row } = await supabase
        .from('child_proposal_adjustment_requests').select('status').eq('id', requestId).single();
      expect(row!.status).toBe('open');
    });
  });

  // ── §34 P0-5A direct confirm ────────────────────────────────────────
  describe('§34 P0-5A：fresh AI plan → Direct Confirm 仍然成立', () => {
    it('直接確認建出 canonical task，錢包在完成前是 0', async () => {
      await signInIso();
      const created = await service.create({
        schemaVersion: 1,
        childId,
        childOriginalGoal: '我想每天練十分鐘鋼琴（§34）',
        childOriginalMotivation: '想彈給阿嬤聽',
        cadence: { mode: 'weekly_frequency', weeklyFrequency: 3 },
        childRewardPreference: 'hopes_for_coin',
      });
      expect(created.ok).toBe(true);
      if (created.ok !== true) return;

      const moved = await service.transition({
        schemaVersion: 1, proposalId: created.proposalId,
        toStatus: 'proposed', actorRole: 'child',
      });
      expect(moved.ok).toBe(true);

      const ai = await service.addPlanVersion({
        schemaVersion: 1,
        proposalId: created.proposalId,
        authoredBy: 'ai',
        planTitle: '每週三次的練習節奏',
        planSummary: '先固定節奏，不追進度',
        purposeCategory: 'D',
        completionDescription: '完成一次約定的練習時段',
        progressModel: 'weekly_rhythm',
        nextStep: '打開琴蓋，先彈十分鐘',
        cadence: { mode: 'weekly_frequency', weeklyFrequency: 3 },
        estimatedMinutes: 15,
        durationType: 'long_term',
        durationDays: 14,
        reward: {
          policy: 'coin_eligible', eligibility: 'allowed',
          policyVersion: 'coin-policy-1.0.0', aiSuggestedCoinAmount: 10,
        },
        taskPolicyVersion: 'task-taxonomy-2026-07',
        aiSnapshot: { source: 'p0-8m-iso-34' },
        aiModel: 'p0-8m-iso',
        aiRequestId: `p0-8m-iso-34:${created.proposalId}`,
      });
      expect(ai.ok).toBe(true);
      if (ai.ok !== true) return;

      const { data: card } = await supabase
        .from('child_proposals').select('*').eq('id', created.proposalId).single();
      const { data: version } = await supabase
        .from('child_proposal_plan_versions').select('*').eq('id', ai.planVersionId).single();

      const confirmed = await service.confirmDirect(
        { proposal: card as never, currentPlanVersion: version as never }, '6-9',
      );
      if (confirmed.ok !== true) throw new Error(`Direct Confirm 失敗：${confirmed.message}`);
      expect(confirmed.ok).toBe(true);
      if (confirmed.ok !== true) return;

      const { data: proposal } = await supabase
        .from('child_proposals').select('*').eq('id', created.proposalId).single();
      expect(proposal!.status).toBe('active');
      expect(proposal!.task_id).not.toBeNull();

      const { data: task } = await supabase
        .from('tasks').select('*').eq('id', proposal!.task_id!).single();
      expect(task!.creation_source).toBe('child_proposal');
      expect(task!.weekly_frequency).toBe(3);

      // reward snapshot 確實被複製到共同版本上。
      const { data: current } = await supabase
        .from('child_proposal_plan_versions').select('*')
        .eq('id', proposal!.current_plan_version_id!).single();
      expect(current!.confirmed_source_task_id).toBe(task!.id);
      expect(current!.confirmed_reward_policy).toBe('coin_eligible');
      expect(current!.confirmed_at).not.toBeNull();
    });
  });

  // ── §35 P0-6 completion 與入帳 ──────────────────────────────────────
  describe('§35 P0-6：共同計畫上的完成仍然成立且正常入帳', () => {
    it('complete_task 成功，wallet 與 transaction 各 +1 筆', async () => {
      await signInIso();
      const plan = await buildSharedPlan('我想每週讀三次書（§35）');

      const { data: task } = await supabase
        .from('tasks').select('*').eq('id', plan.taskId).single();
      const { data: goal } = await supabase
        .from('long_term_goals').select('id').eq('task_id', plan.taskId).single();

      const { data: walletBefore } = await supabase
        .from('wallets').select('id, balance').eq('child_id', childId).single();
      const { count: txBefore } = await supabase
        .from('transactions').select('id', { count: 'exact', head: true })
        .eq('wallet_id', walletBefore!.id);

      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
      const result = await completeTask(
        plan.taskId, childId, today, true, task as Task, goal!.id,
      );
      expect(result.completionId).toBeTruthy();

      const { data: walletAfter } = await supabase
        .from('wallets').select('balance').eq('child_id', childId).single();
      const { count: txAfter } = await supabase
        .from('transactions').select('id', { count: 'exact', head: true })
        .eq('wallet_id', walletBefore!.id);

      expect(walletAfter!.balance).toBeGreaterThan(walletBefore!.balance);
      expect(txAfter).toBe((txBefore ?? 0) + 1);

      const { data: completion } = await supabase
        .from('task_completions').select('coin_earned, status')
        .eq('id', result.completionId).single();
      expect(completion!.status).toBe('completed');
      expect(completion!.coin_earned).toBeGreaterThan(0);
    });
  });

  // ── §4 語意測試：今天的完成紀錄仍然優先 ────────────────────────────
  describe('§4 今天已完成時，「今天預計」保留當天實際時段', () => {
    it('共同版本已是 after_dinner，但今天的 completion evidence 仍是 before_bed', async () => {
      await signInIso();
      const plan = await buildSharedPlan('我想睡前讀二十分鐘（§4）');

      const { data: task } = await supabase
        .from('tasks').select('*').eq('id', plan.taskId).single();
      const { data: goal } = await supabase
        .from('long_term_goals').select('id').eq('task_id', plan.taskId).single();

      // 今天先以 before_bed 完成一次。
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
      const done = await completeTask(
        plan.taskId, childId, today, true, task as Task, goal!.id,
      );
      // 用 App 真正的寫入路徑記錄時段，不要自己 update ——
      // 這一欄的寫入本來就只有這一條路。
      await recordCompletionContext(done.completionId, 'before_bed', null);

      // 然後才談定 after_dinner。
      const requestId = await openRequest(plan, plan.parentVersionId);
      const accepted = await service.acceptAdjustment({
        schemaVersion: 1,
        adjustmentRequestId: requestId,
        expectedPlanVersionId: plan.parentVersionId,
      });
      expect(accepted.ok).toBe(true);

      // 共同計畫三處都必須已經是 after_dinner。
      const after = await world(plan);
      expect(after.taskTime).toBe('after_dinner');
      expect(after.goalWindow).toBe('after_dinner');
      const { data: current } = await supabase
        .from('child_proposal_plan_versions').select('preferred_time')
        .eq('id', after.currentVersionId!).single();
      expect(current!.preferred_time).toBe('after_dinner');

      // 但今天那筆完成紀錄仍然誠實記著 before_bed —— 這是歷史，不該被改寫。
      const { data: completion } = await supabase
        .from('task_completions').select('planned_time_window')
        .eq('id', done.completionId).single();
      expect(completion!.planned_time_window).toBe('before_bed');
    });
  });
});
