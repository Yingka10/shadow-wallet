// Shadow Wallet · Parent Tablet — shared UI primitives
// Icons, chips, buttons, avatars. Kept small and inline-styled.

const { useState, useRef, useEffect } = React;

/* ─────────────────────────────────────────────────────────
   Icons — 20×20 baseline, 1.6px stroke, round caps.
   Sober and editorial, not playful.
   ───────────────────────────────────────────────────────── */
const Icon = ({ name, size = 20, color = "currentColor", stroke = 1.6 }) => {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none",
              stroke: color, strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case 'home':    return <svg {...p}><path d="M4 11.5L12 5l8 6.5"/><path d="M6 10v9h12v-9"/></svg>;
    case 'swap':    return <svg {...p}><path d="M5 8h13l-3-3"/><path d="M19 16H6l3 3"/></svg>;
    case 'chart':   return <svg {...p}><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15v-3M12 15V9M16 15v-6"/></svg>;
    case 'check':   return <svg {...p}><path d="M5 12.5L10 17l9-10"/></svg>;
    case 'clock':   return <svg {...p}><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5L15 14"/></svg>;
    case 'coin':    return <svg {...p}><circle cx="12" cy="12" r="8"/><path d="M9.5 14.5h4a1.5 1.5 0 0 0 0-3h-3a1.5 1.5 0 0 1 0-3h4"/><path d="M12 7v10"/></svg>;
    case 'alert':   return <svg {...p}><path d="M12 4l9 16H3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".4" fill={color} stroke="none"/></svg>;
    case 'sparkle': return <svg {...p}><path d="M12 4v6M12 14v6M4 12h6M14 12h6"/></svg>;
    case 'plus':    return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
    case 'chevdown':return <svg {...p}><path d="M6 9l6 6 6-6"/></svg>;
    case 'chevright':return <svg {...p}><path d="M9 6l6 6-6 6"/></svg>;
    case 'chevleft': return <svg {...p}><path d="M15 6l-6 6 6 6"/></svg>;
    case 'repeat':   return <svg {...p}><path d="M4 9V8a3 3 0 0 1 3-3h11l-3-3"/><path d="M15 3l3 3-3 3"/><path d="M20 15v1a3 3 0 0 1-3 3H6l3 3"/><path d="M9 21l-3-3 3-3"/></svg>;
    case 'dot':     return <svg {...p}><circle cx="12" cy="12" r="3" fill={color} stroke="none"/></svg>;
    case 'flame':   return <svg {...p}><path d="M12 3c1 3 4 4 4 8a4 4 0 1 1-8 0c0-2 1-2.5 1-4"/></svg>;
    case 'target':  return <svg {...p}><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6" fill={color} stroke="none"/></svg>;
    case 'x':       return <svg {...p}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case 'more':    return <svg {...p}><circle cx="6" cy="12" r="1" fill={color} stroke="none"/><circle cx="12" cy="12" r="1" fill={color} stroke="none"/><circle cx="18" cy="12" r="1" fill={color} stroke="none"/></svg>;
    case 'bell':    return <svg {...p}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>;
    case 'edit':    return <svg {...p}><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M14 6l4 4"/></svg>;
    case 'send':    return <svg {...p}><path d="M4 12l16-7-5 16-3-7z"/></svg>;
    case 'settings':return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.5 7.5 0 0 0 .1-3l1.7-1.3-1.7-3-2 .8a7.5 7.5 0 0 0-2.6-1.5L14.5 3h-3l-.4 2.1A7.5 7.5 0 0 0 8.6 6.7l-2-.8-1.7 3 1.7 1.3a7.5 7.5 0 0 0 .1 3L5 14.8l1.7 3 2-.8a7.5 7.5 0 0 0 2.6 1.5l.4 2.1h3l.4-2.1a7.5 7.5 0 0 0 2.6-1.5l2 .8 1.7-3z"/></svg>;
    case 'user':    return <svg {...p}><circle cx="12" cy="9" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>;
    case 'history': return <svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4"/><path d="M12 8v5l3 2"/></svg>;
    case 'library': return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16"/><path d="M14 9h3M14 13h3M14 17h3"/></svg>;
    case 'gift':    return <svg {...p}><rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18"/><path d="M12 9v11"/><path d="M8 9c-2 0-3-1.2-3-2.5S6 4 8 5s4 4 4 4-2 0-4 0z"/><path d="M16 9c2 0 3-1.2 3-2.5S18 4 16 5s-4 4-4 4 2 0 4 0z"/></svg>;
    default: return null;
  }
};

/* ─────────────────────────────────────────────────────────
   Coin glyph — gold disc with subtle bevel.
   ───────────────────────────────────────────────────────── */
const Coin = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="#F0B557"/>
    <circle cx="12" cy="12" r="10" fill="url(#cg)" opacity="0.7"/>
    <circle cx="12" cy="12" r="8.4" fill="none" stroke="#B97A28" strokeWidth="1" opacity="0.55"/>
    <text x="12" y="16" textAnchor="middle" fontFamily="DM Sans, sans-serif"
          fontWeight="700" fontSize="11" fill="#7A4910">$</text>
    <defs>
      <radialGradient id="cg" cx="35%" cy="30%" r="65%">
        <stop offset="0%" stopColor="#FFE6B8"/>
        <stop offset="100%" stopColor="#F0B557" stopOpacity="0"/>
      </radialGradient>
    </defs>
  </svg>
);

/* ─────────────────────────────────────────────────────────
   Category chip — A/B/C/D pill
   ───────────────────────────────────────────────────────── */
const CategoryChip = ({ cat, full = false }) => {
  const c = window.SW_DATA.CATEGORIES[cat];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 9px 3px 7px',
      borderRadius: 'var(--t-r-pill)',
      background: c.bg,
      color: c.fg,
      fontFamily: 'var(--t-sans)',
      fontWeight: 600,
      fontSize: 11.5,
      letterSpacing: '0.02em',
      lineHeight: 1,
      whiteSpace: 'nowrap',
    }}>
      <span style={{
        fontFamily: 'var(--t-data)', fontWeight: 700,
        background: c.fg, color: '#fff',
        width: 14, height: 14, borderRadius: '50%',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9.5,
      }}>{c.code}</span>
      {full ? c.long : c.short}
    </span>
  );
};

/* ─────────────────────────────────────────────────────────
   Button — primary, secondary, ghost, danger-ghost
   ───────────────────────────────────────────────────────── */
const btnBase = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  gap: 6,
  fontFamily: 'var(--t-sans)', fontWeight: 600,
  fontSize: 13.5, lineHeight: 1,
  padding: '10px 16px',
  borderRadius: 'var(--t-r-pill)',
  cursor: 'pointer',
  border: '1px solid transparent',
  transition: 'background-color .15s var(--t-ease), color .15s var(--t-ease), border-color .15s var(--t-ease), box-shadow .15s var(--t-ease)',
  userSelect: 'none',
};
const btnStyles = {
  primary:  { ...btnBase, background: 'var(--t-navy)',       color: '#fff' },
  brass:    { ...btnBase, background: 'var(--t-brass)',      color: '#fff' },
  secondary:{ ...btnBase, background: 'var(--t-paper-warm)', color: 'var(--t-ink)', border: '1px solid var(--t-hairline)' },
  ghost:    { ...btnBase, background: 'transparent',         color: 'var(--t-ink-soft)' },
  ghostDanger:{ ...btnBase, background: 'transparent',       color: 'var(--t-coral)' },
  outline:  { ...btnBase, background: '#fff',                color: 'var(--t-ink)', border: '1px solid var(--t-hairline-2)' },
};
const Button = ({ kind = 'primary', icon, iconRight, children, onClick, style, small }) => (
  <button
    onClick={onClick}
    style={{
      ...btnStyles[kind],
      padding: small ? '7px 12px' : btnStyles[kind].padding,
      fontSize: small ? 12.5 : 13.5,
      ...style,
    }}
    onMouseDown={e => e.currentTarget.style.transform = 'translateY(1px)'}
    onMouseUp={e => e.currentTarget.style.transform = ''}
    onMouseLeave={e => e.currentTarget.style.transform = ''}
  >
    {icon && <Icon name={icon} size={small ? 14 : 16} />}
    {children}
    {iconRight && <Icon name={iconRight} size={small ? 14 : 16} />}
  </button>
);

/* ─────────────────────────────────────────────────────────
   Avatar — round with initial.
   ───────────────────────────────────────────────────────── */
const Avatar = ({ child, size = 44, ring = false }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%',
    background: child.avatarBg, color: '#fff',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--t-serif)', fontWeight: 600,
    fontSize: size * 0.42,
    flexShrink: 0,
    boxShadow: ring
      ? `0 0 0 3px var(--t-paper), 0 0 0 4.5px ${child.avatarBg}`
      : 'inset 0 0 0 1px rgba(255,255,255,0.18)',
  }}>{child.initial}</div>
);

/* ─────────────────────────────────────────────────────────
   Sober progress bar (thin, navy fill)
   ───────────────────────────────────────────────────────── */
const Progress = ({ value, total, color = 'var(--t-navy)', height = 4 }) => {
  const pct = Math.max(0, Math.min(1, value / total));
  return (
    <div style={{
      width: '100%', height, background: 'var(--t-hairline)',
      borderRadius: 'var(--t-r-pill)', overflow: 'hidden',
    }}>
      <div style={{
        width: `${pct * 100}%`, height: '100%',
        background: color, borderRadius: 'var(--t-r-pill)',
        transition: 'width .4s var(--t-ease)',
      }}/>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   Status tag — done / pending / warning
   ───────────────────────────────────────────────────────── */
const StatusTag = ({ tone, children, icon }) => {
  const map = {
    done:    { bg: 'var(--t-green-50)',  fg: 'var(--t-green)',   border: '#C9DDD0' },
    pending: { bg: 'var(--t-paper-deep)', fg: 'var(--t-ink-muted)', border: 'var(--t-hairline-2)' },
    warn:    { bg: 'var(--t-coral-50)',  fg: 'var(--t-coral)',   border: '#F0CFC7' },
    info:    { bg: 'var(--t-navy-50)',   fg: 'var(--t-navy)',    border: 'var(--t-navy-200)' },
    brass:   { bg: 'var(--t-brass-50)',  fg: 'var(--t-brass-700)', border: '#EFCDA6' },
  }[tone] || {};
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px',
      background: map.bg, color: map.fg,
      border: `1px solid ${map.border}`,
      borderRadius: 'var(--t-r-pill)',
      fontFamily: 'var(--t-sans)',
      fontWeight: 600,
      fontSize: 11.5,
      lineHeight: 1.4,
      whiteSpace: 'nowrap',
    }}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
};

/* ─────────────────────────────────────────────────────────
   Section header (eyebrow + title + meta on right)
   ───────────────────────────────────────────────────────── */
const SectionHead = ({ eyebrow, title, meta, action }) => (
  <div style={{
    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
    marginBottom: 14,
  }}>
    <div>
      {eyebrow && <div className="t-eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div>}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 className="t-h2" style={{ margin: 0 }}>{title}</h2>
        {meta && <span className="t-meta">{meta}</span>}
      </div>
    </div>
    {action}
  </div>
);

Object.assign(window, { Icon, Coin, CategoryChip, Button, Avatar, Progress, StatusTag, SectionHead });
