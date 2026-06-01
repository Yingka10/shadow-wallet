// Rewards (兌換審核) screen — re-architected
// Flow: kid wishes → AI screening → either AI blocks (with reason to kid) OR passes to parent → parent approves/denies/modifies
// 3 tabs: 1) 待審核 (kid proposals)  2) 我提案的 (parent-proposed rewards in wish pool)  3) 紀錄

function RewardsScreen({ child, kids, redemptions, history, onAct, nav }) {
  const [tab, setTab] = React.useState('pending');
  const pending = redemptions.filter(r => r.status === 'pending');
  const past = history;

  // AI screened-out count this week (canned)
  const aiBlocked = 4;

  return (
    <div className="p-screen" style={{ padding: '8px 16px 110px' }}>
      <div style={{ padding: '14px 4px 12px' }}>
        <div className="p-eyebrow" style={{ marginBottom: 6 }}>兌換審核</div>
        <div className="p-display" style={{ lineHeight: 1.2 }}>
          {pending.length > 0
            ? <>有 <span style={{ color: 'var(--p-teal-500)' }}>{pending.length}</span> 件等你看看</>
            : <>暫無待審申請</>
          }
        </div>
        <div className="p-meta" style={{ marginTop: 6 }}>
          AI 已先做初審，協助你 30 秒內做決定
        </div>
      </div>

      {/* AI Screening status pill */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px',
        background: 'var(--p-teal-50)', border: '1px solid var(--p-teal-100)',
        borderRadius: 12, marginBottom: 14,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'var(--p-teal-500)', color: '#FFFFFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon.sparkle size={14}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: 'var(--p-ink-800)', fontWeight: 600 }}>
            本週 AI 已擋下 {aiBlocked} 件不合理願望
          </div>
          <div style={{ fontSize: 11, color: 'var(--p-ink-500)' }}>
            幣值太高、有安全疑慮、或重複提案——AI 直接告訴孩子原因
          </div>
        </div>
        <button style={{ fontSize: 12, fontWeight: 600, color: 'var(--p-teal-500)', display: 'inline-flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}>
          查看 <Icon.chevR size={11}/>
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', padding: 3, gap: 0,
        background: 'var(--p-ivory-100)', borderRadius: 999,
        marginBottom: 16,
      }}>
        {[
          { id: 'pending', label: '待審核', count: pending.length },
          { id: 'proposed', label: '家長提案獎勵', count: PARENT_PROPOSALS.length },
          { id: 'history', label: '紀錄', count: past.length },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '8px 8px', borderRadius: 999,
            fontSize: 13, fontWeight: 500,
            background: tab === t.id ? '#FFFFFF' : 'transparent',
            color: tab === t.id ? 'var(--p-ink-900)' : 'var(--p-ink-500)',
            boxShadow: tab === t.id ? 'var(--p-shadow-card)' : 'none',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
            {t.label}
            <span className="p-num" style={{
              fontSize: 11, fontWeight: 600,
              color: tab === t.id ? 'var(--p-teal-500)' : 'var(--p-ink-400)',
              padding: '1px 6px', borderRadius: 999,
              background: tab === t.id ? 'var(--p-teal-50)' : 'transparent',
            }}>{t.count}</span>
          </button>
        ))}
      </div>

      {tab === 'pending' && (
        <PendingTab pending={pending} kids={kids} onAct={onAct}/>
      )}
      {tab === 'proposed' && (
        <ProposedTab kids={kids} nav={nav}/>
      )}
      {tab === 'history' && (
        <HistoryTab past={past} kids={kids}/>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Tab 1 — Pending parent review
// ──────────────────────────────────────────────────────
function PendingTab({ pending, kids, onAct }) {
  if (pending.length === 0) {
    return <EmptyState
      title="目前沒有待審申請"
      desc="孩子在許願池許願後，通過 AI 初篩的會出現在這裡"
    />;
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {pending.map(r => (
        <RedemptionCard key={r.id} r={r} kid={kids.find(k => k.id === r.kidId)} onAct={onAct}/>
      ))}
    </div>
  );
}

function RedemptionCard({ r, kid, onAct }) {
  const [closing, setClosing] = React.useState(null);
  const [editing, setEditing] = React.useState(false);
  const [adjusted, setAdjusted] = React.useState(r.suggested || r.coins);

  const handle = (kind) => {
    setClosing(kind);
    setTimeout(() => onAct(r.id, kind), 320);
  };

  // AI verdict styling
  const verdictMap = {
    ok:   { tone: 'sage', label: '合理',         color: 'var(--p-sage-500)', bg: '#F4F8EE' },
    high: { tone: 'warn', label: '幣值偏高',     color: 'var(--p-warn)',     bg: '#FBF1DC' },
    adj:  { tone: 'clay', label: '建議調整幣值', color: 'var(--p-clay-500)', bg: '#FAF1E7' },
  };
  const v = verdictMap[r.ai.verdict] || verdictMap.ok;

  return (
    <div style={{
      background: '#FFFFFF', borderRadius: 18,
      border: '1px solid var(--border-soft)',
      boxShadow: 'var(--p-shadow-card)',
      overflow: 'hidden',
      transition: 'transform 320ms var(--ease-out, cubic-bezier(0.16,1,0.3,1)), opacity 320ms',
      transform: closing ? `translateX(${closing === 'ok' ? '110%' : '-110%'})` : 'none',
      opacity: closing ? 0 : 1,
    }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar child={kid} size={32}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-ink-900)' }}>{kid.name} 許願</div>
          <div style={{ fontSize: 11, color: 'var(--p-ink-500)' }}>{r.time}</div>
        </div>
        <Pill tone="teal" size="sm"><Icon.sparkle size={10}/>已通過 AI 初篩</Pill>
      </div>

      {/* Wish */}
      <div style={{ padding: '6px 16px 12px' }}>
        <div style={{
          fontFamily: 'var(--p-font-display)', fontSize: 20, fontWeight: 500,
          color: 'var(--p-ink-900)', lineHeight: 1.3, marginBottom: 6,
        }}>
          {r.name}
        </div>
        {r.detail && (
          <div style={{
            fontSize: 13, color: 'var(--p-ink-500)', fontStyle: 'italic',
            lineHeight: 1.5, paddingLeft: 10, borderLeft: '2px solid var(--p-ivory-300)',
          }}>{r.detail}</div>
        )}
      </div>

      {/* Coin value — kid's offer vs AI suggestion */}
      <div style={{
        margin: '0 12px 12px', padding: '12px 14px',
        background: 'var(--p-ivory-100)', borderRadius: 12,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--p-ink-500)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
            孩子自定幣值
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span className="p-num" style={{
              fontFamily: 'var(--p-font-display)', fontSize: 22, fontWeight: 500,
              color: 'var(--p-ink-900)',
            }}>{r.coins}</span>
            <CoinGlyph size={14}/>
          </div>
        </div>
        {r.suggested && r.suggested !== r.coins && (
          <>
            <Icon.chevR size={14}/>
            <div style={{ flex: 1, textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: v.color, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
                AI 建議
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span className="p-num" style={{
                  fontFamily: 'var(--p-font-display)', fontSize: 22, fontWeight: 500,
                  color: v.color,
                }}>{r.suggested}</span>
                <CoinGlyph size={14}/>
              </div>
            </div>
          </>
        )}
      </div>

      {/* AI verdict + reason */}
      <div style={{
        margin: '0 12px 12px',
        background: v.bg, borderRadius: 12, padding: '10px 12px',
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: v.color, color: '#FFFFFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon.sparkle size={12}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--p-ink-700)', letterSpacing: '0.08em' }}>AI 初審</span>
            <Pill tone={v.tone} size="sm">{v.label}</Pill>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--p-ink-700)', lineHeight: 1.5 }}>
            {r.ai.reason}
          </div>
        </div>
      </div>

      {/* Inline edit panel */}
      {editing && (
        <div style={{
          margin: '0 12px 12px', padding: '12px 14px',
          background: '#FFFFFF', border: '1px solid var(--p-teal-200)',
          borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--p-ink-900)' }}>調整幣值後核准</div>
            <div style={{ fontSize: 11, color: 'var(--p-ink-500)' }}>會以新幣值扣款</div>
          </div>
          <Stepper value={adjusted} onChange={setAdjusted} step={5} min={5} max={300} suffix="幣"/>
        </div>
      )}

      {/* Actions */}
      {!editing ? (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0,
          borderTop: '1px solid var(--border-soft)',
        }}>
          <ActionBtn onClick={() => handle('no')} icon={<Icon.x size={15}/>} label="駁回" color="var(--p-ink-700)" divider/>
          <ActionBtn onClick={() => setEditing(true)} icon={<EditIcon size={15}/>} label="修改幣值" color="var(--p-clay-500)" divider/>
          <ActionBtn onClick={() => handle('ok')} icon={<Icon.check size={15}/>} label="核准" color="var(--p-teal-500)"/>
        </div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 0,
          borderTop: '1px solid var(--border-soft)',
        }}>
          <ActionBtn onClick={() => setEditing(false)} icon={<Icon.x size={15}/>} label="取消" color="var(--p-ink-500)" divider/>
          <ActionBtn onClick={() => handle('ok-adj')} icon={<Icon.check size={15}/>} label={`以 ${adjusted} 幣核准`} color="var(--p-teal-500)"/>
        </div>
      )}
    </div>
  );
}

function ActionBtn({ onClick, icon, label, color, divider }) {
  return (
    <button onClick={onClick} style={{
      padding: '13px 0', fontSize: 14, fontWeight: 600,
      color, borderRight: divider ? '1px solid var(--border-soft)' : 'none',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      whiteSpace: 'nowrap',
    }}>{icon}{label}</button>
  );
}

function EditIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4 5 13l-1 5 5-1 9-9"/>
      <path d="m14 4 4 4"/>
    </svg>
  );
}

// ──────────────────────────────────────────────────────
// Tab 2 — Parent-proposed rewards (in the wish pool)
// ──────────────────────────────────────────────────────
const PARENT_PROPOSALS = [
  {
    id: 'pp1', title: '週末去公園野餐', coins: 30,
    desc: '本週表現好額外加碼',
    forKids: ['yu', 'en'],
    status: 'open', expiry: '本週日前',
  },
  {
    id: 'pp2', title: '挑一本繪本帶回家', coins: 45,
    desc: '專為小宇加入願望池',
    forKids: ['yu'],
    status: 'open', expiry: '無期限',
  },
  {
    id: 'pp3', title: '看一場電影', coins: 60,
    desc: '上月生日加碼提案',
    forKids: ['en'],
    status: 'taken', takenBy: 'en', takenAt: '5/2',
  },
];

function ProposedTab({ kids, nav }) {
  return (
    <div>
      {/* Header CTA */}
      <button onClick={() => nav && nav.go('newProposal')} style={{
        width: '100%', padding: '14px 16px', marginBottom: 12,
        background: '#FFFFFF', borderRadius: 14,
        border: '1.5px dashed var(--p-teal-300)',
        display: 'flex', alignItems: 'center', gap: 12,
        cursor: 'pointer',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'var(--p-teal-50)', color: 'var(--p-teal-500)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon.plus size={18}/>
        </div>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--p-ink-900)' }}>新增提案獎勵</div>
          <div style={{ fontSize: 11.5, color: 'var(--p-ink-500)' }}>放入孩子的願望池，他們會看到</div>
        </div>
        <Icon.chevR size={14}/>
      </button>

      {/* Quick tip */}
      <div style={{
        fontSize: 12, color: 'var(--p-ink-500)', lineHeight: 1.5,
        padding: '0 4px 12px',
      }}>
        家長提案的獎勵會出現在孩子的願望池，但不是孩子自己許的願——可以用來引導他們做某些事情，或在特別的日子加碼。
      </div>

      {/* Proposal cards */}
      <div style={{ display: 'grid', gap: 10 }}>
        {PARENT_PROPOSALS.map(p => (
          <ProposalCard key={p.id} p={p} kids={kids}/>
        ))}
      </div>
    </div>
  );
}

function ProposalCard({ p, kids }) {
  const targeted = kids.filter(k => p.forKids.includes(k.id));
  const isTaken = p.status === 'taken';
  return (
    <div style={{
      background: '#FFFFFF', borderRadius: 14, padding: '14px 16px',
      border: '1px solid var(--border-soft)',
      boxShadow: 'var(--p-shadow-card)',
      opacity: isTaken ? 0.78 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--p-font-display)', fontSize: 17, fontWeight: 500,
            color: 'var(--p-ink-900)', lineHeight: 1.3,
          }}>
            {p.title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--p-ink-500)', marginTop: 2 }}>{p.desc}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="p-num" style={{
            fontFamily: 'var(--p-font-display)', fontSize: 20, fontWeight: 500,
            color: 'var(--p-ink-900)', display: 'inline-flex', alignItems: 'center', gap: 3,
          }}>
            {p.coins}<CoinGlyph size={13}/>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {targeted.map(k => (
            <div key={k.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Avatar child={k} size={20}/>
              <span style={{ fontSize: 11.5, color: 'var(--p-ink-500)' }}>{k.name}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!isTaken ? (
            <>
              <Pill tone="teal" size="sm">願望池中</Pill>
              <span style={{ fontSize: 11, color: 'var(--p-ink-400)' }}>· {p.expiry}</span>
            </>
          ) : (
            <Pill tone="sage" size="sm"><Icon.check size={10}/>{kids.find(k => k.id === p.takenBy)?.name} 已兌換 · {p.takenAt}</Pill>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Tab 3 — History
// ──────────────────────────────────────────────────────
function HistoryTab({ past, kids }) {
  return (
    <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
      {past.map((r, i) => (
        <HistoryRow key={r.id} r={r} kid={kids.find(k => k.id === r.kidId)} divider={i < past.length - 1}/>
      ))}
    </div>
  );
}

function HistoryRow({ r, kid, divider }) {
  const isApproved = r.status === 'approved';
  return (
    <div style={{
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
      borderBottom: divider ? '1px solid var(--border-soft)' : 'none',
    }}>
      <Avatar child={kid} size={32}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--p-ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.name}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--p-ink-500)' }}>{r.date} · {kid.name}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="p-num" style={{ fontSize: 14, fontWeight: 600, color: 'var(--p-ink-900)', display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
          {r.coins}<CoinGlyph size={11}/>
        </div>
        <Pill tone={isApproved ? 'sage' : 'neutral'} size="sm">{isApproved ? '已核准' : '已駁回'}</Pill>
      </div>
    </div>
  );
}

function EmptyState({ title, desc }) {
  return (
    <div style={{
      padding: '36px 16px', textAlign: 'center',
      background: '#FFFFFF', borderRadius: 16,
      border: '1px solid var(--border-soft)',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: 'var(--p-ivory-100)', color: 'var(--p-ink-400)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 10,
      }}>
        <Icon.gift size={22}/>
      </div>
      <div style={{ fontFamily: 'var(--p-font-display)', fontSize: 17, fontWeight: 500, color: 'var(--p-ink-900)', marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: 'var(--p-ink-500)', lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

Object.assign(window, { RewardsScreen });
