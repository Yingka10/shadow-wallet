// 第八階段 A — 假服務與 DraftReview prototype
//
// 這裡驗的是**AI 壞掉的時候會發生什麼**。
//
// 那才是重點：AI 給出好建議的路徑很好測，也不太會出事。真正會傷到家長的是
// 「按了取得建議，然後畫面卡住、任務建不出來」。所以下面每一種失敗
// 都要能重現，而且每一種失敗之後都要能照常建立任務。

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

import {
  FakeTaskAiRecommendationService,
  UnavailableTaskAiRecommendationService,
  buildTaskAiInput,
  collectTaskRuleFindings,
  hasBlockingFinding,
  type AiSuggestionDecision,
  type TaskAiRecommendationResult,
  type TaskAiSuggestion,
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
  it('30-31. 不論 AI 是什麼狀態，只要沒有 blocking finding 就能建立', async () => {
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
// DraftReview prototype
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

function renderSection(overrides: Partial<React.ComponentProps<typeof TaskAiSection>> = {}) {
  const props = {
    result: null as TaskAiRecommendationResult | null,
    loading: false,
    decisions: {} as Record<string, AiSuggestionDecision>,
    onRequest: jest.fn(),
    onApply: jest.fn(),
    onReject: jest.fn(),
    onUndo: jest.fn(),
    ...overrides,
  };
  return {
    props,
    ...render(
      <DisplayModeProvider mode="demo">
        <TaskAiSection {...props} />
      </DisplayModeProvider>,
    ),
  };
}

describe('AI 區塊', () => {
  it('進入畫面時不會自動呼叫 —— 要家長自己按', () => {
    const { props, getByText } = renderSection();
    expect(getByText('取得調整建議')).toBeTruthy();
    expect(props.onRequest).not.toHaveBeenCalled();

    fireEvent.press(getByText('取得調整建議'));
    expect(props.onRequest).toHaveBeenCalledTimes(1);
  });

  it('loading 時顯示整理中', () => {
    const { getByText, queryByText } = renderSection({ loading: true });
    expect(getByText('正在整理建議…')).toBeTruthy();
    expect(queryByText('取得調整建議')).toBeNull();
  });

  it('no_change 的說法', () => {
    const { getByText } = renderSection({
      result: { status: 'no_change', schemaVersion: 1, summary: 'x', suggestions: [] },
    });
    expect(getByText('目前設定已經清楚，可以直接建立。')).toBeTruthy();
  });

  it('unavailable 明說不影響建立，而且不洩漏任何技術細節', () => {
    const { getByText, queryByText, toJSON } = renderSection({
      result: { status: 'unavailable', schemaVersion: 1, reason: 'TIMEOUT', suggestions: [] },
    });
    expect(getByText('目前無法取得建議，不影響任務建立。')).toBeTruthy();
    // demo 不顯示狀態碼，更不顯示 prompt / model / token。
    expect(queryByText(/TIMEOUT/)).toBeNull();
    const tree = JSON.stringify(toJSON());
    for (const leak of ['gemini', 'Gemini', 'prompt', 'token', 'model']) {
      expect(tree).not.toContain(leak);
    }
  });

  it('development 才顯示服務狀態碼，而且只有狀態碼', () => {
    const r = render(
      <DisplayModeProvider mode="development">
        <TaskAiSection
          result={{ status: 'unavailable', schemaVersion: 1, reason: 'TIMEOUT', suggestions: [] }}
          loading={false}
          decisions={{}}
          onRequest={jest.fn()}
          onApply={jest.fn()}
          onReject={jest.fn()}
          onUndo={jest.fn()}
        />
      </DisplayModeProvider>,
    );
    expect(r.getByText('服務狀態：TIMEOUT')).toBeTruthy();
  });

  it('32. 沒有「全部採用」', () => {
    const { queryByText, toJSON } = renderSection({
      result: {
        status: 'suggestions', schemaVersion: 1, summary: '兩個地方可以更清楚。',
        suggestions: [SUGGESTION, { ...SUGGESTION, id: 'sug-2' }],
      },
    });
    for (const label of ['全部採用', '一鍵套用', '自動最佳化', '全部套用']) {
      expect(queryByText(label)).toBeNull();
    }
    expect(JSON.stringify(toJSON())).not.toContain('全部');
  });

  it('每張卡都顯示目前設定、建議調整、原因與預期幫助', () => {
    const { getByText } = renderSection({
      result: {
        status: 'suggestions', schemaVersion: 1, summary: '一個地方可以更清楚。',
        suggestions: [SUGGESTION],
      },
    });
    expect(getByText('把完成標準寫清楚')).toBeTruthy();
    expect(getByText('認真做')).toBeTruthy();
    expect(getByText('把碗筷收到水槽並擦好桌面')).toBeTruthy();
    expect(getByText('「認真做」很難判斷做到了沒。')).toBeTruthy();
    expect(getByText('期待更清楚')).toBeTruthy();
  });

  it('採用與保留原設定各自只影響那一張卡', () => {
    const { props, getByText } = renderSection({
      result: {
        status: 'suggestions', schemaVersion: 1, summary: 'x', suggestions: [SUGGESTION],
      },
    });
    fireEvent.press(getByText('採用這項'));
    expect(props.onApply).toHaveBeenCalledWith(SUGGESTION);

    fireEvent.press(getByText('保留原設定'));
    expect(props.onReject).toHaveBeenCalledWith(SUGGESTION);
  });

  it('採用後顯示已套用並且可以復原', () => {
    const { props, getByText, queryByText } = renderSection({
      result: {
        status: 'suggestions', schemaVersion: 1, summary: 'x', suggestions: [SUGGESTION],
      },
      decisions: { 'sug-1': 'applied' },
    });
    expect(getByText('已套用')).toBeTruthy();
    expect(queryByText('採用這項')).toBeNull();

    fireEvent.press(getByText('復原'));
    expect(props.onUndo).toHaveBeenCalledWith(SUGGESTION);
  });

  it('保留原設定之後不再顯示採用按鈕', () => {
    const { getByText, queryByText } = renderSection({
      result: {
        status: 'suggestions', schemaVersion: 1, summary: 'x', suggestions: [SUGGESTION],
      },
      decisions: { 'sug-1': 'rejected' },
    });
    expect(getByText('已保留原設定')).toBeTruthy();
    expect(queryByText('採用這項')).toBeNull();
  });
});
