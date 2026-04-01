/**
 * ExamplePinnedTeamCard — isolated preview card showing real team data.
 *
 * Uses the same normalizeTeamCardFields + rendering zones as the real
 * pinned card in PinnedTeamsSection, ensuring visual parity.
 *
 * ISOLATION CONTRACT:
 *   • Manages its own fetch state; never writes to pinnedTeamDataBySlug.
 *   • Never calls addPinnedTeam / setPinnedTeams; never touches localStorage.
 *   • Never triggers Home re-fetches or enrichment queues.
 *   • Uses a cancellation guard to avoid setState after unmount.
 *   • Uses a module-level TTL cache (5 min) so repeated mounts skip the network.
 */

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getTeamBySlug } from '../../data/teams';
import { getTeamSlug } from '../../utils/teamSlug';
import { fetchTeamPage } from '../../api/team';
import { normalizeTeamCardFields, fmtRecord, fmtAts, fmtAtsLast10 } from '../../utils/teamCardFields';
import { track } from '../../analytics/index';
import TeamLogo from '../shared/TeamLogo';
import SeedBadge from '../common/SeedBadge';
import styles from './PinnedTeamsSection.module.css';
import exStyles from './ExamplePinnedTeamCard.module.css';

// ─── Module-level TTL cache ─────────────────────────────────────────────
const CACHE_TTL = 5 * 60 * 1000;
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

function formatTimePST(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch { return null; }
}

// ─── Loading skeleton ─────────────────────────────────────────────────
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
        {[32, 42, 42, 48].map((w, i) => (
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

// ─── Main component ───────────────────────────────────────────────────
export default function ExamplePinnedTeamCard({ slug, gamesForToday, onDismiss, onPinTeam }) {
  const team = getTeamBySlug(slug);
  const [status, setStatus] = useState(() => {
    const cached = getCacheEntry(slug);
    return { data: cached, loading: !cached, fetchErr: false };
  });
  const { data, loading, fetchErr } = status;
  const [video, setVideo] = useState(null);
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    track('pinned_preview_shown', { slug });
  }, [slug]);

  // Fetch team video — same endpoint as real pinned card
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/youtube/team?teamSlug=${encodeURIComponent(slug)}&maxResults=1`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (cancelled || !d) return;
        setVideo((d.items ?? [])[0] ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [slug]);

  // Fetch full team data (no coreOnly — full data for parity)
  useEffect(() => {
    if (getCacheEntry(slug)) return;
    let cancelled = false;
    fetchTeamPage(slug)
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

  // ── Use the SAME normalizer as the real pinned card ──
  const fields = data ? normalizeTeamCardFields(slug, data) : null;

  // Today's game from live scores
  const todayGame = (() => {
    if (!Array.isArray(gamesForToday)) return null;
    for (const g of gamesForToday) {
      const homeSlug = getTeamSlug(g.homeTeam);
      const awaySlug = getTeamSlug(g.awayTeam);
      if (homeSlug === slug || awaySlug === slug) {
        return {
          vs: homeSlug === slug ? g.awayTeam : g.homeTeam,
          status: g.gameStatus,
          time: formatTimePST(g.startTime),
          network: g.network,
          gameId: g.gameId,
        };
      }
    }
    return null;
  })();

  const handleDismiss = () => { track('pinned_preview_dismiss', { slug }); onDismiss?.(); };
  const handlePin = () => { track('pinned_preview_pin', { slug }); onPinTeam?.(slug); };

  return (
    <article className={exStyles.card} aria-label={`${team?.name ?? slug} preview`}>
      {/* Preview label + dismiss */}
      <div className={exStyles.topBar}>
        <span className={exStyles.previewLabel}>Preview</span>
        <button type="button" className={styles.dismissBtn} onClick={handleDismiss} aria-label="Dismiss preview">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className={exStyles.body}><CardSkeleton /></div>
      ) : fetchErr ? (
        <div className={exStyles.body}>
          <div className={exStyles.fallback}>
            <p className={exStyles.fallbackTitle}>{team?.name ?? 'Duke Blue Devils'}</p>
            <p className={exStyles.fallbackText}>Elite program with deep tournament pedigree and perennial contender status.</p>
            <Link to={`/ncaam/teams/${slug}`} className={styles.teamLink}>View full profile →</Link>
          </div>
        </div>
      ) : (
        <div className={exStyles.body}>
          {/* ── Zone 1: Header — SAME as real card ── */}
          <div className={styles.cardHeader}>
            <Link to={`/ncaam/teams/${slug}`} className={styles.cardLink}>
              {fields?.seed != null && <SeedBadge seed={fields.seed} size="sm" variant={fields.seed <= 4 ? 'gold' : 'default'} />}
              <TeamLogo team={team} size={32} />
              <div className={styles.cardMeta}>
                <span className={styles.teamName}>{team?.name ?? 'Duke Blue Devils'}</span>
                <span className={styles.conference}>{team?.conference ?? 'ACC'}</span>
              </div>
            </Link>
            <div className={styles.cardBadges}>
              {data?.rank != null && fields?.seed == null && <span className={styles.rank}>#{data.rank}</span>}
            </div>
          </div>

          {/* ── Zone 2: Stat strip — SAME 4 items as real card ── */}
          <div className={styles.statStrip}>
            <span className={styles.statCell}>
              <span className={styles.statLabel}>Record</span>
              <span className={styles.statValue}>{fields ? fmtRecord(fields.seasonRecord) : '—'}</span>
            </span>
            {fields?.conferenceFinish && (
              <span className={`${styles.statCell} ${styles.statCellWide}`}>
                <span className={styles.statLabel}>Conf. Finish</span>
                <span className={`${styles.statValue} ${styles.statValueWrap}`}>{fields.conferenceFinish}</span>
              </span>
            )}
            <span className={styles.statCell}>
              <span className={styles.statLabel}>ATS (L10)</span>
              <span className={styles.statValue}>{fields?.atsLast10 ? fmtAtsLast10(fields.atsLast10) : (fields ? fmtAts(fields.atsRecord) : '—')}</span>
            </span>
            {fields?.tournamentLabel && (
              <span className={`${styles.statCell} ${styles.statCellWide} ${fields.tournamentStatus === 'active' ? styles.statCellActive : ''} ${fields.tournamentStatus === 'eliminated' ? styles.statCellElim : ''}`}>
                <span className={styles.statLabel}>Tournament</span>
                <span className={`${styles.statValue} ${styles.statValueWrap}`}>{fields.tournamentLabel}</span>
              </span>
            )}
          </div>

          {/* ── Zone 3: Game / result module — SAME logic as real card ── */}
          {(() => {
            // Priority 1: Live/today scoreboard game
            if (todayGame) {
              return (
                <div className={styles.gameModule}>
                  <span className={styles.gameModuleTag}>Today</span>
                  <div className={styles.gameModuleBody}>
                    <div className={styles.gameModuleInfo}>
                      <span className={styles.gameMatchup}>vs {todayGame.vs}</span>
                      <span className={styles.gameDetail}>
                        {todayGame.status}
                        {todayGame.time && ` · ${todayGame.time} PST`}
                        {todayGame.network && ` · ${todayGame.network}`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }
            // Priority 2: Active in tournament — show next round
            if (fields?.tournamentStatus === 'active' && fields?.nextNcaaGame) {
              const ng = fields.nextNcaaGame;
              const gameTime = formatTimePST(ng.date);
              return (
                <div className={styles.gameModule}>
                  <span className={styles.gameModuleTag}>{fields.tournamentRoundLabel || 'Next Round'}</span>
                  <div className={styles.gameModuleBody}>
                    {ng.opponentLogo && <img src={ng.opponentLogo} alt="" className={styles.gameOppLogo} loading="lazy" />}
                    <div className={styles.gameModuleInfo}>
                      <span className={styles.gameMatchup}>vs {ng.opponent}</span>
                      <span className={styles.gameDetail}>
                        {ng.status}{gameTime && ` · ${gameTime} PST`}{ng.broadcast && ` · ${ng.broadcast}`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }
            // Priority 3: Active but TBD opponent
            if (fields?.tournamentStatus === 'active' && fields?.tournamentLastGame?.won) {
              return (
                <div className={styles.gameModule}>
                  <span className={styles.gameModuleTag}>{fields.tournamentRoundLabel || 'Next Round'}</span>
                  <div className={styles.gameModuleBody}>
                    <div className={styles.gameModuleInfo}>
                      <span className={styles.gameMatchup}>vs TBD</span>
                      <span className={styles.gameDetail}>Opponent not yet determined</span>
                    </div>
                  </div>
                </div>
              );
            }
            // Priority 4: Eliminated — show last tournament result
            if (fields?.tournamentLastGame && !fields.tournamentLastGame.won) {
              const g = fields.tournamentLastGame;
              return (
                <div className={`${styles.gameModule} ${styles.gameModuleElim}`}>
                  <span className={styles.gameModuleTag}>Tournament Result — Loss</span>
                  <div className={styles.gameModuleBody}>
                    <div className={styles.gameModuleInfo}>
                      <span className={styles.gameMatchup}>vs {g.opponent}</span>
                      <span className={styles.gameScore}>{g.ourScore}–{g.oppScore}</span>
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {/* ── Zone 4: Intel summary ── */}
          <div className={styles.intelModule}>
            <p className={styles.teamSummaryText}>
              {data?.teamSummary || `${team?.name ?? 'Duke'} enters the tournament as a top-seeded contender with elite talent and deep coaching experience.`}
            </p>
          </div>

          {/* ── Zone 5: Video teaser — SAME as real card ── */}
          {video?.thumbUrl && (
            <Link to={`/ncaam/teams/${slug}`} className={styles.videoTeaser}>
              <div className={styles.videoThumb}>
                <img src={video.thumbUrl} alt="" className={styles.videoThumbImg} loading="lazy" decoding="async" />
                <div className={styles.videoPlayOverlay} aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M6 4.5L16 10L6 15.5V4.5Z" fill="currentColor" />
                  </svg>
                </div>
              </div>
              <span className={styles.videoTitle}>{video.title}</span>
            </Link>
          )}

          {/* ── Zone 6: CTA ── */}
          <div className={exStyles.cardActions}>
            <button type="button" className={exStyles.pinBtn} onClick={handlePin}>
              📌 Pin {team?.name?.split(' ')[0] ?? 'Duke'}
            </button>
            <Link to={`/ncaam/teams/${slug}`} className={styles.cardCta}>
              View Team Intel →
            </Link>
          </div>
        </div>
      )}
    </article>
  );
}
