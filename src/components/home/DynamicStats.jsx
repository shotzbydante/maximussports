/**
 * DynamicStats — Today widget with Featured Matchups + Activity Snapshot.
 * Compact mode renders a two-layer editorial module:
 *   Layer 1: Ranked matchup cards (clickable → Game Matchup page)
 *   Layer 2: Activity snapshot row (ranked games, headlines, upsets)
 * Non-compact mode renders full market-style stat tiles (unchanged).
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getTeamBySlug } from '../../data/teams';
import { getTeamSlug } from '../../utils/teamSlug';
import { buildMatchupSlug } from '../../utils/matchupSlug';
import { buildMaximusPicks } from '../../utils/maximusPicksModel';
import TeamLogo from '../shared/TeamLogo';
import styles from './DynamicStats.module.css';

const UpsetIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M8 2.5L14 13.5H2L8 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <line x1="8" y1="7" x2="8" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="8" cy="12.5" r="0.8" fill="currentColor" />
  </svg>
);

const RankedIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M8 2L9.6 6.4L14.5 6.6L10.8 9.5L12.1 14.2L8 11.5L3.9 14.2L5.2 9.5L1.5 6.6L6.4 6.4L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

const NewsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <line x1="5" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="5" y1="9" x2="11" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="5" y1="12" x2="8.5" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ICONS = [UpsetIcon, RankedIcon, NewsIcon];

function getTileVariant(stat, index) {
  if (index === 0 && stat.value > 0) return 'alert';
  if (index === 1 && stat.value > 0) return 'active';
  if (index === 2 && stat.value > 0) return 'news';
  return 'neutral';
}

function matchupKey(slugA, slugB) {
  return [slugA, slugB].sort().join('|');
}

export default function DynamicStats({
  stats,
  compact = false,
  games = [],
  rankMap = {},
  atsLeaders = { best: [], worst: [] },
  championshipOdds = {},
}) {
  const featuredMatchups = useMemo(() => {
    if (!compact || !games?.length) return [];

    const matchups = [];
    const seen = new Set();

    for (const g of games) {
      const homeSlug = getTeamSlug(g.homeTeam);
      const awaySlug = getTeamSlug(g.awayTeam);
      if (!homeSlug || !awaySlug) continue;

      const key = matchupKey(homeSlug, awaySlug);
      if (seen.has(key)) continue;
      seen.add(key);

      const homeRank = rankMap[homeSlug] ?? null;
      const awayRank = rankMap[awaySlug] ?? null;
      if (homeRank == null && awayRank == null) continue;

      const homeTeam = getTeamBySlug(homeSlug);
      const awayTeam = getTeamBySlug(awaySlug);
      if (!homeTeam || !awayTeam) continue;

      const bothRanked = homeRank != null && awayRank != null;
      matchups.push({
        game: g,
        homeTeam,
        awayTeam,
        homeSlug,
        awaySlug,
        homeRank,
        awayRank,
        bothRanked,
        score: bothRanked
          ? 1000 - Math.min(homeRank, awayRank)
          : 500 - (homeRank ?? awayRank),
        slug: buildMatchupSlug(homeSlug, awaySlug),
      });
    }

    return matchups.sort((a, b) => b.score - a.score).slice(0, 3);
  }, [compact, games, rankMap]);

  const matchupSignals = useMemo(() => {
    if (featuredMatchups.length === 0 || !games?.length) return {};

    let picks;
    try {
      picks = buildMaximusPicks({ games, atsLeaders, rankMap, championshipOdds });
    } catch {
      return {};
    }

    const allPicks = [
      ...picks.atsPicks.map((p) => ({ ...p, _st: 'ats' })),
      ...picks.pickEmPicks.map((p) => ({ ...p, _st: 'pickem' })),
      ...picks.valuePicks.map((p) => ({ ...p, _st: 'value' })),
      ...picks.totalsPicks.map((p) => ({ ...p, _st: 'totals' })),
    ].filter((p) => p.itemType === 'lean' && p.confidence >= 1);

    const signals = {};
    for (const m of featuredMatchups) {
      const key = matchupKey(m.homeSlug, m.awaySlug);
      const match = allPicks.find(
        (p) => matchupKey(p.homeSlug, p.awaySlug) === key,
      );
      if (!match) continue;

      let label;
      if (match._st === 'ats' && match.pickLine) {
        label = `ATS Edge: ${match.pickLine}`;
      } else if (match._st === 'pickem' && match.pickTeam) {
        label = `Model Lean: ${match.pickTeam}`;
      } else if (match._st === 'value' && match.pickLine) {
        label = `Value Signal: ${match.pickLine}`;
      } else if (match._st === 'totals' && match.leanDirection) {
        label = `${match.leanDirection} ${match.lineValue}`;
      }
      if (label) {
        signals[key] = { label, type: match._st, confidence: match.confidence };
      }
    }
    return signals;
  }, [featuredMatchups, games, atsLeaders, rankMap, championshipOdds]);

  if (!stats?.length && featuredMatchups.length === 0) return null;

  /* ── compact: Featured Matchups + Activity Snapshot ────────────────── */
  if (compact) {
    const rankedCount =
      stats?.find((s) => s.label === 'Ranked in action')?.value ?? 0;
    const headlinesCount =
      stats?.find((s) => s.label === 'Headlines')?.value ?? 0;
    const upsetsCount =
      stats?.find((s) => s.label === 'Upsets')?.value ?? 0;
    const active = (stats || []).filter((s) => s.value > 0);

    if (featuredMatchups.length === 0 && active.length === 0) return null;

    return (
      <section className={styles.todayWidget}>
        <div className={styles.todayHeader}>
          <span className={styles.todayLabel}>Today</span>
        </div>

        {/* Layer 1 — Featured Matchups */}
        {featuredMatchups.length > 0 && (
          <div className={styles.featuredMatchups}>
            {featuredMatchups.map((m) => {
              const key = matchupKey(m.homeSlug, m.awaySlug);
              const signal = matchupSignals[key];
              return (
                <Link
                  key={key}
                  to={`/games/${m.slug}`}
                  className={`${styles.matchupCard}${m.bothRanked ? ` ${styles.matchupCardRanked}` : ''}`}
                  title={`${m.awayTeam.name} vs ${m.homeTeam.name}`}
                >
                  <div className={styles.matchupTeams}>
                    <div className={styles.matchupSide}>
                      <div className={styles.matchupLogoWrap}>
                        <TeamLogo team={m.awayTeam} size={32} />
                        {m.awayRank != null && (
                          <span className={styles.matchupRank}>
                            #{m.awayRank}
                          </span>
                        )}
                      </div>
                      <span className={styles.matchupName}>
                        {m.awayTeam.name}
                      </span>
                    </div>

                    <span className={styles.matchupVs}>vs</span>

                    <div className={styles.matchupSide}>
                      <div className={styles.matchupLogoWrap}>
                        <TeamLogo team={m.homeTeam} size={32} />
                        {m.homeRank != null && (
                          <span className={styles.matchupRank}>
                            #{m.homeRank}
                          </span>
                        )}
                      </div>
                      <span className={styles.matchupName}>
                        {m.homeTeam.name}
                      </span>
                    </div>
                  </div>

                  {signal && (
                    <span
                      className={`${styles.signalPill} ${styles[`signal--${signal.type}`] || ''}`}
                    >
                      {signal.label}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {/* Layer 2 — Activity Snapshot */}
        <div className={styles.activitySnapshot}>
          {rankedCount > 0 && (
            <span className={styles.snapItem}>
              <span className={`${styles.snapIcon} ${styles['icon--active']}`}>
                <RankedIcon />
              </span>
              <span className={styles.snapText}>
                <strong>{rankedCount}</strong> Ranked game
                {rankedCount !== 1 ? 's' : ''} today
              </span>
            </span>
          )}
          {headlinesCount > 0 && (
            <span className={styles.snapItem}>
              <span className={`${styles.snapIcon} ${styles['icon--news']}`}>
                <NewsIcon />
              </span>
              <span className={styles.snapText}>
                <strong>{headlinesCount}</strong> Headlines across college
                basketball
              </span>
            </span>
          )}
          {upsetsCount > 0 && (
            <span className={styles.snapItem}>
              <span className={`${styles.snapIcon} ${styles['icon--alert']}`}>
                <UpsetIcon />
              </span>
              <span className={styles.snapText}>
                <strong>{upsetsCount}</strong> Upset
                {upsetsCount !== 1 ? 's' : ''} today
              </span>
            </span>
          )}
        </div>
      </section>
    );
  }

  /* ── non-compact: full stat tiles (unchanged) ──────────────────────── */
  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <span className={styles.sectionLabel}>Snapshot</span>
      </div>
      <div className={styles.tiles}>
        {stats.map((stat, i) => {
          const Icon = ICONS[i % ICONS.length];
          const variant = getTileVariant(stat, i);
          return (
            <div
              key={stat.label}
              className={`${styles.tile} ${styles[`tile--${variant}`]}`}
            >
              <div className={styles.tileTop}>
                <span
                  className={`${styles.tileIcon} ${styles[`icon--${variant}`]}`}
                >
                  <Icon />
                </span>
                <span className={styles.tileLabel}>{stat.label}</span>
              </div>
              <div
                className={`${styles.tileValue} ${styles[`value--${variant}`]}`}
              >
                {stat.value}
              </div>
              <div className={styles.tileContext}>{stat.subtext}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
