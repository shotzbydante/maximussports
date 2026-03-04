/**
 * Caption generator for Maximus Sports Instagram carousels.
 * Pure function — no side effects, no fetches.
 * Never uses: lock / guarantee / free money / sure thing.
 *
 * Viral-optimized: strong first-line hook, clear value lines, CTA.
 * Max 2 emojis per caption. Compliant language throughout.
 */

const CTA = 'Full analysis at maximussports.ai';
const DISCLAIMER = 'For entertainment only. Please bet responsibly. 21+';

const BASE_TAGS = [
  '#CollegeBasketball', '#NCAABB', '#CollegeHoops',
  '#MaximusSports', '#BettingAnalysis', '#SportsBetting',
];

function fmtDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  });
}

// ─── Daily Briefing ──────────────────────────────────────────────────────────

function buildDailyCaption({ stats, picks, headlines, asOf, styleMode }) {
  const gamesCount = stats?.gamesWithOdds ?? null;
  const picksCount = picks?.length ?? 0;
  const isRobot = styleMode === 'robot';

  // Hook: strong first line, different tone for robot mode
  const hook = isRobot
    ? `The model ran overnight. Here's what it found for ${fmtDate()}.`
    : (gamesCount != null
        ? `${gamesCount} games tracked. ${picksCount > 0 ? `${picksCount} value lean${picksCount > 1 ? 's' : ''} surfaced.` : 'No leans today.'} Daily briefing is live.`
        : 'Daily CBB briefing is live. Model ran overnight.');

  const pickLine = isRobot
    ? (picksCount > 0
        ? `Top lean I'm flagging: ${picks[0]?.pickLine}. Swipe for the reasoning.`
        : `Nothing cleared my threshold today. Patience is part of the edge.`)
    : (picksCount > 0
        ? `Top lean: ${picks[0]?.pickLine}. Swipe for the full card.`
        : 'No leans posted today — the threshold exists for a reason.');

  const ctaLine = isRobot
    ? `Swipe through for the full read → maximussports.ai`
    : `Swipe through. ${CTA}`;

  const short = [hook, pickLine, ctaLine].join('\n\n');

  const long = [
    `📅 ${fmtDate()} — Daily Briefing`,
    '',
    isRobot
      ? `Maximus processed ${gamesCount ?? 'today\'s'} games. Cross-referenced ATS history, line movement, and implied probability. Here's the signal:`
      : (gamesCount != null
          ? `Tracking ${gamesCount} games with active lines. The model cross-references ATS records, line movement, and implied probability to find edges.`
          : 'Lines are active for today\'s slate.'),
    '',
    picksCount > 0
      ? (isRobot
          ? `I flagged ${picksCount} qualified lean${picksCount > 1 ? 's' : ''}. Each one cleared ATS differential and implied probability thresholds — not noise, actual signal.`
          : `${picksCount} lean${picksCount > 1 ? 's' : ''} qualified today. Each uses ATS cover %, implied probability differentials, and home-court adjustments.`)
      : (isRobot
          ? `Nothing cleared my threshold today. No forced picks — that's how the model stays accurate over a full season.`
          : 'No leans qualify today. Forcing picks degrades accuracy long-term.'),
    '',
    headlines?.length
      ? `Top storyline: ${(headlines[0]?.title || headlines[0]?.headline || '').slice(0, 80)}`
      : null,
    '',
    asOf ? `Data as of ${asOf}` : null,
    CTA,
    DISCLAIMER,
  ].filter(l => l !== null).join('\n');

  const hashtags = [
    ...BASE_TAGS,
    '#DailyBriefing', '#CollegeHoopsToday', '#NCAAB', '#MarchMadness',
  ];

  return { shortCaption: short, longCaption: long, hashtags };
}

// ─── Team Intel ──────────────────────────────────────────────────────────────

function buildTeamCaption({ team, rank, record, picks, atsRecord, asOf }) {
  const teamName = team?.displayName || team?.name || 'This team';
  const rankStr = rank != null ? ` (#${rank})` : '';
  const recStr = record ? ` · ${record}` : '';

  const hook = `${teamName}${rankStr} intel pack — ATS trends, today's line, and the model lean.`;

  const short = [
    hook,
    picks?.length
      ? `Model leans ${picks[0]?.pickLine}. Swipe for the data behind it.`
      : 'No qualified lean today.',
    CTA,
  ].join('\n\n');

  const long = [
    `🏀 Team Intel: ${teamName}`,
    '',
    `${teamName}${rankStr}${recStr} — here's what the data shows.`,
    '',
    atsRecord
      ? `ATS signal: ${atsRecord}. Cover percentage is one of the most persistent edges in college basketball.`
      : 'ATS data loading for this squad.',
    '',
    picks?.length
      ? `Model lean: ${picks[0]?.pickLine}. Based on ATS differential and implied probability — not a guarantee.`
      : 'No qualified lean for this team today. Threshold not met.',
    '',
    asOf ? `Data as of ${asOf}` : null,
    CTA,
    DISCLAIMER,
  ].filter(Boolean).join('\n');

  const hashtags = [
    ...BASE_TAGS,
    '#TeamAnalysis',
    ...teamName.split(' ').map(w => `#${w}`).slice(0, 2),
  ].filter(Boolean).slice(0, 14);

  return { shortCaption: short, longCaption: long, hashtags };
}

// ─── Game Insights ───────────────────────────────────────────────────────────

function buildGameCaption({ game, picks, asOf }) {
  const away = game?.awayTeam || 'Away';
  const home = game?.homeTeam || 'Home';
  const spread = game?.homeSpread ?? game?.spread ?? null;
  const spreadNum = spread != null ? parseFloat(spread) : null;
  const spreadStr = spreadNum != null
    ? (spreadNum > 0 ? `+${spreadNum}` : String(spreadNum))
    : null;

  const hook = spreadStr
    ? `${away} @ ${home} · Spread: ${spreadStr}. Game preview and model read.`
    : `${away} @ ${home} — game preview is live.`;

  const short = [
    hook,
    picks?.length
      ? `Model leans ${picks[0]?.pickLine}. Swipe for the full breakdown.`
      : 'No lean posted for this matchup.',
    CTA,
  ].join('\n\n');

  const spreadContext = spreadNum != null
    ? (Math.abs(spreadNum) <= 3.5
        ? 'Tight spread — competitive cover battle.'
        : Math.abs(spreadNum) >= 12
          ? 'Heavy line. The model checks if this number is justified by ATS data.'
          : 'Mid-range spread — both sides have cover paths.')
    : 'Line data pending.';

  const long = [
    `🏀 Game Preview: ${away} @ ${home}`,
    '',
    spreadStr
      ? `${home} is ${spreadNum < 0 ? `favored at ${spreadStr}` : `an underdog at ${spreadStr}`}. ${spreadContext}`
      : 'Line data pending.',
    '',
    picks?.length
      ? `Model value edge: ${picks[0]?.pickLine} (${picks[0]?.type === 'ats' ? 'ATS' : 'ML'}). Based on ATS differential and implied probability — not a guarantee.`
      : 'No qualified lean for this matchup. Value threshold not met.',
    '',
    asOf ? `Data as of ${asOf}` : null,
    CTA,
    DISCLAIMER,
  ].filter(Boolean).join('\n');

  const hashtags = [
    ...BASE_TAGS,
    '#GamePreview',
    away.split(' ').slice(-1)[0] ? `#${away.split(' ').slice(-1)[0]}` : null,
    home.split(' ').slice(-1)[0] ? `#${home.split(' ').slice(-1)[0]}` : null,
  ].filter(Boolean).slice(0, 14);

  return { shortCaption: short, longCaption: long, hashtags };
}

// ─── Odds Insights ────────────────────────────────────────────────────────────

function buildOddsCaption({ stats, atsLeaders, picks, asOf }) {
  const gamesCount = stats?.gamesWithOdds ?? null;
  const topTeam = atsLeaders?.best?.[0];
  const picksCount = picks?.length ?? 0;

  const hook = picksCount > 0
    ? `The model surfaced ${picksCount} value lean${picksCount > 1 ? 's' : ''} today. Picks card is live.`
    : `Today's odds snapshot.${gamesCount != null ? ` ${gamesCount} games tracked.` : ''} ATS leaders and market data below.`;

  const short = [
    hook,
    picks?.length ? `Top lean: ${picks[0]?.pickLine}. Data-driven, risk-labeled.` : null,
    CTA,
  ].filter(Boolean).join('\n\n');

  const long = [
    `📈 Odds Insights`,
    '',
    gamesCount != null
      ? `Scanning ${gamesCount} games for market edges. Model weighs ATS history, spread, and implied probability.`
      : 'Live odds tracked across today\'s slate.',
    '',
    topTeam
      ? `ATS leader: ${topTeam.team || topTeam.name} — running hot. Factors into lean calculations.`
      : null,
    '',
    picksCount > 0
      ? `${picksCount} lean${picksCount > 1 ? 's' : ''} cleared the model threshold. Each is labeled by confidence — no noise picks.`
      : 'No leans cleared the threshold today. Discipline beats volume.',
    '',
    asOf ? `Data as of ${asOf}` : null,
    CTA,
    DISCLAIMER,
  ].filter(Boolean).join('\n');

  const hashtags = [
    ...BASE_TAGS,
    '#OddsInsights', '#ATSRecord', '#ValueBet', '#LineMovement', '#MarchMadness',
  ].slice(0, 14);

  return { shortCaption: short, longCaption: long, hashtags };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build caption for a carousel.
 * @param {{ template, team?, game?, picks?, stats?, atsLeaders?, headlines?, asOf?, styleMode? }} opts
 * @returns {{ shortCaption: string, longCaption: string, hashtags: string[] }}
 */
export function buildCaption({ template, team, game, picks, stats, atsLeaders, headlines, asOf, styleMode } = {}) {
  switch (template) {
    case 'team':
      return buildTeamCaption({ team, rank: stats?.rank, record: stats?.record, picks, atsRecord: stats?.atsRecord, asOf });
    case 'game':
      return buildGameCaption({ game, picks, asOf });
    case 'odds':
      return buildOddsCaption({ stats, atsLeaders, picks, asOf });
    case 'daily':
    default:
      return buildDailyCaption({ stats, picks, headlines, asOf, styleMode });
  }
}

/**
 * Format caption + hashtags into a plain-text file for download.
 * Includes posting meta notes (not shown in UI, only in ZIP).
 */
export function formatCaptionFile({ shortCaption, longCaption, hashtags }) {
  const postingMeta = [
    '',
    '─'.repeat(40),
    '',
    '=== POSTING NOTES ===',
    'Post as 4:5 carousel. Pin this post.',
    'Link in bio: maximussports.ai',
    'Suggested: First slide hooks. Last slide CTA. Post time: 11 AM – 1 PM or 7–9 PM ET.',
  ].join('\n');

  return [
    '=== SHORT CAPTION ===',
    '',
    shortCaption || '',
    '',
    `${(hashtags || []).join(' ')}`,
    '',
    '─'.repeat(40),
    '',
    '=== LONG CAPTION ===',
    '',
    longCaption || '',
    '',
    `${(hashtags || []).join(' ')}`,
    postingMeta,
  ].join('\n');
}
