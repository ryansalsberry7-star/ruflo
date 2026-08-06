import { Platform, type TextStyle } from 'react-native';

/**
 * Shared visual tokens -- "Aurora Table: Night Session".
 *
 * Direction: private high-stakes table, not Vegas carpet. A near-black graphite base
 * (cooler and darker than the old burgundy so the felt and cards do the work of
 * reading as "poker") with a deep petrol-emerald felt, gold demoted to a restrained
 * status/accent color rather than the dominant hue, electric mint reserved for
 * live/action states, and hot coral held back for all-in/danger so it still reads as
 * a spike when it appears. Screens should import from here instead of hardcoding hex
 * values -- table.tsx, lobby.tsx, ActionBar.tsx, StartingHandMatrix.tsx, and
 * HoleCards.tsx already do; other screens still carry the earlier wine/gold literals
 * and are unaffected by this palette until they're migrated too.
 */

export const colors = {
  /** Screen backgrounds, darkest to lightest. */
  bg: '#0A0C10',
  surface: '#12151A',
  surfaceRaised: '#1A1E24',
  border: '#2B3038',
  borderSubtle: '#1E2229',

  /** Restrained champagne gold. Status/accent only now -- raise/bet CTAs and the
   *  hero seat ring, not the dominant hue it was in the burgundy palette. */
  gold: '#CBB27E',
  goldDim: '#6B5F49',
  /** Muted gold border for secondary tags/pills (match chips, filter pills) -- distinct
   *  from goldDim, which reads darker/flatter. */
  goldMuted: '#8A7A55',

  /** Text, most to least prominent. */
  text: '#F2F0EA',
  textMuted: '#9AA0A8',
  textFaint: '#666C74',

  /** Selected/active tint for chips, pills, and sliders. */
  surfaceActive: '#20262E',
  /** Near-black foreground for text sitting on light/gold/mint surfaces (raise
   *  button, dealer button, checkmarks). */
  ink: '#0E1013',

  /** Felt: deep petrol-emerald rather than a bright casino green. */
  felt: '#0E3B34',
  feltDark: '#082821',

  /** Electric mint -- the "live/action" accent: live-table dot, active-turn glow,
   *  timer sweep. Distinct from gold, which is now a calmer status color. */
  mint: '#2FE5AE',

  /** Action semantics. */
  fold: '#7A3B36',
  call: '#1F8F6E',
  raise: '#CBB27E',
  danger: '#FF5C4D',
  /** All-in reuses danger's hot coral -- same "this is the big one" register. */
  allIn: '#FF5C4D',
  positive: '#33E8A8',

  /** Data-viz tones reserved for the study-layer matrix (VPIP/EV/frequency heatmaps) --
   *  not yet drawn anywhere, defined now so that pass has a palette to pull from
   *  instead of inventing ad hoc hex values later. */
  dataCyan: '#3FD0E6',
  dataViolet: '#9C86FF',
  dataLime: '#B6E64A',
  dataAmber: '#FFC24B',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/**
 * Tabular numeric style for stacks, pots, blinds, and timers -- money and countdowns
 * should line up and hold a fixed width as digits change, not reflow with the
 * proportional body font.
 */
export const numericFont: TextStyle = {
  fontVariant: ['tabular-nums'],
  fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};

/**
 * Condensed display face for headers/titles -- the "sports-broadcast" register from the
 * brief, as distinct from numericFont (data) and the system font (body/UI labels).
 * Bundled via @expo-google-fonts/barlow-condensed; RootLayout gates first render on
 * useFonts() loading these two weights before anything mounts.
 */
export const displayFont: TextStyle = { fontFamily: 'BarlowCondensed_900Black', letterSpacing: 0.4 };
export const displayFontSemibold: TextStyle = { fontFamily: 'BarlowCondensed_700Bold' };

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
