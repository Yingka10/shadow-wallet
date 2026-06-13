import { Dimensions, Platform, type ViewStyle } from 'react-native';

/**
 * 在 web dev preview 上直接給視窗像素高度，讓 flex:1 的根容器能捲動、BottomNav 不消失。
 * height:'100%' 在 Expo Metro web 模式下依賴 CSS 繼承，不夠可靠；
 * 改用 Dimensions.get('window').height 給明確數值，繞過繼承問題。
 */
const windowHeight = Dimensions.get('window').height;

export const webFullHeight: ViewStyle = Platform.OS === 'web'
  ? { height: windowHeight }
  : {};
