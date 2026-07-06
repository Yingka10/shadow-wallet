import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle, Ellipse, Path, G } from 'react-native-svg';
import { Colors } from '../../constants/colors';

interface Props {
  size?: number;
  /** 有可兌換的成熟願望時，其中一顆果實金亮呼吸；沒有就整棵樹靜靜的 */
  hasRipeFruit?: boolean;
}

// 飄落葉子設定（交錯延遲/速度，鎖定值＝提案 artifact .leaf-fall/l2/l3）
const LEAVES = [
  { x: 0.20, delay: 0,    dur: 4400, drift: 8,  tint: Colors.leaf400 },
  { x: 0.72, delay: 1400, dur: 5200, drift: -8, tint: Colors.leaf450 },
  { x: 0.42, delay: 2600, dur: 3800, drift: 7,  tint: Colors.leaf300 },
];

// 果實：第一顆熟（金亮呼吸），其餘未熟（淡青綠，靜態）—— 這才是「1 顆熟果配好幾顆青果」的真樣子
const FRUITS = [
  { x: 0.40, y: 0.42, r: 0.058, ripe: true },
  { x: 0.66, y: 0.32, r: 0.042, ripe: false },
  { x: 0.30, y: 0.24, r: 0.038, ripe: false },
];

/**
 * 樹（不含地面）—— 首頁 hero / 許願頁共用。地面/草叢是另一層 `GroundWash`，
 * 負責跨頁面全寬的地面觀感；這裡只管樹本身，讓兩層各司其職、對齊由外層擺放位置決定。
 * 純 SVG + Animated.View（native driver）：層疊冠層 + 光斑、樹幹+分枝、
 * 1 顆呼吸發光熟果 + 2 顆未熟果、3 片交錯飄落的葉子、冠層輕搖。
 */
export default function GrowthScene({ size = 150, hasRipeFruit = true }: Props) {
  const sway = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const leafAnims = useRef(LEAVES.map(() => new Animated.Value(0))).current;

  // 冠層搖擺
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

  // 熟果呼吸 + 光暈
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

  // 落葉
  useEffect(() => {
    const loops = leafAnims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(LEAVES[i].delay),
          Animated.timing(anim, { toValue: 1, duration: LEAVES[i].dur, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [leafAnims]);

  const swayRotate = sway.interpolate({ inputRange: [0, 1], outputRange: ['-1.8deg', '1.6deg'] });
  const fruitScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const glowOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [hasRipeFruit ? 0.5 : 0.16, hasRipeFruit ? 0.95 : 0.28] });

  const canopyH = size * 0.72;
  const trunkH = size * 0.34;

  return (
    <View style={{ width: size, height: size }}>
      {/* ── 樹幹 + 分枝（靜態，貼底）───────────────────────────── */}
      <Svg
        width={size}
        height={trunkH}
        viewBox="0 0 100 48"
        style={{ position: 'absolute', bottom: 0, left: 0 }}
      >
        <Path d="M44 0 Q42 24 44 46 L58 46 Q60 24 58 0 Z" fill={Colors.bark500} />
        <Path d="M46 16 C39 12 35 8 33 2" stroke={Colors.bark500} strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <Path d="M56 16 C63 12 67 8 69 2" stroke={Colors.bark500} strokeWidth="3.2" fill="none" strokeLinecap="round" />
      </Svg>

      {/* ── 冠層（搖擺，以近樹幹底為軸）─────────────────────────── */}
      <Animated.View
        style={[
          styles.canopy,
          {
            width: size,
            height: canopyH,
            transform: [{ rotate: swayRotate }],
            transformOrigin: `50% ${size - trunkH * 0.25}px`,
          },
        ]}
      >
        <Svg width={size} height={canopyH} viewBox="0 0 100 72">
          <G>
            <Circle cx="50" cy="44" r="25" fill={Colors.leaf500} />
            <Circle cx="30" cy="40" r="19" fill={Colors.leaf450} />
            <Circle cx="70" cy="38" r="21" fill={Colors.leaf600} />
            <Circle cx="52" cy="26" r="21" fill={Colors.leaf400} />
            <Circle cx="34" cy="30" r="14" fill={Colors.leaf300} />
            {/* 今天新長的葉子 */}
            <Ellipse cx="26" cy="34" rx="4" ry="2.6" fill={Colors.leaf300} transform="rotate(-25 26 34)" />
          </G>
        </Svg>
      </Animated.View>

      {/* ── 果實（1 熟＋2 青，熟果呼吸發光）──────────────────────── */}
      {FRUITS.map((f, i) => {
        const isRipe = f.ripe && hasRipeFruit;
        const d = f.r * size * 2;
        const glowD = d * 2.6;
        return (
          <View key={i} pointerEvents="none">
            {isRipe && (
              <Animated.View
                style={{
                  position: 'absolute',
                  left: f.x * size - glowD / 2,
                  top: f.y * size - glowD / 2,
                  width: glowD,
                  height: glowD,
                  borderRadius: glowD / 2,
                  backgroundColor: Colors.fruit500,
                  opacity: glowOpacity,
                }}
              />
            )}
            <Animated.View
              style={{
                position: 'absolute',
                left: f.x * size - d / 2,
                top: f.y * size - d / 2,
                transform: isRipe ? [{ scale: fruitScale }] : [{ scale: 1 }],
              }}
            >
              <Svg width={d} height={d} viewBox="0 0 20 20">
                <Circle
                  cx="10" cy="10" r="8.5"
                  fill={isRipe ? Colors.fruit500 : Colors.fruitUnripe}
                  stroke={isRipe ? Colors.fruitRipeStroke : Colors.fruitUnripeStroke}
                  strokeWidth="1.4"
                />
                <Circle cx="7" cy="7" r="2.3" fill="#FFFFFF" opacity="0.5" />
              </Svg>
            </Animated.View>
          </View>
        );
      })}

      {/* ── 落葉 ──────────────────────────────────────────────── */}
      {LEAVES.map((leaf, i) => {
        const translateY = leafAnims[i].interpolate({ inputRange: [0, 1], outputRange: [size * 0.4, size * 0.94] });
        const translateX = leafAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0, leaf.drift] });
        const rotate = leafAnims[i].interpolate({ inputRange: [0, 1], outputRange: ['0deg', '150deg'] });
        const opacity = leafAnims[i].interpolate({ inputRange: [0, 0.12, 0.85, 1], outputRange: [0, 0.9, 0.35, 0] });
        return (
          <Animated.View
            key={`leaf-${i}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: leaf.x * size,
              top: 0,
              width: 6,
              height: 4,
              borderRadius: 2,
              backgroundColor: leaf.tint,
              opacity,
              transform: [{ translateX }, { translateY }, { rotate }],
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  canopy: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
