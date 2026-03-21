/**
 * MLB Home — the primary landing page for the MLB workspace.
 * Shows a premium launch splash on first entry, then the full home view.
 */

import { useState, useEffect } from 'react';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import MlbLoading from '../../components/mlb/MlbLoading';
import PennantWatch from '../../components/mlb/PennantWatch';
import MlbNewsFeedWidget from '../../components/mlb/MlbNewsFeedWidget';
import styles from './MlbHome.module.css';

const SPLASH_KEY = '__maximus_mlb_splash_shown';

export default function MlbHome() {
  const { workspace } = useWorkspace();

  const alreadyShown = sessionStorage.getItem(SPLASH_KEY) === '1';
  const [showSplash, setShowSplash] = useState(!alreadyShown);

  useEffect(() => {
    if (!showSplash) return;
    const timer = setTimeout(() => {
      setShowSplash(false);
      sessionStorage.setItem(SPLASH_KEY, '1');
    }, 2200);
    return () => clearTimeout(timer);
  }, [showSplash]);

  if (showSplash) return <MlbLoading />;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.date}>
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }).toUpperCase()}
        </span>
        <span className={styles.subtitle}>{workspace.labels.intelligence}</span>
      </header>

      <section className={styles.heroCard}>
        <div className={styles.heroEyebrow}>Today's Intelligence Briefing</div>
        <p className={styles.heroBody}>
          Welcome to the MLB workspace — your hub for Major League Baseball intelligence.
          Track World Series futures, follow your teams, and stay ahead of the game
          with data-driven insights powered by the Maximus model. Scores, matchups, and
          picks will populate as the season gets underway and data sources come online.
        </p>
      </section>

      <PennantWatch />
      <MlbNewsFeedWidget />
    </div>
  );
}
