/**
 * Caption generator for Maximus Sports Instagram carousels.
 * Pure function — no side effects, no fetches.
 * Never uses: lock / guarantee / free money / sure thing.
 *
 * Viral-optimized: strong first-line hooks, scannable bullets, 1 emoji per template.
 * Compliant language: "leans", "value edge", "data-driven", "not advice".
 */

import { getTeamEmoji } from '../../../utils/getTeamEmoji';
import { confidenceLabel } from '../../../utils/maximusPicksModel';
import { TEAMS } from '../../../data/teams';

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
 * Build an editorial-voice daily caption from the digest structure.
 *
 * Target tone: confident, fun, sharp, sports-betting aware.
 * Action Network meets Morning Brew — punchy, no filler.
 * Max 5 hashtags.
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

  // ── 1. Opening hook — first line must grab attention ───────────────────
  let hookLine = '';
  if (hasChatContent) {
    const highlights = chatDigest.lastNightHighlights ?? [];
    if (highlights.length >= 3) {
      hookLine = 'Daily Briefing: college hoops delivered another wild night. 🔥';
    } else if (highlights.length >= 1) {
      const h = highlights[0];
      if (h.teamA && h.score) {
        const e = teamE(h.teamA);
        hookLine = `Daily Briefing: ${e ? e + ' ' : ''}${h.teamA} ${resultVerb(h.score)} ${h.teamB || 'the opposition'} ${h.score}.`;
      } else {
        hookLine = chatDigest.recapLeadLine?.slice(0, 120) || 'Daily Briefing: the title race is heating up.';
      }
    } else {
      hookLine = chatDigest.recapLeadLine?.slice(0, 120) || 'Daily Briefing: the title race is heating up.';
    }
  } else {
    const picksCount = picks?.length ?? 0;
    hookLine = isRobot
      ? 'The model scanned the slate. Here\u2019s what it found. \uD83E\uDD16'
      : (picksCount > 0
          ? `${picksCount} value edge${picksCount > 1 ? 's' : ''} surfaced today. \uD83C\uDFC0`
          : `Daily CBB briefing is up.\uD83C\uDFC0${gamesCount != null ? ` ${gamesCount} games on the radar.` : ''}`);
  }

  // ── 2. Recap of major results — punchy one-liners ─────────────────────
  const recapLines = [];
  if (hasChatContent) {
    for (const h of (chatDigest.lastNightHighlights ?? []).slice(0, 3)) {
      if (!h.teamA) continue;
      const e = teamE(h.teamA);
      if (h.teamB && h.score) {
        recapLines.push(`${e ? e + ' ' : ''}${h.teamA} ${resultVerb(h.score)} ${h.teamB} ${h.score}.`);
      } else if (h.summaryLine) {
        recapLines.push(h.summaryLine);
      }
    }
  }

  // ── 3. ATS edge callout ───────────────────────────────────────────────
  let atsLine = '';
  if (hasChatContent && chatDigest.atsEdges?.length > 0) {
    const top = chatDigest.atsEdges[0];
    const e = teamE(top.team);
    const wl = top.wl ? ` (${top.wl})` : '';
    atsLine = `${e ? e + ' ' : ''}${top.team} keeps cashing tickets ATS at ${top.atsRate}%${wl}.`;
  }

  // ── 4. Title race ─────────────────────────────────────────────────────
  let titleLine = '';
  if (hasChatContent && chatDigest.titleRace?.length >= 2) {
    const top2 = chatDigest.titleRace.slice(0, 2);
    titleLine = `Title race: ${top2.map(t => `${t.team} (${t.americanOdds})`).join(' and ')} lead the board.`;
  } else if (hasChatContent && chatDigest.titleRace?.length === 1) {
    const leader = chatDigest.titleRace[0];
    titleLine = `${leader.team} leads the title market at ${leader.americanOdds}.`;
  }

  // ── 5. Upcoming game tease ────────────────────────────────────────────
  let teaseLine = '';
  if (hasChatContent && chatDigest.gamesToWatch?.length > 0) {
    const game = chatDigest.gamesToWatch[0];
    teaseLine = `Next radar game: ${game.matchup}${game.spread ? ` (${game.spread})` : ''}.`;
  }

  // ── 6. Closer ─────────────────────────────────────────────────────────
  const closerLine = voiceLine || '';

  // ── Assemble short caption ─────────────────────────────────────────────
  const shortParts = [
    hookLine,
    recapLines.length > 0 ? recapLines.join('\n') : null,
    atsLine || null,
    titleLine || null,
    teaseLine || null,
    'Full intelligence at maximussports.ai',
  ].filter(l => l != null && l !== '');
  const short = shortParts.join('\n');

  // ── Assemble long caption ──────────────────────────────────────────────
  const longParts = [
    hookLine,
    '',
    recapLines.length > 0 ? recapLines.join('\n') : null,
    '',
    atsLine || null,
    '',
    titleLine || null,
    '',
    teaseLine || null,
    '',
    closerLine || null,
    '',
    'Full intelligence at maximussports.ai',
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

  // ── Hashtags: max 5 ────────────────────────────────────────────────────
  const hashtags = [
    '#CollegeBasketball',
    '#MarchMadness',
    '#CBB',
    '#NCAAB',
    '#MaximusSports',
  ].slice(0, 5);

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
  const rankStr  = rank != null ? ` · #${rank} AP` : '';
  const confStr  = conference ? ` · ${conference}` : '';

  // Resolve mascot emoji using the canonical getTeamEmoji helper
  let mascotEmoji = '';
  try {
    mascotEmoji = getTeamEmoji(teamSlug, teamName);
  } catch { /* ignore */ }
  const sportEmoji = mascotEmoji || '🏀';

  // Filter picks to those that match this team's actual next game matchup.
  // Avoids showing a lean from a completely unrelated game on today's slate.
  const nextOpp     = nextGame?.opponent || '';
  const teamFrag    = teamName.toLowerCase().split(' ').pop() || '';
  const oppFrag     = nextOpp.toLowerCase().split(' ').pop() || '';

  // Most precise: game involves both team and upcoming opponent
  let teamPick = (teamFrag && oppFrag)
    ? (picks?.find(p => {
        const ht = (p.homeTeam || '').toLowerCase();
        const at = (p.awayTeam || '').toLowerCase();
        return (ht.includes(teamFrag) || at.includes(teamFrag)) &&
               (ht.includes(oppFrag)  || at.includes(oppFrag));
      }) ?? null)
    : null;

  // Broader fallback: any pick where this team appears
  if (!teamPick && teamFrag) {
    teamPick = picks?.find(p => {
      const ht = (p.homeTeam || '').toLowerCase();
      const at = (p.awayTeam || '').toLowerCase();
      return ht.includes(teamFrag) || at.includes(teamFrag);
    }) ?? null;
  }

  // Build model lean copy — natural, contextual, explains what it means
  function buildModelLeanCopy(pick) {
    if (!pick) {
      if (nextOpp) return `No qualified edge yet for the ${nextOpp} game. Value threshold not met.`;
      return `No qualified lean right now — value threshold not met.`;
    }
    const conf = confidenceLabel(pick.confidence);
    const confPhrase =
      conf === 'High'   ? 'The model has a real lean here.' :
      conf === 'Medium' ? 'Slight edge — worth watching.' :
                          'Early signal, low conviction.';
    const typeNote = pick.pickType === 'ats' ? 'ATS differential + implied probability' : 'Market value vs. model probability';
    return `Model lean: ${pick.pickLine}. ${confPhrase} Based on ${typeNote}.`;
  }

  // Short caption: hook + ATS signal + model lean
  const confConfText = conference ? ` out of the ${conference}` : '';
  const hook = `🔥 Team Intel: ${teamName}${confConfText} ${sportEmoji}`;

  const atsCopy    = buildAtsSignalCopy(atsRecord);
  const picksCopy  = buildModelLeanCopy(teamPick);

  const short = [hook, atsCopy, picksCopy, CTA].filter(Boolean).join('\n\n');

  // Long caption: editorial rundown
  const long = [
    `🔥 Team Intel: ${teamName} ${sportEmoji}`,
    '',
    `${teamName}${rankStr}${confStr}${record ? ` · ${record}` : ''}`,
    '',
    atsCopy || null,
    '',
    teamPick
      ? `${buildModelLeanCopy(teamPick)} Not financial advice.`
      : (nextOpp
          ? `No qualified lean for the ${nextOpp} game. Discipline beats volume.`
          : `No qualified lean today. Discipline beats volume.`),
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
    '#MaximusSports', '#TeamIntel', '#SportsBetting',
    ...teamName.split(' ').filter(w => w.length > 3).map(w => `#${w}`).slice(0, 2),
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

// ─── Maximus's Picks ──────────────────────────────────────────────────────────

function buildPicksCaption({ stats, atsLeaders, picks, asOf }) {
  const all = picks ?? [];
  const picksCount = all.length;

  const byType = (t) => all.filter(p => p.pickType === t && p.itemType === 'lean');
  const atsList  = byType('ats');
  const valList  = byType('value');
  const totList  = byType('total');
  const peList   = byType('pickem');

  const best = (arr) => [...arr].sort((a, b) => (b.confidence - a.confidence) || ((b.edgeMag ?? 0) - (a.edgeMag ?? 0)))[0] ?? null;

  const topAts = best(atsList);
  const topVal = best(valList);
  const topTot = best(totList);
  const topPe  = best(peList);

  const confWord = (c) => c >= 2 ? 'HIGH' : c >= 1 ? 'MEDIUM' : 'LOW';

  function pickTag(p) {
    if (!p) return null;
    return `${p.pickLine || p.pickTeam || '\u2014'} (${confWord(p.confidence)})`;
  }

  const atsRationale = [
    'Cover rate + model projection both lean this way.',
    'ATS form and spread differential say this side has value.',
    'The number looks soft \u2014 our model sees a clear cover path.',
  ];
  const valRationale = [
    'Model price is well above the market \u2014 real value gap.',
    'Market is underpricing this outcome. Model disagrees sharply.',
    'Significant implied probability edge vs the posted line.',
  ];
  const totRationale = [
    'Tempo and pace profiles point convincingly toward the over.',
    'Scoring environments don\u2019t get much stronger than this one.',
    'Combined offensive output should push this total.',
    'Defensive profiles and pace strongly favor the under.',
    'Scoring pace says this total is set too high.',
  ];
  const peRationale = [
    'Model sees a meaningful moneyline edge here.',
    'Win probability gap is wide enough to act on.',
    'The market may be underrating this side straight-up.',
  ];

  const dayIdx = new Date().getDate();
  function rationale(pool, pick) {
    if (!pick) return '';
    return pool[_hash(pick.pickLine || '') % pool.length];
  }

  const FIXED_HOOK = 'Maximus\u2019s pick drop \uD83D\uDD25';

  const followUps = [
    () => `${picksCount} model-backed leans just hit the board.`,
    () => `The model scanned today\u2019s full slate \u2014 here\u2019s what cleared.`,
    () => `${picksCount} edges surfaced across the board. Confidence-ranked and data-verified.`,
    () => `Fresh intel. ${picksCount} qualified leans across today\u2019s slate.`,
    () => `The numbers spoke. ${picksCount} edges cleared the model threshold.`,
    () => `Board is live. ${picksCount} signals worth knowing about.`,
  ];

  const followUp = picksCount > 0
    ? followUps[dayIdx % followUps.length]()
    : 'No edges cleared the model threshold today \u2014 discipline over volume.';

  const catWords = [];
  if (atsList.length > 0) catWords.push('spreads');
  if (valList.length > 0) catWords.push('value');
  if (totList.length > 0) catWords.push('totals');
  if (peList.length > 0)  catWords.push('pick \u2019ems');
  const catJoin = catWords.length <= 2
    ? catWords.join(' and ')
    : catWords.slice(0, -1).join(', ') + ', and ' + catWords[catWords.length - 1];
  const catLine = catWords.length > 0 ? `Covering ${catJoin}.` : '';

  const boardLines = [];
  if (topAts) boardLines.push(`\uD83D\uDCC9 ATS: ${pickTag(topAts)}\n${rationale(atsRationale, topAts)}`);
  if (topVal) boardLines.push(`\uD83D\uDCB0 VALUE: ${pickTag(topVal)}\n${rationale(valRationale, topVal)}`);
  if (topTot) {
    const pool = (topTot.leanDirection === 'OVER') ? totRationale.slice(0, 3) : totRationale.slice(3);
    boardLines.push(`\uD83D\uDD22 TOTAL: ${pickTag(topTot)}\n${rationale(pool, topTot)}`);
  }
  if (topPe) boardLines.push(`\uD83C\uDFC0 PICK \u2019EM: ${pickTag(topPe)}\n${rationale(peRationale, topPe)}`);

  const short = [
    FIXED_HOOK,
    [followUp, catLine].filter(Boolean).join(' '),
    boardLines.length > 0 ? boardLines.join('\n\n') : null,
    'Full board + signals \u2192 maximussports.ai',
  ].filter(Boolean).join('\n\n');

  const long = [
    FIXED_HOOK,
    '',
    [followUp, catLine].filter(Boolean).join(' '),
    '',
    boardLines.length > 0 ? boardLines.join('\n\n') : null,
    '',
    'Swipe for full breakdowns: spreads, value, totals, and upset alerts.',
    '',
    asOf ? `Data as of ${asOf}` : null,
    'Full board + signals \u2192 maximussports.ai',
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
    '#BettingPicks',
    '#NCAAB',
    '#SportsBetting',
  ];

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
  const shortName = teamName.split(' ').slice(0, -1).join(' ') || teamName;
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
      const conf = confidenceLabel(matchedPick.confidence);
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

  // ── Engagement question ───────────────────────────────────────────────────
  const engagementQs = {
    undefeated:        `Are you still riding them ATS?`,
    ats_accelerating:  `Is the market still behind on ${shortName}?`,
    elite_underpriced: `Would you take ${shortName} at this number?`,
    ats_heater:        `Are you still on this team ATS?`,
    surging:           `Are you fading or riding ${shortName} right now?`,
    underdog_value:    `Are bettors late to this team?`,
    ats_value:         `Is the value still there on ${shortName}?`,
    hot_streak:        `Are you fading or riding the hot hand?`,
    elite_watch:       `Is this the team to beat heading into the stretch?`,
    standard:          `What\u2019s your read on ${shortName} right now?`,
  };

  const engagementQ = engagementQs[story.type] || engagementQs.standard;

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
    nextGameSection,
    '',
    pickSection,
    '',
    newsSection,
    '',
    engagementQ,
    '',
    `Full intel + signals: maximussports.ai`,
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

function _shortName(fullName) {
  if (!fullName) return '';
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
  const contenders = confTeams.filter(t => t.oddsTier === 'Lock' || t.oddsTier === 'Should be in');
  const isPower = lockTeams.length >= 4;
  const isMid = lockTeams.length <= 1 && confTeams.length <= 5;

  const confSlugs = new Set(confTeams.map(t => t.slug));
  const confBest = (atsLeaders?.best ?? []).filter(r => confSlugs.has(r.slug));

  const topNames = lockTeams.slice(0, 3).map(t => _shortName(t.name));
  const atsTopName = confBest.length > 0 ? _shortName(confBest[0].name || confBest[0].slug || '') : null;
  const atsTopRec = confBest.length > 0 ? (confBest[0].rec || confBest[0].last30 || confBest[0].season) : null;
  const atsTopPct = atsTopRec ? Math.round((atsTopRec.w / (atsTopRec.w + atsTopRec.l)) * 100) : null;

  // Hook
  let hookPool;
  if (isPower) {
    hookPool = [
      `\uD83C\uDFC0 The ${confName} is loaded. ${topNames.slice(0, 2).join(', ')} lead a conference with serious March firepower.`,
      `\uD83C\uDFC0 ${confName} Intel: ${topNames.slice(0, 2).join(' and ')} are setting the pace in one of the deepest conferences in the country.`,
      `\uD83C\uDFC0 Power conference alert: the ${confName} has ${lockTeams.length} title-tier teams and the race is tightening.`,
    ];
  } else if (isMid) {
    hookPool = [
      `\uD83C\uDFC0 Don\u2019t sleep on the ${confName}. There\u2019s value here that sharp bettors are watching.`,
      `\uD83C\uDFC0 ${confName} Intel is live. Small conference, real opportunity.`,
      `\uD83C\uDFC0 The ${confName} flies under the radar, but the numbers tell an interesting story.`,
    ];
  } else {
    hookPool = [
      `\uD83C\uDFC0 ${confName} Intel: ${topNames.length > 0 ? topNames[0] + ' leads the way, but ' : ''}the conference picture is evolving.`,
      `\uD83C\uDFC0 Fresh ${confName} breakdown. Key teams, ATS trends, and what the market is saying.`,
      `\uD83C\uDFC0 The ${confName} is heating up. Here\u2019s the full intel report.`,
    ];
  }
  const hook = _pick(hookPool, seed);

  // Conference narrative
  const narrativeLines = [];
  if (contenders.length >= 3) {
    narrativeLines.push(`${contenders.length} ${confName} teams are in the tournament conversation, with ${topNames.slice(0, 2).join(' and ')} leading the charge.`);
  } else if (topNames.length > 0) {
    narrativeLines.push(`${topNames[0]} is the headline ${confName} story, but there\u2019s more to the picture.`);
  }

  // ATS context
  if (atsTopName && atsTopPct) {
    narrativeLines.push(`\uD83D\uDCCA ATS spotlight: ${atsTopName} is covering at ${atsTopPct}% \u2014 the market still hasn\u2019t fully adjusted.`);
  } else if (atsTopName) {
    narrativeLines.push(`\uD83D\uDCCA ${atsTopName} leads ${confName} ATS \u2014 one of the sharper plays in the conference.`);
  }

  // March context
  if (isMarch) {
    narrativeLines.push(_pick([
      `\uD83C\uDFC6 ${confName} tournament positioning is on the line. Every game from here carries bracket weight.`,
      `\uD83C\uDFC6 Selection Sunday is approaching \u2014 ${confName} seeding battles intensifying.`,
      `\uD83C\uDFC6 March pressure is building across the ${confName}. Bubble teams are running out of runway.`,
    ], seed + 'march'));
  }

  // Engagement
  const engagementQ = _pick([
    `Which ${confName} team are you watching most closely heading into tournament play?`,
    `Is the ${confName} getting the respect it deserves from the betting market?`,
    `Who\u2019s the ${confName} team to beat? Drop your take below \u2B07\uFE0F`,
    `Best ${confName} bet right now? We want to hear your pick.`,
  ], seed + 'eng');

  const longCaption = [
    hook,
    '',
    ...narrativeLines,
    '',
    engagementQ,
    '',
    `Full conference intel + market signals at maximussports.ai`,
    '',
    DISCLAIMER,
  ].reduce((acc, line) => {
    if (line === '' && acc.length > 0 && acc[acc.length - 1] === '') return acc;
    return [...acc, line];
  }, []).join('\n').trim();

  const shortCaption = [hook, narrativeLines[0] || '', `\n${CTA}`].filter(Boolean).join('\n').trim();

  const confTagMap = {
    'Big Ten': '#BigTen', 'SEC': '#SEC', 'ACC': '#ACC', 'Big 12': '#Big12',
    'Big East': '#BigEast', 'WCC': '#WCC', 'Mountain West': '#MountainWest',
    'AAC': '#AAC', 'A-10': '#A10', 'MVC': '#MVC', 'MAC': '#MACtion', 'CUSA': '#CUSA',
  };
  const confTag = confTagMap[confName] ?? null;
  const hashtags = [
    confTag, '#CollegeBasketball', '#MarchMadness', '#MaximusSports', '#CBB',
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
  teamNews, ats, conference,
} = {}) {
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
