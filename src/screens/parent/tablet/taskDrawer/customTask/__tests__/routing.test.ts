// 目的 × 期間 → editor 路由。
//
// 這張表決定的不只是「開哪個畫面」，還有一整套政策後果：
// 選到 family_role 就會要求責任清單與期滿回顧，選到 short_support
// 就會鎖成 progress_only 並要求穩定退場。所以它必須是 deterministic 的，
// 而且測得出來。

import {
  completionPolicyForEditor,
  durationTypeForEditor,
  planModeForEditor,
  resolveCustomTaskEditor,
  ROUTING_RATIONALE_COPY,
  type CustomTaskEditorResolution,
} from '../customTaskRouting';
import {
  CUSTOM_TASK_DURATION_CHOICES,
  CUSTOM_TASK_PURPOSE_CHOICES,
  purposeCategoryOf,
} from '../customTaskContract';

function resolveFor(
  purposeCategory: Parameters<typeof resolveCustomTaskEditor>[0]['purposeCategory'],
  durationChoice: Parameters<typeof resolveCustomTaskEditor>[0]['durationChoice'],
): CustomTaskEditorResolution {
  return resolveCustomTaskEditor({ purposeCategory, durationChoice });
}

describe('1-6. 路由決策表', () => {
  it('1. 生活習慣 ＋ 單次 → one_time', () => {
    expect(resolveFor('life_routine', 'once')).toEqual({
      status: 'resolved',
      editorKind: 'one_time',
      rationaleCode: 'ONE_TIME_ALWAYS_ONE_TIME',
    });
  });

  it('2. 生活習慣 ＋ 固定重複 → 建議 short_support，而且需要家長確認', () => {
    // 這一格刻意不是 resolved。生活自理的目標是變成不用管理的事，
    // 不是變成一個永遠掛在清單上的項目 —— 但那是建議，不是規定，
    // 所以家長看完理由後仍然可以自己決定。
    const result = resolveFor('life_routine', 'repeating');

    expect(result).toEqual({
      status: 'needs_confirmation',
      suggestedEditorKind: 'short_support',
      // 建議連帶換掉期間選擇。少了這一欄，UI 就得自己知道
      // 「改成一段時間」是指哪一個內部值 —— 那等於把路由搬進 event handler。
      suggestedDurationChoice: 'for_a_while',
      rationaleCode: 'ROUTINE_SHOULD_NOT_BE_PERMANENT',
    });
    // 不直接建立永久 recurring 生活常規。
    expect(result.status === 'needs_confirmation' && result.suggestedEditorKind).not.toBe(
      'recurring',
    );
  });

  it('3. 家庭參與 ＋ 固定重複 → recurring', () => {
    expect(resolveFor('family_participation', 'repeating')).toEqual({
      status: 'resolved',
      editorKind: 'recurring',
      rationaleCode: 'FAMILY_REPEATING_IS_RECURRING',
    });
  });

  it('4. 家庭參與 ＋ 持續一段時間 → family_role', () => {
    expect(resolveFor('family_participation', 'for_a_while')).toEqual({
      status: 'resolved',
      editorKind: 'family_role',
      rationaleCode: 'FAMILY_SUSTAINED_IS_ROLE',
    });
  });

  it('5. 自主挑戰 ＋ 持續一段時間 → growth_plan', () => {
    expect(resolveFor('autonomous_challenge', 'for_a_while')).toEqual({
      status: 'resolved',
      editorKind: 'growth_plan',
      rationaleCode: 'SUSTAINED_EFFORT_IS_GROWTH_PLAN',
    });
  });

  it('6. 學習技能 ＋ 持續一段時間 → growth_plan', () => {
    expect(resolveFor('learning_skill', 'for_a_while')).toEqual({
      status: 'resolved',
      editorKind: 'growth_plan',
      rationaleCode: 'SUSTAINED_EFFORT_IS_GROWTH_PLAN',
    });
  });

  it('生活習慣 ＋ 持續一段時間 → short_support（不需確認）', () => {
    expect(resolveFor('life_routine', 'for_a_while')).toEqual({
      status: 'resolved',
      editorKind: 'short_support',
      rationaleCode: 'ROUTINE_TIME_BOXED_SUPPORT',
    });
  });

  it('單次一律 one_time，四種目的都一樣', () => {
    for (const purpose of CUSTOM_TASK_PURPOSE_CHOICES) {
      const result = resolveFor(purpose.purposeCategory, 'once');
      expect({ purpose: purpose.choice, result }).toEqual({
        purpose: purpose.choice,
        result: {
          status: 'resolved',
          editorKind: 'one_time',
          rationaleCode: 'ONE_TIME_ALWAYS_ONE_TIME',
        },
      });
    }
  });
});

describe('7-8. 路由的獨立性', () => {
  it('7. routing 不呼叫 AI —— 同樣輸入永遠同樣輸出', () => {
    // 這一條看起來瑣碎，但它是這張表能擋住建立流程的唯一理由：
    // 一個會幻覺的東西不該決定要開哪支 editor。
    const runs = Array.from({ length: 20 }, () =>
      JSON.stringify(resolveFor('family_participation', 'for_a_while')));
    expect(new Set(runs).size).toBe(1);
  });

  it('7b. 模組沒有依賴任何服務或網路層', () => {
    // 靜態證據：這個模組只 import 型別。真的引了 supabase 或 taskAi 的話，
    // 這條會失敗，而不是等到有人在 production 發現路由變慢。
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const source: string = jest.requireActual('fs').readFileSync(
      require.resolve('../customTaskRouting.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/supabase|taskAi|fetch\(|invoke\(/);
  });

  it('8. routing 不依賴 preset id —— 輸入裡根本沒有這個概念', () => {
    // 型別上就沒有 familyId / variantId 可以傳。
    // 這條測的是「即使 catalog 整個消失，自訂任務仍然路由得出來」。
    const result = resolveFor('learning_skill', 'repeating');
    expect(result).toEqual({
      status: 'resolved',
      editorKind: 'recurring',
      rationaleCode: 'REPEATING_PRACTICE_IS_RECURRING',
    });
  });
});

describe('editor → 政策衍生值', () => {
  it('每個 editorKind 的 completionPolicy 與 RPC guard 相符', () => {
    // create_parent_task_v1 會逐一核對這些值。推錯的話會在 RPC 被擋下 ——
    // 這條測試把那個失敗提前到 CI。
    expect(completionPolicyForEditor('one_time')).toBe('complete_once');
    expect(completionPolicyForEditor('recurring')).toBe('ongoing');
    expect(completionPolicyForEditor('growth_plan')).toBe('plan_complete');
    expect(completionPolicyForEditor('family_role')).toBe('review_and_continue');
    expect(completionPolicyForEditor('short_support')).toBe('stabilize_and_exit');
  });

  it('三種長期形式都對到 long_term ＋ 自己的 planMode', () => {
    for (const kind of ['growth_plan', 'family_role', 'short_support'] as const) {
      expect({ kind, duration: durationTypeForEditor(kind), plan: planModeForEditor(kind) })
        .toEqual({ kind, duration: 'long_term', plan: kind });
    }
  });

  it('單次與週期沒有 planMode', () => {
    expect(planModeForEditor('one_time')).toBeUndefined();
    expect(planModeForEditor('recurring')).toBeUndefined();
  });
});

describe('文案完整性', () => {
  it('每一個 rationaleCode 都有對應的家長文案', () => {
    const purposes = CUSTOM_TASK_PURPOSE_CHOICES.map((p) => p.purposeCategory);
    const durations = CUSTOM_TASK_DURATION_CHOICES.map((d) => d.choice);

    for (const purpose of purposes) {
      for (const duration of durations) {
        const result = resolveFor(purpose, duration);
        if (result.status === 'unsupported') continue;
        const copy = ROUTING_RATIONALE_COPY[result.rationaleCode];
        expect({ purpose, duration, hasCopy: typeof copy === 'string' && copy.length > 0 })
          .toEqual({ purpose, duration, hasCopy: true });
      }
    }
  });

  it('文案裡不出現 A／B／C／D 或內部代號', () => {
    // 家長不需要知道我們內部怎麼分類，而且那四個字母會誘導出
    // 「A 是不是比較低階」這種完全不存在的階序。
    const all = Object.values(ROUTING_RATIONALE_COPY).join('\n')
      + CUSTOM_TASK_PURPOSE_CHOICES.map((p) => `${p.label}${p.description}`).join('\n')
      + CUSTOM_TASK_DURATION_CHOICES.map((d) => `${d.label}${d.description}`).join('\n');

    for (const forbidden of [
      'life_routine', 'family_participation', 'autonomous_challenge', 'learning_skill',
      'growth_plan', 'short_support', 'family_role', 'one_time', 'recurring',
      'A 類', 'B 類', 'C 類', 'D 類',
    ]) {
      expect({ forbidden, found: all.includes(forbidden) }).toEqual({ forbidden, found: false });
    }
  });

  it('目的選項與內部分類一一對應，沒有漏也沒有重複', () => {
    const categories = CUSTOM_TASK_PURPOSE_CHOICES.map((p) => p.purposeCategory);
    expect(new Set(categories).size).toBe(4);
    for (const p of CUSTOM_TASK_PURPOSE_CHOICES) {
      expect(purposeCategoryOf(p.choice)).toBe(p.purposeCategory);
    }
  });
});
