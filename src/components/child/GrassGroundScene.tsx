import React from 'react';
import Svg, { Defs, LinearGradient, Stop, Ellipse, Path, G } from 'react-native-svg';
import { Colors } from '../../constants/colors';

interface Props {
  /** 草坡帶的高度 */
  height?: number;
  /** day = 白天綠草；night = 晚安模式月光下的暗草坡 */
  variant?: 'day' | 'night';
}

// 單片彎刀草葉 path。x=底部中心, baseY=草地線, h=高度, sway=傾斜量
function blade(x: number, baseY: number, h: number, sway: number): string {
  const w = Math.max(1.3, h * 0.16);
  const tipX = x + sway;
  const tipY = baseY - h;
  return (
    `M ${x - w} ${baseY} ` +
    `Q ${x - w * 0.3} ${baseY - h * 0.55} ${tipX} ${tipY} ` +
    `Q ${x + w * 0.3} ${baseY - h * 0.55} ${x + w} ${baseY} Z`
  );
}

// 一株草叢＝三片彎刀葉
function tuft(x: number, baseY: number, h: number, sway: number): string {
  return [
    blade(x - h * 0.28, baseY, h * 0.82, sway - h * 0.22),
    blade(x, baseY, h, sway),
    blade(x + h * 0.26, baseY, h * 0.78, sway + h * 0.24),
  ].join(' ');
}

// 草叢（三葉）與零星小草（單葉）位置 —— 沿草地線散佈，高低錯落
const TUFTS: Array<[number, number, number, number]> = [
  // x, baseY, height, sway
  [26, 56, 18, 3],
  [72, 51, 15, -3],
  [120, 54, 20, 2],
  [168, 50, 14, -2],
  [214, 55, 17, 3],
  [246, 58, 13, -2],
];
const SMALL_BLADES: Array<[number, number, number, number]> = [
  [50, 58, 9, 2],
  [96, 55, 8, -2],
  [144, 57, 10, 2],
  [192, 54, 8, -2],
  [232, 60, 9, 3],
];

/**
 * 分層草坡 —— 三層草坡（遠→近，淡→深）＋ 草叢＋零星小草，
 * 讓大樹明確站在有層次的草地上，而不是浮在一片平綠上。
 * 色調對齊 design-previews/child-hero-generated.html 的草地 mockup。
 * preserveAspectRatio slice：不同機型寬度都撐滿、底部對齊，不會露白邊。
 * 首頁 hero 與許願樹 hero 共用同一套草地語言。
 */
export default function GrassGroundScene({ height = 96, variant = 'day' }: Props) {
  const g = Colors.grass;
  const c =
    variant === 'night'
      ? {
          backTop: g.nightHillBackTop, backBottom: g.nightHillBackBottom,
          midTop: g.nightHillMidTop, midBottom: g.nightHillMidBottom,
          frontTop: g.nightHillFrontTop, frontBottom: g.nightHillFrontBottom,
          bladeTop: g.nightBladeTop, bladeBottom: g.nightBladeBottom,
        }
      : {
          backTop: g.hillBackTop, backBottom: g.hillBackBottom,
          midTop: g.hillMidTop, midBottom: g.hillMidBottom,
          frontTop: g.hillFrontTop, frontBottom: g.hillFrontBottom,
          bladeTop: g.bladeTop, bladeBottom: g.bladeBottom,
        };

  return (
    <Svg width="100%" height={height} viewBox="0 0 260 96" preserveAspectRatio="xMidYMax slice">
      <Defs>
        <LinearGradient id="ggBack" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.backTop} />
          <Stop offset="1" stopColor={c.backBottom} />
        </LinearGradient>
        <LinearGradient id="ggMid" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.midTop} />
          <Stop offset="1" stopColor={c.midBottom} />
        </LinearGradient>
        <LinearGradient id="ggFront" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.frontTop} />
          <Stop offset="1" stopColor={c.frontBottom} />
        </LinearGradient>
        <LinearGradient id="ggBlade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.bladeTop} />
          <Stop offset="1" stopColor={c.bladeBottom} />
        </LinearGradient>
      </Defs>

      {/* 三層草坡（大橢圓，圓弧坡頂，遠淡近深） */}
      <Ellipse cx={130} cy={104} rx={214} ry={74} fill="url(#ggBack)" opacity={0.75} />
      <Ellipse cx={130} cy={110} rx={192} ry={66} fill="url(#ggMid)" />
      <Ellipse cx={130} cy={116} rx={176} ry={62} fill="url(#ggFront)" />

      {/* 零星小草（單葉，較淡，襯在草叢之間） */}
      <G fill="url(#ggBlade)" opacity={0.7}>
        {SMALL_BLADES.map(([x, y, h, s], i) => (
          <Path key={`s${i}`} d={blade(x, y, h, s)} />
        ))}
      </G>

      {/* 草叢（三葉） */}
      <G fill="url(#ggBlade)">
        {TUFTS.map(([x, y, h, s], i) => (
          <Path key={`t${i}`} d={tuft(x, y, h, s)} opacity={i > 3 ? 0.9 : 1} />
        ))}
      </G>
    </Svg>
  );
}
