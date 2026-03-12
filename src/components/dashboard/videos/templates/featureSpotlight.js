/**
 * Video template configuration + structured content types.
 *
 * Exports:
 *   FEATURE_TYPES    — what the video demonstrates
 *   HOOK_STYLES      — how the hook is phrased
 *   MESSAGE_ANGLES   — framing / perspective
 *   COPY_INTENSITIES — energy level of the copy
 *   CTA_TYPES        — call-to-action destination modes
 *   TEMPLATES        — renderable template configs
 *   getTemplate(id)  — template lookup
 */

// ─── Feature Types ───────────────────────────────────────────────

export const FEATURE_TYPES = {
  pinning: {
    id: 'pinning',
    label: 'Pinning Teams',
    keywords: ['pin', 'save', 'favorite', 'watchlist', 'follow'],
    actions: ['Pin', 'Save', 'Follow'],
    objects: ['your teams', 'your favorites', 'every matchup'],
    value: 'Never lose track of the teams you care about',
    beats: ['Pin teams instantly', 'Get live updates', 'Never miss a game'],
    subheads: [
      'Track scores, updates, and intel for every team you follow.',
      'Your personalized watchlist, updated in real time.',
      'Pin once. Stay locked in all season.',
    ],
  },
  ats: {
    id: 'ats',
    label: 'ATS / Betting Signals',
    keywords: ['ats', 'bet', 'spread', 'signal', 'cover', 'line'],
    actions: ['Track', 'Spot', 'Analyze'],
    objects: ['ATS signals', 'spread movements', 'cover trends'],
    value: 'Real-time signals that sharpen every decision',
    beats: ['Spot ATS signals', 'Track spread movement', 'Find your edge'],
    subheads: [
      'Real-time signals, spread tracking, and cover trends.',
      'Sharper reads on every spread, every game.',
      'ATS data designed for serious bettors.',
    ],
  },
  teamIntel: {
    id: 'teamIntel',
    label: 'Team Intel',
    keywords: ['team', 'roster', 'intel', 'profile', 'matchup'],
    actions: ['Explore', 'Analyze', 'Research'],
    objects: ['full team intel', 'matchup data', 'team profiles'],
    value: 'Deep team intelligence in one place',
    beats: ['Full team profiles', 'Matchup breakdowns', 'Real-time stats'],
    subheads: [
      'Rosters, records, trends, and matchup data in one place.',
      'Complete team intelligence at your fingertips.',
      'Deep team profiles built for serious analysis.',
    ],
  },
  conferenceIntel: {
    id: 'conferenceIntel',
    label: 'Conference Intel',
    keywords: ['conference', 'standings', 'big ten', 'sec', 'acc', 'big 12'],
    actions: ['Break down', 'Analyze', 'Track'],
    objects: ['conference data', 'standings trends', 'head-to-head records'],
    value: 'Full conference picture at a glance',
    beats: ['Conference standings', 'Head-to-head records', 'Trend analysis'],
    subheads: [
      'Full conference breakdown with standings and trends.',
      'Conference intelligence that goes beyond the scoreboard.',
      'Every conference. Every matchup. Every trend.',
    ],
  },
  oddsInsights: {
    id: 'oddsInsights',
    label: 'Odds Insights',
    keywords: ['odds', 'line', 'movement', 'value', 'moneyline', 'over', 'under'],
    actions: ['Compare', 'Track', 'Find'],
    objects: ['live odds', 'line movements', 'value opportunities'],
    value: 'See the odds landscape before anyone else',
    beats: ['Compare live odds', 'Track line movement', 'Find value bets'],
    subheads: [
      'Live odds comparison, line movements, and value alerts.',
      'See where the lines are moving before the market catches on.',
      'Odds intelligence for sharper decisions.',
    ],
  },
  generalDemo: {
    id: 'generalDemo',
    label: 'General Product Demo',
    keywords: ['demo', 'product', 'platform', 'feature', 'app', 'walkthrough'],
    actions: ['Discover', 'Explore', 'See'],
    objects: ['the platform', 'every feature', 'Maximus Sports'],
    value: 'Everything you need in one sports intelligence platform',
    beats: ['Explore the dashboard', 'Track every game', 'Get started free'],
    subheads: [
      'Scores, odds, intel, and more — all in one platform.',
      'The sports intelligence platform built for serious fans.',
      'One platform. Every game. Total coverage.',
    ],
  },
};

// ─── Hook Styles ─────────────────────────────────────────────────

export const HOOK_STYLES = {
  product: { id: 'product', label: 'Product / Utility' },
  betting: { id: 'betting', label: 'Betting / Edge' },
  curiosity: { id: 'curiosity', label: 'Curiosity / Scroll-stopper' },
  fans: { id: 'fans', label: 'Fans / Hype' },
  editorial: { id: 'editorial', label: 'Clean / Editorial' },
};

// ─── Message Angles ──────────────────────────────────────────────

export const MESSAGE_ANGLES = {
  demo: {
    id: 'demo',
    label: 'Product Demo',
    preferredIndex: 0,
    hookWeight: { product: 1.5, editorial: 1.2, curiosity: 0.8 },
  },
  edge: {
    id: 'edge',
    label: 'Betting Edge',
    preferredIndex: 1,
    hookWeight: { betting: 1.5, curiosity: 1.2, product: 0.8 },
  },
  excitement: {
    id: 'excitement',
    label: 'Fan Excitement',
    preferredIndex: 2,
    hookWeight: { fans: 1.5, curiosity: 1.2, editorial: 0.8 },
  },
  education: {
    id: 'education',
    label: 'Feature Education',
    preferredIndex: 0,
    hookWeight: { editorial: 1.5, product: 1.2, curiosity: 0.8 },
  },
  significance: {
    id: 'significance',
    label: 'Why This Matters',
    preferredIndex: 2,
    hookWeight: { curiosity: 1.5, editorial: 1.2, fans: 0.8 },
  },
};

// ─── Copy Intensities ────────────────────────────────────────────

export const COPY_INTENSITIES = {
  clean: {
    id: 'clean',
    label: 'Clean',
    maxHeadlineWords: 5,
    subheadKey: 0,
    beatStyle: 'minimal',
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    maxHeadlineWords: 8,
    subheadKey: 1,
    beatStyle: 'standard',
  },
  bold: {
    id: 'bold',
    label: 'Bold',
    maxHeadlineWords: 11,
    subheadKey: 2,
    beatStyle: 'emphatic',
  },
};

// ─── CTA Destination Types ───────────────────────────────────────

export const CTA_TYPES = {
  website: {
    id: 'website',
    label: 'Website Signup',
    defaultText: 'Get started free at maximussports.ai',
    templates: {
      clean: ['maximussports.ai', 'Start at maximussports.ai'],
      balanced: ['Get started free at maximussports.ai', 'Create your free account at maximussports.ai'],
      bold: ['Get your edge — free at maximussports.ai', 'Start winning at maximussports.ai'],
    },
  },
  instagram: {
    id: 'instagram',
    label: 'Instagram Follow',
    defaultText: 'Follow @maximussports.ai for daily intel',
    templates: {
      clean: ['@maximussports.ai', 'Follow @maximussports.ai'],
      balanced: ['Follow @maximussports.ai for daily intel', 'Follow @maximussports.ai — new content daily'],
      bold: ['Follow @maximussports.ai for daily sports intel', '@maximussports.ai — your daily edge'],
    },
  },
  explore: {
    id: 'explore',
    label: 'Explore Product',
    defaultText: 'Explore Maximus Sports — maximussports.ai',
    templates: {
      clean: ['Explore at maximussports.ai', 'See more at maximussports.ai'],
      balanced: ['Explore Maximus Sports — maximussports.ai', 'See everything at maximussports.ai'],
      bold: ['Explore the full platform — maximussports.ai', 'See what you\'re missing — maximussports.ai'],
    },
  },
  intel: {
    id: 'intel',
    label: 'Team Intel',
    defaultText: 'Get intel on every team at maximussports.ai',
    templates: {
      clean: ['Deep intel at maximussports.ai', 'Intel at maximussports.ai'],
      balanced: ['Get team intel at maximussports.ai', 'Full team intelligence — maximussports.ai'],
      bold: ['Get the full intel package at maximussports.ai', 'Deep sports intel starts at maximussports.ai'],
    },
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    defaultText: '',
    templates: { clean: [], balanced: [], bold: [] },
  },
};

// ─── Variant style combos (ensure 3 distinct hooks) ─────────────

export const VARIANT_COMBOS = {
  product:   ['product', 'curiosity', 'editorial'],
  betting:   ['betting', 'product', 'curiosity'],
  curiosity: ['curiosity', 'product', 'fans'],
  fans:      ['fans', 'product', 'curiosity'],
  editorial: ['editorial', 'curiosity', 'product'],
};

// ─── Template: Feature Spotlight ─────────────────────────────────

export const FEATURE_SPOTLIGHT = {
  id: 'feature-spotlight',
  name: 'Feature Spotlight',
  description: 'Branded intro → product demo → CTA outro',

  width: 1080,
  height: 1920,
  fps: 30,

  scenes: {
    intro: { durationMs: 1500 },
    footage: { defaultDurationMs: 9000, minMs: 4000, maxMs: 15000 },
    outro: { durationMs: 2000 },
  },

  safeZone: { top: 0.15, bottom: 0.78 },

  overlays: [
    {
      id: 'headline',
      field: 'headline',
      startPct: 0.08,
      endPct: 0.45,
      fadeMs: 300,
      yPct: 0.20,
      maxFontSize: 52,
      lineHeight: 1.25,
      style: 'headline',
    },
    {
      id: 'subhead',
      field: 'subhead',
      startPct: 0.50,
      endPct: 0.88,
      fadeMs: 300,
      yPct: 0.20,
      maxFontSize: 40,
      lineHeight: 1.3,
      style: 'subhead',
    },
  ],

  overlayBeats: [
    { startPct: 0.05, endPct: 0.30, field: 'beat0' },
    { startPct: 0.33, endPct: 0.60, field: 'beat1' },
    { startPct: 0.63, endPct: 0.92, field: 'beat2' },
  ],

  brand: {
    logo: '/logo.png',
    name: 'MAXIMUS SPORTS',
    url: 'maximussports.ai',
    accentColor: '#3C79B4',
    gradientStart: '#0a0e1a',
    gradientEnd: '#131c30',
  },

  variantPresets: [
    { id: 'product', label: 'Product Hook', tone: 'product' },
    { id: 'betting', label: 'Betting Hook', tone: 'betting' },
    { id: 'curiosity', label: 'Curiosity Hook', tone: 'curiosity' },
  ],
};

// ─── Template: Quick Walkthrough ─────────────────────────────────

export const QUICK_WALKTHROUGH = {
  id: 'quick-walkthrough',
  name: 'Quick Walkthrough',
  description: 'Fast-paced demo with text beats, shorter intro/outro',

  width: 1080,
  height: 1920,
  fps: 30,

  scenes: {
    intro: { durationMs: 800 },
    footage: { defaultDurationMs: 8000, minMs: 3000, maxMs: 15000 },
    outro: { durationMs: 1200 },
  },

  safeZone: { top: 0.15, bottom: 0.78 },

  overlays: [
    {
      id: 'headline',
      field: 'headline',
      startPct: 0.05,
      endPct: 0.35,
      fadeMs: 250,
      yPct: 0.20,
      maxFontSize: 48,
      lineHeight: 1.25,
      style: 'headline',
    },
    {
      id: 'subhead',
      field: 'subhead',
      startPct: 0.40,
      endPct: 0.70,
      fadeMs: 250,
      yPct: 0.20,
      maxFontSize: 38,
      lineHeight: 1.3,
      style: 'subhead',
    },
  ],

  overlayBeats: [
    { startPct: 0.03, endPct: 0.22, field: 'beat0' },
    { startPct: 0.25, endPct: 0.45, field: 'beat1' },
    { startPct: 0.48, endPct: 0.68, field: 'beat2' },
    { startPct: 0.72, endPct: 0.95, field: 'beat3' },
  ],

  brand: {
    logo: '/logo.png',
    name: 'MAXIMUS SPORTS',
    url: 'maximussports.ai',
    accentColor: '#27ae60',
    gradientStart: '#0a0e1a',
    gradientEnd: '#0f1f14',
  },

  variantPresets: [
    { id: 'product', label: 'Product Hook', tone: 'product' },
    { id: 'curiosity', label: 'Curiosity Hook', tone: 'curiosity' },
    { id: 'fans', label: 'Fans / Hype Hook', tone: 'fans' },
  ],
};

// ─── Template: Stats Proof Reel (scaffold) ───────────────────────

export const STATS_PROOF_REEL = {
  id: 'stats-proof',
  name: 'Stats Proof Reel',
  description: 'Data-driven highlight with stat callouts',

  width: 1080,
  height: 1920,
  fps: 30,

  scenes: {
    intro: { durationMs: 1200 },
    footage: { defaultDurationMs: 10000, minMs: 5000, maxMs: 15000 },
    outro: { durationMs: 1500 },
  },

  safeZone: { top: 0.15, bottom: 0.78 },

  overlays: [
    {
      id: 'headline',
      field: 'headline',
      startPct: 0.05,
      endPct: 0.30,
      fadeMs: 250,
      yPct: 0.18,
      maxFontSize: 48,
      lineHeight: 1.25,
      style: 'headline',
    },
    {
      id: 'subhead',
      field: 'subhead',
      startPct: 0.35,
      endPct: 0.60,
      fadeMs: 250,
      yPct: 0.20,
      maxFontSize: 36,
      lineHeight: 1.3,
      style: 'subhead',
    },
  ],

  overlayBeats: [
    { startPct: 0.10, endPct: 0.30, field: 'beat0' },
    { startPct: 0.35, endPct: 0.55, field: 'beat1' },
    { startPct: 0.60, endPct: 0.80, field: 'beat2' },
  ],

  brand: {
    logo: '/logo.png',
    name: 'MAXIMUS SPORTS',
    url: 'maximussports.ai',
    accentColor: '#e67e22',
    gradientStart: '#0a0e1a',
    gradientEnd: '#1a150e',
  },

  variantPresets: [
    { id: 'product', label: 'Product Hook', tone: 'product' },
    { id: 'betting', label: 'Data Hook', tone: 'betting' },
    { id: 'editorial', label: 'Clean Hook', tone: 'editorial' },
  ],
};

// ─── Caption Tones ──────────────────────────────────────────────

export const CAPTION_TONES = {
  instagram: { id: 'instagram', label: 'Instagram Native' },
  brand:     { id: 'brand',     label: 'Clean Brand' },
  betting:   { id: 'betting',   label: 'Betting Audience' },
  hype:      { id: 'hype',      label: 'Fan Hype' },
};

// ─── Registry ────────────────────────────────────────────────────

export const TEMPLATES = [FEATURE_SPOTLIGHT, QUICK_WALKTHROUGH, STATS_PROOF_REEL];

export function getTemplate(id) {
  return TEMPLATES.find(t => t.id === id) || FEATURE_SPOTLIGHT;
}
