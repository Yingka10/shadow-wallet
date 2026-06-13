// Design tokens for the parent-side UI.
// Source: _design-ref/project/tokens.css + parent-theme.css
// Do NOT edit manually — update the design-ref files instead.

// ---------------------------------------------------------------------------
// Palette — raw color values
// ---------------------------------------------------------------------------

export const ParentPalette = {
  // Ivory (canvas + surfaces)
  ivory50:  '#FAF8F3',
  ivory100: '#F4F1EA',
  ivory200: '#EAE4D7',
  ivory300: '#D9D0BD',

  // Stone (secondary surfaces)
  stone50:  '#F7F6F2',
  stone100: '#EDEBE4',
  stone200: '#DDD9CC',

  // Teal (primary accent)
  teal50:  '#EAF0EE',
  teal100: '#D2DFDB',
  teal200: '#A6C0B9',
  teal300: '#6C9489',
  teal400: '#3D6B61',
  teal500: '#234E47',   // primary
  teal600: '#1A3D38',   // press state
  teal700: '#122B27',

  // Ink (warm charcoal, never pure black)
  ink900: '#1C1B17',
  ink800: '#2C2A24',
  ink700: '#45413A',
  ink500: '#6F6A5E',
  ink400: '#8F897B',
  ink300: '#B0AB9D',

  // Child-identifier accents
  clay300:  '#D3A88A',   // child A
  clay500:  '#B07857',
  sage300:  '#A8B89E',   // child B
  sage500:  '#6E8462',
  plum300:  '#B898A8',   // child C
  plum500:  '#7E5A6F',
} as const;

// ---------------------------------------------------------------------------
// Semantic colors — parent app overrides
// ---------------------------------------------------------------------------

export const ParentColors = {
  ...ParentPalette,

  // Surfaces
  bgCanvas:       '#FAF8F3',   // --p-ivory-50
  bgSurface:      '#FFFFFF',
  bgSurfaceWarm:  '#F4F1EA',   // --p-ivory-100

  // Foreground
  fgPrimary:   '#1C1B17',   // ink900
  fgSecondary: '#45413A',   // ink700
  fgMuted:     '#6F6A5E',   // ink500

  // Interactive
  accent:      '#234E47',   // teal500
  accentPress: '#1A3D38',   // teal600

  // Borders
  borderSoft:   'rgba(28, 27, 23, 0.07)',
  borderMedium: 'rgba(28, 27, 23, 0.14)',

  // Status
  success: '#4F7A4A',
  warn:    '#C28A3A',   // amber, not red
  error:   '#B5552F',   // coral-700 carried in
  info:    '#3D6B61',   // teal-400

  // Shadow base (use as shadowColor in RN props)
  shadowBase: 'rgba(28, 27, 23, 1)',
  shadowTeal: 'rgba(35, 78, 71, 1)',
} as const;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export const ParentFonts = {
  display: 'SourceSerif4',   // "Source Serif 4" — editorial serif
  body:    'DMSans',         // "DM Sans" — clean sans
  mono:    'SpaceMono',
} as const;

// Font sizes (numbers, no 'px' — React Native convention)
export const ParentFontSizes = {
  // Shared scale from tokens.css
  xs:   12,   // --fs-12  meta / fine print
  sm:   14,   // --fs-14  secondary
  base: 16,   // --fs-16  body min
  lg:   18,   // --fs-18  body large
  xl:   20,   // --fs-20  card title
  '2xl': 24,  // --fs-24  section title
  '3xl': 28,  // --fs-28  hero title
  '4xl': 32,  // --fs-32  goal headline
  '5xl': 40,  // --fs-40  celebration

  // Parent-specific semantic sizes (from parent-theme.css class specs)
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
  tight:  1.20,   // --lh-tight
  snug:   1.35,   // --lh-snug
  normal: 1.50,   // --lh-normal
  loose:  1.65,   // --lh-loose

  // Parent-specific (from parent-theme.css)
  display: 1.15,
  h1:      1.20,
  h2:      1.25,
  h3:      1.30,
  pBody:   1.55,
  pMeta:   1.45,
} as const;

export const ParentLetterSpacing = {
  tight:    -0.02,   // display
  snug:     -0.01,   // headings
  normal:    0,
  eyebrow:   0.14,   // uppercase eyebrow labels (em units)
} as const;

// ---------------------------------------------------------------------------
// Spacing — shared scale from tokens.css (React Native uses numbers)
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

  gutter:    16,   // mobile horizontal gutter
  cardPad:   20,   // default card padding
  cardPadLg: 24,   // hero/goal card padding
} as const;

// ---------------------------------------------------------------------------
// Border radii — shared scale from tokens.css
// ---------------------------------------------------------------------------

export const ParentRadii = {
  sm:   8,
  md:   12,
  lg:   20,
  xl:   28,
  pill: 999,
} as const;

// ---------------------------------------------------------------------------
// Shadows — adapted for React Native (single-layer; use elevation for Android)
// ---------------------------------------------------------------------------
// CSS source uses layered box-shadows; RN only supports one shadow layer per
// view. The dominant (largest spread) layer is kept; color is broken out so
// callers can apply shadowColor separately.

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
    // Teal-tinted shadow for primary action surfaces
    shadowColor:   '#234E47',
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius:  24,
    elevation:     10,
  },
} as const;

// ---------------------------------------------------------------------------
// Combined export
// ---------------------------------------------------------------------------

export const ParentTheme = {
  colors:       ParentColors,
  fonts:        ParentFonts,
  fontSizes:    ParentFontSizes,
  fontWeights:  ParentFontWeights,
  lineHeights:  ParentLineHeights,
  letterSpacing: ParentLetterSpacing,
  spacing:      ParentSpacing,
  radii:        ParentRadii,
  shadows:      ParentShadows,
} as const;

export type ParentThemeType = typeof ParentTheme;
