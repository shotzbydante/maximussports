/**
 * Daily Schedule: collapsible panels per date (now → Selection Sunday).
 * Uses ESPN /api/scores?date=YYYYMMDD. Shows "No scheduled games yet" when empty.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchScoresByDate } from '../../api/scores';
import { getScheduleDates, formatDateLabel, toDateStr } from '../../utils/dates';
import MatchupRow from '../scores/MatchupRow';
import SourceBadge from '../shared/SourceBadge';
import styles from './DailySchedule.module.css';

export default function DailySchedule() {
  const dates = useMemo(() => getScheduleDates(14), []);
  const todayStr = useMemo(() => toDateStr(new Date()), []);
  const [byDate, setByDate] = useState({});
  const [expanded, setExpanded] = useState(() => {
    const o = {};
    dates.forEach((d, i) => {
      o[d] = i < 3;
    });
    return o;
  });

  const loadAll = useCallback(() => {
    Promise.all(
      dates.map(async (dateStr) => {
        try {
          const games = await fetchScoresByDate(dateStr);
          return { dateStr, data: { games, loading: false, error: null } };
        } catch (err) {
          return { dateStr, data: { games: [], loading: false, error: err.message } };
        }
      })
    ).then((results) => {
      const next = {};
      results.forEach(({ dateStr, data }) => {
        next[dateStr] = data;
      });
      setByDate((prev) => ({ ...prev, ...next }));
    });
  }, [dates]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const id = setInterval(() => {
      fetchScoresByDate(todayStr)
        .then((games) => {
          setByDate((prev) => ({
            ...prev,
            [todayStr]: { games, loading: false, error: null },
          }));
        })
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, [todayStr]);

  const toggle = (d) => {
    setExpanded((prev) => ({ ...prev, [d]: !prev[d] }));
  };

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <h3 className={styles.title}>Daily Schedule</h3>
      </div>
      <div className={styles.panels}>
        {dates.map((dateStr) => {
          const data = byDate[dateStr];
          const isExpanded = expanded[dateStr] ?? true;
          const games = data?.games ?? [];
          const loading = data?.loading ?? true;
          const error = data?.error;

          return (
            <div key={dateStr} className={styles.panel}>
              <button
                type="button"
                className={styles.panelHeader}
                onClick={() => toggle(dateStr)}
                aria-expanded={isExpanded}
              >
                <span className={styles.panelDate}>{formatDateLabel(dateStr)}</span>
                <span className={styles.panelCount}>
                  {loading ? '…' : games.length > 0 ? `${games.length} games` : '—'}
                </span>
                <span className={styles.panelBadge}>
                  <SourceBadge source="ESPN" />
                </span>
                <span className={styles.chevron} aria-hidden>{isExpanded ? '▾' : '▸'}</span>
              </button>
              {isExpanded && (
                <div className={styles.panelBody}>
                  {loading && (
                    <div className={styles.empty}>Loading…</div>
                  )}
                  {!loading && error && (
                    <div className={styles.empty}>Scores unavailable</div>
                  )}
                  {!loading && !error && games.length === 0 && (
                    <div className={styles.empty}>No scheduled games yet</div>
                  )}
                  {!loading && !error && games.length > 0 && (
                    <div className={styles.table}>
                      <div className={`${styles.row} ${styles.rowHeader}`}>
                        <span>Matchup</span>
                        <span>Score</span>
                        <span>Status</span>
                        <span>Time</span>
                        <span>Network</span>
                        <span />
                      </div>
                      {games.map((g) => (
                        <MatchupRow key={g.gameId} game={g} source="ESPN" />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
