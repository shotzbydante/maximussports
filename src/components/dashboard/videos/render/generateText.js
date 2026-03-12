/**
 * Viral-quality reel copy generation.
 *
 * Pre-crafted headline banks per featureType × hookStyle,
 * with message-angle and copy-intensity modifiers.
 * Designed as the heuristic backend for the generation adapter,
 * easily swappable with a real LLM endpoint.
 */

import {
  FEATURE_TYPES,
  HOOK_STYLES,
  CTA_TYPES,
  COPY_INTENSITIES,
  MESSAGE_ANGLES,
  VARIANT_COMBOS,
} from '../templates/featureSpotlight';

// ─── Headline bank: featureType × hookStyle → 3 crafted options ──

const H = {
  pinning: {
    product:   ['Your Whole Season. One Tap.', 'Pin It. Track It. Own It.', 'Every Team You Follow. One Dashboard.'],
    betting:   ['Your Watchlist Is Your Edge', 'Track the Teams That Move Lines', 'Pin Smart. Bet Sharper.'],
    curiosity: ['Most Fans Check 3 Apps for Scores', 'What Smart Fans Figured Out First', 'Still Refreshing Twitter for Scores?'],
    fans:      ['Never Miss Another Score', 'Your Teams. Your Rules. Your Season.', 'Lock In on Every Team You Follow'],
    editorial: ['Pin. Track. Win.', 'One Dashboard. Every Team.', 'Organized Sports Intelligence'],
  },
  ats: {
    product:   ['ATS Signals. Real-Time. Actionable.', 'Track Spreads Before They Move', 'See the Signal. Make the Call.'],
    betting:   ['Before the Market Catches On', 'Sharper Lines. Faster Reads.', 'The Signals That Move the Needle'],
    curiosity: ['Why Sharp Bettors Stopped Guessing', 'The ATS Edge Hiding in Plain Sight', 'What Your Sportsbook Won\'t Show You'],
    fans:      ['Make Every Spread Count', 'Your Edge. Every Game. Every Line.', 'Stop Guessing. Start Tracking.'],
    editorial: ['Signals. Spreads. Clarity.', 'ATS Intelligence. Simplified.', 'Clean Data. Clear Edge.'],
  },
  teamIntel: {
    product:   ['Full Team Intel. One Place.', 'Deep Profiles for Every Matchup', 'Research Any Team in Seconds'],
    betting:   ['Know More Than the Market', 'Intel That Sharpens Every Bet', 'Deeper Research. Better Lines.'],
    curiosity: ['How Do Top Bettors Research Teams?', 'What the Box Score Doesn\'t Tell You', 'The Intel Layer Most Fans Miss'],
    fans:      ['Know Your Team Inside Out', 'Every Stat. Every Trend. Every Game.', 'Go Deeper Than the Scoreboard'],
    editorial: ['Team Profiles. Complete.', 'Intel Built for Serious Analysis', 'Matchups. Rosters. Trends.'],
  },
  conferenceIntel: {
    product:   ['Every Conference. Fully Mapped.', 'Conference Intel at a Glance', 'Standings, Trends, Head-to-Head'],
    betting:   ['Conference Edges the Market Misses', 'Where Trends Meet Betting Lines', 'Map the Conference. Find the Edge.'],
    curiosity: ['Most Bettors Ignore Conference Trends', 'The Data That Separates Sharp from Square', 'Conference Intel Changes Everything'],
    fans:      ['Own Your Conference Knowledge', 'From Standings to Showdowns', 'Every Rivalry. Every Trend. Tracked.'],
    editorial: ['Conference. Breakdown. Complete.', 'Full Conference Analysis', 'Standings and Trends. Simplified.'],
  },
  oddsInsights: {
    product:   ['Live Odds. Instant Comparison.', 'Track Line Movement in Real Time', 'Every Odds Shift. Captured.'],
    betting:   ['See Lines Move Before Anyone Else', 'Find Value Before It Disappears', 'The Odds Edge You\'ve Been Missing'],
    curiosity: ['Why Lines Move — And What It Means', 'The Odds Intelligence Most Miss', 'What Happens Before the Line Shifts?'],
    fans:      ['Odds That Actually Make Sense', 'Compare. Decide. Dominate.', 'Your Odds Dashboard. Simplified.'],
    editorial: ['Lines. Movement. Clarity.', 'Odds Intelligence. Refined.', 'Live Odds. Done Right.'],
  },
  generalDemo: {
    product:   ['Sports Intelligence. Redefined.', 'One Platform. Every Insight.', 'See What Maximus Sports Can Do'],
    betting:   ['Your Betting Research Hub', 'Smarter Sports Intel Starts Here', 'Every Tool a Sharp Bettor Needs'],
    curiosity: ['There\'s a Smarter Way to Follow Sports', 'What 10K+ Users Already Discovered', 'The Platform Changing How Fans Compete'],
    fans:      ['Built for Fans Who Want More', 'Every Game. Every Stat. One Place.', 'Level Up Your Sports Experience'],
    editorial: ['Scores. Odds. Intel. One Place.', 'Sports Intelligence. Simplified.', 'Clean. Fast. Complete.'],
  },
};

// ─── Subhead bank: featureType × copyIntensity ───────────────────

const S = {
  pinning: {
    clean:    'Real-time scores and updates for every team you follow.',
    balanced: 'Pin your teams and get live scores, alerts, and matchup intel instantly.',
    bold:     'Stop checking three apps. Pin once and get every score, alert, and edge — automatically.',
  },
  ats: {
    clean:    'Real-time spread tracking and ATS signals.',
    balanced: 'Track ATS signals, spread movement, and cover trends as they happen.',
    bold:     'Before the line moves, before the market shifts — you\'ll see the signal first.',
  },
  teamIntel: {
    clean:    'Complete team profiles and matchup data.',
    balanced: 'Rosters, records, trends, and deep matchup analysis in one place.',
    bold:     'Every stat the box score misses. Every trend the market hasn\'t priced in.',
  },
  conferenceIntel: {
    clean:    'Full conference standings and trends.',
    balanced: 'Conference breakdowns with standings, head-to-head records, and trend analysis.',
    bold:     'Map every conference. Spot every trend. The intel advantage starts here.',
  },
  oddsInsights: {
    clean:    'Live odds comparison and line tracking.',
    balanced: 'Compare live odds, track line movements, and find value opportunities.',
    bold:     'Lines shift fast. With live odds intel, you\'ll see the move before it happens.',
  },
  generalDemo: {
    clean:    'Scores, odds, and intel in one platform.',
    balanced: 'Real-time scores, odds, team intel, and betting signals — all in one place.',
    bold:     'One platform that does what three apps can\'t. Faster data. Smarter intel. Better decisions.',
  },
};

// ─── Beat bank: featureType → 3 sets of 3 beats ─────────────────

const B = {
  pinning: [
    ['One tap to pin', 'Live scores flow in', 'Your season, organized'],
    ['Pick your teams', 'Updates arrive instantly', 'Never miss a moment'],
    ['Build your watchlist', 'Real-time tracking', 'Everything, one place'],
  ],
  ats: [
    ['Spreads update live', 'Signals surface fast', 'Your edge, visualized'],
    ['Track every line', 'Spot the movement', 'Act on the signal'],
    ['Real-time ATS data', 'Cover trends revealed', 'Make sharper calls'],
  ],
  teamIntel: [
    ['Pull up any team', 'See the full profile', 'Deep analysis, fast'],
    ['Every roster detail', 'Matchup breakdowns', 'Trends at a glance'],
    ['Research any matchup', 'Stats that matter', 'Intel in seconds'],
  ],
  conferenceIntel: [
    ['Map the conference', 'See every trend', 'Full picture, instantly'],
    ['Standings breakdown', 'Head-to-head history', 'Trend spotting made easy'],
    ['Conference overview', 'Key matchups highlighted', 'Every angle covered'],
  ],
  oddsInsights: [
    ['Compare odds live', 'Lines shift in real time', 'Find the value'],
    ['Every odds source', 'Movement tracked', 'Your advantage'],
    ['Live odds dashboard', 'Line movement alerts', 'Smarter decisions'],
  ],
  generalDemo: [
    ['See the dashboard', 'Track any game', 'Get started instantly'],
    ['One platform', 'Every insight', 'Total coverage'],
    ['Real-time scores', 'Deep analytics', 'Your sports hub'],
  ],
};

// ─── Caption body fragments ──────────────────────────────────────

const CAPTION_BODIES = {
  pinning: 'Pin your teams. Get every score, update, and insight — automatically.',
  ats: 'Track ATS signals, spread movements, and cover trends in real time.',
  teamIntel: 'Full team profiles, matchup data, and trend analysis — all in one place.',
  conferenceIntel: 'Conference standings, head-to-head records, and trends. Fully mapped.',
  oddsInsights: 'Live odds comparison, line tracking, and value alerts. Updated constantly.',
  generalDemo: 'Scores, odds, team intel, and betting signals — one platform, total coverage.',
};

const CAPTION_CTAS = {
  website: 'Try it free → maximussports.ai',
  instagram: 'Follow for more → @maximussports.ai',
  explore: 'Explore → maximussports.ai',
  intel: 'Get intel → maximussports.ai',
  custom: 'maximussports.ai',
};

const CAPTION_TAGS = '#sports #sportsdata #sportsbetting #collegesports #sportsintel #analytics #basketball #football';

// ─── Auto-detect feature type from prompt context ────────────────

export function detectFeatureType(promptContext) {
  if (!promptContext) return 'generalDemo';
  const lower = promptContext.toLowerCase();
  const scored = Object.entries(FEATURE_TYPES).map(([id, ft]) => {
    const hits = ft.keywords.filter(kw => lower.includes(kw)).length;
    return { id, hits };
  });
  scored.sort((a, b) => b.hits - a.hits);
  return scored[0].hits > 0 ? scored[0].id : 'generalDemo';
}

// ─── Internal selection helpers ──────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function selectHeadline(featureType, hookStyle, messageAngle, copyIntensity) {
  const ft = featureType || 'generalDemo';
  const hs = hookStyle || 'product';
  const bank = H[ft]?.[hs] || H.generalDemo.product;

  const angle = MESSAGE_ANGLES[messageAngle];
  const idx = angle ? angle.preferredIndex : Math.floor(Math.random() * bank.length);
  let headline = bank[idx % bank.length];

  const intensity = COPY_INTENSITIES[copyIntensity];
  if (intensity && intensity.maxHeadlineWords < 6) {
    const shortest = [...bank].sort((a, b) => a.split(' ').length - b.split(' ').length)[0];
    if (shortest.split(' ').length <= intensity.maxHeadlineWords) {
      headline = shortest;
    }
  }

  return headline;
}

function selectSubhead(featureType, copyIntensity) {
  const ft = featureType || 'generalDemo';
  const ci = copyIntensity || 'balanced';
  return S[ft]?.[ci] || S.generalDemo.balanced;
}

function selectBeats(featureType) {
  const ft = featureType || 'generalDemo';
  const sets = B[ft] || B.generalDemo;
  return [...pick(sets)];
}

function selectCta(ctaDestination, copyIntensity) {
  const ct = CTA_TYPES[ctaDestination];
  if (!ct || ctaDestination === 'custom') return '';
  const ci = copyIntensity || 'balanced';
  const pool = ct.templates?.[ci] || ct.templates?.balanced || [];
  return pool.length > 0 ? pick(pool) : ct.defaultText || '';
}

// ─── Main generation: returns all fields ─────────────────────────

export function generateReelText(
  promptContext,
  ctaType = 'website',
  featureType = null,
  hookStyle = 'product',
  messageAngle = 'demo',
  copyIntensity = 'balanced',
) {
  const resolvedFeature = featureType || detectFeatureType(promptContext);
  const resolvedHook = hookStyle || 'product';

  const headline = selectHeadline(resolvedFeature, resolvedHook, messageAngle, copyIntensity);
  const subhead = selectSubhead(resolvedFeature, copyIntensity);
  const overlayBeats = selectBeats(resolvedFeature);
  const cta = selectCta(ctaType, copyIntensity);

  const combos = VARIANT_COMBOS[resolvedHook] || VARIANT_COMBOS.product;
  const variantHooks = combos.map((style, i) => ({
    id: style,
    tone: style,
    headline: selectHeadline(resolvedFeature, style, messageAngle, copyIntensity),
  }));

  return {
    headline,
    subhead,
    overlayBeats,
    cta,
    variantHooks,
    detectedFeatureType: resolvedFeature,
  };
}

// ─── Variant-specific generation ─────────────────────────────────

export function generateVariantText(
  promptContext,
  hookStyle = 'product',
  featureType = null,
  messageAngle = 'demo',
  copyIntensity = 'balanced',
) {
  const resolvedFeature = featureType || detectFeatureType(promptContext);
  const resolvedHook = hookStyle || 'product';

  const headline = selectHeadline(resolvedFeature, resolvedHook, messageAngle, copyIntensity);
  const subhead = selectSubhead(resolvedFeature, copyIntensity);
  const overlayBeats = selectBeats(resolvedFeature);

  return { headline, subhead, overlayBeats };
}

// ─── Caption generation ──────────────────────────────────────────

export function generateCaption(featureType, hookStyle, headline, ctaDestination = 'website') {
  const ft = featureType || 'generalDemo';
  const body = CAPTION_BODIES[ft] || CAPTION_BODIES.generalDemo;
  const cta = CAPTION_CTAS[ctaDestination] || CAPTION_CTAS.website;
  const hook = headline || 'Maximus Sports';

  return `${hook}\n\n${body}\n\nMaximus Sports — the sports intelligence platform built for serious fans and sharp bettors.\n\n${cta}\n\n${CAPTION_TAGS}`;
}
