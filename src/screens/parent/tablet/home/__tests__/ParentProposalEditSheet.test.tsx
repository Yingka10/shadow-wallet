import React from 'react';
import { Modal, StyleSheet, TextInput } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ChildProposalPlanVersion, ParentProposalCardData } from '../../../../../lib/childProposal';
import { ParentColors } from '../../../../../constants/parentTheme';
import { ParentProposalEditSheet } from '../ParentProposalEditSheet';

const card = {
  proposal: {
    id: 'proposal-1', status: 'proposed', current_plan_version_id: 'version-1',
  },
  currentPlanVersion: {
    id: 'version-1', proposal_id: 'proposal-1', authored_by: 'ai',
    cadence_mode: 'weekly_frequency', cadence_weekly_frequency: 4, cadence_days: null,
    preferred_time: 'after_dinner', preferred_time_custom: null,
    completion_description: '完成一次 15 分鐘閱讀', duration_days: 14,
    reward_policy: 'coin_eligible', ai_suggested_coin_amount: 10,
  } as ChildProposalPlanVersion,
} as ParentProposalCardData;

const defaultProps = {
  visible: true,
  card,
  saving: false,
  error: null,
  onClose: jest.fn(),
  onSave: jest.fn(),
};

describe('ParentProposalEditSheet', () => {
  beforeEach(() => jest.clearAllMocks());

  it('以原始計畫脈絡和引導式控制開始，沒有裸露的次數輸入框', () => {
    render(<ParentProposalEditSheet {...defaultProps} />);

    expect(screen.getByText('一起調整計畫')).toBeTruthy();
    expect(screen.getByText('這是孩子原本提的計畫，一起把安排調整成適合家裡的節奏。')).toBeTruthy();
    expect(screen.getByText('原本安排：一週 4 次')).toBeTruthy();
    expect(screen.getByText('4 次')).toBeTruthy();
    expect(screen.UNSAFE_queryAllByType(TextInput).filter(
      input => input.props.keyboardType === 'number-pad',
    )).toHaveLength(0);
    expect(screen.getByLabelText('減少每週次數')).toBeTruthy();
    expect(screen.getByLabelText('增加每週次數')).toBeTruthy();

    expect(screen.getByText('尚未決定')).toBeTruthy();
    expect(screen.getByText('晚餐後')).toBeTruthy();
    expect(screen.getByText('睡覺前')).toBeTruthy();
    expect(screen.queryByText('上學前')).toBeNull();
    expect(screen.queryByText('自訂時間')).toBeNull();

    expect(screen.getByText('怎樣算完成？')).toBeTruthy();
    expect(screen.getByText('完成一次 15 分鐘閱讀')).toBeTruthy();
    expect(screen.getByLabelText('修改怎樣算完成')).toBeTruthy();
    expect(screen.queryByTestId('proposal-completion-description-input')).toBeNull();
    expect(within(screen.getByTestId('proposal-change-summary')).getByText('目前沒有調整')).toBeTruthy();
    expect(screen.queryByText(/計畫天數|成長幣|預估時間|任務分類|進度模式/)).toBeNull();
  });

  it('每週次數步進器限制在 1 到 7，並提供至少 44px 的觸控範圍', () => {
    const minimumCard = {
      ...card,
      currentPlanVersion: { ...card.currentPlanVersion!, cadence_weekly_frequency: 1 },
    } as ParentProposalCardData;
    const { rerender } = render(<ParentProposalEditSheet {...defaultProps} card={minimumCard} />);
    const decrease = screen.getByLabelText('減少每週次數');
    fireEvent.press(decrease);
    expect(screen.getByText('1 次')).toBeTruthy();
    expect(decrease.props.accessibilityState).toEqual({ disabled: true });
    expect(StyleSheet.flatten(decrease.props.style).minHeight).toBeGreaterThanOrEqual(44);

    const maximumCard = {
      ...card,
      currentPlanVersion: { ...card.currentPlanVersion!, id: 'version-2', cadence_weekly_frequency: 7 },
    } as ParentProposalCardData;
    rerender(<ParentProposalEditSheet {...defaultProps} card={maximumCard} />);
    const increase = screen.getByLabelText('增加每週次數');
    fireEvent.press(increase);
    expect(screen.getByText('7 次')).toBeTruthy();
    expect(increase.props.accessibilityState).toEqual({ disabled: true });
    expect(StyleSheet.flatten(increase.props.style).minHeight).toBeGreaterThanOrEqual(44);
  });

  it('關閉、主要操作和漸進展開都有至少 44px 的可存取觸控範圍', () => {
    render(<ParentProposalEditSheet {...defaultProps} />);

    const close = screen.getByRole('button', { name: '關閉' });
    const primary = screen.getByRole('button', { name: '存下來，讓孩子看看' });
    const timeDisclosure = screen.getByLabelText('展開更多時間選項');
    const completionDisclosure = screen.getByLabelText('修改怎樣算完成');

    expect(StyleSheet.flatten(close.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(primary.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(timeDisclosure.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(completionDisclosure.props.style).minHeight).toBeGreaterThanOrEqual(44);
  });

  it('只摘要實際變更，並送出與既有 API 完全相同的 editable patch', () => {
    const onSave = jest.fn();
    render(<ParentProposalEditSheet {...defaultProps} onSave={onSave} />);

    fireEvent.press(screen.getByLabelText('減少每週次數'));
    fireEvent.press(screen.getByText('睡覺前'));

    const summary = within(screen.getByTestId('proposal-change-summary'));
    expect(summary.getByText('每週安排：一週 4 次 → 一週 3 次')).toBeTruthy();
    expect(summary.getByText('適合時間：晚餐後 → 睡覺前')).toBeTruthy();
    expect(summary.queryByText(/怎樣算完成/)).toBeNull();

    fireEvent.press(screen.getByText('存下來，讓孩子看看'));
    expect(onSave).toHaveBeenCalledWith({
      cadenceMode: 'weekly_frequency', cadenceWeeklyFrequency: 3, cadenceDays: null,
      preferredTime: 'before_bed', preferredTimeCustom: null,
      completionDescription: '完成一次 15 分鐘閱讀',
    });
    expect(JSON.stringify(onSave.mock.calls)).not.toContain('duration');
    expect(JSON.stringify(onSave.mock.calls)).not.toContain('reward');
  });

  it('沒有實際變更時不能送出，saving 時即使有變更也維持 disabled', () => {
    const onSave = jest.fn();
    const { rerender } = render(<ParentProposalEditSheet {...defaultProps} onSave={onSave} />);

    const unchangedPrimary = screen.getByRole('button', { name: '存下來，讓孩子看看' });
    expect(unchangedPrimary.props.accessibilityState).toMatchObject({ disabled: true });
    expect(StyleSheet.flatten(unchangedPrimary.props.style).backgroundColor)
      .toBe(ParentColors.borderMedium);
    fireEvent.press(unchangedPrimary);
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('減少每週次數'));
    expect(screen.getByRole('button', { name: '存下來，讓孩子看看' }).props.accessibilityState)
      .toMatchObject({ disabled: false });
    rerender(<ParentProposalEditSheet {...defaultProps} saving onSave={onSave} />);
    expect(screen.getByRole('button', { name: '正在存下來' }).props.accessibilityState)
      .toMatchObject({ disabled: true });
    fireEvent.press(screen.getByRole('button', { name: '正在存下來' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('更多時間和完成標準都採漸進展開，且完整保留合法選項', () => {
    render(<ParentProposalEditSheet {...defaultProps} />);

    const expandTimes = screen.getByLabelText('展開更多時間選項');
    expect(expandTimes.props.accessibilityState).toEqual({ expanded: false });
    fireEvent.press(expandTimes);
    expect(screen.getByText('上學前')).toBeTruthy();
    expect(screen.getByText('放學後')).toBeTruthy();
    expect(screen.getByText('週末')).toBeTruthy();
    expect(screen.getByText('需要時')).toBeTruthy();
    expect(screen.getByText('自訂時間')).toBeTruthy();
    expect(screen.getByLabelText('收合更多時間選項').props.accessibilityState).toEqual({ expanded: true });
    fireEvent.press(screen.getByLabelText('收合更多時間選項'));
    expect(screen.queryByText('上學前')).toBeNull();

    fireEvent.press(screen.getByLabelText('修改怎樣算完成'));
    expect(screen.getByTestId('proposal-completion-description-input').props.value)
      .toBe('完成一次 15 分鐘閱讀');
  });

  it('收合更多選項時仍顯示原本選中的合法時間', () => {
    const beforeSchoolCard = {
      ...card,
      currentPlanVersion: { ...card.currentPlanVersion!, preferred_time: 'before_school' },
    } as ParentProposalCardData;
    render(<ParentProposalEditSheet {...defaultProps} card={beforeSchoolCard} />);

    expect(screen.getByText('上學前')).toBeTruthy();
    expect(screen.queryByText('放學後')).toBeNull();
    expect(screen.getByLabelText('展開更多時間選項').props.accessibilityState)
      .toEqual({ expanded: false });
  });

  it('保留固定星期、自訂時間與完成標準驗證，固定星期依序送出', () => {
    const onSave = jest.fn();
    render(<ParentProposalEditSheet {...defaultProps} onSave={onSave} />);

    fireEvent.press(screen.getByText('固定星期'));
    fireEvent.press(screen.getByText('存下來，讓孩子看看'));
    expect(screen.getByText('固定星期至少選一天')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('週三'));
    fireEvent.press(screen.getByText('週一'));
    fireEvent.press(screen.getByLabelText('展開更多時間選項'));
    fireEvent.press(screen.getByText('自訂時間'));
    fireEvent.press(screen.getByText('存下來，讓孩子看看'));
    expect(screen.getByText('請填寫適合時間')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('proposal-preferred-time-custom-input'), '  週末早餐後  ');
    fireEvent.press(screen.getByLabelText('修改怎樣算完成'));
    fireEvent.changeText(screen.getByTestId('proposal-completion-description-input'), '   ');
    fireEvent.press(screen.getByText('存下來，讓孩子看看'));
    expect(screen.getByText('請寫下怎樣算完成')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('proposal-completion-description-input'), '  讀完一個章節  ');
    expect(within(screen.getByTestId('proposal-change-summary'))
      .getByText('每週安排：一週 4 次 → 每週一、週三')).toBeTruthy();
    expect(within(screen.getByTestId('proposal-change-summary'))
      .getByText('適合時間：晚餐後 → 週末早餐後')).toBeTruthy();
    expect(within(screen.getByTestId('proposal-change-summary'))
      .getByText('怎樣算完成：完成一次 15 分鐘閱讀 → 讀完一個章節')).toBeTruthy();
    fireEvent.press(screen.getByText('存下來，讓孩子看看'));
    expect(onSave).toHaveBeenCalledWith({
      cadenceMode: 'fixed_days', cadenceWeeklyFrequency: null, cadenceDays: [1, 3],
      preferredTime: 'custom', preferredTimeCustom: '週末早餐後',
      completionDescription: '讀完一個章節',
    });
  });

  it('自訂時間與完成標準符合後端 60/120 字界線並有可存取名稱', () => {
    const onSave = jest.fn();
    render(<ParentProposalEditSheet {...defaultProps} onSave={onSave} />);

    fireEvent.press(screen.getByLabelText('展開更多時間選項'));
    fireEvent.press(screen.getByText('自訂時間'));
    const customInput = screen.getByLabelText('自訂適合時間');
    expect(customInput.props.maxLength).toBe(60);
    fireEvent.changeText(customInput, '時'.repeat(61));
    fireEvent.press(screen.getByText('存下來，讓孩子看看'));
    expect(screen.getByRole('alert')).toHaveTextContent('請用 60 字內描述自訂時間');
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.changeText(customInput, '時'.repeat(60));
    fireEvent.press(screen.getByLabelText('修改怎樣算完成'));
    const completionInput = screen.getByLabelText('怎樣算完成');
    expect(completionInput.props.maxLength).toBe(120);
    fireEvent.changeText(completionInput, '完'.repeat(121));
    fireEvent.press(screen.getByText('存下來，讓孩子看看'));
    expect(screen.getByRole('alert')).toHaveTextContent('請用 120 字內描述怎樣算完成');
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.changeText(completionInput, '完'.repeat(120));
    fireEvent.press(screen.getByText('存下來，讓孩子看看'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      preferredTimeCustom: '時'.repeat(60),
      completionDescription: '完'.repeat(120),
    }));
  });

  it('保留 saving、error 與 close 狀態，未指定時間不會被偷偷改值', () => {
    const onClose = jest.fn();
    const onSave = jest.fn();
    const withoutTime = {
      ...card,
      currentPlanVersion: { ...card.currentPlanVersion!, preferred_time: null },
    } as ParentProposalCardData;
    render(<ParentProposalEditSheet
      {...defaultProps}
      card={withoutTime}
      saving
      error="計畫已更新，請重新整理"
      onClose={onClose}
      onSave={onSave}
    />);

    expect(screen.getByText('計畫已更新，請重新整理')).toBeTruthy();
    expect(screen.getByText('正在存下來…')).toBeTruthy();
    expect(screen.getByLabelText('關閉').props.accessibilityState).toEqual({ disabled: true });
    screen.UNSAFE_getByType(Modal).props.onRequestClose();
    fireEvent.press(screen.getByText('關閉'));
    fireEvent.press(screen.getByText('正在存下來…'));
    expect(onClose).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('修正驗證錯誤並送出後，外部儲存錯誤不會被舊驗證訊息遮住', () => {
    const onSave = jest.fn();
    const { rerender } = render(<ParentProposalEditSheet {...defaultProps} onSave={onSave} />);

    fireEvent.press(screen.getByText('固定星期'));
    fireEvent.press(screen.getByText('存下來，讓孩子看看'));
    expect(screen.getByText('固定星期至少選一天')).toBeTruthy();

    fireEvent.press(screen.getByText('週一'));
    fireEvent.press(screen.getByText('存下來，讓孩子看看'));
    expect(onSave).toHaveBeenCalledTimes(1);

    rerender(<ParentProposalEditSheet
      {...defaultProps}
      error="計畫儲存失敗，請再試一次"
      onSave={onSave}
    />);
    expect(screen.getByText('計畫儲存失敗，請再試一次')).toBeTruthy();
    expect(screen.queryByText('固定星期至少選一天')).toBeNull();
  });

  it('新的本機驗證錯誤優先於舊外部錯誤，修改欄位後立即清除並可被讀出', () => {
    render(<ParentProposalEditSheet
      {...defaultProps}
      error="上一次儲存失敗"
    />);

    fireEvent.press(screen.getByText('固定星期'));
    fireEvent.press(screen.getByText('存下來，讓孩子看看'));
    const validationError = screen.getByRole('alert');
    expect(validationError).toHaveTextContent('固定星期至少選一天');
    expect(validationError.props.accessibilityLiveRegion).toBe('assertive');
    expect(screen.queryByText('上一次儲存失敗')).toBeNull();

    fireEvent.press(screen.getByText('週一'));
    expect(screen.queryByText('固定星期至少選一天')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('上一次儲存失敗');
  });

  it('關閉再重開會重設欄位、disclosure 與本機錯誤', () => {
    const { rerender } = render(<ParentProposalEditSheet {...defaultProps} />);

    fireEvent.press(screen.getByLabelText('減少每週次數'));
    fireEvent.press(screen.getByLabelText('展開更多時間選項'));
    fireEvent.press(screen.getByLabelText('修改怎樣算完成'));
    fireEvent.changeText(screen.getByLabelText('怎樣算完成'), '改過的完成標準');
    fireEvent.press(screen.getByText('固定星期'));
    fireEvent.press(screen.getByText('存下來，讓孩子看看'));
    expect(screen.getByText('固定星期至少選一天')).toBeTruthy();

    rerender(<ParentProposalEditSheet {...defaultProps} visible={false} />);
    rerender(<ParentProposalEditSheet {...defaultProps} />);

    expect(screen.getByText('4 次')).toBeTruthy();
    expect(screen.getByTestId('proposal-weekly-frequency-stepper')).toBeTruthy();
    expect(screen.queryByTestId('proposal-weekly-frequency-input')).toBeNull();
    expect(screen.getByLabelText('展開更多時間選項').props.accessibilityState)
      .toEqual({ expanded: false });
    expect(screen.getByLabelText('修改怎樣算完成').props.accessibilityState)
      .toEqual({ expanded: false });
    expect(screen.queryByTestId('proposal-completion-description-input')).toBeNull();
    expect(within(screen.getByTestId('proposal-change-summary')).getByText('目前沒有調整')).toBeTruthy();
    expect(screen.queryByText('固定星期至少選一天')).toBeNull();
  });

  it('意外開啟不支援的 one-time 計畫時只顯示真實原始節奏，不提供編輯或儲存', () => {
    const oneTimeCard = {
      ...card,
      currentPlanVersion: {
        ...card.currentPlanVersion!,
        cadence_mode: 'one_time',
        cadence_weekly_frequency: null,
        cadence_days: null,
      },
    } as ParentProposalCardData;
    render(<ParentProposalEditSheet {...defaultProps} card={oneTimeCard} />);

    expect(screen.getByText('原本安排：先完成一次')).toBeTruthy();
    expect(screen.getByText('這種一次完成的計畫目前不能在這裡調整')).toBeTruthy();
    expect(screen.queryByText('一週幾次')).toBeNull();
    expect(screen.queryByText('固定星期')).toBeNull();
    expect(screen.queryByText('存下來，讓孩子看看')).toBeNull();
    expect(screen.queryByTestId('proposal-change-summary')).toBeNull();
  });
});
