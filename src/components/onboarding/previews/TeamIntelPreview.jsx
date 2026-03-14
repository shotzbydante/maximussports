/**
 * TeamIntelPreview — static miniature replica of the Team Intel Hub surface.
 * Used in the WelcomeModal onboarding Step 2. No live data queries.
 */
import styles from './OnboardingPreviews.module.css';

const TEAMS = [
  {
    name: 'Duke Blue Devils',
    abbr: 'D',
    color: '#001A57',
    conf: 'ACC · #1',
    tier: 'Title Contender',
    tierClass: 'tagContender',
    ats: '18–9',
    coverPct: 67,
    odds: '+650',
  },
  {
    name: 'Arizona Wildcats',
    abbr: 'A',
    color: '#CC0033',
    conf: 'Big 12 · #3',
    tier: 'Title Contender',
    tierClass: 'tagContender',
    ats: '16–10',
    coverPct: 62,
    odds: '+900',
  },
  {
    name: "St. John's Red Storm",
    abbr: 'S',
    color: '#BA0C2F',
    conf: 'Big East · #12',
    tier: 'ATS Signal',
    tierClass: 'tagSignal',
    ats: '20–7',
    coverPct: 74,
    odds: '+3500',
  },
];

export default function TeamIntelPreview() {
  return (
    <div className={styles.previewRoot}>
      <div className={styles.header}>
        <p className={styles.headerLabel}>Team Intel Hub</p>
        <span className={`${styles.headerBadge} ${styles.headerBadgePrimary}`}>Live</span>
      </div>

      <div className={styles.body}>
        <div className={styles.teamIntelGrid}>
          {/* Left: team cards */}
          <div className={styles.teamIntelCol}>
            {TEAMS.map((t) => (
              <div key={t.abbr} className={styles.teamProfileCard}>
                <div className={styles.teamRow}>
                  <div className={styles.logoCircle} style={{ background: t.color }}>{t.abbr}</div>
                  <div>
                    <p className={styles.teamName}>{t.name}</p>
                    <p className={styles.teamConf}>{t.conf}</p>
                  </div>
                </div>
                <div className={styles.miniCardRow}>
                  <span className={`${styles.tag} ${styles[t.tierClass]}`}>{t.tier}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Right: ATS profile + odds */}
          <div className={styles.teamIntelCol}>
            <div className={styles.miniCard}>
              <p className={styles.miniCardSub} style={{ letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>ATS Profile</p>
              <div className={styles.miniCardRow}>
                <span className={styles.atsValue}>{TEAMS[0].ats}</span>
                <span className={styles.miniCardSub}>vs spread</span>
              </div>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${TEAMS[0].coverPct}%`, background: 'var(--color-up, #2d8a6e)' }} />
              </div>
              <p className={styles.miniCardSub}>Cover rate: {TEAMS[0].coverPct}%</p>
            </div>

            <div className={styles.miniCard}>
              <p className={styles.miniCardSub} style={{ letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Championship Odds</p>
              <div className={styles.miniCardRow}>
                <span className={styles.oddsValue}>{TEAMS[0].odds}</span>
                <span className={styles.miniCardSub}>to win title</span>
              </div>
            </div>

            <div className={styles.miniCard}>
              <p className={styles.miniCardSub} style={{ letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Next Game</p>
              <p className={styles.miniCardTitle}>vs #8 Purdue</p>
              <p className={styles.miniCardSub}>Spread: -3.5 · O/U: 142.5</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
