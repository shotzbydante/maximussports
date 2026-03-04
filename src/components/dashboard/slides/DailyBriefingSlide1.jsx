import styles from './DailyBriefingSlide1.module.css';
import SlideShell from './SlideShell';

export default function DailyBriefingSlide1({ data, asOf, ...rest }) {
  const games = data?.odds?.games ?? [];
  const ranked = data?.rankingsTop25 ?? [];
  const headlines = data?.headlines ?? [];

  const gamesWithOdds = games.filter(g => g.spread != null || g.homeSpread != null || g.moneyline != null);
  const rankedInAction = games.filter(g => {
    const ht = (g.homeTeam || '').toLowerCase();
    const at = (g.awayTeam || '').toLowerCase();
    return ranked.some(r => {
      const n = (r.team || r.name || '').toLowerCase();
      return n && (ht.includes(n) || at.includes(n) || n.includes(ht) || n.includes(at));
    });
  });

  const topHeadlines = headlines.slice(0, 4);

  const stats = [
    { label: 'Games With Active Lines', value: gamesWithOdds.length > 0 ? gamesWithOdds.length : '—' },
    { label: 'Ranked Teams In Action', value: rankedInAction.length > 0 ? rankedInAction.length : '—' },
    { label: 'Top 25 Matchups Today', value: gamesWithOdds.length > 0 ? String(gamesWithOdds.length) : '—' },
    { label: 'Headlines Tracked', value: topHeadlines.length > 0 ? topHeadlines.length : '—' },
  ];

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  return (
    <SlideShell asOf={asOf} accentColor="#3C79B4" rest={rest}>
      {/* Date pill */}
      <div className={styles.datePill}>{today}</div>

      {/* Title */}
      <div className={styles.titleBlock}>
        <div className={styles.titleSup}>DAILY BRIEFING</div>
        <h2 className={styles.title}>Today in<br />College Basketball</h2>
      </div>

      {/* Divider */}
      <div className={styles.divider} />

      {/* Stats grid */}
      <div className={styles.statsGrid}>
        {stats.map((s, i) => (
          <div key={i} className={styles.statCell}>
            <span className={styles.statValue}>{s.value}</span>
            <span className={styles.statLabel}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Headlines */}
      {topHeadlines.length > 0 && (
        <div className={styles.headlinesBlock}>
          <div className={styles.sectionLabel}>HEADLINES</div>
          {topHeadlines.map((h, i) => (
            <div key={i} className={styles.headlineRow}>
              <span className={styles.headlineBullet}>→</span>
              <span className={styles.headlineText}>
                {(h.title || h.headline || '').length > 72
                  ? (h.title || h.headline || '').slice(0, 72) + '…'
                  : (h.title || h.headline || '')}
              </span>
            </div>
          ))}
        </div>
      )}
    </SlideShell>
  );
}
