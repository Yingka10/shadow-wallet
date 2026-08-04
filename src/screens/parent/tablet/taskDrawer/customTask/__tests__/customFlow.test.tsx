// 第九階段 C — 自訂建立流程（走真的 Drawer，不 mock 元件）
//
// 只 mock lib/onboarding —— 它會連帶把 supabase client 拉進來，而那支在
// import 時就要 URL 與金鑰。建立 service 用 fake，jest 不連任何資料庫。
//
// 這一支要證明的不是「畫面畫得出來」，是幾件真的會傷到家長的事：
//
//   · 起點頁不出現還沒做的入口（孩子提案、願望轉計畫……）
//   · Step 2 首次進入**四項都沒有預選** —— 這是整個流程最重要的一條
//   · 生活習慣 ＋ 固定重複不會被靜默改成小計畫
//   · 返回不會清掉家長剛填的東西
//   · 送出的命令是 parent_custom，而且**沒有假的 preset id**

import React from 'react';
import { render, fireEvent, waitFor, type RenderResult } from '@testing-library/react-native';

jest.mock('../../../../../../lib/onboarding', () => ({ calcAgeGroup: () => '6-9' }));

import { TaskCreationDrawer } from '../../TaskCreationDrawer';
import { FakeParentTaskCreationService } from '../../../../../../testing/fakeParentTaskCreationService';
import { enterCustomFlow } from '../../../../../../testing/taskCreationDrawerFlow';
import { PLANNED_TASK_CREATION_SOURCES } from '../customTaskContract';
import { ROUTINE_CONFIRMATION_COPY, STEP1_COPY, STEP2_COPY, STEP3_COPY } from '../customTaskCopy';

const CHILD = { id: 'child-1', nickname: '承恩', birthDate: '2018-03-05', familyId: 'family-1' };

function open(service = new FakeParentTaskCreationService()) {
  const r = render(
    <TaskCreationDrawer
      visible
      onClose={() => {}}
      child={CHILD}
      childLoading={false}
      taskCreationService={service}
    />,
  );
  return { r, service };
}

/** 起點 → Step 1，並填好名稱。 */
function openStep1(title = '每天閱讀', service?: FakeParentTaskCreationService) {
  const opened = open(service);
  enterCustomFlow(opened.r);
  fireEvent.changeText(opened.r.getByLabelText(STEP1_COPY.titleLabel), title);
  return opened;
}

/** 起點 → Step 2。 */
function openStep2(title = '每天閱讀', service?: FakeParentTaskCreationService) {
  const opened = openStep1(title, service);
  fireEvent.press(opened.r.getByText('下一步'));
  return opened;
}

/** 起點 → Step 3，帶指定的方向。 */
function openStep3(purpose = '學習或練習技能', service?: FakeParentTaskCreationService) {
  const opened = openStep2('每天閱讀', service);
  fireEvent.press(opened.r.getByText(purpose));
  fireEvent.press(opened.r.getByText('下一步'));
  return opened;
}

/** 起點 → 某一支 editor。 */
function openEditor(
  purpose: string,
  duration: string,
  service?: FakeParentTaskCreationService,
) {
  const opened = openStep3(purpose, service);
  fireEvent.press(opened.r.getByText(duration));
  fireEvent.press(opened.r.getByText('下一步'));
  return opened;
}

/** editor 的 meta 一行（「自訂任務｜固定重複」）—— 用來判斷進了哪一支。 */
function editorMeta(r: RenderResult): string {
  const forms = ['單次', '固定重複', '家庭角色', '短期小計畫', '成長計畫'];
  const hit = forms.find(form => r.queryAllByText(new RegExp(`自訂任務｜${form}`)).length > 0);
  return hit ?? '';
}

// ---------------------------------------------------------------------------
// 1-5. 起點頁
// ---------------------------------------------------------------------------

describe('1-5. 起點頁', () => {
  it('1. 只有兩個入口', () => {
    const { r } = open();
    expect(r.getByText('從常用任務開始')).toBeTruthy();
    expect(r.getByText('自己建立任務')).toBeTruthy();
  });

  it('2. 未啟用的入口一個都不顯示', () => {
    const { r } = open();
    // 型別上留了位置，畫面上沒有 —— 一個灰掉的「即將推出」只會讓家長
    // 每次開抽屜都重新失望一次。
    expect(PLANNED_TASK_CREATION_SOURCES.length).toBeGreaterThan(0);
    for (const label of ['孩子提案', '親子共創', '願望轉任務', '複製任務', '系統建議']) {
      expect(r.queryByText(label)).toBeNull();
    }
    // 也沒有任何「AI 自動建立」的入口。
    expect(r.queryByText(/AI/)).toBeNull();
  });

  it('3. 從常用任務開始 → 既有的預設任務清單', () => {
    const { r } = open();
    fireEvent.press(r.getByText('從常用任務開始'));
    fireEvent.press(r.getByText('下一步'));
    expect(r.getByText('推薦起點')).toBeTruthy();
    expect(r.getByPlaceholderText('搜尋閱讀、運動、家庭參與……')).toBeTruthy();
  });

  it('4. 自己建立任務 → 基本設定 1／3', () => {
    const { r } = open();
    enterCustomFlow(r);
    expect(r.getByText(STEP1_COPY.progress)).toBeTruthy();
    expect(r.getByText(STEP1_COPY.sectionTitle)).toBeTruthy();
  });

  it('5. 起點頁沒有上一步，而且還沒選就不能往前', () => {
    const { r } = open();
    expect(r.queryByText('上一步')).toBeNull();
    expect(r.getByText('取消')).toBeTruthy();
    expect(r.getByLabelText('下一步').props.accessibilityState.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6-12. Step 1
// ---------------------------------------------------------------------------

describe('6-12. Step 1 想做什麼', () => {
  it('6. 名稱必填 —— 空白時按下一步不會往前，而且畫面上看得到原因', () => {
    const { r } = open();
    enterCustomFlow(r);
    fireEvent.press(r.getByText('下一步'));
    expect(r.getByText(STEP1_COPY.titleRequiredError)).toBeTruthy();
    // 還在 Step 1。
    expect(r.getByText(STEP1_COPY.progress)).toBeTruthy();
  });

  it('7. 期待是選填 —— 只填名稱就能往前', () => {
    const { r } = openStep1();
    fireEvent.press(r.getByText('下一步'));
    expect(r.getByText(STEP2_COPY.progress)).toBeTruthy();
  });

  it('8. 不自動補孩子名字', () => {
    const { r } = open();
    enterCustomFlow(r);
    // placeholder 是中性的例子，不是「承恩的閱讀習慣」——
    // 預填名字看起來像系統已經幫忙決定了。
    expect(r.getByPlaceholderText(STEP1_COPY.titlePlaceholder)).toBeTruthy();
    expect(r.queryByText(/承恩的/)).toBeNull();
    expect(r.getByLabelText(STEP1_COPY.titleLabel).props.value).toBe('');
  });

  it('9-10. 上一步回起點，而且輸入還在', () => {
    const { r } = openStep1('餐後整理書桌');
    fireEvent.changeText(
      r.getByLabelText(STEP1_COPY.expectationLabel), '希望他吃完飯自己收',
    );
    fireEvent.press(r.getByText('上一步'));
    expect(r.getByText('從常用任務開始')).toBeTruthy();

    fireEvent.press(r.getByText('下一步'));
    expect(r.getByLabelText(STEP1_COPY.titleLabel).props.value).toBe('餐後整理書桌');
    expect(r.getByLabelText(STEP1_COPY.expectationLabel).props.value).toBe('希望他吃完飯自己收');
  });

  it('11. 正式文案不含 domain 名稱', () => {
    const { r } = open();
    enterCustomFlow(r);
    expect(r.queryByText('家長原始期待')).toBeNull();
    expect(r.queryByText(/任務暫定名稱/)).toBeNull();
    expect(r.queryByText(/必填/)).toBeNull();
  });

  it('12. 進度是 1／3，不是 1／2', () => {
    const { r } = open();
    enterCustomFlow(r);
    expect(r.getByText('基本設定 1／3｜想做什麼')).toBeTruthy();
    expect(r.queryByText(/1／2/)).toBeNull();
    expect(r.queryByText(/步驟 1/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 13-21. Step 2
// ---------------------------------------------------------------------------

describe('13-21. Step 2 任務目的', () => {
  it('13. 四個方向都在', () => {
    const { r } = openStep2();
    for (const label of ['練習照顧自己', '參與家庭生活', '孩子自己想挑戰', '學習或練習技能']) {
      expect(r.getByText(label)).toBeTruthy();
    }
  });

  it('14. 不顯示 A／B／C／D 或內部欄位名稱', () => {
    const { r } = openStep2();
    for (const forbidden of [
      /A 類/, /B 類/, /C 類/, /D 類/,
      /purposeCategory/, /TASK_TYPE/, /life_routine/, /family_participation/,
      /autonomous_challenge/, /learning_skill/,
    ]) {
      expect(r.queryByText(forbidden)).toBeNull();
    }
  });

  it('15. 首次進入沒有任何預選 —— 名稱寫「每天閱讀」也一樣', () => {
    const { r } = openStep2('每天閱讀');
    const selected = r
      .getAllByRole('radio')
      .filter(node => node.props.accessibilityState?.selected === true);
    expect(selected).toHaveLength(0);
    // 沒選就不能往前，而且說得出為什麼。
    expect(r.getByLabelText('下一步').props.accessibilityState.disabled).toBe(true);
    expect(r.getByText(STEP2_COPY.unselectedHint)).toBeTruthy();
  });

  it('16. 選了才能往前', () => {
    const { r } = openStep2();
    fireEvent.press(r.getByText('學習或練習技能'));
    expect(r.getByLabelText('下一步').props.accessibilityState.disabled).toBe(false);
    fireEvent.press(r.getByText('下一步'));
    expect(r.getByText(STEP3_COPY.progress)).toBeTruthy();
  });

  it('17. 返回 Step 1 再回來，選擇還在', () => {
    const { r } = openStep2();
    fireEvent.press(r.getByText('參與家庭生活'));
    fireEvent.press(r.getByText('上一步'));
    fireEvent.press(r.getByText('下一步'));
    const selected = r
      .getAllByRole('radio')
      .filter(node => node.props.accessibilityState?.selected === true);
    expect(selected).toHaveLength(1);
    expect(selected[0].props.accessibilityLabel).toBe('參與家庭生活');
  });

  it('18. 自主挑戰的提醒只在選中時出現', () => {
    const { r } = openStep2();
    const note = '這類任務最好先和孩子確認，是他自己願意投入的挑戰。';
    expect(r.queryByText(note)).toBeNull();
    fireEvent.press(r.getByText('孩子自己想挑戰'));
    expect(r.getByText(note)).toBeTruthy();
    // 換一個方向就收起來 —— 它不是畫面裝飾。
    fireEvent.press(r.getByText('學習或練習技能'));
    expect(r.queryByText(note)).toBeNull();
  });

  it('19-20. 這一頁不呼叫 classifyTask，也不呼叫 Gemini', () => {
    // 分類是家長回答的問題，不是系統猜的。
    // 用原始碼掃描而不是 spy：spy 只證明「這一條路徑沒呼叫」，
    // 掃描證明的是「這幾支檔案裡根本沒有那個呼叫」。
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const dir = path.resolve(__dirname, '..');
    const sources = fs
      .readdirSync(dir)
      .filter(name => name.endsWith('.ts') || name.endsWith('.tsx'))
      .map(name => fs.readFileSync(path.join(dir, name), 'utf8'))
      // 註解要先拿掉：這幾支檔案的註解正好在說明「不呼叫 classifyTask」，
      // 直接掃全文會被自己的說明擋下來。
      .map(source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))
      .join('\n');

    for (const forbidden of [
      'classifyTask', 'suggestTaskCoin', 'ai-proxy', 'generativelanguage',
      'gemini', 'functions.invoke', 'fetch(',
    ]) {
      expect(sources.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('21. 進度是 2／3', () => {
    const { r } = openStep2();
    expect(r.getByText('基本設定 2／3｜這件事主要是為了什麼？')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 22-29. Step 3
// ---------------------------------------------------------------------------

describe('22-29. Step 3 預計怎麼進行', () => {
  it('22. 只有三種安排', () => {
    const { r } = openStep3();
    for (const label of ['做一次就完成', '固定重複', '持續一段時間']) {
      expect(r.getByText(label)).toBeTruthy();
    }
    expect(r.getAllByRole('radio')).toHaveLength(3);
  });

  it('23. 不顯示五種 editor 的名稱或內部值', () => {
    const { r } = openStep3();
    for (const forbidden of [
      /one_time/, /recurring/, /growth_plan/, /short_support/, /family_role/,
      /for_a_while/, /repeating/,
    ]) {
      expect(r.queryByText(forbidden)).toBeNull();
    }
  });

  it('28. 路由：學習技能 ＋ 固定重複 → 固定任務', () => {
    const { r } = openEditor('學習或練習技能', '固定重複');
    expect(editorMeta(r)).toBe('固定重複');
  });

  it('28. 路由：學習技能 ＋ 持續一段時間 → 成長計畫', () => {
    const { r } = openEditor('學習或練習技能', '持續一段時間');
    expect(editorMeta(r)).toBe('成長計畫');
  });

  it('28. 路由：家庭生活 ＋ 持續一段時間 → 家庭角色', () => {
    const { r } = openEditor('參與家庭生活', '持續一段時間');
    expect(editorMeta(r)).toBe('家庭角色');
  });

  it('28. 路由：任何方向 ＋ 做一次 → 單次', () => {
    const { r } = openEditor('孩子自己想挑戰', '做一次就完成');
    expect(editorMeta(r)).toBe('單次');
  });

  it('29. 進度是 3／3', () => {
    const { r } = openStep3();
    expect(r.getByText('基本設定 3／3｜預計怎麼進行？')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 25-27. 生活習慣 ＋ 固定重複的確認
// ---------------------------------------------------------------------------

describe('25-27. 生活習慣 ＋ 固定重複', () => {
  it('25. 出現確認區塊，而且在回答之前不能往前', () => {
    const { r } = openStep3('練習照顧自己');
    fireEvent.press(r.getByText('固定重複'));

    expect(r.getByText(ROUTINE_CONFIRMATION_COPY.title)).toBeTruthy();
    expect(r.getByText(ROUTINE_CONFIRMATION_COPY.body)).toBeTruthy();
    expect(r.getByLabelText('下一步').props.accessibilityState.disabled).toBe(true);

    // 文案裡沒有任何內部語彙。
    expect(r.queryByText(/short_support/)).toBeNull();
    expect(r.queryByText(/needs_confirmation/)).toBeNull();
    expect(r.queryByText(/ROUTINE_SHOULD_NOT_BE_PERMANENT/)).toBeNull();
  });

  it('26. 採納建議 → 進短期小計畫', () => {
    const { r } = openStep3('練習照顧自己');
    fireEvent.press(r.getByText('固定重複'));
    fireEvent.press(r.getByText(ROUTINE_CONFIRMATION_COPY.accept));

    // 建議連期間選擇一起換掉，確認區塊因此收起來。
    expect(r.queryByText(ROUTINE_CONFIRMATION_COPY.title)).toBeNull();
    fireEvent.press(r.getByText('下一步'));
    expect(editorMeta(r)).toBe('短期小計畫');
  });

  it('27. 仍使用固定重複 → 進固定任務', () => {
    const { r } = openStep3('練習照顧自己');
    fireEvent.press(r.getByText('固定重複'));
    fireEvent.press(r.getByText(ROUTINE_CONFIRMATION_COPY.keep));
    fireEvent.press(r.getByText('下一步'));
    expect(editorMeta(r)).toBe('固定重複');
  });

  it('換了方向之後，先前對確認的回答不再套用', () => {
    const { r } = openStep3('練習照顧自己');
    fireEvent.press(r.getByText('固定重複'));
    fireEvent.press(r.getByText(ROUTINE_CONFIRMATION_COPY.keep));

    fireEvent.press(r.getByText('上一步'));
    fireEvent.press(r.getByText('學習或練習技能'));
    fireEvent.press(r.getByText('下一步'));
    fireEvent.press(r.getByText('下一步'));
    expect(editorMeta(r)).toBe('固定重複');
  });
});

// ---------------------------------------------------------------------------
// 30-38. 五種既有 editor
// ---------------------------------------------------------------------------

describe('30-38. 進入五種既有 editor', () => {
  const cases: Array<[string, string, string]> = [
    ['孩子自己想挑戰', '做一次就完成', '單次'],
    ['學習或練習技能', '固定重複', '固定重複'],
    ['學習或練習技能', '持續一段時間', '成長計畫'],
    ['參與家庭生活', '持續一段時間', '家庭角色'],
  ];

  it.each(cases)('31-35. %s ＋ %s → %s', (purpose, duration, form) => {
    const { r } = openEditor(purpose, duration);
    expect(editorMeta(r)).toBe(form);
    // 進了 editor 之後就不再顯示「基本設定 n／3」。
    expect(r.queryByText(/基本設定/)).toBeNull();
    expect(r.getByText('詳細設定')).toBeTruthy();
    // 也不會編出一個假的總步數。
    expect(r.queryByText(/步驟 4/)).toBeNull();
  });

  it('35. 生活習慣 ＋ 持續一段時間 → 短期小計畫（第五種）', () => {
    const { r } = openEditor('練習照顧自己', '持續一段時間');
    expect(editorMeta(r)).toBe('短期小計畫');
  });

  it('30. 沒有第六種 editor —— 五種以外的組合不存在', () => {
    // 路由表只會產出這五個字樣，任何新的形式都會讓 editorMeta 回空字串。
    const forms = new Set<string>();
    for (const purpose of ['練習照顧自己', '參與家庭生活', '孩子自己想挑戰', '學習或練習技能']) {
      for (const duration of ['做一次就完成', '固定重複', '持續一段時間']) {
        const { r } = openStep3(purpose);
        fireEvent.press(r.getByText(duration));
        // 生活習慣 ＋ 固定重複要先回答確認。
        const keep = r.queryByText(ROUTINE_CONFIRMATION_COPY.keep);
        if (keep) fireEvent.press(keep);
        fireEvent.press(r.getByText('下一步'));
        forms.add(editorMeta(r));
        r.unmount();
      }
    }
    expect([...forms].sort()).toEqual(
      ['single', '單次', '固定重複', '家庭角色', '成長計畫', '短期小計畫']
        .filter(f => f !== 'single')
        .sort(),
    );
  });

  it('36-38. 送出的命令是 parent_custom，而且沒有任何 preset 欄位', async () => {
    const service = new FakeParentTaskCreationService();
    const { r } = openEditor('學習或練習技能', '固定重複', service);

    fireEvent.changeText(r.getByLabelText('怎樣算完成'), '完成約定時間的閱讀');
    fireEvent.press(r.getByText('檢查並預覽'));
    fireEvent.press(r.getByText('確認建立'));

    await waitFor(() => expect(service.callCount).toBe(1));
    const command = service.calls[0];

    expect(command.creationSource).toBe('parent_custom');
    expect(command.preset).toBeUndefined();
    expect(command.metadata.createdFromPreset).toBe(false);
    expect(command.metadata.presetCatalogVersion).toBeUndefined();
    // 39. 識別碼與 preset 走同一套機制（同樣的前綴與長度）。
    expect(command.metadata.clientRequestId).toMatch(/^[0-9a-z-]+$/);
    expect(command.metadata.clientRequestId.length).toBeGreaterThan(8);
    // 沒有任何欄位裝著假的 preset id。
    expect(JSON.stringify(command)).not.toMatch(/learn-|life-|fam-|auto-/);
  });
});

// ---------------------------------------------------------------------------
// 49-57. 預覽與成功
// ---------------------------------------------------------------------------

describe('49-57. 預覽與成功', () => {
  /** 走到自訂任務的預覽畫面。 */
  function openReview(service?: FakeParentTaskCreationService) {
    const opened = openEditor('學習或練習技能', '固定重複', service);
    fireEvent.changeText(opened.r.getByLabelText('怎樣算完成'), '完成約定時間的閱讀');
    fireEvent.press(opened.r.getByText('檢查並預覽'));
    return opened;
  }

  it('49-50. 預覽不需要 family 或 variant 物件，也不 crash', () => {
    const { r } = openReview();
    expect(r.getByText('預覽（尚未建立）')).toBeTruthy();
    expect(r.getByText('每天閱讀')).toBeTruthy();
    // 沒有空白的 preset 區塊，也沒有 undefined。
    expect(r.queryByText(/undefined/)).toBeNull();
    expect(r.queryByText(/preset/i)).toBeNull();
    expect(r.queryByText(/parent_custom/)).toBeNull();
  });

  it('AI 區塊本輪沒有接上真實服務 —— 沒有 preset 也不會壞', () => {
    const { r } = openReview();
    expect(r.queryByText(/AI/)).toBeNull();
  });

  it('52-53. 成功畫面不出現 preset 字樣，而且可以查看任務', async () => {
    const service = new FakeParentTaskCreationService();
    const { r } = openReview(service);
    fireEvent.press(r.getByText('確認建立'));

    await waitFor(() => expect(r.getByText('任務已建立')).toBeTruthy());
    expect(r.getByText('已加入承恩的任務清單')).toBeTruthy();
    expect(r.getByText('自訂任務｜固定重複')).toBeTruthy();
    expect(r.getByText('學習或練習技能')).toBeTruthy();
    for (const forbidden of [
      /creation_source/, /created_parent_custom/, /parent_custom/,
      /policyVersion/, /catalogVersion/,
    ]) {
      expect(r.queryByText(forbidden)).toBeNull();
    }
    expect(r.getByText('查看任務')).toBeTruthy();
    expect(r.getByText('完成')).toBeTruthy();
  });

  it('56-57. 建立失敗時草稿還在，重試沿用同一個識別碼', async () => {
    const service = new FakeParentTaskCreationService({ kind: 'persistenceFailed' });
    const { r } = openReview(service);

    fireEvent.press(r.getByText('確認建立'));
    await waitFor(() => expect(service.callCount).toBe(1));
    expect(r.getByText('任務尚未建立，請稍後再試。')).toBeTruthy();

    service.setBehaviour({ kind: 'success' });
    fireEvent.press(r.getByText('確認建立'));
    await waitFor(() => expect(service.callCount).toBe(2));
    expect(service.requestIds[0]).toBe(service.requestIds[1]);
  });
});

// ---------------------------------------------------------------------------
// 58-64. 導覽與 dirty
// ---------------------------------------------------------------------------

describe('58-64. 導覽與 dirty', () => {
  it('61. editor 返回 Step 3 之後再往前，內容都還在（不重建草稿）', async () => {
    const service = new FakeParentTaskCreationService();
    const { r } = openEditor('學習或練習技能', '固定重複', service);
    fireEvent.changeText(r.getByLabelText('怎樣算完成'), '完成約定時間的閱讀');

    fireEvent.press(r.getByText('上一步'));
    expect(r.getByText(STEP3_COPY.progress)).toBeTruthy();
    fireEvent.press(r.getByText('下一步'));

    // 沒有被重建 —— editor 裡填的字還在。
    expect(r.getByLabelText('怎樣算完成').props.value).toBe('完成約定時間的閱讀');

    fireEvent.press(r.getByText('檢查並預覽'));
    fireEvent.press(r.getByText('確認建立'));
    await waitFor(() => expect(service.callCount).toBe(1));
    expect(service.calls[0].task.completionDescription).toBe('完成約定時間的閱讀');
  });

  it('62. 預覽的返回修改回到原本那一支 editor', () => {
    const { r } = openEditor('學習或練習技能', '固定重複');
    fireEvent.changeText(r.getByLabelText('怎樣算完成'), '完成約定時間的閱讀');
    fireEvent.press(r.getByText('檢查並預覽'));
    fireEvent.press(r.getByText('返回修改'));
    expect(editorMeta(r)).toBe('固定重複');
    expect(r.getByLabelText('怎樣算完成').props.value).toBe('完成約定時間的閱讀');
  });

  it('63. 有內容時關閉會用既有的放棄確認', () => {
    const onClose = jest.fn();
    const r = render(
      <TaskCreationDrawer
        visible
        onClose={onClose}
        child={CHILD}
        childLoading={false}
        taskCreationService={new FakeParentTaskCreationService()}
      />,
    );
    enterCustomFlow(r);
    fireEvent.changeText(r.getByLabelText(STEP1_COPY.titleLabel), '每天閱讀');
    fireEvent.press(r.getByLabelText('關閉'));

    expect(onClose).not.toHaveBeenCalled();
    expect(r.getByText('要放棄這次的調整嗎？')).toBeTruthy();
    fireEvent.press(r.getByLabelText('放棄並離開，清除目前的調整'));
    expect(onClose).toHaveBeenCalled();
  });

  it('起點頁還沒有內容，關閉不會問', () => {
    const onClose = jest.fn();
    const r = render(
      <TaskCreationDrawer
        visible
        onClose={onClose}
        child={CHILD}
        childLoading={false}
        taskCreationService={new FakeParentTaskCreationService()}
      />,
    );
    fireEvent.press(r.getByLabelText('關閉'));
    expect(onClose).toHaveBeenCalled();
  });

  it('64. 成功之後沒有回到草稿的路', async () => {
    const service = new FakeParentTaskCreationService();
    const { r } = openEditor('學習或練習技能', '固定重複', service);
    fireEvent.changeText(r.getByLabelText('怎樣算完成'), '完成約定時間的閱讀');
    fireEvent.press(r.getByText('檢查並預覽'));
    fireEvent.press(r.getByText('確認建立'));

    await waitFor(() => expect(r.getByText('任務已建立')).toBeTruthy());
    expect(r.queryByText('上一步')).toBeNull();
    expect(r.queryByText('返回修改')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 16. 切換建立方式
// ---------------------------------------------------------------------------

describe('16. 切換建立方式', () => {
  it('切去 preset 再回來，自訂的內容還在', () => {
    const { r } = openStep1('餐後整理書桌');
    fireEvent.press(r.getByText('上一步'));

    fireEvent.press(r.getByText('從常用任務開始'));
    fireEvent.press(r.getByText('下一步'));
    expect(r.getByText('推薦起點')).toBeTruthy();

    fireEvent.press(r.getByText('上一步'));
    fireEvent.press(r.getByText('自己建立任務'));
    fireEvent.press(r.getByText('下一步'));
    expect(r.getByLabelText(STEP1_COPY.titleLabel).props.value).toBe('餐後整理書桌');
  });
});
