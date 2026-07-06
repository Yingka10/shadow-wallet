import React, { useId } from 'react';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Colors } from '../../constants/colors';

interface Props {
  /** 0–100 */
  pct: number;
  height?: number;
  from?: string;
  to?: string;
  track?: string;
}

/**
 * 進度條 —— svg 漸層填色（鎖定值＝提案 artifact .lt-bar：珊瑚→金，長期挑戰的簽名色）。
 * 長期挑戰用；之後 Wallet/Wish 也可複用。
 */
export default function ProgressBar({
  pct,
  height = 6,
  from = Colors.coral500,
  to = Colors.gold600,
  track = Colors.cream200,
}: Props) {
  const gid = useId();
  const clamped = Math.max(0, Math.min(100, pct));
  const r = height / 2;
  return (
    <Svg width="100%" height={height}>
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height={height} rx={r} fill={track} />
      {clamped > 0 && (
        <Rect x="0" y="0" width={`${clamped}%`} height={height} rx={r} fill={`url(#${gid})`} />
      )}
    </Svg>
  );
}
