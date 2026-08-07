export const PLAYER_CHARACTER_IDS = [
  'river-fox',
  'night-owl',
  'gold-lion',
  'neon-panther',
  'storm-raven',
  'ember-wolf',
  'tide-koi',
  'lucky-hare',
] as const;

export type PlayerCharacterId = (typeof PLAYER_CHARACTER_IDS)[number];

export interface PlayerCharacter {
  id: PlayerCharacterId;
  name: string;
  title: string;
  emoji: string;
  description: string;
  aura: string;
  accent: string;
  glow: string;
}

export const PLAYER_CHARACTERS: PlayerCharacter[] = [
  {
    id: 'river-fox',
    name: 'River Fox',
    title: 'Pressure Reader',
    emoji: '\uD83E\uDD8A',
    description: 'Fast, sly, and built for river decisions.',
    aura: '#A3421F',
    accent: '#F29A4B',
    glow: '#F4D3A1',
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    title: 'Late-Position Sniper',
    emoji: '\uD83E\uDD89',
    description: 'Patient table control with sharp endgame reads.',
    aura: '#1C3559',
    accent: '#7CC8FF',
    glow: '#DAF1FF',
  },
  {
    id: 'gold-lion',
    name: 'Gold Lion',
    title: 'Table Captain',
    emoji: '\uD83E\uDD81',
    description: 'Big-presence stack play with calm aggression.',
    aura: '#67410E',
    accent: '#F1C46E',
    glow: '#F8E9B9',
  },
  {
    id: 'neon-panther',
    name: 'Neon Panther',
    title: 'Bluff Artist',
    emoji: '\uD83D\uDC2F',
    description: 'Electric tempo and fearless pressure lines.',
    aura: '#20463E',
    accent: '#3FD5B2',
    glow: '#CFFAF0',
  },
  {
    id: 'storm-raven',
    name: 'Storm Raven',
    title: 'Pattern Hunter',
    emoji: '\uD83D\uDC26',
    description: 'Collects timing tells and punishes repeats.',
    aura: '#2F3158',
    accent: '#A8A8FF',
    glow: '#E6E6FF',
  },
  {
    id: 'ember-wolf',
    name: 'Ember Wolf',
    title: 'Heat Check',
    emoji: '\uD83D\uDC3A',
    description: 'Applies relentless pressure once momentum flips.',
    aura: '#5D1F2E',
    accent: '#FF7E76',
    glow: '#FFD6D1',
  },
  {
    id: 'tide-koi',
    name: 'Tide Koi',
    title: 'Variance Surfer',
    emoji: '\uD83D\uDC20',
    description: 'Smooth composure through long sessions and swings.',
    aura: '#144865',
    accent: '#68D0E8',
    glow: '#D4F8FF',
  },
  {
    id: 'lucky-hare',
    name: 'Lucky Hare',
    title: 'Chip Sprinter',
    emoji: '\uD83D\uDC30',
    description: 'Quick starts, lively table energy, clean instincts.',
    aura: '#495B18',
    accent: '#B6DD5A',
    glow: '#F0FFD0',
  },
];

export const DEFAULT_PLAYER_CHARACTER_ID: PlayerCharacterId = 'river-fox';

export function getPlayerCharacter(characterId?: string | null): PlayerCharacter {
  return PLAYER_CHARACTERS.find((character) => character.id === characterId) ?? PLAYER_CHARACTERS[0];
}

export function resolveCharacterId(characterId?: string | null, seed?: string): PlayerCharacterId {
  if (characterId && PLAYER_CHARACTER_IDS.includes(characterId as PlayerCharacterId)) {
    return characterId as PlayerCharacterId;
  }

  const source = (seed ?? '').trim();
  if (!source) return DEFAULT_PLAYER_CHARACTER_ID;

  let hash = 11;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 131 + source.charCodeAt(index)) >>> 0;
  }
  return PLAYER_CHARACTER_IDS[hash % PLAYER_CHARACTER_IDS.length];
}
