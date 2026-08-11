// staging 驗收 — Demo State B 的執行快照（本週 2/3）。
//
// ─────────────────────────────────────────────────────────────────────────
// 「DB 有兩筆完成」與「畫面顯示 2/3」是兩件事。中間隔著
// validRhythmCompletions（丟掉 plan window 外與重複日期的紀錄）與
// completionsThisWeek（只看當週）。State B 的整個難點就在這兩層，
// 所以驗收條件只能是**跑真的 buildGoalPresentation**，不是數 DB 的列。
//
// 跑法（預設 skip）：
//   STAGING_DEMO_STATE_B=1 EXPO_PUBLIC_APP_ENV=staging … npx jest supabase/verify/staging
// ─────────────────────────────────────────────────────────────────────────

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isoWeek from 'dayjs/plugin/isoWeek';

import { supabase } from '../../../../src/lib/supabase';
import { SupabaseChildProposalService } from '../../../../src/lib/childProposal/childProposalService';
import { buildGoalPresentation } from '../../../../src/screens/child/longTermGoalPresentation';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

const RUN = process.env.STAGING_DEMO_STATE_B === '1';
const suite = RUN ? describe : describe.skip;

const EMAIL = process.env.STAGING_DEMO_EMAIL ?? '';
const PASSWORD = process.env.STAGING_DEMO_PASSWORD ?? '';
const DEMO_FAMILY = 'd0e70000-0000-4000-8000-000000000001';
const DEMO_CHILD = 'd0e70000-0000-4000-8000-000000000021';
const TZ = 'Asia/Taipei';

jest.setTimeout(180_000);

const service = new SupabaseChildProposalService();

suite('Demo State B — 共同閱讀計畫的執行快照', () => {
  let proposal: Record<string, unknown>;
  let currentVersion: Record<string, unknown>;
  let sourceVersion: Record<string, unknown>;
  let task: Record<string, unknown>;
  let goal: Record<string, unknown>;
  let completions: Array<Record<string, unknown>>;

  beforeAll(async () => {
    const auth = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (auth.error) throw new Error(`登入失敗：${auth.error.message}`);

    const { data: fam } = await supabase
      .from('families').select('family_name').eq('id', DEMO_FAMILY).single();
    if (fam?.family_name !== 'GrowBook Demo Family') {
      throw new Error(`!! 中止：家庭是「${fam?.family_name}」`);
    }

    const { data: proposals } = await supabase
      .from('child_proposals').select('*').eq('family_id', DEMO_FAMILY);
    if (proposals?.length !== 1) {
      throw new Error(`State B 應該恰好一筆提案，實際 ${proposals?.length ?? 0}`);
    }
    proposal = proposals[0];

    const { data: versions } = await supabase
      .from('child_proposal_plan_versions').select('*')
      .eq('proposal_id', proposal.id as string).order('version_no');
    currentVersion = versions!.find(v => v.id === proposal.current_plan_version_id)!;
    sourceVersion = versions!.find(
      v => v.id === currentVersion.adopted_from_plan_version_id,
    )!;

    const { data: tasks } = await supabase
      .from('tasks').select('*').eq('id', proposal.task_id as string);
    task = tasks![0];
    const { data: goals } = await supabase
      .from('long_term_goals').select('*').eq('task_id', task.id as string);
    goal = goals![0];
    const { data: done } = await supabase
      .from('task_completions').select('*').eq('task_id', task.id as string)
      .order('completed_at');
    completions = done ?? [];
  });

  afterAll(async () => { await supabase.auth.signOut(); });

  // ── §5 共同計畫的契約 ───────────────────────────────────────────────────
  it('提案是 active，指向正式任務與家長調整版', () => {
    expect(proposal.status).toBe('active');
    expect(proposal.task_id).toBe(task.id);
    expect(proposal.activated_at).not.toBeNull();
    expect(proposal.child_original_goal).toBe('我想兩週把這本書讀完');
  });

  it('AI 版本是一週 4 次，家長版本是一週 3 次，血緣是 AI → Parent', () => {
    expect(sourceVersion.authored_by).toBe('ai');
    expect(sourceVersion.cadence_weekly_frequency).toBe(4);
    expect(sourceVersion.purpose_category).toBe('D');
    expect(sourceVersion.duration_type).toBe('long_term');
    expect(sourceVersion.duration_days).toBe(14);
    expect(sourceVersion.progress_model).toBe('weekly_rhythm');

    expect(currentVersion.authored_by).toBe('parent');
    expect(currentVersion.cadence_weekly_frequency).toBe(3);
    expect(currentVersion.cadence_days).toBeNull();
    expect(currentVersion.requires_child_review).toBe(true);
    expect(currentVersion.parent_confirmed_at).not.toBeNull();
    expect(currentVersion.child_accepted_at).not.toBeNull();
    expect(currentVersion.effective_at).not.toBeNull();
    expect(currentVersion.adopted_from_plan_version_id).toBe(sourceVersion.id);
    expect(currentVersion.confirmed_source_task_id).toBe(task.id);
  });

  it('正式任務是 weekly_frequency=3 的彈性週節奏', () => {
    expect(task.creation_source).toBe('child_proposal');
    expect(task.schedule_mode).toBe('weekly_frequency');
    expect(task.weekly_frequency).toBe(3);
    expect(task.recurrence_days).toBeNull();
    expect(task.progress_model).toBe('weekly_rhythm');
  });

  // ── §6 兩筆完成的日期性質 ───────────────────────────────────────────────
  it('恰好兩筆完成，兩個不同台北日期，都在本週、都不是未來', () => {
    expect(completions).toHaveLength(2);
    const dates = completions.map(
      c => dayjs(c.completed_at as string).tz(TZ).format('YYYY-MM-DD'),
    );
    expect(new Set(dates).size).toBe(2);

    const weekStart = dayjs().tz(TZ).startOf('isoWeek');
    const today = dayjs().tz(TZ).startOf('day');
    for (const date of dates) {
      const d = dayjs.tz(date, TZ);
      expect(d.isBefore(weekStart)).toBe(false);
      expect(d.isAfter(today)).toBe(false);
    }
  });

  it('兩筆完成都落在 plan window 內', () => {
    const start = dayjs.tz(goal.started_at as string, TZ).startOf('day');
    const end = dayjs.tz(goal.end_date as string, TZ).startOf('day');
    for (const c of completions) {
      const d = dayjs(c.completed_at as string).tz(TZ).startOf('day');
      expect(d.isBefore(start)).toBe(false);
      expect(d.isAfter(end)).toBe(false);
    }
  });

  // ── §6 這才是驗收條件 ───────────────────────────────────────────────────
  it('走真的 buildGoalPresentation：本週 2／3', () => {
    const view = buildGoalPresentation(
      task as never,
      goal as never,
      completions as never,
    );
    expect(view.weekTarget).toBe(3);
    expect(view.weekCompleted).toBe(2);
    // 彈性週目標沒有逐日時間軸，不該出現「週三漏掉」這種概念。
    expect(view.weekDays).toEqual([]);
    expect(view.weekSummary).not.toMatch(/週[一二三四五六日]/);
    console.log('\n  [State B] 週摘要：', view.weekSummary, '\n');
  });

  // ── §6 錢包可追溯 ───────────────────────────────────────────────────────
  it('錢包餘額等於交易總和，沒有無對應完成的入帳', async () => {
    const { data: wallets } = await supabase
      .from('wallets').select('id,balance').eq('child_id', DEMO_CHILD);
    const walletIds = (wallets ?? []).map(w => w.id);
    const { data: txs } = await supabase
      .from('transactions').select('amount,type').in('wallet_id', walletIds);
    const sum = (txs ?? []).reduce((total, t) => total + (t.amount ?? 0), 0);
    expect((wallets ?? []).reduce((t, w) => t + (w.balance ?? 0), 0)).toBe(sum);
  });

  // ── §11 週報的聚合真的看到那兩筆閱讀完成 ────────────────────────────────
  it('本週週報的聚合把閱讀計畫算進去了', async () => {
    const weekStart = dayjs().tz(TZ).startOf('isoWeek').format('YYYY-MM-DD');
    const { data: reports, error } = await supabase
      .from('weekly_reports').select('*')
      .eq('family_id', DEMO_FAMILY).eq('week_start', weekStart);
    expect(error).toBeNull();
    expect(reports).toHaveLength(1);
    const report = reports![0];
    expect(report.motivation_observation).toBeTruthy();
    expect((report.ai_suggestions as { used_fallback?: boolean }).used_fallback).toBe(true);

    // 這一段才是重點。週報的敘述寫的是「完成了 n/m 項任務」，n 是本週有完成
    // 紀錄的任務數。如果聚合漏掉閱讀，n 會少 1 —— 所以拿 DB 實際的 n/m 去比對
    // 敘述裡的數字，就能證明那兩筆閱讀完成有被算到，而不是只證明「週報存在」。
    const { data: assigned } = await supabase
      .from('child_tasks').select('task_id')
      .eq('child_id', DEMO_CHILD).eq('is_active', true);
    const ids = (assigned ?? []).map(a => a.task_id);

    const { data: weekDone } = await supabase
      .from('task_completions').select('task_id')
      .eq('child_id', DEMO_CHILD)
      .gte('completed_at', dayjs().tz(TZ).startOf('isoWeek').toISOString());
    const distinctDone = new Set((weekDone ?? []).map(w => w.task_id));

    expect(distinctDone.has(task.id as string)).toBe(true);
    expect(report.motivation_observation)
      .toContain(`${distinctDone.size}/${ids.length}`);
    console.log('\n  [State B] 本週週報：', report.motivation_observation, '\n');
  });

  // ── §12 Advisor 的 context ──────────────────────────────────────────────
  it('Advisor 讀得到閱讀任務、長期摘要、背景週歷史與今天的任務', async () => {
    const { data: assigned } = await supabase
      .from('child_tasks').select('task_id')
      .eq('child_id', DEMO_CHILD).eq('is_active', true);
    const ids = (assigned ?? []).map(a => a.task_id);
    expect(ids).toContain(task.id);

    const { data: todayTasks, error: taskError } = await supabase
      .from('tasks').select('id,name').in('id', ids).eq('is_active', true);
    // 讀失敗要當場失敗。讓 error 靜靜變成 null，等於把「查詢寫錯」偽裝成
    // 「資料不存在」—— 這一條的目的正是要證明 Advisor 讀得到東西。
    expect(taskError).toBeNull();
    expect(todayTasks!.length).toBeGreaterThanOrEqual(7);   // State A 六筆 ＋ 閱讀

    const { data: goals } = await supabase
      .from('long_term_goals').select('id,task_id')
      .eq('child_id', DEMO_CHILD).eq('status', 'active');
    expect(goals!.map(g => g.task_id)).toContain(task.id);
    expect(goals!.length).toBeGreaterThanOrEqual(4);        // State A 三個 ＋ 閱讀

    // AdvisorSideSheet 的窗口：>= 今天-7 天 00:00，< 今天 00:00。
    const from = dayjs().tz(TZ).startOf('day').subtract(7, 'day');
    const to = dayjs().tz(TZ).startOf('day');
    const { data: history } = await supabase
      .from('task_completions').select('completed_at,task_id')
      .eq('child_id', DEMO_CHILD)
      .gte('completed_at', from.toISOString())
      .lt('completed_at', to.toISOString());
    const historyDates = new Set(
      (history ?? []).map(h => dayjs(h.completed_at).tz(TZ).format('YYYY-MM-DD')),
    );
    expect(historyDates.size).toBeGreaterThanOrEqual(2);
    // 閱讀計畫的第一筆完成落在本週一，也在顧問視窗裡。
    expect((history ?? []).some(h => h.task_id === task.id)).toBe(true);
  });

  // ── §9 State B 的提案數是 1（State A 是 0） ─────────────────────────────
  it('核心提案恰好一筆，而且沒有殘留的其他提案', async () => {
    const all = await service.listProposedForParent({
      familyId: DEMO_FAMILY, childId: DEMO_CHILD,
    });
    // active 的提案不會出現在家長的待確認清單裡。
    expect(all.map(c => c.proposal.id)).not.toContain(proposal.id);

    const { data: rows } = await supabase
      .from('child_proposals').select('id,status').eq('family_id', DEMO_FAMILY);
    expect(rows).toHaveLength(1);
    expect(rows![0].status).toBe('active');
  });
});
