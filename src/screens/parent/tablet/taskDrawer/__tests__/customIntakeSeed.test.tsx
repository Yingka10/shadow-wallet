// 第九階段 B3 — 從外面帶一個任務名稱進抽屜
//
// 首頁的「最近指派過的」快選是這條路徑存在的唯一理由：家長點一個他上週
// 指派過的名稱，不必再打一次字。
//
// 這一支要證明的是那個快選**只帶了名稱**：
//
//   · 舊任務的目的、安排、回饋方式一項都不會被帶進來
//   · 三個基本設定步驟一步都不跳
//   · 沒有預填時，起點頁的行為完全不變
//   · 抽屜開著的時候上層 re-render 不會把家長拉回第一步

import React from 'react';
import { render, fireEvent, type RenderResult } from '@testing-library/react-native';

jest.mock('../../../../../lib/onboarding', () => ({ calcAgeGroup: () => '6-9' }));

import { TaskCreationDrawer } from '../TaskCreationDrawer';
import {
  EMPTY_CUSTOM_INTAKE,
  seededCustomIntake,
  type CustomIntakeSeed,
} from '../taskCreationState';
import { FakeParentTaskCreationService } from '../../../../../testing/fakeParentTaskCreationService';
import { enterCustomFlow } from '../../../../../testing/taskCreationDrawerFlow';
import { ENTRY_COPY, STEP1_COPY, STEP2_COPY } from '../customTask/customTaskCopy';

const CHILD = { id: 'child-1', nickname: '承恩', birthDate: '2018-03-05', familyId: 'family-1' };

function open(seed: CustomIntakeSeed | null): RenderResult {
  return render(
    <TaskCreationDrawer
      visible
      onClose={() => {}}
      child={CHILD}
      childLoading={false}
      initialCustomIntake={seed}
      taskCreationService={new FakeParentTaskCreationService()}
    />,
  );
}

// ---------------------------------------------------------------------------
// 1-4. seededCustomIntake
// ---------------------------------------------------------------------------

describe('1-4. seededCustomIntake', () => {
  it('沒有預填 —— 回同一份空白 intake', () => {
    expect(seededCustomIntake(null)).toBe(EMPTY_CUSTOM_INTAKE);
    expect(seededCustomIntake(undefined)).toBe(EMPTY_CUSTOM_INTAKE);
  });

  it('只有空白的名稱不算預填 —— 不要造出一份 title 是空白的髒狀態', () => {
    expect(seededCustomIntake({ title: '   ' })).toBe(EMPTY_CUSTOM_INTAKE);
  });

  it('有名稱就填進去，前後空白去掉', () => {
    expect(seededCustomIntake({ title: '  倒垃圾  ' }).title).toBe('倒垃圾');
  });

  it('**其餘欄位一律維持空白** —— 舊任務的目的、安排、回饋方式都不帶進來', () => {
    const seeded = seededCustomIntake({ title: '倒垃圾' });
    expect(seeded.originalExpectation).toBe('');
    expect(seeded.purposeChoice).toBeNull();
    expect(seeded.durationChoice).toBeNull();
    expect(seeded.confirmedEditorKind).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5-6. 沒有預填時行為不變
// ---------------------------------------------------------------------------

describe('5-6. 沒有預填', () => {
  it('停在起點頁讓家長自己選建立方式', () => {
    const r = open(null);
    expect(r.getByText(ENTRY_COPY.parentCustom.label)).toBeTruthy();
    expect(r.queryByLabelText(STEP1_COPY.titleLabel)).toBeNull();
  });

  it('照舊走得到 Step 1，而且名稱是空的', () => {
    const r = open(null);
    enterCustomFlow(r);
    expect(r.getByLabelText(STEP1_COPY.titleLabel).props.value).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 7-9. 有預填
// ---------------------------------------------------------------------------

describe('7-9. 有預填', () => {
  it('直接開在基本設定 1／3，名稱已經填好', () => {
    const r = open({ title: '倒垃圾' });
    expect(r.getByText(STEP1_COPY.progress)).toBeTruthy();
    expect(r.getByLabelText(STEP1_COPY.titleLabel).props.value).toBe('倒垃圾');
  });

  it('期待仍然是空的 —— 那一欄是家長自己要寫的，不是舊任務名稱', () => {
    const r = open({ title: '倒垃圾' });
    expect(r.getByLabelText(STEP1_COPY.expectationLabel).props.value).toBe('');
  });

  it('名稱可以改掉 —— 預填是起點，不是既成事實', () => {
    const r = open({ title: '倒垃圾' });
    fireEvent.changeText(r.getByLabelText(STEP1_COPY.titleLabel), '洗碗');
    expect(r.getByLabelText(STEP1_COPY.titleLabel).props.value).toBe('洗碗');
  });
});

// ---------------------------------------------------------------------------
// 10-11. 一步都不跳
// ---------------------------------------------------------------------------

describe('10-11. 預填不跳過基本設定', () => {
  it('Step 2 沒有預選方向，按下一步走不掉', () => {
    const r = open({ title: '倒垃圾' });
    fireEvent.press(r.getByText('下一步'));
    expect(r.getByText(STEP2_COPY.progress)).toBeTruthy();

    // 沒選方向 —— 下一步不能按，畫面必須留在 Step 2。
    fireEvent.press(r.getByText('下一步'));
    expect(r.getByText(STEP2_COPY.progress)).toBeTruthy();
  });

  it('選了方向才走得到 Step 3', () => {
    const r = open({ title: '倒垃圾' });
    fireEvent.press(r.getByText('下一步'));
    fireEvent.press(r.getByText('參與家庭生活'));
    fireEvent.press(r.getByText('下一步'));
    expect(r.queryByText(STEP2_COPY.progress)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 12. 開著的時候不重來
// ---------------------------------------------------------------------------

describe('12. 開著的時候換 seed', () => {
  it('上層 re-render 不會把家長拉回第一步，也不會蓋掉他打的字', () => {
    const service = new FakeParentTaskCreationService();
    const drawer = (seed: CustomIntakeSeed) => (
      <TaskCreationDrawer
        visible
        onClose={() => {}}
        child={CHILD}
        childLoading={false}
        initialCustomIntake={seed}
        taskCreationService={service}
      />
    );
    const r = render(drawer({ title: '倒垃圾' }));

    fireEvent.changeText(r.getByLabelText(STEP1_COPY.titleLabel), '洗碗');
    fireEvent.press(r.getByText('下一步'));
    expect(r.getByText(STEP2_COPY.progress)).toBeTruthy();

    // 上層因為別的原因重畫，順手給了一個新的 seed 物件。
    r.rerender(drawer({ title: '整理書桌' }));

    expect(r.getByText(STEP2_COPY.progress)).toBeTruthy();
    expect(r.queryByText(STEP1_COPY.progress)).toBeNull();
  });
});
