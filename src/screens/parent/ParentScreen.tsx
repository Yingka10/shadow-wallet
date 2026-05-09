import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Colors } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import type { RootStackParamList } from '../../../App';

type Nav = StackNavigationProp<RootStackParamList, 'Parent'>;

export default function ParentScreen() {
  const navigation = useNavigation<Nav>();
  const [children, setChildren] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadChildren() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: parents } = await supabase
          .from('parents')
          .select('family_id')
          .eq('user_id', user.id)
          .single();

        if (parents?.family_id) {
          const { data: kids } = await supabase
            .from('children')
            .select('*')
            .eq('family_id', parents.family_id);
          setChildren(kids || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadChildren();
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>家長控制台</Text>
      <Text style={styles.subtitle}>選擇孩子來設定目標與任務</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.list}>
          {children.length > 0 ? (
            children.map(child => (
              <View key={child.id} style={styles.childCard}>
                <Text style={styles.childName}>{child.nickname || child.real_name}</Text>
                <TouchableOpacity
                  style={styles.btn}
                  onPress={() => {
                    navigation.navigate('GoalSetup', {
                      childId: child.id,
                      childNickname: child.nickname || child.real_name,
                      familyId: child.family_id,
                      ageGroup: '6-9', // TODO: 根據實際生日計算
                      isOnboarding: false,
                    });
                  }}
                >
                  <Text style={styles.btnText}>設定目標與任務</Text>
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <Text style={styles.emptyNote}>尚未建立任何孩子資料</Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 40,
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
  list: {
    marginTop: 40,
    width: '100%',
    paddingHorizontal: 20,
  },
  childCard: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  childName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  btn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  emptyNote: {
    textAlign: 'center',
    marginTop: 20,
    color: Colors.textSecondary,
  },
});
