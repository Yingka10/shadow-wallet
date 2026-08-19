// P1-A4B1 — 家長提出家庭共同條件（App 端）
//
// ─────────────────────────────────────────────────────────────────────────────
// §21 的 canonical cases 都在這裡：
//
//   A  原本沒決定節奏 → 家長提出每週 2 次、每次 20 分鐘、先試 4 週
//   B  家長改掉孩子已經講過的安排 → diff 兩行都要在
//   C  每次時間改了 → 幣值要用**現在的**規則重算
//   D  偷偷改 nextAction → 型別上就寫不出來
//   E  purpose_category 還沒整理完 → 不讓家長分類
//   F  同一組條件重送 → 只會有一份草案
// ─────────────────────────────────────────────────────────────────────────────

import { TASK_POLICY_VERSION } from '../../../screens/parent/tablet/taskDrawer/taskCatalog';
import { evaluateTaskReward } from '../../../screens/parent/tablet/taskDrawer/taskReward';
import { planEvaluationCommand } from '../../childProposal/directConfirm';
import type {
  ChildProposal,
  ChildProposalPlanVersion,
  ParentProposalCardData,
} from '../../childProposal/types';
import {
  buildChildPlanningTermsCommand,
  childPlanningNegotiability,
  familyNegotiableTerms,
  freshRewardEvaluation,
  hasMaterialChange,
  isChildPlanningNegotiable,
  isParentSharedTermDraft,
  projectSharedTerms,
  sharedTermChanges,
  sharedTermVersionChanges,
  systemUnresolvedTerms,
} from '../sharedTerms';
import type { ChildPlanningSharedTerms } from '../sharedTerms';

const AGE_GROUP = '6-9';

const CHILD_CONFIRMED_PLAN = {
  desiredOutcome: '兩週讀完一本書',
  actionPlanSummary: '每天睡前讀 15 分鐘，兩週讀完。',
  nextAction: { text: '今晚睡前讀 15 分鐘', source: 'child_stated' },
  progressionKind: 'rhythm',
};

function proposal(overrides: Partial<ChildProposal> = {}): ChildProposal {
  return {
    id: 'proposal-1', family_id: 'family-1', child_id: 'child-1', status: 'proposed',
    child_original_goal: '我想兩週讀完一本書', child_original_motivation: null,
    proposal_source: 'child', cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 5,
    cadence_days: null, preferred_time: 'before_bed', preferred_time_custom: null,
    estimated_minutes: null, child_reward_preference: 'hopes_for_coin', child_note: null,
    current_plan_version_id: 'version-child', task_id: null,
    closed_reason: null, closed_at: null, proposed_at: '2026-08-15T00:00:00Z',
    activated_at: null, created_at: '2026-08-15T00:00:00Z', updated_at: '2026-08-15T00:00:00Z',
    ...overrides,
  } as ChildProposal;
}

function rawVersion(): ChildProposalPlanVersion {
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
    reward_policy_version: 'coin-policy@test', task_policy_version: TASK_POLICY_VERSION,
    policy_session_coin_reference: null, policy_payout_type: 'per_completion',
    ai_snapshot: null, ai_model: null, ai_request_id: null,
    adopted_from_plan_version_id: null, ai_suggested_coin_amount: null,
    source_planning_session_id: 'session-1', planning_schema_version: 1,
    child_confirmed_plan: CHILD_CONFIRMED_PLAN,
    requires_parent_decision: [], enrichment_status: 'enriched',
    confirmed_reward_policy: null, confirmed_coin_amount: null, confirmed_payout_basis: null,
    confirmed_claim_period: null, confirmed_max_claims_per_period: null,
    confirmed_reward_policy_version: null, confirmed_task_policy_version: null,
    confirmed_source_task_id: null, confirmed_by_user_id: null, confirmed_at: null,
    requires_child_review: false, child_accepted_at: null, parent_confirmed_at: null,
    effective_at: null, superseded_at: null, created_at: '2026-08-15T00:00:00Z',
  };
}

/** 這份 fixture 在目前政策下的判定 —— 硬寫數字會變成在測 fixture。 */
const BASELINE = evaluateTaskReward({
  command: planEvaluationCommand({ proposal: proposal(), currentPlanVersion: rawVersion() }),
  childAgeGroup: AGE_GROUP,
});
const POLICY_VERSION = BASELINE.rewardPolicyVersion;
const SESSION_COINS = BASELINE.rewardPolicy === 'coin_eligible' && BASELINE.coin
  ? BASELINE.coin.suggestedAmount
  : 0;

function version(overrides: Partial<ChildProposalPlanVersion> = {}): ChildProposalPlanVersion {
  return {
    ...rawVersion(),
    reward_policy_version: POLICY_VERSION,
    policy_session_coin_reference: SESSION_COINS,
    ...overrides,
  };
}

function card(
  planOverrides: Partial<ChildProposalPlanVersion> = {},
  proposalOverrides: Partial<ChildProposal> = {},
): ParentProposalCardData {
  return { proposal: proposal(proposalOverrides), currentPlanVersion: version(planOverrides) };
}

// ---------------------------------------------------------------------------

describe('1. 可協商條件 vs 系統還沒整理完', () => {
  it('cadence / session_size / duration / reward 是家庭的事', () => {
    const plan = version({
      requires_parent_decision: ['cadence', 'session_size', 'duration', 'reward'],
    });
    expect(familyNegotiableTerms(plan))
      .toEqual(['cadence', 'session_size', 'duration', 'reward']);
    expect(systemUnresolvedTerms(plan)).toEqual([]);
  });

  it('purpose_category 不是家長偏好 —— 不讓他選 A/B/C/D（§21 E）', () => {
    // 那個選擇會直接決定孩子拿不拿得到幣。家長不是分類器。
    const blocked = card({ requires_parent_decision: ['purpose_category'] });
    const negotiability = childPlanningNegotiability(blocked);
    expect(negotiability.ok).toBe(false);
    expect(negotiability.ok === false && negotiability.block).toBe('enrichment_required');

    const built = buildChildPlanningTermsCommand(blocked, { sessionMinutes: 20 }, AGE_GROUP);
    expect(built.ok === false && built.reason).toBe('ENRICHMENT_REQUIRED');
  });

  it('purpose_category 混在其他未決條件裡也一樣擋住', () => {
    const blocked = card({ requires_parent_decision: ['cadence', 'purpose_category'] });
    expect(isChildPlanningNegotiable(blocked)).toBe(false);
  });

  it('duration_type 沒判定出來時也不請家長猜', () => {
    // audit 結論：child_confirmed_plan 裡沒有任何東西可以 deterministic
    // 得出 one_time / recurring / long_term。
    const blocked = card({ duration_type: null });
    const negotiability = childPlanningNegotiability(blocked);
    expect(negotiability.ok === false && negotiability.block).toBe('enrichment_required');
  });
});

describe('2. 誰可以走這條路徑', () => {
  it('孩子自己規劃的計畫可以', () => {
    expect(isChildPlanningNegotiable(card())).toBe(true);
  });

  it('上一份家長草案也可以（來回協商）', () => {
    const second = card({
      id: 'version-parent', authored_by: 'parent', adopted_from_plan_version_id: 'version-child',
      source_planning_session_id: null, planning_schema_version: null,
      child_confirmed_plan: null, enrichment_status: null,
    }, { current_plan_version_id: 'version-parent' });
    expect(isChildPlanningNegotiable(second)).toBe(true);
  });

  it('legacy AI 版本不走這一條', () => {
    const legacy = card({
      authored_by: 'ai', source_planning_session_id: null, planning_schema_version: null,
      child_confirmed_plan: null, enrichment_status: null,
    });
    const negotiability = childPlanningNegotiability(legacy);
    expect(negotiability.ok === false && negotiability.block).toBe('not_child_planning_plan');
  });

  it('已經有任務的提案不走這一步', () => {
    const active = card({}, { task_id: 'task-1', status: 'active' });
    expect(childPlanningNegotiability(active).ok).toBe(false);
  });

  // ── P1-FINAL ──────────────────────────────────────────────────────────
  //
  // 家長的共同條件草案與 P0 的家長調整版長得幾乎一樣：都是
  // authored_by='parent'、都 requires_child_review、都帶 adopted_from。
  // 唯一穩定的差別是 parent_confirmed_at —— 這一步沒有任何東西被確認。
  //
  // 分不出來的話，P0 的「再調整一下」會把未決條件與 policy evidence
  // 一起丟掉，還能改到孩子自己寫的完成標準。

  it('家長的共同條件草案認得出來', () => {
    expect(isParentSharedTermDraft(version({
      authored_by: 'parent', adopted_from_plan_version_id: 'version-child',
      requires_child_review: true, parent_confirmed_at: null,
    }))).toBe(true);
  });

  it('P0 的家長調整版不是共同條件草案', () => {
    expect(isParentSharedTermDraft(version({
      authored_by: 'parent', adopted_from_plan_version_id: 'version-ai',
      requires_child_review: true, parent_confirmed_at: '2026-08-14T01:00:00Z',
    }))).toBe(false);
  });

  it('孩子自己那一版也不是 —— 它不是任何人的草案', () => {
    expect(isParentSharedTermDraft(version())).toBe(false);
    expect(isParentSharedTermDraft(null)).toBe(false);
  });
});

describe('3. 家長提出條件（§21 A）', () => {
  const pendingCard = card({
    cadence_mode: null, cadence_weekly_frequency: null, progress_model: null,
    estimated_minutes: null, duration_days: null,
    requires_parent_decision: ['cadence', 'session_size', 'duration'],
  });

  const terms: ChildPlanningSharedTerms = {
    cadenceMode: 'weekly_frequency', cadenceWeeklyFrequency: 2,
    sessionMinutes: 20, durationDays: 28,
  };

  it('命令只帶共同條件與那組條件下的政策判定', () => {
    const built = buildChildPlanningTermsCommand(pendingCard, terms, AGE_GROUP);
    expect(built.ok).toBe(true);
    if (built.ok !== true) return;
    expect(Object.keys(built.command).sort()).toEqual([
      'expectedPlanVersionId', 'proposalId', 'rewardEvaluation', 'schemaVersion', 'sharedTerms',
    ].sort());
    expect(built.command.sharedTerms).toEqual(terms);
    // rewardEvaluation 是規則引擎對這組條件的判定，不是家長輸入的欄位。
    expect(built.command.rewardEvaluation?.payoutType).toBe('per_completion');
    expect(built.command.rewardEvaluation?.eligibility).toBe('allowed');
  });

  it('孩子的計畫一個字都沒有進命令裡（§21 D）', () => {
    const built = buildChildPlanningTermsCommand(pendingCard, terms, AGE_GROUP);
    const serialized = JSON.stringify(built);
    expect(serialized).not.toContain('兩週讀完一本書');
    expect(serialized).not.toContain('今晚睡前讀 15 分鐘');
    for (const forbidden of [
      'desiredOutcome', 'actionPlanSummary', 'nextAction', 'nextStep',
      'progressionKind', 'phases', 'planTitle',
    ]) {
      expect({ forbidden, present: serialized.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });

  it('沒提出的條件不會被動到', () => {
    const next = projectSharedTerms(pendingCard.currentPlanVersion!, { sessionMinutes: 20 });
    expect(next.cadence_mode).toBeNull();
    expect(next.preferred_time).toBe('before_bed');
    expect(next.estimated_minutes).toBe(20);
  });

  it('指定星期的話不能同時帶次數', () => {
    const built = buildChildPlanningTermsCommand(pendingCard, {
      cadenceMode: 'fixed_days', cadenceDays: [1, 3], cadenceWeeklyFrequency: 2,
    }, AGE_GROUP);
    expect(built.ok === false && built.reason).toBe('CADENCE_INVALID');
  });

  it('每次多久有合理範圍', () => {
    expect(buildChildPlanningTermsCommand(pendingCard, { sessionMinutes: 3 }, AGE_GROUP).ok)
      .toBe(false);
    expect(buildChildPlanningTermsCommand(pendingCard, { sessionMinutes: 300 }, AGE_GROUP).ok)
      .toBe(false);
  });

  it('先試多久只對長期計畫有意義 —— 不能拿它改掉執行期間', () => {
    const oneTime = card({ duration_type: 'one_time', duration_days: null });
    const built = buildChildPlanningTermsCommand(oneTime, { durationDays: 30 }, AGE_GROUP);
    expect(built.ok === false && built.reason).toBe('DURATION_NOT_NEGOTIABLE');
  });
});

describe('4. 改掉孩子已經講過的安排（§21 B）', () => {
  it('diff 兩行都在：孩子原本 / 你提出', () => {
    const changes = sharedTermChanges(version(), {
      preferredTime: 'after_dinner', sessionMinutes: 20,
    });
    expect(changes).toEqual([
      { label: '什麼時候做', before: '睡覺前', after: '晚餐後' },
      { label: '每次大約做多久', before: '每次約 15 分鐘', after: '每次約 20 分鐘' },
    ]);
  });

  it('孩子沒講過的條件 before 是 null，不假裝他講過', () => {
    const changes = sharedTermChanges(
      version({ cadence_mode: null, cadence_weekly_frequency: null }),
      { cadenceMode: 'weekly_frequency', cadenceWeeklyFrequency: 2 },
    );
    expect(changes).toEqual([{ label: '進行頻率', before: null, after: '一週 2 次' }]);
  });

  it('沒有實質改變就不該送出（§15）', () => {
    expect(hasMaterialChange(version(), {
      cadenceMode: 'weekly_frequency', cadenceWeeklyFrequency: 5,
      preferredTime: 'before_bed', sessionMinutes: 15, durationDays: 14,
    })).toBe(false);

    const built = buildChildPlanningTermsCommand(card(), { sessionMinutes: 15 }, AGE_GROUP);
    expect(built.ok === false && built.reason).toBe('NO_MATERIAL_CHANGE');
  });
});

describe('5. reward 重新評估（§21 C）', () => {
  it('每次時間改了，幣值用現在的規則重算 —— 不是抄來源那個數字', () => {
    const longer = freshRewardEvaluation(card(), { sessionMinutes: 45 }, AGE_GROUP);
    const source = version();
    expect(longer).not.toBeNull();
    if (longer === null) return;

    // 走的是既有 evaluator：與直接對投影後的計畫算一次完全一樣。
    const expected = evaluateTaskReward({
      command: planEvaluationCommand({
        proposal: proposal(),
        currentPlanVersion: projectSharedTerms(source, { sessionMinutes: 45 }),
      }),
      childAgeGroup: AGE_GROUP,
    });
    expect(expected.rewardPolicy === 'coin_eligible' && expected.coin?.suggestedAmount)
      .toBe(longer.sessionCoinReference);
    expect(longer.payoutType).toBe('per_completion');
  });

  it('條件沒動到定價時，重算的結果就是來源那個數字', () => {
    const same = freshRewardEvaluation(card(), { preferredTime: 'after_dinner' }, AGE_GROUP);
    expect(same?.sessionCoinReference).toBe(SESSION_COINS);
  });

  it('家長選「不給成長幣」時不帶任何幣值判定', () => {
    expect(freshRewardEvaluation(card(), { rewardChoice: 'no_coin' }, AGE_GROUP)).toBeNull();

    const built = buildChildPlanningTermsCommand(card(), {
      rewardChoice: 'no_coin',
    }, AGE_GROUP);
    expect(built.ok).toBe(true);
    expect(built.ok === true && built.command.rewardEvaluation).toBeUndefined();
  });

  it('不發幣的計畫不會被升級成發幣', () => {
    const progressOnly = card({
      reward_policy: 'progress_only', policy_session_coin_reference: null,
      policy_payout_type: null,
    });
    expect(freshRewardEvaluation(progressOnly, { sessionMinutes: 30 }, AGE_GROUP)).toBeNull();
  });

  it('來源沒有結算語意時算不出判定 —— 不猜一個', () => {
    const noPayout = card({ policy_payout_type: null, policy_session_coin_reference: null });
    expect(freshRewardEvaluation(noPayout, { preferredTime: 'after_dinner' }, AGE_GROUP))
      .toBeNull();
  });

  it('reward 還沒說定的計畫，家長仍然可以只補節奏', () => {
    // 要求他先解決幣值才能送出，等於把一件系統還沒算出來的事推給他。
    const pendingReward = card({
      policy_session_coin_reference: null, policy_payout_type: null,
      requires_parent_decision: ['cadence', 'reward'],
      cadence_mode: null, cadence_weekly_frequency: null, progress_model: null,
    });
    const built = buildChildPlanningTermsCommand(pendingReward, {
      cadenceMode: 'weekly_frequency', cadenceWeeklyFrequency: 3,
    }, AGE_GROUP);
    expect(built.ok).toBe(true);
    expect(built.ok === true && built.command.rewardEvaluation).toBeUndefined();
  });

  it('命令裡永遠沒有家長輸入的金額', () => {
    const built = buildChildPlanningTermsCommand(card(), { sessionMinutes: 45 }, AGE_GROUP);
    const serialized = JSON.stringify(built);
    for (const forbidden of ['coinAmount', 'finalAmount', 'confirmedCoinAmount']) {
      expect({ forbidden, present: serialized.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });
});

// ── P1-REWARD-FIX ───────────────────────────────────────────────────────────
//
// 這一行是家庭真正同意的那句話。孩子按下「可以」的時候同意的就是它，
// 所以它必須說得出**一次完成會發生什麼** —— 而且要跟錢包實際行為一致。
//
// 修正之前寫的是「完成一次給成長幣」，任務卻是 per_period（一週做滿三次
// 才給一次的錢）。差三倍，而畫面上從來沒有出現過「每週達標」四個字。

describe('7. 回饋方式講的是一次完成會發生什麼', () => {
  it('可發幣的計畫寫得出金額，而且說的是「每完成一次」', () => {
    const source = version({ reward_policy: 'progress_only', policy_session_coin_reference: null });
    const next = version({ reward_policy: 'coin_eligible', policy_session_coin_reference: 8 });
    const change = sharedTermVersionChanges(source, next)
      .find((item) => item.label === '怎麼給回饋');

    expect(change?.after).toBe('每完成一次，+8 成長幣');
  });

  it('沒有正式幣值錨點時不編一個數字出來', () => {
    const source = version({ reward_policy: 'progress_only', policy_session_coin_reference: null });
    const next = version({ reward_policy: 'coin_eligible', policy_session_coin_reference: null });
    const change = sharedTermVersionChanges(source, next)
      .find((item) => item.label === '怎麼給回饋');

    expect(change?.after).toBe('每完成一次就有成長幣');
  });

  it('永遠不出現「每週達標」—— 那是被推翻掉的舊語意', () => {
    const combos: ChildProposalPlanVersion[] = [
      version({ reward_policy: 'coin_eligible', policy_session_coin_reference: 8 }),
      version({ reward_policy: 'coin_eligible', policy_session_coin_reference: null }),
      version({ reward_policy: 'progress_only', policy_session_coin_reference: null }),
    ];
    for (const next of combos) {
      const text = JSON.stringify(sharedTermVersionChanges(version({
        reward_policy: 'record_only', policy_session_coin_reference: null,
      }), next));
      for (const forbidden of ['每週達標', '達標', '每週給', '一週給']) {
        expect(text).not.toContain(forbidden);
      }
    }
  });
});
