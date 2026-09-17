import React from 'react';
import { renderWithBoldCategoryLabels, splitSummaryParagraphs } from '../ParentWeeklyTablet';

// 「本週整理」畫面把同一段 AI/fallback 文字拆成 headline／evidence／focus 三層
// 顯示（見 GrowBook｜Weekly Report UI Polish §10）——這裡只測「拆」這個純函式，
// 不重新生成文字、不改 prompt 產生的內容本身。

describe('splitSummaryParagraphs', () => {
  it('三段式文字（總覽／穩定線依據／focus 診斷+下一步）拆成三個獨立段落', () => {
    const text = '這週有一條線特別值得一起看看：學習與技能。\n\n生活與自我管理都有持續完成紀錄，目前沒有明顯需要調整的訊號。\n\n學習與技能這週沒有完全跟上原本安排，其中有一次是在提醒後才開始的。';
    const result = splitSummaryParagraphs(text);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('這週有一條線特別值得一起看看：學習與技能。');
    expect(result[2]).toContain('沒有完全跟上原本安排');
  });

  it('全部 stable 時只有一句話，不硬湊出第二三段', () => {
    const text = '這週各面向大致維持原本節奏，目前沒有特別需要調整的地方。';
    expect(splitSummaryParagraphs(text)).toEqual([text]);
  });

  it('PENDING_INSIGHT（AI 尚未生成）這種單行文字一樣只回傳一段，不會拋錯', () => {
    const text = '本週 AI 洞察正在生成中，通常在週日深夜完成。可點擊右上角重新整理。';
    expect(splitSummaryParagraphs(text)).toEqual([text]);
  });

  it('空字串回傳空陣列，呼叫端不會顯示空白 headline', () => {
    expect(splitSummaryParagraphs('')).toEqual([]);
  });

  it('段落之間多個換行、前後有空白時仍正確裁切乾淨', () => {
    const text = '  headline 段  \n\n\n   evidence 段   \n\n focus 段  ';
    expect(splitSummaryParagraphs(text)).toEqual(['headline 段', 'evidence 段', 'focus 段']);
  });

  it('單一換行也會被當成段落分隔——實測 Gemini 有時只用單一 \\n 分三段，不能只認雙換行', () => {
    const text = '第一段\n第二段\n第三段';
    expect(splitSummaryParagraphs(text)).toEqual(['第一段', '第二段', '第三段']);
  });

  it('真實案例：Gemini 這次用單一換行分隔三段，仍要正確拆成三段而不是整段擠進 headline', () => {
    const text = '這週多數線都穩，學習與技能這條線這週比較需要花時間聊聊。\n生活與自我管理、家庭參與與關係這兩條這週都有持續完成紀錄，目前沒有明顯需要調整的訊號。\n學習與技能這條線這週沒有完全跟上原本安排，其中有幾次是在提醒後才開始的；這一條這週比較值得找時間跟孩子聊聊，看看提醒的時機或方式要不要調整。';
    const result = splitSummaryParagraphs(text);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('這週多數線都穩，學習與技能這條線這週比較需要花時間聊聊。');
  });
});

type BoldTextElement = React.ReactElement<{ children: string; style: object }>;

describe('renderWithBoldCategoryLabels', () => {
  const boldStyle = { fontWeight: 'bold' };

  it('把文字裡出現的成長線名稱換成粗體 Text，其餘文字原樣保留', () => {
    const result = renderWithBoldCategoryLabels(
      '生活與自我管理、家庭參與與關係這兩條這週都有持續完成紀錄。',
      ['生活與自我管理', '家庭參與與關係'],
      boldStyle,
    );
    expect(Array.isArray(result)).toBe(true);
    const arr = result as React.ReactNode[];
    // 依序應該是：粗體「生活與自我管理」、純文字「、」、粗體「家庭參與與關係」、剩餘文字
    expect(React.isValidElement(arr[0])).toBe(true);
    expect((arr[0] as BoldTextElement).props.children).toBe('生活與自我管理');
    expect((arr[0] as BoldTextElement).props.style).toBe(boldStyle);
    expect(arr[1]).toBe('、');
    expect(React.isValidElement(arr[2])).toBe(true);
    expect((arr[2] as BoldTextElement).props.children).toBe('家庭參與與關係');
  });

  it('沒有任何 label 對到文字時，回傳只有原字串這一個元素的陣列（不硬套粗體）', () => {
    const result = renderWithBoldCategoryLabels('這週各方面大致穩定。', ['學習與技能'], boldStyle);
    expect(result).toEqual(['這週各方面大致穩定。']);
  });

  it('labels 是空陣列時直接回傳原字串', () => {
    expect(renderWithBoldCategoryLabels('任何文字', [], boldStyle)).toBe('任何文字');
  });

  it('同一個 label 重複出現在同一句時，每次出現都標成粗體', () => {
    const result = renderWithBoldCategoryLabels(
      '學習與技能這條線值得看，學習與技能的次數比較少。',
      ['學習與技能'],
      boldStyle,
    ) as React.ReactNode[];
    const boldOccurrences = result.filter(
      part => React.isValidElement(part) && (part as BoldTextElement).props.children === '學習與技能',
    );
    expect(boldOccurrences).toHaveLength(2);
  });
});
