// Task Detail — full task view, with status header + bottom action bar

const OBSERVE_TYPES = [
  { id: 'emotion', label: '今天情緒不好，沒有完成', desc: '不影響獎勵，幫助你看到孩子的狀態' },
  { id: 'quality', label: '完成了但品質不佳',       desc: '已完成，但希望下次更專心' },
  { id: 'bonus',   label: '主動多做了額外的事',     desc: '會在週報中看到「值得肯定」' },
  { id: 'other',   label: '其他狀況',               desc: '自由描述' },
];

const RECENT_RECORDS = [
  { date: '今天', status: 'pending', note: null },
  { date: '昨天', status: 'done', time: '07:35', note: null },
  { date: '5/14', status: 'done', time: '07:28', note: null },
  { date: '5/13', status: 'observed', note: '比較想睡，最後還是完成了', type: 'emotion' },
  { date: '5/12', status: 'done', time: '07:40', note: null },
  { date: '5/11', status: 'missed', note: null },
  { date: '5/10', status: 'done', time: '07:32', note: null },
];

function TaskDetailScreen({ child, kids, tasks, today, nav, params }) {
  const taskId = params?.taskId;
  const kidTasks = tasks[child.id] || [];
  const task = kidTasks.find(t => t.id === taskId);

  const todayMap = Object.fromEntries((today[child.id] || []).map(t => [t.id, t]));
  const todayEntry = todayMap[taskId];

  // Section states
  const [observeOpen, setObserveOpen] = React.useState(!!params?.openObserve);
  const [editOpen, setEditOpen] = React.useState(!!params?.openEdit);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [marked, setMarked] = React.useState(todayEntry?.status === 'done');

  // Observe form state
  const [obsType, setObsType] = React.useState(null);
  const [obsNote, setObsNote] = React.useState('');
  const [obsReward, setObsReward] = React.useState(null);
  const [obsSaved, setObsSaved] = React.useState(false);

  // Refs for scrolling open panels into view
  const observeRef = React.useRef(null);
  const editRef = React.useRef(null);

  React.useEffect(() => {
    if (observeOpen && observeRef.current) {
      observeRef.current.parentElement?.scrollTo({ top: observeRef.current.offsetTop - 60, behavior: 'smooth' });
    }
  }, [observeOpen]);

  React.useEffect(() => {
    if (editOpen && editRef.current) {
      editRef.current.parentElement?.scrollTo({ top: editRef.current.offsetTop - 60, behavior: 'smooth' });
    }
  }, [editOpen]);

  if (!task) {
    return (
      <div className="p-screen" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <div className="p-meta" style={{ marginBottom: 12 }}>找不到這項任務</div>
        <Button variant="secondary" onClick={() => nav.back()}>返回</Button>
      </div>
    );
  }

  const meta = TASK_CAT[task.cat];

  // 7-day stats — derived from records (canned, includes today)
  const last7 = RECENT_RECORDS;
  const completed7 = last7.filter(r => r.status === 'done' || r.status === 'observed').length;
  const ratePct = Math.round((completed7 / 7) * 100);

  const onSaveObserve = () => {
    setObsSaved(true);
    setTimeout(() => {
      setObserveOpen(false);
      setObsSaved(false);
      setObsType(null);
      setObsNote('');
      setObsReward(null);
    }, 1100);
  };

  // Status logic
  const isDone = marked || todayEntry?.status === 'done';
  const statusLabel =
    isDone ? `已完成${todayEntry?.time ? ' · ' + todayEntry.time : ''}` :
    todayEntry?.status === 'review' ? '孩子已回報，待你確認' :
    todayEntry?.status === 'missed' ? '今日尚未完成' :
    !todayEntry ? '今日尚未開始' :
    todayEntry?.note || '尚未完成';

  const appliesTo = kids; // canned: both kids — in real app this is task.appliesTo

  return (
    <div className="p-screen" style={{ padding: '6px 16px 110px' }}>
      {/* Hero */}
      <div style={{ padding: '14px 4px 14px' }}>
        <div className="p-eyebrow" style={{ marginBottom: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 8px', borderRadius: 999,
            background: meta.tint, color: meta.fg,
          }}>
            {React.cloneElement(meta.icon, { size: 11 })}
            <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em' }}>{meta.label}</span>
          </span>
        </div>
        <div className="p-display" style={{ lineHeight: 1.22 }}>{task.name}</div>
      </div>

      {/* Compact info card */}
      <div style={{
        background: '#FFFFFF', borderRadius: 14,
        border: '1px solid var(--border-soft)',
        marginBottom: 12,
        overflow: 'hidden',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <InfoCell label="類別" value={meta.label} />
          <InfoCell label="難度" value={task.diff === 1 ? '簡單' : task.diff === 2 ? '中等' : '困難'} borderL />
          <InfoCell
            label="獎勵"
            borderT
            value={
              task.reward ? (
                task.reward.type === 'coins'
                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--gold-700)' }}>{task.reward.n}<CoinGlyph size={12} /></span>
                  : <span style={{ color: 'var(--p-teal-500)' }}>{task.reward.m} 分鐘</span>
              ) : task.cat === 'D' ? '進度任務' : '無'
            }
          />
          <InfoCell label="頻率" value={task.freq} borderL borderT />
        </div>
        <div style={{
          borderTop: '1px solid var(--border-soft)',
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 11.5, color: 'var(--p-ink-500)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>適用孩子</span>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 1 }}>
            {appliesTo.map(k => (
              <div key={k.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Avatar child={k} size={20} />
                <span style={{ fontSize: 12.5, color: 'var(--p-ink-700)', fontWeight: 500 }}>{k.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Today's status — primary call to action */}
      <div style={{
        background: isDone ? 'var(--p-teal-50)' : '#FFFFFF',
        border: `1px solid ${isDone ? 'var(--p-teal-100)' : 'var(--border-soft)'}`,
        borderRadius: 16, padding: '14px 16px',
        boxShadow: 'var(--p-shadow-card)',
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="p-eyebrow" style={{ marginBottom: 3 }}>今日狀態 · {child.name}</div>
            <div style={{
              fontFamily: 'var(--p-font-display)',
              fontSize: 18, fontWeight: 500, color: 'var(--p-ink-900)', lineHeight: 1.3,
            }}>
              {statusLabel}
            </div>
          </div>
          {isDone && (
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--p-teal-500)', color: '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Icon.check size={18} />
            </div>
          )}
        </div>
        {!isDone && (
          <button onClick={() => setMarked(true)} style={{
            marginTop: 12, width: '100%',
            background: 'var(--p-teal-500)', color: '#FFFFFF',
            border: 'none', borderRadius: 12,
            padding: '12px 14px',
            fontSize: 14, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            cursor: 'pointer',
          }}>
            <Icon.check size={16} />幫孩子標記完成
          </button>
        )}
        {isDone && marked && !todayEntry?.time && (
          <button onClick={() => setMarked(false)} style={{
            marginTop: 10, fontSize: 12, color: 'var(--p-ink-500)',
            background: 'transparent', border: 'none',
            cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3,
          }}>取消標記</button>
        )}
      </div>

      {/* 7-day completion rate */}
      <div style={{
        background: '#FFFFFF', borderRadius: 14,
        border: '1px solid var(--border-soft)',
        padding: '12px 16px',
        marginBottom: 18,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{ flex: 1 }}>
          <div className="p-eyebrow" style={{ marginBottom: 4 }}>過去 7 天完成率</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span className="p-num" style={{ fontFamily: 'var(--p-font-display)', fontSize: 22, fontWeight: 500, color: 'var(--p-ink-900)' }}>
              {completed7}
            </span>
            <span style={{ fontSize: 13, color: 'var(--p-ink-500)' }}>/ 7 天</span>
            <span style={{ marginLeft: 8, fontSize: 12, color: ratePct >= 70 ? 'var(--p-sage-500)' : 'var(--p-ink-500)', fontWeight: 600 }}>
              {ratePct}%
            </span>
          </div>
        </div>
        {/* 7-dot strip */}
        <div style={{ display: 'flex', gap: 4 }}>
          {last7.slice().reverse().map((r, i) => {
            const dot =
              r.status === 'done' || r.status === 'observed' ? 'var(--p-sage-500)' :
              r.status === 'missed' ? 'var(--p-warn)' :
              'var(--p-ivory-300)';
            return (
              <div key={i} title={r.date} style={{
                width: 10, height: 22, borderRadius: 4,
                background: dot,
                opacity: r.status === 'pending' ? 0.5 : 1,
              }} />
            );
          })}
        </div>
      </div>

      {/* Observe form — inline panel */}
      {observeOpen && (
        <div ref={observeRef} style={{
          background: '#FFFFFF', borderRadius: 16,
          border: '1px solid #ECDFD0',
          boxShadow: 'var(--p-shadow-card)',
          padding: '16px 16px 14px',
          marginBottom: 18,
          animation: 'p-fade-in 240ms var(--ease-out)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: '#FAF1E7', color: 'var(--p-clay-500)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <FlagOutlineIcon size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--p-font-display)', fontSize: 17, fontWeight: 500, color: 'var(--p-ink-900)' }}>
                記錄觀察
              </div>
              <div style={{ fontSize: 12, color: 'var(--p-ink-500)', marginTop: 2, lineHeight: 1.5 }}>
                只記錄今天的小狀況，不會影響獎勵或扣分。週報時 AI 會綜合這些紀錄給你建議。
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--p-ink-900)', marginBottom: 8, letterSpacing: '0.02em' }}>
            選擇狀況類型
          </div>
          <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
            {OBSERVE_TYPES.map(o => {
              const active = obsType === o.id;
              return (
                <button key={o.id} onClick={() => { setObsType(o.id); setObsReward(null); }} style={{
                  width: '100%', textAlign: 'left',
                  background: active ? 'var(--p-teal-50)' : '#FFFFFF',
                  border: `1.5px solid ${active ? 'var(--p-teal-500)' : 'var(--border-soft)'}`,
                  borderRadius: 12, padding: '11px 12px',
                  display: 'flex', alignItems: 'center', gap: 10,
                  cursor: 'pointer',
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    border: `1.5px solid ${active ? 'var(--p-teal-500)' : 'var(--p-ivory-300)'}`,
                    background: active ? 'var(--p-teal-500)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {active && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFFFFF' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--p-ink-900)' }}>{o.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--p-ink-500)', marginTop: 1 }}>{o.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {obsType && (
            <RewardAdjust type={obsType} reward={task.reward} value={obsReward} onChange={setObsReward} />
          )}

          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--p-ink-900)', marginBottom: 6, letterSpacing: '0.02em', display: 'flex', justifyContent: 'space-between' }}>
            <span>備註</span>
            <span style={{ fontSize: 11, color: 'var(--p-ink-400)', fontWeight: 400 }}>選填</span>
          </div>
          <textarea
            value={obsNote}
            onChange={e => setObsNote(e.target.value)}
            placeholder="可以多寫一兩句，幫助你日後回顧。例如：今天弟弟生病比較焦躁。"
            rows={3}
            style={{ ...inputStyle, resize: 'none', minHeight: 72, lineHeight: 1.5, fontFamily: 'var(--p-font-body)' }}
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button variant="secondary" size="md" onClick={() => setObserveOpen(false)}>取消</Button>
            <Button variant="primary" size="md" full disabled={!obsType} onClick={onSaveObserve}>
              {obsSaved ? <><Icon.check size={14} />已儲存</> : <>儲存觀察</>}
            </Button>
          </div>
        </div>
      )}

      {/* Edit panel */}
      {editOpen && (
        <div ref={editRef} style={{
          background: '#FFFFFF', borderRadius: 16,
          border: '1px solid var(--border-soft)',
          padding: 16, marginBottom: 18,
          animation: 'p-fade-in 240ms var(--ease-out)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'var(--p-ivory-100)', color: 'var(--p-ink-700)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <EditOutlineIcon size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--p-font-display)', fontSize: 17, fontWeight: 500, color: 'var(--p-ink-900)' }}>編輯任務</div>
              <div style={{ fontSize: 12, color: 'var(--p-ink-500)' }}>修改這項任務的設定</div>
            </div>
          </div>

          <FormGroup label="任務名稱">
            <input defaultValue={task.name} style={inputStyle} />
          </FormGroup>
          <FormGroup label="執行頻率">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {['每日', '每週', '單次'].map(f => {
                const on = task.freq.includes(f) || (f === '每週' && task.freq.includes('每週'));
                return (
                  <button key={f} style={{
                    padding: '10px 8px', borderRadius: 12,
                    background: on ? 'var(--p-ink-900)' : '#FFFFFF',
                    color: on ? '#FFFFFF' : 'var(--p-ink-700)',
                    border: on ? 'none' : '1px solid var(--border-soft)',
                    fontSize: 13, fontWeight: 500,
                  }}>{f}</button>
                );
              })}
            </div>
          </FormGroup>
          <FormGroup label="難度">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[1,2,3].map(n => {
                const on = n === task.diff;
                return (
                  <button key={n} style={{
                    padding: '10px 8px', borderRadius: 12,
                    background: on ? 'var(--p-ink-900)' : '#FFFFFF',
                    color: on ? '#FFFFFF' : 'var(--p-ink-700)',
                    border: on ? 'none' : '1px solid var(--border-soft)',
                    fontSize: 13, fontWeight: 500,
                  }}>{n === 1 ? '簡單' : n === 2 ? '中等' : '困難'}</button>
                );
              })}
            </div>
          </FormGroup>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <Button variant="secondary" size="md" onClick={() => setEditOpen(false)}>取消</Button>
            <Button variant="primary" size="md" full onClick={() => setEditOpen(false)}>
              <Icon.check size={14} />儲存變更
            </Button>
          </div>
        </div>
      )}

      {/* Recent records */}
      <SectionHead eyebrow="近期紀錄" title="這項任務的歷史" />
      <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid var(--border-soft)', overflow: 'hidden', marginBottom: 18 }}>
        {RECENT_RECORDS.map((r, i) => (
          <RecordRow key={i} r={r} divider={i < RECENT_RECORDS.length - 1} />
        ))}
      </div>

      {/* Bottom action bar — sticky */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: 'rgba(250,248,243,0.92)',
        backdropFilter: 'blur(14px) saturate(160%)',
        WebkitBackdropFilter: 'blur(14px) saturate(160%)',
        borderTop: '1px solid var(--border-soft)',
        padding: '12px 14px calc(12px + env(safe-area-inset-bottom, 0))',
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
        zIndex: 8,
      }}>
        <BottomActionBtn
          icon={<FlagOutlineIcon size={16} />}
          label="記錄觀察"
          color="var(--p-clay-500)"
          active={observeOpen}
          onClick={() => { setEditOpen(false); setObserveOpen(o => !o); }}
        />
        <BottomActionBtn
          icon={<EditOutlineIcon size={16} />}
          label="編輯"
          color="var(--p-ink-700)"
          active={editOpen}
          onClick={() => { setObserveOpen(false); setEditOpen(o => !o); }}
        />
        <BottomActionBtn
          icon={<TrashIcon size={16} />}
          label="刪除"
          color="var(--p-coral-600, #B5483A)"
          danger
          onClick={() => setConfirmDelete(true)}
        />
      </div>

      {/* Delete confirm */}
      {confirmDelete && (
        <DeleteConfirm
          taskName={task.name}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); nav.back(); }}
        />
      )}
    </div>
  );
}

function InfoCell({ label, value, borderL, borderT }) {
  return (
    <div style={{
      padding: '11px 14px',
      borderLeft: borderL ? '1px solid var(--border-soft)' : 'none',
      borderTop: borderT ? '1px solid var(--border-soft)' : 'none',
    }}>
      <div style={{ fontSize: 10.5, color: 'var(--p-ink-500)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--p-ink-900)' }}>{value}</div>
    </div>
  );
}

function BottomActionBtn({ icon, label, color, active, onClick, danger }) {
  return (
    <button onClick={onClick} style={{
      padding: '11px 8px',
      background: active ? color : '#FFFFFF',
      color: active ? '#FFFFFF' : color,
      border: `1px solid ${active ? color : (danger ? 'rgba(181,72,58,0.25)' : 'var(--border-soft)')}`,
      borderRadius: 12,
      fontSize: 13, fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      cursor: 'pointer',
      transition: 'all 160ms ease-out',
    }}>
      {icon}{label}
    </button>
  );
}

function TrashIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function DeleteConfirm({ taskName, onCancel, onConfirm }) {
  const target = typeof document !== 'undefined' ? document.querySelector('.parent-app') : null;
  if (!target) return null;
  return ReactDOM.createPortal(
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div onClick={onCancel} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(28,27,23,0.42)',
        animation: 'p-fade-in 160ms ease-out',
      }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 320,
        background: 'var(--p-ivory-50)', borderRadius: 18,
        padding: '20px 20px 16px',
        boxShadow: '0 24px 48px -16px rgba(28,27,23,0.32)',
        animation: 'p-fade-in 220ms cubic-bezier(0.34, 1.2, 0.64, 1)',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'rgba(181,72,58,0.12)', color: 'var(--p-coral-600, #B5483A)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 12,
        }}>
          <TrashIcon size={20} />
        </div>
        <div style={{ fontFamily: 'var(--p-font-display)', fontSize: 18, fontWeight: 500, color: 'var(--p-ink-900)', marginBottom: 6, lineHeight: 1.3 }}>
          刪除這項任務？
        </div>
        <div style={{ fontSize: 13, color: 'var(--p-ink-500)', lineHeight: 1.55, marginBottom: 16 }}>
          「{taskName}」會從清單中移除，過去的紀錄保留在週報中以便回顧。
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="md" full onClick={onCancel}>取消</Button>
          <button onClick={onConfirm} style={{
            flex: 1,
            background: 'var(--p-coral-600, #B5483A)', color: '#FFFFFF',
            border: 'none', borderRadius: 10,
            padding: '10px 14px', fontSize: 13.5, fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
            <TrashIcon size={14} />確認刪除
          </button>
        </div>
      </div>
    </div>,
    target
  );
}

function RecordRow({ r, divider }) {
  const statusMeta = {
    done:     { label: '已完成',     tone: 'sage',    icon: <Icon.check size={11}/> },
    pending:  { label: '今日進行中', tone: 'neutral', icon: null },
    missed:   { label: '未完成',     tone: 'warn',    icon: null },
    observed: { label: '觀察紀錄',   tone: 'clay',    icon: <FlagOutlineIcon size={11}/> },
  }[r.status];

  return (
    <div style={{
      padding: '12px 14px',
      borderBottom: divider ? '1px solid var(--border-soft)' : 'none',
      display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <div style={{
        width: 36, fontSize: 12, fontWeight: 600, color: 'var(--p-ink-500)',
        fontFamily: 'var(--p-font-display)', letterSpacing: '0.01em',
        paddingTop: 2, flexShrink: 0,
      }}>{r.date}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <Pill tone={statusMeta.tone} size="sm">{statusMeta.icon}{statusMeta.label}</Pill>
          {r.time && <span style={{ fontSize: 11, color: 'var(--p-ink-400)' }}>{r.time}</span>}
        </div>
        {r.note && (
          <div style={{ fontSize: 12.5, color: 'var(--p-ink-700)', lineHeight: 1.5, marginTop: 4, fontStyle: 'italic' }}>
            「{r.note}」
          </div>
        )}
      </div>
    </div>
  );
}

function RewardAdjust({ type, reward, value, onChange }) {
  // For tasks without a standard reward, fall back to a sensible default so
  // parents can still hand out a one-off bonus or skip.
  const hasReward = !!reward;
  const isCoins = !hasReward || reward.type === 'coins';
  const base = hasReward ? (isCoins ? reward.n : reward.m) : 5;
  const unit = isCoins ? <CoinGlyph size={11} /> : <span style={{ fontSize: 10, marginLeft: 1, fontWeight: 500 }}>分</span>;
  const isPositive = type === 'bonus';
  const isNegative = type === 'emotion' || type === 'quality';
  const showBoth = type === 'other';

  if (!isPositive && !isNegative && !showBoth) return null;

  // Tasks with no base reward can only receive a bonus — deducting nothing
  // makes no sense, so force into "add" mode for negative types.
  const effectiveNegative = isNegative && hasReward;
  const effectivePositive = isPositive || (isNegative && !hasReward);
  const effectiveBoth = showBoth;

  const reduceOpts = [
    { id: 'full', label: '全額', amount: base },
    { id: 'half', label: '一半', amount: Math.round(base/2) },
    { id: 'none', label: '不給', amount: 0 },
  ];
  const plusOpts = [
    { id: 'full',    label: '標準',     amount: base },
    { id: 'plus50',  label: '加碼 1.5×', amount: Math.round(base * 1.5) },
    { id: 'plus100', label: '加碼 2×',   amount: base * 2 },
  ];

  return (
    <div style={{
      marginBottom: 14, padding: '12px 12px 10px',
      background: 'var(--p-ivory-100)', borderRadius: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--p-ink-900)', letterSpacing: '0.02em' }}>
          這次給多少獎勵？
        </span>
        <span style={{ fontSize: 10.5, color: 'var(--p-ink-400)', fontWeight: 500 }}>選填</span>
      </div>
      {!hasReward && (
        <div style={{ fontSize: 11, color: 'var(--p-ink-500)', lineHeight: 1.5, marginBottom: 8 }}>
          這項任務原本沒有獎勵。如果你想手動加碼一次作為肯定，可以選一個選項。
        </div>
      )}

      {(effectiveNegative || effectiveBoth) && (
        <>
          {showBoth && (
            <div style={{ fontSize: 10.5, color: 'var(--p-ink-500)', marginBottom: 6, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>調整</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: showBoth ? 10 : 0 }}>
            {reduceOpts.map(o => (
              <AdjustChip key={o.id} active={value === o.id} onClick={() => onChange(o.id)}
                label={o.label} amount={o.amount} unit={unit} sign={o.amount === 0 ? '' : '+'}
              />
            ))}
          </div>
        </>
      )}
      {(effectivePositive || effectiveBoth) && (
        <>
          {effectiveBoth && (
            <div style={{ fontSize: 10.5, color: 'var(--p-ink-500)', marginTop: 4, marginBottom: 6, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>加碼</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {plusOpts.map(o => (
              <AdjustChip key={o.id} active={value === o.id} onClick={() => onChange(o.id)}
                label={o.label} amount={o.amount} unit={unit} sign="+" tone="positive"
              />
            ))}
          </div>
        </>
      )}

      {value && value !== 'full' && (
        <div style={{
          marginTop: 8, fontSize: 11, color: 'var(--p-ink-500)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <Icon.sparkle size={10} />
          {value === 'none' && '今天這項任務不給獎勵，但不影響整體紀錄。'}
          {value === 'half' && '會以一半的數量入帳。'}
          {value === 'plus50' && '會以 1.5 倍入帳。'}
          {value === 'plus100' && '會以雙倍入帳，做為特別肯定。'}
        </div>
      )}
    </div>
  );
}

function AdjustChip({ active, onClick, label, amount, unit, sign, tone }) {
  const activeBg = tone === 'positive' ? 'var(--gold-700)' : 'var(--p-ink-900)';
  return (
    <button onClick={onClick} style={{
      background: active ? activeBg : '#FFFFFF',
      color: active ? '#FFFFFF' : 'var(--p-ink-900)',
      border: active ? 'none' : '1px solid var(--border-soft)',
      borderRadius: 10, padding: '8px 6px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      cursor: 'pointer', minHeight: 56,
    }}>
      <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
      <span className="p-num" style={{
        fontSize: 13, fontWeight: 700,
        fontFamily: 'var(--p-font-display)',
        display: 'inline-flex', alignItems: 'center', gap: 2,
        color: active ? '#FFFFFF' : (tone === 'positive' ? 'var(--gold-700)' : 'var(--p-ink-900)'),
      }}>
        {amount === 0 ? '0' : `${sign}${amount}`}
        {amount > 0 && unit}
      </span>
    </button>
  );
}

Object.assign(window, { TaskDetailScreen });
