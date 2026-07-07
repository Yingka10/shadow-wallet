import React from 'react';
import Svg, { Path, Circle, Ellipse, Rect, Image as SvgImage } from 'react-native-svg';

// 山坡上的小草（使用者提供的深綠透明 PNG）—— 畫在山坡 SVG 內，鎖在山線座標上不會懸空
const GRASS_A = require('../../../assets/images/child/grass_darkgreen_transparent.png');
const GRASS_B = require('../../../assets/images/child/grass_darkgreen_transparent_2.png');

// 每撮小草的 viewBox 座標（x,y = 左上角；y 已讓草底貼在山線上）
const HILL_GRASS: Array<{ src: number; x: number; y: number; w: number; h: number }> = [
  { src: GRASS_A, x: 89, y: 20, w: 22, h: 20 },   // 遠山左峰 (100,40)
  { src: GRASS_B, x: 2, y: 54, w: 18, h: 16 },    // 頁面最左邊（移到左緣，貼左下坡）
  { src: GRASS_A, x: 142, y: 60, w: 16, h: 14 },  // 中段坡（再往下一點）
  { src: GRASS_B, x: 281, y: 46, w: 18, h: 16 },  // 近山右峰 (290,62)
  { src: GRASS_A, x: 302, y: 30, w: 20, h: 18 },  // 遠山右峰 (312,48)
];

/**
 * 晚安模式的夜景插圖 —— 由使用者提供的 SVG 轉成 react-native-svg 元件。
 * 原檔的 <filter> 高斯模糊（glow/softGlow）在 RN 各平台支援不一致，這裡一律拿掉，
 * 改用原檔本身的低透明度形狀當柔光近似；月亮的外暈另由 HomeScreen 的 moonGlow View 補。
 */

export function Moon({ size = 48 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M341.3 365.7C278.4 393.8 204.7 365.6 176.6 302.7C148.5 239.9 176.6 166.2 239.5 138.1C259.5 129.1 281 125.8 301.7 127.2C263.2 154.1 247.5 205.1 267.3 249.6C287.2 294.2 336.2 316.5 382.2 304.8C374.3 330.7 361.5 356.6 341.3 365.7Z"
        fill="#F6D77A"
      />
      <Path d="M316 246C322 253 332 254 339 247" stroke="#7A5F3A" strokeWidth={6} strokeLinecap="round" />
      <Ellipse cx={344} cy={309} rx={10} ry={5} fill="#7A5F3A" fillOpacity={0.35} />
      <Ellipse cx={377} cy={298} rx={9} ry={4} fill="#7A5F3A" fillOpacity={0.22} />
    </Svg>
  );
}

export function Star({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256">
      <Path d="M128 38L147 99L211 99L159 137L179 198L128 160L77 198L97 137L45 99L109 99L128 38Z" fill="#FFE182" />
      <Path d="M82 58L88 75L106 80L89 87L82 104L75 87L58 80L76 74L82 58Z" fill="#FFF2C8" fillOpacity={0.9} />
    </Svg>
  );
}

export function Firefly({ size = 26 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256">
      <Circle cx={128} cy={128} r={52} fill="#ECE268" fillOpacity={0.22} />
      <Ellipse cx={107} cy={106} rx={30} ry={19} transform="rotate(-23 107 106)" fill="#D2EDD3" fillOpacity={0.55} stroke="#9ABE9D" strokeOpacity={0.55} strokeWidth={2} />
      <Ellipse cx={149} cy={106} rx={30} ry={19} transform="rotate(23 149 106)" fill="#D2EDD3" fillOpacity={0.55} stroke="#9ABE9D" strokeOpacity={0.55} strokeWidth={2} />
      <Path d="M116 96L102 79M140 96L154 79" stroke="#39563F" strokeWidth={4} strokeLinecap="round" />
      <Circle cx={102} cy={79} r={5} fill="#ECE268" fillOpacity={0.85} />
      <Circle cx={154} cy={79} r={5} fill="#ECE268" fillOpacity={0.85} />
      <Ellipse cx={128} cy={137} rx={25} ry={32} fill="#3F6443" />
      <Ellipse cx={128} cy={151} rx={18} ry={22} fill="#F6DA5B" />
      <Ellipse cx={128} cy={107} rx={18} ry={17} fill="#39563F" />
    </Svg>
  );
}

/**
 * 夜間遠景山坡 —— 三層柔和起伏的藍調山線，鋪在天空與草坡之間、樹的後方，
 * 讓夜景多一點層次深度（對齊參考圖那種一層層的山坡線條）。
 * preserveAspectRatio slice：不同寬度都撐滿、底部對齊。
 */
export function NightHills({ height = 120 }: { height?: number }) {
  return (
    <Svg width="100%" height={height} viewBox="0 0 360 120" preserveAspectRatio="xMidYMax slice">
      {/* 遠山 —— 左邊一座、右邊一座，中間凹下去（明顯高低起伏） */}
      <Path
        d="M0 62 C50 62 58 40 100 40 C148 40 168 84 210 84 C258 84 278 48 312 48 C338 48 352 60 360 62 L360 120 L0 120 Z"
        fill="#47597C"
        opacity={0.92}
      />
      {/* 近景山坡 —— 峰谷錯開，補在遠山之間，形成一層層的山線 */}
      <Path
        d="M0 82 C34 82 48 56 76 56 C116 56 140 92 182 92 C226 92 250 62 290 62 C324 62 348 84 360 86 L360 120 L0 120 Z"
        fill="#384F6C"
      />
      {/* 小草 —— 貼在山線上（跟山坡同一座標系，縮放時一起動、不會懸空） */}
      {HILL_GRASS.map((g, i) => (
        <SvgImage
          key={`hillgrass-${i}`}
          x={g.x}
          y={g.y}
          width={g.w}
          height={g.h}
          href={g.src}
          preserveAspectRatio="xMidYMax meet"
        />
      ))}
    </Svg>
  );
}

export function TreeHouse({ size = 230 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      {/* 環境柔光（原為模糊，改低透明度） */}
      <Ellipse cx={512} cy={520} rx={320} ry={300} fill="#74976A" fillOpacity={0.16} />

      {/* 樹幹 */}
      <Path d="M462 760C476 686 486 620 493 575C503 506 514 449 520 415C531 477 542 528 552 575C566 648 584 711 596 760H462Z" fill="#6A4D31" />
      <Path d="M510 432C503 514 496 621 482 746" stroke="#8F663E" strokeWidth={16} strokeLinecap="round" opacity={0.55} />
      <Path d="M543 472C552 594 561 682 574 744" stroke="#483627" strokeWidth={10} strokeLinecap="round" opacity={0.45} />
      <Ellipse cx={453} cy={772} rx={56} ry={34} fill="#614832" />
      <Ellipse cx={610} cy={774} rx={65} ry={34} fill="#614832" />

      {/* 樹冠 */}
      <Circle cx={404} cy={262} r={130} fill="#3C6152" />
      <Circle cx={560} cy={258} r={128} fill="#497459" />
      <Circle cx={305} cy={360} r={125} fill="#52845C" />
      <Circle cx={705} cy={370} r={120} fill="#406853" />
      <Circle cx={510} cy={374} r={170} fill="#497459" />
      <Circle cx={390} cy={505} r={128} fill="#588B5F" />
      <Circle cx={640} cy={505} r={130} fill="#52845C" />
      <Circle cx={510} cy={570} r={155} fill="#3C6152" />
      <Circle cx={270} cy={510} r={100} fill="#497459" />
      <Circle cx={770} cy={520} r={95} fill="#3C6152" />
      <Circle cx={400} cy={330} r={40} fill="#79A060" opacity={0.8} />
      <Circle cx={560} cy={300} r={45} fill="#7EA85C" opacity={0.85} />
      <Circle cx={660} cy={420} r={32} fill="#82A763" opacity={0.8} />
      <Circle cx={465} cy={520} r={34} fill="#78A25C" opacity={0.8} />
      {/* 果實／亮點 */}
      <Circle cx={442} cy={305} r={8} fill="#F1DF78" opacity={0.85} />
      <Circle cx={612} cy={336} r={8} fill="#F1DF78" opacity={0.85} />
      <Circle cx={350} cy={445} r={8} fill="#F1DF78" opacity={0.75} />
      <Circle cx={707} cy={454} r={8} fill="#F1DF78" opacity={0.75} />
      <Circle cx={516} cy={488} r={8} fill="#F1DF78" opacity={0.75} />

      {/* 門 */}
      <Rect x={455} y={615} width={135} height={190} rx={34} fill="#805937" />
      <Rect x={475} y={640} width={95} height={165} rx={28} fill="#68462E" />
      <Path d="M522 754C493 728 478 715 478 695C478 678 500 672 522 692C544 672 568 678 568 695C568 715 551 728 522 754Z" fill="#2E2723" opacity={0.82} />

      {/* 圓窗 */}
      <Circle cx={639} cy={605} r={45} fill="#F2D26A" stroke="#5A4933" strokeWidth={8} />
      <Path d="M639 568V642M602 605H676" stroke="#5A4933" strokeWidth={5} opacity={0.75} />

      {/* 燈籠 */}
      <Path d="M735 610V690" stroke="#57442E" strokeWidth={5} strokeLinecap="round" />
      <Rect x={700} y={684} width={70} height={76} rx={14} fill="#E0B047" stroke="#59442A" strokeWidth={5} />
      <Circle cx={736} cy={722} r={18} fill="#FFED8E" opacity={0.9} />

      {/* 地面草叢（原本的橢圓綠色陰影已移除，樹屋直接站在頁面的夜間草坡上） */}
      <Path d="M226 860C236 820 245 795 254 775" stroke="#456F52" strokeWidth={18} strokeLinecap="round" opacity={0.75} />
      <Path d="M808 860C802 824 791 796 778 772" stroke="#456F52" strokeWidth={18} strokeLinecap="round" opacity={0.75} />
    </Svg>
  );
}
