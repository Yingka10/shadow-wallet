import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type {
  ChildProposal,
  ChildProposalPlanVersion,
  ParentProposalCardData,
} from '../../../../../lib/childProposal';
import { ParentColors } from '../../../../../constants/parentTheme';
import { ParentProposalSection } from '../ParentProposalSection';

function proposal(id: string, overrides: Partial<ChildProposal> = {}): ChildProposal {
  return {
    id, family_id: 'family-1', child_id: 'child-1', status: 'proposed',
    child_original_goal: `想法 ${id}`, child_original_motivation: null,
    proposal_source: 'child', cadence_mode: null, cadence_weekly_frequency: null,
    cadence_days: null, preferred_time: null, preferred_time_custom: null,
    estimated_minutes: null, child_reward_preference: 'not_specified', child_note: null,
    current_plan_version_id: null, task_id: null, closed_reason: null, closed_at: null,
    proposed_at: null, activated_at: null, created_at: '2026-08-11T00:00:00Z',
    updated_at: '2026-08-11T00:00:00Z', ...overrides,
  };
}

function plan(proposalId: string, overrides: Partial<ChildProposalPlanVersion> = {}) {
  return {
    id: `version-${proposalId}`, proposal_id: proposalId, authored_by: 'ai',
    plan_title: '兩週閱讀挑戰', plan_summary: '用每週節奏完成一本書',
    purpose_category: 'D', completion_description: '完成一次約定的閱讀時段',
    progress_model: 'weekly_rhythm', next_step: '拿出想讀的書，先閱讀約 15 分鐘',
    cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 4, cadence_days: null,
    preferred_time: null, preferred_time_custom: null, estimated_minutes: 15,
    duration_type: 'long_term', duration_days: 14,
    reward_policy: 'coin_eligible', reward_eligibility: 'allowed',
    reward_policy_version: 'coin-policy-1.0.0', task_policy_version: 'task-taxonomy-2026-07',
    ai_suggested_coin_amount: 10, ...overrides,
  } as ChildProposalPlanVersion;
}

/** P1 child-authored 版本：走 child_planning_plan route，需要完整 lineage。 */
function childPlanVersion(proposalId: string, overrides: Partial<ChildProposalPlanVersion> = {}) {
  return plan(proposalId, {
    authored_by: 'child',
    source_planning_session_id: `session-${proposalId}`,
    planning_schema_version: 1,
    child_confirmed_plan: {
      desiredOutcome: '兩週閱讀挑戰',
      actionPlanSummary: '用每週節奏完成一本書',
      nextAction: { text: '拿出想讀的書，先閱讀約 15 分鐘' },
      progressionKind: 'rhythm',
    },
    requires_parent_decision: [],
    enrichment_status: 'enriched',
    policy_session_coin_reference: 10,
    policy_payout_type: 'per_completion',
    ai_suggested_coin_amount: null,
    ...overrides,
  } as Partial<ChildProposalPlanVersion>);
}

function card(id: string, withPlan = false): ParentProposalCardData {
  const version = withPlan ? plan(id) : null;
  return {
    proposal: proposal(id, { current_plan_version_id: version?.id ?? null }),
    currentPlanVersion: version,
  };
}

const base = {
  childName: '承恩', loading: false, error: null, onRetry: jest.fn(),
  onConfirm: jest.fn(), confirmingProposalId: null,
  confirmError: null, successMessage: null,
  onRevise: jest.fn(), onProposeTerms: jest.fn(), onCloseProposal: jest.fn(),
  actingProposalId: null, actionError: null,
};

describe('ParentProposalSection', () => {
  it('空資料時整個 section 不佔首頁位置', () => {
    render(<ParentProposalSection {...base} proposals={[]} />);
    expect(screen.queryByTestId('parent-proposal-section')).toBeNull();
  });

  it('顯示 loading，讀取失敗時可以重試但不阻斷首頁', () => {
    const onRetry = jest.fn();
    const { rerender } = render(
      <ParentProposalSection {...base} proposals={[]} loading onRetry={onRetry} />,
    );
    expect(screen.getByText('正在看看孩子的新想法…')).toBeTruthy();
    rerender(<ParentProposalSection {...base} proposals={[]} error="讀取失敗" onRetry={onRetry} />);
    fireEvent.press(screen.getByText('再試一次'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('把孩子原話與精簡的 structured plan 分成三個有順序的決策帶，一層卡沒有巢狀卡', () => {
    const item = card('p1', true);
    item.proposal = proposal('p1', {
      current_plan_version_id: item.currentPlanVersion!.id,
      child_original_goal: '我想兩週把這本書讀完',
      child_original_motivation: '因為同學說這本書很好看',
      child_reward_preference: 'hopes_for_coin',
    });
    item.currentPlanVersion = plan('p1', { preferred_time: 'after_dinner' });
    const onConfirm = jest.fn();
    render(<ParentProposalSection {...base} proposals={[item]} onConfirm={onConfirm} />);

    const proposalSurface = screen.getByTestId('parent-proposal-card');
    const childVoiceBand = within(proposalSurface).getByTestId('proposal-child-voice-p1');
    const growBookBand = within(proposalSurface).getByTestId('proposal-plan-p1');
    const decisionBand = within(proposalSurface).getByTestId('proposal-decision-p1');
    expect(proposalSurface.children[0]?.props.testID).toBe(childVoiceBand.props.testID);
    expect(proposalSurface.children[1]?.props.testID).toBe(growBookBand.props.testID);
    expect(proposalSurface.children[2]?.props.testID).toBe(decisionBand.props.testID);

    // A｜孩子的聲音
    expect(screen.getByText('孩子的聲音')).toBeTruthy();
    expect(screen.getByText('我想兩週把這本書讀完')).toBeTruthy();
    expect(screen.getByText('因為同學說這本書很好看')).toBeTruthy();

    // B｜GrowBook 幫忙整理 —— primary compact facts：標題／頻率／投入／時間／下一步／回饋
    expect(screen.getByText('GrowBook 整理')).toBeTruthy();
    expect(screen.getByText('幫你整理成可以開始的版本')).toBeTruthy();
    expect(screen.getByText('兩週閱讀挑戰')).toBeTruthy();
    expect(screen.getByText('一週 4 次')).toBeTruthy();
    expect(screen.getByText('每次約 15 分鐘')).toBeTruthy();
    expect(screen.getByText('晚餐後')).toBeTruthy();
    expect(screen.getByText('拿出想讀的書，先閱讀約 15 分鐘')).toBeTruthy();
    expect(screen.getByText('GrowBook 建議')).toBeTruthy();
    expect(screen.getByText('建議：每次完成 10 成長幣')).toBeTruthy();
    // completion_description／detailed reasoning 不是 primary content
    expect(screen.queryByText('完成一次約定的閱讀時段')).toBeNull();
    expect(screen.queryByText('以每週節奏累積，不會因漏一天重新開始')).toBeNull();
    expect(screen.getByText('為什麼這樣整理？')).toBeTruthy();

    // C｜Decision Zone
    expect(screen.getByText('這樣開始，適合承恩嗎？')).toBeTruthy();
    fireEvent.press(screen.getByText('確認這個計畫'));
    expect(onConfirm).toHaveBeenCalledWith(item);
    expect(screen.queryByText(/核准|批准|審核通過|已核定|家庭約定/)).toBeNull();
  });

  it('展開「為什麼這樣整理？」才看得到完成標準、節奏理由與整理摘要，且各卡獨立展開', () => {
    const first = card('p1', true);
    first.currentPlanVersion = plan('p1', { plan_summary: '第一份整理摘要' });
    const second = card('p2', true);
    second.currentPlanVersion = plan('p2', { plan_summary: '第二份整理摘要' });
    render(<ParentProposalSection {...base} proposals={[first, second]} />);

    expect(screen.queryByText('第一份整理摘要')).toBeNull();
    expect(screen.queryByText('完成一次約定的閱讀時段')).toBeNull();

    const firstToggle = screen.getByLabelText('為什麼這樣整理？「想法 p1」的整理理由');
    expect(screen.getByLabelText('為什麼這樣整理？「想法 p2」的整理理由')).toBeTruthy();
    expect(StyleSheet.flatten(firstToggle.props.style).minHeight).toBeGreaterThanOrEqual(44);
    fireEvent.press(firstToggle);

    expect(screen.getByText('第一份整理摘要')).toBeTruthy();
    expect(screen.getByText('怎樣算完成')).toBeTruthy();
    expect(screen.getByText('完成一次約定的閱讀時段')).toBeTruthy();
    expect(screen.getByText('以每週節奏累積，不會因漏一天重新開始')).toBeTruthy();
    // 第二張卡沒有跟著展開
    expect(screen.queryByText('第二份整理摘要')).toBeNull();

    fireEvent.press(screen.getByText('收合'));
    expect(screen.queryByText('第一份整理摘要')).toBeNull();
  });

  it('同一提案換成新的 plan version 時把整理理由重新收起', () => {
    const initial = card('p1', true);
    initial.currentPlanVersion = plan('p1', { plan_summary: '第一版摘要' });
    const { rerender } = render(<ParentProposalSection {...base} proposals={[initial]} />);
    fireEvent.press(screen.getByText('為什麼這樣整理？'));
    expect(screen.getByText('第一版摘要')).toBeTruthy();

    const replacement: ParentProposalCardData = {
      proposal: proposal('p1', { current_plan_version_id: 'version-p1-2' }),
      currentPlanVersion: plan('p1', { id: 'version-p1-2', plan_summary: '第二版摘要' }),
    };
    rerender(<ParentProposalSection {...base} proposals={[replacement]} />);

    expect(screen.queryByText('第二版摘要')).toBeNull();
    expect(screen.getByText('為什麼這樣整理？')).toBeTruthy();
  });

  it('沒有完整 AI plan 時保留原話但不顯示 confirm CTA 或 fake plan', () => {
    render(<ParentProposalSection {...base} proposals={[card('p1')]} />);
    expect(screen.getByText('想法 p1')).toBeTruthy();
    expect(screen.getByText('GrowBook 還在整理，目前先看看孩子的原始想法')).toBeTruthy();
    expect(screen.queryByText('確認這個計畫')).toBeNull();
    expect(screen.queryByText('GrowBook 整理')).toBeNull();
    expect(screen.queryByText('幫你整理成可以開始的版本')).toBeNull();
    expect(screen.queryByText('這樣開始，適合承恩嗎？')).toBeNull();
  });

  it('confirm loading、success 與 typed error 都使用自然文案', () => {
    const item = card('p1', true);
    const { rerender } = render(
      <ParentProposalSection {...base} proposals={[item]} confirmingProposalId="p1" />,
    );
    expect(screen.getByText('正在建立共同計畫…')).toBeTruthy();
    expect(screen.queryByText('確認這個計畫')).toBeNull();

    rerender(<ParentProposalSection {...base} proposals={[item]} successMessage="已經一起確認好了" />);
    expect(screen.getByText('已經一起確認好了')).toBeTruthy();

    rerender(<ParentProposalSection {...base} proposals={[item]} confirmError="計畫已更新，請重新整理" />);
    expect(screen.getByText('計畫已更新，請重新整理')).toBeTruthy();
  });

  it('最多顯示三張', () => {
    render(<ParentProposalSection {...base} proposals={[
      card('p1'), card('p2'), card('p3'), card('p4'),
    ]} />);
    expect(screen.getAllByTestId('parent-proposal-card')).toHaveLength(3);
    expect(screen.queryByText('想法 p4')).toBeNull();
  });

  it('fresh AI plan 提供確認、想調整一下與現在不適合三條窄路徑', () => {
    const item = card('p1', true);
    render(<ParentProposalSection {...base} proposals={[item]} />);
    expect(screen.getByText('確認這個計畫')).toBeTruthy();
    expect(screen.getByText('想調整一下')).toBeTruthy();
    expect(screen.getByText('現在不適合')).toBeTruthy();
    expect(screen.getByText('這樣開始，適合承恩嗎？')).toBeTruthy();
    fireEvent.press(screen.getByText('想調整一下'));
    expect(screen.getByTestId('proposal-weekly-frequency-stepper')).toBeTruthy();
  });

  it('preferred_time 沒值時完全不 render 這個 fact，不會冒出「還沒決定」', () => {
    const item = card('p1', true);
    item.currentPlanVersion = plan('p1', { preferred_time: null });
    render(<ParentProposalSection {...base} proposals={[item]} />);

    expect(screen.queryByText('適合時間')).toBeNull();
    expect(screen.queryByText('還沒決定')).toBeNull();
  });

  it('三顆決策按鈕視覺權重不同：primary 實心、secondary 有框、tertiary 純文字', () => {
    const item = card('p1', true);
    render(<ParentProposalSection {...base} proposals={[item]} />);

    const primary = screen.getByTestId('proposal-confirm-p1');
    const secondary = screen.getByTestId('proposal-adjust-p1');
    const tertiary = screen.getByTestId('proposal-unsuitable-p1');

    const primaryStyle = StyleSheet.flatten(primary.props.style);
    const secondaryStyle = StyleSheet.flatten(secondary.props.style);
    const tertiaryStyle = StyleSheet.flatten(tertiary.props.style);

    expect(primaryStyle.backgroundColor).toBe(ParentColors.accent);
    expect(secondaryStyle.backgroundColor).not.toBe(ParentColors.accent);
    expect(secondaryStyle.borderWidth).toBeGreaterThan(0);
    expect(tertiaryStyle.borderWidth ?? 0).toBe(0);
    expect(tertiaryStyle.backgroundColor).toBeUndefined();
  });

  it('one-time 計畫仍可直接確認，但不提供無法保留原節奏的調整入口', () => {
    const item = card('p1', true);
    item.currentPlanVersion = plan('p1', {
      cadence_mode: 'one_time', cadence_weekly_frequency: null, cadence_days: null,
      duration_type: 'one_time', duration_days: null,
    });
    render(<ParentProposalSection {...base} proposals={[item]} />);

    expect(screen.getByText('確認這個計畫')).toBeTruthy();
    expect(screen.queryByText('想調整一下')).toBeNull();
    expect(screen.getByText('先完成一次')).toBeTruthy();
  });

  it('parent revision 等孩子時不再顯示 confirm/adjust，也不把舊 summary 當現況', () => {
    const item = card('p1', true);
    item.proposal = proposal('p1', {
      status: 'needs_child_review', current_plan_version_id: item.currentPlanVersion!.id,
    });
    item.currentPlanVersion = plan('p1', {
      authored_by: 'parent', requires_child_review: true,
      plan_summary: '舊文字仍寫一週 4 次', cadence_weekly_frequency: 3,
    });
    render(<ParentProposalSection {...base} proposals={[item]} />);
    expect(screen.getByText('等孩子看看新的安排是不是也想試試看')).toBeTruthy();
    expect(screen.getByText('一週 3 次')).toBeTruthy();
    expect(screen.queryByText('舊文字仍寫一週 4 次')).toBeNull();
    expect(screen.queryByText('確認這個計畫')).toBeNull();
    expect(screen.queryByText('想調整一下')).toBeNull();
    expect(screen.queryByText('這樣開始，適合承恩嗎？')).toBeNull();
  });

  it('孩子想再聊聊時可重新調整，並把 typed action error 留在卡區', () => {
    const item = card('p1', true);
    item.currentPlanVersion = plan('p1', { authored_by: 'parent', requires_child_review: true });
    render(<ParentProposalSection {...base} proposals={[item]} actionError="計畫已更新，請重新整理" />);
    expect(screen.getAllByText('孩子想再一起聊聊')).toHaveLength(2);
    expect(screen.getByText('要再一起調整哪裡？')).toBeTruthy();
    expect(screen.queryByText('這樣開始，適合承恩嗎？')).toBeNull();
    expect(screen.getByText('想調整一下')).toBeTruthy();
    expect(screen.getByText('計畫已更新，請重新整理')).toBeTruthy();
  });

  it('現在不適合 sheet 將 reason 與 exact card 傳給 callback', () => {
    const item = card('p1', true);
    const onCloseProposal = jest.fn();
    render(<ParentProposalSection {...base} proposals={[item]} onCloseProposal={onCloseProposal} />);
    fireEvent.press(screen.getByText('現在不適合'));
    fireEvent.press(screen.getByText('這個做法現在可能不太適合'));
    fireEvent.press(screen.getByText('先把這個想法收好'));
    expect(onCloseProposal).toHaveBeenCalledWith(item, '這個做法現在可能不太適合');
  });

  // ── P1：child-authored plan（child_planning_plan route）───────────────────
  describe('P1 child planning plan', () => {
    it('ready 時 CTA 是「確認這份約定」，B 段 eyebrow 確認前仍是「GrowBook 整理」，不是「家庭約定」', () => {
      const item = card('p1', true);
      item.currentPlanVersion = childPlanVersion('p1');
      const onConfirm = jest.fn();
      render(<ParentProposalSection {...base} proposals={[item]} onConfirm={onConfirm} />);

      expect(screen.getByText('GrowBook 整理')).toBeTruthy();
      expect(screen.getByText('幫你整理成可以開始的版本')).toBeTruthy();
      expect(screen.queryByText('家庭約定')).toBeNull();
      expect(screen.getByText('確認這份約定')).toBeTruthy();
      // 右上角狀態 pill：低權重的「孩子已確認」，不是完整原句「孩子已經想好怎麼做」。
      expect(screen.getByText('孩子已確認')).toBeTruthy();
      expect(screen.queryByText('孩子已經想好怎麼做')).toBeNull();
      fireEvent.press(screen.getByText('確認這份約定'));
      expect(onConfirm).toHaveBeenCalledWith(item);
    });

    it('還有共同條件沒決定時不顯示假的確認鍵，改列出還缺什麼，且不叫「家庭約定」', () => {
      const item = card('p1', true);
      item.currentPlanVersion = childPlanVersion('p1', {
        requires_parent_decision: ['cadence', 'reward'],
      });
      render(<ParentProposalSection {...base} proposals={[item]} />);

      expect(screen.queryByText('確認這份約定')).toBeNull();
      expect(screen.queryByText('家庭約定')).toBeNull();
      expect(screen.getByText('還有幾件事要一起說定')).toBeTruthy();
      expect(screen.getByText(/還要一起說定/)).toBeTruthy();
      expect(screen.getByText(/進行頻率/)).toBeTruthy();
      expect(screen.getByText(/怎麼給回饋/)).toBeTruthy();
    });

    it('「想調整一下」在 P1 路徑上開的是共同條件表單，不是 P0 的調整表單', () => {
      const item = card('p1', true);
      item.currentPlanVersion = childPlanVersion('p1', {
        requires_parent_decision: ['cadence'],
      });
      render(<ParentProposalSection {...base} proposals={[item]} />);

      fireEvent.press(screen.getByText('想調整一下'));
      expect(screen.queryByTestId('proposal-weekly-frequency-stepper')).toBeNull();
    });
  });
});
