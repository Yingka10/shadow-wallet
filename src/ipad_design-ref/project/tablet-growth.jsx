// Shadow Wallet · Parent Tablet — Tab 3 成長紀錄
// Weekly report · Monthly report · History timeline.
// Designed as "an editor's note about your child this week" —
// sober, narrative, longform-feeling. Not a dashboard with KPIs.

const { useState: useStateG } = React;

/* ─────────────────────────────────────────────────────────
   Mock data — long enough to feel like a real report
   ───────────────────────────────────────────────────────── */
const GROWTH_DATA = {
  enan: {
    /* — Week — */
    weekly: {
      range: '5 月 20 – 26 日',
      summary: [
        '這週小恩的狀態有點兩極：每天的書包、寫作業都穩穩完成，但**鋼琴 30 天計畫**從第 5 天起連續 4 天沒打卡，雖然今天又恢復了，連續紀錄已重置。',
        '貢獻型任務上週末爆發 — 週六一天就完成「教妹妹寫名字」、「整理書房」兩件，幣值合計 +27 幣。家長批改速度也比上週快了一倍，這對孩子的回饋感很重要。',
        '需要留意：這週 3 次兌換都選了「冰淇淋」，可能進入了**單一品項依賴**。建議下次他開撲滿時，可以一起聊聊其他想換的東西。',
      ],
      completion: {
        rate: 76,
        done: 23,
        total: 30,
        byDay: [
          { d: '一', done: 4, total: 4 },
          { d: '二', done: 5, total: 5 },
          { d: '三', done: 2, total: 5 },
          { d: '四', done: 1, total: 5 },
          { d: '五', done: 3, total: 5 },
          { d: '六', done: 5, total: 5 },
          { d: '日', done: 3, total: 5 },
        ],
        byCategory: [
          { cat: 'A', done: 6, total: 7 },
          { cat: 'B', done: 8, total: 9 },
          { cat: 'C', done: 6, total: 8 },
          { cat: 'D', done: 3, total: 6 },
        ],
      },
      abandon: {
        tier: 2,
        target: '練鋼琴 30 天計畫',
        detail: '原本連續打卡 7 天，5/21 起連續 4 天未完成。今天（5/26）恢復，但連續紀錄已從 0 重新開始。',
        suggestion: '不需要急著「補打卡」。可以利用週末和孩子一起回顧 — 是太忙、太累、還是這件事本身需要調整？',
      },
      motivation: {
        signal: '上升中',
        text: '貢獻任務的主動性比上週高 — 3 次新提案，其中 2 件是「幫妹妹」相關。可能在發展手足互動上的成就感。',
        evidence: [
          { label: '主動提案', value: '+3 件', delta: '↑ vs 上週 0 件' },
          { label: '幣值滿意度', value: '高', delta: '接受 AI 建議比例 100%' },
          { label: '兌換頻率', value: '3 次', delta: '↑ vs 上週 1 次' },
        ],
      },
      coins: {
        earned: 27, spent: 90, net: -63, balance: 184,
        topIn:  { name: '貢獻任務獎勵', amount: 27 },
        topOut: { name: '冰淇淋 × 3', amount: -90 },
      },
      patterns: [
        {
          tone: 'watch',
          label: '單一品項依賴',
          text: '本週 3 次兌換都選了「冰淇淋一支」（合計 90 幣）。可能進入單品偏好或物質性獎勵依賴，建議引入非物質性選項。',
          action: { label: '上架一個「親子公園時間」非物質選項', cta: '去兌換頁新增' },
        },
        {
          tone: 'positive',
          label: '週末爆發型',
          text: '工作日完成率 65%，週末 100%。孩子顯然在週末更有餘裕做貢獻型任務 — 這是健康的節奏，不需要強制平均。',
          action: { label: '保持現有節奏，不需要介入' },
        },
        {
          tone: 'neutral',
          label: '長期目標脫節',
          text: 'D 類任務完成率僅 50%。鋼琴計畫斷線後，孩子在週三、週四完全沒碰練習。需要重新建立連結。',
          action: { label: '這週內找個零壓力的時間聊鋼琴計畫，看年底步調是否需要調整', cta: '問問 AI 怎麼開頭' },
        },
      ],
    },
    /* — Month — */
    monthly: {
      range: '5 月',
      summary: [
        '5 月小恩整體任務完成率 **78%**，比 4 月（71%）小幅上升 7 個百分點。最大亮點是**貢獻型任務數量翻倍** — 從 4 月的 7 件成長到 5 月的 15 件。',
        '幣值收支接近平衡：本月 +124 幣（任務獎勵）、-118 幣（兌換消費），結餘 +6 幣。撲滿餘額目前 184 幣，比 4 月底高 6 幣。',
        '長期趨勢上，**主動提案能力**是這個月最明顯的進步。從 4 月的 1 件、3 月的 0 件，跳到 5 月的 8 件，且 AI 初審通過率 88%（7/8）。這比幣值或頻率更值得開心。',
      ],
      stats: {
        completion: 78,
        completionDelta: '+7',
        total: 124,
        byCategory: [
          { cat: 'A', count: 38, label: '基本自理' },
          { cat: 'B', count: 41, label: '家庭本分' },
          { cat: 'C', count: 15, label: '貢獻' },
          { cat: 'D', count: 30, label: '成長' },
        ],
      },
      coins: {
        earned: 124,
        spent: 118,
        net: 6,
        balance: 184,
        breakdown: [
          { name: '貢獻任務獎勵',  amount: 124, kind: 'in' },
          { name: '冰淇淋 × 4',    amount: -120, kind: 'out' },
          { name: 'iPad 時間 × 1', amount: -50, kind: 'out' },
          { name: '家長手動 +金',  amount: 30, kind: 'in' },
          { name: '家長手動 -金',  amount: -8, kind: 'out' },
        ],
      },
      trend: [
        { month: '2 月', completion: 62, contribution: 4 },
        { month: '3 月', completion: 68, contribution: 5 },
        { month: '4 月', completion: 71, contribution: 7 },
        { month: '5 月', completion: 78, contribution: 15 },
      ],
    },
  },

  mi: {
    weekly: {
      range: '5 月 20 – 26 日',
      summary: [
        '小米這週節奏穩定 — 3 件日常任務 80% 達成，沒有出現之前常見的「下午忘記餵狗」狀況。',
        '本週沒有新提案，撲滿維持 62 幣。年齡較小（5 歲），貢獻任務目前以家長指派為主屬正常。',
        '值得留意的是：小米開始注意到哥哥的金幣餘額，這週問過 2 次「為什麼哥哥有比較多錢」。可以考慮一次親子對話。',
      ],
      completion: {
        rate: 80,
        done: 16,
        total: 20,
        byDay: [
          { d: '一', done: 3, total: 3 },
          { d: '二', done: 2, total: 3 },
          { d: '三', done: 3, total: 3 },
          { d: '四', done: 2, total: 3 },
          { d: '五', done: 3, total: 3 },
          { d: '六', done: 2, total: 3 },
          { d: '日', done: 1, total: 2 },
        ],
        byCategory: [
          { cat: 'A', done: 9, total: 10 },
          { cat: 'B', done: 7, total: 8 },
          { cat: 'C', done: 0, total: 2 },
          { cat: 'D', done: 0, total: 0 },
        ],
      },
      abandon: null,
      motivation: {
        signal: '平穩',
        text: '小米對「金幣」概念開始有感覺 — 本週兩次主動詢問餘額，但還沒有兌換動作。屬於前期觀察階段。',
        evidence: [
          { label: '主動提案', value: '0 件', delta: '與上週相同' },
          { label: '幣值問詢', value: '2 次', delta: '↑ vs 上週 0 次' },
          { label: '兌換頻率', value: '0 次', delta: '與上週相同' },
        ],
      },
      coins: {
        earned: 22, spent: 0, net: 22, balance: 62,
        topIn:  { name: '日常任務獎勵', amount: 22 },
        topOut: null,
      },
      patterns: [
        {
          tone: 'positive',
          label: '日常自律',
          text: 'A 類「基本自理」任務完成率 90%，比 4 月平均 65% 大幅提升。睡眠時間調整生效了。',
          action: { label: '保持現有作息，下週可以試試加一項 C 類貢獻任務' },
        },
        {
          tone: 'watch',
          label: '手足比較',
          text: '本週兩次提及「哥哥比較多錢」。屬正常社會比較行為，建議在下次睡前對話時平靜地解釋年齡差異。',
          action: { label: '睡前對話時平靜說明：哥哥多 4 歲、任務難度不同，不是偏心', cta: '問問 AI 該怎麼開頭' },
        },
      ],
    },
    monthly: {
      range: '5 月',
      summary: [
        '小米 5 月整體完成率 **84%**，是本年度新高。基本自理（A）和家庭本分（B）幾乎全勤。',
        '幣值流動極少：本月 +22 幣，0 兌換，撲滿從 40 幣慢慢累積到 62 幣。對 5 歲孩子來說屬於健康節奏。',
        '長期趨勢上，這是小米**第一個沒有任務遺漏的月份**。家長的「不催促版」提醒策略似乎有效。',
      ],
      stats: {
        completion: 84,
        completionDelta: '+12',
        total: 62,
        byCategory: [
          { cat: 'A', count: 31, label: '基本自理' },
          { cat: 'B', count: 28, label: '家庭本分' },
          { cat: 'C', count: 3,  label: '貢獻' },
          { cat: 'D', count: 0,  label: '成長' },
        ],
      },
      coins: {
        earned: 22,
        spent: 0,
        net: 22,
        balance: 62,
        breakdown: [
          { name: '貢獻任務獎勵', amount: 22, kind: 'in' },
        ],
      },
      trend: [
        { month: '2 月', completion: 55, contribution: 1 },
        { month: '3 月', completion: 62, contribution: 2 },
        { month: '4 月', completion: 72, contribution: 2 },
        { month: '5 月', completion: 84, contribution: 3 },
      ],
    },
  },
};

const HISTORY_DATA = {
  enan: [
    { id: 'h1', kind: 'coin_adjust',     when: '今天 18:50', op: '+3 幣',  ref: '小恩 · 「教妹妹寫名字」', detail: 'AI 建議 12 幣，家長改為 15 幣' },
    { id: 'h5', kind: 'proposal_reject', when: '昨天 14:10', op: null,     ref: '玩 1 小時手機',         detail: '原因：「不符合家庭規則」' },
    { id: 'h6', kind: 'mark',            when: '2 天前 20:00', op: '-12 幣', ref: '「練鋼琴 30 分鐘」',     detail: '家長標記「沒達標準」· 扣回部分幣值' },
    { id: 'h8', kind: 'proposal_approve',when: '4 天前 19:22', op: '+10 幣', ref: '整理書房',             detail: 'AI 建議 8–12 幣，採用 10 幣' },
    { id: 'h9', kind: 'coin_adjust',     when: '5 天前 21:00', op: '-5 幣',  ref: '小恩 · 手動調整',       detail: '備註：「忘記倒垃圾兩天」' },
    { id: 'h11', kind: 'mark',           when: '6 天前 19:10', op: null,    ref: '「整理書包」',           detail: '家長標記「重新討論」· 保留紀錄' },
    { id: 'h12', kind: 'proposal_approve', when: '1 週前 20:15', op: '+12 幣', ref: '幫妹妹刷牙', detail: 'AI 建議 10–14 幣，採用 12 幣' },
  ],
  mi: [
    { id: 'mh1', kind: 'coin_adjust',     when: '昨天 19:00', op: '+5 幣',  ref: '小米 · 手動 +金',       detail: '備註：「自己整理玩具一整天」' },
    { id: 'mh2', kind: 'proposal_reject', when: '3 天前 16:00', op: null,    ref: '想要一隻新熊熊',         detail: '原因：「想再和孩子討論」' },
    { id: 'mh3', kind: 'coin_adjust',     when: '1 週前 20:30', op: '+10 幣', ref: '小米 · 「幫忙澆花」',   detail: 'AI 建議 8 幣，家長改為 10 幣' },
  ],
};

const HISTORY_KIND_META = {
  coin_adjust:      { tone: 'brass',   label: '幣值調整',   icon: 'coin' },
  mark:             { tone: 'warn',    label: '家長標記',   icon: 'alert' },
  proposal_approve: { tone: 'done',    label: '提案通過',   icon: 'check' },
  proposal_reject:  { tone: 'warn',    label: '提案拒絕',   icon: 'x'    },
};

/* ─────────────────────────────────────────────────────────
   Page header (child switcher + report-type segmented)
   ───────────────────────────────────────────────────────── */
const GrowthHeader = ({ childId, onPickChild, view, onPickView }) => {
  const children = window.SW_DATA.CHILDREN;
  const views = [
    { id: 'weekly',  label: '週報',  sub: '本週' },
    { id: 'monthly', label: '月報',  sub: '本月' },
    { id: 'history', label: '紀錄',  sub: '修改與提案' },
  ];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '20px 32px 18px',
      background: 'var(--t-paper)',
      borderBottom: '1px solid var(--t-hairline)',
    }}>
      <div>
        <div className="t-eyebrow" style={{ marginBottom: 5 }}>Tab 3 · 成長紀錄</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <h1 className="t-h1" style={{ margin: 0, fontSize: 26 }}>觀察與長期紀錄</h1>
          <span className="t-meta" style={{ fontSize: 13 }}>
            {view === 'weekly'  && '本週 · 5 月 20 – 26 日'}
            {view === 'monthly' && '本月 · 5 月'}
            {view === 'history' && '所有歷史紀錄'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {/* Child segmented */}
        <div style={{
          display: 'inline-flex',
          padding: 3,
          background: 'var(--t-paper-warm)',
          border: '1px solid var(--t-hairline)',
          borderRadius: 'var(--t-r-pill)',
        }}>
          {children.map(c => {
            const active = c.id === childId;
            return (
              <button key={c.id} onClick={() => onPickChild(c.id)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '6px 14px 6px 6px',
                background: active ? '#fff' : 'transparent',
                color: active ? 'var(--t-ink)' : 'var(--t-ink-muted)',
                border: 'none',
                borderRadius: 'var(--t-r-pill)',
                fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 13,
                cursor: 'pointer',
                boxShadow: active ? '0 1px 2px rgba(27,27,26,0.06)' : 'none',
                transition: 'background-color .15s var(--t-ease), color .15s var(--t-ease), border-color .15s var(--t-ease), box-shadow .15s var(--t-ease)',
              }}>
                <Avatar child={c} size={24} />
                {c.name}
              </button>
            );
          })}
        </div>

        {/* View segmented */}
        <div style={{
          display: 'inline-flex',
          padding: 3,
          background: 'var(--t-paper-warm)',
          border: '1px solid var(--t-hairline)',
          borderRadius: 'var(--t-r-pill)',
        }}>
          {views.map(v => {
            const active = v.id === view;
            return (
              <button key={v.id} onClick={() => onPickView(v.id)} style={{
                padding: '7px 16px',
                background: active ? 'var(--t-navy)' : 'transparent',
                color: active ? '#fff' : 'var(--t-ink-soft)',
                border: 'none',
                borderRadius: 'var(--t-r-pill)',
                fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 13,
                cursor: 'pointer',
                transition: 'background-color .15s var(--t-ease), color .15s var(--t-ease), border-color .15s var(--t-ease), box-shadow .15s var(--t-ease)',
              }}>
                {v.label}
                <span style={{
                  marginLeft: 6, fontSize: 11, opacity: active ? 0.7 : 0.55,
                  fontWeight: 500,
                }}>{v.sub}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   "AI editor's note" — the hero block of every report
   ───────────────────────────────────────────────────────── */
const NarrativeNote = ({ paragraphs, signature, footer }) => (
  <section style={{
    padding: '28px 32px',
    background: '#fff',
    border: '1px solid var(--t-hairline)',
    borderRadius: 'var(--t-r-xl)',
    boxShadow: 'var(--t-shadow-card)',
    position: 'relative',
    overflow: 'hidden',
  }}>
    {/* subtle margin marker */}
    <div style={{
      position: 'absolute', left: 0, top: 28, bottom: 28,
      width: 3, background: 'var(--t-navy)', opacity: 0.6,
      borderRadius: '0 2px 2px 0',
    }}/>
    <div style={{ marginLeft: 6 }}>
      <div className="t-eyebrow" style={{ marginBottom: 10, color: 'var(--t-navy)' }}>
        <span style={{ marginRight: 6 }}>✦</span>AI · 編輯室札記
      </div>
      <div style={{
        fontFamily: 'var(--t-serif)',
        fontSize: 16.5, lineHeight: 1.75,
        color: 'var(--t-ink-2)',
        letterSpacing: '-0.005em',
      }}>
        {paragraphs.map((p, i) => (
          <p key={i} style={{ margin: i === 0 ? 0 : '14px 0 0', textIndent: 0 }}
             dangerouslySetInnerHTML={{ __html: renderEmphasis(p) }} />
        ))}
      </div>
      <div style={{
        marginTop: 18, paddingTop: 14,
        borderTop: '1px dashed var(--t-hairline-2)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: 'var(--t-sans)', fontSize: 12, color: 'var(--t-ink-muted)',
      }}>
        <span>{signature}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="sparkle" size={12} stroke={1.8}/> AI 觀察，供參考
        </span>
      </div>
      {footer && <div style={{ marginTop: 16 }}>{footer}</div>}
    </div>
  </section>
);
// turn **bold** markers into spans so we can keep prose tidy in data.
const renderEmphasis = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:600;color:var(--t-ink);">$1</strong>');

/* ─────────────────────────────────────────────────────────
   Section frame
   ───────────────────────────────────────────────────────── */
const ReportSection = ({ eyebrow, title, meta, children, style }) => (
  <section style={{
    padding: '22px 26px',
    background: '#fff',
    border: '1px solid var(--t-hairline)',
    borderRadius: 'var(--t-r-lg)',
    boxShadow: 'var(--t-shadow-card)',
    ...style,
  }}>
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
      <div>
        <div className="t-eyebrow" style={{ marginBottom: 5 }}>{eyebrow}</div>
        <h3 className="t-h2" style={{ margin: 0, fontSize: 19 }}>{title}</h3>
      </div>
      {meta && <span className="t-meta" style={{ fontSize: 12.5 }}>{meta}</span>}
    </div>
    {children}
  </section>
);

/* ─────────────────────────────────────────────────────────
   Weekly view — single-column, top-down
   ───────────────────────────────────────────────────────── */
const WeeklyView = ({ child }) => {
  const d = GROWTH_DATA[child.id].weekly;
  const totalByCat = d.completion.byCategory.reduce((s, c) => s + c.total, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Editor's note + agent entry below */}
      <NarrativeNote
        paragraphs={d.summary}
        signature={`${child.name} · 週報 · ${d.range}`}
        footer={
          <GrowthAgentChat
            child={child}
            heading="想進一步了解？問問 AI"
            intro="可以追問本週的觀察、或請 AI 幫忙想對話起手式。"
            suggestions={[
              `${child.name}本週的鋼琴計畫怎麼了？要怎麼跟孩子聊？`,
              `本週連續換了 3 次冰淇淋，要怎麼處理比較好？`,
              `週末完成率比平日高很多，這算問題嗎？`,
            ].slice(0, child.id === 'enan' ? 3 : 3)}
          />
        }
      />

      {/* 2. Combined stats card: completion + ABCD + coins side-by-side */}
      <ReportSection
        eyebrow="本週數據"
        title="任務與幣值"
        meta={`完成 ${d.completion.done} / ${d.completion.total} 件 · 結餘 ${d.coins.net >= 0 ? '+' : ''}${d.coins.net} 幣`}
      >
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr) minmax(0, 1fr)',
          gap: 24,
        }}>
          {/* Completion by day */}
          <div style={{ minWidth: 0 }}>
            <div className="t-eyebrow" style={{ fontSize: 10.5, marginBottom: 12 }}>每日完成率</div>
            <DayBars days={d.completion.byDay} />
            <div style={{
              marginTop: 14,
              display: 'flex', alignItems: 'baseline', gap: 8,
            }}>
              <span className="t-num" style={{ fontSize: 24 }}>{d.completion.rate}%</span>
              <span className="t-meta" style={{ fontSize: 12 }}>整體完成率</span>
            </div>
          </div>

          {/* Category rollup */}
          <div style={{
            minWidth: 0,
            paddingLeft: 24, borderLeft: '1px solid var(--t-hairline)',
          }}>
            <div className="t-eyebrow" style={{ fontSize: 10.5, marginBottom: 12 }}>ABCD 分類</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {d.completion.byCategory.map(c => (
                <CategoryRollup key={c.cat} cat={c.cat} done={c.done} total={c.total} />
              ))}
            </div>
          </div>

          {/* Coins */}
          <div style={{
            minWidth: 0,
            paddingLeft: 24, borderLeft: '1px solid var(--t-hairline)',
          }}>
            <div className="t-eyebrow" style={{ fontSize: 10.5, marginBottom: 12 }}>幣值收支</div>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4,
            }}>
              <span className="t-num" style={{
                fontSize: 28,
                color: d.coins.net >= 0 ? 'var(--t-green)' : 'var(--t-coral)',
              }}>
                {d.coins.net >= 0 ? '+' : ''}{d.coins.net}
              </span>
              <span className="t-meta" style={{ fontSize: 12 }}>幣 · 本週結餘</span>
            </div>
            <div className="t-meta" style={{ fontSize: 12, marginBottom: 14 }}>
              撲滿目前 <span style={{ fontFamily: 'var(--t-data)', fontWeight: 700, color: 'var(--t-ink)' }}>{d.coins.balance}</span> 幣
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <CoinDeltaRow tone="in"  label="收入" amount={d.coins.earned} note={d.coins.topIn?.name}/>
              <CoinDeltaRow tone="out" label="支出" amount={-d.coins.spent} note={d.coins.topOut?.name || '無'}/>
            </div>
          </div>
        </div>
      </ReportSection>

      {/* 3. Long-term task progress — moved up to sit right under 本週數據 */}
      <LongTermProgressSection child={child} />

      {/* 4. Patterns — each card carries its own action at the bottom */}
      <ReportSection
        eyebrow="值得注意的模式"
        title="本週觀察"
        meta={`${d.patterns.length} 項 · 每項附建議行動`}
      >
        <PatternsBlock patterns={d.patterns} child={child} />
      </ReportSection>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   長期任務進展 — Weekly view section
   ───────────────────────────────────────────────────────── */
const LongTermProgressSection = ({ child }) => {
  const list = window.SW_DATA.LONG_TERM_PROGRESS[child.id] || [];
  if (list.length === 0) return null;
  const visible = list.slice(0, 3);
  const more    = list.length - visible.length;

  return (
    <ReportSection
      eyebrow="持續進行"
      title="長期任務進展"
      meta={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span className="t-num" style={{ fontSize: 13.5, color: 'var(--t-ink-soft)' }}>
            {list.length}
          </span>
          項進行中
        </span>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {visible.map(t => <LongTermProgressRow key={t.id} task={t} />)}
      </div>
      {more > 0 && (
        <div style={{
          marginTop: 14, paddingTop: 12,
          borderTop: '1px dashed var(--t-hairline)',
          textAlign: 'center',
        }}>
          <button style={{
            background: 'none', border: 'none', padding: 0,
            fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 12.5,
            color: 'var(--t-navy)', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            查看全部 <span className="t-num" style={{ fontSize: 12, color: 'var(--t-navy)' }}>{list.length}</span> 項
            <Icon name="chevright" size={11} stroke={2}/>
          </button>
        </div>
      )}
    </ReportSection>
  );
};

const LongTermProgressRow = ({ task }) => {
  const cat = window.SW_DATA.CATEGORIES[task.cat];
  const pct = task.done / task.total;
  const remaining = task.total - task.done;
  const noProgress = task.inWeek === 0;

  return (
    <div style={{
      padding: '14px 0',
      borderBottom: '1px solid var(--t-hairline-2)',
    }}>
      {/* Top row — label + name + progress count + no-progress warning */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '2px 8px',
          background: cat.bg, color: cat.fg,
          borderRadius: 'var(--t-r-pill)',
          fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 11,
          lineHeight: 1.4, flexShrink: 0,
          gap: 4,
        }}>
          <span style={{
            fontFamily: 'var(--t-data)', fontWeight: 700,
            background: cat.fg, color: '#fff',
            width: 13, height: 13, borderRadius: '50%',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9,
          }}>{cat.code}</span>
          {cat.short}
        </span>
        <span style={{
          flex: 1, minWidth: 0,
          fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 14,
          color: 'var(--t-ink)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{task.name}</span>

        {noProgress && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px',
            background: 'var(--t-coral-50)',
            border: '1px solid #F0CFC7',
            color: 'var(--t-coral)',
            borderRadius: 'var(--t-r-pill)',
            fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 11,
            lineHeight: 1.4, flexShrink: 0,
          }}>
            <Icon name="alert" size={10} stroke={2}/>
            本週無進展
          </span>
        )}

        <span style={{
          fontFamily: 'var(--t-sans)', fontSize: 12.5,
          color: 'var(--t-ink-muted)', flexShrink: 0,
        }}>
          <span className="t-num" style={{ fontSize: 13.5, color: 'var(--t-ink)' }}>
            {task.done}
          </span>
          <span style={{ opacity: 0.6 }}> / {task.total}</span>
          <span style={{ marginLeft: 6, color: 'var(--t-ink-faint)' }}>差 {remaining}</span>
        </span>
      </div>

      {/* Progress bar with dashed grid (one tick per day) */}
      <GridProgressBar done={task.done} total={task.total} accent={cat.fg} />

      {/* Bottom — milestone + coin */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginTop: 10,
      }}>
        <Icon name="target" size={12} color="var(--t-brass-700)" stroke={1.8}/>
        <span style={{
          flex: 1, minWidth: 0,
          fontFamily: 'var(--t-sans)', fontSize: 12.5,
          color: 'var(--t-ink-soft)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          下一個里程碑 ·
          <span style={{ fontWeight: 600, color: 'var(--t-ink)', marginLeft: 4 }}>
            {task.nextMilestone.name}
          </span>
          {typeof task.nextMilestone.daysLeft === 'number' && (
            <span className="t-meta" style={{ fontSize: 11.5, marginLeft: 6 }}>
              還差 {task.nextMilestone.daysLeft} 天
            </span>
          )}
        </span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 9px',
          background: 'var(--t-brass-50)',
          border: '1px solid var(--t-brass-200)',
          borderRadius: 'var(--t-r-pill)',
          flexShrink: 0,
        }}>
          <Coin size={12}/>
          <span className="t-num" style={{ fontSize: 12.5, color: 'var(--t-brass-700)' }}>
            +{task.nextMilestone.coins}
          </span>
        </span>
      </div>
    </div>
  );
};

const GridProgressBar = ({ done, total, accent }) => {
  // Show one segment per day. Cap visible cells at 30 to keep things readable;
  // if total > 30, scale done into a 30-cell display.
  const cells = Math.min(total, 30);
  const scale = total > cells ? cells / total : 1;
  const filled = Math.round(done * scale);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cells}, 1fr)`,
      gap: 2,
      width: '100%',
      height: 8,
    }}>
      {Array.from({ length: cells }).map((_, i) => (
        <div key={i} style={{
          background: i < filled ? accent : 'transparent',
          border: i < filled ? `1px solid ${accent}` : '1px dashed var(--t-hairline-2)',
          borderRadius: 2,
        }}/>
      ))}
    </div>
  );
};

/* small coin delta row used in the weekly stats card */
const CoinDeltaRow = ({ tone, label, amount, note }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px',
    background: tone === 'in' ? 'var(--t-green-50)' : 'var(--t-coral-50)',
    border: `1px solid ${tone === 'in' ? '#C9DDD0' : '#F0CFC7'}`,
    borderRadius: 'var(--t-r-md)',
  }}>
    <div style={{
      width: 22, height: 22, borderRadius: 6,
      background: '#fff',
      color: tone === 'in' ? 'var(--t-green)' : 'var(--t-coral)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <Icon name={tone === 'in' ? 'plus' : 'x'} size={11} stroke={2.4}/>
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="t-meta" style={{ fontSize: 11 }}>{label}</div>
      <div className="t-meta" style={{
        fontSize: 11.5, color: 'var(--t-ink-muted)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{note}</div>
    </div>
    <span className="t-num" style={{
      fontSize: 14,
      color: tone === 'in' ? 'var(--t-green)' : 'var(--t-coral)',
    }}>{amount >= 0 ? '+' : ''}{amount}</span>
  </div>
);

/* ─────────────────────────────────────────────────────────
   Agent chat (inline, sits inside Editor's note footer)
   ───────────────────────────────────────────────────────── */
const GrowthAgentChat = ({ child, heading, intro, suggestions }) => {
  const [open, setOpen]   = useStateG(false);
  const [history, setHistory] = useStateG([]);
  const [input, setInput] = useStateG('');
  const [busy, setBusy]   = useStateG(false);

  const ask = async (q) => {
    if (!q || busy) return;
    setBusy(true);
    setHistory(h => [...h, { role: 'user', text: q }, { role: 'ai', text: '', loading: true }]);
    setInput('');
    try {
      const prompt = [
        `你是 Shadow Wallet 家長端的 AI 助理，正在週報頁面協助家長進一步了解觀察。`,
        `對話對象：${child.name}（${child.age} 歲）的家長。`,
        `本週重點：完成率 76%、3 次冰淇淋兌換、鋼琴計畫中斷 4 天。`,
        `語氣：溫和、實用、3-5 句中文。可以給對話起手式範例。不用條列，不要 emoji。`,
        ``,
        `家長問：${q}`,
      ].join('\n');
      const text = await window.claude.complete(prompt);
      setHistory(h => h.map((m, i) => i === h.length - 1 ? { role: 'ai', text } : m));
    } catch {
      setHistory(h => h.map((m, i) => i === h.length - 1 ? { role: 'ai', text: 'AI 暫時無法回應，請稍後再試。' } : m));
    }
    setBusy(false);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        width: '100%',
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px',
        background: 'var(--t-navy-50)',
        border: '1px dashed var(--t-navy-200)',
        borderRadius: 'var(--t-r-md)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background-color .15s var(--t-ease)',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#fff'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--t-navy-50)'; }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: '#fff',
          color: 'var(--t-navy)',
          border: '1px solid var(--t-navy-200)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon name="sparkle" size={14} stroke={1.8}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 13.5,
            color: 'var(--t-ink)', marginBottom: 2,
          }}>{heading}</div>
          <div className="t-meta" style={{ fontSize: 12 }}>{intro}</div>
        </div>
        <Icon name="chevright" size={15} color="var(--t-navy)"/>
      </button>
    );
  }

  return (
    <div style={{
      background: 'var(--t-navy-50)',
      border: '1px solid var(--t-navy-200)',
      borderRadius: 'var(--t-r-md)',
      padding: 16,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: '#fff', color: 'var(--t-navy)',
          border: '1px solid var(--t-navy-200)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="sparkle" size={13} stroke={1.8}/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 13.5, color: 'var(--t-ink)' }}>
            {heading}
          </div>
          <div className="t-meta" style={{ fontSize: 11 }}>AI 觀察，供參考 · 不是診斷</div>
        </div>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: 'none',
          color: 'var(--t-ink-muted)', cursor: 'pointer',
          width: 24, height: 24, borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name="x" size={13}/></button>
      </div>

      {history.length > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          maxHeight: 280, overflowY: 'auto',
        }}>
          {history.map((m, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '88%',
                padding: '8px 12px',
                background: m.role === 'user' ? '#fff' : 'var(--t-paper-warm)',
                border: m.role === 'user' ? '1px solid var(--t-navy-200)' : '1px solid var(--t-hairline)',
                borderRadius: 'var(--t-r-md)',
                fontFamily: m.role === 'ai' ? 'var(--t-serif)' : 'var(--t-sans)',
                fontSize: m.role === 'ai' ? 13.5 : 12.5,
                lineHeight: 1.65,
                color: m.role === 'user' ? 'var(--t-ink)' : 'var(--t-ink-soft)',
                whiteSpace: 'pre-wrap',
              }}>
                {m.loading
                  ? <span style={{ color: 'var(--t-ink-muted)' }}>正在思考…</span>
                  : m.text}
              </div>
            </div>
          ))}
        </div>
      )}

      {history.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {suggestions.map((q, i) => (
            <button key={i} onClick={() => ask(q)} disabled={busy} style={{
              textAlign: 'left',
              padding: '9px 12px',
              background: '#fff',
              border: '1px solid var(--t-hairline)',
              borderRadius: 'var(--t-r-md)',
              fontFamily: 'var(--t-sans)', fontSize: 12.5,
              color: 'var(--t-ink-soft)',
              cursor: busy ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
            onMouseEnter={e => { if (!busy) e.currentTarget.style.borderColor = 'var(--t-navy)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--t-hairline)'; }}>
              <Icon name="sparkle" size={11} color="var(--t-navy)"/>
              {q}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') ask(input); }}
          placeholder="想問什麼？例如：要怎麼跟孩子聊鋼琴斷線？"
          disabled={busy}
          style={{
            flex: 1,
            padding: '9px 12px',
            background: '#fff',
            border: '1px solid var(--t-hairline)',
            borderRadius: 'var(--t-r-md)',
            fontFamily: 'var(--t-sans)', fontSize: 13,
            color: 'var(--t-ink)', outline: 'none',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'var(--t-navy)'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--t-hairline)'}
        />
        <Button kind="primary" small icon="send"
          onClick={() => ask(input)}
          style={{ opacity: input.trim() && !busy ? 1 : 0.5, pointerEvents: input.trim() && !busy ? 'auto' : 'none' }}>
          送出
        </Button>
      </div>
    </div>
  );
};

const DayBars = ({ days }) => {
  const max = Math.max(...days.map(d => d.total));
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${days.length}, 1fr)`,
      gap: 10,
      alignItems: 'end',
      height: 110,
    }}>
      {days.map((d, i) => {
        const doneH = (d.done / max) * 80;
        const restH = ((d.total - d.done) / max) * 80;
        const full = d.done === d.total;
        return (
          <div key={i} style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'stretch', justifyContent: 'flex-end',
            height: '100%',
          }}>
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              {restH > 0 && (
                <div style={{
                  height: restH, background: 'var(--t-hairline)',
                  borderRadius: '4px 4px 0 0',
                  borderBottom: '1px solid var(--t-paper)',
                }}/>
              )}
              <div style={{
                height: doneH,
                background: full ? 'var(--t-navy)' : 'var(--t-navy-200)',
                borderRadius: restH > 0 ? 0 : '4px 4px 0 0',
              }}/>
            </div>
            <div style={{
              marginTop: 8,
              textAlign: 'center',
              fontFamily: 'var(--t-sans)', fontSize: 11.5,
              color: full ? 'var(--t-ink)' : 'var(--t-ink-muted)',
              fontWeight: full ? 600 : 500,
            }}>{d.d}</div>
            <div style={{
              textAlign: 'center', marginTop: 1,
              fontFamily: 'var(--t-data)', fontSize: 10.5,
              color: 'var(--t-ink-faint)',
            }}>{d.done}/{d.total}</div>
          </div>
        );
      })}
    </div>
  );
};

const CategoryRollup = ({ cat, done, total }) => {
  const c = window.SW_DATA.CATEGORIES[cat];
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{
          width: 18, height: 18, borderRadius: 6,
          background: c.fg, color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--t-data)', fontWeight: 700, fontSize: 10,
        }}>{c.code}</span>
        <span style={{
          fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 12,
          color: 'var(--t-ink-soft)',
        }}>{c.short}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
        <span className="t-num" style={{ fontSize: 18 }}>{done}</span>
        <span className="t-meta" style={{ fontSize: 12 }}>/ {total}</span>
        <span className="t-meta" style={{ fontSize: 11, marginLeft: 'auto' }}>{pct}%</span>
      </div>
      <Progress value={done} total={Math.max(total, 1)} color={c.fg} height={3} />
    </div>
  );
};

const AbandonCard = ({ data, child }) => {
  if (!data) {
    return (
      <ReportSection eyebrow="給家長的建議" title="本週節奏穩定" meta="無特別建議">
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
          gap: 10, padding: '18px 0',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 12px',
            background: 'var(--t-green-50)', color: 'var(--t-green)',
            border: '1px solid #C9DDD0',
            borderRadius: 'var(--t-r-pill)',
            fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 12,
          }}>
            <Icon name="check" size={12} stroke={2}/> 本週沒有需要特別介入的事
          </div>
          <p style={{
            margin: 0,
            fontFamily: 'var(--t-sans)', fontSize: 13, lineHeight: 1.6,
            color: 'var(--t-ink-muted)',
          }}>{child.name}本週的長期任務沒有出現連續中斷。可以維持目前的節奏，不需要額外動作。</p>
        </div>
      </ReportSection>
    );
  }

  // Reframe "Tier" as relationship-level suggestions to parents.
  const levelMeta = [
    null,
    { headline: '可以隨口聊聊',       desc: '輕度提醒 · 不急',         color: 'var(--t-brass)',  bg: 'var(--t-brass-50)',  bd: '#EFCDA6' },
    { headline: '建議找時間聊一下',   desc: '中度提醒 · 這週內',       color: 'var(--t-coral)',  bg: 'var(--t-coral-50)',  bd: '#F0CFC7' },
    { headline: '建議和孩子一起重新討論', desc: '較高優先 · 越快越好', color: '#A02E1F',         bg: '#F8DCD5',           bd: '#E8B7AB' },
  ][data.tier];

  return (
    <ReportSection eyebrow="給家長的建議" title={levelMeta.headline} meta={levelMeta.desc}>
      {/* Lead: the actionable suggestion. */}
      <div style={{
        padding: '14px 16px',
        background: levelMeta.bg,
        border: `1px solid ${levelMeta.bd}`,
        borderRadius: 'var(--t-r-md)',
        marginBottom: 14,
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <div style={{
          flexShrink: 0,
          width: 30, height: 30, borderRadius: 9,
          background: '#fff', color: levelMeta.color,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${levelMeta.bd}`,
        }}>
          <Icon name="sparkle" size={14} stroke={1.8}/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 12,
            color: levelMeta.color, marginBottom: 5,
            letterSpacing: '0.04em',
          }}>建議怎麼做</div>
          <div style={{
            fontFamily: 'var(--t-sans)', fontSize: 13.5, lineHeight: 1.65,
            color: 'var(--t-ink-soft)',
          }}>{data.suggestion}</div>
        </div>
      </div>

      {/* Background: why AI is making this suggestion. Smaller, secondary. */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        padding: '4px 2px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="t-eyebrow" style={{ fontSize: 10.5 }}>關於這項建議</div>
          <div style={{ flex: 1, height: 1, background: 'var(--t-hairline)' }}/>
          <LevelDots tier={data.tier} color={levelMeta.color} />
        </div>
        <div style={{
          fontFamily: 'var(--t-sans)', fontSize: 12.5, lineHeight: 1.6,
          color: 'var(--t-ink-muted)',
        }}>
          <span style={{ fontWeight: 600, color: 'var(--t-ink-soft)' }}>關於 ‹{data.target}›：</span>
          {data.detail}
        </div>
      </div>
    </ReportSection>
  );
};

const LevelDots = ({ tier, color }) => (
  <div style={{ display: 'inline-flex', gap: 3 }}>
    {[1,2,3].map(i => (
      <span key={i} style={{
        width: 7, height: 7, borderRadius: '50%',
        background: i <= tier ? color : 'rgba(0,0,0,0.08)',
      }}/>
    ))}
  </div>
);

/* ─────────────────────────────────────────────────────────
   Patterns block — overview first, expandable to full cards
   ───────────────────────────────────────────────────────── */
const TONE_MAP = {
  positive: { bg: 'var(--t-green-50)',   fg: 'var(--t-green)',     bd: '#C9DDD0',           icon: 'check', word: '正向' },
  watch:    { bg: 'var(--t-brass-50)',   fg: 'var(--t-brass-700)', bd: '#EFCDA6',           icon: 'alert', word: '留意' },
  neutral:  { bg: 'var(--t-paper-warm)', fg: 'var(--t-ink-soft)',  bd: 'var(--t-hairline)', icon: 'dot',   word: '中性' },
};

const PatternsBlock = ({ patterns, child }) => {
  const [open, setOpen] = useStateG(false);

  // Group counts by tone for the summary line
  const counts = patterns.reduce((acc, p) => {
    acc[p.tone] = (acc[p.tone] || 0) + 1;
    return acc;
  }, {});
  const order = ['watch', 'positive', 'neutral'];
  const countChips = order.filter(t => counts[t]).map(t => ({
    tone: t,
    n: counts[t],
    ...TONE_MAP[t],
  }));
  const actionableCount = patterns.filter(p => p.action?.cta).length;

  return (
    <div>
      {/* Summary block */}
      <div style={{
        padding: '14px 16px',
        background: 'var(--t-paper-warm)',
        border: '1px solid var(--t-hairline)',
        borderRadius: 'var(--t-r-md)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          {countChips.map(c => (
            <span key={c.tone} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 10px',
              background: '#fff',
              border: `1px solid ${c.bd}`,
              color: c.fg,
              borderRadius: 'var(--t-r-pill)',
              fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 11.5,
            }}>
              <Icon name={c.icon} size={11} stroke={2}/>
              {c.word} <span className="t-num" style={{ fontSize: 12 }}>{c.n}</span>
            </span>
          ))}
          {actionableCount > 0 && (
            <span className="t-meta" style={{ fontSize: 12 }}>
              · 其中 <span className="t-num" style={{ fontSize: 12.5 }}>{actionableCount}</span> 項有建議行動
            </span>
          )}
        </div>

        {/* Compact label list */}
        <ul style={{
          listStyle: 'none', padding: 0, margin: 0,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {patterns.map((p, i) => {
            const t = TONE_MAP[p.tone];
            return (
              <li key={i} style={{
                display: 'flex', alignItems: 'baseline', gap: 8,
                fontFamily: 'var(--t-sans)', fontSize: 13, lineHeight: 1.55,
                color: 'var(--t-ink-soft)',
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: t.fg, flexShrink: 0,
                  transform: 'translateY(-2px)',
                }}/>
                <span style={{ fontWeight: 600, color: 'var(--t-ink)' }}>{p.label}</span>
                <span style={{ color: 'var(--t-ink-muted)' }}>·</span>
                <span style={{ flex: 1, minWidth: 0 }}>{p.text.split('。')[0]}。</span>
              </li>
            );
          })}
        </ul>

        <button onClick={() => setOpen(v => !v)} style={{
          marginTop: 12,
          background: 'none', border: 'none', padding: 0,
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 12.5,
          color: 'var(--t-navy)', cursor: 'pointer',
        }}>
          {open ? '收起詳情' : '顯示詳情與建議行動'}
          <span style={{
            display: 'inline-flex',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform .15s var(--t-ease)',
          }}>
            <Icon name="chevdown" size={12} stroke={2}/>
          </span>
        </button>
      </div>

      {/* Expanded cards */}
      {open && (
        <div style={{
          marginTop: 14,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {patterns.map((p, i) => <PatternRow key={i} {...p} child={child} />)}
        </div>
      )}
    </div>
  );
};

const PatternRow = ({ tone, label, text, action, child }) => {
  const map = TONE_MAP[tone];
  return (
    <div style={{
      padding: '16px 18px',
      background: map.bg,
      border: `1px solid ${map.bd}`,
      borderRadius: 'var(--t-r-md)',
    }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{
          flexShrink: 0,
          width: 32, height: 32, borderRadius: 10,
          background: '#fff',
          color: map.fg,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name={map.icon} size={16} stroke={1.8}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 13,
            color: map.fg, marginBottom: 4,
          }}>{label}</div>
          <div style={{
            fontFamily: 'var(--t-sans)', fontSize: 13, lineHeight: 1.6,
            color: 'var(--t-ink-soft)',
          }}>{text}</div>
        </div>
      </div>

      {/* Inline action — sits at the bottom of the pattern card */}
      {action && (
        <div style={{
          marginTop: 12, marginLeft: 46,
          paddingTop: 12,
          borderTop: `1px dashed ${map.bd}`,
          display: 'flex', alignItems: 'flex-start', gap: 10,
          flexWrap: 'wrap',
        }}>
          <div style={{
            flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '2px 8px',
            background: '#fff',
            border: `1px solid ${map.bd}`,
            borderRadius: 'var(--t-r-pill)',
            fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 10.5,
            color: map.fg,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            <Icon name="sparkle" size={9} stroke={2}/> 建議
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--t-sans)', fontSize: 13, lineHeight: 1.55,
              color: 'var(--t-ink-soft)',
            }}>{action.label}</div>
            {action.cta && (
              <button style={{
                marginTop: 6,
                background: 'none', border: 'none', padding: 0,
                fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 12,
                color: map.fg, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>{action.cta} <Icon name="chevright" size={11} stroke={2}/></button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   Monthly view
   ───────────────────────────────────────────────────────── */
const MonthlyView = ({ child }) => {
  const d = GROWTH_DATA[child.id].monthly;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <NarrativeNote paragraphs={d.summary} signature={`${child.name} · 月報 · ${d.range}`} />

      {/* Stats + coins row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ReportSection eyebrow="月度任務統計" title={`完成率 ${d.stats.completion}%`} meta={`vs 上月 ${d.stats.completionDelta} pp`}>
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 10,
            marginBottom: 18, paddingBottom: 16,
            borderBottom: '1px solid var(--t-hairline)',
          }}>
            <span className="t-num" style={{ fontSize: 36 }}>{d.stats.total}</span>
            <span className="t-meta" style={{ fontSize: 14 }}>件任務完成</span>
            <div style={{ flex: 1 }}/>
            <CompletionRing pct={d.stats.completion} />
          </div>
          <div className="t-eyebrow" style={{ marginBottom: 10, fontSize: 10.5 }}>分類佔比</div>
          <CategoryStackBar items={d.stats.byCategory} />
          <div style={{
            marginTop: 12,
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
          }}>
            {d.stats.byCategory.map(c => {
              const cm = window.SW_DATA.CATEGORIES[c.cat];
              return (
                <div key={c.cat} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: 2,
                      background: cm.fg, flexShrink: 0,
                    }}/>
                    <span className="t-meta" style={{ fontSize: 11 }}>{c.label}</span>
                  </div>
                  <span className="t-num" style={{ fontSize: 15, marginLeft: 14 }}>{c.count}</span>
                </div>
              );
            })}
          </div>
        </ReportSection>

        <ReportSection eyebrow="幣值收支" title="撲滿流動" meta={`本月結餘 ${d.coins.net >= 0 ? '+' : ''}${d.coins.net} 幣`}>
          <div style={{ display: 'flex', gap: 18, marginBottom: 16 }}>
            <CoinFlowBlock label="本月收入" value={`+${d.coins.earned}`} tone="green" />
            <CoinFlowBlock label="本月支出" value={`-${d.coins.spent}`} tone="coral" />
            <CoinFlowBlock label="目前餘額" value={d.coins.balance} tone="navy" big />
          </div>
          <div className="t-eyebrow" style={{ marginBottom: 8, fontSize: 10.5 }}>明細</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {d.coins.breakdown.map((b, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 0',
                borderTop: i === 0 ? 'none' : '1px solid var(--t-hairline)',
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: b.kind === 'in' ? 'var(--t-green-50)' : 'var(--t-coral-50)',
                  color: b.kind === 'in' ? 'var(--t-green)' : 'var(--t-coral)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon name={b.kind === 'in' ? 'plus' : 'x'} size={11} stroke={2.4}/>
                </div>
                <span style={{
                  flex: 1, fontFamily: 'var(--t-sans)', fontSize: 13,
                  color: 'var(--t-ink-soft)',
                }}>{b.name}</span>
                <span className="t-num" style={{
                  fontSize: 14,
                  color: b.amount >= 0 ? 'var(--t-green)' : 'var(--t-coral)',
                }}>{b.amount >= 0 ? '+' : ''}{b.amount} 幣</span>
              </div>
            ))}
            {d.coins.breakdown.length === 0 && (
              <div style={{
                padding: '14px 0',
                fontFamily: 'var(--t-sans)', fontSize: 13,
                color: 'var(--t-ink-muted)', textAlign: 'center',
              }}>本月無兌換紀錄</div>
            )}
          </div>
        </ReportSection>
      </div>

      {/* Trend */}
      <ReportSection eyebrow="長期趨勢" title="近 4 個月" meta="完成率 vs 貢獻任務數">
        <TrendChart points={d.trend} />
      </ReportSection>
    </div>
  );
};

const CompletionRing = ({ pct, size = 64 }) => {
  const r = 26;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--t-hairline)" strokeWidth="6"/>
      <circle cx="32" cy="32" r={r} fill="none"
        stroke="var(--t-navy)" strokeWidth="6"
        strokeDasharray={c} strokeDashoffset={off}
        strokeLinecap="round"
        transform="rotate(-90 32 32)"/>
      <text x="32" y="37" textAnchor="middle"
        fontFamily="DM Sans, sans-serif" fontWeight="700" fontSize="15"
        fill="var(--t-ink)">{pct}%</text>
    </svg>
  );
};

const CategoryStackBar = ({ items }) => {
  const total = items.reduce((s, x) => s + x.count, 0);
  return (
    <div style={{
      display: 'flex',
      height: 14,
      borderRadius: 'var(--t-r-sm)',
      overflow: 'hidden',
      border: '1px solid var(--t-hairline)',
    }}>
      {items.map((c, i) => {
        const meta = window.SW_DATA.CATEGORIES[c.cat];
        const pct = total > 0 ? (c.count / total) * 100 : 0;
        if (pct === 0) return null;
        return (
          <div key={c.cat} style={{
            width: `${pct}%`,
            background: meta.fg,
            borderRight: i < items.length - 1 ? '1px solid #fff' : 'none',
          }} title={`${c.label}: ${c.count}`}/>
        );
      })}
    </div>
  );
};

const CoinFlowBlock = ({ label, value, tone, big }) => {
  const colorMap = {
    green: 'var(--t-green)',
    coral: 'var(--t-coral)',
    navy:  'var(--t-navy)',
  };
  return (
    <div style={{
      flex: 1,
      padding: '12px 14px',
      background: big ? 'var(--t-navy-50)' : 'var(--t-paper-warm)',
      borderRadius: 'var(--t-r-md)',
      border: big ? '1px solid var(--t-navy-200)' : '1px solid var(--t-hairline)',
    }}>
      <div className="t-eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>{label}</div>
      <div style={{
        fontFamily: 'var(--t-data)', fontWeight: 700,
        fontSize: big ? 24 : 20,
        color: colorMap[tone],
        letterSpacing: '-0.01em',
      }}>{value}</div>
    </div>
  );
};

const TrendChart = ({ points }) => {
  const W = 700, H = 140, PADX = 36, PADY = 24;
  const max = Math.max(...points.map(p => p.completion), 100);
  const x = (i) => PADX + (i / (points.length - 1)) * (W - PADX * 2);
  const y = (v) => H - PADY - (v / max) * (H - PADY * 2);
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.completion)}`).join(' ');
  const maxContrib = Math.max(...points.map(p => p.contribution), 1);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {[0, 50, 100].map(g => (
          <g key={g}>
            <line x1={PADX} x2={W - PADX} y1={y(g)} y2={y(g)} stroke="var(--t-hairline)" strokeWidth="0.6" strokeDasharray={g === 100 ? '0' : '2 4'}/>
            <text x={PADX - 8} y={y(g) + 3} textAnchor="end" fontFamily="DM Sans" fontSize="9" fill="var(--t-ink-faint)">{g}</text>
          </g>
        ))}
        {/* contribution bars (background) */}
        {points.map((p, i) => {
          const bH = (p.contribution / maxContrib) * (H - PADY * 2);
          return (
            <rect key={'b'+i}
              x={x(i) - 10} y={H - PADY - bH}
              width={20} height={bH}
              fill="var(--t-brass-100)" rx="3"
            />
          );
        })}
        {/* completion line */}
        <path d={linePath} fill="none" stroke="var(--t-navy)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        {points.map((p, i) => (
          <g key={'p'+i}>
            <circle cx={x(i)} cy={y(p.completion)} r="3.5" fill="#fff" stroke="var(--t-navy)" strokeWidth="2"/>
            <text x={x(i)} y={y(p.completion) - 9} textAnchor="middle"
              fontFamily="DM Sans" fontSize="10" fontWeight="700" fill="var(--t-navy)">{p.completion}%</text>
            <text x={x(i)} y={H - 6} textAnchor="middle"
              fontFamily="Plus Jakarta Sans" fontSize="11" fill="var(--t-ink-muted)">{p.month}</text>
          </g>
        ))}
      </svg>
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 24,
        marginTop: 8, fontFamily: 'var(--t-sans)', fontSize: 12,
        color: 'var(--t-ink-muted)',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 16, height: 2, background: 'var(--t-navy)', borderRadius: 1 }}/>
          任務完成率
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 10, background: 'var(--t-brass-100)', borderRadius: 2 }}/>
          貢獻任務件數
        </span>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   History timeline
   ───────────────────────────────────────────────────────── */
const HistoryView = ({ child }) => {
  const list = HISTORY_DATA[child.id] || [];
  const [filter, setFilter] = useStateG('all');
  const filterTabs = [
    { id: 'all',      label: '全部',     n: list.length },
    { id: 'coin',     label: '幣值調整', n: list.filter(x => x.kind === 'coin_adjust').length },
    { id: 'mark',     label: '家長標記', n: list.filter(x => x.kind === 'mark').length },
    { id: 'proposal', label: '提案',     n: list.filter(x => x.kind.startsWith('proposal')).length },
  ];
  const filtered = filter === 'all' ? list
    : filter === 'coin'     ? list.filter(x => x.kind === 'coin_adjust')
    : filter === 'mark'     ? list.filter(x => x.kind === 'mark')
    : list.filter(x => x.kind.startsWith('proposal'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section style={{
        padding: '20px 26px',
        background: '#fff',
        border: '1px solid var(--t-hairline)',
        borderRadius: 'var(--t-r-lg)',
        boxShadow: 'var(--t-shadow-card)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 20,
      }}>
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 5 }}>家長操作紀錄</div>
          <h3 className="t-h2" style={{ margin: 0, fontSize: 19 }}>
            {child.name}的審核與調整 audit log
          </h3>
          <div className="t-meta" style={{ marginTop: 5, fontSize: 12.5 }}>
            幣值調整、家長標記、提案核可 / 拒絕 — 兌換紀錄請到「兌換」分頁查看
          </div>
        </div>
        <div style={{
          display: 'inline-flex',
          padding: 3,
          background: 'var(--t-paper-warm)',
          border: '1px solid var(--t-hairline)',
          borderRadius: 'var(--t-r-pill)',
          flexShrink: 0,
        }}>
          {filterTabs.map(t => {
            const active = t.id === filter;
            return (
              <button key={t.id} onClick={() => setFilter(t.id)} style={{
                padding: '6px 14px',
                background: active ? '#fff' : 'transparent',
                color: active ? 'var(--t-ink)' : 'var(--t-ink-muted)',
                border: 'none',
                borderRadius: 'var(--t-r-pill)',
                fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 12.5,
                cursor: 'pointer',
                boxShadow: active ? '0 1px 2px rgba(27,27,26,0.06)' : 'none',
              }}>
                {t.label}
                <span style={{
                  marginLeft: 6, fontFamily: 'var(--t-data)',
                  fontSize: 11, opacity: 0.7,
                }}>{t.n}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section style={{
        background: '#fff',
        border: '1px solid var(--t-hairline)',
        borderRadius: 'var(--t-r-lg)',
        boxShadow: 'var(--t-shadow-card)',
        padding: '6px 26px 22px',
      }}>
        {filtered.length === 0 ? (
          <div style={{
            padding: 40, textAlign: 'center',
            fontFamily: 'var(--t-sans)', fontSize: 13.5,
            color: 'var(--t-ink-muted)',
          }}>無符合條件的紀錄。</div>
        ) : filtered.map((it, i) => <GrowthHistoryRow key={it.id} item={it} isLast={i === filtered.length - 1}/>)}
      </section>
    </div>
  );
};

const GrowthHistoryRow = ({ item, isLast }) => {
  const m = HISTORY_KIND_META[item.kind] || { tone: 'neutral', label: item.kind, icon: 'dot' };
  const toneMap = {
    info:  { bg: 'var(--t-navy-50)',   fg: 'var(--t-navy)',     bd: 'var(--t-navy-200)' },
    brass: { bg: 'var(--t-brass-50)',  fg: 'var(--t-brass-700)',bd: '#EFCDA6' },
    warn:  { bg: 'var(--t-coral-50)',  fg: 'var(--t-coral)',    bd: '#F0CFC7' },
    done:  { bg: 'var(--t-green-50)',  fg: 'var(--t-green)',    bd: '#C9DDD0' },
  }[m.tone] || { bg: 'var(--t-paper-warm)', fg: 'var(--t-ink-muted)', bd: 'var(--t-hairline)' };

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 16,
      padding: '16px 0',
      borderBottom: isLast ? 'none' : '1px solid var(--t-hairline)',
      position: 'relative',
    }}>
      {/* timeline rail dot */}
      <div style={{ position: 'relative', flexShrink: 0, paddingTop: 2 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: toneMap.bg,
          color: toneMap.fg,
          border: `1px solid ${toneMap.bd}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name={m.icon} size={16} stroke={1.8}/>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '2px 9px',
            background: toneMap.bg, color: toneMap.fg,
            border: `1px solid ${toneMap.bd}`,
            borderRadius: 'var(--t-r-pill)',
            fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 11,
            lineHeight: 1.4,
          }}>{m.label}</span>
          <span style={{
            fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 14,
            color: 'var(--t-ink)',
          }}>{item.ref}</span>
          <div style={{ flex: 1 }}/>
          {item.op && (
            <span className="t-num" style={{
              fontSize: 14,
              color: /^-/.test(item.op) ? 'var(--t-coral)'
                   : /^\+/.test(item.op) ? 'var(--t-green)'
                   : 'var(--t-ink)',
            }}>{item.op}</span>
          )}
          <span className="t-meta" style={{ fontSize: 11.5, minWidth: 80, textAlign: 'right' }}>{item.when}</span>
        </div>
        <div style={{
          fontFamily: 'var(--t-sans)', fontSize: 12.5, lineHeight: 1.55,
          color: 'var(--t-ink-muted)',
        }}>{item.detail}</div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   Container — exposed as window.GrowthTab
   ───────────────────────────────────────────────────────── */
const GrowthTabImpl = () => {
  const [childId, setChildId] = useStateG(window.SW_DATA.CHILDREN[0].id);
  const [view, setView]       = useStateG('weekly');
  const child = window.SW_DATA.CHILDREN.find(c => c.id === childId);

  return (
    <div style={{
      flex: 1, minWidth: 0,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--t-paper)',
    }}>
      <GrowthHeader
        childId={childId}
        onPickChild={setChildId}
        view={view}
        onPickView={setView}
      />
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '20px 32px 28px',
      }}>
        {view === 'weekly'  && <WeeklyView  child={child} key={'w'+childId}/>}
        {view === 'monthly' && <MonthlyView child={child} key={'m'+childId}/>}
        {view === 'history' && <HistoryView child={child} key={'h'+childId}/>}
      </div>
    </div>
  );
};

window.SW_GrowthTab = GrowthTabImpl;
