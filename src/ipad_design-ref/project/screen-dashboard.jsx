// Dashboard (控制面板) — main screen
function DashboardScreen({ child, nav, today }) {
  const kidTasks = today[child.id] || [];
  const completed = kidTasks.filter(t => t.status === 'done').length;
  const total = kidTasks.length;
  const goalPct = Math.min(100, Math.round((child.goal.current / child.goal.target) * 100));

  return (
    <div className="p-screen" style={{ padding: '8px 16px 110px' }}>
      {/* Greeting */}
      <div style={{ padding: '14px 4px 18px' }}>
        <div className="p-eyebrow" style={{ marginBottom: 6 }}>
          {new Date().toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' })}
        </div>
        <div className="p-display">早安</div>
        <div style={{ fontFamily: 'var(--p-font-display)', fontSize: 20, color: 'var(--p-ink-500)', fontStyle: 'italic', fontWeight: 400, marginTop: 2 }}>
          來看看 {child.name} 的今天
        </div>
      </div>

      {/* Two stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <StatCard
          eyebrow="撲滿金幣"
          glyph={<CoinGlyph size={14} />}
          value={<TickerNum value={child.coins} />}
          delta="+7 本週"
          deltaTone="up"
        />
        <StatCard
          eyebrow="時間儲蓄本"
          glyph={<Icon.hourglass size={12} />}
          value={<><TickerNum value={child.time.h} suffix="時"/> <span style={{ marginLeft: 4 }}><TickerNum value={child.time.m} suffix="分"/></span></>}
          delta={`為家裡省下 · 累計 ${child.time.allTime}h`}
          deltaTone="neutral"
        />
      </div>

      {/* Goal card */}
      <Card style={{ marginBottom: 14, padding: 18, background: 'linear-gradient(135deg, var(--p-ivory-100) 0%, #FFFFFF 65%)', border: '1px solid var(--border-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div className="p-eyebrow" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon.flag size={12} /> 當前目標
            </div>
            <div style={{ fontFamily: 'var(--p-font-display)', fontSize: 21, fontWeight: 500, color: 'var(--p-ink-900)', letterSpacing: '-0.01em' }}>
              {child.goal.name}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: 'var(--p-ink-500)', letterSpacing: '0.02em' }}>剩餘</div>
            <div className="p-num" style={{ fontFamily: 'var(--p-font-display)', fontSize: 22, fontWeight: 500, color: 'var(--p-teal-500)' }}>
              {child.goal.target - child.goal.current}
              <span style={{ fontSize: 12, color: 'var(--p-ink-500)', marginLeft: 4, fontWeight: 400 }}>枚金幣</span>
            </div>
          </div>
        </div>
        {/* Progress */}
        <div style={{
          height: 8, background: 'var(--p-ivory-200)', borderRadius: 999, overflow: 'hidden',
          position: 'relative', marginBottom: 8,
        }}>
          <div style={{
            position: 'absolute', inset: 0, width: `${goalPct}%`,
            background: 'linear-gradient(90deg, var(--p-teal-400) 0%, var(--p-teal-500) 100%)',
            borderRadius: 999,
            transition: 'width 600ms var(--ease-out, cubic-bezier(0.16,1,0.3,1))',
          }}/>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="p-num" style={{ fontSize: 13, color: 'var(--p-ink-500)' }}>
            {child.goal.current} / {child.goal.target}
          </span>
          <span style={{ fontSize: 12, color: 'var(--p-ink-500)' }}>
            預估再 <span style={{ color: 'var(--p-ink-900)', fontWeight: 600 }}>{child.goal.eta}</span> 達成
          </span>
        </div>
      </Card>

      {/* Quick action — single, clean */}
      <div style={{ marginBottom: 22 }}>
        <QuickAction
          icon={<Icon.plus size={18} />}
          title="新增任務"
          desc="替孩子安排新項目，或從建議清單挑一個"
          onClick={() => nav.go('newTask')}
        />
      </div>

      {/* Today's activity */}
      <SectionHead
        eyebrow="今日"
        title={<span style={{ whiteSpace: 'nowrap' }}>已完成 <span className="p-num" style={{ color: 'var(--p-teal-500)' }}>{completed}</span> <span style={{ color: 'var(--p-ink-500)', fontSize: 14, fontWeight: 400 }}>/ {total}</span></span>}
        action={
          <button onClick={() => nav.go('tasks')} style={{
            display: 'flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap',
            fontSize: 13, color: 'var(--p-teal-500)', fontWeight: 500,
          }}>全部 <Icon.chevR size={12}/></button>
        }
      />

      <Card style={{ padding: 4 }}>
        {kidTasks.map((t, i) => (
          <ActivityRow key={t.id} task={t} divider={i < kidTasks.length - 1} onClick={() => nav.go('taskDetail', { taskId: t.id })} />
        ))}
      </Card>

      {/* AI nudge */}
      <div style={{
        marginTop: 18, padding: '14px 16px',
        background: 'var(--p-teal-50)',
        border: '1px solid var(--p-teal-100)',
        borderRadius: 14,
        display: 'flex', gap: 12, alignItems: 'flex-start',
      }}>
        <div style={{
          flexShrink: 0, width: 32, height: 32, borderRadius: 8,
          background: 'var(--p-teal-500)', color: '#FFFFFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon.sparkle size={16} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-teal-700)', marginBottom: 2, letterSpacing: '0.02em' }}>
            觀察筆記
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--p-ink-800)', lineHeight: 1.55 }}>
            {child.name}本週本分任務 100% 完成，是連續第 2 週。可以考慮新增一個學習里程碑挑戰。
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ eyebrow, glyph, value, delta, deltaTone }) {
  return (
    <div style={{
      background: '#FFFFFF', borderRadius: 16, padding: '14px 16px',
      boxShadow: 'var(--p-shadow-card)',
      border: '1px solid var(--border-soft)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: 'var(--p-ink-500)' }}>
        {glyph}
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{eyebrow}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 500, lineHeight: 1.1, color: 'var(--p-ink-900)' }}>
        {value}
      </div>
      <div style={{
        marginTop: 4,
        fontSize: 11.5,
        color: deltaTone === 'up' ? 'var(--p-success)' : 'var(--p-ink-500)',
        fontWeight: 500,
      }}>
        {delta}
      </div>
    </div>
  );
}

function QuickAction({ icon, title, desc, onClick, tone }) {
  const accent = tone === 'warn' ? 'var(--p-warn)' : 'var(--p-teal-500)';
  const bgAccent = tone === 'warn' ? '#FBF1DC' : 'var(--p-teal-50)';
  return (
    <button onClick={onClick} style={{
      background: '#FFFFFF', borderRadius: 14, padding: '14px 14px',
      border: '1px solid var(--border-soft)',
      display: 'flex', alignItems: 'center', gap: 12,
      textAlign: 'left',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: bgAccent, color: accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--p-ink-900)' }}>{title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--p-ink-500)' }}>{desc}</div>
      </div>
    </button>
  );
}

function ActivityRow({ task, divider, onClick }) {
  const catMeta = TASK_CAT[task.cat];
  const statusMeta = {
    done:    { tone: 'sage', label: '已完成', icon: <Icon.check size={12}/> },
    pending: { tone: 'neutral', label: task.cat === 'D' ? '待孩子打卡' : '進行中', icon: null },
    missed:  { tone: 'warn', label: '今日未做', icon: null },
    review:  { tone: 'clay', label: '待審核', icon: null },
  }[task.status];

  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
      borderBottom: divider ? '1px solid var(--border-soft)' : 'none',
      width: '100%', textAlign: 'left',
      background: 'transparent', border: 'none',
      cursor: 'pointer',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 7,
        background: catMeta.tint, color: catMeta.fg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {catMeta.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--p-ink-900)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <span style={{ fontSize: 11.5, color: 'var(--p-ink-500)' }}>{catMeta.label}</span>
          {task.time && <span style={{ fontSize: 11.5, color: 'var(--p-ink-400)' }}>· {task.time}</span>}
          {task.note && <span style={{ fontSize: 11.5, color: 'var(--p-ink-400)' }}>· {task.note}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {task.reward && (
          <div style={{ fontSize: 12, fontWeight: 600, color: task.reward.type === 'coins' ? 'var(--gold-700)' : 'var(--p-teal-500)', display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
            {task.reward.type === 'coins'
              ? <>+{task.reward.n} <CoinGlyph size={11}/></>
              : <>+{task.reward.m}<span style={{ fontSize: 10, marginLeft: 1 }}>分鐘</span></>
            }
          </div>
        )}
        <Pill tone={statusMeta.tone} size="sm">{statusMeta.icon}{statusMeta.label}</Pill>
      </div>
    </button>
  );
}

// Task category meta — used across screens
const TASK_CAT = {
  A: { label: '生活自理', tint: 'var(--p-ivory-200)', fg: 'var(--p-ink-700)', icon: <Icon.sun size={14}/> },
  B: { label: '家庭本分', tint: '#E6EEEA', fg: 'var(--p-teal-500)', icon: <Icon.hourglass size={14}/> },
  C: { label: '學習成長', tint: '#FAF1E7', fg: 'var(--p-clay-500)', icon: <Icon.sparkle size={14}/> },
  D: { label: '成長里程碑', tint: '#F4EBF0', fg: 'var(--p-plum-500)', icon: <Icon.flag size={14}/> },
};

Object.assign(window, { DashboardScreen, TASK_CAT });
