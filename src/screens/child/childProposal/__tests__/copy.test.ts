// P0-2 — 孩子看到的文案有規則
//
// 這一支測的是**字串**，看起來不像測試該做的事。做的理由是：
// 這個流程唯一會毀掉產品主張的方式，是有人把成功頁改成
// 「已送出，等待家長審核」。那不是 bug，是一句話 ——
// 而一句話沒有任何其他測試抓得到。

import {
  CADENCE_OPTIONS,
  DAY_LABELS,
  PROPOSAL_COPY,
  SEEN_AS_OPTIONS,
  describeCadence,
  describeSeenAs,
} from '../copy';

/** 把整包文案攤平成一個字串，方便做「不可以出現」的斷言。 */
function allCopy(): string {
  return JSON.stringify([PROPOSAL_COPY, CADENCE_OPTIONS, SEEN_AS_OPTIONS]);
}

describe('成功頁不是一張申請單', () => {
  const success = JSON.stringify(PROPOSAL_COPY.success);

  it.each(['審核', '批准', '核准', '通過後', '等待家長', '待確認', '申請'])(
    '成功頁不出現「%s」',
    (word) => {
      expect(success).not.toContain(word);
    },
  );

  it('明確告訴孩子可以先開始', () => {
    expect(PROPOSAL_COPY.success.body).toContain('先開始試試看');
  });

  it('說清楚家長之後確認的是節奏和回饋，不是准不准', () => {
    expect(PROPOSAL_COPY.success.body).toContain('節奏');
    expect(PROPOSAL_COPY.success.body).toContain('回饋');
    // 「不能開始」的意思一個字都不可以有。
    expect(PROPOSAL_COPY.success.body).not.toContain('才能');
    expect(PROPOSAL_COPY.success.body).not.toContain('不能');
  });

  it('標題就是產品定調的那一句', () => {
    expect(PROPOSAL_COPY.success.title).toBe('想法記下來了！');
  });
});

describe('孩子看不到工程名詞', () => {
  it.each([
    'schedule_mode',
    'duration_type',
    'recurrence_days',
    'estimated_minutes',
    'weekly_frequency',
    'cadence_mode',
    'reward_policy',
    'child_reward_preference',
    'proposal',
    'draft',
    'status',
  ])('文案不出現 %s', (term) => {
    expect(allCopy()).not.toContain(term);
  });

  it('不出現 A/B/C/D 分類、難度、政策、AI', () => {
    const copy = allCopy();
    for (const term of ['難度', '分類', '政策', 'AI', 'difficulty', 'category', 'policy']) {
      expect({ term, present: copy.includes(term) }).toEqual({ term, present: false });
    }
  });

  it('不出現任何幣值數字 —— 孩子不決定發幾個幣', () => {
    // 「成長幣」可以出現（那是產品詞彙），但不可以帶數字。
    expect(allCopy()).not.toMatch(/\d+\s*(個|枚)?\s*成長幣/);
  });
});

describe('入口的說法是孩子的語言', () => {
  it('不叫「新增任務」—— 那是家長的語言', () => {
    expect(PROPOSAL_COPY.entry).toBe('我想試試看');
    expect(PROPOSAL_COPY.entry).not.toContain('任務');
  });
});

describe('選項', () => {
  it('四個節奏選項齊全，而且順序是規格說的那個', () => {
    expect(CADENCE_OPTIONS.map((o) => o.kind)).toEqual([
      'weekly_times',
      'certain_days',
      'just_once',
      'not_sure',
    ]);
  });

  it('「我還不知道」是一個正當選項，不是沒填', () => {
    const notSure = CADENCE_OPTIONS.find((o) => o.kind === 'not_sure');
    expect(notSure?.label).toContain('還不知道');
    expect(notSure?.hint).toContain('一起討論');
  });

  it('三個「怎麼被看見」的選項，都不含數字', () => {
    expect(SEEN_AS_OPTIONS.map((o) => o.value)).toEqual([
      'just_record',
      'see_progress',
      'hopes_for_coin',
    ]);
    for (const opt of SEEN_AS_OPTIONS) {
      expect(opt.label).not.toMatch(/\d/);
    }
  });

  it('成長幣那個選項講清楚「如果適合」', () => {
    const coin = SEEN_AS_OPTIONS.find((o) => o.value === 'hopes_for_coin');
    expect(coin?.label).toContain('如果適合');
  });

  it('星期標籤從週日開始，對齊 0–6 的編碼', () => {
    expect(DAY_LABELS).toEqual(['日', '一', '二', '三', '四', '五', '六']);
  });
});

describe('摘要頁的一句話', () => {
  it('一週幾次', () => {
    expect(describeCadence('weekly_times', { timesPerWeek: 4 })).toBe('一週 4 次');
  });

  it('固定哪幾天', () => {
    expect(describeCadence('certain_days', { days: [2, 4] })).toBe('每週二、四');
  });

  it('還沒選日子時說得出來', () => {
    expect(describeCadence('certain_days', { days: [] })).toBe('還沒選日子');
  });

  it('一次就好 / 還不知道', () => {
    expect(describeCadence('just_once')).toBe('一次就好');
    expect(describeCadence('not_sure')).toBe('想跟爸媽一起討論');
  });

  it('怎麼被看見', () => {
    expect(describeSeenAs('hopes_for_coin')).toBe('如果適合，我希望有成長幣');
    expect(describeSeenAs('not_specified')).toBe('還沒決定');
  });
});
