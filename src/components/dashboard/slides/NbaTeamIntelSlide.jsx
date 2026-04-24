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
import styles from './NbaSlides.module.css';

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
 * Produces 4–5 bullets with NBA-native categories. Returns:
 *   [{ tag, text }]
 * where tag is one of: STANDINGS | FORM | LAST GAME | DRIVER | RISK.
 * Every bullet is playoff-aware when the team is in an active series.
 */
function buildNbaTeamBriefing({ team, standings, liveSeries, recentFinal, champOddsEntry, teamLeaders }) {
  const bullets = [];
  const teamName = team?.name || 'Team';
  const short = team?.abbrev || teamName;

  // 1. STANDINGS / SEEDING
  if (liveSeries) {
    const isTop = liveSeries.topTeam?.slug === team.slug;
    const mySeed = isTop ? liveSeries.topTeam?.seed : liveSeries.bottomTeam?.seed;
    const oppSeed = isTop ? liveSeries.bottomTeam?.seed : liveSeries.topTeam?.seed;
    const oppAbbrev = isTop ? liveSeries.bottomTeam?.abbrev : liveSeries.topTeam?.abbrev;
    bullets.push({
      tag: 'PLAYOFF SEEDING',
      text: `${short} (#${mySeed ?? '?'}) face ${oppAbbrev} (#${oppSeed ?? '?'}) in ${liveSeries.round === 1 ? 'Round 1' : 'the playoffs'} — ${liveSeries.seriesScore.summary}.`,
    });
  } else if (standings) {
    const seed = standings.playoffSeed ?? standings.rank;
    bullets.push({
      tag: 'STANDINGS',
      text: `${short} finished the regular season ${standings.record} — seeded #${seed ?? '?'} in the ${team?.conference || '?'} Conference.`,
    });
  }

  // 2. FORM / SERIES STATE
  if (liveSeries) {
    if (liveSeries.isElimination && liveSeries.eliminationFor) {
      const facingElim = (liveSeries.topTeam?.slug === team.slug && liveSeries.eliminationFor === 'top')
                     || (liveSeries.bottomTeam?.slug === team.slug && liveSeries.eliminationFor === 'bottom');
      bullets.push({
        tag: 'PLAYOFF LEVERAGE',
        text: facingElim
          ? `${short} face elimination — must win the next game to extend the series.`
          : `${short} one win from closing out the series.`,
      });
    } else if (liveSeries.isUpset) {
      const leaderIsMe = (liveSeries.topTeam?.slug === team.slug && liveSeries.leader === 'top')
                     || (liveSeries.bottomTeam?.slug === team.slug && liveSeries.leader === 'bottom');
      bullets.push({
        tag: 'UPSET WATCH',
        text: leaderIsMe
          ? `${short} flipping bracket expectations — lower seed, now leading the series.`
          : `${short} in upset danger — higher seed trailing a lower-seeded opponent.`,
      });
    } else if (liveSeries.gamesPlayed > 0) {
      bullets.push({
        tag: 'SERIES STATE',
        text: `${liveSeries.seriesScore.summary} after ${liveSeries.gamesPlayed} game${liveSeries.gamesPlayed !== 1 ? 's' : ''}.`,
      });
    }
  } else if (standings?.streak) {
    bullets.push({
      tag: 'FORM',
      text: `Entering the postseason on a ${standings.streak} streak (L10: ${standings.l10 || '—'}).`,
    });
  }

  // 3. LAST GAME
  if (recentFinal) {
    const winnerSlug = (recentFinal.teams?.away?.score ?? 0) > (recentFinal.teams?.home?.score ?? 0)
      ? recentFinal.teams?.away?.slug : recentFinal.teams?.home?.slug;
    const weWon = winnerSlug === team.slug;
    const oppSlug = team.slug === recentFinal.teams?.away?.slug
      ? recentFinal.teams?.home?.slug : recentFinal.teams?.away?.slug;
    const oppMeta = getTeamMeta(oppSlug);
    const mySide = team.slug === recentFinal.teams?.away?.slug ? recentFinal.teams?.away : recentFinal.teams?.home;
    const oppSide = team.slug === recentFinal.teams?.away?.slug ? recentFinal.teams?.home : recentFinal.teams?.away;
    const myScore = Number(mySide?.score ?? 0);
    const oppScore = Number(oppSide?.score ?? 0);
    bullets.push({
      tag: 'LAST GAME',
      text: weWon
        ? `${short} beat ${oppMeta?.abbrev || oppSlug?.toUpperCase() || 'opponent'} ${myScore}-${oppScore} — momentum carries into the next game.`
        : `${short} fell to ${oppMeta?.abbrev || oppSlug?.toUpperCase() || 'opponent'} ${oppScore}-${myScore} — must respond at home.`,
    });
  }

  // 4. DRIVER — team leader from leaders data
  const teamLeader = teamLeaders
    ?.map(c => ({ cat: c, best: c.leaders?.find?.(l => l.teamAbbrev === team.abbrev) }))
    ?.find(x => x.best);
  if (teamLeader?.best) {
    bullets.push({
      tag: 'KEY DRIVER',
      text: `${teamLeader.best.name} pacing the team in ${teamLeader.cat.label.toLowerCase()} at ${teamLeader.best.display || teamLeader.best.value}${teamLeader.cat.abbrev === 'PPG' ? ' a night' : ''}.`,
    });
  }

  // 5. RISK / OUTLOOK — from contender label
  const prob = oddsToProb(champOddsEntry?.bestChanceAmerican ?? champOddsEntry?.american);
  const label = classifyContender(prob);
  if (liveSeries?.isUpset) {
    bullets.push({
      tag: 'OUTLOOK',
      text: `Title odds ${fmtAmerican(champOddsEntry?.bestChanceAmerican)} — ${label}. Bracket already rewriting itself around this series.`,
    });
  } else if (prob != null && prob >= 0.1) {
    bullets.push({
      tag: 'OUTLOOK',
      text: `Championship odds ${fmtAmerican(champOddsEntry?.bestChanceAmerican)} — ${label}. Every playoff win compresses the market further.`,
    });
  } else if (prob != null) {
    bullets.push({
      tag: 'OUTLOOK',
      text: `Championship odds ${fmtAmerican(champOddsEntry?.bestChanceAmerican)} — ${label}. First-round outcomes shape the value.`,
    });
  }

  return bullets.slice(0, 5);
}

// ── Component ────────────────────────────────────────────────────────────

export default function NbaTeamIntelSlide({ data, teamData, asOf: _asOf, slideNumber: _sn, slideTotal: _st, ...rest }) {
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

  // Playoff context — find this team's active series
  const pc = data?.nbaPlayoffContext || buildNbaPlayoffContext({ liveGames });
  let liveSeries = null;
  for (const s of (pc?.series || [])) {
    if (s.topTeam?.slug === slug || s.bottomTeam?.slug === slug) { liveSeries = s; break; }
  }

  // Most recent finished game involving this team
  const teamFinals = liveGames
    .filter(g => (g.gameState?.isFinal || g.status === 'final')
      && (g.teams?.away?.slug === slug || g.teams?.home?.slug === slug))
    .sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0));
  const recentFinal = teamFinals[0] || null;

  // Leader cards with resolved values
  const teamLeadersBrief = LEADER_CATEGORIES
    .map(c => ({
      ...c,
      leaders: leaders[c.key]?.leaders || [],
      best: leaders[c.key]?.teamBest?.[team.abbrev] || null,
    }));

  const bullets = buildNbaTeamBriefing({
    team, standings, liveSeries, recentFinal, champOddsEntry,
    teamLeaders: teamLeadersBrief,
  });

  // Stat band — NBA-specific (not projected wins)
  const prob = oddsToProb(champOddsEntry?.bestChanceAmerican ?? champOddsEntry?.american);
  const statBand = [
    { label: 'Title Odds', value: fmtAmerican(champOddsEntry?.bestChanceAmerican), sub: classifyContender(prob) },
    { label: 'Playoff Seed', value: standings?.playoffSeed != null ? `#${standings.playoffSeed}` : '—', sub: team.conference },
    { label: 'Record', value: standings?.record || '—', sub: standings?.streak ? `Streak: ${standings.streak}` : '' },
    { label: 'Series', value: liveSeries ? `${liveSeries.seriesScore.top}-${liveSeries.seriesScore.bottom}` : '—', sub: liveSeries ? (liveSeries.round === 1 ? 'Round 1' : 'Active') : 'Season Final' },
  ];

  const headline = liveSeries
    ? `${team.abbrev || team.name} — ${liveSeries.seriesScore.summary}`
    : `${team.name} Team Intel Report`;
  const subhead = liveSeries
    ? `${liveSeries.round === 1 ? 'First round' : 'Playoffs'} in motion. Series-level edges and player impact.`
    : 'Model projections, recent form, and title-path signals.';

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
            {liveSeries && <span className={styles.tiChip}>Round {liveSeries.round}</span>}
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
