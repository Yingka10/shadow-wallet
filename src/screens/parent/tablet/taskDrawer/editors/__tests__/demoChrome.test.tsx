// 第六階段 A — Demo 顯示模式與新的共用控制元件

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { DisplayModeProvider } from '../../displayMode';
import {
  CompactOptionGrid,
  LocalOnlyNotice,
  PolicyNotice,
  shouldUseCompactGrid,
} from '../EditorControls';
import {
  CARE_ROLE_KIND,
  FAMILY_ROLE_KIND,
  HOMEWORK_METHOD,
  READING_METHOD,
  REVIEW_KIND,
  SCHOOL_SUBJECT,
  SPORT_KIND,
} from '../../taskCatalog';

// ---------------------------------------------------------------------------
// demo / development
// ---------------------------------------------------------------------------

describe('LocalOnlyNotice 的顯示模式', () => {
  const NOTE = '通知尚未接上，提醒方式目前只保存在這份草稿裡。';

  it('demo 模式完全不渲染開發提示', () => {
    const r = render(
      <DisplayModeProvider mode="demo">
        <LocalOnlyNotice>{NOTE}</LocalOnlyNotice>
      </DisplayModeProvider>,
    );
    expect(r.queryByText(NOTE)).toBeNull();
    expect(r.toJSON()).toBeNull();
  });

  it('development 模式保留開發提示', () => {
    const r = render(
      <DisplayModeProvider mode="development">
        <LocalOnlyNotice>{NOTE}</LocalOnlyNotice>
      </DisplayModeProvider>,
    );
    expect(r.queryByText(NOTE)).not.toBeNull();
  });

  it('沒有 Provider 時預設是 demo（忘了傳也要是乾淨畫面）', () => {
    const r = render(<LocalOnlyNotice>{NOTE}</LocalOnlyNotice>);
    expect(r.queryByText(NOTE)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CompactOptionGrid
// ---------------------------------------------------------------------------

describe('shouldUseCompactGrid', () => {
  it('短標籤且不超過六項才走兩欄', () => {
    expect(shouldUseCompactGrid(READING_METHOD.options)).toBe(true);
    expect(shouldUseCompactGrid(HOMEWORK_METHOD.options)).toBe(true);
    expect(shouldUseCompactGrid(FAMILY_ROLE_KIND.options)).toBe(true);
    expect(shouldUseCompactGrid(CARE_ROLE_KIND.options)).toBe(true);
  });

  it('長句子的選項維持整列', () => {
    // 「再試一次容易錯的內容」塞進半寬會變成每格三行。
    expect(shouldUseCompactGrid(REVIEW_KIND.options)).toBe(false);
  });

  it('超過六項的選項組維持整列', () => {
    expect(SCHOOL_SUBJECT.options.length).toBeGreaterThan(6);
    expect(shouldUseCompactGrid(SCHOOL_SUBJECT.options)).toBe(false);
    expect(shouldUseCompactGrid(SPORT_KIND.options)).toBe(false);
  });

  it('空清單不走兩欄', () => {
    expect(shouldUseCompactGrid([])).toBe(false);
  });
});

describe('CompactOptionGrid', () => {
  const OPTIONS = READING_METHOD.options;

  it('single：選一項會回報該 id', () => {
    const onToggle = jest.fn();
    const r = render(
      <CompactOptionGrid
        options={OPTIONS}
        selectedIds={[]}
        selection="single"
        onToggle={onToggle}
        groupLabel="用什麼方式進行？"
      />,
    );
    fireEvent.press(r.getByLabelText('用什麼方式進行？：和家人共讀'));
    expect(onToggle).toHaveBeenCalledWith('with_family');
  });

  it('single 用 radio role，選中狀態走 accessibilityState.checked', () => {
    const r = render(
      <CompactOptionGrid
        options={OPTIONS}
        selectedIds={['self']}
        selection="single"
        onToggle={() => {}}
        groupLabel="用什麼方式進行？"
      />,
    );
    const selected = r.getByLabelText('用什麼方式進行？：自己閱讀');
    expect(selected.props.accessibilityRole).toBe('radio');
    expect(selected.props.accessibilityState.checked).toBe(true);

    const other = r.getByLabelText('用什麼方式進行？：輪流朗讀');
    expect(other.props.accessibilityState.checked).toBe(false);
  });

  it('multiple 用 checkbox role，可以同時選多項', () => {
    const onToggle = jest.fn();
    const r = render(
      <CompactOptionGrid
        options={HOMEWORK_METHOD.options}
        selectedIds={['start', 'order']}
        selection="multiple"
        onToggle={onToggle}
        groupLabel="本次焦點"
      />,
    );
    const first = r.getByLabelText('本次焦點：練習開始');
    expect(first.props.accessibilityRole).toBe('checkbox');
    expect(first.props.accessibilityState.checked).toBe(true);
    expect(r.getByLabelText('本次焦點：安排順序').props.accessibilityState.checked).toBe(true);
    expect(r.getByLabelText('本次焦點：完成後檢查').props.accessibilityState.checked).toBe(false);

    fireEvent.press(r.getByLabelText('本次焦點：完成後檢查'));
    expect(onToggle).toHaveBeenCalledWith('check');
  });

  it('disabled 的格子不可按，且回報 disabled 狀態', () => {
    const onToggle = jest.fn();
    const r = render(
      <CompactOptionGrid
        options={[{ id: 'a', label: '選項一', disabled: true }]}
        selectedIds={[]}
        selection="single"
        onToggle={onToggle}
      />,
    );
    const cell = r.getByLabelText('選項一');
    expect(cell.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(cell);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('沒有 groupLabel 時 label 就是選項本身', () => {
    const r = render(
      <CompactOptionGrid
        options={OPTIONS}
        selectedIds={[]}
        selection="single"
        onToggle={() => {}}
      />,
    );
    expect(r.getByLabelText('自己閱讀')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PolicyNotice 展開／收合
// ---------------------------------------------------------------------------

describe('PolicyNotice', () => {
  const SUMMARY = '不包含明火、利器、清潔劑、重物或危險動物照顧。';
  const DETAILS = '完整安全規則內容';

  it('沒有 details 時就是單純提示，沒有展開按鈕', () => {
    const r = render(<PolicyNotice>{SUMMARY}</PolicyNotice>);
    expect(r.queryByRole('button')).toBeNull();
  });

  it('預設收合：只顯示摘要', () => {
    const r = render(
      <PolicyNotice title="安全原則" details={DETAILS} expandLabel="查看完整安全範圍">
        {SUMMARY}
      </PolicyNotice>,
    );
    expect(r.getByText(SUMMARY)).toBeTruthy();
    expect(r.queryByText(DETAILS)).toBeNull();
    expect(r.getByLabelText('展開安全原則').props.accessibilityState.expanded).toBe(false);
  });

  it('展開後顯示完整內容，狀態同步到 accessibilityState', () => {
    const r = render(
      <PolicyNotice title="安全原則" details={DETAILS} expandLabel="查看完整安全範圍">
        {SUMMARY}
      </PolicyNotice>,
    );
    fireEvent.press(r.getByLabelText('展開安全原則'));

    expect(r.getByText(DETAILS)).toBeTruthy();
    expect(r.getByLabelText('收合安全原則').props.accessibilityState.expanded).toBe(true);
  });

  it('可以再收回去', () => {
    const r = render(
      <PolicyNotice title="安全原則" details={DETAILS}>
        {SUMMARY}
      </PolicyNotice>,
    );
    fireEvent.press(r.getByLabelText('展開安全原則'));
    fireEvent.press(r.getByLabelText('收合安全原則'));
    expect(r.queryByText(DETAILS)).toBeNull();
  });

  it('defaultExpanded 可以一開始就展開', () => {
    const r = render(
      <PolicyNotice title="安全原則" details={DETAILS} defaultExpanded>
        {SUMMARY}
      </PolicyNotice>,
    );
    expect(r.getByText(DETAILS)).toBeTruthy();
  });
});
