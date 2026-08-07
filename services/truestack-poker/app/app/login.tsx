import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CelticKnot } from '../components/CelticKnot';
import { useAuth } from '../lib/auth';
import { colors, displayFont, fontSize } from '../lib/theme';

export default function LoginScreen() {
  const { login, loading, error } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const canSubmit = username.trim().length > 0 && password.length > 0;

  async function handleLogin(): Promise<void> {
    try {
      await login({ username, password });
      router.replace('/');
    } catch {
      // Context already exposes the error state.
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.eyebrowRow}>
          <CelticKnot size={16} color={colors.mint} opacity={0.85} />
          <Text style={styles.eyebrow}>ACCOUNT</Text>
        </View>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.description}>Resume your session with your table identity.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Username</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          style={styles.input}
          placeholder="Enter your username"
          placeholderTextColor={colors.textFaint}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={styles.input}
          placeholder="Enter your password"
          placeholderTextColor={colors.textFaint}
          onSubmitEditing={() => void handleLogin()}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={loading || !canSubmit ? styles.buttonDisabled : styles.button}
          onPress={() => void handleLogin()}
          disabled={loading || !canSubmit}
        >
          <Text style={styles.buttonText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Don&apos;t have a profile yet?</Text>
        <Link href="/register" asChild>
          <Pressable>
            <Text style={styles.footerLink}>Create one</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center', gap: 20 },
  header: { gap: 6, marginBottom: 4 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: { color: colors.gold, fontSize: fontSize.md, fontWeight: '800', letterSpacing: 2 },
  title: { color: colors.text, fontSize: fontSize.display, fontWeight: '900', ...displayFont },
  description: { color: colors.textMuted, fontSize: fontSize.xl, lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 12,
  },
  label: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800' },
  input: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: fontSize.xl,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  error: { color: colors.danger, fontSize: fontSize.base, lineHeight: 18 },
  button: {
    backgroundColor: colors.gold,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 15,
    marginTop: 2,
  },
  buttonDisabled: {
    backgroundColor: colors.gold,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 15,
    marginTop: 2,
    opacity: 0.5,
  },
  buttonText: { color: colors.ink, fontSize: fontSize.xl, fontWeight: '900' },
  footer: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  footerText: { color: colors.textMuted, fontSize: fontSize.lg },
  footerLink: { color: colors.gold, fontSize: fontSize.lg, fontWeight: '800' },
});
