// Shadow Wallet · Parent Tablet — Tab 1 主頁面 (Dashboard)

const { useState: useStateD, useEffect: useEffectD } = React;

/* ─────────────────────────────────────────────────────────
   Child header strip — clean, 4 blocks, no warning.
   ───────────────────────────────────────────────────────── */
const ChildHeaderStrip = ({ child }) => {
  const pct = Math.round(child.doneToday / child.totalToday * 100);
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 28,
      padding: '24px 30px',
      background: '#fff',
      border: '1px solid var(--t-hairline)',
      borderRadius: 'var(--t-r-lg)',
      marginBottom: 26
    }}>
      {/* Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexShrink: 0 }}>
        <Avatar child={child} size={60} />
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h1 className="t-h1" style={{ fontSize: 28, margin: 0 }}>{child.name}</h1>
            <span className="t-meta">{child.age} 歲</span>
          </div>
          <div className="t-meta" style={{ marginTop: 4, fontSize: 12.5 }}>家長視角 · 今天</div>
        </div>
      </div>

      <Divider />

      {/* Today task progress */}
      <Block label="今日任務" minW={210}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 10 }}>
          <span className="t-num" style={{ fontSize: 28 }}>{child.doneToday}</span>
          <span className="t-meta" style={{ fontSize: 15 }}>/ {child.totalToday}</span>
          <span className="t-meta" style={{ marginLeft: 10, fontSize: 12.5 }}>完成 {pct}%</span>
        </div>
        <Progress value={child.doneToday} total={child.totalToday} />
      </Block>

      <Divider />

      {/* Wallet balance */}
      <Block label="撲滿餘額" minW={130}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Coin size={22} />
          <span className="t-num" style={{ fontSize: 28 }}>{child.coinBalance}</span>
        </div>
        <div className="t-meta" style={{ fontSize: 12, marginTop: 4 }}>本週 +27 幣</div>
      </Block>

      <Divider />

      {/* Weekly highlight (was 今天的快訊) — now lives in sidebar; here we surface a single status line */}
      <Block label="本週狀態" minW={0} grow>
        <div style={{
          fontFamily: 'var(--t-sans)',
          fontSize: 14, lineHeight: 1.55,
          color: 'var(--t-ink-soft)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '3px 10px',
            background: 'var(--t-green-50)',
            color: 'var(--t-green)',
            border: '1px solid #C9DDD0',
            borderRadius: 'var(--t-r-pill)',
            fontWeight: 600, fontSize: 11.5
          }}>
            <Icon name="dot" size={9} color="var(--t-green)" />整體穩定
          </span>
          <span className="t-meta" style={{ fontSize: 12.5 }}>完成率 76% · 主動提案 +3</span>
        </div>
      </Block>
    </div>);

};
const Divider = () => <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--t-hairline)' }} />;
const Block = ({ label, minW, grow, children }) =>
<div style={{
  flex: grow ? '1 1 0' : `0 0 ${minW}px`,
  minWidth: minW || 0,
  display: 'flex', flexDirection: 'column', justifyContent: 'center'
}}>
    <div className="t-eyebrow" style={{ marginBottom: 8 }}>{label}</div>
    {children}
  </div>;


/* ─────────────────────────────────────────────────────────
   Long-term goals — sits above today's task list
   ───────────────────────────────────────────────────────── */
const LongTermGoals = ({ goals }) => {
  if (!goals || goals.length === 0) return null;
  return (
    <div style={{ marginBottom: 22 }}>
      <SectionHead eyebrow="進行中" title="長期目標" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {goals.map((g) => <LongTermGoalCard key={g.id} goal={g} />)}
      </div>
    </div>);

};

const LongTermGoalCard = ({ goal }) => {
  const pct = Math.round(goal.current / goal.total * 100);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 18,
      padding: '16px 20px',
      background: 'linear-gradient(180deg, #FBEFDF 0%, #FAEEDC 100%)',
      border: '1px solid #F0D5AE',
      borderRadius: 'var(--t-r-lg)'
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: 'var(--t-brass)', color: '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)'
      }}>
        <Icon name="target" size={22} stroke={1.8} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <h3 className="t-h3" style={{ fontSize: 15.5, margin: 0 }}>{goal.name}</h3>
          <span className="t-meta" style={{ fontSize: 12 }}>{goal.sub}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, maxWidth: 340 }}>
            <Progress value={goal.current} total={goal.total} color="var(--t-brass)" height={6} />
          </div>
          <span className="t-num" style={{ fontSize: 14, whiteSpace: 'nowrap' }}>
            {goal.current}<span style={{ color: 'var(--t-ink-muted)', fontWeight: 500 }}> / {goal.total} 天</span>
          </span>
        </div>
      </div>

      <div style={{
        flexShrink: 0,
        padding: '8px 14px',
        background: 'rgba(255,255,255,0.7)',
        border: '1px solid rgba(201,119,50,0.2)',
        borderRadius: 'var(--t-r-md)',
        textAlign: 'right'
      }}>
        <div className="t-eyebrow" style={{ fontSize: 10, marginBottom: 3 }}>下一個里程碑</div>
        <div style={{
          fontFamily: 'var(--t-sans)', fontSize: 12.5, fontWeight: 600,
          color: 'var(--t-brass-700)', whiteSpace: 'nowrap'
        }}>{goal.nextMilestone.name}</div>
        <div className="t-meta" style={{ fontSize: 11, marginTop: 2, whiteSpace: 'nowrap' }}>
          還差 <span className="t-num" style={{ fontSize: 12 }}>{goal.nextMilestone.daysLeft}</span> 天
        </div>
      </div>
    </div>);

};

/* ─────────────────────────────────────────────────────────
   Long-term inline pill — shown on D tasks
   ───────────────────────────────────────────────────────── */
const LongTermPill = ({ lt }) =>
<span style={{
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '2px 8px',
  background: 'var(--t-navy-50)',
  border: '1px solid var(--t-navy-100)',
  color: 'var(--t-navy)',
  borderRadius: 'var(--t-r-pill)',
  fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 11,
  whiteSpace: 'nowrap'
}}>
    <Icon name="flame" size={11} stroke={2} color="var(--t-brass)" />
    {lt.label} {lt.current}/{lt.total}
  </span>;


/* ─────────────────────────────────────────────────────────
   Mark panel — two-step: pick reason → adjust coins
   (was "Override"; renamed to 「標記」)
   ───────────────────────────────────────────────────────── */
const MarkPanel = ({ task, onApply, onClose }) => {
  const [picked, setPicked] = useStateD(null);
  const defaultCoinFor = (id) => id === 'fail' ? 0 : id === 'partial' ? Math.floor(task.coins / 2) : task.coins;
  const [coins, setCoins] = useStateD(0);

  return (
    <div style={{
      marginTop: 12, padding: 16,
      background: 'var(--t-paper-warm)',
      border: '1px solid var(--t-hairline)',
      borderRadius: 'var(--t-r-md)'
    }}>
      {/* Step 1 — Pick reason */}
      <div className="t-eyebrow" style={{ fontSize: 10.5, marginBottom: 10 }}>標記為</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {window.SW_DATA.OVERRIDE_OPTIONS.map((opt) => {
          const toneColor = opt.tone === 'danger' ? 'var(--t-coral)' :
          opt.tone === 'warn' ? 'var(--t-brass-700)' :
          'var(--t-ink-soft)';
          const active = picked?.id === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => {setPicked(opt);setCoins(defaultCoinFor(opt.id));}}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                background: active ? '#fff' : '#fff',
                border: active ? `1.5px solid ${toneColor}` : '1px solid var(--t-hairline)',
                borderRadius: 'var(--t-r-md)',
                cursor: 'pointer',
                transition: 'background-color .12s var(--t-ease), color .12s var(--t-ease), border-color .12s var(--t-ease), box-shadow .12s var(--t-ease)',
                boxShadow: active ? '0 2px 8px -4px rgba(0,0,0,0.08)' : 'none'
              }}
              onMouseEnter={(e) => {if (!active) e.currentTarget.style.borderColor = toneColor;}}
              onMouseLeave={(e) => {if (!active) e.currentTarget.style.borderColor = 'var(--t-hairline)';}}>
              
              <div style={{
                fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 13.5,
                color: toneColor, marginBottom: 4,
                display: 'flex', alignItems: 'center', gap: 6
              }}>
                {active && <Icon name="check" size={13} stroke={2.5} />}
                {opt.label}
              </div>
              <div className="t-meta" style={{ fontSize: 12, lineHeight: 1.4 }}>{opt.sub}</div>
            </button>);

        })}
      </div>

      {/* Step 2 — Adjust coins (only for tasks that earn coins) */}
      {picked && task.coins > 0 &&
      <div style={{
        marginTop: 14, paddingTop: 14,
        borderTop: '1px solid var(--t-hairline)',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap'
      }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{
            fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 13.5,
            color: 'var(--t-ink)', marginBottom: 3
          }}>要調整這個任務的金幣嗎？</div>
            <div className="t-meta" style={{ fontSize: 12 }}>
              原本是 <span className="t-num" style={{ fontSize: 12.5 }}>{task.coins}</span> 幣
            </div>
          </div>
          <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 12px',
          background: '#fff', border: '1px solid var(--t-brass-200)',
          borderRadius: 'var(--t-r-pill)'
        }}>
            <Coin size={16} />
            <input
            type="number"
            value={coins}
            onChange={(e) => setCoins(Math.max(0, parseInt(e.target.value) || 0))}
            style={{
              width: 50, border: 'none', background: 'transparent', outline: 'none',
              fontFamily: 'var(--t-data)', fontWeight: 700, fontSize: 17,
              color: 'var(--t-ink)', textAlign: 'center'
            }} />
          
            <span className="t-meta" style={{ fontSize: 11.5 }}>幣</span>
          </div>
          <Button kind="primary" small icon="check" onClick={() => onApply({ option: picked, coins })}>
            確認
          </Button>
        </div>
      }

      {/* For 0-coin tasks (A/B/D), just confirm directly */}
      {picked && task.coins === 0 &&
      <div style={{
        marginTop: 14, paddingTop: 14,
        borderTop: '1px solid var(--t-hairline)',
        display: 'flex', alignItems: 'center', gap: 12
      }}>
          <div className="t-meta" style={{ flex: 1, fontSize: 12.5 }}>
            這是沒有金幣的任務，標記後將記錄在歷史中。
          </div>
          <Button kind="primary" small icon="check" onClick={() => onApply({ option: picked, coins: 0 })}>
            確認
          </Button>
        </div>
      }

      {/* Cancel */}
      <button onClick={onClose} style={{
        marginTop: 10, background: 'none', border: 'none',
        color: 'var(--t-ink-muted)', cursor: 'pointer',
        fontFamily: 'var(--t-sans)', fontSize: 12.5
      }}>取消</button>
    </div>);

};

/* ─────────────────────────────────────────────────────────
   Single task row
   ───────────────────────────────────────────────────────── */
const TaskRow = ({ task, isLast }) => {
  const [open, setOpen] = useStateD(false);
  const [applied, setApplied] = useStateD(null); // { option, coins }
  const done = task.status === 'done';

  const displayCoins = applied ? applied.coins : task.coins;

  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid var(--t-hairline)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '16px 4px'
      }}>
        {/* Status indicator */}
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: done ? 'var(--t-green)' : 'transparent',
          border: done ? 'none' : '1.5px dashed var(--t-hairline-2)',
          color: '#fff',
          flexShrink: 0
        }}>
          {done && <Icon name="check" size={15} stroke={2.4} />}
        </div>

        {/* Name + chips */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--t-sans)', fontWeight: 600,
            fontSize: 15, color: 'var(--t-ink)',
            textDecoration: applied?.option.id === 'fail' ? 'line-through' : 'none',
            opacity: applied?.option.id === 'fail' ? 0.5 : 1
          }}>{task.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <CategoryChip cat={task.cat} />
            {task.longTerm && <LongTermPill lt={task.longTerm} />}
            {task.time &&
            <span className="t-meta" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                <Icon name="clock" size={11} /> {task.time} 完成
              </span>
            }
          </div>
        </div>

        {/* Coin value */}
        <div style={{ width: 82, textAlign: 'right' }}>
          {task.coins > 0 ?
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Coin size={16} />
              <span className="t-num" style={{ fontSize: 17 }}>{displayCoins}</span>
              {applied && displayCoins !== task.coins &&
            <span className="t-meta" style={{ fontSize: 11, textDecoration: 'line-through', marginLeft: 2 }}>{task.coins}</span>
            }
            </div> :

          <span className="t-meta" style={{ fontSize: 12 }}>—</span>
          }
        </div>

        {/* Status tag */}
        <div style={{ width: 88, display: 'flex', justifyContent: 'flex-end' }}>
          {done ?
          applied ?
          <StatusTag tone={applied.option.id === 'fail' ? 'warn' : 'brass'}>已調整</StatusTag> :
          <StatusTag tone="done" icon="check">已完成</StatusTag> :

          <StatusTag tone="pending" icon="clock">待完成</StatusTag>
          }
        </div>

        {/* Mark / Remind */}
        <div style={{ width: 92, display: 'flex', justifyContent: 'flex-end' }}>
          {done ?
          <Button
            kind={open ? 'secondary' : 'outline'}
            small
            iconRight={open ? 'x' : 'chevdown'}
            onClick={() => setOpen((v) => !v)}>
            標記</Button> :

          <Button kind="ghost" small icon="bell">提醒</Button>
          }
        </div>
      </div>

      {open && !applied &&
      <div style={{ paddingBottom: 14 }}>
          <MarkPanel
          task={task}
          onApply={(result) => {setApplied(result);setOpen(false);}}
          onClose={() => setOpen(false)} />
        
        </div>
      }
      {applied &&
      <div style={{
        margin: '0 0 14px 42px',
        fontSize: 12, fontFamily: 'var(--t-sans)',
        color: 'var(--t-ink-muted)',
        display: 'flex', alignItems: 'center', gap: 8
      }}>
          <Icon name="dot" size={10} color="var(--t-brass)" />
          已標記為「{applied.option.label}」
          {task.coins > 0 && <>· 金幣調整為 <span className="t-num" style={{ fontSize: 12 }}>{applied.coins}</span></>}
          {' '}·{' '}
          <button onClick={() => setApplied(null)} style={{
          background: 'none', border: 'none', color: 'var(--t-navy)', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 'inherit', padding: 0, textDecoration: 'underline'
        }}>還原</button>
        </div>
      }
    </div>);

};

/* ─────────────────────────────────────────────────────────
   Proposal card — "教妹妹寫名字"
   ───────────────────────────────────────────────────────── */
const ProposalCard = ({ proposal, child }) => {
  const [state, setState] = useStateD('idle'); // idle | rejecting | approved | rejected
  const [reason, setReason] = useStateD(null);
  const [coinValue, setCoinValue] = useStateD(proposal.ai.range[1]);

  if (state === 'approved') {
    return (
      <div style={proposalDoneStyle('approved')}>
        <Icon name="check" size={18} color="var(--t-green)" stroke={2.2} />
        <div>
          <div style={{ fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 14, color: 'var(--t-green)' }}>
            已同意 · 「{proposal.name}」
          </div>
          <div className="t-meta" style={{ marginTop: 2 }}>
            +{coinValue} 幣已入帳。{child.name}會收到通知。
          </div>
        </div>
      </div>);

  }
  if (state === 'rejected') {
    return (
      <div style={proposalDoneStyle('rejected')}>
        <Icon name="x" size={18} color="var(--t-coral)" stroke={2.2} />
        <div>
          <div style={{ fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 14, color: 'var(--t-coral)' }}>
            已拒絕 · 「{proposal.name}」
          </div>
          <div className="t-meta" style={{ marginTop: 2 }}>原因：{reason}</div>
        </div>
      </div>);

  }

  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--t-hairline)',
      borderRadius: 'var(--t-r-lg)',
      padding: 22
    }}>
      {/* Title + meta */}
      <h3 className="t-h3" style={{ fontSize: 18, marginBottom: 5, lineHeight: 1.35 }}>{proposal.name}</h3>
      <div className="t-meta" style={{ fontSize: 12 }}>
        {proposal.submittedAt} · 由 {child.name} 提案
      </div>

      {/* Kid quote */}
      <div style={{
        marginTop: 14, padding: '12px 14px 12px 16px',
        background: 'var(--t-paper-warm)',
        borderLeft: '2px solid var(--t-brass)',
        borderRadius: '0 var(--t-r-md) var(--t-r-md) 0',
        fontFamily: 'var(--t-serif)',
        fontStyle: 'italic',
        fontSize: 14, lineHeight: 1.55,
        color: 'var(--t-ink-soft)'
      }}>
        「{proposal.kidNote}」
      </div>

      {/* Category + AI suggested range on the same row */}
      <div style={{
        marginTop: 16,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'
      }}>
        <CategoryChip cat={proposal.ai.category} full />
        <span style={{
          fontFamily: 'var(--t-sans)', fontSize: 12.5,
          color: 'var(--t-ink-muted)'
        }}>
          建議幣值 <span style={{ fontFamily: 'var(--t-data)', fontWeight: 700, color: 'var(--t-ink-soft)' }}>{proposal.ai.range[0]}–{proposal.ai.range[1]}</span> 幣
        </span>
      </div>

      {/* AI rationale — one gray line */}
      <div style={{
        marginTop: 8,
        fontFamily: 'var(--t-sans)', fontSize: 12,
        color: 'var(--t-ink-muted)', lineHeight: 1.55,
        display: 'flex', gap: 5, alignItems: 'flex-start'
      }}>
        <span style={{ color: 'var(--t-navy)', flexShrink: 0, paddingTop: 1 }}>
          <Icon name="sparkle" size={11} stroke={1.8} />
        </span>
        <span>AI：{proposal.ai.rationale}</span>
      </div>

      {/* Approve coin input */}
      <div style={{
        marginTop: 18, paddingTop: 18,
        borderTop: '1px solid var(--t-hairline)',
        display: 'flex', alignItems: 'center', gap: 10
      }}>
        <span className="t-eyebrow" style={{ fontSize: 10.5 }}>核准幣值</span>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 10px',
          background: 'var(--t-brass-50)', border: '1px solid var(--t-brass-200)',
          borderRadius: 'var(--t-r-pill)'
        }}>
          <Coin size={16} />
          <input
            type="number" value={coinValue}
            onChange={(e) => setCoinValue(Math.max(0, parseInt(e.target.value) || 0))}
            style={{
              width: 42, border: 'none', background: 'transparent', outline: 'none',
              fontFamily: 'var(--t-data)', fontWeight: 700, fontSize: 16,
              color: 'var(--t-ink)', textAlign: 'center'
            }} />
          
          <span className="t-meta" style={{ fontSize: 11.5 }}>幣</span>
        </div>
      </div>

      {state === 'idle' &&
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <Button kind="primary" icon="check" onClick={() => setState('approved')} style={{ flex: 1 }}>
            同意並發放
          </Button>
          <Button kind="outline" onClick={() => setState('rejecting')}>拒絕</Button>
        </div>
      }

      {state === 'rejecting' &&
      <div style={{
        marginTop: 16, padding: 16,
        background: 'var(--t-paper-warm)',
        borderRadius: 'var(--t-r-md)'
      }}>
          <div className="t-eyebrow" style={{ marginBottom: 10, fontSize: 10.5 }}>選擇拒絕原因</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {window.SW_DATA.REJECT_REASONS.map((r) =>
          <button key={r} onClick={() => {setReason(r);setState('rejected');}} style={{
            textAlign: 'left',
            padding: '10px 12px',
            background: '#fff',
            border: '1px solid var(--t-hairline)',
            borderRadius: 'var(--t-r-sm)',
            fontFamily: 'var(--t-sans)', fontSize: 13,
            color: 'var(--t-ink-soft)',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => {e.currentTarget.style.borderColor = 'var(--t-coral)';e.currentTarget.style.color = 'var(--t-coral)';}}
          onMouseLeave={(e) => {e.currentTarget.style.borderColor = 'var(--t-hairline)';e.currentTarget.style.color = 'var(--t-ink-soft)';}}>{r}</button>
          )}
          </div>
          <button onClick={() => setState('idle')} style={{
          marginTop: 10, background: 'none', border: 'none',
          color: 'var(--t-ink-muted)', cursor: 'pointer',
          fontFamily: 'var(--t-sans)', fontSize: 12.5
        }}>取消</button>
        </div>
      }
    </div>);

};
const proposalDoneStyle = (kind) => ({
  display: 'flex', alignItems: 'flex-start', gap: 10,
  padding: 18,
  background: kind === 'approved' ? 'var(--t-green-50)' : 'var(--t-coral-50)',
  border: `1px solid ${kind === 'approved' ? '#C9DDD0' : '#F0CFC7'}`,
  borderRadius: 'var(--t-r-lg)'
});

/* Lightweight empty state — text only, no card */
const ProposalEmptyText = () =>
<div style={{
  padding: '8px 4px',
  color: 'var(--t-ink-muted)',
  fontFamily: 'var(--t-sans)', fontSize: 14, lineHeight: 1.6
}}>
    目前沒有待審核的提案。<br />
    <span style={{ fontSize: 12.5, color: 'var(--t-ink-faint)' }}>
      孩子有新提案時，會在這裡出現。
    </span>
  </div>;


/* ─────────────────────────────────────────────────────────
   Inline temp-task composer — sits at the bottom of today's list.
   A/B/C 都可選，送出後直接插入今日清單。
   ───────────────────────────────────────────────────────── */
const QUICK_CHIPS = ['幫忙摺衣服', '陪奶奶說話 10 分鐘', '收乾的碗盤', '幫忙跑腿買鹽'];

const InlineNewTempTask = ({ child, open, onOpen, onClose, onSubmit }) => {
  const [text, setText] = useStateD('');
  const [coins, setCoins] = useStateD(10);
  const [cat, setCat] = useStateD('C');
  const [sent, setSent] = useStateD(false);

  if (!open && !sent) {
    return null; // parent controls opening from the footer button row
  }

  if (sent) {
    return (
      <div style={{
        marginTop: 14,
        padding: '14px 16px',
        background: 'var(--t-green-50)',
        border: '1px solid #C9DDD0',
        borderRadius: 'var(--t-r-md)',
        display: 'flex', alignItems: 'center', gap: 12
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: '#fff', color: 'var(--t-green)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0
        }}>
          <Icon name="check" size={15} stroke={2.2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 13.5, color: 'var(--t-green)' }}>
            已加入今日任務
          </div>
          <div className="t-meta" style={{ fontSize: 12 }}>
            「{text}」· {cat === 'C' ? `${coins} 幣` : `${cat} 類 · 無金幣`}
          </div>
        </div>
        <Button kind="ghost" small icon="plus"
        onClick={() => {setSent(false);setText('');setCat('C');setCoins(10);onOpen && onOpen();}}>
          再派一個
        </Button>
      </div>);

  }

  return (
    <div style={{
      marginTop: 14,
      padding: 20,
      background: 'var(--t-brass-50)',
      border: '1.5px solid var(--t-brass-200)',
      borderRadius: 'var(--t-r-lg)',
      position: 'relative'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'var(--t-brass)', color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0
        }}>
          <Icon name="send" size={14} stroke={2} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 14.5, color: 'var(--t-brass-700)' }}>
            指派臨時任務給 {child.name}
          </div>
          <div className="t-meta" style={{ fontSize: 11.5 }}>送出後直接插入今日清單</div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none',
          color: 'var(--t-ink-muted)', cursor: 'pointer',
          width: 24, height: 24, borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
        }}><Icon name="x" size={13} /></button>
      </div>

      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="例：幫媽媽搬一下東西"
        style={{
          width: '100%',
          padding: '10px 13px',
          background: '#fff',
          border: '1px solid var(--t-hairline)',
          borderRadius: 'var(--t-r-md)',
          fontFamily: 'var(--t-sans)', fontSize: 14,
          color: 'var(--t-ink)', outline: 'none',
          boxSizing: 'border-box'
        }}
        onFocus={(e) => e.currentTarget.style.borderColor = 'var(--t-brass)'}
        onBlur={(e) => e.currentTarget.style.borderColor = 'var(--t-hairline)'} />
      
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
        {QUICK_CHIPS.map((s) =>
        <button key={s} onClick={() => setText(s)} style={{
          padding: '3px 9px',
          background: '#fff',
          border: '1px solid var(--t-hairline)',
          borderRadius: 'var(--t-r-pill)',
          fontFamily: 'var(--t-sans)', fontSize: 11,
          color: 'var(--t-ink-muted)',
          cursor: 'pointer'
        }}>{s}</button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14 }}>
        <div>
          <div className="t-eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>類別</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {['A', 'B', 'C'].map((c) =>
            <button key={c} onClick={() => setCat(c)} style={{
              padding: '5px 9px',
              background: cat === c ? window.SW_DATA.CATEGORIES[c].bg : '#fff',
              border: `1px solid ${cat === c ? window.SW_DATA.CATEGORIES[c].fg : 'var(--t-hairline)'}`,
              borderRadius: 'var(--t-r-pill)',
              fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 11.5,
              color: cat === c ? window.SW_DATA.CATEGORIES[c].fg : 'var(--t-ink-muted)',
              cursor: 'pointer', whiteSpace: 'nowrap'
            }}>{c} · {window.SW_DATA.CATEGORIES[c].short}</button>
            )}
          </div>
        </div>
        <div style={{ flex: 1, opacity: cat === 'C' ? 1 : 0.4 }}>
          <div className="t-eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>幣值（僅 C 類）</div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 11px',
            background: '#fff',
            border: '1px solid var(--t-brass-200)',
            borderRadius: 'var(--t-r-pill)'
          }}>
            <Coin size={15} />
            <input
              type="number" value={coins}
              onChange={(e) => setCoins(Math.max(0, parseInt(e.target.value) || 0))}
              disabled={cat !== 'C'}
              style={{
                width: 42, border: 'none', background: 'transparent', outline: 'none',
                fontFamily: 'var(--t-data)', fontWeight: 700, fontSize: 14,
                color: 'var(--t-ink)', textAlign: 'center'
              }} />
            
            <span className="t-meta" style={{ fontSize: 11 }}>幣</span>
          </div>
        </div>
      </div>

      <Button
        kind="brass" icon="send"
        onClick={() => {
          if (!text) return;
          onSubmit && onSubmit({ text, cat, coins: cat === 'C' ? coins : 0 });
          setSent(true);
        }}
        style={{
          width: '100%', marginTop: 14,
          opacity: text ? 1 : 0.5, pointerEvents: text ? 'auto' : 'none'
        }}>
        
        送出
      </Button>
    </div>);

};

/* ─────────────────────────────────────────────────────────
   New-task modal — full setup for cyclic or long-term tasks.
   Two paths: 一般 (A/B/C, cyclic) | 長期 (D, milestones)
   ───────────────────────────────────────────────────────── */
const NewTaskModal = ({ open, child, onClose }) => {
  const [path, setPath] = useStateD(null); // null | 'general' | 'longterm'
  const [step, setStep] = useStateD(1);
  const [name, setName] = useStateD('');
  const [cat, setCat] = useStateD('B');
  const [coins, setCoins] = useStateD(8);
  const [aiSuggesting, setAiSuggesting] = useStateD(false);
  const [aiDone, setAiDone] = useStateD(false);
  const [days, setDays] = useStateD(['一', '二', '三', '四', '五']);
  const [period, setPeriod] = useStateD('weekday'); // weekday | weekend | every | custom | once
  const [ltKind, setLtKind] = useStateD('habit'); // habit | skill | duty | challenge
  const [ltGoal, setLtGoal] = useStateD('');
  const [aiSubtasks, setAiSubtasks] = useStateD(null);
  const [done, setDone] = useStateD(false);

  useEffectD(() => {
    if (!open) {
      setPath(null);setStep(1);
      setName('');setCat('B');setCoins(8);
      setAiSuggesting(false);setAiDone(false);
      setDays(['一', '二', '三', '四', '五']);setPeriod('weekday');
      setLtKind('habit');setLtGoal('');setAiSubtasks(null);
      setDone(false);
    }
  }, [open]);

  if (!open) return null;

  // Mock AI suggestion: pretend latency
  const runAiSuggest = () => {
    setAiSuggesting(true);
    setTimeout(() => {
      const lowered = name.toLowerCase();
      let guessCat = 'B',guessRange = [5, 10];
      if (/(玩|練|讀|寫|學|跑)/.test(name)) {guessCat = 'D';guessRange = [10, 18];} else
      if (/(幫|教|陪|跑腿)/.test(name)) {guessCat = 'C';guessRange = [10, 15];} else
      if (/(刷牙|穿|睡|起床|洗手)/.test(name)) {guessCat = 'A';guessRange = [0, 0];}
      setCat(guessCat);setCoins(Math.round((guessRange[0] + guessRange[1]) / 2));
      setAiSuggesting(false);setAiDone(true);
    }, 700);
  };

  const runAiBreakdown = () => {
    setAiSuggesting(true);
    setTimeout(() => {
      const kindMap = {
        habit: [{ name: '前 7 天 · 任何時間記錄一次', d: '建立行為連結' }, { name: '中 14 天 · 固定時間執行', d: '進入節奏' }, { name: '後 9 天 · 自動化', d: '不需提醒' }],
        skill: [{ name: '第 1 週 · 基本動作熟練', d: '入門' }, { name: '第 2–3 週 · 連貫練習', d: '熟練' }, { name: '第 4 週 · 完整呈現', d: '驗收' }],
        duty: [{ name: '練習階段 · 家長協助', d: '前 2 週' }, { name: '獨立完成 · 家長旁觀', d: '中 2 週' }, { name: '完全自理', d: '長期維持' }],
        challenge: [{ name: '挑戰開始 · 設定基準', d: '第一天' }, { name: '中段檢核', d: '達到 50% 時' }, { name: '驗收 · 慶祝', d: '達成時' }]
      };
      setAiSubtasks(kindMap[ltKind]);
      setAiSuggesting(false);
    }, 700);
  };

  // ─────────── Render ───────────
  return (
    <div style={modalBackdropStyle} onClick={onClose}>
      <div style={{
        ...modalCardStyle,
        maxWidth: 560
      }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--t-hairline)'
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'var(--t-navy)', color: '#fff',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <Icon name="plus" size={16} stroke={2.4} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="t-eyebrow" style={{ fontSize: 10.5, marginBottom: 2, color: 'var(--t-navy)' }}>建立新任務</div>
            <h3 className="t-h3" style={{ margin: 0, fontSize: 17 }}>
              為 {child.name} 設定一個重複或長期任務
            </h3>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none',
            color: 'var(--t-ink-muted)', cursor: 'pointer',
            width: 32, height: 32, borderRadius: '50%',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
          }}><Icon name="x" size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, maxHeight: '70vh', overflowY: 'auto' }}>
          {done ?
          <div style={{
            padding: 24, textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12
          }}>
              <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--t-green-50)', color: 'var(--t-green)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid #C9DDD0'
            }}>
                <Icon name="check" size={26} stroke={2.4} />
              </div>
              <h3 className="t-h3" style={{ margin: 0, fontSize: 18 }}>任務已建立</h3>
              <p style={{
              margin: 0, maxWidth: 360,
              fontFamily: 'var(--t-sans)', fontSize: 13.5, lineHeight: 1.6,
              color: 'var(--t-ink-soft)'
            }}>
                「{name}」將從<strong style={{ color: 'var(--t-ink)' }}>下一個週期</strong>開始出現在 {child.name} 的任務清單。
                {path === 'longterm' && '長期任務的子任務也已建立。'}
              </p>
              <Button kind="primary" onClick={onClose}>完成</Button>
            </div> :
          path === null ?
          // Path picker
          <>
              <div className="t-eyebrow" style={{ marginBottom: 12, fontSize: 11 }}>選擇任務類型</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <PathCard
                iconName="repeat"
                title="一般任務"
                badge="A · B · C 類"
                desc="日常自理、家庭本分或貢獻型任務。可以設定每天、平日、週末或指定幾天重複。"
                onClick={() => {setPath('general');setStep(2);}} />
              
                <PathCard
                iconName="target"
                title="長期任務"
                badge="D 類"
                desc="習慣養成、技能學習、家庭責任建立或自我挑戰。AI 會幫忙拆解成階段性子任務。"
                onClick={() => {setPath('longterm');setStep(2);}} />
              
              </div>
            </> :
          path === 'general' ?
          <GeneralPath
            step={step} setStep={setStep}
            name={name} setName={setName}
            cat={cat} setCat={setCat}
            coins={coins} setCoins={setCoins}
            aiSuggesting={aiSuggesting} aiDone={aiDone} runAiSuggest={runAiSuggest}
            days={days} setDays={setDays}
            period={period} setPeriod={setPeriod}
            onBack={() => setPath(null)}
            onDone={() => setDone(true)} /> :


          <LongTermPath
            step={step} setStep={setStep}
            name={name} setName={setName}
            ltKind={ltKind} setLtKind={setLtKind}
            ltGoal={ltGoal} setLtGoal={setLtGoal}
            aiSuggesting={aiSuggesting}
            aiSubtasks={aiSubtasks} runAiBreakdown={runAiBreakdown}
            onBack={() => setPath(null)}
            onDone={() => setDone(true)} />

          }
        </div>
      </div>
    </div>);

};

const PathCard = ({ iconName, title, badge, desc, onClick }) =>
<button onClick={onClick} style={{
  textAlign: 'left',
  padding: 18,
  background: '#fff',
  border: '1px solid var(--t-hairline)',
  borderRadius: 'var(--t-r-lg)',
  cursor: 'pointer',
  display: 'flex', gap: 14,
  transition: 'border-color .15s var(--t-ease), background-color .15s var(--t-ease)'
}}
onMouseEnter={(e) => {e.currentTarget.style.borderColor = 'var(--t-navy)';e.currentTarget.style.background = 'var(--t-navy-50)';}}
onMouseLeave={(e) => {e.currentTarget.style.borderColor = 'var(--t-hairline)';e.currentTarget.style.background = '#fff';}}>
    <div style={{
    width: 40, height: 40, borderRadius: 10,
    background: 'var(--t-navy-50)', color: 'var(--t-navy)',
    border: '1px solid var(--t-navy-200)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0
  }}>
      <Icon name={iconName} size={18} stroke={1.8} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 14.5, color: 'var(--t-ink)' }}>{title}</span>
        <span style={{
        padding: '2px 7px',
        background: 'var(--t-navy-50)', color: 'var(--t-navy)',
        borderRadius: 'var(--t-r-pill)',
        fontFamily: 'var(--t-sans)', fontWeight: 600,
        fontSize: 10.5, letterSpacing: '0.02em', lineHeight: 1.4,
        whiteSpace: 'nowrap'
      }}>{badge}</span>
      </div>
      <div style={{
      fontFamily: 'var(--t-sans)', fontSize: 12.5, lineHeight: 1.55,
      color: 'var(--t-ink-soft)'
    }}>{desc}</div>
    </div>
    <div style={{ alignSelf: 'center', flexShrink: 0, color: 'var(--t-ink-muted)' }}>
      <Icon name="chevright" size={18} />
    </div>
  </button>;


const StepHead = ({ idx, total, title, onBack }) =>
<div style={{ marginBottom: 18 }}>
    <button onClick={onBack} style={{
    background: 'none', border: 'none', padding: 0,
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontFamily: 'var(--t-sans)', fontSize: 12,
    color: 'var(--t-ink-muted)', cursor: 'pointer',
    marginBottom: 10
  }}><Icon name="chevleft" size={12} /> 返回</button>
    <div className="t-eyebrow" style={{ fontSize: 10.5, marginBottom: 4 }}>步驟 {idx} / {total}</div>
    <h4 className="t-h3" style={{ margin: 0, fontSize: 16 }}>{title}</h4>
  </div>;


const FieldLabel = ({ children }) =>
<div className="t-eyebrow" style={{ fontSize: 10.5, marginBottom: 8 }}>{children}</div>;


const TextField = ({ value, onChange, placeholder, autoFocus }) =>
<input
  autoFocus={autoFocus}
  value={value}
  onChange={(e) => onChange(e.target.value)}
  placeholder={placeholder}
  style={{
    width: '100%',
    padding: '11px 14px',
    background: 'var(--t-paper-warm)',
    border: '1px solid var(--t-hairline)',
    borderRadius: 'var(--t-r-md)',
    fontFamily: 'var(--t-sans)', fontSize: 14,
    color: 'var(--t-ink)', outline: 'none',
    boxSizing: 'border-box'
  }}
  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--t-navy)'}
  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--t-hairline)'} />;



const GeneralPath = (props) => {
  const { step, setStep, name, setName, cat, setCat, coins, setCoins,
    aiSuggesting, aiDone, runAiSuggest, days, setDays,
    period, setPeriod, onBack, onDone } = props;

  if (step === 2) {
    return (
      <>
        <StepHead idx={1} total={4} title="任務名稱" onBack={onBack} />
        <FieldLabel>給孩子看到的任務名稱</FieldLabel>
        <TextField autoFocus value={name} onChange={setName} placeholder="例：倒垃圾、整理書桌、幫忙澆花" />
        <div className="t-meta" style={{ marginTop: 10, fontSize: 12 }}>
          AI 會根據名稱建議分類和幣值範圍，下一步可以調整。
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <Button kind="primary" onClick={() => {runAiSuggest();setStep(3);}}
          style={{ opacity: name ? 1 : 0.4, pointerEvents: name ? 'auto' : 'none' }}>
            下一步 →
          </Button>
        </div>
      </>);

  }

  if (step === 3) {
    return (
      <>
        <StepHead idx={2} total={4} title="確認類別與幣值" onBack={() => setStep(2)} />
        {aiSuggesting ?
        <div style={{
          padding: '20px 16px',
          background: 'var(--t-navy-50)',
          border: '1px dashed var(--t-navy-200)',
          borderRadius: 'var(--t-r-md)',
          display: 'flex', alignItems: 'center', gap: 12
        }}>
            <Icon name="sparkle" size={18} color="var(--t-navy)" stroke={1.8} />
            <div style={{
            fontFamily: 'var(--t-sans)', fontSize: 13, color: 'var(--t-ink-soft)'
          }}>AI 正在分類「{name}」並建議幣值…</div>
          </div> :

        <>
            {aiDone &&
          <div style={{
            padding: '10px 14px',
            background: 'var(--t-navy-50)',
            border: '1px solid var(--t-navy-200)',
            borderRadius: 'var(--t-r-md)',
            marginBottom: 16,
            display: 'flex', alignItems: 'flex-start', gap: 8,
            fontFamily: 'var(--t-sans)', fontSize: 12.5, lineHeight: 1.55,
            color: 'var(--t-ink-soft)'
          }}>
                <Icon name="sparkle" size={13} color="var(--t-navy)" stroke={1.8} />
                <span>AI 建議「{name}」屬於 <strong style={{ color: 'var(--t-navy)' }}>{cat} · {window.SW_DATA.CATEGORIES[cat].short}</strong>。如不正確可手動修改。</span>
              </div>
          }

            <FieldLabel>分類</FieldLabel>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              {['A', 'B', 'C'].map((c) =>
            <button key={c} onClick={() => setCat(c)} style={{
              flex: 1,
              padding: '10px 8px',
              background: cat === c ? window.SW_DATA.CATEGORIES[c].bg : '#fff',
              border: `1px solid ${cat === c ? window.SW_DATA.CATEGORIES[c].fg : 'var(--t-hairline)'}`,
              borderRadius: 'var(--t-r-md)',
              fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 12.5,
              color: cat === c ? window.SW_DATA.CATEGORIES[c].fg : 'var(--t-ink-muted)',
              cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3
            }}>
                  <span style={{ fontFamily: 'var(--t-data)', fontWeight: 700, fontSize: 15 }}>{c}</span>
                  <span style={{ fontSize: 11 }}>{window.SW_DATA.CATEGORIES[c].short}</span>
                </button>
            )}
            </div>

            <FieldLabel>幣值（C 類才會有金幣，A/B 為本分）</FieldLabel>
            <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 12px',
            background: cat === 'C' ? 'var(--t-brass-50)' : 'var(--t-paper-warm)',
            border: `1px solid ${cat === 'C' ? 'var(--t-brass-200)' : 'var(--t-hairline)'}`,
            borderRadius: 'var(--t-r-pill)',
            opacity: cat === 'C' ? 1 : 0.5
          }}>
              <Coin size={16} />
              <input
              type="number" value={coins}
              onChange={(e) => setCoins(Math.max(0, parseInt(e.target.value) || 0))}
              disabled={cat !== 'C'}
              style={{
                width: 50, border: 'none', background: 'transparent', outline: 'none',
                fontFamily: 'var(--t-data)', fontWeight: 700, fontSize: 15,
                color: 'var(--t-ink)', textAlign: 'center'
              }} />
            
              <span className="t-meta" style={{ fontSize: 11.5 }}>幣 / 次</span>
            </div>
          </>
        }
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <Button kind="primary" onClick={() => setStep(4)}>下一步 →</Button>
        </div>
      </>);

  }

  if (step === 4) {
    const presets = [
    { id: 'weekday', label: '平日', detail: '週一到週五' },
    { id: 'weekend', label: '週末', detail: '週六、週日' },
    { id: 'every', label: '每天', detail: '一週 7 天' },
    { id: 'once', label: '不重複', detail: '只執行一次' }];

    return (
      <>
        <StepHead idx={3} total={4} title="重複週期" onBack={() => setStep(3)} />
        <FieldLabel>選擇執行頻率</FieldLabel>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10,
          marginBottom: 18
        }}>
          {presets.map((p) =>
          <button key={p.id} onClick={() => setPeriod(p.id)} style={{
            padding: '12px 14px',
            background: period === p.id ? 'var(--t-navy-50)' : '#fff',
            border: `1px solid ${period === p.id ? 'var(--t-navy)' : 'var(--t-hairline)'}`,
            borderRadius: 'var(--t-r-md)',
            cursor: 'pointer', textAlign: 'left'
          }}>
              <div style={{ fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 13.5, color: 'var(--t-ink)' }}>{p.label}</div>
              <div className="t-meta" style={{ fontSize: 11.5, marginTop: 2 }}>{p.detail}</div>
            </button>
          )}
        </div>
        <FieldLabel>或自訂幾天</FieldLabel>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['一', '二', '三', '四', '五', '六', '日'].map((d) => {
            const on = days.includes(d);
            return (
              <button key={d} onClick={() => {
                setPeriod('custom');
                setDays(on ? days.filter((x) => x !== d) : [...days, d]);
              }} style={{
                width: 36, height: 36, borderRadius: '50%',
                background: on ? 'var(--t-navy)' : '#fff',
                color: on ? '#fff' : 'var(--t-ink-muted)',
                border: `1px solid ${on ? 'var(--t-navy)' : 'var(--t-hairline)'}`,
                fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 13,
                cursor: 'pointer'
              }}>{d}</button>);

          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <Button kind="primary" onClick={() => setStep(5)}>下一步 →</Button>
        </div>
      </>);

  }

  // step 5 — confirm
  return (
    <>
      <StepHead idx={4} total={4} title="確認建立" onBack={() => setStep(4)} />
      <div style={{
        padding: 18,
        background: 'var(--t-paper-warm)',
        border: '1px solid var(--t-hairline)',
        borderRadius: 'var(--t-r-md)',
        marginBottom: 16
      }}>
        <h4 className="t-h3" style={{ margin: 0, fontSize: 17, marginBottom: 10 }}>{name}</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <CategoryChip cat={cat} full />
          {cat === 'C' &&
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 10px',
            background: 'var(--t-brass-50)',
            border: '1px solid var(--t-brass-200)',
            borderRadius: 'var(--t-r-pill)',
            fontFamily: 'var(--t-data)', fontWeight: 700, fontSize: 12,
            color: 'var(--t-brass-700)'
          }}><Coin size={12} /> {coins} 幣 / 次</span>
          }
        </div>
        <div className="t-meta" style={{ fontSize: 12.5 }}>
          {period === 'weekday' ? '每週平日（一～五）' :
          period === 'weekend' ? '每週六、日' :
          period === 'every' ? '每天' :
          period === 'once' ? '只執行一次' :
          `週${days.join('、')}`}
          ・ 從下一個週期生效
        </div>
      </div>
      <Button kind="primary" icon="check" onClick={onDone} style={{ width: '100%' }}>
        建立任務
      </Button>
    </>);

};

const LongTermPath = (props) => {
  const { step, setStep, name, setName,
    ltKind, setLtKind, ltGoal, setLtGoal,
    aiSuggesting, aiSubtasks, runAiBreakdown, onBack, onDone } = props;

  if (step === 2) {
    return (
      <>
        <StepHead idx={1} total={4} title="任務名稱與目標" onBack={onBack} />
        <FieldLabel>任務名稱</FieldLabel>
        <TextField autoFocus value={name} onChange={setName} placeholder="例：30 天練好鋼琴小星星" />
        <div style={{ height: 16 }} />
        <FieldLabel>具體想達成的目標</FieldLabel>
        <textarea
          value={ltGoal}
          onChange={(e) => setLtGoal(e.target.value)}
          placeholder="例：30 天內，每天可以連續彈完小星星不卡關，給爺爺奶奶聽。"
          style={{
            width: '100%', minHeight: 80, resize: 'vertical',
            padding: '11px 14px',
            background: 'var(--t-paper-warm)',
            border: '1px solid var(--t-hairline)',
            borderRadius: 'var(--t-r-md)',
            fontFamily: 'var(--t-sans)', fontSize: 13.5, lineHeight: 1.55,
            color: 'var(--t-ink)', outline: 'none',
            boxSizing: 'border-box'
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--t-navy)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--t-hairline)'} />
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <Button kind="primary" onClick={() => setStep(3)}
          style={{ opacity: name && ltGoal ? 1 : 0.4, pointerEvents: name && ltGoal ? 'auto' : 'none' }}>
            下一步 →
          </Button>
        </div>
      </>);

  }

  if (step === 3) {
    const kinds = [
    { id: 'habit', iconName: 'repeat', label: '習慣養成', desc: '建立每天重複的行為，例如每天閱讀、刷牙、整理。' },
    { id: 'skill', iconName: 'sparkle', label: '技能學習', desc: '學會一項新技能，例如騎腳踏車、彈一首曲子。' },
    { id: 'duty', iconName: 'check', label: '家庭責任', desc: '建立長期家庭角色，例如照顧寵物、收餐桌。' },
    { id: 'challenge', iconName: 'target', label: '自我挑戰', desc: '完成一個目標，例如連續一個月早起。' }];

    return (
      <>
        <StepHead idx={2} total={4} title="選擇長期任務類型" onBack={() => setStep(2)} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {kinds.map((k) =>
          <button key={k.id} onClick={() => setLtKind(k.id)} style={{
            textAlign: 'left',
            padding: '12px 14px',
            background: ltKind === k.id ? 'var(--t-navy-50)' : '#fff',
            border: `1px solid ${ltKind === k.id ? 'var(--t-navy)' : 'var(--t-hairline)'}`,
            borderRadius: 'var(--t-r-md)',
            cursor: 'pointer',
            display: 'flex', gap: 12, alignItems: 'flex-start'
          }}>
              <div style={{
              flexShrink: 0,
              width: 30, height: 30, borderRadius: 8,
              background: ltKind === k.id ? 'var(--t-navy)' : 'var(--t-navy-50)',
              color: ltKind === k.id ? '#fff' : 'var(--t-navy)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
            }}>
                <Icon name={k.iconName} size={14} stroke={1.8} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 13.5, color: 'var(--t-ink)' }}>{k.label}</div>
                <div className="t-meta" style={{ fontSize: 12, marginTop: 2 }}>{k.desc}</div>
              </div>
            </button>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <Button kind="primary" onClick={() => {runAiBreakdown();setStep(4);}}>
            讓 AI 拆解 →
          </Button>
        </div>
      </>);

  }

  if (step === 4) {
    return (
      <>
        <StepHead idx={3} total={4} title="AI 拆解的子任務" onBack={() => setStep(3)} />
        {aiSuggesting || !aiSubtasks ?
        <div style={{
          padding: '20px 16px',
          background: 'var(--t-navy-50)',
          border: '1px dashed var(--t-navy-200)',
          borderRadius: 'var(--t-r-md)',
          display: 'flex', alignItems: 'center', gap: 12
        }}>
            <Icon name="sparkle" size={18} color="var(--t-navy)" stroke={1.8} />
            <div style={{ fontFamily: 'var(--t-sans)', fontSize: 13, color: 'var(--t-ink-soft)' }}>
              AI 正在根據「{name}」拆解成階段性子任務…
            </div>
          </div> :

        <>
            <div style={{
            padding: '10px 14px',
            background: 'var(--t-navy-50)',
            border: '1px solid var(--t-navy-200)',
            borderRadius: 'var(--t-r-md)',
            marginBottom: 14,
            fontFamily: 'var(--t-sans)', fontSize: 12.5, lineHeight: 1.55,
            color: 'var(--t-ink-soft)',
            display: 'flex', alignItems: 'flex-start', gap: 8
          }}>
              <Icon name="sparkle" size={13} color="var(--t-navy)" stroke={1.8} />
              <span>AI 將「{name}」拆成 3 個階段，每階段達標會有金幣獎勵。可以接受或之後再調整。</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {aiSubtasks.map((s, i) =>
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '12px 14px',
              background: 'var(--t-paper-warm)',
              border: '1px solid var(--t-hairline)',
              borderRadius: 'var(--t-r-md)'
            }}>
                  <div style={{
                flexShrink: 0,
                width: 22, height: 22, borderRadius: '50%',
                background: 'var(--t-navy)', color: '#fff',
                fontFamily: 'var(--t-data)', fontWeight: 700, fontSize: 12,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
              }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 13, color: 'var(--t-ink)' }}>{s.name}</div>
                    <div className="t-meta" style={{ fontSize: 11.5, marginTop: 2 }}>{s.d}</div>
                  </div>
                </div>
            )}
            </div>
          </>
        }
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <Button kind="primary" onClick={() => setStep(5)}
          style={{ opacity: aiSubtasks ? 1 : 0.4, pointerEvents: aiSubtasks ? 'auto' : 'none' }}>
            下一步 →
          </Button>
        </div>
      </>);

  }

  // step 5
  return (
    <>
      <StepHead idx={4} total={4} title="確認啟動長期任務" onBack={() => setStep(4)} />
      <div style={{
        padding: 18,
        background: 'var(--t-paper-warm)',
        border: '1px solid var(--t-hairline)',
        borderRadius: 'var(--t-r-md)',
        marginBottom: 16
      }}>
        <h4 className="t-h3" style={{ margin: 0, fontSize: 17, marginBottom: 6 }}>{name}</h4>
        <div className="t-meta" style={{ fontSize: 12.5, marginBottom: 10 }}>
          長期 D 類 · {ltKind === 'habit' ? '習慣養成' : ltKind === 'skill' ? '技能學習' : ltKind === 'duty' ? '家庭責任' : '自我挑戰'}
        </div>
        <div style={{
          fontFamily: 'var(--t-serif)', fontStyle: 'italic',
          fontSize: 13, lineHeight: 1.6,
          color: 'var(--t-ink-soft)'
        }}>「{ltGoal}」</div>
      </div>
      <Button kind="primary" icon="check" onClick={onDone} style={{ width: '100%' }}>
        啟動任務
      </Button>
    </>);

};

/* Shared modal styles */
const modalBackdropStyle = {
  position: 'fixed', inset: 0,
  background: 'rgba(20, 19, 15, 0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 30, zIndex: 1000,
  animation: 'fadeIn 0.15s ease-out'
};
const modalCardStyle = {
  background: 'var(--t-paper)',
  borderRadius: 'var(--t-r-xl)',
  boxShadow: '0 24px 80px -16px rgba(0,0,0,0.40)',
  width: '100%',
  maxHeight: '90vh',
  display: 'flex', flexDirection: 'column',
  overflow: 'hidden'
};

/* ─────────────────────────────────────────────────────────
   Inline Agent chat — collapsible
   ───────────────────────────────────────────────────────── */
const AgentChat = ({ child, suggestions, tone = 'navy', heading, intro, defaultOpen = false }) => {
  const [open, setOpen] = useStateD(defaultOpen);
  const [history, setHistory] = useStateD([]); // { role, text, loading? }
  const [input, setInput] = useStateD('');
  const [busy, setBusy] = useStateD(false);

  const accent = tone === 'brass' ? 'var(--t-brass)' : 'var(--t-navy)';
  const accentBg = tone === 'brass' ? 'var(--t-brass-50)' : 'var(--t-navy-50)';
  const accentBd = tone === 'brass' ? '#EFCDA6' : 'var(--t-navy-200)';

  const ask = async (q) => {
    if (!q || busy) return;
    setBusy(true);
    const nextHistory = [...history, { role: 'user', text: q }, { role: 'ai', text: '', loading: true }];
    setHistory(nextHistory);
    setInput('');
    try {
      const prompt = [
      `你是 Shadow Wallet 家長端的 AI 助理。對話對象是 ${child.name}（${child.age} 歲）的家長。`,
      `本週狀態：完成率 76%、主動提案 3 件、撲滿餘額 ${child.coinBalance} 幣。`,
      `練鋼琴 30 天計畫從第 5 天起斷 4 天，今天恢復。`,
      `本週兌換 3 次「冰淇淋一支」(合計 90 幣)。`,
      `語氣：溫和、簡短、3-4 句中文。不用條列，不要 emoji。`,
      ``,
      `家長問：${q}`].
      join('\n');
      const text = await window.claude.complete(prompt);
      setHistory((h) => h.map((m, i) => i === h.length - 1 ? { role: 'ai', text } : m));
    } catch (e) {
      setHistory((h) => h.map((m, i) => i === h.length - 1 ? { role: 'ai', text: 'AI 暫時無法回應，請稍後再試。' } : m));
    }
    setBusy(false);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        width: '100%',
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 18px',
        background: '#fff',
        border: `1px dashed ${accentBd}`,
        borderRadius: 'var(--t-r-lg)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background-color .15s var(--t-ease), border-color .15s var(--t-ease)'
      }}
      onMouseEnter={(e) => {e.currentTarget.style.background = accentBg;}}
      onMouseLeave={(e) => {e.currentTarget.style.background = '#fff';}}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: accentBg, color: accent,
          border: `1px solid ${accentBd}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0
        }}>
          <Icon name="sparkle" size={16} stroke={1.8} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 14,
            color: 'var(--t-ink)', marginBottom: 3
          }}>{heading}</div>
          <div className="t-meta" style={{ fontSize: 12.5 }} data-comment-anchor="9950118cca-div-1507-11">{intro}</div>
        </div>
        <Icon name="chevright" size={16} color={accent} />
      </button>);

  }

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${accentBd}`,
      borderRadius: 'var(--t-r-lg)',
      padding: 18,
      display: 'flex', flexDirection: 'column', gap: 12
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 9,
          background: accentBg, color: accent,
          border: `1px solid ${accentBd}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Icon name="sparkle" size={14} stroke={1.8} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 14, color: 'var(--t-ink)' }}>
            {heading}
          </div>
          <div className="t-meta" style={{ fontSize: 11.5 }}>AI 觀察，供參考 · 並非診斷</div>
        </div>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: 'none',
          color: 'var(--t-ink-muted)', cursor: 'pointer',
          width: 26, height: 26, borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
        }}><Icon name="x" size={14} /></button>
      </div>

      {/* History */}
      {history.length > 0 &&
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        maxHeight: 320, overflowY: 'auto',
        padding: '4px 2px'
      }}>
          {history.map((m, i) =>
        <div key={i} style={{
          display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start'
        }}>
              <div style={{
            maxWidth: '88%',
            padding: '9px 13px',
            background: m.role === 'user' ? accentBg : 'var(--t-paper-warm)',
            border: m.role === 'user' ? `1px solid ${accentBd}` : '1px solid var(--t-hairline)',
            borderRadius: 'var(--t-r-md)',
            fontFamily: m.role === 'ai' ? 'var(--t-serif)' : 'var(--t-sans)',
            fontSize: m.role === 'ai' ? 14 : 13,
            lineHeight: 1.65,
            color: m.role === 'user' ? 'var(--t-ink)' : 'var(--t-ink-soft)',
            whiteSpace: 'pre-wrap'
          }}>
                {m.loading ?
            <span style={{ color: 'var(--t-ink-muted)' }}>正在思考…</span> :
            m.text}
              </div>
            </div>
        )}
        </div>
      }

      {/* Suggestions when no history */}
      {history.length === 0 &&
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="t-eyebrow" style={{ fontSize: 10, marginBottom: 2 }}>建議從這些問題開始</div>
          {suggestions.map((q, i) =>
        <button key={i} onClick={() => ask(q)} disabled={busy} style={{
          textAlign: 'left',
          padding: '9px 12px',
          background: 'var(--t-paper-warm)',
          border: '1px solid var(--t-hairline)',
          borderRadius: 'var(--t-r-md)',
          fontFamily: 'var(--t-sans)', fontSize: 13,
          color: 'var(--t-ink-soft)',
          cursor: busy ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          transition: 'background-color .12s var(--t-ease), border-color .12s var(--t-ease)'
        }}
        onMouseEnter={(e) => {if (!busy) {e.currentTarget.style.borderColor = accent;e.currentTarget.style.background = '#fff';}}}
        onMouseLeave={(e) => {e.currentTarget.style.borderColor = 'var(--t-hairline)';e.currentTarget.style.background = 'var(--t-paper-warm)';}}>
              <Icon name="sparkle" size={11} color={accent} />
              {q}
            </button>
        )}
        </div>
      }

      {/* Input */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {if (e.key === 'Enter') ask(input);}}
          placeholder="想問什麼？例如：要怎麼跟孩子聊鋼琴斷線？"
          disabled={busy}
          style={{
            flex: 1,
            padding: '10px 13px',
            background: 'var(--t-paper-warm)',
            border: '1px solid var(--t-hairline)',
            borderRadius: 'var(--t-r-md)',
            fontFamily: 'var(--t-sans)', fontSize: 13,
            color: 'var(--t-ink)', outline: 'none'
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = accent}
          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--t-hairline)'} />
        
        <Button kind={tone === 'brass' ? 'brass' : 'primary'} small icon="send"
        onClick={() => ask(input)}
        style={{ opacity: input.trim() && !busy ? 1 : 0.5, pointerEvents: input.trim() && !busy ? 'auto' : 'none' }}>
          送出
        </Button>
      </div>
    </div>);

};

/* ─────────────────────────────────────────────────────────
   Floating button + Modal — 臨時任務
   ───────────────────────────────────────────────────────── */
const QUICK_SUGGESTIONS = ['幫忙摺衣服', '陪奶奶說話 10 分鐘', '收乾的碗盤', '幫忙跑腿買鹽'];

const QuickSendFab = ({ open, onOpen }) =>
<button onClick={onOpen} style={{
  position: 'absolute',
  right: 36, bottom: 32,
  display: open ? 'none' : 'inline-flex',
  alignItems: 'center', gap: 10,
  padding: '14px 22px 14px 18px',
  background: 'var(--t-brass)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--t-r-pill)',
  boxShadow: '0 14px 28px -10px rgba(232,147,74,0.55), 0 4px 10px -4px rgba(0,0,0,0.15)',
  cursor: 'pointer',
  fontFamily: 'var(--t-sans)',
  fontWeight: 700,
  fontSize: 14.5,
  transition: 'background-color .18s var(--t-ease), color .18s var(--t-ease), border-color .18s var(--t-ease), box-shadow .18s var(--t-ease)',
  zIndex: 20
}}
onMouseEnter={(e) => {e.currentTarget.style.transform = 'translateY(-2px)';e.currentTarget.style.background = 'var(--t-brass-700)';}}
onMouseLeave={(e) => {e.currentTarget.style.transform = '';e.currentTarget.style.background = 'var(--t-brass)';}}>
    <Icon name="plus" size={18} stroke={2.4} /> 臨時任務
  </button>;


const QuickSendModal = ({ open, onClose, initialChild }) => {
  const [text, setText] = useStateD('');
  const [coins, setCoins] = useStateD(10);
  const [cat, setCat] = useStateD('C');
  const [childId, setChildId] = useStateD(initialChild?.id);
  const [sent, setSent] = useStateD(false);

  useEffectD(() => {
    if (open) {
      setText('');setCoins(10);setCat('C');
      setChildId(initialChild?.id);setSent(false);
    }
  }, [open]);

  if (!open) return null;
  const children = window.SW_DATA.CHILDREN;
  const child = children.find((c) => c.id === childId) || children[0];

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(27,27,26,0.32)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 30,
      animation: 'fadeIn .14s var(--t-ease)'
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 520, maxWidth: '90%',
        background: '#fff',
        border: '1px solid var(--t-hairline)',
        borderRadius: 'var(--t-r-xl)',
        boxShadow: 'var(--t-shadow-pop)',
        padding: 28
      }}>
        {sent ?
        <div style={{ textAlign: 'center', padding: '18px 0 6px' }}>
            <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--t-green-50)', color: 'var(--t-green)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 14
          }}>
              <Icon name="send" size={26} stroke={2} />
            </div>
            <h3 className="t-h2" style={{ fontSize: 20, marginBottom: 6 }}>已派發給 {child.name}</h3>
            <div className="t-meta" style={{ fontSize: 13.5 }}>「{text}」· +{coins} 幣</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
              <Button kind="secondary" onClick={onClose}>關閉</Button>
              <Button kind="primary" icon="plus" onClick={() => {setSent(false);setText('');}}>再派一個</Button>
            </div>
          </div> :

        <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <div className="t-eyebrow" style={{ marginBottom: 4 }}>即時派發</div>
                <h2 className="t-h2" style={{ fontSize: 22, margin: 0 }}>發派臨時任務</h2>
              </div>
              <button onClick={onClose} style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--t-paper-warm)', border: 'none',
              cursor: 'pointer', color: 'var(--t-ink-muted)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
            }}><Icon name="x" size={16} /></button>
            </div>

            {/* Assign to */}
            <div style={{ marginBottom: 16 }}>
              <div className="t-eyebrow" style={{ fontSize: 10.5, marginBottom: 8 }}>指派給</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {children.map((c) => {
                const active = c.id === childId;
                return (
                  <button key={c.id} onClick={() => setChildId(c.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 14px 7px 7px',
                    background: active ? '#fff' : 'transparent',
                    border: active ? `1.5px solid ${c.avatarBg}` : '1px solid var(--t-hairline)',
                    borderRadius: 'var(--t-r-pill)',
                    cursor: 'pointer'
                  }}>
                      <Avatar child={c} size={24} />
                      <span style={{
                      fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 13.5,
                      color: active ? 'var(--t-ink)' : 'var(--t-ink-soft)'
                    }}>{c.name}</span>
                    </button>);

              })}
              </div>
            </div>

            {/* Task name */}
            <div style={{ marginBottom: 14 }}>
              <div className="t-eyebrow" style={{ fontSize: 10.5, marginBottom: 8 }}>任務名稱</div>
              <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="例：幫媽媽搬一下東西"
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'var(--t-paper-warm)',
                border: '1px solid var(--t-hairline)',
                borderRadius: 'var(--t-r-md)',
                fontFamily: 'var(--t-sans)',
                fontSize: 14.5,
                color: 'var(--t-ink)',
                outline: 'none'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--t-navy)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--t-hairline)'} />
            
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {QUICK_SUGGESTIONS.map((s) =>
              <button key={s} onClick={() => setText(s)} style={{
                padding: '5px 11px',
                background: 'transparent',
                border: '1px solid var(--t-hairline)',
                borderRadius: 'var(--t-r-pill)',
                fontFamily: 'var(--t-sans)',
                fontSize: 12,
                color: 'var(--t-ink-muted)',
                cursor: 'pointer'
              }}>{s}</button>
              )}
              </div>
            </div>

            {/* Cat + coins */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <div className="t-eyebrow" style={{ fontSize: 10.5, marginBottom: 8 }}>類別</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['B', 'C'].map((c) =>
                <button key={c} onClick={() => setCat(c)} style={{
                  padding: '6px 12px',
                  background: cat === c ? window.SW_DATA.CATEGORIES[c].bg : 'transparent',
                  border: `1px solid ${cat === c ? window.SW_DATA.CATEGORIES[c].fg : 'var(--t-hairline)'}`,
                  borderRadius: 'var(--t-r-pill)',
                  fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 12,
                  color: cat === c ? window.SW_DATA.CATEGORIES[c].fg : 'var(--t-ink-muted)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}>{c} · {window.SW_DATA.CATEGORIES[c].short}</button>
                )}
                </div>
              </div>
              <div>
                <div className="t-eyebrow" style={{ fontSize: 10.5, marginBottom: 8 }}>幣值</div>
                <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px',
                background: 'var(--t-brass-50)',
                border: '1px solid var(--t-brass-200)',
                borderRadius: 'var(--t-r-pill)',
                opacity: cat === 'B' ? 0.45 : 1
              }}>
                  <Coin size={16} />
                  <input
                  type="number" value={coins}
                  onChange={(e) => setCoins(Math.max(0, parseInt(e.target.value) || 0))}
                  disabled={cat === 'B'}
                  style={{
                    width: 46, border: 'none', background: 'transparent', outline: 'none',
                    fontFamily: 'var(--t-data)', fontWeight: 700, fontSize: 15,
                    color: 'var(--t-ink)', textAlign: 'center'
                  }} />
                
                  <span className="t-meta" style={{ fontSize: 11.5 }}>幣</span>
                </div>
              </div>
            </div>

            <Button
            kind="brass" icon="send"
            onClick={() => text && setSent(true)}
            style={{ width: '100%', opacity: text ? 1 : 0.5, pointerEvents: text ? 'auto' : 'none' }}>
            
              發派給 {child.name}
            </Button>
          </>
        }
      </div>
    </div>);

};

/* ─────────────────────────────────────────────────────────
   待處理事項 — 兌換申請(wishes) + 任務提案(proposals)
   The right column of the dashboard.
   ───────────────────────────────────────────────────────── */
const PendingItems = ({ child }) => {
  const wishes = window.SW_DATA.WISHES.filter((w) => w.childId === child.id).
  slice().sort((a, b) => (b.waitedHours || 0) - (a.waitedHours || 0));
  const proposals = child.proposals;
  const totalCount = wishes.length + proposals.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionHead
        eyebrow="待處理事項"
        title="需要你處理"
        meta={totalCount > 0 ? `${totalCount} 件待審 · 等最久的最前` : '目前沒有待處理'} />
      

      {totalCount === 0 &&
      <div style={{
        padding: '20px 18px',
        background: '#fff',
        border: '1px dashed var(--t-hairline)',
        borderRadius: 'var(--t-r-lg)',
        display: 'flex', flexDirection: 'column', gap: 6
      }}>
          <div style={{
          fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 13.5,
          color: 'var(--t-ink-soft)'
        }}>暫時沒有需要處理的事情</div>
          <div className="t-meta" style={{ fontSize: 12 }}>
            {child.name}的新提案或兌換申請會出現在這裡。
          </div>
        </div>
      }

      {/* 兌換申請 */}
      {wishes.length > 0 &&
      <div>
          <PendingSubhead
          icon="gift" accent="var(--t-brass-700)"
          label="兌換申請"
          count={wishes.length}
          note="孩子許願 · 設定幣值後上架" />
        
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {wishes.map((w) => <WishMiniCard key={w.id} wish={w} child={child} />)}
          </div>
        </div>
      }

      {/* 任務提案 */}
      {proposals.length > 0 &&
      <div>
          <PendingSubhead
          icon="sparkle" accent="var(--t-navy)"
          label="任務提案"
          count={proposals.length}
          note="孩子提案完成的事 · 同意後發幣" />
        
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {proposals.map((p) => <ProposalCard key={p.id} proposal={p} child={child} />)}
          </div>
        </div>
      }
    </div>);

};

const PendingSubhead = ({ icon, accent, label, count, note }) =>
<div style={{
  display: 'flex', alignItems: 'center', gap: 10,
  marginBottom: 10
}}>
    <div style={{
    width: 22, height: 22, borderRadius: 6,
    background: '#fff', color: accent,
    border: '1px solid var(--t-hairline)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0
  }}>
      <Icon name={icon} size={11} stroke={1.8} />
    </div>
    <span style={{
    fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 13,
    color: 'var(--t-ink)'
  }}>{label}</span>
    <span className="t-num" style={{ fontSize: 12, color: accent }}>{count}</span>
    <span style={{ flex: 1, height: 1, background: 'var(--t-hairline)' }} />
    <span className="t-meta" style={{ fontSize: 11 }}>{note}</span>
  </div>;


const WishMiniCard = ({ wish, child }) => {
  const [state, setState] = useStateD('idle'); // idle | approving | approved | rejected
  const [coins, setCoins] = useStateD(wish.ai.suggested);
  const waited = wish.waitedHours || 0;

  if (state === 'approved') {
    return (
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '14px 16px',
        background: 'var(--t-green-50)',
        border: '1px solid #C9DDD0',
        borderRadius: 'var(--t-r-lg)'
      }}>
        <Icon name="check" size={16} color="var(--t-green)" stroke={2.2} />
        <div>
          <div style={{ fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 13, color: 'var(--t-green)' }}>
            已上架 · 「{wish.name}」
          </div>
          <div className="t-meta" style={{ fontSize: 11.5, marginTop: 2 }}>
            設為 {coins} 幣，{child.name}可以前往撲滿兌換。
          </div>
        </div>
      </div>);

  }
  if (state === 'rejected') {
    return (
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '14px 16px',
        background: 'var(--t-coral-50)',
        border: '1px solid #F0CFC7',
        borderRadius: 'var(--t-r-lg)'
      }}>
        <Icon name="x" size={16} color="var(--t-coral)" stroke={2.2} />
        <div style={{ fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 13, color: 'var(--t-coral)' }}>
          已拒絕 · 「{wish.name}」
        </div>
      </div>);

  }

  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--t-hairline)',
      borderRadius: 'var(--t-r-lg)',
      padding: 16
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '2px 8px',
          background: waited >= 24 ? 'var(--t-coral-50)' : 'var(--t-paper-warm)',
          border: `1px solid ${waited >= 24 ? '#F0CFC7' : 'var(--t-hairline)'}`,
          color: waited >= 24 ? 'var(--t-coral)' : 'var(--t-ink-muted)',
          borderRadius: 'var(--t-r-pill)',
          fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 10.5,
          whiteSpace: 'nowrap'
        }}>
          <Icon name="clock" size={10} stroke={2} />
          已等 {waited < 24 ? `${waited} 小時` : `${Math.round(waited / 24)} 天`}
        </span>
        <span className="t-meta" style={{ fontSize: 11 }}>{wish.submittedAt}</span>
      </div>

      <h3 style={{
        fontFamily: 'var(--t-serif)', fontWeight: 600, fontSize: 16,
        margin: 0, marginBottom: 8, color: 'var(--t-ink)', lineHeight: 1.3
      }}>{wish.name}</h3>

      <div style={{
        padding: '9px 12px',
        background: 'var(--t-paper-warm)',
        borderLeft: '2px solid var(--t-brass)',
        borderRadius: '0 var(--t-r-sm) var(--t-r-sm) 0',
        fontFamily: 'var(--t-sans)', fontSize: 12.5, lineHeight: 1.55,
        color: 'var(--t-ink-soft)',
        marginBottom: 10
      }}>「{wish.kidNote}」</div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px',
        background: 'var(--t-navy-50)',
        border: '1px solid var(--t-navy-100)',
        borderRadius: 'var(--t-r-md)',
        marginBottom: 12
      }}>
        <Icon name="sparkle" size={13} color="var(--t-navy)" stroke={1.8} />
        <span style={{
          flex: 1,
          fontFamily: 'var(--t-sans)', fontSize: 11.5,
          color: 'var(--t-ink-soft)', lineHeight: 1.5
        }}>AI 建議 {wish.ai.range[0]}–{wish.ai.range[1]} 幣</span>
        <Coin size={14} />
        <span className="t-num" style={{ fontSize: 14 }}>{wish.ai.suggested}</span>
      </div>

      {state === 'idle' ?
      <div style={{ display: 'flex', gap: 8 }}>
          <Button kind="primary" small icon="check" onClick={() => setState('approving')} style={{ flex: 1 }}>
            同意上架
          </Button>
          <Button kind="outline" small onClick={() => setState('rejected')}>拒絕</Button>
        </div> :

      <div style={{
        padding: 12, background: 'var(--t-paper-warm)',
        borderRadius: 'var(--t-r-sm)'
      }}>
          <div className="t-eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>設定上架幣值</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 10px', background: '#fff',
            border: '1px solid var(--t-brass-200)',
            borderRadius: 'var(--t-r-pill)'
          }}>
              <Coin size={14} />
              <input
              type="number" value={coins}
              onChange={(e) => setCoins(Math.max(0, parseInt(e.target.value) || 0))}
              style={{
                width: 50, border: 'none', background: 'transparent', outline: 'none',
                fontFamily: 'var(--t-data)', fontWeight: 700, fontSize: 15,
                color: 'var(--t-ink)', textAlign: 'center'
              }} />
            
              <span className="t-meta" style={{ fontSize: 11 }}>幣</span>
            </div>
            <span className="t-meta" style={{ fontSize: 11.5 }}>上架後立即可兌換</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button kind="primary" small onClick={() => setState('approved')}>確認</Button>
            <Button kind="ghost" small onClick={() => setState('idle')}>取消</Button>
          </div>
        </div>
      }
    </div>);

};

/* ─────────────────────────────────────────────────────────
   The whole Dashboard (Tab 1)
   ───────────────────────────────────────────────────────── */
const DashboardTab = ({ child, onOpenQuickSend }) => {
  const [tempOpen, setTempOpen] = useStateD(false);
  const [newTaskOpen, setNewTaskOpen] = useStateD(false);

  // When child switches, collapse the temp composer.
  useEffectD(() => {setTempOpen(false);}, [child.id]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <ChildHeaderStrip child={child} />

      {/* Two-column body — middle column wider, right narrower (2:5.5:2.5 in app overall) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 2.2fr) minmax(0, 1fr)',
        gap: 28,
        flex: 1,
        minHeight: 0
      }}>
        {/* Middle — Long-term goals + Today tasks + footer buttons */}
        <section style={{
          display: 'flex', flexDirection: 'column',
          minHeight: 0, overflowY: 'auto',
          marginRight: -8, paddingRight: 8,
          paddingBottom: 20
        }}>
          <LongTermGoals goals={child.longTermGoals} />

          <div style={{
            background: '#fff',
            border: '1px solid var(--t-hairline)',
            borderRadius: 'var(--t-r-xl)',
            padding: '26px 30px',
            display: 'flex', flexDirection: 'column',
            flexShrink: 0
          }}>
            <SectionHead
              eyebrow="任務清單"
              title="今日任務"
              meta={`共 ${child.totalToday} 件 · ${child.doneToday} 件已完成`}
              action={
              <span className="t-meta" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                  <Icon name="clock" size={13} />{window.SW_DATA.TODAY.md} {window.SW_DATA.TODAY.dow}
                </span>
              } />
            
            <div>
              {child.tasks.map((t, i) =>
              <TaskRow key={t.id} task={t} isLast={i === child.tasks.length - 1} />
              )}
            </div>

            {/* Inline temp-task composer */}
            <InlineNewTempTask
              child={child}
              open={tempOpen}
              onOpen={() => setTempOpen(true)}
              onClose={() => setTempOpen(false)}
              onSubmit={() => {/* mock: would prepend to today's list */}} />
            

            {/* Footer buttons — visible only when temp composer is closed */}
            {!tempOpen &&
            <div style={{
              marginTop: 18,
              paddingTop: 18,
              borderTop: '1px dashed var(--t-hairline)',
              display: 'flex', gap: 10
            }}>
                <button
                onClick={() => setTempOpen(true)}
                style={dashFooterBtn('brass')}>
                  <Icon name="plus" size={16} stroke={2.2} />
                  指派臨時任務
                </button>
                <button
                onClick={() => setNewTaskOpen(true)}
                style={dashFooterBtn('navy')}>
                  <Icon name="plus" size={16} stroke={2.2} />
                  建立新任務
                </button>
              </div>
            }
          </div>

          {/* AI consultation entry — sits at the bottom-left of the dashboard */}
          <div style={{ marginTop: 18 }}>
            <AgentChat
              child={child}
              tone="navy"
              heading="本週有什麼想了解的嗎？"
              intro={`問問 AI · 幫你看 ${child.name}的節奏與動機`}
              suggestions={
              child.id === 'enan' ?
              [
              `${child.name}本週的鋼琴計畫怎麼了？`,
              `要怎麼跟${child.name}聊「不要每次都換冰淇淋」？`,
              `這週的提案我都同意了，會不會太寬鬆？`] :

              [
              `${child.name}本週的狀態如何？`,
              `${child.name}最近一直問「為什麼哥哥比較多錢」怎麼回比較好？`,
              `5 歲適合開始累積金幣嗎？`]

              } />

          </div>
        </section>

        {/* Right — 待處理事項 (wishes + proposals) */}
        <section style={{
          display: 'flex', flexDirection: 'column', gap: 18,
          minHeight: 0, overflowY: 'auto', marginRight: -8, paddingRight: 8
        }}>
          <PendingItems child={child} />
        </section>
      </div>

      {/* New task modal */}
      <NewTaskModal open={newTaskOpen} child={child} onClose={() => setNewTaskOpen(false)} />
    </div>);

};

/* Footer button style — 「+ 指派臨時任務」(brass) | 「+ 建立新任務」(navy) */
const dashFooterBtn = (tone) => ({
  flex: 1,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '13px 16px',
  background: tone === 'brass' ? 'var(--t-brass)' : 'var(--t-navy)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--t-r-md)',
  fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 14,
  cursor: 'pointer',
  boxShadow: tone === 'brass' ?
  '0 6px 14px -8px rgba(232,147,74,0.45)' :
  '0 6px 14px -8px rgba(27,58,92,0.45)',
  transition: 'transform .12s var(--t-ease), box-shadow .12s var(--t-ease), filter .12s var(--t-ease)'
});

window.DashboardTab = DashboardTab;
window.QuickSendModal = QuickSendModal;