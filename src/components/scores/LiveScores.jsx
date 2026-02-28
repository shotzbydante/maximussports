/**
 * Live scores feed — modern card layout with team logos.
 * Each game is a self-contained card: logos, names, scores, status.
 * Team names link to /teams/<slug>. Each game footer has a subtle
 * ESPN Gamecast outbound link when a gameId is available.
 *
 * Props:
 *   cap        — max games shown on desktop before "View more" (default: no cap)
 *   mobileCap  — additional CSS-level cap on mobile (default: same as cap)
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import SourceBadge from '../shared/SourceBadge';
import TeamLogo from '../shared/TeamLogo';
import { getTeamSlug, getOddsTier } from '../../utils/teamSlug';
import { resolveGamecastUrl } from '../../utils/espnGamecast';
import styles from './LiveScores.module.css';

function formatStartTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }) + ' PT';
  } catch {
    return '—';
  }
}

function isFinal(status) {
  const s = (status || '').toLowerCase();
  return s === 'final' || s.includes('final');
}

function isLive(status) {
  const s = (status || '').toLowerCase();
  return (
    s.startsWith('q1 ') ||
    s.startsWith('q2 ') ||
    s.startsWith('1st ') ||
    s.startsWith('2nd ') ||
    s === 'halftime' ||
    (s.includes(':') && !s.includes('am') && !s.includes('pm'))
  );
}

function hasOdds(g) {
  return g.spread != null || g.total != null;
}

function getStatusVariant(status) {
  if (isFinal(status)) return 'final';
  if (isLive(status)) return 'live';
  return 'upcoming';
}

function StatusBadge({ status }) {
  const variant = getStatusVariant(status);
  return (
    <span className={`${styles.statusBadge} ${styles[`status--${variant}`]}`}>
      {variant === 'live' && <span className={styles.liveDot} />}
      {status}
    </span>
  );
}

export default function LiveScores({ games = [], loading, error, oddsMessage, compact = false, showTitle = true, source = 'ESPN', showOdds = true, rankMap = {}, cap, mobileCap }) {
  const [expanded, setExpanded] = useState(false);
  const hasLiveGame = games.some((g) => isLive(g.gameStatus));

  // Apply desktop cap when set and not yet expanded
  const visibleGames = cap != null && !expanded ? games.slice(0, cap) : games;
  const hiddenCount = cap != null && !expanded ? Math.max(0, games.length - cap) : 0;

  const Fallback = ({ children }) => (
    <div className={styles.widget}>
      {showTitle && (
        <div className={styles.widgetHeader}>
          <span className={styles.title}>Today&apos;s Scores</span>
        </div>
      )}
      {children}
    </div>
  );

  if (error) {
    return <Fallback><p className={styles.fallback}>Live scores temporarily unavailable</p></Fallback>;
  }
  if (loading && games.length === 0) {
    return <Fallback><p className={styles.fallback}>Loading scores…</p></Fallback>;
  }
  if (games.length === 0) {
    return <Fallback><p className={styles.fallback}>No games scheduled today</p></Fallback>;
  }

  return (
    <div className={styles.widget}>
      {showTitle && (
        <div className={styles.widgetHeader}>
          <div className={styles.titleRow}>
            <span className={styles.title}>Today&apos;s Scores</span>
            {hasLiveGame && (
              <span className={styles.livePill} aria-label="Games in progress">
                <span className={styles.livePillDot} aria-hidden />
                LIVE
              </span>
            )}
          </div>
          <div className={styles.sourceBadges}>
            <SourceBadge source={source} />
            {showOdds && games.some(hasOdds) && <SourceBadge source="Odds API" />}
          </div>
        </div>
      )}

      <div className={styles.gameList}>
        {visibleGames.map((g, i) => {
          const live = isLive(g.gameStatus);
          const finished = isFinal(g.gameStatus);
          const awaySlug = getTeamSlug(g.awayTeam);
          const homeSlug = getTeamSlug(g.homeTeam);
          const awayRank = awaySlug ? rankMap[awaySlug] : null;
          const homeRank = homeSlug ? rankMap[homeSlug] : null;

          const awayScoreNum = parseInt(g.awayScore, 10);
          const homeScoreNum = parseInt(g.homeScore, 10);
          const hasScore = !isNaN(awayScoreNum) && !isNaN(homeScoreNum);
          const awayWon = finished && hasScore && awayScoreNum > homeScoreNum;
          const homeWon = finished && hasScore && homeScoreNum > awayScoreNum;

          const awayTeamObj = { slug: awaySlug, name: g.awayTeam };
          const homeTeamObj = { slug: homeSlug, name: g.homeTeam };

          const awayTier = getOddsTier(g.awayTeam);
          const homeTier = getOddsTier(g.homeTeam);

          // Mobile cap: hide via CSS when mobileCap is set and not expanded
          const hiddenOnMobile = !expanded && mobileCap != null && i >= mobileCap;
          const gamecastUrl = resolveGamecastUrl(g);

          return (
            <div
              key={g.gameId}
              className={[
                styles.gameCard,
                live ? styles.gameCardLive : '',
                hiddenOnMobile ? styles.gameCardMobileHidden : '',
              ].filter(Boolean).join(' ')}
            >
              {/* Away team row */}
              <div className={`${styles.teamRow} ${awayWon ? styles.teamRowWinner : ''} ${finished && !awayWon ? styles.teamRowLoser : ''}`}>
                <span className={styles.teamLogoWrap}>
                  <TeamLogo team={awayTeamObj} size={24} />
                </span>
                <span className={styles.teamInfo}>
                  {awayRank != null && <span className={styles.rank}>#{awayRank}</span>}
                  {awaySlug ? (
                    <Link to={`/teams/${awaySlug}`} className={styles.teamName}>{g.awayTeam}</Link>
                  ) : (
                    <span className={styles.teamName}>{g.awayTeam}</span>
                  )}
                  {awayTier && (
                    <span className={`${styles.tierBadge} ${styles[`tier--${awayTier.replace(/\s/g, '')}`]}`}>
                      {awayTier}
                    </span>
                  )}
                </span>
                <span className={`${styles.teamScore} ${awayWon ? styles.scoreWinner : ''}`}>
                  {hasScore ? awayScoreNum : '—'}
                </span>
              </div>

              {/* Home team row */}
              <div className={`${styles.teamRow} ${homeWon ? styles.teamRowWinner : ''} ${finished && !homeWon ? styles.teamRowLoser : ''}`}>
                <span className={styles.teamLogoWrap}>
                  <TeamLogo team={homeTeamObj} size={24} />
                </span>
                <span className={styles.teamInfo}>
                  {homeRank != null && <span className={styles.rank}>#{homeRank}</span>}
                  {homeSlug ? (
                    <Link to={`/teams/${homeSlug}`} className={styles.teamName}>{g.homeTeam}</Link>
                  ) : (
                    <span className={styles.teamName}>{g.homeTeam}</span>
                  )}
                  {homeTier && (
                    <span className={`${styles.tierBadge} ${styles[`tier--${homeTier.replace(/\s/g, '')}`]}`}>
                      {homeTier}
                    </span>
                  )}
                </span>
                <span className={`${styles.teamScore} ${homeWon ? styles.scoreWinner : ''}`}>
                  {hasScore ? homeScoreNum : '—'}
                </span>
              </div>

              {/* Game footer: status · time · odds · ESPN Gamecast */}
              <div className={styles.gameFooter}>
                <StatusBadge status={g.gameStatus} />
                {!compact && !finished && g.startTime && (
                  <span className={styles.gameTime}>{formatStartTime(g.startTime)}</span>
                )}
                <span className={styles.gameFooterRight}>
                  {showOdds && hasOdds(g) && (
                    <span className={styles.oddsText}>
                      {g.spread != null ? `${g.spread > 0 ? '+' : ''}${g.spread}` : ''}{g.spread != null && g.total != null ? ' · ' : ''}{g.total != null ? `O/U ${g.total}` : ''}
                    </span>
                  )}
                  {gamecastUrl && (
                    <a
                      href={gamecastUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.gamecastLink}
                      aria-label={`ESPN Gamecast: ${g.awayTeam} vs ${g.homeTeam}`}
                    >
                      ESPN ↗
                    </a>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* "View more games" — shown when cap is active */}
      {hiddenCount > 0 && (
        <button
          type="button"
          className={styles.viewMore}
          onClick={() => setExpanded(true)}
        >
          +{hiddenCount} more game{hiddenCount !== 1 ? 's' : ''}
        </button>
      )}

      {oddsMessage && showOdds && (
        <p className={styles.oddsMessage}>{oddsMessage}</p>
      )}
      {loading && games.length > 0 && (
        <div className={styles.refreshing}>Updating…</div>
      )}
    </div>
  );
}
