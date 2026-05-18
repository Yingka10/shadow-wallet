import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import type { RootStackParamList } from '../../../App';

type Nav = StackNavigationProp<RootStackParamList, 'Entry'>;

export default function EntryScreen() {
  const navigation = useNavigation<Nav>();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigation.replace('ParentTab');
      } else {
        setChecking(false);
      }
    });
  }, []);

  if (checking) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.appName}>影子貨幣</Text>
          <Text style={styles.tagline}>家庭任務與零用錢管理</Text>
        </View>

        <View style={styles.cards}>
          <TouchableOpacity
            style={[styles.roleCard, { backgroundColor: Colors.primary }]}
            onPress={() => navigation.navigate('ParentLogin')}
            activeOpacity={0.85}
          >
            <Text style={styles.roleIcon}>👨‍👩‍👧</Text>
            <Text style={styles.roleLabel}>我是家長</Text>
            <Text style={styles.roleDesc}>管理任務與查看報告</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleCard, { backgroundColor: Colors.secondary }]}
            onPress={() => navigation.navigate('ChildLogin')}
            activeOpacity={0.85}
          >
            <Text style={styles.roleIcon}>🧒</Text>
            <Text style={styles.roleLabel}>我是小孩</Text>
            <Text style={styles.roleDesc}>完成任務與查看存款</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.newUserLink}
          onPress={() => navigation.navigate('Onboarding')}
        >
          <Text style={styles.newUserText}>第一次使用？建立家庭帳號</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, paddingHorizontal: 32, justifyContent: 'center', gap: 48 },
  header: { alignItems: 'center' },
  appName: { fontSize: 36, fontWeight: '800', color: Colors.text, letterSpacing: 2 },
  tagline: { fontSize: 14, color: Colors.textSecondary, marginTop: 8 },
  cards: { gap: 16 },
  roleCard: {
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  roleIcon: { fontSize: 44 },
  roleLabel: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
  roleDesc: { fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  newUserLink: { alignItems: 'center' },
  newUserText: { fontSize: 14, color: Colors.primary, textDecorationLine: 'underline' },
});
