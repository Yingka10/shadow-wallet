import React from 'react';
import Svg, { Path, Circle, Ellipse, Rect } from 'react-native-svg';
import { Colors } from '../../constants/colors';

interface IconProps {
  size?: number;
  color?: string;
}

// Hourglass — duty task marker
export function HourglassIcon({ size = 28 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Path d="M18 8h28M18 56h28" stroke={Colors.ink900} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M20 8c0 10 12 14 12 24S20 46 20 56" stroke={Colors.ink900} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M44 8c0 10-12 14-12 24s12 14 12 24" stroke={Colors.ink900} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M23 12c0 5 3 8 9 13M41 12c0 5-3 8-9 13" fill={Colors.sky200} />
      <Path d="M23 52c0-6 3-9 9-12 6 3 9 6 9 12z" fill={Colors.sky400} />
      <Path d="M23 52c0-6 3-9 9-12 6 3 9 6 9 12" stroke={Colors.ink900} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={32} cy={34} r={1.2} fill={Colors.ink900} />
      <Circle cx={32} cy={38} r={0.8} fill={Colors.ink900} />
    </Svg>
  );
}

// Coin — gold coin for contribution tasks
export function CoinIcon({ size = 28 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Ellipse cx={32} cy={34} rx={22} ry={22} fill={Colors.gold600} />
      <Circle cx={32} cy={32} r={22} fill={Colors.gold500} />
      <Circle cx={32} cy={32} r={18} fill={Colors.gold300} />
      <Path d="M22 22c2-3 6-5 10-5" stroke={Colors.gold100} strokeWidth={2.5} strokeLinecap="round" />
      <Path
        d="M32 22v20M26 27c0-2 2-3 6-3s6 1 6 3-2 3-6 3-6 1-6 3 2 3 6 3 6-1 6-3"
        stroke={Colors.gold700}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

// Check — check-in button
export function CheckIcon({ size = 24, color = Colors.ink900 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5l4.5 4.5L19 7" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Target — long-term goal indicator
export function TargetIcon({ size = 44 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Circle cx={32} cy={32} r={22} stroke={Colors.ink900} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={32} cy={32} r={14} stroke={Colors.ink900} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={32} cy={32} r={6} fill={Colors.coral500} />
      <Circle cx={32} cy={32} r={2} fill={Colors.ink900} />
    </Svg>
  );
}

// Wave — section divider
export function WaveIcon() {
  return (
    <Svg width={40} height={10} viewBox="0 0 40 10" fill="none">
      <Path d="M2 5c4-4 8 4 12 0s8-4 12 0 8 4 12 0" stroke={Colors.ink300} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

// Home — bottom nav
export function HomeIcon({ size = 24, color = Colors.ink500 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 11.5L12 4l9 7.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 10v9h14v-9" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M10 19v-5h4v5" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Wallet — bottom nav
export function WalletIcon({ size = 24, color = Colors.ink500 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={6} width={18} height={13} rx={3} stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 10h13a3 3 0 013 3v0a3 3 0 01-3 3H3" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={14.5} cy={13} r={1.2} fill={color} />
    </Svg>
  );
}

// Star — bottom nav 願望 tab
export function StarIcon({ size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3l2.4 6 6.6.6-5 4.4 1.6 6.5L12 17.3 6.4 20.5 8 14l-5-4.4 6.6-.6z"
        fill={Colors.gold300}
        stroke={Colors.gold600}
        strokeWidth={0}
      />
    </Svg>
  );
}

// Sparkle — bottom nav 回顧 tab
export function SparkleIcon({ size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={Colors.gold500} stroke={Colors.gold600} strokeWidth={1} strokeLinejoin="round">
      <Path d="M12 2l1.6 5.5L19 9l-4 3.8 1 5.5L12 15.6 8 18.3l1-5.5L5 9l5.4-1.5z" />
    </Svg>
  );
}
