/**
 * FriendActivityFeed — shows recent picks, brackets, and wins from friends.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import RobotAvatar from '../profile/RobotAvatar';
import styles from './Social.module.css';

const ACTIVITY_ICONS = {
  pick: '🎯',
  bracket_update: '🏀',
  upset_hit: '🔥',
  win_streak: '🏆',
};

const ACTIVITY_VERBS = {
  pick: 'picked',
  bracket_update: 'updated their bracket',
  upset_hit: 'called an upset',
  win_streak: 'is on a winning streak',
};

function timeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function FriendActivityFeed({ limit = 20 }) {
  const { session } = useAuth();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const fetchFeed = useCallback(async (offset = 0) => {
    if (!session) return;
    try {
      const res = await fetch(`/api/social/friends-feed?limit=${limit}&offset=${offset}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to load feed');
      const data = await res.json();
      if (offset === 0) {
        setActivities(data.activities || []);
      } else {
        setActivities(prev => [...prev, ...(data.activities || [])]);
      }
      setHasMore(data.hasMore);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [session, limit]);

  useEffect(() => {
    fetchFeed(0);
  }, [fetchFeed]);

  if (loading) {
    return (
      <div className={styles.feedContainer}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p className={styles.loadingText}>Loading friend activity...</p>
        </div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className={styles.feedContainer}>
        <div className={styles.feedEmpty}>
          <p>No friend activity yet. Follow more friends to see their picks and brackets here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.feedContainer}>
      {activities.map(activity => (
        <div key={activity.id} className={styles.feedItem}>
          <div className={styles.feedAvatar}>
            <RobotAvatar
              jerseyNumber={activity.user?.avatarConfig?.jerseyNumber || ''}
              jerseyColor={activity.user?.avatarConfig?.jerseyColor}
              robotColor={activity.user?.avatarConfig?.robotColor}
              size={36}
            />
          </div>
          <div className={styles.feedBody}>
            <span className={styles.feedUser}>
              {activity.user?.displayName || activity.user?.username}
            </span>
            <span className={styles.feedAction}>
              {ACTIVITY_ICONS[activity.activity_type] || ''}{' '}
              {ACTIVITY_VERBS[activity.activity_type] || ''}{' '}
              {activity.title}
            </span>
            <div className={styles.feedMeta}>
              {activity.metadata?.confidence && (
                <span className={styles.feedConfidence}>
                  {activity.metadata.confidence} confidence
                </span>
              )}
              <span className={styles.feedTime}>{timeAgo(activity.created_at)}</span>
            </div>
          </div>
        </div>
      ))}

      {hasMore && (
        <button
          type="button"
          className={styles.btnSkip}
          onClick={() => fetchFeed(activities.length)}
        >
          Load more
        </button>
      )}
    </div>
  );
}
