import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from './lib/auth';

export default function LoginScreen() {
  const { login, loading, error } = useAuth();
  const [username, setUsername] = useState('Ada');

  async function handleLogin(): Promise<void> {
    try {
      await login({ username });
      router.replace('/');
    } catch {
      // Context already exposes the error state.
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>AUTH</Text>
        <Text style={styles.title}>Secure login</Text>
        <Text style={styles.description}>Re-enter your table identity and restore the same trust, character, and profile state across the app.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Username</Text>
        <TextInput value={username} onChangeText={setUsername} autoCapitalize="none" style={styles.input} placeholder="Ada" placeholderTextColor="#6D7EA7" />
        <Text style={styles.hint}>Seeded demo users include Ada, Linus, and Grace.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.button} onPress={() => void handleLogin()} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Sign in'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#17090D', padding: 24, justifyContent: 'space-between' },
  header: { gap: 10, marginTop: 40 },
  eyebrow: { color: '#F1C46E', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#FFF4E7', fontSize: 30, fontWeight: '900' },
  description: { color: '#D8C4BA', fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: '#221017',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#4B2630',
    padding: 16,
    gap: 10,
    marginBottom: 24,
  },
  label: { color: '#FFF4E7', fontSize: 14, fontWeight: '800' },
  input: {
    backgroundColor: '#12070B',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#6A4047',
    color: '#FFF4E7',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  hint: { color: '#BFA8A0', fontSize: 12, lineHeight: 18 },
  error: { color: '#FFB4B4', fontSize: 12, lineHeight: 18 },
  button: {
    backgroundColor: '#F1C46E',
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 14,
  },
  buttonText: { color: '#2A1118', fontSize: 15, fontWeight: '900' },
});
