import { Dimensions, Platform, type ViewStyle } from 'react-native';

/**
 * Web dev preview 便利樣式。
 *
 * Bug 背景：Expo Metro web 下，根容器高度靠內容撐（沒被鎖在視窗高），
 * flex:1 在「沒有明確高度的祖先」裡量不到可分配空間 → 資料一多內容變長，
 * 就把固定在底部的 BottomNav 擠到視窗外（空資料時內容短，tab 反而看得到）。
 * 解法：最外層在 web 直接鎖「視窗固定高 + overflow hidden」，內部 ScrollView(flex:1)
 * 自己捲、BottomNav 釘在底。native 則單純 flex:1。
 *
 * 用法：把畫面最外層換成 <View style={webScreen}>，裡面照舊放 SafeAreaView(flex:1)。
 * 孩子端手機頁再吃「手機寬度置中欄」，桌機瀏覽器不會被拉全寬，demo 就是一支手機。
 */
const windowHeight = Dimensions.get('window').height;

/** 家長端平板：滿寬、固定視窗高。 */
export const webFullHeight: ViewStyle = Platform.OS === 'web'
  ? { height: windowHeight, overflow: 'hidden' }
  : { flex: 1 };

/** 孩子端手機頁最外層容器：固定視窗高 + overflow hidden + 手機寬度置中欄。 */
export const webScreen: ViewStyle = Platform.OS === 'web'
  ? { height: windowHeight, overflow: 'hidden', maxWidth: 440, width: '100%', alignSelf: 'center' }
  : { flex: 1 };

/** 家長端平板三欄 console 最外層容器：固定視窗高 + 滿寬自適應。 */
export const webTabletScreen: ViewStyle = Platform.OS === 'web'
  ? { height: windowHeight, overflow: 'hidden', width: '100%' }
  : { flex: 1 };

/** Web ScrollView：讓平板預覽有可拖曳/可滑動的滑鼠 affordance。 */
export const webMouseDraggableScroll: ViewStyle = Platform.OS === 'web'
  ? ({
      cursor: 'grab',
      userSelect: 'none',
      touchAction: 'pan-y',
      overscrollBehavior: 'contain',
      scrollbarWidth: 'thin',
    } as unknown as ViewStyle)
  : {};
