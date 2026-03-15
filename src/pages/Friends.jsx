/**
 * Friends page — central hub for social graph features.
 * Surfaces contact discovery, friend activity feed, and leaderboard.
 */

import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFriendGraph } from '../hooks/useFriendGraph';
import ContactDiscovery from '../components/social/ContactDiscovery';
import FriendActivityFeed from '../components/social/FriendActivityFeed';
import FriendsLeaderboard from '../components/social/FriendsLeaderboard';
import styles from '../components/social/Social.module.css';

export default function Friends() {
  const { user } = useAuth();
  const { socialCounts } = useFriendGraph();
  const [activeTab, setActiveTab] = useState('activity');

  if (!user) {
    return (
      <div className={styles.socialPage}>
        <h1 className={styles.socialPageTitle}>Friends</h1>
        <p className={styles.socialPageSubtitle}>Sign in to discover friends on Maximus Sports.</p>
      </div>
    );
  }

  const TABS = [
    { id: 'activity', label: 'Activity' },
    { id: 'discover', label: 'Discover' },
    { id: 'leaderboard', label: 'Leaderboard' },
  ];

  return (
    <div className={styles.socialPage}>
      <div>
        <h1 className={styles.socialPageTitle}>Friends</h1>
        <p className={styles.socialPageSubtitle}>
          {socialCounts.following > 0
            ? `${socialCounts.following} following · ${socialCounts.followers} followers · ${socialCounts.friends} friends`
            : 'Find friends and track picks together'}
        </p>
      </div>

      <div className={styles.tabRow}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'activity' && (
        <FriendActivityFeed limit={20} />
      )}

      {activeTab === 'discover' && (
        <ContactDiscovery showDoneButton={false} />
      )}

      {activeTab === 'leaderboard' && (
        <FriendsLeaderboard type="friends" />
      )}
    </div>
  );
}
