/**
 * PostHistory
 *
 * Premium post history grid for the Content Studio dashboard.
 * Fetches from /api/social/posts and renders an audit-ready timeline
 * of every Instagram publish attempt with lifecycle status badges,
 * thumbnails, timestamps, and quick-action affordances.
 *
 * Props:
 *   refreshKey  {number}  — increment to trigger a refetch (pass a counter
 *                           that bumps whenever a new post succeeds)
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchPostHistory } from '../../lib/socialPosts';
import styles from './PostHistory.module.css';

// ── Status badge config ────────────────────────────────────────────────────
const STATUS_META = {
  draft:   { label: 'Draft',   color: 'neutral' },
  pending: { label: 'Pending', color: 'blue'    },
  posted:  { label: 'Posted',  color: 'green'   },
  failed:  { label: 'Failed',  color: 'red'     },
};

const PLATFORM_META = {
  instagram: { label: 'Instagram', icon: '📸' },
};

const STATUS_FILTER_OPTIONS = [
  { value: '',        label: 'All statuses' },
  { value: 'posted',  label: 'Posted'       },
  { value: 'failed',  label: 'Failed'       },
  { value: 'pending', label: 'Pending'      },
  { value: 'draft',   label: 'Draft'        },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTs(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month:   'short',
      day:     'numeric',
      hour:    'numeric',
      minute:  '2-digit',
      hour12:  true,
    });
  } catch {
    return iso;
  }
}

function truncate(str, max = 90) {
  if (!str) return '';
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

function parseStatusDetail(raw) {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

const FAILURE_STAGE_LABELS = {
  env:            'Environment config error',
  validate:       'Request validation failed',
  preflight:      'Image URL unreachable or invalid',
  create_media:   'Instagram could not process the image',
  poll_container: 'Instagram processing timed out',
  publish_media:  'Instagram publish step failed',
  network:        'Network error',
};

function humanizeFailureStage(stage) {
  return FAILURE_STAGE_LABELS[stage] ?? stage ?? 'Unknown';
}

function formatDuration(ms) {
  if (ms == null) return null;
  const s = Math.round(ms / 1000);
  return s < 1 ? '<1s' : `${s}s`;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? { label: status, color: 'neutral' };
  return (
    <span className={`${styles.badge} ${styles[`badge_${meta.color}`]}`}>
      {meta.label}
    </span>
  );
}

function SummaryStats({ posts }) {
  const counts = posts.reduce((acc, p) => {
    const status = getEffectiveStatus(p);
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className={styles.stats}>
      <div className={styles.statItem}>
        <span className={styles.statNum}>{posts.length}</span>
        <span className={styles.statLabel}>Total</span>
      </div>
      <div className={styles.statDivider} />
      <div className={styles.statItem}>
        <span className={`${styles.statNum} ${styles.statGreen}`}>{counts.posted ?? 0}</span>
        <span className={styles.statLabel}>Posted</span>
      </div>
      <div className={styles.statDivider} />
      <div className={styles.statItem}>
        <span className={`${styles.statNum} ${styles.statRed}`}>{counts.failed ?? 0}</span>
        <span className={styles.statLabel}>Failed</span>
      </div>
      <div className={styles.statDivider} />
      <div className={styles.statItem}>
        <span className={`${styles.statNum} ${styles.statMuted}`}>{counts.draft ?? 0}</span>
        <span className={styles.statLabel}>Drafts</span>
      </div>
    </div>
  );
}

const CAPTION_PREVIEW_LIMIT = 140;

function CaptionPreview({ text }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const isLong = text.length > CAPTION_PREVIEW_LIMIT;

  return (
    <div className={styles.captionWrap}>
      <p className={styles.captionPreview}>
        {expanded || !isLong ? text : truncate(text, CAPTION_PREVIEW_LIMIT)}
      </p>
      {isLong && (
        <button
          className={styles.captionToggle}
          onClick={(e) => { e.stopPropagation(); setExpanded(prev => !prev); }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

/**
 * Derive effective status from durable fields.
 * If lifecycle_status is 'pending' but published_media_id or permalink exists,
 * the publish clearly succeeded — show 'posted' instead of stale 'pending'.
 */
function getEffectiveStatus(post) {
  if (post.lifecycle_status === 'pending') {
    if (post.published_media_id || post.permalink) return 'posted';
  }
  return post.lifecycle_status;
}

function PostCard({ post }) {
  const [captionCopied, setCaptionCopied] = useState(false);

  const handleCopyCaption = (e) => {
    e.stopPropagation();
    if (!post.caption_snapshot) return;
    navigator.clipboard.writeText(post.caption_snapshot).then(() => {
      setCaptionCopied(true);
      setTimeout(() => setCaptionCopied(false), 2000);
    });
  };

  const handleOpenImage = (e) => {
    e.stopPropagation();
    if (post.image_snapshot_url) window.open(post.image_snapshot_url, '_blank', 'noopener');
  };

  const effectiveStatus = getEffectiveStatus(post);
  const platformMeta = PLATFORM_META[post.platform] ?? { label: post.platform, icon: '🌐' };
  const postedTs   = formatTs(post.posted_at);
  const createdTs  = formatTs(post.created_at);
  const displayTs  = post.posted_at ? postedTs : createdTs;
  const tsLabel    = post.posted_at ? 'Posted' : 'Created';

  const detail = parseStatusDetail(post.status_detail);
  // Read permalink from top-level column first, then status_detail fallback
  const permalink = post.permalink ?? detail?.permalink ?? null;
  const durationLabel = formatDuration(detail?.duration_ms ?? detail?.durationMs);
  const requestId = post.asset_version ?? detail?.request_id ?? null;

  return (
    <div className={`${styles.card} ${styles[`card_${effectiveStatus}`] ?? ''}`}>
      {/* Thumbnail */}
      <div className={styles.thumb}>
        {post.image_snapshot_url ? (
          <button
            className={styles.thumbBtn}
            onClick={handleOpenImage}
            title="Open image in new tab"
            aria-label="Open posted image in new tab"
          >
            <img
              src={post.image_snapshot_url}
              alt={post.title ?? 'Post image'}
              className={styles.thumbImg}
              loading="lazy"
            />
            <span className={styles.thumbOverlay}>↗</span>
          </button>
        ) : (
          <div className={styles.thumbEmpty}>
            <span>{platformMeta.icon}</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className={styles.cardBody}>
        {/* Row 1: title + badge */}
        <div className={styles.cardTop}>
          <span className={styles.cardTitle}>
            {post.title ?? post.template_type ?? post.content_studio_section ?? 'Untitled'}
          </span>
          <StatusBadge status={effectiveStatus} />
        </div>

        {/* Row 2: platform + team + duration */}
        <div className={styles.cardMeta}>
          <span className={styles.platformPill}>
            {platformMeta.icon} {platformMeta.label}
          </span>
          {post.team_name && (
            <span className={styles.teamPill}>{post.team_name}</span>
          )}
          {post.content_studio_section && (
            <span className={styles.sectionPill}>{post.content_studio_section}</span>
          )}
          {durationLabel && (
            <span className={styles.sectionPill}>{durationLabel}</span>
          )}
        </div>

        {/* Row 3: caption preview with expand/collapse */}
        {post.caption_snapshot && (
          <CaptionPreview text={post.caption_snapshot} />
        )}

        {/* Row 4: failure detail — human-readable stage + message */}
        {effectiveStatus === 'failed' && (
          <div className={styles.errorDetail} role="alert">
            {post.response_stage && (
              <span className={styles.failStageLabel}>
                {humanizeFailureStage(post.response_stage)}
              </span>
            )}
            {post.error_message && (
              <p className={styles.errorMsg}>{post.error_message}</p>
            )}
          </div>
        )}

        {/* Row 5: permalink or media ID */}
        {permalink && effectiveStatus === 'posted' ? (
          <a
            href={permalink}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.permalinkRow}
          >
            View on Instagram ↗
          </a>
        ) : post.published_media_id && effectiveStatus === 'posted' ? (
          <p className={styles.mediaId}>
            ID&nbsp;{post.published_media_id}
          </p>
        ) : null}

        {/* Row 6: timestamps + request_id + actions */}
        <div className={styles.cardFooter}>
          <span className={styles.timestamp}>
            {tsLabel}&nbsp;{displayTs}
            {requestId && (
              <span className={styles.requestId}> · req {requestId.slice(0, 8)}</span>
            )}
          </span>
          <div className={styles.actions}>
            {post.caption_snapshot && (
              <button
                className={styles.actionBtn}
                onClick={handleCopyCaption}
                title="Copy caption"
                aria-label="Copy caption"
              >
                {captionCopied ? '✓' : 'Copy caption'}
              </button>
            )}
            {post.image_snapshot_url && (
              <button
                className={styles.actionBtn}
                onClick={handleOpenImage}
                title="Open image"
                aria-label="Open image in new tab"
              >
                View image ↗
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function PostHistory({ refreshKey = 0 }) {
  const [posts,          setPosts]         = useState([]);
  const [loading,        setLoading]       = useState(true);
  const [error,          setError]         = useState(null);
  const [statusFilter,   setStatusFilter]  = useState('');

  const [errorStage, setErrorStage] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorStage(null);
    try {
      const { posts: fetched } = await fetchPostHistory({
        platform: 'instagram',
        status:   statusFilter || undefined,
        limit:    100,
      });
      setPosts(fetched);
    } catch (err) {
      setErrorStage(err.stage ?? null);
      setError(err.message ?? 'Failed to load post history');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  // Reload when refreshKey bumps (new post) or filter changes
  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <section className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.title}>Post History</h2>
          {!loading && !error && (
            <span className={styles.countBadge}>{posts.length}</span>
          )}
        </div>
        <div className={styles.headerRight}>
          <select
            className={styles.filterSelect}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            {STATUS_FILTER_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            className={styles.refreshBtn}
            onClick={load}
            disabled={loading}
            aria-label="Refresh post history"
            title="Refresh"
          >
            {loading ? '…' : '↺'}
          </button>
        </div>
      </div>

      {/* Summary stats */}
      {!loading && !error && posts.length > 0 && (
        <SummaryStats posts={posts} />
      )}

      {/* Body */}
      {loading ? (
        <div className={styles.skeletonList}>
          {[1, 2, 3].map(i => (
            <div key={i} className={styles.skeletonCard} />
          ))}
        </div>
      ) : error ? (
        <div className={styles.errorState} role="alert">
          <span className={styles.errorIcon}>{errorStage === 'schema_missing' ? '🗄' : '⚠'}</span>
          <span>{error}</span>
          {errorStage !== 'schema_missing' && (
            <button className={styles.retryBtn} onClick={load}>Retry</button>
          )}
        </div>
      ) : posts.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📸</span>
          <p className={styles.emptyTitle}>No posts yet</p>
          <p className={styles.emptySubtext}>
            {statusFilter
              ? `No ${statusFilter} posts found. Try a different filter.`
              : 'Once you publish content from the studio, your post history will appear here.'}
          </p>
        </div>
      ) : (
        <div className={styles.grid}>
          {posts.map(post => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </section>
  );
}
