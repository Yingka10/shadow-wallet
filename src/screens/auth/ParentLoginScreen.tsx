import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import type { RootStackParamList } from '../../../App';

type Nav = StackNavigationProp<RootStackParamList, 'ParentLogin'>;

export default function ParentLoginScreen() {
  const navigation = useNavigation<Nav>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  function validateEmail(v: string) {
    if (!v.trim()) return '請輸入 Email';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return 'Email 格式不正確';
    return '';
  }

  async function handleLogin() {
    const eErr = validateEmail(email);
    setEmailError(eErr);
    if (eErr) return;
    if (!password) {
      setLoginError('請輸入密碼');
      return;
    }
    setLoginError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('invalid login credentials')) {
          setLoginError('Email 或密碼錯誤');
        } else {
          setLoginError(error.message);
        }
      } else {
        navigation.replace('ParentTab');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← 返回</Text>
          </TouchableOpacity>

          <Text style={styles.title}>家長登入</Text>

          {loginError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{loginError}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, emailError ? styles.inputError : null]}
            value={email}
            onChangeText={(v) => { setEmail(v); if (emailError) setEmailError(validateEmail(v)); }}
            onBlur={() => setEmailError(validateEmail(email))}
            placeholder="your@email.com"
            placeholderTextColor={Colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}

          <Text style={styles.label}>密碼</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={(v) => { setPassword(v); if (loginError) setLoginError(''); }}
            placeholder="••••••"
            placeholderTextColor={Colors.textSecondary}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.primaryButton, styles.marginTop]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.primaryButtonText}>登入</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryLink}
            onPress={() => navigation.navigate('Onboarding')}
          >
            <Text style={styles.secondaryLinkText}>還沒帳號？建立家庭帳號</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  content: { padding: 24, paddingBottom: 48 },
  backBtn: { marginBottom: 24 },
  backText: { fontSize: 16, color: Colors.primary },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.text, marginTop: 20, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  inputError: { borderColor: Colors.error },
  fieldError: { fontSize: 12, color: Colors.error, marginTop: 4 },
  marginTop: { marginTop: 32 },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondaryLink: { alignItems: 'center', marginTop: 20 },
  secondaryLinkText: { fontSize: 14, color: Colors.primary },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 12, marginBottom: 8 },
  errorText: { fontSize: 14, color: Colors.error, lineHeight: 20 },
});
