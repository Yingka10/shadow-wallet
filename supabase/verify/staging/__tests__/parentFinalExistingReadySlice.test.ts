// staging 驗收 — P1-PARENT-FINAL，針對一筆已經真實 publish 過、卡在 proposed
// 沒人確認的 child-planning 提案，補跑「家長看到 → 確認 → Direct Agreement」
// 那一段。不重跑 planning session（省真實 Gemini 配額，那一段已經被
// childGoalPlanningLiveSmoke 與這一輪的另一支測試證過）。
//
// 跑法（預設 skip）：
//   STAGING_PARENT_FINAL_EXISTING=1 PARENT_FINAL_PROPOSAL_ID=<uuid> \
//   EXPO_PUBLIC_APP_ENV=staging EXPO_PUBLIC_SUPABASE_URL=... EXPO_PUBLIC_SUPABASE_ANON_KEY=... \
//   EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF=<staging-ref> \
//   STAGING_PARENT_EMAIL=demo.parent@growbook-demo.invalid STAGING_PARENT_PASSWORD=... \
//   npx jest supabase/verify/staging/__tests__/parentFinalExistingReadySlice

import { supabase } from '../../../../src/lib/supabase';
import { SupabaseChildProposalService } from '../../../../src/lib/childProposal/childProposalService';
import { resolveConfirmRoute } from '../../../../src/lib/childPlanning/parentAgreement';
import { presentParentProposal } from '../../../../src/screens/parent/tablet/home/parentProposalPresentation';
import type { ParentProposalCardData } from '../../../../src/lib/childProposal/types';

const RUN = process.env.STAGING_PARENT_FINAL_EXISTING === '1';
const suite = RUN ? describe : describe.skip;

const EMAIL = process.env.STAGING_PARENT_EMAIL ?? '';
const PASSWORD = process.env.STAGING_PARENT_PASSWORD ?? '';
const PROPOSAL_ID = process.env.PARENT_FINAL_PROPOSAL_ID ?? '';

jest.setTimeout(60_000);

suite('P1-PARENT-FINAL staging — 既有 ready child-planning 提案的家長確認段', () => {
  const proposalService = new SupabaseChildProposalService();
  let childId = '';
  let familyId = '';
  let childName = '';
  let taskId = '';
  let card: ParentProposalCardData;

  beforeAll(async () => {
    if (!PROPOSAL_ID) throw new Error('缺 PARENT_FINAL_PROPOSAL_ID');
    const auth = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (auth.error) throw new Error(`登入失敗：${auth.error.message}`);

    const { data: proposalRow, error } = await supabase
      .from('child_proposals').select('family_id,child_id').eq('id', PROPOSAL_ID).maybeSingle();
    if (error || !proposalRow) throw new Error('讀不到目標提案');
    familyId = proposalRow.family_id;
    childId = proposalRow.child_id;

    const { data: childRow } = await supabase
      .from('children').select('nickname').eq('id', childId).maybeSingle();
    childName = (childRow?.nickname as string) ?? '孩子';
  });

  afterAll(async () => {
    console.log(`\n  [staging] 待清理 proposal=${PROPOSAL_ID} task=${taskId}\n`);
    await supabase.auth.signOut();
  });

  it('BEFORE — 家長首頁：route 是 child_planning_plan，卡片是 ready 的完整結構化計畫', async () => {
    const cards = await proposalService.listProposedForParent({ familyId, childId });
    const found = cards.find((c) => c.proposal.id === PROPOSAL_ID);
    expect(found).toBeDefined();
    card = found!;

    const route = resolveConfirmRoute(card);
    expect(route).toBe('child_planning_plan');

    const view = presentParentProposal(card, childName);
    console.log('\n  ══════════ BEFORE 確認：presentParentProposal 輸出 ══════════');
    console.log(JSON.stringify(view, null, 2));
    console.log('══════════════════════════════════════════════════════════\n');

    expect(view.state).toBe('child_plan');
    expect(view.canConfirm).toBe(true);
    expect(view.confirmLabel).toBe('確認這份約定');
    expect(view.childPlan).not.toBeNull();
    expect(view.sharedDecisions).toEqual([]);
    expect(view.statusLabel).toBe('孩子已經想好怎麼做');
    // 這就是這一包要證的事：真實 child-planning 提案永遠走不到 legacy 的 fallback 文案。
    expect(view.waitingMessage).not.toBe('GrowBook 還在整理，目前先看看孩子的原始想法');
  });

  it('確認這份約定 → confirm_child_planning_proposal_v1 → canonical task/goal', async () => {
    const ageGroup = await proposalService.getChildAgeGroup(childId);
    if (!ageGroup) throw new Error('讀不到孩子年齡段');

    const result = await proposalService.confirmChildPlanAgreement(card, ageGroup);
    if (!result.ok) throw new Error(`確認失敗：${result.code}/${result.reason}｜${result.message}`);
    expect(result.proposalId).toBe(PROPOSAL_ID);
    taskId = result.taskId;
    console.log('\n  [staging] Direct Agreement 結果：', JSON.stringify(result, null, 2), '\n');
  });

  it('AFTER — 這筆離開待確認清單；proposal active；恰好一個 task 一個 goal', async () => {
    const cards = await proposalService.listProposedForParent({ familyId, childId });
    console.log('\n  ══════════ AFTER：待確認清單（不應再含這筆） ══════════');
    console.log(JSON.stringify(cards.map((c) => c.proposal.id), null, 2));
    console.log('══════════════════════════════════════════════════════\n');
    expect(cards.map((c) => c.proposal.id)).not.toContain(PROPOSAL_ID);

    const proposal = await proposalService.getProposal(PROPOSAL_ID);
    expect(proposal!.status).toBe('active');
    expect(proposal!.task_id).toBe(taskId);

    const { data: tasks } = await supabase.from('tasks').select('*').eq('id', taskId);
    expect(tasks).toHaveLength(1);
    const task = tasks![0];
    console.log('\n  ══════════ AFTER：正式任務 ══════════');
    console.log(JSON.stringify({
      name: task.name, schedule_mode: task.schedule_mode,
      weekly_frequency: task.weekly_frequency, progress_model: task.progress_model,
      reward_policy: task.reward_policy, payout_basis: task.payout_basis,
      claim_period: task.claim_period, max_claims_per_period: task.max_claims_per_period,
      reward_coin_amount: task.reward_coin_amount, creation_source: task.creation_source,
    }, null, 2));
    console.log('══════════════════════════════════════\n');

    const { data: goals } = await supabase.from('long_term_goals').select('*').eq('task_id', taskId);
    expect(goals).toHaveLength(1);

    const { data: assignments } = await supabase.from('child_tasks').select('*').eq('task_id', taskId);
    expect(assignments).toHaveLength(1);
    expect(assignments![0].is_active).toBe(true);
  });
});
