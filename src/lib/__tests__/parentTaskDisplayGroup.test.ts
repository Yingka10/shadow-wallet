// 第七階段 C — 任務列表的分組相容性
//
// 抽屜建立的任務打破了「category 決定回饋方式」這個舊假設：
// 同樣是 D 類，選 record_only 的完成後什麼都不發，選 coin_eligible 的才發幣。
//
// 這一支守的是最低底線 ——
//   * 不發幣的任務絕對不能被歸進成長幣區（家長會據此以為孩子完成後有幣）
//   * legacy 任務的分組一個字都不能變（那是既有畫面的行為）

import {
  displayGroupShowsCoins,
  mapTaskToDisplayGroup,
  type ParentTaskDisplayGroup,
} from '../parentTaskDisplayGroup';
import type { RewardPolicyValue, TaskCategory } from '../../types/database';

// ---------------------------------------------------------------------------
// 24. 新 reward_policy 的分組
// ---------------------------------------------------------------------------

describe('新任務依 reward_policy 分組', () => {
  const CASES: Array<[RewardPolicyValue, ParentTaskDisplayGroup]> = [
    ['coin_eligible', 'coin_reward'],
    ['family_contribution', 'family_contribution'],
    ['progress_only', 'progress'],
    ['record_only', 'life_record'],
    ['time_saving_eligible', 'legacy_time_saving'],
  ];

  for (const [policy, group] of CASES) {
    it(`${policy} → ${group}`, () => {
      expect(mapTaskToDisplayGroup({ category: 'D', rewardPolicy: policy })).toBe(group);
    });
  }

  it('reward_policy 蓋過 category —— 同一個 D 類任務會落在不同區', () => {
    const groups = CASES.map(([policy]) =>
      mapTaskToDisplayGroup({ category: 'D', rewardPolicy: policy }));
    expect(new Set(groups).size).toBe(CASES.length);
  });

  it('category 換成什麼都不影響有 reward_policy 的任務', () => {
    for (const category of ['A', 'B', 'C', 'D'] as TaskCategory[]) {
      expect({ category, group: mapTaskToDisplayGroup({ category, rewardPolicy: 'record_only' }) })
        .toEqual({ category, group: 'life_record' });
    }
  });
});

// ---------------------------------------------------------------------------
// 26-27. 只有可發幣才顯示幣值
// ---------------------------------------------------------------------------

describe('哪一區可以顯示幣值', () => {
  it('只有成長幣區', () => {
    expect(displayGroupShowsCoins('coin_reward')).toBe(true);
    for (const group of
      ['life_record', 'family_contribution', 'progress', 'legacy_time_saving'] as const) {
      expect({ group, shows: displayGroupShowsCoins(group) })
        .toEqual({ group, shows: false });
    }
  });

  it('26. 家庭參與、留下紀錄、進度回饋都不顯示幣值', () => {
    for (const policy of
      ['family_contribution', 'record_only', 'progress_only'] as RewardPolicyValue[]) {
      const group = mapTaskToDisplayGroup({ category: 'D', rewardPolicy: policy });
      expect({ policy, shows: displayGroupShowsCoins(group) })
        .toEqual({ policy, shows: false });
    }
  });
});

// ---------------------------------------------------------------------------
// 25. legacy 分組不變
// ---------------------------------------------------------------------------

describe('legacy 任務（reward_policy 為 NULL）', () => {
  const LEGACY: Array<[TaskCategory, ParentTaskDisplayGroup]> = [
    ['A', 'life_record'],
    ['B', 'legacy_time_saving'],
    ['C', 'coin_reward'],
    ['D', 'coin_reward'],
  ];

  for (const [category, group] of LEGACY) {
    it(`${category} 類 → ${group}（與這一版之前相同）`, () => {
      expect(mapTaskToDisplayGroup({ category, rewardPolicy: null })).toBe(group);
      expect(mapTaskToDisplayGroup({ category })).toBe(group);
    });
  }

  it('舊的 B 類仍然走時間儲蓄那一區，不會被新的家庭參與吃掉', () => {
    // 兩者的完成行為不同：舊 B 類真的會寫 time_savings，新的家庭參與不會。
    expect(mapTaskToDisplayGroup({ category: 'B', rewardPolicy: null }))
      .toBe('legacy_time_saving');
    expect(mapTaskToDisplayGroup({ category: 'B', rewardPolicy: 'family_contribution' }))
      .toBe('family_contribution');
  });
});
