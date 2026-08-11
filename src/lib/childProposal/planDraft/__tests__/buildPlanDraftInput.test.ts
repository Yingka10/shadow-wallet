// P0-3 — 真實 Proposal → AI 輸入，以及請求指紋
//
// 兩件事在這裡被釘住：
//   · 送進模型的是孩子的原話與他自己的選擇，不是別的東西
//   · 同樣的提案內容永遠算出同一把 key（重試不會多產生一版）

import {
  buildPlanDraftInput,
  planDraftRequestKey,
  toPlanDraftCadence,
  PLAN_DRAFT_REQUEST_KEY_PREFIX,
} from '../buildPlanDraftInput';
import type { ChildProposal } from '../../types';

const DEMO_GOAL = '我想兩週把這本書讀完';

function proposal(overrides: Partial<ChildProposal> = {}): ChildProposal {
  return {
    id: 'p-1',
    family_id: 'f-1',
    child_id: 'c-1',
    status: 'proposed',
    child_original_goal: DEMO_GOAL,
    child_original_motivation: '因為同學說這本書很好看',
    proposal_source: 'child',
    cadence_mode: 'weekly_frequency',
    cadence_weekly_frequency: 4,
    cadence_days: null,
    preferred_time: null,
    preferred_time_custom: null,
    estimated_minutes: null,
    child_reward_preference: 'hopes_for_coin',
    child_note: null,
    current_plan_version_id: null,
    task_id: null,
    closed_reason: null,
    closed_at: null,
    proposed_at: '2026-08-11T02:00:00.000Z',
    activated_at: null,
    created_at: '2026-08-11T02:00:00.000Z',
    updated_at: '2026-08-11T02:00:00.000Z',
    ...overrides,
  };
}

describe('送進模型的東西', () => {
  it('原話與原因原封不動', () => {
    const input = buildPlanDraftInput(proposal(), '6-9');
    expect(input.childOriginalGoal).toBe(DEMO_GOAL);
    expect(input.childOriginalMotivation).toBe('因為同學說這本書很好看');
  });

  it('沒有身分資料 —— 只有年齡分級', () => {
    const input = buildPlanDraftInput(proposal(), '6-9');
    const serialized = JSON.stringify(input);

    expect(input.ageGroup).toBe('6-9');
    for (const secret of ['c-1', 'f-1', 'p-1']) {
      expect({ secret, present: serialized.includes(secret) })
        .toEqual({ secret, present: false });
    }
    expect(Object.keys(input)).not.toContain('childId');
    expect(Object.keys(input)).not.toContain('familyId');
  });

  it('孩子選的節奏一起送過去', () => {
    expect(buildPlanDraftInput(proposal(), '6-9').cadence)
      .toEqual({ mode: 'weekly_frequency', weeklyFrequency: 4 });
  });

  it('孩子的回饋期待也送過去 —— 但它只是期待', () => {
    expect(buildPlanDraftInput(proposal(), '6-9').childRewardPreference).toBe('hopes_for_coin');
  });
});

describe('節奏轉換', () => {
  it('固定哪幾天會排序', () => {
    expect(
      toPlanDraftCadence({
        cadence_mode: 'fixed_days', cadence_weekly_frequency: null, cadence_days: [4, 2],
      }),
    ).toEqual({ mode: 'fixed_days', days: [2, 4] });
  });

  it('一次就好', () => {
    expect(
      toPlanDraftCadence({
        cadence_mode: 'one_time', cadence_weekly_frequency: null, cadence_days: null,
      }),
    ).toEqual({ mode: 'one_time' });
  });

  it('「我還不知道」是 null，不是預設值', () => {
    expect(
      toPlanDraftCadence({
        cadence_mode: null, cadence_weekly_frequency: null, cadence_days: null,
      }),
    ).toBeNull();
  });

  it('對不起來的組合一律 null，不硬湊', () => {
    // 說是一週幾次卻沒有次數。
    expect(
      toPlanDraftCadence({
        cadence_mode: 'weekly_frequency', cadence_weekly_frequency: null, cadence_days: null,
      }),
    ).toBeNull();
    // 說是固定哪幾天卻沒有日子。
    expect(
      toPlanDraftCadence({
        cadence_mode: 'fixed_days', cadence_weekly_frequency: null, cadence_days: [],
      }),
    ).toBeNull();
    // plan_schedule 是 P0-5 之後才有的形式，這一包不接。
    expect(
      toPlanDraftCadence({
        cadence_mode: 'plan_schedule', cadence_weekly_frequency: null, cadence_days: null,
      }),
    ).toBeNull();
  });
});

describe('請求指紋', () => {
  it('同樣的輸入永遠是同一把 key', () => {
    const a = planDraftRequestKey('p-1', buildPlanDraftInput(proposal(), '6-9'));
    const b = planDraftRequestKey('p-1', buildPlanDraftInput(proposal(), '6-9'));
    expect(a).toBe(b);
    expect(a.startsWith(`${PLAN_DRAFT_REQUEST_KEY_PREFIX}:p-1:`)).toBe(true);
  });

  it('不同提案不同 key', () => {
    const input = buildPlanDraftInput(proposal(), '6-9');
    expect(planDraftRequestKey('p-1', input)).not.toBe(planDraftRequestKey('p-2', input));
  });

  it.each([
    ['目標', proposal({ child_original_goal: '我想學會騎腳踏車' })],
    ['原因', proposal({ child_original_motivation: '別的理由' })],
    ['節奏', proposal({ cadence_weekly_frequency: 3 })],
    ['回饋期待', proposal({ child_reward_preference: 'just_record' })],
  ])('%s 變了就是不同 key —— 內容變了本來就該重新整理', (_label, changed) => {
    const base = planDraftRequestKey('p-1', buildPlanDraftInput(proposal(), '6-9'));
    expect(planDraftRequestKey('p-1', buildPlanDraftInput(changed, '6-9'))).not.toBe(base);
  });

  it('年齡段變了也是不同 key（規則引擎的判斷會跟著變）', () => {
    const base = planDraftRequestKey('p-1', buildPlanDraftInput(proposal(), '6-9'));
    expect(planDraftRequestKey('p-1', buildPlanDraftInput(proposal(), '9-12'))).not.toBe(base);
  });

  it('與時間無關 —— 隔一秒再算還是同一把', () => {
    const input = buildPlanDraftInput(proposal(), '6-9');
    const first = planDraftRequestKey('p-1', input);
    jest.spyOn(Date, 'now').mockReturnValue(9_999_999_999);
    expect(planDraftRequestKey('p-1', input)).toBe(first);
    jest.restoreAllMocks();
  });

  it('與提案的狀態、時間戳無關 —— 那些會變，但內容沒變', () => {
    const base = planDraftRequestKey('p-1', buildPlanDraftInput(proposal(), '6-9'));
    const later = proposal({
      updated_at: '2027-01-01T00:00:00.000Z',
      current_plan_version_id: 'v-9',
    });
    expect(planDraftRequestKey('p-1', buildPlanDraftInput(later, '6-9'))).toBe(base);
  });
});
