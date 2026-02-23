/**
 * Dynamic Upsets & Alerts — ESPN scores + odds tiers.
 * Detects: Lock loses to Long shot; tier gap >= 2.
 * Shows closing spread per alert (Odds API history).
 * Updates every 60s.
 */

import { useState, useEffect } from 'react';
import { matchOddsHistoryToGame } from '../../api/odds';
import { getOddsTier } from '../../utils/teamSlug';
import SourceBadge from '../shared/SourceBadge';
import styles from './DynamicAlerts.module.css';

const TIER_ORDER = ['Lock', 'Should be in', 'Work to do', 'Long shot'];
const TIER_VALUE = { Lock: 0, 'Should be in': 1, 'Work to do': 2, 'Long shot': 3 };

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

  // Higher tier = better team (lower number). Upset = better tier loses.
  const homeWon = home > away;
  const awayWon = away > home;
  const tierGap = Math.abs(homeVal - awayVal);

  if (homeWon && awayVal < homeVal && tierGap >= 2) return true; // away (better) lost
  if (awayWon && homeVal < awayVal && tierGap >= 2) return true; // home (better) lost

  return false;
}

function buildAlert(game) {
  const { homeTeam, awayTeam, homeScore, awayScore, gameStatus, startTime } = game;
  const homeTier = getOddsTier(homeTeam);
  const awayTier = getOddsTier(awayTeam);
  const homeVal = getTierValue(homeTier);
  const awayVal = getTierValue(awayTier);

  const homeWon = parseInt(homeScore, 10) > parseInt(awayScore, 10);
  let favored = homeTier;
  let underdog = awayTier;
  let favoredName = homeTeam;
  let underdogName = awayTeam;
  if (awayVal < homeVal) {
    favored = awayTier;
    underdog = homeTier;
    favoredName = awayTeam;
    underdogName = homeTeam;
  }

  const upset = homeWon
    ? awayVal < homeVal
    : homeVal < awayVal;
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
    favored,
    underdog,
    spread: null,
  };
}

export default function DynamicAlerts({ games: gamesProp = [], oddsHistory: oddsHistoryProp = [] }) {
  const games = Array.isArray(gamesProp) ? gamesProp : [];
  const oddsHistory = Array.isArray(oddsHistoryProp) ? oddsHistoryProp : [];
  const loading = false;
  const error = null;

  const upsetGames = games.filter(isUpset);
  const alerts = upsetGames.map((g) => {
    const a = buildAlert(g);
    const odds = matchOddsHistoryToGame(g, oddsHistory);
    a.spread = odds?.spread ?? null;
    return a;
  });

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>Upsets & Alerts</h2>
        <div className={styles.sourceBadges}>
          <SourceBadge source="ESPN" />
          <SourceBadge source="Odds API" />
        </div>
      </div>

      {loading && !games.length && (
        <div className={styles.loading}>Loading…</div>
      )}

      {error && !games.length && (
        <div className={styles.error}>Scores temporarily unavailable</div>
      )}

      {!loading && !error && alerts.length === 0 && (
        <div className={styles.empty}>No upset alerts today</div>
      )}

      {alerts.length > 0 && (
        <div className={styles.alerts}>
          {alerts.map((a) => (
            <div key={a.gameId} className={styles.alert}>
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
    </section>
  );
}
