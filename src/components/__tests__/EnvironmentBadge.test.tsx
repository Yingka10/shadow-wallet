// 第七階段 E — 環境標示元件
//
// staging 與正式專案的畫面長得一模一樣。這個 badge 的唯一工作，
// 就是讓「我現在在哪一邊」不必靠記憶。

import React from 'react';
import { render } from '@testing-library/react-native';

import { EnvironmentBadge } from '../EnvironmentBadge';
import { ENVIRONMENT_BADGE_A11Y_LABEL } from '../../lib/environment';

describe('EnvironmentBadge', () => {
  it('staging 顯示 STAGING', () => {
    const r = render(<EnvironmentBadge appEnvironment="staging" visible />);
    expect(r.getByText('STAGING')).toBeTruthy();
  });

  it('development 顯示 DEV', () => {
    const r = render(<EnvironmentBadge appEnvironment="development" visible />);
    expect(r.getByText('DEV')).toBeTruthy();
  });

  it('visible 為 false 時什麼都不畫', () => {
    const r = render(<EnvironmentBadge appEnvironment="staging" visible={false} />);
    expect(r.queryByText('STAGING')).toBeNull();
    expect(r.toJSON()).toBeNull();
  });

  it('production 與 test 即使 visible 也不畫', () => {
    for (const env of ['production', 'test'] as const) {
      const r = render(<EnvironmentBadge appEnvironment={env} visible />);
      expect({ env, tree: r.toJSON() }).toEqual({ env, tree: null });
    }
  });

  it('螢幕閱讀器讀得到，而且不是可點擊的假按鈕', () => {
    const r = render(<EnvironmentBadge appEnvironment="staging" visible />);
    const badge = r.getByLabelText(ENVIRONMENT_BADGE_A11Y_LABEL);
    expect(badge.props.accessibilityRole).toBe('text');
    // pointerEvents="none"：疊在畫面上但不吃任何點擊，不會擋住抽屜或側欄。
    expect(badge.props.pointerEvents).toBe('none');
  });

  it('意思由文字承擔，不是只靠顏色', () => {
    // 灰階截圖或色盲使用者一樣讀得到「STAGING」這四個字。
    const r = render(<EnvironmentBadge appEnvironment="staging" visible />);
    expect(r.getByText('STAGING')).toBeTruthy();
  });
});
