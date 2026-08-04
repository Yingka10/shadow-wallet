// preset 與 parent_custom 的相容性證明。
//
// ─────────────────────────────────────────────────────────────────────────
// 這一組是整個第九階段 A 最重要的測試。它要回答的問題是：
//
//   **自訂任務真的可以共用現有的 TaskDraft 嗎，還是我們在自欺欺人？**
//
// 「可以共用」如果只是一句話，下一輪就會出現一個 CustomTaskDraft、
// 一個 CustomTaskEditor，然後是第二支 RPC —— 而「家庭參與不發成長幣」
// 這種規則會需要在兩個地方各寫一次。
//
// 所以下面是證據，不是主張：同一組驗證函式吃 preset 草稿與自訂草稿，
// 結果必須一致；editor 種類不能變成六種；idempotency 不能認得來源。
// ─────────────────────────────────────────────────────────────────────────

import {
  createTaskDraft,
  taskDraftOrigin,
  validateTaskDraft,
  type TaskDraft,
  type TaskEditorKind,
} from '../../taskDraft';
import { ALL_FAMILIES } from '../../taskCatalog';
import { newClientRequestId } from '../../taskPersistence';
import { collectTaskRuleFindings } from '../../taskAi/ruleFindings';
import { createCustomTaskDraft } from '../customTaskInitializer';
import {
  creationSourceOf,
  CUSTOM_TASK_COMMAND_GAP,
  ENABLED_TASK_CREATION_SOURCES,
  isEnabledTaskCreationSource,
  PLANNED_TASK_CREATION_SOURCES,
  type CustomTaskIntake,
} from '../customTaskContract';

const CHILD = {
  id: 'child-1',
  familyId: 'family-1',
  nickname: '小安',
  birthDate: '2018-04-01',
};

function intake(over: Partial<CustomTaskIntake> = {}): CustomTaskIntake {
  return {
    title: '照顧倉鼠',
    originalExpectation: '希望他能記得每天餵水換飼料，養成負責的習慣。',
    purposeChoice: 'own_challenge',
    durationChoice: 'for_a_while',
    ...over,
  };
}

function customDraft(over: Partial<CustomTaskIntake> = {}): TaskDraft {
  const result = createCustomTaskDraft({ intake: intake(over), child: CHILD, ageGroup: '6-9' });
  if (result.status !== 'created') throw new Error(`預期產生草稿，實際是 ${result.status}`);
  return result.draft;
}

describe('9-10. 來源契約', () => {
  it('9. preset 草稿帶著 family 與 variant', () => {
    const family = ALL_FAMILIES[0];
    const draft = createTaskDraft(family, family.variants[0], CHILD, '6-9');
    const origin = taskDraftOrigin(draft);

    expect(origin.kind).toBe('preset');
    expect(origin.kind === 'preset' && origin.familyId).toBe(family.id);
    expect(origin.kind === 'preset' && origin.variantId).toBe(family.variants[0].id);
    expect(creationSourceOf(origin)).toBe('preset');
  });

  it('10. parent_custom 沒有假的 preset id', () => {
    // 這一條是型別與資料兩層的斷言。給自訂任務一組假的 preset id
    // 會讓「這筆任務從哪來」在資料庫裡永遠答錯 ——
    // 一個錯誤的答案比沒有答案更難發現。
    const draft = customDraft();

    expect(draft.familyId).toBeUndefined();
    expect(draft.variantId).toBeUndefined();
    expect(draft.createdFromPreset).toBe(false);
    expect(taskDraftOrigin(draft)).toEqual({ kind: 'parent_custom' });

    // 也不可以用空字串或佔位字串假裝。
    const serialized = JSON.stringify(draft);
    for (const fake of ['custom-family', 'custom-variant', 'placeholder', 'unknown']) {
      expect({ fake, found: serialized.includes(fake) }).toEqual({ fake, found: false });
    }
  });

  it('來源不決定目的、回饋或 editor', () => {
    // 同一個入口可以產出四種目的、五種 editor。
    // 反過來說，看到 parent_custom 也推論不出任何一項。
    const kinds = new Set<TaskEditorKind>();
    for (const purposeChoice of ['take_care_of_self', 'join_family_life', 'own_challenge', 'learn_or_practise'] as const) {
      for (const durationChoice of ['once', 'repeating', 'for_a_while'] as const) {
        const result = createCustomTaskDraft({
          intake: intake({ purposeChoice, durationChoice }),
          child: CHILD,
          ageGroup: '6-9',
          confirmedEditorKind: undefined,
        });
        if (result.status === 'created') kinds.add(result.draft.editorKind);
      }
    }
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });

  it('source（誰提出的）可以指定，不被入口綁死', () => {
    // 自訂入口不代表一定是家長的主意。C 類的政策要求來源是
    // 孩子提出或親子協商 —— 寫死 parent 的話就永遠建不出合規的自主挑戰。
    const result = createCustomTaskDraft({
      intake: intake(),
      child: CHILD,
      ageGroup: '6-9',
      source: 'co_created',
    });
    expect(result.status === 'created' && result.draft.source).toBe('co_created');
  });
});

describe('11. parent_custom 仍產生合法 TaskDraft', () => {
  it('五種 editor 的自訂草稿都通過同一組型別守衛', () => {
    const cases: Array<[CustomTaskIntake['purposeChoice'], CustomTaskIntake['durationChoice'], TaskEditorKind]> = [
      ['own_challenge', 'once', 'one_time'],
      ['join_family_life', 'repeating', 'recurring'],
      ['join_family_life', 'for_a_while', 'family_role'],
      ['learn_or_practise', 'for_a_while', 'growth_plan'],
      ['take_care_of_self', 'for_a_while', 'short_support'],
    ];

    for (const [purposeChoice, durationChoice, expected] of cases) {
      const draft = customDraft({ purposeChoice, durationChoice });
      expect({ purposeChoice, durationChoice, kind: draft.editorKind })
        .toEqual({ purposeChoice, durationChoice, kind: expected });
    }
  });

  it('自訂草稿走得進同一支 validator，而且錯誤是內容不足不是結構壞掉', () => {
    // 剛建立的自訂草稿當然還沒填完 —— 完成標準是空的。
    // 重點是 validator **跑得動**，而且回的是欄位層級的訊息，
    // 不是因為缺 preset 而爆掉。
    const draft = customDraft({ purposeChoice: 'learn_or_practise', durationChoice: 'repeating' });
    const errors = validateTaskDraft(draft, undefined);

    expect(errors.completionDescription).toBeDefined();
    // 沒有任何一則錯誤在抱怨 preset。
    expect(JSON.stringify(errors)).not.toMatch(/preset|family|variant/i);
  });

  it('填完之後不再有驗證錯誤', () => {
    const base = customDraft({ purposeChoice: 'learn_or_practise', durationChoice: 'repeating' });
    const filled = {
      ...base,
      completionDescription: '練習完把譜收好，並在紀錄本上打勾。',
    } as TaskDraft;

    expect(validateTaskDraft(filled, undefined)).toEqual({});
  });

  it('自訂草稿跑得過規則檢查，且不因為缺 preset 產生 blocking', () => {
    const draft = customDraft({ purposeChoice: 'own_challenge', durationChoice: 'for_a_while' });
    const findings = collectTaskRuleFindings(draft);
    expect(findings.filter((f) => f.severity === 'blocking')).toEqual([]);
  });
});

describe('12-13. idempotency 與 legacy', () => {
  it('12. clientRequestId 與來源無關', () => {
    // idempotency 是「同一次送出不要建兩筆」，那件事與從哪個入口進來沒有關係。
    // 如果它認得來源，preset 與 custom 就會有兩套重試語意。
    const ids = new Set(Array.from({ length: 50 }, () => newClientRequestId()));
    expect(ids.size).toBe(50);

    const source = jest.requireActual('fs').readFileSync(
      require.resolve('../../taskPersistence/clientRequestId.ts'),
      'utf8',
    ) as string;
    expect(source).not.toMatch(/preset|custom|origin|familyId|variantId/);
  });

  it('13. 舊草稿不會被誤判成 parent_custom', () => {
    // 既有草稿沒有 origin 欄位（那時候只有一個入口）。
    // 推回 preset 靠的是 familyId / variantId 都在 —— 而它們一定在，
    // 因為 createTaskDraft 一律會填。
    const family = ALL_FAMILIES[0];
    const legacy = createTaskDraft(family, family.variants[0], CHILD, '6-9');
    const { origin: _dropped, ...withoutOrigin } = legacy;

    expect(taskDraftOrigin(withoutOrigin as TaskDraft).kind).toBe('preset');
    expect(creationSourceOf(taskDraftOrigin(withoutOrigin as TaskDraft))).toBe('preset');
  });

  it('來源列舉：第一版兩個，未來五個先留位置不啟用', () => {
    expect([...ENABLED_TASK_CREATION_SOURCES]).toEqual(['preset', 'parent_custom']);
    expect(PLANNED_TASK_CREATION_SOURCES).toHaveLength(5);

    for (const planned of PLANNED_TASK_CREATION_SOURCES) {
      expect({ planned, enabled: isEnabledTaskCreationSource(planned) })
        .toEqual({ planned, enabled: false });
    }
  });
});

describe('23-24. 既有流程不變', () => {
  it('23. preset flow 行為不變 —— 26 個家族全部照舊建得出草稿', () => {
    const families = ALL_FAMILIES;
    expect(families.length).toBeGreaterThanOrEqual(26);

    for (const family of families) {
      for (const variant of family.variants) {
        const draft = createTaskDraft(family, variant, CHILD, '6-9');
        expect({
          id: `${family.id}/${variant.id}`,
          familyId: draft.familyId,
          variantId: draft.variantId,
          fromPreset: draft.createdFromPreset,
        }).toEqual({
          id: `${family.id}/${variant.id}`,
          familyId: family.id,
          variantId: variant.id,
          fromPreset: true,
        });
      }
    }
  });

  it('24. editor 仍然只有五種，沒有第六種', () => {
    // 自訂不是第六種 editor。這條會在有人偷偷加 'custom' 時失敗。
    const kinds: TaskEditorKind[] = [
      'growth_plan', 'short_support', 'recurring', 'family_role', 'one_time',
    ];

    const seen = new Set<string>();
    for (const family of ALL_FAMILIES) {
      for (const variant of family.variants) {
        seen.add(createTaskDraft(family, variant, CHILD, '6-9').editorKind);
      }
    }
    for (const purposeChoice of ['take_care_of_self', 'join_family_life', 'own_challenge', 'learn_or_practise'] as const) {
      for (const durationChoice of ['once', 'repeating', 'for_a_while'] as const) {
        const result = createCustomTaskDraft({
          intake: intake({ purposeChoice, durationChoice }),
          child: CHILD,
          ageGroup: '6-9',
          confirmedEditorKind: 'short_support',
        });
        if (result.status === 'created') seen.add(result.draft.editorKind);
      }
    }

    for (const kind of seen) expect(kinds).toContain(kind);
    expect(seen.size).toBeLessThanOrEqual(5);
  });
});

describe('25-27. 命令與 RPC 的相容性缺口', () => {
  it('25. CreateParentTaskCommand 目前還不能表達 parent_custom', () => {
    // 這條測試釘住的是一個**已知且刻意未修**的缺口。
    // 它存在的意義是：下一輪有人以為可以直接送出時，會先看到這裡。
    expect(CUSTOM_TASK_COMMAND_GAP.blocked).toBe(true);
    expect(CUSTOM_TASK_COMMAND_GAP.requiresMigration).toBe(true);
    expect(CUSTOM_TASK_COMMAND_GAP.reasons.length).toBeGreaterThanOrEqual(4);
  });

  it('25b. command 的 preset 欄位確實是必填 —— 缺口不是想像的', () => {
    const source = jest.requireActual('fs').readFileSync(
      require.resolve('../../taskPersistence/types.ts'),
      'utf8',
    ) as string;

    // 不是 `preset?:`，是 `preset:`。
    expect(source).toMatch(/\n {2}preset: \{/);
    expect(source).toMatch(/createdFromPreset: true/);
  });

  it('26. RPC 接受空的 preset selection —— 這一項不是阻礙', () => {
    // create_parent_task_v1 的選項寫入是對 selectedOptions 逐鍵迴圈，
    // 空物件就是零列，沒有 NOT NULL、沒有必填檢查。
    // 自訂任務沒有 optionGroups，所以這件事必須成立。
    const sql = jest.requireActual('fs').readFileSync(
      require.resolve('../../../../../../../supabase/migrations/20260728000000_task_drawer_persistence_v1.sql'),
      'utf8',
    ) as string;

    expect(sql).toMatch(/FOR v_group IN SELECT k FROM jsonb_object_keys\(v_selections\)/);
    // 沒有「至少要有一個 selection」這種檢查。
    expect(sql).not.toMatch(/jsonb_object_keys\(v_selections\)[\s\S]{0,200}= 0[\s\S]{0,80}VALIDATION_FAILED/);
  });

  it('27. audit snapshot 目前分不出 custom —— event_type 是寫死的', () => {
    const sql = jest.requireActual('fs').readFileSync(
      require.resolve('../../../../../../../supabase/migrations/20260728000000_task_drawer_persistence_v1.sql'),
      'utf8',
    ) as string;

    // 寫死成 created_from_preset，而且 CHECK 只允許三個值。
    expect(sql).toMatch(/v_task_id, 'created_from_preset', auth\.uid\(\)/);
    expect(sql).toMatch(/event_type IN \('created_from_preset', 'updated_from_preset', 'archived'\)/);
    // created_from_preset 欄位也是寫死 true。
    expect(sql).toMatch(/v_schema_version, true/);
  });
});
