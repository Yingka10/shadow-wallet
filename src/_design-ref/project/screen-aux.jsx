// Onboarding (phone usage question page) + Settings (Parent Mode)

// ──────────────────────────────────────────────────────
// Onboarding — step 3, phone usage page
// ──────────────────────────────────────────────────────
function OnboardingScreen({ nav }) {
  const [pick, setPick] = React.useState(null);

  const options = [
    {
      id: 'own',
      title: '孩子有自己的手機',
      desc: '小孩端 App 直接裝在他的裝置上，獨立使用。',
      icon: <Icon.phone size={22}/>,
      tag: '最單純',
    },
    {
      id: 'share',
      title: '親子共用一支手機',
      desc: '你跟孩子用同一支，需要時切換到孩子模式。',
      icon: <PhonesIcon/>,
      tag: '會引導你設定 Child Mode',
      hot: true,
    },
    {
      id: 'noown',
      title: '孩子沒有手機，由我代操作',
      desc: '所有操作由你完成，週末再給孩子看成果。',
      icon: <Icon.hand size={22}/>,
      tag: '會引導你設定 Child Mode',
    },
  ];

  return (
    <div className="p-screen" style={{ padding: '8px 22px 24px', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Steps indicator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0 22px' }}>
        <button style={{ color: 'var(--p-ink-500)', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
          <Icon.arrowL size={16}/>上一步
        </button>
        <div style={{ display: 'inline-flex', gap: 6 }}>
          {[1,2,3,4,5,6].map(n => (
            <span key={n} style={{
              width: n === 3 ? 20 : 6, height: 6, borderRadius: 999,
              background: n <= 3 ? 'var(--p-teal-500)' : 'var(--p-ivory-200)',
              transition: 'width 240ms',
            }}/>
          ))}
        </div>
        <span style={{ fontSize: 12, color: 'var(--p-ink-500)' }}>3 / 6</span>
      </div>

      {/* Title */}
      <div style={{ marginBottom: 24 }}>
        <div className="p-eyebrow" style={{ marginBottom: 8 }}>關於使用方式</div>
        <h1 className="p-display" style={{ fontSize: 30, lineHeight: 1.2 }}>
          你們家
          <br/>
          手機怎麼用？
        </h1>
        <p className="p-body" style={{ marginTop: 12, color: 'var(--p-ink-700)', fontSize: 15, lineHeight: 1.6 }}>
          這個答案會決定我們怎麼幫你設定──孩子有自己的手機跟沒有，是兩種完全不一樣的體驗。
        </p>
      </div>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        {options.map(o => {
          const isPicked = pick === o.id;
          return (
            <button key={o.id} onClick={() => setPick(o.id)} style={{
              background: isPicked ? 'var(--p-teal-500)' : '#FFFFFF',
              color: isPicked ? '#FFFFFF' : 'var(--p-ink-900)',
              border: `1px solid ${isPicked ? 'var(--p-teal-500)' : 'var(--border-soft)'}`,
              borderRadius: 16,
              padding: '16px 16px',
              textAlign: 'left',
              boxShadow: isPicked ? 'var(--p-shadow-pop)' : 'var(--p-shadow-card)',
              transition: 'background 220ms, transform 220ms, box-shadow 220ms',
              transform: isPicked ? 'translateY(-1px)' : 'none',
              display: 'flex', gap: 14, alignItems: 'flex-start',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: isPicked ? 'rgba(255,255,255,0.16)' : 'var(--p-ivory-100)',
                color: isPicked ? '#FFFFFF' : 'var(--p-teal-500)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>{o.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{
                    fontFamily: 'var(--p-font-display)', fontSize: 16.5, fontWeight: 600,
                  }}>{o.title}</span>
                  {o.hot && !isPicked && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 6px',
                      borderRadius: 999, background: 'var(--p-clay-300)',
                      color: '#5C3A22', letterSpacing: '0.04em',
                    }}>常見</span>
                  )}
                </div>
                <div style={{
                  fontSize: 13, lineHeight: 1.5,
                  color: isPicked ? 'rgba(255,255,255,0.85)' : 'var(--p-ink-500)',
                }}>{o.desc}</div>
                <div style={{
                  marginTop: 8, fontSize: 11, fontWeight: 600,
                  color: isPicked ? 'rgba(255,255,255,0.7)' : 'var(--p-teal-500)',
                  letterSpacing: '0.05em',
                }}>· {o.tag}</div>
              </div>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                background: isPicked ? '#FFFFFF' : 'transparent',
                border: `2px solid ${isPicked ? '#FFFFFF' : 'var(--p-ivory-300)'}`,
                color: 'var(--p-teal-500)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: 4,
              }}>
                {isPicked && <Icon.check size={14}/>}
              </div>
            </button>
          );
        })}
      </div>

      {/* CTA */}
      <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button variant="primary" full size="lg" disabled={!pick} onClick={() => nav.go('dashboard')}>
          繼續 <Icon.chevR size={14}/>
        </Button>
        <button style={{ fontSize: 13, color: 'var(--p-ink-500)' }}>
          我之後再決定
        </button>
      </div>
    </div>
  );
}

function PhonesIcon() {
  return (
    <svg width="26" height="22" viewBox="0 0 28 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="9" height="16" rx="2"/>
      <path d="M6 16h1"/>
      <rect x="15" y="3" width="11" height="18" rx="2.5"/>
      <path d="M19 18h3"/>
    </svg>
  );
}

// ──────────────────────────────────────────────────────
// Settings — Parent Mode focus
// ──────────────────────────────────────────────────────
function SettingsScreen({ nav, onSwitchToChild, toggles, setToggles }) {
  const [lock, setLock] = React.useState(toggles.lock || '密碼');

  return (
    <div className="p-screen" style={{ padding: '0 0 24px' }}>
      <div style={{ padding: '14px 18px 8px' }}>
        <div className="p-eyebrow" style={{ marginBottom: 4 }}>設定</div>
        <h1 className="p-display" style={{ fontSize: 26 }}>偏好與裝置</h1>
      </div>

      {/* Parent mode block */}
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{
          background: 'linear-gradient(160deg, var(--p-teal-500) 0%, var(--p-teal-600) 100%)',
          color: '#FFFFFF',
          borderRadius: 18, padding: '20px 20px 18px',
          boxShadow: 'var(--p-shadow-pop)',
          overflow: 'hidden', position: 'relative',
        }}>
          {/* deco */}
          <div style={{
            position: 'absolute', top: -40, right: -30,
            width: 160, height: 160, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)',
          }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(255,255,255,0.16)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon.fox size={18}/>
            </div>
            <div className="p-eyebrow" style={{ color: 'rgba(255,255,255,0.7)' }}>Child Mode</div>
          </div>
          <div style={{
            fontFamily: 'var(--p-font-display)', fontSize: 22, lineHeight: 1.3,
            fontWeight: 500, marginBottom: 8,
          }}>
            把手機交給孩子時，
            <br/>
            切換成孩子模式
          </div>
          <p style={{
            fontSize: 13.5, lineHeight: 1.55,
            color: 'rgba(255,255,255,0.78)', marginBottom: 16,
          }}>
            切換後，孩子只能看到自己的任務、撲滿、目標。<br/>
            無法進入設定，也看不到審核中的兌換申請。
          </p>
          <button onClick={onSwitchToChild} style={{
            background: '#FFFFFF', color: 'var(--p-teal-500)',
            border: 'none', borderRadius: 12, padding: '12px 18px',
            fontSize: 14.5, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            立即切換 <Icon.chevR size={14}/>
          </button>
        </div>
      </div>

      {/* Switch method */}
      <div style={{ padding: '20px 18px 6px' }}>
        <div className="p-eyebrow" style={{ marginBottom: 10, color: 'var(--p-ink-500)' }}>切換回家長端的驗證方式</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { id: '密碼', icon: <Icon.lock size={18}/>, label: '4 位密碼', sub: '安全' },
            { id: '手勢', icon: <GestureIcon/>, label: '手勢', sub: '輕鬆' },
            { id: '不設限', icon: <Icon.sun size={18}/>, label: '不設限', sub: '自由' },
          ].map(o => (
            <button key={o.id} onClick={() => setLock(o.id)} style={{
              padding: '14px 8px', borderRadius: 12,
              background: lock === o.id ? '#FFFFFF' : 'transparent',
              border: `1px solid ${lock === o.id ? 'var(--p-teal-500)' : 'var(--border-soft)'}`,
              boxShadow: lock === o.id ? '0 0 0 3px rgba(35,78,71,0.08)' : 'none',
              color: lock === o.id ? 'var(--p-teal-500)' : 'var(--p-ink-700)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            }}>
              {o.icon}
              <span style={{ fontSize: 13, fontWeight: 600 }}>{o.label}</span>
              <span style={{ fontSize: 10.5, color: 'var(--p-ink-500)' }}>{o.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Settings list */}
      <div style={{ padding: '20px 16px 0' }}>
        <SettingGroup title="家庭成員">
          <SettingRow icon={<Icon.user/>} label="新增孩子" sub="目前 2 位" chev/>
          <SettingRow icon={<Icon.flag/>} label="管理目標清單" sub="3 個進行中" chev/>
        </SettingGroup>

        <SettingGroup title="共用裝置">
          <SettingRow icon={<Icon.fox/>} label="切換驗證方式" sub={lock} chev/>
          <SettingRow icon={<Icon.hand/>} label="孩子模式停留時限" sub="不限制" chev/>
        </SettingGroup>

        <SettingGroup title="通知">
          <SettingRow icon={<Icon.bell/>} label="待審申請" right={<Toggle on={toggles.notif1} onChange={v => setToggles(t => ({...t, notif1: v}))}/>}/>
          <SettingRow icon={<Icon.sparkle/>} label="每週洞察推播" sub="週日早上 9 點" right={<Toggle on={toggles.notif2} onChange={v => setToggles(t => ({...t, notif2: v}))}/>}/>
        </SettingGroup>

        <SettingGroup title="帳號">
          <SettingRow icon={<Icon.user/>} label="個人資料" chev/>
          <SettingRow label="登出" tone="danger"/>
        </SettingGroup>
      </div>

      <div style={{
        padding: '24px 18px 0', textAlign: 'center',
        color: 'var(--p-ink-400)', fontSize: 11,
      }}>
        影子貨幣錢包 · 家長端 1.0
      </div>
    </div>
  );
}

function SettingGroup({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="p-eyebrow" style={{ marginBottom: 8, paddingLeft: 4, color: 'var(--p-ink-500)' }}>{title}</div>
      <div style={{
        background: '#FFFFFF', borderRadius: 14, overflow: 'hidden',
        border: '1px solid var(--border-soft)',
      }}>
        {children}
      </div>
    </div>
  );
}

function SettingRow({ icon, label, sub, chev, right, tone }) {
  return (
    <div style={{
      padding: '13px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
      borderBottom: '1px solid var(--border-soft)',
      cursor: 'pointer',
    }}>
      {icon && (
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: 'var(--p-ivory-100)',
          color: tone === 'danger' ? 'var(--p-error)' : 'var(--p-teal-500)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>{React.cloneElement(icon, { size: 16 })}</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14.5, fontWeight: 500,
          color: tone === 'danger' ? 'var(--p-error)' : 'var(--p-ink-900)',
        }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: 'var(--p-ink-500)', marginTop: 1 }}>{sub}</div>}
      </div>
      {right}
      {chev && <Icon.chevR size={14}/>}
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      width: 42, height: 26, borderRadius: 999,
      background: on ? 'var(--p-teal-500)' : 'var(--p-ivory-300)',
      position: 'relative',
      transition: 'background 220ms',
    }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 18 : 2,
        width: 22, height: 22, borderRadius: '50%',
        background: '#FFFFFF',
        boxShadow: '0 1px 3px rgba(28,27,23,0.2)',
        transition: 'left 220ms var(--ease-bounce, cubic-bezier(0.34,1.56,0.64,1))',
      }}/>
    </button>
  );
}

function GestureIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="2"/>
      <circle cx="12" cy="6" r="2"/>
      <circle cx="18" cy="6" r="2"/>
      <circle cx="6" cy="12" r="2"/>
      <circle cx="18" cy="12" r="2"/>
      <circle cx="12" cy="18" r="2"/>
      <path d="m6 6 6 12M12 6l6 12M6 12l6 6" strokeOpacity="0.4"/>
    </svg>
  );
}

// ──────────────────────────────────────────────────────
// Child Mode preview screen — minimal, shows the switched state
// ──────────────────────────────────────────────────────
function ChildModeScreen({ child, onExit }) {
  return (
    <div style={{
      minHeight: '100%',
      background: 'linear-gradient(180deg, #FFF2DF 0%, #FFE3D6 100%)',
      backgroundImage: 'radial-gradient(rgba(95, 60, 30, 0.04) 1px, transparent 1px)',
      backgroundSize: '5px 5px',
      backgroundColor: '#FFF2DF',
      padding: '20px 18px 100px',
      position: 'relative',
      animation: 'p-fade-in 420ms cubic-bezier(0.16,1,0.3,1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar child={child} size={36}/>
          <div>
            <div style={{ fontFamily: 'var(--font-display, "Baloo 2")', fontSize: 18, fontWeight: 700, color: '#3B2A1E' }}>
              嗨，{child.name}！
            </div>
            <div style={{ fontSize: 11, color: '#876A53' }}>孩子模式</div>
          </div>
        </div>
        <button onClick={onExit} style={{
          padding: '7px 12px', borderRadius: 999,
          background: 'rgba(255,255,255,0.6)', color: '#5A4232',
          fontSize: 12, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <Icon.lock size={12}/>切回家長
        </button>
      </div>

      <div style={{
        background: 'linear-gradient(135deg, #FFF0BF 0%, #FFD86B 100%)',
        borderRadius: 24, padding: 22, marginBottom: 14,
        boxShadow: '0 12px 32px -12px rgba(245,184,0,0.45)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -30, right: -20,
          width: 120, height: 120, borderRadius: '50%',
          background: 'rgba(255,255,255,0.3)',
        }}/>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#A87800', letterSpacing: '0.08em', marginBottom: 6 }}>
          我的撲滿
        </div>
        <div style={{
          fontFamily: '"Baloo 2", "Noto Sans TC", system-ui',
          fontSize: 56, fontWeight: 800, color: '#3B2A1E',
          lineHeight: 1, letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {child.coins}<span style={{ fontSize: 22, color: '#876A53', marginLeft: 6, fontWeight: 700 }}>顆</span>
        </div>
        <div style={{ marginTop: 12, fontSize: 14, color: '#5A4232' }}>
          再 <strong style={{ color: '#3B2A1E', fontSize: 16 }}>{child.goal.target - child.goal.current}</strong> 顆就能換 <strong>{child.goal.name}</strong>！
        </div>
      </div>

      <div style={{
        background: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 14,
        boxShadow: '0 6px 18px -8px rgba(95, 60, 30, 0.18)',
      }}>
        <div style={{ fontFamily: '"Baloo 2"', fontSize: 18, fontWeight: 700, color: '#3B2A1E', marginBottom: 12 }}>
          今天還沒做的事
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { name: '練琴 30 分鐘', tag: '里程碑', tagColor: '#9B82C7' },
            { name: '幫弟弟讀繪本', tag: '+5 金幣', tagColor: '#D69A00' },
            { name: '整理房間', tag: '本分', tagColor: '#5994B3' },
          ].map((t, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 12px', borderRadius: 14,
              background: '#FFF8EE',
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                border: '2px solid #EDD7B4',
              }}/>
              <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: '#3B2A1E' }}>{t.name}</div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                background: t.tagColor + '22', color: t.tagColor,
              }}>{t.tag}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Locked overlay note */}
      <div style={{
        textAlign: 'center', fontSize: 12, color: '#876A53',
        padding: '14px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        <Icon.lock size={12}/>
        設定與審核被鎖住，只有爸媽能進入
      </div>
    </div>
  );
}

Object.assign(window, { OnboardingScreen, SettingsScreen, ChildModeScreen });
