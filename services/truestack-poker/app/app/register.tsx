import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CelticKnot } from '../components/CelticKnot';
import { PLAYER_CHARACTERS, getPlayerCharacter, type PlayerCharacterId } from '../lib/playerIdentity';
import { useAuth } from '../lib/auth';
import { colors, displayFont, fontSize } from '../lib/theme';

const MIN_PASSWORD_LENGTH = 8;

export default function RegistrationScreen() {
  const { register, loading, error } = useAuth();
  const [username, setUsername] = useState('RoyalFlush');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [playerCharacter, setPlayerCharacter] = useState<PlayerCharacterId>('royal-flush');
  const activeCharacter = getPlayerCharacter(playerCharacter);
  const insets = useSafeAreaInsets();

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
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
      <View style={styles.heroCard}>
        <View style={styles.eyebrowRow}>
          <CelticKnot size={16} color={colors.mint} opacity={0.85} />
          <Text style={styles.eyebrow}>AUTH</Text>
        </View>
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
        <TextInput value={username} onChangeText={setUsername} autoCapitalize="words" style={styles.input} placeholder="RoyalFlush" placeholderTextColor={colors.textFaint} />
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
          placeholderTextColor={colors.textFaint}
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
          placeholderTextColor={colors.textFaint}
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
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 22, paddingTop: 38, paddingBottom: 28, gap: 16 },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 12,
  },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: { color: colors.gold, fontSize: fontSize.md, fontWeight: '800', letterSpacing: 2 },
  title: { color: colors.text, fontSize: fontSize.display + 8, fontWeight: '900', ...displayFont },
  description: { color: colors.textMuted, fontSize: fontSize.xl, lineHeight: 22 },
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
  previewName: { color: colors.text, fontSize: fontSize.display - 4, fontWeight: '800' },
  previewTitle: { color: colors.gold, fontSize: fontSize.md, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  previewDescription: { color: colors.textMuted, fontSize: fontSize.lg, lineHeight: 19 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  label: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800' },
  input: {
    backgroundColor: colors.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  characterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  characterCard: {
    width: '47%',
    minHeight: 118,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(242,240,234,0.18)',
    padding: 12,
    justifyContent: 'space-between',
  },
  characterEmoji: { fontSize: 28 },
  characterName: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800' },
  characterTitle: { color: colors.gold, fontSize: fontSize.base, lineHeight: 16, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: fontSize.base, lineHeight: 18 },
  error: { color: colors.danger, fontSize: fontSize.base, lineHeight: 18 },
  button: {
    backgroundColor: colors.gold,
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 14,
  },
  buttonDisabled: {
    backgroundColor: colors.gold,
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 14,
    opacity: 0.5,
  },
  buttonText: { color: colors.ink, fontSize: fontSize.xl, fontWeight: '900' },
});
