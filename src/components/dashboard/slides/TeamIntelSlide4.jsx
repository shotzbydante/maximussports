/**
 * TeamIntelSlide4 — Instagram Hero Summary · Slide 1 of Team Intel
 *
 * Cinematic, premium, information-dense.
 * Fully custom artboard — does not use SlideShell.
 *
 * Content hierarchy:
 *   1. Header        — Maximus branding + timestamp
 *   2. Logo hero     — team logo with animated glow
 *   3. Identity      — rank · champ odds · conf · meta chips
 *   4. Record line   — overall · conference · last-10
 *   5. Headline      — narrative scoring engine (buildHeroNarrative)
 *   6. Subtext       — editorial sentence from highest-scoring signal
 *   7. ATS grid      — Last 7 / Last 30 / Season — readable format
 *   8. Schedule      — LAST game result → NEXT game (spread · total · datetime)
 *   9. Lean line     — Maximus pick or market signal fallback
 *  10. News intel    — INTEL bullets from team news feed (cleaned)
 *  11. Footer        — URL + disclaimer
 *
 * NARRATIVE ENGINE (v3):
 *   Signal scoring model with context adjustments.
 *   1. buildTeamNarrativeSignals() → all applicable signals with base scores
 *   2. buildContextSignals()       → environmental boosts + stale-signal penalty
 *   3. buildMarchStakesPhrase()    → tournament/seeding context for subtexts
 *   4. buildHeroNarrative()        → orchestrates: generate → adjust → sort → select
 */

import { useState } from 'react';
import styles from './TeamIntelSlide4.module.css';
import { getTeamColors } from '../../../utils/teamColors';
import { confidenceLabel } from '../../../utils/maximusPicksModel';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseRecord(rec) {
  if (!rec) return null;
  if (typeof rec === 'string') {
    const m = rec.match(/(\d+)-(\d+)/);
    if (!m) return null;
    const w = parseInt(m[1], 10), l = parseInt(m[2], 10);
    return w + l === 0 ? null : { w, l, pct: w / (w + l) };
  }
  if (typeof rec === 'object') {
    const w = parseInt(rec.wins ?? rec.w ?? 0, 10);
    const l = parseInt(rec.losses ?? rec.l ?? 0, 10);
    return w + l === 0 ? null : { w, l, pct: w / (w + l) };
  }
  return null;
}

function fmtSpread(spread) {
  if (spread == null) return null;
  const n = parseFloat(spread);
  if (isNaN(n)) return String(spread);
  return n > 0 ? `+${n}` : String(n);
}

function fmtOdds(american) {
  if (american == null || typeof american !== 'number') return null;
  return american > 0 ? `+${american}` : String(american);
}

function extractConferenceRecord(teamObj) {
  const items = teamObj?.record?.items;
  if (!items?.length) return null;
  const confItem = items.find(i => {
    const t = (i.type || i.name || '').toLowerCase();
    return t.includes('conf') || t === 'vsconf' || t === 'vs-conf' || t === 'conference';
  });
  if (confItem?.summary) return confItem.summary;
  if (items.length >= 2) {
    const s = items[1]?.summary;
    if (s && /^\d+-\d+$/.test(s.trim())) return s;
  }
  return null;
}

const MULTI_WORD_MASCOTS = new Set([
  'wolf pack', 'red raiders', 'blue devils', 'tar heels', 'red storm',
  'golden eagles', 'sun devils', 'golden hurricane', 'fighting illini',
  'crimson tide', 'golden bears', 'demon deacons', 'horned frogs',
  'red hawks', 'blue jays', 'mean green', 'black bears',
]);

function extractShortName(team) {
  if (team?.location) return team.location;
  if (team?.shortDisplayName) return team.shortDisplayName;
  const full = team?.displayName || team?.name || '';
  if (!full) return 'This team';
  const lower = full.toLowerCase();
  for (const mascot of MULTI_WORD_MASCOTS) {
    if (lower.endsWith(mascot)) {
      return full.slice(0, full.length - mascot.length).trim() || full;
    }
  }
  const parts = full.split(' ');
  if (parts.length <= 1) return full;
  if (parts[0].length <= 3) return parts.slice(0, 2).join(' ');
  return parts[0];
}

function cap(str, max = 110) {
  if (!str) return '';
  return str.length <= max ? str : str.slice(0, max - 1) + '\u2026';
}

/**
 * Format a parsed ATS record for mainstream readability.
 * Returns { record: "21–7 ATS", cover: "75% cover" } or null.
 */
function formatReadableAtsRecord(parsed) {
  if (!parsed) return null;
  return {
    record: `${parsed.w}\u2013${parsed.l} ATS`,
    cover: `${Math.round(parsed.pct * 100)}% cover`,
  };
}

// ─── Last Game Metadata ───────────────────────────────────────────────────────

function extractLastGameMeta(event, slug, teamName) {
  if (!event) return null;
  const comps = event.competitions?.[0]?.competitors ?? [];
  const nameFrag = (teamName.split(' ').pop() || '').toLowerCase();
  const me = comps.find(c =>
    c.team?.slug === slug || (c.team?.name || '').toLowerCase().includes(nameFrag)
  );
  const opp = comps.find(c => c !== me) ?? (comps.length > 1 ? comps[1] : comps[0]);

  const ourScore = Number(event.ourScore);
  const oppScore = Number(event.oppScore);
  const won = ourScore > oppScore;
  const margin = Math.abs(ourScore - oppScore);

  const oppName = opp?.team?.displayName || opp?.team?.name || null;
  const oppRank = opp?.curatedRank?.current ?? null;
  const myRank = me?.curatedRank?.current ?? null;

  const statusName = (event.status?.type?.name || event.status?.name || '').toLowerCase();
  const isOT = statusName.includes('ot') || statusName.includes('overtime');
  const wasUpset = won && oppRank != null && oppRank <= 25 && (myRank == null || myRank > oppRank);

  return { won, margin, ourScore, oppScore, oppName, isOT, wasUpset };
}

// ─── News Headline Cleaning ──────────────────────────────────────────────────

function cleanNewsHeadline(raw) {
  if (!raw) return '';
  let s = raw.trim();
  const sepIdx = Math.max(
    s.lastIndexOf(' \u2013 '), s.lastIndexOf(' - '),
    s.lastIndexOf(' \u2014 '), s.lastIndexOf(' | ')
  );
  if (sepIdx > s.length * 0.35) s = s.slice(0, sepIdx);
  s = s.replace(/^(?:MBB|WBB|CBB|NCAAM|NCAAW|NCAA)\s*(?:Preview|Recap|Report|Update|Analysis|Roundup):\s*/i, '');
  s = s.replace(/\s*[-\u2013\u2014|]\s*(?:ESPN|CBS|Yahoo|Fox|NBC|AP|SI|The Athletic)[\s\w]*$/i, '');
  if (s.length > 80) s = s.slice(0, 79) + '\u2026';
  return s;
}

// ─── Phrase Variation System ──────────────────────────────────────────────────

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickPhrase(phrases, seed) {
  return phrases[hashStr(seed || '') % phrases.length];
}

const PHRASE_LIB = {
  tournamentStakes: [
    (conf) => `as ${conf} tournament positioning comes into focus`,
    (conf) => `with ${conf} tournament seeding on the line`,
    (conf) => `as ${conf} tournament pressure builds`,
    () => `with postseason positioning at stake`,
    () => `as the bracket picture tightens`,
  ],
  marchGeneric: [
    'during a key late-season stretch',
    'as March pressure builds',
    'with postseason positioning in focus',
    'as the season enters its final stretch',
    'with conference tournament momentum building',
  ],
  selectionSunday: [
    'as Selection Sunday approaches',
    'with the bracket about to be set',
    'as the committee finalizes the field',
  ],
  bubblePressure: [
    'with at-large hopes on the line',
    'as bubble pressure reaches a peak',
    'with their tournament fate still in the balance',
  ],
  eliteBracket: [
    'as the bracket begins to take shape',
    'with a potential top seed in play',
    'as the road to the Final Four sharpens',
  ],
  marketMovement: [
    'The market is scrambling to catch up.',
    'Books are still adjusting.',
    'Pricing is tightening.',
    'The edge is narrowing.',
    'The number has started to move.',
  ],
  momentum: [
    'Momentum is real.',
    'This team is heating up.',
    'Form is trending up.',
    'They are peaking at the right time.',
    'The timing looks strong.',
  ],
  coverRate: [
    'keeps covering',
    'keeps cashing tickets',
    'continues to beat the number',
    'stays sharp against the spread',
    'is still finding value',
  ],
};

// ─── March Stakes Phrase Library ──────────────────────────────────────────────

function buildMarchStakesPhrase(ctx) {
  const { conf, rank, recP, shortName } = ctx;
  if (new Date().getMonth() !== 2) return '';
  const seed = shortName || conf || '';
  const day = new Date().getDate();

  if (day >= 14) {
    if (!rank && recP && recP.pct >= 0.50 && recP.pct <= 0.60)
      return pickPhrase(PHRASE_LIB.bubblePressure, seed);
    if (rank && rank <= 10)
      return pickPhrase(PHRASE_LIB.eliteBracket, seed);
    return pickPhrase(PHRASE_LIB.selectionSunday, seed);
  }

  if (conf) {
    const phraseFn = pickPhrase(PHRASE_LIB.tournamentStakes, seed);
    return phraseFn(conf);
  }
  return pickPhrase(PHRASE_LIB.marchGeneric, seed);
}

// ─── Narrative Scoring Engine ─────────────────────────────────────────────────
//
// SIGNAL TYPES & BASE SCORES:
//   lastGameOT          130    lastGameUpset       120
//   lastGameClose       100    lastGameStatement    95
//   atsHot               90    atsAcceleration      80
//   rankedMomentum       70    conferenceTournament 65
//   bubbleWatch          65    marketBehind         60
//   surgingTeam          55    atsCooling           50
//   newsContext           55    standard             10

function buildTeamNarrativeSignals(ctx) {
  const {
    shortName, conf, rank, l7, l30, ssn, recP,
    last10W, last10Total, lastGameMeta, newsHeadlines,
  } = ctx;
  const signals = [];
  const marchStakes = buildMarchStakesPhrase(ctx);

  // ── LAST GAME ──────────────────────────────────────────────────────────────
  if (lastGameMeta) {
    const { won, margin, oppName, isOT, wasUpset } = lastGameMeta;

    if (isOT) {
      const hl = wasUpset ? 'OVERTIME\nUPSET' : (won ? 'OVERTIME\nTHRILLER' : 'HEARTBREAK\nIN OT');
      signals.push({
        type: 'lastGameOT', score: 130, headline: hl,
        subtext: won
          ? `${shortName} survived an overtime thriller${oppName ? ' vs ' + oppName : ''}${marchStakes ? ' ' + marchStakes : ''}.`
          : `${shortName} fell in a heartbreaking overtime loss${oppName ? ' to ' + oppName : ''}${marchStakes ? ' ' + marchStakes : ''}.`,
      });
    }

    if (wasUpset && !isOT) {
      signals.push({
        type: 'lastGameUpset', score: 120,
        headline: 'UPSET\nCOMPLETE',
        subtext: `${shortName} pulled off the upset${oppName ? ' over ' + oppName : ''}. The market is recalibrating.`,
      });
    }

    if (margin <= 6) {
      signals.push({
        type: 'lastGameClose', score: 100,
        headline: won ? 'DOWN TO\nTHE WIRE' : 'WENT DOWN\nFIGHTING',
        subtext: won
          ? `${shortName} edged ${oppName ? oppName + ' in a tight one' : 'out a close win'}${marchStakes ? ' ' + marchStakes : ''}.`
          : `${shortName} fell${oppName ? ' to ' + oppName : ''} in a tight battle${marchStakes ? ' ' + marchStakes : ''}.`,
      });
    }

    if (won && margin >= 15) {
      signals.push({
        type: 'lastGameStatement', score: 95,
        headline: 'STATEMENT\nWIN',
        subtext: `${shortName} rolled to a dominant win${oppName ? ' over ' + oppName : ''}${marchStakes ? ' ' + marchStakes : ''}.`,
      });
    }
  }

  // ── ATS SIGNALS ────────────────────────────────────────────────────────────
  if (l7 && l7.pct >= 0.70) {
    const pct = Math.round(l7.pct * 100);
    const games = l7.w + l7.l;
    const coverVerb = pickPhrase(PHRASE_LIB.coverRate, shortName);
    const marketLine = pickPhrase(PHRASE_LIB.marketMovement, shortName);
    const atsHl = pct === 100 && games >= 3
      ? 'PERFECT\nAGAINST THE NUMBER'
      : pickPhrase(['CASH\nMACHINE', 'COVERING\nEVERYTHING', 'SHARP MONEY\nMAGNET', 'THE NUMBER\nIS WRONG'], shortName + 'ah');
    signals.push({
      type: 'atsHot', score: 90,
      headline: atsHl,
      subtext: `${shortName} ${coverVerb}${marchStakes ? ' ' + marchStakes : ''}. ${marketLine}`,
    });
  }

  if (l7 && l30 && l7.pct > l30.pct + 0.10 && l7.pct >= 0.58) {
    const marketLine = pickPhrase(PHRASE_LIB.marketMovement, shortName + 'acc');
    signals.push({
      type: 'atsAcceleration', score: 80,
      headline: 'MARKET\nLATE AGAIN',
      subtext: `Cover rate is accelerating for ${shortName}${marchStakes ? ' ' + marchStakes : ''}. ${marketLine}`,
    });
  }

  if ((l7 && l7.pct <= 0.38) || (l30 && l30.pct <= 0.38)) {
    signals.push({
      type: 'atsCooling', score: 50,
      headline: 'MARKET\nHAS ADJUSTED',
      subtext: `${shortName}\u2019s cover rate has cooled. The line may have caught up${marchStakes ? ' ' + marchStakes : ''}.`,
    });
  }

  if (ssn && ssn.pct >= 0.60) {
    signals.push({
      type: 'marketBehind', score: 60,
      headline: 'BOOKS STILL\nBEHIND',
      subtext: `${shortName} has been sharp ATS all season. Books are still behind.`,
    });
  }

  // ── TEAM MOMENTUM ──────────────────────────────────────────────────────────
  if (rank && rank <= 25 && last10W >= 7 && last10Total >= 8) {
    const momentumLine = pickPhrase(PHRASE_LIB.momentum, shortName + 'ranked');
    const momentumHl = new Date().getMonth() === 2
      ? pickPhrase(['MARCH\nDOMINANCE', 'PEAKING AT\nTHE RIGHT TIME', 'FINAL FOUR\nENERGY', 'LOCKED IN\nFOR MARCH'], shortName + 'rm')
      : pickPhrase(['BUILDING\nSOMETHING', 'CAN\'T STOP\nWON\'T STOP', 'MOMENTUM\nRISING'], shortName + 'rm');
    signals.push({
      type: 'rankedMomentum', score: 70,
      headline: momentumHl,
      subtext: `#${rank} ${shortName} keeps building momentum${marchStakes ? ' ' + marchStakes : ''}. ${momentumLine}`,
    });
  }

  if (last10W >= 8 && last10Total >= 10) {
    const momentumLine = pickPhrase(PHRASE_LIB.momentum, shortName + 'surge');
    signals.push({
      type: 'surgingTeam', score: 55,
      headline: 'SURGING',
      subtext: `${shortName} has won ${last10W} of its last ${last10Total}${marchStakes ? ' ' + marchStakes : ''}. ${momentumLine}`,
    });
  }

  // ── TOURNAMENT POSITIONING ─────────────────────────────────────────────────
  if (new Date().getMonth() === 2 && conf) {
    signals.push({
      type: 'conferenceTournament', score: 65,
      headline: 'TOURNAMENT\nTIME',
      subtext: `${conf} tournament on deck for ${shortName}. Every game matters from here.`,
    });
  }

  if (!rank && recP && recP.pct >= 0.50 && recP.pct <= 0.58) {
    signals.push({
      type: 'bubbleWatch', score: 65,
      headline: 'BUBBLE\nWATCH',
      subtext: `${shortName} sits on the bubble${marchStakes ? ' ' + marchStakes : ''}. Every game matters.`,
    });
  }

  // ── NEWS CONTEXT ───────────────────────────────────────────────────────────
  if (newsHeadlines.length > 0) {
    const combined = newsHeadlines.join(' ').toLowerCase();
    const newsKW = ['tournament', 'seeding', 'seed', 'rivalry', 'rival', 'milestone', 'upset', 'major win', '900'];
    if (newsKW.some(kw => combined.includes(kw))) {
      signals.push({
        type: 'newsContext', score: 55,
        headline: 'INTEL\nDETECTED',
        subtext: newsHeadlines[0],
      });
    }
  }

  // ── FALLBACK ───────────────────────────────────────────────────────────────
  const fallbackHl = ssn && ssn.pct >= 0.55
    ? pickPhrase(['THE NUMBER\nTO KNOW', 'MARKET\nINTELLIGENCE', 'EDGE\nDETECTED'], shortName + 'fb')
    : pickPhrase(['FULL\nBREAKDOWN', 'INTEL\nFILE', 'DEEP\nDIVE'], shortName + 'fb');
  signals.push({
    type: 'standard', score: 10,
    headline: fallbackHl,
    subtext: ssn
      ? `${shortName} is ${ssn.w}\u2013${ssn.l} ATS (${Math.round(ssn.pct * 100)}%) on the season.`
      : `Full market intelligence on ${shortName}.`,
  });

  return signals;
}

/**
 * Context layer: boosts + penalties based on environmental factors.
 * Returns { signalType: scoreAdjustment } map.
 */
function buildContextSignals(ctx) {
  const { l7, l30, ssn, lastGameMeta, newsHeadlines } = ctx;
  const adj = {};

  // 1. Tournament window (March)
  if (new Date().getMonth() === 2) {
    adj.rankedMomentum = (adj.rankedMomentum || 0) + 15;
    adj.conferenceTournament = (adj.conferenceTournament || 0) + 15;
    adj.bubbleWatch = (adj.bubbleWatch || 0) + 15;
  }

  // 2. Rivalry / news recency — opponent in recent headlines boosts last-game signals
  if (lastGameMeta?.oppName && newsHeadlines.length > 0) {
    const oppWords = lastGameMeta.oppName.toLowerCase().split(' ');
    const oppFrags = [oppWords[0], oppWords[oppWords.length - 1]].filter(f => f && f.length >= 3);
    const newsText = newsHeadlines.join(' ').toLowerCase();
    if (oppFrags.some(f => newsText.includes(f))) {
      for (const t of ['lastGameOT', 'lastGameUpset', 'lastGameClose', 'lastGameStatement']) {
        adj[t] = (adj[t] || 0) + 15;
      }
    }
  }

  // 3. Betting momentum — L7 >= 70% AND season >= 60%
  if (l7 && l7.pct >= 0.70 && ssn && ssn.pct >= 0.60) {
    adj.atsHot = (adj.atsHot || 0) + 15;
    adj.marketBehind = (adj.marketBehind || 0) + 15;
  }

  // 4. Stale-signal penalty — season ATS looks strong but recent windows diverge
  if (ssn && ssn.pct >= 0.60) {
    const l7Cool = l7 && l7.pct <= 0.40;
    const l30Cool = l30 && l30.pct <= 0.45;
    if (l7Cool && l30Cool) {
      adj.marketBehind = (adj.marketBehind || 0) - 25;
    } else if (l7Cool || l30Cool) {
      adj.marketBehind = (adj.marketBehind || 0) - 15;
    }
  }

  return adj;
}

/**
 * Orchestrator: generate signals → apply context → pick highest scorer.
 * Returns { headline, subtext, signalType, score }.
 */
function buildHeroNarrative(ctx) {
  const signals = buildTeamNarrativeSignals(ctx);
  const context = buildContextSignals(ctx);

  for (const sig of signals) {
    if (context[sig.type]) sig.score += context[sig.type];
  }

  signals.sort((a, b) => b.score - a.score);
  const winner = signals[0];

  return {
    headline: winner.headline,
    subtext: cap(winner.subtext, 110),
    signalType: winner.type,
    score: winner.score,
  };
}

/**
 * Lean-line fallback: one-line market signal when no Maximus pick available.
 */
function buildSignalText(ats) {
  const l7  = parseRecord(ats?.last7);
  const l30 = parseRecord(ats?.last30);
  const ssn = parseRecord(ats?.season);
  const primary = l7 ?? l30 ?? ssn;
  if (!primary) return null;

  const pct      = Math.round(primary.pct * 100);
  const trending = l7 && l30
    ? l7.pct > l30.pct + 0.08 ? 'up' : l7.pct < l30.pct - 0.08 ? 'down' : 'flat'
    : 'flat';

  if (primary.pct >= 0.68) return trending === 'up'
    ? 'Cover trend accelerating \u2014 market behind.'
    : `Covering at ${pct}% \u2014 market still adjusting.`;
  if (primary.pct >= 0.60) return trending === 'up'
    ? 'ATS rate climbing \u2014 edge building.'
    : `Holding firm at ${pct}% ATS. Consistent value.`;
  if (primary.pct >= 0.52) return 'Fairly priced \u2014 no clear edge either way.';
  if (primary.pct >= 0.45) return trending === 'down'
    ? `ATS cooling off \u2014 ${pct}% and sliding.`
    : `${pct}% ATS \u2014 around break-even.`;
  return `Struggling ATS at ${pct}%. Value may be on the other side.`;
}

// ─── Team logo with graceful fallback ──────────────────────────────────────────

function TeamLogoHero({ slug, name }) {
  const [failed, setFailed] = useState(false);
  const initials = (name || '').split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();

  if (failed || !slug) {
    return (
      <div className={styles.logoFallbackText}>{initials}</div>
    );
  }

  return (
    <img
      src={`/logos/${slug}.png`}
      alt={name}
      className={styles.teamLogo}
      crossOrigin="anonymous"
      onError={() => setFailed(true)}
    />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeamIntelSlide4({ data, teamData, asOf, ...rest }) {
  const team       = teamData?.team ?? {};
  const name       = team.displayName || team.name || data?.selectedTeamName || '\u2014';
  const slug       = team.slug || data?.selectedTeamSlug || null;
  const rank       = teamData?.rank ?? null;
  const titleOdds  = teamData?.titleOdds ?? null;
  const shortName  = extractShortName(team);

  const { primary: teamPrimary, secondary: teamSecondary } = getTeamColors(slug);

  const conf = team.conference || data?.selectedTeamConf || null;

  // ── Records ────────────────────────────────────────────────────────────────
  const rawOverallRecord = team.record?.items?.[0]?.summary
    || team.recordSummary
    || (typeof team.record === 'string' ? team.record : null)
    || null;

  const confRecord = extractConferenceRecord(team);

  // ── ATS — use teamData first, fall back to atsLeaders global ──────────────
  const ats = teamData?.ats ?? {};
  const resolvedAts = { ...ats };
  if (!ats.last30 && !ats.season) {
    const leaders  = [...(data?.atsLeaders?.best ?? []), ...(data?.atsLeaders?.worst ?? [])];
    const nameFrag = (name.split(' ').pop() || '').toLowerCase();
    const found    = leaders.find(l =>
      l.slug === slug || (l.team || l.name || '').toLowerCase().includes(nameFrag)
    );
    if (found) {
      resolvedAts.last30 = found.last30 ?? null;
      resolvedAts.season = found.season ?? null;
      resolvedAts.last7  = found.last7  ?? null;
    }
  }

  const l7P  = parseRecord(resolvedAts.last7);
  const l30P = parseRecord(resolvedAts.last30);
  const ssnP = parseRecord(resolvedAts.season);

  // ── Last-10 SU form from schedule ─────────────────────────────────────────
  const schedEvents = teamData?.schedule?.events ?? [];
  const recentFinished = schedEvents
    .filter(e => e.isFinal && e.ourScore != null && e.oppScore != null)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const last10  = recentFinished.slice(0, 10);
  const last10W = last10.filter(e => Number(e.ourScore) > Number(e.oppScore)).length;

  // Compute full season record from all finished games as fallback
  const computedSeasonW = recentFinished.filter(e => Number(e.ourScore) > Number(e.oppScore)).length;
  const computedSeasonL = recentFinished.length - computedSeasonW;
  const overallRecord = rawOverallRecord
    || (recentFinished.length >= 5 ? `${computedSeasonW}-${computedSeasonL}` : null);

  // ── Last game metadata (for narrative engine + schedule render) ────────────
  const lastGameEvent = recentFinished[0] ?? null;
  const lastGameMeta  = extractLastGameMeta(lastGameEvent, slug, name);

  // Pre-format last-game score line for the schedule module
  const lastGameScoreLabel = lastGameMeta
    ? `${lastGameMeta.won ? 'W' : 'L'} ${lastGameMeta.ourScore}\u2013${lastGameMeta.oppScore}`
    : null;

  // ── Next game from odds API; schedule fallback ─────────────────────────────
  const nextLine  = teamData?.nextLine ?? null;
  const spread    = nextLine?.consensus?.spread ?? null;
  const ml        = nextLine?.consensus?.moneyline ?? null;
  const total     = nextLine?.consensus?.total ?? null;
  let nextOpp     = nextLine?.nextEvent?.opponent ?? null;
  let nextTime    = null;

  if (nextLine?.nextEvent?.commenceTime) {
    const d = new Date(nextLine.nextEvent.commenceTime);
    const datePart = d.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles',
    });
    const timePart = d.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
    });
    nextTime = `${datePart} ${timePart}`;
  }

  if (!nextOpp) {
    const upcoming = schedEvents.find(e => {
      const st = (e.status?.type?.name || e.status?.name || '').toLowerCase();
      return st !== 'final' && st !== 'final-ot' && st !== 'canceled';
    });
    if (upcoming) {
      const comps = upcoming.competitions?.[0]?.competitors ?? [];
      const me    = comps.find(c => c.team?.slug === slug);
      const opp   = comps.find(c => c !== me) ?? comps[0];
      const oppName = opp?.team?.displayName || opp?.team?.name || null;
      // Tournament-aware next-game phrasing
      const compNotes = upcoming.competitions?.[0]?.notes ?? [];
      const noteText = compNotes.map(n => n.headline || n.text || '').join(' ');
      const isMarch = new Date().getMonth() === 2;
      if (oppName && oppName !== 'TBD') {
        nextOpp = oppName;
      } else if (noteText) {
        nextOpp = noteText.length > 50 ? noteText.slice(0, 47) + '\u2026' : noteText;
      } else if (isMarch && conf) {
        nextOpp = `${conf} Tournament game TBD`;
      } else if (isMarch) {
        nextOpp = 'Tournament game TBD';
      } else {
        nextOpp = oppName || 'TBD';
      }
      if (!nextTime && upcoming.date) {
        const d = new Date(upcoming.date);
        const datePart = d.toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles',
        });
        const timePart = d.toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
        });
        nextTime = `${datePart} ${timePart}`;
      }
    }
  }

  // ── Maximus pick — from canonical picks (single source of truth) ───────────
  const cp = data?.canonicalPicks ?? {};
  const allPicks = [...(cp.atsPicks ?? []), ...(cp.mlPicks ?? [])];
  let teamPick = null;
  if (slug) {
    teamPick = allPicks.find(p => p.homeSlug === slug || p.awaySlug === slug) ?? null;
  }

  // ── Cleaned news headlines ────────────────────────────────────────────────
  const rawNews = teamData?.last7News?.length > 0
    ? teamData.last7News
    : (teamData?.teamNews ?? []);
  const newsHeadlines = rawNews
    .slice(0, 3)
    .map(n => cleanNewsHeadline(n.headline || n.title || ''))
    .filter(Boolean);

  // ── Narrative engine ──────────────────────────────────────────────────────
  const narrative = buildHeroNarrative({
    shortName, conf, rank,
    l7: l7P, l30: l30P, ssn: ssnP,
    recP: parseRecord(overallRecord),
    last10W, last10Total: last10.length,
    lastGameMeta,
    newsHeadlines,
  });

  const signalText = buildSignalText(resolvedAts);

  const titleOddsLabel = fmtOdds(titleOdds);

  // ATS windows — plain-language labels + readable format via formatReadableAtsRecord
  const atsWindows = [
    { label: 'Last 7',  fmt: formatReadableAtsRecord(l7P)  },
    { label: 'Last 30', fmt: formatReadableAtsRecord(l30P) },
    { label: 'Season',  fmt: formatReadableAtsRecord(ssnP) },
  ].filter(w => w.fmt != null);

  // Record display line — full season + last 10 with form indicator
  const recordLineParts = [];
  if (overallRecord) recordLineParts.push(`${overallRecord.replace('-', '\u2013')} season`);
  const last10L = last10.length - last10W;
  const last10Str = last10.length >= 5 ? `${last10W}\u2013${last10L} last ${last10.length}` : null;
  const formIcon = last10.length >= 7
    ? (last10W >= 8 ? ' \uD83D\uDD25' : last10W <= 3 ? ' \u2744\uFE0F' : '')
    : '';
  if (last10Str) recordLineParts.push(`${last10Str}${formIcon}`);
  const recordLine = recordLineParts.length > 0 ? recordLineParts.join(' \u00b7 ') : null;

  const hasSchedule = nextOpp || lastGameMeta;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className={styles.artboard}
      style={{ '--team-primary': teamPrimary, '--team-secondary': teamSecondary }}
      {...rest}
    >
      {/* Background atmosphere */}
      <div className={styles.bgBase}  aria-hidden="true" />
      <div className={styles.bgGlow}  aria-hidden="true" />
      <div className={styles.bgRay}   aria-hidden="true" />
      <div className={styles.bgNoise} aria-hidden="true" />

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logoRow}>
          <img src="/logo.png" alt="Maximus Sports" className={styles.brandLogo} crossOrigin="anonymous" />
          <div className={styles.logoMeta}>
            <span className={styles.brandName}>MAXIMUS SPORTS</span>
            <span className={styles.intelChip}>TEAM INTEL</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          {asOf && <div className={styles.asOf}>As of {asOf}</div>}
          <div className={styles.maxIntel}>MAXIMUM INTELLIGENCE</div>
        </div>
      </header>

      {/* Team logo hero */}
      <div className={styles.logoZone}>
        <div className={styles.logoGlowRing} aria-hidden="true" />
        <TeamLogoHero slug={slug} name={name} />
      </div>

      {/* Team identity */}
      <div className={styles.identity}>
        <div className={styles.metaRow}>
          {rank != null           && <span className={styles.rankPill}>#{rank} AP</span>}
          {titleOddsLabel != null && <span className={styles.titleOddsPill}>{'\uD83C\uDFC6'} {titleOddsLabel}</span>}
          {conf                   && <span className={styles.confPill}>{conf}</span>}
        </div>
        <h1 className={styles.teamName}>{name.toUpperCase()}</h1>
        {recordLine && (
          <div className={styles.formLine}>{recordLine}</div>
        )}
      </div>

      {/* Editorial headline — powered by narrative scoring engine */}
      <div className={styles.headlineZone}>
        <div className={styles.headlineDivider} />
        <h2 className={styles.headline}>
          {narrative.headline.split('\n').map((line, i) => (
            <span key={i} className={styles.headlineLine}>{line}</span>
          ))}
        </h2>
        <div className={styles.headlineDividerBottom} />
      </div>

      {/* Contextual subtext — editorial sentence from the winning signal */}
      {narrative.subtext && (
        <div className={styles.quickIntel}>{narrative.subtext}</div>
      )}

      {/* ATS grid — mainstream-readable format */}
      {atsWindows.length > 0 && (
        <div className={styles.atsGrid}>
          {atsWindows.map((w, i) => (
            <div key={i} className={styles.atsChip}>
              <div className={styles.atsLabel}>{w.label}</div>
              <div className={styles.atsValue}>{w.fmt.record}</div>
              <div className={styles.atsPct}>{w.fmt.cover}</div>
            </div>
          ))}
        </div>
      )}

      {/* Schedule module — LAST then NEXT */}
      {hasSchedule && (
        <div className={styles.scheduleModule}>
          {lastGameMeta && (
            <div className={styles.schedRow}>
              <span className={styles.schedBadge} data-type={lastGameMeta.won ? 'win' : 'loss'}>LAST</span>
              <span className={styles.schedContent}>
                <span className={`${styles.schedResultLabel} ${lastGameMeta.won ? styles.schedWin : styles.schedLoss}`}>
                  {lastGameScoreLabel}
                </span>
                {lastGameMeta.oppName && <span className={styles.schedOppSmall}>vs {lastGameMeta.oppName}</span>}
              </span>
            </div>
          )}
          {nextOpp && (
            <div className={styles.schedRow}>
              <span className={styles.schedBadge} data-type="next">NEXT</span>
              <span className={styles.schedContent}>
                <span className={styles.schedOpp}>vs {nextOpp}</span>
                {spread != null && (
                  <span className={styles.schedLine}>{fmtSpread(spread)}</span>
                )}
                {spread == null && ml != null && (
                  <span className={styles.schedLine}>{ml > 0 ? `+${ml}` : ml} ML</span>
                )}
                {total != null && (
                  <span className={styles.schedLine}>{total}o/u</span>
                )}
                {!spread && !ml && !total && (
                  <span className={styles.schedTime}>Line opening soon</span>
                )}
                {nextTime && <span className={styles.schedTime}>{nextTime}</span>}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Lean / pick line */}
      {(teamPick || signalText) && (
        <div className={styles.leanLine}>
          <span className={styles.leanArrow}>{'\u2197'}</span>
          {teamPick ? (
            <>
              <span className={styles.leanLabel}>LEAN:</span>
              <span className={styles.leanValue}> {teamPick.pickLine}</span>
              <span className={styles.leanConf}> {'\u00b7'} {confidenceLabel(teamPick.confidence)} confidence</span>
            </>
          ) : (
            <span className={styles.leanText}>{signalText || 'Market signal still developing.'}</span>
          )}
        </div>
      )}

      {/* News INTEL module */}
      {newsHeadlines.length > 0 && (
        <div className={styles.intelModule}>
          <div className={styles.intelTitle}>INTEL</div>
          <ul className={styles.intelList}>
            {newsHeadlines.map((item, i) => (
              <li key={i} className={styles.intelItem}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
        <span className={styles.footerDisclaimer}>
          For entertainment only. Please bet responsibly. 21+
        </span>
      </footer>
    </div>
  );
}
