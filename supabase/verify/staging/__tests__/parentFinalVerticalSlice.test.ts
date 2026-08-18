// staging 驗收 — P1-PARENT-FINAL：Child-confirmed Plan → Parent Review 完整 vertical slice。
//
// ─────────────────────────────────────────────────────────────────────────
// P1-A2/A3（childGoalPlanningLiveSmoke）已經證明真實 Gemini 走得到
// publish_child_confirmed_plan_v1。P1-A4A（parentAgreement/*）已經證明
// route/presentation/confirm 邏輯本身是對的（jest 單元測試）。
//
// 這一支補的是兩者之間、從沒有人用真實 staging 資料走過的那一段：
//   publish 完的那一版 → 家長首頁真的 listProposedForParent 讀得到
//   → presentParentProposal 真的算出 'child_plan'（不是 fallback）
//   → 家長按「確認這份約定」→ confirm_child_planning_proposal_v1
//   → 真的多出一個 canonical task / long_term_goal。
//
// 跑法（預設 skip，需要 staging 憑證與真實 Gemini 配額）：
//   STAGING_PARENT_FINAL=1 \
//   EXPO_PUBLIC_APP_ENV=staging \
//   EXPO_PUBLIC_SUPABASE_URL=https://<staging-ref>.supabase.co \
//   EXPO_PUBLIC_SUPABASE_ANON_KEY=... \
//   EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF=<staging-ref> \
//   EXPO_PUBLIC_CHILD_GOAL_PLANNING_AI_MODE=live \
//   EXPO_PUBLIC_CHILD_PROPOSAL_AI_MODE=live \
//   STAGING_PARENT_EMAIL=demo.parent@growbook-demo.invalid \
//   STAGING_PARENT_PASSWORD=... \
//   npx jest supabase/verify/staging/__tests__/parentFinalVerticalSlice
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from '../../../../src/lib/supabase';
import { SupabaseChildProposalService } from '../../../../src/lib/childProposal/childProposalService';
import { createPlanDraftClientSetup } from '../../../../src/lib/childProposal/planDraft';
import {
  ChildFormalPlanService,
  ChildPlanningSessionService,
  buildChildGoalPlanningInput,
  createChildGoalPlanningClientSetup,
  publishChildConfirmedPlan,
  type ChildGoalPlanningResult,
  type ChildPlanningResponse,
} from '../../../../src/lib/childPlanning';
import { resolveConfirmRoute } from '../../../../src/lib/childPlanning/parentAgreement';
import { toPlanningRequest } from '../../../../src/screens/child/childProposal/toPlanningRequest';
import { createChildProposalDraft } from '../../../../src/screens/child/childProposal/submitChildProposal';
import { presentParentProposal } from '../../../../src/screens/parent/tablet/home/parentProposalPresentation';
import type { ParentProposalCardData } from '../../../../src/lib/childProposal/types';

const RUN = process.env.STAGING_PARENT_FINAL === '1';
const suite = RUN ? describe : describe.skip;

const EMAIL = process.env.STAGING_PARENT_EMAIL ?? '';
const PASSWORD = process.env.STAGING_PARENT_PASSWORD ?? '';

jest.setTimeout(180_000);

suite('P1-PARENT-FINAL staging — Child-confirmed Plan → Parent Review', () => {
  const proposalService = new SupabaseChildProposalService();
  const planningService = new ChildPlanningSessionService();
  const formalPlanService = new ChildFormalPlanService();

  let childId = '';
  let familyId = '';
  let childName = '';
  let proposalId = '';
  let sessionId = '';
  let publishedPlanVersionId = '';
  let taskId = '';

  beforeAll(async () => {
    const auth = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (auth.error) throw new Error(`登入失敗：${auth.error.message}`);

    const { data: kids, error: kidsError } = await supabase
      .from('children').select('id,family_id,nickname').limit(1);
    if (kidsError || !kids?.length) throw new Error('讀不到孩子');
    childId = kids[0].id as string;
    familyId = kids[0].family_id as string;
    childName = (kids[0].nickname as string) ?? '孩子';

    const created = await createChildProposalDraft(proposalService, {
      schemaVersion: 1,
      childId,
      childOriginalGoal: '我想把閱讀變成一個可以持續的計畫',
      childOriginalMotivation: '想在開學前把讀書變成習慣',
      cadence: { mode: 'weekly_frequency', weeklyFrequency: 3 },
      childRewardPreference: 'hopes_for_coin',
    });
    if (!created.ok) throw new Error(`建立 draft 失敗：${created.message}`);
    proposalId = created.proposalId;

    const session = await planningService.start({ proposalId });
    if (!session.ok) throw new Error(`開始規劃失敗：${session.code} ${session.message}`);
    sessionId = session.sessionId;
  });

  afterAll(async () => {
    if (taskId) console.log(`\n  [staging] 待清理 proposal=${proposalId} task=${taskId}\n`);
    await supabase.auth.signOut();
  });

  it('AI mode 兩邊都真的是 live', () => {
    const planningSetup = createChildGoalPlanningClientSetup(
      process.env.EXPO_PUBLIC_CHILD_GOAL_PLANNING_AI_MODE,
    );
    expect(planningSetup.resolution.mode).toBe('live');
    const enrichmentSetup = createPlanDraftClientSetup(
      process.env.EXPO_PUBLIC_CHILD_PROPOSAL_AI_MODE,
    );
    expect(enrichmentSetup.resolution.mode).toBe('live');
  });

  // ── 孩子原本怎麼說 → GrowBook 整理 ──────────────────────────────────────
  it('start → 真實 Gemini rounds → ready → confirm', async () => {
    const planningClient = createChildGoalPlanningClientSetup(
      process.env.EXPO_PUBLIC_CHILD_GOAL_PLANNING_AI_MODE,
    ).client;
    if (!planningClient) throw new Error('planning client 是 null');

    const proposal = await proposalService.getProposal(proposalId);
    if (!proposal) throw new Error('讀不到 proposal');
    const ageGroup = await proposalService.getChildAgeGroup(proposal.child_id);
    if (!ageGroup) throw new Error('讀不到孩子年齡段');

    const childApproach = '一週三次，每次讀15分鐘，晚餐後看書，今天先讀15分鐘';

    let responses: ChildPlanningResponse[] = [];
    let revision = 0;
    let result: ChildGoalPlanningResult | null = null;
    const MAX_ROUNDS = 5;

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const input = buildChildGoalPlanningInput(
        toPlanningRequest(proposal, {
          ageGroup,
          planningSupportPreference: 'organize_only',
          childApproach,
          responses,
        }),
      );
      if (input === null) throw new Error('組不出 planning input');

      result = await planningClient.requestPlan(input);
      console.log(`\n  [staging] round ${round} status = ${result.status}`);

      const childResponse: ChildPlanningResponse | undefined =
        result.status === 'needs_clarification'
          ? {
              type: 'clarification_answer',
              questionKind: result.question.kind,
              question: result.question.text,
              answer: childApproach,
            }
          : result.status === 'needs_choice'
            ? {
                type: 'choice_selection',
                optionId: result.options[0].id,
                optionText: result.options[0].text,
              }
            : undefined;

      const persisted = await planningService.recordRound({
        sessionId,
        expectedRevision: revision,
        ...(childResponse ? { childResponse } : {}),
        result,
      });
      if (!persisted.ok) throw new Error(`recordRound 失敗：${persisted.code} ${persisted.message}`);
      revision = persisted.revision;

      if (result.status === 'ready') break;
      if (childResponse) responses = [...responses, childResponse];
    }

    if (result?.status !== 'ready') {
      throw new Error(`沒有在 ${MAX_ROUNDS} 輪內拿到 ready（最後狀態：${result?.status}）`);
    }
    console.log('\n  [staging] 真實計畫：', JSON.stringify(result.plan, null, 2), '\n');

    const confirmed = await planningService.confirm({ sessionId, expectedRevision: revision });
    if (!confirmed.ok) throw new Error(`確認失敗：${confirmed.code} ${confirmed.message}`);
    expect(confirmed.status).toBe('child_confirmed');
  });

  // ── GrowBook 整理好的 child-confirmed plan ──────────────────────────────
  it('publish → 真實 enrichment → 正式 child-authored plan version', async () => {
    const enrichmentClient = createPlanDraftClientSetup(
      process.env.EXPO_PUBLIC_CHILD_PROPOSAL_AI_MODE,
    ).client;

    const published = await publishChildConfirmedPlan(
      {
        port: {
          getProposal: (id) => proposalService.getProposal(id),
          getChildAgeGroup: (id) => proposalService.getChildAgeGroup(id),
          publish: (args) => formalPlanService.publish(args),
        },
        enrichmentClient,
      },
      { proposalId, sessionId },
    );
    if (!published.ok) {
      throw new Error(`publish 失敗：${published.code} ${published.reason ?? ''} ${published.message}`);
    }
    expect(published.authoredBy).toBe('child');
    expect(published.proposalStatus).toBe('proposed');
    publishedPlanVersionId = published.planVersionId;
    console.log('\n  [staging] publish 結果：', JSON.stringify(published, null, 2), '\n');
  });

  // ── BEFORE：家長首頁讀到的，是不是已經是完整結構化的卡片（不是 fallback）──
  let beforeCard: ParentProposalCardData;

  it('BEFORE — 家長首頁：route 是 child_planning_plan，卡片是 ready，不是「GrowBook 還在整理」', async () => {
    const cards = await proposalService.listProposedForParent({ familyId, childId });
    const found = cards.find((c) => c.proposal.id === proposalId);
    expect(found).toBeDefined();
    beforeCard = found!;

    expect(beforeCard.currentPlanVersion?.id).toBe(publishedPlanVersionId);
    const route = resolveConfirmRoute(beforeCard);
    expect(route).toBe('child_planning_plan');

    const view = presentParentProposal(beforeCard, childName);
    console.log('\n  [BEFORE 確認] presentParentProposal 輸出：', JSON.stringify(view, null, 2), '\n');

    expect(view.state).toBe('child_plan');
    expect(view.canConfirm).toBe(true);
    expect(view.confirmLabel).toBe('確認這份約定');
    expect(view.childPlan).not.toBeNull();
    expect(view.waitingMessage).not.toBe('GrowBook 還在整理，目前先看看孩子的原始想法');
    expect(view.statusLabel).toBe('孩子已經想好怎麼做');
  });

  // ── 家長確認 → Direct Agreement ─────────────────────────────────────────
  it('確認這份約定 → confirm_child_planning_proposal_v1 → canonical task/goal', async () => {
    const proposal = await proposalService.getProposal(proposalId);
    const ageGroup = await proposalService.getChildAgeGroup(proposal!.child_id);
    if (!ageGroup) throw new Error('讀不到孩子年齡段');

    const result = await proposalService.confirmChildPlanAgreement(beforeCard, ageGroup);
    if (!result.ok) {
      throw new Error(`確認失敗：${result.code}/${result.reason}｜${result.message}`);
    }
    expect(result.proposalId).toBe(proposalId);
    expect(result.sourcePlanVersionId).toBe(publishedPlanVersionId);
    taskId = result.taskId;
    console.log('\n  [staging] Direct Agreement 結果：', JSON.stringify(result, null, 2), '\n');
  });

  // ── AFTER：卡片離開待確認清單、proposal active、task/goal 真的建出來 ─────
  it('AFTER — 這筆不再出現在待確認清單；proposal active；恰好一個 task 一個 goal', async () => {
    const cards = await proposalService.listProposedForParent({ familyId, childId });
    expect(cards.map((c) => c.proposal.id)).not.toContain(proposalId);

    const proposal = await proposalService.getProposal(proposalId);
    expect(proposal!.status).toBe('active');
    expect(proposal!.task_id).toBe(taskId);

    const { data: tasks } = await supabase.from('tasks').select('*').eq('id', taskId);
    expect(tasks).toHaveLength(1);
    const task = tasks![0];
    console.log('\n  [AFTER] 正式任務：', JSON.stringify({
      name: task.name, schedule_mode: task.schedule_mode,
      weekly_frequency: task.weekly_frequency, progress_model: task.progress_model,
      reward_policy: task.reward_policy, payout_basis: task.payout_basis,
      claim_period: task.claim_period, max_claims_per_period: task.max_claims_per_period,
      reward_coin_amount: task.reward_coin_amount,
    }, null, 2), '\n');

    const { data: goals } = await supabase.from('long_term_goals').select('*').eq('task_id', taskId);
    expect(goals).toHaveLength(1);

    const { data: assignments } = await supabase.from('child_tasks').select('*').eq('task_id', taskId);
    expect(assignments).toHaveLength(1);
    expect(assignments![0].is_active).toBe(true);
  });
});
