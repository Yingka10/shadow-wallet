// 第六階段 B — 必填選項組的預覽閘門
//
// 這一支盯的是一個真的出過的 bug：閱讀計畫沒選閱讀方式，「預覽最終版本」照樣進得去，
// 然後 DraftReview 上出現一列「尚未選擇」。原因不在 handlePreview，
// 在 catalog 沒把那組標成 required —— validator 因此沒有任何話可說。
//
// 所以這裡兩個層級都測：資料層（required 標對了）與畫面層（真的走不過去）。

import React from 'react';
import { render, fireEvent, type RenderResult } from '@testing-library/react-native';

jest.mock('../../../../../lib/onboarding', () => ({ calcAgeGroup: () => '6-9' }));

import { PresetTaskDrawer } from '../PresetTaskDrawer';
import { PREVIEW_BLOCKED_NOTE } from '../taskDraft';

const CHILD = { nickname: '承恩', birthDate: '2018-03-05', familyId: 'family-1' };

/** 預覽畫面獨有的字樣；出現＝真的切到 review。 */
const REVIEW_MARKER = '預覽（尚未建立）';

function open() {
  return render(
    <PresetTaskDrawer visible onClose={() => {}} child={CHILD} childLoading={false} />,
  );
}

/** 從 Step 1 走到某個家族的編輯畫面；不在推薦清單上的家族用搜尋找。 */
function openEditor(title: string, query?: string): RenderResult {
  const r = open();
  if (query) {
    fireEvent.changeText(r.getByPlaceholderText('搜尋閱讀、運動、家庭參與……'), query);
  }
  fireEvent.press(r.getAllByText(title)[0]);
  fireEvent.press(r.getByText('下一步'));
  return r;
}

function pressPreview(r: RenderResult) {
  fireEvent.press(r.getByText('檢查並預覽'));
}

// ---------------------------------------------------------------------------
// A. 未選 required 選項時擋下
// ---------------------------------------------------------------------------

describe('A. 閱讀計畫未選閱讀方式', () => {
  it('按下預覽不會切到 DraftReview', () => {
    const r = openEditor('閱讀與共讀');
    pressPreview(r);
    expect(r.queryByText(REVIEW_MARKER)).toBeNull();
  });

  it('錯誤看得見：選項組旁邊有訊息，footer 也說明為什麼沒往下走', () => {
    const r = openEditor('閱讀與共讀');
    // 按之前不該滿江紅。
    expect(r.queryByText('請選擇一項')).toBeNull();
    expect(r.queryByText(PREVIEW_BLOCKED_NOTE)).toBeNull();

    pressPreview(r);
    expect(r.getByText('請選擇一項')).toBeTruthy();
    expect(r.getByText(PREVIEW_BLOCKED_NOTE)).toBeTruthy();
  });

  it('預覽鈕維持可按，不是一顆沒有解釋的死鈕', () => {
    const r = openEditor('閱讀與共讀');
    const button = r.getByLabelText('檢查並預覽');
    expect(button.props.accessibilityState?.disabled).toBeFalsy();
    expect(button.props.accessibilityHint).toBe('還有必填欄位沒完成，按下會標出位置');
  });
});

// ---------------------------------------------------------------------------
// B. 選好之後就能通過
// ---------------------------------------------------------------------------

describe('B. 選了「自己閱讀」之後', () => {
  it('錯誤消失、進得了預覽，而且預覽上顯示的是選到的那一項', () => {
    const r = openEditor('閱讀與共讀');
    pressPreview(r);
    expect(r.getByText('請選擇一項')).toBeTruthy();

    fireEvent.press(r.getByLabelText('用什麼方式進行？：自己閱讀'));
    expect(r.queryByText('請選擇一項')).toBeNull();
    expect(r.queryByText(PREVIEW_BLOCKED_NOTE)).toBeNull();

    pressPreview(r);
    expect(r.getByText(REVIEW_MARKER)).toBeTruthy();
    expect(r.getByText('自己閱讀')).toBeTruthy();
  });

  it('預覽上不會出現 required 欄位的「尚未選擇」', () => {
    const r = openEditor('閱讀與共讀');
    fireEvent.press(r.getByLabelText('用什麼方式進行？：自己閱讀'));
    pressPreview(r);
    expect(r.queryByText('尚未選擇')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// D. 五種 editor 都擋得住
// ---------------------------------------------------------------------------

describe('D. 五種 editor 的必填閘門', () => {
  /** [說明, 家族標題, 搜尋字（推薦清單上沒有的才要）] */
  const CASES: Array<[string, string, string?]> = [
    ['成長計畫', '創作與製作'],
    ['固定任務', '閱讀與共讀'],
    ['短期支援', '建立功課管理方法', '功課'],
    ['家庭角色', '擔任一個家庭小角色', '角色'],
    ['單次任務', '完成一項學校作業', '作業'],
  ];

  for (const [kind, title, query] of CASES) {
    it(`${kind}：剛進畫面就按預覽，不會進到 DraftReview`, () => {
      const r = openEditor(title, query);
      pressPreview(r);
      expect(r.queryByText(REVIEW_MARKER)).toBeNull();
      expect(r.getByText(PREVIEW_BLOCKED_NOTE)).toBeTruthy();
    });
  }
});

// ---------------------------------------------------------------------------
// E. 家庭角色「期間結束後」是說明，不是控制項
// ---------------------------------------------------------------------------

describe('E. 期間結束後的唯讀清單', () => {
  function openRoleEditor() {
    return openEditor('擔任一個家庭小角色', '角色');
  }

  it('四個選項都在，且不是按鈕', () => {
    const r = openRoleEditor();
    for (const label of ['繼續原角色', '調整負責範圍', '換一個角色', '結束並回到日常生活']) {
      const node = r.getByText(label);
      expect(node).toBeTruthy();
      // 文字本身不可點，外層也沒有把它包成 button。
      expect(node.props.accessibilityRole).toBeUndefined();
      expect(node.props.onPress).toBeUndefined();
    }
  });

  it('讀作清單而不是一排停用的按鈕', () => {
    const r = openRoleEditor();
    expect(r.getByText('期間結束後，可以一起決定：')).toBeTruthy();
    expect(r.UNSAFE_getAllByProps({ accessibilityRole: 'list' }).length).toBeGreaterThan(0);
  });

  it('沒有任何 disabled 的選取控制項殘留在這一區', () => {
    const r = openRoleEditor();
    const disabledSelectables = r
      .UNSAFE_queryAllByProps({ accessibilityRole: 'button' })
      .filter(node => node.props.accessibilityState?.disabled === true);
    expect(disabledSelectables).toHaveLength(0);
  });
});
