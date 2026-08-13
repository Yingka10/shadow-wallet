// P1-A1 — deterministic guards
//
// 這幾條是產品原則唯一真正成立的地方。prompt 可以被模型忽略，
// 這裡不行。

import { NEXT_STEP_MAX_LENGTH } from '../../childProposal/planDraft/canonicalPlanFields';
import {
  cadenceEquals,
  checkPlanActionText,
  containsClockTime,
  containsMentalStateDiagnosis,
  informationSufficiency,
} from '../planGuards';
import { buildChildGoalPlanningInput } from '../buildChildGoalPlanningInput';
import type { ChildGoalPlanningInput } from '../types';

function input(overrides: Partial<ChildGoalPlanningInput> = {}): ChildGoalPlanningInput {
  return {
    schemaVersion: 1,
    ageGroup: '6-9',
    childOriginalGoal: '我想變厲害',
    childOriginalMotivation: null,
    childApproach: null,
    cadence: null,
    preferredTime: null,
    planningSupportPreference: null,
    ...overrides,
  };
}

describe('下一步：重用既有的 validateNextStep', () => {
  it.each([
    '先閱讀 15 分鐘',
    '先寫三句故事大綱',
    '先練 10 分鐘煞車',
  ])('%s → 可以', (text) => {
    expect(checkPlanActionText(text).ok).toBe(true);
  });

  it.each([
    ['讀完整本書', '結果不是動作'],
    ['學會騎腳踏車', '那是目標，不是下一步'],
    ['國文考 100 分', '成果，而且不可控'],
    ['拿第一名', '成果，而且不可控'],
    ['把系統的任務完成', '孩子不該讀到系統語言'],
  ])('%s → 不可以（%s）', (text) => {
    expect(checkPlanActionText(text).ok).toBe(false);
  });

  it('太長就是不行 —— 上限與既有的 next_step 同一個數字', () => {
    expect(checkPlanActionText('先'.repeat(NEXT_STEP_MAX_LENGTH + 1)).ok).toBe(false);
  });

  it('夾帶心理推測的動作也不行', () => {
    expect(checkPlanActionText('先做到更有自信').ok).toBe(false);
  });
});

describe('心理狀態推測', () => {
  it.each([
    '你最近失去動機了',
    '他不夠自律',
    '這樣會更有自信',
    '要讓他真正理解',
    '先建立熱情',
    '他有點厭倦閱讀',
  ])('%s → 擋下', (text) => {
    expect(containsMentalStateDiagnosis(text)).toBe(true);
  });

  it.each([
    '最近幾次星期三比較難照原本安排完成',
    '這禮拜有兩天沒有做到',
    '能不扶著騎完 10 公尺',
  ])('%s → 可以（都是看得見的事）', (text) => {
    expect(containsMentalStateDiagnosis(text)).toBe(false);
  });
});

describe('沒有人決定過的具體時間', () => {
  it.each(['每天晚上 8:00 練習', '晚上八點開始', '7:30 起床練習'])('%s → 擋下', (text) => {
    expect(containsClockTime(text)).toBe(true);
  });

  it.each(['睡前讀 15 分鐘', '放學後先投 20 球', '週末整理錯題'])(
    '%s → 可以（相對描述，不是約定好的時刻）',
    (text) => {
      expect(containsClockTime(text)).toBe(false);
    },
  );
});

describe('Minimal Question Principle', () => {
  it('有節奏又有自己的方法 → 不該再問', () => {
    expect(
      informationSufficiency(
        input({
          cadence: { mode: 'weekly_frequency', weeklyFrequency: 3 },
          childApproach: '每次 20 分鐘，睡前讀',
        }),
      ),
    ).toBe('sufficient');
  });

  it('少了任何一半都還可以問一題', () => {
    const cases: ChildGoalPlanningInput[] = [
      input({ cadence: { mode: 'weekly_frequency', weeklyFrequency: 3 } }),
      input({ childApproach: '每天放學投 20 球' }),
      input(),
      // 方法只是空白字元 —— 等於沒講。
      input({ cadence: { mode: 'one_time' }, childApproach: '   ' }),
    ];
    for (const value of cases) {
      expect(informationSufficiency(value)).toBe('insufficient');
    }
  });
});

describe('節奏比較', () => {
  it('固定星期幾：順序不同仍然是同一個', () => {
    expect(
      cadenceEquals({ mode: 'fixed_days', days: [5, 1, 3] }, { mode: 'fixed_days', days: [1, 3, 5] }),
    ).toBe(true);
  });

  it('次數不同就不是同一個', () => {
    expect(
      cadenceEquals(
        { mode: 'weekly_frequency', weeklyFrequency: 3 },
        { mode: 'weekly_frequency', weeklyFrequency: 4 },
      ),
    ).toBe(false);
  });

  it('null 只和 null 相等', () => {
    expect(cadenceEquals(null, null)).toBe(true);
    expect(cadenceEquals(null, { mode: 'one_time' })).toBe(false);
  });
});

describe('input 組裝', () => {
  it('孩子的方法不會被塞進目標裡', () => {
    const built = buildChildGoalPlanningInput({
      ageGroup: '6-9',
      childOriginalGoal: '  我想投籃更準  ',
      childApproach: '  我想每天放學投 20 球  ',
    });
    expect(built?.childOriginalGoal).toBe('我想投籃更準');
    expect(built?.childApproach).toBe('我想每天放學投 20 球');
  });

  it('形狀壞掉的節奏當成「孩子沒選」，不補一個數字', () => {
    const built = buildChildGoalPlanningInput({
      ageGroup: '6-9',
      childOriginalGoal: '我想練直笛',
      cadence: { mode: 'weekly_frequency' },
    });
    expect(built?.cadence).toBeNull();
  });

  it('認不得的支援偏好當成沒表態', () => {
    const built = buildChildGoalPlanningInput({
      ageGroup: '6-9',
      childOriginalGoal: '我想練直笛',
      planningSupportPreference: 'do_everything_for_me',
    });
    expect(built?.planningSupportPreference).toBeNull();
  });

  it('沒有目標或沒有年齡段 → null，連模型都不呼叫', () => {
    expect(buildChildGoalPlanningInput({ ageGroup: '6-9', childOriginalGoal: '   ' })).toBeNull();
    expect(
      buildChildGoalPlanningInput({ ageGroup: '13-15', childOriginalGoal: '我想練直笛' }),
    ).toBeNull();
  });
});
