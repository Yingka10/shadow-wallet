import { splitSummaryParagraphs } from '../ParentWeeklyTablet';

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

  it('單一換行（不是空行）不會被當成段落分隔——三段式規則要求的是空行分段', () => {
    const text = '第一行\n第二行（同一段內的換行，不應該被拆開）';
    expect(splitSummaryParagraphs(text)).toEqual([text]);
  });
});
