import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ParentProposalUnsuitableSheet, UNSUITABLE_REASON_PRESETS } from '../ParentProposalUnsuitableSheet';

describe('ParentProposalUnsuitableSheet', () => {
  it('提供三個自然 preset，點選後可直接送出', () => {
    const onSubmit = jest.fn();
    render(<ParentProposalUnsuitableSheet
      visible saving={false} error={null} onClose={jest.fn()} onSubmit={onSubmit}
    />);
    expect(screen.getByText('想留一句話給孩子嗎？')).toBeTruthy();
    for (const preset of UNSUITABLE_REASON_PRESETS) expect(screen.getByText(preset)).toBeTruthy();
    fireEvent.press(screen.getByText(UNSUITABLE_REASON_PRESETS[0]));
    fireEvent.press(screen.getByText('先把這個想法收好'));
    expect(onSubmit).toHaveBeenCalledWith(UNSUITABLE_REASON_PRESETS[0]);
  });

  it('只有自己寫一句才展開文字輸入，空白不能送出', () => {
    const onSubmit = jest.fn();
    render(<ParentProposalUnsuitableSheet
      visible saving={false} error={null} onClose={jest.fn()} onSubmit={onSubmit}
    />);
    expect(screen.queryByTestId('proposal-unsuitable-custom-input')).toBeNull();
    fireEvent.press(screen.getByText('自己寫一句'));
    const input = screen.getByTestId('proposal-unsuitable-custom-input');
    fireEvent.changeText(input, '   ');
    fireEvent.press(screen.getByText('先把這個想法收好'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('請留一句話給孩子')).toBeTruthy();
  });

  it('custom reason trim 後送出，並顯示 pending/typed error', () => {
    const onSubmit = jest.fn();
    render(<ParentProposalUnsuitableSheet
      visible saving error="計畫已更新" onClose={jest.fn()} onSubmit={onSubmit}
    />);
    fireEvent.press(screen.getByText('自己寫一句'));
    fireEvent.changeText(screen.getByTestId('proposal-unsuitable-custom-input'), ' 我們週末再聊 ');
    fireEvent.press(screen.getByText('正在收好…'));
    expect(onSubmit).toHaveBeenCalledWith('我們週末再聊');
    expect(screen.getByText('計畫已更新')).toBeTruthy();
  });
});
