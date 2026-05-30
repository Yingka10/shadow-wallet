// Shadow Wallet · Parent Tablet — App shell
// Header · Sidebar (child switcher) · Tab bar · Tab routing

const { useState } = React;

/* ─────────────────────────────────────────────────────────
   Top header (sober, editorial)
   ───────────────────────────────────────────────────────── */
const TopHeader = () => (
  <header style={{
    height: 64,
    padding: '0 32px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    borderBottom: '1px solid var(--t-hairline)',
    background: 'var(--t-paper)',
    flexShrink: 0,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        background: 'var(--t-navy)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff',
        fontFamily: 'var(--t-serif)', fontWeight: 700, fontSize: 16,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10)',
      }}>S</div>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <span style={{
          fontFamily: 'var(--t-serif)', fontWeight: 600, fontSize: 18,
          letterSpacing: '-0.005em', color: 'var(--t-ink)',
        }}>影子貨幣錢包</span>
        <span style={{
          fontFamily: 'var(--t-sans)', fontSize: 11.5, color: 'var(--t-ink-muted)',
          letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>Parent · 家長端</span>
      </div>
    </div>

    <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--t-ink-muted)', whiteSpace: 'nowrap' }}>
        <Icon name="clock" size={14}/>
        <span style={{ fontFamily: 'var(--t-sans)', fontSize: 13, whiteSpace: 'nowrap' }}>
          {window.SW_DATA.TODAY.md} · {window.SW_DATA.TODAY.dow} · 晚上 8:14
        </span>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 12px 5px 6px',
        borderRadius: 'var(--t-r-pill)',
        background: 'var(--t-paper-warm)',
        border: '1px solid var(--t-hairline)',
        cursor: 'pointer',
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: '#3F4E66', color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--t-serif)', fontWeight: 600, fontSize: 12,
        }}>陳</div>
        <span style={{ fontFamily: 'var(--t-sans)', fontSize: 13, fontWeight: 600, color: 'var(--t-ink)' }}>陳爸</span>
        <Icon name="chevdown" size={14}/>
      </div>
    </div>
  </header>
);

/* ─────────────────────────────────────────────────────────
   Sidebar — child switcher
   ───────────────────────────────────────────────────────── */
const Sidebar = ({ activeId, onPick, onGoToGrowth }) => {
  const children = window.SW_DATA.CHILDREN;
  return (
    <aside style={{
      width: 280,
      padding: '28px 18px',
      background: 'var(--t-paper-warm)',
      borderRight: '1px solid var(--t-hairline)',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0,
    }}>
      <div className="t-eyebrow" style={{ paddingLeft: 8, marginBottom: 14 }}>孩子</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children.map(c => (
          <ChildPill
            key={c.id}
            child={c}
            active={c.id === activeId}
            onClick={() => onPick(c.id)}
            onGoToGrowth={onGoToGrowth}
          />
        ))}
        <button style={{
          marginTop: 4,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 14px',
          background: 'transparent',
          border: '1px dashed var(--t-hairline-2)',
          borderRadius: 'var(--t-r-lg)',
          color: 'var(--t-ink-muted)',
          fontFamily: 'var(--t-sans)', fontSize: 13, fontWeight: 500,
          cursor: 'pointer',
          transition: 'background-color .15s var(--t-ease), color .15s var(--t-ease), border-color .15s var(--t-ease), box-shadow .15s var(--t-ease)',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--t-navy-200)'; e.currentTarget.style.color = 'var(--t-navy)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--t-hairline-2)'; e.currentTarget.style.color = 'var(--t-ink-muted)'; }}>
          <Icon name="plus" size={16}/> 新增孩子
        </button>
      </div>

      <div style={{ flex: 1 }} />
    </aside>
  );
};

const ChildPill = ({ child, active, onClick, onGoToGrowth }) => {
  const [newsOpen, setNewsOpen] = useState(false);
  const allNews = child.news || [];
  // Sort: attention-tone first, then normal
  const sortedNews = [...allNews].sort((a, b) => {
    const score = n => n.tone === 'attention' ? 0 : 1;
    return score(a) - score(b);
  });
  const hasNews = sortedNews.length > 0;
  const hasAttention = sortedNews.some(n => n.tone === 'attention');
  const visibleNews = newsOpen ? sortedNews : sortedNews.slice(0, 1);
  const moreCount = sortedNews.length - 1;

  return (
    <div style={{
      background: active ? '#fff' : 'transparent',
      border: `1px solid ${active ? 'var(--t-hairline)' : 'transparent'}`,
      boxShadow: active ? 'var(--t-shadow-card)' : 'none',
      borderRadius: 'var(--t-r-lg)',
      position: 'relative',
      transition: 'background-color .15s var(--t-ease), color .15s var(--t-ease), border-color .15s var(--t-ease), box-shadow .15s var(--t-ease)',
      overflow: 'hidden',
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.55)'; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>

      {active && <div style={{
        position: 'absolute', left: 0, top: 12, bottom: 12,
        width: 3, background: 'var(--t-navy)', borderRadius: '0 2px 2px 0',
      }}/>}

      <button onClick={onClick} style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
      }}>
        <Avatar child={child} size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 14.5, color: 'var(--t-ink)' }}>
              {child.name}
            </span>
            <span className="t-meta" style={{ fontSize: 11.5 }}>{child.age} 歲</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span className="t-num" style={{ fontSize: 12 }}>{child.doneToday}/{child.totalToday}</span>
            <div style={{ flex: 1, maxWidth: 80 }}>
              <Progress value={child.doneToday} total={child.totalToday} height={3} />
            </div>
            {child.proposals.length > 0 && (
              <span style={pillSmall('var(--t-brass-100)', 'var(--t-brass-700)')}>
                {child.proposals.length} 提案
              </span>
            )}
          </div>
        </div>
      </button>

      {/* News strip — collapsed by default to top-priority only */}
      {hasNews && (
        <div style={{
          margin: '0 12px 12px',
          padding: '10px 12px',
          background: hasAttention ? 'var(--t-coral-50)' : 'var(--t-paper-warm)',
          border: `1px solid ${hasAttention ? '#F0CFC7' : 'var(--t-hairline)'}`,
          borderRadius: 'var(--t-r-md)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6,
          }}>
            <Icon
              name={hasAttention ? 'alert' : 'sparkle'}
              size={11}
              stroke={2}
              color={hasAttention ? 'var(--t-coral)' : 'var(--t-brass)'}
            />
            <span style={{
              fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 10.5,
              letterSpacing: '0.08em',
              color: hasAttention ? 'var(--t-coral)' : 'var(--t-brass-700)',
              textTransform: 'uppercase',
            }}>{hasAttention ? '快訊 · 需關注' : '今天的快訊'}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {visibleNews.map((n, i) => (
              <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                <span style={{
                  flexShrink: 0, marginTop: 6,
                  width: 5, height: 5, borderRadius: '50%',
                  background: n.tone === 'attention' ? 'var(--t-coral)' : 'var(--t-brass)',
                }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--t-sans)', fontSize: 12.5, lineHeight: 1.5,
                    color: n.tone === 'attention' ? 'var(--t-ink)' : 'var(--t-ink-soft)',
                    fontWeight: n.tone === 'attention' ? 600 : 500,
                  }}>{n.text}</div>
                  {n.linkTo === 'growth' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onGoToGrowth && onGoToGrowth(); }}
                      style={{
                        marginTop: 4,
                        background: 'none', border: 'none', padding: 0,
                        fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 11.5,
                        color: 'var(--t-coral)', cursor: 'pointer',
                      }}>→ 看成長紀錄</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* More toggle */}
          {sortedNews.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setNewsOpen(o => !o); }}
              style={{
                marginTop: 8,
                background: 'none', border: 'none', padding: 0,
                fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 11.5,
                color: hasAttention ? 'var(--t-coral)' : 'var(--t-brass-700)',
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              {newsOpen ? '收合' : `還有 ${moreCount} 則`}
              <Icon name={newsOpen ? 'chevdown' : 'chevright'} size={11} stroke={2}/>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
const pillSmall = (bg, fg) => ({
  padding: '2px 7px', background: bg, color: fg,
  borderRadius: 'var(--t-r-pill)',
  fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 10.5,
  lineHeight: 1.4, whiteSpace: 'nowrap',
});

/* ─────────────────────────────────────────────────────────
   Bottom tab bar
   ───────────────────────────────────────────────────────── */
const TabBar = ({ active, onPick }) => {
  const items = [
    { id: 'home',    label: '首頁',  icon: 'home',  sub: '今日任務 · 待處理' },
    { id: 'growth',  label: '週報',  icon: 'chart', sub: '本週觀察與紀錄' },
    { id: 'manage',  label: '管理',  icon: 'settings', sub: '任務 · 獎勵 · 設定' },
  ];
  return (
    <nav style={{
      height: 84,
      borderTop: '1px solid var(--t-hairline)',
      background: 'rgba(250,248,245,0.92)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'stretch', justifyContent: 'center',
      gap: 4,
      flexShrink: 0,
    }}>
      {items.map(it => {
        const isActive = it.id === active;
        return (
          <button key={it.id} onClick={() => onPick(it.id)} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            padding: '0 28px',
            background: 'transparent',
            border: 'none',
            borderTop: '2px solid transparent',
            color: isActive ? 'var(--t-navy)' : 'var(--t-ink-muted)',
            cursor: 'pointer',
            fontFamily: 'var(--t-sans)',
            position: 'relative',
            minWidth: 220,
          }}>
            {isActive && <div style={{
              position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
              width: 42, height: 2, background: 'var(--t-navy)', borderRadius: '0 0 2px 2px',
            }}/>}
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: isActive ? 'var(--t-navy)' : 'transparent',
              color: isActive ? '#fff' : 'var(--t-ink-muted)',
              border: isActive ? 'none' : '1px solid var(--t-hairline)',
              transition: 'background-color .2s var(--t-ease), color .2s var(--t-ease), border-color .2s var(--t-ease), box-shadow .2s var(--t-ease)',
            }}>
              <Icon name={it.icon} size={20} stroke={1.7}/>
            </div>
            <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
              <span style={{
                fontWeight: 600, fontSize: 14.5,
                color: isActive ? 'var(--t-ink)' : 'var(--t-ink-soft)',
              }}>{it.label}</span>
              <span style={{
                fontSize: 11, color: 'var(--t-ink-muted)', marginTop: 2,
                letterSpacing: '0.04em',
              }}>{it.sub}</span>
            </div>
          </button>
        );
      })}
    </nav>
  );
};

/* ─────────────────────────────────────────────────────────
   Empty-state placeholders for Tabs 2 & 3
   ───────────────────────────────────────────────────────── */
const EmptyTab = ({ eyebrow, title, body, points, accent = 'var(--t-navy)' }) => (
  <div style={{
    flex: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 40,
  }}>
    <div style={{
      maxWidth: 620,
      padding: '44px 48px',
      background: '#fff',
      border: '1px solid var(--t-hairline)',
      borderRadius: 'var(--t-r-xl)',
      boxShadow: 'var(--t-shadow-card)',
      textAlign: 'left',
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 52, height: 52, borderRadius: 14,
        background: 'var(--t-paper-warm)',
        color: accent,
        marginBottom: 20,
      }}>
        <Icon name="sparkle" size={26} stroke={1.5}/>
      </div>
      <div className="t-eyebrow" style={{ marginBottom: 8 }}>{eyebrow}</div>
      <h2 className="t-h1" style={{ fontSize: 30, marginBottom: 14 }}>{title}</h2>
      <p style={{
        fontFamily: 'var(--t-sans)', fontSize: 15, lineHeight: 1.65,
        color: 'var(--t-ink-soft)', margin: 0, marginBottom: 20,
      }}>{body}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {points.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{
              flexShrink: 0, marginTop: 5,
              width: 5, height: 5, borderRadius: '50%', background: accent,
            }}/>
            <div>
              <div style={{ fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 14, color: 'var(--t-ink)' }}>{p.h}</div>
              <div style={{ fontFamily: 'var(--t-sans)', fontSize: 13, color: 'var(--t-ink-muted)', marginTop: 2, lineHeight: 1.5 }}>{p.d}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: 22, padding: '10px 14px',
        background: 'var(--t-paper-warm)',
        borderRadius: 'var(--t-r-md)',
        fontFamily: 'var(--t-sans)', fontSize: 12.5,
        color: 'var(--t-ink-muted)',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>
        <Icon name="dot" size={10} color="var(--t-brass)"/>
        待設計 · 點擊下方分頁可切換回主頁面
      </div>
    </div>
  </div>
);

const GrowthTab = () => window.SW_GrowthTab ? React.createElement(window.SW_GrowthTab) : null;

const ManageTab = ({ childId, onPickChild }) => window.SW_ManageTab
  ? React.createElement(window.SW_ManageTab, { childId, onPickChild })
  : null;

/* ─────────────────────────────────────────────────────────
   App
   ───────────────────────────────────────────────────────── */
const App = () => {
  const [tab, setTab] = useState('home');
  const [childId, setChildId] = useState(window.SW_DATA.CHILDREN[0].id);
  const [quickSendOpen, setQuickSendOpen] = useState(false);
  const child = window.SW_DATA.CHILDREN.find(c => c.id === childId);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <TopHeader />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {tab === 'home' && <Sidebar activeId={childId} onPick={setChildId} onGoToGrowth={() => setTab('growth')} />}

        <main style={{
          flex: 1, minWidth: 0,
          padding: tab === 'home' ? '24px 28px 22px' : 0,
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          {tab === 'home'    && <DashboardTab child={child} key={childId} onOpenQuickSend={() => setQuickSendOpen(true)} />}
          {tab === 'growth'  && <GrowthTab />}
          {tab === 'manage'  && <ManageTab childId={childId} onPickChild={setChildId} />}
        </main>
      </div>

      <TabBar active={tab} onPick={setTab} />

      {/* Full-screen overlay modal */}
      <QuickSendModal
        open={quickSendOpen}
        onClose={() => setQuickSendOpen(false)}
        initialChild={child}
      />
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
