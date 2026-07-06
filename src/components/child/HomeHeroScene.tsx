import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Ellipse, Path, G } from 'react-native-svg';
import { Colors } from '../../constants/colors';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

interface Props {
  height?: number;
  /** 有可兌換的成熟願望時，果實才金亮呼吸；沒有就整棵樹靜靜的 */
  hasRipeFruit?: boolean;
}

type LeafDef = {
  cx: number; cy: number; rx: number; ry: number; fill: string;
  duration: number; delay: number;
};

const LEAVES: LeafDef[] = [
  { cx: 168, cy: 96,  rx: 4,   ry: 2.6, fill: Colors.leaf400, duration: 4400, delay: 0 },
  { cx: 248, cy: 130, rx: 3,   ry: 2,   fill: Colors.leaf450, duration: 5200, delay: 1400 },
  { cx: 186, cy: 140, rx: 3.5, ry: 2.3, fill: Colors.leaf300, duration: 3800, delay: 2600 },
];

/**
 * 首頁 hero 場景 —— 整支手機同一條漸層底上，一幅「有腳落地」的樹（鎖定樣式＝提案 artifact .g-hero）。
 * 全部畫在單一 SVG／單一 viewBox 座標系（不用 RN View 疊在 SVG 上），
 * 靠 preserveAspectRatio="xMidYMax slice" 撐滿容器寬度、底部對齊，
 * 不同機型寬度都不會讓地面/樹/文字疊字錯位。
 *
 * 動效：冠層輕搖(6s)、熟果呼吸+光暈(2.6s)、3 片葉子交錯飄落(3.8–5.2s，各自延遲)。
 */
export default function HomeHeroScene({ height = 196, hasRipeFruit = true }: Props) {
  const sway = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const leafProgress = useRef(LEAVES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(sway, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [sway]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  useEffect(() => {
    const loops = leafProgress.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(LEAVES[i].delay),
          Animated.timing(v, { toValue: 1, duration: LEAVES[i].duration, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [leafProgress]);

  const swayTransform = sway.interpolate({
    inputRange: [0, 1],
    outputRange: ['rotate(-1.8 212 178)', 'rotate(1.6 212 178)'],
  });
  const fruitTransform = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: ['translate(198 100) scale(1) translate(-198 -100)', 'translate(198 100) scale(1.08) translate(-198 -100)'],
  });
  const glowOpacity = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [hasRipeFruit ? 0.55 : 0.18, hasRipeFruit ? 1 : 0.3],
  });

  return (
    <Svg width="100%" height={height} viewBox="0 0 288 196" preserveAspectRatio="xMidYMax slice">
      {/* 太陽 */}
      <Circle cx={252} cy={28} r={12} fill={Colors.gold300} opacity={0.9} />

      {/* 地面 —— 全寬柔和暈染，樹和草直接畫在漸層上，不再是獨立色塊 */}
      <Ellipse cx={144} cy={206} rx={200} ry={34} fill={Colors.groundWash} opacity={0.5} />
      <Ellipse cx={212} cy={180} rx={56} ry={9} fill={Colors.groundShadow} opacity={0.6} />

      {/* 樹幹 + 分枝 */}
      <Path d="M204 128 Q202 152 204 178 L220 178 Q222 152 220 128 Z" fill={Colors.bark500} />
      <Path d="M207 146 C198 140 193 134 190 126" stroke={Colors.bark500} strokeWidth={4.5} fill="none" strokeLinecap="round" />
      <Path d="M217 146 C226 140 232 134 235 126" stroke={Colors.bark500} strokeWidth={4.5} fill="none" strokeLinecap="round" />

      {/* 冠層＋果實 —— 一起搖擺 */}
      <AnimatedG transform={swayTransform}>
        <Circle cx={212} cy={92} r={34} fill={Colors.leaf500} />
        <Circle cx={188} cy={107} r={22} fill={Colors.leaf450} />
        <Circle cx={237} cy={107} r={22} fill={Colors.leaf600} />
        <Circle cx={212} cy={70} r={22} fill={Colors.leaf400} />
        <Circle cx={196} cy={78} r={15} fill={Colors.leaf300} />
        {/* 今天新長的葉子 */}
        <Ellipse cx={184} cy={84} rx={4} ry={2.6} fill={Colors.leaf300} transform="rotate(-25 184 84)" />

        {/* 果實＝願望：1 顆熟（金亮呼吸）＋ 3 顆未熟 */}
        <AnimatedCircle cx={198} cy={100} r={10} fill={Colors.fruitGlow} opacity={glowOpacity} />
        <AnimatedCircle
          cx={198} cy={100} r={6.5}
          fill={hasRipeFruit ? Colors.fruit500 : Colors.fruitUnripe}
          stroke={hasRipeFruit ? Colors.fruitRipeStroke : Colors.fruitUnripeStroke}
          strokeWidth={1.5}
          transform={fruitTransform}
        />
        <Circle cx={232} cy={88}  r={4.5} fill={Colors.fruitUnripe} stroke={Colors.fruitUnripeStroke} strokeWidth={1.2} />
        <Circle cx={240} cy={110} r={4.5} fill={Colors.fruitUnripe} stroke={Colors.fruitUnripeStroke} strokeWidth={1.2} />
        <Circle cx={210} cy={72}  r={4.5} fill={Colors.fruitUnripe} stroke={Colors.fruitUnripeStroke} strokeWidth={1.2} />
      </AnimatedG>

      {/* 交錯飄落的葉子（獨立於冠層搖擺） */}
      {LEAVES.map((leaf, i) => {
        const transform = leafProgress[i].interpolate({
          inputRange: [0, 1],
          outputRange: [
            `translate(0 -4) rotate(0 ${leaf.cx} ${leaf.cy})`,
            `translate(10 58) rotate(150 ${leaf.cx} ${leaf.cy})`,
          ],
        });
        const opacity = leafProgress[i].interpolate({
          inputRange: [0, 0.12, 0.85, 1],
          outputRange: [0, 0.9, 0.35, 0],
        });
        return (
          <AnimatedEllipse
            key={i}
            cx={leaf.cx} cy={leaf.cy} rx={leaf.rx} ry={leaf.ry}
            fill={leaf.fill}
            transform={transform}
            opacity={opacity}
          />
        );
      })}

      {/* 草叢 —— 貫穿全寬基線（連文字下方也有） */}
      <G fill={Colors.grassTuft} opacity={0.9}>
        <Ellipse cx={30}  cy={180} rx={4}   ry={6} />
        <Ellipse cx={58}  cy={185} rx={3.5} ry={5} />
        <Ellipse cx={92}  cy={181} rx={4}   ry={6} />
        <Ellipse cx={128} cy={186} rx={3.5} ry={5} />
        <Ellipse cx={158} cy={182} rx={4}   ry={6} />
        <Ellipse cx={256} cy={184} rx={4}   ry={6} />
      </G>
    </Svg>
  );
}
