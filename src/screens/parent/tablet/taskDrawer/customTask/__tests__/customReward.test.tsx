// 第九階段 C — 自訂任務的回饋區塊
//
// 三件事要證明：
//
//   · 選項來自 evaluateCustomTaskRewardOptions，不是元件裡另寫的一張表
//   · 家庭參與的成長幣**在一般使用模式看不到**，development 看得到但按不下去，
//     而且理由是人話，不是 B_COIN_POLICY_NOT_CONFIGURED
//   · 幣值來自 evaluateTaskReward，畫面上沒有硬編的 10 枚

import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('../../../../../../lib/onboarding', () => ({ calcAgeGroup: () => '6-9' }));

import { TaskCreationDrawer } from '../../TaskCreationDrawer';
import { FakeParentTaskCreationService } from '../../../../../../testing/fakeParentTaskCreationService';
import { enterCustomFlow } from '../../../../../../testing/taskCreationDrawerFlow';
import { CustomTaskRewardSection } from '../CustomTaskRewardSection';
import { DisplayModeProvider } from '../../displayMode';
import { evaluateCustomTaskRewardOptions } from '../customTaskRewardOptions';
import { REWARD_SECTION_COPY } from '../customTaskCopy';

const CHILD = { id: 'child-1', nickname: '承恩', birthDate: '2018-03-05', familyId: 'family-1' };

/** 走到某一支自訂 editor。 */
function openEditor(
  purpose: string,
  duration: string,
  mode?: 'demo' | 'development',
  service = new FakeParentTaskCreationService(),
) {
  const r = render(
    <TaskCreationDrawer
      visible
      onClose={() => {}}
      child={CHILD}
      childLoading={false}
      taskCreationService={service}
      {...(mode ? { displayMode: mode } : null)}
    />,
  );
  enterCustomFlow(r);
  fireEvent.changeText(r.getByLabelText('任務名稱'), '餐後整理書桌');
  fireEvent.press(r.getByText('下一步'));
  fireEvent.press(r.getByText(purpose));
  fireEvent.press(r.getByText('下一步'));
  fireEvent.press(r.getByText(duration));
  fireEvent.press(r.getByText('下一步'));
  return { r, service };
}

// ---------------------------------------------------------------------------
// 40-45. 家庭參與
// ---------------------------------------------------------------------------

describe('40-45. 家庭參與的回饋選項', () => {
  it('40-41. 選項來自 domain，而且家庭參與是建議值', () => {
    const options = evaluateCustomTaskRewardOptions({
      ageGroup: '6-9',
      purposeCategory: 'family_participation',
      editorKind: 'recurring',
    });
    const recommended = options.filter(o => o.availability === 'recommended');
    expect(recommended).toHaveLength(1);
    expect(recommended[0].rewardPolicy).toBe('family_contribution');

    const { r } = openEditor('參與家庭生活', '固定重複');
    expect(r.getByText(REWARD_SECTION_COPY.title)).toBeTruthy();
    expect(r.getByText('家庭參與')).toBeTruthy();
    expect(r.getByText(REWARD_SECTION_COPY.recommendedBadge)).toBeTruthy();
  });

  it('42. 進度與肯定、一般紀錄都選得到', () => {
    const { r } = openEditor('參與家庭生活', '固定重複');
    for (const label of ['進度與肯定', '一般紀錄']) {
      const option = r.getByLabelText(label);
      expect(option.props.accessibilityState.disabled).toBeUndefined();
      fireEvent.press(option);
      expect(r.getByLabelText(label).props.accessibilityState.selected).toBe(true);
    }
  });

  it('43. 一般使用模式看不到家庭參與的成長幣選項', () => {
    const { r } = openEditor('參與家庭生活', '固定重複');
    // 「成長幣回饋」整個不列出來 —— 家長不需要知道有一個他用不到的選項。
    expect(r.queryByText('成長幣回饋')).toBeNull();
    expect(r.queryByText('時間儲蓄')).toBeNull();
  });

  it('44-45. development 看得到，但按不下去，而且理由是人話', () => {
    const { r } = openEditor('參與家庭生活', '固定重複', 'development');
    const coin = r.getByLabelText('成長幣回饋');
    expect(coin.props.accessibilityState.disabled).toBe(true);
    expect(r.getByText('這類任務目前尚未有適用的成長幣規則。')).toBeTruthy();

    // 45. 沒有任何 reason code 或錯誤代碼露出來。
    for (const forbidden of [
      /B_COIN_POLICY_NOT_CONFIGURED/, /FAMILY_PARTICIPATION_NOT_COIN_ELIGIBLE/,
      /COIN_POLICY_MISSING_FOR_CATEGORY/, /POLICY_REJECTED/, /coin_eligible/,
      /family_contribution/, /record_only/, /progress_only/,
    ]) {
      expect(r.queryByText(forbidden)).toBeNull();
    }
    // 也不會顯示一個假的 0 枚。
    expect(r.queryByText('0')).toBeNull();
  });

  it('B ＋ 成長幣建不出來 —— 三層結論一致', () => {
    const options = evaluateCustomTaskRewardOptions({
      ageGroup: '6-9',
      purposeCategory: 'family_participation',
      editorKind: 'recurring',
      estimatedMinutes: 20,
    });
    const coin = options.find(o => o.rewardPolicy === 'coin_eligible');
    // 產品理念上已經允許（不是 unavailable），但現在算不出金額。
    expect(coin?.availability).toBe('available_with_confirmation');
    expect(coin?.coinAmountStatus).toBe('policy_missing');
  });
});

// ---------------------------------------------------------------------------
// 46-48. C／D 的成長幣
// ---------------------------------------------------------------------------

describe('46-48. 學習與技能的成長幣', () => {
  it('46-47. 金額來自 evaluateTaskReward，不是硬編的 10', async () => {
    const service = new FakeParentTaskCreationService();
    const { r } = openEditor('學習或練習技能', '固定重複', undefined, service);

    fireEvent.changeText(r.getByLabelText('怎樣算完成'), '完成約定時間的閱讀');
    // 沒有每次時間就算不出幣值 —— 選一個之後成長幣才會出現。
    fireEvent.press(r.getByText('20 分鐘'));
    fireEvent.press(r.getByLabelText('成長幣回饋'));

    fireEvent.press(r.getByText('檢查並預覽'));
    fireEvent.press(r.getByText('確認建立'));

    await waitFor(() => expect(service.callCount).toBe(1));
    const decision = service.calls[0].reward.decision;
    expect(decision.eligibility).toBe('allowed');
    expect(decision.rewardPolicy).toBe('coin_eligible');
    expect(decision.coin?.finalAmount).toBeGreaterThan(0);
    // 版本化的政策算出來的，不是畫面上寫死的。
    expect(service.calls[0].reward.decision.rewardPolicyVersion).toMatch(/coin-policy/);
  });

  it('47. 自訂流程的原始碼裡沒有硬編的幣值', () => {
    const dir = path.resolve(__dirname, '..');
    const sources = fs
      .readdirSync(dir)
      .filter(name => name.endsWith('.ts') || name.endsWith('.tsx'))
      .map(name => fs.readFileSync(path.join(dir, name), 'utf8'))
      .map(source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))
      .join('\n');

    expect(sources).not.toMatch(/10\s*枚/);
    expect(sources).not.toMatch(/finalAmount\s*[:=]\s*\d/);
    expect(sources).not.toMatch(/estimatedMinutes\s*\*\s*/);
  });

  it('48. 改掉每次時間之後，預覽上的金額跟著重算', () => {
    const { r } = openEditor('學習或練習技能', '固定重複');
    fireEvent.changeText(r.getByLabelText('怎樣算完成'), '完成約定時間的閱讀');

    fireEvent.press(r.getByText('10 分鐘'));
    fireEvent.press(r.getByLabelText('成長幣回饋'));
    fireEvent.press(r.getByText('檢查並預覽'));
    const short = r.getByText(/依孩子的年齡、任務類型與每次 10 分鐘的投入估算。/);
    expect(short).toBeTruthy();

    fireEvent.press(r.getByText('返回修改'));
    fireEvent.press(r.getByText('30 分鐘'));
    fireEvent.press(r.getByText('檢查並預覽'));
    expect(r.getByText(/依孩子的年齡、任務類型與每次 30 分鐘的投入估算。/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 12. available_with_confirmation 不可靜默套用
// ---------------------------------------------------------------------------

describe('12. 需要確認的選項', () => {
  /**
   * 目前沒有任何**選得到**的 available_with_confirmation 選項
   * —— 唯一一個是家庭參與的成長幣，而它在 B 類幣值政策補上之前算不出金額。
   *
   * 所以這裡直接把選項餵給元件：那一段程式碼要在政策落地的那一天就是對的，
   * 而不是等到那時候才有人發現「選了就直接套用」。
   */
  const confirmable = {
    rewardPolicy: 'coin_eligible' as const,
    availability: 'available_with_confirmation' as const,
    title: '成長幣回饋',
    description: '這個家庭本來就有有償的約定，可以選這一項。',
    requiresSupportIntent: true,
    coinAmountStatus: 'available' as const,
  };

  function renderSection(onChange = jest.fn()) {
    const r = render(
      <DisplayModeProvider mode="demo">
        <CustomTaskRewardSection
          options={[
            {
              rewardPolicy: 'family_contribution',
              availability: 'recommended',
              title: '家庭貢獻紀錄',
              description: '',
              coinAmountStatus: 'not_applicable',
            },
            confirmable,
          ]}
          selected="family_contribution"
          onChange={onChange}
        />
      </DisplayModeProvider>,
    );
    return { r, onChange };
  }

  it('點一下不會直接套用，要先確認', () => {
    const { r, onChange } = renderSection();
    fireEvent.press(r.getByLabelText('成長幣回饋'));
    expect(onChange).not.toHaveBeenCalled();
    expect(r.getByText(REWARD_SECTION_COPY.confirmTitle)).toBeTruthy();

    fireEvent.press(r.getByLabelText(REWARD_SECTION_COPY.confirmAccept));
    expect(onChange).toHaveBeenCalledWith('coin_eligible');
  });

  it('先不要 → 收起確認，也沒有套用', () => {
    const { r, onChange } = renderSection();
    fireEvent.press(r.getByLabelText('成長幣回饋'));
    fireEvent.press(r.getByLabelText(REWARD_SECTION_COPY.confirmCancel));
    expect(onChange).not.toHaveBeenCalled();
    expect(r.queryByText(REWARD_SECTION_COPY.confirmTitle)).toBeNull();
  });

  it('recommended 排在前面，而且顯示的是正式文案不是 domain 的說明字串', () => {
    const { r } = renderSection();
    const radios = r.getAllByRole('radio');
    // domain 那一份寫「家庭貢獻紀錄」，家長看到的是「家庭參與」——
    // 前者描述資料怎麼記，後者描述這件事的意義。
    expect(radios[0].props.accessibilityLabel).toBe('家庭參與');
  });
});
