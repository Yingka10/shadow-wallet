// P1-A4B2 §4 / §22 — 孩子看到的那張卡片
//
// ─────────────────────────────────────────────────────────────────────────────
// 兩件事：
//
//   1. **你的做法沒有被改掉** —— 那幾行要在，而且差異裡只有共同條件。
//   2. **還沒說完的時候不可以寫「開始」**。他按下去之後任務不會出現，
//      而他會以為是 App 壞了。
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { TASK_POLICY_VERSION } from '../../../screens/parent/tablet/taskDrawer/taskCatalog';
import type {
  ChildProposal,
  ChildProposalPlanVersion,
  ChildProposalReviewData,
} from '../../../lib/childProposal/types';
import { ChildSharedTermsReviewCard } from '../ChildSharedTermsReviewCard';

function proposal(overrides: Partial<ChildProposal> = {}): ChildProposal {
  return {
    id: 'proposal-1', family_id: 'family-1', child_id: 'child-1',
    status: 'needs_child_review',
    child_original_goal: '我想兩週讀完一本書', child_original_motivation: null,
    proposal_source: 'child', cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 5,
    cadence_days: null, preferred_time: 'before_bed', preferred_time_custom: null,
    estimated_minutes: null, child_reward_preference: 'hopes_for_coin', child_note: null,
    current_plan_version_id: 'version-parent', task_id: null,
    closed_reason: null, closed_at: null, proposed_at: '2026-08-15T00:00:00Z',
    activated_at: null, created_at: '2026-08-15T00:00:00Z', updated_at: '2026-08-15T00:00:00Z',
    ...overrides,
  } as ChildProposal;
}

function version(overrides: Partial<ChildProposalPlanVersion> = {}): ChildProposalPlanVersion {
  return {
    id: 'version-child', proposal_id: 'proposal-1', version_no: 1,
    authored_by: 'child', author_user_id: 'user-1',
    plan_title: '兩週讀完一本書', plan_summary: '每天睡前讀 15 分鐘，兩週讀完。',
    purpose_category: 'D', completion_description: '完成一次約定的閱讀時段',
    progress_model: 'weekly_rhythm', next_step: '今晚睡前讀 15 分鐘',
    cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 5, cadence_days: null,
    preferred_time: 'before_bed', preferred_time_custom: null, estimated_minutes: 15,
    duration_type: 'long_term', duration_days: 14, start_date: null, end_date: null,
    reward_policy: 'coin_eligible', reward_eligibility: 'allowed',
    reward_policy_version: 'coin-policy-1.0.0', task_policy_version: TASK_POLICY_VERSION,
    policy_session_coin_reference: 10, policy_payout_type: 'per_completion',
    ai_snapshot: null, ai_model: null, ai_request_id: null,
    adopted_from_plan_version_id: null, ai_suggested_coin_amount: null,
    source_planning_session_id: 'session-1', planning_schema_version: 1,
    child_confirmed_plan: { desiredOutcome: '兩週讀完一本書', progressionKind: 'rhythm' },
    requires_parent_decision: [], enrichment_status: 'enriched',
    confirmed_reward_policy: null, confirmed_coin_amount: null, confirmed_payout_basis: null,
    confirmed_claim_period: null, confirmed_max_claims_per_period: null,
    confirmed_reward_policy_version: null, confirmed_task_policy_version: null,
    confirmed_source_task_id: null, confirmed_by_user_id: null, confirmed_at: null,
    requires_child_review: false, child_accepted_at: null, parent_confirmed_at: null,
    effective_at: null, superseded_at: null, created_at: '2026-08-15T00:00:00Z',
    ...overrides,
  };
}

function review(parentOverrides: Partial<ChildProposalPlanVersion> = {}): ChildProposalReviewData {
  return {
    proposal: proposal(),
    currentPlanVersion: version({
      id: 'version-parent', version_no: 2, authored_by: 'parent',
      adopted_from_plan_version_id: 'version-child',
      source_planning_session_id: null, planning_schema_version: null,
      child_confirmed_plan: null, enrichment_status: null,
      preferred_time: 'after_dinner', estimated_minutes: 20,
      requires_child_review: true, parent_confirmed_at: '2026-08-15T01:00:00Z',
      ...parentOverrides,
    }),
    sourcePlanVersion: version(),
  };
}

function renderCard(
  data: ChildProposalReviewData,
  handlers: Partial<{ onAccept: () => void; onRequestChanges: (reason?: string) => void }> = {},
) {
  return render(
    <ChildSharedTermsReviewCard
      review={data}
      saving={false}
      error={null}
      onAccept={handlers.onAccept ?? (() => {})}
      onRequestChanges={handlers.onRequestChanges ?? (() => {})}
      onRetry={() => {}}
    />,
  );
}

// ---------------------------------------------------------------------------

describe('你的計畫沒有被改掉', () => {
  it('孩子的目標、做法、第一步都在最上面', () => {
    const { getByTestId, getByText } = renderCard(review());
    expect(getByTestId('child-own-plan')).toBeTruthy();
    expect(getByText('兩週讀完一本書')).toBeTruthy();
    expect(getByText('每天睡前讀 15 分鐘，兩週讀完。')).toBeTruthy();
    expect(getByText('第一步：今晚睡前讀 15 分鐘')).toBeTruthy();
  });

  it('差異只列共同條件，而且兩行都在', () => {
    const { getByText } = renderCard(review());
    expect(getByText('你原本：睡覺前')).toBeTruthy();
    expect(getByText('爸媽提出：晚餐後')).toBeTruthy();
    expect(getByText('你原本：每次約 15 分鐘')).toBeTruthy();
    expect(getByText('爸媽提出：每次約 20 分鐘')).toBeTruthy();
  });

  it('孩子原本沒決定的事寫「還沒決定」，不假裝他說過', () => {
    const { getByText } = renderCard({
      ...review({ cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 2 }),
      sourcePlanVersion: version({ cadence_mode: null, cadence_weekly_frequency: null }),
    });
    expect(getByText('原本：還沒決定')).toBeTruthy();
    expect(getByText('爸媽提出：一週 2 次')).toBeTruthy();
  });
});

describe('兩種狀態', () => {
  it('都說定了 → 「可以，就照這樣開始」', () => {
    const { getByText, queryByTestId } = renderCard(review());
    expect(getByText('可以，就照這樣開始')).toBeTruthy();
    expect(queryByTestId('child-not-starting-note')).toBeNull();
    expect(queryByTestId('child-pending-terms')).toBeNull();
  });

  it('還有沒說完 → 「這些安排可以」，而且明說現在還不會開始', () => {
    const { getByText, getByTestId, queryByText } = renderCard(
      review({ requires_parent_decision: ['reward'] }));
    expect(getByText('這些安排可以')).toBeTruthy();
    expect(getByTestId('child-not-starting-note')).toBeTruthy();
    expect(getByText('・完成後怎麼回饋')).toBeTruthy();
    // 這個狀態下絕對不可以出現「開始」。
    expect(queryByText('可以，就照這樣開始')).toBeNull();
  });

  it('不顯示「開始任務」這四個字', () => {
    for (const data of [review(), review({ requires_parent_decision: ['reward'] })]) {
      const { queryByText } = renderCard(data);
      expect(queryByText('開始任務')).toBeNull();
    }
  });
});

describe('我想再調整', () => {
  it('可以留一句話，也可以不留', () => {
    const said: (string | undefined)[] = [];
    const { getByTestId } = renderCard(review(), {
      onRequestChanges: (reason) => said.push(reason),
    });
    fireEvent.press(getByTestId('child-open-request-changes'));
    fireEvent.changeText(getByTestId('child-request-changes-input'), '我還是想睡前做');
    fireEvent.press(getByTestId('child-request-changes-submit'));
    expect(said).toEqual(['我還是想睡前做']);
  });

  it('這一步不是編輯器 —— 畫面上沒有任何條件輸入框', () => {
    const { getByTestId, queryByTestId } = renderCard(review());
    fireEvent.press(getByTestId('child-open-request-changes'));
    for (const editor of [
      'shared-terms-frequency-input', 'shared-terms-minutes-input',
      'shared-terms-duration-input',
    ]) {
      expect(queryByTestId(editor)).toBeNull();
    }
  });
});

// ── P1-FINAL ────────────────────────────────────────────────────────────────
//
// 路由只看 lineage，所以「現在按不了的 P1 草案」會走到這張卡片而不是
// legacy 那張。按不了的時候要說清楚是誰的事 —— 系統還沒整理完的時候
// 叫他「重新看看就好」，他按幾次都一樣，然後會以為是自己弄壞的。

describe('現在還不能回覆的時候', () => {
  it('系統還沒整理完 —— 講成 GrowBook 自己的事，而且不提任務分類', () => {
    const { getByText, queryByTestId, queryByText } = renderCard(
      review({ requires_parent_decision: ['purpose_category'] }),
    );
    expect(getByText('這份安排 GrowBook 還在整理')).toBeTruthy();
    expect(getByText('整理好之後會再拿給你看，先不用你決定。')).toBeTruthy();
    // 不可以翻成「任務分類還沒選」—— 那等於請孩子當分類器。
    expect(queryByText(/分類/)).toBeNull();
    // 也不可以還留著那顆會失敗的「可以」。
    expect(queryByTestId('child-accept-shared-terms')).toBeNull();
  });

  it('已經開始的計畫不會再問一次要不要開始', () => {
    const data = review();
    // 任務已經建起來、狀態還沒追上的那一瞬間（成立與列表刷新之間）。
    data.proposal = proposal({ task_id: 'task-1' });
    const { getByText, queryByTestId } = renderCard(data);
    expect(getByText('這個計畫已經開始了')).toBeTruthy();
    expect(queryByTestId('child-accept-shared-terms')).toBeNull();
  });
});
