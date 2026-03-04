/**
 * Caption generator for Maximus Sports Instagram carousels.
 * Pure function — no side effects, no fetches.
 * Never uses: lock / guarantee / free money / sure thing.
 */

const CTA = 'More intel at maximussports.ai 🤖';
const DISCLAIMER = 'For entertainment only. Please bet responsibly. 21+';

const BASE_TAGS = [
  '#CollegeBasketball', '#NCAABB', '#MarchMadness', '#CollegeHoops',
  '#MaximusSports', '#BettingAnalysis', '#SportsBetting', '#OddsInsights',
];

function fmtAsOf(asOf) {
  return asOf ? `📊 As of ${asOf}` : '';
}

// ─── Daily Briefing ────────────────────────────────────────────────────────────
function buildDailyCaption({ stats, picks, headlines, asOf }) {
  const gamesCount = stats?.gamesWithOdds ?? null;
  const picksCount = picks?.length ?? 0;

  const short = [
    `Today's college basketball intel is live. ${gamesCount != null ? `${gamesCount} games with active lines` : 'Lines are moving'} — our model has been running since tip-off.`,
    picks && picksCount > 0
      ? `The model identified ${picksCount} value lean${picksCount > 1 ? 's' : ''} for today. Swipe through for the full breakdown.`
      : 'No strong leans posted today — patience is the play.',
    `${CTA}`,
  ].filter(Boolean).join('\n\n');

  const long = [
    `📅 ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' })} — Daily Briefing`,
    '',
    gamesCount != null
      ? `We're tracking ${gamesCount} games with live odds today. The model cross-references ATS records, line movement, and market positioning to surface value edges.`
      : 'Lines are active for today\'s slate. The model is scanning for edges.',
    '',
    picks && picksCount > 0
      ? `Today's model found ${picksCount} qualified lean${picksCount > 1 ? 's' : ''}. Each pick uses ATS cover percentage, implied probability differentials, and home-court adjustments. No guarantees — just signal.`
      : 'No leans qualify today. The model sets thresholds for a reason — forcing picks hurts accuracy long-term.',
    '',
    headlines?.length
      ? `Top storyline: ${(headlines[0]?.title || headlines[0]?.headline || '').slice(0, 80)}`
      : null,
    '',
    fmtAsOf(asOf),
    CTA,
    DISCLAIMER,
  ].filter(l => l !== null).join('\n');

  const hashtags = [
    ...BASE_TAGS,
    '#DailyBriefing', '#CollegeHoopsToday', '#NCAAB',
  ];

  return { shortCaption: short, longCaption: long, hashtags };
}

// ─── Team Intel ────────────────────────────────────────────────────────────────
function buildTeamCaption({ team, rank, record, picks, atsRecord, asOf }) {
  const teamName = team?.displayName || team?.name || 'This team';
  const rankStr = rank != null ? ` (#${rank} AP)` : '';
  const recStr = record ? ` (${record})` : '';

  const short = [
    `${teamName}${rankStr}${recStr} intel pack is up. Swipe for ATS trends, today's line, and the model's lean.`,
    `${CTA}`,
  ].join('\n\n');

  const long = [
    `🏀 Team Intel: ${teamName}`,
    '',
    `${teamName}${rankStr} — here's what the model sees${recStr ? ' · Record: ' + recStr.replace(/[()]/g, '') : ''}.`,
    '',
    atsRecord
      ? `ATS signal: ${atsRecord}. Cover percentage matters — it's one of the most persistent edges in college basketball.`
      : 'ATS data is still loading for this squad.',
    '',
    picks?.length
      ? `Model lean detected: ${picks[0]?.pickLine}. This is based on ATS differential and implied probability — not a guarantee.`
      : 'No qualified lean for this team today.',
    '',
    fmtAsOf(asOf),
    CTA,
    DISCLAIMER,
  ].filter(Boolean).join('\n');

  const hashtags = [
    ...BASE_TAGS,
    '#TeamAnalysis',
    teamName.split(' ').map(w => `#${w}`).slice(0, 2).join(' '),
  ].flat().filter(Boolean);

  return { shortCaption: short, longCaption: long, hashtags: hashtags.slice(0, 15) };
}

// ─── Game Preview ──────────────────────────────────────────────────────────────
function buildGameCaption({ game, picks, asOf }) {
  const away = game?.awayTeam || 'Away';
  const home = game?.homeTeam || 'Home';
  const spread = game?.homeSpread ?? game?.spread ?? null;
  const spreadStr = spread != null
    ? (parseFloat(spread) > 0 ? `+${parseFloat(spread)}` : String(parseFloat(spread)))
    : null;

  const short = [
    `${away} @ ${home}${spreadStr ? ` · Spread: ${spreadStr}` : ''} — model preview is up.`,
    picks?.length
      ? `The model leans ${picks[0]?.pickLine}. Swipe for the full breakdown.`
      : 'No lean posted for this game today.',
    CTA,
  ].join('\n\n');

  const long = [
    `🏀 Game Preview: ${away} @ ${home}`,
    '',
    spreadStr
      ? `The line has ${home} at ${spreadStr}. ${Math.abs(parseFloat(spread)) <= 3.5 ? 'This is a pick-em-style matchup — expect tight coverage.' : Math.abs(parseFloat(spread)) >= 12 ? 'Heavy favorite situation. The model checks if the number is justified.' : 'Moderate spread — both sides have paths to cover.'}`
      : 'Line data is pending for this game.',
    '',
    picks?.length
      ? `Model identified a value edge: ${picks[0]?.pickLine} (${picks[0]?.type === 'ats' ? 'ATS' : 'ML'}). This is based on ATS differential and line movement analysis — not a guarantee.`
      : 'No qualified lean for this matchup today. Value threshold not met.',
    '',
    fmtAsOf(asOf),
    CTA,
    DISCLAIMER,
  ].filter(Boolean).join('\n');

  const hashtags = [
    ...BASE_TAGS,
    '#GamePreview',
    away.split(' ').map(w => `#${w}`).slice(-1).join(''),
    home.split(' ').map(w => `#${w}`).slice(-1).join(''),
  ].filter(Boolean).slice(0, 14);

  return { shortCaption: short, longCaption: long, hashtags };
}

// ─── Odds Insights ─────────────────────────────────────────────────────────────
function buildOddsCaption({ stats, atsLeaders, picks, asOf }) {
  const gamesCount = stats?.gamesWithOdds ?? null;
  const topTeam = atsLeaders?.best?.[0];

  const short = [
    `Today's odds snapshot is live.${gamesCount != null ? ` ${gamesCount} games tracked.` : ''} ATS leaders, value edges, and market positioning in this pack.`,
    CTA,
  ].join('\n\n');

  const long = [
    `📈 Odds Insights — Today's Market`,
    '',
    gamesCount != null
      ? `We're scanning ${gamesCount} games for value today. The model weighs spread, ATS history, and implied probability to find edges the market may be mispricing.`
      : 'Live odds are being tracked across today\'s slate.',
    '',
    topTeam
      ? `ATS leader spotlight: ${topTeam.team || topTeam.name} is running hot against the spread. The model factors this into lean calculations.`
      : null,
    '',
    picks?.length
      ? `${picks.length} lean${picks.length > 1 ? 's' : ''} posted today. Each one clears the model's confidence threshold — no noise picks.`
      : 'No leans cleared the model threshold today. That\'s by design.',
    '',
    fmtAsOf(asOf),
    CTA,
    DISCLAIMER,
  ].filter(Boolean).join('\n');

  const hashtags = [
    ...BASE_TAGS,
    '#OddsMovement', '#ATSRecord', '#ValueBet', '#LineMovement',
  ].slice(0, 14);

  return { shortCaption: short, longCaption: long, hashtags };
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Build caption for a carousel.
 * @param {{ template: 'daily'|'team'|'game'|'odds', team?, game?, picks?, stats?, atsLeaders?, headlines?, asOf? }} opts
 * @returns {{ shortCaption: string, longCaption: string, hashtags: string[] }}
 */
export function buildCaption({ template, team, game, picks, stats, atsLeaders, headlines, asOf } = {}) {
  switch (template) {
    case 'team':
      return buildTeamCaption({ team, rank: stats?.rank, record: stats?.record, picks, atsRecord: stats?.atsRecord, asOf });
    case 'game':
      return buildGameCaption({ game, picks, asOf });
    case 'odds':
      return buildOddsCaption({ stats, atsLeaders, picks, asOf });
    case 'daily':
    default:
      return buildDailyCaption({ stats, picks, headlines, asOf });
  }
}

/**
 * Format caption + hashtags into a plain-text file for download.
 */
export function formatCaptionFile({ shortCaption, longCaption, hashtags }) {
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
  ].join('\n');
}
