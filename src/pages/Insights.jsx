/**
 * Odds Insights — Premium Market Intelligence Dashboard
 *
 * Data sources (no new APIs):
 *   fetchHomeFast()  → scoresToday, rankingsTop25
 *   fetchHomeSlow()  → odds.games, upcomingGamesWithSpreads
 *   mergeGamesWithOdds() → unified game model
 *   useAtsLeaders()  → ATS standings (existing hook)
 *   fetchChampionshipOdds() → winner odds (existing)
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { fetchHomeFast, fetchHomeSlow } from '../api/home';
import { fetchChampionshipOdds } from '../api/championshipOdds';
import { mergeGamesWithOdds } from '../api/odds';
import { useAtsLeaders } from '../hooks/useAtsLeaders';
import { getTeamSlug } from '../utils/teamSlug';
import { getSlugFromRankingsName } from '../utils/rankingsNormalize';
import { TEAMS } from '../data/teams';
import ATSLeaderboard from '../components/home/ATSLeaderboard';
import RankingsTable from '../components/insights/RankingsTable';
import ShareButton from '../components/common/ShareButton';
import MaximusPicks from '../components/home/MaximusPicks';
import AffiliateCta, { BrandMark } from '../components/common/AffiliateCta';
import styles from './Insights.module.css';

// ═══════════════════════════════════════════════════════════════════════════
// Analytics Engine — pure functions, no side-effects
// ═══════════════════════════════════════════════════════════════════════════

function parseSpreadNum(s) {
  if (s == null) return NaN;
  return parseFloat(String(s));
}

function parseTotalNum(s) {
  if (s == null) return NaN;
  return parseFloat(String(s));
}

function parseMLPair(mlStr) {
  if (!mlStr || typeof mlStr !== 'string') return { home: NaN, away: NaN };
  const parts = mlStr.split('/');
  if (parts.length < 2) return { home: NaN, away: NaN };
  return {
    home: parseFloat(parts[0].trim()),
    away: parseFloat(parts[1].trim()),
  };
}

function mlToImpliedProb(ml) {
  if (isNaN(ml) || ml == null) return null;
  return ml < 0
    ? Math.abs(ml) / (Math.abs(ml) + 100)
    : 100 / (ml + 100);
}

function mlDisplay(ml) {
  if (ml == null || isNaN(ml)) return '—';
  return ml > 0 ? `+${ml}` : String(ml);
}

function probPct(p) {
  if (p == null) return null;
  return Math.round(p * 100);
}

/** Build name → rank map from rankings array */
function buildRankLookup(rankings) {
  const m = {};
  for (const r of rankings || []) {
    if (r.teamName) m[r.teamName.toLowerCase()] = r.rank;
  }
  return m;
}

/** Fuzzy rank lookup: exact → partial → first-word */
function findRank(name, lookup) {
  if (!name || !lookup) return null;
  const key = name.toLowerCase();
  if (lookup[key] != null) return lookup[key];
  for (const [k, v] of Object.entries(lookup)) {
    if (k.includes(key) || key.includes(k)) return v;
  }
  // First-word fallback (handles "Kentucky Wildcats" vs "Kentucky")
  const firstWord = key.split(/\s+/)[0];
  if (firstWord.length > 3) {
    for (const [k, v] of Object.entries(lookup)) {
      if (k.startsWith(firstWord)) return v;
    }
  }
  return null;
}

const PRIMETIME_NETS = new Set(['ESPN', 'ESPN2', 'CBS', 'ABC', 'FOX', 'FS1', 'TBS', 'TNT', 'TRUETV']);

/**
 * Enrich a merged game object with analytics fields.
 * All derived fields are prefixed with no underscore — treat as read-only.
 */
function enrichGame(g, rankLookup) {
  const spreadNum = parseSpreadNum(g.spread);
  const totalNum = parseTotalNum(g.total);
  const { home: homeML, away: awayML } = parseMLPair(g.moneyline);

  // Favorite determination: moneyline is authoritative (lower price = bigger favorite)
  let homeIsFav = null;
  if (!isNaN(homeML) && !isNaN(awayML)) {
    homeIsFav = homeML <= awayML;
  }

  const favoredTeam = homeIsFav === null ? null : homeIsFav ? g.homeTeam : g.awayTeam;
  const underdogTeam = homeIsFav === null ? null : homeIsFav ? g.awayTeam : g.homeTeam;
  const spreadMag = !isNaN(spreadNum) ? Math.abs(spreadNum) : null;

  const homeRank = findRank(g.homeTeam, rankLookup);
  const awayRank = findRank(g.awayTeam, rankLookup);
  const favoredRank = favoredTeam === g.homeTeam ? homeRank : awayRank;
  const underdogRank = favoredTeam === g.homeTeam ? awayRank : homeRank;

  const homeProb = mlToImpliedProb(homeML);
  const awayProb = mlToImpliedProb(awayML);
  const homeProbPct = probPct(homeProb);
  const awayProbPct = probPct(awayProb);

  // Upset potential: 0 (none) → 3 (high)
  let upsetScore = 0;
  if (favoredRank !== null && underdogRank === null && spreadMag !== null) {
    if (spreadMag <= 4) upsetScore = 2;
    else if (spreadMag <= 8) upsetScore = 1;
  }
  if (underdogRank !== null && favoredRank === null) upsetScore = 3; // ranked underdog
  if (favoredRank !== null && underdogRank !== null && spreadMag !== null && spreadMag <= 5) upsetScore = 3;

  const bothRanked = homeRank !== null && awayRank !== null;
  const topTeam = (homeRank !== null && homeRank <= 10) || (awayRank !== null && awayRank <= 10);
  const netUpper = (g.network || '').toUpperCase().trim();
  const primetime = PRIMETIME_NETS.has(netUpper);

  // High-interest composite (ranked teams OR top-10 OR national TV)
  const interestScore = (bothRanked ? 3 : 0)
    + (topTeam ? 2 : 0)
    + (primetime ? 1 : 0)
    + (homeRank !== null || awayRank !== null ? 1 : 0);

  const hasOdds = g.spread != null || g.total != null || g.moneyline != null;

  return {
    ...g,
    spreadNum: !isNaN(spreadNum) ? spreadNum : null,
    totalNum: !isNaN(totalNum) ? totalNum : null,
    homeML: !isNaN(homeML) ? homeML : null,
    awayML: !isNaN(awayML) ? awayML : null,
    homeIsFav,
    favoredTeam,
    underdogTeam,
    spreadMag,
    homeRank,
    awayRank,
    favoredRank,
    underdogRank,
    homeProb,
    awayProb,
    homeProbPct,
    awayProbPct,
    upsetScore,
    bothRanked,
    topTeam,
    primetime,
    interestScore,
    hasOdds,
  };
}

/** Compute all market-level analytics from enriched game array */
function computeMarketModel(enriched) {
  const withOdds = enriched.filter((g) => g.hasOdds);
  const withSpread = enriched.filter((g) => g.spreadMag !== null);
  const withTotal = enriched.filter((g) => g.totalNum !== null);

  const sorted_spread = [...withSpread].sort((a, b) => (b.spreadMag ?? 0) - (a.spreadMag ?? 0));
  const sorted_total = [...withTotal].sort((a, b) => (b.totalNum ?? 0) - (a.totalNum ?? 0));

  const biggestFavorite = sorted_spread[0] ?? null;
  const closestGame = [...withSpread].sort((a, b) => (a.spreadMag ?? 99) - (b.spreadMag ?? 99))[0] ?? null;
  const highestTotal = sorted_total[0] ?? null;
  const lowestTotal = sorted_total[sorted_total.length - 1] ?? null;

  const avgTotal = withTotal.length > 0
    ? withTotal.reduce((s, g) => s + g.totalNum, 0) / withTotal.length
    : null;

  const highInterest = [...enriched]
    .sort((a, b) => b.interestScore - a.interestScore)
    .slice(0, 4);

  const upsetWatch = enriched
    .filter((g) => g.upsetScore >= 2)
    .sort((a, b) => b.upsetScore - a.upsetScore)
    .slice(0, 4);

  // Spread distribution buckets
  const buckets = [
    { label: '0–3', count: 0 },
    { label: '3–7', count: 0 },
    { label: '7–14', count: 0 },
    { label: '14+', count: 0 },
  ];
  for (const g of withSpread) {
    const m = g.spreadMag;
    if (m < 3) buckets[0].count++;
    else if (m < 7) buckets[1].count++;
    else if (m < 14) buckets[2].count++;
    else buckets[3].count++;
  }

  const rankedCount = enriched.filter((g) => g.homeRank !== null || g.awayRank !== null).length;
  const rankedMatchups = enriched.filter((g) => g.bothRanked);

  return {
    withOdds,
    withSpread,
    withTotal,
    biggestFavorite,
    closestGame,
    highestTotal,
    lowestTotal,
    avgTotal,
    highInterest,
    upsetWatch,
    buckets,
    rankedCount,
    rankedMatchups,
    totalGames: enriched.length,
  };
}

/** Generate a client-side market briefing from enriched model */
function generateBriefing(model) {
  if (!model || model.totalGames === 0) {
    return 'No game data available right now. Check back closer to tip-off.';
  }
  if (model.withOdds.length === 0) {
    return `**${model.totalGames} game${model.totalGames !== 1 ? 's' : ''}** on the slate today — lines not yet posted. Market will open closer to tip-off.`;
  }

  const lines = [];
  lines.push(
    `**${model.withOdds.length} game${model.withOdds.length !== 1 ? 's' : ''}** with active lines today` +
    (model.rankedCount > 0 ? `, including **${model.rankedCount} ranked team${model.rankedCount !== 1 ? 's' : ''}** in action.` : '.')
  );

  if (model.biggestFavorite) {
    const g = model.biggestFavorite;
    const fav = g.favoredTeam || g.homeTeam;
    const opp = g.underdogTeam || g.awayTeam;
    const sp = g.spread ? `(${g.spread})` : g.spreadMag != null ? `(±${g.spreadMag})` : '';
    lines.push(`• **Heaviest favorite:** ${fav} over ${opp} ${sp}${g.favoredRank ? ` — ranked #${g.favoredRank}` : ''}`);
  }

  if (model.closestGame && model.closestGame.spreadMag != null && model.closestGame.spreadMag <= 5) {
    const g = model.closestGame;
    lines.push(`• **Pick 'em game:** ${g.homeTeam} vs ${g.awayTeam} — razor-thin ${g.spread || `±${g.spreadMag}`} line`);
  }

  if (model.highestTotal) {
    const g = model.highestTotal;
    lines.push(`• **Over/under watch:** ${g.homeTeam} vs ${g.awayTeam} tops the board at **${g.total}** points`);
  }

  if (model.rankedMatchups.length > 0) {
    const r = model.rankedMatchups[0];
    lines.push(`• **Top clash:** #${r.homeRank} ${r.homeTeam} vs #${r.awayRank} ${r.awayTeam}${r.spread ? ` — line ${r.spread}` : ''}`);
  }

  if (model.upsetWatch.length > 0) {
    const u = model.upsetWatch[0];
    const dog = u.underdogTeam || u.awayTeam;
    const dogRankLabel = u.underdogRank ? `#${u.underdogRank} ` : '';
    lines.push(`• **Upset alert:** ${dogRankLabel}${dog} showing value — market may be underestimating`);
  }

  if (model.avgTotal !== null) {
    lines.push(`• **Scoring environment:** average O/U is **${model.avgTotal.toFixed(1)}** across today's slate`);
  }

  return lines.join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// Pure SVG / CSS chart primitives — no external library
// ═══════════════════════════════════════════════════════════════════════════

function WinProbBar({ homeProb, awayProb, homeTeam, awayTeam }) {
  if (homeProb == null || awayProb == null) return null;
  const homePct = Math.round(homeProb * 100);
  const awayPct = Math.round(awayProb * 100);
  return (
    <div className={styles.probWrap}>
      <div className={styles.probBar}>
        <div className={styles.probHome} style={{ width: `${homePct}%` }} />
        <div className={styles.probAway} style={{ width: `${awayPct}%` }} />
      </div>
      <div className={styles.probLabels}>
        <span>{homePct}%</span>
        <span className={styles.probMid}>Win %</span>
        <span>{awayPct}%</span>
      </div>
    </div>
  );
}

function SpreadBucketChart({ buckets }) {
  const max = Math.max(...buckets.map((b) => b.count), 1);
  return (
    <div className={styles.bucketChart}>
      {buckets.map((b) => (
        <div key={b.label} className={styles.bucketCol}>
          <div className={styles.bucketBarWrap}>
            <div
              className={styles.bucketBar}
              style={{ height: `${Math.max((b.count / max) * 100, b.count > 0 ? 8 : 0)}%` }}
            />
          </div>
          <span className={styles.bucketCount}>{b.count}</span>
          <span className={styles.bucketLabel}>{b.label}</span>
        </div>
      ))}
    </div>
  );
}

function TotalsRange({ withTotal, avg }) {
  if (!withTotal || withTotal.length < 2) return null;
  const vals = withTotal.map((g) => g.totalNum).filter(Boolean);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const avgPct = avg != null ? ((avg - min) / range) * 100 : null;

  return (
    <div className={styles.totalsRange}>
      <div className={styles.totalsTrack}>
        <div className={styles.totalsLine} />
        {vals.map((v, i) => (
          <div
            key={i}
            className={styles.totalsDot}
            style={{ left: `${((v - min) / range) * 100}%` }}
            title={String(v)}
          />
        ))}
        {avgPct != null && (
          <div className={styles.totalsAvgMarker} style={{ left: `${avgPct}%` }} />
        )}
      </div>
      <div className={styles.totalsRangeLabels}>
        <span>{min}</span>
        {avg != null && <span className={styles.totalsAvgLabel}>avg {avg.toFixed(1)}</span>}
        <span>{max}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Small reusable atoms
// ═══════════════════════════════════════════════════════════════════════════

function RankBadge({ rank }) {
  if (rank == null) return null;
  return <span className={styles.rankBadge}>#{rank}</span>;
}

function TeamLink({ name, rankLookup }) {
  if (!name) return <span>—</span>;
  const slug = getTeamSlug(name) ?? getSlugFromRankingsName(name, TEAMS);
  const rank = rankLookup ? findRank(name, rankLookup) : null;
  const inner = (
    <>
      {rank != null && <RankBadge rank={rank} />}
      <span>{name}</span>
    </>
  );
  return slug ? (
    <Link to={`/teams/${slug}`} className={styles.teamNameLink}>
      {inner}
    </Link>
  ) : (
    <span className={styles.teamNamePlain}>{inner}</span>
  );
}

function MovementChip({ direction, label }) {
  const cls = direction === 'up'
    ? styles.chipUp
    : direction === 'down'
    ? styles.chipDown
    : styles.chipNeutral;
  const arrow = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→';
  return (
    <span className={`${styles.movementChip} ${cls}`}>
      {arrow} {label}
    </span>
  );
}

function SignalBadge({ label, variant = 'default' }) {
  const cls = variant === 'upset' ? styles.badgeUpset
    : variant === 'ranked' ? styles.badgeRanked
    : variant === 'primetime' ? styles.badgePrimetime
    : styles.badgeDefault;
  return <span className={`${styles.signalBadge} ${cls}`}>{label}</span>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Section components
// ═══════════════════════════════════════════════════════════════════════════

/** Part 3 — Maximus Market Briefing */
function MarketBriefing({ briefing, loading, onRefresh, refreshing }) {
  // Always expanded by default — user can collapse via toggle.
  const [collapsed, setCollapsed] = useState(false);

  const paras = briefing ? briefing.split(/\n\n+/).filter(Boolean) : [];

  return (
    <div className={styles.briefingCard}>
      <div className={styles.briefingHeader}>
        <div className={styles.briefingTitle}>
          <span className={styles.briefingIcon}>◈</span>
          <span>Today's Market Briefing</span>
        </div>
        <div className={styles.briefingActions}>
          <button
            type="button"
            className={styles.briefingRefresh}
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh briefing"
          >
            {refreshing ? '…' : '↺'}
          </button>
          <button
            type="button"
            className={styles.briefingCollapse}
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
          >
            {collapsed ? 'Expand' : 'Collapse'}
            <span className={`${styles.collapseChevron} ${!collapsed ? styles.collapseChevronOpen : ''}`}>›</span>
          </button>
        </div>
      </div>

      <div className={`${styles.briefingBody} ${collapsed ? styles.briefingBodyCollapsed : ''}`}>
        {loading ? (
          <div className={styles.briefingLoading}>
            <span className={styles.spinner} />
            <span>Scanning market data…</span>
          </div>
        ) : paras.length === 0 ? (
          <p className={styles.briefingEmpty}>No market data available right now.</p>
        ) : (
          <div className={styles.briefingContent}>
            {paras.map((p, i) => (
              <p key={i} className={i === 0 ? styles.briefingLead : styles.briefingBullet}>
                {renderFormatted(p)}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Inline **bold** and *italic* renderer (no import dependency) */
function renderFormatted(text) {
  if (!text) return null;
  const parts = [];
  let rest = text;
  let key = 0;
  while (rest.length > 0) {
    const boldIdx = rest.indexOf('**');
    if (boldIdx >= 0) {
      if (boldIdx > 0) parts.push(rest.slice(0, boldIdx));
      const end = rest.indexOf('**', boldIdx + 2);
      if (end < 0) { parts.push(rest.slice(boldIdx)); break; }
      parts.push(<strong key={key++}>{rest.slice(boldIdx + 2, end)}</strong>);
      rest = rest.slice(end + 2);
    } else {
      parts.push(rest); break;
    }
  }
  return parts;
}

/** Part 4a — Market Movers KPI cards */
function MarketMovers({ model, loading }) {
  if (loading) {
    return (
      <div className={styles.moversGrid}>
        {[0, 1, 2, 3].map((i) => <div key={i} className={`${styles.moverCard} ${styles.skeleton}`} />)}
      </div>
    );
  }

  const { biggestFavorite, closestGame, highestTotal, rankedMatchups, totalGames, withOdds } = model;

  const items = [
    {
      label: 'Biggest Favorite',
      icon: '◣',
      value: biggestFavorite
        ? (biggestFavorite.favoredTeam || biggestFavorite.homeTeam)
        : '—',
      sub: biggestFavorite
        ? `Spread: ${biggestFavorite.spread ?? `±${biggestFavorite.spreadMag}`}`
        : 'No odds yet',
      direction: biggestFavorite ? 'down' : null,
      dirLabel: biggestFavorite?.spread ?? null,
    },
    {
      label: 'Closest Game',
      icon: '⊖',
      value: closestGame
        ? `${closestGame.homeTeam.split(' ').pop()} vs ${closestGame.awayTeam.split(' ').pop()}`
        : '—',
      sub: closestGame ? `Line: ${closestGame.spread ?? '—'}` : 'No close games yet',
      direction: null,
      dirLabel: null,
    },
    {
      label: 'Highest O/U',
      icon: '▲',
      value: highestTotal ? `${highestTotal.total}` : '—',
      sub: highestTotal
        ? `${highestTotal.homeTeam.split(' ').pop()} vs ${highestTotal.awayTeam.split(' ').pop()}`
        : 'No totals yet',
      direction: highestTotal ? 'up' : null,
      dirLabel: null,
    },
    {
      label: 'Ranked Games',
      icon: '★',
      value: `${rankedMatchups.length} / ${totalGames}`,
      sub: withOdds.length > 0 ? `${withOdds.length} game${withOdds.length !== 1 ? 's' : ''} with lines` : 'Lines pending',
      direction: null,
      dirLabel: null,
    },
  ];

  return (
    <div className={styles.moversGrid}>
      {items.map((item) => (
        <div key={item.label} className={styles.moverCard}>
          <div className={styles.moverHeader}>
            <span className={styles.moverIcon}>{item.icon}</span>
            <span className={styles.moverLabel}>{item.label}</span>
          </div>
          <div className={styles.moverValue}>{item.value}</div>
          <div className={styles.moverSub}>{item.sub}</div>
          {item.direction && (
            <MovementChip direction={item.direction} label={item.dirLabel ?? ''} />
          )}
        </div>
      ))}
    </div>
  );
}

/** Part 4b — High Interest Matchup card */
function MatchupCard({ game, rankLookup }) {
  const {
    homeTeam, awayTeam, gameStatus, network, startTime,
    spread, total, moneyline, gameId,
    homeRank, awayRank, homeProbPct, awayProbPct, homeProb, awayProb,
    homeML, awayML, upsetScore, bothRanked, topTeam, primetime, favoredTeam,
  } = game;

  const gameLink = getTeamSlug(homeTeam) ? `/teams/${getTeamSlug(homeTeam)}` : null;
  const timeStr = startTime
    ? new Date(startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
    : null;

  return (
    <div className={styles.matchupCard}>
      {/* Top badges */}
      <div className={styles.matchupBadges}>
        {upsetScore >= 2 && <SignalBadge label="Upset Watch" variant="upset" />}
        {bothRanked && <SignalBadge label="Ranked vs Ranked" variant="ranked" />}
        {primetime && network && <SignalBadge label={network} variant="primetime" />}
      </div>

      {/* Teams */}
      <div className={styles.matchupTeams}>
        <div className={styles.matchupTeamRow}>
          <div className={styles.matchupTeamName}>
            {homeRank != null && <RankBadge rank={homeRank} />}
            <TeamLink name={homeTeam} rankLookup={rankLookup} />
            <span className={styles.matchupHomeLabel}>HOME</span>
          </div>
          <div className={styles.matchupLineCol}>
            <span className={styles.matchupML}>{mlDisplay(homeML)}</span>
            {homeProbPct != null && (
              <span className={styles.matchupProb}>{homeProbPct}%</span>
            )}
          </div>
        </div>
        <div className={styles.matchupDivider} />
        <div className={styles.matchupTeamRow}>
          <div className={styles.matchupTeamName}>
            {awayRank != null && <RankBadge rank={awayRank} />}
            <TeamLink name={awayTeam} rankLookup={rankLookup} />
          </div>
          <div className={styles.matchupLineCol}>
            <span className={styles.matchupML}>{mlDisplay(awayML)}</span>
            {awayProbPct != null && (
              <span className={styles.matchupProb}>{awayProbPct}%</span>
            )}
          </div>
        </div>
      </div>

      {/* Win probability bar */}
      <WinProbBar homeProb={homeProb} awayProb={awayProb} homeTeam={homeTeam} awayTeam={awayTeam} />

      {/* Market lines */}
      <div className={styles.matchupLines}>
        {spread != null && (
          <div className={styles.matchupLineItem}>
            <span className={styles.lineKey}>Spread</span>
            <span className={styles.lineVal}>{spread}</span>
          </div>
        )}
        {total != null && (
          <div className={styles.matchupLineItem}>
            <span className={styles.lineKey}>O/U</span>
            <span className={styles.lineVal}>{total}</span>
          </div>
        )}
        {gameStatus && gameStatus !== 'Scheduled' && (
          <div className={styles.matchupLineItem}>
            <span className={styles.lineKey}>Status</span>
            <span className={styles.lineVal}>{gameStatus}</span>
          </div>
        )}
        {timeStr && (
          <div className={styles.matchupLineItem}>
            <span className={styles.lineKey}>Time</span>
            <span className={styles.lineVal}>{timeStr}</span>
          </div>
        )}
      </div>

      {/* Actions: helper text + affiliate CTA + share */}
      <div className={styles.matchupFooter}>
        <p className={styles.matchupHelper}>
          Live odds and spreads available at our partner sportsbook.
        </p>
        <div className={styles.matchupActions}>
          <AffiliateCta
            offer="xbet-ncaa"
            label="View Odds at XBet"
            brand="xbet"
            ariaLabel={`View live odds for ${homeTeam} vs ${awayTeam} at XBet`}
            slot="high-interest-matchup"
            gameId={gameId}
            team={getTeamSlug(homeTeam) || getTeamSlug(awayTeam) || undefined}
            variant="subtle"
          />
          <ShareButton
            shareType={upsetScore >= 2 ? 'upset_watch' : 'matchup'}
            title={`${homeTeam} vs ${awayTeam}`}
            subtitle={[spread != null && `Spread: ${spread}`, total != null && `O/U: ${total}`].filter(Boolean).join(' · ')}
            meta={timeStr || ''}
            teamSlug={getTeamSlug(homeTeam) || ''}
            destinationPath={gameLink || '/insights'}
            placement="matchup_card"
          />
        </div>
      </div>
    </div>
  );
}

/** Part 4d — Underdog Watch cards */
function UnderdogCard({ game, rankLookup }) {
  const {
    homeTeam, awayTeam, favoredTeam, underdogTeam,
    spread, homeRank, awayRank, underdogRank, favoredRank,
    upsetScore, gameId,
  } = game;

  const label = upsetScore === 3 ? 'High Upset Risk' : 'Upset Watch';
  const variant = upsetScore === 3 ? styles.underdogHigh : styles.underdogMid;

  return (
    <div className={`${styles.underdogCard} ${variant}`}>
      <div className={styles.underdogAlert}>
        <span className={styles.underdogAlertIcon}>⚡</span>
        <span className={styles.underdogAlertLabel}>{label}</span>
      </div>
      <div className={styles.underdogMatchup}>
        <div>
          {underdogRank != null && <RankBadge rank={underdogRank} />}
          <span className={styles.underdogName}>{underdogTeam || awayTeam}</span>
          <span className={styles.underdogTag}>UNDERDOG</span>
        </div>
        <div className={styles.underdogVs}>vs</div>
        <div>
          {favoredRank != null && <RankBadge rank={favoredRank} />}
          <span className={styles.underdogName}>{favoredTeam || homeTeam}</span>
          <span className={styles.favoriteTag}>FAVORED {spread ? `(${spread})` : ''}</span>
        </div>
      </div>
      <p className={styles.underdogReason}>
        {underdogRank != null && favoredRank == null
          ? `Ranked team playing as underdog — market may be undervaluing.`
          : underdogRank != null && favoredRank != null
          ? `Ranked vs ranked with narrow line — coin-flip territory.`
          : `Ranked favorite with small cushion — vulnerable to cover failure.`}
      </p>
      <div className={styles.underdogFooter}>
        <AffiliateCta
          offer="xbet-ncaa"
          label="View Market at XBet"
          brand="xbet"
          ariaLabel={`View market odds for ${underdogTeam || awayTeam} vs ${favoredTeam || homeTeam} at XBet`}
          slot="underdog-watch"
          gameId={gameId}
          team={getTeamSlug(underdogTeam || awayTeam) || undefined}
          variant="subtle"
        />
      </div>
    </div>
  );
}

/** Sortable data table */
function DataTable({ enriched, rankLookup }) {
  const [sortKey, setSortKey] = useState('time');
  const [sortDir, setSortDir] = useState('asc');
  const [collapsed, setCollapsed] = useState(true);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sorted = useMemo(() => {
    const copy = [...enriched];
    copy.sort((a, b) => {
      let av, bv;
      if (sortKey === 'time') {
        av = a.startTime ? new Date(a.startTime).getTime() : 0;
        bv = b.startTime ? new Date(b.startTime).getTime() : 0;
      } else if (sortKey === 'spread') {
        av = a.spreadMag ?? 99;
        bv = b.spreadMag ?? 99;
      } else if (sortKey === 'total') {
        av = a.totalNum ?? 0;
        bv = b.totalNum ?? 0;
      } else if (sortKey === 'rank') {
        av = Math.min(a.homeRank ?? 99, a.awayRank ?? 99);
        bv = Math.min(b.homeRank ?? 99, b.awayRank ?? 99);
      } else {
        return 0;
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return copy;
  }, [enriched, sortKey, sortDir]);

  const colHead = (label, key) => {
    const active = sortKey === key;
    return (
      <th
        key={key}
        className={`${styles.th} ${active ? styles.thActive : ''}`}
        onClick={() => handleSort(key)}
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleSort(key)}
        role="columnheader"
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {label} {active ? (sortDir === 'asc' ? '↑' : '↓') : ''}
      </th>
    );
  };

  return (
    <div className={styles.tableSection}>
      <button
        type="button"
        className={styles.tableToggle}
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <span>Full Data Table</span>
        <span>{collapsed ? `Show ${enriched.length} games` : 'Collapse'}</span>
        <span className={`${styles.collapseChevron} ${!collapsed ? styles.collapseChevronOpen : ''}`}>›</span>
      </button>

      {!collapsed && (
        <div className={styles.tableWrap}>
          <table className={styles.table} role="grid" aria-label="Full game odds table">
            <thead>
              <tr>
                {colHead('Matchup', 'rank')}
                {colHead('Spread', 'spread')}
                <th className={styles.th}>Moneyline</th>
                {colHead('O/U', 'total')}
                <th className={styles.th}>Win %</th>
                <th className={styles.th}>Status</th>
                {colHead('Time', 'time')}
              </tr>
            </thead>
            <tbody>
              {sorted.map((g) => {
                const timeStr = g.startTime
                  ? new Date(g.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                  : '—';
                return (
                  <tr key={g.gameId || `${g.homeTeam}-${g.awayTeam}`} className={styles.tr}>
                    <td className={styles.tdMatchup}>
                      <div className={styles.tdTeam}>
                        {g.homeRank != null && <RankBadge rank={g.homeRank} />}
                        <TeamLink name={g.homeTeam} rankLookup={rankLookup} />
                      </div>
                      <div className={styles.tdTeam}>
                        {g.awayRank != null && <RankBadge rank={g.awayRank} />}
                        <TeamLink name={g.awayTeam} rankLookup={rankLookup} />
                      </div>
                    </td>
                    <td className={`${styles.td} ${styles.tdMono}`}>{g.spread ?? '—'}</td>
                    <td className={`${styles.td} ${styles.tdMono}`}>{g.moneyline ?? '—'}</td>
                    <td className={`${styles.td} ${styles.tdMono}`}>{g.total ?? '—'}</td>
                    <td className={styles.td}>
                      {g.homeProbPct != null
                        ? <span className={styles.tdProb}>{g.homeProbPct}% / {g.awayProbPct}%</span>
                        : '—'
                      }
                    </td>
                    <td className={styles.td}>
                      <span className={styles.tdStatus}>{g.gameStatus || 'Scheduled'}</span>
                    </td>
                    <td className={`${styles.td} ${styles.tdMono}`}>{timeStr}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Affiliate promo module — replaces the placeholder adSlot divs
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Inline sportsbook partner strip. Renders between content sections.
 * Looks like a native editorial card, not a banner.
 */
function AffiliatePromoModule({ slot, brand, headline, primaryOffer, primaryLabel, secondaryOffer, secondaryLabel }) {
  return (
    <div className={styles.promoModule}>
      <div className={styles.promoInner}>
        <div className={styles.promoText}>
          <div className={styles.promoHeaderRow}>
            {brand && <BrandMark brand={brand} size="md" />}
            <span className={styles.promoPartnerTag}>Partner Sportsbook</span>
          </div>
          <p className={styles.promoHeadline}>{headline}</p>
        </div>
        <div className={styles.promoActions}>
          <AffiliateCta
            offer={primaryOffer}
            label={primaryLabel}
            brand={brand}
            slot={slot}
            campaign="odds-insights-launch"
            variant="primary"
          />
          {secondaryOffer && (
            <AffiliateCta
              offer={secondaryOffer}
              label={secondaryLabel}
              slot={`${slot}-secondary`}
              campaign="odds-insights-launch"
              variant="subtle"
            />
          )}
        </div>
      </div>
      <p className={styles.promoDisclosure}>
        21+ only · Partner link · Please bet responsibly.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main page component
// ═══════════════════════════════════════════════════════════════════════════

export default function Insights() {
  const [fastData, setFastData] = useState({ rankings: [], scoresToday: [] });
  const [slowData, setSlowData] = useState({ oddsGames: [], upcomingGames: [] });
  const [fastLoading, setFastLoading] = useState(true);
  const [slowLoading, setSlowLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  const [championshipOdds, setChampionshipOdds] = useState({});
  const [championshipOddsMeta, setChampionshipOddsMeta] = useState(null);
  const [championshipOddsLoading, setChampionshipOddsLoading] = useState(true);

  const {
    atsLeaders, atsMeta, atsWindow, atsLoading, seasonWarming,
    onRetry: atsOnRetry, onPeriodChange: atsOnPeriodChange,
  } = useAtsLeaders({ initialWindow: 'last30' });

  // Fast path: rankings + today's scores
  useEffect(() => {
    let cancelled = false;
    setFastLoading(true);
    fetchHomeFast()
      .then((data) => {
        if (cancelled) return;
        setFastData({
          rankings: data?.rankingsTop25 ?? data?.rankings?.rankings ?? [],
          scoresToday: data?.scoresToday ?? [],
        });
        setFastLoading(false);
      })
      .catch(() => {
        if (!cancelled) setFastLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshTick]);

  // Slow path: odds + upcoming games
  useEffect(() => {
    let cancelled = false;
    setSlowLoading(true);
    fetchHomeSlow()
      .then((data) => {
        if (cancelled) return;
        setSlowData({
          oddsGames: data?.odds?.games ?? [],
          upcomingGames: data?.upcomingGamesWithSpreads ?? [],
        });
        setSlowLoading(false);
      })
      .catch(() => {
        if (!cancelled) setSlowLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshTick]);

  // Championship odds
  useEffect(() => {
    let cancelled = false;
    fetchChampionshipOdds()
      .then(({ odds, oddsMeta }) => {
        if (cancelled) return;
        setChampionshipOdds(odds ?? {});
        setChampionshipOddsMeta(oddsMeta ?? null);
        setChampionshipOddsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setChampionshipOddsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleRefresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  // Build rank lookup for team linking
  const rankLookup = useMemo(
    () => buildRankLookup(fastData.rankings),
    [fastData.rankings]
  );

  // Merge ESPN scores + odds into unified game model
  const allGames = useMemo(() => {
    const today = mergeGamesWithOdds(fastData.scoresToday, slowData.oddsGames, getTeamSlug);
    // Include upcoming games that aren't already in today's list
    const todayIds = new Set(today.map((g) => g.gameId).filter(Boolean));
    const upcoming = (slowData.upcomingGames || []).filter(
      (g) => !todayIds.has(g.gameId)
    );
    return [...today, ...upcoming];
  }, [fastData.scoresToday, slowData.oddsGames, slowData.upcomingGames]);

  // Enrich all games with analytics
  const enriched = useMemo(
    () => allGames.map((g) => enrichGame(g, rankLookup)),
    [allGames, rankLookup]
  );

  // Compute market model
  const model = useMemo(() => computeMarketModel(enriched), [enriched]);

  // Briefing string
  const briefing = useMemo(
    () => generateBriefing(model),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, refreshTick]
  );

  // Build atsBySlug from ATS leaders — same pattern as OddsInsightsTeaser on Home
  const atsBySlug = useMemo(() => {
    const all = [...(atsLeaders.best ?? []), ...(atsLeaders.worst ?? [])];
    if (all.length === 0) return null;
    const map = {};
    for (const row of all) {
      if (!row.slug) continue;
      map[row.slug] = {
        season: row.season ?? row.rec ?? null,
        last30: row.last30 ?? row.rec ?? null,
        last7:  row.last7  ?? row.rec ?? null,
      };
    }
    return Object.keys(map).length > 0 ? map : null;
  }, [atsLeaders]);

  // Today's ISO date string for MaximusPicks slate label
  const slateDate = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // Persist a compact briefing snapshot to localStorage so the Home teaser
  // can show a live excerpt without triggering any new API calls.
  useEffect(() => {
    if (!briefing || fastLoading || slowLoading) return;
    const paras = briefing.split(/\n\n+/).filter(Boolean);
    if (paras.length === 0) return;
    const summary = paras[0];
    const bullets = paras.slice(1).filter((p) => p.startsWith('•')).slice(0, 2);
    try {
      localStorage.setItem(
        'oddsBriefing:last',
        JSON.stringify({ updatedAt: Date.now(), summary, bullets })
      );
    } catch {
      // localStorage may be unavailable in some environments
    }
  }, [briefing, fastLoading, slowLoading]);

  const isLoading = fastLoading && slowLoading;

  const getSlugFn = (name) =>
    getTeamSlug(name) ?? getSlugFromRankingsName(name, TEAMS);

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>Odds Insights</h1>
        <p className={styles.pageSubtitle}>Market intelligence · Lines · Rankings · ATS</p>
      </header>

      {/* ── Part 3: Market Briefing ── */}
      <MarketBriefing
        briefing={briefing}
        loading={isLoading}
        onRefresh={handleRefresh}
        refreshing={fastLoading || slowLoading}
      />

      {/* ── Maximus's Picks ── */}
      <section className={styles.picksSection}>
        <div className={styles.picksSectionHeader}>
          <h2 className={styles.sectionTitle}>Maximus&apos;s Picks</h2>
          <span className={styles.picksSectionTag}>Data-Driven Leans</span>
        </div>
        <MaximusPicks
          games={allGames}
          atsLeaders={atsLeaders}
          atsBySlug={atsBySlug}
          loading={isLoading || atsLoading}
          slateDate={slateDate}
          hideViewMore
        />
      </section>

      {/* ── Part 4a: Market Movers ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Market Movers</h2>
        <MarketMovers model={model} loading={isLoading} />
      </section>

      {/* ── Part 4c: High Interest Games ── */}
      {model.highInterest.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>High Interest Matchups</h2>
          <div className={styles.matchupsGrid}>
            {model.highInterest.map((g) => (
              <MatchupCard
                key={g.gameId || `${g.homeTeam}-${g.awayTeam}`}
                game={g}
                rankLookup={rankLookup}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Affiliate promo module A ── */}
      <AffiliatePromoModule
        slot="promo-module-a"
        brand="xbet"
        headline="Maximus Sports users can access full NCAA spreads, moneylines, and totals through our partner sportsbook."
        primaryOffer="xbet-ncaa"
        primaryLabel="See Lines at XBet →"
        secondaryOffer="xbet-welcome"
        secondaryLabel="Claim Welcome Bonus"
      />

      {/* ── Part 4d: Underdog Watch ── */}
      {model.upsetWatch.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Underdog Watch</h2>
          <div className={styles.underdogsGrid}>
            {model.upsetWatch.map((g) => (
              <UnderdogCard
                key={g.gameId || `${g.homeTeam}-${g.awayTeam}`}
                game={g}
                rankLookup={rankLookup}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Part 4e: Totals Insights ── */}
      {model.withTotal.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Totals Insights</h2>
          <div className={styles.totalsSection}>
            <div className={styles.totalsStats}>
              <div className={styles.totalsStat}>
                <span className={styles.totalsStatLabel}>Highest O/U</span>
                <span className={styles.totalsStatVal}>{model.highestTotal?.total ?? '—'}</span>
                <span className={styles.totalsStatSub}>
                  {model.highestTotal ? `${model.highestTotal.homeTeam.split(' ').pop()} vs ${model.highestTotal.awayTeam.split(' ').pop()}` : ''}
                </span>
              </div>
              <div className={styles.totalsStat}>
                <span className={styles.totalsStatLabel}>Average O/U</span>
                <span className={styles.totalsStatVal}>
                  {model.avgTotal != null ? model.avgTotal.toFixed(1) : '—'}
                </span>
                <span className={styles.totalsStatSub}>{model.withTotal.length} games</span>
              </div>
              <div className={styles.totalsStat}>
                <span className={styles.totalsStatLabel}>Lowest O/U</span>
                <span className={styles.totalsStatVal}>{model.lowestTotal?.total ?? '—'}</span>
                <span className={styles.totalsStatSub}>
                  {model.lowestTotal ? `${model.lowestTotal.homeTeam.split(' ').pop()} vs ${model.lowestTotal.awayTeam.split(' ').pop()}` : ''}
                </span>
              </div>
            </div>
            <TotalsRange withTotal={model.withTotal} avg={model.avgTotal} />
          </div>
        </section>
      )}

      {/* ── Part 5: Spread Distribution Chart ── */}
      {model.withSpread.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Spread Distribution</h2>
          <div className={styles.spreadSection}>
            <SpreadBucketChart buckets={model.buckets} />
            <p className={styles.spreadNote}>
              {model.withSpread.length} game{model.withSpread.length !== 1 ? 's' : ''} with spread data ·
              {model.buckets[0].count > 0 && ` ${model.buckets[0].count} pick'em (0–3)`}
              {model.buckets[3].count > 0 && ` · ${model.buckets[3].count} blowout risk (14+)`}
            </p>
          </div>
        </section>
      )}

      {/* ── Affiliate promo module B ── */}
      <AffiliatePromoModule
        slot="promo-module-b"
        brand="mybookie"
        headline="Maximus Sports users can access full NCAA spreads, moneylines, and totals through our partner sportsbook."
        primaryOffer="mybookie-welcome"
        primaryLabel="Claim Welcome Bonus at MyBookie →"
        secondaryOffer="mybookie-betback"
        secondaryLabel="Bet-Back Offer"
      />

      {/* ── Part 6: Full Data Table ── */}
      {enriched.length > 0 && (
        <DataTable enriched={enriched} rankLookup={rankLookup} />
      )}

      {/* ── ATS Leaderboard ── */}
      <section className={styles.atsSection}>
        <ATSLeaderboard
          atsLeaders={atsLeaders}
          atsMeta={atsMeta}
          loading={atsLoading}
          atsWindow={atsWindow}
          seasonWarming={seasonWarming}
          onRetry={atsOnRetry}
          onPeriodChange={atsOnPeriodChange}
        />
      </section>

      {/* ── Rankings Snapshot ── */}
      <section className={styles.rankingsSection}>
        <h2 className={styles.sectionTitle}>Rankings Snapshot</h2>
        <div className={styles.rankingsSnap}>
          <div className={styles.rankSnapCol}>
            <span className={styles.snapLabel}>AP Top 5</span>
            <ol className={styles.snapList}>
              {fastData.rankings.slice(0, 5).length > 0
                ? fastData.rankings.slice(0, 5).map((r) => {
                    const slug = getSlugFn(r.teamName);
                    return (
                      <li key={r.rank} className={styles.snapItem}>
                        <span className={styles.snapRank}>{r.rank}</span>
                        {slug ? <Link to={`/teams/${slug}`}>{r.teamName}</Link> : r.teamName}
                      </li>
                    );
                  })
                : <li className={styles.snapEmpty}>Loading…</li>
              }
            </ol>
          </div>
          <div className={styles.rankSnapCol}>
            <span className={styles.snapLabel}>Bracket Favorites</span>
            <ul className={styles.snapList}>
              {fastData.rankings.slice(0, 4).length > 0
                ? fastData.rankings.slice(0, 4).map((r) => {
                    const slug = getSlugFn(r.teamName);
                    return (
                      <li key={r.rank} className={styles.snapItem}>
                        <span className={styles.snapRank}>{r.rank}</span>
                        {slug ? <Link to={`/teams/${slug}`}>{r.teamName}</Link> : r.teamName}
                      </li>
                    );
                  })
                : <li className={styles.snapEmpty}>Loading…</li>
              }
            </ul>
          </div>
          <div className={styles.rankSnapCol}>
            <span className={styles.snapLabel}>Championship Contenders</span>
            {championshipOddsLoading ? (
              <p className={styles.snapEmpty}>Loading odds…</p>
            ) : Object.keys(championshipOdds).length === 0 ? (
              <p className={styles.snapEmpty}>No championship odds available.</p>
            ) : (
              <ul className={styles.snapList}>
                {Object.entries(championshipOdds)
                  .filter(([, v]) => v?.american != null)
                  .sort((a, b) => (a[1].american ?? 9999) - (b[1].american ?? 9999))
                  .slice(0, 5)
                  .map(([slug, v]) => {
                    const team = TEAMS.find((t) => t.slug === slug);
                    const label = team?.name ?? slug;
                    const odds = v.american > 0 ? `+${v.american}` : String(v.american);
                    return (
                      <li key={slug} className={styles.snapItem}>
                        <Link to={`/teams/${slug}`}>{label}</Link>
                        <span className={styles.snapOdds}>{odds}</span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* ── Full Rankings Table ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Bubble Watch — Full Rankings</h2>
        <RankingsTable
          rankings={fastData.rankings}
          championshipOdds={championshipOdds}
          championshipOddsMeta={championshipOddsMeta}
          championshipOddsLoading={championshipOddsLoading}
        />
      </section>

      {/* ── Disclosure ── */}
      <p className={styles.pageDisclosure}>
        Maximus Sports may earn a commission from partner links. 21+ only. Please bet responsibly.
      </p>
    </div>
  );
}
