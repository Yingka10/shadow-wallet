import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Colors } from '../../constants/colors';

/**
 * 成長大樹頁面底 —— 連續「葉綠 → 奶油」直向漸層（鎖定值＝提案 artifact .g-phone）。
 * 用已安裝的 react-native-svg 畫，不引入 expo-linear-gradient（零新依賴）。
 * 放在畫面最底層（absoluteFill），內容疊在上面；頁面容器 backgroundColor 設 transparent。
 *
 * gid 用 useId() 產生 —— 同一畫面可能有多個實例同時掛載（例如 stack navigator
 * 沒把上一頁卸載就疊了新的一頁），固定字串 id 的 <LinearGradient> 在 web 上會撞名，
 * 導致其中一頁的漸層渲染失敗、整片只剩單一底色（曾經回上一頁看到「全綠」就是這個）。
 */
export default function GradientBackground() {
  const gid = useId();
  const colors = Colors.gradientPage;
  const stops = Colors.gradientPageStops;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            {colors.map((c, i) => (
              <Stop key={i} offset={stops[i]} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gid})`} />
      </Svg>
    </View>
  );
}
