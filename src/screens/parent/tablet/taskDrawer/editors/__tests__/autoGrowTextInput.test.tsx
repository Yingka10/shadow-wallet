// AutoGrowTextInput 的收斂性回歸測試
//
// react-native-web 的 contentSize.height 取自 scrollHeight，而 scrollHeight 不會小於
// 我們剛套上去的 height。之前 handleContentSize 在量到的值上又加了一次 padding，
// 於是每一輪都比上一輪高 16px，最後撞上 React 的更新次數上限，整棵樹被卸載 ——
// 畫面就是一片空白。這支測試模擬那個「回音」行為，確認高度會停下來。

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { AutoGrowTextInput } from '../EditorControls';

const MIN_HEIGHT = 84;

function heightOf(input: { props: { style: unknown } }): number {
  const flat = ([] as Array<Record<string, unknown> | false | null | undefined>)
    .concat(input.props.style as never)
    .filter(Boolean) as Array<Record<string, unknown>>;
  const withHeight = flat.filter(entry => typeof entry.height === 'number');
  return withHeight[withHeight.length - 1].height as number;
}

describe('AutoGrowTextInput', () => {
  it('contentSize 回報「目前高度」時不會無限增高', () => {
    const r = render(
      <AutoGrowTextInput
        value=""
        onChangeText={() => {}}
        accessibilityLabel="測試欄位"
        minHeight={MIN_HEIGHT}
      />,
    );
    const input = r.getByLabelText('測試欄位');

    // 模擬 RNW：每次都回報目前套用的高度（scrollHeight >= CSS height）。
    for (let i = 0; i < 30; i++) {
      fireEvent(input, 'contentSizeChange', {
        nativeEvent: { contentSize: { width: 400, height: heightOf(input) } },
      });
    }

    expect(heightOf(input)).toBe(MIN_HEIGHT);
  });

  it('內容變高時會長高，並在下一次回音後停住', () => {
    const r = render(
      <AutoGrowTextInput
        value="很長的一段文字"
        onChangeText={() => {}}
        accessibilityLabel="測試欄位"
        minHeight={MIN_HEIGHT}
      />,
    );
    const input = r.getByLabelText('測試欄位');

    fireEvent(input, 'contentSizeChange', {
      nativeEvent: { contentSize: { width: 400, height: 140 } },
    });
    expect(heightOf(input)).toBe(140);

    // 回音：再量一次得到同一個值，不應該再長高。
    for (let i = 0; i < 10; i++) {
      fireEvent(input, 'contentSizeChange', {
        nativeEvent: { contentSize: { width: 400, height: heightOf(input) } },
      });
    }
    expect(heightOf(input)).toBe(140);
  });

  it('內容小於 minHeight 時不會縮到比 minHeight 矮', () => {
    const r = render(
      <AutoGrowTextInput
        value=""
        onChangeText={() => {}}
        accessibilityLabel="測試欄位"
        minHeight={MIN_HEIGHT}
      />,
    );
    const input = r.getByLabelText('測試欄位');

    fireEvent(input, 'contentSizeChange', {
      nativeEvent: { contentSize: { width: 400, height: 20 } },
    });
    expect(heightOf(input)).toBe(MIN_HEIGHT);
  });
});
