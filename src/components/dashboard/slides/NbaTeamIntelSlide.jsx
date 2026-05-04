/**
 * NbaTeamIntelSlide — Instagram Hero Summary for NBA Team Intel.
 *
 * Mirrors MlbTeamIntelSlide STRUCTURE exactly (header → logo hero →
 * identity chips → headline → subhead → stat band → intel bullets →
 * leaders strip → footer), but with:
 *   - NBA black+gold theme
 *   - NBA-specific stat band (title odds, playoff seed, series state)
 *   - NBA-specific bullet ingredients (series score, recent result,
 *     star player impact, playoff leverage, rebounding/defense signals)
 *   - PPG / APG / RPG / SPG / BPG leaders strip
 *
 * Does NOT use the NCAAM "Deep Dive" template or any regular-season
 * framing. Playoff-first when the team is in a series.
 *
 * 1080×1350 IG portrait.
 */

import { useState } from 'react';
import { getNbaEspnLogoUrl } from '../../../utils/espnNbaLogos';
import { NBA_TEAMS } from '../../../sports/nba/teams';
import { buildNbaPlayoffContext } from '../../../data/nba/playoffContext';
import { LEADER_CATEGORIES } from '../../../data/nba/seasonLeaders';
import { resolveCanonicalNbaPicks } from '../../../features/nba/contentStudio/resolveSlidePicks';
import styles from './NbaSlides.module.css';

const ROUND_LABEL = {
  1: 'Round 1',
  2: 'Conference Semifinals',
  3: 'Conference Finals',
  4: 'NBA Finals',
};

function formatRoundShort(round, conference) {
  if (round === 2) return conference === 'Eastern' ? 'East Semifinals' : 'West Semifinals';
  if (round === 3) return `${conference === 'Eastern' ? 'East' : 'West'} Finals`;
  if (round === 4) return 'NBA Finals';
  return 'Round 1';
}

// ── Helpers ──────────────────────────────────────────────────────────────

function fmtAmerican(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  return v > 0 ? `+${v}` : `${v}`;
}

function oddsToProb(american) {
  if (american == null || !Number.isFinite(Number(american))) return null;
  const v = Number(american);
  return v < 0 ? Math.abs(v) / (Math.abs(v) + 100) : 100 / (v + 100);
}

function classifyContender(prob) {
  if (prob == null) return 'Long Shot';
  if (prob >= 0.15) return 'Title Favorite';
  if (prob >= 0.06) return 'Contender';
  if (prob >= 0.02) return 'Upside Team';
  return 'Long Shot';
}

function getTeamMeta(slug) {
  return NBA_TEAMS.find(t => t.slug === slug) || null;
}

function TeamLogo({ slug, name }) {
  const [failed, setFailed] = useState(false);
  const url = slug ? getNbaEspnLogoUrl(slug) : null;
  const initials = (name || '').split(' ').slice(-1)[0]?.slice(0, 3).toUpperCase() || '?';
  if (failed || !url) {
    return (
      <div className={styles.tiLogoWrap}>
        <span style={{ fontSize: 48, fontWeight: 900, color: 'var(--nba-gold-bright)' }}>{initials}</span>
      </div>
    );
  }
  return (
    <div className={styles.tiLogoWrap}>
      <img
        src={url} alt={name || ''} className={styles.tiLogo}
        loading="eager" decoding="sync" crossOrigin="anonymous"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

// ── Playoff-aware Team Intel Briefing builder (inline, NBA-specific) ────

/**
 * Resolve the Maximus's Picks model outlook for a team's NEXT game from
 * the canonical picks resolver — no separate heuristic. Returns null
 * when the team isn't on the picks board (caller renders a "model
 * board not posted yet" line).
 */
function resolveTeamModelOutlook(team, payload) {
  if (!team?.slug) return null;
  const picks = resolveCanonicalNbaPicks(payload || {});
  if (!Array.isArray(picks) || picks.length === 0) return null;
  // Group all picks for this team's next game (matched by slug on
  // either side of the matchup).
  const teamPicks = picks.filter(p => {
    const a = p?.matchup?.awayTeam?.slug;
    const h = p?.matchup?.homeTeam?.slug;
    return a === team.slug || h === team.slug;
  });
  if (teamPicks.length === 0) return null;
  // Identify the opponent + which side this team is on (for ML / ATS
  // direction).
  const sample = teamPicks[0];
  const isAway = sample?.matchup?.awayTeam?.slug === team.slug;
  const opp = isAway ? sample?.matchup?.homeTeam : sample?.matchup?.awayTeam;
  const teamSide = isAway ? 'away' : 'home';
  // Per-market resolution.
  const ml = teamPicks.find(p => p._cat === 'Moneyline');
  const ats = teamPicks.find(p => p._cat === 'Spread');
  const totals = teamPicks.find(p => p._cat === 'Total');
  function direction(p) {
    if (!p) return null;
    return p?.pick?.side === teamSide ? 'team' : 'opp';
  }
  return {
    opp,
    isAway,
    ml: ml ? { dir: direction(ml), label: ml?.pick?.label || '—' } : null,
    ats: ats ? { dir: direction(ats), label: ats?.pick?.label || '—' } : null,
    totals: totals ? { label: totals?.pick?.label || '—' } : null,
  };
}

/**
 * Produces 5–6 bullets, integrity-first. Each bullet has a TAG and a
 * text body. Order:
 *   PLAYOFF STANDING    — series state + round (path-verified copy)
 *   LAST GAME           — last final w/ score; never inferred
 *   NEXT GAME           — scheduled game OR awaiting-schedule fallback
 *   MODEL OUTLOOK       — canonical-picks ML / ATS / total leans
 *   KEY DRIVER          — series leader (or playoff-leader fallback)
 *   OUTLOOK             — title odds + tier + path note
 */
function buildNbaTeamBriefing({
  team, standings, mySeries, recentFinal, nextGame,
  champOddsEntry, teamLeaders, modelOutlook,
}) {
  const bullets = [];
  const short = team?.abbrev || team?.name || 'Team';

  // 1. PLAYOFF STANDING — series state, complete-aware (no "lead 4-3"
  //    when complete). Reads path-verified seriesStates from the
  //    enriched series.
  if (mySeries) {
    const isTop = mySeries.topTeam?.slug === team.slug;
    const myWins = isTop ? mySeries.seriesScore?.top ?? 0 : mySeries.seriesScore?.bottom ?? 0;
    const oppWins = isTop ? mySeries.seriesScore?.bottom ?? 0 : mySeries.seriesScore?.top ?? 0;
    const oppAbbr = isTop ? mySeries.bottomTeam?.abbrev : mySeries.topTeam?.abbrev;
    const roundLabel = ROUND_LABEL[mySeries.round] || `Round ${mySeries.round || 1}`;
    const states = mySeries.seriesStates || {};
    if (mySeries.isComplete) {
      const weWon = states.winnerSlug === team.slug;
      if (weWon) {
        const action = oppWins === 0 ? `swept ${oppAbbr}` : `won ${myWins}-${oppWins} over ${oppAbbr}`;
        const surviveTag = states.clinchedInGame7 && !states.winnerWasDown31 ? ' — survived Game 7' : '';
        const nextRoundLabel = (mySeries.round || 1) === 1
          ? formatRoundShort(2, team.conference)
          : (ROUND_LABEL[(mySeries.round || 1) + 1] || 'next round');
        bullets.push({
          tag: 'PLAYOFF STANDING',
          text: `${short} ${action} in ${roundLabel}${surviveTag}. Advances to the ${nextRoundLabel}.`,
        });
      } else {
        bullets.push({
          tag: 'PLAYOFF STANDING',
          text: `${short} fell to ${oppAbbr} ${oppWins}-${myWins} in ${roundLabel}. Season ends here.`,
        });
      }
    } else if (mySeries.gamesPlayed > 0) {
      let lead;
      if (myWins > oppWins) lead = `lead ${oppAbbr} ${myWins}-${oppWins}`;
      else if (myWins < oppWins) lead = `trail ${oppAbbr} ${oppWins}-${myWins}`;
      else lead = `tied with ${oppAbbr} ${myWins}-${oppWins}`;
      bullets.push({
        tag: 'PLAYOFF STANDING',
        text: `${short} ${lead} in the ${roundLabel}.`,
      });
    } else {
      bullets.push({
        tag: 'PLAYOFF STANDING',
        text: `${short} face ${oppAbbr} in the ${roundLabel} — Game 1 sets the tone.`,
      });
    }
  } else if (standings?.playoffSeed) {
    bullets.push({
      tag: 'PLAYOFF STANDING',
      text: `${short} (${standings.record}) — #${standings.playoffSeed} seed in the ${team.conference} Conference.`,
    });
  }

  // 2. LAST GAME — verified box score with score + opponent. Never
  //    inferred. If we can't pinpoint a recent final, skip cleanly.
  if (recentFinal) {
    const aSlug = recentFinal.teams?.away?.slug;
    const hSlug = recentFinal.teams?.home?.slug;
    const aScore = Number(recentFinal.teams?.away?.score ?? 0);
    const hScore = Number(recentFinal.teams?.home?.score ?? 0);
    const isAway = team.slug === aSlug;
    const oppSlug = isAway ? hSlug : aSlug;
    const oppMeta = getTeamMeta(oppSlug);
    const oppAbbr = oppMeta?.abbrev || oppSlug?.toUpperCase() || 'opp';
    const myScore = isAway ? aScore : hScore;
    const oppScore = isAway ? hScore : aScore;
    const won = myScore > oppScore;
    bullets.push({
      tag: 'LAST GAME',
      text: won
        ? `${short} beat ${oppAbbr} ${myScore}-${oppScore} in ${isAway ? 'Toronto' === oppMeta?.name ? 'Toronto' : 'on the road' : 'the most recent game'}.`
        : `${short} fell to ${oppAbbr} ${oppScore}-${myScore} in the most recent game.`,
    });
  }

  // 3. NEXT GAME — verified scheduled game when available, otherwise
  //    a safe "awaiting schedule vs X" fallback (or "awaiting next
  //    opponent" if no R2 matchup is known yet).
  if (nextGame?.opp && nextGame?.startTime) {
    const dt = new Date(nextGame.startTime);
    const dateLabel = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
    const roundLabel = formatRoundShort(nextGame.round || 2, team.conference);
    const gameTag = nextGame.gameNumber ? ` Game ${nextGame.gameNumber}` : '';
    bullets.push({
      tag: 'NEXT GAME',
      text: `${roundLabel}${gameTag} vs ${nextGame.opp.abbrev || nextGame.opp.slug?.toUpperCase()} — ${dateLabel}.`,
    });
  } else if (nextGame?.opp) {
    const roundLabel = formatRoundShort(nextGame.round || 2, team.conference);
    bullets.push({
      tag: 'NEXT GAME',
      text: `Awaiting Game 1 schedule — ${roundLabel} vs ${nextGame.opp.abbrev || nextGame.opp.slug?.toUpperCase()}.`,
    });
  } else if (mySeries?.isComplete) {
    bullets.push({
      tag: 'NEXT GAME',
      text: `${short} await their next-round opponent.`,
    });
  }

  // 4. MODEL OUTLOOK — strictly from the canonical picks resolver. If
  //    the team isn't on the board, render a safe "model board not
  //    posted yet" line. NEVER fabricate a pick.
  if (modelOutlook) {
    const oppAbbr = modelOutlook.opp?.abbrev || modelOutlook.opp?.slug?.toUpperCase() || 'opp';
    const parts = [];
    if (modelOutlook.ml) {
      parts.push(modelOutlook.ml.dir === 'team'
        ? `ML lean ${short}`
        : `ML lean ${oppAbbr}`);
    }
    if (modelOutlook.ats) parts.push(`ATS: ${modelOutlook.ats.label}`);
    if (modelOutlook.totals) parts.push(`Total: ${modelOutlook.totals.label}`);
    if (parts.length > 0) {
      bullets.push({ tag: 'MODEL OUTLOOK', text: `Maximus model — ${parts.join(' · ')}.` });
    }
  } else {
    bullets.push({
      tag: 'MODEL OUTLOOK',
      text: 'Model board not posted yet — picks publish closer to tip-off.',
    });
  }

  // 5. KEY DRIVER — series leader for this team. Phrased as "playoff
  //    leader" not "tonight's stat line" because we're reading from
  //    the postseason leaders board (per-game averages), not a single
  //    box score. Integrity > hype.
  const teamLeader = teamLeaders
    ?.map(c => ({ cat: c, best: c.leaders?.find?.(l => l.teamAbbrev === team.abbrev) }))
    ?.find(x => x.best);
  if (teamLeader?.best) {
    const v = teamLeader.best.display || teamLeader.best.value;
    bullets.push({
      tag: 'KEY DRIVER',
      text: `${teamLeader.best.name} leads ${short} in playoff ${teamLeader.cat.label.toLowerCase()} at ${v}${teamLeader.cat.abbrev === 'PTS' ? ' PPG' : ''}.`,
    });
  }

  // 6. OUTLOOK — title odds + tier + path note.
  const prob = oddsToProb(champOddsEntry?.bestChanceAmerican ?? champOddsEntry?.american);
  const label = classifyContender(prob);
  if (champOddsEntry?.bestChanceAmerican != null) {
    const odds = fmtAmerican(champOddsEntry.bestChanceAmerican);
    let tail;
    if (label === 'Title Favorite') tail = `Every win compresses the market further.`;
    else if (label === 'Contender') tail = `A series win moves them up the title board.`;
    else tail = `First-round outcomes shape the value.`;
    bullets.push({
      tag: 'OUTLOOK',
      text: `Title odds ${odds} — ${label}. ${tail}`,
    });
  }

  return bullets.slice(0, 6);
}

// ── Component ────────────────────────────────────────────────────────────

export default function NbaTeamIntelSlide({ data, teamData, asOf: _asOf, slideNumber: _sn, slideTotal: _st, ...rest }) {
  // [NBA_TEAM_INTEL_RENDER_START] — emitted on every render attempt
  // with payload key context so the next render error has a precise
  // breadcrumb instead of a silent error-boundary swallow.
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.log('[NBA_TEAM_INTEL_RENDER_START]', {
      hasData: !!data,
      hasTeamData: !!teamData,
      teamSlug: teamData?.team?.slug || data?.nbaSelectedTeam?.slug || null,
      dataKeys: data ? Object.keys(data).slice(0, 20) : [],
    });
  }
  // Accept team either from `teamData.team` (Dashboard passes this) or by
  // looking up the selected slug in `data.nbaSelectedTeam`.
  const team = teamData?.team || data?.nbaSelectedTeam || data?.teamA;
  const slug = team?.slug;
  if (!slug) {
    return (
      <div className={styles.ti} data-slide="team-intel" {...rest}>
        <div className={styles.bgBase} />
        <div className={styles.bgGlow} />
        <div className={styles.tiHeadline} style={{ textAlign: 'center', marginTop: 520 }}>
          Select an NBA team to generate Team Intel
        </div>
      </div>
    );
  }

  const standings = data?.nbaStandings?.[slug] || null;
  const champOddsEntry = data?.nbaChampOdds?.[slug] || null;
  const leaders = data?.nbaLeaders?.categories || {};
  const liveGames = data?.nbaLiveGames || [];
  const windowGames = data?.nbaWindowGames || [];

  // Playoff context — find this team's MOST RECENT series (active or
  // just-completed). `allSeries` exposes every non-stale series across
  // rounds, so a Round-1 winner heading into the semis still surfaces
  // here even though `pc.series` (current round) excludes them.
  const pc = data?.nbaPlayoffContext || buildNbaPlayoffContext({ liveGames });
  const allSeries = pc?.allSeries || pc?.series || [];
  const teamSeriesAll = allSeries.filter(s =>
    s?.topTeam?.slug === slug || s?.bottomTeam?.slug === slug
  );
  // Prefer the highest-round (newest) active series; fall back to the
  // highest-round series the team has played.
  const sortedTeamSeries = teamSeriesAll
    .slice()
    .sort((a, b) => (b.round || 0) - (a.round || 0));
  const activeSeries = sortedTeamSeries.find(s => !s.isComplete) || null;
  const mySeries = activeSeries || sortedTeamSeries[0] || null;
  // Most recent COMPLETED prior-round series — if mySeries is the
  // upcoming/in-progress next round, we still want LAST GAME and
  // PLAYOFF STANDING to come from the just-finished series.
  const completedSeries = sortedTeamSeries.find(s => s.isComplete) || null;
  const standingsSeries = activeSeries || completedSeries || mySeries;

  // Most recent finished game involving this team — pulls from BOTH
  // liveGames (today) and windowGames (multi-day window, captures
  // the Game 7 clincher when liveGames is empty).
  const allGames = [...liveGames, ...windowGames];
  const seenIds = new Set();
  const dedupedGames = [];
  for (const g of allGames) {
    if (!g?.gameId || seenIds.has(g.gameId)) continue;
    seenIds.add(g.gameId);
    dedupedGames.push(g);
  }
  const teamFinals = dedupedGames
    .filter(g => (g.gameState?.isFinal || g.status === 'final')
      && (g.teams?.away?.slug === slug || g.teams?.home?.slug === slug))
    .sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0));
  const recentFinal = teamFinals[0] || null;

  // Next game for this team — from the schedule window (upcoming
  // games) OR from the active series's nextGame field. We resolve
  // the opponent via the live series first; if the team just finished
  // Round 1 and Round 2 isn't scheduled yet, opp may still be unknown
  // (the briefing renders "awaiting next-round opponent" then).
  const nextGameRaw = (() => {
    if (activeSeries?.nextGame) {
      const ng = activeSeries.nextGame;
      const oppSlug = ng.teams?.away?.slug === slug ? ng.teams?.home?.slug : ng.teams?.away?.slug;
      const oppMeta = getTeamMeta(oppSlug);
      return {
        startTime: ng.startTime,
        round: activeSeries.round,
        gameNumber: activeSeries.nextGameNumber || (activeSeries.gamesPlayed + 1),
        opp: { slug: oppSlug, abbrev: oppMeta?.abbrev, name: oppMeta?.name },
      };
    }
    // Look in windowGames for any future scheduled game vs this team.
    const upcoming = dedupedGames
      .filter(g => !(g.gameState?.isFinal || g.status === 'final'))
      .filter(g => g.teams?.away?.slug === slug || g.teams?.home?.slug === slug)
      .filter(g => g.startTime && new Date(g.startTime).getTime() > Date.now() - 4 * 60 * 60 * 1000)
      .sort((a, b) => new Date(a.startTime || 0) - new Date(b.startTime || 0));
    if (upcoming[0]) {
      const g = upcoming[0];
      const oppSlug = g.teams?.away?.slug === slug ? g.teams?.home?.slug : g.teams?.away?.slug;
      const oppMeta = getTeamMeta(oppSlug);
      return {
        startTime: g.startTime,
        round: standingsSeries?.round,
        gameNumber: null,
        opp: { slug: oppSlug, abbrev: oppMeta?.abbrev, name: oppMeta?.name },
      };
    }
    return null;
  })();

  // Leader cards with resolved values
  const teamLeadersBrief = LEADER_CATEGORIES
    .map(c => ({
      ...c,
      leaders: leaders[c.key]?.leaders || [],
      best: leaders[c.key]?.teamBest?.[team.abbrev] || null,
    }));

  // Model outlook — resolved from the SAME canonical picks resolver
  // that drives Slide 1, Slide 2, and the caption. No separate model
  // heuristic.
  const modelOutlook = resolveTeamModelOutlook(team, data);

  const bullets = buildNbaTeamBriefing({
    team, standings,
    mySeries: standingsSeries,
    recentFinal,
    nextGame: nextGameRaw,
    champOddsEntry,
    teamLeaders: teamLeadersBrief,
    modelOutlook,
  });

  // Diagnostic logs — visible from the browser/server console alone
  // when a Team Intel slide ships with the wrong series state or a
  // missing model outlook.
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.log('[NBA_TEAM_INTEL_SERIES_STATUS]', {
      team: team?.abbrev || slug,
      activeSeriesRound: activeSeries?.round || null,
      completedSeriesRound: completedSeries?.round || null,
      isComplete: !!standingsSeries?.isComplete,
      seriesScore: standingsSeries?.seriesScore?.summary,
      seriesStates: standingsSeries?.seriesStates || null,
    });
    // eslint-disable-next-line no-console
    console.log('[NBA_TEAM_INTEL_PAYLOAD_FINAL]', {
      team: team?.abbrev || slug,
      bulletTags: bullets.map(b => b.tag),
      modelOutlook: modelOutlook ? {
        opp: modelOutlook.opp?.abbrev,
        ml: modelOutlook.ml?.dir,
        ats: modelOutlook.ats?.label,
        totals: modelOutlook.totals?.label,
      } : null,
    });
  }

  // Stat band — NBA-specific (not projected wins). Series tile is
  // complete-aware: a finished R1 series shows "WON 4-3" (or "SWEPT
  // 4-0") with sub "Round 1", and a brand-new R2 series with no
  // games yet shows "0-0" + "East Semis" so the tile still scans.
  const prob = oddsToProb(champOddsEntry?.bestChanceAmerican ?? champOddsEntry?.american);
  const seriesTileValue = (() => {
    if (!standingsSeries) return '—';
    const ts = standingsSeries.seriesScore?.top ?? 0;
    const bs = standingsSeries.seriesScore?.bottom ?? 0;
    const isTop = standingsSeries.topTeam?.slug === slug;
    const myWins = isTop ? ts : bs;
    const oppWins = isTop ? bs : ts;
    if (standingsSeries.isComplete) {
      const won = standingsSeries.seriesStates?.winnerSlug === slug;
      if (won) return oppWins === 0 ? `SWEPT ${myWins}-${oppWins}` : `WON ${myWins}-${oppWins}`;
      return `LOST ${oppWins}-${myWins}`;
    }
    return `${myWins}-${oppWins}`;
  })();
  const seriesTileSub = standingsSeries
    ? formatRoundShort(standingsSeries.round || 1, team.conference)
    : 'Season Final';
  const statBand = [
    { label: 'Title Odds', value: fmtAmerican(champOddsEntry?.bestChanceAmerican), sub: classifyContender(prob) },
    { label: 'Playoff Seed', value: standings?.playoffSeed != null ? `#${standings.playoffSeed}` : '—', sub: team.conference },
    { label: 'Record', value: standings?.record || '—', sub: standings?.streak ? `Streak: ${standings.streak}` : '' },
    { label: 'Series', value: seriesTileValue, sub: seriesTileSub },
  ];

  // Headline — complete-aware. A team that just won 4-3 reads:
  //   "CLE — WON 4-3, ADVANCE TO EAST SEMIS"  (instead of the
  //   illogical "CAVALIERS LEAD 4-3" we were shipping).
  const headline = (() => {
    const short = team.abbrev || team.name;
    if (!standingsSeries) return `${team.name} Team Intel Report`;
    const isTop = standingsSeries.topTeam?.slug === slug;
    const myWins = isTop ? (standingsSeries.seriesScore?.top ?? 0) : (standingsSeries.seriesScore?.bottom ?? 0);
    const oppWins = isTop ? (standingsSeries.seriesScore?.bottom ?? 0) : (standingsSeries.seriesScore?.top ?? 0);
    const oppAbbr = isTop ? standingsSeries.bottomTeam?.abbrev : standingsSeries.topTeam?.abbrev;
    if (standingsSeries.isComplete) {
      const won = standingsSeries.seriesStates?.winnerSlug === slug;
      if (won) {
        const action = oppWins === 0 ? `swept ${oppAbbr}` : `won ${myWins}-${oppWins} over ${oppAbbr}`;
        const next = (standingsSeries.round || 1) === 1
          ? formatRoundShort(2, team.conference)
          : (ROUND_LABEL[(standingsSeries.round || 1) + 1] || 'next round');
        return `${short} ${action} — advances to the ${next}`;
      }
      return `${short} fell to ${oppAbbr} ${oppWins}-${myWins}`;
    }
    if (myWins > oppWins) return `${short} lead ${oppAbbr} ${myWins}-${oppWins}`;
    if (myWins < oppWins) return `${short} trail ${oppAbbr} ${oppWins}-${myWins}`;
    if (myWins === oppWins && myWins > 0) return `${short} tied with ${oppAbbr} ${myWins}-${oppWins}`;
    return `${short} face ${oppAbbr} — ${formatRoundShort(standingsSeries.round || 1, team.conference)} starts`;
  })();
  const subhead = (() => {
    if (!standingsSeries) return 'Model projections, recent form, and title-path signals.';
    if (standingsSeries.isComplete) {
      return `${formatRoundShort(standingsSeries.round || 1, team.conference)} in the books — focus shifts to the next round.`;
    }
    const r = formatRoundShort(standingsSeries.round || 1, team.conference);
    return `${r} in motion. Series-level edges and model leans below.`;
  })();

  return (
    <div className={styles.ti} data-slide="team-intel" {...rest}>
      <div className={styles.bgBase} />
      <div className={styles.bgGlow} />
      <div className={styles.bgStreaks} />
      <div className={styles.bgNoise} />

      <header className={styles.tiTopBar}>
        <div className={styles.tiLabel}>
          <span>🏀</span><span>NBA TEAM INTEL</span>
        </div>
        <div className={styles.tiTimestamp}>
          {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      </header>

      <div className={styles.tiHero}>
        <TeamLogo slug={slug} name={team.name} />
        <div className={styles.tiHeroRight}>
          <div className={styles.tiTeamName}>{team.name}</div>
          <div className={styles.tiChips}>
            {team.conference && <span className={styles.tiChip}>{team.conference}</span>}
            {team.division && <span className={styles.tiChip}>{team.division}</span>}
            {standings?.playoffSeed && <span className={styles.tiChip}>#{standings.playoffSeed} Seed</span>}
            {/* Round chip uses standingsSeries (renamed from liveSeries
                in the path-verified refactor). The previous reference
                threw `ReferenceError: liveSeries is not defined` → the
                SlideErrorBoundary caught it and surfaced the "Preview
                Error" panel users reported. */}
            {standingsSeries?.round && <span className={styles.tiChip}>{formatRoundShort(standingsSeries.round, team.conference)}</span>}
          </div>
          {standings?.record && <div className={styles.tiRecord}>Record: {standings.record}{standings.streak ? ` · ${standings.streak}` : ''}</div>}
        </div>
      </div>

      <h2 className={styles.tiHeadline}>{headline}</h2>
      <div className={styles.tiSubhead}>{subhead}</div>

      <div className={styles.tiStatStrip}>
        {statBand.map((s, i) => (
          <div key={i} className={styles.tiStatTile}>
            <div className={styles.tiStatLabel}>{s.label}</div>
            <div className={styles.tiStatValue}>{s.value}</div>
            {s.sub && <div className={styles.tiStatSub}>{s.sub}</div>}
          </div>
        ))}
      </div>

      <div className={styles.tiBriefing}>
        <div className={styles.tiBriefingHeader}>
          <span>📋</span><span>TEAM INTEL BRIEFING</span>
        </div>
        <div className={styles.tiBulletList}>
          {bullets.map((b, i) => (
            <div key={i} className={styles.tiBulletRow}>
              <div className={styles.tiBulletTag}>{b.tag}</div>
              <div className={styles.tiBulletText}>{b.text}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.tiLeaders}>
        <div className={styles.tiLeadersHeader}>
          <span>🏆</span><span>TEAM LEADERS</span>
        </div>
        <div className={styles.tiLeadersGrid}>
          {teamLeadersBrief.map(c => (
            <div key={c.key} className={styles.tiLeaderCat}>
              <div className={styles.tiLeaderCatLabel}>{c.abbrev}</div>
              <div className={styles.tiLeaderName}>{c.best?.name || '—'}</div>
              <div className={styles.tiLeaderValue}>{c.best?.display || (c.best?.value != null ? String(c.best.value) : '—')}</div>
            </div>
          ))}
        </div>
      </div>

      <footer className={styles.tiFooter}>
        <div className={styles.s1CtaPill}>
          <span className={styles.s1CtaLabel}>MORE AT</span>
          <span className={styles.s1CtaSite}>maximussports.ai</span>
        </div>
      </footer>
    </div>
  );
}
