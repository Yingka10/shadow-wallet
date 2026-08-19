// P1-A3 — 孩子確認之後，畫面真的把正式版本送出去了嗎
//
// ─────────────────────────────────────────────────────────────────────────────
// ChildGoalPlanningFlow 的測試證明了「確認之後會呼叫 publish port」，
// formalPlanService 的測試證明了「命令長什麼樣」。中間還缺一段：
//
//   **這個畫面真的把那個 port 接上去了嗎，接的是哪一支 RPC。**
//
// 這一段沒有測的話，port 可以完全正確而畫面接了一個空實作，
// 兩邊的測試都會是綠的。
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

/**
 * 只讀的查表替身。
 *
 * planning 的 requestPlan 讀的是**資料庫那一列**，不是畫面上的草稿 ——
 * 所以這一支不能像其他 planning 測試那樣讓 from() 直接丟例外。
 */
const ROWS: Record<string, Record<string, unknown>> = {
  child_proposals: {
    id: 'proposal-1',
    family_id: 'family-1',
    child_id: 'child-1',
    status: 'draft',
    child_original_goal: '我想兩週讀完這本書',
    child_original_motivation: null,
    proposal_source: 'child',
    cadence_mode: 'weekly_frequency',
    cadence_weekly_frequency: 4,
    cadence_days: null,
    preferred_time: null,
    preferred_time_custom: null,
    estimated_minutes: null,
    child_reward_preference: 'hopes_for_coin',
    child_note: null,
    current_plan_version_id: null,
    task_id: null,
  },
  children: { age_group: '6-9' },
};

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: ROWS[table] ?? null, error: null }),
      };
      return builder;
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
  supabaseEnvironment: { ok: true },
}));

const READY_PLAN = {
  desiredOutcome: '兩週讀完這本書',
  actionPlanSummary: '平日睡前讀 15 分鐘。',
  currentFocus: '養成睡前讀書的習慣',
  nextAction: { text: '今晚睡前讀 15 分鐘', source: 'child_stated' as const },
  reviewPoint: { type: 'after_days' as const, days: 7 },
  planningContribution: 'organized_child_plan' as const,
  provenance: {
    childOriginalGoal: '我想兩週讀完這本書',
    childStatedApproach: '平日睡前讀 15 分鐘',
    childChosenOption: null,
    fields: {
      approach: 'child_stated' as const,
      cadence: 'child_stated' as const,
      sessionSize: 'child_stated' as const,
      preferredTime: 'undecided' as const,
      nextAction: 'child_stated' as const,
      reviewPoint: 'ai_suggested' as const,
      phases: 'undecided' as const,
      target: 'undecided' as const,
      controllableActions: 'undecided' as const,
    },
  },
  model: 'test-model',
  goalControlType: 'directly_actionable' as const,
  progressionKind: 'rhythm' as const,
  cadence: { mode: 'weekly_frequency' as const, weeklyFrequency: 4 },
  sessionSize: { kind: 'minutes' as const, minutes: 15 },
  trialPeriod: { days: 7 },
};

// Goal Planning 打開，而且第一輪就給一份可以確認的計畫。
jest.mock('../../../lib/childPlanning', () => {
  const actual = jest.requireActual('../../../lib/childPlanning');
  return {
    ...actual,
    childGoalPlanningClientSetup: {
      resolution: { mode: 'live', reason: 'env' },
      client: {
        requestPlan: jest.fn(async () => ({
          status: 'ready',
          schemaVersion: 1,
          plan: READY_PLAN,
        })),
      },
    },
  };
});

// policy enrichment 關著 —— 這一支測的是**送出這件事本身**，
// 而「enrichment 掛掉照樣送出」正是 §20 要的行為。
jest.mock('../../../lib/childProposal', () => {
  const actual = jest.requireActual('../../../lib/childProposal');
  return {
    ...actual,
    planDraftClientSetup: { resolution: { mode: 'off', reason: 'test' }, client: null },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: { childId: 'child-1' } }),
}));

import ChildProposalScreen from '../ChildProposalScreen';

type RpcCall = [string, { p_command: Record<string, unknown> }];

function calls(): RpcCall[] {
  return mockRpc.mock.calls as RpcCall[];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockImplementation((name: string) => {
    switch (name) {
      case 'create_child_proposal_v1':
        return Promise.resolve({
          data: { ok: true, proposalId: 'proposal-1', status: 'draft' },
          error: null,
        });
      case 'start_child_goal_planning_session_v1':
        return Promise.resolve({
          data: {
            ok: true,
            sessionId: 'session-1',
            status: 'in_progress',
            revision: 0,
            roundsUsed: 0,
            attemptsUsed: 0,
            idempotentReplay: false,
          },
          error: null,
        });
      case 'record_child_goal_planning_round_v1':
        return Promise.resolve({
          data: {
            ok: true,
            sessionId: 'session-1',
            status: 'ready',
            revision: 1,
            roundsUsed: 1,
            attemptsUsed: 1,
            idempotentReplay: false,
          },
          error: null,
        });
      case 'confirm_child_goal_planning_session_v1':
        return Promise.resolve({
          data: {
            ok: true,
            sessionId: 'session-1',
            status: 'child_confirmed',
            revision: 2,
            idempotentReplay: false,
          },
          error: null,
        });
      case 'publish_child_confirmed_plan_v1':
        return Promise.resolve({
          data: {
            ok: true,
            proposalId: 'proposal-1',
            sessionId: 'session-1',
            planVersionId: 'version-1',
            versionNo: 1,
            authoredBy: 'child',
            proposalStatus: 'proposed',
            requiresParentDecision: ['cadence', 'duration', 'reward', 'purpose_category'],
            enrichmentStatus: 'unavailable',
            idempotentReplay: false,
          },
          error: null,
        });
      default:
        return Promise.resolve({ data: {}, error: null });
    }
  });
});

async function walkToConfirmed(screen: ReturnType<typeof render>) {
  fireEvent.changeText(screen.getByTestId('proposal-goal-input'), '我想兩週讀完這本書');
  fireEvent.press(screen.getByTestId('proposal-next'));
  fireEvent.press(screen.getByTestId('proposal-next'));
  fireEvent.press(screen.getByTestId('proposal-cadence-weekly_times'));
  fireEvent.press(screen.getByTestId('proposal-times-4'));
  fireEvent.press(screen.getByTestId('proposal-next'));
  fireEvent.press(screen.getByTestId('proposal-seenas-hopes_for_coin'));
  fireEvent.press(screen.getByTestId('proposal-next'));
  fireEvent.press(screen.getByTestId('proposal-submit'));

  await waitFor(() => expect(screen.getByTestId('planning-opening')).toBeTruthy());
  fireEvent.press(screen.getByTestId('planning-opening-has_own_idea'));
  fireEvent.changeText(screen.getByTestId('planning-approach-input'), '平日睡前讀 15 分鐘');
  fireEvent.press(screen.getByTestId('planning-opening-next'));

  await waitFor(() => expect(screen.getByTestId('planning-ready')).toBeTruthy());
  fireEvent.press(screen.getByTestId('planning-confirm'));
  await waitFor(() => expect(screen.getByTestId('planning-confirmed')).toBeTruthy());
}

// ---------------------------------------------------------------------------

describe('確認之後真的送出正式版本', () => {
  it('打的是 bridge RPC，帶的是這場對話與這份提案', async () => {
    const screen = render(<ChildProposalScreen />);
    await walkToConfirmed(screen);

    const publishes = calls().filter(([name]) => name === 'publish_child_confirmed_plan_v1');
    await waitFor(() => expect(publishes).toHaveLength(1));
    expect(publishes[0][1].p_command).toEqual({
      schemaVersion: 1,
      proposalId: 'proposal-1',
      sessionId: 'session-1',
    });
  });

  it('命令裡沒有任何一份計畫的文字', async () => {
    const screen = render(<ChildProposalScreen />);
    await walkToConfirmed(screen);

    const publish = calls().find(([name]) => name === 'publish_child_confirmed_plan_v1');
    const serialized = JSON.stringify(publish?.[1].p_command);
    // 計畫由 RPC 自己從 session.confirmed_plan 複製。這裡送得進去的話，
    // 家長看到的就不一定是孩子點頭的那一份。
    expect(serialized).not.toContain('兩週讀完這本書');
    expect(serialized).not.toContain('今晚睡前讀 15 分鐘');
    expect(serialized).not.toContain('progressionKind');
    expect(serialized).not.toContain('provenance');
  });

  it('走的是 bridge，不是「不規劃直接送出」那條', async () => {
    const screen = render(<ChildProposalScreen />);
    await walkToConfirmed(screen);

    const names = calls().map(([name]) => name);
    // 孩子確認過的計畫被當成沒有規劃送出的話，那份計畫會消失。
    expect(names).not.toContain('submit_child_proposal_without_planning_v1');
    expect(names).not.toContain('transition_child_proposal_v1');
  });

  it('不建任務、不發幣、不碰錢包', async () => {
    const screen = render(<ChildProposalScreen />);
    await walkToConfirmed(screen);

    expect(mockCreateChildTask).not.toHaveBeenCalled();
    const names = calls().map(([name]) => name);
    for (const forbidden of [
      'create_parent_task_v1',
      'confirm_child_proposal_v1',
      'complete_task',
      'settle_weekly_interest',
    ]) {
      expect({ forbidden, called: names.includes(forbidden) })
        .toEqual({ forbidden, called: false });
    }
  });

  it('enrichment 關著也照樣送出', async () => {
    // §20：AI policy helper 掛掉不可以把孩子已經確認的提案永遠鎖在 draft。
    const screen = render(<ChildProposalScreen />);
    await walkToConfirmed(screen);

    const publish = calls().find(([name]) => name === 'publish_child_confirmed_plan_v1');
    expect(publish).toBeTruthy();
    expect('enrichment' in (publish?.[1].p_command ?? {})).toBe(false);
  });
});
