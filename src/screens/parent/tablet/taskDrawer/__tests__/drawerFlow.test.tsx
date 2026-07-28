// 第六階段 A — 抽屜層級：推薦區、demo 提示、放棄確認的按鈕層級與鍵盤行為
//
// 這裡不 mock Modal 或 Reanimated，直接用真實 component 走流程；
// 只 mock lib/onboarding，因為它會連帶把 supabase client 拉進來（測試環境沒有 env）。

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('../../../../../lib/onboarding', () => ({ calcAgeGroup: () => '6-9' }));

import { PresetTaskDrawer } from '../PresetTaskDrawer';
import { LOCAL_ONLY_REMINDER, LOCAL_ONLY_CREATE } from '../taskDraft';
import { FakeParentTaskCreationService } from '../../../../../testing/fakeParentTaskCreationService';

const CHILD = { id: 'child-1', nickname: '承恩', birthDate: '2018-03-05', familyId: 'family-1' };

function open(mode?: 'demo' | 'development') {
  return render(
    <PresetTaskDrawer
      visible
      onClose={() => {}}
      child={CHILD}
      childLoading={false}
      taskCreationService={new FakeParentTaskCreationService()}
      {...(mode ? { displayMode: mode } : null)}
    />,
  );
}

/** 走到「閱讀與共讀」的預設版本（固定閱讀練習）編輯畫面。 */
function openReadingEditor(mode?: 'demo' | 'development') {
  const r = open(mode);
  fireEvent.press(r.getAllByText('閱讀與共讀')[0]);
  fireEvent.press(r.getByText('下一步'));
  return r;
}

/** 補齊 required 的閱讀方式；沒選這一項就進不了預覽（見「必填欄位」describe）。 */
function chooseReadingMethod(r: ReturnType<typeof open>) {
  fireEvent.press(r.getByLabelText('用什麼方式進行？：自己閱讀'));
}

// ---------------------------------------------------------------------------
// Step 1 推薦區
// ---------------------------------------------------------------------------

describe('Step 1 推薦起點', () => {
  it('未搜尋時顯示推薦標題與帶暱稱的副標', () => {
    const r = open();
    expect(r.getByText('推薦起點')).toBeTruthy();
    expect(r.getByText('依承恩目前的年齡，先從這些常見方向開始。')).toBeTruthy();
  });

  it('搜尋時不顯示推薦標題', () => {
    const r = open();
    fireEvent.changeText(r.getByPlaceholderText('搜尋閱讀、運動、家庭參與……'), '作業');
    expect(r.queryByText('推薦起點')).toBeNull();
  });

  it('切到其他分類時不顯示推薦標題，改顯示該分類政策說明', () => {
    const r = open();
    fireEvent.press(r.getAllByText('家庭參與')[0]);
    expect(r.queryByText('推薦起點')).toBeNull();
  });

  it('搜尋仍找得到不在推薦清單裡的家族', () => {
    const r = open();
    fireEvent.changeText(r.getByPlaceholderText('搜尋閱讀、運動、家庭參與……'), '作業');
    expect(r.getAllByText('完成一項學校作業').length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// demo / development
// ---------------------------------------------------------------------------

describe('顯示模式', () => {
  it('預設是 demo：編輯畫面沒有開發提示', () => {
    const r = openReadingEditor();
    expect(r.queryByText(LOCAL_ONLY_REMINDER)).toBeNull();
  });

  it('development：編輯畫面保留開發提示', () => {
    const r = openReadingEditor('development');
    expect(r.queryByText(LOCAL_ONLY_REMINDER)).not.toBeNull();
  });

  /**
   * 第七階段 C 之前，這兩條測的是「確認建立永遠 disabled」與
   * 「development 才顯示尚未串接的說明」。建立已經接上，那個說明也拿掉了 ——
   * 留著一句「將於後續階段串接」在一顆真的會寫資料庫的按鈕旁邊，比沒有更糟。
   */
  it('預覽 footer 不再出現「尚未串接」說明，確認建立可以按', () => {
    const r = openReadingEditor();
    chooseReadingMethod(r);
    fireEvent.press(r.getByText('檢查並預覽'));

    expect(r.queryByText(LOCAL_ONLY_CREATE)).toBeNull();

    const create = r.getByLabelText('確認建立');
    expect(create.props.accessibilityState.disabled).toBe(false);
  });

  it('development 的預覽也不再顯示那句說明', () => {
    const r = openReadingEditor('development');
    chooseReadingMethod(r);
    fireEvent.press(r.getByText('檢查並預覽'));
    expect(r.queryByText(LOCAL_ONLY_CREATE)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 放棄確認
// ---------------------------------------------------------------------------

describe('放棄修改確認', () => {
  /** 改一個欄位讓草稿變 dirty，再點遮罩觸發確認。 */
  function openConfirmation(mode?: 'demo' | 'development') {
    const r = openReadingEditor(mode);
    fireEvent.changeText(r.getByLabelText('任務名稱'), '承恩的新閱讀安排');
    fireEvent.press(r.getByLabelText('關閉新增任務'));
    return r;
  }

  it('dirty 時關閉會先跳確認', () => {
    const r = openConfirmation();
    expect(r.getByText('要放棄這次的調整嗎？')).toBeTruthy();
  });

  it('主要按鈕是「繼續編輯」，破壞性操作是次要的「放棄並離開」', () => {
    const r = openConfirmation();
    expect(r.getByLabelText('繼續編輯，保留目前的調整')).toBeTruthy();

    const danger = r.getByLabelText('放棄並離開，清除目前的調整');
    expect(danger.props.accessibilityHint).toBe('這個動作會清除尚未建立的內容');
  });

  it('繼續編輯會關掉確認並保留已改的內容', () => {
    const r = openConfirmation();
    fireEvent.press(r.getByLabelText('繼續編輯，保留目前的調整'));

    expect(r.queryByText('要放棄這次的調整嗎？')).toBeNull();
    expect(r.getByLabelText('任務名稱').props.value).toBe('承恩的新閱讀安排');
  });

  it('放棄並離開才真的執行原本被攔下的動作', () => {
    const onClose = jest.fn();
    const r = render(
      <PresetTaskDrawer visible onClose={onClose} child={CHILD} childLoading={false}
      taskCreationService={new FakeParentTaskCreationService()} />,
    );
    fireEvent.press(r.getAllByText('閱讀與共讀')[0]);
    fireEvent.press(r.getByText('下一步'));
    fireEvent.changeText(r.getByLabelText('任務名稱'), '承恩的新閱讀安排');
    fireEvent.press(r.getByLabelText('關閉新增任務'));

    expect(onClose).not.toHaveBeenCalled();
    fireEvent.press(r.getByLabelText('放棄並離開，清除目前的調整'));
    expect(onClose).toHaveBeenCalled();
  });

  it('確認開啟時，背後的控制不可互動也不給輔助技術讀到', () => {
    const r = openConfirmation();
    // 抽屜主體（header + 內容 + footer）整塊被關掉。
    const body = r.UNSAFE_getAllByProps({ accessibilityElementsHidden: true })[0];
    expect(body.props.pointerEvents).toBe('none');
    expect(body.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
