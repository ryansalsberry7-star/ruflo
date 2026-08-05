import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from './lib/auth';

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
        <Text style={styles.eyebrow}>ACCOUNT</Text>
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
          placeholderTextColor="#6D5750"
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
          placeholderTextColor="#6D5750"
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
  screen: { flex: 1, backgroundColor: '#17090D', padding: 24, justifyContent: 'center', gap: 20 },
  header: { gap: 6, marginBottom: 4 },
  eyebrow: { color: '#F1C46E', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#FFF4E7', fontSize: 30, fontWeight: '900' },
  description: { color: '#B99D93', fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: '#221017',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#4B2630',
    padding: 18,
    gap: 12,
  },
  label: { color: '#FFF4E7', fontSize: 13, fontWeight: '800' },
  input: {
    backgroundColor: '#17090D',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4B2630',
    color: '#FFF4E7',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  error: { color: '#FFB4B4', fontSize: 12, lineHeight: 18 },
  button: {
    backgroundColor: '#F1C46E',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 15,
    marginTop: 2,
  },
  buttonDisabled: {
    backgroundColor: '#F1C46E',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 15,
    marginTop: 2,
    opacity: 0.5,
  },
  buttonText: { color: '#2A1118', fontSize: 15, fontWeight: '900' },
  footer: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  footerText: { color: '#8C7069', fontSize: 13 },
  footerLink: { color: '#F1C46E', fontSize: 13, fontWeight: '800' },
});
