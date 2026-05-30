// Tasks management screen
function TasksScreen({ child, nav, tasks, today }) {
  const kidTasks = tasks[child.id] || [];
  const groups = ['A', 'B', 'C', 'D'].map((cat) => ({
    cat,
    items: kidTasks.filter((t) => t.cat === cat)
  })).filter((g) => g.items.length > 0);

  const todayMap = Object.fromEntries((today[child.id] || []).map((t) => [t.id, t.status]));

  return (
    <div className="p-screen" style={{ padding: '8px 16px 110px', position: 'relative' }}>
      <div style={{ padding: '14px 4px 12px' }}>
        <div className="p-eyebrow" style={{ marginBottom: 6 }}>任務</div>
        <div className="p-display">{child.name}的任務清單</div>
        <div className="p-meta" style={{ marginTop: 6 }}>
          共 <span className="p-num" style={{ color: 'var(--p-ink-900)', fontWeight: 600 }}>{kidTasks.length}</span> 項，按類別分組
        </div>
      </div>

      {/* Filter chips */}
      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 4px 14px',
        margin: '0 -16px', paddingLeft: 16, paddingRight: 16
      }}>
        <FilterChip label="全部" count={kidTasks.length} active />
        {['A', 'B', 'C', 'D'].map((c) =>
        <FilterChip key={c} label={TASK_CAT[c].label} count={kidTasks.filter((t) => t.cat === c).length} />
        )}
      </div>

      {groups.map((g) =>
      <div key={g.cat} style={{ marginBottom: 22 }}>
          <SectionHead
          eyebrow={`類別 ${g.cat}`}
          title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {TASK_CAT[g.cat].label}
                {g.cat === 'B' &&
            <Pill tone="teal" size="sm"><Icon.hourglass size={10} />獎勵：時間</Pill>
            }
                {g.cat === 'D' &&
            <Pill tone="plum" size="sm">獎勵：進度</Pill>
            }
              </span>
          } />
        
          <div style={{ display: 'grid', gap: 10 }}>
            {g.items.map((t) =>
          <TaskCard
            key={t.id} task={t} cat={g.cat} todayStatus={todayMap[t.id]}
            onClick={() => nav.go('taskDetail', { taskId: t.id })} />
          )}
          </div>
        </div>
      )}
    </div>);

}

// ──────────────────────────────────────────────────────
// Shared outline icons used across detail panels
// ──────────────────────────────────────────────────────
function FlagOutlineIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </svg>
  );
}

function EditOutlineIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4 5 13l-1 5 5-1 9-9" />
      <path d="m14 4 4 4" />
    </svg>
  );
}

function FilterChip({ label, count, active }) {
  return (
    <button style={{
      padding: '7px 12px', borderRadius: 999, whiteSpace: 'nowrap',
      fontSize: 13, fontWeight: 500,
      background: active ? 'var(--p-ink-900)' : '#FFFFFF',
      color: active ? '#FFFFFF' : 'var(--p-ink-700)',
      border: active ? 'none' : '1px solid var(--border-soft)',
      display: 'inline-flex', alignItems: 'center', gap: 6
    }}>
      {label}
      <span className="p-num" style={{
        fontSize: 11, fontWeight: 600,
        padding: '1px 6px', borderRadius: 999,
        background: active ? 'rgba(255,255,255,0.18)' : 'var(--p-ivory-100)',
        color: active ? '#FFFFFF' : 'var(--p-ink-500)'
      }}>{count}</span>
    </button>);

}

function TaskCard({ task, cat, todayStatus, onClick }) {
  const meta = TASK_CAT[cat];
  const reward = task.reward;

  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left',
      background: '#FFFFFF', borderRadius: 14,
      padding: '14px 16px',
      border: '1px solid var(--border-soft)',
      boxShadow: 'var(--p-shadow-card)',
      display: 'flex', alignItems: 'center', gap: 12,
      cursor: 'pointer',
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10,
        background: meta.tint, color: meta.fg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0
      }}>
        {React.cloneElement(meta.icon, { size: 18 })}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--p-ink-900)', marginBottom: 3 }}>
          {task.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--p-ink-500)', whiteSpace: 'nowrap' }}>{task.freq}</span>
          <span style={{ color: 'var(--p-ink-300)' }}>·</span>
          <DifficultyDots level={task.diff} />
          {todayStatus === 'done' &&
          <span style={{ marginLeft: 4, whiteSpace: 'nowrap' }}><Pill tone="sage" size="sm"><Icon.check size={10} />今日</Pill></span>
          }
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {reward &&
        <div style={{ fontSize: 14, fontWeight: 600, color: reward.type === 'coins' ? 'var(--gold-700)' : 'var(--p-teal-500)', display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
            {reward.type === 'coins' ?
          <>+{reward.n}<span style={{ marginLeft: 2 }}><CoinGlyph size={13} /></span></> :
          <>+{reward.m}<span style={{ fontSize: 10, color: 'var(--p-ink-500)', marginLeft: 2, fontWeight: 500 }}>分鐘</span></>
          }
          </div>
        }
        {!reward && cat === 'D' &&
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--p-plum-500)' }}>進度任務</span>
        }
        <Icon.chevR size={14} />
      </div>
    </button>);

}

function DifficultyDots({ level = 1 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {[1, 2, 3].map((n) =>
      <span key={n} style={{
        width: 5, height: 5, borderRadius: '50%',
        background: n <= level ? 'var(--p-teal-400)' : 'var(--p-ivory-300)'
      }} />
      )}
      <span style={{ fontSize: 11, color: 'var(--p-ink-500)', marginLeft: 2 }}>
        {level === 1 ? '簡單' : level === 2 ? '中等' : '困難'}
      </span>
    </span>);

}

// ──────────────────────────────────────────────────────
// New Task — full-screen modal form
// ──────────────────────────────────────────────────────
function NewTaskScreen({ child, kids, nav }) {
  const [name, setName] = React.useState('');
  const [cat, setCat] = React.useState('A');
  const [diff, setDiff] = React.useState(1);
  const [freq, setFreq] = React.useState('每日');
  const [rewardN, setRewardN] = React.useState(5);
  const [rewardM, setRewardM] = React.useState(15);
  const [rewardOverride, setRewardOverride] = React.useState('auto'); // 'auto' | 'coins' | 'time'
  const [appliesTo, setAppliesTo] = React.useState([child.id]);

  const isDuty = cat === 'B';
  const isMilestone = cat === 'D';

  // Effective reward type: override wins, else auto by category
  const useTime =
    rewardOverride === 'time' ? true :
    rewardOverride === 'coins' ? false :
    isDuty;

  const suggestions = ['整理玩具', '幫忙摺衣服', '練琴 30 分鐘', '幫忙準備餐桌', '自己量血壓記錄'];

  return (
    <div className="p-screen" style={{ padding: '8px 16px 24px' }}>
      <div style={{ padding: '14px 4px 18px' }}>
        <div className="p-eyebrow" style={{ marginBottom: 6 }}>新增</div>
        <div className="p-display">設一項新任務</div>
        <div className="p-meta" style={{ marginTop: 6 }}>
          完成後 {appliesTo.length === 1 ? child.name : '所選孩子'}會立刻看到
        </div>
      </div>

      {/* Name + suggestions */}
      <FormGroup label="任務名稱" hint="可從建議選一個，或自己輸入">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：自己摺好今天穿的衣服"
          style={inputStyle} />
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {suggestions.map((s) =>
          <button key={s} onClick={() => setName(s)} style={chipStyle(name === s)}>{s}</button>
          )}
        </div>
      </FormGroup>

      {/* Category */}
      <FormGroup label="類別" hint={isDuty ? '家庭本分：獎勵為「時間」，累積到時間儲蓄本' : isMilestone ? '里程碑：獎勵是進度，不發金幣' : '獎勵為金幣，可用於兌換'}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {['A', 'B', 'C', 'D'].map((c) =>
          <CatOption key={c} cat={c} active={cat === c} onClick={() => setCat(c)} />
          )}
        </div>
      </FormGroup>

      {/* Difficulty */}
      <FormGroup label="難度">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[1, 2, 3].map((n) =>
          <button key={n} onClick={() => setDiff(n)} style={{
            padding: '12px 10px', borderRadius: 12,
            background: diff === n ? 'var(--p-ink-900)' : '#FFFFFF',
            color: diff === n ? '#FFFFFF' : 'var(--p-ink-700)',
            border: diff === n ? 'none' : '1px solid var(--border-soft)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4
          }}>
              <span style={{ display: 'inline-flex', gap: 3 }}>
                {[1, 2, 3].map((d) =>
              <span key={d} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: d <= n ?
                diff === n ? '#FFFFFF' : 'var(--p-teal-400)' :
                diff === n ? 'rgba(255,255,255,0.3)' : 'var(--p-ivory-300)'
              }} />
              )}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                {n === 1 ? '簡單' : n === 2 ? '中等' : '困難'}
              </span>
            </button>
          )}
        </div>
      </FormGroup>

      {/* Reward */}
      <FormGroup label="獎勵設定" hint={isMilestone ? '里程碑任務不發獎勵，以進度條呈現' : null}>
        {!isMilestone &&
        <>
          {/* Reward type override */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--p-ink-700)', letterSpacing: '0.02em' }}>獎勵類型</span>
              <span style={{ fontSize: 11, color: 'var(--p-ink-400)' }}>
                {rewardOverride === 'auto' && <>依類別、可指定</>}
                {rewardOverride === 'coins' && <>已改指定金幣</>}
                {rewardOverride === 'time' && <>已改指定時間</>}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 6 }}>
              <RewardTypeOption
                active={rewardOverride === 'auto'}
                onClick={() => setRewardOverride('auto')}
                label="依類別自動"
                sub={isDuty ? '本分→時間' : '其他→金幣'}
              />
              <RewardTypeOption
                active={rewardOverride === 'coins'}
                onClick={() => setRewardOverride('coins')}
                icon={<CoinGlyph size={13} />}
                label="指定金幣"
              />
              <RewardTypeOption
                active={rewardOverride === 'time'}
                onClick={() => setRewardOverride('time')}
                icon={<Icon.hourglass size={13} />}
                label="指定時間"
              />
            </div>
            {rewardOverride !== 'auto' && (
              <div style={{
                marginTop: 6, fontSize: 11, color: 'var(--p-clay-500)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Icon.sparkle size={10} />
                {isDuty && rewardOverride === 'coins' && '本分任務原本不發金幣，確認要給嗎？'}
                {!isDuty && rewardOverride === 'time' && '一般只有本分任務給時間，確認設定。'}
                {((isDuty && rewardOverride === 'time') || (!isDuty && rewardOverride === 'coins')) && '已手動指定獎勵類型。'}
              </div>
            )}
          </div>

          <div style={{
            background: '#FFFFFF', borderRadius: 12,
            border: '1px solid var(--border-soft)',
            padding: '14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }} data-comment-anchor="0ce780aaa8-div-231-11">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {useTime ? <Icon.hourglass size={20} /> : <CoinGlyph size={18} />}
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {useTime ? '時間獎勵' : '金幣獎勵'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--p-ink-500)' }}>
                  {useTime ? '累積到時間儲蓄本' : '可用於兌換'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Stepper
              value={useTime ? rewardM : rewardN}
              onChange={(v) => useTime ? setRewardM(v) : setRewardN(v)}
              step={useTime ? 5 : 1}
              min={useTime ? 5 : 1}
              max={useTime ? 60 : 50}
              suffix={useTime ? '分' : '幣'} />

            </div>
          </div>
        </>
        }
        {isMilestone &&
        <div style={{
          background: 'var(--p-ivory-100)', borderRadius: 12,
          padding: '12px 14px', fontSize: 13, color: 'var(--p-ink-700)',
          display: 'flex', alignItems: 'center', gap: 8
        }}>
            <Icon.sparkle size={14} />
            <span>下一步會請你設定總天數或關卡數</span>
          </div>
        }
      </FormGroup>

      {/* Frequency */}
      <FormGroup label="執行頻率">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
          { id: '每日', label: '每日' },
          { id: '每週', label: '每週幾次' },
          { id: '單次', label: '單次' }].
          map((o) =>
          <button key={o.id} onClick={() => setFreq(o.id)} style={{
            padding: '11px 8px', borderRadius: 12,
            background: freq === o.id ? 'var(--p-ink-900)' : '#FFFFFF',
            color: freq === o.id ? '#FFFFFF' : 'var(--p-ink-700)',
            border: freq === o.id ? 'none' : '1px solid var(--border-soft)',
            fontSize: 13, fontWeight: 500
          }}>{o.label}</button>
          )}
        </div>
      </FormGroup>

      {/* Applies to */}
      <FormGroup label="適用孩子" hint="可同時套用給多位孩子">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {kids.map((k) => {
            const on = appliesTo.includes(k.id);
            return (
              <button key={k.id} onClick={() => setAppliesTo((p) => on ? p.filter((x) => x !== k.id) : [...p, k.id])} style={{
                background: '#FFFFFF', borderRadius: 12,
                border: `1px solid ${on ? 'var(--p-teal-500)' : 'var(--border-soft)'}`,
                padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 12,
                textAlign: 'left'
              }}>
                <Avatar child={k} size={32} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{k.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--p-ink-500)' }}>{k.age} 歲</div>
                </div>
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: on ? 'var(--p-teal-500)' : 'transparent',
                  border: `1.5px solid ${on ? 'var(--p-teal-500)' : 'var(--p-ivory-300)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#FFFFFF'
                }}>
                  {on && <Icon.check size={14} />}
                </div>
              </button>);

          })}
        </div>
      </FormGroup>

      {/* Submit */}
      <div style={{
        position: 'sticky', bottom: 0, marginTop: 14,
        padding: '12px 0 6px',
        background: 'linear-gradient(180deg, rgba(250,248,243,0) 0%, var(--p-ivory-50) 30%)',
        display: 'flex', gap: 10
      }}>
        <Button variant="secondary" onClick={() => nav.back()} size="lg">取消</Button>
        <Button variant="primary" onClick={() => nav.back()} size="lg" full>
          <Icon.check size={16} />建立任務
        </Button>
      </div>
    </div>);

}

function FormGroup({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-ink-900)', letterSpacing: '0.02em' }}>{label}</label>
        {hint && <span style={{ fontSize: 11.5, color: 'var(--p-ink-500)' }}>{hint}</span>}
      </div>
      {children}
    </div>);

}

const inputStyle = {
  width: '100%',
  background: '#FFFFFF',
  border: '1px solid var(--border-soft)',
  borderRadius: 12,
  padding: '13px 14px',
  fontSize: 15,
  fontFamily: 'var(--p-font-body)',
  color: 'var(--p-ink-900)',
  outline: 'none',
  boxSizing: 'border-box'
};

const chipStyle = (active) => ({
  background: active ? 'var(--p-teal-500)' : 'var(--p-ivory-100)',
  color: active ? '#FFFFFF' : 'var(--p-ink-700)',
  border: 'none',
  padding: '6px 12px',
  borderRadius: 999,
  fontSize: 12.5,
  fontWeight: 500,
  cursor: 'pointer'
});

function RewardTypeOption({ active, onClick, label, sub, icon }) {
  return (
    <button onClick={onClick} style={{
      background: active ? 'var(--p-ink-900)' : '#FFFFFF',
      color: active ? '#FFFFFF' : 'var(--p-ink-900)',
      border: active ? 'none' : '1px solid var(--border-soft)',
      borderRadius: 10,
      padding: '8px 8px',
      cursor: 'pointer',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      minHeight: 48,
      lineHeight: 1.2,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 600 }}>
        {icon}{label}
      </span>
      {sub && (
        <span style={{
          fontSize: 10, fontWeight: 500,
          color: active ? 'rgba(255,255,255,0.7)' : 'var(--p-ink-500)',
          letterSpacing: '0.02em',
        }}>{sub}</span>
      )}
    </button>
  );
}

function CatOption({ cat, active, onClick }) {
  const meta = TASK_CAT[cat];
  const labels = {
    A: '日常生活自理任務',
    B: '幫家裡做事，賺時間',
    C: '練習新技能、學科',
    D: '長期目標、里程碑'
  };
  return (
    <button onClick={onClick} style={{
      background: '#FFFFFF', borderRadius: 12, padding: '12px 12px',
      border: `1px solid ${active ? 'var(--p-teal-500)' : 'var(--border-soft)'}`,
      boxShadow: active ? '0 0 0 2px rgba(35,78,71,0.08)' : 'none',
      textAlign: 'left',
      display: 'flex', alignItems: 'center', gap: 10
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: meta.tint, color: meta.fg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
      }}>{React.cloneElement(meta.icon, { size: 16 })}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-ink-900)' }}>{meta.label}</div>
        <div style={{ fontSize: 10.5, color: 'var(--p-ink-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{labels[cat]}</div>
      </div>
    </button>);

}

function Stepper({ value, onChange, step = 1, min = 0, max = 99, suffix }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 0,
      background: 'var(--p-ivory-100)', borderRadius: 10,
      padding: 2
    }}>
      <button onClick={() => onChange(Math.max(min, value - step))} style={{
        width: 30, height: 30, borderRadius: 8,
        background: '#FFFFFF', color: 'var(--p-ink-900)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, fontWeight: 500
      }}>−</button>
      <span style={{
        minWidth: 56, textAlign: 'center', fontSize: 14, fontWeight: 600,
        fontFamily: 'var(--p-font-display)', fontVariantNumeric: 'tabular-nums'
      }}>{value}{suffix && <span style={{ fontSize: 11, color: 'var(--p-ink-500)', marginLeft: 2, fontWeight: 400 }}>{suffix}</span>}</span>
      <button onClick={() => onChange(Math.min(max, value + step))} style={{
        width: 30, height: 30, borderRadius: 8,
        background: '#FFFFFF', color: 'var(--p-ink-900)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, fontWeight: 500
      }}>+</button>
    </div>);

}

Object.assign(window, { TasksScreen, NewTaskScreen, FormGroup, inputStyle, chipStyle, CatOption, Stepper, FlagOutlineIcon, EditOutlineIcon });