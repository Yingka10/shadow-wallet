// P0-2 — 孩子提案草稿 → P0-1 命令的映射
//
// 這一支證明的是「畫面上的四個問題，變成命令之後是對的」。
// 不渲染任何東西 —— 映射錯了不該靠點畫面才發現。

import {
  MAX_TIMES_PER_WEEK,
  MIN_TIMES_PER_WEEK,
  cadenceError,
  canLeaveStep,
  canSubmit,
  createEmptyDraft,
  goalError,
  motivationError,
  toCadenceInput,
  toCreateCommand,
  toProposeCommand,
  toggleDay,
  withCadence,
  withGoal,
  withMotivation,
  withSeenAs,
} from '../proposalDraft';
import type { ChildProposalDraft } from '../types';

const CHILD = 'child-1';
const DEMO_GOAL = '我想兩週把這本書讀完';
const DEMO_WHY = '因為同學說這本書很好看';

function demoDraft(): ChildProposalDraft {
  return withGoal(createEmptyDraft(), DEMO_GOAL);
}

// ---------------------------------------------------------------------------
// goal（必填）
// ---------------------------------------------------------------------------

describe('你想試試看什麼（必填）', () => {
  it('空的不能送', () => {
    expect(goalError(createEmptyDraft())).toBe('GOAL_REQUIRED');
    expect(canSubmit(createEmptyDraft())).toBe(false);
  });

  it.each(['   ', '\n', '\t  \n'])('只有空白也不能送：%p', (goal) => {
    expect(goalError(withGoal(createEmptyDraft(), goal))).toBe('GOAL_REQUIRED');
  });

  it('寫了就可以送', () => {
    expect(goalError(demoDraft())).toBeNull();
    expect(canSubmit(demoDraft())).toBe(true);
  });

  it('沒寫目標時走不出第一步', () => {
    expect(canLeaveStep('goal', createEmptyDraft())).toBe(false);
    expect(canLeaveStep('goal', demoDraft())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 原話不被改寫
// ---------------------------------------------------------------------------

describe('孩子的原話原樣送出', () => {
  it('goal 一個字都不改（不 trim、不正規化）', () => {
    const raw = '  我想兩週把這本書讀完  ';
    const command = toCreateCommand(withGoal(createEmptyDraft(), raw), CHILD);
    expect(command.childOriginalGoal).toBe(raw);
  });

  it('保留孩子寫的換行與標點', () => {
    const raw = '我想兩週把這本書讀完！！\n然後跟阿翔講';
    const command = toCreateCommand(withGoal(createEmptyDraft(), raw), CHILD);
    expect(command.childOriginalGoal).toBe(raw);
  });

  it('Demo 主要案例原樣送進 service', () => {
    const command = toCreateCommand(demoDraft(), CHILD);
    expect(command.childOriginalGoal).toBe(DEMO_GOAL);
    expect(command.childId).toBe(CHILD);
    expect(command.schemaVersion).toBe(1);
  });

  it('建立時一律是 draft —— 不可以直接建立 active/shared', () => {
    expect(toCreateCommand(demoDraft(), CHILD).status).toBe('draft');
  });
});

// ---------------------------------------------------------------------------
// motivation（選填）
// ---------------------------------------------------------------------------

describe('為什麼想做（選填）', () => {
  it('沒填也沒有錯誤，而且送得出去', () => {
    expect(motivationError(demoDraft())).toBeNull();
    expect(canSubmit(demoDraft())).toBe(true);
  });

  it('沒填就整個不帶這個鍵（不要存一個空字串）', () => {
    const command = toCreateCommand(demoDraft(), CHILD);
    expect('childOriginalMotivation' in command).toBe(false);
  });

  it.each(['', '   ', '\n'])('只有空白也視為沒填：%p', (motivation) => {
    const draft = withMotivation(demoDraft(), motivation);
    expect('childOriginalMotivation' in toCreateCommand(draft, CHILD)).toBe(false);
  });

  it('填了就帶上去', () => {
    const command = toCreateCommand(withMotivation(demoDraft(), DEMO_WHY), CHILD);
    expect(command.childOriginalMotivation).toBe(DEMO_WHY);
  });
});

// ---------------------------------------------------------------------------
// cadence
// ---------------------------------------------------------------------------

describe('你想怎麼開始 — 一週做幾次', () => {
  it.each([1, 2, 3, 4, 5, 6, 7])('%i 次是合法的', (times) => {
    const draft = withCadence(demoDraft(), { kind: 'weekly_times', timesPerWeek: times });
    expect(cadenceError(draft)).toBeNull();
    expect(toCadenceInput(draft.cadence)).toEqual({
      mode: 'weekly_frequency',
      weeklyFrequency: times,
    });
  });

  it.each([0, -1, 8, 99])('%i 次不能送出', (times) => {
    const draft = withCadence(demoDraft(), { kind: 'weekly_times', timesPerWeek: times });
    expect(cadenceError(draft)).toBe('TIMES_OUT_OF_RANGE');
    expect(canSubmit(draft)).toBe(false);
    expect(canLeaveStep('cadence', draft)).toBe(false);
  });

  it.each([1.5, Number.NaN])('不是整數也不能送出：%p', (times) => {
    const draft = withCadence(demoDraft(), { kind: 'weekly_times', timesPerWeek: times });
    expect(cadenceError(draft)).toBe('TIMES_NOT_INTEGER');
    expect(canSubmit(draft)).toBe(false);
  });

  it('上下限與 DB 的 1–7 一致', () => {
    expect([MIN_TIMES_PER_WEEK, MAX_TIMES_PER_WEEK]).toEqual([1, 7]);
  });

  it('Demo 主要案例：一週 4 次', () => {
    const draft = withCadence(demoDraft(), { kind: 'weekly_times', timesPerWeek: 4 });
    const command = toCreateCommand(draft, CHILD);
    expect(command.cadence).toEqual({ mode: 'weekly_frequency', weeklyFrequency: 4 });
    // fixed_days 的欄位不可以同時出現（DB 的 cadence_shape 會擋）。
    expect(command.cadence?.days).toBeUndefined();
  });
});

describe('你想怎麼開始 — 固定哪幾天', () => {
  it('選了日子就映射成 fixed_days', () => {
    const draft = withCadence(demoDraft(), { kind: 'certain_days', days: [2, 4] });
    expect(cadenceError(draft)).toBeNull();
    expect(toCadenceInput(draft.cadence)).toEqual({ mode: 'fixed_days', days: [2, 4] });
  });

  it('日子排序後才送出（順序不該影響資料）', () => {
    const draft = withCadence(demoDraft(), { kind: 'certain_days', days: [5, 1, 3] });
    expect(toCadenceInput(draft.cadence)).toEqual({ mode: 'fixed_days', days: [1, 3, 5] });
  });

  it('一天都沒選不能送出', () => {
    const draft = withCadence(demoDraft(), { kind: 'certain_days', days: [] });
    expect(cadenceError(draft)).toBe('DAYS_REQUIRED');
    expect(canSubmit(draft)).toBe(false);
  });

  it.each([-1, 7, 99])('超出 0–6 的日子不能送出：%i', (day) => {
    const draft = withCadence(demoDraft(), { kind: 'certain_days', days: [day] });
    expect(cadenceError(draft)).toBe('DAY_OUT_OF_RANGE');
  });

  it('重複的日子不能送出', () => {
    const draft = withCadence(demoDraft(), { kind: 'certain_days', days: [2, 2] });
    expect(cadenceError(draft)).toBe('DAYS_DUPLICATED');
  });

  it('toggleDay 加了又減、而且保持排序', () => {
    let draft = withCadence(demoDraft(), { kind: 'certain_days', days: [] });
    draft = toggleDay(draft, 4);
    draft = toggleDay(draft, 2);
    expect(draft.cadence).toEqual({ kind: 'certain_days', days: [2, 4] });
    draft = toggleDay(draft, 4);
    expect(draft.cadence).toEqual({ kind: 'certain_days', days: [2] });
  });

  it('從別的模式按日子會切換成 fixed_days', () => {
    const draft = toggleDay(withCadence(demoDraft(), { kind: 'not_sure' }), 3);
    expect(draft.cadence).toEqual({ kind: 'certain_days', days: [3] });
  });
});

describe('你想怎麼開始 — 一次就好 / 還不知道', () => {
  it('一次就好 → one_time', () => {
    const draft = withCadence(demoDraft(), { kind: 'just_once' });
    expect(cadenceError(draft)).toBeNull();
    expect(toCadenceInput(draft.cadence)).toEqual({ mode: 'one_time' });
  });

  it('還不知道 → 命令裡完全不帶 cadence', () => {
    const draft = withCadence(demoDraft(), { kind: 'not_sure' });
    expect(cadenceError(draft)).toBeNull();
    expect(toCadenceInput(draft.cadence)).toBeUndefined();

    const command = toCreateCommand(draft, CHILD);
    // 不是 cadence: undefined，是整個鍵不存在 —— 塞一個假的預設值
    // 會讓「還沒想好」變成一個具體的答案。
    expect('cadence' in command).toBe(false);
  });

  it('預設就是「還不知道」，不替孩子預選節奏', () => {
    expect(createEmptyDraft().cadence).toEqual({ kind: 'not_sure' });
  });

  it('沒選節奏也送得出去', () => {
    expect(canSubmit(demoDraft())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 怎麼被看見
// ---------------------------------------------------------------------------

describe('你希望這件事怎麼被看見', () => {
  it.each([
    ['just_record'],
    ['see_progress'],
    ['hopes_for_coin'],
    ['not_specified'],
  ] as const)('%s 原樣映射成 childRewardPreference', (choice) => {
    const command = toCreateCommand(withSeenAs(demoDraft(), choice), CHILD);
    expect(command.childRewardPreference).toBe(choice);
  });

  it('沒選就是 not_specified', () => {
    expect(toCreateCommand(demoDraft(), CHILD).childRewardPreference).toBe('not_specified');
  });

  it('Demo 主要案例：如果適合，我希望有成長幣', () => {
    const command = toCreateCommand(withSeenAs(demoDraft(), 'hopes_for_coin'), CHILD);
    expect(command.childRewardPreference).toBe('hopes_for_coin');
  });

  it('命令裡沒有任何幣值欄位 —— 孩子不決定發幾個幣', () => {
    const command = toCreateCommand(withSeenAs(demoDraft(), 'hopes_for_coin'), CHILD);
    const keys = JSON.stringify(command);
    for (const forbidden of ['coin', 'Coin', 'amount', 'Amount', 'reward_policy', 'difficulty']) {
      // childRewardPreference 是唯一允許出現 "reward" 的鍵，它是偏好不是政策。
      if (forbidden === 'coin' || forbidden === 'Coin') {
        expect(keys.replace(/hopes_for_coin/g, '')).not.toContain(forbidden);
      } else {
        expect(keys).not.toContain(forbidden);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 送出命令
// ---------------------------------------------------------------------------

describe('送出（draft → proposed）命令', () => {
  it('形狀正確，而且 actor 是孩子', () => {
    expect(toProposeCommand('p-1')).toEqual({
      schemaVersion: 1,
      proposalId: 'p-1',
      toStatus: 'proposed',
      actorRole: 'child',
    });
  });

  it('不帶 taskId —— 這一步不建立任何正式任務', () => {
    expect('taskId' in toProposeCommand('p-1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 完整的 Demo golden path
// ---------------------------------------------------------------------------

describe('Demo golden path 的完整命令', () => {
  it('承恩：兩週讀完這本書、一週 4 次、希望有成長幣', () => {
    let draft = createEmptyDraft();
    draft = withGoal(draft, DEMO_GOAL);
    draft = withMotivation(draft, DEMO_WHY);
    draft = withCadence(draft, { kind: 'weekly_times', timesPerWeek: 4 });
    draft = withSeenAs(draft, 'hopes_for_coin');

    expect(canSubmit(draft)).toBe(true);
    expect(toCreateCommand(draft, CHILD)).toEqual({
      schemaVersion: 1,
      childId: CHILD,
      childOriginalGoal: DEMO_GOAL,
      childOriginalMotivation: DEMO_WHY,
      cadence: { mode: 'weekly_frequency', weeklyFrequency: 4 },
      childRewardPreference: 'hopes_for_coin',
      status: 'draft',
    });
  });
});
