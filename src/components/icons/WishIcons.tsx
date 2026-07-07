import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

// 繪本 — 挑一本繪本帶回家
export function BookIcon({ size = 22, color = '#5E9A32' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 6.5c-1.6-1-3.8-1.4-6-1.2v13c2.2-.2 4.4.2 6 1.2 1.6-1 3.8-1.4 6-1.2v-13c-2.2-.2-4.4.2-6 1.2z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 6.5v13" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

// 電影 — 看一部電影
export function MovieIcon({ size = 22, color = '#5994B3' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3.5} y={7} width={17} height={12} rx={2} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M4 7l2.4-3.2h3l-2 3.2M10.6 7l2.4-3.2h3l-2 3.2M17.2 7l1.8-2.4" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// 卡牌 — 寶可夢卡牌
export function CardIcon({ size = 22, color = '#C6811F' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={3} width={14} height={18} rx={2} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Circle cx={12} cy={11} r={3.6} stroke={color} strokeWidth={1.6} />
      <Path d="M8 17h8" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

// 漫畫 — 買一本漫畫
export function ComicIcon({ size = 22, color = '#8467AD' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={4} width={16} height={16} rx={2} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M8 9.5h5M8 13h8M8 16h6" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

// 野餐籃 — 去公園野餐
export function BasketIcon({ size = 22, color = '#5E9A32' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4.5 10.5h15l-1.6 8.4a2 2 0 01-2 1.6H8.1a2 2 0 01-2-1.6l-1.6-8.4z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M8 10.5c0-3 1.8-5 4-5s4 2 4 5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M4.5 10.5h15M9 13.5v4M15 13.5v4" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

// 禮物 — fallback（沒對到關鍵字的願望）
export function GiftIcon({ size = 22, color = '#B5552F' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={10} width={16} height={10} rx={1.5} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M4 10h16v3H4z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M12 10v10M12 10c-1.4-2.6-3.4-4-4.6-3.2-1.2.8-.6 2.6 1 3.2M12 10c1.4-2.6 3.4-4 4.6-3.2 1.2.8.6 2.6-1 3.2" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
