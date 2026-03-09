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
 *   6. Subtext       — contextual sentence from highest-scoring signal
 *   7. ATS grid      — ATS L7 / ATS L30 / ATS SZN chips
 *   8. Schedule      — LAST game result → NEXT game (spread · total · datetime)
 *   9. Lean line     — Maximus pick or market signal fallback
 *  10. News intel    — INTEL bullets from team news feed (cleaned)
 *  11. Footer        — URL + disclaimer
 *
 * NARRATIVE ENGINE (v2):
 *   Replaced sequential if/else with a signal scoring model.
 *   1. buildTeamNarrativeSignals()  → generates all applicable signals with base scores
 *   2. buildContextSignals()        → environmental adjustments (tournament window, rivalry, betting momentum)
 *   3. buildHeroNarrative()         → orchestrates: generate → adjust → sort → select top signal
 */

import styles from './TeamIntelSlide4.module.css';
import { getTeamColors } from '../../../utils/teamColors';
import { buildMaximusPicks, confidenceLabel } from '../../../utils/maximusPicksModel';

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

function extractShortName(team) {
  if (team?.location) return team.location;
  if (team?.shortDisplayName) return team.shortDisplayName;
  const full = team?.displayName || team?.name || '';
  const parts = full.split(' ');
  if (parts.length <= 1) return full || 'This team';
  return parts.slice(0, -1).join(' ') || parts[0];
}

function cap(str, max = 110) {
  if (!str) return '';
  return str.length <= max ? str : str.slice(0, max - 1) + '\u2026';
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

  const atsSnippet = (() => {
    if (l30) return `Covering ${l30.w} of the last ${l30.w + l30.l} ATS.`;
    if (ssn) return `${ssn.w}\u2013${ssn.l} ATS on the season.`;
    return '';
  })();

  // ── LAST GAME ──────────────────────────────────────────────────────────────
  if (lastGameMeta) {
    const { won, margin, oppName, isOT, wasUpset, ourScore, oppScore } = lastGameMeta;
    const opp = oppName || 'their opponent';
    const sc = `${ourScore}\u2013${oppScore}`;

    if (isOT) {
      const hl = wasUpset ? 'OVERTIME\nUPSET' : (won ? 'OVERTIME\nTHRILLER' : 'HEARTBREAK\nIN OT');
      signals.push({
        type: 'lastGameOT', score: 130, headline: hl,
        subtext: won
          ? `${shortName} survived OT vs ${opp}, ${sc}.${atsSnippet ? ' ' + atsSnippet : ''}`
          : `${shortName} fell in OT to ${opp}, ${sc}.${atsSnippet ? ' ' + atsSnippet : ''}`,
      });
    }

    if (wasUpset && !isOT) {
      signals.push({
        type: 'lastGameUpset', score: 120,
        headline: 'UPSET\nCOMPLETE',
        subtext: `${shortName} took down ${opp} ${sc}. The market is recalibrating.`,
      });
    }

    if (margin <= 6) {
      signals.push({
        type: 'lastGameClose', score: 100,
        headline: won ? 'DOWN TO\nTHE WIRE' : 'WENT DOWN\nFIGHTING',
        subtext: won
          ? `${shortName} edged ${opp} ${sc}.${atsSnippet ? ' ' + atsSnippet : ''}`
          : `${shortName} fell to ${opp} ${sc} in a tight battle.${atsSnippet ? ' ' + atsSnippet : ''}`,
      });
    }

    if (won && margin >= 15) {
      signals.push({
        type: 'lastGameStatement', score: 95,
        headline: 'STATEMENT\nWIN',
        subtext: `${shortName} dominated ${opp} by ${margin}, ${sc}.${atsSnippet ? ' ' + atsSnippet : ''}`,
      });
    }
  }

  // ── ATS SIGNALS ────────────────────────────────────────────────────────────
  if (l7 && l7.pct >= 0.70) {
    const pct = Math.round(l7.pct * 100);
    const games = l7.w + l7.l;
    signals.push({
      type: 'atsHot', score: 90,
      headline: pct === 100 && games >= 3 ? 'PERFECT\nAGAINST THE NUMBER' : 'HEATING UP',
      subtext: `Covering at ${pct}% over the last ${games}. The number hasn\u2019t caught up to ${shortName}.`,
    });
  }

  if (l7 && l30 && l7.pct > l30.pct + 0.10 && l7.pct >= 0.58) {
    signals.push({
      type: 'atsAcceleration', score: 80,
      headline: 'MARKET\nLATE AGAIN',
      subtext: `${shortName}\u2019s cover rate is accelerating. L7: ${l7.w}\u2013${l7.l}. Market still adjusting.`,
    });
  }

  if ((l7 && l7.pct <= 0.38) || (l30 && l30.pct <= 0.38)) {
    const window = l7 && l7.pct <= 0.38 ? l7 : l30;
    const pct = window ? Math.round(window.pct * 100) : 0;
    signals.push({
      type: 'atsCooling', score: 50,
      headline: 'MARKET\nHAS ADJUSTED',
      subtext: `${shortName}\u2019s ATS rate has cooled to ${pct}%. The line has caught up.`,
    });
  }

  if (ssn && ssn.pct >= 0.60) {
    const pct = Math.round(ssn.pct * 100);
    signals.push({
      type: 'marketBehind', score: 60,
      headline: 'BOOKS STILL\nBEHIND',
      subtext: `${shortName} is ${ssn.w}\u2013${ssn.l} ATS (${pct}%) this season. Sharp money has noticed.`,
    });
  }

  // ── TEAM MOMENTUM ──────────────────────────────────────────────────────────
  if (rank && rank <= 25 && last10W >= 7 && last10Total >= 8) {
    const isMarch = new Date().getMonth() === 2;
    signals.push({
      type: 'rankedMomentum', score: 70,
      headline: isMarch ? 'MARCH\nMOMENTUM' : 'BUILDING\nMOMENTUM',
      subtext: `#${rank} ${shortName} is ${last10W}\u2013${last10Total - last10W} in the last ${last10Total} heading into ${conf || 'postseason'} play.`,
    });
  }

  if (last10W >= 8 && last10Total >= 10) {
    signals.push({
      type: 'surgingTeam', score: 55,
      headline: 'SURGING',
      subtext: `${shortName} has won ${last10W} of its last ${last10Total}. The momentum is real.`,
    });
  }

  // ── TOURNAMENT POSITIONING ─────────────────────────────────────────────────
  const isMarch = new Date().getMonth() === 2;
  if (isMarch && conf) {
    signals.push({
      type: 'conferenceTournament', score: 65,
      headline: 'TOURNAMENT\nTIME',
      subtext: last10Total > 0
        ? `${conf} tournament on deck. ${shortName} is ${last10W}\u2013${last10Total - last10W} in the last ${last10Total}.`
        : `${conf} tournament approaching for ${shortName}.`,
    });
  }

  if (!rank && recP && recP.pct >= 0.50 && recP.pct <= 0.58) {
    signals.push({
      type: 'bubbleWatch', score: 65,
      headline: 'BUBBLE\nWATCH',
      subtext: `${shortName} sits at ${recP.w}\u2013${recP.l} overall. Tournament positioning still in play.`,
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
  signals.push({
    type: 'standard', score: 10,
    headline: ssn && ssn.pct >= 0.55 ? 'WATCH THIS\nNUMBER' : 'FULL INTEL\nREPORT',
    subtext: ssn
      ? `${shortName} is ${ssn.w}\u2013${ssn.l} ATS (${Math.round(ssn.pct * 100)}%) on the season.`
      : `Full market intelligence on ${shortName}.`,
  });

  return signals;
}

/**
 * Context layer: adjusts signal scores based on environmental factors.
 * Returns { signalType: scoreAdjustment } map.
 */
function buildContextSignals(ctx) {
  const { l7, ssn, lastGameMeta, newsHeadlines } = ctx;
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
  const overallRecord = team.record?.items?.[0]?.summary
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

  // ── Last game metadata (for narrative engine + schedule render) ────────────
  const lastGameEvent = recentFinished[0] ?? null;
  const lastGameMeta  = extractLastGameMeta(lastGameEvent, slug, name);

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
      nextOpp  = opp?.team?.displayName || opp?.team?.name || null;
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

  // ── Maximus pick — scoped to this team's next matchup ─────────────────────
  const games = data?.odds?.games ?? [];
  let teamPick = null;
  try {
    const picks = buildMaximusPicks({ games, atsLeaders: data?.atsLeaders ?? { best: [], worst: [] } });
    const all   = [...(picks.atsPicks ?? []), ...(picks.mlPicks ?? [])];
    const tFrag = name ? name.toLowerCase().split(' ').pop() : '';
    const oFrag = nextOpp ? nextOpp.toLowerCase().split(' ').pop() : '';
    if (tFrag && oFrag) {
      teamPick = all.find(p => {
        const ht = (p.homeTeam || '').toLowerCase();
        const at = (p.awayTeam || '').toLowerCase();
        return (ht.includes(tFrag) || at.includes(tFrag)) && (ht.includes(oFrag) || at.includes(oFrag));
      }) ?? null;
    }
    if (!teamPick && tFrag) {
      teamPick = all.find(p => {
        const ht = (p.homeTeam || '').toLowerCase();
        const at = (p.awayTeam || '').toLowerCase();
        return ht.includes(tFrag) || at.includes(tFrag);
      }) ?? null;
    }
  } catch { /* ignore */ }

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

  // ATS windows
  const atsWindows = [
    { label: 'ATS L7',  parsed: l7P  },
    { label: 'ATS L30', parsed: l30P },
    { label: 'ATS SZN', parsed: ssnP },
  ].filter(w => w.parsed != null);

  // Record display line
  const recordLineParts = [];
  if (overallRecord) recordLineParts.push(`${overallRecord.replace('-', '\u2013')} overall`);
  if (confRecord)    recordLineParts.push(`${confRecord.replace('-', '\u2013')} ${conf || 'conf.'}`);
  if (last10.length >= 5) recordLineParts.push(`${last10W}\u2013${last10.length - last10W} last ${last10.length}`);
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
        {slug ? (
          <img
            src={`/logos/${slug}.png`}
            alt={name}
            className={styles.teamLogo}
            crossOrigin="anonymous"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className={styles.logoFallback} />
        )}
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

      {/* Contextual subtext — generated by the winning narrative signal */}
      {narrative.subtext && (
        <div className={styles.quickIntel}>{narrative.subtext}</div>
      )}

      {/* ATS grid */}
      {atsWindows.length > 0 && (
        <div className={styles.atsGrid}>
          {atsWindows.map((w, i) => (
            <div key={i} className={styles.atsChip}>
              <div className={styles.atsLabel}>{w.label}</div>
              <div className={styles.atsValue}>{w.parsed.w}\u2013{w.parsed.l}</div>
              <div className={styles.atsPct}>{Math.round(w.parsed.pct * 100)}%</div>
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
                  {lastGameMeta.won ? 'W' : 'L'} {lastGameMeta.ourScore}\u2013{lastGameMeta.oppScore}
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
