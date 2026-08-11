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
  mergeRegeneratedSuggestions,
  refreshItemStates,
  userFacingUnavailable,
  type TaskAiSuggestion,
  type TaskAiSuggestionItem,
} from '../index';
import { applyTaskAiSuggestion, readAiField, undoTaskAiSuggestion } from '../applyTaskAiSuggestion';
import { buildTaskAiInput } from '../buildTaskAiInput';
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

  /*
    46. 這一條的語意在「本機 baseline」之後**反過來**了，是刻意的。

    舊版拿 `suggestion.currentValue` 去比對草稿，所以模型回一個對不上的
    currentValue 就會讓那一項一開始就 stale。那個規則在真實環境下是錯的：
    `buildTaskAiInput` 會把孩子的名字遮蔽掉再送出，模型因此**永遠**回一個
    與本機草稿不同的字串（本機「承恩的成長計畫」→ 模型「孩子的成長計畫」），
    於是每一則 title 建議一產生就是 stale、永遠按不下採用。

    現在的規則：stale 只代表「家長在送出請求之後自己改過那個欄位」。
    模型回什麼 currentValue 都不影響 —— 它只屬於 transport／安全契約。
  */
  it('46. 模型回的 currentValue 對不上，不會讓它變成 stale', () => {
    const wrong = suggestion('sug-wrong', 'title', '完全不是這個標題', 'x');
    const items = initialItems([wrong], BASE);

    expect(items[0].state).toBe('pending');
    expect(canApplyItem(items[0])).toBe(true);
    // 「目前設定」來自本機草稿，不是模型回的字串。
    expect(items[0].baselineValue).toBe(BASE.title);
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
// 名字遮蔽 × baseline（真實 staging smoke test 抓到的 P1）
// ---------------------------------------------------------------------------
//
// 送出去的草稿會把孩子的名字換成「孩子」（buildTaskAiInput 的資料最小化）。
// 模型因此回一個與本機草稿**必然不同**的 currentValue。
//
// 舊版拿那個值來判斷 stale，結果是：preset 的預設標題就是「承恩的成長計畫」，
// 所以每一則 title 建議一產生就是 stale、永遠按不下「採用這項」，
// 而且卡片上顯示的「目前設定」是家長從沒設定過的「孩子的成長計畫」。
//
// 現在改用**送出請求當下的本機 baseline**。這一組就是釘住這件事。

describe('名字遮蔽不得讓建議變成 stale', () => {
  /** 模型看到的是遮蔽後的標題，所以它回的 currentValue 也是遮蔽後的。 */
  const redactedTitle = BASE.title.split(CHILD.nickname).join('孩子');
  const titleSugFromModel = suggestion('sug-title', 'title', redactedTitle, '我的閱讀挑戰計畫');
  const minutesSugForRedaction = suggestion('sug-min-r', 'sessionMinutes', CURRENT_MINUTES, 30);

  it('前提：本機標題含孩子名字，遮蔽後不同', () => {
    expect(BASE.title).toContain(CHILD.nickname);
    expect(redactedTitle).not.toBe(BASE.title);
    expect(redactedTitle).not.toContain(CHILD.nickname);
  });

  it('1. 家長什麼都沒做 → pending，不是 stale', () => {
    const items = initialItems([titleSugFromModel], BASE);

    expect(items[0].state).toBe('pending');
    expect(canApplyItem(items[0])).toBe(true);
  });

  it('1. 「目前設定」是本機真實標題，不是模型回的遮蔽字串', () => {
    const items = initialItems([titleSugFromModel], BASE);

    expect(items[0].baselineValue).toBe(BASE.title);
    expect(items[0].baselineValue).not.toBe(titleSugFromModel.currentValue);
  });

  it('1. 收到建議不會動到草稿', () => {
    const before = BASE.title;
    initialItems([titleSugFromModel], BASE);
    expect(BASE.title).toBe(before);
  });

  it('2. 按採用之後標題才變；復原回到真實的本機標題（不是遮蔽版）', () => {
    let items = initialItems([titleSugFromModel], BASE);

    const applied = applyTaskAiSuggestion({ draft: BASE, suggestion: titleSugFromModel });
    if (!applied.applied) throw new Error('預期套用成功');
    expect(applied.draft.title).toBe('我的閱讀挑戰計畫');

    items = refreshItemStates(markItemApplied(items, titleSugFromModel.id, applied.record), applied.draft);
    expect(items[0].state).toBe('applied');
    expect(canUndoItem(items[0])).toBe(true);

    const undone = undoTaskAiSuggestion({ draft: applied.draft, record: applied.record });
    // 關鍵：復原拿回來的是「承恩的成長計畫」，不是「孩子的成長計畫」。
    expect(undone?.title).toBe(BASE.title);
    expect(undone?.title).toContain(CHILD.nickname);
  });

  it('3. 家長在請求之後真的改了標題 → 這時才 stale，而且不可採用', () => {
    const items = initialItems([titleSugFromModel, minutesSugForRedaction], BASE);
    const edited: TaskDraft = { ...BASE, title: '家長自己重寫的標題' };

    const after = refreshItemStates(items, edited);
    expect(after[0].state).toBe('stale');
    expect(canApplyItem(after[0])).toBe(false);
    // 沒被改到的欄位不受牽連。
    expect(after[1].state).toBe('pending');
  });

  it('3. 改回去就恢復可用', () => {
    const items = initialItems([titleSugFromModel], BASE);
    const gone = refreshItemStates(items, { ...BASE, title: '手滑' });
    expect(gone[0].state).toBe('stale');
    expect(refreshItemStates(gone, BASE)[0].state).toBe('pending');
  });

  it('4. 去識別化仍然存在 —— 這次修正沒有把名字送回模型', () => {
    const input = buildTaskAiInput({ draft: BASE, ageGroup: '6-9', childNickname: CHILD.nickname });

    expect(input.currentDraft.title).not.toContain(CHILD.nickname);
    expect(input.currentDraft.title).toBe(redactedTitle);
    expect(input.parentIntent.originalExpectation).not.toContain(CHILD.nickname);
    // 整包序列化之後也不該出現名字。
    expect(JSON.stringify(input)).not.toContain(CHILD.nickname);
    // 而本機草稿仍然保有真名 —— 遮蔽只發生在送出去的那一份。
    expect(BASE.title).toContain(CHILD.nickname);
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
// 重新產生建議：已決定的項目要留著，id 不可撞
// ---------------------------------------------------------------------------

describe('mergeRegeneratedSuggestions', () => {
  const titleSug = suggestion('s1', 'title', BASE.title, '每天閱讀二十分鐘');
  const minutesSug = suggestion('s2', 'sessionMinutes', CURRENT_MINUTES, 30);

  it('已採用的項目留著，還沒決定的被新的一批取代', () => {
    const applied = applyTaskAiSuggestion({ draft: BASE, suggestion: titleSug });
    if (!applied.applied) throw new Error('預期套用成功');
    const previous = markItemApplied(initialItems([titleSug, minutesSug], BASE), titleSug.id, applied.record);

    // 新的一批只有一則，而且是完全不同的欄位。
    const newBatch = [suggestion('s1', 'notes', null, '每天寫一句心得')];
    const merged = mergeRegeneratedSuggestions(previous, newBatch, applied.draft, 'req2');

    // 已採用的 title 建議還在，minutesSug（pending，沒被決定過）消失了。
    expect(merged).toHaveLength(2);
    const appliedItem = merged.find(i => i.suggestion.fieldPath === 'title');
    expect(appliedItem?.state).toBe('applied');
    expect(merged.some(i => i.suggestion.fieldPath === 'sessionMinutes')).toBe(false);

    // 新的一批以 pending 狀態出現。
    const freshItem = merged.find(i => i.suggestion.fieldPath === 'notes');
    expect(freshItem?.state).toBe('pending');
  });

  it('保留原設定的項目也留著', () => {
    const kept = markItemKept(initialItems([titleSug], BASE), titleSug.id);
    const merged = mergeRegeneratedSuggestions(kept, [], BASE, 'req2');
    expect(merged).toHaveLength(1);
    expect(merged[0].state).toBe('kept');
  });

  it('兩批建議的 id 天生會撞（Gemini 每次都從 s1 開始編號），merge 之後不能互相干擾', () => {
    // 上一批的 s1 已經採用了。
    const applied = applyTaskAiSuggestion({ draft: BASE, suggestion: titleSug });
    if (!applied.applied) throw new Error('預期套用成功');
    const previous = markItemApplied(initialItems([titleSug], BASE), titleSug.id, applied.record);

    // 新的一批剛好也用 "s1" 當 id（模型行為，不是我們控制的）。
    const collidingBatch = [suggestion('s1', 'notes', null, '寫一句心得')];
    const merged = mergeRegeneratedSuggestions(previous, collidingBatch, applied.draft, 'req2');

    // 兩個 s1 的 id 必須不一樣，否則下面採用新那則時會連帶改到舊的。
    const ids = merged.map(i => i.suggestion.id);
    expect(new Set(ids).size).toBe(ids.length);

    const newItemId = merged.find(i => i.suggestion.fieldPath === 'notes')!.suggestion.id;
    const afterApplyingNew = markItemApplied(merged, newItemId, {
      fieldPath: 'notes',
      suggestionId: newItemId,
      previousValue: null,
    });

    // 舊的那則（title）狀態不受影響，還是原本採用的那筆。
    const oldItem = afterApplyingNew.find(i => i.suggestion.fieldPath === 'title');
    expect(oldItem?.state).toBe('applied');
    expect(oldItem?.record).toBe(applied.record);
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
