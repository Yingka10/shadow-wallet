// Shadow Wallet · Parent Tablet — 預設任務抽屜的 icon 集
//
// 沿用 home/homeIcons.tsx 的規則，讓抽屜跟其他平板頁看起來是同一套：
//   24 viewBox、strokeWidth 1.8、round cap/join 的線條圖，放在柔色圓底上。
// 顏色一律走 parentTheme token（review 規則：screens/components 禁止硬編 hex）。
//
// 這裡只放抽屜專用的主題 glyph；通用 icon（Plus/Chevron/Coin…）請從 home/homeIcons 引入，不要重畫。

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { ParentColors, ParentRadii } from '../../../../constants/parentTheme';
import type { IconKey, PurposeCategory } from './taskCatalog';

type IconProps = { size?: number; color?: string };

const SW = 1.8;

// ─────────────────────────────────────────────────────────────────────────────
// 抽屜外框用
// ─────────────────────────────────────────────────────────────────────────────

export function CloseIcon({ size = 18, color = ParentColors.fgSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function SearchIcon({ size = 17, color = ParentColors.fgMuted }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={6.4} stroke={color} strokeWidth={SW} />
      <Path d="M15.8 15.8L20 20" stroke={color} strokeWidth={SW} strokeLinecap="round" />
    </Svg>
  );
}

export function ChevronLeftIcon({ size = 15, color = ParentColors.fgSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 6l-6 6 6 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function InfoIcon({ size = 16, color = ParentColors.pine400 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={SW} />
      <Path d="M12 11v5" stroke={color} strokeWidth={SW} strokeLinecap="round" />
      <Circle cx={12} cy={7.9} r={1} fill={color} />
    </Svg>
  );
}

export function CheckMarkIcon({ size = 14, color = ParentColors.onSidebar }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5l4.5 4.5L19 7" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 主題 glyph（對應 TaskPreset.glyph）
// ─────────────────────────────────────────────────────────────────────────────

function BookGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 5.2c2.6-.9 4.7-.9 6.6.3.9.5 1.4 1.4 1.4 2.4V20c-1.8-1.4-4-1.8-6.6-1.2A1.1 1.1 0 014 17.7V5.2z"
        stroke={color} strokeWidth={SW} strokeLinejoin="round"
      />
      <Path
        d="M20 5.2c-2.6-.9-4.7-.9-6.6.3-.9.5-1.4 1.4-1.4 2.4V20c1.8-1.4 4-1.8 6.6-1.2a1.1 1.1 0 001.4-1.1V5.2z"
        stroke={color} strokeWidth={SW} strokeLinejoin="round"
      />
    </Svg>
  );
}

function RunGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={14.6} cy={4.9} r={2} stroke={color} strokeWidth={SW} />
      <Path
        d="M8.2 20.5l2.6-4.6 3.1 2.1.9 3.1M6 11.4l3.5-2.2 3.4-.9 3 2.4 3.1.6M13.9 10.7l-3.1 5.2"
        stroke={color} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

function PaletteGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3.5c-4.7 0-8.5 3.6-8.5 8s3.8 8 8.5 8c1.2 0 1.9-.8 1.9-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.4-.6-.4-1 0-.9.7-1.6 1.7-1.6h1.5c2.4 0 4.3-1.9 4.3-4.2 0-3.5-3.7-6.3-8.5-6.3z"
        stroke={color} strokeWidth={SW} strokeLinejoin="round"
      />
      <Circle cx={7.9} cy={11.3} r={1.1} fill={color} />
      <Circle cx={11.3} cy={7.9} r={1.1} fill={color} />
      <Circle cx={15.6} cy={9.4} r={1.1} fill={color} />
    </Svg>
  );
}

function MusicGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18V5.6l10-2v12" stroke={color} strokeWidth={SW} strokeLinejoin="round" />
      <Circle cx={6.6} cy={18} r={2.5} stroke={color} strokeWidth={SW} />
      <Circle cx={16.6} cy={15.6} r={2.5} stroke={color} strokeWidth={SW} />
    </Svg>
  );
}

function CompassGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.6} stroke={color} strokeWidth={SW} />
      <Path
        d="M15.4 8.6l-1.7 5-5 1.7 1.7-5 5-1.7z"
        stroke={color} strokeWidth={SW} strokeLinejoin="round"
      />
    </Svg>
  );
}

function TargetGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.6} stroke={color} strokeWidth={SW} />
      <Circle cx={12} cy={12} r={4.6} stroke={color} strokeWidth={SW} />
      <Circle cx={12} cy={12} r={1.2} fill={color} />
    </Svg>
  );
}

function ClipboardGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 4.6H7.2c-.9 0-1.7.8-1.7 1.7v12.4c0 1 .8 1.7 1.7 1.7h9.6c.9 0 1.7-.7 1.7-1.7V6.3c0-.9-.8-1.7-1.7-1.7H15"
        stroke={color} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"
      />
      <Rect x={9} y={2.9} width={6} height={3.4} rx={1.1} stroke={color} strokeWidth={SW} />
      <Path d="M8.8 12.2l1.6 1.6 3.4-3.4" stroke={color} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8.8 17h6.4" stroke={color} strokeWidth={SW} strokeLinecap="round" />
    </Svg>
  );
}

function SparkGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.3L12 3z"
        stroke={color} strokeWidth={SW} strokeLinejoin="round"
      />
      <Path d="M18.4 16.4l.8 2.2 2.2.8-2.2.8-.8 2.2" stroke={color} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function RoleGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={7.6} r={3.2} stroke={color} strokeWidth={SW} />
      <Path
        d="M5.4 20.4c0-3.3 2.9-5.6 6.6-5.6s6.6 2.3 6.6 5.6"
        stroke={color} strokeWidth={SW} strokeLinecap="round"
      />
      <Path d="M12 2.6l1.1 2.2" stroke={color} strokeWidth={SW} strokeLinecap="round" />
    </Svg>
  );
}

function SproutGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 20.5v-7.2" stroke={color} strokeWidth={SW} strokeLinecap="round" />
      <Path
        d="M12 13.3C12 10 9.6 7.6 6.4 7.6c0 3.3 2.4 5.7 5.6 5.7z"
        stroke={color} strokeWidth={SW} strokeLinejoin="round"
      />
      <Path
        d="M12 13.3c0-3.3 2.4-5.7 5.6-5.7 0 3.3-2.4 5.7-5.6 5.7z"
        stroke={color} strokeWidth={SW} strokeLinejoin="round"
      />
      <Path d="M8.4 20.5h7.2" stroke={color} strokeWidth={SW} strokeLinecap="round" />
    </Svg>
  );
}

function BackpackGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5.6 20.4V11a6.4 6.4 0 0112.8 0v9.4c0 .6-.5 1.1-1.1 1.1H6.7c-.6 0-1.1-.5-1.1-1.1z"
        stroke={color} strokeWidth={SW} strokeLinejoin="round"
      />
      <Path d="M9.2 8.4V5.6a2.8 2.8 0 015.6 0v2.8" stroke={color} strokeWidth={SW} strokeLinecap="round" />
      <Rect x={9.2} y={13.4} width={5.6} height={4} rx={1.1} stroke={color} strokeWidth={SW} />
    </Svg>
  );
}

function PlateGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={7.4} stroke={color} strokeWidth={SW} />
      <Circle cx={12} cy={12} r={3.4} stroke={color} strokeWidth={SW} />
      <Path d="M2.8 4.4v5.2M2.8 9.6v9.6M21.2 4.4v14.8" stroke={color} strokeWidth={SW} strokeLinecap="round" />
    </Svg>
  );
}

function LaundryGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 3.6l3 2 3-2 4.4 2.6-1.8 3.6-1.8-.8v10.4H7.2V9l-1.8.8L3.6 6.2 9 3.6z"
        stroke={color} strokeWidth={SW} strokeLinejoin="round"
      />
    </Svg>
  );
}

function BroomGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18.6 3.4l-7.4 7.4" stroke={color} strokeWidth={SW} strokeLinecap="round" />
      <Path
        d="M11.6 9.4l3.4 3.4-4.6 7.4H6.2l-1.6-4.6 7-6.2z"
        stroke={color} strokeWidth={SW} strokeLinejoin="round"
      />
      <Path d="M7.6 13.2l3.4 3.4" stroke={color} strokeWidth={SW} strokeLinecap="round" />
    </Svg>
  );
}

function PencilGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.4 16.4L15.8 5a2.6 2.6 0 013.6 3.6L8 20 3.6 21.2l.8-4.8z"
        stroke={color} strokeWidth={SW} strokeLinejoin="round"
      />
      <Path d="M14.4 6.4l3.6 3.6" stroke={color} strokeWidth={SW} strokeLinecap="round" />
    </Svg>
  );
}

function DishesGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.4 10.6h9.2c0 3.4-2 6-4.6 6s-4.6-2.6-4.6-6z"
        stroke={color} strokeWidth={SW} strokeLinejoin="round"
      />
      <Path d="M9 16.6v3.8M6 20.4h6" stroke={color} strokeWidth={SW} strokeLinecap="round" />
      <Path d="M17.4 3.6v8.2M17.4 11.8v8.6" stroke={color} strokeWidth={SW} strokeLinecap="round" />
      <Path d="M15.4 3.6c0 3.4.6 5.2 2 8.2 1.4-3 2-4.8 2-8.2" stroke={color} strokeWidth={SW} strokeLinejoin="round" />
    </Svg>
  );
}

function RecycleGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8.4 4.6l2.2-1.3a1.8 1.8 0 012.5.7l2 3.4"
        stroke={color} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M20.2 12.4l1.1 2.3a1.8 1.8 0 01-1.6 2.6h-4"
        stroke={color} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M7.6 17.3H4.3a1.8 1.8 0 01-1.6-2.6l2-3.6"
        stroke={color} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path d="M13.6 14.9l2.1 2.4-2.4 2M6.9 8.6l-2.2.5.5 2.2M17 7.4l-.4 2.2-2.2-.4" stroke={color} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function BoxGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.4 8.2l8.6-4.4 8.6 4.4v8.2L12 20.6l-8.6-4.2V8.2z"
        stroke={color} strokeWidth={SW} strokeLinejoin="round"
      />
      <Path d="M3.4 8.2L12 12.6l8.6-4.4M12 12.6v8" stroke={color} strokeWidth={SW} strokeLinejoin="round" />
    </Svg>
  );
}

function NotebookGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={5.4} y={3.2} width={13.2} height={17.6} rx={2} stroke={color} strokeWidth={SW} />
      <Path d="M9 3.2v17.6" stroke={color} strokeWidth={SW} />
      <Path d="M12 8h4M12 12h4" stroke={color} strokeWidth={SW} strokeLinecap="round" />
    </Svg>
  );
}

function SunriseGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M7.6 15.4a4.4 4.4 0 018.8 0" stroke={color} strokeWidth={SW} strokeLinecap="round" />
      <Path d="M2.8 19h18.4" stroke={color} strokeWidth={SW} strokeLinecap="round" />
      <Path
        d="M12 2.6v2.8M4.9 6.3l1.9 1.9M19.1 6.3l-1.9 1.9M2.8 15.4h1.6M19.6 15.4h1.6"
        stroke={color} strokeWidth={SW} strokeLinecap="round"
      />
    </Svg>
  );
}

function DoorwayGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6.4 20.4V4.8c0-.9.7-1.6 1.6-1.6h8c.9 0 1.6.7 1.6 1.6v15.6" stroke={color} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M3.8 20.4h16.4" stroke={color} strokeWidth={SW} strokeLinecap="round" />
      <Circle cx={14.4} cy={12.2} r={1.1} fill={color} />
    </Svg>
  );
}

function MoonGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 14.6A8.4 8.4 0 019.4 4a8.6 8.6 0 1010.6 10.6z"
        stroke={color} strokeWidth={SW} strokeLinejoin="round"
      />
    </Svg>
  );
}

function ShelfGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3.4} y={4.2} width={17.2} height={15.6} rx={2} stroke={color} strokeWidth={SW} />
      <Path d="M3.4 12h17.2" stroke={color} strokeWidth={SW} />
      <Path d="M7.2 7v2.8M10.6 7v2.8M7.2 14.8v2.6" stroke={color} strokeWidth={SW} strokeLinecap="round" />
    </Svg>
  );
}

function ScreenGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2.8} y={4.4} width={18.4} height={12.4} rx={2} stroke={color} strokeWidth={SW} />
      <Path d="M8.6 20.2h6.8M12 16.8v3.4" stroke={color} strokeWidth={SW} strokeLinecap="round" />
      <Path d="M12 8v3l2 1.4" stroke={color} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SwitchTaskGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3.6 8.4h13.2l-3-3M20.4 15.6H7.2l3 3" stroke={color} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SelfcareGlyph({ size = 21, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 20.4l-6.6-6.2a4.1 4.1 0 015.8-5.8l.8.8.8-.8a4.1 4.1 0 015.8 5.8L12 20.4z"
        stroke={color} strokeWidth={SW} strokeLinejoin="round"
      />
    </Svg>
  );
}

const GLYPHS: Record<IconKey, (p: IconProps) => React.ReactElement> = {
  book: BookGlyph,
  run: RunGlyph,
  palette: PaletteGlyph,
  music: MusicGlyph,
  compass: CompassGlyph,
  target: TargetGlyph,
  clipboard: ClipboardGlyph,
  spark: SparkGlyph,
  role: RoleGlyph,
  sprout: SproutGlyph,
  backpack: BackpackGlyph,
  plate: PlateGlyph,
  dishes: DishesGlyph,
  laundry: LaundryGlyph,
  broom: BroomGlyph,
  recycle: RecycleGlyph,
  box: BoxGlyph,
  pencil: PencilGlyph,
  notebook: NotebookGlyph,
  sunrise: SunriseGlyph,
  doorway: DoorwayGlyph,
  moon: MoonGlyph,
  shelf: ShelfGlyph,
  screen: ScreenGlyph,
  switchTask: SwitchTaskGlyph,
  selfcare: SelfcareGlyph,
};

/**
 * 分類配色。沿用 parentTheme 的語義色分工：
 *   家庭參與 = pine（共同生活）、自主挑戰 = amber、學習與技能 = leaf、生活小計畫 = clay。
 * 這裡只決定 icon 圓底的色，不代表幣值語義。
 */
const CATEGORY_TINT: Record<PurposeCategory, { bg: string; fg: string }> = {
  family_participation: { bg: ParentColors.tintPine, fg: ParentColors.pine500 },
  autonomous_challenge: { bg: ParentColors.tintAmber, fg: ParentColors.amber700 },
  learning_skill: { bg: ParentColors.tintLeaf, fg: ParentColors.leaf700 },
  life_routine: { bg: ParentColors.tintClay, fg: ParentColors.clay500 },
};

export function categoryTint(category: PurposeCategory) {
  return CATEGORY_TINT[category];
}

/** 卡片左側的主題圖示：柔色圓底 + 線條 glyph。 */
export function PresetGlyph({
  kind,
  category,
  size = 46,
}: {
  kind: IconKey;
  category: PurposeCategory;
  size?: number;
}) {
  const Glyph = GLYPHS[kind];
  const { bg, fg } = CATEGORY_TINT[category];
  return (
    <View
      style={[
        s.bubble,
        { width: size, height: size, borderRadius: ParentRadii.md, backgroundColor: bg },
      ]}
    >
      <Glyph size={Math.round(size * 0.5)} color={fg} />
    </View>
  );
}

const s = StyleSheet.create({
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
