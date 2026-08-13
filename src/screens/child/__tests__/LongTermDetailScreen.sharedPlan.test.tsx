// P0-8M — 孩子端長期詳情在共同計畫下的三個狀態。
//
//   before  ：本週 2/3、正式時段＝睡前
//   open    ：本週仍 2/3、時段仍睡前、多一句「等一起確認」
//   accepted：重新 focus 之後時段變晚餐後，2/3 一格都沒有動
//
// 另外釘住 §3 的窄相容修補：goal 的 mirror 是 null 時，畫面仍要顯示 canonical
// task 上已經有的時段，而不是「尚未選擇時段」。

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';

const mockFocusListeners = new Set<() => void>();

const mockRouteParams = {
  goalId: 'goal-reading',
  taskId: 'task-reading',
  taskName: '自主閱讀計畫',
};

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: mockRouteParams }),
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
  /*
    可控的 focus：callback 在掛載時跑一次，之後每次 emitFocus() 再跑一次 ——
    也就是 react-navigation 在「離開這個畫面又回來」時的行為。
    真正要驗的就是這一刻：家長在自己裝置上確認完，孩子回來看到新的時段。
  */
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React_ = require('react') as typeof import('react');
    const [tick, setTick] = React_.useState(0);
    React_.useEffect(() => {
      const listener = () => setTick(current => current + 1);
      mockFocusListeners.add(listener);
      return () => { mockFocusListeners.delete(listener); };
    }, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React_.useEffect(callback, [callback, tick]);
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../lib/taskActions', () => ({
  completeTask: jest.fn(),
  recordCompletionContext: jest.fn(),
}));

// ── 這一輪要回給畫面的資料。每個測試自己改。 ─────────────────────────────
type Scenario = {
  goalPreferredWindow: string | null;
  taskPreferredTime: string | null;
  sharedPlanPreferredTime: string;
  openRequests: Array<Record<string, unknown>>;
  /** 讀不到共同計畫 —— 一般家長建立的長期任務。 */
  hasSharedPlan: boolean;
};

let scenario: Scenario;

const TODAY = '2026-08-12T11:00:00.000Z'; // 台北時間週三

function goalRow() {
  return {
    id: 'goal-reading',
    child_id: 'child-1',
    task_id: 'task-reading',
    goal_type: 'habit',
    total_days: 6,
    current_day: 2,
    status: 'active',
    checkpoint_rewards: null,
    motivation_note: null,
    started_at: '2026-08-07',
    end_date: '2026-08-20',
    next_review_at: null,
    completed_at: null,
    created_at: '2026-08-07',
    min_age: 6,
    interrupt_count: 0,
    last_active_date: null,
    active_days: null,
    level_definitions: null,
    current_level: null,
    level_count: null,
    role_title: null,
    salary_mode: null,
    base_salary: null,
    weekly_target_rate: null,
    privilege_reward: null,
    family_time_per_completion: null,
    target_completions: null,
    target_value: null,
    current_value: null,
    value_unit: null,
    preferred_time_window: scenario.goalPreferredWindow,
  };
}

function taskRow() {
  return {
    id: 'task-reading',
    family_id: 'family-1',
    name: '自主閱讀計畫',
    category: 'D',
    day_type: 'custom',
    is_long_term: true,
    long_term_type: 'habit',
    base_time_min: 15,
    difficulty: 1,
    coin_override: null,
    is_system_default: false,
    allow_repeat: true,
    min_age: 6,
    max_age: 9,
    time_saving_min: 0,
    recurrence_days: null,
    schedule_mode: 'weekly_frequency',
    weekly_frequency: 3,
    start_date: '2026-08-07',
    due_date: '2026-08-20',
    preferred_time: scenario.taskPreferredTime,
    created_at: '2026-08-07',
    is_active: true,
  };
}

/** 本週兩次完成 —— 週一與週二。第三次還沒發生，所以是 2/3。 */
const completionRows = [
  {
    id: 'completion-mon',
    completed_at: '2026-08-10T11:30:00.000Z',
    planned_time_window: null,
    start_mode: null,
    status: 'completed',
  },
  {
    id: 'completion-tue',
    completed_at: '2026-08-11T11:30:00.000Z',
    planned_time_window: null,
    start_mode: null,
    status: 'completed',
  },
];

function planVersionRow() {
  return {
    id: 'ver-1',
    proposal_id: 'prop-1',
    version_no: 2,
    authored_by: 'parent',
    preferred_time: scenario.sharedPlanPreferredTime,
    preferred_time_custom: null,
    cadence_mode: 'weekly_frequency',
    cadence_weekly_frequency: 3,
    cadence_days: null,
  };
}

// ── 最小的 Supabase 查詢替身 ────────────────────────────────────────────
// select/eq/in/gte/lt/order/limit 都只是收集條件，await 或 single() 時才
// 依 table 決定回什麼。刻意不模擬 RLS —— 這裡驗的是畫面，不是權限。
function mockMakeQuery(table: string) {
  const rows = () => {
    if (table === 'task_completions') return completionRows;
    if (table === 'child_proposal_plan_versions') {
      return scenario.hasSharedPlan ? [planVersionRow()] : [];
    }
    if (table === 'child_proposals') {
      return scenario.hasSharedPlan
        ? [{ id: 'prop-1', status: 'active', current_plan_version_id: 'ver-1', child_id: 'child-1' }]
        : [];
    }
    if (table === 'child_proposal_adjustment_requests') return scenario.openRequests;
    if (table === 'long_term_goals') return [goalRow()];
    if (table === 'tasks') return [taskRow()];
    return [];
  };

  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    gte: () => builder,
    lt: () => builder,
    order: () => builder,
    limit: () => builder,
    single: async () => ({ data: rows()[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (
      resolve: (value: { data: unknown; error: null }) => unknown,
    ) => Promise.resolve({ data: rows(), error: null }).then(resolve),
  };
  return builder;
}

jest.mock('../../../lib/supabase', () => ({
  supabase: { from: (table: string) => mockMakeQuery(table) },
}));

import LongTermDetailScreen from '../LongTermDetailScreen';

function emitFocus() {
  mockFocusListeners.forEach(listener => listener());
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(TODAY));
  mockFocusListeners.clear();
  scenario = {
    goalPreferredWindow: null,
    taskPreferredTime: 'before_bed',
    sharedPlanPreferredTime: 'before_bed',
    openRequests: [],
    hasSharedPlan: true,
  };
});

afterEach(() => { jest.useRealTimers(); });

/** Task 1 將週進度收進今天卡片；這裡只確認協商沒有改動數字。 */
function expectWeekProgressUnchanged() {
  expect(screen.getByText(/本週\s*2\s*\/\s*3/)).toBeTruthy();
  expect(screen.queryByText(/本週\s*(?:3\s*\/\s*3|2\s*\/\s*4)/)).toBeNull();
}

async function renderScreen() {
  const view = render(<LongTermDetailScreen />);
  await waitFor(() => expect(screen.queryByTestId('goal-today')).not.toBeNull());
  return view;
}

describe('P0-8M · 孩子端長期詳情', () => {
  it('goal mirror 還沒補上時，改讀 canonical task 的時段（睡前）', async () => {
    await renderScreen();

    expect(screen.getByText(/今天預計：睡前/)).toBeTruthy();
    expect(screen.queryByText(/尚未選擇時段/)).toBeNull();
  });

  it('goal mirror 有值時以 goal 為準', async () => {
    scenario.goalPreferredWindow = 'after_dinner';
    scenario.taskPreferredTime = 'before_bed';
    await renderScreen();

    expect(screen.getByText(/今天預計：晚餐後/)).toBeTruthy();
  });

  it('兩邊都沒有值就維持原本的「尚未選擇時段」', async () => {
    scenario.goalPreferredWindow = null;
    scenario.taskPreferredTime = null;
    await renderScreen();

    expect(screen.getByText(/尚未選擇時段/)).toBeTruthy();
  });

  it('task 上不是閱讀 UI 認得的時段時不硬塞，仍顯示尚未選擇', async () => {
    scenario.goalPreferredWindow = null;
    scenario.taskPreferredTime = 'after_school';
    await renderScreen();

    expect(screen.getByText(/尚未選擇時段/)).toBeTruthy();
    expect(screen.queryByText(/放學後/)).toBeNull();
  });

  it('before：本週 2／3，時段是睡前', async () => {
    await renderScreen();

    expectWeekProgressUnchanged();
    expect(screen.getByText(/今天預計：睡前/)).toBeTruthy();
    expect(screen.queryByTestId('pending-time-adjustment')).toBeNull();
  });

  it('open：送出之後 2／3 與睡前都沒變，只多一句等一起確認', async () => {
    scenario.openRequests = [{
      id: 'req-1',
      proposal_id: 'prop-1',
      status: 'open',
      adjustment_kind: 'preferred_time',
      based_on_plan_version_id: 'ver-1',
      requested_changes: { preferredTime: 'after_dinner', preferredTimeCustom: null },
    }];
    await renderScreen();

    await waitFor(() => expect(
      screen.queryByTestId('pending-time-adjustment'),
    ).not.toBeNull());

    expect(screen.getByText('已送給爸媽，等一起確認。')).toBeTruthy();
    // 家長還沒確認 —— 畫面上的時段一個字都不能先改。
    expect(screen.getByText(/今天預計：睡前/)).toBeTruthy();
    expectWeekProgressUnchanged();
  });

  it('accepted：重新 focus 後顯示晚餐後，而本週仍是 2／3', async () => {
    await renderScreen();
    expect(screen.getByText(/今天預計：睡前/)).toBeTruthy();

    // 家長在另一台裝置上確認了：新版本成為 current，task 與 goal mirror 一起更新。
    scenario.sharedPlanPreferredTime = 'after_dinner';
    scenario.taskPreferredTime = 'after_dinner';
    scenario.goalPreferredWindow = 'after_dinner';
    scenario.openRequests = [];

    await act(async () => { emitFocus(); });

    await waitFor(() => expect(
      screen.queryByText(/今天預計：晚餐後/),
    ).not.toBeNull());

    // 進度完全沒有被動到 —— 沒有重算、沒有多一次完成、沒有改每週目標。
    expectWeekProgressUnchanged();
    expect(screen.queryByText(/今天預計：睡前/)).toBeNull();
    expect(screen.queryByTestId('pending-time-adjustment')).toBeNull();
  });

  it('不是共同計畫時不顯示任何協商狀態', async () => {
    scenario.hasSharedPlan = false;
    await renderScreen();

    expect(screen.queryByTestId('pending-time-adjustment')).toBeNull();
    expectWeekProgressUnchanged();
  });
});
