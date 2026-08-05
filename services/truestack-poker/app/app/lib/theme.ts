/**
 * Shared visual tokens.
 *
 * The app previously carried two unrelated palettes -- a wine/gold set on the table,
 * home, and auth screens, and a navy/blue set on the lobby, wallet, and info screens --
 * so the core journey (home -> lobby -> table) flipped identity twice. These tokens are
 * the wine/gold set, which reads as poker rather than generic fintech; screens should
 * import from here instead of hardcoding hex values.
 */

export const colors = {
  /** Screen backgrounds, darkest to lightest. */
  bg: '#17090D',
  surface: '#221017',
  surfaceRaised: '#2C141C',
  border: '#4B2630',
  borderSubtle: '#341A21',

  /** Brand accent. Used for primary actions and the hero seat ring. */
  gold: '#F1C46E',
  goldDim: '#7A4A53',

  /** Text, most to least prominent. */
  text: '#FFF4E7',
  textMuted: '#B99D93',
  textFaint: '#8C7069',

  /** Felt. */
  felt: '#1E5E43',
  feltDark: '#123B2A',

  /** Action semantics. */
  fold: '#8E3B3B',
  call: '#2F6D4F',
  raise: '#F1C46E',
  danger: '#D9534F',
  positive: '#5FBE84',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/**
 * Card pip colors. Four-color decks are standard in serious online poker because
 * diamonds and hearts are hard to tell apart at phone size; two-color stays available
 * for players who learned on physical cards.
 */
export const suitColors = {
  fourColor: { s: '#F2ECE4', h: '#E5544B', d: '#4FA3E3', c: '#5FBE84' },
  twoColor: { s: '#F2ECE4', h: '#E5544B', d: '#E5544B', c: '#F2ECE4' },
} as const;

export type DeckColorMode = keyof typeof suitColors;
