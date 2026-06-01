// New Parent-Proposed Reward — form for "家長提案獎勵"

function NewProposalScreen({ child, kids, nav }) {
  const [title, setTitle] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const [coins, setCoins] = React.useState(40);
  const [forKids, setForKids] = React.useState([child.id]);
  const [expiry, setExpiry] = React.useState('本週日前');
  const [reason, setReason] = React.useState('encourage');

  const suggestions = [
    { t: '週末去公園野餐', c: 30 },
    { t: '挑一本繪本帶回家', c: 45 },
    { t: '看一場電影', c: 60 },
    { t: '自己挑晚餐菜色', c: 25 },
    { t: '額外 30 分鐘故事', c: 15 },
  ];

  const reasonOptions = [
    { id: 'encourage', label: '加碼鼓勵',    desc: '本週表現好，多給一個甜頭' },
    { id: 'guide',     label: '引導行為',    desc: '想用它換來某個習慣或目標' },
    { id: 'celebrate', label: '特別日子',    desc: '生日 / 節日 / 里程碑' },
    { id: 'other',     label: '其他',        desc: '自由發揮' },
  ];

  const expiryOptions = ['本週日前', '本月底', '兩週內', '無期限'];

  const canSave = title.trim().length > 0 && forKids.length > 0;

  return (
    <div className="p-screen" style={{ padding: '8px 16px 24px' }}>
      <div style={{ padding: '14px 4px 18px' }}>
        <div className="p-eyebrow" style={{ marginBottom: 6 }}>新增提案</div>
        <div className="p-display" style={{ lineHeight: 1.2 }}>放一個獎勵到願望池</div>
        <div className="p-meta" style={{ marginTop: 6, lineHeight: 1.5 }}>
          這不是孩子自己許的願 — 你可以用它鼓勵特定行為，或在特別的日子加碼。
        </div>
      </div>

      {/* Title */}
      <FormGroup label="獎勵名稱" hint="孩子會看到這個名稱">
        <input
          value={title} onChange={e => setTitle(e.target.value)}
          placeholder="例：週末去公園野餐"
          style={inputStyle}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {suggestions.map(s => (
            <button key={s.t} onClick={() => { setTitle(s.t); setCoins(s.c); }} style={chipStyle(title === s.t)}>
              {s.t}
            </button>
          ))}
        </div>
      </FormGroup>

      {/* Description */}
      <FormGroup label="補充說明" hint="選填，給孩子的一句話">
        <textarea
          value={desc} onChange={e => setDesc(e.target.value)}
          placeholder="例：本週很認真完成練琴，加碼鼓勵你！"
          rows={2}
          style={{ ...inputStyle, resize: 'none', minHeight: 60, lineHeight: 1.5, fontFamily: 'var(--p-font-body)' }}
        />
      </FormGroup>

      {/* Coin price */}
      <FormGroup label="兌換金幣" hint="孩子需要花多少金幣才能換到">
        <div style={{
          background: '#FFFFFF', borderRadius: 12,
          border: '1px solid var(--border-soft)',
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'var(--gold-100)', color: 'var(--gold-700)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CoinGlyph size={20} />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--p-font-display)', fontSize: 24, fontWeight: 500, color: 'var(--p-ink-900)' }} className="p-num">
                {coins} <span style={{ fontSize: 12, color: 'var(--p-ink-500)', fontWeight: 400 }}>枚金幣</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--p-ink-500)' }}>
                {coins <= 20 ? '較易達成' : coins <= 50 ? '中等門檻' : coins <= 100 ? '需要存一陣子' : '較大目標'}
              </div>
            </div>
          </div>
          <Stepper value={coins} onChange={setCoins} step={5} min={5} max={300} />
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {[20, 40, 60, 100].map(p => (
            <button key={p} onClick={() => setCoins(p)} style={{
              flex: 1, padding: '7px 8px', borderRadius: 999,
              background: coins === p ? 'var(--p-teal-500)' : 'var(--p-ivory-100)',
              color: coins === p ? '#FFFFFF' : 'var(--p-ink-700)',
              border: 'none', fontSize: 12.5, fontWeight: 600,
              fontFamily: 'var(--p-font-display)',
            }}>{p}</button>
          ))}
        </div>
      </FormGroup>

      {/* Applies to */}
      <FormGroup label="放給哪些孩子" hint="可同時放給多位孩子的願望池">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {kids.map(k => {
            const on = forKids.includes(k.id);
            return (
              <button key={k.id} onClick={() => setForKids(p => on ? p.filter(x => x !== k.id) : [...p, k.id])} style={{
                background: '#FFFFFF', borderRadius: 12,
                border: `1px solid ${on ? 'var(--p-teal-500)' : 'var(--border-soft)'}`,
                padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 12,
                textAlign: 'left',
                boxShadow: on ? '0 0 0 2px rgba(35,78,71,0.06)' : 'none',
              }}>
                <Avatar child={k} size={32} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{k.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--p-ink-500)' }}>目前 {k.coins} 枚金幣</div>
                </div>
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: on ? 'var(--p-teal-500)' : 'transparent',
                  border: `1.5px solid ${on ? 'var(--p-teal-500)' : 'var(--p-ivory-300)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#FFFFFF',
                }}>
                  {on && <Icon.check size={14} />}
                </div>
              </button>
            );
          })}
        </div>
      </FormGroup>

      {/* Reason — helps AI tag the proposal */}
      <FormGroup label="提案動機" hint="幫 AI 理解你的用意，週報時更精準">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {reasonOptions.map(o => {
            const on = reason === o.id;
            return (
              <button key={o.id} onClick={() => setReason(o.id)} style={{
                background: on ? 'var(--p-ink-900)' : '#FFFFFF',
                color: on ? '#FFFFFF' : 'var(--p-ink-900)',
                border: on ? 'none' : '1px solid var(--border-soft)',
                borderRadius: 12, padding: '10px 12px',
                textAlign: 'left',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{o.label}</div>
                <div style={{ fontSize: 11, opacity: on ? 0.78 : 1, color: on ? 'rgba(255,255,255,0.78)' : 'var(--p-ink-500)', marginTop: 1 }}>
                  {o.desc}
                </div>
              </button>
            );
          })}
        </div>
      </FormGroup>

      {/* Expiry */}
      <FormGroup label="有效期限">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {expiryOptions.map(o => (
            <button key={o} onClick={() => setExpiry(o)} style={chipStyle(expiry === o)}>{o}</button>
          ))}
        </div>
      </FormGroup>

      {/* Preview */}
      <div style={{ marginBottom: 18 }}>
        <div className="p-eyebrow" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon.sparkle size={11} /> 預覽 — 孩子看到的樣子
        </div>
        <div style={{
          background: 'linear-gradient(135deg, #FFFBF3 0%, #FFFFFF 60%)',
          borderRadius: 16, padding: '16px 16px',
          border: '1px solid #F0E4C4',
          boxShadow: 'var(--p-shadow-card)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, justifyContent: 'space-between' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Pill tone="clay" size="sm">爸媽提案</Pill>
              <div style={{
                fontFamily: 'var(--p-font-display)', fontSize: 18, fontWeight: 500,
                color: 'var(--p-ink-900)', lineHeight: 1.3, marginTop: 6,
              }}>
                {title || '提案標題會出現在這裡'}
              </div>
              {desc && (
                <div style={{
                  fontSize: 12.5, color: 'var(--p-ink-500)', fontStyle: 'italic',
                  marginTop: 6, lineHeight: 1.5,
                  paddingLeft: 8, borderLeft: '2px solid var(--p-ivory-300)',
                }}>{desc}</div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="p-num" style={{
                fontFamily: 'var(--p-font-display)', fontSize: 22, fontWeight: 500,
                color: 'var(--gold-700)', display: 'inline-flex', alignItems: 'center', gap: 3,
              }}>
                {coins}<CoinGlyph size={14} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--p-ink-500)', marginTop: 2 }}>{expiry}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Submit */}
      <div style={{
        position: 'sticky', bottom: 0,
        padding: '12px 0 6px',
        background: 'linear-gradient(180deg, rgba(250,248,243,0) 0%, var(--p-ivory-50) 30%)',
        display: 'flex', gap: 10,
      }}>
        <Button variant="secondary" onClick={() => nav.back()} size="lg">取消</Button>
        <Button variant="primary" onClick={() => nav.back()} size="lg" full disabled={!canSave}>
          <Icon.check size={16} />放入願望池
        </Button>
      </div>
    </div>
  );
}

Object.assign(window, { NewProposalScreen });
