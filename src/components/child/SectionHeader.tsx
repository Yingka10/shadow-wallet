import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';

interface Props {
  title: string;
  /** 右側可選的次要說明（如「1 件待完成」），淡色 */
  meta?: string;
}

/**
 * 區塊標題 —— 用分組表達狀態（不用 chip/狀態字）。
 * 標題 + 一條髮絲線延伸到底，右側可放淡色 meta。
 */
export default function SectionHeader({ title, meta }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.line} />
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
    marginTop: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.bark700,
    letterSpacing: 0.3,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.hairline,
  },
  meta: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.fgMuted,
  },
});
