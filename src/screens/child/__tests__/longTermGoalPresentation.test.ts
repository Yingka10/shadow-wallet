// LT-FINAL-1R — 長期計畫的資料真相
//
// ─────────────────────────────────────────────────────────────────────────────
// 這一組守六件事：
//
//   1. **progression 只從結構化證據來。** goal_type / task.name / category /
//      duration_type 一律不參與。
//   2. **週目標不是完成上限。** 3/3 之後仍然可以記錄。
//   3. **不 clamp。** 做了四次就是四次，但不寫成 4/3。
//   4. **進度不會讓計畫結束。** 做滿 14 次不是 completed。
//   5. **畫面上的每一句方法都指得出誰講的。**
//   6. **rhythm 不生成里程碑。**
// ─────────────────────────────────────────────────────────────────────────────

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import type { LongTermGoal, Task } from '../../../types/database';
import { buildGoalPresentation, type GoalCompletionRecord } from '../longTermGoalPresentation';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';
/** 週三，計畫期間內。固定住「今天」才能穩定驗週邊界。 */
const NOW = dayjs.tz('2026-08-12T20:00:00', TZ);
const MONDAY = '2026-08-10';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    family_id: 'family-1',
    name: '兩週讀完這本書',
    category: 'D',
    day_type: 'both',
    long_term_type: 'habit',
    is_long_term: true,
    base_time_min: 15,
    difficulty: 1,
    coin_override: null,
    is_system_default: false,
    allow_repeat: false,
    min_age: 6,
    max_age: 9,
    is_active: true,
    time_saving_min: 0,
    recurrence_days: null,
    due_date: null,
    created_at: '2026-08-10T00:00:00+08:00',
    progress_model: 'weekly_rhythm',
    schedule_mode: 'weekly_frequency',
    weekly_frequency: 3,
    estimated_minutes: 15,
    next_step: '今晚睡前讀 15 分鐘',
    completion_description: '完成一次約定的閱讀時段',
    preferred_time: 'before_bed',
    claim_period: 'day',
    max_claims_per_period: 1,
    payout_basis: 'per_completion',
    ...overrides,
  } as Task;
}

function makeGoal(overrides: Partial<LongTermGoal> = {}): LongTermGoal {
  return {
    id: 'goal-1',
    child_id: 'child-1',
    task_id: 'task-1',
    // ⚠️ 刻意留 'skill' —— 它**不可以**影響任何判斷。
    goal_type: 'skill',
    total_days: 14,
    current_day: 0,
    status: 'active',
    checkpoint_rewards: null,
    motivation_note: null,
    started_at: MONDAY,
    end_date: '2026-08-23',
    next_review_at: null,
    completed_at: null,
    created_at: '2026-08-10T00:00:00+08:00',
    min_age: 6,
    interrupt_count: 0,
    last_active_date: null,
    active_days: null,
    preferred_time_window: null,
    level_definitions: null,
    current_level: null,
    level_count: null,
    role_title: null,
    salary_mode: null,
    base_salary: null,
    weekly_target_rate: null,
    privilege_reward: null,
    family_time_per_completion: null,
    target_completions: null,
    target_value: null,
    current_value: null,
    value_unit: null,
    ...overrides,
  } as LongTermGoal;
}

function done(...isoDates: string[]): GoalCompletionRecord[] {
  return isoDates.map((date, index) => ({
    id: `done-${index + 1}`,
    completed_at: dayjs.tz(`${date}T20:00:00`, TZ).toISOString(),
    planned_time_window: null,
    start_mode: null,
  }));
}

const build = (
  task: Task,
  goal: LongTermGoal,
  completions: GoalCompletionRecord[] = [],
  extras = {},
  now = NOW,
) => buildGoalPresentation(task, goal, completions, now, extras);

// ---------------------------------------------------------------------------

describe('1. progression 只從結構化證據來', () => {
  it('weekly_rhythm 是節奏，即使 goal_type 寫著 skill', () => {
    expect(build(makeTask(), makeGoal()).progression).toBe('rhythm');
  });

  it('沒有 progress_model 但排法是 weekly_frequency，仍然是節奏', () => {
    const view = build(makeTask({ progress_model: null }), makeGoal());
    expect(view.progression).toBe('rhythm');
  });

  it('只有真的有 level 才是階段制', () => {
    const staged = build(
      makeTask({ progress_model: null, schedule_mode: 'fixed_days', weekly_frequency: null }),
      makeGoal({ level_count: 4, current_level: 2 }),
    );
    expect(staged.progression).toBe('staged');
  });

  it('goal_type=skill 但沒有任何 level 證據 → 不是階段制', () => {
    const view = build(
      makeTask({
        progress_model: null, schedule_mode: null, weekly_frequency: null,
        recurrence_days: null,
      }),
      makeGoal({ goal_type: 'skill' }),
    );
    expect(view.progression).toBeNull();
    expect(view.planState).toBe('unplanned');
    expect(view.canCompleteToday).toBe(false);
    expect(view.completionReason).toBe('unsupported_progression');
  });

  it('累積制要有目標值與單位，不從名稱 parse 數字', () => {
    const fromName = build(
      makeTask({
        name: '讀 5 本書', progress_model: null, schedule_mode: null,
        weekly_frequency: null, recurrence_days: null,
      }),
      makeGoal({ goal_type: 'challenge' }),
    );
    expect(fromName.progression).toBeNull();

    const real = build(
      makeTask({
        progress_model: null, schedule_mode: null, weekly_frequency: null,
        recurrence_days: null,
      }),
      makeGoal({ target_value: 20, current_value: 8, value_unit: '本' }),
    );
    expect(real.progression).toBe('accumulation');
    expect(real.overallLabel).toBe('8 / 20 本');
  });

  it('名稱裡有「閱讀」不會改變任何東西', () => {
    const named = build(makeTask({ name: '自主閱讀計畫' }), makeGoal());
    const plain = build(makeTask({ name: '每天練琴' }), makeGoal());
    expect(named.progression).toBe(plain.progression);
    expect(named.weekProgressLabel).toBe(plain.weekProgressLabel);
    expect(JSON.stringify(named)).not.toContain('閱讀節奏');
    expect(JSON.stringify(named)).not.toContain('哪一本');
  });

  it('兩邊都沒有星期資料時不憑空生一張行程表', () => {
    const view = build(
      makeTask({
        progress_model: null, schedule_mode: 'fixed_days',
        weekly_frequency: null, recurrence_days: null,
      }),
      makeGoal({ active_days: null }),
    );
    expect(view.progression).toBeNull();
    expect(view.weekDays.every((day) => !day.isScheduled)).toBe(true);
  });
});

describe('2. 週目標不是完成上限', () => {
  it('0 → 1 → 2 → 3 都可以記錄，第 3 次之後仍然可以', () => {
    const days = ['2026-08-10', '2026-08-11', '2026-08-12'];
    for (let count = 0; count <= 3; count += 1) {
      const view = build(makeTask(), makeGoal(), done(...days.slice(0, count)));
      // 今天（8/12）還沒記錄的情況下一律可以按。
      const recordedToday = days.slice(0, count).includes('2026-08-12');
      expect(view.canCompleteToday).toBe(!recordedToday);
    }
  });

  it('本週已達 3/3，換一天仍然可以記錄', () => {
    const view = build(
      makeTask(),
      makeGoal(),
      done('2026-08-10', '2026-08-11'),
    );
    expect(view.weekCompletedActual).toBe(2);
    expect(view.canCompleteToday).toBe(true);

    const reached = build(
      makeTask(),
      // 三次都在今天以前 → 今天是第四次
      makeGoal(),
      done('2026-08-10', '2026-08-11', '2026-08-11'),
    );
    expect(reached.canCompleteToday).toBe(true);
  });

  it('同一天第二次被 claim cap 擋，理由講得出來', () => {
    const view = build(makeTask(), makeGoal(), done('2026-08-12'));
    expect(view.canCompleteToday).toBe(false);
    expect(view.completionReason).toBe('already_recorded_today');
  });

  it('claim cap 來自 claim_period/max_claims，不是 weekly_frequency', () => {
    // 一週 3 次的計畫，把 cap 設成一天兩次 → 同一天第二次仍然可以。
    const view = build(
      makeTask({ max_claims_per_period: 2 }),
      makeGoal(),
      done('2026-08-12'),
    );
    expect(view.canCompleteToday).toBe(true);
  });
});

describe('3. 不 clamp，但也不寫成 4/3', () => {
  it('2 / 3 講得出還差幾次', () => {
    const view = build(makeTask(), makeGoal(), done('2026-08-10', '2026-08-11'));
    expect(view.weekProgressLabel).toBe('本週 2 / 3');
    expect(view.weekProgressNote).toBe('再走一小步，這週的節奏就完整了');
    expect(view.weekTargetReached).toBe(false);
  });

  it('3 / 3 講「已到這週約定的節奏」', () => {
    const view = build(
      makeTask(), makeGoal(), done('2026-08-10', '2026-08-11', '2026-08-12'),
    );
    expect(view.weekProgressLabel).toBe('本週 3 / 3');
    expect(view.weekProgressNote).toBe('已到這週約定的節奏');
    expect(view.weekTargetReached).toBe(true);
  });

  it('做了 4 次不顯示 4 / 3，也不顯示百分比超過 100', () => {
    // 同一天記兩次會被 claim cap 擋掉，所以四次一定落在四個不同日期；
    // 「今天」往後移到週六才有四天可用。
    const saturday = dayjs.tz('2026-08-15T20:00:00', TZ);
    const view = build(
      makeTask(), makeGoal(),
      done('2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'),
      {},
      saturday,
    );
    expect(view.weekCompletedActual).toBe(4);
    expect(view.weekExtra).toBe(1);
    expect(view.weekProgressLabel).toBe('本週完成 4 次');
    expect(view.weekProgressNote).toBe('原本約定 3 次');
    expect(view.overallPercent).toBeLessThanOrEqual(100);
    expect(JSON.stringify(view)).not.toContain('4 / 3');
  });
});

describe('4. 進度不會讓計畫結束', () => {
  it('14 次完成之後仍然 active、不顯示 100%、不說旅程完成', () => {
    const fourWeeks = makeGoal({ total_days: 28, end_date: '2026-09-06' });
    const dates: string[] = [];
    for (let i = 0; i < 14; i += 1) {
      dates.push(dayjs.tz(MONDAY, TZ).add(i, 'day').format('YYYY-MM-DD'));
    }
    const view = build(makeTask(), fourWeeks, done(...dates));

    expect(view.planState).toBe('active');
    expect(view.overallPercent).toBeLessThan(100);
    expect(JSON.stringify(view)).not.toContain('旅程完成');
    expect(view.completionConditionLabel).not.toContain('14');
  });

  it('completionConditionLabel 講週期，不講總次數', () => {
    expect(build(makeTask(), makeGoal()).completionConditionLabel).toBe('2 週計畫 · 每週 3 次');
  });

  it('達標與計畫結束是兩件事', () => {
    const view = build(
      makeTask(), makeGoal(), done('2026-08-10', '2026-08-11', '2026-08-12'),
    );
    expect(view.targetReached).toBe(true);
    expect(view.planState).toBe('active');
  });

  it('goal.status = completed 才是完成', () => {
    expect(build(makeTask(), makeGoal({ status: 'completed' })).planState).toBe('completed');
  });
});

describe('5. 今天那一句話指得出誰講的', () => {
  it('優先讀 task.next_step', () => {
    expect(build(makeTask(), makeGoal()).todayAction).toBe('今晚睡前讀 15 分鐘');
  });

  it('沒有 next_step 時讀孩子自己確認過的第一步', () => {
    const view = build(makeTask({ next_step: null }), makeGoal(), [], {
      childPlan: {
        desiredOutcome: '兩週讀完這本書',
        actionPlanSummary: '每天睡前讀一點',
        nextAction: '今晚睡前讀 15 分鐘',
        progressionKind: 'rhythm',
      },
    });
    expect(view.todayAction).toBe('今晚睡前讀 15 分鐘');
  });

  it('兩者都沒有時退到完成標準，不自己編方法', () => {
    const view = build(makeTask({ next_step: null }), makeGoal());
    expect(view.todayAction).toBe('完成一次約定的閱讀時段');
    expect(JSON.stringify(view)).not.toContain('今天繼續就好');
  });

  it('每次多久讀 estimated_minutes，不讀 base_time_min', () => {
    const view = build(makeTask({ estimated_minutes: 20, base_time_min: 99 }), makeGoal());
    expect(view.sessionMinutes).toBe(20);
    expect(JSON.stringify(view)).not.toContain('99');
  });
});

describe('6. 時段拆成兩個 domain', () => {
  it('放學後也講得出來，不會變成「尚未選擇時段」', () => {
    const view = build(makeTask({ preferred_time: 'after_school' }), makeGoal());
    expect(view.agreedTime).toEqual({ value: 'after_school', label: '放學後' });
    // 但它記不進 completion context，所以不顯示時段選擇。
    expect(view.supportsTimeWindow).toBe(false);
  });

  it('睡前記得下來，所以顯示時段選擇', () => {
    const view = build(makeTask({ preferred_time: 'before_bed' }), makeGoal());
    expect(view.agreedTime?.label).toBe('睡前');
    expect(view.supportsTimeWindow).toBe(true);
  });

  it('自訂時段用家長寫的字', () => {
    const view = build(
      makeTask({ preferred_time: 'custom', preferred_time_custom: '寫完功課後' }),
      makeGoal(),
    );
    expect(view.agreedTime).toEqual({ value: 'custom', label: '寫完功課後' });
  });
});

describe('7. rhythm 不生成里程碑', () => {
  it('沒有 checkpoint 就沒有里程碑', () => {
    expect(build(makeTask(), makeGoal()).milestones).toEqual([]);
  });

  it('不再補一條「N 週後一起回顧」', () => {
    const view = build(makeTask(), makeGoal());
    expect(JSON.stringify(view.milestones)).not.toContain('回顧');
  });

  it('checkpoint 沒有真實 title 就不算一個有意義的節點（不再自動生成「第 N 次的計畫節點」）', () => {
    const view = build(makeTask(), makeGoal({ checkpoint_rewards: { '5': 10 } }));
    expect(view.milestones).toEqual([]);
  });

  it('checkpoint 有真實 title 才列出來，note/coin 一起帶出', () => {
    const view = build(makeTask(), makeGoal({
      checkpoint_rewards: { '3': { coin: 20, title: '第一次一起回顧', note: '到這裡時，看看這段安排做起來怎麼樣，再決定下一段。' } },
    }));
    expect(view.milestones).toHaveLength(1);
    expect(view.milestones[0].title).toBe('第一次一起回顧');
    expect(view.milestones[0].note).toBe('到這裡時，看看這段安排做起來怎麼樣，再決定下一段。');
    expect(view.milestones[0].coin).toBe(20);
  });
});

describe('8. 說好的回饋只讀共同版本快照', () => {
  it('P1 的 per_completion 快照講「每完成一次」', () => {
    const view = build(makeTask(), makeGoal(), [], {
      agreedReward: {
        policy: 'coin_eligible', coinAmount: 8, payoutBasis: 'per_completion',
        claimPeriod: 'day', maxClaimsPerPeriod: 1,
        label: '每完成一次，+8 成長幣',
      },
    });
    expect(view.agreedReward?.label).toBe('每完成一次，+8 成長幣');
    expect(view.legacyReward).toBe(false);
  });

  it('legacy 的回饋不被重新詮釋成「說好的回饋」', () => {
    const view = build(makeTask(), makeGoal(), [], { legacyReward: true });
    expect(view.agreedReward).toBeNull();
    expect(view.legacyReward).toBe(true);
  });
});

describe('9. 計畫還沒開始／已經過期', () => {
  it('還沒開始不能記錄，理由是 before_plan', () => {
    const view = build(makeTask(), makeGoal({ started_at: '2026-09-01', end_date: '2026-09-14' }));
    expect(view.planState).toBe('upcoming');
    expect(view.completionReason).toBe('before_plan');
  });

  it('過期不能記錄，理由是 after_plan', () => {
    const view = build(makeTask(), makeGoal({ started_at: '2026-07-01', end_date: '2026-07-14' }));
    expect(view.planState).toBe('expired');
    expect(view.completionReason).toBe('after_plan');
  });

  it('暫停中不能記錄', () => {
    const view = build(makeTask(), makeGoal({ status: 'paused' }));
    expect(view.planState).toBe('paused');
    expect(view.completionReason).toBe('paused');
  });
});

describe('10. canonical milestone agreement 取代 legacy checkpoint（P1-M1A）', () => {
  it('有 milestoneAgreements 就整個取代 checkpoint_rewards，不是兩份合併', () => {
    const view = build(makeTask(), makeGoal({ checkpoint_rewards: { '3': { coin: 999, title: '不該出現的舊資料' } } }), [], {
      milestoneAgreements: [
        { id: 'a1', title: '完成第一段兩週閱讀安排', note: null, rewardCoinAmount: 20, achievedAt: null, settledAt: null },
      ],
    });
    expect(view.milestones).toHaveLength(1);
    expect(view.milestones[0].title).toBe('完成第一段兩週閱讀安排');
    expect(JSON.stringify(view.milestones)).not.toContain('不該出現的舊資料');
  });

  it('未達成：status 是 next，coin 顯示「說好的額外回饋」但不是「已記入帳本」', () => {
    const view = build(makeTask(), makeGoal(), [], {
      milestoneAgreements: [
        { id: 'a1', title: '完成第一段兩週閱讀安排', note: null, rewardCoinAmount: 20, achievedAt: null, settledAt: null },
      ],
    });
    expect(view.milestones[0].status).toBe('next');
    expect(view.milestones[0].coin).toBeNull();
    expect(view.milestones[0].detail).toContain('說好的額外回饋');
  });

  it('已達成但尚未結算：不宣稱錢已入帳', () => {
    const view = build(makeTask(), makeGoal(), [], {
      milestoneAgreements: [
        { id: 'a1', title: '完成第一段兩週閱讀安排', note: null, rewardCoinAmount: 20, achievedAt: '2026-08-17T00:00:00Z', settledAt: null },
      ],
    });
    expect(view.milestones[0].status).toBe('completed');
    expect(view.milestones[0].coin).toBeNull();
    expect(view.milestones[0].detail).not.toContain('已記入帳本');
  });

  it('已結算：coin 有值，文案講「已記入帳本」', () => {
    const view = build(makeTask(), makeGoal(), [], {
      milestoneAgreements: [
        { id: 'a1', title: '完成第一段兩週閱讀安排', note: null, rewardCoinAmount: 20, achievedAt: '2026-08-17T00:00:00Z', settledAt: '2026-08-17T00:00:01Z' },
      ],
    });
    expect(view.milestones[0].coin).toBe(20);
    expect(view.milestones[0].detail).toContain('已記入帳本');
  });

  it('沒有幣的 milestone 達成後仍是 completed，但沒有 coin badge', () => {
    const view = build(makeTask(), makeGoal(), [], {
      milestoneAgreements: [
        { id: 'a1', title: '完成第一段兩週閱讀安排', note: null, rewardCoinAmount: null, achievedAt: '2026-08-17T00:00:00Z', settledAt: null },
      ],
    });
    expect(view.milestones[0].status).toBe('completed');
    expect(view.milestones[0].coin).toBeNull();
    expect(view.milestones[0].detail).toBeNull();
  });

  it('第一站達成後，第二站才是 next —— 不會永遠停在第一站（先前的 latent bug）', () => {
    const view = build(makeTask(), makeGoal(), [], {
      milestoneAgreements: [
        { id: 'a1', title: '第一站', note: null, rewardCoinAmount: 20, achievedAt: '2026-08-17T00:00:00Z', settledAt: '2026-08-17T00:00:01Z' },
        { id: 'a2', title: '第二站', note: null, rewardCoinAmount: 20, achievedAt: null, settledAt: null },
      ],
    });
    expect(view.milestones[0].status).toBe('completed');
    expect(view.milestones[1].status).toBe('next');
  });

  it('全部達成後沒有 next/planned —— Next Stop 該收起來', () => {
    const view = build(makeTask(), makeGoal(), [], {
      milestoneAgreements: [
        { id: 'a1', title: '第一站', note: null, rewardCoinAmount: 20, achievedAt: '2026-08-17T00:00:00Z', settledAt: '2026-08-17T00:00:01Z' },
      ],
    });
    expect(view.milestones.some((m) => m.status === 'next' || m.status === 'planned')).toBe(false);
  });
});
