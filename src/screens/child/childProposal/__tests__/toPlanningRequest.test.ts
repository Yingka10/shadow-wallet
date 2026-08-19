// P1-A2 — proposal → planning request 的 adapter
//
// 這一層只做搬運與翻譯。會出錯的地方只有兩種：翻錯，或**多做決定**。

import { toPlanningCadence, toPlanningRequest } from '../toPlanningRequest';
import type { ChildProposal } from '../../../../lib/childProposal/types';

const PROPOSAL: ChildProposal = {
  id: 'proposal-1',
  family_id: 'family-1',
  child_id: 'child-1',
  status: 'draft',
  child_original_goal: '我想兩週讀完神奇樹屋',
  child_original_motivation: '因為同學說很好看',
  proposal_source: 'child',
  cadence_mode: 'fixed_days',
  cadence_weekly_frequency: null,
  cadence_days: [5, 1, 3],
  preferred_time: 'before_bed',
  preferred_time_custom: null,
  estimated_minutes: null,
  child_reward_preference: 'not_specified',
  child_note: null,
  current_plan_version_id: null,
  task_id: null,
  closed_reason: null,
  closed_at: null,
  proposed_at: null,
  activated_at: null,
  created_at: '2026-08-14T00:00:00Z',
  updated_at: '2026-08-14T00:00:00Z',
};

const CONTEXT = {
  ageGroup: '6-9',
  planningSupportPreference: null,
  childApproach: null,
  responses: [],
} as const;

describe('節奏的翻譯', () => {
  it('一週幾次', () => {
    expect(toPlanningCadence('weekly_frequency', 4, null)).toEqual({
      mode: 'weekly_frequency',
      weeklyFrequency: 4,
    });
  });

  it('固定星期幾 —— 排序過，與 tasks.recurrence_days 同一組編碼', () => {
    expect(toPlanningCadence('fixed_days', null, [5, 1, 3])).toEqual({
      mode: 'fixed_days',
      days: [1, 3, 5],
    });
  });

  it('做一次看看', () => {
    expect(toPlanningCadence('one_time', null, null)).toEqual({ mode: 'one_time' });
  });

  it.each([
    ['孩子還沒選', null, null, null],
    ['說一週幾次但沒有數字', 'weekly_frequency', null, null],
    ['說固定星期幾但沒有日子', 'fixed_days', null, []],
    // plan_schedule 在 planning 這一層沒有對應概念。硬翻的話，
    // 孩子會看到一個他從來沒選過的節奏。
    ['照計畫表', 'plan_schedule', null, null],
  ] as const)('%s → null，不補預設值', (_label, mode, weekly, days) => {
    expect(toPlanningCadence(mode, weekly, days as number[] | null)).toBeNull();
  });
});

describe('搬運', () => {
  it('原話逐字帶過去，一個字都不動', () => {
    const request = toPlanningRequest(PROPOSAL, CONTEXT);

    expect(request.childOriginalGoal).toBe('我想兩週讀完神奇樹屋');
    expect(request.childOriginalMotivation).toBe('因為同學說很好看');
  });

  it('孩子自己打的時段優先於他從選項挑的', () => {
    // preferred_time 是固定選項，preferred_time_custom 是他自己打的字。
    const request = toPlanningRequest(
      { ...PROPOSAL, preferred_time_custom: '寫完功課以後' },
      CONTEXT,
    );

    expect(request.preferredTime).toBe('寫完功課以後');
  });

  it('對話中的答案走 responses，不會混進四個內容欄位', () => {
    const request = toPlanningRequest(PROPOSAL, {
      ...CONTEXT,
      responses: [
        {
          type: 'clarification_answer',
          questionKind: 'goal_focus',
          question: '你最想在哪一件事情上變厲害？',
          answer: '我想把英文口說變好',
        },
      ],
    });

    // 原話沒有被那句答案取代 —— 這是整包最不能破的一條。
    expect(request.childOriginalGoal).toBe('我想兩週讀完神奇樹屋');
    expect(request.childApproach).toBeNull();
    expect(request.responses).toHaveLength(1);
  });
});
