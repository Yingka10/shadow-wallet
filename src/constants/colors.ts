export const Colors = {
  // Cream (canvas + surfaces)
  cream50:  '#FFF8EE',
  cream100: '#FFF2DF',
  cream200: '#F8E8CE',
  cream300: '#EDD7B4',

  // Ink (text — warm dark brown, never pure black)
  ink900: '#3B2A1E',
  ink700: '#5A4232',
  ink500: '#876A53',
  ink300: '#B89C82',
  ink100: '#E5D6C3',

  // Coral (primary brand, CTAs)
  coral100: '#FFE3D6',
  coral300: '#F8B49B',
  coral500: '#F08C6A',
  coral600: '#DB6E48',
  coral700: '#B5552F',

  // Gold (coins, contribution cards, earned)
  gold100: '#FFF0BF',
  gold300: '#FFD86B',
  gold500: '#F5B800',
  gold600: '#D69A00',
  gold700: '#A87800',

  // Sky (Task-A duty soft tint)
  sky100: '#E5F2F8',
  sky200: '#C8E4F0',
  sky400: '#95C5DD',
  sky600: '#5994B3',

  // Sage (Task-B duty alt tint, success)
  sage100: '#ECF4E2',
  sage200: '#D4E8C8',
  sage400: '#A8C98D',
  sage600: '#6E9A55',

  // Lilac (parent/settings, sparingly)
  lilac200: '#E6DEF1',
  lilac500: '#9B82C7',

  // Semantic aliases
  bgCanvas:             '#FFF8EE',
  bgSurface:            '#FFFFFF',
  bgSurfaceWarm:        '#FFF2DF',
  bgDuty:               '#C8E4F0',   // Task-A card
  bgDutyAlt:            '#D4E8C8',   // Task-B card
  bgContribution:       '#FFF0BF',   // Task-C card

  fgPrimary:   '#3B2A1E',
  fgSecondary: '#5A4232',
  fgMuted:     '#876A53',

  accent:      '#F08C6A',
  accentPress: '#DB6E48',
  success:     '#6E9A55',
  warning:     '#F08C6A',
  info:        '#5994B3',

  borderSoft:   'rgba(95, 60, 30, 0.10)',
  borderMedium: 'rgba(95, 60, 30, 0.18)',

  // Use as shadowColor in RN shadow props
  shadowWarm: 'rgba(95, 60, 30, 1)',
  shadowGold: 'rgba(245, 184, 0, 1)',

  // Legacy aliases — keep existing components compiling without modification
  primary:       '#F08C6A',  // → coral500
  secondary:     '#F5B800',  // → gold500
  background:    '#FFF8EE',  // → bgCanvas
  surface:       '#FFFFFF',  // → bgSurface
  text:          '#3B2A1E',  // → ink900
  textSecondary: '#876A53',  // → ink500
  border:        'rgba(95, 60, 30, 0.10)', // → borderSoft
  error:         '#EF4444',
  coin:          '#F5B800',  // → gold500
};
