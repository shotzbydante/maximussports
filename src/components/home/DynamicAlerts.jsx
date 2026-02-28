/**
 * Dynamic Upsets & Alerts — ESPN scores + odds tiers.
 * Detects: Lock loses to Long shot; tier gap >= 2.
 * Shows closing spread per alert (Odds API history).
 * Wrapped in ModuleShell for consistent card elevation.
 * Caps at ALERT_CAP with a "View more" footer when exceeded.
 */

import { useState } from 'react';
import { matchOddsHistoryToGame } from '../../api/odds';
import { getOddsTier } from '../../utils/teamSlug';
import { ModuleShell } from '../shared/ModuleShell';
import SourceBadge from '../shared/SourceBadge';
import styles from './DynamicAlerts.module.css';

const TIER_VALUE = { Lock: 0, 'Should be in': 1, 'Work to do': 2, 'Long shot': 3 };
const ALERT_CAP = 3;

function formatTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }) + ' PST';
  } catch {
    return '—';
  }
}

function isFinal(status) {
  const s = (status || '').toLowerCase();
  return s === 'final' || s === 'halftime' || s.includes('final');
}

function getTierValue(tier) {
  return tier != null ? TIER_VALUE[tier] ?? 4 : 4;
}

function isUpset(game) {
  const { homeTeam, awayTeam, homeScore, awayScore, gameStatus } = game;
  if (!isFinal(gameStatus)) return false;
  const home = homeScore != null ? parseInt(homeScore, 10) : null;
  const away = awayScore != null ? parseInt(awayScore, 10) : null;
  if (home == null || away == null) return false;

  const homeTier = getOddsTier(homeTeam);
  const awayTier = getOddsTier(awayTeam);
  const homeVal = getTierValue(homeTier);
  const awayVal = getTierValue(awayTier);

  const homeWon = home > away;
  const awayWon = away > home;
  const tierGap = Math.abs(homeVal - awayVal);

  if (homeWon && awayVal < homeVal && tierGap >= 2) return true;
  if (awayWon && homeVal < awayVal && tierGap >= 2) return true;

  return false;
}

function buildAlert(game) {
  const { homeTeam, awayTeam, homeScore, awayScore, gameStatus, startTime } = game;
  const homeTier = getOddsTier(homeTeam);
  const awayTier = getOddsTier(awayTeam);
  const homeVal = getTierValue(homeTier);
  const awayVal = getTierValue(awayTier);

  const homeWon = parseInt(homeScore, 10) > parseInt(awayScore, 10);
  let favoredName = homeTeam;
  let underdogName = awayTeam;
  if (awayVal < homeVal) {
    favoredName = awayTeam;
    underdogName = homeTeam;
  }

  const winner = homeWon ? homeTeam : awayTeam;
  const loser = homeWon ? awayTeam : homeTeam;
  const score = `${homeScore}–${awayScore}`;

  return {
    gameId: game.gameId,
    winner,
    loser,
    score,
    gameStatus,
    startTime,
    favoredName,
    underdogName,
    spread: null,
  };
}

export default function DynamicAlerts({ games: gamesProp = [], oddsHistory: oddsHistoryProp = [] }) {
  const games = Array.isArray(gamesProp) ? gamesProp : [];
  const oddsHistory = Array.isArray(oddsHistoryProp) ? oddsHistoryProp : [];
  const [showAll, setShowAll] = useState(false);

  const upsetGames = games.filter(isUpset);
  const alerts = upsetGames.map((g) => {
    const a = buildAlert(g);
    const odds = matchOddsHistoryToGame(g, oddsHistory);
    a.spread = odds?.spread ?? null;
    return a;
  });

  const visibleAlerts = showAll ? alerts : alerts.slice(0, ALERT_CAP);
  const hiddenCount = !showAll ? Math.max(0, alerts.length - ALERT_CAP) : 0;

  const headerRight = (
    <div className={styles.sourceBadges}>
      <SourceBadge source="ESPN" />
      <SourceBadge source="Odds API" />
    </div>
  );

  const footer = showAll && alerts.length > ALERT_CAP ? (
    <button type="button" className={styles.viewMore} onClick={() => setShowAll(false)}>
      Show less
    </button>
  ) : hiddenCount > 0 ? (
    <button type="button" className={styles.viewMore} onClick={() => setShowAll(true)}>
      +{hiddenCount} more upset{hiddenCount !== 1 ? 's' : ''}
    </button>
  ) : null;

  return (
    <ModuleShell
      title="Upsets & Alerts"
      headerRight={headerRight}
      isEmpty={alerts.length === 0}
      emptyMessage="No upset alerts today"
      footer={footer}
    >
      {alerts.length > 0 && (
        <div className={styles.alerts}>
          {visibleAlerts.map((a, i) => (
            <div
              key={a.gameId}
              className={`${styles.alert} ${showAll && i >= ALERT_CAP ? styles.alertNew : ''}`}
            >
              <div className={styles.alertScore}>{a.score}</div>
              <div className={styles.alertText}>
                <strong>{a.loser}</strong> lost to <strong>{a.winner}</strong>
              </div>
              <div className={styles.alertMeta}>
                {formatTime(a.startTime)} · {a.gameStatus}
                {a.spread != null ? ` · Spread: ${a.spread}` : ' · Spread: —'}
              </div>
            </div>
          ))}
        </div>
      )}
    </ModuleShell>
  );
}
