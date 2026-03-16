import { useState, useEffect, useRef, useCallback } from 'react';
import ContactRow from '../social/ContactRow';
import { useFriendGraph } from '../../hooks/useFriendGraph';
import styles from './SocialListDropdown.module.css';

export default function SocialListDropdown({ type, onClose }) {
  const { fetchFollowers, fetchFollowing, followUser, unfollowUser } = useFriendGraph();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);

  useEffect(() => {
    setLoading(true);
    const fetcher = type === 'followers' ? fetchFollowers : fetchFollowing;
    fetcher().then(list => {
      setUsers(list);
      setLoading(false);
    });
  }, [type, fetchFollowers, fetchFollowing]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleFollow = useCallback(async (targetId) => {
    const newStatus = await followUser(targetId);
    if (newStatus) {
      setUsers(prev => prev.map(u =>
        u.id === targetId ? { ...u, followStatus: newStatus } : u
      ));
    }
    return newStatus;
  }, [followUser]);

  const handleUnfollow = useCallback(async (targetId) => {
    const newStatus = await unfollowUser(targetId);
    if (newStatus !== null) {
      setUsers(prev => prev.map(u =>
        u.id === targetId ? { ...u, followStatus: newStatus } : u
      ));
    }
    return newStatus;
  }, [unfollowUser]);

  return (
    <div className={styles.overlay}>
      <div className={styles.dropdown} ref={ref}>
        <div className={styles.header}>
          <h3 className={styles.title}>
            {type === 'followers' ? 'Followers' : 'Following'}
          </h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.body}>
          {loading && (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              <span>Loading...</span>
            </div>
          )}
          {!loading && users.length === 0 && (
            <p className={styles.empty}>
              {type === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            </p>
          )}
          {!loading && users.length > 0 && (
            <div className={styles.list}>
              {users.map(u => (
                <ContactRow
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
