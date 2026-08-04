// 第八階段 A — 假服務與 DraftReview prototype
// 第八階段 B2B — AI 區塊改由 TaskAiReviewState 驅動
//
// 這裡驗的是**AI 壞掉的時候會發生什麼**。
//
// 那才是重點：AI 給出好建議的路徑很好測，也不太會出事。真正會傷到家長的是
// 「按了取得建議，然後畫面卡住、任務建不出來」。所以下面每一種失敗
// 都要能重現，而且每一種失敗之後都要能照常建立任務。

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import {
  FakeTaskAiRecommendationService,
  UnavailableTaskAiRecommendationService,
  buildTaskAiInput,
  collectTaskRuleFindings,
  hasBlockingFinding,
  type AppliedSuggestionRecord,
  type TaskAiItemState,
  type TaskAiRecommendationResult,
  type TaskAiReviewState,
  type TaskAiSuggestion,
  type TaskAiSuggestionItem,
} from '../index';
import { TaskAiSection } from '../../editors/TaskAiSection';
import { DisplayModeProvider } from '../../displayMode';
import { createTaskDraft, resolveEditorKind, type DraftChildContext } from '../../taskDraft';
import { ALL_FAMILIES } from '../../taskCatalog';

const CHILD: DraftChildContext = {
  nickname: '承恩', birthDate: '2018-03-05', familyId: 'household-1',
};

function recurringSetup() {
  for (const family of ALL_FAMILIES) {
    for (const variant of family.variants) {
      if (resolveEditorKind(variant) === 'recurring') {
        return { draft: createTaskDraft(family, variant, CHILD, '6-9'), variant };
      }
    }
  }
  throw new Error('找不到固定任務 variant');
}

const { draft, variant } = recurringSetup();
const INPUT = buildTaskAiInput({ draft, variant, ageGroup: '6-9', childNickname: CHILD.nickname });

// ---------------------------------------------------------------------------
// 25-29. 假服務的每一種行為
// ---------------------------------------------------------------------------

describe('FakeTaskAiRecommendationService', () => {
  it('25. suggestions', async () => {
    const service = new FakeTaskAiRecommendationService();
    const out = await service.recommend(INPUT);
    expect(out.status).toBe('suggestions');
    expect(out.suggestions.length).toBeGreaterThan(0);
    expect(service.callCount).toBe(1);
    expect(service.calls[0]).toBe(INPUT);
  });

  it('25b. 假資料也要通過真的 validator', async () => {
    // 否則測試會通過一批 production 根本不會接受的東西。
    const service = new FakeTaskAiRecommendationService();
    const out = await service.recommend(INPUT);
    if (out.status !== 'suggestions') throw new Error('預期是 suggestions');
    for (const s of out.suggestions) {
      expect(typeof s.id).toBe('string');
      expect(s.rationale.length).toBeGreaterThan(0);
    }
  });

  it('26. no_change', async () => {
    const service = new FakeTaskAiRecommendationService({ behaviour: 'no_change' });
    const out = await service.recommend(INPUT);
    expect(out).toMatchObject({ status: 'no_change', suggestions: [] });
  });

  it('27. timeout', async () => {
    const service = new FakeTaskAiRecommendationService({ behaviour: 'timeout' });
    const out = await service.recommend(INPUT);
    expect(out).toEqual({
      status: 'unavailable', schemaVersion: 1, reason: 'TIMEOUT', suggestions: [],
    });
  });

  it('27b. service_error 與 invalid_response', async () => {
    const service = new FakeTaskAiRecommendationService({ behaviour: 'service_error' });
    expect((await service.recommend(INPUT))).toMatchObject({ reason: 'SERVICE_ERROR' });

    service.setBehaviour('invalid_response');
    const invalid = await service.recommend(INPUT);
    expect(invalid.status).toBe('unavailable');
    expect(invalid.suggestions).toEqual([]);
  });

  it('28. unsafe output —— 想改幣值的那一批整批被擋下來', async () => {
    const service = new FakeTaskAiRecommendationService({ behaviour: 'unsafe_output' });
    const out = await service.recommend(INPUT);
    expect(out).toEqual({
      status: 'unavailable', schemaVersion: 1, reason: 'UNSAFE_OUTPUT', suggestions: [],
    });
  });

  it('29. abort：已經取消就不回結果', async () => {
    const service = new FakeTaskAiRecommendationService({ delayMs: 50 });
    const controller = new AbortController();
    const pending = service.recommend(INPUT, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(/取消/);
  });

  it('29b. 一開始就已經 aborted 也不會跑', async () => {
    const service = new FakeTaskAiRecommendationService({ delayMs: 50 });
    const controller = new AbortController();
    controller.abort();
    await expect(service.recommend(INPUT, controller.signal)).rejects.toThrow(/取消/);
  });

  it('UnavailableTaskAiRecommendationService 回 unavailable 而不是丟錯', async () => {
    // AI 不可用是正常狀態，不該讓家長看到錯誤畫面。
    const out = await new UnavailableTaskAiRecommendationService().recommend();
    expect(out.status).toBe('unavailable');
  });
});

// ---------------------------------------------------------------------------
// 30-32. 建立流程與 AI 是分離的
// ---------------------------------------------------------------------------

describe('AI 不是建立的必要條件', () => {
  it('30-31. 不論 AI 是什麼狀態，只要沒有 blocking finding 就能建立', () => {
    const findings = collectTaskRuleFindings(draft);
    expect(hasBlockingFinding(findings)).toBe(false);

    const states: Array<TaskAiRecommendationResult | null> = [
      null, // 31. 根本沒呼叫過
      { status: 'unavailable', schemaVersion: 1, reason: 'TIMEOUT', suggestions: [] },
      { status: 'no_change', schemaVersion: 1, summary: '沒問題', suggestions: [] },
    ];
    for (const state of states) {
      // 能不能建立只看規則，與 AI 的狀態無關 —— 這一條就是那個不變量。
      expect({ state: state?.status ?? 'never_requested', blocked: hasBlockingFinding(findings) })
        .toEqual({ state: state?.status ?? 'never_requested', blocked: false });
    }
  });

  it('30b. AI 失敗不會產生任何 rule finding', async () => {
    const service = new FakeTaskAiRecommendationService({ behaviour: 'unsafe_output' });
    await service.recommend(INPUT);
    // AI 出事之後，規則檢查的結果一個字都不會變。
    expect(collectTaskRuleFindings(draft)).toEqual(collectTaskRuleFindings(draft));
  });
});

// ---------------------------------------------------------------------------
// AI 區塊（B2B：改由狀態機驅動）
// ---------------------------------------------------------------------------

const SUGGESTION: TaskAiSuggestion = {
  id: 'sug-1',
  kind: 'clarify_completion',
  fieldPath: 'completionDescription',
  currentValue: '認真做',
  suggestedValue: '把碗筷收到水槽並擦好桌面',
  rationale: '「認真做」很難判斷做到了沒。',
  expectedBenefit: 'clearer_expectation',
  confidence: 'high',
};

const RECORD: AppliedSuggestionRecord = {
  suggestionId: 'sug-1',
  fieldPath: 'completionDescription',
  previousValue: '認真做',
};

function item(
  suggestion: TaskAiSuggestion,
  state: TaskAiItemState,
  record?: AppliedSuggestionRecord,
): TaskAiSuggestionItem {
  return { suggestion, state, ...(record ? { record } : null) };
}

function suggestionsState(items: TaskAiSuggestionItem[]): TaskAiReviewState {
  return { kind: 'suggestions', inputSignature: 'sig', summary: '兩個地方可以更清楚。', items };
}

function renderSection(
  overrides: Partial<React.ComponentProps<typeof TaskAiSection>> = {},
  mode: 'demo' | 'development' = 'demo',
) {
  const props: React.ComponentProps<typeof TaskAiSection> = {
    state: { kind: 'idle' },
    eligible: true,
    draftChanged: false,
    rewardRecalculated: false,
    onRequest: jest.fn(),
    onApply: jest.fn(),
    onKeep: jest.fn(),
    onUndo: jest.fn(),
    ...overrides,
  };
  return {
    props,
    ...render(
      <DisplayModeProvider mode={mode}>
        <TaskAiSection {...props} />
      </DisplayModeProvider>,
    ),
  };
}

describe('AI 區塊', () => {
  it('22-23. 進入畫面時不會自動呼叫 —— 要家長自己按', () => {
    const { props, getByText } = renderSection();
    expect(getByText('取得調整建議')).toBeTruthy();
    expect(props.onRequest).not.toHaveBeenCalled();

    fireEvent.press(getByText('取得調整建議'));
    expect(props.onRequest).toHaveBeenCalledTimes(1);
  });

  it('24. loading 時按鈕仍在但按不下去', () => {
    const { props, getByText, getByLabelText } = renderSection({
      state: { kind: 'loading', requestToken: 1, inputSignature: 'sig' },
    });
    expect(getByText('正在整理這項任務…')).toBeTruthy();

    const button = getByLabelText('取得調整建議');
    expect(button.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(button);
    expect(props.onRequest).not.toHaveBeenCalled();
  });

  it('11-12. 不 eligible 時完全沒有按鈕，而且不說任務有問題', () => {
    const { queryByText, getByText, toJSON } = renderSection({ eligible: false });
    expect(queryByText('取得調整建議')).toBeNull();
    expect(getByText('這類任務先由家長直接確認，不影響建立。')).toBeTruthy();

    const tree = JSON.stringify(toJSON());
    for (const forbidden of [
      'TASK_TYPE_NOT_ENABLED', 'HIGH_RISK_CONTEXT', 'UNSUPPORTED_CATEGORY',
      '不安全', '無法分析', '設定錯誤',
    ]) {
      expect(tree).not.toContain(forbidden);
    }
  });

  it('32. no_change 的說法', () => {
    const { getByText } = renderSection({
      state: { kind: 'no_change', inputSignature: 'sig', summary: '這份安排已經很具體。' },
    });
    expect(getByText('目前設定已經清楚，可以直接建立。')).toBeTruthy();
    expect(getByText('這份安排已經很具體。')).toBeTruthy();
  });

  it('33-36, 39. unavailable 明說不影響建立，而且不洩漏任何技術細節', () => {
    const { getByText, queryByText, toJSON } = renderSection({
      state: { kind: 'unavailable', reason: 'temporary', developerCode: 'TIMEOUT' },
    });
    expect(getByText('目前無法取得建議，不影響任務建立。')).toBeTruthy();
    expect(getByText('再試一次')).toBeTruthy();

    // demo 不顯示狀態碼，更不顯示 prompt / model / token。
    expect(queryByText(/TIMEOUT/)).toBeNull();
    const tree = JSON.stringify(toJSON());
    for (const leak of [
      'gemini', 'Gemini', 'prompt', 'token', 'model',
      'INVALID_RESPONSE', 'UNSAFE_OUTPUT', 'SERVICE_ERROR', '429', '401',
    ]) {
      expect(tree).not.toContain(leak);
    }
  });

  it('not_offered 不給重試按鈕 —— 再試一百次都一樣', () => {
    const { queryByText, getByText } = renderSection({
      state: { kind: 'unavailable', reason: 'not_offered', developerCode: 'NOT_ELIGIBLE' },
    });
    expect(getByText('這類任務先由家長直接確認，不影響建立。')).toBeTruthy();
    expect(queryByText('再試一次')).toBeNull();
  });

  it('37. 429 說得出「稍後再試」，而且只到分鐘', () => {
    const { getByText, queryByText, toJSON } = renderSection({
      state: { kind: 'rate_limited', retryAfterSeconds: 95 },
    });
    expect(getByText('目前暫時無法再取得建議，稍後再試；你仍可以直接建立任務。')).toBeTruthy();
    expect(getByText('約 2 分鐘後可以再試。')).toBeTruthy();
    expect(queryByText(/95/)).toBeNull();
    expect(JSON.stringify(toJSON())).not.toContain('429');
  });

  it('38. 401 要家長重新登入，不是「服務暫時不可用」', () => {
    const { getByText, queryByText } = renderSection({ state: { kind: 'auth_required' } });
    expect(getByText('登入狀態已失效，請重新登入後再試。')).toBeTruthy();
    expect(queryByText('目前無法取得建議，不影響任務建立。')).toBeNull();
  });

  it('development 才顯示服務狀態碼與服務模式', () => {
    const r = renderSection(
      {
        state: { kind: 'unavailable', reason: 'temporary', developerCode: 'TIMEOUT' },
        developerNote: 'AI 服務模式：fake（明確設定）',
      },
      'development',
    );
    expect(r.getByText('服務狀態：TIMEOUT')).toBeTruthy();
    expect(r.getByText('AI 服務模式：fake（明確設定）')).toBeTruthy();
  });

  it('40. 沒有「全部採用」', () => {
    const { queryByText, toJSON } = renderSection({
      state: suggestionsState([
        item(SUGGESTION, 'pending'),
        item({ ...SUGGESTION, id: 'sug-2' }, 'pending'),
      ]),
    });
    for (const label of ['全部採用', '一鍵套用', '自動最佳化', '全部套用']) {
      expect(queryByText(label)).toBeNull();
    }
    expect(JSON.stringify(toJSON())).not.toContain('全部');
  });

  it('每張卡顯示目前設定、建議調整與原因，但不顯示信心與內部代號', () => {
    const { getByText, queryByText, toJSON } = renderSection({
      state: suggestionsState([item(SUGGESTION, 'pending')]),
    });
    expect(getByText('把完成標準寫清楚')).toBeTruthy();
    expect(getByText('認真做')).toBeTruthy();
    expect(getByText('把碗筷收到水槽並擦好桌面')).toBeTruthy();
    expect(getByText('「認真做」很難判斷做到了沒。')).toBeTruthy();

    // confidence 與 expectedBenefit 都不上正式畫面：
    // 「信心 high」會被讀成準確率，而它是模型對自己的感覺。
    expect(queryByText(/high/)).toBeNull();
    expect(queryByText('期待更清楚')).toBeNull();
    const tree = JSON.stringify(toJSON());
    for (const internal of [
      'clarify_completion', 'completionDescription', 'clearer_expectation', 'schemaVersion',
    ]) {
      expect(tree).not.toContain(internal);
    }
  });

  it('41-42. 採用與保留原設定各自只影響那一張卡', () => {
    const only = item(SUGGESTION, 'pending');
    const { props, getByText } = renderSection({ state: suggestionsState([only]) });

    fireEvent.press(getByText('採用這項'));
    expect(props.onApply).toHaveBeenCalledWith(only);

    fireEvent.press(getByText('保留原設定'));
    expect(props.onKeep).toHaveBeenCalledWith(only);
  });

  it('43. 採用後顯示已採用並且可以復原', () => {
    const applied = item(SUGGESTION, 'applied', RECORD);
    const { props, getByText, queryByText } = renderSection({
      state: suggestionsState([applied]),
    });
    expect(getByText('已採用')).toBeTruthy();
    expect(queryByText('採用這項')).toBeNull();

    fireEvent.press(getByText('復原'));
    expect(props.onUndo).toHaveBeenCalledWith(applied);
  });

  it('42. 保留原設定之後不再顯示採用按鈕', () => {
    const { getByText, queryByText } = renderSection({
      state: suggestionsState([item(SUGGESTION, 'kept')]),
    });
    expect(getByText('保留原設定')).toBeTruthy();
    expect(queryByText('採用這項')).toBeNull();
  });

  it('45. 過期的項目不可套用，而且說得出原因', () => {
    const { getByText, queryByText } = renderSection({
      state: suggestionsState([item(SUGGESTION, 'stale')]),
    });
    expect(getByText('設定已變更，請重新確認')).toBeTruthy();
    expect(queryByText('採用這項')).toBeNull();
    expect(queryByText('保留原設定')).toBeNull();
  });

  it('50. 採用後家長又改過同一欄位時，不提供復原', () => {
    const edited = item(SUGGESTION, 'applied_edited', RECORD);
    const { getByText, queryByText } = renderSection({ state: suggestionsState([edited]) });
    expect(getByText('已採用')).toBeTruthy();
    // 復原會蓋掉家長剛打的字 —— 寧可少一個按鈕。
    expect(queryByText('復原')).toBeNull();
    expect(getByText('這個欄位在採用後又調整過，已保留你的版本。')).toBeTruthy();
  });

  it('54-55. 幣值重算的主詞是系統，不是 AI', () => {
    const { getByText, toJSON } = renderSection({
      state: suggestionsState([item(SUGGESTION, 'applied', RECORD)]),
      rewardRecalculated: true,
    });
    expect(getByText('依更新後的時間與任務設定，系統重新估算了成長幣。')).toBeTruthy();
    expect(JSON.stringify(toJSON())).not.toContain('AI 把');
  });

  it('49. 套用被擋下來時說得出來，但不顯示內部代碼', () => {
    const { getByText, toJSON } = renderSection({
      state: suggestionsState([item(SUGGESTION, 'pending')]),
      applyError: '這項建議和目前設定不相容，請手動調整。',
    });
    expect(getByText('這項建議和目前設定不相容，請手動調整。')).toBeTruthy();
    const tree = JSON.stringify(toJSON());
    for (const code of ['PATH_NOT_APPLICABLE', 'VALUE_TYPE_MISMATCH', 'VALIDATION_FAILED']) {
      expect(tree).not.toContain(code);
    }
  });

  it('家長修改草稿後提示可以重新取得，但不自動重呼叫', () => {
    const { props, getByText } = renderSection({
      state: suggestionsState([item(SUGGESTION, 'pending')]),
      draftChanged: true,
    });
    expect(getByText('任務內容已調整，需要時可重新取得建議。')).toBeTruthy();
    expect(props.onRequest).not.toHaveBeenCalled();
  });
});
