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
    acc[p.lifecycle_status] = (acc[p.lifecycle_status] ?? 0) + 1;
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

  const platformMeta = PLATFORM_META[post.platform] ?? { label: post.platform, icon: '🌐' };
  const postedTs   = formatTs(post.posted_at);
  const createdTs  = formatTs(post.created_at);
  const displayTs  = post.posted_at ? postedTs : createdTs;
  const tsLabel    = post.posted_at ? 'Posted' : 'Created';

  return (
    <div className={`${styles.card} ${styles[`card_${post.lifecycle_status}`] ?? ''}`}>
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
          <StatusBadge status={post.lifecycle_status} />
        </div>

        {/* Row 2: platform + team */}
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
        </div>

        {/* Row 3: caption preview */}
        {post.caption_snapshot && (
          <p className={styles.captionPreview}>
            {truncate(post.caption_snapshot, 100)}
          </p>
        )}

        {/* Row 4: error message */}
        {post.lifecycle_status === 'failed' && post.error_message && (
          <p className={styles.errorDetail} role="alert">
            {post.error_message}
          </p>
        )}

        {/* Row 5: media ID */}
        {post.published_media_id && (
          <p className={styles.mediaId}>
            ID&nbsp;{post.published_media_id}
          </p>
        )}

        {/* Row 6: timestamps + actions */}
        <div className={styles.cardFooter}>
          <span className={styles.timestamp}>
            {tsLabel}&nbsp;{displayTs}
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
