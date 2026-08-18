// CHILD-REVIEW-V2 — 「一起回顧」的畫面。
//
// §17 的四個 acceptance state 是這一支的骨架：
//   A  本週 2/3 → 有時候不太好開始 → 想讓它輕鬆一點
//   B  一週少一次 → 每週 3 次 → 每週 2 次，且明確說要共同確認
//   C  中途離開 → 不動任何共同約定
//   D  送出之後 → 說的是「還沒生效」，不是「已更新」

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { GoalPresentation } from '../../../screens/child/longTermGoalPresentation';
import {
  REVIEW_DIRECTION_OPTIONS,
  REVIEW_EXPERIENCE_OPTIONS,
} from '../togetherReviewModel';
import TogetherReviewSheet, {
  type ReviewCadenceChannel,
  type ReviewTimeChannel,
} from '../TogetherReviewSheet';

function makePresentation(
  overrides: Partial<GoalPresentation> = {},
): GoalPresentation {
  return {
    headerTitle: '兩週閱讀挑戰',
    progression: 'rhythm',
    weekTarget: 3,
    weekCompletedActual: 2,
    sessionMinutes: 15,
    sessionEvidence: { checkedInToday: false, weekSessionCount: 2 },
    agreedTime: { value: 'after_dinner', label: '晚餐後' },
    supportsTimeWindow: true,
    ...overrides,
  } as unknown as GoalPresentation;
}

function makeCadenceChannel(
  overrides: Partial<ReviewCadenceChannel> = {},
): ReviewCadenceChannel {
  return {
    pending: false,
    submitting: false,
    error: null,
    submitted: false,
    onSubmit: jest.fn(async () => true),
    ...overrides,
  };
}

function makeTimeChannel(
  overrides: Partial<ReviewTimeChannel> = {},
): ReviewTimeChannel {
  return {
    pending: false,
    submitting: false,
    error: null,
    submitted: false,
    onSubmit: jest.fn(async () => true),
    ...overrides,
  };
}

/**
 * 只收畫面上真的看得到的字。**不要**直接對 toJSON() 的字串做斷言 ——
 * 那裡面有 style（例如 flexBasis: '46%'），會讓「畫面上沒有百分比」這種
 * 檢查假性失敗。
 */
function visibleText(node: unknown): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(visibleText).join(' ');
  if (node && typeof node === 'object' && 'children' in node) {
    return visibleText((node as { children: unknown }).children);
  }
  return '';
}

function renderSheet(
  overrides: Partial<React.ComponentProps<typeof TogetherReviewSheet>> = {},
) {
  const props: React.ComponentProps<typeof TogetherReviewSheet> = {
    presentation: makePresentation(),
    onClose: jest.fn(),
    ...overrides,
  };
  return { ...render(<TogetherReviewSheet {...props} />), props };
}

/** State A 的前兩步，之後每個 branch 測試都從這裡出發。 */
function walkToDirection(label: string) {
  fireEvent.press(screen.getByRole('button', { name: '有時候不太好開始' }));
  fireEvent.press(screen.getByRole('button', { name: label }));
}

describe('State A — 開場與兩個 step', () => {
  it('一開啟先給 evidence，不是第一秒就問問題', () => {
    renderSheet();

    expect(screen.getByText('一起回顧')).toBeTruthy();
    expect(screen.getByText('這週已經完成 2 次，一起看看這段怎麼樣。')).toBeTruthy();
    expect(screen.getByText('原本約定每週 3 次')).toBeTruthy();
  });

  it('evidence 不出現達成率、百分比、紅字失敗語', () => {
    const rendered = renderSheet();

    expect(visibleText(rendered.toJSON()))
      .not.toMatch(/%|達成率|還差|你沒有完成|加油/);
  });

  it('Step 2 要等 Step 1 選完才出現', () => {
    renderSheet();

    expect(screen.getByText('這段做起來，哪個最像你？')).toBeTruthy();
    expect(screen.queryByText('下一段，你想怎麼走？')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: '有時候不太好開始' }));
    expect(screen.getByText('下一段，你想怎麼走？')).toBeTruthy();
  });

  it('Step 1 未選、或 Step 2 未選時都不出現 CTA（§13）', () => {
    renderSheet();
    expect(screen.queryByTestId('review-cta')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: '有時候不太好開始' }));
    expect(screen.queryByTestId('review-cta')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: '想讓它輕鬆一點' }));
    expect(screen.getByTestId('review-cta')).toBeTruthy();
  });

  it('一次只有一個選項是選中的', () => {
    renderSheet();

    fireEvent.press(screen.getByRole('button', { name: '有時候不太好開始' }));
    expect(screen.getByTestId('review-experience-hard_to_start')
      .props.accessibilityState.selected).toBe(true);

    fireEvent.press(screen.getByRole('button', { name: '現在這樣滿順的' }));
    expect(screen.getByTestId('review-experience-hard_to_start')
      .props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId('review-experience-going_well')
      .props.accessibilityState.selected).toBe(true);
  });

  it('CTA 的字跟著 Step 2 的方向換', () => {
    renderSheet({ cadenceChannel: makeCadenceChannel() });

    walkToDirection('想讓它輕鬆一點');
    expect(screen.getByTestId('review-cta').props.accessibilityLabel)
      .toBe('看看可以怎麼調整');

    fireEvent.press(screen.getByRole('button', { name: '就照現在這樣' }));
    expect(screen.getByTestId('review-cta').props.accessibilityLabel)
      .toBe('繼續這樣走');

    fireEvent.press(screen.getByRole('button', { name: '我自己有想法' }));
    expect(screen.getByTestId('review-cta').props.accessibilityLabel)
      .toBe('說說我的想法');
  });

  it('一進來就沒有「和家人一起調整」那條 strip（§12）', () => {
    renderSheet({ cadenceChannel: makeCadenceChannel() });

    expect(screen.queryByTestId('review-shared-term-strip')).toBeNull();
    walkToDirection('想讓它輕鬆一點');
    expect(screen.queryByTestId('review-shared-term-strip')).toBeNull();
  });
});

describe('State B — 一週少一次 → 需要共同確認', () => {
  it('選了「一週少一次」才出現共同確認提示', () => {
    renderSheet({ cadenceChannel: makeCadenceChannel() });

    walkToDirection('想讓它輕鬆一點');
    fireEvent.press(screen.getByTestId('review-cta'));

    expect(screen.queryByTestId('review-shared-term-strip')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: '一週少一次' }));
    expect(screen.getByText('這會改到你們原本說好的安排。')).toBeTruthy();
  });

  it('差異顯示的是約定的 3 次 → 2 次，不是這週實際的 2 次', () => {
    renderSheet({ cadenceChannel: makeCadenceChannel() });

    walkToDirection('想讓它輕鬆一點');
    fireEvent.press(screen.getByTestId('review-cta'));
    fireEvent.press(screen.getByRole('button', { name: '一週少一次' }));
    fireEvent.press(screen.getByTestId('review-cta'));

    expect(screen.getByText('每週 3 次')).toBeTruthy();
    expect(screen.getByText('每週 2 次')).toBeTruthy();
    expect(screen.getByText('這會改到你們原本說好的安排。')).toBeTruthy();
  });

  it('送出的是孩子選的 2 次', () => {
    const cadenceChannel = makeCadenceChannel();
    renderSheet({ cadenceChannel });

    walkToDirection('想讓它輕鬆一點');
    fireEvent.press(screen.getByTestId('review-cta'));
    fireEvent.press(screen.getByRole('button', { name: '一週少一次' }));
    fireEvent.press(screen.getByTestId('review-cta'));
    fireEvent.press(screen.getByTestId('review-cta'));

    expect(cadenceChannel.onSubmit).toHaveBeenCalledWith(2);
  });

  it('已經有一筆等家長確認的請求時不給第二次送出的入口', () => {
    const cadenceChannel = makeCadenceChannel({ pending: true });
    renderSheet({ cadenceChannel });

    walkToDirection('想讓它輕鬆一點');
    fireEvent.press(screen.getByTestId('review-cta'));
    fireEvent.press(screen.getByRole('button', { name: '一週少一次' }));
    fireEvent.press(screen.getByTestId('review-cta'));

    expect(screen.getByText('已送給爸媽，等一起確認。')).toBeTruthy();
    fireEvent.press(screen.getByTestId('review-cta'));
    expect(cadenceChannel.onSubmit).not.toHaveBeenCalled();
  });

  it('送出中按鈕進 busy，不會送第二次', () => {
    const cadenceChannel = makeCadenceChannel({ submitting: true });
    renderSheet({ cadenceChannel });

    walkToDirection('想讓它輕鬆一點');
    fireEvent.press(screen.getByTestId('review-cta'));
    fireEvent.press(screen.getByRole('button', { name: '一週少一次' }));
    fireEvent.press(screen.getByTestId('review-cta'));

    const cta = screen.getByTestId('review-cta');
    expect(cta.props.accessibilityState.busy).toBe(true);
    fireEvent.press(cta);
    expect(cadenceChannel.onSubmit).not.toHaveBeenCalled();
  });

  it('送出失敗時保留孩子的選擇，並用可以再試的語氣說明', () => {
    renderSheet({
      cadenceChannel: makeCadenceChannel({ error: '計畫剛剛更新過了' }),
    });

    walkToDirection('想讓它輕鬆一點');
    fireEvent.press(screen.getByTestId('review-cta'));
    fireEvent.press(screen.getByRole('button', { name: '一週少一次' }));
    fireEvent.press(screen.getByTestId('review-cta'));

    expect(screen.getByText('計畫剛剛更新過了')).toBeTruthy();
    expect(screen.getByText('每週 2 次')).toBeTruthy();
  });

  it('沒有共同計畫時連「一週少一次」都不會出現，也送不出任何東西', () => {
    renderSheet();

    walkToDirection('想讓它輕鬆一點');
    fireEvent.press(screen.getByTestId('review-cta'));

    expect(screen.queryByRole('button', { name: '一週少一次' })).toBeNull();
    expect(screen.getByText('這份計畫的安排要和爸媽一起看才能改。')).toBeTruthy();
  });

  it('每週只有 1 次的計畫不給「少一次」—— 那是暫停不是調整', () => {
    renderSheet({
      presentation: makePresentation({ weekTarget: 1 }),
      cadenceChannel: makeCadenceChannel(),
    });

    walkToDirection('想讓它輕鬆一點');
    fireEvent.press(screen.getByTestId('review-cta'));

    expect(screen.queryByRole('button', { name: '一週少一次' })).toBeNull();
  });
});

describe('State C — 走完或離開都不動任何共同約定', () => {
  it('「就照現在這樣」只給一句確認，不再問任何設定', () => {
    const cadenceChannel = makeCadenceChannel();
    const timeChannel = makeTimeChannel();
    const onClose = jest.fn();
    renderSheet({ cadenceChannel, timeChannel, onClose });

    walkToDirection('就照現在這樣');
    fireEvent.press(screen.getByTestId('review-cta'));

    expect(screen.getByText('好，那下一段先照現在的方式。')).toBeTruthy();
    expect(screen.getByTestId('review-cta').props.accessibilityLabel)
      .toBe('繼續這樣走');

    fireEvent.press(screen.getByTestId('review-cta'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(cadenceChannel.onSubmit).not.toHaveBeenCalled();
    expect(timeChannel.onSubmit).not.toHaveBeenCalled();
  });

  it('選到維度但沒按到最後一步就離開，不會送出任何東西', () => {
    const cadenceChannel = makeCadenceChannel();
    renderSheet({ cadenceChannel });

    walkToDirection('想讓它輕鬆一點');
    fireEvent.press(screen.getByTestId('review-cta'));
    fireEvent.press(screen.getByRole('button', { name: '一週少一次' }));

    expect(cadenceChannel.onSubmit).not.toHaveBeenCalled();
  });

  it('換了方向就清掉先前選的維度', () => {
    const cadenceChannel = makeCadenceChannel();
    renderSheet({ cadenceChannel });

    walkToDirection('想讓它輕鬆一點');
    fireEvent.press(screen.getByTestId('review-cta'));
    fireEvent.press(screen.getByRole('button', { name: '一週少一次' }));
    expect(screen.getByTestId('review-dimension-fewer_per_week')
      .props.accessibilityState.selected).toBe(true);

    fireEvent.press(screen.getByRole('button', { name: '一週少一次' }));
    expect(screen.getByTestId('review-cta')).toBeTruthy();
  });

  it('自由想法那一頁不宣稱已經記下來了', () => {
    renderSheet();

    walkToDirection('我自己有想法');
    fireEvent.press(screen.getByTestId('review-cta'));

    expect(screen.getByText('這個想法還沒送出，可以直接和爸媽說說看。')).toBeTruthy();
  });
});

describe('State D — 送出之後說的是「還沒生效」', () => {
  it('cadence 送出成功後不宣稱計畫已更新', () => {
    renderSheet({ cadenceChannel: makeCadenceChannel({ submitted: true }) });

    expect(screen.getByText('已經告訴爸媽了。一起確認後，計畫才會更新。')).toBeTruthy();
  });

  it('換時段送出成功後同樣是「還沒生效」', () => {
    renderSheet({ timeChannel: makeTimeChannel({ submitted: true }) });

    expect(screen.getByText('已經告訴爸媽了。一起確認後，計畫才會更新。')).toBeTruthy();
  });
});

describe('Branch C — 換一種做法沿用既有的換時段通道（P0-8M）', () => {
  it('候選是另一個時段，不含目前已經在用的那個', () => {
    renderSheet({ timeChannel: makeTimeChannel() });

    walkToDirection('想換一種做法');
    fireEvent.press(screen.getByTestId('review-cta'));

    expect(screen.getByRole('button', { name: '改成睡前試試' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '改成晚餐後試試' })).toBeNull();
  });

  it('換時段也要共同確認，送出的是孩子選的那個時段', () => {
    const timeChannel = makeTimeChannel();
    renderSheet({ timeChannel });

    walkToDirection('想換一種做法');
    fireEvent.press(screen.getByTestId('review-cta'));
    fireEvent.press(screen.getByRole('button', { name: '改成睡前試試' }));
    // 換時段用的是比較窄的說法（§7），不是 cadence 那句共同條件宣告。
    expect(screen.getByText('這個時段是當初一起說好的，改之前先一起確認。'))
      .toBeTruthy();
    expect(screen.queryByText('這會改到你們原本說好的安排。')).toBeNull();

    fireEvent.press(screen.getByTestId('review-cta'));
    expect(screen.getByText('晚餐後')).toBeTruthy();
    expect(screen.getByText('睡前')).toBeTruthy();

    fireEvent.press(screen.getByTestId('review-cta'));
    expect(timeChannel.onSubmit).toHaveBeenCalledWith('before_bed');
  });

  it('沒有換時段通道時，「想換一種做法」直接走自由描述，不給空選單', () => {
    renderSheet();

    walkToDirection('想換一種做法');
    fireEvent.press(screen.getByTestId('review-cta'));

    expect(screen.getByText('想換成什麼做法？')).toBeTruthy();
  });
});

describe('稱謂（§7：不 hardcode 媽媽）', () => {
  it('有 canonical 名字就用它', () => {
    renderSheet({
      parentLabel: '媽媽',
      cadenceChannel: makeCadenceChannel(),
    });

    walkToDirection('想讓它輕鬆一點');
    fireEvent.press(screen.getByTestId('review-cta'));
    fireEvent.press(screen.getByRole('button', { name: '一週少一次' }));

    expect(screen.getByTestId('review-cta').props.accessibilityLabel)
      .toBe('和媽媽一起調整 →');
  });

  it('沒有就退回中性的集合稱呼', () => {
    renderSheet({ cadenceChannel: makeCadenceChannel() });

    walkToDirection('想讓它輕鬆一點');
    fireEvent.press(screen.getByTestId('review-cta'));
    fireEvent.press(screen.getByRole('button', { name: '一週少一次' }));

    expect(screen.getByTestId('review-cta').props.accessibilityLabel)
      .toBe('和爸媽一起調整 →');
  });
});

describe('§11：回顧本身不發幣', () => {
  it('整個流程沒有任何幣值、獎勵、加分的字', () => {
    const rendered = renderSheet({ cadenceChannel: makeCadenceChannel() });

    walkToDirection('想讓它輕鬆一點');
    fireEvent.press(screen.getByTestId('review-cta'));
    fireEvent.press(screen.getByRole('button', { name: '一週少一次' }));
    fireEvent.press(screen.getByTestId('review-cta'));

    expect(visibleText(rendered.toJSON()))
      .not.toMatch(/幣|coin|獎勵|\+5|經驗值|XP|徽章/);
  });
});

describe('VISUAL-POLISH — 結構層面的可回歸點', () => {
  it('第一屏就同時看得到 hero、evidence 與完整的 Step 1', () => {
    renderSheet();

    expect(screen.getByTestId('review-hero')).toBeTruthy();
    expect(screen.getByTestId('review-evidence')).toBeTruthy();
    REVIEW_EXPERIENCE_OPTIONS.forEach((option) => {
      expect(screen.getByTestId(`review-experience-${option.value}`)).toBeTruthy();
    });
  });

  it('Step 之間的過場只在 Step 2 出現時才有', () => {
    renderSheet();

    expect(screen.queryByTestId('review-journey-cue')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: '有時候不太好開始' }));
    expect(screen.getByTestId('review-journey-cue')).toBeTruthy();
  });

  it('每個 tile 都有自己的圖示，不是四格共用一個', () => {
    const icons = new Set(REVIEW_EXPERIENCE_OPTIONS.map((o) => o.icon));

    expect(icons.size).toBe(REVIEW_EXPERIENCE_OPTIONS.length);
  });

  it('共同條件是一片行動區：說明、差異、CTA 在同一個面板裡', () => {
    renderSheet({ cadenceChannel: makeCadenceChannel() });

    walkToDirection('想讓它輕鬆一點');
    fireEvent.press(screen.getByTestId('review-cta'));
    fireEvent.press(screen.getByRole('button', { name: '一週少一次' }));
    fireEvent.press(screen.getByTestId('review-cta'));

    const panel = screen.getByTestId('review-shared-term-panel');
    expect(panel).toBeTruthy();
    expect(screen.getByTestId('review-shared-term-diff')).toBeTruthy();
    expect(screen.getByTestId('review-shared-term-strip')).toBeTruthy();
  });

  it('共同條件面板不使用紅色警示色', () => {
    const rendered = renderSheet({ cadenceChannel: makeCadenceChannel() });

    walkToDirection('想讓它輕鬆一點');
    fireEvent.press(screen.getByTestId('review-cta'));
    fireEvent.press(screen.getByRole('button', { name: '一週少一次' }));
    fireEvent.press(screen.getByTestId('review-cta'));

    // Colors.error 只給破壞性動作用。重新商量不是錯誤。
    expect(JSON.stringify(rendered.toJSON())).not.toContain('#C6543A');
  });
});

/** 從渲染樹撈出所有 SVG 的實際寬度（react-native-svg 會寫進 bbWidth）。 */
function svgWidths(node: unknown): number[] {
  if (Array.isArray(node)) return node.flatMap(svgWidths);
  if (!node || typeof node !== 'object') return [];
  const el = node as { props?: Record<string, unknown>; children?: unknown };
  const own = typeof el.props?.bbWidth === 'number' ? [el.props.bbWidth as number] : [];
  return [...own, ...svgWidths(el.children)];
}

function flatStyles(node: unknown): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap(flatStyles);
  if (!node || typeof node !== 'object') return [];
  const el = node as { props?: { style?: unknown }; children?: unknown };
  const style = el.props?.style;
  const own = style && typeof style === 'object' && !Array.isArray(style)
    ? [style as Record<string, unknown>]
    : [];
  return [...own, ...flatStyles(el.children)];
}

describe('ICON-POLISH — tile 圖示與選取徽章', () => {
  it('tile 圖示畫得夠大，不是被壓成小色塊', () => {
    renderSheet();

    const tile = screen.getByTestId('review-experience-going_well');
    expect(Math.max(...svgWidths(tile))).toBeGreaterThanOrEqual(36);
  });

  it('圖示外面沒有那圈圓形底了', () => {
    renderSheet();

    const tile = screen.getByTestId('review-experience-going_well');
    // 舊版是 46×46 / borderRadius 23 的圓底。
    const circles = flatStyles(tile).filter((st) => st.borderRadius === 23);
    expect(circles).toHaveLength(0);
  });

  it('選取徽章縮小並內縮在卡片裡，不咬出邊界', () => {
    renderSheet();

    fireEvent.press(screen.getByRole('button', { name: '有時候不太好開始' }));
    const tile = screen.getByTestId('review-experience-hard_to_start');
    const badge = flatStyles(tile).find((st) => st.position === 'absolute');

    expect(badge).toBeDefined();
    expect(badge?.width).toBeLessThanOrEqual(26);
    expect(badge?.width).toBeGreaterThanOrEqual(24);
    // 正值＝在卡片內側。負值會讓它壓在圓角上。
    expect(Number(badge?.top)).toBeGreaterThan(0);
    expect(Number(badge?.right)).toBeGreaterThan(0);
  });

  it('Step 2 四格也各有自己的圖示', () => {
    const icons = new Set(REVIEW_DIRECTION_OPTIONS.map((o) => o.icon));

    expect(icons.size).toBe(REVIEW_DIRECTION_OPTIONS.length);
  });

  it('Step 1 與 Step 2 共用同一族，沒有跑出家族外的圖示', () => {
    const family = new Set([
      'sprout_steady', 'sprout_emerging', 'sprout_drooping', 'seed_thought',
      'sprout_check', 'sprout_light', 'path_branch', 'pencil_sprout',
    ]);

    [...REVIEW_EXPERIENCE_OPTIONS, ...REVIEW_DIRECTION_OPTIONS].forEach((option) => {
      expect(family.has(option.icon)).toBe(true);
    });
  });
});
