// P0-1 — 孩子提案狀態機
//
// 這支測的是 TS 那一份轉換表。SQL 那一份與它的一致性由
// src/lib/__tests__/childProposalContractMigration.test.ts 的 parity 段負責。

// 直接指向 transitions／types，不走 barrel：狀態機不該為了被測試
// 而把 supabase client 一起載進來。
import {
  CHILD_PROPOSAL_TRANSITIONS,
  acceptsTrialEvents,
  earnsCoins,
  isChildProposalTerminal,
  isChildProposalTransitionAllowed,
  nextChildProposalStatuses,
} from '../transitions';
import { CHILD_PROPOSAL_STATUSES } from '../types';
import type { ChildProposalActorRole, ChildProposalStatus } from '../types';

const ACTORS: ChildProposalActorRole[] = ['child', 'parent'];

describe('合法轉換', () => {
  it.each([
    ['draft', 'proposed', 'child'],
    ['proposed', 'needs_child_review', 'parent'],
    ['proposed', 'active', 'parent'],
    ['proposed', 'closed_unsuitable', 'parent'],
    ['needs_child_review', 'active', 'child'],
    ['needs_child_review', 'proposed', 'child'],
    ['needs_child_review', 'closed_unsuitable', 'parent'],
  ] as [ChildProposalStatus, ChildProposalStatus, ChildProposalActorRole][])(
    '%s → %s（%s）可以成功',
    (from, to, actor) => {
      expect(isChildProposalTransitionAllowed(from, to, actor)).toBe(true);
    },
  );

  it('全部七條都被涵蓋 —— 少一條代表上面的清單漏了', () => {
    expect(CHILD_PROPOSAL_TRANSITIONS).toHaveLength(7);
  });
});

describe('非法轉換', () => {
  it('孩子不能自己把提案變成共同版本（跳過家長確認）', () => {
    expect(isChildProposalTransitionAllowed('proposed', 'active', 'child')).toBe(false);
  });

  it('家長不能替孩子送出 draft —— draft 只屬於孩子', () => {
    expect(isChildProposalTransitionAllowed('draft', 'proposed', 'parent')).toBe(false);
  });

  it('家長看不到 draft，所以也不能直接回絕它', () => {
    for (const actor of ACTORS) {
      expect(isChildProposalTransitionAllowed('draft', 'closed_unsuitable', actor)).toBe(false);
    }
  });

  it('draft 不能一步變成共同版本', () => {
    for (const actor of ACTORS) {
      expect(isChildProposalTransitionAllowed('draft', 'active', actor)).toBe(false);
    }
  });

  it('proposed 不能退回 draft —— 家長已經看過了，退回去是改寫歷史', () => {
    for (const actor of ACTORS) {
      expect(isChildProposalTransitionAllowed('proposed', 'draft', actor)).toBe(false);
    }
  });

  it('被回絕的提案不會自己復活', () => {
    for (const to of CHILD_PROPOSAL_STATUSES) {
      for (const actor of ACTORS) {
        expect(isChildProposalTransitionAllowed('closed_unsuitable', to, actor)).toBe(false);
      }
    }
  });

  it('active 在 P0 是終點：後續調整走 adjustment request', () => {
    for (const to of CHILD_PROPOSAL_STATUSES) {
      for (const actor of ACTORS) {
        expect(isChildProposalTransitionAllowed('active', to, actor)).toBe(false);
      }
    }
  });

  it('沒有任何狀態可以轉回自己（no-op 不是轉換）', () => {
    for (const status of CHILD_PROPOSAL_STATUSES) {
      expect(isChildProposalTransitionAllowed(status, status)).toBe(false);
    }
  });

  it('不指定 actor 時只檢查形狀，仍然擋得住形狀錯誤', () => {
    expect(isChildProposalTransitionAllowed('proposed', 'active')).toBe(true);
    expect(isChildProposalTransitionAllowed('closed_unsuitable', 'active')).toBe(false);
  });
});

describe('nextChildProposalStatuses', () => {
  it('家長在 proposed 有三個選擇：要孩子確認、成立、回絕', () => {
    expect(nextChildProposalStatuses('proposed', 'parent').sort()).toEqual(
      ['active', 'closed_unsuitable', 'needs_child_review'],
    );
  });

  it('孩子在 proposed 什麼都不能做 —— 球在家長那裡', () => {
    expect(nextChildProposalStatuses('proposed', 'child')).toEqual([]);
  });

  it('終點狀態沒有任何下一步', () => {
    for (const actor of ACTORS) {
      expect(nextChildProposalStatuses('active', actor)).toEqual([]);
      expect(nextChildProposalStatuses('closed_unsuitable', actor)).toEqual([]);
    }
  });
});

describe('P0 幣值與試行的邊界', () => {
  it('只有 active 會依 policy 入帳', () => {
    for (const status of CHILD_PROPOSAL_STATUSES) {
      expect({ status, earns: earnsCoins(status) })
        .toEqual({ status, earns: status === 'active' });
    }
  });

  it('試行紀錄只屬於尚未成立的提案', () => {
    expect(acceptsTrialEvents('draft')).toBe(true);
    expect(acceptsTrialEvents('proposed')).toBe(true);
    expect(acceptsTrialEvents('needs_child_review')).toBe(true);
    // active 之後走 task_completions —— 那條路徑才有 coin policy。
    expect(acceptsTrialEvents('active')).toBe(false);
    expect(acceptsTrialEvents('closed_unsuitable')).toBe(false);
  });

  it('可以試行的狀態與會入帳的狀態沒有交集 —— 這就是「試行不入帳」', () => {
    const overlap = CHILD_PROPOSAL_STATUSES.filter(
      (s) => acceptsTrialEvents(s) && earnsCoins(s),
    );
    expect(overlap).toEqual([]);
  });

  it('終點狀態就是那兩個', () => {
    expect(CHILD_PROPOSAL_STATUSES.filter(isChildProposalTerminal))
      .toEqual(['active', 'closed_unsuitable']);
  });
});
