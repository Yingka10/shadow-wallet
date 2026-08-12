// 第七階段 E — 正式 Demo 文案
//
// 預覽卡上原本印的是政策引擎寫給自己看的東西：
//
//   政策允許範圍 5–25 枚
//   6-9 歲段、D 類、每次約 20 分鐘
//   幣值政策版本 coin-policy-1.0.0
//
// 三行都有問題。「D 類」是內部分類代號；「政策允許範圍」在沒有幣值調整 UI
// 之前，等於請家長去找一個不存在的滑桿；版本號是稽核資訊。
//
// 家長在這一頁只需要回答一個問題：這樣可以嗎。所以 demo 只留金額與一句人話，
// 其餘收進 development 的「查看估算依據」。

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { RewardDecisionBlock } from '../editors/DraftReview';
import { DisplayModeProvider, type PresetTaskDrawerDisplayMode } from '../displayMode';
import { REWARD_POLICY_SHORT_LABEL, reviewCycleText } from '../taskDraft';
import type { TaskRewardDecision } from '../taskReward/types';

const COIN_DECISION: TaskRewardDecision = {
  rewardPolicy: 'coin_eligible',
  eligibility: 'allowed',
  rewardPolicyVersion: 'coin-policy-1.0.0',
  explanation: '6-9 歲段、D 類、每次約 20 分鐘',
  coin: {
    suggestedAmount: 10,
    finalAmount: 10,
    minAllowed: 5,
    maxAllowed: 25,
    calculationBasis: {
      ageGroup: '6-9',
      purposeCategory: 'learning_skill',
      estimatedMinutes: 20,
      durationType: 'long_term',
      scheduleMode: 'fixed_days',
      difficulty: 'standard',
      band: '11-20',
    },
  },
};

/** 收集畫面上真的會被讀出來的文字節點（不含 style 等 props）。 */
function renderedText(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(renderedText);
  if (node && typeof node === 'object' && 'children' in node) {
    return renderedText((node as { children?: unknown }).children);
  }
  return [];
}

function renderBlock(mode: PresetTaskDrawerDisplayMode, decision = COIN_DECISION) {
  return render(
    <DisplayModeProvider mode={mode}>
      <RewardDecisionBlock decision={decision} />
    </DisplayModeProvider>,
  );
}

// ---------------------------------------------------------------------------
// 9. demo 不顯示技術細節
// ---------------------------------------------------------------------------

describe('demo 模式的成長幣回饋卡', () => {
  it('標題是「成長幣回饋」，不是「可獲得成長幣」', () => {
    const r = renderBlock('demo');
    expect(r.getByText('成長幣回饋')).toBeTruthy();
    expect(r.queryByText('可獲得成長幣')).toBeNull();
  });

  it('顯示最終幣值', () => {
    const r = renderBlock('demo');
    expect(r.getByText('10')).toBeTruthy();
    expect(r.getByText('枚')).toBeTruthy();
  });

  it('說明只講家長自己做過的選擇', () => {
    const r = renderBlock('demo');
    expect(r.getByText('依孩子的年齡、任務類型與每次 20 分鐘的投入估算。')).toBeTruthy();
  });

  it.each([
    ['D 類', /D\s*類/],
    ['時間分級', /時間分級/],
    ['difficulty enum', /standard/],
    ['難度未指定', /難度未指定/],
    ['policy version', /coin-policy/],
    ['min / max 範圍', /政策允許範圍|5–25|可調整範圍/],
  ])('不出現 %s', (_label, pattern) => {
    const r = renderBlock('demo');
    expect(renderedText(r.toJSON()).join('\n')).not.toMatch(pattern);
  });

  it('沒有「查看估算依據」可以展開', () => {
    const r = renderBlock('demo');
    expect(r.queryByText('查看估算依據')).toBeNull();
  });

  it('沒有估計分鐘時退成不含數字的說法，而不是印出 undefined', () => {
    const r = renderBlock('demo', {
      ...COIN_DECISION,
      coin: {
        ...COIN_DECISION.coin!,
        calculationBasis: {
          ...COIN_DECISION.coin!.calculationBasis,
          estimatedMinutes: undefined,
        },
      },
    } as TaskRewardDecision);
    expect(r.getByText('依孩子的年齡與任務類型估算。')).toBeTruthy();
    expect(renderedText(r.toJSON()).join('\n')).not.toMatch(/undefined|NaN/);
  });
});

// ---------------------------------------------------------------------------
// 10. development 可展開
// ---------------------------------------------------------------------------

describe('development 模式', () => {
  it('預設收合，展開後才出現估算依據', () => {
    const r = renderBlock('development');
    const toggle = r.getByText('查看估算依據');
    expect(r.queryByText('年齡段')).toBeNull();

    fireEvent.press(toggle);

    for (const label of ['年齡段', '任務類型', '每次時間', '難度', '可調整範圍', '幣值政策版本']) {
      expect(r.getByText(label)).toBeTruthy();
    }
  });

  it('展開的內容是中文標籤，不是裸 JSON 也不是 DB 欄位名', () => {
    const r = renderBlock('development');
    fireEvent.press(r.getByText('查看估算依據'));

    expect(r.getByText('6–9 歲')).toBeTruthy();
    expect(r.getByText('學習與技能')).toBeTruthy();
    expect(r.getByText('20 分鐘')).toBeTruthy();
    expect(r.getByText('一般')).toBeTruthy();
    expect(r.getByText('5–25 枚')).toBeTruthy();

    // 只看真的被畫出來的字 —— 序列化整棵樹會把 style 物件也算進去，
    // 那不是家長看得到的東西。
    const shown = renderedText(r.toJSON()).join('\n');
    for (const forbidden of ['difficultyDelta', 'base_time_min', 'calculationBasis',
      'purposeCategory', 'estimatedMinutes', 'rewardPolicyVersion']) {
      expect(shown).not.toContain(forbidden);
    }
    // 裸 JSON：畫面上不該有 {"…":…} 這種東西。
    expect(shown).not.toMatch(/[{[]\s*"/);
  });

  it('難度沒填時說「未指定」，不會是空白或 undefined', () => {
    const r = renderBlock('development', {
      ...COIN_DECISION,
      coin: {
        ...COIN_DECISION.coin!,
        calculationBasis: { ...COIN_DECISION.coin!.calculationBasis, difficulty: undefined },
      },
    } as TaskRewardDecision);
    fireEvent.press(r.getByText('查看估算依據'));
    expect(r.getByText('未指定')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 11. 回饋文案統一
// ---------------------------------------------------------------------------

describe('回饋方式的名稱', () => {
  it('四種政策各自只有一個名稱', () => {
    expect({
      record_only: REWARD_POLICY_SHORT_LABEL.record_only,
      family_contribution: REWARD_POLICY_SHORT_LABEL.family_contribution,
      progress_only: REWARD_POLICY_SHORT_LABEL.progress_only,
      coin_eligible: REWARD_POLICY_SHORT_LABEL.coin_eligible,
    }).toEqual({
      record_only: '一般紀錄',
      family_contribution: '家庭參與',
      progress_only: '進度與肯定',
      coin_eligible: '成長幣回饋',
    });
  });

  it('「可建議成長幣」不再存在於任何標籤', () => {
    expect(Object.values(REWARD_POLICY_SHORT_LABEL)).not.toContain('可建議成長幣');
  });

  it.each([
    ['record_only', '一般紀錄'],
    ['family_contribution', '家庭參與'],
    ['progress_only', '進度與肯定'],
  ] as const)('%s 的卡片標題與標籤一致', (policy, label) => {
    const r = renderBlock('demo', {
      rewardPolicy: policy,
      eligibility: 'allowed',
      coin: null,
      rewardPolicyVersion: 'reward-eligibility-2026-07',
      explanation: '不發成長幣',
    });
    expect(r.getByText(label)).toBeTruthy();
  });

  it('不發幣的卡片不出現任何幣值數字', () => {
    const r = renderBlock('demo', {
      rewardPolicy: 'family_contribution',
      eligibility: 'allowed',
      coin: null,
      rewardPolicyVersion: 'reward-eligibility-2026-07',
      explanation: '不發成長幣',
    });
    // 「0 枚」看起來像賺到 0，不像「這件事不用幣衡量」。
    expect(renderedText(r.toJSON()).join('\n')).not.toMatch(/\d+\s*枚/);
  });
});

// ---------------------------------------------------------------------------
// 11b. 幣值調整欄位（onCoinOverrideChange）
// ---------------------------------------------------------------------------

describe('幣值調整欄位', () => {
  it('沒有傳 onCoinOverrideChange 時維持唯讀，不出現輸入框或可調整範圍', () => {
    const r = renderBlock('demo');
    expect(r.queryByLabelText('調整成長幣金額')).toBeNull();
    expect(r.queryByText(/可調整範圍/)).toBeNull();
    expect(r.getByText('10')).toBeTruthy();
  });

  it('傳了 onCoinOverrideChange 才出現輸入框與可調整範圍', () => {
    const onChange = jest.fn();
    const r = render(
      <DisplayModeProvider mode="demo">
        <RewardDecisionBlock decision={COIN_DECISION} onCoinOverrideChange={onChange} />
      </DisplayModeProvider>,
    );
    expect(r.getByLabelText('調整成長幣金額')).toBeTruthy();
    expect(r.getByText('可調整範圍 5–25 枚')).toBeTruthy();
  });

  it('在範圍內打字會即時送出新的值', () => {
    const onChange = jest.fn();
    const r = render(
      <DisplayModeProvider mode="demo">
        <RewardDecisionBlock decision={COIN_DECISION} onCoinOverrideChange={onChange} />
      </DisplayModeProvider>,
    );
    fireEvent.changeText(r.getByLabelText('調整成長幣金額'), '15');
    expect(onChange).toHaveBeenCalledWith(15);
  });

  it('打字打到範圍外時先不送出，離開欄位才收斂到上限', () => {
    const onChange = jest.fn();
    const r = render(
      <DisplayModeProvider mode="demo">
        <RewardDecisionBlock decision={COIN_DECISION} onCoinOverrideChange={onChange} />
      </DisplayModeProvider>,
    );
    const input = r.getByLabelText('調整成長幣金額');
    fireEvent.changeText(input, '99');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent(input, 'blur');
    expect(onChange).toHaveBeenCalledWith(25);
  });

  it('清空後離開欄位，會退回目前的 finalAmount，不會送出 0', () => {
    const onChange = jest.fn();
    const r = render(
      <DisplayModeProvider mode="demo">
        <RewardDecisionBlock decision={COIN_DECISION} onCoinOverrideChange={onChange} />
      </DisplayModeProvider>,
    );
    const input = r.getByLabelText('調整成長幣金額');
    fireEvent.changeText(input, '');
    fireEvent(input, 'blur');
    expect(onChange).not.toHaveBeenCalled();
    expect(r.getByLabelText('調整成長幣金額').props.value).toBe('10');
  });

  it('調整過建議值之後才出現「重設為建議值」，按下去會呼叫 onChange(undefined)', () => {
    const onChange = jest.fn();
    const adjusted: TaskRewardDecision = {
      ...COIN_DECISION,
      coin: { ...COIN_DECISION.coin!, finalAmount: 18 },
    };
    const r = render(
      <DisplayModeProvider mode="demo">
        <RewardDecisionBlock decision={COIN_DECISION} onCoinOverrideChange={onChange} />
      </DisplayModeProvider>,
    );
    expect(r.queryByText(/重設為建議值/)).toBeNull();

    r.rerender(
      <DisplayModeProvider mode="demo">
        <RewardDecisionBlock decision={adjusted} onCoinOverrideChange={onChange} />
      </DisplayModeProvider>,
    );
    const resetLink = r.getByText('重設為建議值（10 枚）');
    fireEvent.press(resetLink);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

// ---------------------------------------------------------------------------
// 12. 回顧期間文案
// ---------------------------------------------------------------------------

describe('reviewCycleText', () => {
  it.each([
    [7, '一週後一起回顧'],
    [14, '兩週後一起回顧'],
    [21, '三週後一起回顧'],
    [28, '四週後一起回顧'],
  ])('%s 天講週', (days, expected) => {
    expect(reviewCycleText(days)).toBe(expected);
  });

  it('不整週就照天數講 —— 不是全部硬寫成四週', () => {
    expect(reviewCycleText(10)).toBe('10 天後一起回顧');
    expect(reviewCycleText(1)).toBe('1 天後一起回顧');
    expect(reviewCycleText(30)).toBe('30 天後一起回顧');
  });

  it('不再出現「一起看看」', () => {
    for (const days of [7, 10, 14, 28, 30]) {
      expect(reviewCycleText(days)).not.toContain('看看');
    }
  });
});
