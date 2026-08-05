// 回饋方式選項 —— 家庭參與政策修訂的執行面。
//
// 這一組測試同時釘住兩件很容易被混在一起的事：
//   「產品理念上允不允許」  → availability
//   「系統現在算不算得出」  → coinAmountStatus
//
// 修訂前，家庭參與 ＋ 成長幣是硬擋。修訂後它是「可以，但要說明是哪一種情況」。
// 而在 coin-policy.json 補上 B 類數字之前，它仍然**建立不出來** ——
// 那不是政策問題，是缺一份還沒拍板的資料。

import {
  canFinalizeRewardOption,
  evaluateCustomTaskRewardOptions,
  type RewardOptionPresentation,
} from '../customTaskRewardOptions';
import {
  rewardSupportIntentDescriptor,
  REWARD_SUPPORT_INTENTS,
} from '../customTaskContract';

function optionsFor(
  over: Partial<Parameters<typeof evaluateCustomTaskRewardOptions>[0]> = {},
): RewardOptionPresentation[] {
  return evaluateCustomTaskRewardOptions({
    ageGroup: '6-9',
    purposeCategory: 'family_participation',
    editorKind: 'recurring',
    ...over,
  });
}

function find(
  options: RewardOptionPresentation[],
  policy: RewardOptionPresentation['rewardPolicy'],
): RewardOptionPresentation {
  const found = options.find((o) => o.rewardPolicy === policy);
  if (!found) throw new Error(`選項裡沒有 ${policy}`);
  return found;
}

describe('14-16. 家庭參與的三種回饋', () => {
  it('14. 家庭貢獻是 recommended', () => {
    const option = find(optionsFor(), 'family_contribution');
    expect(option.availability).toBe('recommended');
    expect(option.reasonCode).toBe('FAMILY_PARTICIPATION_DEFAULT');
  });

  it('15. 進度與肯定是 available（不再被擋掉）', () => {
    // 修訂前 RPC 只接受 family_contribution，連「只留下紀錄」都會被拒。
    expect(find(optionsFor(), 'progress_only').availability).toBe('available');
    expect(find(optionsFor(), 'record_only').availability).toBe('available');
  });

  it('16. 成長幣是 available_with_confirmation，而且要求說明支持意圖', () => {
    const option = find(optionsFor(), 'coin_eligible');
    expect(option.availability).toBe('available_with_confirmation');
    expect(option.requiresSupportIntent).toBe(true);
    // 不再是 unavailable —— 這是這一輪修訂的核心。
    expect(option.availability).not.toBe('unavailable');
  });
});

describe('17-18. 支持意圖的差別', () => {
  it('17. 暫時起步支持要求回顧時間', () => {
    const intent = rewardSupportIntentDescriptor('temporary_startup_support');
    expect(intent.requiresReviewTiming).toBe(true);
    expect(intent.suggestsStepDown).toBe(true);
  });

  it('18. 家庭自訂約定不強制回顧、也不提醒退場', () => {
    // 對一個既有的家庭制度跳出「多久後檢討」是在指導別人怎麼過日子。
    const intent = rewardSupportIntentDescriptor('family_defined_agreement');
    expect(intent.requiresReviewTiming).toBe(false);
    expect(intent.suggestsStepDown).toBe(false);
  });

  it('預設意圖不使用成長幣', () => {
    const intent = rewardSupportIntentDescriptor('default');
    expect(intent.requiresReviewTiming).toBe(false);
    expect(intent.suggestsStepDown).toBe(false);
  });

  it('家庭自訂約定的說明不把它包裝成 GrowBook 的建議做法', () => {
    const intent = rewardSupportIntentDescriptor('family_defined_agreement');
    expect(intent.description).toMatch(/不會把它當成建議做法|照實記錄/);
  });

  it('三種意圖都有明確定義，沒有預設值黑洞', () => {
    expect(REWARD_SUPPORT_INTENTS).toHaveLength(3);
    for (const i of REWARD_SUPPORT_INTENTS) {
      expect(typeof i.label).toBe('string');
      expect(i.label.length).toBeGreaterThan(0);
    }
  });
});

describe('19. AI 不能選 support intent', () => {
  it('支持意圖不在 AI 的 fieldPath allowlist 裡', () => {
    // AI 契約的 allowlist 是白名單。只要 rewardSupportIntent 沒有被加進去，
    // 一個想改它的建議會在 outputValidator 被整批丟掉。
    // 這條測試釘住「沒有人順手把它加進去」。
    const contract = jest.requireActual(
      '../../../../../../../supabase/functions/task-ai-recommendation/contract.json',
    ) as { allowedFieldPaths: Record<string, string>; explicitlyForbiddenPaths: string[] };

    const paths = Object.keys(contract.allowedFieldPaths);
    for (const forbidden of ['rewardSupportIntent', 'rewardPolicy', 'purposeCategory', 'coinAmount']) {
      expect({ forbidden, allowed: paths.includes(forbidden) })
        .toEqual({ forbidden, allowed: false });
    }
    // rewardPolicy 與 coinAmount 更進一步被列入明確禁止清單。
    expect(contract.explicitlyForbiddenPaths).toContain('rewardPolicy');
    expect(contract.explicitlyForbiddenPaths).toContain('coinAmount');
  });
});

describe('20. B 類沒有幣值政策時不可 finalize', () => {
  it('家庭參與的成長幣選項標成 policy_missing', () => {
    const option = find(optionsFor({ estimatedMinutes: 20 }), 'coin_eligible');
    expect(option.coinAmountStatus).toBe('policy_missing');
    expect(option.reasonCode).toBe('COIN_POLICY_MISSING_FOR_CATEGORY');
  });

  it('就算給了估計分鐘也算不出來 —— 缺的是政策不是輸入', () => {
    for (const minutes of [5, 15, 30, 60]) {
      const option = find(optionsFor({ estimatedMinutes: minutes }), 'coin_eligible');
      expect({ minutes, status: option.coinAmountStatus })
        .toEqual({ minutes, status: 'policy_missing' });
    }
  });

  it('沒有金額的成長幣選項不可 finalize', () => {
    // 「理念上允許」不等於「現在建得出來」。這條把兩者分開 ——
    // 少了它，家長會填完整份表單才在最後一步被 RPC 拒絕。
    const option = find(optionsFor({ estimatedMinutes: 20 }), 'coin_eligible');
    expect(canFinalizeRewardOption(option)).toBe(false);
  });

  it('不發幣的選項不受影響，照常可以 finalize', () => {
    const options = optionsFor();
    for (const policy of ['family_contribution', 'progress_only', 'record_only'] as const) {
      expect({ policy, ok: canFinalizeRewardOption(find(options, policy)) })
        .toEqual({ policy, ok: true });
    }
  });

  it('沒有從 C 或 D 偷幣值規則來代算', () => {
    // 同樣的年齡段與分鐘數，C 類算得出來、B 類算不出來。
    // 兩者一樣的話就代表有人把分類拿掉了。
    const b = find(optionsFor({ estimatedMinutes: 20 }), 'coin_eligible');
    const c = find(
      optionsFor({ purposeCategory: 'autonomous_challenge', estimatedMinutes: 20 }),
      'coin_eligible',
    );
    expect(b.coinAmountStatus).toBe('policy_missing');
    expect(c.coinAmountStatus).toBe('available');
  });
});

describe('21. C／D 既有 coin policy 不變', () => {
  it('有估計分鐘就算得出金額，並且是 recommended', () => {
    for (const purpose of ['autonomous_challenge', 'learning_skill'] as const) {
      const option = find(optionsFor({ purposeCategory: purpose, estimatedMinutes: 20 }), 'coin_eligible');
      expect({ purpose, availability: option.availability, amount: option.coinAmountStatus })
        .toEqual({ purpose, availability: 'recommended', amount: 'available' });
    }
  });

  it('沒有估計分鐘就算不出來，理由講清楚是缺輸入', () => {
    const option = find(optionsFor({ purposeCategory: 'learning_skill' }), 'coin_eligible');
    expect(option.coinAmountStatus).toBe('policy_missing');
    expect(option.reasonCode).toBe('COIN_POLICY_NEEDS_ESTIMATED_MINUTES');
    expect(canFinalizeRewardOption(option)).toBe(false);
  });

  it('年齡段的發幣資格照 coin-policy.json，沒有被繞過', () => {
    // 2-4 歲在政策裡是 coinEnabled: false（「原則上不獨立呈現、不發幣」）。
    // 這條同時證明兩件事：分齡規則有生效，而且我們沒有為了讓測試全綠
    // 去改政策數字。
    const expected: Record<string, string> = {
      '2-4': 'policy_missing',
      '4-6': 'available',
      '6-9': 'available',
      '9-12': 'available',
    };

    for (const [ageGroup, amount] of Object.entries(expected)) {
      const option = find(
        optionsFor({ ageGroup, purposeCategory: 'learning_skill', estimatedMinutes: 15 }),
        'coin_eligible',
      );
      expect({ ageGroup, amount: option.coinAmountStatus }).toEqual({ ageGroup, amount });
    }
  });
});

describe('22. A 類既有短期退場邏輯不變', () => {
  it('生活常規的成長幣仍然是 unavailable', () => {
    // 這一輪修訂的只有家庭參與。把照顧自己標價會讓孩子學到
    // 照顧自己是有償的 —— 那個理由和家庭分工完全不同。
    const option = find(optionsFor({ purposeCategory: 'life_routine', editorKind: 'recurring' }), 'coin_eligible');
    expect(option.availability).toBe('unavailable');
    expect(option.reasonCode).toBe('ROUTINE_NOT_A_COIN_SOURCE');
    expect(canFinalizeRewardOption(option)).toBe(false);
  });

  it('短期支援只有進度與肯定一個選項', () => {
    const options = optionsFor({ purposeCategory: 'life_routine', editorKind: 'short_support' });
    expect(options.map((o) => o.rewardPolicy)).toEqual(['progress_only']);
    expect(options[0].availability).toBe('recommended');
  });
});

describe('被政策鎖死的兩種形式', () => {
  it('家庭角色只有家庭貢獻一個選項', () => {
    const options = optionsFor({ editorKind: 'family_role' });
    expect(options.map((o) => o.rewardPolicy)).toEqual(['family_contribution']);
  });

  it('這兩種形式不會出現選了會被 RPC 拒絕的選項', () => {
    // create_parent_task_v1 的 guard：短期支援必須 progress_only、
    // 家庭角色必須 family_contribution。這裡就只列一個，
    // 家長不會看到一個選了會失敗的東西。
    for (const kind of ['short_support', 'family_role'] as const) {
      const options = optionsFor({ editorKind: kind });
      expect({ kind, count: options.length }).toEqual({ kind, count: 1 });
      expect(canFinalizeRewardOption(options[0])).toBe(true);
    }
  });
});

describe('時間儲蓄', () => {
  it('列出來但標明不可用 —— 不是漏寫', () => {
    const option = find(optionsFor(), 'time_saving_eligible');
    expect(option.availability).toBe('unavailable');
    expect(option.reasonCode).toBe('TIME_SAVING_NOT_ENABLED');
  });
});
