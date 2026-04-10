/**
 * NextScheduledPost — Displays the next scheduled autopost above Post History.
 *
 * Computes the next MLB Daily Briefing autopost time from the cron schedule
 * (daily at 13:00 UTC = 6:00 AM PT / 9:00 AM ET) and shows readiness state.
 *
 * Optionally fetches the most recent autopost result from Post History to
 * show last run status.
 */

import { useState, useEffect, useMemo } from 'react';
import styles from './NextScheduledPost.module.css';

// ── Schedule config (mirrors vercel.json cron: "0 13 * * *") ──────────────

const AUTOPOST_SCHEDULE = {
  name: 'MLB Daily Briefing',
  platform: 'instagram',
  section: 'daily-briefing',
  cronUtcHour: 13,
  cronUtcMinute: 0,
  // cron runs daily
};

// ── Time helpers ──────────────────────────────────────────────────────────

function computeNextRun(utcHour, utcMinute) {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(utcHour, utcMinute, 0, 0);

  // If the next run time is in the past today, roll to tomorrow
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
}

function formatInTimezone(date, tz, opts = {}) {
  return date.toLocaleString('en-US', { timeZone: tz, ...opts });
}

function formatScheduleTime(date) {
  const ptOpts = {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'America/Los_Angeles',
  };
  const etOpts = {
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'America/New_York',
  };

  const ptStr = date.toLocaleString('en-US', ptOpts);
  const etStr = date.toLocaleString('en-US', etOpts);

  return { pt: `${ptStr} PT`, et: `${etStr} ET` };
}

function timeUntil(date) {
  const now = new Date();
  const diffMs = date - now;
  if (diffMs <= 0) return 'now';

  const hours = Math.floor(diffMs / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `in ${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  return `in ${minutes}m`;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function NextScheduledPost({ refreshKey = 0 }) {
  const [lastAutopost, setLastAutopost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0); // Force re-render for countdown

  // Fetch most recent autopost from post history
  useEffect(() => {
    let cancelled = false;
    async function fetchLast() {
      setLoading(true);
      try {
        const res = await fetch('/api/social/posts?platform=instagram&limit=10');
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (cancelled) return;

        // Find most recent autopost (triggered_by includes 'autopost' or 'cron')
        const autopost = (data.posts ?? []).find(p =>
          p.triggered_by === 'autopost_cron' ||
          p.triggered_by === 'cron_autopost' ||
          (p.content_studio_section === 'daily-briefing' && p.triggered_by !== 'manual_ui')
        );
        setLastAutopost(autopost ?? null);
      } catch {
        // Non-critical — just won't show last run info
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchLast();
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Update countdown every minute
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const nextRun = useMemo(
    () => computeNextRun(AUTOPOST_SCHEDULE.cronUtcHour, AUTOPOST_SCHEDULE.cronUtcMinute),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Math.floor(Date.now() / 60_000)] // Recompute every minute
  );

  const schedule = formatScheduleTime(nextRun);
  const countdown = timeUntil(nextRun);

  // Determine readiness state
  const readiness = useMemo(() => {
    if (lastAutopost) {
      const effectiveStatus =
        lastAutopost.lifecycle_status === 'pending' && (lastAutopost.published_media_id || lastAutopost.permalink)
          ? 'posted' : lastAutopost.lifecycle_status;

      if (effectiveStatus === 'posted') return { label: 'Ready', color: 'green', icon: '✓' };
      if (effectiveStatus === 'failed') return { label: 'Last run failed', color: 'amber', icon: '!' };
    }
    // Default: scheduled/ready
    return { label: 'Scheduled', color: 'green', icon: '◆' };
  }, [lastAutopost]);

  // Last run info
  const lastRunLabel = useMemo(() => {
    if (!lastAutopost) return null;
    const ts = lastAutopost.posted_at || lastAutopost.created_at;
    if (!ts) return null;
    try {
      return new Date(ts).toLocaleString('en-US', {
        month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
        timeZone: 'America/Los_Angeles',
      }) + ' PT';
    } catch {
      return null;
    }
  }, [lastAutopost]);

  return (
    <section className={styles.root}>
      <div className={styles.header}>
        <h3 className={styles.title}>Next Scheduled Post</h3>
        <span className={`${styles.readinessBadge} ${styles[`readiness_${readiness.color}`]}`}>
          <span className={styles.readinessIcon}>{readiness.icon}</span>
          {readiness.label}
        </span>
      </div>

      <div className={styles.card}>
        <div className={styles.row}>
          <div className={styles.postInfo}>
            <span className={styles.postName}>{AUTOPOST_SCHEDULE.name}</span>
            <div className={styles.pills}>
              <span className={styles.platformPill}>📸 Instagram</span>
              <span className={styles.typePill}>Carousel</span>
              <span className={styles.typePill}>Autopost</span>
            </div>
          </div>

          <div className={styles.scheduleInfo}>
            <div className={styles.scheduleTime}>
              <span className={styles.timePrimary}>{schedule.pt}</span>
              <span className={styles.timeDivider}>/</span>
              <span className={styles.timeSecondary}>{schedule.et}</span>
            </div>
            <span className={styles.countdown}>{countdown}</span>
          </div>
        </div>

        {/* Last run info */}
        {!loading && lastRunLabel && (
          <div className={styles.lastRun}>
            <span className={styles.lastRunLabel}>Last autopost:</span>
            <span className={styles.lastRunTime}>{lastRunLabel}</span>
            {lastAutopost?.permalink && (
              <a
                href={lastAutopost.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.lastRunLink}
              >
                View ↗
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
