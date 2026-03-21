/**
 * Caption generator for Maximus Sports Instagram carousels.
 * Pure function — no side effects, no fetches.
 * Never uses: lock / guarantee / free money / sure thing.
 *
 * Viral-optimized: strong first-line hooks, scannable bullets, 1 emoji per template.
 * Compliant language: "leans", "value edge", "data-driven", "not advice".
 */

import { getTeamEmoji } from '../../../utils/getTeamEmoji';
import { getConfidenceLabel, getMaximusTake } from '../../../utils/confidenceSystem';
import { TEAMS } from '../../../data/teams';
import { isPostSelection } from '../../../utils/tournamentHelpers';

// ─── Phrase Variation ─────────────────────────────────────────────────────────

function _hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function _pick(arr, seed) { return arr[_hash(seed || '') % arr.length]; }

const CAPTION_PHRASES = {
  hooks_atsHeater: [
    (n, e) => `Bettors riding ${n} have been printing. ${e}`,
    (n, e) => `${n} keeps covering and the market can\u2019t keep up. ${e}`,
    (n, e) => `The number on ${n} keeps moving for a reason. ${e}`,
    (n, e) => `${n}\u2019s ATS run is one of the best in the country right now. ${e}`,
  ],
  hooks_surging: [
    (n, e) => `${n} is rolling right now. ${e}`,
    (n, e) => `${n} is playing their best ball of the season. ${e}`,
    (n, e) => `${n}\u2019s form has been impossible to ignore. ${e}`,
  ],
  hooks_standard: [
    (n, e) => `${n} Team Intel is live. Full breakdown below. ${e}`,
    (n, e) => `Fresh intel on ${n}. Here\u2019s the full read. ${e}`,
    (n, e) => `Everything you need to know about ${n} right now. ${e}`,
  ],
  marketReads_atsHeater: [
    'The edge is real. The market is slowly catching up.',
    'Cover rate like this doesn\u2019t stay under the radar forever.',
    'Books are adjusting, but they\u2019re still behind.',
  ],
  marketReads_surging: [
    'Momentum teams can be the sharpest bets on the board.',
    'Timing and form matter. This team has both right now.',
    'The question is whether the number has caught up yet.',
  ],
};

const CTA = 'Full analysis at maximussports.ai';
const DISCLAIMER = 'For entertainment only. Please bet responsibly. 21+';

function fmtDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  });
}

// ─── Daily Briefing ──────────────────────────────────────────────────────────

/**
 * Build a viral-ready daily caption DIRECTLY from the Daily Intel digest.
 *
 * Synced with the Home Page Intelligence Briefing (source of truth).
 * Every fact, team, and narrative comes from the same underlying data.
 *
 * Format: 2–4 punchy paragraphs, sports media energy, tasteful emojis.
 * Tone: SportsCenter meets Morning Brew — confident, sharp, no filler.
 * Max 5 high-reach hashtags.
 */
function buildDailyCaption({ stats, picks, headlines, asOf, styleMode, chatDigest }) {
  const gamesCount = stats?.gamesWithOdds ?? null;
  const isRobot    = styleMode === 'robot';

  const hasChatContent = chatDigest?.hasChatContent === true;
  const voiceLine      = hasChatContent ? (chatDigest.voiceLine || '') : '';

  function resultVerb(score) {
    const parts = (score || '').split('-').map(Number);
    const margin = parts.length === 2 ? Math.abs(parts[0] - parts[1]) : null;
    if (margin == null) return 'beat';
    if (margin >= 25) return 'demolished';
    if (margin >= 15) return 'rolled past';
    if (margin >= 8) return 'handled';
    if (margin >= 4) return 'held off';
    return 'edged';
  }

  function teamE(name) {
    if (!name) return '';
    try {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      return getTeamEmoji(slug, name);
    } catch { return ''; }
  }

  // ── 1. Opening hook — MUST stop the scroll ────────────────────────────
  let hookLine = '';
  if (hasChatContent) {
    const highlights = chatDigest.lastNightHighlights ?? [];
    if (highlights.length >= 3) {
      hookLine = '\uD83D\uDD25 College hoops delivered last night. Here\u2019s the intel.';
    } else if (highlights.length >= 1) {
      const h = highlights[0];
      if (h.teamA && h.score) {
        const e = teamE(h.teamA);
        hookLine = `${e ? e + ' ' : ''}${h.teamA} ${resultVerb(h.score)} ${h.teamB || 'the opposition'}, ${h.score}. The board is shifting.`;
      } else {
        hookLine = chatDigest.recapLeadLine?.slice(0, 120) || '\uD83C\uDFC0 The title race is heating up. Daily intel is live.';
      }
    } else {
      hookLine = chatDigest.recapLeadLine?.slice(0, 120) || (isPostSelection()
        ? '\uD83C\uDFC6 March Madness intel just dropped.'
        : '\uD83C\uDFC0 The title race is heating up. Daily intel is live.');
    }
  } else {
    const picksCount = picks?.length ?? 0;
    const inTournament = isPostSelection();
    hookLine = isRobot
      ? (inTournament ? 'The model scanned the tournament bracket. Here\u2019s what it found. \uD83E\uDD16' : 'The model scanned the slate. Here\u2019s what it found. \uD83E\uDD16')
      : (picksCount > 0
          ? `${picksCount} ${inTournament ? 'tournament' : 'value'} edge${picksCount > 1 ? 's' : ''} surfaced today. ${inTournament ? '\uD83C\uDFC6' : '\uD83C\uDFC0'}`
          : (inTournament
            ? `\uD83C\uDFC6 March Madness Daily Briefing.${gamesCount != null ? ` ${gamesCount} tournament games today.` : ''}`
            : `\uD83C\uDFC0 Daily NCAAM briefing is live.${gamesCount != null ? ` ${gamesCount} games on the radar.` : ''}`));
  }

  // ── 2. Results recap — punchy one-liners from the intel ───────────────
  const recapLines = [];
  if (hasChatContent) {
    for (const h of (chatDigest.lastNightHighlights ?? []).slice(0, 3)) {
      if (!h.teamA) continue;
      const e = teamE(h.teamA);
      if (h.teamB && h.score) {
        recapLines.push(`${e ? e + ' ' : ''}${h.teamA} ${resultVerb(h.score)} ${h.teamB}, ${h.score}`);
      } else if (h.summaryLine) {
        recapLines.push(h.summaryLine);
      }
    }
  }

  // ── 3. Title board snapshot — from odds paragraph (¶2) ────────────────
  let titleLine = '';
  if (hasChatContent && chatDigest.titleRace?.length >= 2) {
    const top2 = chatDigest.titleRace.slice(0, 2);
    titleLine = `\uD83C\uDFC6 Title board: ${top2.map(t => `${t.team} (${t.americanOdds})`).join(', ')}`;
  } else if (hasChatContent && chatDigest.titleRace?.length === 1) {
    const leader = chatDigest.titleRace[0];
    titleLine = `\uD83C\uDFC6 ${leader.team} leads the title market at ${leader.americanOdds}`;
  }

  // ── 4. ATS edge — from spotlight paragraph (¶4) ──────────────────────
  let atsLine = '';
  if (hasChatContent && chatDigest.atsEdges?.length > 0) {
    const top = chatDigest.atsEdges[0];
    const e = teamE(top.team);
    const wl = top.wl ? ` (${top.wl})` : '';
    atsLine = `\uD83D\uDCCA ${e ? e + ' ' : ''}${top.team} cashing ATS at ${top.atsRate}%${wl}`;
  }

  // ── 5. Game tease — from today/tomorrow paragraph (¶3) ───────────────
  let teaseLine = '';
  if (hasChatContent && chatDigest.gamesToWatch?.length > 0) {
    const game = chatDigest.gamesToWatch[0];
    teaseLine = `\uD83D\uDC40 On the radar: ${game.matchup}${game.spread ? ` (${game.spread})` : ''}`;
  }

  // ── 6. Closer — editorial voice from the intel ────────────────────────
  const closerLine = voiceLine || '';

  // ── Assemble SHORT caption (compact, for IG post) ─────────────────────
  const shortParts = [hookLine];
  if (recapLines.length > 0) shortParts.push(recapLines.join('\n'));
  if (titleLine) shortParts.push(titleLine);
  if (atsLine) shortParts.push(atsLine);
  if (teaseLine) shortParts.push(teaseLine);
  shortParts.push('\uD83D\uDCF1 Full intel \u2192 maximussports.ai');
  const short = shortParts.join('\n\n');

  // ── Assemble LONG caption (detailed, for IG caption field) ────────────
  const longParts = [
    hookLine,
    '',
    recapLines.length > 0 ? recapLines.join('\n') : null,
    '',
    titleLine || null,
    '',
    atsLine || null,
    '',
    teaseLine || null,
    '',
    closerLine || null,
    '',
    '\uD83D\uDCF1 Full intelligence \u2192 maximussports.ai',
    '',
    asOf ? `Data as of ${asOf}` : null,
    DISCLAIMER,
  ].filter(l => l !== null && l !== undefined);

  const long = longParts
    .reduce((acc, line) => {
      if (line === '' && acc.length > 0 && acc[acc.length - 1] === '') return acc;
      return [...acc, line];
    }, [])
    .join('\n')
    .trim();

  // ── Hashtags: exactly 5, high-reach sports + March Madness ────────────
  const hashtags = [
    '#MarchMadness',
    '#CollegeBasketball',
    '#NCAAM',
    '#NCAAB',
    '#MaximusSports',
  ];

  return { shortCaption: short, longCaption: long, hashtags };
}

// ─── Team Intel ──────────────────────────────────────────────────────────────

/**
 * Build nuanced ATS signal copy from a record string like "17-13 (57%)".
 * Matches the contextual voice used in TeamIntelSlide2.
 */
function buildAtsSignalCopy(atsRecord) {
  if (!atsRecord) return null;
  const m = atsRecord.match(/(\d+)-(\d+)/);
  if (!m) return `ATS record: ${atsRecord}. Cover rate is one of the most persistent edges in college basketball.`;
  const w = parseInt(m[1], 10);
  const l = parseInt(m[2], 10);
  const pct = w / (w + l);
  const pctStr = Math.round(pct * 100);
  const rec = `${w}-${l} (${pctStr}%)`;

  if (pct >= 0.68) return `ATS signal: ${rec}. Market still hasn't fully caught up to this one.`;
  if (pct >= 0.60) return `ATS signal: ${rec}. Holding firm against the number — quiet consistent value.`;
  if (pct >= 0.54) return `ATS signal: ${rec}. Not a flashing edge, but the profile has been steady.`;
  if (pct >= 0.47) return `ATS signal: ${rec}. Pretty close to fairly priced right now — not much edge either way.`;
  if (pct >= 0.38) return `ATS signal: ${rec}. Cooling off against the number lately.`;
  return `ATS signal: ${rec}. Struggling ATS. The value may be on the other side.`;
}

function buildTeamCaption({ team, rank, record, picks, atsRecord, conference, asOf, slug, nextGame }) {
  const teamName = team?.displayName || team?.name || 'This team';
  const teamSlug = slug || team?.slug || null;
  const shortName = _shortName(teamName);
  const rankStr  = rank != null ? ` \u00b7 #${rank} AP` : '';
  const confStr  = conference ? ` \u00b7 ${conference}` : '';

  let mascotEmoji = '';
  try { mascotEmoji = getTeamEmoji(teamSlug, teamName); } catch { /* ignore */ }
  const sportEmoji = mascotEmoji || '\uD83C\uDFC0';

  const nextOpp     = nextGame?.opponent || '';
  const teamFrag    = teamName.toLowerCase().split(' ').pop() || '';
  const oppFrag     = nextOpp.toLowerCase().split(' ').pop() || '';

  let teamPick = (teamFrag && oppFrag)
    ? (picks?.find(p => {
        const ht = (p.homeTeam || '').toLowerCase();
        const at = (p.awayTeam || '').toLowerCase();
        return (ht.includes(teamFrag) || at.includes(teamFrag)) &&
               (ht.includes(oppFrag)  || at.includes(oppFrag));
      }) ?? null)
    : null;

  if (!teamPick && teamFrag) {
    teamPick = picks?.find(p => {
      const ht = (p.homeTeam || '').toLowerCase();
      const at = (p.awayTeam || '').toLowerCase();
      return ht.includes(teamFrag) || at.includes(teamFrag);
    }) ?? null;
  }

  function buildModelLeanCopy(pick) {
    if (!pick) {
      if (nextOpp) return `No qualified edge yet for the ${nextOpp} game. Value threshold not met.`;
      return `No qualified lean right now \u2014 value threshold not met.`;
    }
    const conf = getConfidenceLabel(pick.confidence);
    const confPhrase =
      conf === 'HIGH'   ? 'The model has a real lean here.' :
      conf === 'MEDIUM' ? 'Slight edge \u2014 worth watching.' :
                          'Early signal, low conviction.';
    const typeNote = pick.pickType === 'ats' ? 'ATS differential + implied probability' : 'Market value vs. model probability';
    return `Model lean: ${pick.pickLine}. ${confPhrase} Based on ${typeNote}.`;
  }

  const confConfText = conference ? ` out of the ${conference}` : '';
  const hook = `\uD83D\uDD25 Team Intel: ${teamName}${confConfText} ${sportEmoji}`;

  const atsCopy    = buildAtsSignalCopy(atsRecord);
  const picksCopy  = buildModelLeanCopy(teamPick);

  const short = [hook, atsCopy, picksCopy, CTA].filter(Boolean).join('\n\n');

  const isMarch = new Date().getMonth() === 2;
  let marchContext = null;
  if (isMarch && conference) {
    marchContext = _pick([
      `\uD83C\uDFC6 ${conference} tournament positioning on the line.`,
      `\uD83C\uDFC6 Every game carries bracket weight from here.`,
    ], teamSlug + 'march');
  }

  const engagementQ = _pick([
    `\uD83D\uDC47 What\u2019s your read on ${shortName}? Drop it below.`,
    `\uD83D\uDC47 Are you riding or fading ${shortName} right now?`,
    `\uD83D\uDC47 Would you back ${shortName} at this number?`,
  ], teamSlug + 'eng');

  const long = [
    `\uD83D\uDD25 Team Intel: ${teamName} ${sportEmoji}`,
    '',
    `${teamName}${rankStr}${confStr}${record ? ` \u00b7 ${record}` : ''}`,
    '',
    atsCopy || null,
    '',
    teamPick
      ? `\uD83C\uDFAF ${buildModelLeanCopy(teamPick)} Not financial advice.`
      : (nextOpp
          ? `No qualified lean for the ${nextOpp} game. Discipline beats volume.`
          : `No qualified lean today. Discipline beats volume.`),
    '',
    marchContext,
    '',
    nextOpp ? `\uD83D\uDC40 Next up: vs ${nextOpp}` : null,
    '',
    engagementQ,
    '',
    `Full intel + signals \u2192 maximussports.ai`,
    '',
    DISCLAIMER,
  ].filter(l => l !== null && l !== undefined)
   .reduce((acc, line) => {
     if (line === '' && acc.length > 0 && acc[acc.length - 1] === '') return acc;
     return [...acc, line];
   }, []).join('\n').trim();

  const hashtags = buildTeamHashtags({ teamName, conference, slug: teamSlug });

  return { shortCaption: short, longCaption: long, hashtags };
}

// ─── Tournament Insights ──────────────────────────────────────────────────────

function _teamEmoji(slug, name) {
  try { return getTeamEmoji(slug, name) || '🏀'; } catch { return '🏀'; }
}

function buildTournamentCaption({ tournamentInsights, asOf }) {
  const ti = tournamentInsights || {};
  const insights = ti.insights || [];
  const mode = ti.mode || 'tournament';
  const title = ti.title || '';
  const preset = ti.preset || null;

  if (mode === 'upset-radar') {
    return buildUpsetRadarCaption({ tournamentInsights: ti, asOf });
  }

  if (insights.length === 0) {
    return {
      shortCaption: '🏀 March Madness tournament intelligence is live.\n\nMore model picks + bracket intel at maximussports.ai\n\n#MarchMadness #NCAATournament #Bracketology #CollegeBasketball #MaximusSports',
      longCaption: '🏀 March Madness tournament intelligence is live.\n\nMore model picks + bracket intel at maximussports.ai\n\nFor entertainment only. Please bet responsibly. 21+\n\n#MarchMadness #NCAATournament #Bracketology #CollegeBasketball #MaximusSports',
      hashtags: ['#MarchMadness', '#NCAATournament', '#Bracketology', '#CollegeBasketball', '#MaximusSports'],
    };
  }

  const highConv = insights.filter(ins => ins.confidenceLabel === 'HIGH');
  const upsetPicks = insights.filter(ins => ins.isUpset);

  const strongestPick = [...insights].sort((a, b) => (b.winProbability ?? 0) - (a.winProbability ?? 0))[0] || null;
  const strongestSlug = strongestPick?.winner?.slug || '';
  const strongestName = strongestPick?.winner?.shortName || strongestPick?.winner?.name || '';
  const strongestEmoji = _teamEmoji(strongestSlug, strongestPick?.winner?.name);
  const strongestPct = strongestPick?.winProbability != null
    ? Math.round(strongestPick.winProbability * 100)
    : null;

  const pickLines = insights.slice(0, 4).map(ins => {
    const w = ins.winner;
    const l = ins.loser;
    const wName = w?.shortName || w?.name || '?';
    const lName = l?.shortName || l?.name || '?';
    const emoji = _teamEmoji(w?.slug, w?.name);
    const pct = ins.winProbability != null ? Math.round(ins.winProbability * 100) : null;
    const conf = ins.confidenceLabel || 'LOW';
    const pctStr = pct != null ? ` — ${pct}%` : '';
    return `${emoji} ${wName} over ${lName}${pctStr} (${conf})`;
  });

  let hook;
  if (preset === '1-seeds' || title.includes('No. 1')) {
    hook = '🔒 All four No. 1 seeds. The model ran every matchup. Here\u2019s the verdict 👇';
  } else if (preset === '8v9') {
    hook = '🪙 8 vs 9 — the ultimate coin-flip games. Who does the model like? 👇';
  } else if (preset && preset.match(/^\d+-seeds?$/)) {
    const seedNum = preset.match(/^(\d+)/)[1];
    hook = `🔒 #${seedNum} seed breakdown — the model scanned every matchup 👇`;
  } else if (title.includes('Region')) {
    const regionName = title.replace('\n', ' ').trim();
    hook = `🏀 ${regionName} breakdown — every first-round pick from the model 👇`;
  } else {
    hook = '🏀 Tournament picks just dropped. The model ran the board 👇';
  }

  let upsetNote = '';
  if (upsetPicks.length > 0) {
    const pick = upsetPicks[0];
    const upName = pick.winner?.shortName || pick.winner?.name || '?';
    const upSeed = pick.winner?.seed;
    const upEmoji = _teamEmoji(pick.winner?.slug, pick.winner?.name);
    upsetNote = upSeed
      ? `\n\n🚨 Upset pick: model backs #${upSeed} ${upEmoji} ${upName} as a lower-seed winner`
      : `\n\n🚨 Upset pick: model backs ${upEmoji} ${upName} as an underdog winner`;
  }

  // Surface championship profile signal for the strongest pick when relevant
  const strongestHeuristics = strongestPick?.heuristics?.championshipOverlay;
  const winnerOverlay = strongestPick?.winner === strongestPick?.heuristics?.championshipOverlay?.a
    ? strongestHeuristics?.a : strongestHeuristics?.b;
  const hasChampProfile = winnerOverlay?.championshipFlags?.includes('fullChampionshipProfile');

  let convLine = '';
  if (strongestPct != null && hasChampProfile) {
    convLine = `🔥 Strongest pick: ${strongestEmoji} ${strongestName} at ${strongestPct}% — title profile checks key boxes`;
  } else if (strongestPct != null) {
    convLine = `🔥 Strongest pick: ${strongestEmoji} ${strongestName} at ${strongestPct}% win probability`;
  }

  const short = [
    hook,
    '',
    pickLines.join('\n'),
    '',
    convLine,
    upsetNote,
    '',
    '📊 Full bracket intel at maximussports.ai',
    '',
    '#MarchMadness #NCAATournament #Bracketology #CollegeBasketball #MaximusSports',
  ].filter(l => l != null && l !== '').join('\n');

  const long = [
    hook,
    '',
    'Model picks:',
    pickLines.join('\n'),
    '',
    convLine,
    upsetNote,
    '',
    highConv.length > 1
      ? `📈 ${highConv.length} high-conviction picks on this slide. The model sees clear separation in these matchups.`
      : '📈 Each matchup ran through rankings, ATS form, title odds, and tournament history.',
    '',
    '👇 Who are you riding with? Drop your picks below.',
    '',
    'More model picks + bracket intel → maximussports.ai',
    '',
    asOf ? `Data as of ${asOf}` : null,
    DISCLAIMER,
    '',
    '#MarchMadness #NCAATournament #Bracketology #CollegeBasketball #MaximusSports',
  ].filter(l => l != null).join('\n');

  const hashtags = ['#MarchMadness', '#NCAATournament', '#Bracketology', '#CollegeBasketball', '#MaximusSports'];

  return { shortCaption: short, longCaption: long, hashtags };
}

function _buildUpsetGameLines(games) {
  return games.map((g, i) => {
    const pickTeam = g.modelResult?.winner || g.topTeam;
    const oppTeam = g.modelResult?.loser || g.bottomTeam;
    const pickName = pickTeam?.shortName || pickTeam?.name || '?';
    const oppName = oppTeam?.shortName || oppTeam?.name || '?';
    const pickEmoji = _teamEmoji(pickTeam?.slug, pickTeam?.name);
    const pickSeed = pickTeam === g.topTeam ? g.topSeed : g.bottomSeed;
    const oppSeed = oppTeam === g.topTeam ? g.topSeed : g.bottomSeed;
    const isUpset = g.modelResult?.isUpset ?? false;
    const pct = g.modelResult?.winProbability != null
      ? Math.round(g.modelResult.winProbability * 100)
      : null;
    const pctStr = pct != null ? ` (${pct}%)` : '';

    // Surface the single most relevant heuristic signal when it adds editorial value
    const refineFlags = g.matchupRefinements?.matchupFlags || g.modelResult?.heuristics?.matchupRefinements?.matchupFlags || [];
    let heuristicNote = '';
    if (refineFlags.includes('eightNineSmallFav')) {
      heuristicNote = ' ⚠️ 8-seeds in this spot have struggled';
    } else if (refineFlags.some(f => f.includes('overachiever'))) {
      heuristicNote = ' 📈 Overachiever profile gives this underdog life';
    }

    if (isUpset) {
      return `${i + 1}. 🚨 ${pickEmoji} #${pickSeed} ${pickName} upset over #${oppSeed} ${oppName}${pctStr}${heuristicNote}`;
    }
    const underdogPct = pct != null ? (100 - pct) : null;
    const underdogNote = underdogPct != null && underdogPct >= 35
      ? ` — #${oppSeed} ${oppName} has a ${underdogPct}% upset chance`
      : '';
    return `${i + 1}. 📊 ${pickEmoji} #${pickSeed} ${pickName} over #${oppSeed} ${oppName}${pctStr}${underdogNote}${heuristicNote}`;
  });
}

const UPSET_RADAR_DAY_HOOKS = {
  Thursday: [
    (n) => `🚨 THURSDAY DANGER ZONE: ${n} matchups the model flagged today 🏀`,
    (n) => `🚨 UPSET RADAR — THURSDAY: ${n} danger zone matchups to watch 🏀`,
  ],
  Friday: [
    (n) => `🚨 FRIDAY DANGER ZONE: ${n} matchups to keep your eye on today 🏀`,
    (n) => `🚨 UPSET RADAR — FRIDAY: ${n} matchups the model says could flip 🏀`,
  ],
  Saturday: [
    (n) => `🚨 SATURDAY DANGER ZONE: ${n} Round of 32 matchups on watch 🏀`,
    (n) => `🚨 UPSET RADAR — SATURDAY: The model sees chaos brewing in ${n} games 🏀`,
  ],
  Sunday: [
    (n) => `🚨 SUNDAY DANGER ZONE: ${n} Round of 32 matchups flagged for volatility 🏀`,
    (n) => `🚨 UPSET RADAR — SUNDAY: Can the chalk hold? ${n} matchups say no 🏀`,
  ],
};

function buildUpsetRadarCaption({ tournamentInsights, asOf }) {
  const upsetGames = tournamentInsights?.upsetGames || [];
  const dayCards = tournamentInsights?.dayCards || [];
  const slateDayLabel = tournamentInsights?.dayLabel || '';
  const slateRoundLabel = tournamentInsights?.roundLabel || '';

  if (upsetGames.length === 0 && dayCards.length === 0) {
    return {
      shortCaption: '🚨 Upset Radar is live for the tournament.\n\nSee the full board at maximussports.ai\n\n#UpsetAlert #MarchMadness #BracketBuster #NCAATournament #MaximusSports',
      longCaption: '🚨 Upset Radar is live.\n\nSee the full board at maximussports.ai\n\nFor entertainment only. Please bet responsibly. 21+\n\n#UpsetAlert #MarchMadness #BracketBuster #NCAATournament #MaximusSports',
      hashtags: ['#UpsetAlert', '#MarchMadness', '#BracketBuster', '#NCAATournament', '#MaximusSports'],
    };
  }

  if (dayCards.length > 1) {
    return buildMultiDayUpsetRadarCaptions({ dayCards, asOf });
  }

  const topGames = upsetGames.slice(0, 5);
  const gameLines = _buildUpsetGameLines(topGames);

  const trueUpsetPicks = topGames.filter(g => g.modelResult?.isUpset);
  const dangerZoneGames = topGames.filter(g => {
    const p = g.modelResult?.winProbability;
    return !g.modelResult?.isUpset && p != null && p < 0.60;
  });

  let hookDetail = `${topGames.length} games flagged for maximum volatility`;
  if (trueUpsetPicks.length > 0) {
    hookDetail = `${trueUpsetPicks.length} underdog upset pick${trueUpsetPicks.length > 1 ? 's' : ''} + ${dangerZoneGames.length} danger zone matchup${dangerZoneGames.length !== 1 ? 's' : ''}`;
  } else if (dangerZoneGames.length > 0) {
    hookDetail = `${dangerZoneGames.length} danger zone matchup${dangerZoneGames.length !== 1 ? 's' : ''} the model flagged`;
  }

  let hook;
  if (slateDayLabel) {
    const dayHooks = UPSET_RADAR_DAY_HOOKS[slateDayLabel] || [
      (n) => `🚨 UPSET RADAR — ${slateDayLabel.toUpperCase()}: ${n} games flagged 🏀`,
    ];
    hook = _pick(dayHooks, slateDayLabel + slateRoundLabel)(topGames.length);
  } else {
    hook = `🚨 UPSET RADAR: ${hookDetail} 🏀`;
  }

  const hasEightNineHeuristic = topGames.some(g =>
    (g.matchupRefinements?.matchupFlags || g.modelResult?.heuristics?.matchupRefinements?.matchupFlags || []).includes('eightNineSmallFav')
  );
  const hasOverachieverUnderdog = topGames.some(g =>
    (g.matchupRefinements?.matchupFlags || g.modelResult?.heuristics?.matchupRefinements?.matchupFlags || []).some(f => f.includes('overachiever'))
  );

  let volatilityNote = '⚠️ The 5/12 and 8/9 seed bands break brackets every year. Don\u2019t sleep on these.';
  if (dangerZoneGames.length >= 3) {
    volatilityNote = `⚠️ The model has spoken: ${dangerZoneGames.length} danger zone matchups under 60% — this is where brackets get busted.`;
  }
  if (hasEightNineHeuristic) {
    volatilityNote += '\n💡 Model sees danger: 8-seeds favored by small margins have struggled in this spot.';
  } else if (hasOverachieverUnderdog) {
    volatilityNote += '\n💡 Overachiever profile detected — at least one underdog is outperforming expectations.';
  }

  const short = [
    hook,
    '',
    gameLines.join('\n'),
    '',
    volatilityNote,
    '',
    'Full bracket intel → maximussports.ai',
    '',
    '#UpsetAlert #MarchMadness #BracketBuster #NCAATournament #MaximusSports',
  ].join('\n');

  const long = [
    hook,
    '',
    'Top danger zone matchups:',
    '',
    gameLines.join('\n'),
    '',
    volatilityNote,
    '',
    '📊 The Maximus model ran each matchup through rankings, ATS trends, title odds, and historical upset rates. The model has spoken.',
    '',
    '👇 Which underdog are you calling? Drop it below.',
    '',
    'Full bracket intel → maximussports.ai',
    '',
    asOf ? `Data as of ${asOf}` : null,
    DISCLAIMER,
    '',
    '#UpsetAlert #MarchMadness #BracketBuster #NCAATournament #MaximusSports',
  ].filter(l => l != null).join('\n');

  const hashtags = ['#UpsetAlert', '#MarchMadness', '#BracketBuster', '#NCAATournament', '#MaximusSports'];

  return { shortCaption: short, longCaption: long, hashtags };
}

function buildMultiDayUpsetRadarCaptions({ dayCards, asOf }) {
  const captions = dayCards.map((card) => {
    const { dayLabel, roundLabel, games = [] } = card;
    const topGames = games.slice(0, 5);
    const gameLines = _buildUpsetGameLines(topGames);

    const hookTemplates = UPSET_RADAR_DAY_HOOKS[dayLabel] || [
      (n) => `🚨 UPSET RADAR — ${dayLabel.toUpperCase()}: ${n} games flagged 🏀`,
    ];
    const hook = _pick(hookTemplates, dayLabel + roundLabel)(topGames.length);

    const trueUpsetPicks = topGames.filter(g => g.modelResult?.isUpset);
    const biggestUpset = topGames.find(g => g.modelResult?.isUpset);
    const biggestName = biggestUpset?.modelResult?.winner?.shortName || biggestUpset?.modelResult?.winner?.name;
    const biggestSeed = biggestUpset?.modelResult?.winner?.seed;

    let colorLine = '';
    if (trueUpsetPicks.length > 0 && biggestName) {
      colorLine = biggestSeed
        ? `The Maximus model has spoken: #${biggestSeed} ${biggestName} is a live upset spot. Don\u2019t sleep on it.`
        : `The Maximus model has spoken: ${biggestName} is a live upset spot. Don\u2019t sleep on it.`;
    } else if (topGames.length > 0) {
      colorLine = `The model flagged every game on this card as a danger zone matchup. Bracket busters live here.`;
    }

    const short = [
      hook,
      '',
      gameLines.join('\n'),
      '',
      colorLine ? `💡 ${colorLine}` : null,
      '',
      `Full ${roundLabel.toLowerCase()} intel → maximussports.ai`,
      '',
      '#UpsetAlert #MarchMadness #BracketBuster #NCAATournament #MaximusSports',
    ].filter(l => l != null).join('\n');

    const long = [
      hook,
      '',
      `${dayLabel} ${roundLabel} upset watch:`,
      '',
      gameLines.join('\n'),
      '',
      colorLine ? `💡 ${colorLine}` : null,
      '',
      '📊 Each matchup analyzed via rankings, ATS trends, title odds, and historical upset rates.',
      '',
      '👇 Which upset are you calling? Drop it below.',
      '',
      `Full bracket intel → maximussports.ai`,
      '',
      asOf ? `Data as of ${asOf}` : null,
      DISCLAIMER,
      '',
      '#UpsetAlert #MarchMadness #BracketBuster #NCAATournament #MaximusSports',
    ].filter(l => l != null).join('\n');

    return { dayLabel, roundLabel, shortCaption: short, longCaption: long };
  });

  const primary = captions[0] || {};
  return {
    shortCaption: primary.shortCaption || '',
    longCaption: primary.longCaption || '',
    hashtags: ['#UpsetAlert', '#MarchMadness', '#BracketBuster', '#NCAATournament', '#MaximusSports'],
    dayCaptions: captions,
  };
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
    '#CollegeBasketball', '#NCAABB',
    awayTag, homeTag,
    '#MaximusSports',
  ].filter(Boolean).slice(0, 5);

  return { shortCaption: short, longCaption: long, hashtags };
}

// ─── Maximus's Picks ──────────────────────────────────────────────────────────

const PICKS_HOOKS = [
  '\uD83D\uDEA8 MODEL SCAN COMPLETE \uD83D\uDEA8\nThe Maximus model just flagged a handful of edges across today\u2019s board.',
  '\uD83D\uDEA8 MODEL SCAN COMPLETE \uD83D\uDEA8\nThe model ran today\u2019s slate and surfaced some notable divergences from market pricing.',
  '\uD83D\uDEA8 MODEL SCAN COMPLETE \uD83D\uDEA8\nA handful of signals cleared the model threshold today. Here\u2019s the breakdown.',
  '\uD83D\uDEA8 MODEL SCAN COMPLETE \uD83D\uDEA8\nToday\u2019s board has some edges worth watching. Here\u2019s what the model found.',
  '\uD83D\uDEA8 MODEL SCAN COMPLETE \uD83D\uDEA8\nThe model scanned the full board. Several signals cleared the threshold.',
];

function _picksHookForDate() {
  const d = new Date();
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return PICKS_HOOKS[dayOfYear % PICKS_HOOKS.length];
}

function _emojiOrFallback(slug, name) {
  try {
    const e = getTeamEmoji(slug, name);
    return e || '\uD83C\uDFC0';
  } catch { return '\uD83C\uDFC0'; }
}

function buildPicksCaption({ stats, atsLeaders, picks, asOf }) {
  const all = picks ?? [];

  const byType = (t) => all.filter(p => p.pickType === t && p.itemType === 'lean');
  const atsList  = byType('ats');
  const valList  = byType('value');
  const totList  = byType('total');
  const peList   = byType('pickem');

  const signalCount = peList.length + atsList.length + valList.length + totList.length;

  function teamEmoji(pick) {
    if (!pick) return '\uD83C\uDFC0';
    const slug = pick.pickTeam === pick.homeTeam ? pick.homeSlug : pick.awaySlug;
    return _emojiOrFallback(slug, pick.pickTeam);
  }

  function totTeamEmoji(pick) {
    const e1 = _emojiOrFallback(pick.homeSlug, pick.homeTeam);
    const e2 = _emojiOrFallback(pick.awaySlug, pick.awayTeam);
    return e1 !== '\uD83C\uDFC0' ? e1 : e2;
  }

  function shortTeamName(fullName) {
    if (!fullName) return '';
    const parts = fullName.split(' ');
    return parts.length > 1 ? parts.slice(0, -1).join(' ') : fullName;
  }

  function fmtPickEmEntry(pick) {
    return `${teamEmoji(pick)} ${pick.pickTeam || pick.pickLine}`;
  }

  function fmtAtsEntry(pick) {
    const shortName = shortTeamName(pick.pickTeam);
    const spreadPart = pick.spread != null
      ? (pick.spread > 0 ? `+${pick.spread}` : String(pick.spread))
      : '';
    return `${teamEmoji(pick)} ${shortName} ${spreadPart}`.trim();
  }

  function fmtValueEntry(pick) {
    const shortName = shortTeamName(pick.pickTeam);
    return `${teamEmoji(pick)} ${shortName} ${pick.mlPriceLabel || ''}`.trim();
  }

  function fmtTotalEntry(pick) {
    const shortName = shortTeamName(pick.homeTeam);
    const dir = pick.leanDirection || 'OVER';
    return `${totTeamEmoji(pick)} ${shortName} ${dir} ${pick.lineValue || ''}`.trim();
  }

  // ── 1. Opening Hook ────────────────────────────────────────────────────────
  const hook = _picksHookForDate();

  // ── 2. Top Signal Section — highlight the single strongest pick ──────────
  const topSignalPick = all.find(p => p.isTopSignal && p.itemType === 'lean') ?? null;
  let topSignalSection = null;
  if (topSignalPick) {
    const pickLabel = topSignalPick.pickLine || topSignalPick.pickTeam || '';
    const tEmoji = topSignalPick.pickType === 'total'
      ? totTeamEmoji(topSignalPick)
      : teamEmoji(topSignalPick);
    const rationaleSnippet = topSignalPick.rationale
      ? topSignalPick.rationale.split('.').slice(0, 2).join('.') + '.'
      : null;
    topSignalSection = [
      `\uD83D\uDD25 Top Signal`,
      `${tEmoji} ${pickLabel}`,
      rationaleSnippet,
    ].filter(Boolean).join('\n');
  } else {
    const take = getMaximusTake(all);
    if (take?.pick) {
      const pickLabel = take.label || '';
      const rationaleSnippet = take.pick.rationale
        ? take.pick.rationale.split('.').slice(0, 2).join('.') + '.'
        : null;
      topSignalSection = [
        `\uD83D\uDD25 Top Signal`,
        pickLabel,
        rationaleSnippet,
      ].filter(Boolean).join('\n');
    }
  }

  // ── 3. Full Board Breakdown — category grouped ───────────────────────────
  const sections = [];
  if (peList.length > 0) sections.push(`Pick \u2019Ems\n${peList.map(fmtPickEmEntry).join('\n')}`);
  if (atsList.length > 0) sections.push(`Against the Spread\n${atsList.map(fmtAtsEntry).join('\n')}`);
  if (valList.length > 0) sections.push(`Value Leans\n${valList.map(fmtValueEntry).join('\n')}`);
  if (totList.length > 0) sections.push(`Game Totals\n${totList.map(fmtTotalEntry).join('\n')}`);

  // ── 4. Risk Framing ──────────────────────────────────────────────────────
  const riskLine = 'Not every signal carries the same conviction \u2014 discipline beats volume.';

  // ── 5. CTA ───────────────────────────────────────────────────────────────
  const ctaLine = 'Full board and model intel \u2192 maximussports.ai';

  // ── 6. Engagement prompt ─────────────────────────────────────────────────
  const engagementLine = 'Which signal are you riding tonight?';

  // ── Assemble caption ─────────────────────────────────────────────────────
  const caption = [
    hook,
    '',
    topSignalSection,
    '',
    ...sections.flatMap(s => [s, '']),
    riskLine,
    '',
    ctaLine,
    '',
    engagementLine,
    '',
    DISCLAIMER,
  ].filter(l => l !== null && l !== undefined)
   .reduce((acc, line) => {
     if (line === '' && acc.length > 0 && acc[acc.length - 1] === '') return acc;
     return [...acc, line];
   }, [])
   .join('\n')
   .trim();

  const hashtags = [
    '#CollegeBasketball',
    '#MarchMadness',
    '#NCAAB',
    '#SportsBetting',
    '#MaximusSports',
  ];

  return { shortCaption: caption, longCaption: caption, hashtags };
}

// ─── Odds Insights ────────────────────────────────────────────────────────────

function buildOddsCaption({ stats, atsLeaders, picks, asOf }) {
  const gamesCount = stats?.gamesWithOdds ?? null;
  const topTeam = atsLeaders?.best?.[0];
  const picksCount = picks?.length ?? 0;
  const leanPicks = (picks ?? []).filter(p => p.itemType === 'lean');

  const hook = picksCount > 0
    ? `Today\u2019s odds scan flagged ${picksCount} signal${picksCount > 1 ? 's' : ''} that cleared the model threshold.`
    : `Today\u2019s odds snapshot${gamesCount != null ? ` \u2014 ${gamesCount} games tracked` : ''}. ATS leaders and market structure below.`;

  const topLean = leanPicks[0];
  const topPickLine = topLean
    ? `Top signal: ${topLean.pickLine}${topLean.rationale ? `. ${topLean.rationale.split('.')[0]}.` : ''}`
    : null;

  const short = [hook, topPickLine, CTA].filter(Boolean).join('\n\n');

  const long = [
    `Odds Insights`,
    '',
    gamesCount != null
      ? `Scanning ${gamesCount} games for model-vs-market divergence. Factors: ATS history, spread magnitude, implied probability.`
      : `Live odds tracked across today\u2019s slate.`,
    '',
    topTeam
      ? `ATS leader: ${topTeam.team || topTeam.name} \u2014 the market may still be catching up to this cover rate.`
      : null,
    '',
    picksCount > 0
      ? `${picksCount} lean${picksCount > 1 ? 's' : ''} cleared the model threshold. Each is confidence-tiered based on edge magnitude, not team reputation.`
      : `No leans cleared the threshold today. When signals are weak, discipline means staying off the board.`,
    '',
    asOf ? `Data as of ${asOf}` : null,
    CTA,
    DISCLAIMER,
  ].filter(Boolean).join('\n');

  const hashtags = [
    '#CollegeBasketball', '#NCAAB', '#MarchMadness',
    '#MaximusSports', '#OddsInsights',
  ].slice(0, 5);

  return { shortCaption: short, longCaption: long, hashtags };
}

// ─── Team Intel Summary Caption (Slide 4 — Instagram Hero) ───────────────────

/**
 * Detect the primary storyline from team data — powers the hook and narrative.
 */
function detectStoryline({ ats, record, last5Wins, rank, nextOpp, spread }) {
  function parseRec(r) {
    if (!r) return null;
    if (typeof r === 'string') {
      const m = r.match(/(\d+)-(\d+)/); if (!m) return null;
      const w = parseInt(m[1], 10), l = parseInt(m[2], 10);
      return w + l === 0 ? null : { w, l, pct: w / (w + l) };
    }
    if (typeof r === 'object') {
      const w = parseInt(r.wins ?? r.w ?? 0, 10), l = parseInt(r.losses ?? r.l ?? 0, 10);
      return w + l === 0 ? null : { w, l, pct: w / (w + l) };
    }
    return null;
  }

  const l7P  = parseRec(ats?.last7);
  const l30P = parseRec(ats?.last30);
  const ssnP = parseRec(ats?.season);

  // Win/loss from record string
  const recM = (record || '').match(/(\d+)-(\d+)/);
  const totalW = recM ? parseInt(recM[1], 10) : null;
  const totalL = recM ? parseInt(recM[2], 10) : null;
  const isUndefeated = totalW != null && totalL === 0 && totalW >= 10;

  const trending = l7P && l30P
    ? (l7P.pct > l30P.pct + 0.08 ? 'up' : l7P.pct < l30P.pct - 0.08 ? 'down' : 'flat')
    : 'flat';

  const atsOnFire   = (l7P && l7P.pct >= 0.70) && (l30P && l30P.pct >= 0.62);
  const atsHeater   = (l7P && l7P.pct >= 0.64) || (l30P && l30P.pct >= 0.63);
  const marketBehind= (ssnP && ssnP.pct >= 0.60) || (l30P && l30P.pct >= 0.60);
  const isSurging   = (last5Wins ?? 0) >= 4;
  const isElite     = rank != null && rank <= 10;
  const isRanked    = rank != null && rank <= 25;
  const spreadNum   = spread != null ? parseFloat(spread) : null;
  const isUnderdog  = spreadNum != null && spreadNum > 3;

  if (isUndefeated) return { type: 'undefeated', trending, atsOnFire, atsHeater, l7P, l30P, ssnP, isUnderdog, isElite, isSurging };
  if (atsOnFire && trending === 'up') return { type: 'ats_accelerating', trending, atsOnFire, atsHeater, l7P, l30P, ssnP, isUnderdog, isElite, isSurging };
  if (isElite && atsHeater) return { type: 'elite_underpriced', trending, atsOnFire, atsHeater, l7P, l30P, ssnP, isUnderdog, isElite, isSurging };
  if (atsOnFire) return { type: 'ats_heater', trending, atsOnFire, atsHeater, l7P, l30P, ssnP, isUnderdog, isElite, isSurging };
  if (isSurging && marketBehind) return { type: 'surging', trending, atsOnFire, atsHeater, l7P, l30P, ssnP, isUnderdog, isElite, isSurging };
  if (isUnderdog && atsHeater) return { type: 'underdog_value', trending, atsOnFire, atsHeater, l7P, l30P, ssnP, isUnderdog, isElite, isSurging };
  if (atsHeater) return { type: 'ats_value', trending, atsOnFire, atsHeater, l7P, l30P, ssnP, isUnderdog, isElite, isSurging };
  if (isSurging) return { type: 'hot_streak', trending, atsOnFire, atsHeater, l7P, l30P, ssnP, isUnderdog, isElite, isSurging };
  if (isElite) return { type: 'elite_watch', trending, atsOnFire, atsHeater, l7P, l30P, ssnP, isUnderdog, isElite, isSurging };
  return { type: 'standard', trending, atsOnFire, atsHeater, l7P, l30P, ssnP, isUnderdog, isElite, isSurging };
}

/**
 * Build smart hashtags for a team — max 5, no #MaximusSports, team-aware.
 */
function buildTeamHashtags({ teamName, conference, slug }) {
  const tags = [];

  // Conference tag
  const confMap = {
    'Big Ten':       '#BigTen',
    'SEC':           '#SEC',
    'ACC':           '#ACC',
    'Big 12':        '#Big12',
    'Big East':      '#BigEast',
    'WCC':           '#WCC',
    'Mountain West': '#MountainWest',
    'AAC':           '#AAC',
    'A-10':          '#A10',
    'MVC':           '#MVC',
    'MAC':           '#MACtion',
    'CUSA':          '#CUSA',
    'Others':        null,
  };
  const confTag = confMap[conference] ?? null;

  // Team-specific tags derived from name words
  const nameWords = (teamName || '').split(' ').filter(w => w.length > 2);
  const school = nameWords[0] || '';
  const mascotWord = nameWords.slice(-1)[0] || '';

  // Known nickname/hashtag overrides
  const nickMap = {
    'michigan-wolverines': ['#Michigan', '#GoBlue'],
    'duke-blue-devils': ['#Duke', '#GoDuke'],
    'kentucky-wildcats': ['#Kentucky', '#BBN'],
    'north-carolina-tar-heels': ['#UNC', '#TarHeels'],
    'kansas-jayhawks': ['#KU', '#RockChalk'],
    'gonzaga-bulldogs': ['#Gonzaga', '#GoZags'],
    'saint-marys-gaels': ['#SaintMarys', '#Gaels'],
    'santa-clara-broncos': ['#SantaClara', '#Broncos'],
    'uconn-huskies': ['#UConn', '#Huskies'],
    'houston-cougars': ['#Houston', '#HTownTakeover'],
    'auburn-tigers': ['#Auburn', '#WarEagle'],
    'tennessee-volunteers': ['#Tennessee', '#Vols'],
    'florida-gators': ['#Florida', '#Gators'],
    'alabama-crimson-tide': ['#Alabama', '#RollTide'],
    'michigan-state-spartans': ['#MichiganState', '#Spartans'],
    'ohio-state-buckeyes': ['#OhioState', '#Buckeyes'],
    'villanova-wildcats': ['#Villanova', '#NovaNation'],
    'purdue-boilermakers': ['#Purdue', '#BoilerUp'],
    'iowa-hawkeyes': ['#Iowa', '#Hawkeyes'],
    'illinois-fighting-illini': ['#Illinois', '#Illini'],
    'miami-ohio-redhawks': ['#MiamiOH', '#RedHawks'],
    'lsu-tigers': ['#LSU', '#GeauxTigers'],
    'arkansas-razorbacks': ['#Arkansas', '#WPS'],
    'indiana-hoosiers': ['#Indiana', '#IU'],
    'iowa-state-cyclones': ['#IowaState', '#Cyclones'],
    'arizona-wildcats': ['#Arizona', '#BearDown'],
    'baylor-bears': ['#Baylor', '#SicEm'],
    'texas-longhorns': ['#Texas', '#HookEm'],
    'kansas-state-wildcats': ['#KState', '#Wildcats'],
    'tcu-horned-frogs': ['#TCU', '#GoFrogs'],
  };

  const teamTags = nickMap[slug] ?? [`#${school}`, `#${mascotWord}`].filter(t => t.length > 2);

  // Assemble: up to 2 team tags + conference + category
  const result = [
    ...teamTags.slice(0, 2),
    confTag,
    '#CollegeBasketball',
    '#SportsBetting',
  ].filter(Boolean);

  return [...new Set(result)].slice(0, 5);
}

/**
 * Core viral Instagram caption for the Team Intel Summary (Slide 4).
 *
 * Structure: Hook → Narrative → Data bullets → Market read →
 *            Next game → Lean → News → Engagement Q → CTA → Hashtags
 *
 * KEY: lean is scoped strictly to team + next opponent matchup.
 * Line status is derived from actual spread/ML data, never guessed.
 */
function buildTeamSummaryCaption({
  team, rank, record, ats, picks, conference, asOf, slug,
  nextGame, teamNews, last5Wins, totalGames,
}) {
  const teamName = team?.displayName || team?.name || 'This team';
  const teamSlug = slug || team?.slug || null;
  const shortName = _shortName(teamName);
  const seed = teamSlug || teamName;

  let mascotEmoji = '';
  try { mascotEmoji = getTeamEmoji(teamSlug, teamName); } catch { /* ignore */ }
  const sportEmoji = mascotEmoji || '\uD83C\uDFC0';

  const story = detectStoryline({ ats, record, last5Wins, rank, nextOpp: nextGame?.opponent, spread: nextGame?.spread });

  // ── Parse ATS records ──────────────────────────────────────────────────────
  function fmtRec(r) {
    if (!r) return null;
    if (typeof r === 'string') {
      const m = r.match(/(\d+)-(\d+)/); if (!m) return null;
      return `${m[1]}\u2013${m[2]}`;
    }
    if (typeof r === 'object') {
      const w = r.wins ?? r.w, l = r.losses ?? r.l;
      return (w != null && l != null) ? `${w}\u2013${l}` : null;
    }
    return null;
  }

  const atsL7  = fmtRec(ats?.last7);
  const atsL30 = fmtRec(ats?.last30);
  const atsSsn = fmtRec(ats?.season);

  const atsLine = atsL30
    ? `\u2022 ${atsL30} ATS last 30`
    : (atsSsn ? `\u2022 ${atsSsn} ATS this season` : null);

  const atsL7Line  = atsL7  ? `\u2022 ${atsL7} ATS last 7` : null;
  const atsSsnLine = atsL30 && atsSsn && atsSsn !== atsL30 ? `\u2022 ${atsSsn} ATS season` : null;

  // ── Hook — first line grabs instantly; phrase-varied per team ──────────────
  const isMarch = new Date().getMonth() === 2;
  const confNote = conference && conference !== 'Others' ? conference : null;

  function buildHook() {
    if (story.type === 'undefeated') return `Holy undefeated ${sportEmoji}\uD83D\uDD25`;
    if (story.type === 'ats_accelerating') return `The market still hasn\u2019t caught up to ${shortName}. ${sportEmoji}`;
    if (story.type === 'elite_underpriced') return `Quietly one of the hottest ATS teams in the country. ${sportEmoji}`;
    if (story.type === 'ats_heater') return _pick(CAPTION_PHRASES.hooks_atsHeater, seed)(shortName, '\uD83D\uDCCA');
    if (story.type === 'surging') return _pick(CAPTION_PHRASES.hooks_surging, seed)(shortName, sportEmoji);
    if (story.type === 'underdog_value') return `Underdog. Covering. Market still behind. \uD83D\uDCC8`;
    if (story.type === 'ats_value') return `The cover rate is real on ${shortName}. \uD83D\uDCCA`;
    if (story.type === 'hot_streak') return _pick(CAPTION_PHRASES.hooks_surging, seed + 'hot')(shortName, sportEmoji);
    if (story.type === 'elite_watch') return `${rank != null ? `#${rank} in the country` : 'Elite team'}. The intel is worth reading. ${sportEmoji}`;
    return _pick(CAPTION_PHRASES.hooks_standard, seed)(shortName, '\uD83C\uDFC0');
  }

  const hook = buildHook();

  // ── Headline narrative ────────────────────────────────────────────────────
  const rankStr  = rank != null ? ` (#${rank} AP)` : '';
  const confStr  = confNote ? ` \u00b7 ${confNote}` : '';
  const recordStr= record ? ` \u00b7 ${record}` : '';
  const teamLine = `${teamName}${rankStr}${confStr}${recordStr}`;

  const marchContext = isMarch && confNote
    ? `${confNote} tournament positioning is at stake.`
    : (isMarch ? 'The stretch run is here.' : '');

  const narratives = {
    undefeated: [teamName.toUpperCase() + ' IS STILL PERFECT' + recordStr + '.', '', 'Bettors who\u2019ve been riding them have been printing.'],
    ats_accelerating: [teamLine, '', `Cover rate is accelerating. That window closes fast.${marchContext ? ' ' + marchContext : ''}`],
    elite_underpriced: [teamLine, '', `Elite teams covering at this rate are usually underpriced.${marchContext ? ' ' + marchContext : ''}`],
    ats_heater: [teamLine, '', `One of the stronger ATS profiles in college basketball right now.${marchContext ? ' ' + marchContext : ''}`],
    surging: [teamLine, '', `${shortName} is on a run.${last5Wins != null ? ` Last 5: ${last5Wins}\u2013${5 - last5Wins} SU.` : ''} ${marchContext || 'The momentum is real.'}`],
    underdog_value: [teamLine, '', `Getting points and covering. Dangerous combination.${marchContext ? ' ' + marchContext : ''}`],
    ats_value: [teamLine, '', `Steady ATS profile. The cover rate has been consistent enough to notice.${marchContext ? ' ' + marchContext : ''}`],
    hot_streak: [teamLine, '', `Playing with confidence right now. Form matters this time of year.`],
    elite_watch: [teamLine, '', `Ranked team with a number worth watching.${marchContext ? ' ' + marchContext : ''}`],
    standard: [teamLine, '', `Full team intel package is live.${marchContext ? ' ' + marchContext : ''}`],
  };

  const narrative = narratives[story.type] || narratives.standard;

  // ── Data section ──────────────────────────────────────────────────────────
  const dataLines = [`\uD83D\uDCCA ${shortName} vs the number:`];
  if (atsLine)    dataLines.push(atsLine);
  if (atsL7Line)  dataLines.push(atsL7Line);
  if (atsSsnLine) dataLines.push(atsSsnLine);
  if (record)     dataLines.push(`\u2022 ${record} overall`);
  if (rank != null) dataLines.push(`\u2022 #${rank} AP ranking`);

  const trendNote = {
    up:   `\u2022 Market still adjusting \u2014 cover rate climbing`,
    down: `\u2022 Cooling off ATS \u2014 watch the line movement`,
    flat: null,
  }[story.trending] ?? null;
  if (trendNote) dataLines.push(trendNote);

  // ── Market interpretation (phrase-varied) ──────────────────────────────────
  function buildMarketRead() {
    if (story.type === 'undefeated') return 'That kind of run forces aggressive adjustments. The question is when they close the gap.';
    if (story.type === 'ats_accelerating') return 'Accelerating cover trend usually means the line hasn\u2019t fully adjusted. These windows close fast.';
    if (story.type === 'elite_underpriced') return 'Elite teams + strong ATS = the market is still behind. Until it isn\u2019t.';
    if (story.type === 'ats_heater') return _pick(CAPTION_PHRASES.marketReads_atsHeater, seed);
    if (story.type === 'surging') return _pick(CAPTION_PHRASES.marketReads_surging, seed);
    if (story.type === 'underdog_value') return 'Getting points and covering at this rate is the definition of a live dog. Watch this line.';
    if (story.type === 'ats_value') return 'Not a screaming edge, but consistent cover rate at this level is meaningful.';
    if (story.type === 'hot_streak') return 'Good form at the right time of year matters. This team has something right now.';
    if (story.type === 'elite_watch') return 'Ranked teams this deep in the season with strong form are worth tracking closely.';
    return 'Data is live. Model is running. Check the full intel for the complete read.';
  }

  const marketRead = buildMarketRead();

  // ── Next game context — accurate line status ──────────────────────────────
  let nextGameSection = null;
  if (nextGame?.opponent) {
    const hasSpread = nextGame.spread != null && nextGame.spread !== '';
    const hasML = nextGame.moneyline != null;
    const hasTotal = nextGame.total != null;

    let linePart = '';
    if (hasSpread) {
      const s = parseFloat(nextGame.spread);
      linePart = ` \u00b7 Spread: ${s > 0 ? '+' : ''}${s}`;
    } else if (hasML) {
      linePart = ` \u00b7 ML available`;
    }
    if (hasTotal) linePart += ` \u00b7 O/U ${nextGame.total}`;
    if (!hasSpread && !hasML && !hasTotal) linePart = '';

    nextGameSection = `\uD83D\uDC40 Next game: vs ${nextGame.opponent}${linePart}`;
  }

  // ── Team pick lean — STRICT scoping to actual next game ───────────────────
  let pickSection = null;
  if (picks?.length > 0 && nextGame?.opponent) {
    const teamFrag = teamName.toLowerCase().split(' ').pop() || '';
    const oppFrag  = nextGame.opponent.toLowerCase().split(' ').pop() || '';

    let matchedPick = null;
    if (teamFrag && oppFrag) {
      matchedPick = picks.find(p => {
        const ht = (p.homeTeam || '').toLowerCase();
        const at = (p.awayTeam || '').toLowerCase();
        return (ht.includes(teamFrag) || at.includes(teamFrag)) &&
               (ht.includes(oppFrag)  || at.includes(oppFrag));
      }) ?? null;
    }
    if (!matchedPick && teamFrag) {
      matchedPick = picks.find(p => {
        const ht = (p.homeTeam || '').toLowerCase();
        const at = (p.awayTeam || '').toLowerCase();
        return ht.includes(teamFrag) || at.includes(teamFrag);
      }) ?? null;
    }

    if (matchedPick) {
      const conf = getConfidenceLabel(matchedPick.confidence);
      const typeNote = matchedPick.pickType === 'ats' ? 'ATS' : 'ML';
      pickSection = `\uD83C\uDFAF Maximus lean: ${matchedPick.pickLine}\n${typeNote} \u00b7 ${conf} confidence \u00b7 not advice`;
    }
  }

  // ── News signals (cleaned) ────────────────────────────────────────────────
  let newsSection = null;
  const newsItems = (teamNews || []).slice(0, 2);
  if (newsItems.length > 0) {
    const newsLines = newsItems
      .map(n => {
        let s = (n.headline || n.title || '').slice(0, 80);
        s = s.replace(/\s*[-\u2013\u2014|]\s*(?:ESPN|CBS|Yahoo|Fox|NBC|AP|SI|The Athletic)[\s\w]*$/i, '');
        return `\u2022 ${s}`;
      })
      .filter(l => l.length > 3);
    if (newsLines.length > 0) {
      newsSection = `Latest buzz:\n${newsLines.join('\n')}`;
    }
  }

  // ── Engagement question — conversational, native IG tone ────────────────
  const engagementQs = {
    undefeated:        `\uD83D\uDC47 Still riding them ATS? Or is it time to fade the streak?`,
    ats_accelerating:  `\uD83D\uDC47 Is the market still behind on ${shortName}? Drop your take.`,
    elite_underpriced: `\uD83D\uDC47 Would you take ${shortName} at this number? Let us know.`,
    ats_heater:        `\uD83D\uDC47 Are you on this ATS run or waiting for it to cool?`,
    surging:           `\uD83D\uDC47 Fading or riding ${shortName} right now? What\u2019s your read?`,
    underdog_value:    `\uD83D\uDC47 Is the market sleeping on this team? Drop your take below.`,
    ats_value:         `\uD83D\uDC47 Is the value still there on ${shortName}? We want to hear it.`,
    hot_streak:        `\uD83D\uDC47 Hot hand or regression coming? What\u2019s your call?`,
    elite_watch:       `\uD83D\uDC47 Is this the team to beat heading into tournament play?`,
    standard:          `\uD83D\uDC47 What\u2019s your read on ${shortName} right now?`,
  };

  const engagementQ = engagementQs[story.type] || engagementQs.standard;

  // ── Conference context line — adds depth when relevant ─────────────────
  let confContextLine = null;
  if (confNote && isMarch) {
    confContextLine = _pick([
      `\uD83C\uDFC6 ${confNote} tournament positioning on the line. Every game matters.`,
      `\uD83C\uDFC6 The ${confNote} race is heating up heading into tournament play.`,
      `\uD83C\uDFC6 ${confNote} seeding battles are intensifying down the stretch.`,
    ], seed + 'confctx');
  }

  // ── Assemble full caption ─────────────────────────────────────────────────
  const blocks = [
    hook,
    '',
    ...narrative,
    '',
    dataLines.join('\n'),
    '',
    marketRead,
    '',
    confContextLine,
    '',
    nextGameSection,
    '',
    pickSection,
    '',
    newsSection,
    '',
    engagementQ,
    '',
    `Full intel + signals \u2192 maximussports.ai`,
    '',
    DISCLAIMER,
  ].filter(l => l !== null && l !== undefined);

  const longCaption = blocks
    .reduce((acc, line) => {
      if (line === '' && acc[acc.length - 1] === '') return acc;
      return [...acc, line];
    }, [])
    .join('\n')
    .trim();

  const shortLines = [
    hook,
    atsLine ? `\n${atsLine.replace('\u2022 ', '')}` : '',
    nextGameSection ? `\n${nextGameSection}` : '',
    `\n\n${CTA}`,
  ].filter(Boolean);

  const shortCaption = shortLines.join('').trim();
  const hashtags = buildTeamHashtags({ teamName, conference, slug: teamSlug });

  return { shortCaption, longCaption, hashtags };
}

// ─── Conference Intel Caption ─────────────────────────────────────────────────

const _MULTI_WORD_MASCOTS = new Set([
  'wolf pack', 'red raiders', 'blue devils', 'tar heels', 'red storm',
  'golden eagles', 'sun devils', 'golden hurricane', 'fighting illini',
  'crimson tide', 'golden bears', 'demon deacons', 'horned frogs',
  'red hawks', 'blue jays', 'mean green', 'black bears',
]);

function _shortName(fullName) {
  if (!fullName) return '';
  const lower = fullName.toLowerCase();
  for (const mascot of _MULTI_WORD_MASCOTS) {
    if (lower.endsWith(mascot)) {
      return fullName.slice(0, fullName.length - mascot.length).trim();
    }
  }
  const parts = fullName.split(' ');
  return parts.length > 1 ? parts.slice(0, -1).join(' ') : fullName;
}

function buildConferenceCaption({ conference, atsLeaders, asOf }) {
  if (!conference) return { shortCaption: '', longCaption: '', hashtags: [] };

  const confName = conference;
  const isMarch = new Date().getMonth() === 2;
  const seed = confName;

  const confTeams = TEAMS.filter(t => t.conference === confName);
  const lockTeams = confTeams.filter(t => t.oddsTier === 'Lock');
  const shouldBeIn = confTeams.filter(t => t.oddsTier === 'Should be in');
  const contenders = [...lockTeams, ...shouldBeIn];
  const longShots = confTeams.filter(t => t.oddsTier === 'Long shot');
  const isPower = lockTeams.length >= 4;
  const isMid = lockTeams.length <= 1 && confTeams.length <= 6;

  const confSlugs = new Set(confTeams.map(t => t.slug));
  const confBest = (atsLeaders?.best ?? []).filter(r => confSlugs.has(r.slug));

  const topNames = lockTeams.slice(0, 3).map(t => _shortName(t.name));
  const allTeamNames = confTeams.slice(0, 6).map(t => _shortName(t.name));
  const atsTopName = confBest.length > 0 ? _shortName(confBest[0].name || confBest[0].slug || '') : null;
  const atsTopRec = confBest.length > 0 ? (confBest[0].rec || confBest[0].last30 || confBest[0].season) : null;
  const atsTopPct = atsTopRec ? Math.round((atsTopRec.w / (atsTopRec.w + atsTopRec.l)) * 100) : null;

  // Team emojis for the featured list
  function _teamEmoji(slug, name) {
    try { return getTeamEmoji(slug, name); } catch { return '\uD83C\uDFC0'; }
  }

  // ── Hook — first line must grab attention on mobile ──
  let hookPool;
  if (isPower) {
    hookPool = [
      `\uD83C\uDFC0 ${confName} Intel: Don\u2019t look away from this conference.`,
      `\uD83C\uDFC0 ${confName} Intel: This conference is stacked and the race is heating up.`,
      `\uD83C\uDFC0 ${confName} Intel: ${topNames.slice(0, 2).join(' and ')} lead a loaded field.`,
    ];
  } else if (isMid) {
    hookPool = [
      `\uD83C\uDFC0 ${confName} Intel: Don\u2019t sleep on this conference.`,
      `\uD83C\uDFC0 ${confName} Intel: Small conference. Big March chaos potential.`,
      `\uD83C\uDFC0 ${confName} Intel: The numbers are telling an interesting story.`,
    ];
  } else {
    hookPool = [
      `\uD83C\uDFC0 ${confName} Intel: Here\u2019s what the data says right now.`,
      `\uD83C\uDFC0 ${confName} Intel: The conference picture is evolving fast.`,
      `\uD83C\uDFC0 ${confName} Intel: Key teams, ATS trends, and tournament angles.`,
    ];
  }
  const hook = _pick(hookPool, seed);

  // ── Framing paragraph — sets the conference story ──
  let framingPool;
  if (isPower) {
    framingPool = [
      `While everyone\u2019s watching the headline matchups, the ${confName} is quietly producing some of the best tournament-ready teams in the country.`,
      `The ${confName} race is tightening fast. Multiple teams with legitimate March positioning are fighting for seeding and momentum.`,
      `Depth and talent define the ${confName} this season. ${contenders.length} teams with real tournament credentials.`,
    ];
  } else if (isMid) {
    framingPool = [
      `While the power leagues grab headlines, the ${confName} is quietly shaping up as a March spoiler factory.`,
      `Sharp bettors know: the ${confName} has more value than the casual market gives it credit for.`,
      `Small-conference intel that smart money is watching closely right now.`,
    ];
  } else {
    framingPool = [
      `The ${confName} has ${contenders.length} teams positioned for the tournament conversation. Here\u2019s the breakdown.`,
      `The ${confName} is in the spotlight. ${topNames.length > 0 ? topNames[0] + ' leads the charge, but ' : ''}the picture is evolving.`,
      `Full ${confName} breakdown: positioning, ATS trends, and what the market is saying.`,
    ];
  }
  const framing = _pick(framingPool, seed + 'frame');

  // ── Trend callouts ──
  const trendLines = [];

  if (topNames.length > 0) {
    trendLines.push(`\uD83D\uDD25 ${topNames[0]} currently sits as the projected conference contender${topNames.length > 1 ? `, with ${topNames.slice(1).join(' and ')} close behind` : ''}.`);
  }

  if (isMarch) {
    trendLines.push(_pick([
      `\uD83D\uDCC8 Tournament pressure is rising\nThe ${confName} race is tightening fast, and positioning for the conference tournament could decide who makes the bracket.`,
      `\uD83D\uDCC8 Selection Sunday looming\n${confName} seeding battles are intensifying. Every game from here carries bracket weight.`,
      `\uD83D\uDCC8 March pressure building\nBubble teams are running out of runway. The next few games will shape the field.`,
    ], seed + 'march'));
  }

  if (atsTopName && atsTopPct) {
    trendLines.push(`\uD83C\uDFAF ATS spotlight: ${atsTopName} covering at ${atsTopPct}% \u2014 the market still hasn\u2019t fully adjusted.`);
  }

  if (longShots.length >= 2) {
    trendLines.push(_pick([
      `\uD83D\uDC40 Long-shot value watch\nSmart money is starting to circle a couple ${confName} teams that could turn into bracket busters.`,
      `\uD83D\uDC40 Sleeper alert\n${_shortName(longShots[0].name)} and ${_shortName(longShots[1].name)} are worth monitoring for tournament value.`,
    ], seed + 'longshot'));
  }

  // ── Featured teams list with emojis ──
  const teamListLines = [];
  if (allTeamNames.length > 0) {
    teamListLines.push('Teams flashing signals right now:');
    for (const t of confTeams.slice(0, 6)) {
      const emoji = _teamEmoji(t.slug, t.name);
      teamListLines.push(`${emoji} ${_shortName(t.name)}`);
    }
  }

  // ── Engagement question ──
  const engagementQ = _pick([
    `\uD83D\uDC47 Question for college hoops fans:\nWhich ${confName} team do you trust most to make noise in the tournament?`,
    `\uD83D\uDC47 Drop your take:\nWho\u2019s the ${confName} team to beat heading into March?`,
    `\uD83D\uDC47 We want your read:\nIs the ${confName} getting the respect it deserves from the market?`,
    `\uD83D\uDC47 Your turn:\nBest ${confName} bet right now? Let us know below.`,
  ], seed + 'eng');

  // ── Assemble long caption ──
  const longCaption = [
    hook,
    '',
    framing,
    '',
    ...trendLines.slice(0, 3),
    '',
    teamListLines.length > 0 ? teamListLines.join('\n') : null,
    '',
    isPower ? 'Deep conference. Real March contenders.' : (isMid ? 'Small conference. Big March chaos potential.' : 'The race is on.'),
    '',
    engagementQ,
    '',
    `More conference intel + market signals \u2192 maximussports.ai`,
    '',
    DISCLAIMER,
  ].filter(l => l !== null && l !== undefined)
   .reduce((acc, line) => {
     if (line === '' && acc.length > 0 && acc[acc.length - 1] === '') return acc;
     return [...acc, line];
   }, []).join('\n').trim();

  const shortCaption = [
    hook,
    framing,
    trendLines[0] || '',
    `\n${CTA}`,
  ].filter(Boolean).join('\n\n').trim();

  const confTagMap = {
    'Big Ten': '#BigTen', 'SEC': '#SEC', 'ACC': '#ACC', 'Big 12': '#Big12',
    'Big East': '#BigEast', 'WCC': '#WCC', 'Mountain West': '#MountainWest',
    'AAC': '#AAC', 'A-10': '#A10', 'MVC': '#MVC', 'MAC': '#MACtion', 'CUSA': '#CUSA',
  };
  const confTag = confTagMap[confName] ?? null;
  const hashtags = [
    '#CollegeBasketball', '#MarchMadness', confTag, '#NCAAM', '#MaximusSports',
  ].filter(Boolean).slice(0, 5);

  return { shortCaption, longCaption, hashtags };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build caption for a carousel.
 * @param {{ template, team?, game?, picks?, stats?, atsLeaders?, headlines?, asOf?, styleMode? }} opts
 * @returns {{ shortCaption: string, longCaption: string, hashtags: string[] }}
 */
export function buildCaption({
  template, team, game, picks, stats, atsLeaders,
  headlines, asOf, styleMode, chatDigest, nextGame,
  teamNews, ats, conference, tournamentInsights,
} = {}) {
  // Tournament-aware captions when tournament data is present
  if (template === 'game' && tournamentInsights?.insights?.length > 0) {
    return buildTournamentCaption({ tournamentInsights, asOf });
  }
  if (template === 'game' && tournamentInsights?.mode === 'upset-radar') {
    return buildUpsetRadarCaption({ tournamentInsights, asOf });
  }

  switch (template) {
    case 'conference':
      return buildConferenceCaption({
        conference: conference ?? null,
        atsLeaders: atsLeaders ?? { best: [], worst: [] },
        asOf,
      });
    case 'team-summary':
      return buildTeamSummaryCaption({
        team,
        rank:       stats?.rank,
        record:     stats?.record,
        ats:        ats ?? {},
        picks,
        conference: team?.conference ?? null,
        slug:       team?.slug ?? null,
        asOf,
        nextGame:   nextGame ?? null,
        teamNews:   teamNews ?? [],
        last5Wins:  stats?.last5Wins ?? null,
        totalGames: stats?.totalGames ?? null,
      });
    case 'team':
      return buildTeamCaption({
        team,
        rank:       stats?.rank,
        record:     stats?.record,
        picks,
        atsRecord:  stats?.atsRecord,
        conference: team?.conference ?? null,
        slug:       team?.slug ?? null,
        asOf,
        nextGame:   nextGame ?? null,
      });
    case 'game':
      return buildGameCaption({ game, picks, asOf });
    case 'picks':
      return buildPicksCaption({ stats, atsLeaders, picks, asOf });
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
