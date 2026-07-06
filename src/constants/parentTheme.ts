/**
 * parentTheme —「陳家的成長帳本」家長端主題（GrowBook）
 * 家長端顏色/字級/間距的唯一來源。2026-07-06 定調（提案 v13）。
 * （原本標「Do NOT edit manually / 來源 design-ref」已失效 —— 這支就是來源。）
 *
 * ── Review 規則（團隊已定，C#2）──────────────────────────────
 *   src/screens/** 與 src/components/** 內出現硬編碼 `#rrggbb` 的 PR 一律退回。
 *   一律走 token；語義層（accent / bgSidebar / pending …）優先於原始色階。
 *
 * ── 三平面（家庭帳本 console 的骨架）───────────────────────────
 *   側欄 bgSidebar 暖松 #2C4A3D（品牌 + 孩子切換器）→ 中欄 bgMain 純白（決策主場）
 *   → 右欄 bgRail 石色 #F7F6F2（本週 + AI 教養顧問，純參考）。
 *
 * ── 顏色紀律（別讓家長端變花）───────────────────────────────
 *   pine   主色 / 側欄 / 主要動作（送出鈕）。
 *   pending（琥珀）只給「待處理數量」—— 申請審核的計數，別挪作它用。
 *   coin（金）只給幣。
 *   done（綠）只給已完成。
 *   珊瑚已退出家長端；error 僅留給破壞性動作，不是品牌色。
 *   全 app 無襯線 —— fonts.display 指向 sans（serif 已否決）。
 *
 * ── 信任制提醒（影響版面，不只顏色）────────────────────────────
 *   完成即發幣、無逐筆確認佇列（「等你確認」是錯的，別再畫）。
 *   家長介入 = 事後 override（每列「⋯」＋左滑退回）。唯一決策面 = 申請審核（兌換＋新任務提案）。
 */

// ---------------------------------------------------------------------------
// Palette — raw color values
// ---------------------------------------------------------------------------

export const ParentPalette = {
  // Pine — 側欄 / 主色（暖松綠）
  pine50:  '#EAF0EC',
  pine100: '#D3E0D8',
  pine200: '#A9C1B4',
  pine300: '#6E8F7F',
  pine400: '#3F5F50',
  pine500: '#2C4A3D',   // 側欄 / primary
  pine600: '#233C31',   // 按壓
  pine700: '#1A2D25',

  // Stone — 右欄 / 次要面
  stone50:  '#F7F6F2',   // 右欄底
  stone100: '#EDEBE4',
  stone200: '#DDD9CC',

  // Ivory — 保留（暖底，卡面偶用）
  ivory50:  '#FAF8F3',
  ivory100: '#F4F1EA',
  ivory200: '#EAE4D7',
  ivory300: '#D9D0BD',

  // Gold — 幣（只給幣）
  gold100: '#FBE9B0',
  gold300: '#F4CE5E',
  gold500: '#E0A500',
  gold700: '#A87800',

  // Amber — 待處理數量（只給申請審核計數）
  amber300: '#E4B76B',
  amber500: '#C28A3A',
  amber700: '#95672A',

  // Leaf — 已完成（只給 done）
  leaf300: '#8FB56E',
  leaf500: '#5E9A32',
  leaf700: '#456E27',

  // Ink — 暖炭（永不純黑）
  ink900: '#1C1B17',
  ink800: '#2C2A24',
  ink700: '#45413A',
  ink500: '#6F6A5E',
  ink400: '#8F897B',
  ink300: '#B0AB9D',

  // 孩子識別色（切換器 / 頭像）
  clay300:  '#D3A88A',   // 孩子 A
  clay500:  '#B07857',
  sage300:  '#A8B89E',   // 孩子 B
  sage500:  '#6E8462',
  plum300:  '#B898A8',   // 孩子 C
  plum500:  '#7E5A6F',

  // @deprecated teal —— 舊 ivory/teal 方向已換成 pine；保留鍵讓舊畫面編譯，C#3 換引用後刪。
  teal50:  '#EAF0EE',
  teal100: '#D2DFDB',
  teal200: '#A6C0B9',
  teal300: '#6C9489',
  teal400: '#3D6B61',
  teal500: '#234E47',
  teal600: '#1A3D38',
  teal700: '#122B27',
} as const;

// ---------------------------------------------------------------------------
// Semantic colors — 家長端語義層（新程式優先用這層）
// ---------------------------------------------------------------------------

export const ParentColors = {
  ...ParentPalette,

  // 三平面
  bgSidebar:     '#2C4A3D',   // pine500 — 左側欄
  bgMain:        '#FFFFFF',   // 中欄決策主場
  bgRail:        '#F7F6F2',   // stone50 — 右欄
  bgCanvas:      '#FFFFFF',   // = bgMain（相容舊名）
  bgSurface:     '#FFFFFF',
  bgSurfaceWarm: '#F7F6F2',   // 改指 stone50（原 ivory100）

  // 側欄上的前景（深底反白）
  onSidebar:       '#FFFFFF',
  onSidebarMuted:  'rgba(255, 255, 255, 0.66)',

  // 前景（淺底）
  fgPrimary:   '#1C1B17',   // ink900
  fgSecondary: '#45413A',   // ink700
  fgMuted:     '#6F6A5E',   // ink500

  // 互動
  accent:      '#2C4A3D',   // pine500
  accentPress: '#233C31',   // pine600

  // 語義狀態（各司其職，別互借）
  pending: '#C28A3A',   // amber500 — 只給待處理數量
  coin:    '#E0A500',   // gold500 — 只給幣
  done:    '#5E9A32',   // leaf500 — 只給已完成

  // 邊界
  borderSoft:   'rgba(28, 27, 23, 0.07)',
  borderMedium: 'rgba(28, 27, 23, 0.14)',
  hairline:     'rgba(28, 27, 23, 0.10)',

  // Status（相容舊名）
  success: '#5E9A32',   // = done
  warn:    '#C28A3A',   // = pending
  error:   '#B5552F',   // 僅破壞性動作，非品牌色
  info:    '#3F5F50',   // pine400

  // shadowColor（RN props）
  shadowBase: 'rgba(28, 27, 23, 1)',
  shadowTeal: 'rgba(35, 78, 71, 1)',   // @deprecated 名稱沿用，值不再是 teal
  shadowPine: 'rgba(44, 74, 61, 1)',
} as const;

// ---------------------------------------------------------------------------
// Typography — 全 app 無襯線
// ---------------------------------------------------------------------------

export const ParentFonts = {
  display: 'DMSans',   // 原 SourceSerif4 —— serif 已否決，標題也走 sans（靠字重拉層級）
  body:    'DMSans',
  mono:    'SpaceMono',
} as const;

// Font sizes (numbers, no 'px' — React Native convention)
export const ParentFontSizes = {
  xs:   12,
  sm:   14,
  base: 16,
  lg:   18,
  xl:   20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
  '5xl': 40,

  // 家長端語義字級
  display: 30,   // .p-display
  h1:      26,   // .p-h1
  h2:      22,   // .p-h2
  h3:      18,   // .p-h3
  eyebrow: 11,   // .p-eyebrow
  pBody:   15,   // .p-body
  pMeta:   13,   // .p-meta
} as const;

export const ParentFontWeights = {
  regular: '400' as const,
  medium:  '500' as const,
  semi:    '600' as const,
  bold:    '700' as const,
  black:   '800' as const,
} as const;

export const ParentLineHeights = {
  tight:  1.20,
  snug:   1.35,
  normal: 1.50,
  loose:  1.65,

  display: 1.15,
  h1:      1.20,
  h2:      1.25,
  h3:      1.30,
  pBody:   1.55,
  pMeta:   1.45,
} as const;

export const ParentLetterSpacing = {
  tight:    -0.02,
  snug:     -0.01,
  normal:    0,
  eyebrow:   0.14,
} as const;

// ---------------------------------------------------------------------------
// Spacing — shared scale (React Native uses numbers)
// ---------------------------------------------------------------------------

export const ParentSpacing = {
  1:  4,
  2:  8,
  3:  12,
  4:  16,
  5:  20,
  6:  24,
  8:  32,
  10: 40,
  12: 48,
  16: 64,

  gutter:    16,
  cardPad:   20,
  cardPadLg: 24,
} as const;

// ---------------------------------------------------------------------------
// Border radii
// ---------------------------------------------------------------------------

export const ParentRadii = {
  sm:   8,
  md:   12,
  lg:   20,
  xl:   28,
  pill: 999,
} as const;

// ---------------------------------------------------------------------------
// Shadows — RN 單層陰影（Android 用 elevation）
// ---------------------------------------------------------------------------

export const ParentShadows = {
  card: {
    shadowColor:   '#1C1B17',
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius:  16,
    elevation:     3,
  },
  elev: {
    shadowColor:   '#1C1B17',
    shadowOffset:  { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius:  28,
    elevation:     8,
  },
  pop: {
    // 主要動作面用松綠陰影
    shadowColor:   '#2C4A3D',
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: 0.30,
    shadowRadius:  24,
    elevation:     10,
  },
} as const;

// ---------------------------------------------------------------------------
// Combined export
// ---------------------------------------------------------------------------

export const ParentTheme = {
  colors:        ParentColors,
  fonts:         ParentFonts,
  fontSizes:     ParentFontSizes,
  fontWeights:   ParentFontWeights,
  lineHeights:   ParentLineHeights,
  letterSpacing: ParentLetterSpacing,
  spacing:       ParentSpacing,
  radii:         ParentRadii,
  shadows:       ParentShadows,
} as const;

export type ParentThemeType = typeof ParentTheme;
