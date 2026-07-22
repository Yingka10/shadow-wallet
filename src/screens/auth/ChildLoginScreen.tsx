import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import type { RootStackParamList } from '../../../App';

type Nav = StackNavigationProp<RootStackParamList, 'ChildLogin'>;
type ViewState = 'loading' | 'parent_auth' | 'pick_child' | 'set_pin' | 'enter_pin';

interface ChildInfo {
  id: string;
  nickname: string;
  pin_code: string | null;
}

const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
];

export default function ChildLoginScreen() {
  const navigation = useNavigation<Nav>();

  const [viewState, setViewState] = useState<ViewState>('loading');
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedChild, setSelectedChild] = useState<ChildInfo | null>(null);

  // Parent auth state
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // PIN entry state
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  // PIN setup state (when child has no PIN yet)
  const [pinSetStep, setPinSetStep] = useState<'first' | 'confirm'>('first');
  const [firstPin, setFirstPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  useEffect(() => {
    loadChildren();
  }, []);

  async function loadChildren() {
    setViewState('loading');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setViewState('parent_auth');
      return;
    }
    await fetchChildrenForUser(session.user.id);
  }

  async function fetchChildrenForUser(userId: string) {
    const { data: parent } = await supabase
      .from('parents')
      .select('family_id')
      .eq('user_id', userId)
      .single();

    if (!parent) {
      setViewState('parent_auth');
      return;
    }
    const { data: list } = await supabase
      .from('children')
      .select('id, nickname, pin_code')
      .eq('family_id', parent.family_id)
      .order('created_at', { ascending: true });

    setChildren(list ?? []);
    setViewState('pick_child');
  }

  async function handleParentLogin() {
    if (!authEmail.trim() || !authPassword) {
      setAuthError('請填寫帳號和密碼');
      return;
    }
    setAuthError('');
    setAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('invalid login credentials')) {
          setAuthError('帳號或密碼錯誤');
        } else {
          setAuthError(error.message);
        }
        return;
      }
      if (data.user) {
        await fetchChildrenForUser(data.user.id);
      }
    } finally {
      setAuthLoading(false);
    }
  }

  function handleSelectChild(child: ChildInfo) {
    setSelectedChild(child);
    setPin('');
    setPinError('');
    if (!child.pin_code) {
      setPinSetStep('first');
      setFirstPin('');
      setViewState('set_pin');
    } else {
      setViewState('enter_pin');
    }
  }

  // ── PIN entry ─────────────────────────────────────────────────

  function handlePinDigit(digit: string) {
    if (pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    setPinError('');
    if (next.length === 4) {
      if (next === selectedChild!.pin_code) {
        navigation.replace('Home', { childId: selectedChild!.id });
      } else {
        setPinError('PIN 錯誤，請再試一次');
        setTimeout(() => setPin(''), 700);
      }
    }
  }

  function handlePinDelete() {
    setPin(p => p.slice(0, -1));
    setPinError('');
  }

  // ── PIN setup ─────────────────────────────────────────────────

  function handleSetPinDigit(digit: string) {
    if (pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    setPinError('');

    if (next.length === 4) {
      if (pinSetStep === 'first') {
        setFirstPin(next);
        setPin('');
        setPinSetStep('confirm');
      } else {
        if (next === firstPin) {
          void savePinAndEnter(next);
        } else {
          setPinError('兩次輸入不一樣，請重新設定');
          setTimeout(() => {
            setPin('');
            setFirstPin('');
            setPinSetStep('first');
          }, 800);
        }
      }
    }
  }

  async function savePinAndEnter(newPin: string) {
    setSavingPin(true);
    try {
      await supabase
        .from('children')
        .update({ pin_code: newPin })
        .eq('id', selectedChild!.id);
      navigation.replace('Home', { childId: selectedChild!.id });
    } finally {
      setSavingPin(false);
    }
  }

  function handleSetPinDelete() {
    setPin(p => p.slice(0, -1));
    setPinError('');
  }

  // ── Loading ───────────────────────────────────────────────────

  if (viewState === 'loading') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Parent auth ───────────────────────────────────────────────

  if (viewState === 'parent_auth') {
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={async () => {
                await supabase.auth.signOut();
                navigation.navigate('Entry');
              }}
            >
              <Text style={styles.backText}>← 返回</Text>
            </TouchableOpacity>

            <Text style={styles.title}>輸入家長帳號</Text>
            <Text style={styles.subtitle}>登入後可選擇孩子並設定 PIN 碼</Text>

            {authError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{authError}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>家長 Email</Text>
            <TextInput
              style={styles.input}
              value={authEmail}
              onChangeText={(v) => { setAuthEmail(v); setAuthError(''); }}
              placeholder="your@email.com"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.label}>密碼</Text>
            <TextInput
              style={styles.input}
              value={authPassword}
              onChangeText={(v) => { setAuthPassword(v); setAuthError(''); }}
              placeholder="••••••"
              placeholderTextColor={Colors.textSecondary}
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.primaryButton, { marginTop: 32 }]}
              onPress={handleParentLogin}
              disabled={authLoading}
            >
              {authLoading
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={styles.primaryButtonText}>驗證家長身份</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── PIN pad (entry or setup) ──────────────────────────────────

  if (viewState === 'enter_pin' || viewState === 'set_pin') {
    const isSetup = viewState === 'set_pin';
    const isConfirmStep = isSetup && pinSetStep === 'confirm';
    const onDigit = isSetup ? handleSetPinDigit : handlePinDigit;
    const onDelete = isSetup ? handleSetPinDelete : handlePinDelete;

    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.pinScreen}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => { setViewState('pick_child'); setPin(''); setPinError(''); }}
          >
            <Text style={styles.backText}>← 換人</Text>
          </TouchableOpacity>

          <Text style={styles.pinGreeting}>
            {isSetup ? `嗨，${selectedChild!.nickname}！` : `嗨，${selectedChild!.nickname}！`}
          </Text>
          <Text style={styles.pinHint}>
            {isSetup
              ? (isConfirmStep ? '再輸入一次確認 PIN 碼' : '設定你的 4 位數 PIN 碼')
              : '請輸入你的 PIN 碼'}
          </Text>

          <View style={styles.dotRow}>
            {Array.from({ length: 4 }, (_, i) => (
              <View
                key={i}
                style={[styles.dot, i < pin.length ? styles.dotFilled : styles.dotEmpty]}
              />
            ))}
          </View>
          {pinError
            ? <Text style={styles.pinError}>{pinError}</Text>
            : <Text style={styles.pinErrorPlaceholder}> </Text>}

          {savingPin
            ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
            : (
              <View style={styles.keypad}>
                {KEYPAD_ROWS.map((row, ri) => (
                  <View key={ri} style={styles.keypadRow}>
                    {row.map((key, ki) =>
                      key === '' ? (
                        <View key={ki} style={styles.keyEmpty} />
                      ) : (
                        <TouchableOpacity
                          key={ki}
                          style={styles.keyBtn}
                          onPress={() => key === '⌫' ? onDelete() : onDigit(key)}
                          activeOpacity={0.6}
                        >
                          <Text style={styles.keyText}>{key}</Text>
                        </TouchableOpacity>
                      )
                    )}
                  </View>
                ))}
              </View>
            )}
        </View>
      </SafeAreaView>
    );
  }

  // ── Child picker ──────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.padded}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={async () => {
            await supabase.auth.signOut();
            navigation.navigate('Entry');
          }}
        >
          <Text style={styles.backText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>你是誰？</Text>
        <FlatList
          data={children}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.childList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.childCard}
              onPress={() => handleSelectChild(item)}
              activeOpacity={0.8}
            >
              <Text style={styles.childAvatar}>🧒</Text>
              <Text style={styles.childName}>{item.nickname}</Text>
              <Text style={styles.childBadge}>
                {item.pin_code ? '已設定 PIN' : '設定 PIN →'}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  padded: { flex: 1, padding: 24 },
  scrollContent: { padding: 24, paddingBottom: 48 },

  backBtn: { marginBottom: 16 },
  backText: { fontSize: 16, color: Colors.primary },

  title: { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 24 },
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
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 12, marginBottom: 8 },
  errorText: { fontSize: 14, color: Colors.error },

  // Child picker
  childList: { gap: 12 },
  childCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
  },
  childAvatar: { fontSize: 36 },
  childName: { flex: 1, fontSize: 20, fontWeight: '600', color: Colors.text },
  childBadge: { fontSize: 13, color: Colors.textSecondary },

  // PIN screen
  pinScreen: { flex: 1, padding: 24, alignItems: 'center' },
  pinGreeting: { fontSize: 26, fontWeight: '700', color: Colors.text, marginTop: 32 },
  pinHint: { fontSize: 16, color: Colors.textSecondary, marginTop: 6, marginBottom: 36 },
  dotRow: { flexDirection: 'row', gap: 20, marginBottom: 8 },
  dot: { width: 18, height: 18, borderRadius: 9 },
  dotEmpty: { borderWidth: 2, borderColor: Colors.border },
  dotFilled: { backgroundColor: Colors.primary },
  pinError: { fontSize: 14, color: Colors.error, marginTop: 8 },
  pinErrorPlaceholder: { marginTop: 8, height: 20 },
  keypad: { marginTop: 32, width: '75%', gap: 14 },
  keypadRow: { flexDirection: 'row', gap: 14 },
  keyBtn: {
    flex: 1,
    aspectRatio: 1.4,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyEmpty: { flex: 1, aspectRatio: 1.4 },
  keyText: { fontSize: 24, fontWeight: '500', color: Colors.text },
});
