import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../../App';
import { Colors } from '../../constants/colors';

type LongTermDetailRoute = RouteProp<RootStackParamList, 'LongTermDetail'>;

export default function LongTermDetailScreen() {
  const route = useRoute<LongTermDetailRoute>();
  const { taskName } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{taskName}</Text>
      <Text style={styles.subtitle}>長期任務詳情（即將推出）</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
});
