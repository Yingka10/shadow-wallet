// 第七階段 C — 抽屜的建立流程
//
// 這一支測的不是「按鈕會不會亮」，是幾件真的會傷到家長的事：
//
//   * 連點兩下不會建出兩筆任務
//   * 提交進行中關不掉抽屜（RPC 可能已經成功，關掉再重試最難收拾）
//   * 網路失敗後重試沿用同一個識別碼
//   * 建立失敗時草稿不會被清掉
//   * 不發幣的任務不會在成功畫面上出現「0 枚」
//   * 錯誤畫面不會把 Postgres 的原始訊息端到家長面前
//
// 只 mock lib/onboarding（它會連帶把 supabase client 拉進來，測試環境沒有 env）。
// 建立 service 用 fake，jest 不連任何資料庫。

import React from 'react';
import fs from 'fs';
import path from 'path';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('../../../../../lib/onboarding', () => ({ calcAgeGroup: () => '6-9' }));

import { TaskCreationDrawer } from '../TaskCreationDrawer';
import { FakeParentTaskCreationService } from '../../../../../testing/fakeParentTaskCreationService';
import { enterPresetCatalog } from '../../../../../testing/taskCreationDrawerFlow';

const CHILD = { id: 'child-1', nickname: '承恩', birthDate: '2018-03-05', familyId: 'family-1' };

type Options = {
  service?: FakeParentTaskCreationService;
  onClose?: () => void;
  onRefreshTaskList?: () => Promise<void>;
  onSwitchTab?: (tab: 'daily' | 'longTerm') => void;
  displayMode?: 'demo' | 'development';
};

function open(options: Options = {}) {
  const service = options.service ?? new FakeParentTaskCreationService();
  const onClose = options.onClose ?? jest.fn();
  const r = enterPresetCatalog(render(
    <TaskCreationDrawer
      visible
      onClose={onClose}
      child={CHILD}
      childLoading={false}
      taskCreationService={service}
      {...(options.onRefreshTaskList ? { onRefreshTaskList: options.onRefreshTaskList } : null)}
      {...(options.onSwitchTab ? { onSwitchTab: options.onSwitchTab } : null)}
      {...(options.displayMode ? { displayMode: options.displayMode } : null)}
    />,
  ));
  return { r, service, onClose };
}

/** 走到「閱讀與共讀」的預覽畫面 —— 學習類、可發幣，是最完整的那條路。 */
function openReadingReview(options: Options = {}) {
  const opened = open(options);
  const { r } = opened;
  fireEvent.press(r.getAllByText('閱讀與共讀')[0]);
  fireEvent.press(r.getByText('下一步'));
  fireEvent.press(r.getByLabelText('用什麼方式進行？：自己閱讀'));
  fireEvent.press(r.getByText('檢查並預覽'));
  return opened;
}

/** 走到「餐桌固定任務」的預覽畫面 —— 家庭參與，不發幣。 */
function openFamilyRoleReview(options: Options = {}) {
  const opened = open(options);
  const { r } = opened;
  fireEvent.press(r.getAllByText('家庭參與')[0]);
  fireEvent.press(r.getAllByText('用餐前準備餐桌')[0]);
  fireEvent.press(r.getByText('下一步'));
  fireEvent.press(r.getByText('檢查並預覽'));
  return opened;
}

async function confirmCreate(r: ReturnType<typeof render>) {
  await act(async () => {
    fireEvent.press(r.getByLabelText('確認建立'));
  });
}

// ---------------------------------------------------------------------------
// A. 提交流程
// ---------------------------------------------------------------------------

describe('提交', () => {
  it('1. 預覽通過時可以確認建立，service 收到一份完整命令', async () => {
    const { r, service } = openReadingReview();
    await confirmCreate(r);

    expect(service.callCount).toBe(1);
    const command = service.calls[0];
    expect(command?.metadata.createdFromPreset).toBe(true);
    expect(command?.childId).toBe('child-1');
    expect(command?.familyId).toBe('family-1');
    expect(command?.reward.decision.eligibility).toBe('allowed');
  });

  it('4. 成功後進入成功畫面，而不是停在 disabled 的按鈕上', async () => {
    const { r } = openReadingReview();
    await confirmCreate(r);

    expect(r.getByText('任務已建立')).toBeTruthy();
    expect(r.getByText('查看任務')).toBeTruthy();
    expect(r.queryByLabelText('確認建立')).toBeNull();
  });

  it('2. 提交中按鈕 disabled、文案換成建立中', async () => {
    const service = new FakeParentTaskCreationService({ kind: 'manual' });
    const { r } = openReadingReview({ service });

    await act(async () => {
      fireEvent.press(r.getByLabelText('確認建立'));
    });

    await waitFor(() => expect(r.getByText('建立中…')).toBeTruthy());
    const button = r.getByLabelText('正在建立任務，請稍候');
    expect(button.props.accessibilityState.disabled).toBe(true);
    expect(button.props.accessibilityState.busy).toBe(true);

    await act(async () => {
      service.resolveManual({
        ok: true, taskId: 't-1', relatedIds: [], idempotentReplay: false,
      });
    });
  });

  it('5. 連點兩下只送一次', async () => {
    const service = new FakeParentTaskCreationService({ kind: 'manual' });
    const { r } = openReadingReview({ service });

    // 同一個 tick 內連按兩下：state 還沒更新，只有同步的 ref 擋得住。
    await act(async () => {
      const button = r.getByLabelText('確認建立');
      fireEvent.press(button);
      fireEvent.press(button);
    });

    expect(service.callCount).toBe(1);

    await act(async () => {
      service.resolveManual({
        ok: true, taskId: 't-1', relatedIds: [], idempotentReplay: false,
      });
    });
  });

  it('6. 失敗後重試沿用同一個建立請求識別碼', async () => {
    const service = new FakeParentTaskCreationService({ kind: 'persistenceFailed' });
    const { r } = openReadingReview({ service });

    await confirmCreate(r);
    service.setBehaviour({ kind: 'success', idempotentReplay: true });
    await confirmCreate(r);

    expect(service.callCount).toBe(2);
    const [first, second] = service.requestIds;
    // 這一條就是整套 idempotency 的重點：換了 id，RPC 就會建出第二筆任務。
    expect(second).toBe(first);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('18. idempotent replay 一樣進成功畫面', async () => {
    const service = new FakeParentTaskCreationService({
      kind: 'success', idempotentReplay: true,
    });
    const { r } = openReadingReview({ service });
    await confirmCreate(r);
    expect(r.getByText('任務已建立')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 八. 提交中不可離開
// ---------------------------------------------------------------------------

describe('提交中鎖住離開', () => {
  async function startSubmitting() {
    const service = new FakeParentTaskCreationService({ kind: 'manual' });
    const onClose = jest.fn();
    const { r } = openReadingReview({ service, onClose });
    await act(async () => {
      fireEvent.press(r.getByLabelText('確認建立'));
    });
    return { r, service, onClose };
  }

  it('3a. X 按不動', async () => {
    const { r, onClose, service } = await startSubmitting();
    // X 與遮罩提交中共用同一句 label —— 兩個都要按不動。
    for (const node of r.getAllByLabelText('建立中，暫時無法關閉')) {
      fireEvent.press(node);
    }
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      service.resolveManual({
        ok: true, taskId: 't-1', relatedIds: [], idempotentReplay: false,
      });
    });
  });

  it('3b. 提交中「關不掉」的入口不只一個，全部都擋住', async () => {
    const { r, onClose, service } = await startSubmitting();
    const blocked = r.getAllByLabelText('建立中，暫時無法關閉');
    // X 與遮罩，兩個入口都在。
    expect(blocked.length).toBeGreaterThanOrEqual(2);
    for (const node of blocked) {
      expect(node.props.accessibilityState.disabled).toBe(true);
    }
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      service.resolveManual({
        ok: true, taskId: 't-1', relatedIds: [], idempotentReplay: false,
      });
    });
  });

  it('3c. 返回修改按不動，也不跳放棄確認', async () => {
    const { r, service } = await startSubmitting();
    fireEvent.press(r.getByText('返回修改'));
    // 仍在預覽的提交狀態，沒有回到編輯畫面，也沒有出現放棄確認。
    expect(r.getByText('建立中…')).toBeTruthy();
    expect(r.queryByText('要放棄這次的調整嗎？')).toBeNull();

    await act(async () => {
      service.resolveManual({
        ok: true, taskId: 't-1', relatedIds: [], idempotentReplay: false,
      });
    });
  });

  it('3d. 提交中會說明為什麼關不掉', async () => {
    const { r, service } = await startSubmitting();
    expect(r.getAllByText('任務正在建立，請稍候。').length).toBeGreaterThan(0);

    await act(async () => {
      service.resolveManual({
        ok: true, taskId: 't-1', relatedIds: [], idempotentReplay: false,
      });
    });
  });

  it('3e. ESC 與 X、遮罩走同一道鎖', () => {
    // ESC listener 只在 web 掛上（RN 沒有鍵盤事件），這裡測不到行為，
    // 所以直接確認它讀的是同一個同步鎖 —— 三條路徑分開判斷遲早會有一條漏掉。
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', 'TaskCreationDrawer.tsx'), 'utf8',
    );
    const escBlock = source.slice(
      source.indexOf("if (event.key !== 'Escape') return;"),
      source.indexOf('doc.addEventListener'),
    );
    expect(escBlock).toContain('submitLockRef.current');
  });
});

// ---------------------------------------------------------------------------
// B. 錯誤
// ---------------------------------------------------------------------------

describe('錯誤呈現', () => {
  it('7. 欄位錯誤回到編輯畫面，草稿還在', async () => {
    const service = new FakeParentTaskCreationService({
      kind: 'validationError',
      fieldErrors: { 'option:reading_method': '這個選項需要重新確認' },
    });
    const { r } = openReadingReview({ service });
    await confirmCreate(r);

    // 回到編輯畫面（預覽的按鈕不見了、編輯的出現了）。
    expect(r.getByText('檢查並預覽')).toBeTruthy();
    expect(r.queryByLabelText('確認建立')).toBeNull();
    // RPC 給的欄位錯誤被餵回原本的 field-keyed errors。
    expect(r.getByText('這個選項需要重新確認')).toBeTruthy();
  });

  it('8. 政策錯誤留在預覽，並顯示 service 給的理由', async () => {
    const service = new FakeParentTaskCreationService({
      kind: 'policyRejected', message: '學校作業只能留下紀錄或以進度與肯定回饋',
    });
    const { r } = openReadingReview({ service });
    await confirmCreate(r);

    expect(r.getByLabelText('確認建立')).toBeTruthy();
    expect(r.getByText('學校作業只能留下紀錄或以進度與肯定回饋')).toBeTruthy();
  });

  it('9. 寫入失敗保留草稿，按鈕恢復可按，可以再送一次', async () => {
    const service = new FakeParentTaskCreationService({ kind: 'persistenceFailed' });
    const { r } = openReadingReview({ service });
    await confirmCreate(r);

    expect(r.getByText('任務尚未建立，請稍後再試。')).toBeTruthy();
    const button = r.getByLabelText('確認建立');
    expect(button.props.accessibilityState.disabled).toBe(false);

    await confirmCreate(r);
    expect(service.callCount).toBe(2);
  });

  it('10. demo 模式不把 Postgres 原始訊息端給家長', async () => {
    const service = new FakeParentTaskCreationService({ kind: 'unknown' });
    const { r } = openReadingReview({ service });
    await confirmCreate(r);

    expect(r.getByText('建立時發生預期外的問題，任務尚未建立。')).toBeTruthy();
    expect(r.queryByText(/PGRST202/)).toBeNull();
    expect(r.queryByText(/UNKNOWN/)).toBeNull();
  });

  it('10b. development 模式才看得到內部 code', async () => {
    const service = new FakeParentTaskCreationService({ kind: 'unknown' });
    const { r } = openReadingReview({ service, displayMode: 'development' });
    await confirmCreate(r);

    expect(r.getByText(/UNKNOWN/)).toBeTruthy();
  });

  it('失敗時完全沒有進成功畫面', async () => {
    const service = new FakeParentTaskCreationService({ kind: 'persistenceFailed' });
    const { r } = openReadingReview({ service });
    await confirmCreate(r);
    expect(r.queryByText('任務已建立')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// C. 成功畫面
// ---------------------------------------------------------------------------

describe('成功畫面', () => {
  it('11-12. 顯示任務名稱與正確幣值', async () => {
    const { r, service } = openReadingReview();
    await confirmCreate(r);

    const decision = service.calls[0]?.reward.decision;
    if (decision?.eligibility !== 'allowed' || decision.rewardPolicy !== 'coin_eligible') {
      throw new Error('閱讀任務應該是可發幣的');
    }
    expect(r.getByText(`完成後可獲得 ${decision.coin.finalAmount} 枚成長幣`)).toBeTruthy();
  });

  it('13. 家庭參與不顯示 0 幣', async () => {
    const { r } = openFamilyRoleReview();
    await confirmCreate(r);

    expect(r.getByText('記入本週家庭參與')).toBeTruthy();
    expect(r.queryByText(/0 枚/)).toBeNull();
    expect(r.queryByText(/成長幣/)).toBeNull();
  });

  it('16. 成功後會刷新列表', async () => {
    const onRefreshTaskList = jest.fn().mockResolvedValue(undefined);
    const { r } = openReadingReview({ onRefreshTaskList });
    await confirmCreate(r);
    expect(onRefreshTaskList).toHaveBeenCalledTimes(1);
  });

  it('14. 查看任務切到正確分頁並關閉抽屜', async () => {
    const onSwitchTab = jest.fn();
    const onClose = jest.fn();
    const { r } = openReadingReview({ onSwitchTab, onClose });
    await confirmCreate(r);

    await act(async () => {
      fireEvent.press(r.getByText('查看任務'));
    });
    // 閱讀的固定練習是日常任務。
    expect(onSwitchTab).toHaveBeenCalledWith('daily');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('15. 完成不切分頁', async () => {
    const onSwitchTab = jest.fn();
    const onClose = jest.fn();
    const { r } = openReadingReview({ onSwitchTab, onClose });
    await confirmCreate(r);

    await act(async () => {
      fireEvent.press(r.getByText('完成'));
    });
    expect(onSwitchTab).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('17. 刷新失敗不說建立失敗，也不再建立一次', async () => {
    const onRefreshTaskList = jest.fn().mockRejectedValue(new Error('network'));
    const service = new FakeParentTaskCreationService();
    const { r } = openReadingReview({ service, onRefreshTaskList });
    await confirmCreate(r);

    expect(r.getByText('任務已建立')).toBeTruthy();
    expect(r.getByText('任務已建立，但列表暫時沒有更新。')).toBeTruthy();
    expect(r.queryByText('建立失敗')).toBeNull();

    // 「再次更新」只重跑刷新，不會再呼叫一次建立。
    await act(async () => {
      fireEvent.press(r.getByText('再次更新'));
    });
    expect(onRefreshTaskList).toHaveBeenCalledTimes(2);
    expect(service.callCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 六. 預覽上的回饋決策
// ---------------------------------------------------------------------------

describe('預覽顯示的回饋決策', () => {
  it('可發幣的任務在按下建立之前就看得到金額', () => {
    const { r } = openReadingReview();
    // 回饋卡標題與下方的「回饋方式」都叫「成長幣回饋」—— 統一標籤之後本來就該一致。
    expect(r.getAllByText('成長幣回饋').length).toBeGreaterThan(0);
    expect(r.getByText('枚')).toBeTruthy();
  });

  it('demo 的幣值卡不出現範圍與版本號', () => {
    // 在沒有家長幣值調整 UI 之前，「政策允許範圍 5–25」只會讓家長
    // 去找一個不存在的滑桿；版本號則是稽核資訊，不是家長要判斷的東西。
    const { r } = openReadingReview();
    expect(r.queryByText(/政策允許範圍|可調整範圍/)).toBeNull();
    expect(r.queryByText(/coin-policy-/)).toBeNull();
    expect(r.queryByText(/D\s*類|時間分級|standard/)).toBeNull();
  });

  it('家庭參與顯示的是貢獻說明，不是 0 幣', () => {
    const { r } = openFamilyRoleReview();
    // 「家庭參與」在回饋摘要與下方的「回饋方式」各出現一次，兩處說的是同一件事 ——
    // 這正是統一標籤之後該有的樣子（先前一邊叫「家庭貢獻」、一邊叫別的）。
    expect(r.getAllByText('家庭參與').length).toBeGreaterThan(0);
    expect(r.getByText('這項任務會記錄孩子對共同生活的投入，不發成長幣。')).toBeTruthy();
    expect(r.queryByText(/0 枚/)).toBeNull();
  });

  it('demo 模式不顯示估算依據，development 才展得開', () => {
    expect(openReadingReview().r.queryByText('查看估算依據')).toBeNull();

    const dev = openReadingReview({ displayMode: 'development' });
    const toggle = dev.r.getByText('查看估算依據');
    fireEvent.press(toggle);
    // 展開後也只有家長看得懂的欄位，沒有 difficultyDelta / base_time_min 這類內部名稱。
    expect(dev.r.getByText('年齡段')).toBeTruthy();
    expect(dev.r.getByText('任務類型')).toBeTruthy();
    expect(dev.r.queryByText(/difficultyDelta|base_time_min|bandBaseCoins/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 十五. 草稿什麼時候被清掉
// ---------------------------------------------------------------------------

describe('草稿保留與清除', () => {
  it('建立失敗不清草稿：回到編輯畫面時選過的東西還在', async () => {
    const service = new FakeParentTaskCreationService({ kind: 'persistenceFailed' });
    const { r } = openReadingReview({ service });
    await confirmCreate(r);

    fireEvent.press(r.getByText('返回修改'));
    // 回到編輯畫面，而且剛才選的閱讀方式仍然是選中狀態。
    expect(r.getByText('檢查並預覽')).toBeTruthy();
    const chip = r.getByLabelText('用什麼方式進行？：自己閱讀');
    expect(chip.props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true }),
    );
  });

  it('production 不再注入那個一定失敗的 service', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'ParentTaskManagementTablet.tsx'), 'utf8',
    );
    expect(source).toContain('taskCreationService={taskCreationService}');
    expect(source).not.toContain('Unavailable');
  });

  it('測試替身沒有被 production 程式碼 import', () => {
    const drawer = fs.readFileSync(
      path.resolve(__dirname, '..', 'TaskCreationDrawer.tsx'), 'utf8',
    );
    expect(drawer).not.toContain('fakeParentTaskCreationService');
  });
});
