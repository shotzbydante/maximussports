/**
 * MLB Season Model — premium landing page for Maximus season-level
 * intelligence: championship odds, projected wins, division outlooks,
 * and postseason paths.
 */
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import styles from './MlbSeasonModel.module.css';

const STAT_CARDS = [
  { label: 'World Series Odds', value: '—', sub: 'Title probability' },
  { label: 'Projected Wins', value: '—', sub: 'Regular season model' },
  { label: 'Division Finish', value: '—', sub: 'Projected standing' },
  { label: 'Playoff Probability', value: '—', sub: 'Postseason likelihood' },
];

const LISTS = [
  {
    title: 'Top Contenders',
    items: ['Los Angeles Dodgers', 'New York Yankees', 'Atlanta Braves', 'Houston Astros'],
  },
  {
    title: 'Biggest Risers',
    items: ['Baltimore Orioles', 'Detroit Tigers', 'Seattle Mariners', 'Cincinnati Reds'],
  },
  {
    title: 'Value Teams',
    items: ['Kansas City Royals', 'Texas Rangers', 'Minnesota Twins', 'Tampa Bay Rays'],
  },
];

export default function MlbSeasonModel() {
  const { buildPath } = useWorkspace();

  return (
    <div className={styles.page}>
      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.eyebrow}>2026 Season Model</span>
          <h1 className={styles.heroTitle}>MLB Season Intelligence</h1>
          <p className={styles.heroBody}>
            Championship odds, projected wins, division outlooks, and postseason
            paths &mdash; powered by the Maximus model across all 30 teams.
          </p>
          <Link to={buildPath('/compare')} className={styles.heroLink}>
            Compare Teams &rarr;
          </Link>
        </div>
      </section>

      {/* ── Stat Cards ── */}
      <section className={styles.statGrid}>
        {STAT_CARDS.map((c) => (
          <div key={c.label} className={styles.statCard}>
            <span className={styles.statLabel}>{c.label}</span>
            <span className={styles.statValue}>{c.value}</span>
            <span className={styles.statSub}>{c.sub}</span>
          </div>
        ))}
      </section>

      {/* ── Outlook Lists ── */}
      <section className={styles.outlookSection}>
        <h2 className={styles.outlookTitle}>Season Outlook</h2>
        <div className={styles.outlookGrid}>
          {LISTS.map((list) => (
            <div key={list.title} className={styles.outlookCard}>
              <h3 className={styles.outlookCardTitle}>{list.title}</h3>
              <ol className={styles.outlookList}>
                {list.items.map((t, i) => (
                  <li key={t} className={styles.outlookItem}>
                    <span className={styles.outlookRank}>{i + 1}</span>
                    <span className={styles.outlookName}>{t}</span>
                    <span className={styles.outlookPlaceholder}>&mdash;</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
