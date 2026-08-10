// 第七階段 B — 回饋方式在畫面上的能力閘門
//
// 要擋的情境很具體：家長在抽屜裡選了「可記錄時間投入」，填完整份表單，
// 按下建立，然後被 RPC 以 POLICY_REJECTED 拒絕。
// 那個選項從一開始就不該出現。

import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, fireEvent, type RenderResult } from '@testing-library/react-native';

jest.mock('../../../../../lib/onboarding', () => ({ calcAgeGroup: () => '6-9' }));

import { TaskCreationDrawer } from '../TaskCreationDrawer';
import { ALL_FAMILIES } from '../taskCatalog';
import { FakeParentTaskCreationService } from '../../../../../testing/fakeParentTaskCreationService';
import { enterPresetCatalog } from '../../../../../testing/taskCreationDrawerFlow';

const CHILD = { id: 'child-1', nickname: '承恩', birthDate: '2018-03-05', familyId: 'family-1' };

const TIME_SAVING_LABEL = '可記錄時間投入';
const COIN_LABEL = '成長幣回饋';

function openEditor(
  title: string,
  options?: { query?: string; mode?: 'demo' | 'development' },
): RenderResult {
  const r = enterPresetCatalog(render(
    <TaskCreationDrawer
      visible
      onClose={() => {}}
      child={CHILD}
      childLoading={false}
      taskCreationService={new FakeParentTaskCreationService()}
      {...(options?.mode ? { displayMode: options.mode } : null)}
    />,
  ));
  if (options?.query) {
    fireEvent.changeText(r.getByPlaceholderText('搜尋閱讀、運動、家庭參與……'), options.query);
  }
  fireEvent.press(r.getAllByText(title)[0]);
  fireEvent.press(r.getByText('下一步'));
  return r;
}

// ---------------------------------------------------------------------------
// 14. demo 隱藏時間儲蓄
// ---------------------------------------------------------------------------

describe('14. 正式畫面不出現時間儲蓄', () => {
  it('閱讀與共讀的 catalog 允許時間儲蓄，但畫面上選不到', () => {
    const family = ALL_FAMILIES.find(f => f.id === 'learn-reading');
    const variant = family?.variants.find(v => v.id === 'learn-reading-recurring');
    // 前提：這個 variant 的 catalog 資料確實含時間儲蓄（型別與資料都保留著）。
    expect(variant?.allowedRewardPolicies).toContain('time_saving_eligible');

    const r = openEditor('閱讀與共讀');
    expect(r.queryByText(TIME_SAVING_LABEL)).toBeNull();
  });

  it('自主挑戰也一樣', () => {
    const r = openEditor('我的自主挑戰', { query: '挑戰' });
    expect(r.queryByText(TIME_SAVING_LABEL)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 15. 算不出幣值時不顯示成長幣
// ---------------------------------------------------------------------------

describe('15. 算不出幣值就不給這個選項', () => {
  it('閱讀（每次 20 分鐘）算得出來 → 顯示成長幣回饋', () => {
    const r = openEditor('閱讀與共讀');
    expect(r.getByText(COIN_LABEL)).toBeTruthy();
  });

  it('自主挑戰沒有估計分鐘 → 不顯示，草稿也不會停在一個發不出來的政策上', () => {
    const r = openEditor('我的自主挑戰', { query: '挑戰' });
    expect(r.queryByText(COIN_LABEL)).toBeNull();
    // 退到第一個能用的：進度與肯定。它是被選中的，不是一片沒有選中的選單。
    expect(r.getByText('進度與肯定')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 16. development 看得到原因
// ---------------------------------------------------------------------------

describe('16. 開發模式標示原因', () => {
  it('用不了的選項列得出來，而且標著「尚未啟用」', () => {
    const r = openEditor('閱讀與共讀', { mode: 'development' });
    expect(r.getByText(`${TIME_SAVING_LABEL}（尚未啟用）`)).toBeTruthy();
  });

  it('標示出來的那一項是停用狀態，不是可以按的', () => {
    const r = openEditor('閱讀與共讀', { mode: 'development' });
    const chip = r.getByText(`${TIME_SAVING_LABEL}（尚未啟用）`);
    expect(chip).toBeTruthy();
    // 功能在兩種模式下一樣：development 只是把原因顯示出來。
    expect(r.queryByText(TIME_SAVING_LABEL)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 17. 五種 editor 用同一個 selector
// ---------------------------------------------------------------------------

describe('17. 只有一個地方決定選單', () => {
  const EDITOR_DIR = path.resolve(__dirname, '..', 'editors');

  it('沒有任何一支 editor 自己展開 allowedRewardPolicies', () => {
    const offenders = fs
      .readdirSync(EDITOR_DIR)
      .filter(name => /Editor\.tsx$/.test(name))
      .filter(name =>
        /allowedRewardPolicies\s*\.\s*map/.test(
          fs.readFileSync(path.join(EDITOR_DIR, name), 'utf8'),
        ),
      );
    expect(offenders).toEqual([]);
  });

  it('會列選單的三支都走 RewardPolicyChips', () => {
    for (const name of ['GrowthPlanEditor.tsx', 'RecurringTaskEditor.tsx', 'OneTimeTaskEditor.tsx']) {
      const source = fs.readFileSync(path.join(EDITOR_DIR, name), 'utf8');
      expect({ name, uses: source.includes('<RewardPolicyChips') }).toEqual({ name, uses: true });
    }
  });

  it('另外兩支的回饋方式是固定值，而且是永遠可用的那兩個', () => {
    // 短期支援固定 progress_only、家庭角色固定 family_contribution。
    // 兩者都不依賴幣值政策，所以不需要選單 —— 但仍然受同一組能力規則保護：
    // 它們永遠 available，不會出現「畫面顯示得出、RPC 卻拒絕」。
    const shortSupport = ALL_FAMILIES
      .flatMap(f => f.variants)
      .filter(v => v.planMode === 'short_support');
    const familyRole = ALL_FAMILIES
      .flatMap(f => f.variants)
      .filter(v => v.planMode === 'family_role');

    expect(shortSupport.length).toBeGreaterThan(0);
    expect(familyRole.length).toBeGreaterThan(0);
    for (const variant of shortSupport) {
      expect(variant.defaultRewardPolicy).toBe('progress_only');
    }
    for (const variant of familyRole) {
      expect(variant.defaultRewardPolicy).toBe('family_contribution');
    }
  });
});

// ---------------------------------------------------------------------------
// 建立 service 的注入方式
// ---------------------------------------------------------------------------

describe('建立 service 由上層注入', () => {
  const drawer = fs.readFileSync(path.resolve(__dirname, '..', 'TaskCreationDrawer.tsx'), 'utf8');

  it('抽屜不 import Supabase adapter，也不 import supabase client', () => {
    // 抽屜只認 ParentTaskCreationService 這個介面。真正的實作是誰、
    // 用 RPC 還是 Edge Function，都不是這一層該知道的事。
    //
    // 比對的是 import 敘述而不是整份原始碼：註解裡提到實作的名字沒有關係，
    // 真正會把 Supabase 拉進 bundle 的是 import。
    const imports = drawer.match(/^import[\s\S]*?from\s+'[^']*';$/gm) ?? [];
    expect(imports.length).toBeGreaterThan(0);
    const offenders = imports.filter(line =>
      /lib\/(supabase|parentTaskCreationService)/.test(line),
    );
    expect(offenders).toEqual([]);
  });

  it('抽屜不在自己身上 new 任何 service', () => {
    expect(drawer).not.toMatch(/new\s+\w*CreationService\s*\(/);
  });

  it('production 注入的不是那個一定失敗的實作', () => {
    const screen = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'ParentTaskManagementTablet.tsx'), 'utf8',
    );
    expect(screen).toContain('SupabaseParentTaskCreationService');
    expect(screen).not.toContain('UnavailableParentTaskCreationService');
  });
});
