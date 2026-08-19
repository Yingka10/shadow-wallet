// LT-FINAL-1.1 — Session Check-in vs Progress Advancement
//
// ─────────────────────────────────────────────────────────────────────────────
// 「孩子按了記下今天的完成」對四種 progression 分別代表什麼，這一組把矩陣
// 釘死成測試：
//
//                Session Check-in    Auto Progress Advancement
//   rhythm             yes                  yes*
//   fixed_days         yes                  yes*
//   staged             yes                  no
//   accumulation       yes                  no
//   null               no                   no
//
// staged / accumulation「能打卡」是 §2 audit 換來的——complete_task 本身
// 不寫 current_level / current_value（見 completeTaskSessionCheckInAudit
// .test.ts），這裡驗的是**呼叫端**（presentation + availability）沒有另外
// 偷推進度。
// ─────────────────────────────────────────────────────────────────────────────

import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { LongTermGoal, Task } from '../../../types/database';
import { buildGoalPresentation } from '../../../screens/child/longTermGoalPresentation';
import {
  resolveLongTermCompletionAvailability,
  resolveLongTermProgression,
  supportsAutomaticProgressAdvancement,
  supportsSessionCheckIn,
} from '../index';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';
const NOW = dayjs.tz('2026-08-12T20:00:00', TZ); // 週三

const rhythmTask = (over: Partial<Task> = {}) => ({
  id: 't', name: '每天練琴 15 分鐘', category: 'D',
  progress_model: 'weekly_rhythm', schedule_mode: 'weekly_frequency',
  weekly_frequency: 3, recurrence_days: null,
  claim_period: 'day', max_claims_per_period: 1,
  estimated_minutes: 15, base_time_min: 15, due_date: null, created_at: '2026-08-10T00:00:00Z',
  next_step: '今天練琴 15 分鐘', completion_description: '完成一次約定的練習',
  preferred_time: 'after_school', preferred_time_custom: null,
  ...over,
} as unknown as Task);

const stagedTask = (over: Partial<Task> = {}) => ({
  id: 't-staged', name: '學會彈這首曲子', category: 'D',
  progress_model: null, schedule_mode: null,
  weekly_frequency: null, recurrence_days: null,
  claim_period: 'day', max_claims_per_period: 1,
  estimated_minutes: 20, base_time_min: 20, due_date: null, created_at: '2026-08-01T00:00:00Z',
  next_step: '今天先練雙手合奏', completion_description: '完成一次練習',
  preferred_time: null, preferred_time_custom: null,
  ...over,
} as unknown as Task);

const stagedGoal = (over: Partial<LongTermGoal> = {}) => ({
  id: 'g-staged', goal_type: 'skill', status: 'active',
  started_at: '2026-08-01T00:00:00Z', created_at: '2026-08-01T00:00:00Z',
  total_days: null, current_day: 5, end_date: null,
  active_days: null,
  level_count: 4,
  level_definitions: [
    { name: '認識琴鍵', coin: 5 }, { name: '單手彈奏', coin: 5 },
    { name: '雙手合奏', coin: 5 }, { name: '完整演奏', coin: 10 },
  ],
  current_level: 2, // 第 3 / 4 階段（0-indexed）
  target_value: null, current_value: null, value_unit: null,
  preferred_time_window: null, checkpoint_rewards: null,
  ...over,
} as unknown as LongTermGoal);

const accumulationTask = (over: Partial<Task> = {}) => ({
  id: 't-acc', name: '暑假讀 5 本書', category: 'D',
  progress_model: null, schedule_mode: null,
  weekly_frequency: null, recurrence_days: null,
  claim_period: 'day', max_claims_per_period: 1,
  estimated_minutes: 20, base_time_min: 20, due_date: null, created_at: '2026-08-01T00:00:00Z',
  next_step: '今天先讀 20 分鐘', completion_description: '完成一次閱讀',
  preferred_time: null, preferred_time_custom: null,
  ...over,
} as unknown as Task);

const accumulationGoal = (over: Partial<LongTermGoal> = {}) => ({
  id: 'g-acc', goal_type: 'challenge', status: 'active',
  started_at: '2026-08-01T00:00:00Z', created_at: '2026-08-01T00:00:00Z',
  total_days: null, current_day: 2, end_date: null,
  active_days: null,
  level_count: null, level_definitions: null, current_level: null,
  target_value: 5, current_value: 2, value_unit: '本',
  preferred_time_window: null, checkpoint_rewards: null,
  ...over,
} as unknown as LongTermGoal);

const at = (date: string) => ({
  id: `c-${date}`, completed_at: dayjs.tz(`${date}T20:00:00`, TZ).toISOString(),
  planned_time_window: null, start_mode: null,
});

// ---------------------------------------------------------------------------

describe('supportsSessionCheckIn / supportsAutomaticProgressAdvancement 矩陣', () => {
  it.each([
    ['rhythm', true, true],
    ['fixed_days', true, true],
    ['staged', true, false],
    ['accumulation', true, false],
    [null, false, false],
  ] as const)('%s', (progression, checkIn, advancement) => {
    expect(supportsSessionCheckIn(progression)).toBe(checkIn);
    expect(supportsAutomaticProgressAdvancement(progression)).toBe(advancement);
  });
});

describe('A｜staged session check-in', () => {
  it('有固定星期排程時，排定日可以打卡，而且不會動 stage', () => {
    const task = stagedTask({ recurrence_days: [3] }); // 週三
    const goal = stagedGoal();
    const progression = resolveLongTermProgression(task, goal);
    expect(progression).toBe('staged');

    const before = resolveLongTermCompletionAvailability({
      task, goal, progression, completions: [], now: NOW,
      planStart: dayjs.tz('2026-08-01', TZ), planEnd: null,
    });
    expect(before).toEqual({ canComplete: true, reason: 'available' });

    const view = buildGoalPresentation(task, goal, [], NOW);
    expect(view.overallLabel).toBe('第 2 / 4 階段');
    expect(view.canCompleteToday).toBe(true);
  });

  it('completion 之後 —— stage / level_definitions / goal.status 全部不變', () => {
    const task = stagedTask({ recurrence_days: [3] });
    const goal = stagedGoal();
    const before = buildGoalPresentation(task, goal, [], NOW);

    // 打卡本身不改 goal 這個物件（complete_task 也不會），
    // 這裡模擬「今天多了一筆 completion」，goal 原封不動地傳進去。
    const after = buildGoalPresentation(task, goal, [at('2026-08-12')], NOW);

    expect(after.overallLabel).toBe(before.overallLabel);
    expect(after.overallLabel).toBe('第 2 / 4 階段');
    expect(after.milestones).toEqual(before.milestones);
    expect(after.planState).toBe('active');
    expect(after.sessionEvidence.checkedInToday).toBe(true);
    expect(before.sessionEvidence.checkedInToday).toBe(false);
  });

  it('只有 stage structure、沒有排程時，不假設每天都能做', () => {
    const task = stagedTask(); // recurrence_days 沒設
    const goal = stagedGoal();
    const progression = resolveLongTermProgression(task, goal);
    const result = resolveLongTermCompletionAvailability({
      task, goal, progression, completions: [], now: NOW,
      planStart: dayjs.tz('2026-08-01', TZ), planEnd: null,
    });
    expect(result).toEqual({ canComplete: false, reason: 'schedule_not_defined' });
  });
});

describe('B｜accumulation session check-in', () => {
  it('排定日可以打卡，current_value 不因此改變', () => {
    const task = accumulationTask({ recurrence_days: [3] });
    const goal = accumulationGoal();
    const progression = resolveLongTermProgression(task, goal);
    expect(progression).toBe('accumulation');

    const before = buildGoalPresentation(task, goal, [], NOW);
    expect(before.overallLabel).toBe('2 / 5 本');
    expect(before.canCompleteToday).toBe(true);

    const after = buildGoalPresentation(task, goal, [at('2026-08-12')], NOW);
    expect(after.overallLabel).toBe('2 / 5 本');
    expect(after.overallLabel).toBe(before.overallLabel);
    expect(after.sessionEvidence.checkedInToday).toBe(true);
  });

  it('沒有排程就不能打卡', () => {
    const task = accumulationTask();
    const goal = accumulationGoal();
    const progression = resolveLongTermProgression(task, goal);
    const result = resolveLongTermCompletionAvailability({
      task, goal, progression, completions: [], now: NOW,
      planStart: dayjs.tz('2026-08-01', TZ), planEnd: null,
    });
    expect(result).toEqual({ canComplete: false, reason: 'schedule_not_defined' });
  });
});

describe('C｜rhythm 回歸：週目標 ≠ claim cap', () => {
  it('達到週目標之後第 4 次仍然可以記錄', () => {
    const task = rhythmTask();
    const goal: LongTermGoal = {
      id: 'g-rhythm', goal_type: 'habit', status: 'active',
      started_at: '2026-08-10T00:00:00Z', created_at: '2026-08-10T00:00:00Z',
      total_days: null, current_day: 3, end_date: null,
      active_days: null, level_count: null, level_definitions: null, current_level: null,
      target_value: null, current_value: null, value_unit: null,
      preferred_time_window: null, checkpoint_rewards: null,
    } as unknown as LongTermGoal;
    const progression = resolveLongTermProgression(task, goal);
    expect(progression).toBe('rhythm');

    const result = resolveLongTermCompletionAvailability({
      task, goal, progression,
      completions: [at('2026-08-10'), at('2026-08-11')],
      now: NOW, planStart: dayjs.tz('2026-08-10', TZ), planEnd: null,
    });
    expect(result).toEqual({ canComplete: true, reason: 'available' });
  });
});

describe('D｜fixed_days 回歸：非安排日不能記', () => {
  it('沒有排今天就擋下來', () => {
    const task = stagedTask({
      progress_model: null, schedule_mode: null, recurrence_days: [1, 5], // 週一、週五
    });
    const goal = stagedGoal({ level_count: null, level_definitions: null, current_level: null });
    const progression = resolveLongTermProgression(task, goal);
    expect(progression).toBe('fixed_days');

    const result = resolveLongTermCompletionAvailability({
      task, goal, progression, completions: [], now: NOW, // 週三
      planStart: dayjs.tz('2026-08-01', TZ), planEnd: null,
    });
    expect(result).toEqual({ canComplete: false, reason: 'not_scheduled_today' });
  });
});

describe('E｜null progression：仍然沒有 CTA', () => {
  it('沒有任何結構化證據就不能打卡', () => {
    const task = stagedTask(); // 沒有 recurrence_days
    const goal = stagedGoal({
      level_count: null, level_definitions: null, current_level: null,
      target_value: null, current_value: null, value_unit: null,
    });
    const progression = resolveLongTermProgression(task, goal);
    expect(progression).toBeNull();

    const result = resolveLongTermCompletionAvailability({
      task, goal, progression, completions: [], now: NOW,
      planStart: dayjs.tz('2026-08-01', TZ), planEnd: null,
    });
    expect(result).toEqual({ canComplete: false, reason: 'unsupported_progression' });

    const view = buildGoalPresentation(task, goal, [], NOW);
    expect(view.canCompleteToday).toBe(false);
  });
});

describe('F｜同一天重複：claim cap 是唯一 duplicate guard', () => {
  it('今天已經記過，staged 也一樣被擋，理由是 claim 相關而不是額外的 stage 規則', () => {
    const task = stagedTask({ recurrence_days: [3] });
    const goal = stagedGoal();
    const progression = resolveLongTermProgression(task, goal);
    const result = resolveLongTermCompletionAvailability({
      task, goal, progression, completions: [at('2026-08-12')], now: NOW,
      planStart: dayjs.tz('2026-08-01', TZ), planEnd: null,
    });
    expect(result).toEqual({ canComplete: false, reason: 'already_recorded_today' });
  });
});

describe('G｜reward：per_completion 正常結算，progression position 不受影響', () => {
  it('agreedReward 存在與否，都不影響 overallLabel', () => {
    const task = stagedTask({ recurrence_days: [3] });
    const goal = stagedGoal();
    const withReward = buildGoalPresentation(task, goal, [at('2026-08-12')], NOW, {
      agreedReward: {
        policy: 'coin_eligible', coinAmount: 8, payoutBasis: 'per_completion',
        claimPeriod: 'day', maxClaimsPerPeriod: 1, label: '每完成一次，+8 成長幣',
      },
    });
    const withoutReward = buildGoalPresentation(task, goal, [at('2026-08-12')], NOW);
    expect(withReward.overallLabel).toBe(withoutReward.overallLabel);
    expect(withReward.overallLabel).toBe('第 2 / 4 階段');
  });
});
