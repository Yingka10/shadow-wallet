// 第八階段 B2B — AI 建議在抽屜裡的完整行為
//
// 走真的 TaskCreationDrawer，只 mock lib/onboarding（它會連帶把 supabase
// client 拉進來，測試環境沒有 env）。AI client 用注入的假的 —— 這一支
// 不會發出任何網路請求。
//
// 要證明的幾件事，都是「錯了會真的傷到家長」的那種：
//
//   · 進到預覽不會自動花錢
//   · 重複點擊不會產生第二次付費呼叫
//   · 家長離開之後，晚回來的那批建議不會蓋在新草稿上
//   · 家庭角色任務不會呼叫服務，而且不會被說成有問題
//     （2026-08-11：A／B 類的 purposeCategory 已擴大開放，這條限制
//     現在只剩 family_role 這種任務形式，見 customTaskAiAvailability.ts）
//   · 採用建議之後幣值由規則引擎重算，不是 AI 決定

import React from 'react';
import { render, fireEvent, waitFor, act, type RenderResult } from '@testing-library/react-native';

jest.mock('../../../../../lib/onboarding', () => ({ calcAgeGroup: () => '6-9' }));

import { TaskCreationDrawer } from '../TaskCreationDrawer';
import { FakeParentTaskCreationService } from '../../../../../testing/fakeParentTaskCreationService';
import {
  enterCustomFlow,
  enterPresetCatalog,
} from '../../../../../testing/taskCreationDrawerFlow';
import {
  isAbortError,
  type TaskAiClientOutcome,
  type TaskAiRecommendationClient,
  type TaskAiRecommendationInput,
  type TaskAiRecommendationResult,
  type TaskAiSuggestion,
} from '../taskAi';

const CHILD = { id: 'child-1', nickname: '承恩', birthDate: '2018-03-05', familyId: 'family-1' };

const COMPLETION_SUGGESTION: TaskAiSuggestion = {
  id: 'sug-completion',
  kind: 'clarify_completion',
  fieldPath: 'completionDescription',
  currentValue: '認真讀',
  suggestedValue: '把讀到的一段講給家人聽',
  rationale: '「認真讀」很難判斷做到了沒。',
  expectedBenefit: 'clearer_expectation',
  confidence: 'high',
};

function suggestionsResult(suggestions: TaskAiSuggestion[]): TaskAiRecommendationResult {
  return {
    status: 'suggestions',
    schemaVersion: 1,
    summary: '有幾個地方可以再清楚一點。',
    suggestions,
  };
}

/**
 * 可控的假 client。
 *
 * 記下每一次呼叫與收到的 signal —— 「重複點擊有沒有送第二次」與
 * 「離開時有沒有真的取消」都只能從這兩件事看出來。
 */
class ControllableAiClient implements TaskAiRecommendationClient {
  readonly calls: TaskAiRecommendationInput[] = [];
  readonly signals: Array<AbortSignal | undefined> = [];
  private resolvers: Array<(outcome: TaskAiClientOutcome) => void> = [];

  constructor(private readonly auto: TaskAiClientOutcome | null = null) {}

  async recommend(
    input: TaskAiRecommendationInput,
    signal?: AbortSignal,
  ): Promise<TaskAiClientOutcome> {
    this.calls.push(input);
    this.signals.push(signal);
    if (this.auto) return this.auto;
    return new Promise<TaskAiClientOutcome>(resolve => {
      const settle = (outcome: TaskAiClientOutcome) => {
        if (signal?.aborted) {
          resolve({ kind: 'aborted' });
          return;
        }
        resolve(outcome);
      };
      this.resolvers.push(settle);
      signal?.addEventListener('abort', () => settle({ kind: 'aborted' }), { once: true });
    });
  }

  /** 讓第 index 次呼叫回話。 */
  settle(outcome: TaskAiClientOutcome, index = 0): void {
    const resolve = this.resolvers[index];
    if (!resolve) throw new Error(`第 ${index} 次呼叫還沒發生`);
    resolve(outcome);
  }

  get callCount(): number {
    return this.calls.length;
  }
}

function open(client: TaskAiRecommendationClient | null, mode?: 'demo' | 'development') {
  const service = new FakeParentTaskCreationService();
  const r = render(
    <TaskCreationDrawer
      visible
      onClose={() => {}}
      child={CHILD}
      childLoading={false}
      taskCreationService={service}
      taskAiClient={client}
      {...(mode ? { displayMode: mode, taskAiDeveloperNote: 'AI 服務模式：fake（明確設定）' } : null)}
    />,
  );
  return { r, service };
}

/** preset 的「閱讀與共讀」→ 固定閱讀練習（學習與技能＝可取得建議）。 */
function openPresetReview(client: TaskAiRecommendationClient | null, mode?: 'demo' | 'development') {
  const opened = open(client, mode);
  enterPresetCatalog(opened.r);
  fireEvent.press(opened.r.getAllByText('閱讀與共讀')[0]);
  fireEvent.press(opened.r.getByText('下一步'));
  fireEvent.press(opened.r.getByLabelText('用什麼方式進行？：自己閱讀'));
  fireEvent.changeText(opened.r.getByLabelText('怎樣算完成'), '認真讀');
  fireEvent.press(opened.r.getByText('檢查並預覽'));
  return opened;
}

/** 自訂的學習類固定任務。 */
function openCustomReview(
  client: TaskAiRecommendationClient | null,
  purpose = '學習或練習技能',
) {
  const opened = open(client);
  enterCustomFlow(opened.r);
  fireEvent.changeText(opened.r.getByLabelText('任務名稱'), '每天閱讀');
  fireEvent.press(opened.r.getByText('下一步'));
  fireEvent.press(opened.r.getByText(purpose));
  fireEvent.press(opened.r.getByText('下一步'));
  fireEvent.press(opened.r.getByText('固定重複'));
  fireEvent.press(opened.r.getByText('下一步'));
  fireEvent.changeText(opened.r.getByLabelText('怎樣算完成'), '認真讀');
  fireEvent.press(opened.r.getByText('檢查並預覽'));
  return opened;
}

/**
 * 走到預覽的家庭參與任務（固定重複 → editorKind='recurring'）。
 *
 * 2026-08-11 前這是「A／B 類不提供建議」的範例；現在 purposeCategory
 * 已擴大到全部四類，這則任務會看得到 AI 建議按鈕。真正還會被擋下來的
 * 是 family_role 這種任務形式，不是這個 helper 走的路徑
 * （見 customTask/__tests__/aiAvailability.test.ts 直接測 editorKind='family_role'）。
 */
function openFamilyReview(client: TaskAiRecommendationClient | null) {
  const opened = open(client);
  enterCustomFlow(opened.r);
  fireEvent.changeText(opened.r.getByLabelText('任務名稱'), '餐後整理');
  fireEvent.press(opened.r.getByText('下一步'));
  fireEvent.press(opened.r.getByText('參與家庭生活'));
  fireEvent.press(opened.r.getByText('下一步'));
  fireEvent.press(opened.r.getByText('固定重複'));
  fireEvent.press(opened.r.getByText('下一步'));
  fireEvent.changeText(opened.r.getByLabelText('怎樣算完成'), '把碗筷收到水槽');
  fireEvent.press(opened.r.getByText('檢查並預覽'));
  return opened;
}

async function press(r: RenderResult, label: string) {
  await act(async () => {
    fireEvent.press(r.getByText(label));
  });
}

// ---------------------------------------------------------------------------
// 1, 22-24. 什麼時候才會呼叫
// ---------------------------------------------------------------------------

describe('1, 22-24. 呼叫時機', () => {
  it('1. 沒有 client 時整個 AI 區塊不出現', () => {
    const { r } = openPresetReview(null);
    expect(r.getByText('預覽（尚未建立）')).toBeTruthy();
    expect(r.queryByText('一起調整這項任務')).toBeNull();
    expect(r.queryByText('取得調整建議')).toBeNull();
  });

  it('22. 進到預覽不會自動呼叫 —— 那是一筆付費請求', () => {
    const client = new ControllableAiClient();
    const { r } = openPresetReview(client);
    expect(r.getByText('取得調整建議')).toBeTruthy();
    expect(client.callCount).toBe(0);
  });

  it('23. 按下去才呼叫，而且只呼叫一次', async () => {
    const client = new ControllableAiClient();
    const { r } = openPresetReview(client);
    await press(r, '取得調整建議');
    expect(client.callCount).toBe(1);
  });

  it('24-25. loading 期間重複按不會送出第二次，也不會自動重試', async () => {
    const client = new ControllableAiClient();
    const { r } = openPresetReview(client);

    await press(r, '取得調整建議');
    expect(r.getByText('正在整理這項任務…')).toBeTruthy();

    await act(async () => {
      fireEvent.press(r.getByLabelText('取得調整建議'));
      fireEvent.press(r.getByLabelText('取得調整建議'));
    });
    expect(client.callCount).toBe(1);
  });

  it('loading 期間仍然可以直接建立任務', async () => {
    const client = new ControllableAiClient();
    const { r, service } = openPresetReview(client);
    await press(r, '取得調整建議');

    // AI 還在轉，建立按鈕照樣可以按 —— AI 是可選步驟。
    await act(async () => {
      fireEvent.press(r.getByText('確認建立'));
    });
    await waitFor(() => expect(service.callCount).toBe(1));
  });
});

// ---------------------------------------------------------------------------
// 7-14. eligibility
// ---------------------------------------------------------------------------

describe('7-14. 哪些任務會呼叫服務', () => {
  it('7-8. preset 的學習類看得到按鈕', () => {
    const client = new ControllableAiClient();
    const { r } = openPresetReview(client);
    expect(r.getByText('取得調整建議')).toBeTruthy();
  });

  it('9-10. 自訂的學習類與自主挑戰也看得到', () => {
    for (const purpose of ['學習或練習技能', '孩子自己想挑戰']) {
      const client = new ControllableAiClient();
      const { r } = openCustomReview(client, purpose);
      expect(r.getByText('取得調整建議')).toBeTruthy();
      r.unmount();
    }
  });

  it('11-12. 家庭參與（固定重複）現在看得到按鈕', () => {
    // 2026-08-11：purposeCategory 擴大到全部四類，family_participation
    // 不再是被擋下來的例子。
    const client = new ControllableAiClient();
    const { r } = openFamilyReview(client);

    expect(r.getByText('取得調整建議')).toBeTruthy();
    expect(client.callCount).toBe(0); // 還沒按下去，不會自動呼叫。
  });

  it('11b. 不顯示內部代碼', () => {
    const client = new ControllableAiClient();
    const { r } = openFamilyReview(client);
    const tree = JSON.stringify(r.toJSON());
    for (const forbidden of [
      'TASK_TYPE_NOT_ENABLED', 'HIGH_RISK_CONTEXT', 'UNSUPPORTED_CATEGORY',
      'NOT_ELIGIBLE', '不安全', '無法分析',
    ]) {
      expect(tree).not.toContain(forbidden);
    }
  });

  it('不點 AI 建議，家庭參與任務照樣建得出來', async () => {
    const client = new ControllableAiClient();
    const { r, service } = openFamilyReview(client);
    await act(async () => {
      fireEvent.press(r.getByText('確認建立'));
    });
    await waitFor(() => expect(service.callCount).toBe(1));
    expect(client.callCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 15-20. 送出去的內容
// ---------------------------------------------------------------------------

describe('15-20. 送出去的內容', () => {
  it('15-19. preset：不含孩子暱稱、child id、family id', async () => {
    const client = new ControllableAiClient();
    const { r } = openPresetReview(client);
    await press(r, '取得調整建議');

    const serialized = JSON.stringify(client.calls[0]);
    for (const secret of ['承恩', 'child-1', 'family-1']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('20. custom：不含任何假的 preset id', async () => {
    const client = new ControllableAiClient();
    const { r } = openCustomReview(client);
    await press(r, '取得調整建議');

    const serialized = JSON.stringify(client.calls[0]);
    expect(serialized).not.toMatch(/learn-|life-|fam-|auto-/);
    expect(serialized).not.toContain('承恩');
  });

  it('59-60. 兩個入口送出去的形狀一樣', async () => {
    const presetClient = new ControllableAiClient();
    const preset = openPresetReview(presetClient);
    await press(preset.r, '取得調整建議');
    preset.r.unmount();

    const customClient = new ControllableAiClient();
    const custom = openCustomReview(customClient);
    await press(custom.r, '取得調整建議');

    expect(Object.keys(customClient.calls[0]).sort())
      .toEqual(Object.keys(presetClient.calls[0]).sort());
  });
});

// ---------------------------------------------------------------------------
// 28-30. abort 與 stale
// ---------------------------------------------------------------------------

describe('28-30. abort 與過期回應', () => {
  it('27-29. 返回修改時取消請求，而且不顯示任何錯誤', async () => {
    const client = new ControllableAiClient();
    const { r } = openPresetReview(client);
    await press(r, '取得調整建議');

    const signal = client.signals[0];
    expect(signal?.aborted).toBe(false);

    await press(r, '返回修改');
    expect(signal?.aborted).toBe(true);

    // 家長是自己離開的 —— 沒有任何錯誤或提示。
    expect(r.queryByText('目前無法取得建議，不影響任務建立。')).toBeNull();
  });

  it('28. 關閉抽屜時取消', async () => {
    const client = new ControllableAiClient();
    const { r } = openPresetReview(client);
    await press(r, '取得調整建議');

    await act(async () => {
      fireEvent.press(r.getByLabelText('關閉'));
    });
    expect(client.signals[0]?.aborted).toBe(true);
  });

  it('30. 取消之後晚回來的那一份不會覆蓋畫面', async () => {
    const client = new ControllableAiClient();
    const { r } = openPresetReview(client);
    await press(r, '取得調整建議');

    await press(r, '返回修改');
    // 假 client 已經被 abort 解掉了；再送一份結果進來也不該有任何作用。
    await act(async () => {
      try {
        client.settle({ kind: 'result', result: suggestionsResult([COMPLETION_SUGGESTION]) });
      } catch {
        // 已經 settle 過就沒事。
      }
    });

    await press(r, '檢查並預覽');
    // 回到預覽時是乾淨的 idle，不是三秒前那批對著舊草稿寫的建議。
    expect(r.getByText('取得調整建議')).toBeTruthy();
    expect(r.queryByText('把讀到的一段講給家人聽')).toBeNull();
  });

  it('abort 之後再按一次會是全新的請求', async () => {
    const client = new ControllableAiClient();
    const { r } = openPresetReview(client);
    await press(r, '取得調整建議');
    await press(r, '返回修改');
    await press(r, '檢查並預覽');
    await press(r, '取得調整建議');

    expect(client.callCount).toBe(2);
    expect(client.signals[1]).not.toBe(client.signals[0]);
  });
});

// ---------------------------------------------------------------------------
// 31-39. 每一種回應
// ---------------------------------------------------------------------------

describe('31-39. 回應', () => {
  async function outcomeShows(outcome: TaskAiClientOutcome): Promise<RenderResult> {
    const client = new ControllableAiClient(outcome);
    const { r } = openPresetReview(client);
    await press(r, '取得調整建議');
    return r;
  }

  it('31. suggestions 逐張顯示', async () => {
    const r = await outcomeShows({
      kind: 'result',
      result: suggestionsResult([COMPLETION_SUGGESTION]),
    });
    expect(r.getByText('把完成標準寫清楚')).toBeTruthy();
    expect(r.getByText('把讀到的一段講給家人聽')).toBeTruthy();
    expect(r.getByText('採用這項')).toBeTruthy();
  });

  it('32. no_change', async () => {
    const r = await outcomeShows({
      kind: 'result',
      result: { status: 'no_change', schemaVersion: 1, summary: '已經很具體。', suggestions: [] },
    });
    expect(r.getByText('目前設定已經清楚，可以直接建立。')).toBeTruthy();
    expect(r.queryByText('採用這項')).toBeNull();
  });

  it('33-36. timeout / invalid / unsafe / service error 都是同一句話', async () => {
    for (const reason of ['TIMEOUT', 'INVALID_RESPONSE', 'UNSAFE_OUTPUT', 'SERVICE_ERROR'] as const) {
      const r = await outcomeShows({
        kind: 'result',
        result: { status: 'unavailable', schemaVersion: 1, reason, suggestions: [] },
      });
      expect(r.getByText('目前無法取得建議，不影響任務建立。')).toBeTruthy();
      expect(r.queryByText(new RegExp(reason))).toBeNull();
      r.unmount();
    }
  });

  it('37. 429 有自己的說法', async () => {
    const r = await outcomeShows({ kind: 'rate_limited', retryAfterSeconds: 180 });
    expect(r.getByText('目前暫時無法再取得建議，稍後再試；你仍可以直接建立任務。')).toBeTruthy();
    expect(r.getByText('約 3 分鐘後可以再試。')).toBeTruthy();
  });

  it('38. 401 要重新登入，不會被包裝成一般不可用', async () => {
    const r = await outcomeShows({ kind: 'auth_required' });
    expect(r.getByText('登入狀態已失效，請重新登入後再試。')).toBeTruthy();
    expect(r.queryByText('目前無法取得建議，不影響任務建立。')).toBeNull();
  });

  it('39. 任何失敗之後都還建得出任務', async () => {
    const client = new ControllableAiClient({ kind: 'server_unavailable' });
    const { r, service } = openPresetReview(client);
    await press(r, '取得調整建議');
    expect(r.getByText('目前無法取得建議，不影響任務建立。')).toBeTruthy();

    await act(async () => {
      fireEvent.press(r.getByText('確認建立'));
    });
    await waitFor(() => expect(service.callCount).toBe(1));
  });
});

// ---------------------------------------------------------------------------
// 40-50. 逐項處置
// ---------------------------------------------------------------------------

describe('40-50. 逐項處置', () => {
  function withSuggestions(suggestions: TaskAiSuggestion[]) {
    const client = new ControllableAiClient({
      kind: 'result',
      result: suggestionsResult(suggestions),
    });
    return openPresetReview(client);
  }

  it('40. 沒有「全部採用」', async () => {
    const { r } = withSuggestions([COMPLETION_SUGGESTION]);
    await press(r, '取得調整建議');
    for (const label of ['全部採用', '一鍵套用', '全部套用']) {
      expect(r.queryByText(label)).toBeNull();
    }
  });

  it('41, 43. 採用一項之後草稿真的改了，而且可以復原', async () => {
    const { r } = withSuggestions([COMPLETION_SUGGESTION]);
    await press(r, '取得調整建議');
    await press(r, '採用這項');

    expect(r.getByText('已採用')).toBeTruthy();
    /*
      套用前那句話只出現在建議卡的「建議調整」；套用後預覽的
      「怎樣算完成」也會是同一句 —— 所以出現次數從 1 變成 2。
      那正是「草稿真的被改了」的證據。
    */
    expect(r.getAllByText('把讀到的一段講給家人聽').length).toBe(2);

    await press(r, '復原');
    expect(r.getByText('採用這項')).toBeTruthy();
    // 復原之後預覽回到原本的值，那句話又只剩建議卡上那一份。
    expect(r.getAllByText('把讀到的一段講給家人聽')).toHaveLength(1);
  });

  it('重新產生建議：拿到 no_change 也不會讓已採用的項目消失', async () => {
    // 這裡刻意不用 withSuggestions（auto client，每次呼叫都回同一份結果）——
    // 要驗證的正是「第二次呼叫回了不同的東西」，兩次呼叫要能各自 settle。
    const client = new ControllableAiClient();
    const { r } = openPresetReview(client);

    await press(r, '取得調整建議');
    await act(async () => {
      client.settle({ kind: 'result', result: suggestionsResult([COMPLETION_SUGGESTION]) });
    });
    await press(r, '採用這項');
    expect(r.getByText('已採用')).toBeTruthy();

    await press(r, '重新產生建議');
    await act(async () => {
      client.settle(
        { kind: 'result', result: { status: 'no_change', schemaVersion: 1, summary: '已經很清楚了。', suggestions: [] } },
        1,
      );
    });

    // 模型這次說不用調整了，但已經採用的那張卡片不能因此消失——
    // 那個決定已經真的寫進草稿裡了。
    expect(r.getByText('已經很清楚了。')).toBeTruthy();
    expect(r.getByText('已採用')).toBeTruthy();
  });

  it('42. 保留原設定不會改到草稿', async () => {
    const { r } = withSuggestions([COMPLETION_SUGGESTION]);
    await press(r, '取得調整建議');
    await press(r, '保留原設定');

    expect(r.getAllByText('保留原設定').length).toBeGreaterThan(0);
    expect(r.queryByText('採用這項')).toBeNull();
  });

  it('44. 復原一項不影響另一項', async () => {
    const second: TaskAiSuggestion = {
      ...COMPLETION_SUGGESTION,
      id: 'sug-title',
      kind: 'clarify_title',
      fieldPath: 'title',
      currentValue: null,
      suggestedValue: '每天閱讀二十分鐘',
    };
    const { r } = withSuggestions([COMPLETION_SUGGESTION, second]);
    await press(r, '取得調整建議');

    /*
      兩項都指向家長沒動過的欄位，所以兩項都是 pending —— 即使第二項的
      `currentValue` 是 null。stale 只看**家長有沒有在送出請求之後改過那個
      欄位**，不看模型回了什麼（模型收到的是遮蔽版本，見 baselineValue）。
    */
    expect(r.queryAllByText('採用這項').length).toBe(2);

    // 只採用第一項；重點是第二項不受影響，仍然可以採用。
    await act(async () => {
      fireEvent.press(r.getAllByText('採用這項')[0]);
    });

    expect(r.getByText('已採用')).toBeTruthy();
    expect(r.queryAllByText('採用這項').length).toBe(1);
  });

  it('47. AI 不能改回饋方式或幣值 —— 那些路徑整批被擋下來', async () => {
    const client = new ControllableAiClient({
      kind: 'result',
      // validator 在 client 這一側就會把整批丟掉，所以畫面上不會有卡片。
      result: { status: 'unavailable', schemaVersion: 1, reason: 'UNSAFE_OUTPUT', suggestions: [] },
    });
    const { r } = openPresetReview(client);
    await press(r, '取得調整建議');
    expect(r.queryByText('採用這項')).toBeNull();
    expect(r.getByText('目前無法取得建議，不影響任務建立。')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 51-58. 幣值與來源
// ---------------------------------------------------------------------------

describe('51-58. 幣值與來源', () => {
  const minutesSuggestion: TaskAiSuggestion = {
    id: 'sug-minutes',
    kind: 'adjust_session_time',
    fieldPath: 'sessionMinutes',
    currentValue: 20,
    suggestedValue: 30,
    rationale: '這個階段可以拉長一點。',
    expectedBenefit: 'more_achievable',
    confidence: 'medium',
  };

  it('51-53. 採用時間建議之後，幣值由規則引擎重算', async () => {
    const client = new ControllableAiClient({
      kind: 'result',
      result: suggestionsResult([minutesSuggestion]),
    });
    const { r, service } = openPresetReview(client);
    await press(r, '取得調整建議');
    await press(r, '採用這項');

    // 54. 說明的主詞是系統，不是 AI。
    expect(r.getByText('依更新後的時間與任務設定，系統重新估算了成長幣。')).toBeTruthy();
    // 55. 不會說「AI 把成長幣改成 N 枚」。
    expect(JSON.stringify(r.toJSON())).not.toContain('AI 把');

    await act(async () => {
      fireEvent.press(r.getByText('確認建立'));
    });
    await waitFor(() => expect(service.callCount).toBe(1));

    const command = service.calls[0];
    // 51-52. 回饋方式與幣值仍然是規則引擎的產物。
    expect(command.task.rewardPolicy).toBe('coin_eligible');
    expect(command.schedule.estimatedMinutes).toBe(30);
    expect(command.reward.decision.eligibility).toBe('allowed');
    expect(command.reward.decision.rewardPolicyVersion).toMatch(/coin-policy/);
  });

  it('56, 58. preset：採用建議之後 preset selection 與來源都沒變', async () => {
    const client = new ControllableAiClient({
      kind: 'result',
      result: suggestionsResult([COMPLETION_SUGGESTION]),
    });
    const { r, service } = openPresetReview(client);
    await press(r, '取得調整建議');
    await press(r, '採用這項');

    await act(async () => {
      fireEvent.press(r.getByText('確認建立'));
    });
    await waitFor(() => expect(service.callCount).toBe(1));

    const command = service.calls[0];
    expect(command.creationSource).toBe('preset');
    expect(command.preset).toBeDefined();
    expect(command.task.completionDescription).toBe('把讀到的一段講給家人聽');
  });

  it('57-58. custom：採用建議之後仍然沒有 preset，來源不變', async () => {
    const client = new ControllableAiClient({
      kind: 'result',
      result: suggestionsResult([COMPLETION_SUGGESTION]),
    });
    const { r, service } = openCustomReview(client);
    await press(r, '取得調整建議');
    await press(r, '採用這項');

    await act(async () => {
      fireEvent.press(r.getByText('確認建立'));
    });
    await waitFor(() => expect(service.callCount).toBe(1));

    const command = service.calls[0];
    expect(command.creationSource).toBe('parent_custom');
    expect(command.preset).toBeUndefined();
  });

  it('68. 採用建議不會換掉建立請求識別碼', async () => {
    const client = new ControllableAiClient({
      kind: 'result',
      result: suggestionsResult([COMPLETION_SUGGESTION]),
    });
    const { r, service } = openPresetReview(client);

    // 先送一次失敗，記下識別碼。
    service.setBehaviour({ kind: 'persistenceFailed' });
    await act(async () => {
      fireEvent.press(r.getByText('確認建立'));
    });
    await waitFor(() => expect(service.callCount).toBe(1));
    const firstId = service.requestIds[0];

    await press(r, '取得調整建議');
    await press(r, '採用這項');

    service.setBehaviour({ kind: 'success' });
    await act(async () => {
      fireEvent.press(r.getByText('確認建立'));
    });
    await waitFor(() => expect(service.callCount).toBe(2));
    // idempotency 與 AI 完全無關 —— 採用建議只是改草稿內容。
    expect(service.requestIds[1]).toBe(firstId);
  });
});

// ---------------------------------------------------------------------------
// 61-63. 回歸
// ---------------------------------------------------------------------------

describe('61-63. 回歸', () => {
  it('61. Step 2 仍然沒有任何預選', () => {
    const client = new ControllableAiClient();
    const { r } = open(client);
    enterCustomFlow(r);
    fireEvent.changeText(r.getByLabelText('任務名稱'), '每天閱讀');
    fireEvent.press(r.getByText('下一步'));

    const selected = r
      .getAllByRole('radio')
      .filter(node => node.props.accessibilityState?.selected === true);
    expect(selected).toHaveLength(0);
    expect(client.callCount).toBe(0);
  });

  it('62-63. 抽屜整層都沒有 classifyTask / suggestTaskCoin / ai-proxy', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const root = path.resolve(__dirname, '..');

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(full);
          continue;
        }
        if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) files.push(full);
      }
    };
    walk(root);

    const offenders = files.filter(file => {
      const code = fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      return /classifyTask|suggestTaskCoin|['"]ai-proxy['"]/.test(code);
    });
    expect(offenders).toEqual([]);
  });

  it('AbortError 判斷認得標準的 DOMException 形狀', () => {
    const err = new Error('x');
    err.name = 'AbortError';
    expect(isAbortError(err)).toBe(true);
    expect(isAbortError(new Error('x'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});
