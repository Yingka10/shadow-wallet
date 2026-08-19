// staging 驗收 — LT-FINAL-1R：長期計畫的資料真相走到畫面為止
//
// ─────────────────────────────────────────────────────────────────────────
// 這一支不是「DB 有資料」的檢查，是**畫面讀得到什麼**的檢查：
// 任務、目標、完成紀錄全部從 staging 讀回來，再走 App 真實的
// buildGoalPresentation / resolveLongTermProgression。
//
// 主案例：兩週讀完這本書 · 每週 3 次 · 睡前 · 15 分鐘 · 每次 +8
//
//   Active 後   → 本週 0 / 3、有 completion capability、說好的回饋
//   四個不同日期完成 → 1/3 → 2/3 → 3/3（已到節奏）→ 第 4 次仍可完成
//   同一天第二次 → UI 不給入口、DB 也拒絕
//
// 跑法（需要 staging 憑證，預設 skip）：
//   STAGING_LT_PROGRESSION=1 npx jest supabase/verify/staging/__tests__/longTermProgressionVerticalSlice
// ─────────────────────────────────────────────────────────────────────────

import React from 'react';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { render, screen } from '@testing-library/react-native';

import { supabase } from '../../../../src/lib/supabase';
import { buildGoalPresentation } from '../../../../src/screens/child/longTermGoalPresentation';
import { loadLongTermSharedPlan, resolveLongTermProgression } from '../../../../src/lib/longTerm';
import type { LongTermGoal, Task } from '../../../../src/types/database';
import LongTermGoalDetailView from '../../../../src/components/child/LongTermGoalDetailView';

dayjs.extend(utc);
dayjs.extend(timezone);

const RUN = process.env.STAGING_LT_PROGRESSION === '1';
const suite = RUN ? describe : describe.skip;

const TZ = 'Asia/Taipei';
const EMAIL = process.env.STAGING_PARENT_EMAIL ?? 'demo.parent@growbook-demo.invalid';
const PASSWORD = process.env.STAGING_PARENT_PASSWORD ?? '';
const TASK_ID = process.env.STAGING_LT_TASK_ID ?? '';
const GOAL_ID = process.env.STAGING_LT_GOAL_ID ?? '';

type Loaded = {
  task: Task;
  goal: LongTermGoal;
  completions: {
    id: string; completed_at: string;
    planned_time_window: null; start_mode: null;
  }[];
};

async function load(): Promise<Loaded> {
  const [{ data: task }, { data: goal }] = await Promise.all([
    supabase.from('tasks').select('*').eq('id', TASK_ID).single(),
    supabase.from('long_term_goals').select('*').eq('id', GOAL_ID).single(),
  ]);
  const { data: rows } = await supabase
    .from('task_completions')
    .select('id, completed_at')
    .eq('task_id', TASK_ID)
    .eq('status', 'completed')
    .order('completed_at');
  return {
    task: task as Task,
    goal: goal as LongTermGoal,
    completions: (rows ?? []).map((row) => ({
      id: row.id, completed_at: row.completed_at,
      planned_time_window: null, start_mode: null,
    })),
  };
}

suite('LT-FINAL-1R · staging vertical slice', () => {
  beforeAll(async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: EMAIL, password: PASSWORD,
    });
    if (error) throw error;
  });

  it('progression 是 rhythm，而且不是從 goal_type 來的', async () => {
    const { task, goal } = await load();
    expect(resolveLongTermProgression(task, goal)).toBe('rhythm');
    // goal_type 是什麼都不影響 —— 這一行只是把實際值記下來。
    expect(['habit', 'skill', 'responsibility', 'challenge']).toContain(goal.goal_type);
  });

  it('說好的回饋讀 confirmed 快照，而且是 per_completion', async () => {
    const { goal } = await load();
    const shared = await loadLongTermSharedPlan({ taskId: TASK_ID, childId: goal.child_id });
    expect(shared?.agreedReward?.payoutBasis).toBe('per_completion');
    expect(shared?.agreedReward?.label).toMatch(/^每完成一次，\+\d+ 成長幣$/);
    expect(shared?.legacyReward).toBe(false);
  });

  it('孩子自己確認過的計畫沿 lineage 讀得回來', async () => {
    const { goal } = await load();
    const shared = await loadLongTermSharedPlan({ taskId: TASK_ID, childId: goal.child_id });
    expect(shared?.childPlan?.desiredOutcome).toBeTruthy();
    expect(shared?.childPlan?.progressionKind).toBe('rhythm');
  });

  it('本週進度是實際完成數，且達標之後仍可再完成', async () => {
    const { task, goal, completions } = await load();
    const shared = await loadLongTermSharedPlan({ taskId: TASK_ID, childId: goal.child_id });
    const view = buildGoalPresentation(task, goal, completions, dayjs().tz(TZ), {
      childPlan: shared?.childPlan ?? null,
      agreedReward: shared?.agreedReward ?? null,
      legacyReward: shared?.legacyReward ?? false,
    });

    expect(view.weekTarget).toBe(3);
    // 這一週、而且**在計畫開始之後**的完成才算進進度 ——
    // 計畫開始前的紀錄不是這份計畫的一部分。
    const planStart = dayjs(goal.started_at).tz(TZ).startOf('day');
    const monday = dayjs().tz(TZ).startOf('day')
      .subtract((dayjs().tz(TZ).day() + 6) % 7, 'day');
    const expected = completions.filter((completion) => {
      const at = dayjs(completion.completed_at).tz(TZ);
      return !at.isBefore(monday, 'day')
        && at.isBefore(monday.add(7, 'day'), 'day')
        && !at.isBefore(planStart, 'day');
    }).length;
    expect(view.weekCompletedActual).toBe(expected);
    // 今天真的記過一次，所以它一定 >= 1。
    expect(view.weekCompletedActual).toBeGreaterThanOrEqual(1);
    expect(view.weekProgressLabel).toBe(`本週 ${expected} / 3`);
    // ⚠️ current_day 確實會被 complete_task 遞增（habit 類），但它數的是
    //    「累計完成」，不是「這一週做了幾次」—— 兩者不一樣，畫面讀的是後者。
    expect(view.weekCompletedActual).not.toBe(goal.current_day);
    // 做超過約定次數不會被寫成 4 / 3，也不會讓計畫結束。
    expect(JSON.stringify(view)).not.toContain(`${view.weekTarget + 1} / ${view.weekTarget}`);
    expect(view.planState).toBe('active');
    expect(view.targetReached).toBe(view.weekCompletedActual >= view.weekTarget);
  });

  it('今天那一句話與時間都來自 canonical 欄位', async () => {
    const { task, goal, completions } = await load();
    const view = buildGoalPresentation(task, goal, completions, dayjs().tz(TZ));
    expect(view.todayAction).toBe(task.next_step);
    expect(view.sessionMinutes).toBe(task.estimated_minutes);
    expect(view.agreedTime?.label).toBe('睡前');
  });

  it('rhythm 沒有生成里程碑', async () => {
    const { task, goal, completions } = await load();
    const view = buildGoalPresentation(task, goal, completions, dayjs().tz(TZ));
    expect(view.milestones).toEqual([]);
  });

  // LT-FINAL-2 §28 — Final Visual Shell 接的是真實 staging 資料，不是手工
  // 湊出來的 fixture。這一支把整條線走完：DB → buildGoalPresentation →
  // 真正的 LongTermGoalDetailView，證明主 demo case 在真資料下渲染不會炸，
  // 而且畫面上看得到的字跟資料真相一致。
  it('用真實 staging 資料渲染 Final Visual Shell 不會炸，而且畫面誠實', async () => {
    const { task, goal, completions } = await load();
    const shared = await loadLongTermSharedPlan({ taskId: TASK_ID, childId: goal.child_id });
    const view = buildGoalPresentation(task, goal, completions, dayjs().tz(TZ), {
      childPlan: shared?.childPlan ?? null,
      agreedReward: shared?.agreedReward ?? null,
      legacyReward: shared?.legacyReward ?? false,
    });

    render(
      React.createElement(LongTermGoalDetailView, {
        presentation: view,
        isCompletedToday: false,
        checking: false,
        onComplete: () => {},
        onSelectTimeWindow: () => {},
      }),
    );

    expect(screen.getByTestId('goal-hero')).toBeTruthy();
    expect(screen.getByTestId('goal-today')).toBeTruthy();
    expect(screen.getByTestId('goal-week')).toBeTruthy();
    expect(screen.getByText(view.todayAction)).toBeTruthy();
    expect(screen.getByText(view.weekProgressLabel)).toBeTruthy();
    if (view.agreedReward && !view.legacyReward) {
      expect(screen.getByText(new RegExp(view.agreedReward.label))).toBeTruthy();
    }
    // rhythm 沒有真實 checkpoint，Next Stop 誠實地不出現。
    expect(screen.queryByTestId('goal-next-stop')).toBeNull();
  });
});
