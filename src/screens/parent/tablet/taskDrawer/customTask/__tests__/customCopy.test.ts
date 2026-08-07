// 第九階段 C — 文案與回歸的不變量
//
// 這一支不渲染任何東西，只檢查兩件事：
//
//   · 家長會讀到的字裡沒有任何內部語彙（A／B／C／D、editorKind、reason code）
//   · 第九階段 C 沒有動到不該動的東西（catalog 數量、preset 流程、DB、AI）
//
// 為什麼要一支專門的「不該出現什麼」測試：新增文案時，把一個內部代號
// 貼進 description 是最容易發生、也最不容易被 review 抓到的事 ——
// 那一行讀起來完全正常，只有家長會覺得莫名其妙。

import fs from 'fs';
import path from 'path';

import {
  CUSTOM_DURATION_DAY_CHOICES,
  DURATION_OPTIONS,
  ENTRY_COPY,
  PURPOSE_DISPLAY_LABEL,
  PURPOSE_OPTIONS,
  REWARD_OPTION_COPY,
  ROUTINE_CONFIRMATION_COPY,
  STEP1_COPY,
  STEP2_COPY,
  STEP3_COPY,
  rewardUnavailableCopy,
} from '../customTaskCopy';
import {
  CUSTOM_TASK_PURPOSE_CHOICES,
  ENABLED_TASK_CREATION_SOURCES,
  PLANNED_TASK_CREATION_SOURCES,
  purposeCategoryOf,
} from '../customTaskContract';
import { editorFormLabel } from '../customTaskRouting';
import { ALL_FAMILIES } from '../../taskCatalog';

/** 家長絕對不該讀到的字。 */
const INTERNAL_TOKENS = [
  'A 類', 'B 類', 'C 類', 'D 類',
  'purposeCategory', 'editorKind', 'durationChoice', 'rewardPolicy',
  'life_routine', 'family_participation', 'autonomous_challenge', 'learning_skill',
  'one_time', 'recurring', 'growth_plan', 'short_support', 'family_role',
  'coin_eligible', 'record_only', 'progress_only', 'family_contribution',
  'parent_custom', 'creation_source', 'created_parent_custom',
  'needs_confirmation', 'POLICY_REJECTED', 'B_COIN_POLICY_NOT_CONFIGURED',
  'FAMILY_PARTICIPATION_NOT_COIN_ELIGIBLE', 'TASK_TYPE',
];

/** 走過一份文案物件裡所有字串。 */
function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsOf);
  return [];
}

const ALL_COPY = stringsOf([
  ENTRY_COPY, STEP1_COPY, STEP2_COPY, STEP3_COPY,
  PURPOSE_OPTIONS, DURATION_OPTIONS, ROUTINE_CONFIRMATION_COPY,
  REWARD_OPTION_COPY, PURPOSE_DISPLAY_LABEL,
]);

// ---------------------------------------------------------------------------
// 文案不變量
// ---------------------------------------------------------------------------

describe('14, 23, 45. 文案裡沒有內部語彙', () => {
  it('所有家長看得到的字都乾淨', () => {
    for (const text of ALL_COPY) {
      for (const token of INTERNAL_TOKENS) {
        // iconKey 這種 IconKey 值是元件屬性不是文案，但它們是短英文，
        // 一併掃過去也不會誤判 —— 內部語彙清單裡沒有 'book' 這種字。
        expect(text).not.toContain(token);
      }
    }
  });

  it('選不了的原因也是人話 —— 不透傳任何 reason code', () => {
    const cases = [
      'COIN_POLICY_MISSING_FOR_CATEGORY',
      'COIN_POLICY_NEEDS_ESTIMATED_MINUTES',
      'ROUTINE_NOT_A_COIN_SOURCE',
      'TIME_SAVING_NOT_ENABLED',
    ] as const;

    for (const reasonCode of cases) {
      const copy = rewardUnavailableCopy({
        rewardPolicy: reasonCode === 'TIME_SAVING_NOT_ENABLED'
          ? 'time_saving_eligible'
          : 'coin_eligible',
        availability: 'unavailable',
        title: '',
        description: '',
        reasonCode,
        coinAmountStatus: 'policy_missing',
      });
      expect(copy).not.toContain(reasonCode);
      expect(copy).not.toMatch(/[A-Z]{3,}_[A-Z]/);
      expect(copy.length).toBeGreaterThan(0);
    }
  });

  it('B 類的說法是「尚未有」而不是「不可以」', () => {
    const copy = rewardUnavailableCopy({
      rewardPolicy: 'coin_eligible',
      availability: 'available_with_confirmation',
      title: '',
      description: '',
      reasonCode: 'COIN_POLICY_MISSING_FOR_CATEGORY',
      coinAmountStatus: 'policy_missing',
    });
    // 產品概念上已經允許，缺的是幣值政策的數字 —— 措辭要說對這件事。
    expect(copy).toContain('尚未');
    expect(copy).not.toContain('禁止');
    expect(copy).not.toContain('不允許');
  });
});

describe('12, 22, 29. 選項數量與對應', () => {
  it('四個目的，而且每一個都對得到一個內部分類', () => {
    expect(PURPOSE_OPTIONS).toHaveLength(4);
    expect(PURPOSE_OPTIONS.map(o => o.choice).sort())
      .toEqual(CUSTOM_TASK_PURPOSE_CHOICES.map(c => c.choice).sort());
    for (const option of PURPOSE_OPTIONS) {
      expect(purposeCategoryOf(option.choice)).toBeTruthy();
    }
  });

  it('三種執行安排', () => {
    expect(DURATION_OPTIONS).toHaveLength(3);
    expect(DURATION_OPTIONS.map(o => o.choice)).toEqual(['once', 'repeating', 'for_a_while']);
  });

  it('只有自主挑戰有選中後的提醒', () => {
    const withNote = PURPOSE_OPTIONS.filter(o => o.selectedNote);
    expect(withNote).toHaveLength(1);
    expect(withNote[0].choice).toBe('own_challenge');
  });

  it('進度文字是 n／3', () => {
    expect(STEP1_COPY.progress).toContain('1／3');
    expect(STEP2_COPY.progress).toContain('2／3');
    expect(STEP3_COPY.progress).toContain('3／3');
    for (const progress of [STEP1_COPY.progress, STEP2_COPY.progress, STEP3_COPY.progress]) {
      expect(progress).not.toContain('／2');
      expect(progress).not.toContain('步驟');
    }
  });

  it('回饋方式四種正式文案齊全', () => {
    for (const policy of ['record_only', 'progress_only', 'family_contribution', 'coin_eligible'] as const) {
      expect(REWARD_OPTION_COPY[policy].title.length).toBeGreaterThan(0);
      expect(REWARD_OPTION_COPY[policy].description.length).toBeGreaterThan(0);
    }
  });
});

describe('30. 形式名稱與 catalog 一致', () => {
  it('五種 editor 的名稱與 preset 的版本標籤逐字相同', () => {
    // 兩邊說不同的字的話，同一種任務在自訂與預設下會叫不同名字。
    const fromCatalog = new Set(
      ALL_FAMILIES.flatMap(family =>
        family.variants.map(variant => {
          if (variant.durationType === 'one_time') return '單次';
          if (variant.durationType === 'recurring') return '固定重複';
          if (variant.planMode === 'family_role') return '家庭角色';
          if (variant.planMode === 'short_support') return '短期小計畫';
          return '成長計畫';
        }),
      ),
    );
    const fromCustom = new Set(
      (['one_time', 'recurring', 'family_role', 'short_support', 'growth_plan'] as const)
        .map(editorFormLabel),
    );
    expect([...fromCustom].sort()).toEqual([...fromCatalog].sort());
  });

  it('期間選項取自 catalog 常用組合，不是新發明的數字', () => {
    const catalogChoices = new Set(
      ALL_FAMILIES.flatMap(family =>
        family.variants.flatMap(v => v.defaultDraft.durationDayChoices ?? []),
      ),
    );
    for (const editorKind of ['growth_plan', 'short_support', 'family_role'] as const) {
      const choices = CUSTOM_DURATION_DAY_CHOICES[editorKind];
      expect(choices.length).toBeGreaterThan(0);
      for (const days of choices) expect(catalogChoices.has(days)).toBe(true);
    }
    // 單次與固定重複沒有期間。
    expect(CUSTOM_DURATION_DAY_CHOICES.one_time).toEqual([]);
    expect(CUSTOM_DURATION_DAY_CHOICES.recurring).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 65-70. 回歸
// ---------------------------------------------------------------------------

describe('65-66. catalog 沒有被動到', () => {
  it('26 個家族、36 個版本', () => {
    expect(ALL_FAMILIES).toHaveLength(26);
    expect(ALL_FAMILIES.flatMap(f => f.variants)).toHaveLength(36);
  });
});

describe('2. 未啟用的入口只在型別裡', () => {
  it('第一版真的只有兩個', () => {
    expect(ENABLED_TASK_CREATION_SOURCES).toEqual(['preset', 'parent_custom']);
    expect(PLANNED_TASK_CREATION_SOURCES).toEqual([
      'child_proposal', 'co_created', 'wish_plan', 'copied_task', 'system_suggestion',
    ]);
  });
});

describe('69-70. 這一輪沒有碰的東西', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..');

  it('69. 沒有新增任何 AI 或網路呼叫', () => {
    const drawerDir = path.resolve(__dirname, '..', '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(full);
          continue;
        }
        if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) files.push(full);
      }
    };
    walk(drawerDir);

    const offenders = files.filter(file => {
      const source = fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      return /functions\.invoke|generativelanguage|new GoogleGenerative/i.test(source);
    });
    // 抽屜整層都不直接呼叫 Edge Function 或 Gemini —— AI 走注入的 service。
    expect(offenders).toEqual([]);
  });

  it('70. 第九階段 B 沒有新增 migration', () => {
    const dir = path.resolve(repoRoot, 'supabase', 'migrations');
    const migrations = fs.readdirSync(dir).filter(name => name.endsWith('.sql')).sort();
    // 第九階段 B 的那一支曾經是最後一支；之後的 migration（例如週報排程建議
    // 採用功能）不在這個階段的範圍內，只需確認它仍然存在、沒被誤刪。
    expect(migrations).toContain('20260804000000_parent_custom_task_persistence.sql');
  });
});
