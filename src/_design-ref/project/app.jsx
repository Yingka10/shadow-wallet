// Main app — state, navigation, tweaks, iOS frame

// Sample data
const INITIAL_KIDS = [
  {
    id: 'yu', name: '小宇', age: 7,
    color: '#B07857',
    coins: 42,
    time: { h: 3, m: 24, allTime: 24 },
    pending: 1,
    goal: { name: '寶可夢卡 (節慶限定)', target: 50, current: 42, eta: '5–7 天' },
  },
  {
    id: 'en', name: '小恩', age: 9,
    color: '#6E8462',
    coins: 128,
    time: { h: 8, m: 12, allTime: 56 },
    pending: 1,
    goal: { name: '樂高城堡 31120', target: 200, current: 128, eta: '3 週' },
  },
];

const INITIAL_TASKS = {
  yu: [
    { id: 'yu-a1', name: '早上自己刷牙穿衣', cat: 'A', freq: '每日', diff: 1 },
    { id: 'yu-a2', name: '收拾書包', cat: 'A', freq: '每日', diff: 1 },
    { id: 'yu-a3', name: '整理房間', cat: 'A', freq: '每週 3 次', diff: 2 },
    { id: 'yu-b1', name: '幫忙倒垃圾', cat: 'B', reward: { type: 'time', m: 15 }, freq: '每週 2 次', diff: 1 },
    { id: 'yu-b2', name: '飯後幫忙擦桌', cat: 'B', reward: { type: 'time', m: 10 }, freq: '每日', diff: 1 },
    { id: 'yu-c1', name: '幫弟弟讀繪本', cat: 'C', reward: { type: 'coins', n: 5 }, freq: '每週', diff: 2 },
    { id: 'yu-c2', name: '英文單字練習', cat: 'C', reward: { type: 'coins', n: 3 }, freq: '每日', diff: 2 },
    { id: 'yu-d1', name: '連續練琴 30 天', cat: 'D', freq: '里程碑', diff: 3 },
  ],
  en: [
    { id: 'en-a1', name: '自己準備上學', cat: 'A', freq: '每日', diff: 1 },
    { id: 'en-a2', name: '寫完功課再玩', cat: 'A', freq: '每日', diff: 2 },
    { id: 'en-b1', name: '幫忙洗碗', cat: 'B', reward: { type: 'time', m: 20 }, freq: '每週 3 次', diff: 2 },
    { id: 'en-b2', name: '幫忙摺衣服', cat: 'B', reward: { type: 'time', m: 15 }, freq: '每週', diff: 1 },
    { id: 'en-c1', name: '閱讀英文章節', cat: 'C', reward: { type: 'coins', n: 8 }, freq: '每日', diff: 3 },
    { id: 'en-c2', name: '幫鄰居阿嬤倒垃圾', cat: 'C', reward: { type: 'coins', n: 10 }, freq: '每週', diff: 2 },
    { id: 'en-d1', name: '學會自己騎腳踏車', cat: 'D', freq: '里程碑 · 6 關', diff: 3 },
  ],
};

const INITIAL_TODAY = {
  yu: [
    { id: 'yu-a1', name: '早上自己刷牙穿衣', cat: 'A', status: 'done', time: '07:20' },
    { id: 'yu-a2', name: '收拾書包', cat: 'A', status: 'done', time: '07:35' },
    { id: 'yu-b1', name: '幫忙倒垃圾', cat: 'B', reward: { type: 'time', m: 15 }, status: 'done', time: '17:40' },
    { id: 'yu-d1', name: '練琴 30 分鐘', cat: 'D', status: 'pending', note: '第 8 / 30 天' },
    { id: 'yu-c1', name: '幫弟弟讀繪本', cat: 'C', reward: { type: 'coins', n: 5 }, status: 'review' },
    { id: 'yu-a3', name: '整理房間', cat: 'A', status: 'missed' },
  ],
  en: [
    { id: 'en-a1', name: '自己準備上學', cat: 'A', status: 'done', time: '07:10' },
    { id: 'en-a2', name: '寫完功課再玩', cat: 'A', status: 'done', time: '16:30' },
    { id: 'en-c1', name: '閱讀英文章節', cat: 'C', reward: { type: 'coins', n: 8 }, status: 'done', time: '20:00' },
    { id: 'en-b1', name: '幫忙洗碗', cat: 'B', reward: { type: 'time', m: 20 }, status: 'pending' },
    { id: 'en-d1', name: '練騎腳踏車', cat: 'D', status: 'pending', note: '關卡 3 / 6' },
  ],
};

const INITIAL_REDEMPTIONS = [
  {
    id: 'r1', kidId: 'yu', name: '寶可夢卡（一張）', coins: 50,
    time: '昨晚 21:14', status: 'pending',
    detail: '「我存好久了，可以換嗎？」',
    ai: {
      verdict: 'ok',
      reason: '近月平均兌換幣值 45 幣，本筆 50 幣合理，且小宇本週本分任務 100% 完成。',
    },
  },
  {
    id: 'r2', kidId: 'en', name: '週六全家看電影', coins: 80, suggested: 50,
    time: '今天 08:02', status: 'pending',
    detail: '「想用我的金幣請大家！」',
    ai: {
      verdict: 'adj',
      reason: '建議調整為 50 幣：考慮孩子應負擔的份額，剩餘可由父母支應，更符合「請大家」的本意。',
    },
  },
  {
    id: 'r3', kidId: 'yu', name: '去書店挑一本繪本', coins: 35,
    time: '今天 07:48', status: 'pending',
    detail: '「上次去書店看到的恐龍書還沒換。」',
    ai: {
      verdict: 'ok',
      reason: '近月相似類別（書籍）平均 32 幣，本筆 35 幣合理；屬正向消費類型。',
    },
  },
];

const INITIAL_HISTORY = [
  { id: 'h1', kidId: 'yu', name: '小汽車模型', coins: 35, date: '5/9', status: 'approved' },
  { id: 'h2', kidId: 'en', name: '額外 30 分鐘 YouTube', coins: 20, date: '5/8', status: 'approved' },
  { id: 'h3', kidId: 'yu', name: '糖果（10 顆）', coins: 25, date: '5/3', status: 'denied' },
  { id: 'h4', kidId: 'en', name: '新水彩筆', coins: 60, date: '4/28', status: 'approved' },
];

// ──────────────────────────────────────────────────────
// App
// ──────────────────────────────────────────────────────
function App() {
  const [kids, setKids] = React.useState(INITIAL_KIDS);
  const [activeKidId, setActiveKidId] = React.useState('yu');
  const [tasks] = React.useState(INITIAL_TASKS);
  const [today] = React.useState(INITIAL_TODAY);
  const [redemptions, setRedemptions] = React.useState(INITIAL_REDEMPTIONS);
  const [history, setHistory] = React.useState(INITIAL_HISTORY);
  const [toggles, setToggles] = React.useState({ notif1: true, notif2: true, lock: '密碼' });

  // Routing
  const [route, setRoute] = React.useState({ name: 'dashboard', params: {} });
  const [stack, setStack] = React.useState([]); // history for back

  const nav = React.useMemo(() => ({
    go(name, params = {}) {
      setStack(s => [...s, route]);
      setRoute({ name, params });
    },
    back() {
      setStack(s => {
        if (s.length === 0) return s;
        const prev = s[s.length - 1];
        setRoute(prev);
        return s.slice(0, -1);
      });
    },
    tab(id) {
      setStack([]);
      setRoute({ name: id, params: {} });
    },
    replace(name, params = {}) {
      setStack([]);
      setRoute({ name, params });
    },
  }), [route]);

  const child = kids.find(k => k.id === activeKidId);

  // Tweak: page navigator
  const [tweaks, setTweak] = useTweaks(/*EDITMODE-BEGIN*/{
    "showPageNav": true
  }/*EDITMODE-END*/);

  // Handle redemption approval
  const onAct = (id, kind) => {
    const r = redemptions.find(x => x.id === id);
    if (!r) return;
    setRedemptions(rs => rs.filter(x => x.id !== id));
    if (kind === 'ok' || kind === 'ok-adj') {
      const finalCoins = kind === 'ok-adj' ? (r.suggested || r.coins) : r.coins;
      setHistory(h => [{ ...r, coins: finalCoins, status: 'approved', date: '今天' }, ...h]);
      setKids(ks => ks.map(k => k.id === r.kidId ? { ...k, coins: k.coins - finalCoins, pending: Math.max(0, k.pending - 1) } : k));
    } else {
      setHistory(h => [{ ...r, status: 'denied', date: '今天' }, ...h]);
      setKids(ks => ks.map(k => k.id === r.kidId ? { ...k, pending: Math.max(0, k.pending - 1) } : k));
    }
  };

  // ChildMode switching
  const [childMode, setChildMode] = React.useState(false);

  // Expose a global hook for PPTX export — lets gen_pptx navigate between screens
  React.useEffect(() => {
    window.__exportNav = (pageId) => {
      if (pageId === 'childMode') { setChildMode(true); return; }
      setChildMode(false);
      setStack([]);
      setRoute({ name: pageId, params: {} });
    };
  }, []);

  // Determine if we render top bar / bottom nav (modal-ish screens hide them)
  const isModal = ['newTask', 'taskDetail', 'newProposal'].includes(route.name);
  const isOnboarding = route.name === 'onboarding';
  const isSettings = route.name === 'settings';
  const showBottomNav = !isModal && !isOnboarding && !isSettings && !childMode;
  const isMainTab = ['dashboard', 'tasks', 'rewards', 'weekly'].includes(route.name);

  // Title for non-tab pages
  const getTitle = () => {
    return { newTask: '新增任務', taskDetail: '任務詳情', newProposal: '新增提案獎勵', settings: '設定', onboarding: '設定家庭' }[route.name];
  };

  let screen;
  if (childMode) {
    screen = <ChildModeScreen child={child} onExit={() => setChildMode(false)} />;
  } else if (route.name === 'dashboard') {
    screen = <DashboardScreen child={child} nav={nav} today={today} />;
  } else if (route.name === 'tasks') {
    screen = <TasksScreen child={child} nav={nav} tasks={tasks} today={today} />;
  } else if (route.name === 'newTask') {
    screen = <NewTaskScreen child={child} kids={kids} nav={nav} />;
  } else if (route.name === 'taskDetail') {
    screen = <TaskDetailScreen child={child} kids={kids} tasks={tasks} today={today} nav={nav} params={route.params} />;
  } else if (route.name === 'newProposal') {
    screen = <NewProposalScreen child={child} kids={kids} nav={nav} />;
  } else if (route.name === 'rewards') {
    screen = <RewardsScreen child={child} kids={kids} redemptions={redemptions} history={history} onAct={onAct} nav={nav} />;
  } else if (route.name === 'weekly') {
    screen = <WeeklyScreen child={child} kids={kids} />;
  } else if (route.name === 'onboarding') {
    screen = <OnboardingScreen nav={nav} />;
  } else if (route.name === 'settings') {
    screen = <SettingsScreen
      nav={nav}
      onSwitchToChild={() => setChildMode(true)}
      toggles={toggles}
      setToggles={setToggles}
    />;
  }

  return (
    <>
      <IOSDevice width={402} height={874}>
        <div className="parent-app parent-paper" style={{
          width: '100%', height: '100%', position: 'relative',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Top bar — only on main tabs */}
          {!childMode && !isOnboarding && !isModal && isMainTab && (
            <TopBar
              child={child}
              kids={kids}
              onSwitch={(k) => setActiveKidId(k.id)}
              onSettings={() => nav.go('settings')}
            />
          )}
          {!childMode && (isModal || isSettings) && (
            <ModalHeader title={getTitle()} onBack={() => nav.back()} />
          )}

          {/* Screen content */}
          <div key={route.name + (childMode ? '_child' : '')} style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            {screen}
          </div>

          {/* Bottom nav */}
          {showBottomNav && (
            <BottomNav active={route.name} onTab={(id) => nav.tab(id)} />
          )}

          {/* Floating FAB — visible on tasks screen, stays in place during scroll */}
          {route.name === 'tasks' && !childMode && (
            <button onClick={() => nav.go('newTask')} aria-label="新增任務" style={{
              position: 'absolute', right: 18, bottom: 92, zIndex: 26,
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--p-teal-500)', color: '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'var(--p-shadow-pop)',
              border: '1px solid var(--p-teal-600)',
              cursor: 'pointer',
            }}>
              <Icon.plus size={26}/>
            </button>
          )}
        </div>
      </IOSDevice>

      {/* Tweaks Panel */}
      <TweaksPanel>
        <TweakSection title="頁面導覽">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {PAGES.map(p => (
              <button key={p.id} onClick={() => {
                if (p.id === 'taskDetail') {
                  const first = (tasks[activeKidId] || [])[0];
                  nav.replace('taskDetail', { taskId: first?.id });
                } else if (p.kind === 'tab') {
                  nav.tab(p.id);
                } else {
                  nav.replace(p.id);
                }
              }} style={{
                padding: '9px 10px', borderRadius: 8,
                background: route.name === p.id ? '#234E47' : '#FFFFFF',
                color: route.name === p.id ? '#FFFFFF' : '#1C1B17',
                border: '1px solid rgba(28,27,23,0.1)',
                fontSize: 12, fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
              }}>
                <span>{p.label}</span>
                <span style={{ fontSize: 10, opacity: 0.6 }}>{p.num}</span>
              </button>
            ))}
          </div>
        </TweakSection>
        <TweakSection title="切換孩子">
          <div style={{ display: 'flex', gap: 6 }}>
            {kids.map(k => (
              <button key={k.id} onClick={() => setActiveKidId(k.id)} style={{
                flex: 1, padding: '8px 10px', borderRadius: 8,
                background: activeKidId === k.id ? k.color : '#FFFFFF',
                color: activeKidId === k.id ? '#FFFFFF' : '#1C1B17',
                border: '1px solid rgba(28,27,23,0.1)',
                fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <span style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: activeKidId === k.id ? 'rgba(255,255,255,0.25)' : k.color,
                  color: '#FFFFFF',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700,
                }}>{k.name.charAt(0)}</span>
                {k.name}
              </button>
            ))}
          </div>
        </TweakSection>
        <TweakSection title="孩子模式預覽">
          <TweakToggle label="切換至孩子端介面" value={childMode} onChange={setChildMode}/>
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

function ModalHeader({ title, onBack }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 30,
      background: 'rgba(250,248,243,0.86)',
      backdropFilter: 'blur(14px) saturate(160%)',
      WebkitBackdropFilter: 'blur(14px) saturate(160%)',
      borderBottom: '1px solid var(--border-soft)',
      padding: '10px 12px',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <button onClick={onBack} style={{
        width: 38, height: 38, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--p-ink-700)',
      }}>
        <Icon.arrowL size={20}/>
      </button>
      <span style={{
        fontFamily: 'var(--p-font-display)', fontWeight: 500,
        fontSize: 16, color: 'var(--p-ink-900)',
      }}>{title}</span>
    </div>
  );
}

const PAGES = [
  { id: 'dashboard', label: '控制面板', num: '01', kind: 'tab' },
  { id: 'tasks', label: '任務管理', num: '02', kind: 'tab' },
  { id: 'newTask', label: '新增任務', num: '03', kind: 'modal' },
  { id: 'taskDetail', label: '任務詳情', num: '04', kind: 'modal' },
  { id: 'rewards', label: '兌換審核', num: '05', kind: 'tab' },
  { id: 'newProposal', label: '新增提案', num: '06', kind: 'modal' },
  { id: 'weekly', label: '週報洞察', num: '07', kind: 'tab' },
  { id: 'onboarding', label: 'Onboarding', num: '08', kind: 'modal' },
  { id: 'settings', label: 'Parent Mode', num: '09', kind: 'modal' },
];

// Mount
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
