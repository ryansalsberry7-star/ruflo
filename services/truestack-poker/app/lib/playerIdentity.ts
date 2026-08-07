export const PLAYER_CHARACTER_IDS = [
  'royal-flush',
  'aces-over',
  'shark-mode',
  'poker-phoenix',
  'mind-reader',
  'high-roller',
  'luck-of-the-draw',
  'diamond-hands',
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
    id: 'royal-flush',
    name: 'Royal Flush',
    title: 'Legendary Avatar',
    emoji: '👑',
    description: 'A true king knows when to bet, raise, and conquer.',
    aura: '#2B2410',
    accent: '#D4AF37',
    glow: '#F5D67A',
  },
  {
    id: 'aces-over',
    name: 'Aces Over',
    title: 'Epic Avatar',
    emoji: '🥷',
    description: "When the stakes are high, I'm already all in.",
    aura: '#2B0A0A',
    accent: '#C81E2E',
    glow: '#FF8A8A',
  },
  {
    id: 'shark-mode',
    name: 'Shark Mode',
    title: 'Rare Avatar',
    emoji: '🦈',
    description: 'Smell weakness. Take chips.',
    aura: '#0A1A2B',
    accent: '#2E86D4',
    glow: '#8FD1FF',
  },
  {
    id: 'poker-phoenix',
    name: 'Poker Phoenix',
    title: 'Legendary Avatar',
    emoji: '🔥',
    description: 'From the ashes of bad beats, I rise and play again.',
    aura: '#2B1400',
    accent: '#E8730A',
    glow: '#FFC066',
  },
  {
    id: 'mind-reader',
    name: 'The Mind Reader',
    title: 'Epic Avatar',
    emoji: '👁️',
    description: "I don't need to see your cards to know how this ends.",
    aura: '#1A0A2B',
    accent: '#8A3FE0',
    glow: '#D3AEFF',
  },
  {
    id: 'high-roller',
    name: 'High Roller',
    title: 'Rare Avatar',
    emoji: '🕶️',
    description: "Big risk. Bigger reward. That's the life.",
    aura: '#241A0A',
    accent: '#C9A227',
    glow: '#F3E3A0',
  },
  {
    id: 'luck-of-the-draw',
    name: 'Luck of the Draw',
    title: 'Uncommon Avatar',
    emoji: '🍀',
    description: "Sometimes luck isn't given, it's earned.",
    aura: '#0A2B12',
    accent: '#2FA84A',
    glow: '#9CF0B4',
  },
  {
    id: 'diamond-hands',
    name: 'Diamond Hands',
    title: 'Rare Avatar',
    emoji: '💎',
    description: "I don't fold. I don't break.",
    aura: '#141A24',
    accent: '#8FA6C2',
    glow: '#DCEBFF',
  },
];

export const DEFAULT_PLAYER_CHARACTER_ID: PlayerCharacterId = 'royal-flush';

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
