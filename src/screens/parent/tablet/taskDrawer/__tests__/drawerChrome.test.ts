// 抽屜外框的純計算：寬度與遮罩 breakpoint。

import { ParentColors } from '../../../../../constants/parentTheme';
import {
  COMPACT_SCRIM_MAX_WIDTH,
  escapeActionFor,
  panelWidthFor,
  scrimColorFor,
  usesCompactScrim,
} from '../drawerChrome';
import { RECOMMENDED_LIMIT, selectPresetFamilies } from '../taskCatalog';

describe('抽屜寬度', () => {
  it('768 與 1024 都是 480，1366 放大到 520', () => {
    expect(panelWidthFor(768)).toBe(480);
    expect(panelWidthFor(1024)).toBe(480);
    expect(panelWidthFor(1366)).toBe(520);
  });

  it('viewport 極窄時退讓，但保留邊界且不小於 300', () => {
    expect(panelWidthFor(420)).toBe(420 - 24);
    expect(panelWidthFor(300)).toBe(300);
  });
});

describe('遮罩濃度 breakpoint', () => {
  it('900 以下用較深的 compact scrim', () => {
    expect(usesCompactScrim(768)).toBe(true);
    expect(usesCompactScrim(899)).toBe(true);
    expect(scrimColorFor(768)).toBe(ParentColors.scrimCompact);
  });

  it('900 以上維持原本較輕的遮罩', () => {
    expect(usesCompactScrim(COMPACT_SCRIM_MAX_WIDTH)).toBe(false);
    expect(usesCompactScrim(1024)).toBe(false);
    expect(usesCompactScrim(1366)).toBe(false);
    expect(scrimColorFor(1366)).toBe(ParentColors.scrim);
  });

  it('兩種遮罩都走 token，compact 比較深', () => {
    expect(ParentColors.scrimCompact).not.toBe(ParentColors.scrim);
  });
});

describe('Escape 的優先順序', () => {
  it('確認框開著時，Escape 只關確認，不放棄草稿', () => {
    expect(escapeActionFor(true)).toBe('dismissConfirmation');
  });

  it('沒有確認框時，Escape 才關抽屜', () => {
    expect(escapeActionFor(false)).toBe('closeDrawer');
  });
});

describe('推薦視圖上限', () => {
  it('未搜尋時只給五個家族，且就是規格指定的那五個', () => {
    const hits = selectPresetFamilies(8, 'recommended', '');
    expect(hits).toHaveLength(RECOMMENDED_LIMIT);
    expect(hits.map(f => f.title)).toEqual([
      '閱讀與共讀',
      '運動與身體技能',
      '創作與製作',
      '用餐前準備餐桌',
      '探索一個好奇主題',
    ]);
  });

  it('搜尋時不套用五張上限', () => {
    // 「整理」命中的家族超過五個，截斷會讓搜尋看起來像壞掉。
    const hits = selectPresetFamilies(8, 'recommended', '整理');
    expect(hits.length).toBeGreaterThan(RECOMMENDED_LIMIT);
  });

  it('切到分類時也不套用上限', () => {
    const hits = selectPresetFamilies(8, 'family_participation', '');
    expect(hits.length).toBeGreaterThan(RECOMMENDED_LIMIT);
  });
});
