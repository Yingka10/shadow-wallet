// Shadow Wallet · Parent Tablet — mock data
// All placeholder data lives here so screens stay focused on layout.

const TODAY = { md: '5 月 26 日', dow: '週二', iso: '2026-05-26' };

const CATEGORIES = {
  A: { code: 'A', short: '基本自理',  long: '基本生活自理',        duty: true,  fg: '#3F5733', bg: 'var(--t-cat-A-bg)' },
  B: { code: 'B', short: '家庭本分',  long: '家庭本分',            duty: true,  fg: '#2F4861', bg: 'var(--t-cat-B-bg)' },
  C: { code: 'C', short: '貢獻',      long: '超出本分貢獻',        duty: false, fg: '#8A4F1C', bg: 'var(--t-cat-C-bg)' },
  D: { code: 'D', short: '成長',      long: '學習成長里程碑',      duty: false, fg: '#1B3A5C', bg: 'var(--t-cat-D-bg)' },
};

// Two kids (the parent can toggle).
const CHILDREN = [
  {
    id: 'enan',
    name: '小恩',
    age: 8,
    initial: '恩',
    avatarBg: '#1B3A5C',
    coinBalance: 184,
    doneToday: 3,
    totalToday: 5,
    todayBlurb: '今天穩定完成三件，還有倫垃圾、幫妖妖念故事兩件來不及做。',
    news: [
      { tone: 'attention', text: '練鋼琴近 6 天只完成 2 天，建議找時間聊一下。', linkTo: 'growth' },
      { tone: 'normal',    text: '今天主動提了「教妹妹寫名字」，有 1 件待審。' },
      { tone: 'normal',    text: '本週連續第 3 次兌換冰淇淋（合計 90 幣）。' },
    ],
    abandonWarning: {
      label: '需要關注',
      detail: '練鋼琴近 6 天只完成 2 天，可前往成長紀錄查看建議。',
    },
    longTermGoals: [
      {
        id: 'lt1', name: '練鋼琴 30 天計畫',
        type: 'streak', current: 7, total: 30,
        sub: '連續打卡',
        nextMilestone: { name: '第 10 天 · 小達成', daysLeft: 3 },
      },
    ],
    tasks: [
      { id: 't1', name: '整理書包',                cat: 'B', coins: 0,  status: 'done',    time: '07:42' },
      { id: 't2', name: '完成數學作業（第 6 單元）', cat: 'C', coins: 12, status: 'done',    time: '16:15' },
      { id: 't3', name: '練鋼琴 30 分鐘',           cat: 'D', coins: 0,  status: 'done',    time: '17:50',
        longTerm: { type: 'streak', current: 7, total: 30, label: '連續打卡' } },
      { id: 't4', name: '幫妹妹念故事',             cat: 'C', coins: 15, status: 'pending' },
      { id: 't5', name: '倒垃圾',                  cat: 'B', coins: 0,  status: 'pending' },
    ],
    proposals: [
      {
        id: 'pr1',
        name: '教妹妹寫名字',
        submittedAt: '今天 18:04',
        kidNote: '今天教了妹妹寫「米」這個字，她學會了！',
        ai: {
          category: 'C',
          range: [10, 15],
          rationale: '主動協助手足學習，內容超出例行家務，屬於 C 類「超出本分貢獻」。',
          similar: '與「教妹妹刷牙（12 幣）」相近。',
        },
      },
    ],
  },
  {
    id: 'mi',
    name: '小米',
    age: 5,
    initial: '米',
    avatarBg: '#E8934A',
    coinBalance: 62,
    doneToday: 2,
    totalToday: 3,
    todayBlurb: '今早獨立穿好衣服，還有饒小狗一件任務。',
    news: [
      { tone: 'normal', text: '今早獨立穿好衣服，整週 A 類任務全勤。' },
      { tone: 'normal', text: '本週兩次提到「為什麼哥哥比較多錢」。' },
    ],
    abandonWarning: null,
    longTermGoals: [],
    tasks: [
      { id: 'm1', name: '把玩具收進箱子',  cat: 'A', coins: 0, status: 'done',    time: '08:10' },
      { id: 'm2', name: '自己穿好衣服',    cat: 'A', coins: 0, status: 'done',    time: '07:55' },
      { id: 'm3', name: '幫忙餵小狗',      cat: 'B', coins: 0, status: 'pending' },
    ],
    proposals: [],
  },
];

const REJECT_REASONS = [
  '已經包含在原本任務裡',
  '不符合家庭規則',
  '想再和孩子討論',
  '幣值建議不合理',
];

const OVERRIDE_OPTIONS = [
  { id: 'partial',  label: '沒達標準',    sub: '扣部分金幣，給予回饋', tone: 'warn'   },
  { id: 'fail',     label: '根本沒做',    sub: '扣回全部金幣',        tone: 'danger' },
  { id: 'discuss',  label: '重新討論',    sub: '保留紀錄，先暫不結算', tone: 'neutral'},
];

// ── Tab 2 data ────────────────────────────────────────────
const WISH_REJECT_REASONS = [
  '幣值不符合家庭規則',
  '這項獎勵最近換過很多次',
  '想和孩子再討論一下',
  '目前不適合上架',
];
const COOLDOWN_DAYS = 3;

const WISHES = [
  {
    id: 'w1', childId: 'enan',
    name: '寶可夢卡片包',
    submittedAt: '今天 14:32', waitedHours: 6,
    kidNote: '我想要新的寶可夢卡，我已經把舊的都整理好了！',
    ai: { suggested: 80, range: [70, 90], rationale: '參考同年齡家庭均值·80幣屬合理區間' },
  },
  {
    id: 'w2', childId: 'enan',
    name: '週五多 30 分鐘 3C 時間',
    submittedAt: '昨天 19:15', waitedHours: 29,
    kidNote: '這週都有準時把作業寫完，想要多看一點影片。',
    ai: { suggested: 25, range: [20, 30], rationale: '時間性獎勵·本週任務完成率 80%' },
  },
  {
    id: 'w3', childId: 'mi',
    name: '去公園玩 1 小時',
    submittedAt: '今天 11:00', waitedHours: 9,
    kidNote: '我想跟爸爸去公園盪鎘鞦。',
    ai: { suggested: 15, range: [10, 20], rationale: '時間性·低成本獎勵' },
  },
];

const REWARDS = [
  { id: 'r1', name: '冰淇淋一支',          coins: 30,   tint: '#F4D5B8', last: '2 週前調整' },
  { id: 'r2', name: '選一道晚餐主菜',      coins: 40,   tint: '#EEE3C6', last: '3 天前調整' },
  { id: 'r3', name: 'iPad 一小時遊戲時間',  coins: 50,   tint: '#C9D9E5', last: '今天調整' },
  { id: 'r4', name: '樂高小盒組',        coins: 380,  tint: '#D8CFE4', last: '1 週前調整' },
  { id: 'r5', name: 'NIKE 兒童 T 恤',      coins: 220,  tint: '#C9DDD0', last: '1 個月前調整' },
  { id: 'r6', name: '迪士尼樂園一日遊',  coins: 1200, tint: '#E8C5B5', last: '尚未調整', flagshipOnly: true },
];

const HISTORY = [
  { id: 'h1', childId: 'mi',   name: 'iPad 一小時遊戲時間', coins: 50,
    status: 'pending_parent', requestedAt: '今天 12:08',
    aiPrecheck: 'flag', aiNote: 'AI 初審：今天已有 1 小時 3C，建議家長確認' },
  { id: 'h2', childId: 'enan', name: '冰淇淋一支', coins: 30,
    status: 'approved', requestedAt: '今天 16:42',
    aiPrecheck: 'pass', aiNote: 'AI 初審：餘額足夠、近 2 週未連續兑換' },
  { id: 'h3', childId: 'enan', name: '選一道晚餐主菜', coins: 40,
    status: 'rejected', requestedAt: '昨天 18:30',
    aiPrecheck: 'pass', aiNote: '家長拒絕：今晚已決定吃外食' },
  { id: 'h4', childId: 'enan', name: '冰淇淋一支', coins: 30,
    status: 'approved', requestedAt: '2 天前 17:00',
    aiPrecheck: 'pass' },
  { id: 'h5', childId: 'mi',   name: '樂高小盒組', coins: 380,
    status: 'insufficient', requestedAt: '3 天前 09:20',
    aiPrecheck: 'block', aiNote: 'AI 拦下：餘額不足 (62 < 380)，未送出給家長' },
];

// ── Tab 4 (管理) data ─────────────────────────────────────
// Task library: 每位孩子的「任務設定面」，分 ABCD 四類。
// status: 'active' | 'paused'
// source: 'parent' | 'kid'（孩子自提需家長同意，會有 pendingHours 過渡期）
const TASKS_LIBRARY = {
  enan: {
    A: [
      { id: 'la1', name: '早上自己刷牙洗臉', status: 'active', coins: 0 },
      { id: 'la2', name: '睡前自己穿好睡衣', status: 'active', coins: 0 },
      { id: 'la3', name: '整理書包',           status: 'active', coins: 0 },
      { id: 'la4', name: '寫完作業檢查一次',   status: 'paused', coins: 0 },
    ],
    B: [
      { id: 'lb1', name: '倒垃圾',              status: 'active', coins: 0 },
      { id: 'lb2', name: '收乾的碗盤',          status: 'active', coins: 0 },
      { id: 'lb3', name: '晚餐後擦桌子',        status: 'paused', coins: 0 },
    ],
    C: [
      { id: 'lc1', name: '幫妹妹念故事',        status: 'active', coins: 15 },
      { id: 'lc2', name: '幫忙澆花',            status: 'active', coins: 8  },
      { id: 'lc3', name: '教妹妹寫名字',
        status: 'pending', coins: 12, source: 'kid', pendingHours: 18 },
    ],
    D: [
      { id: 'ld1', name: '練鋼琴 30 天計畫',    status: 'active', coins: 0 },
      { id: 'ld2', name: '英文每日 10 分鐘',    status: 'active', coins: 0 },
      { id: 'ld3', name: '游泳期末驗收',        status: 'active', coins: 0 },
      { id: 'ld4', name: '寒假閱讀 12 本',      status: 'paused', coins: 0 },
    ],
  },
  mi: {
    A: [
      { id: 'ma1', name: '把玩具收進箱子',  status: 'active', coins: 0 },
      { id: 'ma2', name: '自己穿好衣服',    status: 'active', coins: 0 },
      { id: 'ma3', name: '飯後自己刷牙',    status: 'active', coins: 0 },
    ],
    B: [
      { id: 'mb1', name: '幫忙餵小狗',      status: 'active', coins: 0 },
      { id: 'mb2', name: '幫忙擺碗筷',      status: 'paused', coins: 0 },
    ],
    C: [
      { id: 'mc1', name: '幫忙澆花',        status: 'active', coins: 5 },
    ],
    D: [
      { id: 'md1', name: '學會自己綁鞋帶',  status: 'active', coins: 0 },
    ],
  },
};

// 每位孩子的設定摘要（profile + notification entries 顯示用）
const PARENT_SETTINGS = {
  enan: {
    profile:    { name: '陳小恩', age: 8, avatarBg: '#1B3A5C', weeklyMax: 120 },
    notify:     {
      window: '17:30 – 21:00',
      pushKinds: ['新提案', '兌換申請', '長期任務無進展'],
      sound:     '柔和提示音 · 中音量',
    },
  },
  mi: {
    profile:    { name: '陳小米', age: 5, avatarBg: '#E8934A', weeklyMax: 40 },
    notify:     {
      window: '07:30 – 20:00',
      pushKinds: ['新提案', '所有兌換'],
      sound:     '輕柔鈴聲 · 低音量',
    },
  },
};

// 長期任務進展（週報「長期任務進展」區塊用）
// inWeek: 本週完成天數；total/done: 整體進度；nextMilestone: { name, coins, daysLeft }
const LONG_TERM_PROGRESS = {
  enan: [
    {
      id: 'ltp1', cat: 'D', name: '練鋼琴 30 天計畫',
      done: 7, total: 30, inWeek: 1,
      nextMilestone: { name: '第 10 天 · 小達成', coins: 50, daysLeft: 3 },
    },
    {
      id: 'ltp2', cat: 'D', name: '英文每日 10 分鐘',
      done: 18, total: 30, inWeek: 5,
      nextMilestone: { name: '第 20 天 · 中達成', coins: 80, daysLeft: 2 },
    },
    {
      id: 'ltp3', cat: 'D', name: '游泳期末驗收',
      done: 4, total: 12, inWeek: 0,
      nextMilestone: { name: '完成 6 堂課', coins: 60, daysLeft: 2 },
    },
    {
      id: 'ltp4', cat: 'D', name: '寒假閱讀 12 本',
      done: 9, total: 12, inWeek: 1,
      nextMilestone: { name: '達成 12 本', coins: 150, daysLeft: 3 },
    },
  ],
  mi: [
    {
      id: 'mltp1', cat: 'D', name: '學會自己綁鞋帶',
      done: 3, total: 10, inWeek: 2,
      nextMilestone: { name: '連續綁 5 次', coins: 30, daysLeft: 2 },
    },
  ],
};

window.SW_DATA = {
  TODAY, CATEGORIES, CHILDREN,
  REJECT_REASONS, OVERRIDE_OPTIONS,
  WISHES, REWARDS, HISTORY, WISH_REJECT_REASONS, COOLDOWN_DAYS,
  TASKS_LIBRARY, PARENT_SETTINGS, LONG_TERM_PROGRESS,
};
