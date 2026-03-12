/**
 * AI-like text generation for reel overlays.
 *
 * Uses keyword extraction + template matching to produce marketing copy
 * from a prompt context string. Designed to be swappable with a real
 * LLM endpoint later — the function signature stays the same.
 *
 * Returns { headline, subhead, overlayBeats[], cta, variantHooks[] }
 */

const KEYWORD_MAP = {
  pin: {
    actions: ['Pin', 'Save', 'Lock in'],
    objects: ['your teams', 'your favorites', 'matchups'],
  },
  track: {
    actions: ['Track', 'Follow', 'Monitor'],
    objects: ['every game', 'live scores', 'your teams'],
  },
  bet: {
    actions: ['Find', 'Spot', 'Track'],
    objects: ['ATS signals', 'betting edges', 'line movements'],
  },
  ats: {
    actions: ['Track', 'Spot', 'Analyze'],
    objects: ['ATS signals', 'spread movements', 'cover trends'],
  },
  leaderboard: {
    actions: ['Dominate', 'Climb', 'Check'],
    objects: ['the leaderboard', 'your rankings', 'the standings'],
  },
  score: {
    actions: ['Track', 'Get', 'Watch'],
    objects: ['live scores', 'real-time updates', 'every play'],
  },
  signal: {
    actions: ['Find', 'Spot', 'Discover'],
    objects: ['betting signals', 'smart edges', 'hidden value'],
  },
  odds: {
    actions: ['Compare', 'Track', 'Find'],
    objects: ['live odds', 'the best lines', 'odds shifts'],
  },
  lineup: {
    actions: ['Set', 'Manage', 'Customize'],
    objects: ['your lineup', 'your watchlist', 'your roster'],
  },
  demo: {
    actions: ['See', 'Watch', 'Discover'],
    objects: ['how it works', 'the platform', 'every feature'],
  },
  college: {
    actions: ['Track', 'Follow', 'Dominate'],
    objects: ['college hoops', 'March Madness', 'NCAA action'],
  },
  nba: {
    actions: ['Track', 'Follow', 'Dominate'],
    objects: ['NBA action', 'pro basketball', 'every game'],
  },
};

const PRODUCT_HOOKS = [
  (v) => `${v.action} ${v.object} Instantly`,
  (v) => `${v.action} ${v.object} in Seconds`,
  (v) => `The Smartest Way to ${v.action} ${v.object}`,
];

const BETTING_HOOKS = [
  (v) => `Find ${v.bettingObject} Faster`,
  (v) => `Never Miss ${v.bettingObject} Again`,
  (v) => `${v.bettingObject}: Decoded`,
];

const CURIOSITY_HOOKS = [
  (v) => `The Smartest Way To ${v.action} ${v.object}`,
  (v) => `What 10K+ Bettors Already Know`,
  (v) => `This Changes How You ${v.action}`,
];

const BEAT_TEMPLATES = [
  (v) => `${v.action} ${v.object.split(' ').slice(0, 3).join(' ')}`,
  (v) => `Real-time ${v.object}`,
  (v) => `Never miss a game`,
];

const SUBHEAD_TEMPLATES = [
  (v) => `Track ${v.object}, scores, and highlights in seconds.`,
  (v) => `Real-time ${v.object} at your fingertips.`,
  (v) => `${v.action} smarter. Win bigger.`,
];

function extractKeywords(prompt) {
  const lower = prompt.toLowerCase();
  const matched = [];
  for (const [keyword, data] of Object.entries(KEYWORD_MAP)) {
    if (lower.includes(keyword)) {
      matched.push({ keyword, ...data });
    }
  }
  return matched.length > 0
    ? matched
    : [{ keyword: 'default', actions: ['Discover', 'Track', 'See'], objects: ['every feature', 'live updates', 'the platform'] }];
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateReelText(promptContext, ctaType = 'website') {
  const keywords = extractKeywords(promptContext || '');
  const primary = keywords[0];

  const action = primary.actions[0];
  const object = primary.objects[0];
  const bettingObject = keywords.find(k =>
    ['bet', 'ats', 'signal', 'odds'].includes(k.keyword)
  )?.objects[0] || 'ATS signals';

  const vars = { action, object, bettingObject };

  const headline = pick(PRODUCT_HOOKS)(vars);
  const subhead = pick(SUBHEAD_TEMPLATES)(vars);

  const overlayBeats = BEAT_TEMPLATES.map((fn) => fn(vars));

  let cta;
  if (ctaType === 'instagram') {
    cta = 'Follow @maximussports.ai for daily intel';
  } else if (ctaType === 'website') {
    cta = 'Create your free account at maximussports.ai';
  } else {
    cta = '';
  }

  const variantHooks = [
    { id: 'product', headline: PRODUCT_HOOKS[0](vars), tone: 'Product Hook' },
    { id: 'betting', headline: BETTING_HOOKS[0](vars), tone: 'Betting Hook' },
    { id: 'curiosity', headline: CURIOSITY_HOOKS[0](vars), tone: 'Curiosity Hook' },
  ];

  return { headline, subhead, overlayBeats, cta, variantHooks };
}

export function generateVariantText(promptContext, tone = 'product') {
  const keywords = extractKeywords(promptContext || '');
  const primary = keywords[0];

  const action = primary.actions[0];
  const object = primary.objects[0];
  const bettingObject = keywords.find(k =>
    ['bet', 'ats', 'signal', 'odds'].includes(k.keyword)
  )?.objects[0] || 'ATS signals';

  const vars = { action, object, bettingObject };

  let hooks;
  switch (tone) {
    case 'betting': hooks = BETTING_HOOKS; break;
    case 'curiosity': hooks = CURIOSITY_HOOKS; break;
    default: hooks = PRODUCT_HOOKS;
  }

  const headline = pick(hooks)(vars);
  const subhead = pick(SUBHEAD_TEMPLATES)(vars);
  const overlayBeats = BEAT_TEMPLATES.map((fn) => fn(vars));

  return { headline, subhead, overlayBeats };
}
