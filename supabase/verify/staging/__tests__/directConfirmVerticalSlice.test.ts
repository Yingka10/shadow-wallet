// staging 驗收 — P0-5A Parent Direct Confirm 的完整 vertical slice。
//
// ─────────────────────────────────────────────────────────────────────────
// 與 child_proposal_direct_confirm.py 的差別有兩個，兩個都是刻意的：
//
//   1. **AI 計畫是真的。** 那支腳本手工組一份 plan version（aiSnapshot 寫
//      "P0-5A-staging-smoke"）。那驗得到 RPC，但驗不到「家長確認的是模型
//      真的寫出來的那一份」—— 而 duration_days / cadence / purpose_category
//      正是從模型來的，手工填的話等於把要驗的東西自己填對。
//
//   2. **讀取路徑走 App 的真實程式碼**，不是自己下 SQL：家長端用
//      listProposedForParent，孩子端用 useTodayTasks 的同一組 filter，
//      週節奏用 buildGoalPresentation。「DB 有資料」與「畫面讀得到」
//      是兩件事，而後者才是驗收條件。
//
// 跑法（需要 staging 憑證，預設 skip）：
//   STAGING_DIRECT_CONFIRM=1 EXPO_PUBLIC_APP_ENV=staging … npx jest supabase/verify/staging
// ─────────────────────────────────────────────────────────────────────────

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

import { supabase } from '../../../../src/lib/supabase';
import { SupabaseChildProposalService } from '../../../../src/lib/childProposal/childProposalService';
import {
  createPlanDraftClientSetup,
  generateChildProposalPlanDraft,
} from '../../../../src/lib/childProposal/planDraft';
import { isDirectConfirmablePlan } from '../../../../src/lib/childProposal/directConfirm';
import type { ParentProposalCardData } from '../../../../src/lib/childProposal/types';
import { buildGoalPresentation } from '../../../../src/screens/child/longTermGoalPresentation';

dayjs.extend(utc);
dayjs.extend(timezone);

const RUN = process.env.STAGING_DIRECT_CONFIRM === '1';
const suite = RUN ? describe : describe.skip;

const EMAIL = process.env.STAGING_PARENT_EMAIL ?? '';
const PASSWORD = process.env.STAGING_PARENT_PASSWORD ?? '';

jest.setTimeout(180_000);

type Money = { completions: number; transactions: number; balance: number };

async function money(childId: string): Promise<Money> {
  const { count: completions } = await supabase
    .from('task_completions').select('id', { count: 'exact', head: true })
    .eq('child_id', childId);
  const { data: wallets } = await supabase
    .from('wallets').select('id,balance').eq('child_id', childId);
  const ids = (wallets ?? []).map((w) => w.id);
  const { count: transactions } = await supabase
    .from('transactions').select('id', { count: 'exact', head: true })
    .in('wallet_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  return {
    completions: completions ?? 0,
    transactions: transactions ?? 0,
    balance: (wallets ?? []).reduce((sum, w) => sum + (w.balance ?? 0), 0),
  };
}

suite('P0-5A staging — 家長直接確認的完整 vertical slice', () => {
  const service = new SupabaseChildProposalService();
  let childId = '';
  let familyId = '';
  let ageGroup = '';
  let proposalId = '';
  let aiVersionId = '';
  let taskId = '';
  let parentVersionId = '';
  let before: Money;

  beforeAll(async () => {
    const auth = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (auth.error) throw new Error(`登入失敗：${auth.error.message}`);

    const { data: kids } = await supabase
      .from('children').select('id,family_id,age_group').limit(1);
    if (!kids?.length) throw new Error('讀不到孩子');
    childId = kids[0].id;
    familyId = kids[0].family_id;
    ageGroup = kids[0].age_group;

    before = await money(childId);

    const created = await service.create({
      schemaVersion: 1,
      childId,
      childOriginalGoal: '我想兩週把這本書讀完',
      childOriginalMotivation: '因為同學說這本書很好看',
      cadence: { mode: 'weekly_frequency', weeklyFrequency: 4 },
      childRewardPreference: 'hopes_for_coin',
    });
    if (!created.ok) throw new Error(`建立提案失敗：${created.message}`);
    proposalId = created.proposalId;

    const moved = await service.transition({
      schemaVersion: 1, proposalId, toStatus: 'proposed', actorRole: 'child',
    });
    if (!moved.ok) throw new Error(`轉 proposed 失敗：${moved.message}`);
  });

  afterAll(async () => {
    console.log(`\n  [staging] 待清理 proposal=${proposalId} task=${taskId}\n`);
    await supabase.auth.signOut();
  });

  // ── §4 真實 AI Plan ──────────────────────────────────────────────────────
  it('先有一份真的 Gemini 寫的 Plan Draft', async () => {
    const setup = createPlanDraftClientSetup(process.env.EXPO_PUBLIC_CHILD_PROPOSAL_AI_MODE);
    expect(setup.resolution.mode).toBe('live');

    const outcome = await generateChildProposalPlanDraft(
      { client: setup.client, port: service }, proposalId,
    );
    expect(outcome.status).toBe('saved');

    const { data: rows } = await supabase
      .from('child_proposal_plan_versions').select('*').eq('proposal_id', proposalId);
    expect(rows).toHaveLength(1);
    const ai = rows![0];
    aiVersionId = ai.id;

    expect(ai.authored_by).toBe('ai');
    expect(ai.purpose_category).toBe('D');
    expect(ai.progress_model).toBe('weekly_rhythm');
    expect(ai.duration_type).toBe('long_term');
    expect(ai.duration_days).toBe(14);
    expect(ai.cadence_mode).toBe('weekly_frequency');
    expect(ai.cadence_weekly_frequency).toBe(4);
    expect(ai.cadence_days).toBeNull();
    expect(ai.estimated_minutes).toBeGreaterThan(0);
    expect(ai.reward_eligibility).toBe('allowed');
    expect(ai.ai_model).toMatch(/gemini/i);
    // AI 版本不預先猜日期 —— 開始那天由家長確認的那一刻決定。
    expect(ai.start_date).toBeNull();
    expect(ai.end_date).toBeNull();

    console.log('\n  [staging] 真實 AI 計畫：', JSON.stringify({
      model: ai.ai_model, title: ai.plan_title,
      completion: ai.completion_description, next_step: ai.next_step,
      minutes: ai.estimated_minutes, suggested_coin: ai.ai_suggested_coin_amount,
    }, null, 2), '\n');
  });

  // ── §11 確認前的 Parent Home ────────────────────────────────────────────
  let card: ParentProposalCardData;

  it('家長首頁讀得到原話、動機與目前的 AI 計畫，而且可以確認', async () => {
    const cards = await service.listProposedForParent({ familyId, childId });
    const found = cards.find((c) => c.proposal.id === proposalId);
    expect(found).toBeDefined();
    card = found!;

    expect(card.proposal.child_original_goal).toBe('我想兩週把這本書讀完');
    expect(card.proposal.child_original_motivation).toBe('因為同學說這本書很好看');
    expect(card.currentPlanVersion?.id).toBe(aiVersionId);
    expect(isDirectConfirmablePlan(card)).toBe(true);
  });

  // ── §5 Direct Confirm ───────────────────────────────────────────────────
  it('家長確認 → 建立共同版本與正式任務', async () => {
    const result = await service.confirmDirect(card, ageGroup);
    if (!result.ok) throw new Error(`確認失敗：${result.code}/${result.reason}｜${result.message}`);
    taskId = result.taskId;
    parentVersionId = result.planVersionId;
    expect(result.proposalId).toBe(proposalId);
  });

  it('AI 版本原封不動，且只多出一個家長版本', async () => {
    const { data: versions } = await supabase
      .from('child_proposal_plan_versions').select('*')
      .eq('proposal_id', proposalId).order('version_no');
    expect(versions).toHaveLength(2);

    const ai = versions!.find((v) => v.id === aiVersionId)!;
    expect(ai.authored_by).toBe('ai');
    expect(ai.start_date).toBeNull();      // 沒有被回頭改寫
    expect(ai.end_date).toBeNull();
    expect(ai.parent_confirmed_at).toBeNull();

    const parent = versions!.find((v) => v.id === parentVersionId)!;
    expect(parent.authored_by).toBe('parent');
    expect(parent.parent_confirmed_at).not.toBeNull();
    expect(parent.effective_at).not.toBeNull();
    expect(parent.requires_child_review).toBe(false);
    expect(parent.adopted_from_plan_version_id).toBe(aiVersionId);
    expect(parent.ai_request_id).toBeNull();
  });

  it('提案轉 active，並指向這個任務與這個家長版本', async () => {
    const proposal = await service.getProposal(proposalId);
    expect(proposal!.status).toBe('active');
    expect(proposal!.task_id).toBe(taskId);
    expect(proposal!.current_plan_version_id).toBe(parentVersionId);
    expect(proposal!.activated_at).not.toBeNull();
  });

  it('恰好一個正式任務、一個 active 指派、一個長期紀錄', async () => {
    const { data: tasks } = await supabase.from('tasks').select('*').eq('id', taskId);
    expect(tasks).toHaveLength(1);

    const { data: assignments } = await supabase
      .from('child_tasks').select('*').eq('task_id', taskId);
    expect(assignments).toHaveLength(1);
    expect(assignments![0].is_active).toBe(true);
    expect(assignments![0].child_id).toBe(childId);

    const { data: goals } = await supabase
      .from('long_term_goals').select('*').eq('task_id', taskId);
    expect(goals).toHaveLength(1);
  });

  // ── §6 閱讀計畫的真實 mapping ───────────────────────────────────────────
  it('正式任務是彈性週目標，不是固定星期幾', async () => {
    const { data: tasks } = await supabase.from('tasks').select('*').eq('id', taskId);
    const task = tasks![0];
    expect(task.creation_source).toBe('child_proposal');
    expect(task.schedule_mode).toBe('weekly_frequency');
    expect(task.weekly_frequency).toBe(4);
    expect(task.recurrence_days).toBeNull();
    expect(task.progress_model).toBe('weekly_rhythm');
  });

  it('P0-7.1 的呈現真的走彈性週節奏（本週 0/4、沒有星期時間軸）', async () => {
    const { data: tasks } = await supabase.from('tasks').select('*').eq('id', taskId);
    const { data: goals } = await supabase
      .from('long_term_goals').select('*').eq('task_id', taskId);

    const view = buildGoalPresentation(tasks![0], goals![0], []);

    // 本週目標＝孩子選的 4 次。
    expect(view.weekTarget).toBe(4);
    expect(view.weekCompletedActual).toBe(0);
    // 彈性週目標沒有「星期三漏掉」這種概念 —— 沒有逐日時間軸。
    expect(view.weekDays).toEqual([]);
    // 也不該從「一週 4 次」推導出四個固定星期。
    expect(view.weekDays.filter((d) => d.isScheduled)).toEqual([]);
    // 文案講的是次數，不是星期幾。
    expect(view.weekSummary).toMatch(/這週/);
    expect(view.weekSummary).not.toMatch(/週[一二三四五六日]/);
  });

  // ── §7 日期 ─────────────────────────────────────────────────────────────
  it('開始日由 server 以台北時間決定，結束日是 inclusive 第 14 天', async () => {
    const { data: versions } = await supabase
      .from('child_proposal_plan_versions').select('start_date,end_date')
      .eq('id', parentVersionId);
    const { start_date: start, end_date: end } = versions![0];

    const taipeiToday = dayjs().tz('Asia/Taipei').format('YYYY-MM-DD');
    expect(start).toBe(taipeiToday);
    expect(dayjs(end).diff(dayjs(start), 'day')).toBe(13);
    // 含頭含尾正好 14 天。
    expect(dayjs(end).diff(dayjs(start), 'day') + 1).toBe(14);
  });

  // ── §5.10 reward snapshot ───────────────────────────────────────────────
  it('confirmed_* 快照與正式任務的回饋設定逐欄一致', async () => {
    const { data: versions } = await supabase
      .from('child_proposal_plan_versions').select('*').eq('id', parentVersionId);
    const v = versions![0];
    const { data: tasks } = await supabase.from('tasks').select('*').eq('id', taskId);
    const t = tasks![0];

    expect(v.confirmed_source_task_id).toBe(taskId);
    expect(v.confirmed_reward_policy).toBe(t.reward_policy);
    expect(v.confirmed_coin_amount).toBe(t.reward_coin_amount);
    expect(v.confirmed_claim_period).toBe(t.claim_period);
    expect(v.confirmed_max_claims_per_period).toBe(t.max_claims_per_period);
    expect(v.confirmed_reward_policy_version).toBe(t.reward_policy_version);
    expect(v.confirmed_by_user_id).not.toBeNull();
    expect(v.confirmed_at).not.toBeNull();
  });

  // ── §8 建立共同版本 ≠ 發獎勵 ────────────────────────────────────────────
  it('確認本身不發任何幣：完成數、交易數、餘額都沒有變', async () => {
    expect(await money(childId)).toEqual(before);

    const { data: trials } = await supabase
      .from('child_proposal_trial_events').select('id').eq('proposal_id', proposalId);
    expect(trials).toHaveLength(0);
  });

  // ── §9 idempotency ──────────────────────────────────────────────────────
  it('再確認一次：同一個任務、同一條版本血緣，沒有長出第二份', async () => {
    // 重放**原封不動送同一張卡**。這才是真的重試：連點兩下或送出後斷網重送
    // 的時候，畫面上那張卡還是原來那張（status 仍是 proposed），
    // 所以 client 的前置檢查會通過，冪等性必須由 RPC 自己守住。
    //
    //（重新讀一次提案再送是另一回事：那時 status 已經是 active，
    //  isDirectConfirmablePlan 會先擋下來，測不到 RPC 這一層。）
    const replay = await service.confirmDirect(card, ageGroup);
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.taskId).toBe(taskId);
      expect(replay.planVersionId).toBe(parentVersionId);
    }

    const { data: tasks } = await supabase
      .from('tasks').select('id').eq('creation_source', 'child_proposal');
    expect(tasks!.filter((t) => t.id === taskId)).toHaveLength(1);

    const { data: versions } = await supabase
      .from('child_proposal_plan_versions').select('id').eq('proposal_id', proposalId);
    expect(versions).toHaveLength(2);

    const { data: assignments } = await supabase
      .from('child_tasks').select('id').eq('task_id', taskId);
    expect(assignments).toHaveLength(1);

    const { data: goals } = await supabase
      .from('long_term_goals').select('id').eq('task_id', taskId);
    expect(goals).toHaveLength(1);

    expect(await money(childId)).toEqual(before);
  });

  // ── §11 確認後的 Parent Home ────────────────────────────────────────────
  it('確認後這筆不再出現在家長首頁的待確認清單', async () => {
    const cards = await service.listProposedForParent({ familyId, childId });
    expect(cards.map((c) => c.proposal.id)).not.toContain(proposalId);
  });

  // ── §12 孩子端讀得到 ────────────────────────────────────────────────────
  it('孩子端用正式 query 真的讀得到這個新任務與長期計畫', async () => {
    // 與 useTodayTasks 完全相同的三道 filter。
    const { data: assigned } = await supabase
      .from('child_tasks').select('task_id')
      .eq('child_id', childId).eq('is_active', true);
    const ids = (assigned ?? []).map((r) => r.task_id);
    expect(ids).toContain(taskId);

    const { data: visible } = await supabase
      .from('tasks').select('*').in('id', ids).eq('is_active', true);
    expect(visible!.map((t) => t.id)).toContain(taskId);

    const { data: goals } = await supabase
      .from('long_term_goals').select('*')
      .eq('child_id', childId).eq('status', 'active');
    expect(goals!.map((g) => g.task_id)).toContain(taskId);
  });
});
