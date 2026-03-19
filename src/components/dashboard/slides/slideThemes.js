/**
 * Slide Theme System — visual identity tokens for each Game Insights surface.
 *
 * Each theme defines the full material language for its category:
 * background layers, card chrome, accent palette, glow/shadow, and
 * typographic emphasis. SlideShell reads these to set CSS custom properties.
 */

const THEMES = {
  /* ────────────────────────────────────────────────────────────────────
   * TOURNAMENT — premium broadcast command center
   * Navy + gold base, brushed-metal highlights, stadium-lighting glow
   * ──────────────────────────────────────────────────────────────────── */
  tournament: {
    key: 'tournament',

    // Shell background layers (bottom → top)
    bgBase: '#0a1a2e',
    bgGradient:
      'radial-gradient(ellipse 1000px 600px at 50% -40px, rgba(183,152,108,0.18) 0%, transparent 60%),' +
      'radial-gradient(ellipse 700px 500px at 80% 20%, rgba(74,144,217,0.10) 0%, transparent 55%),' +
      'linear-gradient(175deg, #0e1f32 0%, #07111e 100%)',

    // Shell chrome
    headerBorder: 'rgba(183,152,108,0.22)',
    footerBorder: 'rgba(183,152,108,0.14)',
    footerUrlColor: '#D4B87A',

    // Card material
    cardBg:
      'linear-gradient(145deg, rgba(183,152,108,0.10) 0%, rgba(255,255,255,0.025) 45%, rgba(10,26,46,0.60) 100%)',
    cardBorder: 'rgba(183,152,108,0.28)',
    cardGlow: 'rgba(183,152,108,0.06)',
    cardTopEdge: 'rgba(212,184,122,0.22)',

    // Primary accent
    accent: '#D4B87A',
    accentAlt: '#4A90D9',
    accentGlow: 'rgba(212,184,122,0.18)',

    // Category chip
    categoryLabel: 'TOURNAMENT INTEL',
    categoryColor: '#D4B87A',
    categoryBg: 'rgba(183,152,108,0.12)',
    categoryBorder: 'rgba(183,152,108,0.30)',

    // Ring / meter
    ringTrack: 'rgba(183,152,108,0.10)',
    ringGlow: 0.4,

    // Mascot tint
    mascotFilter:
      'drop-shadow(0 4px 16px rgba(0,0,0,0.50)) drop-shadow(0 0 14px rgba(183,152,108,0.24))',
  },

  /* ────────────────────────────────────────────────────────────────────
   * UPSET RADAR — danger / volatility / alert system
   * Deep charcoal + ember red, pressure energy, pulse glow
   * ──────────────────────────────────────────────────────────────────── */
  upset_radar: {
    key: 'upset_radar',

    bgBase: '#120b0b',
    bgGradient:
      'radial-gradient(ellipse 900px 550px at 50% -30px, rgba(200,60,40,0.22) 0%, transparent 60%),' +
      'radial-gradient(ellipse 600px 400px at 20% 70%, rgba(232,132,95,0.08) 0%, transparent 50%),' +
      'linear-gradient(175deg, #1a0e0e 0%, #0d0808 100%)',

    headerBorder: 'rgba(200,60,40,0.22)',
    footerBorder: 'rgba(200,60,40,0.14)',
    footerUrlColor: '#E8845F',

    cardBg:
      'linear-gradient(145deg, rgba(200,60,40,0.10) 0%, rgba(255,255,255,0.02) 45%, rgba(18,11,11,0.65) 100%)',
    cardBorder: 'rgba(200,60,40,0.28)',
    cardGlow: 'rgba(232,132,95,0.08)',
    cardTopEdge: 'rgba(232,132,95,0.24)',

    accent: '#E8845F',
    accentAlt: '#C74545',
    accentGlow: 'rgba(232,132,95,0.20)',

    categoryLabel: 'UPSET RADAR',
    categoryColor: '#E8845F',
    categoryBg: 'rgba(232,132,95,0.14)',
    categoryBorder: 'rgba(232,132,95,0.30)',

    ringTrack: 'rgba(232,132,95,0.12)',
    ringGlow: 0.5,

    mascotFilter:
      'drop-shadow(0 4px 16px rgba(0,0,0,0.60)) drop-shadow(0 0 12px rgba(232,132,95,0.30))',
  },

  /* ────────────────────────────────────────────────────────────────────
   * SINGLE GAME — hero spotlight / matchup poster
   * Deep black-blue, dramatic center spotlight, glass panels
   * ──────────────────────────────────────────────────────────────────── */
  single_game: {
    key: 'single_game',

    bgBase: '#060e18',
    bgGradient:
      'radial-gradient(ellipse 800px 700px at 50% 40%, rgba(168,208,240,0.10) 0%, transparent 60%),' +
      'radial-gradient(ellipse 500px 300px at 50% -20px, rgba(60,121,180,0.14) 0%, transparent 50%),' +
      'linear-gradient(180deg, #0a1424 0%, #040a12 100%)',

    headerBorder: 'rgba(168,208,240,0.12)',
    footerBorder: 'rgba(168,208,240,0.08)',
    footerUrlColor: '#6EB3E8',

    cardBg:
      'linear-gradient(145deg, rgba(168,208,240,0.06) 0%, rgba(255,255,255,0.03) 50%, rgba(6,14,24,0.70) 100%)',
    cardBorder: 'rgba(168,208,240,0.18)',
    cardGlow: 'rgba(168,208,240,0.05)',
    cardTopEdge: 'rgba(168,208,240,0.14)',

    accent: '#6EB3E8',
    accentAlt: '#A8D0F0',
    accentGlow: 'rgba(110,179,232,0.14)',

    categoryLabel: 'GAME PREVIEW',
    categoryColor: '#6EB3E8',
    categoryBg: 'rgba(110,179,232,0.10)',
    categoryBorder: 'rgba(110,179,232,0.22)',

    ringTrack: 'rgba(110,179,232,0.08)',
    ringGlow: 0.35,

    mascotFilter:
      'drop-shadow(0 4px 16px rgba(0,0,0,0.55)) drop-shadow(0 0 10px rgba(110,179,232,0.20))',
  },

  /* ────────────────────────────────────────────────────────────────────
   * 5 KEY GAMES — app-like data dashboard, scannable, efficient
   * Cool blue-gray base, cyan accents, flat/sharp modular rows
   * ──────────────────────────────────────────────────────────────────── */
  key_games: {
    key: 'key_games',

    bgBase: '#0b1822',
    bgGradient:
      'radial-gradient(ellipse 900px 480px at 50% -50px, rgba(56,189,248,0.12) 0%, transparent 55%),' +
      'linear-gradient(175deg, #0e1e2c 0%, #070f18 100%)',

    headerBorder: 'rgba(56,189,248,0.16)',
    footerBorder: 'rgba(56,189,248,0.10)',
    footerUrlColor: '#38BDF8',

    cardBg:
      'linear-gradient(160deg, rgba(56,189,248,0.07) 0%, rgba(255,255,255,0.015) 100%)',
    cardBorder: 'rgba(56,189,248,0.20)',
    cardGlow: 'rgba(56,189,248,0.04)',
    cardTopEdge: 'rgba(56,189,248,0.14)',

    accent: '#38BDF8',
    accentAlt: '#22D3EE',
    accentGlow: 'rgba(56,189,248,0.12)',

    categoryLabel: '5 KEY GAMES',
    categoryColor: '#38BDF8',
    categoryBg: 'rgba(56,189,248,0.10)',
    categoryBorder: 'rgba(56,189,248,0.24)',

    ringTrack: 'rgba(56,189,248,0.08)',
    ringGlow: 0.3,

    mascotFilter:
      'drop-shadow(0 4px 14px rgba(0,0,0,0.50)) drop-shadow(0 0 10px rgba(56,189,248,0.18))',
  },
};

export function getSlideTheme(themeKey) {
  return THEMES[themeKey] || THEMES.tournament;
}

export function themeToCSS(theme) {
  return {
    '--theme-bg-base': theme.bgBase,
    '--theme-bg-gradient': theme.bgGradient,
    '--theme-header-border': theme.headerBorder,
    '--theme-footer-border': theme.footerBorder,
    '--theme-footer-url': theme.footerUrlColor,
    '--theme-card-bg': theme.cardBg,
    '--theme-card-border': theme.cardBorder,
    '--theme-card-glow': theme.cardGlow,
    '--theme-card-top-edge': theme.cardTopEdge,
    '--theme-accent': theme.accent,
    '--theme-accent-alt': theme.accentAlt,
    '--theme-accent-glow': theme.accentGlow,
    '--theme-ring-track': theme.ringTrack,
  };
}

export default THEMES;
