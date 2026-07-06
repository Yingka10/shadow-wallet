import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Ellipse, G } from 'react-native-svg';
import { Colors } from '../../constants/colors';

/**
 * 地面 —— hero 區塊的全寬柔和暈染 + 草叢，鎖定樣式＝提案 artifact 的 grounded vignette。
 * 樹「站」在這片地上（樹的落地陰影跟這裡的暈染疊在一起），草叢貫穿整個寬度、
 * 連問候文字下方也看得到，不再是「樹自己飄一小塊地」。純裝飾、不承載互動。
 */
export default function GroundWash() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 288 100" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
      {/* 全寬柔和暈染 */}
      <Ellipse cx={144} cy={112} rx={200} ry={34} fill={Colors.groundWash} opacity={0.5} />
      {/* 樹腳下較深的地面陰影（跟樹的落地位置對齊，由外層擺放樹的位置決定） */}
      <Ellipse cx={212} cy={86} rx={56} ry={9} fill={Colors.groundShadow} opacity={0.55} />
      {/* 草叢 —— 貫穿全寬 */}
      <G fill={Colors.grassTuft} opacity={0.9}>
        <Ellipse cx={16}  cy={86} rx={4}   ry={6} />
        <Ellipse cx={44}  cy={91} rx={3.5} ry={5} />
        <Ellipse cx={78}  cy={87} rx={4}   ry={6} />
        <Ellipse cx={112} cy={92} rx={3.5} ry={5} />
        <Ellipse cx={142} cy={88} rx={4}   ry={6} />
        <Ellipse cx={252} cy={90} rx={4}   ry={6} />
        <Ellipse cx={272} cy={87} rx={3.5} ry={5} />
      </G>
    </Svg>
  );
}
