import { StyleSheet, Text, View } from 'react-native';

export function VerifiedHumanBadge({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.badge, compact && styles.badgeCompact]}>
      <Text style={[styles.icon, compact && styles.iconCompact]}>{'\uD83D\uDEE1'}</Text>
      <Text style={[styles.text, compact && styles.textCompact]}>{compact ? 'Human' : 'Verified Human'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E7C57D',
    backgroundColor: '#3A2414',
  },
  badgeCompact: {
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  icon: {
    fontSize: 12,
  },
  iconCompact: {
    fontSize: 10,
  },
  text: {
    color: '#F9E8BD',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  textCompact: {
    fontSize: 9,
  },
});
