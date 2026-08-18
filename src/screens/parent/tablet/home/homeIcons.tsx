// Shadow Wallet · Parent Tablet Home — 統一風格 icon 集（v14 理想圖改版）
//
// 規則（讓所有 icon 是「同一種樣式」）：
//   小 icon：24 viewBox、strokeWidth 1.8、round cap/join 的線條圖，放在柔色圓底（IconBubble）上。
//   大插圖：codex 生成 PNG（assets/images/parent/）；圖檔到位前用同風格 SVG 佔位。
//   換圖方式：把 ILLUSTRATION_SOURCES 對應鍵從 null 改成 require('...')，元件會自動改渲染 Image。
//
// 顏色一律走 parentTheme token（review 規則：screens/components 禁止硬編 hex）。

import React from 'react';
import { View, Image, StyleSheet, type ImageSourcePropType } from 'react-native';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';
import { ParentColors } from '../../../../constants/parentTheme';

// ─────────────────────────────────────────────────────────────────────────────
// 基礎小 icon（線條風）
// ─────────────────────────────────────────────────────────────────────────────

type IconProps = { size?: number; color?: string };

export function SunIcon({ size = 15, color = ParentColors.gold500 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={4.4} stroke={color} strokeWidth={1.8} />
      <Path
        d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9"
        stroke={color} strokeWidth={1.8} strokeLinecap="round"
      />
    </Svg>
  );
}

export function BellIcon({ size = 20, color = ParentColors.fgSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 9.5a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path d="M10 19.5a2.2 2.2 0 004 0" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function ChevronDownIcon({ size = 14, color = ParentColors.fgMuted }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9l6 6 6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 14, color = ParentColors.ink300 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function PlusIcon({ size = 14, color = ParentColors.onSidebarMuted }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

// ── 頭像下拉選單 icon ────────────────────────────────────────────────────────

export function UserCircleIcon({ size = 16, color = ParentColors.fgSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
      <Circle cx={12} cy={10} r={3.2} stroke={color} strokeWidth={1.8} />
      <Path d="M6.3 18.2c1-2.3 3.2-3.7 5.7-3.7s4.7 1.4 5.7 3.7" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function LogoutIcon({ size = 16, color = ParentColors.error }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 4H6a2 2 0 00-2 2v12a2 2 0 002 2h3" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M14 8l4 4-4 4M18 12H9" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── 側欄導航 icon（沿用 ParentTabNavigator 的形狀，統一到本檔）────────────────

export function HomeNavIcon({ size = 17, color = ParentColors.onSidebar }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M9 21V12h6v9" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ChartNavIcon({ size = 17, color = ParentColors.onSidebar }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 20h18" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Rect x={5} y={13} width={3} height={7} rx={1} stroke={color} strokeWidth={1.8} />
      <Rect x={10} y={9} width={3} height={11} rx={1} stroke={color} strokeWidth={1.8} />
      <Rect x={16} y={5} width={3} height={15} rx={1} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

export function GearNavIcon({ size = 17, color = ParentColors.onSidebar }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.8} />
      <Path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round"
      />
    </Svg>
  );
}

// ── 本週摘要四格 icon ─────────────────────────────────────────────────────────

export function CoinIcon({ size = 16, color = ParentColors.gold700 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
      <Path
        d="M12 8v8M9.5 10.5c0-1 1-2 2.5-2s2.5 1 2.5 2-1 1.5-2.5 1.5-2.5.5-2.5 1.5 1 2 2.5 2 2.5-1 2.5-2"
        stroke={color} strokeWidth={1.6} strokeLinecap="round"
      />
    </Svg>
  );
}

export function CheckSquareIcon({ size = 16, color = ParentColors.leaf700 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={4} width={16} height={16} rx={3.5} stroke={color} strokeWidth={1.8} />
      <Path d="M8.5 12.2l2.6 2.6 4.6-5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ClockIcon({ size = 16, color = ParentColors.pine400 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
      <Path d="M12 7v5l3.2 2.4" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function HeartIcon({ size = 16, color = ParentColors.amber700 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 20.5s-7.5-4.7-9.3-9.2C1.5 8.2 3.4 5 6.7 5c2 0 3.6 1.1 4.4 2.7l.9 1.7.9-1.7C13.7 6.1 15.3 5 17.3 5c3.3 0 5.2 3.2 4 6.3-1.8 4.5-9.3 9.2-9.3 9.2z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

// ── 右欄 AI 顧問 icon ────────────────────────────────────────────────────────

export function RobotIcon({ size = 20, color = ParentColors.pine500 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={8} width={14} height={11} rx={3.5} stroke={color} strokeWidth={1.8} />
      <Path d="M12 8V4.6M12 4.6a1.4 1.4 0 10-.01-2.8A1.4 1.4 0 0012 4.6z" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={9.4} cy={13} r={1.15} fill={color} />
      <Circle cx={14.6} cy={13} r={1.15} fill={color} />
      <Path d="M9.6 16.4h4.8" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M2.8 12.5v2.5M21.2 12.5v2.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function StarIcon({ size = 14, color = ParentColors.gold500 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3.6l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

export function SlidersIcon({ size = 14, color = ParentColors.pine400 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={4} y1={8} x2={20} y2={8} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={4} y1={16} x2={20} y2={16} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={9.5} cy={8} r={2.2} fill="#FFFFFF" stroke={color} strokeWidth={1.8} />
      <Circle cx={14.5} cy={16} r={2.2} fill="#FFFFFF" stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

export function CalendarIcon({ size = 16, color = ParentColors.pine400 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3.5} y={5} width={17} height={15.5} rx={2.5} stroke={color} strokeWidth={1.8} />
      <Path d="M3.5 9.5h17M8 3v4M16 3v4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function FootprintIcon({ size = 16, color = ParentColors.pine400 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9.5 3.5c-2.3 0-3.6 2-3.6 4.6 0 1.6.6 2.4.6 4 0 2-1.3 2.7-1.3 5 0 1.9 1.4 3.4 3.1 3.4 2 0 2.7-1.6 2.7-4.2V8c0-2.8-.6-4.5-1.5-4.5z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
      <Circle cx={8.6} cy={5.6} r={0.9} fill={color} />
      <Path
        d="M17 9c-2 0-3.1 1.7-3.1 4 0 1.4.5 2 .5 3.4 0 1.7-1.1 2.3-1.1 4.3 0 1.6 1.2 2.8 2.6 2.8 1.7 0 2.3-1.3 2.3-3.5v-6.8c0-2.4-.5-4.2-1.2-4.2z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
      <Circle cx={16.3} cy={10.8} r={0.9} fill={color} />
    </Svg>
  );
}

export function GiftIcon({ size = 14, color = ParentColors.clay500 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 12v10H4V12M22 7H2v5h20V7zM12 22V7" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function InfoIcon({ size = 14, color = ParentColors.fgMuted }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
      <Path d="M12 11v5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={12} cy={7.8} r={1} fill={color} />
    </Svg>
  );
}

export function CheckIcon({ size = 16, color = ParentColors.onSidebar }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5l4.5 4.5L19 7" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function PencilIcon({ size = 15, color = ParentColors.accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 20h4L19.5 8.5a2.1 2.1 0 00-3-3L5 17v3z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M14.5 6.5l3 3" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function SendArrowIcon({ size = 13, color = ParentColors.onSidebar }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 12h14M13 6l6 6-6 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 任務 glyph（依任務名稱關鍵字對應；同一線條風格）
// ─────────────────────────────────────────────────────────────────────────────

export type TaskGlyphKind =
  | 'tooth' | 'book' | 'moon' | 'music' | 'dish' | 'backpack'
  | 'broom' | 'trash' | 'droplet' | 'paw' | 'pencil' | 'star';

function ToothGlyph({ size, color }: Required<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8 3.5C5.5 3.5 4 5.6 4 8c0 4.5 2.2 12.5 4 12.5 1.5 0 1.4-4.5 4-4.5s2.5 4.5 4 4.5c1.8 0 4-8 4-12.5 0-2.4-1.5-4.5-4-4.5-1.8 0-3 1.2-4 1.2s-2.2-1.2-4-1.2z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

function BookGlyph({ size, color }: Required<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 6.5C10.5 5 8.5 4.5 5.5 4.5c-1 0-2 .2-2.5.4v13.6c.5-.2 1.5-.4 2.5-.4 3 0 5 .5 6.5 2 1.5-1.5 3.5-2 6.5-2 1 0 2 .2 2.5.4V4.9c-.5-.2-1.5-.4-2.5-.4-3 0-5 .5-6.5 2zM12 6.5v13.6"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

function MoonGlyph({ size, color }: Required<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 13.5A8 8 0 1110 3.6a6.5 6.5 0 0010 9.9z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

function MusicGlyph({ size, color }: Required<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18.5V5.5l11-2v13" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={6.5} cy={18.5} r={2.5} stroke={color} strokeWidth={1.8} />
      <Circle cx={17.5} cy={16.5} r={2.5} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

function DishGlyph({ size, color }: Required<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 12.5h16c0 4-3 7-8 7s-8-3-8-7z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M9 9c0-1.5 1.2-1.8 1.2-3M13.8 9c0-1.5 1.2-1.8 1.2-3" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function BackpackGlyph({ size, color }: Required<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9a6 6 0 0112 0v11H6V9z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M9 4.5V4a3 3 0 016 0v.5M6 14h12M10 17h4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function BroomGlyph({ size, color }: Required<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M14.5 3l-4 8.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path
        d="M10.5 11.5c-3 0-5.5 2.5-6 8 0 .5.3 1 1 1 5.5 0 8.5-1.5 10-6.5l-5-2.5z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

function TrashGlyph({ size, color }: Required<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 6.5h16M9 6.5V4.8a1.3 1.3 0 011.3-1.3h3.4A1.3 1.3 0 0115 4.8v1.7M6 6.5l1 13a1.5 1.5 0 001.5 1.5h7A1.5 1.5 0 0017 19.5l1-13" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M10 10.5v6M14 10.5v6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function DropletGlyph({ size, color }: Required<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3s6.5 6.5 6.5 11a6.5 6.5 0 11-13 0C5.5 9.5 12 3 12 3z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

function PawGlyph({ size, color }: Required<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={7} cy={9} r={1.8} stroke={color} strokeWidth={1.6} />
      <Circle cx={17} cy={9} r={1.8} stroke={color} strokeWidth={1.6} />
      <Circle cx={10} cy={5.5} r={1.8} stroke={color} strokeWidth={1.6} />
      <Circle cx={14} cy={5.5} r={1.8} stroke={color} strokeWidth={1.6} />
      <Path
        d="M12 11.5c-2.8 0-5 2.3-5 4.7 0 1.6 1.2 2.8 2.7 2.8 1 0 1.6-.5 2.3-.5s1.3.5 2.3.5c1.5 0 2.7-1.2 2.7-2.8 0-2.4-2.2-4.7-5-4.7z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

function PencilGlyph({ size, color }: Required<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16.5 4.5l3 3L8 19l-4 1 1-4L16.5 4.5z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path d="M14.5 6.5l3 3" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function StarGlyph({ size, color }: Required<IconProps>) {
  return <StarIcon size={size} color={color} />;
}

const TASK_GLYPHS: Record<TaskGlyphKind, (p: Required<IconProps>) => React.ReactElement> = {
  tooth: ToothGlyph,
  book: BookGlyph,
  moon: MoonGlyph,
  music: MusicGlyph,
  dish: DishGlyph,
  backpack: BackpackGlyph,
  broom: BroomGlyph,
  trash: TrashGlyph,
  droplet: DropletGlyph,
  paw: PawGlyph,
  pencil: PencilGlyph,
  star: StarGlyph,
};

// 關鍵字 → glyph（由上到下先中的先贏）
const TASK_KEYWORD_MAP: { pattern: RegExp; kind: TaskGlyphKind }[] = [
  { pattern: /刷牙|牙/, kind: 'tooth' },
  { pattern: /閱讀|看書|讀|書(?!包)/, kind: 'book' },
  { pattern: /睡|晚安|就寢/, kind: 'moon' },
  { pattern: /琴|音樂|唱|樂器/, kind: 'music' },
  { pattern: /碗|盤|廚|飯後/, kind: 'dish' },
  { pattern: /書包|上學|背包/, kind: 'backpack' },
  { pattern: /掃|整理|收拾|房間/, kind: 'broom' },
  { pattern: /垃圾|回收/, kind: 'trash' },
  { pattern: /澆|花|植物|洗/, kind: 'droplet' },
  { pattern: /狗|貓|寵物|餵/, kind: 'paw' },
  { pattern: /作業|功課|寫|練習/, kind: 'pencil' },
];

/** 依任務名稱推 glyph 種類；沒中任何關鍵字給 star。 */
export function taskGlyphKind(name: string): TaskGlyphKind {
  for (const { pattern, kind } of TASK_KEYWORD_MAP) {
    if (pattern.test(name)) return kind;
  }
  return 'star';
}

// glyph 種類 → 柔色圓底＋前景色（tint 走 token；同 glyph 永遠同色，畫面才不花）
const GLYPH_TINTS: Record<TaskGlyphKind, { bg: string; fg: string }> = {
  tooth:    { bg: ParentColors.tintPine,  fg: ParentColors.pine400 },
  book:     { bg: ParentColors.tintGold,  fg: ParentColors.gold700 },
  moon:     { bg: ParentColors.tintPlum,  fg: ParentColors.plum500 },
  music:    { bg: ParentColors.tintClay,  fg: ParentColors.clay500 },
  dish:     { bg: ParentColors.tintLeaf,  fg: ParentColors.leaf700 },
  backpack: { bg: ParentColors.tintAmber, fg: ParentColors.amber700 },
  broom:    { bg: ParentColors.tintLeaf,  fg: ParentColors.leaf700 },
  trash:    { bg: ParentColors.tintPine,  fg: ParentColors.pine400 },
  droplet:  { bg: ParentColors.tintPine,  fg: ParentColors.pine400 },
  paw:      { bg: ParentColors.tintClay,  fg: ParentColors.clay500 },
  pencil:   { bg: ParentColors.tintAmber, fg: ParentColors.amber700 },
  star:     { bg: ParentColors.tintGold,  fg: ParentColors.gold700 },
};

/** 圓底任務 icon —— 柔色圓圈＋線條 glyph。 */
export function TaskIconBubble({ name, size = 34 }: { name: string; size?: number }) {
  const kind = taskGlyphKind(name);
  const { bg, fg } = GLYPH_TINTS[kind];
  const Glyph = TASK_GLYPHS[kind];
  return (
    <View style={[taskIconBubbleStyles.bubble, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Glyph size={Math.round(size * 0.55)} color={fg} />
    </View>
  );
}

/** 通用色底圓圈 icon 容器（本週摘要四格等）。 */
export function IconBubble({
  bg,
  size = 40,
  children,
}: {
  bg: string;
  size?: number;
  children: React.ReactNode;
}) {
  return (
    <View style={[taskIconBubbleStyles.bubble, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      {children}
    </View>
  );
}

export const taskIconBubbleStyles = StyleSheet.create({
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 大插圖（codex PNG；到位前用同風格 SVG 佔位）
// ─────────────────────────────────────────────────────────────────────────────

export type IllustrationKind = 'rewardChest' | 'sidebarTree' | 'tipPlant' | 'taskPackWand';

const ILLUSTRATION_SOURCES: Record<IllustrationKind, ImageSourcePropType | null> = {
  rewardChest: require('../../../../../assets/images/parent/reward-chest.png'),
  sidebarTree: require('../../../../../assets/images/parent/sidebar-tree.png'),
  tipPlant: require('../../../../../assets/images/parent/tip-plant.png'),
  taskPackWand: require('../../../../../assets/images/parent/task-pack-wand.png'),
};

function ChestPlaceholder({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Rect x={8} y={20} width={32} height={18} rx={3} fill={ParentColors.clay300} />
      <Path d="M8 23a16 8 0 0132 0v-3a4 4 0 00-4-4H12a4 4 0 00-4 4v3z" fill={ParentColors.clay500} />
      <Rect x={21} y={24} width={6} height={8} rx={1.5} fill={ParentColors.gold300} />
      <Circle cx={24} cy={14} r={3} fill={ParentColors.gold300} />
      <Path d="M14 10l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM36 8l.8 1.6 1.6.8-1.6.8L36 12.8l-.8-1.6-1.6-.8 1.6-.8z" fill={ParentColors.gold500} />
    </Svg>
  );
}

function TreePlaceholder({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path d="M23 30v10" stroke={ParentColors.clay500} strokeWidth={3} strokeLinecap="round" />
      <Circle cx={24} cy={18} r={11} fill={ParentColors.leaf300} />
      <Circle cx={15} cy={24} r={7} fill={ParentColors.leaf500} />
      <Circle cx={33} cy={24} r={7} fill={ParentColors.leaf700} />
      <Circle cx={30} cy={13} r={3} fill={ParentColors.gold300} />
      <Path d="M40 34l.9 1.8 1.8.9-1.8.9-.9 1.8-.9-1.8-1.8-.9 1.8-.9z" fill={ParentColors.gold500} />
    </Svg>
  );
}

function PlantPlaceholder({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path d="M16 32h16l-2 10H18l-2-10z" fill={ParentColors.clay500} />
      <Rect x={14} y={30} width={20} height={4} rx={2} fill={ParentColors.clay300} />
      <Path d="M24 30V18" stroke={ParentColors.leaf500} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M24 22c-6 0-8-4-8-8 5 0 8 3 8 8zM24 18c6 0 8-4 8-8-5 0-8 3-8 8z" fill={ParentColors.leaf300} />
      <Path d="M36 14l.8 1.6 1.6.8-1.6.8-.8 1.6-.8-1.6-1.6-.8 1.6-.8z" fill={ParentColors.gold500} />
    </Svg>
  );
}

function WandPlaceholder({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path d="M14 40L34 16" stroke={ParentColors.clay500} strokeWidth={3.5} strokeLinecap="round" />
      <Path d="M36 6l1.8 3.8 3.8 1.8-3.8 1.8L36 17.2l-1.8-3.8-3.8-1.8 3.8-1.8z" fill={ParentColors.gold300} />
      <Path d="M24 10l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1zM42 22l.9 1.8 1.8.9-1.8.9-.9 1.8-.9-1.8-1.8-.9 1.8-.9z" fill={ParentColors.gold500} />
    </Svg>
  );
}

const ILLUSTRATION_PLACEHOLDERS: Record<IllustrationKind, ({ size }: { size: number }) => React.ReactElement> = {
  rewardChest: ChestPlaceholder,
  sidebarTree: TreePlaceholder,
  tipPlant: PlantPlaceholder,
  taskPackWand: WandPlaceholder,
};

/** 大插圖 —— codex PNG 到位就渲染 Image，否則渲染 SVG 佔位。 */
export function Illustration({ kind, size = 56 }: { kind: IllustrationKind; size?: number }) {
  const source = ILLUSTRATION_SOURCES[kind];
  if (source != null) {
    return <Image source={source} style={{ width: size, height: size }} resizeMode="contain" />;
  }
  const Placeholder = ILLUSTRATION_PLACEHOLDERS[kind];
  return <Placeholder size={size} />;
}
