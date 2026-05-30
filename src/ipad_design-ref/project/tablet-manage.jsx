// Shadow Wallet · Parent Tablet — Tab 「管理」
// 任務庫 + 獎勵清單 + 兌換歷史入口 + 設定（profile / notify）
// 這頁是「設定面」，不顯示執行狀況。

const { useState: useStateM } = React;

const CAT_GROUP_META = {
  A: { label: 'A 類', name: '生活自理' },
  B: { label: 'B 類', name: '家庭本分' },
  C: { label: 'C 類', name: '超出本分' },
  D: { label: 'D 類', name: '里程碑' },
};

/* ─────────────────────────────────────────────────────────
   Page header — breadcrumb + child chip
   ───────────────────────────────────────────────────────── */
const ManageHeader = ({ child, onPickChild, lib }) => {
  const children = window.SW_DATA.CHILDREN;
  const flat = ['A','B','C','D'].flatMap(c => lib[c] || []);
  const active  = flat.filter(t => t.status === 'active').length;
  const pending = flat.filter(t => t.status === 'pending').length;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '20px 32px 18px',
      background: 'var(--t-paper)',
      borderBottom: '1px solid var(--t-hairline)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          fontFamily: 'var(--t-sans)', fontSize: 12.5,
          color: 'var(--t-ink-muted)',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <Icon name="settings" size={13} stroke={1.7}/>
            <span className="t-eyebrow" style={{ fontSize: 11 }}>家長設定</span>
          </span>
          <span style={{ opacity: 0.45 }}>·</span>
          <span style={{ whiteSpace: 'nowrap' }}>
            啟用中
            <span className="t-num" style={{
              fontSize: 13, color: 'var(--t-ink)', margin: '0 4px',
            }}>{active}</span>
            項任務
          </span>
          <span style={{ opacity: 0.45 }}>·</span>
          <span style={{ whiteSpace: 'nowrap' }}>
            待生效
            <span className="t-num" style={{
              fontSize: 13,
              color: pending > 0 ? 'var(--t-brass-700)' : 'var(--t-ink)',
              margin: '0 4px',
            }}>{pending}</span>
            項
          </span>
        </div>
        <h1 className="t-h1" style={{ margin: 0, fontSize: 26 }}>
          {child.name} · 設定面板
        </h1>
      </div>

      {/* Child switcher */}
      <div style={{
        display: 'inline-flex',
        padding: 3,
        background: 'var(--t-paper-warm)',
        border: '1px solid var(--t-hairline)',
        borderRadius: 'var(--t-r-pill)',
      }}>
        {children.map(c => {
          const isActive = c.id === child.id;
          return (
            <button key={c.id} onClick={() => onPickChild(c.id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 14px 6px 6px',
              background: isActive ? '#fff' : 'transparent',
              color: isActive ? 'var(--t-ink)' : 'var(--t-ink-muted)',
              border: 'none',
              borderRadius: 'var(--t-r-pill)',
              fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 13,
              cursor: 'pointer',
              boxShadow: isActive ? '0 1px 2px rgba(27,27,26,0.06)' : 'none',
              transition: 'background-color .15s var(--t-ease)',
            }}>
              <Avatar child={c} size={24} />
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   Task library — left column
   ───────────────────────────────────────────────────────── */
const TaskLibrary = ({ lib }) => {
  return (
    <section style={{
      background: '#fff',
      border: '1px solid var(--t-hairline)',
      borderRadius: 'var(--t-r-xl)',
      padding: '22px 24px 18px',
      display: 'flex', flexDirection: 'column',
      minHeight: 0,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: 18,
      }}>
        <div>
          <div className="t-eyebrow" style={{
            marginBottom: 6,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <Icon name="library" size={11} stroke={1.8}/> Library
          </div>
          <h2 className="t-h2" style={{ margin: 0, fontSize: 21 }}>任務庫</h2>
          <div className="t-meta" style={{ fontSize: 12.5, marginTop: 4 }}>
            任務設定面 · 不顯示執行狀況
          </div>
        </div>
        <Button kind="primary" small icon="plus">新增任務</Button>
      </div>

      {/* Categories */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 20,
        overflowY: 'auto', minHeight: 0, paddingRight: 4, marginRight: -4,
      }}>
        {['A','B','C','D'].map(catKey => (
          <CategoryGroup key={catKey} catKey={catKey} tasks={lib[catKey] || []} />
        ))}
      </div>
    </section>
  );
};

const CategoryGroup = ({ catKey, tasks }) => {
  const meta = window.SW_DATA.CATEGORIES[catKey];
  const groupMeta = CAT_GROUP_META[catKey];
  const active = tasks.filter(t => t.status === 'active').length;
  const total  = tasks.length;

  return (
    <div>
      {/* Group head */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{
            width: 22, height: 22, borderRadius: 7,
            background: meta.fg, color: '#fff',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--t-data)', fontWeight: 700, fontSize: 12,
            flexShrink: 0,
          }}>{catKey}</span>
          <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
            <span style={{
              fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 14,
              color: 'var(--t-ink)',
            }}>{groupMeta.label}</span>
            <span style={{
              fontFamily: 'var(--t-sans)', fontWeight: 500, fontSize: 13.5,
              color: 'var(--t-ink-soft)',
            }}>{groupMeta.name}</span>
          </div>
        </div>
        <span className="t-meta" style={{ fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>
          <span className="t-num" style={{ fontSize: 12.5, color: 'var(--t-ink-soft)' }}>{active}</span>
          <span style={{ margin: '0 2px' }}>/</span>
          <span className="t-num" style={{ fontSize: 12.5 }}>{total}</span>
          {' 啟用'}
        </span>
      </div>

      {/* Task rows */}
      <div style={{
        border: '1px solid var(--t-hairline)',
        borderRadius: 'var(--t-r-md)',
        overflow: 'hidden',
        background: '#fff',
      }}>
        {tasks.length === 0 ? (
          <div style={{
            padding: '12px 14px',
            fontFamily: 'var(--t-sans)', fontSize: 12.5,
            color: 'var(--t-ink-muted)',
            textAlign: 'center',
          }}>本類別尚無任務</div>
        ) : tasks.map((t, i) => (
          <LibraryTaskRow key={t.id} task={t} isLast={i === tasks.length - 1} catFg={meta.fg}/>
        ))}
      </div>
    </div>
  );
};

const LibraryTaskRow = ({ task, isLast, catFg }) => {
  const isPending = task.status === 'pending';
  const isPaused  = task.status === 'paused';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 14px',
      borderBottom: isLast ? 'none' : '1px solid var(--t-hairline)',
      background: isPending ? '#FBF1D8' : '#fff',
    }}>
      {/* Status dot */}
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: isPending ? 'var(--t-brass)' : isPaused ? 'var(--t-ink-faint)' : 'var(--t-green)',
        flexShrink: 0,
      }}/>

      {/* Name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: isPending ? 3 : 0,
        }}>
          <span style={{
            fontFamily: 'var(--t-sans)', fontWeight: 600,
            fontSize: 13.5,
            color: isPaused ? 'var(--t-ink-muted)' : 'var(--t-ink)',
            textDecoration: isPaused ? 'line-through' : 'none',
          }}>{task.name}</span>
          {isPending && (
            <span style={{
              padding: '1px 7px',
              background: 'var(--t-brass)', color: '#fff',
              borderRadius: 'var(--t-r-pill)',
              fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 10,
              letterSpacing: '0.04em',
              lineHeight: 1.4,
            }}>待生效</span>
          )}
          {isPaused && (
            <span style={{
              fontFamily: 'var(--t-sans)', fontSize: 11,
              color: 'var(--t-ink-muted)',
            }}>暫停中</span>
          )}
        </div>
        {isPending && (
          <div style={{
            fontFamily: 'var(--t-sans)', fontSize: 11.5,
            color: 'var(--t-brass-700)',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <Icon name="clock" size={10} stroke={2} color="var(--t-brass-700)"/>
            孩子自提 · 約 {task.pendingHours} 小時後生效
          </div>
        )}
      </div>

      {/* Coin */}
      <div style={{
        width: 64, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        gap: 4,
      }}>
        {task.coins > 0 ? (
          <>
            <Coin size={13}/>
            <span className="t-num" style={{ fontSize: 14 }}>{task.coins}</span>
          </>
        ) : (
          <span className="t-meta" style={{ fontSize: 12 }}>—</span>
        )}
      </div>

      {/* Edit */}
      <button style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'transparent', border: 'none',
        color: 'var(--t-ink-muted)', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background-color .12s var(--t-ease), color .12s var(--t-ease)',
        flexShrink: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--t-paper-warm)'; e.currentTarget.style.color = catFg; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--t-ink-muted)'; }}>
        <Icon name="edit" size={14}/>
      </button>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   Reward list — right column upper
   ───────────────────────────────────────────────────────── */
const RewardListSection = () => {
  const rewards = window.SW_DATA.REWARDS;

  return (
    <section style={{
      background: '#fff',
      border: '1px solid var(--t-hairline)',
      borderRadius: 'var(--t-r-xl)',
      padding: '22px 24px 18px',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <div>
          <div className="t-eyebrow" style={{
            marginBottom: 5,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <Icon name="gift" size={11} stroke={1.8}/> Rewards
          </div>
          <h3 className="t-h2" style={{ margin: 0, fontSize: 19 }}>獎勵清單</h3>
          <div className="t-meta" style={{ fontSize: 12.5, marginTop: 4 }}>
            可兌換項目 · 修改有 {window.SW_DATA.COOLDOWN_DAYS} 天緩衝期
          </div>
        </div>
        <Button kind="primary" small icon="plus">新增獎勵</Button>
      </div>

      <div style={{
        border: '1px solid var(--t-hairline)',
        borderRadius: 'var(--t-r-md)',
        overflow: 'hidden',
      }}>
        {rewards.map((r, i) => (
          <RewardLibRow key={r.id} reward={r} isLast={i === rewards.length - 1}/>
        ))}
      </div>
    </section>
  );
};

const RewardLibRow = ({ reward, isLast }) => {
  // mock: pretend some items are mid-progress
  const progress = reward.coins <= 50
    ? { redeemable: true }
    : { current: Math.min(reward.coins, 184), total: reward.coins };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px',
      borderBottom: isLast ? 'none' : '1px solid var(--t-hairline)',
    }}>
      {/* Thumb */}
      <div style={{
        width: 34, height: 34, borderRadius: 9,
        background: reward.tint, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--t-serif)', fontWeight: 600, fontSize: 15,
        color: 'rgba(27,27,26,0.55)',
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)',
      }}>{reward.name[0]}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{
            fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 13.5,
            color: 'var(--t-ink)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{reward.name}</span>
          {progress.redeemable && (
            <span style={{
              padding: '1px 7px',
              background: 'var(--t-green-50)', color: 'var(--t-green)',
              border: '1px solid #C9DDD0',
              borderRadius: 'var(--t-r-pill)',
              fontFamily: 'var(--t-sans)', fontWeight: 600, fontSize: 10.5,
              lineHeight: 1.4, whiteSpace: 'nowrap',
            }}>孩子可領取</span>
          )}
        </div>
        {!progress.redeemable && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, maxWidth: 160 }}>
              <Progress value={progress.current} total={progress.total} height={3} color="var(--t-brass)"/>
            </div>
            <span className="t-meta" style={{ fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>
              <span className="t-num" style={{ fontSize: 11.5 }}>{progress.current}</span>
              {' / '}{progress.total}
            </span>
          </div>
        )}
      </div>

      {/* Coin price */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <Coin size={14}/>
        <span className="t-num" style={{ fontSize: 14.5 }}>{reward.coins}</span>
      </div>

      <button style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'transparent', border: 'none',
        color: 'var(--t-ink-muted)', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--t-paper-warm)'; e.currentTarget.style.color = 'var(--t-brass-700)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--t-ink-muted)'; }}>
        <Icon name="edit" size={14}/>
      </button>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   兌換歷史 entry — right column middle
   ───────────────────────────────────────────────────────── */
const HistoryEntry = ({ child }) => {
  const monthCount = window.SW_DATA.HISTORY.filter(h => h.childId === child.id).length;
  return (
    <button style={{
      width: '100%',
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '18px 22px',
      background: '#fff',
      border: '1px solid var(--t-hairline)',
      borderRadius: 'var(--t-r-lg)',
      cursor: 'pointer',
      textAlign: 'left',
      transition: 'border-color .15s var(--t-ease), background-color .15s var(--t-ease)',
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--t-navy-200)'; e.currentTarget.style.background = 'var(--t-navy-50)'; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--t-hairline)'; e.currentTarget.style.background = '#fff'; }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: 'var(--t-navy-50)', color: 'var(--t-navy)',
        border: '1px solid var(--t-navy-200)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon name="history" size={18} stroke={1.7}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3,
        }}>
          <span style={{
            fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 14.5,
            color: 'var(--t-ink)',
          }}>兌換歷史</span>
          <span className="t-meta" style={{ fontSize: 12 }}>
            本月
            <span className="t-num" style={{ fontSize: 12.5, margin: '0 3px', color: 'var(--t-ink-soft)' }}>{monthCount}</span>
            筆
          </span>
        </div>
        <div className="t-meta" style={{ fontSize: 12, lineHeight: 1.5 }}>
          含 AI 初審紀錄、家長確認與已退回項目
        </div>
      </div>
      <Icon name="chevright" size={18} color="var(--t-ink-muted)"/>
    </button>
  );
};

/* ─────────────────────────────────────────────────────────
   設定 — right column lower
   ───────────────────────────────────────────────────────── */
const SettingsSection = ({ child }) => {
  const s = window.SW_DATA.PARENT_SETTINGS[child.id];

  return (
    <section style={{
      background: '#fff',
      border: '1px solid var(--t-hairline)',
      borderRadius: 'var(--t-r-xl)',
      padding: '20px 24px 18px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <div>
          <div className="t-eyebrow" style={{
            marginBottom: 5,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <Icon name="settings" size={11} stroke={1.8}/> Settings
          </div>
          <h3 className="t-h2" style={{ margin: 0, fontSize: 19 }}>設定</h3>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Profile entry */}
        <SettingsRow
          icon="user"
          accent="var(--t-navy)"
          accentBg="var(--t-navy-50)"
          accentBd="var(--t-navy-200)"
          heading={`${s.profile.name} · 個人資料`}
          summary={
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <SetChip>姓名 {s.profile.name}</SetChip>
              <SetChip>年齡 {s.profile.age} 歲</SetChip>
              <SetChip>每週可兌換上限 {s.profile.weeklyMax} 幣</SetChip>
            </div>
          }
          headTrail={<Avatar child={child} size={28}/>}
        />

        {/* Notification entry */}
        <SettingsRow
          icon="bell"
          accent="var(--t-brass-700)"
          accentBg="var(--t-brass-50)"
          accentBd="#EFCDA6"
          heading="通知設定"
          summary={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <SetChip>提醒時段 {s.notify.window}</SetChip>
                <SetChip>{s.notify.sound}</SetChip>
              </div>
              <div className="t-meta" style={{ fontSize: 11.5 }}>
                推播：{s.notify.pushKinds.join('、')}
              </div>
            </div>
          }
        />
      </div>
    </section>
  );
};

const SetChip = ({ children }) => (
  <span style={{
    padding: '2px 9px',
    background: 'var(--t-paper-warm)',
    border: '1px solid var(--t-hairline)',
    borderRadius: 'var(--t-r-pill)',
    fontFamily: 'var(--t-sans)', fontSize: 11.5,
    color: 'var(--t-ink-soft)',
    whiteSpace: 'nowrap',
    lineHeight: 1.6,
  }}>{children}</span>
);

const SettingsRow = ({ icon, accent, accentBg, accentBd, heading, summary, headTrail }) => (
  <button style={{
    width: '100%',
    display: 'flex', alignItems: 'flex-start', gap: 14,
    padding: '14px 16px',
    background: '#fff',
    border: '1px solid var(--t-hairline)',
    borderRadius: 'var(--t-r-md)',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color .15s var(--t-ease), background-color .15s var(--t-ease)',
  }}
  onMouseEnter={e => { e.currentTarget.style.borderColor = accentBd; e.currentTarget.style.background = accentBg; }}
  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--t-hairline)'; e.currentTarget.style.background = '#fff'; }}>
    <div style={{
      width: 34, height: 34, borderRadius: 9,
      background: accentBg, color: accent,
      border: `1px solid ${accentBd}`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <Icon name={icon} size={15} stroke={1.7}/>
    </div>

    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
      }}>
        <span style={{
          fontFamily: 'var(--t-sans)', fontWeight: 700, fontSize: 14,
          color: 'var(--t-ink)',
        }}>{heading}</span>
        {headTrail}
      </div>
      <div style={{
        fontFamily: 'var(--t-sans)', fontSize: 12.5, lineHeight: 1.55,
        color: 'var(--t-ink-soft)',
      }}>{summary}</div>
    </div>

    <Icon name="chevright" size={16} color="var(--t-ink-muted)"/>
  </button>
);

/* ─────────────────────────────────────────────────────────
   Page
   ───────────────────────────────────────────────────────── */
const ManageTabImpl = ({ childId: propChildId, onPickChild: propOnPickChild }) => {
  // Allow standalone child state if app doesn't pass one
  const [localChildId, setLocalChildId] = useStateM(propChildId || window.SW_DATA.CHILDREN[0].id);
  const childId       = propChildId || localChildId;
  const setChildId    = propOnPickChild || setLocalChildId;
  const child = window.SW_DATA.CHILDREN.find(c => c.id === childId);
  const lib   = window.SW_DATA.TASKS_LIBRARY[childId] || { A: [], B: [], C: [], D: [] };

  return (
    <div style={{
      flex: 1, minWidth: 0,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--t-paper)',
    }}>
      <ManageHeader child={child} onPickChild={setChildId} lib={lib} />

      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '20px 32px 28px',
      }}>
        {/* Two column grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)',
          gap: 22,
          alignItems: 'start',
        }}>
          {/* Left — Task library (full height of grid row) */}
          <TaskLibrary lib={lib} />

          {/* Right — stack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <RewardListSection />
            <HistoryEntry child={child}/>
            <SettingsSection child={child}/>
          </div>
        </div>
      </div>
    </div>
  );
};

window.SW_ManageTab = ManageTabImpl;
