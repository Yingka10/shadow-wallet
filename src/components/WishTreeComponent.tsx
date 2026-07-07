import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Easing,
} from 'react-native';
import Svg, { Circle, Path, Ellipse, G } from 'react-native-svg';
import { Colors } from '../constants/colors';

interface WishTreeComponentProps {
  onPress?: () => void;
  size?: number;
  /** calm = 靜態版（不發光、不掉葉），給首頁 hero 用；許願頁用預設動畫版 */
  calm?: boolean;
  /** 是否結出成熟果實（有可兌換的願望時＝金亮果） */
  hasRipeFruit?: boolean;
}

/**
 * 成長大樹 —— 全 app 唯一那棵樹（首頁 hero + 許願頁共用）。
 * 優先用插畫 assets/images/child/pretty_wish_tree_trimmed.png（=pretty_wish_tree.png 裁掉四周透明
 * 留白的版本，原圖下緣留白多達 16%、resizeMode=contain 會讓樹看起來偏小、樹跟下方內容間留一大截
 * 空白——2026-07-07 使用者回報過，別改回吃原圖），沒有則 SVG 後備（token 綠 + 樹幹 + 果實 + 落地泥土）。
 * 顏色一律走 Colors.leaf/bark/fruit，不再硬編碼。
 * 光暈用多層同心圓（各自 flat fill + 遞減 opacity）疊出來，不要用 svg RadialGradient——
 * 試過 RadialGradient 在 react-native-web 上完全不吃，畫面上什麼都看不到（2026-07-07 使用者
 * 回報過）；也不要改回單層純色 View + borderRadius，邊緣是硬邊會像一個「框」（同一天回報過）。
 */
export default function WishTreeComponent({
  onPress,
  size = 120,
  calm = false,
  hasRipeFruit = true,
}: WishTreeComponentProps) {
  const [useImage, setUseImage] = useState(false);
  const glowAnim = useRef(new Animated.Value(0.4)).current;
  const leafAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const sparkleAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    try {
      require('../../assets/images/child/pretty_wish_tree_trimmed.png');
      setUseImage(true);
    } catch {
      setUseImage(false);
    }
  }, []);

  // 發光脈動（非 calm 才跑）
  useEffect(() => {
    if (calm) return;
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.4, duration: 1750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [glowAnim, calm]);

  // 飄葉（非 calm 才跑）
  useEffect(() => {
    if (calm) return;
    const durations = [4200, 5100, 4600, 4900, 5400];
    const delays = [0, 1600, 900, 2400, 400];
    const timers: ReturnType<typeof setTimeout>[] = [];
    leafAnims.forEach((anim, i) => {
      const startAnim = () => {
        anim.setValue(0);
        Animated.timing(anim, { toValue: 1, duration: durations[i], easing: Easing.linear, useNativeDriver: true }).start(() => startAnim());
      };
      timers.push(setTimeout(startAnim, delays[i]));
    });
    return () => timers.forEach(clearTimeout);
  }, [leafAnims, calm]);

  // 閃亮 sparkle（非 calm 才跑，繞樹冠呼吸閃爍）
  useEffect(() => {
    if (calm) return;
    const durations = [1400, 1700, 1500];
    const delays = [0, 500, 1000];
    const loops: Animated.CompositeAnimation[] = [];
    sparkleAnims.forEach((anim, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(delays[i]),
          Animated.timing(anim, { toValue: 1, duration: durations[i], easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: durations[i], easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      loops.push(loop);
      loop.start();
    });
    return () => loops.forEach(loop => loop.stop());
  }, [sparkleAnims, calm]);

  // 光暈要明顯比樹大一圈才看得出來（貼齊樹邊只會被樹蓋掉，2026-07-07 使用者回報「沒有光環」）
  const glowSize = Math.round(size * 1.35);
  const inset = (glowSize - size) / 2;

  const glowScale = glowAnim.interpolate({ inputRange: [0.4, 1], outputRange: [0.94, 1.06] });
  const leafOffsets = leafAnims.map(a => a.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 1.2] }));
  const leafRotates = leafAnims.map(a => a.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '120deg'] }));
  const sparklePositions = [
    { left: inset + size * -0.08, top: inset + size * 0.06 },
    { left: inset + size * 0.98, top: inset + size * 0.22 },
    { left: inset + size * 0.62, top: inset + size * -0.06 },
  ];
  const sparkleScales = sparkleAnims.map(a => a.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.1] }));

  const tree = useImage ? (
    <Image
      source={require('../../assets/images/child/pretty_wish_tree_trimmed.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  ) : (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <G>
        {/* 落地泥土陰影 */}
        <Ellipse cx="60" cy="110" rx="34" ry="7" fill={Colors.soil} opacity="0.55" />
        {/* 樹冠 */}
        <Circle cx="60" cy="46" r="30" fill={Colors.leaf500} />
        <Circle cx="40" cy="40" r="22" fill={Colors.leaf400} />
        <Circle cx="80" cy="40" r="24" fill={Colors.leaf600} />
        <Circle cx="50" cy="30" r="18" fill={Colors.leaf300} />
        <Circle cx="72" cy="28" r="20" fill={Colors.leaf400} />
        {/* 樹幹 */}
        <Path d="M 53 68 Q 51 86 53 102 L 67 102 Q 69 86 67 68 Z" fill={Colors.bark500} />
        {/* 樹根 */}
        <Path d="M 47 102 Q 42 108 37 110" stroke={Colors.bark700} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <Path d="M 73 102 Q 78 108 83 110" stroke={Colors.bark700} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        {/* 果實＝願望（熟＝金亮） */}
        <Circle cx="47" cy="52" r="5.5" fill={hasRipeFruit ? Colors.fruit500 : Colors.fruit300} />
        <Circle cx="74" cy="48" r="4.5" fill={Colors.fruit300} opacity="0.9" />
      </G>
    </Svg>
  );

  const inner = (
    <View style={[styles.container, { width: glowSize, height: glowSize }]}>
      {!calm && (
        <Animated.View
          style={[
            styles.glow,
            { width: glowSize, height: glowSize, opacity: glowAnim, transform: [{ scale: glowScale }] },
          ]}
        >
          <Svg width={glowSize} height={glowSize} viewBox={`0 0 ${glowSize} ${glowSize}`}>
            <Circle cx={glowSize / 2} cy={glowSize / 2} r={glowSize / 2} fill={Colors.leaf200} opacity={0.16} />
            <Circle cx={glowSize / 2} cy={glowSize / 2} r={glowSize * 0.38} fill={Colors.leaf200} opacity={0.22} />
            <Circle cx={glowSize / 2} cy={glowSize / 2} r={glowSize * 0.26} fill={Colors.cream50} opacity={0.4} />
            <Circle cx={glowSize / 2} cy={glowSize / 2} r={glowSize * 0.16} fill={Colors.cream50} opacity={0.55} />
          </Svg>
        </Animated.View>
      )}
      <View style={styles.treeWrap}>{tree}</View>

      {!calm && [0, 1, 2, 3, 4].map(i => (
        <Animated.View
          key={i}
          style={[
            styles.leafParticle,
            {
              left: inset + size * (0.06 + i * 0.22),
              top: inset + size * 0.7,
              backgroundColor: [Colors.leaf400, Colors.leaf300, Colors.leaf500, Colors.leaf450, Colors.leaf200][i],
              transform: [{ translateY: leafOffsets[i] }, { rotate: leafRotates[i] }],
              opacity: leafAnims[i].interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 0.5, 0.25, 0] }),
            },
          ]}
        />
      ))}

      {!calm && [0, 1, 2].map(i => (
        <Animated.View
          key={`sparkle-${i}`}
          style={[
            styles.sparkle,
            {
              left: sparklePositions[i].left,
              top: sparklePositions[i].top,
              opacity: sparkleAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.95] }),
              transform: [{ scale: sparkleScales[i] }],
            },
          ]}
        >
          <Svg width={14} height={14} viewBox="0 0 24 24">
            <Path
              d="M12 2l1.6 5.5L19 9l-4 3.8 1 5.5L12 15.6 8 18.3l1-5.5L5 9l5.4-1.5z"
              fill={Colors.gold300}
            />
          </Svg>
        </Animated.View>
      ))}
    </View>
  );

  if (!onPress) return inner;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      {inner}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
  },
  treeWrap: {
    zIndex: 2,
  },
  leafParticle: {
    position: 'absolute',
    width: 6,
    height: 4,
    borderRadius: 1000,
    pointerEvents: 'none',
  },
  sparkle: {
    position: 'absolute',
    pointerEvents: 'none',
  },
});
