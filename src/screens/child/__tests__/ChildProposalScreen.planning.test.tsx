// P1-A2 Correction §D — 規劃開不起來時，App 不替孩子做決定
//
// ─────────────────────────────────────────────────────────────────────────────
// 這一支存在的理由是一個很容易寫錯、而且錯了看不出來的判斷：
//
//   start RPC 回 PERSISTENCE_FAILED 時，App **不知道** DB 有沒有其實已經
//   建好那場對話 —— 回應有可能是在 commit 之後才掉的。
//
// 舊的寫法是「開不起來就自動幫他送出」。那等於在一個可能已經開好對話的
// 提案上直接推去 proposed，而孩子從頭到尾沒有選過。
//
// 正確的作法：把選擇交回孩子，而「再試一次」重用**同一個** clientRequestId，
// 讓 start RPC 自己做冪等對帳。
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockCreateChildTask = jest.fn(() => {
  throw new Error('這條路不該碰 createChildTask');
});
jest.mock('../../../lib/taskActions', () => ({
  createChildTask: () => mockCreateChildTask(),
  completeTask: jest.fn(),
}));

const mockRpc = jest.fn();
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => {
      throw new Error('這條路不該直接查表');
    }),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
  supabaseEnvironment: { ok: true },
}));

// Goal Planning **打開**。這是 P1 與 legacy 的唯一分岔點。
jest.mock('../../../lib/childPlanning', () => {
  const actual = jest.requireActual('../../../lib/childPlanning');
  return {
    ...actual,
    childGoalPlanningClientSetup: {
      resolution: { mode: 'live', reason: 'env' },
      client: { requestPlan: jest.fn() },
    },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: mockGoBack }),
  useRoute: () => ({ params: { childId: 'child-1' } }),
}));

import ChildProposalScreen from '../ChildProposalScreen';

type RpcCall = [string, { p_command: Record<string, unknown> }];

function calls(): RpcCall[] {
  return mockRpc.mock.calls as RpcCall[];
}

function callNames(): string[] {
  return calls().map(([name]) => name);
}

/** create 成功，其餘由各個測試決定。 */
function primeRpc(handler: (name: string, command: Record<string, unknown>) => unknown) {
  mockRpc.mockImplementation((name: string, args: { p_command: Record<string, unknown> }) => {
    if (name === 'create_child_proposal_v1') {
      return Promise.resolve({
        data: { ok: true, proposalId: 'proposal-1', status: 'draft' },
        error: null,
      });
    }
    return Promise.resolve({ data: handler(name, args.p_command), error: null });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

async function fillAndSubmit(screen: ReturnType<typeof render>) {
  fireEvent.changeText(screen.getByTestId('proposal-goal-input'), '我想兩週讀完這本書');
  fireEvent.press(screen.getByTestId('proposal-next'));
  fireEvent.press(screen.getByTestId('proposal-next'));
  fireEvent.press(screen.getByTestId('proposal-cadence-weekly_times'));
  fireEvent.press(screen.getByTestId('proposal-times-4'));
  fireEvent.press(screen.getByTestId('proposal-next'));
  fireEvent.press(screen.getByTestId('proposal-seenas-hopes_for_coin'));
  fireEvent.press(screen.getByTestId('proposal-next'));
  fireEvent.press(screen.getByTestId('proposal-submit'));
}

// ---------------------------------------------------------------------------

describe('P1 打開時：先建 draft，再一起想怎麼開始', () => {
  it('只建立、不送出 —— 提案停在 draft', async () => {
    primeRpc(() => ({
      ok: true,
      sessionId: 'session-1',
      status: 'in_progress',
      revision: 0,
      roundsUsed: 0,
      attemptsUsed: 0,
      idempotentReplay: false,
    }));

    const screen = render(<ChildProposalScreen />);
    await fillAndSubmit(screen);

    await waitFor(() => expect(screen.getByTestId('planning-opening')).toBeTruthy());
    expect(callNames()).toContain('create_child_proposal_v1');
    // 這一包停在 draft。轉送是 P1-A3 的橋，或孩子自己按的那顆逃生按鈕。
    expect(callNames()).not.toContain('transition_child_proposal_v1');
  });
});

describe('§D 規劃開不起來時不自動送出', () => {
  it('顯示三條路，而且**沒有**自己把提案送出去', async () => {
    primeRpc((name) =>
      name === 'start_child_goal_planning_session_v1'
        ? { ok: false, code: 'PERSISTENCE_FAILED', message: '連不上' }
        : {},
    );

    const screen = render(<ChildProposalScreen />);
    await fillAndSubmit(screen);

    await waitFor(() => expect(screen.getByTestId('planning-start-failed')).toBeTruthy());
    expect(screen.getByTestId('planning-start-retry')).toBeTruthy();
    expect(screen.getByTestId('planning-start-write-own')).toBeTruthy();
    expect(screen.getByTestId('planning-start-send')).toBeTruthy();

    // 這才是重點：PERSISTENCE_FAILED 有可能是「其實成功了但回應掉了」，
    // 自動送出等於在一個可能已經開好對話的提案上直接推去 proposed。
    expect(callNames()).not.toContain('transition_child_proposal_v1');
    expect(callNames()).not.toContain('submit_child_proposal_without_planning_v1');
    expect(screen.queryByTestId('proposal-success')).toBeNull();
  });

  it('「再試一次」重用同一個 clientRequestId', async () => {
    let attempt = 0;
    primeRpc((name) => {
      if (name !== 'start_child_goal_planning_session_v1') return {};
      attempt += 1;
      return attempt === 1
        ? { ok: false, code: 'PERSISTENCE_FAILED', message: '連不上' }
        : {
            ok: true,
            sessionId: 'session-1',
            status: 'in_progress',
            revision: 0,
            roundsUsed: 0,
            attemptsUsed: 0,
            // 第一次其實有 commit，只是回應掉了 —— RPC 自己對帳。
            idempotentReplay: true,
          };
    });

    const screen = render(<ChildProposalScreen />);
    await fillAndSubmit(screen);
    await waitFor(() => expect(screen.getByTestId('planning-start-failed')).toBeTruthy());

    fireEvent.press(screen.getByTestId('planning-start-retry'));
    await waitFor(() => expect(screen.getByTestId('planning-opening')).toBeTruthy());

    const starts = calls().filter(([name]) => name === 'start_child_goal_planning_session_v1');
    expect(starts).toHaveLength(2);
    // 換一把新的 id 會真的開出第二場對話。
    expect(starts[0][1].p_command.clientRequestId).toBe(starts[1][1].p_command.clientRequestId);
    expect(starts[0][1].p_command.clientRequestId).toBeTruthy();
  });

  it('「我自己想」也走同一個冪等的 start，然後直接跳到輸入那一頁', async () => {
    let attempt = 0;
    primeRpc((name) => {
      if (name !== 'start_child_goal_planning_session_v1') return {};
      attempt += 1;
      return attempt === 1
        ? { ok: false, code: 'PERSISTENCE_FAILED', message: '連不上' }
        : {
            ok: true,
            sessionId: 'session-1',
            status: 'in_progress',
            revision: 0,
            roundsUsed: 0,
            attemptsUsed: 0,
            idempotentReplay: true,
          };
    });

    const screen = render(<ChildProposalScreen />);
    await fillAndSubmit(screen);
    await waitFor(() => expect(screen.getByTestId('planning-start-failed')).toBeTruthy());

    fireEvent.press(screen.getByTestId('planning-start-write-own'));

    // 他已經說過「我自己想」了，不該再被問一次開場那一題。
    await waitFor(() => expect(screen.getByTestId('planning-write-own')).toBeTruthy());
    expect(screen.queryByTestId('planning-opening')).toBeNull();
  });

  it('「先把想法送給爸媽」走 atomic RPC，不是 transition', async () => {
    primeRpc((name) => {
      if (name === 'start_child_goal_planning_session_v1') {
        return { ok: false, code: 'PERSISTENCE_FAILED', message: '連不上' };
      }
      if (name === 'submit_child_proposal_without_planning_v1') {
        return {
          ok: true,
          proposalId: 'proposal-1',
          fromStatus: 'draft',
          toStatus: 'proposed',
          sessionId: null,
          sessionStatus: null,
          idempotentReplay: false,
        };
      }
      return {};
    });

    const screen = render(<ChildProposalScreen />);
    await fillAndSubmit(screen);
    await waitFor(() => expect(screen.getByTestId('planning-start-failed')).toBeTruthy());

    fireEvent.press(screen.getByTestId('planning-start-send'));

    await waitFor(() => expect(screen.getByTestId('proposal-success')).toBeTruthy());
    // 放棄規劃與送出必須在同一個交易裡 —— App 端只呼叫一次。
    expect(callNames()).toContain('submit_child_proposal_without_planning_v1');
    expect(callNames()).not.toContain('transition_child_proposal_v1');
  });

  it('送不出去就停在原地，不顯示成功畫面', async () => {
    primeRpc((name) => {
      if (name === 'start_child_goal_planning_session_v1') {
        return { ok: false, code: 'PERSISTENCE_FAILED', message: '連不上' };
      }
      return { ok: false, code: 'PERSISTENCE_FAILED', message: '也連不上' };
    });

    const screen = render(<ChildProposalScreen />);
    await fillAndSubmit(screen);
    await waitFor(() => expect(screen.getByTestId('planning-start-failed')).toBeTruthy());

    fireEvent.press(screen.getByTestId('planning-start-send'));

    await waitFor(() => expect(screen.getByTestId('proposal-error')).toBeTruthy());
    expect(screen.queryByTestId('proposal-success')).toBeNull();
  });
});

describe('規劃途中按「先把想法送給爸媽」', () => {
  it('一次 atomic 呼叫，同時放棄規劃與送出', async () => {
    primeRpc((name) => {
      if (name === 'start_child_goal_planning_session_v1') {
        return {
          ok: true,
          sessionId: 'session-1',
          status: 'in_progress',
          revision: 0,
          roundsUsed: 0,
          attemptsUsed: 0,
          idempotentReplay: false,
        };
      }
      if (name === 'submit_child_proposal_without_planning_v1') {
        return {
          ok: true,
          proposalId: 'proposal-1',
          fromStatus: 'draft',
          toStatus: 'proposed',
          sessionId: 'session-1',
          sessionStatus: 'abandoned',
          idempotentReplay: false,
        };
      }
      return {};
    });

    const screen = render(<ChildProposalScreen />);
    await fillAndSubmit(screen);
    await waitFor(() => expect(screen.getByTestId('planning-opening')).toBeTruthy());

    fireEvent.press(screen.getByTestId('planning-send-to-parents'));

    await waitFor(() => expect(screen.getByTestId('proposal-success')).toBeTruthy());
    const exits = callNames().filter((n) => n === 'submit_child_proposal_without_planning_v1');
    expect(exits).toHaveLength(1);
    expect(callNames()).not.toContain('transition_child_proposal_v1');
  });
});
