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
  /** Muted gold border for secondary tags/pills (match chips, filter pills) -- distinct
   *  from goldDim, which reads warmer/rosier. Was drifting as an unnamed literal across
   *  table.tsx and lobby.tsx before this. */
  goldMuted: '#8A6A45',

  /** Text, most to least prominent. */
  text: '#FFF4E7',
  textMuted: '#B99D93',
  textFaint: '#8C7069',

  /** Selected/active tint for chips, pills, and sliders -- was a recurring unnamed
   *  literal duplicated across table.tsx, lobby.tsx, and ActionBar.tsx. */
  surfaceActive: '#3A1E22',
  /** Near-black foreground for text sitting on light/gold surfaces (raise button,
   *  dealer button, checkmarks) -- was a recurring unnamed literal in table.tsx and
   *  ActionBar.tsx. */
  ink: '#2A1118',

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
 * Type scale. The table screen had accumulated 16 distinct one-off `fontSize` values
 * (6 through 56, mostly a single px apart) before this existed, which read as noise
 * rather than intentional hierarchy. These are the sizes actually in use across the
 * app, named so the next label pulls from a known step instead of picking an arbitrary
 * number -- not a redesign, just giving the existing scale names.
 */
export const fontSize = {
  micro: 6, // single-glyph badges (trust shield "H")
  xxs: 7, // avatar emoji, dealer button, bot tag, status line
  xs: 8, // seat name, last-action pill
  sm: 9, // stat tile labels, chip amounts
  md: 11, // captions, chip labels, eyebrow text
  base: 12, // body copy, secondary values
  lg: 13, // primary body copy
  xl: 14, // emphasized body / small headings
  xxl: 16, // stat values, card headings
  display: 24, // screen titles
} as const;

/**
 * Card pip colors, tuned for a white/cream card face like a physical card rather than
 * the felt behind it. Four-color decks are standard in serious online poker because
 * diamonds and hearts are hard to tell apart at phone size; two-color stays available
 * for players who learned on physical cards.
 */
export const suitColors = {
  fourColor: { s: '#1B1B1F', h: '#D6304A', d: '#2E7DD1', c: '#2E8B57' },
  twoColor: { s: '#1B1B1F', h: '#D6304A', d: '#D6304A', c: '#1B1B1F' },
} as const;

export type DeckColorMode = keyof typeof suitColors;
