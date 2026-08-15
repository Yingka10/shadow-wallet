// LT-FINAL-1R — 純函式層：progression / completion / lineage
//
// 這一組不碰 UI，只釘住三件事的判準本身。

import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { LongTermGoal, Task } from '../../../types/database';
import type { ChildProposalPlanVersion } from '../../childProposal/types';
import {
  claimWindowCount,
  readAgreedReward,
  resolveAgreedPreferredTime,
  resolveChildFormalPlanVersion,
  resolveLongTermCompletionAvailability,
  resolveLongTermProgression,
  resolveTodayAction,
} from '../index';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';
const NOW = dayjs.tz('2026-08-12T20:00:00', TZ);

const task = (over: Partial<Task> = {}) => ({
  id: 't', name: '兩週讀完這本書', category: 'D',
  progress_model: 'weekly_rhythm', schedule_mode: 'weekly_frequency',
  weekly_frequency: 3, recurrence_days: null,
  claim_period: 'day', max_claims_per_period: 1,
  estimated_minutes: 15, base_time_min: 99,
  next_step: '今晚睡前讀 15 分鐘', completion_description: '完成一次約定的閱讀時段',
  preferred_time: 'before_bed', preferred_time_custom: null,
  ...over,
} as unknown as Task);

const goal = (over: Partial<LongTermGoal> = {}) => ({
  id: 'g', goal_type: 'skill', status: 'active',
  active_days: null, level_count: null, level_definitions: null, current_level: null,
  target_value: null, current_value: null, value_unit: null,
  ...over,
} as unknown as LongTermGoal);

const at = (date: string) => ({
  completed_at: dayjs.tz(`${date}T20:00:00`, TZ).toISOString(),
});

// ---------------------------------------------------------------------------

describe('resolveLongTermProgression', () => {
  it('goal_type 完全不參與', () => {
    for (const type of ['skill', 'habit', 'challenge', 'responsibility']) {
      expect(resolveLongTermProgression(task(), goal({ goal_type: type as never })))
        .toBe('rhythm');
    }
  });

  it('沒有任何結構化證據就是 null，不猜', () => {
    expect(resolveLongTermProgression(
      task({ progress_model: null, schedule_mode: null, weekly_frequency: null }),
      goal(),
    )).toBeNull();
  });

  it('固定星期要真的有值', () => {
    const base = task({ progress_model: null, schedule_mode: 'fixed_days', weekly_frequency: null });
    expect(resolveLongTermProgression(base, goal())).toBeNull();
    expect(resolveLongTermProgression(base, goal({ active_days: [1, 3, 5] }))).toBe('fixed_days');
    expect(resolveLongTermProgression({ ...base, recurrence_days: [2, 4] } as Task, goal()))
      .toBe('fixed_days');
  });

  it('階段制排在節奏之後 —— 有節奏證據時不會被 level 搶走', () => {
    expect(resolveLongTermProgression(task(), goal({ level_count: 4 }))).toBe('rhythm');
  });
});

describe('resolveLongTermCompletionAvailability', () => {
  const call = (over: {
    task?: Task; goal?: LongTermGoal; completions?: { completed_at: string }[];
  } = {}) => resolveLongTermCompletionAvailability({
    task: over.task ?? task(),
    goal: over.goal ?? goal(),
    progression: resolveLongTermProgression(over.task ?? task(), over.goal ?? goal()),
    completions: over.completions ?? [],
    now: NOW,
    planStart: dayjs.tz('2026-08-10', TZ),
    planEnd: dayjs.tz('2026-08-23', TZ),
  });

  it('週目標達成之後仍然可以記錄 —— 週目標不是完成上限', () => {
    const result = call({ completions: [at('2026-08-10'), at('2026-08-11')] });
    expect(result).toEqual({ canComplete: true, reason: 'available' });
  });

  it('擋下來的是 claim cap，理由講得出來', () => {
    expect(call({ completions: [at('2026-08-12')] }))
      .toEqual({ canComplete: false, reason: 'already_recorded_today' });
  });

  it('claim_period=week 時窗口才是一週', () => {
    const weekly = task({ claim_period: 'week', max_claims_per_period: 2 });
    expect(call({ task: weekly, completions: [at('2026-08-10')] }).canComplete).toBe(true);
    expect(call({ task: weekly, completions: [at('2026-08-10'), at('2026-08-11')] }))
      .toEqual({ canComplete: false, reason: 'claim_limit_reached' });
  });

  // LT-FINAL-1.1：staged / accumulation 現在**支援** session check-in
  // （§2 audit 證明 complete_task 對這兩種 progression 不會產生 side
  // effect），但沒有排程就不假設每天都能做。完整矩陣見
  // src/lib/longTerm/__tests__/sessionCheckIn.test.ts。
  it('階段制沒有排程時記不下來，理由是 schedule_not_defined 不是 unsupported_progression', () => {
    const staged = task({ progress_model: null, schedule_mode: null, weekly_frequency: null });
    expect(call({ task: staged, goal: goal({ level_count: 3 }) }))
      .toEqual({ canComplete: false, reason: 'schedule_not_defined' });
  });

  it('真的沒有任何 progression 證據才是 unsupported_progression', () => {
    const nothing = task({ progress_model: null, schedule_mode: null, weekly_frequency: null });
    expect(call({ task: nothing, goal: goal() }))
      .toEqual({ canComplete: false, reason: 'unsupported_progression' });
  });

  it('固定星期的非安排日講得出是「今天沒有安排」', () => {
    // 2026-08-12 是週三；只安排週一週五。
    const fixed = task({ progress_model: null, schedule_mode: 'fixed_days', weekly_frequency: null });
    expect(call({ task: fixed, goal: goal({ active_days: [1, 5] }) }))
      .toEqual({ canComplete: false, reason: 'not_scheduled_today' });
  });

  it('claim_period 缺值時沿用「一天一次」，不拿週目標補', () => {
    const legacy = task({ claim_period: null as never, max_claims_per_period: null as never });
    expect(claimWindowCount(legacy.claim_period, [at('2026-08-12')], NOW)).toBe(1);
    expect(call({ task: legacy, completions: [at('2026-08-12')] }).canComplete).toBe(false);
    expect(call({ task: legacy, completions: [at('2026-08-11')] }).canComplete).toBe(true);
  });
});

describe('resolveTodayAction', () => {
  it('canonical 優先序：next_step → 孩子的第一步 → 完成標準 → 名稱', () => {
    const childPlan = {
      desiredOutcome: null, actionPlanSummary: null,
      nextAction: '孩子寫的第一步', progressionKind: 'rhythm',
    };
    expect(resolveTodayAction(task(), childPlan)).toBe('今晚睡前讀 15 分鐘');
    expect(resolveTodayAction(task({ next_step: null }), childPlan)).toBe('孩子寫的第一步');
    expect(resolveTodayAction(task({ next_step: null }), null))
      .toBe('完成一次約定的閱讀時段');
    expect(resolveTodayAction(
      task({ next_step: null, completion_description: null }), null,
    )).toBe('兩週讀完這本書');
  });
});

describe('resolveAgreedPreferredTime', () => {
  it('完整家庭詞彙都講得出來', () => {
    for (const [value, label] of [
      ['before_school', '上學前'], ['after_school', '放學後'],
      ['after_dinner', '晚餐後'], ['before_bed', '睡前'],
      ['weekend', '週末'], ['when_needed', '需要時'],
    ]) {
      expect(resolveAgreedPreferredTime(task({ preferred_time: value }))?.label).toBe(label);
    }
  });

  it('沒談過就是 null', () => {
    expect(resolveAgreedPreferredTime(task({ preferred_time: null }))).toBeNull();
  });

  it('不認得的值不印工程字，也不當成沒談過', () => {
    const result = resolveAgreedPreferredTime(task({ preferred_time: 'mystery_slot' }));
    expect(result?.label).toBe('已經談好的時段');
  });
});

describe('resolveChildFormalPlanVersion', () => {
  const version = (over: Partial<ChildProposalPlanVersion>) => ({
    id: 'x', authored_by: 'parent', adopted_from_plan_version_id: null,
    source_planning_session_id: null, child_confirmed_plan: null,
    ...over,
  } as ChildProposalPlanVersion);

  it('沿 adoption lineage 走回孩子的正式計畫', () => {
    const versions = [
      version({ id: 'v3', adopted_from_plan_version_id: 'v2' }),
      version({ id: 'v2', adopted_from_plan_version_id: 'v1' }),
      version({
        id: 'v1', authored_by: 'child', source_planning_session_id: 's1',
        child_confirmed_plan: { desiredOutcome: '兩週讀完這本書' },
      }),
    ];
    expect(resolveChildFormalPlanVersion(versions, 'v3')?.id).toBe('v1');
  });

  it('不挑「第一筆 authored_by=child」—— 沒在鏈上的孩子版本不算', () => {
    const versions = [
      version({
        id: 'other', authored_by: 'child', source_planning_session_id: 's0',
        child_confirmed_plan: { desiredOutcome: '別的想法' },
      }),
      version({ id: 'v2', adopted_from_plan_version_id: null }),
    ];
    expect(resolveChildFormalPlanVersion(versions, 'v2')).toBeNull();
  });

  it('鏈有迴圈時停下來，不無限走', () => {
    const versions = [
      version({ id: 'a', adopted_from_plan_version_id: 'b' }),
      version({ id: 'b', adopted_from_plan_version_id: 'a' }),
    ];
    expect(resolveChildFormalPlanVersion(versions, 'a')).toBeNull();
  });
});

describe('readAgreedReward', () => {
  const snapshot = (over: Partial<ChildProposalPlanVersion>) => ({
    confirmed_reward_policy: 'coin_eligible',
    confirmed_coin_amount: 8,
    confirmed_payout_basis: 'per_completion',
    confirmed_claim_period: 'day',
    confirmed_max_claims_per_period: 1,
    ...over,
  } as ChildProposalPlanVersion);

  it('P1 的 per_completion 講「每完成一次」', () => {
    expect(readAgreedReward(snapshot({}))?.label).toBe('每完成一次，+8 成長幣');
  });

  it('legacy 的 per_period 不被重新詮釋成說好的回饋', () => {
    expect(readAgreedReward(snapshot({ confirmed_payout_basis: 'per_period' }))).toBeNull();
  });

  it('沒有快照就是 null', () => {
    expect(readAgreedReward(snapshot({ confirmed_reward_policy: null }))).toBeNull();
  });

  it('不發幣的政策講得出它自己的那句話', () => {
    expect(readAgreedReward(snapshot({
      confirmed_reward_policy: 'progress_only', confirmed_coin_amount: null,
    }))?.label).toBe('看得到進度，不給成長幣');
  });
});
