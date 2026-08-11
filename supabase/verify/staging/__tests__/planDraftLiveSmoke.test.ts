// staging 驗證 — P0-3 走一次**真的 Gemini**。
//
// ─────────────────────────────────────────────────────────────────────────
// 其他測試都注入替身，所以它們證明的是「如果模型回這樣，我們會這樣處理」。
// 這一支證明的是另一件事：**模型真的會回那樣**，而且整條鏈真的接得起來 ——
// App 的 orchestrator → 真實 ai-proxy → 真實 Gemini → 真實 RPC → 真實資料列。
//
// 預設 skip。要跑必須明確給 STAGING_AI_SMOKE=1 與 staging 的環境變數：
//
//   STAGING_AI_SMOKE=1 \
//   EXPO_PUBLIC_APP_ENV=staging \
//   EXPO_PUBLIC_SUPABASE_URL=https://<staging-ref>.supabase.co \
//   EXPO_PUBLIC_SUPABASE_ANON_KEY=... \
//   EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF=<staging-ref> \
//   EXPO_PUBLIC_CHILD_PROPOSAL_AI_MODE=live \
//   STAGING_PARENT_EMAIL=... STAGING_PARENT_PASSWORD=... \
//   npx jest supabase/verify/staging
//
// 會真的花掉一次模型配額，也會在 staging 留下一筆提案（測試結束會印出 id）。
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from '../../../../src/lib/supabase';
import {
  SupabaseChildProposalService,
} from '../../../../src/lib/childProposal/childProposalService';
import {
  createPlanDraftClientSetup,
  generateChildProposalPlanDraft,
  generateChildProposalPlanDraftInBackground,
  type PlanDraftOutcome,
} from '../../../../src/lib/childProposal/planDraft';

const RUN = process.env.STAGING_AI_SMOKE === '1';
const suite = RUN ? describe : describe.skip;

// 另一半：staging 的 FORCE_AI_FALLBACK secret 開著的時候跑。
// 兩者互斥 —— 開著就不可能有真的草稿。
const RUN_FALLBACK = process.env.STAGING_AI_FALLBACK === '1';
const fallbackSuite = RUN_FALLBACK ? describe : describe.skip;

const EMAIL = process.env.STAGING_PARENT_EMAIL ?? '';
const PASSWORD = process.env.STAGING_PARENT_PASSWORD ?? '';

jest.setTimeout(120_000);

suite('P0-3 staging — 真實 Gemini 產生 Plan Draft', () => {
  const service = new SupabaseChildProposalService();
  let proposalId = '';
  let outcome: PlanDraftOutcome | { status: 'crashed'; error: unknown } | null = null;

  beforeAll(async () => {
    const auth = await supabase.auth.signInWithPassword({
      email: EMAIL, password: PASSWORD,
    });
    if (auth.error) throw new Error(`登入失敗：${auth.error.message}`);

    const { data: kids, error: kidsError } = await supabase
      .from('children').select('id').limit(1);
    if (kidsError || !kids?.length) throw new Error('讀不到孩子');

    // 承恩案例，逐字。
    const created = await service.create({
      schemaVersion: 1,
      childId: kids[0].id,
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
    if (proposalId) console.log(`\n  [staging] 待清理 proposal_id = ${proposalId}\n`);
    await supabase.auth.signOut();
  });

  it('模式真的解析成 live（否則後面全部沒有意義）', () => {
    const setup = createPlanDraftClientSetup(
      process.env.EXPO_PUBLIC_CHILD_PROPOSAL_AI_MODE,
    );
    expect(setup.resolution.mode).toBe('live');
    expect(setup.client).not.toBeNull();
  });

  it('背景版本立刻回來，不讓孩子等模型', async () => {
    const setup = createPlanDraftClientSetup(
      process.env.EXPO_PUBLIC_CHILD_PROPOSAL_AI_MODE,
    );

    const settled = new Promise<PlanDraftOutcome | { status: 'crashed'; error: unknown }>(
      (resolve) => {
        const startedAt = Date.now();
        generateChildProposalPlanDraftInBackground(
          { client: setup.client, port: service },
          proposalId,
          resolve,
        );
        // 這一行在同一個 tick 就跑到了 —— 也就是成功頁不會等模型。
        expect(Date.now() - startedAt).toBeLessThan(50);
      },
    );

    outcome = await settled;
    expect(outcome.status).toBe('saved');
  });

  it('存下的是一份結構化的 authored_by=ai 版本', async () => {
    expect(outcome && outcome.status).toBe('saved');
    const saved = outcome as Extract<PlanDraftOutcome, { status: 'saved' }>;
    expect(saved.duplicateSuppressed).toBe(false);

    const { data: rows, error } = await supabase
      .from('child_proposal_plan_versions')
      .select('*')
      .eq('proposal_id', proposalId);
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);

    const row = rows![0];
    // 這些是 P0-5 直接依賴的欄位。
    expect(row.authored_by).toBe('ai');
    expect(row.purpose_category).toBe('D');
    expect(row.progress_model).toBe('weekly_rhythm');
    expect(row.cadence_mode).toBe('weekly_frequency');
    expect(row.cadence_weekly_frequency).toBe(4);
    expect(row.cadence_days).toBeNull();
    expect(row.duration_type).toBe('long_term');
    expect(row.duration_days).toBe(14);
    expect(typeof row.estimated_minutes).toBe('number');
    // 未確認的草稿不預先猜開始日 —— 那是 P0-5 家長確認時才決定的。
    expect(row.start_date).toBeNull();
    expect(row.end_date).toBeNull();
    expect(row.confirmed_at).toBeNull();

    // 完成標準是投入型的。「讀完整本」這種結果導向的說法一個字都不能出現。
    expect(row.completion_description).toContain('一次');
    for (const outcomeWord of ['讀完', '看完', '整本', '全部', '學會', '分數']) {
      expect(row.completion_description).not.toContain(outcomeWord);
    }

    // ai_model 必須是真的回答的那個模型，不是寫死的字串。
    expect(typeof row.ai_model).toBe('string');
    expect(row.ai_model).toMatch(/gemini/i);
    expect(row.ai_request_id).toBe(saved.aiRequestId);

    console.log('\n  [staging] 真實模型輸出：', JSON.stringify({
      ai_model: row.ai_model,
      plan_title: row.plan_title,
      plan_summary: row.plan_summary,
      completion_description: row.completion_description,
      next_step: row.next_step,
      estimated_minutes: row.estimated_minutes,
      reward_policy: row.reward_policy,
      reward_eligibility: row.reward_eligibility,
      ai_suggested_coin_amount: row.ai_suggested_coin_amount,
    }, null, 2), '\n');
  });

  it('孩子的原話與節奏沒有被 AI 動到，提案仍是 proposed', async () => {
    const proposal = await service.getProposal(proposalId);
    expect(proposal).not.toBeNull();
    expect(proposal!.status).toBe('proposed');
    expect(proposal!.child_original_goal).toBe('我想兩週把這本書讀完');
    expect(proposal!.child_original_motivation).toBe('因為同學說這本書很好看');
    expect(proposal!.cadence_mode).toBe('weekly_frequency');
    expect(proposal!.cadence_weekly_frequency).toBe(4);
    expect(proposal!.cadence_days).toBeNull();
  });

  it('再跑一次不會多一份草稿，也不會再花一次配額', async () => {
    const setup = createPlanDraftClientSetup(
      process.env.EXPO_PUBLIC_CHILD_PROPOSAL_AI_MODE,
    );
    const again = await generateChildProposalPlanDraft(
      { client: setup.client, port: service },
      proposalId,
    );
    expect(again.status).toBe('skipped');
    expect((again as { reason: string }).reason).toBe('already_generated');

    const { data: rows } = await supabase
      .from('child_proposal_plan_versions')
      .select('id')
      .eq('proposal_id', proposalId);
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

fallbackSuite('P0-3 staging — FORCE_AI_FALLBACK 開著時不會偷偷呼叫模型', () => {
  const service = new SupabaseChildProposalService();
  let proposalId = '';

  beforeAll(async () => {
    const auth = await supabase.auth.signInWithPassword({
      email: EMAIL, password: PASSWORD,
    });
    if (auth.error) throw new Error(`登入失敗：${auth.error.message}`);

    const { data: kids } = await supabase.from('children').select('id').limit(1);
    if (!kids?.length) throw new Error('讀不到孩子');

    const created = await service.create({
      schemaVersion: 1,
      childId: kids[0].id,
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
    if (proposalId) console.log(`\n  [staging] 待清理 proposal_id = ${proposalId}\n`);
    await supabase.auth.signOut();
  });

  it('沒有草稿，而且失敗得很快（代表根本沒有打出去）', async () => {
    const setup = createPlanDraftClientSetup(
      process.env.EXPO_PUBLIC_CHILD_PROPOSAL_AI_MODE,
    );
    const startedAt = Date.now();
    const outcome = await generateChildProposalPlanDraft(
      { client: setup.client, port: service },
      proposalId,
    );

    expect(outcome.status).toBe('unavailable');
    // 真的呼叫模型至少要好幾秒。這裡如果很快回來，就代表 guard 生效了。
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });

  it('沒有留下任何假裝是 AI 的版本，提案本身完好', async () => {
    const { data: rows } = await supabase
      .from('child_proposal_plan_versions')
      .select('id')
      .eq('proposal_id', proposalId);
    expect(rows).toHaveLength(0);

    const proposal = await service.getProposal(proposalId);
    expect(proposal!.status).toBe('proposed');
    expect(proposal!.child_original_goal).toBe('我想兩週把這本書讀完');
  });
});
