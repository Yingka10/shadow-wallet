// Weekly Insights — editorial / text-forward
function WeeklyScreen({ child, kids }) {
  // canned data for the active child
  const data = WEEKLY_DATA[child.id] || WEEKLY_DATA.yu;
  const [picked, setPicked] = React.useState(null);

  return (
    <div className="p-screen" style={{ padding: '8px 16px 110px' }}>
      {/* Header / cover */}
      <div style={{ padding: '10px 4px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="p-eyebrow">本週洞察</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <button style={navArrowStyle}><Icon.chevL size={14}/></button>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--p-ink-700)', fontFamily: 'var(--p-font-display)' }}>第 19 週</span>
            <button style={navArrowStyle} disabled><Icon.chevR size={14}/></button>
          </div>
        </div>
        <div className="p-display" style={{ fontSize: 28, lineHeight: 1.2 }}>
          {child.name}的這一週
        </div>
        <div className="p-meta" style={{ marginTop: 6 }}>
          5 月 5 日 — 5 月 11 日 · 共 {data.totalTasks} 件任務
        </div>
      </div>

      {/* AI insight — letter-like */}
      <div style={{
        marginTop: 18, padding: '20px 22px',
        background: 'linear-gradient(165deg, #FFFFFF 0%, var(--p-ivory-100) 100%)',
        borderRadius: 18,
        border: '1px solid var(--border-soft)',
        position: 'relative',
        boxShadow: 'var(--p-shadow-card)',
      }}>
        <div style={{
          position: 'absolute', top: -10, left: 22,
          padding: '3px 10px', borderRadius: 999,
          background: 'var(--p-teal-500)', color: '#FFFFFF',
          fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em',
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          <Icon.sparkle size={10}/>AI 觀察
        </div>
        <div style={{
          fontFamily: 'var(--p-font-display)',
          fontSize: 17, lineHeight: 1.65, color: 'var(--p-ink-800)',
          letterSpacing: '0.005em',
        }}>
          <span style={{ fontSize: 28, color: 'var(--p-teal-500)', float: 'left', lineHeight: 1, marginRight: 4, fontWeight: 500 }}>「</span>
          {data.aiInsight}
          <span style={{ color: 'var(--p-teal-500)' }}>」</span>
        </div>
        <div style={{
          marginTop: 14, paddingTop: 12,
          borderTop: '1px dashed var(--border-medium)',
          fontSize: 12, color: 'var(--p-ink-500)',
          display: 'flex', alignItems: 'center', gap: 6, fontStyle: 'italic',
        }}>
          根據本週 {data.totalTasks} 項任務、{data.checkIns} 次打卡分析
        </div>
      </div>

      {/* Activity strip — small bars */}
      <SectionHead eyebrow="本週活動" title="任務完成狀況" />
      <Card style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {data.activity.map(a => (
            <ActivityBar key={a.cat} cat={a.cat} done={a.done} total={a.total}/>
          ))}
        </div>
      </Card>

      {/* Economy flow */}
      <SectionHead eyebrow="經濟" title="本週金幣流動" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <EconCard
          label="收入"
          value={data.econ.income}
          desc={`${data.econ.incomeFrom} 件任務`}
          tone="up"
        />
        <EconCard
          label="支出"
          value={data.econ.spend}
          desc={`${data.econ.spendFrom} 次兌換`}
          tone="down"
        />
      </div>
      <div style={{
        marginTop: 10, padding: '12px 16px',
        background: '#FFFFFF', borderRadius: 14,
        border: '1px solid var(--border-soft)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 13, color: 'var(--p-ink-500)' }}>淨累積</span>
        <span className="p-num" style={{
          fontFamily: 'var(--p-font-display)', fontSize: 19, fontWeight: 500,
          color: 'var(--p-teal-500)',
        }}>+{data.econ.income - data.econ.spend}<CoinGlyph size={14}/></span>
      </div>

      {/* Next-week suggestions */}
      <SectionHead eyebrow="下週" title="AI 給你的 3 個建議" />
      <div style={{ display: 'grid', gap: 10 }}>
        {data.suggestions.map((s, i) => (
          <SuggestionRow key={i} index={i + 1} {...s}/>
        ))}
      </div>

      {/* Growth moments */}
      <SectionHead eyebrow="成長時刻" title="本週值得記住的事" action={<button style={{ fontSize: 13, color: 'var(--p-teal-500)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 2 }}>記錄 <Icon.plus size={12}/></button>} />
      <div style={{ position: 'relative', paddingLeft: 14 }}>
        <div style={{
          position: 'absolute', left: 5, top: 6, bottom: 6,
          width: 1, background: 'var(--p-ivory-300)',
        }}/>
        {data.moments.map((m, i) => (
          <div key={i} style={{ position: 'relative', marginBottom: 14 }}>
            <div style={{
              position: 'absolute', left: -14, top: 6, width: 11, height: 11, borderRadius: '50%',
              background: '#FFFFFF', border: '2px solid var(--p-teal-500)',
            }}/>
            <div style={{ fontSize: 11.5, color: 'var(--p-ink-500)', marginBottom: 2 }}>{m.date}</div>
            <div style={{ fontFamily: 'var(--p-font-display)', fontSize: 15, fontWeight: 500, color: 'var(--p-ink-900)', lineHeight: 1.4 }}>
              {m.title}
            </div>
            {m.body && (
              <div style={{ fontSize: 12.5, color: 'var(--p-ink-500)', marginTop: 2, lineHeight: 1.5 }}>{m.body}</div>
            )}
          </div>
        ))}
      </div>

      {/* Affirmations — parent picks one to send to child */}
      <SectionHead eyebrow="肯定" title={`挑一句傳給${child.name}`}/>
      <div style={{ display: 'grid', gap: 8 }}>
        {data.affirmations.map((a, i) => (
          <button key={i} onClick={() => setPicked(i)} style={{
            background: picked === i ? 'var(--p-teal-50)' : '#FFFFFF',
            border: `1px solid ${picked === i ? 'var(--p-teal-500)' : 'var(--border-soft)'}`,
            borderRadius: 14, padding: '14px 16px',
            textAlign: 'left',
            fontFamily: 'var(--p-font-display)',
            fontSize: 15.5, fontWeight: 500, color: 'var(--p-ink-900)',
            lineHeight: 1.5,
            display: 'flex', alignItems: 'flex-start', gap: 10,
            cursor: 'pointer',
          }}>
            <span style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              border: `2px solid ${picked === i ? 'var(--p-teal-500)' : 'var(--p-ivory-300)'}`,
              background: picked === i ? 'var(--p-teal-500)' : 'transparent',
              color: '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginTop: 1,
            }}>
              {picked === i && <Icon.check size={12}/>}
            </span>
            <span>{a}</span>
          </button>
        ))}
      </div>
      <Button variant="primary" full size="lg" icon={<Icon.sparkle size={16}/>}>
        傳送給 {child.name}
      </Button>
    </div>
  );
}

const navArrowStyle = {
  width: 26, height: 26, borderRadius: 8,
  background: '#FFFFFF', border: '1px solid var(--border-soft)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--p-ink-700)',
};

function ActivityBar({ cat, done, total }) {
  const meta = TASK_CAT[cat];
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: meta.fg, display: 'inline-flex' }}>{React.cloneElement(meta.icon, { size: 14 })}</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--p-ink-900)' }}>{meta.label}</span>
        </div>
        <span className="p-num" style={{ fontSize: 12, color: 'var(--p-ink-500)' }}>
          <span style={{ color: 'var(--p-ink-900)', fontWeight: 600 }}>{done}</span> / {total}
        </span>
      </div>
      <div style={{
        height: 6, borderRadius: 999, background: 'var(--p-ivory-100)', overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: pct >= 90 ? 'var(--p-success)' : pct >= 60 ? 'var(--p-teal-400)' : 'var(--p-warn)',
          borderRadius: 999,
          transition: 'width 600ms var(--ease-out, cubic-bezier(0.16,1,0.3,1))',
        }}/>
      </div>
    </div>
  );
}

function EconCard({ label, value, desc, tone }) {
  const accent = tone === 'up' ? 'var(--p-success)' : 'var(--p-clay-500)';
  return (
    <div style={{
      background: '#FFFFFF', borderRadius: 14,
      padding: '14px 16px',
      border: '1px solid var(--border-soft)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--p-ink-500)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ marginTop: 6, fontFamily: 'var(--p-font-display)', fontSize: 26, fontWeight: 500, color: 'var(--p-ink-900)', display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ color: accent }}>{tone === 'up' ? '+' : '−'}</span>
        <span className="p-num">{value}</span>
        <CoinGlyph size={14}/>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--p-ink-500)', marginTop: 2 }}>{desc}</div>
    </div>
  );
}

function SuggestionRow({ index, body, action }) {
  return (
    <div style={{
      background: '#FFFFFF', borderRadius: 14, padding: '14px 16px',
      border: '1px solid var(--border-soft)',
      display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <div style={{
        flexShrink: 0,
        width: 26, height: 26, borderRadius: '50%',
        background: 'var(--p-teal-50)', color: 'var(--p-teal-500)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--p-font-display)', fontSize: 13, fontWeight: 600,
      }}>{index}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: 'var(--p-ink-800)', lineHeight: 1.5, marginBottom: 8 }}>
          {body}
        </div>
        <button style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '6px 11px', borderRadius: 999,
          background: 'var(--p-ivory-100)',
          fontSize: 12, fontWeight: 600, color: 'var(--p-teal-500)',
        }}>
          {action}<Icon.chevR size={11}/>
        </button>
      </div>
    </div>
  );
}

// Canned weekly data
const WEEKLY_DATA = {
  yu: {
    totalTasks: 24, checkIns: 19,
    aiInsight: '這週小宇連續第二週把本分任務全部做完，最特別的是星期三晚上他主動幫忙照顧妹妹半小時——這不是任何任務裡的項目。練琴打卡也準時了 5 天，已比上週進步。下週可以聊聊看「主動幫忙」這件事，讓他感受到被看見。',
    activity: [
      { cat: 'A', done: 7, total: 7 },
      { cat: 'B', done: 4, total: 5 },
      { cat: 'C', done: 5, total: 7 },
      { cat: 'D', done: 3, total: 5 },
    ],
    econ: { income: 38, incomeFrom: 19, spend: 12, spendFrom: 1 },
    suggestions: [
      { body: '練琴打卡有 2 天遺漏，建議把提醒時間從 19:00 改到 18:30 會更穩定。', action: '調整提醒時間' },
      { body: '小宇近期完成中等難度任務很順利，可以加一個困難項試試。', action: '提高任務難度' },
      { body: '本週他主動幫忙照顧妹妹，或許可以新增「貢獻型」任務。', action: '新增貢獻任務' },
    ],
    moments: [
      { date: '週三 19:40', title: '主動幫妹妹收玩具', body: '沒有任務、沒有提醒，自己看到就做了。' },
      { date: '週五 07:15', title: '第一次自己打領帶上學', body: '練了兩次才弄好，但堅持沒讓你幫忙。' },
      { date: '週日 08:30', title: '為阿嬤準備早餐', body: '把昨天的麵包烤好端上桌。' },
    ],
    affirmations: [
      '你這週幫了媽媽很多忙，我都有看到。',
      '小宇，你連續兩週把份內的事都做完了，這比拿幾個金幣更厲害。',
      '主動幫妹妹的那一次，讓我很驕傲。',
    ],
  },
  en: {
    totalTasks: 31, checkIns: 27,
    aiInsight: '小恩這週的學習任務完成率達到 95%，是近一個月最高。她在週四主動把難度從中等調整為困難，這代表她開始準備好挑戰更難的目標了。但兌換的頻率也比平均高 20%，下週可以聊聊「想要」和「需要」的差別。',
    activity: [
      { cat: 'A', done: 7, total: 7 },
      { cat: 'B', done: 6, total: 6 },
      { cat: 'C', done: 9, total: 10 },
      { cat: 'D', done: 5, total: 8 },
    ],
    econ: { income: 62, incomeFrom: 27, spend: 80, spendFrom: 2 },
    suggestions: [
      { body: '本週兌換頻率偏高，建議聊聊「想要」與「需要」的差別。', action: '新增討論話題' },
      { body: '學科任務完成率達 95%，可規劃下一階段挑戰。', action: '建立新里程碑' },
      { body: '時間儲蓄本累積 14h，可考慮一個全家行的小獎勵。', action: '安排家庭活動' },
    ],
    moments: [
      { date: '週一 16:20', title: '把今天的學校事先做完才看影片', body: '沒人提醒，自己分配時間。' },
      { date: '週四 20:15', title: '把練琴難度從中等改成困難', body: '說「想試試比較難的」。' },
    ],
    affirmations: [
      '小恩，你這週的安排能力，比媽媽 9 歲時厲害多了。',
      '你願意主動挑戰更難的事，這比金幣有價值多了。',
      '看到你把事情排好順序，很驕傲。',
    ],
  },
};

Object.assign(window, { WeeklyScreen, WEEKLY_DATA });
