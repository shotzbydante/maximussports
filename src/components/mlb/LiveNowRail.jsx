/**
 * LiveNowRail — premium "Live Intelligence" section for MLB Home.
 * Shows live games → starting soon → best edges (cascading fallback).
 */

import { useState, useEffect } from 'react';
import LiveGameCard from './LiveGameCard';
import styles from './LiveNowRail.module.css';

const REFRESH_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;

export default function LiveNowRail() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const r = await fetch('/api/mlb/live/homeFeed', { signal: controller.signal });
        clearTimeout(timer);
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setData(d);
      } catch { /* network error — ignore, keep stale */ }
      finally { if (!cancelled) setLoading(false); }
    }

    load();
    const iv = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  if (loading) return null; // Don't show skeleton — let content below render

  const liveGames = data?.liveNow || [];
  const startingSoon = data?.startingSoon || [];
  const bestEdges = data?.bestEdges || [];

  // Cascading: live > starting soon > best edges > nothing
  const hasLive = liveGames.length > 0;
  const hasStarting = startingSoon.length > 0;
  const hasEdges = bestEdges.length > 0;

  if (!hasLive && !hasStarting && !hasEdges) return null; // No games today

  const sectionTitle = hasLive ? 'Live Now' : hasStarting ? 'Starting Soon' : 'Best Edges Today';
  const games = hasLive ? liveGames : hasStarting ? startingSoon : bestEdges;

  return (
    <section className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {hasLive && <span className={styles.liveDot} />}
          <span className={styles.eyebrow}>{sectionTitle}</span>
        </div>
        {data?.allGames > 0 && (
          <span className={styles.gameCount}>{data.allGames} games today</span>
        )}
      </div>

      <div className={styles.rail}>
        {games.slice(0, 4).map((game) => (
          <LiveGameCard key={game.gameId} game={game} />
        ))}
      </div>
    </section>
  );
}
