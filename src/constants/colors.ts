/**
 * childTheme —「成長大樹」孩子端主題（GrowBook）
 * 顏色的唯一來源。方向 A「家庭帳本」× 成長大樹，2026-07-06 定調（提案 v13）。
 *
 * ── Review 規則（團隊已定，C#2）──────────────────────────────
 *   src/screens/** 與 src/components/** 內出現硬編碼 `#rrggbb` 的 PR 一律退回。
 *   一律走這裡的 token；語義層（accent / coin / grow …）優先於原始色階（leaf500 …）。
 *
 * ── 語義固定，別亂借 ────────────────────────────────────────
 *   gold   金幣。永遠是金幣色，別用種子/其他顏色代（記帳鏈語意要誠實）。
 *   leaf   葉綠。今日成長 / 主要動作 / 完成狀態。發幣的勾選圈用金環（coinRing）。
 *   fruit  果實（琥珀）。願望；熟成 = 可兌換。
 *   bark   樹幹。結構線、落地陰影、次要輪廓。
 *   cream  頁面下緣與卡面底色。
 *   ink    文字（暖棕，永不純黑）。
 *
 * ── 版面語言（給 C#3 重刷時對齊）────────────────────────────
 *   頁面底 = gradientPage（leaf → cream 連續漸層，見 GradientBackground/gradientPageStops），不是平色也不是綠頂+米身。
 *   卡片是稀有的特殊待遇，日常用「列表行 + 髮絲線」；狀態靠分組/字重/對齊，不用膠囊 chip、不用行內狀態字。
 *   金額右對齊、等寬數字（Monzo 式）。詳見 [[design-feedback-preferences]]。
 */

export const Colors = {
  // ── 葉綠 Leaf — 成長 / 主要動作 / 完成（組員葉綠色系）──────────
  leaf50:  '#F1F8E7',   // 最淡：選中底、成長區襯底
  leaf100: '#E1EFC9',
  leaf200: '#C4E09B',
  leaf300: '#9AD066',   // 淺冠層
  leaf400: '#8FC65C',
  leaf450: '#7CB84A',   // 冠層第五色階（鎖定色系 5 色之一，勿漏）
  leaf500: '#6BA63C',   // 主葉綠（primary / CTA）
  leaf600: '#5E9A32',   // 按壓 / 深冠層
  leaf700: '#4A7D28',

  // ── 樹幹 Bark — 結構線 / 落地陰影 ──────────────────────────
  // 成長大樹沿用原本許願頁那顆 = components/WishTreeComponent.tsx（造型/動畫/圖片優先都留著）。
  // C#3 時把該元件目前硬編碼的綠改吃這裡的 leaf*，樹幹/泥土改吃 bark500 / soil，統一成一套。
  bark300: '#B79B7E',
  bark500: '#8A6A4A',   // 樹幹（≈ 元件現值 #8B6F47）
  bark700: '#5F462F',   // 樹根
  soil:    '#D4C9A8',   // 樹根下泥土/落地陰影

  // 場景專用（首頁/許願樹 hero 的地面+草地，比 leaf 系更淡、只用在這裡）
  groundWash:   '#CDE3A6',   // 全寬柔和地面暈染（大橢圓，透明度低）
  groundShadow: '#B9D48F',   // 樹腳下較深的地面陰影
  grassTuft:    '#A8C494',   // 草叢

  // ── 果實 Fruit — 願望（熟 = 可兌換）───────────────────────
  fruit100: '#FDECCB',
  fruit300: '#F8C979',
  fruit500: '#F2A93B',   // 熟果 / 願望重點
  fruit700: '#C6811F',
  fruitRipeStroke:   '#D68A1E',   // 熟果描邊
  fruitUnripe:       '#C8DE8A',   // 未熟果實 —— 淡青綠（樹上大多數果實是這色，只有 1 顆熟）
  fruitUnripeStroke: '#9BBE55',
  fruitGlow: 'rgba(251,212,107,0.45)',   // 熟果光暈

  // ── 金幣 Gold — 幣（保留；幣就是幣）────────────────────────
  gold100: '#FFF0BF',
  gold300: '#FFD86B',
  gold500: '#F5B800',
  gold600: '#D69A00',
  gold700: '#A87800',

  // ── 奶油 Cream — 漸層下緣 / 卡面 ──────────────────────────
  cream50:  '#FFF8EE',
  cream100: '#FFF2DF',
  cream200: '#F8E8CE',
  cream300: '#EDD7B4',

  // ── 墨 Ink — 文字（暖棕，永不純黑）──────────────────────────
  ink900: '#3B2A1E',
  ink700: '#5A4232',
  ink500: '#876A53',
  ink300: '#B89C82',
  ink100: '#E5D6C3',

  // ── 頁面漸層（top → bottom；葉綠淡 → 奶油）─────────────────
  // 鎖定值＝提案 artifact .g-phone 的 4 段漸層，別再調（曾經偏橘就是這裡跟色階兜錯）。
  // 用法：<GradientBackground />（見 components/child/GradientBackground.tsx，內部用 gradientPageStops）。
  gradientPage: ['#DCEFC8', '#E9F1DA', '#FFF8EE', '#FFF8EE'],
  gradientPageStops: [0, 0.22, 0.46, 1],

  // 許願頁專用漸層 —— 跟目前 HomeScreen.tsx 本地 HOME 色盤的底色對齊（2026-07-07
  // 使用者截圖比對回饋：許願頁比首頁明顯偏橘）。HomeScreen 現在已經不吃上面那組
  // gradientPage（另一人重刷首頁時改用自己的本地色盤），兩邊要視覺一致就得對齊
  // 這組值，不是再調 gradientPage 本身（會連動影響 Wallet 頁）。
  gradientPageWish: ['#F8F6F1', '#FFFDF8', '#FFF8EE'],
  gradientPageWishStops: [0, 0.58, 1],

  // ── 語義別名（新程式優先用這層）──────────────────────────
  bgCanvas:      '#FFF8EE',   // 漸層退化的平色底（不支援漸層時）
  bgSurface:     '#FFFFFF',
  bgSurfaceWarm: '#FFF2DF',

  fgPrimary:   '#3B2A1E',   // ink900
  fgSecondary: '#5A4232',   // ink700
  fgMuted:     '#876A53',   // ink500

  accent:      '#6BA63C',   // leaf500 — 主要動作
  accentPress: '#5E9A32',   // leaf600
  grow:        '#6BA63C',   // = accent；語意化名（成長/完成）
  wish:        '#F2A93B',   // fruit500 — 願望
  coin:        '#F5B800',   // gold500 — 幣
  coinRing:    '#D69A00',   // gold600 — 發幣勾選圈的金環
  success:     '#5E9A32',   // leaf600
  warning:     '#F2A93B',   // fruit500（提醒用暖琥珀，不用紅）
  error:       '#C6543A',   // 僅破壞性動作；日常別用

  borderSoft:   'rgba(95, 60, 30, 0.10)',
  borderMedium: 'rgba(95, 60, 30, 0.18)',
  hairline:     'rgba(95, 60, 30, 0.12)',   // 列表髮絲線
  navBg:        'rgba(255, 248, 238, 0.96)',   // 底部 tab 半透明底

  // shadowColor 用（RN shadow props）
  shadowWarm: 'rgba(95, 60, 30, 1)',
  shadowGold: 'rgba(245, 184, 0, 1)',
  shadowLeaf: 'rgba(74, 125, 40, 1)',

  // ── 相容別名（讓既有畫面持續編譯；C#3 逐頁移除，勿在新程式使用）──
  primary:       '#6BA63C',  // 已改指 leaf500（原 coral500）
  secondary:     '#F5B800',  // gold500
  background:    '#FFF8EE',  // bgCanvas
  surface:       '#FFFFFF',  // bgSurface
  text:          '#3B2A1E',  // ink900
  textSecondary: '#876A53',  // ink500
  border:        'rgba(95, 60, 30, 0.10)', // borderSoft
  info:          '#5994B3',

  // 珊瑚 Coral —— 孩子端仍保留，是唯一的 CTA/強調色（許願兌換鈕、底部 tab 選中態）。
  // 只退出家長端（家長端珊瑚才是 @deprecated，見 parentTheme.ts）。孩子端別再拿它當任務底色用。
  coral100: '#FFE3D6',
  coral300: '#F8B49B',
  coral500: '#F08C6A',
  coral600: '#DB6E48',
  coral700: '#B5552F',
  cta:     '#F08C6A',   // = coral500，願望頁 CTA / nav 選中圖示
  ctaText: '#B5552F',   // = coral700，nav 選中文字 / cta 深字

  // @deprecated 分類卡底色（sky/sage）—— 新語言不用彩色任務卡；改列表行 + 髮絲線。
  sky100: '#E5F2F8',
  sky200: '#C8E4F0',
  sky400: '#95C5DD',
  sky600: '#5994B3',
  sage100: '#ECF4E2',
  sage200: '#D4E8C8',
  sage400: '#A8C98D',
  sage600: '#6E9A55',
  lilac200: '#E6DEF1',
  lilac500: '#9B82C7',
  bgDuty:         '#C8E4F0',
  bgDutyAlt:      '#D4E8C8',
  bgContribution: '#FFF0BF',

  // ── 願望圖示圓 wishIcon — 許願卡片左側圖示圓底色，跟上面 @deprecated 的
  // 任務分類色（sky/sage/lilac）用途不同：這裡純粹是禮物種類的視覺區分，
  // 不代表任務分類，之後新增種類直接往這個小色盤加就好。
  wishIcon: {
    book:   { bg: '#E1EFC9', fg: '#5E9A32' },   // leaf100 / leaf600
    movie:  { bg: '#DCEEF5', fg: '#5994B3' },
    card:   { bg: '#FDECCB', fg: '#C6811F' },   // fruit100 / fruit700
    comic:  { bg: '#EAE0F5', fg: '#8467AD' },
    basket: { bg: '#E3EFDA', fg: '#5E9A32' },
    gift:   { bg: '#FFE3D6', fg: '#B5552F' },   // coral100 / coral700，fallback
  },
};
