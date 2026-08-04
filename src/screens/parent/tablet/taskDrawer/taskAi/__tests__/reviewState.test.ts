// 第八階段 B2B — 12, 44-50. 建議項目的狀態
//
// 這一支盯的是 §十二 那條規則的實作：
//
//   家長採用了一項建議 → **其他項不該全部作廢**
//   家長手動改了某個欄位 → **只有指向那個欄位的項目該作廢**
//
// 粗暴地在任何草稿變動後清空整批建議，會讓這個功能變成
// 「只能採用一項」——而家長通常會想採用兩、三項。
//
// 反過來，完全不重算則更糟：家長把時間從 45 改成 30，
// 那則寫著「目前設定：45 分鐘」的建議還可以按下去，
// 按完就變成他從來沒同意過的 20 分鐘。

import {
  aiFieldValuesEqual,
  canApplyItem,
  canUndoItem,
  initialItems,
  markItemApplied,
  markItemKept,
  markItemUndone,
  refreshItemStates,
  userFacingUnavailable,
  type TaskAiSuggestion,
  type TaskAiSuggestionItem,
} from '../index';
import { applyTaskAiSuggestion, readAiField, undoTaskAiSuggestion } from '../applyTaskAiSuggestion';
import { createTaskDraft, resolveEditorKind, type DraftChildContext, type TaskDraft } from '../../taskDraft';
import { ALL_FAMILIES } from '../../taskCatalog';

const CHILD: DraftChildContext = {
  nickname: '承恩', birthDate: '2018-03-05', familyId: 'household-1',
};

function growthSetup(): TaskDraft {
  for (const family of ALL_FAMILIES) {
    for (const variant of family.variants) {
      if (resolveEditorKind(variant) === 'growth_plan') {
        return createTaskDraft(family, variant, CHILD, '6-9');
      }
    }
  }
  throw new Error('找不到成長計畫 variant');
}

const BASE = growthSetup();

/**
 * 目標欄位「目前的值」直接從草稿讀。
 *
 * 寫死一個猜的值（例如 null）會讓每一則建議一開始就是 stale ——
 * 那樣測到的是「fixture 寫錯了」，不是狀態機。
 */
const CURRENT_MINUTES = readAiField(BASE, 'sessionMinutes');

function suggestion(
  id: string,
  fieldPath: TaskAiSuggestion['fieldPath'],
  currentValue: TaskAiSuggestion['currentValue'],
  suggestedValue: TaskAiSuggestion['suggestedValue'],
): TaskAiSuggestion {
  return {
    id,
    kind: 'clarify_completion',
    fieldPath,
    currentValue,
    suggestedValue,
    rationale: '寫得再清楚一點。',
    expectedBenefit: 'clearer_expectation',
    confidence: 'medium',
  };
}

// ---------------------------------------------------------------------------
// 值比對
// ---------------------------------------------------------------------------

describe('欄位值比對', () => {
  it('陣列逐項比', () => {
    expect(aiFieldValuesEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(aiFieldValuesEqual(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(aiFieldValuesEqual(['a'], ['a', 'b'])).toBe(false);
  });

  it('null 與空字串不是同一件事', () => {
    expect(aiFieldValuesEqual(null, null)).toBe(true);
    expect(aiFieldValuesEqual(null, '')).toBe(false);
    expect(aiFieldValuesEqual(20, 20)).toBe(true);
    expect(aiFieldValuesEqual(20, '20')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 44-46. 一項的動作不影響其他項
// ---------------------------------------------------------------------------

describe('44-46. 逐項處置', () => {
  const titleSug = suggestion('sug-title', 'title', BASE.title, '每天閱讀二十分鐘');
  const minutesSug = suggestion('sug-min', 'sessionMinutes', CURRENT_MINUTES, 30);

  it('剛拿到時，對得上的都是 pending', () => {
    const items = initialItems([titleSug, minutesSug], BASE);
    expect(items.map(i => i.state)).toEqual(['pending', 'pending']);
    expect(items.every(canApplyItem)).toBe(true);
  });

  it('46. currentValue 對不上的一開始就是 stale', () => {
    const wrong = suggestion('sug-wrong', 'title', '完全不是這個標題', 'x');
    const items = initialItems([wrong], BASE);
    expect(items[0].state).toBe('stale');
    expect(canApplyItem(items[0])).toBe(false);
  });

  it('44. 採用一項之後，指向其他欄位的那一項仍然可用', () => {
    const applied = applyTaskAiSuggestion({ draft: BASE, suggestion: titleSug });
    if (!applied.applied) throw new Error('預期套用成功');

    let items = initialItems([titleSug, minutesSug], BASE);
    items = markItemApplied(items, titleSug.id, applied.record);
    items = refreshItemStates(items, applied.draft);

    expect(items[0].state).toBe('applied');
    // 這一條就是 §十二 的重點：標題被改了，分鐘那一項不該跟著作廢。
    expect(items[1].state).toBe('pending');
  });

  it('保留原設定之後，狀態不再受草稿變動影響', () => {
    let items = initialItems([titleSug], BASE);
    items = markItemKept(items, titleSug.id);
    items = refreshItemStates(items, { ...BASE, title: '完全換掉的標題' });
    // kept 是家長做過的決定，不是算出來的。
    expect(items[0].state).toBe('kept');
  });
});

// ---------------------------------------------------------------------------
// 45. 家長手動修改
// ---------------------------------------------------------------------------

describe('45. 家長手動修改之後', () => {
  const titleSug = suggestion('sug-title', 'title', BASE.title, '每天閱讀二十分鐘');
  const minutesSug = suggestion('sug-min', 'sessionMinutes', CURRENT_MINUTES, 30);

  it('改到某一項的目標欄位 → 只有那一項 stale', () => {
    const edited: TaskDraft = { ...BASE, title: '家長自己重寫的標題' };
    const items = refreshItemStates(initialItems([titleSug, minutesSug], BASE), edited);
    expect(items[0].state).toBe('stale');
    expect(items[1].state).toBe('pending');
  });

  it('改到不相關的欄位 → 一項都不失效', () => {
    const edited: TaskDraft = { ...BASE, startDate: '2026-12-01' };
    const items = refreshItemStates(initialItems([titleSug, minutesSug], BASE), edited);
    expect(items.map(i => i.state)).toEqual(['pending', 'pending']);
  });

  it('改回去就恢復 —— 一次手滑不該永久廢掉一則建議', () => {
    const items = initialItems([titleSug], BASE);
    const gone = refreshItemStates(items, { ...BASE, title: '手滑' });
    expect(gone[0].state).toBe('stale');
    expect(refreshItemStates(gone, BASE)[0].state).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// 43, 50. 復原
// ---------------------------------------------------------------------------

describe('43, 50. 復原', () => {
  const minutesSug = suggestion('sug-min', 'sessionMinutes', CURRENT_MINUTES, 30);

  function applyMinutes(): { draft: TaskDraft; items: TaskAiSuggestionItem[] } {
    const applied = applyTaskAiSuggestion({ draft: BASE, suggestion: minutesSug });
    if (!applied.applied) throw new Error('預期套用成功');
    const items = refreshItemStates(
      markItemApplied(initialItems([minutesSug], BASE), minutesSug.id, applied.record),
      applied.draft,
    );
    return { draft: applied.draft, items };
  }

  it('43. 採用後沒有再動過 → 可以安全復原，而且真的還原那個欄位', () => {
    const { draft, items } = applyMinutes();
    expect(items[0].state).toBe('applied');
    expect(canUndoItem(items[0])).toBe(true);

    // 採用之後那個欄位真的變了。
    expect(readAiField(draft, 'sessionMinutes')).toBe(30);

    const record = items[0].record;
    if (!record) throw new Error('預期有復原記錄');
    const undone = undoTaskAiSuggestion({ draft, record });
    // 復原回到家長採用之前的那個值，不是回到 0、也不是清成未設定。
    expect(readAiField(undone, 'sessionMinutes')).toEqual(CURRENT_MINUTES);
  });

  it('復原之後回到 pending，家長可以再改變主意', () => {
    const { items } = applyMinutes();
    expect(markItemUndone(items, minutesSug.id)[0].state).toBe('pending');
    expect(markItemUndone(items, minutesSug.id)[0].record).toBeUndefined();
  });

  it('50. 採用後家長又改了同一欄位 → 不提供復原', () => {
    const { draft, items } = applyMinutes();
    const editedByParent: TaskDraft =
      draft.editorKind === 'growth_plan' ? { ...draft, minutesPerSession: 35 } : draft;

    const refreshed = refreshItemStates(items, editedByParent);
    expect(refreshed[0].state).toBe('applied_edited');
    // 復原會把家長剛選的 35 分鐘換掉。寧可少一個按鈕。
    expect(canUndoItem(refreshed[0])).toBe(false);
  });

  it('50b. 家長把值改回建議值 → 又可以復原了', () => {
    const { draft, items } = applyMinutes();
    const wandered: TaskDraft =
      draft.editorKind === 'growth_plan' ? { ...draft, minutesPerSession: 35 } : draft;
    const back = refreshItemStates(refreshItemStates(items, wandered), draft);
    expect(back[0].state).toBe('applied');
    expect(canUndoItem(back[0])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// unavailable 對照
// ---------------------------------------------------------------------------

describe('unavailable reason → 家長看得懂的狀態', () => {
  it('NOT_ELIGIBLE 是範圍，不是故障', () => {
    expect(userFacingUnavailable('NOT_ELIGIBLE')).toEqual({
      reason: 'not_offered',
      developerCode: 'NOT_ELIGIBLE',
    });
  });

  it('其餘四種對家長是同一件事', () => {
    for (const reason of ['TIMEOUT', 'SERVICE_ERROR', 'INVALID_RESPONSE', 'UNSAFE_OUTPUT'] as const) {
      expect(userFacingUnavailable(reason).reason).toBe('temporary');
      // 但代號各自保留 —— 對 log 與除錯來說它們完全不同。
      expect(userFacingUnavailable(reason).developerCode).toBe(reason);
    }
  });
});
