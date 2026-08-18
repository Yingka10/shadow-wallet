// staging 驗證 — P1-AI-FINAL：Child Goal Planning 整條鏈走一次**真的 Gemini**。
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支證明的是 P1-A2／P1-A3 兩包完成之後從沒有人做過的事：
// 孩子的原話 → 真實 ai-proxy（childGoalPlanning）→ 真實 Gemini
//   → start/record/confirm 三支 RPC → publish_child_confirmed_plan_v1
//   → 真實 enrichment（childProposalPlanDraft，另一次真實 Gemini 呼叫）
//   → 一列真的 child_proposal_plan_versions。
//
// 走的是 App 實際會用到的 orchestrator（ChildPlanningSessionService /
// ChildFormalPlanService / publishChildConfirmedPlan / toPlanningRequest），
// 不是重寫一份平行邏輯 —— 這樣才是在測「這條鏈真的接得起來」，不是在測
// 「如果它接起來會怎樣」。
//
// 預設 skip。要跑：
//
//   STAGING_AI_SMOKE=1 \
//   EXPO_PUBLIC_APP_ENV=staging \
//   EXPO_PUBLIC_SUPABASE_URL=https://<staging-ref>.supabase.co \
//   EXPO_PUBLIC_SUPABASE_ANON_KEY=... \
//   EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF=<staging-ref> \
//   EXPO_PUBLIC_CHILD_GOAL_PLANNING_AI_MODE=live \
//   EXPO_PUBLIC_CHILD_PROPOSAL_AI_MODE=live \
//   STAGING_PARENT_EMAIL=... STAGING_PARENT_PASSWORD=... \
//   npx jest supabase/verify/staging/__tests__/childGoalPlanningLiveSmoke
//
// 會真的花掉兩次模型配額（planning + enrichment），在 staging 留下一筆
// child_proposal（草稿走完整個 P1 鏈，最終 proposed）。
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
import { toPlanningRequest } from '../../../../src/screens/child/childProposal/toPlanningRequest';
import { createChildProposalDraft } from '../../../../src/screens/child/childProposal/submitChildProposal';

const RUN = process.env.STAGING_AI_SMOKE === '1';
const suite = RUN ? describe : describe.skip;

const EMAIL = process.env.STAGING_PARENT_EMAIL ?? '';
const PASSWORD = process.env.STAGING_PARENT_PASSWORD ?? '';

jest.setTimeout(180_000);

suite('P1-AI-FINAL staging — Child Goal Planning 真實 Gemini 全鏈', () => {
  const proposalService = new SupabaseChildProposalService();
  const planningService = new ChildPlanningSessionService();
  const formalPlanService = new ChildFormalPlanService();

  let proposalId = '';
  let sessionId = '';
  let publishedPlanVersionId = '';

  beforeAll(async () => {
    const auth = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (auth.error) throw new Error(`登入失敗：${auth.error.message}`);

    const { data: kids, error: kidsError } = await supabase.from('children').select('id').limit(1);
    if (kidsError || !kids?.length) throw new Error('讀不到孩子');
    const childId = kids[0].id as string;

    // 六週閱讀計畫，逐字。
    const created = await createChildProposalDraft(proposalService, {
      schemaVersion: 1,
      childId,
      childOriginalGoal: '我想養成六週的閱讀習慣',
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
    if (proposalId) console.log(`\n  [staging] 待清理 proposal_id = ${proposalId}\n`);
    await supabase.auth.signOut();
  });

  it('兩個 AI mode 都真的解析成 live（否則後面全部沒有意義）', () => {
    const planningSetup = createChildGoalPlanningClientSetup(
      process.env.EXPO_PUBLIC_CHILD_GOAL_PLANNING_AI_MODE,
    );
    expect(planningSetup.resolution.mode).toBe('live');
    expect(planningSetup.client).not.toBeNull();

    const enrichmentSetup = createPlanDraftClientSetup(
      process.env.EXPO_PUBLIC_CHILD_PROPOSAL_AI_MODE,
    );
    expect(enrichmentSetup.resolution.mode).toBe('live');
    expect(enrichmentSetup.client).not.toBeNull();
  });

  it('start → 真實 Gemini rounds → ready → confirm', async () => {
    const planningClient = createChildGoalPlanningClientSetup(
      process.env.EXPO_PUBLIC_CHILD_GOAL_PLANNING_AI_MODE,
    ).client;
    if (!planningClient) throw new Error('planning client 是 null');

    const proposal = await proposalService.getProposal(proposalId);
    if (!proposal) throw new Error('讀不到 proposal');
    const ageGroup = await proposalService.getChildAgeGroup(proposal.child_id);
    if (!ageGroup) throw new Error('讀不到孩子年齡段');

    // 開場：「我有自己的想法」，把 cadence／單次份量／時段／今天的第一步
    // 一次講完 —— 對照 canonical 案例 #1，cadence!==null 且 childApproach
    // 有值時這一輪不該再問，應該直接 ready。
    const childApproach =
      '每次讀15分鐘，晚餐後看書，今天就先讀15分鐘';

    let responses: ChildPlanningResponse[] = [];
    let revision = 0;
    let result: ChildGoalPlanningResult | null = null;
    const MAX_ROUNDS = 5; // 安全上限，session RPC 自己會在 3 輪之後拒絕

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
      if (!persisted.ok) {
        throw new Error(`recordRound 失敗：${persisted.code} ${persisted.message}`);
      }
      revision = persisted.revision;

      if (result.status === 'ready') break;
      if (childResponse) responses = [...responses, childResponse];
      // needs_choice/needs_clarification 以外（unavailable）也再打一次，
      // 直到 session 自己的 attempts 上限擋下來。
    }

    expect(result).not.toBeNull();
    if (result?.status !== 'ready') {
      throw new Error(`沒有在 ${MAX_ROUNDS} 輪內拿到 ready（最後狀態：${result?.status}）`);
    }

    console.log('\n  [staging] 真實計畫：', JSON.stringify(result.plan, null, 2), '\n');

    const confirmed = await planningService.confirm({ sessionId, expectedRevision: revision });
    if (!confirmed.ok) throw new Error(`確認失敗：${confirmed.code} ${confirmed.message}`);
    expect(confirmed.status).toBe('child_confirmed');
    revision = confirmed.revision;
  });

  it('publish → 真實 enrichment → 正式 child_confirmed_plan 版本', async () => {
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

  it('DB 上的正式版本符合驗收條件', async () => {
    const { data: row, error } = await supabase
      .from('child_proposal_plan_versions')
      .select('*')
      .eq('id', publishedPlanVersionId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(row).not.toBeNull();

    console.log('\n  [staging] 正式版本：', JSON.stringify({
      authored_by: row.authored_by,
      source_planning_session_id: row.source_planning_session_id,
      enrichment_status: row.enrichment_status,
      requires_parent_decision: row.requires_parent_decision,
      policy_payout_type: row.policy_payout_type,
      policy_session_coin_reference: row.policy_session_coin_reference,
      purpose_category: row.purpose_category,
      duration_type: row.duration_type,
      plan_title: row.plan_title,
      plan_summary: row.plan_summary,
      next_step: row.next_step,
    }, null, 2), '\n');

    expect(row.authored_by).toBe('child');
    expect(row.source_planning_session_id).toBe(sessionId);
    expect(row.child_confirmed_plan).not.toBeNull();

    const { data: proposalRow } = await supabase
      .from('child_proposals')
      .select('status')
      .eq('id', proposalId)
      .maybeSingle();
    expect(proposalRow?.status).toBe('proposed');

    const { data: sessionRow } = await supabase
      .from('child_goal_planning_sessions')
      .select('status')
      .eq('id', sessionId)
      .maybeSingle();
    expect(sessionRow?.status).toBe('child_confirmed');

    if (row.enrichment_status === 'enriched') {
      expect(row.policy_payout_type).toBe('per_completion');
      expect(typeof row.policy_session_coin_reference).toBe('number');
      if (row.policy_session_coin_reference !== 8) {
        console.warn(
          `\n  ⚠️ policy_session_coin_reference = ${row.policy_session_coin_reference}`
          + '（canonical demo 預期 8，實際值以真實政策計算為準，不代表失敗）\n',
        );
      }
    } else {
      console.warn(
        `\n  ⚠️ enrichment_status = ${row.enrichment_status}，requires_parent_decision = `
        + `${JSON.stringify(row.requires_parent_decision)}\n`,
      );
    }
  });
});
