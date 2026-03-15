/**
 * FriendsLeaderboard — lightweight pick accuracy leaderboard among friends.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import RobotAvatar from '../profile/RobotAvatar';
import styles from './Social.module.css';

export default function FriendsLeaderboard({ type = 'friends' }) {
  const { session } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetch(`/api/social/leaderboard?type=${type}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to load leaderboard');
      const data = await res.json();
      setEntries(data.leaderboard || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [session, type]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  if (loading) {
    return (
      <div className={styles.leaderboardContainer}>
        <div className={styles.leaderboardHeader}>
          <h3 className={styles.leaderboardTitle}>Friends Leaderboard</h3>
        </div>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.leaderboardContainer}>
      <div className={styles.leaderboardHeader}>
        <h3 className={styles.leaderboardTitle}>Friends Leaderboard</h3>
      </div>

      {entries.length === 0 ? (
        <div className={styles.leaderboardEmpty}>
          <p>No picks tracked yet. Make some picks to appear on the leaderboard.</p>
        </div>
      ) : (
        entries.map(entry => {
          const rankClass =
            entry.rank === 1 ? styles.leaderboardRank1 :
            entry.rank === 2 ? styles.leaderboardRank2 :
            entry.rank === 3 ? styles.leaderboardRank3 : '';

          return (
            <div
              key={entry.userId}
              className={`${styles.leaderboardRow} ${entry.isCurrentUser ? styles.leaderboardRowCurrent : ''}`}
            >
              <span className={`${styles.leaderboardRank} ${rankClass}`}>
                {entry.rank}
              </span>
              <div className={styles.leaderboardAvatar}>
                <RobotAvatar
                  jerseyNumber={entry.avatarConfig?.jerseyNumber || ''}
                  jerseyColor={entry.avatarConfig?.jerseyColor}
                  robotColor={entry.avatarConfig?.robotColor}
                  size={32}
                />
              </div>
              <div className={styles.leaderboardInfo}>
                <span className={styles.leaderboardName}>
                  {entry.displayName || entry.username}
                  {entry.isCurrentUser && ' (You)'}
                </span>
              </div>
              <div className={styles.leaderboardStats}>
                <div className={styles.leaderboardStat}>
                  <span className={styles.leaderboardStatValue}>{entry.totalWins}</span>
                  <span className={styles.leaderboardStatLabel}>Wins</span>
                </div>
                <div className={styles.leaderboardStat}>
                  <span className={styles.leaderboardStatValue}>
                    {entry.totalWins}-{entry.totalLosses}
                  </span>
                  <span className={styles.leaderboardStatLabel}>Record</span>
                </div>
              </div>
              <span className={styles.leaderboardAccuracy}>{entry.accuracy}%</span>
            </div>
          );
        })
      )}
    </div>
  );
}
