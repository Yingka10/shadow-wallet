// 第八階段 B2B — 15-21. 送出去的東西
//
// 這一支不驗「功能對不對」，驗的是**有什麼東西不該離開這台裝置**。
//
// 送出去之後就收不回來了：即使 provider 不留存，請求本身也會經過我們
// 控制不了的網路與 log。所以這裡是白名單 —— 不是「檢查有沒有漏掉敏感欄位」，
// 是「檢查有沒有出現白名單以外的任何東西」。
//
// 最容易漏的是**自由文字裡的名字**。預設標題就長成「承恩的餐桌任務」，
// 不遮的話名字會跟著每一次請求送出去，而畫面上完全看不出來。

import {
  buildTaskAiInput,
  createTaskAiInputSignature,
  type TaskAiRecommendationInput,
} from '../index';
import {
  createTaskDraft,
  resolveEditorKind,
  type DraftChildContext,
  type TaskDraft,
} from '../../taskDraft';
import { createCustomTaskDraft } from '../../customTask';
import { ALL_FAMILIES, type TaskPresetFamily, type TaskPresetVariant } from '../../taskCatalog';

const CHILD: DraftChildContext = {
  nickname: '承恩',
  birthDate: '2018-03-05',
  familyId: 'household-secret-1',
};

/** 這些字串一個都不該出現在送出去的內容裡。 */
const MUST_NOT_LEAK = [
  '承恩',                       // 孩子暱稱
  'household-secret-1',         // family id
  'child-secret-1',             // child id
  'parent@example.com',         // email
];

function findLearning(): { family: TaskPresetFamily; variant: TaskPresetVariant } {
  for (const family of ALL_FAMILIES) {
    for (const variant of family.variants) {
      if (variant.purposeCategory === 'learning_skill' && resolveEditorKind(variant) === 'recurring') {
        return { family, variant };
      }
    }
  }
  throw new Error('找不到學習類的固定任務 variant');
}

function inputFor(draft: TaskDraft, variant?: TaskPresetVariant): TaskAiRecommendationInput {
  return buildTaskAiInput({
    draft,
    ...(variant ? { variant } : null),
    ageGroup: '6-9',
    childNickname: CHILD.nickname,
  });
}

// ---------------------------------------------------------------------------
// 15-19. preset
// ---------------------------------------------------------------------------

describe('15-19. preset 任務送出去的內容', () => {
  const { family, variant } = findLearning();
  const draft = createTaskDraft(family, variant, CHILD, '6-9');

  it('15. 標題裡的孩子名字被換掉，但句子仍然讀得通', () => {
    // 預設標題常常是「承恩的閱讀計畫」。刪掉名字會變成「的閱讀計畫」，
    // AI 會以為標題殘缺然後建議「把它補完整」——所以換成「孩子」。
    const named: TaskDraft = { ...draft, title: `${CHILD.nickname}的閱讀計畫` };
    const input = inputFor(named, variant);
    expect(input.currentDraft.title).toBe('孩子的閱讀計畫');
    expect(input.currentDraft.title).not.toContain(CHILD.nickname);
  });

  it('15b. 期待與清單裡的名字也一併清掉', () => {
    const named: TaskDraft = {
      ...draft,
      originalExpectation: `希望${CHILD.nickname}每天固定閱讀`,
    };
    const input = inputFor(named, variant);
    expect(input.parentIntent.originalExpectation).not.toContain(CHILD.nickname);
  });

  it('16-19. 整包序列化之後找不到任何識別資料', () => {
    const serialized = JSON.stringify(inputFor(draft, variant));
    for (const secret of MUST_NOT_LEAK) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('只有白名單上的頂層欄位', () => {
    const input = inputFor(draft, variant);
    expect(Object.keys(input).sort()).toEqual([
      'childContext', 'currentDraft', 'immutablePolicies', 'parentIntent',
      'schemaVersion', 'taskContext',
    ]);
    // 年齡只送分級。判斷「20 分鐘會不會太長」需要的是級距，不是出生年月日。
    expect(Object.keys(input.childContext)).toEqual(['ageGroup']);
    expect(input.childContext.ageGroup).toBe('6-9');
    expect(JSON.stringify(input)).not.toContain('2018-03-05');
  });

  it('沒有錢包、任務歷史、週報或其他家庭成員', () => {
    const serialized = JSON.stringify(inputFor(draft, variant)).toLowerCase();
    for (const forbidden of [
      'wallet', 'balance', 'transaction', 'sibling',
      'weekly', 'history', 'access_token', 'accesstoken', 'jwt',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('沒有任何金額 —— rewardPolicy 是背景，coinAmount 只出現在禁止清單裡', () => {
    const input = inputFor(draft, variant);
    // 「這筆任務會發成長幣」是模型需要知道的背景（它會影響建議的語氣），
    // 「會發幾枚」不是 —— 而且 AI 永遠不該碰那個數字。
    expect(input.immutablePolicies.rewardPolicy).toBe('coin_eligible');
    expect(input.immutablePolicies.blockedFields).toContain('coinAmount');

    // 草稿那一段一個金額欄位都沒有。
    const draftKeys = Object.keys(input.currentDraft).join('|').toLowerCase();
    for (const forbidden of ['coin', 'reward', 'amount', 'price']) {
      expect(draftKeys).not.toContain(forbidden);
    }
  });

  it('21. system instruction 不在 client 這一側', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'buildTaskAiInput.ts'), 'utf8');
    // prompt 完全屬於 Edge Function。放在 App 的話，任何人都改得動它。
    for (const forbidden of ['systemInstruction', '你是', 'You are', 'prompt']) {
      expect(source).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------------
// 20. parent_custom
// ---------------------------------------------------------------------------

describe('20. 自訂任務送出去的內容', () => {
  const created = createCustomTaskDraft({
    intake: {
      title: '每天閱讀',
      originalExpectation: '希望慢慢養成自己看書的習慣',
      purposeChoice: 'learn_or_practise',
      durationChoice: 'repeating',
    },
    child: CHILD,
    ageGroup: '6-9',
  });
  if (created.status !== 'created') throw new Error('自訂草稿建立失敗');
  const customDraft = created.draft;

  it('沒有 variant 也建得出 input', () => {
    const input = inputFor(customDraft);
    expect(input.taskContext.editorKind).toBe('recurring');
    // completionPolicy 由 editorKind 推導，與命令映射走同一支純函式。
    expect(input.taskContext.completionPolicy).toBe('ongoing');
  });

  it('20. 不含任何假的 preset id', () => {
    const serialized = JSON.stringify(inputFor(customDraft));
    for (const secret of MUST_NOT_LEAK) {
      expect(serialized).not.toContain(secret);
    }
    // catalog 的 id 前綴一個都不該出現。
    expect(serialized).not.toMatch(/learn-|life-|fam-|auto-/);
    expect(serialized).not.toContain('presetFamilyId":"');
  });

  it('preset 與自訂的 input 形狀完全一樣 —— 同一支 service 吃得下', () => {
    const { family, variant } = findLearning();
    const presetInput = inputFor(createTaskDraft(family, variant, CHILD, '6-9'), variant);
    expect(Object.keys(inputFor(customDraft)).sort()).toEqual(Object.keys(presetInput).sort());
  });
});

// ---------------------------------------------------------------------------
// 12. 指紋
// ---------------------------------------------------------------------------

describe('12. input signature', () => {
  const { family, variant } = findLearning();
  const draft = createTaskDraft(family, variant, CHILD, '6-9');

  it('同一份輸入永遠算出同一個指紋', () => {
    const a = createTaskAiInputSignature(inputFor(draft, variant));
    const b = createTaskAiInputSignature(inputFor(draft, variant));
    expect(a).toBe(b);
  });

  it('鍵的順序不影響結果', () => {
    const input = inputFor(draft, variant);
    const reordered: TaskAiRecommendationInput = {
      immutablePolicies: input.immutablePolicies,
      currentDraft: input.currentDraft,
      parentIntent: input.parentIntent,
      taskContext: input.taskContext,
      childContext: input.childContext,
      schemaVersion: input.schemaVersion,
    };
    expect(createTaskAiInputSignature(reordered)).toBe(createTaskAiInputSignature(input));
  });

  it('會改變建議的欄位一動，指紋就不同', () => {
    const base = createTaskAiInputSignature(inputFor(draft, variant));
    const retitled: TaskDraft = { ...draft, title: '每天閱讀二十分鐘' };
    expect(createTaskAiInputSignature(inputFor(retitled, variant))).not.toBe(base);
  });

  it('指紋不含 clientRequestId 或時間 —— 那會讓建議一回來就過期', () => {
    const signature = createTaskAiInputSignature(inputFor(draft, variant));
    expect(signature).not.toContain('clientRequestId');
    expect(signature).not.toContain('timestamp');
    expect(signature).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
