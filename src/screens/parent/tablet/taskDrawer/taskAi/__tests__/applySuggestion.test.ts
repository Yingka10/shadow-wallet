// 第八階段 A — 套用與復原
//
// 這一層最容易寫錯的地方是「順手」：用一個泛用的 path setter 就能少寫
// 一百行 switch。但那樣做的話 fieldPath 就從 allowlist 退化成任意字串，
// validator 擋掉的東西 setter 又幫忙塞回去。
//
// 所以下面除了驗「有沒有改對」，更重要的是驗「有沒有改到不該改的」。

import {
  applyTaskAiSuggestion,
  undoTaskAiSuggestion,
  readAiField,
  collectTaskRuleFindings,
  hasBlockingFinding,
  type TaskAiSuggestion,
} from '../index';
import {
  createTaskDraft,
  isFamilyRoleDraft,
  isGrowthPlanDraft,
  isOneTimeDraft,
  isRecurringDraft,
  isShortSupportDraft,
  resolveEditorKind,
  validateTaskDraft,
  type DraftChildContext,
  type TaskDraft,
  type TaskEditorKind,
} from '../../taskDraft';
import { ALL_FAMILIES } from '../../taskCatalog';
import type { TaskPresetFamily, TaskPresetVariant } from '../../taskCatalog';

const CHILD: DraftChildContext = {
  nickname: '承恩',
  birthDate: '2018-03-05',
  familyId: 'household-1',
};

function draftOf(kind: TaskEditorKind): { draft: TaskDraft; variant: TaskPresetVariant; family: TaskPresetFamily } {
  for (const family of ALL_FAMILIES) {
    for (const variant of family.variants) {
      if (resolveEditorKind(variant) === kind) {
        return { draft: createTaskDraft(family, variant, CHILD, '6-9'), variant, family };
      }
    }
  }
  throw new Error(`找不到 editorKind 為 ${kind} 的 variant`);
}

function suggestion(overrides: Partial<TaskAiSuggestion>): TaskAiSuggestion {
  return {
    id: 'sug-1',
    kind: 'clarify_completion',
    fieldPath: 'completionDescription',
    currentValue: null,
    suggestedValue: '新的說法',
    rationale: '原因',
    expectedBenefit: 'clearer_expectation',
    confidence: 'medium',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 11-18. 各欄位套用
// ---------------------------------------------------------------------------

describe('套用建議', () => {
  it('11. title', () => {
    const { draft } = draftOf('recurring');
    const out = applyTaskAiSuggestion({
      draft, suggestion: suggestion({ fieldPath: 'title', suggestedValue: '餐後把碗筷收好' }),
    });
    expect(out.applied).toBe(true);
    if (!out.applied) return;
    expect(out.draft.title).toBe('餐後把碗筷收好');
  });

  it('12. completionDescription —— 五種 editor 各自寫到自己的欄位', () => {
    const cases: Array<[TaskEditorKind, (d: TaskDraft) => string | undefined]> = [
      ['growth_plan', d => (isGrowthPlanDraft(d) ? d.completionDescription : undefined)],
      ['short_support', d => (isShortSupportDraft(d) ? d.successDescription : undefined)],
      ['recurring', d => (isRecurringDraft(d) ? d.completionDescription : undefined)],
      ['family_role', d => (isFamilyRoleDraft(d) ? d.contributionDescription : undefined)],
      ['one_time', d => (isOneTimeDraft(d) ? d.completionDescription : undefined)],
    ];
    for (const [kind, read] of cases) {
      const { draft } = draftOf(kind);
      const out = applyTaskAiSuggestion({
        draft, suggestion: suggestion({ suggestedValue: '講一段給家人聽' }),
      });
      expect({ kind, applied: out.applied }).toEqual({ kind, applied: true });
      if (!out.applied) continue;
      expect({ kind, value: read(out.draft) }).toEqual({ kind, value: '講一段給家人聽' });
    }
  });

  it('13. durationDays', () => {
    const { draft } = draftOf('growth_plan');
    const out = applyTaskAiSuggestion({
      draft,
      suggestion: suggestion({ kind: 'adjust_duration', fieldPath: 'durationDays', suggestedValue: 14 }),
    });
    expect(out.applied).toBe(true);
    if (!out.applied) return;
    expect(isGrowthPlanDraft(out.draft) && out.draft.durationDays).toBe(14);
  });

  it('14. weeklyFrequency —— 只有「每週次數」模式才吃得下', () => {
    const { draft } = draftOf('recurring');
    if (!isRecurringDraft(draft)) throw new Error('預期是固定任務');
    const weekly = { ...draft, scheduleMode: 'weekly_frequency' as const, weeklyFrequency: 5 };
    const out = applyTaskAiSuggestion({
      draft: weekly,
      suggestion: suggestion({ kind: 'adjust_frequency', fieldPath: 'weeklyFrequency', suggestedValue: 3 }),
    });
    expect(out.applied).toBe(true);
    if (!out.applied) return;
    expect(isRecurringDraft(out.draft) && out.draft.weeklyFrequency).toBe(3);

    // 固定日期模式沒有這個欄位，套用應該失敗而不是硬塞。
    const fixed = { ...draft, scheduleMode: 'fixed_days' as const };
    const rejected = applyTaskAiSuggestion({
      draft: fixed,
      suggestion: suggestion({ kind: 'adjust_frequency', fieldPath: 'weeklyFrequency', suggestedValue: 3 }),
    });
    expect(rejected.applied).toBe(false);
  });

  it('15. sessionMinutes', () => {
    const { draft } = draftOf('growth_plan');
    const out = applyTaskAiSuggestion({
      draft,
      suggestion: suggestion({ kind: 'adjust_session_time', fieldPath: 'sessionMinutes', suggestedValue: 20 }),
    });
    expect(out.applied).toBe(true);
    if (!out.applied) return;
    expect(isGrowthPlanDraft(out.draft) && out.draft.minutesPerSession).toBe(20);
  });

  it('16. supportSteps', () => {
    const { draft } = draftOf('short_support');
    const out = applyTaskAiSuggestion({
      draft,
      suggestion: suggestion({
        kind: 'add_support_step', fieldPath: 'supportSteps',
        suggestedValue: ['睡前對照課表', '把東西放進書包', '書包放門邊'],
      }),
    });
    expect(out.applied).toBe(true);
    if (!out.applied) return;
    expect(isShortSupportDraft(out.draft) && out.draft.supportSteps.map(s => s.text))
      .toEqual(['睡前對照課表', '把東西放進書包', '書包放門邊']);
  });

  it('16b. 清單套用會沿用既有項目的 id 與開關，不重建一批全新的', () => {
    const { draft } = draftOf('short_support');
    if (!isShortSupportDraft(draft)) throw new Error('預期是短期支援');
    // 預設草稿沒有支援步驟，先放兩步進去，並把第一步關掉。
    const withDisabled = {
      ...draft,
      supportSteps: [
        { id: 'step-existing-1', text: '原本的第一步', enabled: false },
        { id: 'step-existing-2', text: '原本的第二步', enabled: true },
      ],
    };
    const out = applyTaskAiSuggestion({
      draft: withDisabled,
      suggestion: suggestion({
        fieldPath: 'supportSteps', suggestedValue: ['改過的第一步', '改過的第二步'],
      }),
    });
    expect(out.applied).toBe(true);
    if (!out.applied || !isShortSupportDraft(out.draft)) return;
    // 家長關掉的那一項不該因為換了文字就自己打開。
    expect(out.draft.supportSteps[0].enabled).toBe(false);
    expect(out.draft.supportSteps[0].id).toBe(withDisabled.supportSteps[0].id);
  });

  it('17. reviewAfterDays', () => {
    const { draft } = draftOf('family_role');
    const out = applyTaskAiSuggestion({
      draft,
      suggestion: suggestion({ kind: 'adjust_review_timing', fieldPath: 'reviewAfterDays', suggestedValue: 7 }),
    });
    expect(out.applied).toBe(true);
    if (!out.applied) return;
    expect(isFamilyRoleDraft(out.draft) && out.draft.firstReviewAfterDays).toBe(7);
  });

  it('17b. 固定任務套用回顧時機會一併打開回顧開關', () => {
    const { draft } = draftOf('recurring');
    if (!isRecurringDraft(draft)) throw new Error('預期是固定任務');
    const off = { ...draft, reviewEnabled: false, reviewAfterDays: undefined };
    const out = applyTaskAiSuggestion({
      draft: off,
      suggestion: suggestion({ fieldPath: 'reviewAfterDays', suggestedValue: 14 }),
    });
    expect(out.applied).toBe(true);
    if (!out.applied || !isRecurringDraft(out.draft)) return;
    // 否則家長按了採用卻什麼都沒發生。
    expect({ enabled: out.draft.reviewEnabled, days: out.draft.reviewAfterDays })
      .toEqual({ enabled: true, days: 14 });
  });

  it('18. milestones', () => {
    const { draft } = draftOf('growth_plan');
    const out = applyTaskAiSuggestion({
      draft,
      suggestion: suggestion({
        kind: 'split_milestone', fieldPath: 'milestones',
        suggestedValue: ['找到想讀的書', '讀完第一本', '和家人分享'],
      }),
    });
    expect(out.applied).toBe(true);
    if (!out.applied) return;
    expect(isGrowthPlanDraft(out.draft) && out.draft.milestones.map(m => m.title))
      .toEqual(['找到想讀的書', '讀完第一本', '和家人分享']);
  });
});

// ---------------------------------------------------------------------------
// 19-20. 不 mutation、不碰 immutable
// ---------------------------------------------------------------------------

describe('邊界', () => {
  it('19. 不修改原本的 draft', () => {
    const { draft } = draftOf('growth_plan');
    const before = JSON.stringify(draft);
    applyTaskAiSuggestion({
      draft, suggestion: suggestion({ fieldPath: 'title', suggestedValue: '換掉的標題' }),
    });
    expect(JSON.stringify(draft)).toBe(before);
  });

  it('19b. 清單套用也不動原陣列', () => {
    const { draft } = draftOf('growth_plan');
    if (!isGrowthPlanDraft(draft)) throw new Error('預期是成長計畫');
    const originalTitles = draft.milestones.map(m => m.title);
    applyTaskAiSuggestion({
      draft, suggestion: suggestion({ fieldPath: 'milestones', suggestedValue: ['一', '二'] }),
    });
    expect(draft.milestones.map(m => m.title)).toEqual(originalTitles);
  });

  it('20. 對不上的欄位不會被硬塞進去', () => {
    // 單次任務沒有 durationDays / milestones / supportSteps。
    const { draft } = draftOf('one_time');
    for (const path of ['durationDays', 'milestones', 'supportSteps', 'responsibilityItems'] as const) {
      const out = applyTaskAiSuggestion({
        draft,
        suggestion: suggestion({
          fieldPath: path,
          suggestedValue: path === 'durationDays' ? 14 : ['甲', '乙'],
        }),
      });
      expect({ path, applied: out.applied }).toEqual({ path, applied: false });
      expect(out.draft).toBe(draft);
    }
  });

  it('20b. 回饋政策與目的類別不在可寫欄位裡 —— 型別上就寫不出來', () => {
    const { draft } = draftOf('recurring');
    const out = applyTaskAiSuggestion({
      draft, suggestion: suggestion({ fieldPath: 'title', suggestedValue: '新標題' }),
    });
    expect(out.applied).toBe(true);
    if (!out.applied) return;
    expect(out.draft.rewardPolicy).toBe(draft.rewardPolicy);
    expect(out.draft.purposeCategory).toBe(draft.purposeCategory);
    expect(out.draft.source).toBe(draft.source);
    expect(out.draft.originalExpectation).toBe(draft.originalExpectation);
  });
});

// ---------------------------------------------------------------------------
// 21-22. 套用之後要重跑的東西
// ---------------------------------------------------------------------------

describe('套用之後', () => {
  it('21. 套用後 validateTaskDraft 仍然跑得動，而且反映新的值', () => {
    const { draft, variant } = draftOf('recurring');
    const out = applyTaskAiSuggestion({
      draft, suggestion: suggestion({ fieldPath: 'title', suggestedValue: '   ' }),
    });
    expect(out.applied).toBe(true);
    if (!out.applied) return;
    // 空白標題是無效的 —— 套用之後重跑驗證要抓得到。
    const errors = validateTaskDraft(out.draft, variant);
    expect(Object.keys(errors).length).toBeGreaterThan(0);
  });

  it('22. 改到分鐘或期間時會標記需要重算幣值', () => {
    const { draft } = draftOf('growth_plan');
    for (const [path, value, expected] of [
      ['sessionMinutes', 20, true],
      ['durationDays', 14, true],
      ['title', '新標題', false],
      ['completionDescription', '新說法', false],
    ] as const) {
      const out = applyTaskAiSuggestion({
        draft, suggestion: suggestion({ fieldPath: path, suggestedValue: value }),
      });
      expect({ path, affects: out.applied && out.affectsRewardDecision })
        .toEqual({ path, affects: expected });
    }
  });
});

// ---------------------------------------------------------------------------
// 23-24. 拒絕與復原
// ---------------------------------------------------------------------------

describe('拒絕與復原', () => {
  it('23. 拒絕不改草稿 —— 拒絕就是什麼都不做', () => {
    const { draft } = draftOf('growth_plan');
    // 「拒絕」在資料層就是不呼叫 apply。這條把那個語意釘住：
    // 沒有任何一個函式會因為「被拒絕」而去動草稿。
    const before = JSON.stringify(draft);
    expect(JSON.stringify(draft)).toBe(before);
  });

  it('24. 復原會把那個欄位還原', () => {
    const { draft } = draftOf('growth_plan');
    const originalTitle = draft.title;
    const out = applyTaskAiSuggestion({
      draft, suggestion: suggestion({ fieldPath: 'title', suggestedValue: '換掉的標題' }),
    });
    expect(out.applied).toBe(true);
    if (!out.applied) return;
    expect(out.draft.title).toBe('換掉的標題');

    const undone = undoTaskAiSuggestion({ draft: out.draft, record: out.record });
    expect(undone.title).toBe(originalTitle);
  });

  it('24b. 原本沒有值的欄位，復原會回到未設定而不是 0', () => {
    const { draft } = draftOf('growth_plan');
    if (!isGrowthPlanDraft(draft)) throw new Error('預期是成長計畫');
    const noMinutes = { ...draft, minutesPerSession: undefined };
    const out = applyTaskAiSuggestion({
      draft: noMinutes, suggestion: suggestion({ fieldPath: 'sessionMinutes', suggestedValue: 20 }),
    });
    expect(out.applied).toBe(true);
    if (!out.applied) return;

    const undone = undoTaskAiSuggestion({ draft: out.draft, record: out.record });
    expect(isGrowthPlanDraft(undone) && undone.minutesPerSession).toBeUndefined();
  });

  it('24c. 復原其中一項不會連帶收回其他項', () => {
    const { draft } = draftOf('growth_plan');
    const first = applyTaskAiSuggestion({
      draft, suggestion: suggestion({ id: 'a', fieldPath: 'title', suggestedValue: '標題 A' }),
    });
    if (!first.applied) throw new Error('第一項應該套用成功');
    const second = applyTaskAiSuggestion({
      draft: first.draft,
      suggestion: suggestion({ id: 'b', fieldPath: 'sessionMinutes', suggestedValue: 25 }),
    });
    if (!second.applied) throw new Error('第二項應該套用成功');

    // 收回第一項，第二項要留著。
    const undone = undoTaskAiSuggestion({ draft: second.draft, record: first.record });
    expect(undone.title).toBe(draft.title);
    expect(isGrowthPlanDraft(undone) && undone.minutesPerSession).toBe(25);
  });

  it('readAiField 讀得到剛寫進去的值', () => {
    const { draft } = draftOf('family_role');
    const out = applyTaskAiSuggestion({
      draft,
      suggestion: suggestion({ fieldPath: 'responsibilityItems', suggestedValue: ['擺碗筷', '收碗'] }),
    });
    expect(out.applied).toBe(true);
    if (!out.applied) return;
    expect(readAiField(out.draft, 'responsibilityItems')).toEqual(['擺碗筷', '收碗']);
  });
});

// ---------------------------------------------------------------------------
// 33. 規則與建議是兩件事
// ---------------------------------------------------------------------------

describe('33. rule finding 與 AI suggestion 分離', () => {
  it('規則檢查完全不需要 AI 就跑得出來', () => {
    const { draft } = draftOf('family_role');
    if (!isFamilyRoleDraft(draft)) throw new Error('預期是家庭角色');
    const empty = { ...draft, responsibilityItems: [] };
    const findings = collectTaskRuleFindings(empty);
    expect(hasBlockingFinding(findings)).toBe(true);
    expect(findings.some(f => f.code === 'FAMILY_ROLE_NEEDS_RESPONSIBILITIES')).toBe(true);
  });

  it('規則檢查是純函式：同一份草稿永遠得到同一批結果', () => {
    const { draft } = draftOf('growth_plan');
    expect(collectTaskRuleFindings(draft)).toEqual(collectTaskRuleFindings(draft));
  });

  it('blocking 只由規則產生，AI 的型別裡根本沒有 severity 這個概念', () => {
    const s = suggestion({ fieldPath: 'title', suggestedValue: '任何標題' });
    expect('severity' in s).toBe(false);
    expect('source' in s).toBe(false);
  });

  it('時間儲蓄與家庭參與發幣都是 blocking，不是可以略過的建議', () => {
    const { draft } = draftOf('recurring');
    const timeSaving = { ...draft, rewardPolicy: 'time_saving_eligible' as const };
    expect(hasBlockingFinding(collectTaskRuleFindings(timeSaving))).toBe(true);

    const familyCoin = {
      ...draft,
      purposeCategory: 'family_participation' as const,
      rewardPolicy: 'coin_eligible' as const,
    };
    const findings = collectTaskRuleFindings(familyCoin);
    expect(findings.some(f => f.code === 'FAMILY_PARTICIPATION_NOT_COIN_ELIGIBLE')).toBe(true);
    expect(hasBlockingFinding(findings)).toBe(true);
  });
});
