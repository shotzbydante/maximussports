import { useState, useEffect, useRef, useCallback } from 'react';
import RobotAvatar from '../profile/RobotAvatar';
import { VerifiedBadge } from '../profile/ProfileAvatar';
import { useFriendGraph } from '../../hooks/useFriendGraph';
import styles from './SocialListDropdown.module.css';

const STATUS_LABELS = {
  none: 'Follow',
  follower: 'Follow Back',
  following: 'Following',
  friends: 'Friends',
};

const STATUS_STYLE = {
  none: styles.btnFollow,
  follower: styles.btnFollowBack,
  following: styles.btnFollowing,
  friends: styles.btnFriends,
};

function DropdownUserRow({ user: u, onFollow, onUnfollow }) {
  const [status, setStatus] = useState(u.followStatus || 'none');
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const prev = status;
    const isUnfollow = status === 'following' || status === 'friends';

    setStatus(isUnfollow ? (status === 'friends' ? 'follower' : 'none') : (status === 'follower' ? 'friends' : 'following'));

    const result = isUnfollow ? await onUnfollow(u.id) : await onFollow(u.id);
    if (result === null || result === undefined) {
      setStatus(prev);
    } else {
      setStatus(result);
    }
    setBusy(false);
  }, [busy, status, u.id, onFollow, onUnfollow]);

  return (
    <div className={styles.userRow}>
      <div className={styles.userAvatar}>
        <RobotAvatar
          jerseyNumber={u.avatarConfig?.jerseyNumber || ''}
          jerseyColor={u.avatarConfig?.jerseyColor}
          robotColor={u.avatarConfig?.robotColor}
          size={40}
        />
      </div>
      <div className={styles.userInfo}>
        <span className={styles.userName}>
          {u.displayName || u.username}
          {u.isPro && <VerifiedBadge className={styles.verifiedBadge} />}
        </span>
        <span className={styles.userHandle}>@{u.username}</span>
      </div>
      <button
        type="button"
        className={`${styles.followBtn} ${STATUS_STYLE[status] || styles.btnFollow}`}
        onClick={handleClick}
        disabled={busy}
      >
        {STATUS_LABELS[status] || 'Follow'}
      </button>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className={styles.skeletonList}>
      {[1, 2, 3].map((i) => (
        <div key={i} className={styles.skeletonRow}>
          <div className={styles.skeletonAvatar} />
          <div className={styles.skeletonText}>
            <div className={styles.skeletonLine} style={{ width: '60%' }} />
            <div className={styles.skeletonLine} style={{ width: '40%' }} />
          </div>
          <div className={styles.skeletonBtn} />
        </div>
      ))}
    </div>
  );
}

const EMPTY_ICONS = {
  followers: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  following: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  ),
};

export default function SocialListDropdown({ type, onClose }) {
  const { fetchFollowers, fetchFollowing, followUser, unfollowUser } = useFriendGraph();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const ref = useRef(null);
  const abortRef = useRef(false);

  useEffect(() => {
    abortRef.current = false;
    setLoading(true);
    setError(false);

    const fetcher = type === 'followers' ? fetchFollowers : fetchFollowing;
    fetcher()
      .then((list) => {
        if (abortRef.current) return;
        setUsers(Array.isArray(list) ? list : []);
        setLoading(false);
      })
      .catch(() => {
        if (abortRef.current) return;
        setUsers([]);
        setError(true);
        setLoading(false);
      });

    return () => { abortRef.current = true; };
  }, [type, fetchFollowers, fetchFollowing]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    function handleEscape(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleFollow = useCallback(async (targetId) => {
    const newStatus = await followUser(targetId);
    if (newStatus) {
      setUsers((prev) => prev.map((u) => (u.id === targetId ? { ...u, followStatus: newStatus } : u)));
    }
    return newStatus;
  }, [followUser]);

  const handleUnfollow = useCallback(async (targetId) => {
    const newStatus = await unfollowUser(targetId);
    if (newStatus !== null) {
      setUsers((prev) => prev.map((u) => (u.id === targetId ? { ...u, followStatus: newStatus } : u)));
    }
    return newStatus;
  }, [unfollowUser]);

  const isFollowers = type === 'followers';

  return (
    <div className={styles.overlay}>
      <div className={styles.dropdown} ref={ref} role="dialog" aria-modal="true" aria-label={isFollowers ? 'Followers' : 'Following'}>
        <div className={styles.header}>
          <h3 className={styles.title}>
            {isFollowers ? 'Followers' : 'Following'}
          </h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="12" y1="2" x2="2" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className={styles.body}>
          {loading && <SkeletonRows />}

          {!loading && error && (
            <div className={styles.empty}>
              <p className={styles.emptyText}>Something went wrong. Please try again.</p>
            </div>
          )}

          {!loading && !error && users.length === 0 && (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>
                {EMPTY_ICONS[type]}
              </div>
              <p className={styles.emptyText}>
                {isFollowers
                  ? 'No followers yet. Share your profile to grow your network.'
                  : 'You\u2019re not following anyone yet. Find friends to get started.'}
              </p>
            </div>
          )}

          {!loading && !error && users.length > 0 && (
            <div className={styles.list}>
              {users.map((u) => (
                <DropdownUserRow
                  key={u.id}
                  user={u}
                  onFollow={handleFollow}
                  onUnfollow={handleUnfollow}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
