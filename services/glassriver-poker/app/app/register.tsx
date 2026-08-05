import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from './lib/auth';

export default function RegistrationScreen() {
  const { register, loading, error } = useAuth();
  const [username, setUsername] = useState('RiverFox');

  async function handleRegister(): Promise<void> {
    try {
      await register({ username });
      router.replace('/');
    } catch {
      // Context already exposes the error state.
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>AUTH</Text>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.description}>Register a new player identity and make it the active session across coaching, trust, and community screens.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Username</Text>
        <TextInput value={username} onChangeText={setUsername} autoCapitalize="words" style={styles.input} placeholder="RiverFox" placeholderTextColor="#6D7EA7" />
        <Text style={styles.hint}>A unique player ID will be generated automatically if needed.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.button} onPress={() => void handleRegister()} disabled={loading || username.trim().length === 0}>
          <Text style={styles.buttonText}>{loading ? 'Creating account...' : 'Create account'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#060816', padding: 24, justifyContent: 'space-between' },
  header: { gap: 10, marginTop: 40 },
  eyebrow: { color: '#7ED3FF', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#F8F7FF', fontSize: 30, fontWeight: '800' },
  description: { color: '#A7B0CF', fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: '#12172D',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#23304E',
    padding: 16,
    gap: 10,
    marginBottom: 24,
  },
  label: { color: '#F8F7FF', fontSize: 14, fontWeight: '700' },
  input: {
    backgroundColor: '#0B1124',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#33466F',
    color: '#F8F7FF',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  hint: { color: '#95A8D0', fontSize: 12, lineHeight: 18 },
  error: { color: '#FFB4B4', fontSize: 12, lineHeight: 18 },
  button: {
    backgroundColor: '#3E8FFF',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 14,
  },
  buttonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});