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

interface WishTreeComponentProps {
  onPress: () => void;
  size?: number;
}

/**
 * 許願樹視覺元件
 * 包含：
 * - 高品質樹形圖片（優先）或 SVG 後備
 * - 發光脈動動畫
 * - 浮動葉子粒子
 * - 點擊互動
 */
export default function WishTreeComponent({ onPress, size = 120 }: WishTreeComponentProps) {
  const [useImage, setUseImage] = useState(false);
  const glowAnim = useRef(new Animated.Value(0.4)).current;
  const leafAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  // 嘗試載入圖片
  useEffect(() => {
    try {
      // 嘗試 require 圖片，如果成功就設定 useImage = true
      require('../../assets/images/child/wish-tree.png');
      setUseImage(true);
    } catch {
      // 圖片不存在，使用 SVG 後備
      setUseImage(false);
    }
  }, []);

  // 發光脈動效果
  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.4,
          duration: 1750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [glowAnim]);

  // 浮動葉子動畫
  useEffect(() => {
    const leafDurations = [4200, 5100, 4600, 5400, 3900];
    const leafDelays = [0, 1600, 900, 2300, 400];

    leafAnims.forEach((anim, i) => {
      const startAnim = () => {
        anim.setValue(0);
        Animated.timing(anim, {
          toValue: 1,
          duration: leafDurations[i],
          easing: Easing.linear,
          useNativeDriver: true,
        }).start(() => startAnim());
      };

      // 加上初始延遲
      setTimeout(startAnim, leafDelays[i]);
    });
  }, [leafAnims]);

  const glowScale = glowAnim.interpolate({
    inputRange: [0.4, 1],
    outputRange: [0.92, 1.08],
  });

  const leafOffsets = leafAnims.map(anim =>
    anim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -200],
    })
  );

  const leafRotates = leafAnims.map(anim =>
    anim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '130deg'],
    })
  );

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.container, { width: size + 28, height: size + 28 }]}>
        {/* 發光光暈 */}
        <Animated.View
          style={[
            styles.glow,
            {
              width: size + 28,
              height: size + 28,
              opacity: glowAnim,
              transform: [{ scale: glowScale }],
            },
          ]}
        />

        {/* 樹：優先使用圖片，後備 SVG */}
        <View style={styles.treeWrap}>
          {useImage ? (
            <Image
              source={require('../../assets/images/child/wish-tree.png')}
              style={{ width: size, height: size }}
              resizeMode="contain"
            />
          ) : (
            <Svg width={size} height={size} viewBox="0 0 120 120">
              <G>
                {/* 樹冠 - 綠色圓形 */}
                <Circle cx="60" cy="45" r="32" fill="#8FC840" opacity="0.95" />
                <Circle cx="42" cy="38" r="24" fill="#A0D840" opacity="0.92" />
                <Circle cx="78" cy="38" r="26" fill="#70B030" opacity="0.93" />
                <Circle cx="50" cy="28" r="20" fill="#B0E040" opacity="0.88" />
                <Circle cx="70" cy="26" r="22" fill="#90C840" opacity="0.91" />

                {/* 樹幹 - 棕色矩形 */}
                <Path
                  d="M 52 70 Q 50 85 52 100 L 68 100 Q 70 85 68 70 Z"
                  fill="#8B6F47"
                  opacity="0.9"
                />

                {/* 樹根 */}
                <Path d="M 45 100 Q 40 108 35 110" stroke="#6B5A3B" strokeWidth="2" fill="none" />
                <Path d="M 75 100 Q 80 108 85 110" stroke="#6B5A3B" strokeWidth="2" fill="none" />
                <Path d="M 60 100 Q 60 108 60 112" stroke="#6B5A3B" strokeWidth="2" fill="none" />

                {/* 樹根下的陰影/泥土 */}
                <Ellipse cx="60" cy="112" rx="28" ry="6" fill="#D4C9A8" opacity="0.5" />
              </G>
            </Svg>
          )}
        </View>

        {/* 浮動葉子粒子 */}
        {[
          { x: 28, y: 185, size: 6, color: '#8fc840', delay: 0, duration: 4200 },
          { x: 78, y: 200, size: 5, color: '#a0d840', delay: 1600, duration: 5100 },
          { x: 205, y: 192, size: 7, color: '#70b030', delay: 900, duration: 4600 },
          { x: 278, y: 178, size: 5, color: '#b0e040', delay: 2300, duration: 5400 },
          { x: 312, y: 200, size: 6, color: '#90c840', delay: 400, duration: 3900 },
        ].map((leaf, i) => (
          <Animated.View
            key={i}
            style={[
              styles.leafParticle,
              {
                width: leaf.size,
                height: leaf.size * 0.67,
                backgroundColor: leaf.color,
                transform: [
                  { translateY: leafOffsets[i] },
                  { rotate: leafRotates[i] },
                ],
                opacity: leafAnims[i].interpolate({
                  inputRange: [0, 0.1, 0.9, 1],
                  outputRange: [0, 0.5, 0.25, 0],
                }),
              },
            ]}
          />
        ))}
      </View>
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
    borderRadius: 1000,
    backgroundColor: 'rgba(160,220,80,0.15)',
  },
  treeWrap: {
    zIndex: 2,
  },
  leafParticle: {
    position: 'absolute',
    borderRadius: 1000,
    pointerEvents: 'none',
  },
});
