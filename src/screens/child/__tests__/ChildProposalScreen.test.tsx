// P0-2 — 孩子提案畫面（渲染層）
//
// 這一支走完 Demo 的 golden path，並釘住三件不能靠人工檢查的事：
//   · 送出走的是 proposal 契約，不是 createChildTask
//   · 失敗時絕不顯示成功畫面
//   · 成功畫面不出現「審核 / 批准」

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

// ── mock 邊界 ────────────────────────────────────────────────────────────────
//
// taskActions 整包 mock 成會爆的函式：這條路徑只要碰到它就會讓測試紅，
// 而不是靜靜地建立一筆正式任務。
const mockCreateChildTask = jest.fn((..._args: unknown[]) => {
  throw new Error('提案流程不可以呼叫 createChildTask');
});
jest.mock('../../../lib/taskActions', () => ({
  createChildTask: (...args: unknown[]) => mockCreateChildTask(...args),
  completeTask: jest.fn(),
}));

// supabase client 同理：提案流程只透過 service 的 rpc 走，
// 不該有人在畫面裡 from('tasks') / from('wallets')。
const mockFrom = jest.fn((..._args: unknown[]) => {
  throw new Error('提案流程不可以直接查表');
});
const mockRpc = jest.fn();
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

// 與 HomeScreen.test 同一組 stub —— 測試環境沒有 SafeAreaProvider。
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: { childId: 'child-1' } }),
}));

import ChildProposalScreen from '../ChildProposalScreen';
import { PROPOSAL_COPY } from '../childProposal';

const DEMO_GOAL = '我想兩週把這本書讀完';
const DEMO_WHY = '因為同學說這本書很好看';

/** rpc 回應：預設兩步都成功。 */
function primeRpcOk() {
  mockRpc.mockImplementation((name: string) => {
    if (name === 'create_child_proposal_v1') {
      return Promise.resolve({
        data: { ok: true, proposalId: 'p-1', status: 'draft' },
        error: null,
      });
    }
    return Promise.resolve({
      data: {
        ok: true, proposalId: 'p-1', fromStatus: 'draft', toStatus: 'proposed',
        planVersionId: null, confirmedReward: null,
      },
      error: null,
    });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  primeRpcOk();
});

/** 走到摘要頁：填目標 → 動機 → 節奏 → 怎麼被看見。 */
async function fillGoldenPath(screen: ReturnType<typeof render>) {
  const { getByTestId } = screen;

  fireEvent.changeText(getByTestId('proposal-goal-input'), DEMO_GOAL);
  fireEvent.press(getByTestId('proposal-next'));

  fireEvent.changeText(getByTestId('proposal-motivation-input'), DEMO_WHY);
  fireEvent.press(getByTestId('proposal-next'));

  fireEvent.press(getByTestId('proposal-cadence-weekly_times'));
  fireEvent.press(getByTestId('proposal-times-4'));
  fireEvent.press(getByTestId('proposal-next'));

  fireEvent.press(getByTestId('proposal-seenas-hopes_for_coin'));
  fireEvent.press(getByTestId('proposal-next'));
}

// ---------------------------------------------------------------------------

describe('第一個問題', () => {
  it('一開始問「你想試試看什麼」', () => {
    const { getByText, getByTestId } = render(<ChildProposalScreen />);
    expect(getByText(PROPOSAL_COPY.goal.question)).toBeTruthy();
    expect(getByTestId('proposal-goal-input')).toBeTruthy();
  });

  it('沒寫目標就往下走會被擋，並說出原因', () => {
    const { getByTestId, queryByText } = render(<ChildProposalScreen />);

    fireEvent.press(getByTestId('proposal-next'));

    expect(getByTestId('proposal-goal-error')).toBeTruthy();
    // 還停在第一頁。
    expect(queryByText(PROPOSAL_COPY.motivation.question)).toBeNull();
  });

  it('寫了就走得到第二頁', () => {
    const { getByTestId, getByText } = render(<ChildProposalScreen />);

    fireEvent.changeText(getByTestId('proposal-goal-input'), DEMO_GOAL);
    fireEvent.press(getByTestId('proposal-next'));

    expect(getByText(PROPOSAL_COPY.motivation.question)).toBeTruthy();
  });
});

describe('可以回上一步', () => {
  it('第二頁按返回回到第一頁，內容還在', () => {
    const { getByTestId, getByText } = render(<ChildProposalScreen />);

    fireEvent.changeText(getByTestId('proposal-goal-input'), DEMO_GOAL);
    fireEvent.press(getByTestId('proposal-next'));
    fireEvent.press(getByTestId('proposal-back'));

    expect(getByText(PROPOSAL_COPY.goal.question)).toBeTruthy();
    expect(getByTestId('proposal-goal-input').props.value).toBe(DEMO_GOAL);
  });

  it('第一頁按返回就離開這個流程', () => {
    const { getByTestId } = render(<ChildProposalScreen />);
    fireEvent.press(getByTestId('proposal-back'));
    expect(mockGoBack).toHaveBeenCalled();
  });
});

describe('動機可以跳過', () => {
  it('沒填也走得下去', () => {
    const { getByTestId, getByText } = render(<ChildProposalScreen />);

    fireEvent.changeText(getByTestId('proposal-goal-input'), DEMO_GOAL);
    fireEvent.press(getByTestId('proposal-next'));
    // 選填的步驟有一顆明確的「先跳過」。
    fireEvent.press(getByTestId('proposal-skip'));

    expect(getByText(PROPOSAL_COPY.cadence.question)).toBeTruthy();
  });
});

describe('摘要頁', () => {
  it('送出前看得到自己填的東西', async () => {
    const screen = render(<ChildProposalScreen />);
    await fillGoldenPath(screen);

    const summary = screen.getByTestId('proposal-summary');
    expect(summary).toBeTruthy();
    expect(screen.getByText(DEMO_GOAL)).toBeTruthy();
    expect(screen.getByText(DEMO_WHY)).toBeTruthy();
    expect(screen.getByText('一週 4 次')).toBeTruthy();
    expect(screen.getByText('如果適合，也可以用成長幣鼓勵我')).toBeTruthy();
  });

  it('送出之前就先告訴孩子「記下來後就可以開始」', async () => {
    const screen = render(<ChildProposalScreen />);
    await fillGoldenPath(screen);

    expect(screen.getByText(PROPOSAL_COPY.review.note)).toBeTruthy();
  });

  it('每一列都點得回去改', async () => {
    const screen = render(<ChildProposalScreen />);
    await fillGoldenPath(screen);

    fireEvent.press(screen.getByLabelText(`${PROPOSAL_COPY.review.cadenceLabel}：一週 4 次`));

    expect(screen.getByText(PROPOSAL_COPY.cadence.question)).toBeTruthy();
    // 回去改不會把已經選的清掉。
    expect(screen.getByTestId('proposal-times-picker')).toBeTruthy();
  });
});

describe('進度只算四個問題', () => {
  it('問題頁有四顆點，不是五顆', () => {
    const screen = render(<ChildProposalScreen />);

    expect(screen.getByTestId('proposal-progress')).toBeTruthy();
    for (let i = 0; i < 4; i += 1) {
      expect(screen.getByTestId(`proposal-progress-dot-${i}`)).toBeTruthy();
    }
    expect(screen.queryByTestId('proposal-progress-dot-4')).toBeNull();
  });

  it('摘要頁不再顯示進度 —— 它不是第五個問題', async () => {
    const screen = render(<ChildProposalScreen />);
    await fillGoldenPath(screen);

    expect(screen.getByTestId('proposal-summary')).toBeTruthy();
    expect(screen.queryByTestId('proposal-progress')).toBeNull();
  });
});

describe('每一頁都走得回去', () => {
  it('第二頁起，footer 有一顆「上一步」', () => {
    const screen = render(<ChildProposalScreen />);

    // 第一頁不放 —— 那裡的返回是離開流程，頁首的箭頭講得比較清楚。
    expect(screen.queryByTestId('proposal-prev')).toBeNull();

    fireEvent.changeText(screen.getByTestId('proposal-goal-input'), DEMO_GOAL);
    fireEvent.press(screen.getByTestId('proposal-next'));

    fireEvent.press(screen.getByTestId('proposal-prev'));
    expect(screen.getByText(PROPOSAL_COPY.goal.question)).toBeTruthy();
    expect(screen.getByTestId('proposal-goal-input').props.value).toBe(DEMO_GOAL);
  });
});

describe('送出（golden path）', () => {
  it('兩步都走：先 create 再 transition 到 proposed', async () => {
    const screen = render(<ChildProposalScreen />);
    await fillGoldenPath(screen);

    await act(async () => {
      fireEvent.press(screen.getByTestId('proposal-submit'));
    });

    await waitFor(() => expect(screen.getByTestId('proposal-success')).toBeTruthy());

    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc.mock.calls[0][0]).toBe('create_child_proposal_v1');
    expect(mockRpc.mock.calls[1][0]).toBe('transition_child_proposal_v1');
  });

  it('孩子的原話原樣送進 service', async () => {
    const screen = render(<ChildProposalScreen />);
    await fillGoldenPath(screen);

    await act(async () => {
      fireEvent.press(screen.getByTestId('proposal-submit'));
    });
    await waitFor(() => expect(screen.getByTestId('proposal-success')).toBeTruthy());

    const command = (mockRpc.mock.calls[0][1] as { p_command: Record<string, unknown> }).p_command;
    expect(command.childOriginalGoal).toBe(DEMO_GOAL);
    expect(command.childOriginalMotivation).toBe(DEMO_WHY);
    expect(command.cadence).toEqual({ mode: 'weekly_frequency', weeklyFrequency: 4 });
    expect(command.childRewardPreference).toBe('hopes_for_coin');
    // 建立時一律 draft —— 不可以直接生出 active/shared。
    expect(command.status).toBe('draft');
  });

  it('送出的是 proposed，不是 active', async () => {
    const screen = render(<ChildProposalScreen />);
    await fillGoldenPath(screen);

    await act(async () => {
      fireEvent.press(screen.getByTestId('proposal-submit'));
    });
    await waitFor(() => expect(screen.getByTestId('proposal-success')).toBeTruthy());

    const command = (mockRpc.mock.calls[1][1] as { p_command: Record<string, unknown> }).p_command;
    expect(command.toStatus).toBe('proposed');
    expect(command.actorRole).toBe('child');
    expect('taskId' in command).toBe(false);
  });
});

describe('成功畫面', () => {
  it('說想法記下來了，而且可以先開始', async () => {
    const screen = render(<ChildProposalScreen />);
    await fillGoldenPath(screen);
    await act(async () => {
      fireEvent.press(screen.getByTestId('proposal-submit'));
    });
    await waitFor(() => expect(screen.getByTestId('proposal-success')).toBeTruthy());

    expect(screen.getByText(PROPOSAL_COPY.success.title)).toBeTruthy();
    expect(screen.getByText(PROPOSAL_COPY.success.body)).toBeTruthy();
  });

  it.each(['審核', '批准', '核准', '等待家長', '待確認'])(
    '成功畫面不出現「%s」',
    async (word) => {
      const screen = render(<ChildProposalScreen />);
      await fillGoldenPath(screen);
      await act(async () => {
        fireEvent.press(screen.getByTestId('proposal-submit'));
      });
      await waitFor(() => expect(screen.getByTestId('proposal-success')).toBeTruthy());

      expect(screen.queryByText(new RegExp(word))).toBeNull();
    },
  );
});

describe('失敗絕不顯示成功', () => {
  it('第一步失敗 → 摘要頁顯示錯誤，而且沒有呼叫第二步', async () => {
    mockRpc.mockImplementation(() =>
      Promise.resolve({
        data: { ok: false, code: 'VALIDATION_FAILED', message: '提案缺少孩子的原始目標' },
        error: null,
      }),
    );

    const screen = render(<ChildProposalScreen />);
    await fillGoldenPath(screen);
    await act(async () => {
      fireEvent.press(screen.getByTestId('proposal-submit'));
    });

    await waitFor(() => expect(screen.getByTestId('proposal-error')).toBeTruthy());
    expect(screen.queryByTestId('proposal-success')).toBeNull();
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('第二步失敗 → 摘要頁顯示錯誤，訊息說內容有記下來', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'create_child_proposal_v1') {
        return Promise.resolve({
          data: { ok: true, proposalId: 'p-1', status: 'draft' }, error: null,
        });
      }
      return Promise.resolve({
        data: null, error: { code: 'PGRST301', message: 'network down' },
      });
    });

    const screen = render(<ChildProposalScreen />);
    await fillGoldenPath(screen);
    await act(async () => {
      fireEvent.press(screen.getByTestId('proposal-submit'));
    });

    await waitFor(() => expect(screen.getByTestId('proposal-error')).toBeTruthy());
    expect(screen.queryByTestId('proposal-success')).toBeNull();
    expect(screen.getByText(PROPOSAL_COPY.error.transition)).toBeTruthy();
  });

  it('第二步失敗後重試，只重送第二步（不會多一份提案）', async () => {
    let transitionCalls = 0;
    mockRpc.mockImplementation((name: string) => {
      if (name === 'create_child_proposal_v1') {
        return Promise.resolve({
          data: { ok: true, proposalId: 'p-1', status: 'draft' }, error: null,
        });
      }
      transitionCalls += 1;
      if (transitionCalls === 1) {
        return Promise.resolve({ data: null, error: { code: 'PGRST301', message: 'boom' } });
      }
      return Promise.resolve({
        data: {
          ok: true, proposalId: 'p-1', fromStatus: 'draft', toStatus: 'proposed',
          planVersionId: null, confirmedReward: null,
        },
        error: null,
      });
    });

    const screen = render(<ChildProposalScreen />);
    await fillGoldenPath(screen);
    await act(async () => {
      fireEvent.press(screen.getByTestId('proposal-submit'));
    });
    await waitFor(() => expect(screen.getByTestId('proposal-error')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId('proposal-submit'));
    });
    await waitFor(() => expect(screen.getByTestId('proposal-success')).toBeTruthy());

    const creates = mockRpc.mock.calls.filter((c) => c[0] === 'create_child_proposal_v1');
    expect(creates).toHaveLength(1);
    expect(transitionCalls).toBe(2);
  });
});

describe('送出不建立任務、不動錢包', () => {
  it('整條流程沒有呼叫 createChildTask', async () => {
    const screen = render(<ChildProposalScreen />);
    await fillGoldenPath(screen);
    await act(async () => {
      fireEvent.press(screen.getByTestId('proposal-submit'));
    });
    await waitFor(() => expect(screen.getByTestId('proposal-success')).toBeTruthy());

    expect(mockCreateChildTask).not.toHaveBeenCalled();
  });

  it('沒有直接查任何表（tasks / child_tasks / wallets / transactions）', async () => {
    const screen = render(<ChildProposalScreen />);
    await fillGoldenPath(screen);
    await act(async () => {
      fireEvent.press(screen.getByTestId('proposal-submit'));
    });
    await waitFor(() => expect(screen.getByTestId('proposal-success')).toBeTruthy());

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('只呼叫兩支 proposal RPC，沒有第三個', async () => {
    const screen = render(<ChildProposalScreen />);
    await fillGoldenPath(screen);
    await act(async () => {
      fireEvent.press(screen.getByTestId('proposal-submit'));
    });
    await waitFor(() => expect(screen.getByTestId('proposal-success')).toBeTruthy());

    expect(mockRpc.mock.calls.map((c) => c[0])).toEqual([
      'create_child_proposal_v1',
      'transition_child_proposal_v1',
    ]);
  });

  it('沒有呼叫任何 AI', async () => {
    const screen = render(<ChildProposalScreen />);
    await fillGoldenPath(screen);
    await act(async () => {
      fireEvent.press(screen.getByTestId('proposal-submit'));
    });
    await waitFor(() => expect(screen.getByTestId('proposal-success')).toBeTruthy());

    for (const call of mockRpc.mock.calls) {
      expect(String(call[0])).not.toContain('ai');
      expect(String(call[0])).not.toContain('recommend');
    }
  });
});

describe('節奏選項', () => {
  async function toCadence(screen: ReturnType<typeof render>) {
    fireEvent.changeText(screen.getByTestId('proposal-goal-input'), DEMO_GOAL);
    fireEvent.press(screen.getByTestId('proposal-next'));
    fireEvent.press(screen.getByTestId('proposal-skip'));
  }

  it('固定哪幾天：選了日子才走得下去', async () => {
    const screen = render(<ChildProposalScreen />);
    await toCadence(screen);

    fireEvent.press(screen.getByTestId('proposal-cadence-certain_days'));
    // 一天都沒選 → 擋住。
    fireEvent.press(screen.getByTestId('proposal-next'));
    expect(screen.queryByText(PROPOSAL_COPY.seenAs.question)).toBeNull();

    fireEvent.press(screen.getByTestId('proposal-day-2'));
    fireEvent.press(screen.getByTestId('proposal-day-4'));
    fireEvent.press(screen.getByTestId('proposal-next'));
    expect(screen.getByText(PROPOSAL_COPY.seenAs.question)).toBeTruthy();
  });

  it('還不知道：直接送得出去，命令裡沒有 cadence', async () => {
    const screen = render(<ChildProposalScreen />);
    await toCadence(screen);

    fireEvent.press(screen.getByTestId('proposal-cadence-not_sure'));
    fireEvent.press(screen.getByTestId('proposal-next'));
    fireEvent.press(screen.getByTestId('proposal-skip'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('proposal-submit'));
    });
    await waitFor(() => expect(screen.getByTestId('proposal-success')).toBeTruthy());

    const command = (mockRpc.mock.calls[0][1] as { p_command: Record<string, unknown> }).p_command;
    expect('cadence' in command).toBe(false);
    expect(command.childRewardPreference).toBe('not_specified');
  });

  it('一週次數只提供 1–7', async () => {
    const screen = render(<ChildProposalScreen />);
    await toCadence(screen);
    fireEvent.press(screen.getByTestId('proposal-cadence-weekly_times'));

    for (let n = 1; n <= 7; n += 1) {
      expect(screen.getByTestId(`proposal-times-${n}`)).toBeTruthy();
    }
    expect(screen.queryByTestId('proposal-times-0')).toBeNull();
    expect(screen.queryByTestId('proposal-times-8')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P1-A2 §3／§27 — Goal Planning 關掉時，這條路徑一個字都沒有變
//
// 這一組是**降級路徑的守門員**。P1 的流程在同一個 handleSubmit 裡分岔，
// 而分岔點只有一個（client === null）。它壞掉的話，症狀不是報錯，是
// 「AI 關著卻還是開了一場對話」或「兩步送出變成一步」—— 兩者都會安靜地
// 弄丟 draft → proposed 那段稽核紀錄。
//
// 這也是之後換付費 provider 前的降級路徑，所以它必須一直測得到。
// ---------------------------------------------------------------------------

describe('P1-A2：Goal Planning 關掉時走的仍是既有的兩步送出', () => {
  it('沒有開任何 planning session', async () => {
    const screen = render(<ChildProposalScreen />);
    await fillGoldenPath(screen);
    fireEvent.press(screen.getByTestId('proposal-submit'));

    await waitFor(() => expect(screen.getByTestId('proposal-success')).toBeTruthy());

    const called = mockRpc.mock.calls.map((call) => call[0] as string);
    expect(called).not.toContain('start_child_goal_planning_session_v1');
    expect(called).not.toContain('record_child_goal_planning_round_v1');
    expect(called).not.toContain('confirm_child_goal_planning_session_v1');
  });

  it('draft → proposed 的稽核鏈仍然是兩步', async () => {
    const screen = render(<ChildProposalScreen />);
    await fillGoldenPath(screen);
    fireEvent.press(screen.getByTestId('proposal-submit'));

    await waitFor(() => expect(screen.getByTestId('proposal-success')).toBeTruthy());

    // 兩步是刻意的：合成一步的話，child_proposal_status_events 只會留下
    // 一筆，而「孩子先寫下、再決定送出」那段過程就消失了。
    const called = mockRpc.mock.calls.map((call) => call[0] as string);
    expect(called).toContain('create_child_proposal_v1');
    expect(called).toContain('transition_child_proposal_v1');
    expect(called.indexOf('create_child_proposal_v1'))
      .toBeLessThan(called.indexOf('transition_child_proposal_v1'));
  });

  it('孩子看到的仍然是既有的成功頁，不是規劃頁', async () => {
    const screen = render(<ChildProposalScreen />);
    await fillGoldenPath(screen);
    fireEvent.press(screen.getByTestId('proposal-submit'));

    await waitFor(() => expect(screen.getByTestId('proposal-success')).toBeTruthy());
    expect(screen.queryByTestId('planning-opening')).toBeNull();
  });
});
