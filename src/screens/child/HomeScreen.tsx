import React from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Colors } from '../../constants/colors';
import type { RootStackParamList } from '../../../App';
import { supabase } from '../../lib/supabase';

type HomeRoute = RouteProp<RootStackParamList, 'Home'>;
type Nav = StackNavigationProp<RootStackParamList, 'Home'>;

export default function HomeScreen() {
  const route = useRoute<HomeRoute>();
  const navigation = useNavigation<Nav>();
  const { childId } = route.params;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigation.replace('Entry');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>今天的任務</Text>
      <Text style={styles.subtitle}>孩子 ID：{childId}</Text>
      <View style={{ marginTop: 20 }}>
        <Button title="登出 (清除紀錄)" onPress={handleLogout} color={Colors.error} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 8,
  },
});
