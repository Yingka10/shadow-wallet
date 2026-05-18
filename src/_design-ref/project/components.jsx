// Shared parent-side UI components

// ──────────────────────────────────────────────────────
// Icons — small inline SVG, 2px stroke, round caps, ink color
// ──────────────────────────────────────────────────────
const Icon = {
  bell: (p) =>
  <svg width={p.size || 22} height={p.size || 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 8H4c0-2 2-3 2-8Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>,

  chevDown: (p) =>
  <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>,

  chevR: (p) =>
  <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>,

  chevL: (p) =>
  <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 6-6 6 6 6" />
    </svg>,

  home: (p) =>
  <svg width={p.size || 22} height={p.size || 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11 12 4l9 7" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </svg>,

  tasks: (p) =>
  <svg width={p.size || 22} height={p.size || 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M9 3v4M15 3v4" />
      <path d="m8.5 12 2 2 4-4" />
    </svg>,

  gift: (p) =>
  <svg width={p.size || 22} height={p.size || 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="5" rx="1" />
      <path d="M12 8v13" />
      <path d="M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
      <path d="M12 8s-3-5-5.5-3.5C5 5 6 8 8 8h4Z" />
      <path d="M12 8s3-5 5.5-3.5C19 5 18 8 16 8h-4Z" />
    </svg>,

  chart: (p) =>
  <svg width={p.size || 22} height={p.size || 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-8" />
      <path d="M22 20H2" />
    </svg>,

  plus: (p) =>
  <svg width={p.size || 22} height={p.size || 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" data-comment-anchor="15b98ef097-svg-59-5">
      <path d="M12 5v14M5 12h14" />
    </svg>,

  flag: (p) =>
  <svg width={p.size || 18} height={p.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21V4" />
      <path d="M4 4h12l-2 4 2 4H4" />
    </svg>,

  coin: (p) =>
  <svg width={p.size || 18} height={p.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v10M9 10h5a1.5 1.5 0 0 1 0 3H9.5a1.5 1.5 0 0 0 0 3H15" strokeLinecap="round" strokeLinejoin="round" />
    </svg>,

  hourglass: (p) =>
  <svg width={p.size || 18} height={p.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12" />
      <path d="M6 21h12" />
      <path d="M7 3v3c0 2 5 4 5 6s-5 4-5 6v3" />
      <path d="M17 3v3c0 2-5 4-5 6s5 4 5 6v3" />
    </svg>,

  sparkle: (p) =>
  <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M5.5 5.5 8 8M16 16l2.5 2.5M5.5 18.5 8 16M16 8l2.5-2.5" />
    </svg>,

  check: (p) =>
  <svg width={p.size || 18} height={p.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 5 5L20 7" />
    </svg>,

  x: (p) =>
  <svg width={p.size || 18} height={p.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>,

  arrowL: (p) =>
  <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 6-6 6 6 6" />
    </svg>,

  settings: (p) =>
  <svg width={p.size || 22} height={p.size || 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>,

  alert: (p) =>
  <svg width={p.size || 18} height={p.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.41 0Z" />
    </svg>,

  sun: (p) =>
  <svg width={p.size || 22} height={p.size || 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>,

  moon: (p) =>
  <svg width={p.size || 18} height={p.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>,

  fox: (p) =>
  <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4c2 3 3 6 3 9 0 5 3 8 6 8s6-3 6-8c0-3 1-6 3-9-3 0-5 1-6 3-1 1-2 1-3 1s-2 0-3-1c-1-2-3-3-6-3Z" />
      <circle cx="9.5" cy="13" r=".7" fill="currentColor" />
      <circle cx="14.5" cy="13" r=".7" fill="currentColor" />
      <path d="M11 17h2" />
    </svg>,

  lock: (p) =>
  <svg width={p.size || 18} height={p.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>,

  hand: (p) =>
  <svg width={p.size || 18} height={p.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11V5a1.5 1.5 0 0 1 3 0v6" />
      <path d="M12 11V4a1.5 1.5 0 0 1 3 0v7" />
      <path d="M15 11V6a1.5 1.5 0 0 1 3 0v9c0 3-2 6-6 6s-6-3-6-6v-3a1.5 1.5 0 0 1 3 0v1" />
    </svg>,

  user: (p) =>
  <svg width={p.size || 18} height={p.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
    </svg>,

  phone: (p) =>
  <svg width={p.size || 18} height={p.size || 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <path d="M10 19h4" />
    </svg>

};

// ──────────────────────────────────────────────────────
// Child avatars — geometric, calm
// ──────────────────────────────────────────────────────
function Avatar({ child, size = 32 }) {
  const initial = child.name.charAt(0);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: child.color,
      color: '#FFFFFF',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--p-font-display)',
      fontWeight: 500, fontSize: size * 0.45, lineHeight: 1,
      flexShrink: 0,
      boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.08)'
    }}>
      {initial}
    </div>);

}

// ──────────────────────────────────────────────────────
// TopAppBar — child switcher on the left, bell on the right
// ──────────────────────────────────────────────────────
function TopBar({ child, kids, onSwitch, onSettings, title, onBack, rightSlot }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 30,
      background: 'rgba(250,248,243,0.86)',
      backdropFilter: 'blur(14px) saturate(160%)',
      WebkitBackdropFilter: 'blur(14px) saturate(160%)',
      borderBottom: '1px solid var(--border-soft)',
      padding: '10px 16px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {onBack ?
        <button onClick={onBack} style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '6px 10px 6px 6px', borderRadius: 999,
          color: 'var(--p-ink-800)'
        }}>
            <Icon.arrowL />
            <span style={{ fontSize: 15, fontWeight: 500 }}>{title || '返回'}</span>
          </button> :

        <button onClick={() => setOpen((o) => !o)} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 10px 4px 4px', borderRadius: 999,
          background: open ? 'var(--p-ivory-100)' : 'transparent'
        }}>
            <Avatar child={child} size={32} />
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--p-ink-900)', fontFamily: 'var(--p-font-display)' }}>{child.name}</span>
            <span style={{ color: 'var(--p-ink-500)', display: 'inline-flex', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 220ms' }}>
              <Icon.chevDown size={14} />
            </span>
          </button>
        }

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {rightSlot}
          {!onBack &&
          <>
              <IconButton onClick={() => {/* notifications stub */}}>
                <Icon.bell />
                <span style={{
                position: 'absolute', top: 6, right: 8, width: 6, height: 6,
                borderRadius: '50%', background: 'var(--p-clay-500)'
              }} />
              </IconButton>
              <IconButton onClick={onSettings}>
                <Icon.settings />
              </IconButton>
            </>
          }
        </div>
      </div>

      {open &&
      <ChildPicker child={child} kids={kids} onPick={(k) => {onSwitch(k);setOpen(false);}} onClose={() => setOpen(false)} />
      }
    </div>);

}

function IconButton({ children, onClick, active }) {
  return (
    <button onClick={onClick} style={{
      position: 'relative',
      width: 38, height: 38, borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: active ? 'var(--p-teal-500)' : 'var(--p-ink-700)',
      background: active ? 'var(--p-teal-50)' : 'transparent',
      transition: 'background 200ms'
    }}>{children}</button>);

}

function ChildPicker({ child, kids, onPick, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 28, background: 'rgba(28,27,23,0.18)'
      }} />
      <div style={{
        position: 'absolute', top: 'calc(100% + 6px)', left: 12, right: 12, zIndex: 29,
        background: '#FFFFFF', borderRadius: 18, padding: 8,
        boxShadow: 'var(--p-shadow-elev)',
        border: '1px solid var(--border-soft)'
      }}>
        {kids.map((k) =>
        <button key={k.id} onClick={() => onPick(k)} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 12px', borderRadius: 12,
          background: k.id === child.id ? 'var(--p-ivory-100)' : 'transparent',
          textAlign: 'left'
        }}>
            <Avatar child={k} size={36} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--p-ink-900)', fontFamily: 'var(--p-font-display)' }}>{k.name}</div>
              <div style={{ fontSize: 12, color: 'var(--p-ink-500)' }}>{k.age} 歲 · 金幣 {k.coins}</div>
            </div>
            {k.id === child.id && <Icon.check size={18} />}
            {k.pending > 0 && k.id !== child.id &&
          <span style={{
            fontSize: 11, fontWeight: 600,
            background: 'var(--p-clay-500)', color: '#FFFFFF',
            padding: '2px 7px', borderRadius: 999
          }}>{k.pending}</span>
          }
          </button>
        )}
        <div style={{ height: 1, background: 'var(--border-soft)', margin: '6px 8px' }} />
        <button onClick={onClose} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 12px', borderRadius: 12, color: 'var(--p-ink-700)'
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--p-ivory-100)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--p-teal-500)'
          }}>
            <Icon.fox size={18} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--p-ink-900)' }}>切換至孩子模式</div>
            <div style={{ fontSize: 12, color: 'var(--p-ink-500)' }}>把手機交給孩子使用</div>
          </div>
          <Icon.chevR size={14} />
        </button>
      </div>
    </>);

}

// ──────────────────────────────────────────────────────
// Bottom nav
// ──────────────────────────────────────────────────────
function BottomNav({ active, onTab }) {
  const tabs = [
  { id: 'dashboard', label: '面板', icon: Icon.home },
  { id: 'tasks', label: '任務', icon: Icon.tasks },
  { id: 'rewards', label: '兌換', icon: Icon.gift },
  { id: 'weekly', label: '週報', icon: Icon.chart }];

  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 25,
      paddingBottom: 28, paddingTop: 10,
      background: 'rgba(250,248,243,0.92)',
      backdropFilter: 'blur(18px) saturate(160%)',
      WebkitBackdropFilter: 'blur(18px) saturate(160%)',
      borderTop: '1px solid var(--border-soft)'
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', alignItems: 'center' }}>
        {tabs.map((t) => {
          const isActive = active === t.id;
          const TabIcon = t.icon;
          return (
            <button key={t.id} onClick={() => onTab(t.id)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '4px 0',
              color: isActive ? 'var(--p-teal-500)' : 'var(--p-ink-400)',
              position: 'relative'
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 38, height: 28, borderRadius: 14,
                background: isActive ? 'var(--p-teal-50)' : 'transparent',
                transition: 'background 220ms'
              }}>
                <TabIcon size={20} />
              </div>
              <span style={{
                fontSize: 11, fontWeight: isActive ? 600 : 500, letterSpacing: '0.02em'
              }}>{t.label}</span>
            </button>);

        })}
      </div>
    </div>);

}

// ──────────────────────────────────────────────────────
// Building blocks
// ──────────────────────────────────────────────────────
function Card({ children, style = {}, onClick, tone }) {
  const bg = tone === 'teal' ? 'var(--p-teal-500)' :
  tone === 'ivory' ? 'var(--p-ivory-100)' :
  tone === 'paper' ? 'var(--p-stone-50)' :
  '#FFFFFF';
  const color = tone === 'teal' ? '#FFFFFF' : 'var(--p-ink-900)';
  return (
    <div onClick={onClick} style={{
      background: bg, color,
      borderRadius: 18, padding: 18,
      boxShadow: 'var(--p-shadow-card)',
      border: tone === 'teal' ? 'none' : '1px solid var(--border-soft)',
      cursor: onClick ? 'pointer' : 'default',
      ...style
    }}>{children}</div>);

}

function Button({ children, onClick, variant = 'primary', size = 'md', icon, full, disabled }) {
  const sizes = {
    sm: { padding: '8px 14px', fontSize: 13, height: 34, radius: 10 },
    md: { padding: '11px 18px', fontSize: 15, height: 44, radius: 12 },
    lg: { padding: '14px 22px', fontSize: 16, height: 52, radius: 14 }
  };
  const s = sizes[size];
  const styles = {
    primary: { background: 'var(--p-teal-500)', color: '#FFFFFF', border: 'none' },
    secondary: { background: 'var(--p-ivory-100)', color: 'var(--p-ink-900)', border: '1px solid var(--border-soft)' },
    ghost: { background: 'transparent', color: 'var(--p-teal-500)', border: '1px solid transparent' },
    danger: { background: '#FFFFFF', color: 'var(--p-error)', border: '1px solid var(--p-error)' },
    outline: { background: '#FFFFFF', color: 'var(--p-teal-500)', border: '1px solid var(--p-teal-200)' }
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...styles,
      height: s.height, padding: s.padding, fontSize: s.fontSize,
      borderRadius: s.radius, fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      width: full ? '100%' : 'auto',
      opacity: disabled ? 0.45 : 1,
      transition: 'transform 120ms, background 200ms',
      fontFamily: 'var(--p-font-body)',
      letterSpacing: '0.02em'
    }}>
      {icon}
      {children}
    </button>);

}

function Pill({ children, tone = 'neutral', size = 'md' }) {
  const tones = {
    neutral: { bg: 'var(--p-ivory-100)', fg: 'var(--p-ink-700)' },
    teal: { bg: 'var(--p-teal-50)', fg: 'var(--p-teal-500)' },
    sage: { bg: '#EEF2EA', fg: 'var(--p-sage-500)' },
    clay: { bg: '#FAF1E7', fg: 'var(--p-clay-500)' },
    gold: { bg: 'var(--gold-100)', fg: 'var(--gold-700)' },
    plum: { bg: '#F4EBF0', fg: 'var(--p-plum-500)' },
    warn: { bg: '#FBF1DC', fg: 'var(--p-warn)' }
  }[tone];
  const sizes = {
    sm: { fs: 11, pad: '2px 8px' },
    md: { fs: 12, pad: '3px 10px' }
  }[size];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: sizes.pad, borderRadius: 999,
      background: tones.bg, color: tones.fg,
      fontSize: sizes.fs, fontWeight: 600, letterSpacing: '0.02em',
      lineHeight: 1.3
    }}>{children}</span>);

}

// Tiny coin glyph for inline use
function CoinGlyph({ size = 14 }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, #F5C84C 0%, #D69A00 100%)',
      color: '#8A5800', fontSize: size * 0.6, fontWeight: 800, fontFamily: 'serif',
      flexShrink: 0,
      boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.4)'
    }}>$</span>);

}

function SandGlyph({ size = 14 }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, color: 'var(--p-teal-400)', flexShrink: 0
    }}>
      <Icon.hourglass size={size} />
    </span>);

}

// Used for displayable big totals
function TickerNum({ value, suffix }) {
  return (
    <span className="p-num" style={{
      fontFamily: 'var(--p-font-display)', fontWeight: 500,
      letterSpacing: '-0.02em'
    }}>
      {value}{suffix && <span style={{ fontSize: '0.55em', color: 'var(--p-ink-500)', marginLeft: 2, fontWeight: 400 }}>{suffix}</span>}
    </span>);

}

// Section heading
function SectionHead({ eyebrow, title, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
      <div>
        {eyebrow && <div className="p-eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div>}
        {title && <h2 className="p-h2" style={{ fontSize: 19, fontWeight: 500 }}>{title}</h2>}
      </div>
      {action}
    </div>);

}

Object.assign(window, {
  Icon, Avatar, TopBar, BottomNav, IconButton,
  Card, Button, Pill, CoinGlyph, SandGlyph, TickerNum, SectionHead
});