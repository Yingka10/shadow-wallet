// 第九階段 C — 路由、狀態與確認決策（純函式）
//
// 這一支盯的是三件在畫面上看不出來、但錯了會很痛的事：
//
//   · 「上一步」在兩個入口下的答案不同（editor → catalog vs → Step 3）
//   · 家長從 editor 返回 Step 3、什麼都沒改再往前 → **不可以重建草稿**
//     （重建會清掉 editor 的內容，而且換掉 clientRequestId）
//   · 「仍使用固定重複」要得到哪一支 editor，是路由的一部分，不是按鈕的副作用

import {
  backRouteFor,
  isCustomBasicsRoute,
  isDraftRoute,
  reviewBackRoute,
  type TaskCreationDrawerRoute,
} from '../../taskCreationRoute';
import {
  customBasicsSignature,
  customTitleError,
  EMPTY_CUSTOM_INTAKE,
  isCustomIntakeDirty,
  pathSwitchEffect,
  type CustomIntakeState,
} from '../../taskCreationState';
import { confirmCustomTaskEditor, resolveCustomTaskEditor } from '../customTaskRouting';

const filled: CustomIntakeState = {
  title: '每天閱讀',
  originalExpectation: '希望慢慢養成自己看書的習慣',
  purposeChoice: 'learn_or_practise',
  durationChoice: 'repeating',
  confirmedEditorKind: null,
};

// ---------------------------------------------------------------------------
// 58-62. 上一步
// ---------------------------------------------------------------------------

describe('58-62. 上一步', () => {
  it('Step 1 回起點', () => {
    expect(backRouteFor({ kind: 'custom_basics_title' }, 'parent_custom')).toEqual({
      kind: 'entry',
    });
  });

  it('Step 2 回 Step 1、Step 3 回 Step 2', () => {
    expect(backRouteFor({ kind: 'custom_basics_purpose' }, 'parent_custom')).toEqual({
      kind: 'custom_basics_title',
    });
    expect(backRouteFor({ kind: 'custom_basics_duration' }, 'parent_custom')).toEqual({
      kind: 'custom_basics_purpose',
    });
  });

  it('editor 的上一步依入口而不同 —— 這就是不用數字 step 的理由', () => {
    const editor: TaskCreationDrawerRoute = { kind: 'editor', editorKind: 'recurring' };
    expect(backRouteFor(editor, 'parent_custom')).toEqual({ kind: 'custom_basics_duration' });
    expect(backRouteFor(editor, 'preset')).toEqual({ kind: 'preset_catalog' });
  });

  it('preset catalog 回起點', () => {
    expect(backRouteFor({ kind: 'preset_catalog' }, 'preset')).toEqual({ kind: 'entry' });
  });

  it('review 回原本那一支 editor', () => {
    expect(reviewBackRoute('growth_plan')).toEqual({
      kind: 'editor',
      editorKind: 'growth_plan',
    });
  });

  it('64. 起點與成功畫面沒有上一步', () => {
    expect(backRouteFor({ kind: 'entry' }, null)).toBeNull();
    // 任務已經建立了。回到草稿只會讓家長以為還能再改一次。
    expect(backRouteFor({ kind: 'success' }, 'parent_custom')).toBeNull();
  });

  it('路由分類判斷', () => {
    expect(isCustomBasicsRoute({ kind: 'custom_basics_purpose' })).toBe(true);
    expect(isCustomBasicsRoute({ kind: 'preset_catalog' })).toBe(false);
    expect(isDraftRoute({ kind: 'editor', editorKind: 'one_time' })).toBe(true);
    expect(isDraftRoute({ kind: 'review' })).toBe(true);
    expect(isDraftRoute({ kind: 'entry' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5, 63. dirty
// ---------------------------------------------------------------------------

describe('5, 63. dirty', () => {
  it('起點頁還沒有任何內容 —— 不算 dirty', () => {
    expect(isCustomIntakeDirty(EMPTY_CUSTOM_INTAKE)).toBe(false);
  });

  it('打了名稱、寫了期待、選了目的或安排，任何一項都算', () => {
    expect(isCustomIntakeDirty({ ...EMPTY_CUSTOM_INTAKE, title: '每天閱讀' })).toBe(true);
    expect(isCustomIntakeDirty({ ...EMPTY_CUSTOM_INTAKE, originalExpectation: '希望' })).toBe(true);
    expect(
      isCustomIntakeDirty({ ...EMPTY_CUSTOM_INTAKE, purposeChoice: 'own_challenge' }),
    ).toBe(true);
    expect(isCustomIntakeDirty({ ...EMPTY_CUSTOM_INTAKE, durationChoice: 'once' })).toBe(true);
  });

  it('只打了空白不算 —— 那不是內容', () => {
    expect(isCustomIntakeDirty({ ...EMPTY_CUSTOM_INTAKE, title: '   ' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6-7. Step 1 驗證
// ---------------------------------------------------------------------------

describe('6-7. Step 1 驗證', () => {
  it('名稱必填（trim 之後）', () => {
    expect(customTitleError(EMPTY_CUSTOM_INTAKE)).toBeDefined();
    expect(customTitleError({ ...EMPTY_CUSTOM_INTAKE, title: '  ' })).toBeDefined();
    expect(customTitleError({ ...EMPTY_CUSTOM_INTAKE, title: '每天閱讀' })).toBeUndefined();
  });

  it('期待是選填 —— 空的不會擋住任何東西', () => {
    expect(
      customTitleError({ ...EMPTY_CUSTOM_INTAKE, title: '每天閱讀', originalExpectation: '' }),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 39. 草稿的重建時機
// ---------------------------------------------------------------------------

describe('39. 基本設定指紋決定要不要重建草稿', () => {
  it('什麼都沒改 → 指紋相同 → 沿用同一份草稿與同一個 clientRequestId', () => {
    expect(customBasicsSignature(filled)).toBe(customBasicsSignature({ ...filled }));
  });

  it('改了目的或安排 → 指紋不同 → 重建', () => {
    expect(customBasicsSignature({ ...filled, purposeChoice: 'own_challenge' }))
      .not.toBe(customBasicsSignature(filled));
    expect(customBasicsSignature({ ...filled, durationChoice: 'once' }))
      .not.toBe(customBasicsSignature(filled));
  });

  it('指紋不含 editor 裡改得動的東西 —— 前後空白不算改過', () => {
    expect(customBasicsSignature({ ...filled, title: '  每天閱讀  ' }))
      .toBe(customBasicsSignature(filled));
  });
});

// ---------------------------------------------------------------------------
// 16. 換入口
// ---------------------------------------------------------------------------

describe('16. 換建立方式', () => {
  it('同一個入口內移動不丟草稿', () => {
    expect(pathSwitchEffect('parent_custom', 'parent_custom').resetDraft).toBe(false);
  });

  it('第一次選入口也不丟（本來就沒有草稿）', () => {
    expect(pathSwitchEffect(null, 'preset').resetDraft).toBe(false);
  });

  it('換入口一定丟掉草稿 —— 兩份草稿不可以共用同一個建立請求識別碼', () => {
    const effect = pathSwitchEffect('preset', 'parent_custom');
    expect(effect.resetDraft).toBe(true);
    // 但家長自己輸入與選過的東西都留著：切去看一眼不該讓內容消失。
    expect(effect.keepCustomIntake).toBe(true);
    expect(effect.keepPresetSelection).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 25-27. 生活習慣 ＋ 固定重複的確認
// ---------------------------------------------------------------------------

describe('25-27. needs_confirmation 的兩種回答', () => {
  const input = { purposeCategory: 'life_routine', durationChoice: 'repeating' } as const;

  it('25. 這個組合確實需要家長確認', () => {
    expect(resolveCustomTaskEditor(input).status).toBe('needs_confirmation');
  });

  it('26. 採納建議 → 期間換成「持續一段時間」→ short_support', () => {
    const confirmed = confirmCustomTaskEditor(input, 'accept_suggestion');
    expect(confirmed).toEqual({
      editorKind: 'short_support',
      durationChoice: 'for_a_while',
      overridesSuggestion: false,
    });
  });

  it('27. 維持固定重複 → recurring，而且記下這是家長推翻了建議', () => {
    const confirmed = confirmCustomTaskEditor(input, 'keep_choice');
    expect(confirmed).toEqual({
      editorKind: 'recurring',
      durationChoice: 'repeating',
      overridesSuggestion: true,
    });
  });

  it('不需要確認的組合，兩種回答的結果相同', () => {
    const learning = { purposeCategory: 'learning_skill', durationChoice: 'repeating' } as const;
    expect(confirmCustomTaskEditor(learning, 'accept_suggestion'))
      .toEqual(confirmCustomTaskEditor(learning, 'keep_choice'));
    expect(confirmCustomTaskEditor(learning, 'keep_choice').editorKind).toBe('recurring');
  });
});
