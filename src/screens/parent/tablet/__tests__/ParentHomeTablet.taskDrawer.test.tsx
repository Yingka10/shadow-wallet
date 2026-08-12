// 第九階段 B3 — 首頁的一般任務改走建立任務抽屜
//
// 這一支要證明的四件事：
//
//   · 整頁只有一個抽屜，兩個入口共用
//   · 指派給另一個孩子**不會**切換全域選中的孩子
//   · 快選只帶名稱，舊任務的幣值、類別與日期一項都不帶
//   · 一般任務不再有第二套建立路徑（沒有 raw INSERT、沒有 ai-proxy）
//
// 抽屜本身用 stub —— 它有自己的 897 則測試。這裡測的是首頁怎麼接它。

import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, fireEvent, waitFor, screen, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// mocks
// ---------------------------------------------------------------------------

const mockRecentTasks = [{ name: '倒垃圾' }, { name: '洗碗' }];

function mockChain(result: unknown) {
  const obj: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'not', 'order', 'limit', 'in', 'gte', 'lt']) {
    obj[method] = () => obj;
  }
  obj.single = () => Promise.resolve(result);
  obj.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return obj;
}

jest.mock('../../../../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) =>
      table === 'parents'
        ? mockChain({ data: { family_id: 'family-1', name: '家長' } })
        : mockChain({ data: mockRecentTasks }),
    functions: { invoke: jest.fn() },
  },
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockSetSelectedChild = jest.fn();
const mockProposalRefresh = jest.fn();
const mockConfirmProposal = jest.fn();
const mockUseParentProposals = jest.fn((_childId: string, _familyId: string | null) => ({
  proposals: [{
    proposal: {
    id: 'proposal-1', family_id: 'family-1', child_id: 'child-1', status: 'proposed',
    child_original_goal: '我想兩週把這本書讀完',
    child_original_motivation: '因為同學說這本書很好看', proposal_source: 'child',
    cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 4, cadence_days: null,
    preferred_time: null, preferred_time_custom: null, estimated_minutes: null,
    child_reward_preference: 'hopes_for_coin', child_note: null, current_plan_version_id: null,
    task_id: null, closed_reason: null, closed_at: null, proposed_at: null, activated_at: null,
    created_at: '2026-08-11T00:00:00Z', updated_at: '2026-08-11T00:00:00Z',
    },
    currentPlanVersion: null,
  }],
  loading: false,
  error: null,
  refresh: mockProposalRefresh,
  confirmProposal: mockConfirmProposal,
  confirmingProposalId: null,
  confirmError: null,
  successMessage: null,
}));
jest.mock('../../../../context/SelectedChildContext', () => ({
  useSelectedChild: () => ({
    childId: 'child-1',
    childName: '承恩',
    allChildren: [
      { id: 'child-1', nickname: '承恩' },
      { id: 'child-2', nickname: '子晴' },
    ],
    setSelectedChild: mockSetSelectedChild,
  }),
}));

jest.mock('../../../../hooks/useParentProposals', () => ({
  useParentProposals: (childId: string, familyId: string | null) =>
    mockUseParentProposals(childId, familyId),
}));

const mockChild1 = {
  id: 'child-1',
  family_id: 'family-1',
  nickname: '承恩',
  birth_date: '2018-03-05',
  age_group: '6-9',
  account_type: 'SINGLE',
  pin_code: null,
  created_at: '2026-01-01T00:00:00Z',
};
const mockChild2 = { ...mockChild1, id: 'child-2', nickname: '子晴', birth_date: '2016-09-20' };

jest.mock('../../../../hooks/useParentDashboard', () => ({
  useParentDashboard: () => ({
    child: mockChild1,
    spendingBalance: 0,
    weekCoinDelta: 0,
    weekTimeSavedMin: 0,
    timeSavedUnredeemedMin: 0,
    timeSavedAllMin: 0,
    goal: null,
    todayTasks: [],
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

jest.mock('../../../../hooks/useLongTermTasks', () => ({
  useLongTermTasks: () => ({ items: [], totalActive: 0, loading: false, refresh: jest.fn() }),
}));

jest.mock('../../../../hooks/useParentRedemption', () => ({
  useParentRedemption: () => ({
    childWishes: [],
    parentProposals: [],
    approveChildWish: jest.fn(),
    fetchAll: jest.fn(),
    loading: false,
  }),
}));

/** 指派給「另一個孩子」時才會用到的那一支。 */
const mockUseChildDetails = jest.fn();
jest.mock('../../../../hooks/useChildDetails', () => ({
  useChildDetails: (childId: string | null) => mockUseChildDetails(childId),
}));

/**
 * 抽屜 stub。
 *
 * 把接進來的 props 攤成畫面上找得到的字 —— 這樣「掛了幾個」「給了哪個孩子」
 * 「帶了什麼預填」都可以直接斷言，而不必渲染整棵抽屜。
 */
jest.mock('../taskDrawer/TaskCreationDrawer', () => {
  const RN = require('react-native');
  const ReactLocal = require('react');
  return {
    TaskCreationDrawer: (props: Record<string, unknown>) =>
      ReactLocal.createElement(
        RN.View,
        { testID: 'drawer' },
        ReactLocal.createElement(
          RN.Text,
          { testID: 'drawer-visible' },
          String(props.visible),
        ),
        ReactLocal.createElement(
          RN.Text,
          { testID: 'drawer-child' },
          JSON.stringify(props.child),
        ),
        ReactLocal.createElement(
          RN.Text,
          { testID: 'drawer-seed' },
          JSON.stringify(props.initialCustomIntake ?? null),
        ),
      ),
  };
});

import ParentHomeTablet from '../ParentHomeTablet';

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, '..', 'ParentHomeTablet.tsx'),
  'utf8',
);

/** 去掉註解 —— 這個檔案的註解正好在說明「不再呼叫 classifyTask」。 */
function withoutComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

beforeEach(() => {
  mockSetSelectedChild.mockClear();
  mockProposalRefresh.mockClear();
  mockUseParentProposals.mockClear();
  mockUseChildDetails.mockReset();
  mockUseChildDetails.mockReturnValue({
    child: null,
    loading: false,
    error: null,
    refresh: jest.fn(),
  });
});

describe('P0-4 家長首頁孩子提案', () => {
  it('以目前孩子與家庭讀取，並在一般摘要前顯示真實提案', async () => {
    await openHome();

    expect(mockUseParentProposals).toHaveBeenLastCalledWith('child-1', 'family-1');
    expect(screen.getByText('承恩有一個新的挑戰想法')).toBeTruthy();
    expect(screen.getByText('我想兩週把這本書讀完')).toBeTruthy();
    expect(screen.getByText('一週 4 次')).toBeTruthy();

    expect(SOURCE.indexOf('<ParentProposalSection')).toBeLessThan(SOURCE.indexOf('<WeekSummary'));
    expect(SOURCE).toContain('proposalRefresh();');
  });

  it('首頁接線只有唯讀 refresh，不接 proposal transition、task 或 wallet mutation', () => {
    const proposalComponent = fs.readFileSync(
      path.resolve(__dirname, '..', 'home', 'ParentProposalSection.tsx'),
      'utf8',
    );
    expect(proposalComponent).not.toMatch(/\.transition\(|\.insert\(|\.update\(|\.rpc\(/);
    expect(proposalComponent).not.toMatch(/wallet|createTask|AI 建議/);
  });
});

async function openHome() {
  const r = render(<ParentHomeTablet />);
  await waitFor(() => expect(screen.getByTestId('drawer')).toBeTruthy());
  // 讓 familyId 與「最近指派過的」那兩支非同步載入跑完再繼續。
  await act(async () => { await Promise.resolve(); });
  return r;
}

function drawerVisible(): boolean {
  return screen.getByTestId('drawer-visible').props.children === 'true';
}
function drawerChild(): { id: string; birthDate: string } | null {
  return JSON.parse(screen.getByTestId('drawer-child').props.children);
}
function drawerSeed(): { title: string } | null {
  return JSON.parse(screen.getByTestId('drawer-seed').props.children);
}

// ---------------------------------------------------------------------------
// 1-3. 整頁只有一個抽屜
// ---------------------------------------------------------------------------

describe('1-3. 一個抽屜，兩個入口', () => {
  it('首頁只掛一個抽屜實例', async () => {
    await openHome();
    expect(screen.getAllByTestId('drawer')).toHaveLength(1);
  });

  it('一開始是關著的', async () => {
    await openHome();
    expect(drawerVisible()).toBe(false);
  });

  it('「建立新任務」→「一般任務」會開同一個抽屜，帶目前的孩子', async () => {
    await openHome();
    fireEvent.press(screen.getByText('＋ 建立新任務'));
    fireEvent.press(screen.getByText('一般任務'));

    expect(screen.getAllByTestId('drawer')).toHaveLength(1);
    expect(drawerVisible()).toBe(true);
    expect(drawerChild()).toMatchObject({ id: 'child-1', birthDate: '2018-03-05' });
    // 一般任務不是從快選來的 —— 沒有預填。
    expect(drawerSeed()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4-6. 指派任務
// ---------------------------------------------------------------------------

describe('4-6. 指派任務', () => {
  it('「建立新任務」按鈕開抽屜，目標是目前的孩子', async () => {
    await openHome();
    fireEvent.press(screen.getByText('＋ 指派任務'));
    fireEvent.press(await screen.findByText('建立新任務'));

    expect(drawerVisible()).toBe(true);
    expect(drawerChild()).toMatchObject({ id: 'child-1' });
  });

  it('換目標孩子**不會**切換全域選中的孩子', async () => {
    mockUseChildDetails.mockReturnValue({
      child: mockChild2, loading: false, error: null, refresh: jest.fn(),
    });
    await openHome();
    fireEvent.press(screen.getByText('＋ 指派任務'));

    fireEvent.press(screen.getByLabelText('選擇要指派給誰')); // 展開孩子選單
    fireEvent.press(screen.getByLabelText('指派給 子晴'));  // 選另一個孩子

    // 這是整條路徑最重要的一則：整頁的資料不該跟著換過去。
    expect(mockSetSelectedChild).not.toHaveBeenCalled();
  });

  it('指派給另一個孩子時，抽屜拿到的是那個孩子的 birthDate', async () => {
    mockUseChildDetails.mockReturnValue({
      child: mockChild2, loading: false, error: null, refresh: jest.fn(),
    });
    await openHome();
    fireEvent.press(screen.getByText('＋ 指派任務'));
    fireEvent.press(screen.getByLabelText('選擇要指派給誰'));
    fireEvent.press(screen.getByLabelText('指派給 子晴'));
    fireEvent.press(screen.getByText('建立新任務'));

    expect(drawerChild()).toMatchObject({ id: 'child-2', birthDate: '2016-09-20' });
  });
});

// ---------------------------------------------------------------------------
// 7-8. 快選只帶名稱
// ---------------------------------------------------------------------------

describe('7-8. 最近指派過的快選', () => {
  it('點一下把名稱帶進抽屜', async () => {
    await openHome();
    fireEvent.press(screen.getByText('＋ 指派任務'));
    fireEvent.press(await screen.findByText('倒垃圾'));

    expect(drawerVisible()).toBe(true);
    expect(drawerSeed()).toEqual({ title: '倒垃圾' });
  });

  it('**只有**名稱 —— 幣值、類別、難度與日期一項都不帶', async () => {
    await openHome();
    fireEvent.press(screen.getByText('＋ 指派任務'));
    fireEvent.press(await screen.findByText('倒垃圾'));

    expect(Object.keys(drawerSeed() ?? {})).toEqual(['title']);
  });
});

// ---------------------------------------------------------------------------
// 9-11. 不再有第二套建立路徑
// ---------------------------------------------------------------------------

describe('9-11. 一般任務只剩一條路', () => {
  it('整頁不再呼叫 classifyTask / suggestTaskCoin / ai-proxy', () => {
    expect(withoutComments(SOURCE)).not.toMatch(/classifyTask|suggestTaskCoin|['"]ai-proxy['"]/);
  });

  it('不再直接寫 tasks / child_tasks —— 一般任務統一走 create_parent_task_v1', () => {
    const code = withoutComments(SOURCE);
    expect(code).not.toMatch(/from\('tasks'\)[\s\S]{0,80}\.insert\(/);
    expect(code).not.toMatch(/from\('child_tasks'\)[\s\S]{0,80}\.insert\(/);
  });

  it('長期任務三條路仍然走 createLongTermGoal，沒有被改道', () => {
    const code = withoutComments(SOURCE);
    expect(code).toContain('createLongTermGoal');
    for (const marker of ["longTermType === 'habit'", "longTermType === 'skill'", "longTermType === 'responsibility'"]) {
      expect(code).toContain(marker);
    }
  });
});
