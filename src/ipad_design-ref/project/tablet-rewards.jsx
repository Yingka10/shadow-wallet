// Shadow Wallet · Parent Tablet — Tab 2 兌換頁面

const { useState: useStateR } = React;

/* ─────────────────────────────────────────────────────────
   Helper: get child by id
   ───────────────────────────────────────────────────────── */
const getChild = (id) => window.SW_DATA.CHILDREN.find(c => c.id === id);

const ChildTag = ({ child, size = 22 }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    whiteSpace: 'nowrap',
  }}>
    <Avatar child={child} size={size} />
    <span style={{
      fontFamily: 'var(--t-sans)', fontWeight: 600,
      fontSize: 13, color: 'var(--t-ink)',
    }}>{child.name}</span>
  </span>
);

/* ─────────────────────────────────────────────────────────
   Wish card — 待審核許願
   ───────────────────────────────────────────────────────── */
const WishCard = ({ wish }) => {
  const child = getChild(wish.childId);
  const [state, setState]   = useStateR('idle');   // idle | approving | rejecting | approved | rejected
  const [reason, setReason] = useStateR(null);
  const [coins, setCoins]   = useStateR(wish.ai.suggested);

  if (state === 'approved') {
    return (
      <DoneCard tone="approved"
        title={`已上架 · 「${wish.name}」`}
        body={`設為 ${coins} 幣，${child.name}可以前往撲滿兌換。`}
      />
    );
  }
  if (state === 'rejected') {
    return (
      <DoneCard tone="rejected"
        title={`已拒絕 · 「${wish.name}」`}
        body={`原因：${reason}`}
      />
    );
  }

  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--t-hairline)',
      borderRadius: 'var(--t-r-lg)',
      padding: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <ChildTag child={child} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {typeof wish.waitedHours === 'number' && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 9px',
              background: wish.waitedHours >= 24 ? 'var(--t-coral-50)' : 'var(--t-paper-warm)',
              border: `1px solid ${wish.waitedHours >= 24 ? '#F0CFC7' : 'var(--t-hairline)'}`,
              color: wish.waitedHours >= 24 ? 'var(--t-coral)' : 'var(--t-ink-muted)',
              borderRadius: 'var(--t-r-pill)',
              fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 11,
            }}>
              <Icon name="clock" size={11} stroke={2}/>
              已等 {wish.waitedHours < 24 ? `${wish.waitedHours} 小時` : `${Math.round(wish.waitedHours/24)} 天`}
            </span>
          )}
          <span className="t-meta" style={{ fontSize: 11.5 }}>{wish.submittedAt}</span>
        </div>
      </div>

      <h3 style={{
        fontFamily: 'var(--t-serif)', fontWeight: 600, fontSize: 20, lineHeight: 1.25,
        color: 'var(--t-ink)', margin: 0, marginBottom: 12,
      }}>{wish.name}</h3>

      <div style={{
        padding: '11px 14px 11px 15px',
        background: 'var(--t-paper-warm)',
        borderLeft: '2px solid var(--t-brass)',
        borderRadius: '0 var(--t-r-md) var(--t-r-md) 0',
        fontFamily: 'var(--t-sans)',
        fontSize: 13.5, lineHeight: 1.55,
        color: 'var(--t-ink-soft)',
        marginBottom: 14,
      }}>「{wish.kidNote}」</div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '12px 14px',
        background: 'var(--t-navy-50)',
        borderRadius: 'var(--t-r-md)',
        marginBottom: 16,
      }}>
        <div style={{ flexShrink: 0 }}>
          <Icon name="sparkle" size={18} color="var(--t-navy)" stroke={1.8}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t-eyebrow" style={{ fontSize: 10, color: 'var(--t-navy)', marginBottom: 3 }}>AI 建議幣值</div>
          <div style={{ fontSize: 12.5, color: 'var(--t-ink-soft)', lineHeight: 1.5 }}>{wish.ai.rationale}</div>
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', background: '#fff',
          border: '1px solid var(--t-navy-200)',
          borderRadius: 'var(--t-r-pill)',
          flexShrink: 0,
        }}>
          <Coin size={16}/>
          <span className="t-num" style={{ fontSize: 17, whiteSpace: 'nowrap' }}>{wish.ai.suggested}</span>
          <span className="t-meta" style={{ fontSize: 11, marginLeft: 4, whiteSpace: 'nowrap' }}>{wish.ai.range[0]}–{wish.ai.range[1]}</span>
        </div>
      </div>

      {state === 'idle' && (
        <div style={{ display: 'flex', gap: 10 }}>
          <Button kind="primary" icon="check" onClick={() => setState('approving')} style={{ flex: 1 }}>
            同意上架
          </Button>
          <Button kind="outline" onClick={() => setState('rejecting')}>拒絕</Button>
        </div>
      )}

      {state === 'approving' && (
        <div style={{
          padding: 14, background: 'var(--t-paper-warm)',
          borderRadius: 'var(--t-r-md)',
        }}>
          <div className="t-eyebrow" style={{ fontSize: 10.5, marginBottom: 10 }}>設定上架幣值</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '7px 12px', background: '#fff',
              border: '1px solid var(--t-brass-200)',
              borderRadius: 'var(--t-r-pill)',
            }}>
              <Coin size={16}/>
              <input
                type="number" value={coins}
                onChange={e => setCoins(Math.max(0, parseInt(e.target.value) || 0))}
                style={{
                  width: 54, border: 'none', background: 'transparent', outline: 'none',
                  fontFamily: 'var(--t-data)', fontWeight: 700, fontSize: 17,
                  color: 'var(--t-ink)', textAlign: 'center',
                }}
              />
              <span className="t-meta" style={{ fontSize: 11.5 }}>幣</span>
            </div>
            <span className="t-meta" style={{ fontSize: 12 }}>上架後立即可兌換</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button kind="primary" small onClick={() => setState('approved')}>確認上架</Button>
            <Button kind="ghost" small onClick={() => setState('idle')}>取消</Button>
          </div>
        </div>
      )}

      {state === 'rejecting' && (
        <div style={{
          padding: 14, background: 'var(--t-paper-warm)',
          borderRadius: 'var(--t-r-md)',
        }}>
          <div className="t-eyebrow" style={{ fontSize: 10.5, marginBottom: 10 }}>選擇拒絕原因</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {window.SW_DATA.WISH_REJECT_REASONS.map(r => (
              <button key={r} onClick={() => { setReason(r); setState('rejected'); }} style={reasonBtnStyle}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--t-coral)'; e.currentTarget.style.color = 'var(--t-coral)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--t-hairline)'; e.currentTarget.style.color = 'var(--t-ink-soft)'; }}>
                {r}
              </button>
            ))}
          </div>
          <button onClick={() => setState('idle')} style={cancelLinkStyle}>取消</button>
        </div>
      )}
    </div>
  );
};
const reasonBtnStyle = {
  textAlign: 'left',
  padding: '10px 12px',
  background: '#fff',
  border: '1px solid var(--t-hairline)',
  borderRadius: 'var(--t-r-sm)',
  fontFamily: 'var(--t-sans)', fontSize: 13,
  color: 'var(--t-ink-soft)',
  cursor: 'pointer',
};
const cancelLinkStyle = {
  marginTop: 10, background: 'none', border: 'none',
  color: 'var(--t-ink-muted)', cursor: 'pointer',
  fontFamily: 'var(--t-sans)', fontSize: 12.5,
};

const DoneCard = ({ tone, title, body }) => {
  const isApp = tone === 'approved';
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: 16,
      background: isApp ? 'var(--t-green-50)' : 'var(--t-coral-50)',
      border: `1px solid ${isApp ? '#C9DDD0' : '#F0CFC7'}`,
      borderRadius: 'var(--t-r-lg)',
    }}>
      <Icon name={isApp ? 'check' : 'x'} size={18}
            color={isApp ? 'var(--t-green)' : 'var(--t-coral)'}
            stroke={2.2}/>
      <div>
        <div style={{
          fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 14,
          color: isApp ? 'var(--t-green)' : 'var(--t-coral)',
        }}>{title}</div>
        <div className="t-meta" style={{ marginTop: 2 }}>{body}</div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   Reward catalog row — with modify-price expand
   ───────────────────────────────────────────────────────── */
const RewardRow = ({ reward, isLast }) => {
  const [open, setOpen] = useStateR(false);
  const [newCoins, setNewCoins] = useStateR(reward.coins);
  const [reasonText, setReasonText] = useStateR('');
  const [applied, setApplied] = useStateR(false);

  const currentCoins = applied ? newCoins : reward.coins;
  const cooldown = window.SW_DATA.COOLDOWN_DAYS;

  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid var(--t-hairline)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 4px',
      }}>
        {/* Thumb */}
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: reward.tint,
          flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--t-serif)', fontWeight: 600, fontSize: 17,
          color: 'rgba(27,27,26,0.55)',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)',
        }}>{reward.name[0]}</div>

        {/* Name */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--t-sans)', fontWeight: 600,
            fontSize: 14, color: 'var(--t-ink)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{reward.name}</div>
          <div className="t-meta" style={{ fontSize: 11.5, marginTop: 2 }}>{reward.last}</div>
        </div>

        {/* Coin price */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <Coin size={15}/>
          <span className="t-num" style={{ fontSize: 16 }}>{currentCoins}</span>
          {applied && currentCoins !== reward.coins && (
            <span className="t-meta" style={{ fontSize: 11, textDecoration: 'line-through', marginLeft: 2 }}>{reward.coins}</span>
          )}
        </div>

        {/* Edit button */}
        <Button
          kind={open ? 'secondary' : 'ghost'}
          small
          icon={open ? 'x' : 'edit'}
          onClick={() => setOpen(v => !v)}
          style={{ padding: '6px 10px' }}
        >{open ? '收起' : '修改'}</Button>
      </div>

      {open && !applied && (
        <div style={{
          marginBottom: 14, padding: 14,
          background: 'var(--t-paper-warm)',
          border: '1px solid var(--t-hairline)',
          borderRadius: 'var(--t-r-md)',
        }}>
          <div className="t-eyebrow" style={{ fontSize: 10.5, marginBottom: 10 }}>修改幣值</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <span className="t-meta" style={{ fontSize: 12.5 }}>
              原價 <span className="t-num" style={{ fontSize: 13 }}>{reward.coins}</span> 幣
            </span>
            <Icon name="chevright" size={14} color="var(--t-ink-muted)"/>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', background: '#fff',
              border: '1px solid var(--t-brass-200)',
              borderRadius: 'var(--t-r-pill)',
            }}>
              <Coin size={15}/>
              <input
                type="number" value={newCoins}
                onChange={e => setNewCoins(Math.max(0, parseInt(e.target.value) || 0))}
                style={{
                  width: 60, border: 'none', background: 'transparent', outline: 'none',
                  fontFamily: 'var(--t-data)', fontWeight: 700, fontSize: 16,
                  color: 'var(--t-ink)', textAlign: 'center',
                }}
              />
              <span className="t-meta" style={{ fontSize: 11.5 }}>幣</span>
            </div>
          </div>

          <div className="t-eyebrow" style={{ fontSize: 10.5, marginBottom: 8 }}>調整原因 <span style={{ color: 'var(--t-coral)' }}>*</span></div>
          <textarea
            value={reasonText}
            onChange={e => setReasonText(e.target.value)}
            placeholder="例：最近常換，提高一點門檻；或：孩子最近很努力，調降獎勵"
            rows={2}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: '#fff',
              border: '1px solid var(--t-hairline)',
              borderRadius: 'var(--t-r-sm)',
              fontFamily: 'var(--t-sans)', fontSize: 13,
              color: 'var(--t-ink)',
              outline: 'none',
              resize: 'none',
              lineHeight: 1.5,
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--t-navy)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--t-hairline)'}
          />

          {/* Cooldown warning */}
          <div style={{
            marginTop: 12, padding: '10px 12px',
            background: 'var(--t-coral-50)',
            border: '1px solid #F0CFC7',
            borderRadius: 'var(--t-r-sm)',
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <Icon name="alert" size={15} color="var(--t-coral)" stroke={2}/>
            <div style={{
              fontFamily: 'var(--t-sans)', fontSize: 12.5, lineHeight: 1.5,
              color: 'var(--t-ink-soft)',
            }}>
              <strong style={{ color: 'var(--t-coral)' }}>緩衝期 {cooldown} 天</strong>　
              修改後，已經看到舊價格的孩子，{cooldown} 天內仍可用舊價格兌換，避免突然漲價造成失望。
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button
              kind="primary" small icon="check"
              onClick={() => reasonText.trim() && setApplied(true)}
              style={{ opacity: reasonText.trim() ? 1 : 0.45, pointerEvents: reasonText.trim() ? 'auto' : 'none' }}
            >
              確認修改
            </Button>
            <Button kind="ghost" small onClick={() => setOpen(false)}>取消</Button>
          </div>
        </div>
      )}

      {applied && (
        <div style={{
          margin: '0 0 14px 0', padding: '8px 12px',
          background: 'var(--t-green-50)',
          borderRadius: 'var(--t-r-sm)',
          fontSize: 12, fontFamily: 'var(--t-sans)',
          color: 'var(--t-green)', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Icon name="check" size={13} stroke={2.4}/>
          已調整 · 緩衝期 {cooldown} 天內舊價有效 ·{' '}
          <button onClick={() => { setApplied(false); setOpen(false); setNewCoins(reward.coins); setReasonText(''); }} style={{
            background: 'none', border: 'none', color: 'var(--t-navy)',
            fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 600,
            cursor: 'pointer', padding: 0, textDecoration: 'underline',
          }}>還原</button>
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   History row — redemption record
   ───────────────────────────────────────────────────────── */
const STATUS_MAP = {
  approved:        { label: '已通過',     tone: 'done' },
  rejected:        { label: '家長已拒絕', tone: 'warn' },
  pending_parent:  { label: '待家長確認', tone: 'brass' },
  insufficient:    { label: 'AI 已退回',  tone: 'pending' },
};

const HistoryRow = ({ entry, isLast }) => {
  const child = getChild(entry.childId);
  const status = STATUS_MAP[entry.status];
  const [resolved, setResolved] = useStateR(null); // null | 'approved' | 'rejected'
  const displayStatus = resolved
    ? (resolved === 'approved' ? STATUS_MAP.approved : STATUS_MAP.rejected)
    : status;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 4px',
      borderBottom: isLast ? 'none' : '1px solid var(--t-hairline)',
    }}>
      <Avatar child={child} size={32}/>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 13.5, color: 'var(--t-ink)' }}>
            {child.name}
          </span>
          <span style={{ fontFamily: 'var(--t-sans)', fontSize: 13.5, color: 'var(--t-ink-soft)' }}>
            想換 <span style={{ fontWeight: 600, color: 'var(--t-ink)' }}>{entry.name}</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 2 }}>
            <Coin size={12}/>
            <span className="t-num" style={{ fontSize: 13 }}>{entry.coins}</span>
          </span>
        </div>
        {entry.aiNote && (
          <div className="t-meta" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            <Icon name="sparkle" size={10} color="var(--t-navy)"/> {entry.aiNote}
          </div>
        )}
        {!entry.aiNote && (
          <div className="t-meta" style={{ fontSize: 11.5 }}>{entry.requestedAt}</div>
        )}
      </div>

      {entry.aiNote && (
        <span className="t-meta" style={{ fontSize: 11, flexShrink: 0, whiteSpace: 'nowrap' }}>
          {entry.requestedAt}
        </span>
      )}

      <StatusTag tone={displayStatus.tone}>{displayStatus.label}</StatusTag>

      {entry.status === 'pending_parent' && !resolved && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <Button kind="outline" small onClick={() => setResolved('rejected')}>拒絕</Button>
          <Button kind="primary" small icon="check" onClick={() => setResolved('approved')}>同意</Button>
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   Page
   ───────────────────────────────────────────────────────── */
const RewardsTab = () => {
  const rawWishes = window.SW_DATA.WISHES;
  // Sort wishes: longest-waited first
  const wishes = [...rawWishes].sort((a, b) => (b.waitedHours || 0) - (a.waitedHours || 0));
  const rewards = window.SW_DATA.REWARDS;
  const history = window.SW_DATA.HISTORY;
  const pendingCount = history.filter(h => h.status === 'pending_parent').length;

  return (
    <div style={{
      height: '100%',
      padding: '24px 32px 24px',
      overflowY: 'auto',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: 22,
      }}>
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 6 }}>Tab 2 / Rewards</div>
          <h1 className="t-h1" style={{ fontSize: 28, margin: 0 }}>兌換</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <MiniStat label="待審許願" value={wishes.length} accent="var(--t-brass)"/>
          <MiniStat label="待家長確認" value={pendingCount} accent="var(--t-navy)"/>
          <MiniStat label="上架獎勵" value={rewards.length} accent="var(--t-ink-muted)"/>
        </div>
      </div>

      {/* Top body — two columns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)',
        gap: 28,
        marginBottom: 32,
      }}>
        {/* Left — Wishes (sorted by waited time) */}
        <section style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <SectionHead
            eyebrow="許願池"
            title="待審核許願"
            meta={`${wishes.length} 件待處理 · 等最久的排最前`}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {wishes.map(w => <WishCard key={w.id} wish={w} />)}
          </div>
        </section>

        {/* Right — Reward catalog */}
        <section style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <SectionHead
            eyebrow="獎勵管理"
            title="已上架獎勵"
            meta={`${rewards.length} 項`}
            action={
              <Button kind="outline" small icon="plus">新增</Button>
            }
          />
          <div style={{
            background: '#fff',
            border: '1px solid var(--t-hairline)',
            borderRadius: 'var(--t-r-lg)',
            padding: '4px 22px',
          }}>
            {rewards.map((r, i) => (
              <RewardRow key={r.id} reward={r} isLast={i === rewards.length - 1}/>
            ))}
          </div>

          <div style={{
            marginTop: 14, padding: '12px 14px',
            background: 'var(--t-paper-warm)',
            borderRadius: 'var(--t-r-md)',
            fontSize: 12.5, lineHeight: 1.55,
            color: 'var(--t-ink-muted)',
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <Icon name="dot" size={10} color="var(--t-brass)"/>
            修改幣值會啟動 {window.SW_DATA.COOLDOWN_DAYS} 天緩衝期，避免孩子看到的價格突然變動。
          </div>
        </section>
      </div>

      {/* Bottom — Redemption history (full width) */}
      <section style={{ minWidth: 0 }}>
        <SectionHead
          eyebrow="近期紀錄"
          title="兌換申請紀錄"
          meta="含 AI 初審 · 最近 5 筆"
        />
        <div style={{
          background: '#fff',
          border: '1px solid var(--t-hairline)',
          borderRadius: 'var(--t-r-lg)',
          padding: '4px 22px',
        }}>
          {history.map((h, i) => (
            <HistoryRow key={h.id} entry={h} isLast={i === history.length - 1}/>
          ))}
        </div>
      </section>
    </div>
  );
};

const MiniStat = ({ label, value, accent }) => (
  <div style={{ textAlign: 'right' }}>
    <div className="t-eyebrow" style={{ fontSize: 10, marginBottom: 3 }}>{label}</div>
    <div style={{
      fontFamily: 'var(--t-data)', fontWeight: 700, fontSize: 22,
      color: accent || 'var(--t-ink)', letterSpacing: '-0.01em',
    }}>{value}</div>
  </div>
);

window.SW_RewardsTab = RewardsTab;
