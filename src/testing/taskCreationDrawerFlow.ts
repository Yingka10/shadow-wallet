// 測試用：把抽屜從起點頁帶到某一個入口。
//
// 第九階段 C 之前，抽屜一打開就是預設任務清單。現在最前面多了一頁
// 「選擇開始方式」——所有既有的 preset 測試因此要先走過那一頁。
//
// 集中成一支而不是每個檔案各寫兩行：起點頁的按法只要改一次，
// 四個既有測試檔與自訂流程的新測試就都跟著對。

import { fireEvent, type RenderResult } from '@testing-library/react-native';
import { ENTRY_COPY } from '../screens/parent/tablet/taskDrawer/customTask/customTaskCopy';

/** 起點頁 →「從常用任務開始」的預設任務清單。 */
export function enterPresetCatalog(r: RenderResult): RenderResult {
  fireEvent.press(r.getByText(ENTRY_COPY.preset.label));
  fireEvent.press(r.getByText('下一步'));
  return r;
}

/** 起點頁 →「自己建立任務」的基本設定 1／3。 */
export function enterCustomFlow(r: RenderResult): RenderResult {
  fireEvent.press(r.getByText(ENTRY_COPY.parentCustom.label));
  fireEvent.press(r.getByText('下一步'));
  return r;
}
