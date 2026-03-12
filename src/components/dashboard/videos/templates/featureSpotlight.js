/**
 * Video template configuration + structured content types.
 *
 * Exports:
 *   FEATURE_TYPES  — what the video demonstrates
 *   HOOK_STYLES    — how the hook is phrased
 *   CTA_TYPES      — call-to-action destination modes
 *   TEMPLATES      — renderable template configs
 *   getTemplate(id) — template lookup
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
  product: {
    id: 'product',
    label: 'Product / Utility',
    headlineTemplates: [
      (a, o) => `${a} ${o} in Seconds`,
      (a, o) => `${a} ${o}. Instantly.`,
      (a, o) => `The Fastest Way to ${a} ${o}`,
    ],
  },
  betting: {
    id: 'betting',
    label: 'Betting / Edge',
    headlineTemplates: [
      (a, o) => `Your Edge: ${a} ${o}`,
      (_a, o) => `Find ${o} Before the Line Moves`,
      (a, o) => `${a} ${o} — Sharper Than the Market`,
    ],
  },
  curiosity: {
    id: 'curiosity',
    label: 'Curiosity / Scroll-stopper',
    headlineTemplates: [
      (a, o) => `What If You Could ${a} ${o}?`,
      () => 'What 10K+ Bettors Already Know',
      (a) => `This Changes How You ${a}`,
    ],
  },
  fans: {
    id: 'fans',
    label: 'Fans / Hype',
    headlineTemplates: [
      (a, o) => `${a} ${o} Like a Pro`,
      (_a, o) => `Dominate ${o} This Season`,
      (a, o) => `${a} ${o} — Own Your Edge`,
    ],
  },
  editorial: {
    id: 'editorial',
    label: 'Clean / Editorial',
    headlineTemplates: [
      (a, _o) => `${a}. Track. Win.`,
      (a, o) => `${a} ${o}. No Noise.`,
      (_a, o) => `${o}. Simplified.`,
    ],
  },
};

// ─── CTA Destination Types ───────────────────────────────────────

export const CTA_TYPES = {
  website: {
    id: 'website',
    label: 'Website Signup',
    defaultText: 'Get started free at maximussports.ai',
    templates: [
      'Get started free at maximussports.ai',
      'Create your free account at maximussports.ai',
      'Try Maximus Sports free — maximussports.ai',
    ],
  },
  instagram: {
    id: 'instagram',
    label: 'Instagram Follow',
    defaultText: 'Follow @maximussports.ai for daily intel',
    templates: [
      'Follow @maximussports.ai for daily intel',
      'Follow @maximussports.ai — new content daily',
      '@maximussports.ai — Follow for more',
    ],
  },
  explore: {
    id: 'explore',
    label: 'Explore Product',
    defaultText: 'Explore Maximus Sports — maximussports.ai',
    templates: [
      'Explore Maximus Sports — maximussports.ai',
      'See everything at maximussports.ai',
      'Explore the full platform — maximussports.ai',
    ],
  },
  intel: {
    id: 'intel',
    label: 'Team Intel',
    defaultText: 'Get intel on every team at maximussports.ai',
    templates: [
      'Get intel on every team at maximussports.ai',
      'Full team intelligence — maximussports.ai',
      'Deep sports intel starts at maximussports.ai',
    ],
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    defaultText: '',
    templates: [],
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
    footage: { defaultDurationMs: 9000, minMs: 4000, maxMs: 12000 },
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
    accentColor: '#3C79B4',
    gradientStart: '#0a0e1a',
    gradientEnd: '#131c30',
  },

  variantPresets: [
    { id: 'product', label: 'Product Hook', tone: 'product' },
    { id: 'curiosity', label: 'Curiosity Hook', tone: 'curiosity' },
    { id: 'fans', label: 'Fans / Hype Hook', tone: 'fans' },
  ],
};

// ─── Registry ────────────────────────────────────────────────────

export const TEMPLATES = [FEATURE_SPOTLIGHT, QUICK_WALKTHROUGH];

export function getTemplate(id) {
  return TEMPLATES.find(t => t.id === id) || FEATURE_SPOTLIGHT;
}
