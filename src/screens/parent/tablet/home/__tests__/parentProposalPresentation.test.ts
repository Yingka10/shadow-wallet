import type {
  ChildProposal,
  ChildProposalPlanVersion,
  ParentProposalCardData,
} from '../../../../../lib/childProposal';
import {
  formatProposalCadence,
  presentParentProposal,
} from '../parentProposalPresentation';

function proposal(overrides: Partial<ChildProposal> = {}): ChildProposal {
  return {
    id: 'proposal-1', family_id: 'family-1', child_id: 'child-1', status: 'proposed',
    child_original_goal: '我想兩週把這本書讀完',
    child_original_motivation: '因為同學說這本書很好看',
    proposal_source: 'child', cadence_mode: null, cadence_weekly_frequency: null,
    cadence_days: null, preferred_time: null, preferred_time_custom: null,
    estimated_minutes: null, child_reward_preference: 'not_specified', child_note: null,
    current_plan_version_id: null, task_id: null, closed_reason: null, closed_at: null,
    proposed_at: '2026-08-11T02:00:00Z', activated_at: null,
    created_at: '2026-08-11T02:00:00Z', updated_at: '2026-08-11T02:00:00Z',
    ...overrides,
  };
}

function plan(overrides: Partial<ChildProposalPlanVersion> = {}): ChildProposalPlanVersion {
  return {
    id: 'version-1', proposal_id: 'proposal-1', authored_by: 'ai',
    plan_title: '兩週閱讀挑戰', plan_summary: '用每週節奏累積閱讀投入',
    purpose_category: 'D', completion_description: '完成一次約定的閱讀時段',
    progress_model: 'weekly_rhythm', next_step: '拿出一本想讀的書，先閱讀約 15 分鐘',
    cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 4, cadence_days: null,
    preferred_time: null, preferred_time_custom: null, estimated_minutes: 15,
    duration_type: 'long_term', duration_days: 14,
    reward_policy: 'coin_eligible', reward_eligibility: 'allowed',
    reward_policy_version: 'coin-policy-1.0.0', task_policy_version: 'task-taxonomy-2026-07',
    ai_suggested_coin_amount: 10,
    ...overrides,
  } as ChildProposalPlanVersion;
}

function card(version: ChildProposalPlanVersion | null = null): ParentProposalCardData {
  const item = proposal({ current_plan_version_id: version?.id ?? null });
  return { proposal: item, currentPlanVersion: version };
}

describe('formatProposalCadence', () => {
  it('weekly_frequency 顯示孩子實際填的每週次數', () => {
    expect(formatProposalCadence(proposal({
      cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 4,
    }))).toBe('一週 4 次');
  });

  it('fixed_days 依週一到週日排序、去重並忽略無效星期', () => {
    expect(formatProposalCadence(proposal({
      cadence_mode: 'fixed_days', cadence_days: [5, 1, 3, 1, 8],
    }))).toBe('每週一、週三、週五');
  });

  it('one_time 使用自然且不宣稱已完成的語言', () => {
    expect(formatProposalCadence(proposal({ cadence_mode: 'one_time' }))).toBe('想先試一次');
  });

  it('cadence 未決定或資料形狀不足時誠實 fallback', () => {
    expect(formatProposalCadence(proposal())).toBe('還沒決定，想一起討論');
    expect(formatProposalCadence(proposal({
      cadence_mode: 'weekly_frequency', cadence_weekly_frequency: null,
    }))).toBe('還沒決定，想一起討論');
    expect(formatProposalCadence(proposal({ cadence_mode: 'fixed_days', cadence_days: [] })))
      .toBe('還沒決定，想一起討論');
  });
});

describe('presentParentProposal', () => {
  it('保留孩子原文與動機，不需要 AI plan version', () => {
    expect(presentParentProposal(card(), '承恩')).toEqual(expect.objectContaining({
      id: 'proposal-1',
      title: '承恩有一個新的挑戰想法',
      goal: '我想兩週把這本書讀完',
      motivation: '因為同學說這本書很好看',
      statusLabel: '等你們一起看看',
    }));
  });

  it('空白 motivation 不製造空欄', () => {
    const item = card();
    item.proposal = proposal({ child_original_motivation: '   ' });
    expect(presentParentProposal(item, '承恩').motivation)
      .toBeNull();
  });

  it('hopes_for_coin 只描述孩子的希望，不映射成正式 policy 或核定幣值', () => {
    const item = card();
    item.proposal = proposal({ child_reward_preference: 'hopes_for_coin' });
    const result = presentParentProposal(item, '承恩');

    expect(result.rewardHope).toBe('希望如果適合，可以有成長幣鼓勵');
    expect(JSON.stringify(result)).not.toContain('coin_eligible');
    expect(JSON.stringify(result)).not.toContain('已核定');
  });

  it('完整 real plan 顯示 structured fields、weekly rhythm 與 GrowBook 建議', () => {
    const result = presentParentProposal(card(plan()), '承恩');
    expect(result).toMatchObject({
      planTitle: '兩週閱讀挑戰',
      planSummary: '用每週節奏累積閱讀投入',
      planCadence: '一週 4 次',
      estimatedTime: '每次約 15 分鐘',
      completionDescription: '完成一次約定的閱讀時段',
      nextStep: '拿出一本想讀的書，先閱讀約 15 分鐘',
      rhythmCopy: '以每週節奏累積，不會因漏一天重新開始',
      rewardSuggestion: '建議：每次完成 10 成長幣',
      rewardSuggestionLabel: 'GrowBook 建議',
      canConfirm: true,
    });
    expect(JSON.stringify(result)).not.toContain('已核定');
  });

  it('沒有 real current plan 時只顯示原始想法且沒有 CTA', () => {
    expect(presentParentProposal(card(), '承恩')).toMatchObject({
      canConfirm: false,
      waitingMessage: 'GrowBook 還在整理，目前先看看孩子的原始想法',
      planTitle: null,
      rewardSuggestion: null,
    });
  });

  it('不完整或非 AI current version 不顯示可執行 confirm', () => {
    expect(presentParentProposal(card(plan({ next_step: null })), '承恩').canConfirm).toBe(false);
    expect(presentParentProposal(card(plan({ authored_by: 'parent' })), '承恩').canConfirm)
      .toBe(false);
  });

  it('fresh AI proposal 是可確認／可調整狀態', () => {
    expect(presentParentProposal(card(plan()), '承恩')).toMatchObject({
      state: 'fresh_ai',
      statusLabel: 'GrowBook 已經整理好',
      canConfirm: true,
    });
  });

  it('needs review 顯示等孩子看看，不提供 direct confirm', () => {
    const parentPlan = plan({
      authored_by: 'parent', requires_child_review: true,
      parent_confirmed_at: '2026-08-11T01:00:00Z',
      cadence_weekly_frequency: 3,
    });
    const item = card(parentPlan);
    item.proposal = proposal({
      status: 'needs_child_review', current_plan_version_id: parentPlan.id,
    });
    expect(presentParentProposal(item, '承恩')).toMatchObject({
      state: 'waiting_child',
      statusLabel: '等孩子看看',
      planCadence: '一週 3 次',
      canConfirm: false,
      waitingMessage: '等孩子看看新的安排是不是也想試試看',
    });
  });

  it('child revisit 顯示想再聊，不把 parent version 誤當 direct confirm', () => {
    const parentPlan = plan({
      authored_by: 'parent', requires_child_review: true,
      parent_confirmed_at: '2026-08-11T01:00:00Z', cadence_weekly_frequency: 3,
    });
    const item = card(parentPlan);
    item.proposal = proposal({ status: 'proposed', current_plan_version_id: parentPlan.id });
    expect(presentParentProposal(item, '承恩')).toMatchObject({
      state: 'child_revisit',
      statusLabel: '孩子想再一起聊聊',
      canConfirm: false,
      waitingMessage: '孩子想再一起聊聊',
    });
  });

  // ── P1-FINAL ────────────────────────────────────────────────────────────
  //
  // 協商第二輪：孩子看過共同條件之後把提案送回 proposed。他可能說的是
  // 「這些可以，只是還有事沒說定」，也可能是「我想再調整」——
  // 兩者留在同一個版本上，版本資料裡分不出來。

  function sharedTermDraftCard(latestChildAction?: 'accepted_shared_terms_pending_more') {
    // A4B1 的草案：家長送出、等孩子看，但**沒有** parent_confirmed_at ——
    // 這一步沒有任何東西被確認，而那正是它與 P0 調整版唯一穩定的差別。
    const draft = plan({
      id: 'version-parent-2', authored_by: 'parent', requires_child_review: true,
      adopted_from_plan_version_id: 'version-child-1',
      parent_confirmed_at: null,
      requires_parent_decision: ['reward'],
      cadence_weekly_frequency: 3,
    });
    const item = card(draft);
    item.proposal = proposal({ status: 'proposed', current_plan_version_id: draft.id });
    if (latestChildAction) item.latestChildAction = latestChildAction;
    return item;
  }

  it('孩子說「這些可以，還有事沒說定」不顯示成「他想再聊聊」', () => {
    const view = presentParentProposal(
      sharedTermDraftCard('accepted_shared_terms_pending_more'), '承恩',
    );
    expect(view).toMatchObject({
      state: 'child_agreed_pending_terms',
      statusLabel: '孩子說這些可以',
      waitingMessage: '他說這些安排可以，還有幾件說定之後就會開始',
      proposeTermsLabel: '把還沒說定的補上',
    });
    expect(JSON.stringify(view)).not.toContain('孩子想再一起聊聊');
  });

  it('沒有那筆事件時維持原本的「想再聊聊」，不猜他同意了', () => {
    expect(presentParentProposal(sharedTermDraftCard(), '承恩')).toMatchObject({
      state: 'child_revisit',
      statusLabel: '孩子想再一起聊聊',
    });
  });

  it('共同條件草案不給 P0 的「再調整一下」', () => {
    // 走過去的話：未決條件被清空、policy evidence 掉了、孩子自己寫的
    // 完成標準被改掉 —— 那份協商從此走不到 active。
    expect(presentParentProposal(sharedTermDraftCard(), '承恩').canRevise).toBe(false);
    expect(presentParentProposal(
      sharedTermDraftCard('accepted_shared_terms_pending_more'), '承恩',
    ).canRevise).toBe(false);
  });

  it('P0 的家長調整版仍然可以再調整 —— 那條路一個字都沒變', () => {
    const parentPlan = plan({
      authored_by: 'parent', requires_child_review: true,
      parent_confirmed_at: '2026-08-11T01:00:00Z', cadence_weekly_frequency: 3,
    });
    const item = card(parentPlan);
    item.proposal = proposal({ status: 'proposed', current_plan_version_id: parentPlan.id });
    expect(presentParentProposal(item, '承恩').canRevise).toBe(true);
  });

  it('parent revision 的 copied summary 不再作為目前安排 authority', () => {
    const parentPlan = plan({
      authored_by: 'parent', requires_child_review: true,
      parent_confirmed_at: '2026-08-11T01:00:00Z',
      plan_summary: '預計一週安排 4 天閱讀', cadence_weekly_frequency: 3,
    });
    const item = card(parentPlan);
    item.proposal = proposal({
      status: 'needs_child_review', current_plan_version_id: parentPlan.id,
    });
    const view = presentParentProposal(item, '承恩');
    expect(view.planSummary).toBeNull();
    expect(view.planCadence).toBe('一週 3 次');
    expect(JSON.stringify(view)).not.toContain('一週安排 4 天');
  });
});
