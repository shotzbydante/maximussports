/**
 * Caption generator for Maximus Sports Instagram carousels.
 * Pure function — no side effects, no fetches.
 * Never uses: lock / guarantee / free money / sure thing.
 *
 * Viral-optimized: strong first-line hooks, scannable bullets, 1 emoji per template.
 * Compliant language: "leans", "value edge", "data-driven", "not advice".
 */

const CTA = 'Full analysis at maximussports.ai';
const DISCLAIMER = 'For entertainment only. Please bet responsibly. 21+';

function fmtDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  });
}

// ─── Daily Briefing ──────────────────────────────────────────────────────────

/**
 * Build an editorial-voice daily caption from the new digest structure.
 *
 * Short caption style (3 tight lines):
 *   Line 1 — top last-night highlight or lead narrative hook
 *   Line 2 — title race / market context or ATS edge
 *   Line 3 — voice line closer
 *
 * Example:
 *   "Florida sends a message with a 108-74 blowout.
 *    Michigan and Duke continue separating in the title market.
 *    And Alabama remains the quiet ATS monster of March."
 */
function buildDailyCaption({ stats, picks, headlines, asOf, styleMode, chatDigest }) {
  const gamesCount = stats?.gamesWithOdds ?? null;
  const isRobot    = styleMode === 'robot';

  const hasChatContent = chatDigest?.hasChatContent === true;
  const voiceLine      = hasChatContent ? (chatDigest.voiceLine || '') : '';

  // ── Build editorial short caption ─────────────────────────────────────────
  let editorialLines = [];

  if (hasChatContent) {
    // Line 1: top last-night highlight — punchy, strong lead verb
    const highlight = chatDigest.lastNightHighlights?.[0];
    if (highlight?.teamA && highlight?.score) {
      const scores = highlight.score.split('-').map(Number);
      const margin = scores.length === 2 ? Math.abs(scores[0] - scores[1]) : null;
      const verb = margin != null
        ? (margin >= 25 ? 'demolished' : margin >= 15 ? 'rolled' : margin >= 8 ? 'handled' : 'edged out')
        : 'beat';
      editorialLines.push(
        `${highlight.teamA} ${verb} ${highlight.teamB || 'the opposition'} ${highlight.score}.`
      );
    } else if (chatDigest.recapLeadLine) {
      editorialLines.push(chatDigest.recapLeadLine.slice(0, 120));
    } else if (chatDigest.leadNarrative) {
      const firstSentence = chatDigest.leadNarrative.split(/(?<=[.!?])\s+/)[0] || '';
      if (firstSentence.length >= 20) editorialLines.push(firstSentence.slice(0, 120));
    }

    // Line 2: title market or ATS edge — one sharp insight
    const topTitleEntry = chatDigest.titleRace?.[0];
    const topAtsEdge    = chatDigest.atsEdges?.[0];
    if (topTitleEntry?.team && topTitleEntry?.americanOdds) {
      const implStr = topTitleEntry.impliedProbability
        ? ` — ${topTitleEntry.impliedProbability}% implied`
        : '';
      editorialLines.push(
        `${topTitleEntry.team} has separated in the title market at ${topTitleEntry.americanOdds}${implStr}.`
      );
    } else if (topAtsEdge?.team) {
      const wlStr = topAtsEdge.wl ? ` (${topAtsEdge.wl})` : '';
      editorialLines.push(
        `${topAtsEdge.team} keeps cashing tickets at ${topAtsEdge.atsRate}%${wlStr}. The market still hasn't caught up.`
      );
    } else if (chatDigest.bettingAngle) {
      editorialLines.push(chatDigest.bettingAngle.slice(0, 120));
    }

    // Line 3: voice closer
    if (voiceLine) editorialLines.push(voiceLine);
  } else {
    // Non-chat fallback hook
    const picksCount = picks?.length ?? 0;
    editorialLines.push(
      isRobot
        ? `The model scanned the slate. Here's what it found.`
        : (picksCount > 0
            ? `${picksCount} value edge${picksCount > 1 ? 's' : ''} surfaced today. The briefing is live.`
            : `Daily CBB briefing is up.${gamesCount != null ? ` ${gamesCount} games on the radar.` : ''}`),
    );
  }

  const robotPrefix = isRobot ? '🤖 ' : '🏀 ';
  const shortLines  = editorialLines.filter(Boolean).slice(0, 3);
  const short = [
    robotPrefix + shortLines[0],
    ...shortLines.slice(1),
    CTA,
  ].filter(Boolean).join('\n\n');

  // ── Long caption ─────────────────────────────────────────────────────────
  const narrativeBody = hasChatContent && chatDigest.captionNarrative
    ? chatDigest.captionNarrative
    : (isRobot
        ? `Maximus scanned ${gamesCount ?? "today's"} games overnight. ATS history, line movement, implied probability — all cross-referenced.`
        : (gamesCount != null
            ? `Tracking ${gamesCount} games for today. The model flags ATS edges, spread value, and title market movement.`
            : `Lines are active. Model running the numbers now.`));

  // Sharp ATS edge line
  const topEdge = hasChatContent && chatDigest.atsEdges?.[0];
  const atsEdgeNote = topEdge
    ? (() => {
        const wlStr = topEdge.wl ? ` (${topEdge.wl})` : '';
        return `📊 ATS edge: ${topEdge.team} covering at ${topEdge.atsRate}%${wlStr} — ${topEdge.timeframe}.`;
      })()
    : null;

  // Top game to watch
  const topGame = hasChatContent && chatDigest.gamesToWatch?.[0];
  const gameNote = topGame
    ? `👀 Top game: ${topGame.matchup}${topGame.spread ? ` · Spread: ${topGame.spread}` : ''}${topGame.network ? ` · ${topGame.network}` : ''}.`
    : null;

  // Top headline when no chat
  const headlineSnip = !hasChatContent && headlines?.[0]
    ? `📰 ${(headlines[0].title || headlines[0].headline || '').slice(0, 85)}`
    : null;

  const long = [
    `🏀 ${fmtDate()} — Daily Briefing`,
    '',
    narrativeBody,
    '',
    atsEdgeNote,
    gameNote,
    '',
    headlineSnip,
    '',
    voiceLine ? `"${voiceLine}"` : null,
    '',
    asOf ? `Data as of ${asOf}` : null,
    CTA,
    DISCLAIMER,
  ].filter(l => l !== null && l !== '').join('\n');

  const hashtags = [
    '#CollegeBasketball', '#NCAABB', '#CollegeHoops',
    '#MaximusSports', '#DailyBriefing', '#SportsBetting',
    '#BettingAnalysis', '#NCAAB', '#MarchMadness',
  ];

  return { shortCaption: short, longCaption: long, hashtags };
}

// ─── Team Intel ──────────────────────────────────────────────────────────────

function buildTeamCaption({ team, rank, record, picks, atsRecord, conference, asOf }) {
  const teamName = team?.displayName || team?.name || 'This team';
  const rankStr = rank != null ? ` #${rank}` : '';
  const recStr = record ? ` · ${record}` : '';

  const hook = `🔥 ${teamName}${rankStr} intel — ATS trends, today's line, and the model lean.`;

  const pickBlock = picks?.length
    ? `Model leans ${picks[0]?.pickLine}. Swipe for context.`
    : `No qualified lean for this team today.`;

  const short = [hook, pickBlock, CTA].join('\n\n');

  const confNote = conference ? `${conference} · ` : '';

  const long = [
    `🔥 Team Intel: ${teamName}`,
    '',
    `${confNote}${teamName}${rankStr}${recStr}`,
    '',
    atsRecord
      ? `ATS signal: ${atsRecord}. Cover percentage is one of the most persistent edges in college basketball.`
      : `ATS data loading for this squad.`,
    '',
    picks?.length
      ? `Model lean: ${picks[0]?.pickLine}. Based on ATS differential + implied probability — not a guarantee.`
      : `No qualified lean today. Value threshold not met.`,
    '',
    asOf ? `Data as of ${asOf}` : null,
    CTA,
    DISCLAIMER,
  ].filter(Boolean).join('\n');

  const confTag = conference
    ? [`#${conference.replace(/[\s-]/g, '')}`]
    : [];

  const hashtags = [
    '#CollegeBasketball', '#CollegeHoops', '#NCAABB',
    '#MaximusSports', '#TeamAnalysis', '#SportsBetting',
    ...teamName.split(' ').map(w => `#${w}`).slice(0, 2),
    ...confTag,
  ].filter(Boolean).slice(0, 12);

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
    ? `👀 ${away} @ ${home} — spread: ${spreadStr}. Here's the model read.`
    : `👀 ${away} @ ${home} — game preview is live.`;

  const pickLine = picks?.length
    ? `Model leans ${picks[0]?.pickLine}. Swipe for the full breakdown.`
    : `No lean posted for this matchup.`;

  const short = [hook, pickLine, CTA].join('\n\n');

  const spreadContext = spreadNum != null
    ? (Math.abs(spreadNum) <= 3.5
        ? `Pick-em range — competitive cover battle.`
        : Math.abs(spreadNum) >= 12
          ? `Heavy line. Model checks if the number is justified by ATS data.`
          : `Mid-range spread — both sides have cover paths.`)
    : null;

  const long = [
    `👀 Game Preview: ${away} @ ${home}`,
    '',
    spreadStr
      ? `${home} is ${spreadNum < 0 ? `favored at ${spreadStr}` : `an underdog at ${spreadStr}`}. ${spreadContext || ''}`
      : `Line data pending.`,
    '',
    picks?.length
      ? `Value edge: ${picks[0]?.pickLine} (${picks[0]?.pickType === 'ats' ? 'ATS' : 'ML'}). ATS differential + implied probability analysis.`
      : `No qualified lean. Value threshold not met.`,
    '',
    asOf ? `Data as of ${asOf}` : null,
    CTA,
    DISCLAIMER,
  ].filter(Boolean).join('\n');

  const awayTag = away.split(' ').slice(-1)[0] ? `#${away.split(' ').slice(-1)[0]}` : null;
  const homeTag = home.split(' ').slice(-1)[0] ? `#${home.split(' ').slice(-1)[0]}` : null;

  const hashtags = [
    '#CollegeBasketball', '#NCAABB', '#CollegeHoops',
    '#MaximusSports', '#GamePreview', '#SportsBetting',
    '#BettingAnalysis', '#LineMovement',
    awayTag, homeTag,
  ].filter(Boolean).slice(0, 12);

  return { shortCaption: short, longCaption: long, hashtags };
}

// ─── Odds Insights ────────────────────────────────────────────────────────────

function buildOddsCaption({ stats, atsLeaders, picks, asOf }) {
  const gamesCount = stats?.gamesWithOdds ?? null;
  const topTeam = atsLeaders?.best?.[0];
  const picksCount = picks?.length ?? 0;

  const hook = picksCount > 0
    ? `📈 Picks card is live. ${picksCount} value lean${picksCount > 1 ? 's' : ''} surfaced today.`
    : `📈 Today's odds snapshot — ${gamesCount != null ? `${gamesCount} games tracked. ` : ''}ATS leaders and market edges below.`;

  const topPickLine = picks?.length
    ? `Top lean: ${picks[0]?.pickLine}. Data-driven, risk-labeled.`
    : null;

  const short = [hook, topPickLine, CTA].filter(Boolean).join('\n\n');

  const long = [
    `📈 Odds Insights`,
    '',
    gamesCount != null
      ? `Scanning ${gamesCount} games for market edges. Model weighs ATS history, spread, and implied probability.`
      : `Live odds tracked across today's slate.`,
    '',
    topTeam
      ? `ATS leader: ${topTeam.team || topTeam.name} — running hot against the spread.`
      : null,
    '',
    picksCount > 0
      ? `${picksCount} lean${picksCount > 1 ? 's' : ''} cleared the model threshold. Each is confidence-labeled — no noise picks.`
      : `No leans cleared the threshold today. Discipline beats volume.`,
    '',
    asOf ? `Data as of ${asOf}` : null,
    CTA,
    DISCLAIMER,
  ].filter(Boolean).join('\n');

  const hashtags = [
    '#CollegeBasketball', '#NCAABB', '#OddsInsights',
    '#MaximusSports', '#ATSRecord', '#ValueBet',
    '#SportsBetting', '#LineMovement', '#MarchMadness',
    '#BettingAnalysis',
  ].slice(0, 12);

  return { shortCaption: short, longCaption: long, hashtags };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build caption for a carousel.
 * @param {{ template, team?, game?, picks?, stats?, atsLeaders?, headlines?, asOf?, styleMode? }} opts
 * @returns {{ shortCaption: string, longCaption: string, hashtags: string[] }}
 */
export function buildCaption({
  template, team, game, picks, stats, atsLeaders,
  headlines, asOf, styleMode, chatDigest,
} = {}) {
  switch (template) {
    case 'team':
      return buildTeamCaption({
        team,
        rank: stats?.rank,
        record: stats?.record,
        picks,
        atsRecord: stats?.atsRecord,
        conference: team?.conference ?? null,
        asOf,
      });
    case 'game':
      return buildGameCaption({ game, picks, asOf });
    case 'odds':
      return buildOddsCaption({ stats, atsLeaders, picks, asOf });
    case 'daily':
    default:
      return buildDailyCaption({ stats, picks, headlines, asOf, styleMode, chatDigest });
  }
}

/**
 * Format caption + hashtags into a plain-text file for download.
 * Posting notes are included in the ZIP only (not shown in the UI).
 */
export function formatCaptionFile({ shortCaption, longCaption, hashtags }) {
  const postingMeta = [
    '',
    '─'.repeat(40),
    '',
    '=== POSTING NOTES ===',
    'Post as 4:5 carousel. Pin this post.',
    'Link in bio: maximussports.ai',
    'Best times: 11 AM – 1 PM or 7–9 PM ET.',
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
