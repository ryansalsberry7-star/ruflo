import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from './lib/auth';
import { deleteJson } from './lib/api';

export default function AccountDeletionScreen() {
  const { user, authToken, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = password.length > 0 && confirmText.trim().toUpperCase() === 'DELETE';

  async function handleDelete(): Promise<void> {
    if (!authToken || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteJson('/api/auth/account', { password }, { headers: { authorization: `Bearer ${authToken}` } });
      await logout();
      router.replace('/');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Account deletion failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>ACCOUNT</Text>
          <Text style={styles.title}>Delete account</Text>
          <Text style={styles.description}>Sign in first to request account deletion.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ACCOUNT</Text>
        <Text style={styles.title}>Delete account</Text>
        <Text style={styles.description}>
          This permanently deletes the account "{user.username}" and its login credentials. This cannot be undone.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What happens</Text>
        <Text style={styles.row}>• Your username and password are deleted immediately and the username becomes available again.</Text>
        <Text style={styles.row}>• All of your active sessions are signed out on every device.</Text>
        <Text style={styles.row}>• Completed-hand records stay in the fair-play ledger under your player ID for audit and dispute purposes, the same way they do for every other player at the table.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Confirm your password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#6D5750"
        />

        <Text style={styles.label}>Type DELETE to confirm</Text>
        <TextInput
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.input}
          placeholder="DELETE"
          placeholderTextColor="#6D5750"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={submitting || !canSubmit ? styles.buttonDisabled : styles.button}
          onPress={() => void handleDelete()}
          disabled={submitting || !canSubmit}
        >
          <Text style={styles.buttonText}>{submitting ? 'Deleting…' : 'Delete my account'}</Text>
        </Pressable>
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
  cardTitle: { color: '#FFF4E7', fontSize: 15, fontWeight: '800' },
  row: { color: '#D8C4BA', fontSize: 13, lineHeight: 19 },
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
    backgroundColor: '#C24545',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 15,
    marginTop: 2,
  },
  buttonDisabled: {
    backgroundColor: '#C24545',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 15,
    marginTop: 2,
    opacity: 0.5,
  },
  buttonText: { color: '#FFF4E7', fontSize: 15, fontWeight: '900' },
});
