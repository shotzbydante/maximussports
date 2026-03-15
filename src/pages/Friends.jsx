/**
 * Friends page — central hub for social graph features.
 * Surfaces contact discovery, friend activity feed, and leaderboard.
 *
 * Default tab logic:
 * - New users (0 friends, 0 following) → Discover
 * - Users with a social graph → Activity
 * - Manual tab switch preserved for the session
 */

import { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFriendGraph } from '../hooks/useFriendGraph';
import ContactDiscovery from '../components/social/ContactDiscovery';
import FriendActivityFeed from '../components/social/FriendActivityFeed';
import FriendsLeaderboard from '../components/social/FriendsLeaderboard';
import styles from '../components/social/Social.module.css';

const TABS = [
  { id: 'activity', label: 'Activity' },
  { id: 'discover', label: 'Discover' },
  { id: 'leaderboard', label: 'Leaderboard' },
];

function computeDefaultTab(socialCounts) {
  const hasSocialGraph = socialCounts.following > 0 || socialCounts.friends > 0;
  return hasSocialGraph ? 'activity' : 'discover';
}

export default function Friends() {
  const { user } = useAuth();
  const { socialCounts } = useFriendGraph();

  const defaultTab = useMemo(
    () => computeDefaultTab(socialCounts),
    // Only compute on mount — socialCounts.following/friends drive the initial choice
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [socialCounts.following > 0 || socialCounts.friends > 0],
  );

  const [activeTab, setActiveTab] = useState(null);
  const currentTab = activeTab || defaultTab;

  if (!user) {
    return (
      <div className={styles.socialPage}>
        <h1 className={styles.socialPageTitle}>Friends</h1>
        <p className={styles.socialPageSubtitle}>Sign in to discover friends on Maximus Sports.</p>
      </div>
    );
  }

  const hasStats = socialCounts.following > 0 || socialCounts.followers > 0;

  return (
    <div className={styles.socialPage}>
      <div>
        <h1 className={styles.socialPageTitle}>Friends</h1>
        <p className={styles.socialPageSubtitle}>
          {hasStats
            ? `${socialCounts.following} following · ${socialCounts.followers} followers · ${socialCounts.friends} friends`
            : 'Find friends and track picks together'}
        </p>
      </div>

      <div className={styles.tabRow}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`${styles.tab} ${currentTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {currentTab === 'activity' && <FriendActivityFeed limit={20} />}
      {currentTab === 'discover' && <ContactDiscovery showDoneButton={false} />}
      {currentTab === 'leaderboard' && <FriendsLeaderboard type="friends" />}
    </div>
  );
}
