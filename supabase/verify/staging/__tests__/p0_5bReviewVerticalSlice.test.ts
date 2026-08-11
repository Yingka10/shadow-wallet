// staging 驗收 — P0-5B Parent Material Edit → Child Review 的完整 vertical slice。
//
// ─────────────────────────────────────────────────────────────────────────
// 設計上刻意分成兩條，因為它們證明的是兩件不同的事：
//
//   A. **真 AI 互通性**（§6A）：Proposal AI 仍然活著，而且它產出的 current
//      AI Plan Version 可以直接被 P0-5B 的 reader 吃下去。這條不對 Gemini
//      要求任何特定數字 —— 要求模型剛好回 weekly_frequency=4 才叫通過，
//      那是在驗運氣。
//
//   B. **deterministic 4→3 golden path**（§6B 起）：另外做一份符合正式
//      Plan Version contract 的 AI 版本，weekly_frequency 固定為 4。
//      「媽媽把 4 改成 3」這件事的 oracle 只能是這一條。
//
// 讀取路徑一律走 App 真正的程式碼（listProposedForParent /
// listNeedsReviewForChild / materialDiff / presentParentProposal /
// buildGoalPresentation），不是自己下 SQL。「DB 有資料」與「畫面讀得到」
// 是兩件事，後者才是驗收條件。
//
// 資料完全隔離在 p0_5b_fixture.sql 建的 'P0-5B Verify Family'，
// 跑完必須跑 p0_5b_cleanup.sql。
//
// 跑法（預設 skip）：
//   STAGING_P0_5B=1 EXPO_PUBLIC_APP_ENV=staging … npx jest supabase/verify/staging
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
import { materialDiff } from '../../../../src/lib/childProposal/materialDiff';
import { presentParentProposal } from '../../../../src/screens/parent/tablet/home/parentProposalPresentation';
import { buildGoalPresentation } from '../../../../src/screens/child/longTermGoalPresentation';
import type {
  ParentProposalCardData,
  ChildProposalReviewData,
} from '../../../../src/lib/childProposal/types';

dayjs.extend(utc);
dayjs.extend(timezone);

const RUN = process.env.STAGING_P0_5B === '1';
const suite = RUN ? describe : describe.skip;

const EMAIL = process.env.STAGING_PARENT_EMAIL ?? '';
const PASSWORD = process.env.STAGING_PARENT_PASSWORD ?? '';
const EXPECTED_FAMILY = 'P0-5B Verify Family';

jest.setTimeout(300_000);

const service = new SupabaseChildProposalService();

let childId = '';
let familyId = '';
let ageGroup = '';

type Money = { completions: number; transactions: number; balance: number };

async function money(): Promise<Money> {
  const { count: completions } = await supabase
    .from('task_completions').select('id', { count: 'exact', head: true })
    .eq('child_id', childId);
  const { data: wallets } = await supabase
    .from('wallets').select('id,balance').eq('child_id', childId);
  const ids = (wallets ?? []).map(w => w.id);
  const { count: transactions } = await supabase
    .from('transactions').select('id', { count: 'exact', head: true })
    .in('wallet_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  return {
    completions: completions ?? 0,
    transactions: transactions ?? 0,
    balance: (wallets ?? []).reduce((sum, w) => sum + (w.balance ?? 0), 0),
  };
}

/** 家庭範圍內的正式任務世界。Parent revise 不得讓其中任何一個數字動。*/
async function taskWorld() {
  const { data: tasks } = await supabase.from('tasks').select('id').eq('family_id', familyId);
  const ids = (tasks ?? []).map(t => t.id);
  const guard = ids.length ? ids : ['00000000-0000-0000-0000-000000000000'];
  const { count: assignments } = await supabase
    .from('child_tasks').select('id', { count: 'exact', head: true }).in('task_id', guard);
  const { count: goals } = await supabase
    .from('long_term_goals').select('id', { count: 'exact', head: true }).in('task_id', guard);
  return { tasks: ids.length, assignments: assignments ?? 0, goals: goals ?? 0 };
}

async function versionsOf(proposalId: string) {
  const { data } = await supabase
    .from('child_proposal_plan_versions').select('*')
    .eq('proposal_id', proposalId).order('version_no');
  return data ?? [];
}

async function eventsOf(proposalId: string) {
  const { data } = await supabase
    .from('child_proposal_status_events').select('*')
    .eq('proposal_id', proposalId).order('created_at');
  return data ?? [];
}

/** 建立一個 proposed 提案，外加一份符合正式 contract 的 AI 版本。 */
async function seedProposal(options: {
  goal: string;
  cadence: { mode: 'weekly_frequency' | 'fixed_days'; weeklyFrequency?: number; days?: number[] };
  preferredTime?: string | null;
  completionDescription?: string;
  rewardPolicy?: 'coin_eligible' | 'record_only';
}): Promise<{ proposalId: string; aiVersionId: string }> {
  const created = await service.create({
    schemaVersion: 1,
    childId,
    childOriginalGoal: options.goal,
    childOriginalMotivation: '因為我自己想試試看',
    cadence: options.cadence.mode === 'weekly_frequency'
      ? { mode: 'weekly_frequency', weeklyFrequency: options.cadence.weeklyFrequency! }
      : { mode: 'fixed_days', days: options.cadence.days! },
    childRewardPreference: 'hopes_for_coin',
  });
  if (!created.ok) throw new Error(`建立提案失敗：${created.message}`);
  const proposalId = created.proposalId;

  const moved = await service.transition({
    schemaVersion: 1, proposalId, toStatus: 'proposed', actorRole: 'child',
  });
  if (!moved.ok) throw new Error(`轉 proposed 失敗：${moved.message}`);

  const rewardPolicy = options.rewardPolicy ?? 'coin_eligible';
  const added = await service.addPlanVersion({
    schemaVersion: 1,
    proposalId,
    authoredBy: 'ai',
    planTitle: '兩週的練習計畫',
    planSummary: '用每週節奏累積投入',
    purposeCategory: 'D',
    completionDescription: options.completionDescription ?? '完成一次約定的練習時段',
    progressModel: 'weekly_rhythm',
    nextStep: '先把要用的東西準備好，做大約 15 分鐘',
    cadence: options.cadence.mode === 'weekly_frequency'
      ? { mode: 'weekly_frequency', weeklyFrequency: options.cadence.weeklyFrequency! }
      : { mode: 'fixed_days', days: options.cadence.days! },
    ...(options.preferredTime ? { preferredTime: options.preferredTime } : null),
    estimatedMinutes: 15,
    durationType: 'long_term',
    durationDays: 14,
    reward: {
      policy: rewardPolicy,
      eligibility: 'allowed',
      policyVersion: 'coin-policy-1.0.0',
      ...(rewardPolicy === 'coin_eligible' ? { aiSuggestedCoinAmount: 10 } : null),
    },
    taskPolicyVersion: 'task-taxonomy-2026-07',
    aiSnapshot: { source: 'P0-5B-staging-acceptance' },
    aiModel: 'p0-5b-deterministic',
    aiRequestId: `p05b:${proposalId}`,
  });
  if (!added.ok) throw new Error(`建立 AI 版本失敗：${added.message}`);

  return { proposalId, aiVersionId: added.planVersionId };
}

async function parentCard(proposalId: string): Promise<ParentProposalCardData> {
  const cards = await service.listProposedForParent({ familyId, childId });
  const found = cards.find(c => c.proposal.id === proposalId);
  if (!found) throw new Error(`家長首頁讀不到 proposal ${proposalId}`);
  return found;
}

async function childReview(proposalId: string): Promise<ChildProposalReviewData> {
  const reviews = await service.listNeedsReviewForChild({ familyId, childId });
  const found = reviews.find(r => r.proposal.id === proposalId);
  if (!found) throw new Error(`孩子端讀不到待確認 proposal ${proposalId}`);
  return found;
}

/** 直接打 RPC，繞過 client 端的 command builder —— §15/§16/§17 需要送壞資料。 */
type ReviewRpc =
  | 'revise_child_proposal_plan_v1'
  | 'accept_child_proposal_plan_v1'
  | 'request_child_proposal_changes_v1'
  | 'close_child_proposal_unsuitable_v1';

async function rawRpc(name: ReviewRpc, command: unknown) {
  const { data, error } = await supabase.rpc(name, { p_command: command as never });
  if (error) return { rpcError: error.message } as Record<string, unknown>;
  return data as Record<string, unknown>;
}

suite('P0-5B staging — 家長調整 → 孩子確認的完整 vertical slice', () => {
  beforeAll(async () => {
    const auth = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (auth.error) throw new Error(`登入失敗：${auth.error.message}`);

    const { data: kids } = await supabase
      .from('children').select('id,family_id,age_group,nickname');
    if (!kids?.length) throw new Error('讀不到孩子');
    if (kids.length !== 1) throw new Error(`預期隔離 fixture 只有一個孩子，實際 ${kids.length}`);
    childId = kids[0].id;
    familyId = kids[0].family_id;
    ageGroup = kids[0].age_group;

    // 身分守門：確認我們真的在隔離 fixture 裡，不是打到 Demo Family。
    const { data: fam } = await supabase
      .from('families').select('family_name').eq('id', familyId).single();
    if (fam?.family_name !== EXPECTED_FAMILY) {
      throw new Error(`!! 中止：家庭是「${fam?.family_name}」而不是「${EXPECTED_FAMILY}」`);
    }
  });

  afterAll(async () => { await supabase.auth.signOut(); });

  // ══ §6A 真 AI 互通性 ═══════════════════════════════════════════════════
  describe('§6A 真 AI 互通性（不對模型要求特定數字）', () => {
    let proposalId = '';

    it('Proposal AI 仍然是 live 的，而且真的寫出一份結構化計畫', async () => {
      const created = await service.create({
        schemaVersion: 1,
        childId,
        childOriginalGoal: '我想兩週把這本書讀完',
        childOriginalMotivation: '因為同學說這本書很好看',
        cadence: { mode: 'weekly_frequency', weeklyFrequency: 4 },
        childRewardPreference: 'hopes_for_coin',
      });
      if (!created.ok) throw new Error(created.message);
      proposalId = created.proposalId;
      await service.transition({
        schemaVersion: 1, proposalId, toStatus: 'proposed', actorRole: 'child',
      });

      const setup = createPlanDraftClientSetup(process.env.EXPO_PUBLIC_CHILD_PROPOSAL_AI_MODE);
      expect(setup.resolution.mode).toBe('live');

      const outcome = await generateChildProposalPlanDraft(
        { client: setup.client, port: service }, proposalId,
      );
      expect(outcome.status).toBe('saved');

      const versions = await versionsOf(proposalId);
      expect(versions).toHaveLength(1);
      expect(versions[0].authored_by).toBe('ai');
      expect(versions[0].ai_model).toMatch(/gemini/i);

      console.log('\n  [P0-5B §6A] 真實 AI 計畫：', JSON.stringify({
        model: versions[0].ai_model,
        title: versions[0].plan_title,
        cadence_mode: versions[0].cadence_mode,
        weekly: versions[0].cadence_weekly_frequency,
        days: versions[0].cadence_days,
        preferred_time: versions[0].preferred_time,
        minutes: versions[0].estimated_minutes,
      }, null, 2), '\n');
    });

    it('P0-5B 的 reader 吃得下真 AI 版本，而且 P0-3 沒有被 migration 弄壞', async () => {
      const card = await parentCard(proposalId);
      // P0-5B 的 revise 入口條件：current version 是 ai/parent 且提案仍 proposed。
      expect(card.currentPlanVersion?.authored_by).toBe('ai');
      expect(card.proposal.status).toBe('proposed');
      expect(card.proposal.current_plan_version_id).toBe(card.currentPlanVersion?.id);
      // P0-3 的既有出口（直接確認）仍然成立 —— migration 沒有破壞舊路徑。
      expect(isDirectConfirmablePlan(card)).toBe(true);
      expect(presentParentProposal(card, 'P0-5B Kid').state).toBe('fresh_ai');
    });
  });

  // ══ §7-§13 deterministic 4→3 golden path ══════════════════════════════
  describe('§7-§13 deterministic 4→3 golden path', () => {
    let proposalId = '';
    let aiVersionId = '';
    let parentVersionId = '';
    let taskId = '';
    let moneyBefore: Money;
    let worldBefore: { tasks: number; assignments: number; goals: number };
    let card: ParentProposalCardData;
    let review: ChildProposalReviewData;

    it('起始狀態：proposed + AI 版本 weekly_frequency=4 + task_id NULL', async () => {
      const seeded = await seedProposal({
        goal: '我想每週練四次直排輪',
        cadence: { mode: 'weekly_frequency', weeklyFrequency: 4 },
        // §22：source 的 preferred_time 刻意留 NULL。
        preferredTime: null,
      });
      proposalId = seeded.proposalId;
      aiVersionId = seeded.aiVersionId;

      const proposal = await service.getProposal(proposalId);
      expect(proposal!.status).toBe('proposed');
      expect(proposal!.task_id).toBeNull();
      expect(proposal!.current_plan_version_id).toBe(aiVersionId);

      const [ai] = await versionsOf(proposalId);
      expect(ai.authored_by).toBe('ai');
      expect(ai.cadence_weekly_frequency).toBe(4);
      expect(ai.preferred_time).toBeNull();

      moneyBefore = await money();
      worldBefore = await taskWorld();
    });

    it('§9 revise 前，家長首頁給的是「確認 / 調整 / 不適合」三條路', async () => {
      card = await parentCard(proposalId);
      const view = presentParentProposal(card, 'P0-5B Kid');
      expect(view.state).toBe('fresh_ai');
      expect(view.canConfirm).toBe(true);          // 確認這個計畫
      expect(view.waitingMessage).toBeNull();
      expect(view.planCadence).toBe('一週 4 次');
    });

    it('§7 家長用真 JWT 把 4 改成 3，恰好新增一個 parent 版本', async () => {
      const result = await service.revisePlan(card, {
        cadenceMode: 'weekly_frequency',
        cadenceWeeklyFrequency: 3,
        cadenceDays: null,
        preferredTime: null,
        preferredTimeCustom: null,
        completionDescription: card.currentPlanVersion!.completion_description!,
      });
      if (!result.ok) throw new Error(`revise 失敗：${result.code}/${result.reason}`);
      parentVersionId = result.planVersionId;

      const versions = await versionsOf(proposalId);
      expect(versions).toHaveLength(2);
      expect(parentVersionId).not.toBe(aiVersionId);
    });

    it('§7 parent 版本的每一個欄位都符合契約', async () => {
      const versions = await versionsOf(proposalId);
      const parent = versions.find(v => v.id === parentVersionId)!;

      expect(parent.authored_by).toBe('parent');
      expect(parent.adopted_from_plan_version_id).toBe(aiVersionId);
      expect(parent.requires_child_review).toBe(true);
      expect(parent.parent_confirmed_at).not.toBeNull();

      expect(parent.effective_at).toBeNull();
      expect(parent.child_accepted_at).toBeNull();
      expect(parent.start_date).toBeNull();
      expect(parent.end_date).toBeNull();
      expect(parent.ai_request_id).toBeNull();

      expect(parent.cadence_mode).toBe('weekly_frequency');
      expect(parent.cadence_weekly_frequency).toBe(3);
      expect(parent.cadence_days).toBeNull();

      // §22 source 的 preferred_time 是 NULL，家長只改了次數 →
      // 新版本必須仍是 NULL，不能被偷偷補成 when_needed。
      expect(parent.preferred_time).toBeNull();
      expect(parent.preferred_time_custom).toBeNull();

      // AI 原版原封不動。
      const ai = versions.find(v => v.id === aiVersionId)!;
      expect(ai.cadence_weekly_frequency).toBe(4);
      expect(ai.parent_confirmed_at).toBeNull();
      expect(ai.start_date).toBeNull();
    });

    it('§7 提案轉 needs_child_review，current 指到 parent 版本，仍然沒有任務', async () => {
      const proposal = await service.getProposal(proposalId);
      expect(proposal!.status).toBe('needs_child_review');
      expect(proposal!.current_plan_version_id).toBe(parentVersionId);
      expect(proposal!.task_id).toBeNull();
    });

    it('§7 最重要：家長調整不是正式成立 —— 任務世界與錢包 delta 全為 0', async () => {
      expect(await taskWorld()).toEqual(worldBefore);
      expect(await money()).toEqual(moneyBefore);
    });

    it('§9 revise 後，家長端變成「等孩子看看」，且不再出現直接確認', async () => {
      const cards = await service.listProposedForParent({ familyId, childId });
      const after = cards.find(c => c.proposal.id === proposalId);
      expect(after).toBeDefined();
      const view = presentParentProposal(after!, 'P0-5B Kid');
      expect(view.state).toBe('waiting_child');
      expect(view.statusLabel).toBe('等孩子看看');
      expect(view.canConfirm).toBe(false);
      expect(isDirectConfirmablePlan(after!)).toBe(false);
    });

    it('§10 孩子端讀得到提案、current parent 版本與 source 版本，血緣正確', async () => {
      review = await childReview(proposalId);
      expect(review.proposal.id).toBe(proposalId);
      expect(review.currentPlanVersion.id).toBe(parentVersionId);
      expect(review.sourcePlanVersion.id).toBe(aiVersionId);
      expect(review.currentPlanVersion.adopted_from_plan_version_id).toBe(aiVersionId);
      expect(review.sourcePlanVersion.proposal_id).toBe(proposalId);
    });

    it('§8 structured diff 只顯示真的變動的那一項：一週 4 次 → 一週 3 次', async () => {
      const diff = materialDiff(review.sourcePlanVersion, review.currentPlanVersion);
      expect(diff).toHaveLength(1);
      expect(diff[0].field).toBe('cadence');
      expect(diff[0].label).toBe('每週安排');
      expect(diff[0].before).toBe('一週 4 次');
      expect(diff[0].after).toBe('一週 3 次');

      // 不顯示 raw enum。
      const rendered = JSON.stringify(diff);
      expect(rendered).not.toContain('weekly_frequency');
      expect(rendered).not.toContain('cadence_weekly_frequency');
      // 沒有變的欄位不出現。
      expect(diff.map(d => d.field)).not.toContain('preferred_time');
      expect(diff.map(d => d.field)).not.toContain('completion_description');
      // readonly 與 reward 不在 diff 的型別範圍內。
      expect(rendered).not.toContain('成長幣');
      expect(rendered).not.toContain(review.currentPlanVersion.plan_title!);
    });

    it('§8 structured truth 壓過 free-text provenance：舊 summary 的「4 次」不會被當現況', async () => {
      // AI 的 plan_summary 是自由文字 provenance，parent 版本原樣繼承。
      // 呈現層在 parent review 狀態必須不採用它。
      const cards = await service.listProposedForParent({ familyId, childId });
      const view = presentParentProposal(
        cards.find(c => c.proposal.id === proposalId)!, 'P0-5B Kid',
      );
      expect(view.planSummary).toBeNull();
      expect(view.planCadence).toBe('一週 3 次');
    });

    it('§11 孩子用正式 command 接受 → needs_child_review 轉 active', async () => {
      const result = await service.acceptReview(review, ageGroup);
      if (!result.ok) throw new Error(`accept 失敗：${result.code}/${result.reason}`);
      taskId = result.taskId;
      expect(result.proposalId).toBe(proposalId);
      expect(result.planVersionId).toBe(parentVersionId);

      const proposal = await service.getProposal(proposalId);
      expect(proposal!.status).toBe('active');
      expect(proposal!.task_id).toBe(taskId);
      expect(proposal!.activated_at).not.toBeNull();
    });

    it('§11 恰好一個正式任務、一個 active 指派、一個長期紀錄', async () => {
      const world = await taskWorld();
      expect(world.tasks).toBe(worldBefore.tasks + 1);
      expect(world.assignments).toBe(worldBefore.assignments + 1);
      expect(world.goals).toBe(worldBefore.goals + 1);

      const { data: assignments } = await supabase
        .from('child_tasks').select('*').eq('task_id', taskId);
      expect(assignments).toHaveLength(1);
      expect(assignments![0].is_active).toBe(true);
      expect(assignments![0].child_id).toBe(childId);

      const { data: goals } = await supabase
        .from('long_term_goals').select('*').eq('task_id', taskId);
      expect(goals).toHaveLength(1);
    });

    it('§11 canonical task：weekly_frequency=3、recurrence_days NULL、weekly_rhythm', async () => {
      const { data: tasks } = await supabase.from('tasks').select('*').eq('id', taskId);
      const task = tasks![0];
      expect(task.creation_source).toBe('child_proposal');
      expect(task.schedule_mode).toBe('weekly_frequency');
      expect(task.weekly_frequency).toBe(3);          // ← 媽媽改的那個 3
      expect(task.recurrence_days).toBeNull();
      expect(task.progress_model).toBe('weekly_rhythm');
    });

    it('§12 台北日期：start = 今天、end = start + 13（含頭含尾 14 天）', async () => {
      const versions = await versionsOf(proposalId);
      const parent = versions.find(v => v.id === parentVersionId)!;
      const taipeiToday = dayjs().tz('Asia/Taipei').format('YYYY-MM-DD');
      expect(parent.start_date).toBe(taipeiToday);
      expect(dayjs(parent.end_date).diff(dayjs(parent.start_date), 'day')).toBe(13);
    });

    it('§11 parent 版本轉為生效，confirmed_* 與正式任務逐欄一致', async () => {
      const versions = await versionsOf(proposalId);
      const parent = versions.find(v => v.id === parentVersionId)!;
      const { data: tasks } = await supabase.from('tasks').select('*').eq('id', taskId);
      const t = tasks![0];

      expect(parent.effective_at).not.toBeNull();
      expect(parent.child_accepted_at).not.toBeNull();
      expect(parent.confirmed_source_task_id).toBe(taskId);
      expect(parent.confirmed_reward_policy).toBe(t.reward_policy);
      expect(parent.confirmed_coin_amount).toBe(t.reward_coin_amount);
      expect(parent.confirmed_claim_period).toBe(t.claim_period);
      expect(parent.confirmed_max_claims_per_period).toBe(t.max_claims_per_period);
      expect(parent.confirmed_reward_policy_version).toBe(t.reward_policy_version);
      expect(parent.confirmed_at).not.toBeNull();
    });

    it('§13 accept 完全不發幣：完成數、交易數、餘額都沒動', async () => {
      expect(await money()).toEqual(moneyBefore);
    });

    it('§14 用同一張舊 Child Review card 重放 accept：冪等，沒有長出第二份', async () => {
      const worldAfterAccept = await taskWorld();
      const eventsBefore = await eventsOf(proposalId);

      // 重放**原封不動的舊 review 物件**。重新讀一次會拿到 active 狀態，
      // client 端的 isReviewConfirmable 會先擋下來，那樣測不到 RPC 這一層。
      const replay = await service.acceptReview(review, ageGroup);
      expect(replay.ok).toBe(true);
      if (replay.ok) {
        expect(replay.taskId).toBe(taskId);
        expect(replay.planVersionId).toBe(parentVersionId);
        expect(replay.idempotentReplay).toBe(true);
      }

      expect(await taskWorld()).toEqual(worldAfterAccept);
      expect(await versionsOf(proposalId)).toHaveLength(2);
      expect(await money()).toEqual(moneyBefore);

      const eventsAfter = await eventsOf(proposalId);
      expect(eventsAfter).toHaveLength(eventsBefore.length);
    });

    it('§26 accept 後 Child Review card 消失，正式任務出現在孩子的任務 query', async () => {
      const reviews = await service.listNeedsReviewForChild({ familyId, childId });
      expect(reviews.map(r => r.proposal.id)).not.toContain(proposalId);

      // 與 useTodayTasks 完全相同的三道 filter。
      const { data: assigned } = await supabase
        .from('child_tasks').select('task_id')
        .eq('child_id', childId).eq('is_active', true);
      const ids = (assigned ?? []).map(r => r.task_id);
      expect(ids).toContain(taskId);

      const { data: visible } = await supabase
        .from('tasks').select('*').in('id', ids).eq('is_active', true);
      expect(visible!.map(t => t.id)).toContain(taskId);

      const { data: goals } = await supabase
        .from('long_term_goals').select('*')
        .eq('child_id', childId).eq('status', 'active');
      expect(goals!.map(g => g.task_id)).toContain(taskId);
    });

    it('§26 P0-7.1 呈現：本週 0/3、彈性週節奏沒有星期時間軸', async () => {
      const { data: tasks } = await supabase.from('tasks').select('*').eq('id', taskId);
      const { data: goals } = await supabase
        .from('long_term_goals').select('*').eq('task_id', taskId);
      const view = buildGoalPresentation(tasks![0], goals![0], []);
      expect(view.weekTarget).toBe(3);
      expect(view.weekDays).toEqual([]);
      expect(view.weekSummary).not.toMatch(/週[一二三四五六日]/);
    });

    it('§25 P0-6 regression：這個任務真的能走正式 complete_task 並入帳', async () => {
      const beforeCompletion = await money();
      const { data: goals } = await supabase
        .from('long_term_goals').select('id').eq('task_id', taskId);

      const { data, error } = await supabase.rpc('complete_task', {
        p_task_id: taskId,
        p_child_id: childId,
        p_completed_at: new Date().toISOString(),
        p_is_prerequisite_met: true,
        p_goal_id: goals![0].id,
      });
      expect(error).toBeNull();
      const result = data as Record<string, unknown>;
      expect(result.error).toBeUndefined();
      expect(result.completionId).toBeTruthy();

      const afterCompletion = await money();
      expect(afterCompletion.completions).toBe(beforeCompletion.completions + 1);

      const { data: tasks } = await supabase
        .from('tasks').select('reward_policy,reward_coin_amount').eq('id', taskId);
      if (tasks![0].reward_policy === 'coin_eligible') {
        expect(afterCompletion.balance)
          .toBe(beforeCompletion.balance + (tasks![0].reward_coin_amount ?? 0));
        expect(afterCompletion.transactions).toBe(beforeCompletion.transactions + 1);
      } else {
        expect(afterCompletion.balance).toBe(beforeCompletion.balance);
      }
    });
  });

  // ══ §14-§17 拒絕路徑 ═══════════════════════════════════════════════════
  describe('§15-§17 no-op / readonly / 型別 / policy drift', () => {
    let proposalId = '';
    let aiVersionId = '';
    let card: ParentProposalCardData;
    let worldBefore: { tasks: number; assignments: number; goals: number };
    let moneyBefore: Money;

    beforeAll(async () => {
      const seeded = await seedProposal({
        goal: '我想每週練三次鋼琴',
        cadence: { mode: 'weekly_frequency', weeklyFrequency: 3 },
        preferredTime: 'after_dinner',
      });
      proposalId = seeded.proposalId;
      aiVersionId = seeded.aiVersionId;
      card = await parentCard(proposalId);
      worldBefore = await taskWorld();
      moneyBefore = await money();
    });

    async function assertNoWrites() {
      expect(await taskWorld()).toEqual(worldBefore);
      expect(await money()).toEqual(moneyBefore);
      expect(await versionsOf(proposalId)).toHaveLength(1);
      const proposal = await service.getProposal(proposalId);
      expect(proposal!.status).toBe('proposed');
      expect(proposal!.current_plan_version_id).toBe(aiVersionId);
      expect(proposal!.task_id).toBeNull();
    }

    it('§15 material 完全不變 → NO_MATERIAL_CHANGE，版本 delta 0', async () => {
      const plan = card.currentPlanVersion!;
      const result = await rawRpc('revise_child_proposal_plan_v1', {
        schemaVersion: 1,
        proposalId,
        expectedPlanVersionId: aiVersionId,
        materialEdits: {
          cadenceMode: plan.cadence_mode,
          cadenceWeeklyFrequency: plan.cadence_weekly_frequency,
          cadenceDays: plan.cadence_days,
          preferredTime: plan.preferred_time,
          preferredTimeCustom: plan.preferred_time_custom,
          completionDescription: plan.completion_description,
        },
      });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('NO_MATERIAL_CHANGE');
      await assertNoWrites();
    });

    it('§16 偷帶 readonly 欄位 → READONLY_FIELD_NOT_EDITABLE，且什麼都沒改', async () => {
      const plan = card.currentPlanVersion!;
      const sneaky = [
        { durationDays: 60 },
        { estimatedMinutes: 90 },
        { purposeCategory: 'C' },
        { progressModel: 'milestone' },
        { planTitle: '被改掉的標題' },
        { planSummary: '被改掉的摘要' },
        { rewardPolicy: 'coin_eligible' },
        { aiSuggestedCoinAmount: 99 },
      ];
      for (const extra of sneaky) {
        const result = await rawRpc('revise_child_proposal_plan_v1', {
          schemaVersion: 1,
          proposalId,
          expectedPlanVersionId: aiVersionId,
          materialEdits: {
            cadenceMode: 'weekly_frequency',
            cadenceWeeklyFrequency: 2,
            cadenceDays: null,
            preferredTime: plan.preferred_time,
            preferredTimeCustom: null,
            completionDescription: plan.completion_description,
            ...extra,
          },
        });
        expect(result.ok).toBe(false);
        expect(result.code).toBe('VALIDATION_FAILED');
        expect(result.reason).toBe('READONLY_FIELD_NOT_EDITABLE');
      }
      await assertNoWrites();
    });

    it('§17 material 欄位塞 object / array → MATERIAL_FIELD_TYPE_INVALID，零寫入', async () => {
      const plan = card.currentPlanVersion!;
      const base = {
        cadenceMode: 'weekly_frequency',
        cadenceWeeklyFrequency: 2,
        cadenceDays: null,
        preferredTime: plan.preferred_time,
        preferredTimeCustom: null,
        completionDescription: plan.completion_description,
      };
      const bad: Array<Record<string, unknown>> = [
        { cadenceMode: { evil: true } },
        { cadenceMode: ['weekly_frequency'] },
        { completionDescription: { evil: true } },
        { completionDescription: ['做完'] },
        { preferredTime: { evil: true } },
        { preferredTimeCustom: ['晚上'] },
        { cadenceWeeklyFrequency: { evil: 2 } },
        { cadenceWeeklyFrequency: '2' },
        { cadenceDays: { evil: 1 } },
      ];
      for (const patch of bad) {
        const result = await rawRpc('revise_child_proposal_plan_v1', {
          schemaVersion: 1,
          proposalId,
          expectedPlanVersionId: aiVersionId,
          materialEdits: { ...base, ...patch },
        });
        expect(result.ok).toBe(false);
        expect(result.code).toBe('VALIDATION_FAILED');
        expect(result.reason).toBe('MATERIAL_FIELD_TYPE_INVALID');
      }
      await assertNoWrites();
    });

    it('§18 policy drift：rewardDecision 與版本政策不一致 → POLICY_CHANGED，零任務', async () => {
      // 先做一個合法的 parent review 版本。
      const revised = await service.revisePlan(card, {
        cadenceMode: 'weekly_frequency',
        cadenceWeeklyFrequency: 2,
        cadenceDays: null,
        preferredTime: card.currentPlanVersion!.preferred_time,
        preferredTimeCustom: null,
        completionDescription: card.currentPlanVersion!.completion_description!,
      });
      if (!revised.ok) throw new Error(`revise 失敗：${revised.code}`);
      const parentVersionId = revised.planVersionId;

      const worldNow = await taskWorld();
      const drifts = [
        { label: '幣值被改大', decision: { rewardPolicy: 'coin_eligible', eligibility: 'allowed', rewardPolicyVersion: 'coin-policy-1.0.0', coin: { suggestedAmount: 10, finalAmount: 25 } } },
        { label: '建議值對不上', decision: { rewardPolicy: 'coin_eligible', eligibility: 'allowed', rewardPolicyVersion: 'coin-policy-1.0.0', coin: { suggestedAmount: 3, finalAmount: 3 } } },
        { label: '政策版本過期', decision: { rewardPolicy: 'coin_eligible', eligibility: 'allowed', rewardPolicyVersion: 'coin-policy-0.9.0', coin: { suggestedAmount: 10, finalAmount: 10 } } },
        { label: '回饋方式被改', decision: { rewardPolicy: 'record_only', eligibility: 'allowed', rewardPolicyVersion: 'coin-policy-1.0.0', coin: null } },
      ];
      for (const drift of drifts) {
        const result = await rawRpc('accept_child_proposal_plan_v1', {
          schemaVersion: 1,
          proposalId,
          expectedPlanVersionId: parentVersionId,
          rewardDecision: drift.decision,
        });
        expect(result.ok).toBe(false);
        expect(result.code).toBe('POLICY_CHANGED');
      }

      expect(await taskWorld()).toEqual(worldNow);
      expect(await money()).toEqual(moneyBefore);
      const proposal = await service.getProposal(proposalId);
      expect(proposal!.status).toBe('needs_child_review');
      expect(proposal!.task_id).toBeNull();
    });
  });

  // ══ §17 stale ══════════════════════════════════════════════════════════
  describe('§19 stale 的四種入口', () => {
    let proposalId = '';
    let aiVersionId = '';
    let parentV1 = '';
    let parentV2 = '';
    let worldBefore: { tasks: number; assignments: number; goals: number };

    beforeAll(async () => {
      const seeded = await seedProposal({
        goal: '我想每週跑步四次',
        cadence: { mode: 'weekly_frequency', weeklyFrequency: 4 },
        preferredTime: 'after_school',
      });
      proposalId = seeded.proposalId;
      aiVersionId = seeded.aiVersionId;
      worldBefore = await taskWorld();

      const card = await parentCard(proposalId);
      const r1 = await service.revisePlan(card, {
        cadenceMode: 'weekly_frequency', cadenceWeeklyFrequency: 3, cadenceDays: null,
        preferredTime: 'after_school', preferredTimeCustom: null,
        completionDescription: card.currentPlanVersion!.completion_description!,
      });
      if (!r1.ok) throw new Error(`revise 1 失敗：${r1.code}`);
      parentV1 = r1.planVersionId;

      // 孩子先說想再聊聊 → 回 proposed，current 仍是 parentV1。
      const review = await childReview(proposalId);
      const back = await service.requestChanges(review, '我想再想一下');
      if (!back.ok) throw new Error(`requestChanges 失敗：${back.code}`);

      // 家長再調一次 → parentV2 取代 parentV1 成為 current。
      const card2 = await parentCard(proposalId);
      const r2 = await service.revisePlan(card2, {
        cadenceMode: 'weekly_frequency', cadenceWeeklyFrequency: 3, cadenceDays: null,
        preferredTime: 'after_dinner', preferredTimeCustom: null,
        completionDescription: card2.currentPlanVersion!.completion_description!,
      });
      if (!r2.ok) throw new Error(`revise 2 失敗：${r2.code}`);
      parentV2 = r2.planVersionId;
    });

    it('A. Parent revise 用舊的 expected version → STALE，零寫入', async () => {
      const versionsBefore = (await versionsOf(proposalId)).length;
      const result = await rawRpc('revise_child_proposal_plan_v1', {
        schemaVersion: 1,
        proposalId,
        expectedPlanVersionId: aiVersionId,      // 早就被取代了
        materialEdits: {
          cadenceMode: 'weekly_frequency', cadenceWeeklyFrequency: 1, cadenceDays: null,
          preferredTime: null, preferredTimeCustom: null,
          completionDescription: '隨便改',
        },
      });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('STALE_PLAN_VERSION');
      expect((await versionsOf(proposalId)).length).toBe(versionsBefore);
      expect(await taskWorld()).toEqual(worldBefore);
    });

    it('B. Child accept 用被取代的 parent 版本 → STALE，零任務', async () => {
      const result = await rawRpc('accept_child_proposal_plan_v1', {
        schemaVersion: 1,
        proposalId,
        expectedPlanVersionId: parentV1,          // current 已經是 parentV2
        rewardDecision: {
          rewardPolicy: 'coin_eligible', eligibility: 'allowed',
          rewardPolicyVersion: 'coin-policy-1.0.0',
          coin: { suggestedAmount: 10, finalAmount: 10 },
        },
      });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('STALE_PLAN_VERSION');
      expect(await taskWorld()).toEqual(worldBefore);
      const proposal = await service.getProposal(proposalId);
      expect(proposal!.task_id).toBeNull();
    });

    it('C. request changes 用 stale 版本 → STALE，status 不動', async () => {
      const before = await service.getProposal(proposalId);
      const result = await rawRpc('request_child_proposal_changes_v1', {
        schemaVersion: 1, proposalId, expectedPlanVersionId: parentV1, reason: '再想想',
      });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('STALE_PLAN_VERSION');
      const after = await service.getProposal(proposalId);
      expect(after!.status).toBe(before!.status);
      expect(after!.current_plan_version_id).toBe(parentV2);
    });

    it('D. close 用 stale 版本 → STALE，提案沒被關掉', async () => {
      const result = await rawRpc('close_child_proposal_unsuitable_v1', {
        schemaVersion: 1, proposalId, expectedPlanVersionId: parentV1,
        reason: '現在不適合',
      });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('STALE_PLAN_VERSION');
      const proposal = await service.getProposal(proposalId);
      expect(proposal!.status).not.toBe('closed_unsuitable');
      expect(proposal!.closed_at).toBeNull();
    });

    it('§21 血緣是一條線不是分叉：AI → parent1 → parent2', async () => {
      const versions = await versionsOf(proposalId);
      expect(versions).toHaveLength(3);
      const v1 = versions.find(v => v.id === parentV1)!;
      const v2 = versions.find(v => v.id === parentV2)!;
      expect(v1.adopted_from_plan_version_id).toBe(aiVersionId);
      expect(v2.adopted_from_plan_version_id).toBe(parentV1);   // 不是 aiVersionId
      expect(v2.preferred_time).toBe('after_dinner');
      // 舊版本沒有被改寫。
      expect(v1.preferred_time).toBe('after_school');
      expect(v1.cadence_weekly_frequency).toBe(3);
      expect(versions.find(v => v.id === aiVersionId)!.cadence_weekly_frequency).toBe(4);
    });
  });

  // ══ §18/§20 孩子想再聊聊 + request-changes 重送 ════════════════════════
  describe('§20 孩子想再跟爸媽說說看', () => {
    let proposalId = '';
    let aiVersionId = '';
    let parentVersionId = '';

    beforeAll(async () => {
      const seeded = await seedProposal({
        goal: '我想每週游泳四次',
        cadence: { mode: 'weekly_frequency', weeklyFrequency: 4 },
        preferredTime: 'weekend',
      });
      proposalId = seeded.proposalId;
      aiVersionId = seeded.aiVersionId;
      const card = await parentCard(proposalId);
      const r = await service.revisePlan(card, {
        cadenceMode: 'weekly_frequency', cadenceWeeklyFrequency: 3, cadenceDays: null,
        preferredTime: 'weekend', preferredTimeCustom: null,
        completionDescription: card.currentPlanVersion!.completion_description!,
      });
      if (!r.ok) throw new Error(`revise 失敗：${r.code}`);
      parentVersionId = r.planVersionId;
    });

    it('孩子按「我想再跟爸媽說說看」→ 回 proposed，current 仍是 parent 版本', async () => {
      const review = await childReview(proposalId);
      const result = await service.requestChanges(review, '我想再想一下時間');
      expect(result.ok).toBe(true);

      const proposal = await service.getProposal(proposalId);
      expect(proposal!.status).toBe('proposed');
      expect(proposal!.current_plan_version_id).toBe(parentVersionId);
      expect(proposal!.task_id).toBeNull();

      // 兩個版本都保留。
      const versions = await versionsOf(proposalId);
      expect(versions).toHaveLength(2);
      expect(versions.map(v => v.id).sort())
        .toEqual([aiVersionId, parentVersionId].sort());
    });

    it('家長端顯示「孩子想再一起聊聊」，不再顯示「確認這個計畫」', async () => {
      const card = await parentCard(proposalId);
      const view = presentParentProposal(card, 'P0-5B Kid');
      expect(view.state).toBe('child_revisit');
      expect(view.statusLabel).toBe('孩子想再一起聊聊');
      expect(view.canConfirm).toBe(false);
      expect(isDirectConfirmablePlan(card)).toBe(false);
    });

    it('§22 重送同一個 request-changes command：冪等，status event 不重複長', async () => {
      const eventsBefore = await eventsOf(proposalId);
      const result = await rawRpc('request_child_proposal_changes_v1', {
        schemaVersion: 1, proposalId,
        expectedPlanVersionId: parentVersionId, reason: '我想再想一下時間',
      });
      expect(result.ok).toBe(true);
      expect(result.idempotentReplay).toBe(true);
      expect((await eventsOf(proposalId)).length).toBe(eventsBefore.length);
    });

    it('§22 理由不同就不能被誤判成 replay', async () => {
      const result = await rawRpc('request_child_proposal_changes_v1', {
        schemaVersion: 1, proposalId,
        expectedPlanVersionId: parentVersionId, reason: '完全不同的另一個理由',
      });
      // 已經回到 proposed，所以不是 replay 的話必須被狀態守門擋下，
      // 絕不能靜默地再寫一筆 event。
      expect(result.ok).toBe(false);
      expect(result.code).toBe('POLICY_REJECTED');
      expect(result.reason).toBe('PROPOSAL_NOT_IN_REVIEW');
    });
  });

  // ══ §23 現在不適合 ═════════════════════════════════════════════════════
  describe('§23 現在不適合的三種 nullable version 情境', () => {
    it('A. proposed + current 為 NULL + expected 明確給 null → 關閉成功', async () => {
      const created = await service.create({
        schemaVersion: 1, childId,
        childOriginalGoal: '我想養一隻恐龍',
        childOriginalMotivation: '因為很酷',
        cadence: { mode: 'weekly_frequency', weeklyFrequency: 2 },
        childRewardPreference: 'not_specified',
      });
      if (!created.ok) throw new Error(created.message);
      await service.transition({
        schemaVersion: 1, proposalId: created.proposalId,
        toStatus: 'proposed', actorRole: 'child',
      });

      const before = await service.getProposal(created.proposalId);
      expect(before!.current_plan_version_id).toBeNull();

      const result = await rawRpc('close_child_proposal_unsuitable_v1', {
        schemaVersion: 1, proposalId: created.proposalId,
        expectedPlanVersionId: null,
        reason: '這個我們現在還做不到，但想法很棒',
      });
      expect(result.ok).toBe(true);

      const after = await service.getProposal(created.proposalId);
      expect(after!.status).toBe('closed_unsuitable');
      expect(after!.closed_reason).toBe('這個我們現在還做不到，但想法很棒');
      expect(after!.closed_at).not.toBeNull();
      expect(after!.task_id).toBeNull();
      // 孩子原本的話留著。
      expect(after!.child_original_goal).toBe('我想養一隻恐龍');
      expect(after!.child_original_motivation).toBe('因為很酷');
    });

    it('B. expected 給 null 但 current 已經有版本 → STALE_PLAN_VERSION', async () => {
      const seeded = await seedProposal({
        goal: '我想每週畫畫五次',
        cadence: { mode: 'weekly_frequency', weeklyFrequency: 5 },
      });
      const result = await rawRpc('close_child_proposal_unsuitable_v1', {
        schemaVersion: 1, proposalId: seeded.proposalId,
        expectedPlanVersionId: null,
        reason: '現在不適合',
      });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('STALE_PLAN_VERSION');
      const after = await service.getProposal(seeded.proposalId);
      expect(after!.status).toBe('proposed');
      expect(after!.closed_at).toBeNull();
    });

    it('C. needs_child_review + 正確 expected parent 版本 → 關閉成功', async () => {
      const seeded = await seedProposal({
        goal: '我想每週看六次星星',
        cadence: { mode: 'weekly_frequency', weeklyFrequency: 6 },
      });
      const card = await parentCard(seeded.proposalId);
      const revised = await service.revisePlan(card, {
        cadenceMode: 'weekly_frequency', cadenceWeeklyFrequency: 4, cadenceDays: null,
        preferredTime: null, preferredTimeCustom: null,
        completionDescription: card.currentPlanVersion!.completion_description!,
      });
      if (!revised.ok) throw new Error(`revise 失敗：${revised.code}`);

      const worldBefore = await taskWorld();
      const moneyBefore = await money();

      const result = await rawRpc('close_child_proposal_unsuitable_v1', {
        schemaVersion: 1, proposalId: seeded.proposalId,
        expectedPlanVersionId: revised.planVersionId,
        reason: '我們先把現在這個做完再說',
      });
      expect(result.ok).toBe(true);

      const after = await service.getProposal(seeded.proposalId);
      expect(after!.status).toBe('closed_unsuitable');
      expect(after!.closed_reason).toBe('我們先把現在這個做完再說');
      expect(after!.closed_at).not.toBeNull();
      expect(after!.task_id).toBeNull();
      expect(await taskWorld()).toEqual(worldBefore);
      expect(await money()).toEqual(moneyBefore);
    });

    it('理由留白一律拒絕（三種狀態都一樣）', async () => {
      const seeded = await seedProposal({
        goal: '我想每週唱歌兩次',
        cadence: { mode: 'weekly_frequency', weeklyFrequency: 2 },
      });
      for (const reason of ['', '   ']) {
        const result = await rawRpc('close_child_proposal_unsuitable_v1', {
          schemaVersion: 1, proposalId: seeded.proposalId,
          expectedPlanVersionId: seeded.aiVersionId, reason,
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('CLOSE_REQUIRES_REASON');
      }
      const after = await service.getProposal(seeded.proposalId);
      expect(after!.status).toBe('proposed');
    });
  });

  // ══ §24 fixed-days ═════════════════════════════════════════════════════
  describe('§24 fixed-days 的窄 mapping', () => {
    it('D + long_term + fixed_days：revise → accept 後仍是 weekly_rhythm 語義', async () => {
      const seeded = await seedProposal({
        goal: '我想每週一三五練書法',
        cadence: { mode: 'fixed_days', days: [1, 3, 5] },
        preferredTime: 'after_dinner',
      });
      const card = await parentCard(seeded.proposalId);
      expect(card.currentPlanVersion!.cadence_mode).toBe('fixed_days');
      expect(card.currentPlanVersion!.cadence_days).toEqual([1, 3, 5]);

      // 家長把三天改成兩天 —— 仍然是 fixed_days，不能被轉成 weekly_frequency。
      const revised = await service.revisePlan(card, {
        cadenceMode: 'fixed_days', cadenceWeeklyFrequency: null, cadenceDays: [1, 5],
        preferredTime: 'after_dinner', preferredTimeCustom: null,
        completionDescription: card.currentPlanVersion!.completion_description!,
      });
      if (!revised.ok) throw new Error(`revise 失敗：${revised.code}/${revised.reason}`);

      const parentVersion = (await versionsOf(seeded.proposalId))
        .find(v => v.id === revised.planVersionId)!;
      expect(parentVersion.cadence_mode).toBe('fixed_days');
      expect(parentVersion.cadence_days).toEqual([1, 5]);
      expect(parentVersion.cadence_weekly_frequency).toBeNull();
      expect(parentVersion.progress_model).toBe('weekly_rhythm');

      // 孩子端 diff 看到的是星期，不是次數。
      const review = await childReview(seeded.proposalId);
      const diff = materialDiff(review.sourcePlanVersion, review.currentPlanVersion);
      expect(diff.find(d => d.field === 'cadence')?.before).toBe('每週一、週三、週五');
      expect(diff.find(d => d.field === 'cadence')?.after).toBe('每週一、週五');

      const accepted = await service.acceptReview(review, ageGroup);
      if (!accepted.ok) throw new Error(`accept 失敗：${accepted.code}/${accepted.reason}`);

      const { data: tasks } = await supabase
        .from('tasks').select('*').eq('id', accepted.taskId);
      const task = tasks![0];
      expect(task.schedule_mode).toBe('fixed_days');
      expect(task.recurrence_days).toEqual([1, 5]);
      expect(task.weekly_frequency).toBeNull();
      // 產品契約：D + long_term 的節奏語義仍是週節奏，不是里程碑。
      expect(task.progress_model).toBe('weekly_rhythm');
      expect(task.long_term_type).toBe('habit');

      const { data: goals } = await supabase
        .from('long_term_goals').select('*').eq('task_id', accepted.taskId);
      expect(goals).toHaveLength(1);
      expect(goals![0].goal_type).toBe('habit');

      const { data: events } = await supabase
        .from('task_change_events').select('*')
        .eq('task_id', accepted.taskId).eq('event_type', 'created_from_child_proposal');
      expect(events).toHaveLength(1);
      const snapshot = events![0].snapshot as { command?: { progressModel?: string } };
      expect(snapshot.command?.progressModel).toBe('weekly_rhythm');
    });
  });

  // ══ §25 P0-5A live regression ══════════════════════════════════════════
  describe('§25 P0-5A live regression（buildDirectConfirmCommand 被改過）', () => {
    it('fresh proposed + AI 計畫，家長直接確認仍然一路走到 active', async () => {
      const seeded = await seedProposal({
        goal: '我想每週背三次單字',
        cadence: { mode: 'weekly_frequency', weeklyFrequency: 3 },
        preferredTime: 'after_school',
      });
      const worldBefore = await taskWorld();
      const moneyBefore = await money();

      const card = await parentCard(seeded.proposalId);
      expect(isDirectConfirmablePlan(card)).toBe(true);

      const result = await service.confirmDirect(card, ageGroup);
      if (!result.ok) throw new Error(`直接確認失敗：${result.code}/${result.reason}`);

      const proposal = await service.getProposal(seeded.proposalId);
      expect(proposal!.status).toBe('active');
      expect(proposal!.task_id).toBe(result.taskId);

      const world = await taskWorld();
      expect(world.tasks).toBe(worldBefore.tasks + 1);
      expect(world.assignments).toBe(worldBefore.assignments + 1);
      expect(world.goals).toBe(worldBefore.goals + 1);

      const versions = await versionsOf(seeded.proposalId);
      expect(versions).toHaveLength(2);
      const parent = versions.find(v => v.id === result.planVersionId)!;
      expect(parent.authored_by).toBe('parent');
      // P0-5A 的直接確認**不需要**孩子再看一次。
      expect(parent.requires_child_review).toBe(false);
      expect(parent.effective_at).not.toBeNull();
      expect(parent.adopted_from_plan_version_id).toBe(seeded.aiVersionId);

      // reward snapshot 正確。
      const { data: tasks } = await supabase
        .from('tasks').select('*').eq('id', result.taskId);
      expect(parent.confirmed_source_task_id).toBe(result.taskId);
      expect(parent.confirmed_coin_amount).toBe(tasks![0].reward_coin_amount);

      // 確認本身不發幣。
      expect(await money()).toEqual(moneyBefore);

      // 重放同一張卡：冪等。
      const replay = await service.confirmDirect(card, ageGroup);
      expect(replay.ok).toBe(true);
      if (replay.ok) expect(replay.taskId).toBe(result.taskId);
      expect(await taskWorld()).toEqual(world);
      expect(await versionsOf(seeded.proposalId)).toHaveLength(2);
      expect(await money()).toEqual(moneyBefore);
    });
  });
});
