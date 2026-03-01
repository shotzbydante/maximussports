/**
 * ExamplePinnedTeamCard — a fully isolated preview card showing real team data.
 *
 * ISOLATION CONTRACT:
 *   • Manages its own fetch state; never writes to pinnedTeamDataBySlug.
 *   • Never calls addPinnedTeam / setPinnedTeams; never touches localStorage.
 *   • Never triggers Home re-fetches or enrichment queues.
 *   • Uses a cancellation guard to avoid setState after unmount.
 *   • Uses a module-level TTL cache (5 min) so repeated mounts skip the network.
 *
 * Props:
 *   slug       — team slug to preview (caller passes "duke-blue-devils")
 *   gamesForToday — optional live-scores array from Home; used to detect today's game
 *   onDismiss  — called when user clicks ×; parent manages localStorage flag
 *   onPinTeam  — called when user clicks "Pin this team"; parent calls addPinnedTeam
 */

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getTeamBySlug } from '../../data/teams';
import { getTeamSlug } from '../../utils/teamSlug';
import { fetchTeamPage } from '../../api/team';
import { track } from '../../analytics/index';
import TeamLogo from '../shared/TeamLogo';
import styles from './PinnedTeamsSection.module.css';
import exStyles from './ExamplePinnedTeamCard.module.css';

// ─── Module-level TTL cache (survives hot-reloads in dev) ─────────────────────
const CACHE_KEY = '__example_team_data__';
const CACHE_TTL = 5 * 60 * 1000; // 5 min
const _memCache = new Map();

function getCacheEntry(slug) {
  const entry = _memCache.get(slug);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { _memCache.delete(slug); return null; }
  return entry.data;
}
function setCacheEntry(slug, data) {
  _memCache.set(slug, { data, ts: Date.now() });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIER_CLASS = {
  Lock:          styles.tierLock,
  'Should be in': styles.tierShould,
  'Work to do':   styles.tierWork,
  'Long shot':    styles.tierLong,
};

function formatTimePST(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch { return null; }
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className={exStyles.skeletonWrap} aria-label="Loading team preview" aria-busy="true">
      <div className={exStyles.skeletonHeader}>
        <div className={exStyles.skeletonCircle} />
        <div className={exStyles.skeletonLines}>
          <div className={exStyles.skeletonLine} style={{ width: '60%' }} />
          <div className={exStyles.skeletonLine} style={{ width: '38%' }} />
        </div>
      </div>
      <div className={exStyles.skeletonRecordsRow}>
        {[32, 42, 42].map((w, i) => (
          <div key={i} className={exStyles.skeletonRecord}>
            <div className={exStyles.skeletonLine} style={{ width: w }} />
            <div className={exStyles.skeletonLineVal} style={{ width: w + 8 }} />
          </div>
        ))}
      </div>
      <div className={exStyles.skeletonLine} style={{ width: '100%', marginBottom: 4 }} />
      <div className={exStyles.skeletonLine} style={{ width: '72%' }} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExamplePinnedTeamCard({ slug, gamesForToday, onDismiss, onPinTeam }) {
  const team = getTeamBySlug(slug);
  // Combined state prevents synchronous setState inside the effect body.
  const [status, setStatus] = useState(() => {
    const cached = getCacheEntry(slug);
    return { data: cached, loading: !cached, fetchErr: false };
  });
  const { data, loading, fetchErr } = status;
  const shownRef = useRef(false);

  // Fire pinned_preview_shown once per mount
  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    track('pinned_preview_shown', { slug });
  }, [slug]);

  // Fetch team data — independent of all shared state.
  // All setState calls happen inside async callbacks, avoiding synchronous
  // setState within effect bodies that the linter flags.
  useEffect(() => {
    if (getCacheEntry(slug)) return; // cache hit — skip fetch
    let cancelled = false;
    fetchTeamPage(slug, { coreOnly: true })
      .then((res) => {
        if (cancelled) return;
        setCacheEntry(slug, res);
        setStatus({ data: res, loading: false, fetchErr: false });
      })
      .catch(() => {
        if (cancelled) return;
        setStatus({ data: null, loading: false, fetchErr: true });
      });
    return () => { cancelled = true; };
  }, [slug]);

  // Derive records from schedule events (same logic as real pinned card)
  const events  = data?.schedule?.events ?? [];
  const finals  = events
    .filter((e) => e.isFinal)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const l10     = finals.slice(0, 10);
  const l10W    = l10.filter((e) => e.ourScore != null && Number(e.ourScore) > Number(e.oppScore)).length;
  const l10L    = l10.filter((e) => e.ourScore != null && Number(e.ourScore) < Number(e.oppScore)).length;
  const seasonW = finals.filter((e) => e.ourScore != null && Number(e.ourScore) > Number(e.oppScore)).length;
  const seasonL = finals.filter((e) => e.ourScore != null && Number(e.ourScore) < Number(e.oppScore)).length;

  const rank = data?.rank ?? null;
  const hasSeason = finals.length > 0;
  const hasL10    = l10.length > 0;
  const seasonStr = hasSeason ? `${seasonW}–${seasonL}` : '—';
  const l10Str    = hasL10    ? `${l10W}–${l10L}` : '—';

  // Today's game from live scores
  const todayGame = (() => {
    if (!Array.isArray(gamesForToday)) return null;
    for (const g of gamesForToday) {
      const homeSlug = getTeamSlug(g.homeTeam);
      const awaySlug = getTeamSlug(g.awayTeam);
      if (homeSlug === slug || awaySlug === slug) {
        const time = formatTimePST(g.startTime);
        return {
          vs:      homeSlug === slug ? g.awayTeam : g.homeTeam,
          status:  g.gameStatus,
          time,
          network: g.network,
          gameId:  g.gameId,
        };
      }
    }
    return null;
  })();

  // Next scheduled (from enriched data)
  const nextScheduled = (() => {
    if (todayGame) return null;
    const upcoming = events
      .filter((e) => !e.isFinal)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    return upcoming[0] ?? null;
  })();

  const handleDismiss = () => {
    track('pinned_preview_dismiss', { slug });
    onDismiss?.();
  };

  const handlePin = () => {
    track('pinned_preview_pin', { slug });
    onPinTeam?.(slug);
  };

  return (
    <article className={exStyles.card} aria-label={`${team?.name ?? slug} preview`}>
      {/* Preview label + dismiss */}
      <div className={exStyles.topBar}>
        <span className={exStyles.previewLabel}>Preview</span>
        <button
          type="button"
          className={styles.dismissBtn}
          onClick={handleDismiss}
          aria-label="Dismiss preview"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className={exStyles.body}>
          <CardSkeleton />
        </div>
      ) : fetchErr ? (
        <div className={exStyles.body}>
          <div className={exStyles.fallback}>
            <p className={exStyles.fallbackTitle}>{team?.name ?? 'Duke Blue Devils'}</p>
            <p className={exStyles.fallbackText}>
              Lock-tier ACC program. Elite recruiting, strong perimeter defense, perennial March Madness contender.
            </p>
            <Link to={`/teams/${slug}`} className={styles.teamLink}>View full profile →</Link>
          </div>
        </div>
      ) : (
        <div className={exStyles.body}>
          {/* Card header: logo + name + badges */}
          <div className={styles.cardHeader}>
            <div className={styles.cardLinkMock}>
              <TeamLogo team={team} size={30} />
              <div className={styles.cardMeta}>
                <span className={styles.teamName}>{team?.name ?? 'Duke Blue Devils'}</span>
                <span className={styles.conference}>{team?.conference ?? 'ACC'}</span>
              </div>
            </div>
            <div className={styles.cardBadges}>
              {rank != null && <span className={styles.rank}>#{rank}</span>}
              <span className={`${styles.tier} ${TIER_CLASS[team?.oddsTier ?? 'Lock'] ?? ''}`}>
                {team?.oddsTier ?? 'Lock'}
              </span>
            </div>
          </div>

          {/* Today's game or next scheduled */}
          {todayGame && (
            <div className={styles.nextGame}>
              <span className={styles.nextLabel}>Today:</span>
              <span>
                vs {todayGame.vs} — {todayGame.status}
                {todayGame.time  && ` · ${todayGame.time} PST`}
                {todayGame.network && ` · ${todayGame.network}`}
              </span>
            </div>
          )}
          {!todayGame && nextScheduled && (
            <div className={styles.nextGame}>
              <span className={styles.nextLabel}>Next:</span>
              <span>
                {nextScheduled.homeAway === 'home' ? 'vs' : '@'} {nextScheduled.opponent}
              </span>
            </div>
          )}

          {/* Records row */}
          <div className={styles.recordsRow}>
            <span className={styles.recordCell}>
              <span className={styles.recordLabel}>Season</span>
              <span className={styles.recordValue}>{seasonStr}</span>
            </span>
            <span className={styles.recordCell}>
              <span className={styles.recordLabel}>L10</span>
              <span className={styles.recordValue}>{l10Str}</span>
            </span>
            <span className={styles.recordCell}>
              <span className={styles.recordLabel}>ATS</span>
              <span className={styles.recordValue}>—</span>
            </span>
          </div>

          {/* CTA */}
          <div className={exStyles.cardActions}>
            <button type="button" className={exStyles.pinBtn} onClick={handlePin}>
              📌 Pin {team?.name?.split(' ')[0] ?? 'Duke'}
            </button>
            <Link to={`/teams/${slug}`} className={styles.teamLink}>
              View profile →
            </Link>
          </div>
        </div>
      )}
    </article>
  );
}
