import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PLAYER_CHARACTERS, getPlayerCharacter, type PlayerCharacterId } from './lib/playerIdentity';
import { useAuth } from './lib/auth';

const MIN_PASSWORD_LENGTH = 8;

export default function RegistrationScreen() {
  const { register, loading, error } = useAuth();
  const [username, setUsername] = useState('RiverFox');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [playerCharacter, setPlayerCharacter] = useState<PlayerCharacterId>('river-fox');
  const activeCharacter = getPlayerCharacter(playerCharacter);

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit =
    username.trim().length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password === confirmPassword;

  async function handleRegister(): Promise<void> {
    if (!canSubmit) return;
    try {
      await register({ username, password, playerCharacter });
      router.replace('/');
    } catch {
      // Context already exposes the error state.
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>AUTH</Text>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.description}>Choose a table identity that follows you from the lobby to the felt, then register it as your active player session.</Text>
        <View style={styles.previewRow}>
          <View style={[styles.previewAvatar, { backgroundColor: activeCharacter.aura, borderColor: activeCharacter.accent }]}>
            <Text style={styles.previewEmoji}>{activeCharacter.emoji}</Text>
          </View>
          <View style={styles.previewCopy}>
            <Text style={styles.previewName}>{activeCharacter.name}</Text>
            <Text style={styles.previewTitle}>{activeCharacter.title}</Text>
            <Text style={styles.previewDescription}>{activeCharacter.description}</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Username</Text>
        <TextInput value={username} onChangeText={setUsername} autoCapitalize="words" style={styles.input} placeholder="RiverFox" placeholderTextColor="#6D7EA7" />
        <Text style={styles.hint}>A unique player ID is generated automatically, and you can change your character later from profile.</Text>

        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={styles.input}
          placeholder="At least 8 characters"
          placeholderTextColor="#6D7EA7"
        />
        {passwordTooShort ? <Text style={styles.error}>Password must be at least {MIN_PASSWORD_LENGTH} characters.</Text> : null}

        <Text style={styles.label}>Confirm password</Text>
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={styles.input}
          placeholder="Re-enter your password"
          placeholderTextColor="#6D7EA7"
        />
        {passwordsMismatch ? <Text style={styles.error}>Passwords don&apos;t match.</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Choose your character</Text>
        <View style={styles.characterGrid}>
          {PLAYER_CHARACTERS.map((character) => {
            const selected = character.id === playerCharacter;
            return (
              <Pressable
                key={character.id}
                onPress={() => setPlayerCharacter(character.id)}
                style={[
                  styles.characterCard,
                  { backgroundColor: character.aura },
                  selected && { borderColor: character.glow, shadowColor: character.accent, shadowOpacity: 0.4, shadowRadius: 12 },
                ]}
              >
                <Text style={styles.characterEmoji}>{character.emoji}</Text>
                <Text style={styles.characterName}>{character.name}</Text>
                <Text style={styles.characterTitle}>{character.title}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>Verified-human shielding appears on your avatar after trust checks are complete.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={loading || !canSubmit ? styles.buttonDisabled : styles.button} onPress={() => void handleRegister()} disabled={loading || !canSubmit}>
          <Text style={styles.buttonText}>{loading ? 'Creating account...' : 'Create account'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#17090D' },
  content: { padding: 22, paddingTop: 38, paddingBottom: 28, gap: 16 },
  heroCard: {
    backgroundColor: '#2A1118',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#5E3032',
    padding: 20,
    gap: 12,
  },
  eyebrow: { color: '#F1C46E', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#FFF4E7', fontSize: 32, fontWeight: '900' },
  description: { color: '#D8C4BA', fontSize: 15, lineHeight: 22 },
  previewRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  previewAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  previewEmoji: { fontSize: 34 },
  previewCopy: { flex: 1, gap: 2 },
  previewName: { color: '#FFF4E7', fontSize: 20, fontWeight: '800' },
  previewTitle: { color: '#F7D9A2', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  previewDescription: { color: '#D8C4BA', fontSize: 13, lineHeight: 19 },
  card: {
    backgroundColor: '#221017',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#4B2630',
    padding: 16,
    gap: 12,
  },
  label: { color: '#FFF4E7', fontSize: 15, fontWeight: '800' },
  input: {
    backgroundColor: '#12070B',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#6A4047',
    color: '#FFF4E7',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  characterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  characterCard: {
    width: '47%',
    minHeight: 118,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,244,231,0.18)',
    padding: 12,
    justifyContent: 'space-between',
  },
  characterEmoji: { fontSize: 28 },
  characterName: { color: '#FFF8EF', fontSize: 15, fontWeight: '800' },
  characterTitle: { color: '#F6E7C8', fontSize: 11, lineHeight: 16, fontWeight: '700' },
  hint: { color: '#BFA8A0', fontSize: 12, lineHeight: 18 },
  error: { color: '#FFB4B4', fontSize: 12, lineHeight: 18 },
  button: {
    backgroundColor: '#F1C46E',
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 14,
  },
  buttonDisabled: {
    backgroundColor: '#F1C46E',
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 14,
    opacity: 0.5,
  },
  buttonText: { color: '#2A1118', fontSize: 15, fontWeight: '900' },
});
