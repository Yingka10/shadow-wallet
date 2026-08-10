// Shadow Wallet — 孩子提案的文案（P0-2）
//
// ─────────────────────────────────────────────────────────────────────────
// 抽成一個模組不是為了 i18n（這個 App 只有中文），是因為**文案本身有規則**，
// 而規則需要被測試釘住：
//
//   · 成功頁不可以出現「審核 / 批准 / 待核准 / 等待家長同意」。
//     孩子把想法說出來，不是遞一張申請單。這條規則一旦鬆掉，
//     整個產品主張就變成了「小孩要先申請」。
//   · 畫面上不可以出現工程名詞（schedule_mode / cadence / duration_type…）。
//   · 不出現 A/B/C/D 分類、difficulty、policy、AI。
//
// 散在 JSX 裡的話，這三條只能靠 code review 記得。放在這裡就測得到。
// ─────────────────────────────────────────────────────────────────────────

import type { CadenceKind, SeenAsChoice } from './types';

export const PROPOSAL_COPY = {
  /** 孩子端首頁的入口。刻意不叫「新增任務」—— 那是家長的語言。 */
  entry: '我想試試看',
  entryHint: '有想做的事，先說給 GrowBook 聽',

  /**
   * 流程本身的名字，頁首用。
   *
   * 四個問題和摘要都掛在同一個名字底下 —— 頁首不跟著每一頁換字，
   * 孩子才知道自己還在同一件事情裡面，而不是被丟到五個不同的地方。
   */
  flowTitle: '開始新挑戰',

  goal: {
    question: '你想試試看什麼？',
    hint: '用你自己的話說就好',
    placeholder: '例如：我想兩週把這本書讀完',
    empty: '先寫下你想做的事，我們才記得住喔',
  },

  motivation: {
    question: '你為什麼想做這件事？',
    hint: '可以寫，也可以先跳過',
    placeholder: '例如：因為同學說這本書很好看',
    skip: '先跳過',
  },

  cadence: {
    question: '你想怎麼開始？',
    hint: '先選一個最適合你的開始方式',
    weeklyTimesSuffix: '次',
    weeklyTimesHint: '這週想做幾次呢？',
    daysHint: '想在哪幾天做呢？',
    /** 選完之後的安心話 —— 讓孩子知道現在選的不是不能反悔的決定。 */
    changeable: '之後都還可以再調整。',
  },

  seenAs: {
    // 「怎麼被看見」太抽象，孩子讀起來像考題。
    // 換成「怎麼陪你」—— 同一件事，但講的是關係，不是評分。
    question: '你希望 GrowBook 怎麼陪你？',
    hint: '選一個你現在最想要的方式',
    /** ⚠️ 單選＝現在最想要的陪伴方式，不是關掉其他功能。 */
    skip: '先跳過',
  },

  review: {
    question: '一起看看',
    hint: '這就是你剛剛整理出的新挑戰',
    goalLabel: '我想試試看',
    motivationLabel: '為什麼',
    cadenceLabel: '我想怎麼開始',
    seenAsLabel: '我希望 GrowBook',
    empty: '還沒說',
    submit: '送出這個想法',
    submitting: '送出中…',
    /**
     * 送出**之前**就先把話講清楚：記下來 ≠ 要等誰批准。
     * 成功頁再講一次是確認；這裡講是承諾 —— 孩子按下去之前就該知道會發生什麼。
     */
    note: '想法記下來後，你就可以先開始試試看。\n爸媽之後也可以一起確認更適合的節奏和回饋。',
  },

  nav: {
    prev: '上一步',
    next: '下一步',
  },

  /**
   * 成功頁。
   *
   * 「你可以先開始試試看」是這一段的重點，不是客套話 ——
   * 孩子的自主行為不需要等誰批准。家長之後確認的是節奏與回饋，
   * 不是「准不准他做」。
   */
  success: {
    title: '想法記下來了！',
    body: '你可以先開始試試看。\n爸媽之後可以一起確認適合的節奏和回饋。',
    done: '回首頁',
  },

  error: {
    title: '沒有送出去',
    /** 建立就失敗 —— 什麼都沒存到。 */
    create: '剛剛沒有記下來，再試一次好嗎？',
    /** 建立成功但送出失敗 —— 內容在，只是還沒送出去。 */
    transition: '你的想法有記下來，但還沒送出去。再按一次送出就好。',
    retry: '再試一次',
    back: '回上一步',
  },
} as const;

/**
 * 節奏選項的孩子語言。value 是 UI 的 kind，不是 DB 的 mode。
 *
 * 只有 label，沒有補充說明 —— 四個選項本來就一句話講得完，
 * 每個再加一行小字只會讓這一頁看起來像要讀完才能選。
 */
export const CADENCE_OPTIONS: readonly {
  kind: CadenceKind;
  label: string;
}[] = [
  { kind: 'weekly_times', label: '一週做幾次' },
  { kind: 'certain_days', label: '想在哪幾天做' },
  { kind: 'just_once', label: '今天先試一次' },
  { kind: 'not_sure', label: '我還不知道' },
] as const;

/** 「希望 GrowBook 怎麼陪你」的選項。三個都不含任何數字 —— 孩子不決定幣值。 */
export const SEEN_AS_OPTIONS: readonly {
  value: Exclude<SeenAsChoice, 'not_specified'>;
  label: string;
}[] = [
  { value: 'just_record', label: '幫我記下我有做到' },
  { value: 'see_progress', label: '讓我看到自己的進度' },
  // 「如果適合」不是包裝 —— 發不發幣由家庭一起決定，這裡只收孩子的希望。
  { value: 'hopes_for_coin', label: '如果適合，也可以用成長幣鼓勵我' },
] as const;

/** 星期標籤。索引 = 0(日) … 6(六)，與 toCadenceInput 的編碼一致。 */
export const DAY_LABELS: readonly string[] = ['日', '一', '二', '三', '四', '五', '六'] as const;

/** 摘要頁用的一句話。純展示，不參與任何映射。 */
export function describeCadence(
  kind: CadenceKind,
  detail: { timesPerWeek?: number; days?: number[] } = {},
): string {
  switch (kind) {
    case 'weekly_times':
      return `一週 ${detail.timesPerWeek ?? 0} 次`;
    case 'certain_days': {
      const days = detail.days ?? [];
      if (days.length === 0) return '還沒選日子';
      return `每週${days.map((d) => DAY_LABELS[d]).join('、')}`;
    }
    case 'just_once':
      return '一次就好';
    case 'not_sure':
      return '想跟爸媽一起討論';
  }
}

export function describeSeenAs(value: SeenAsChoice): string {
  if (value === 'not_specified') return '還沒決定';
  return SEEN_AS_OPTIONS.find((o) => o.value === value)?.label ?? '還沒決定';
}
