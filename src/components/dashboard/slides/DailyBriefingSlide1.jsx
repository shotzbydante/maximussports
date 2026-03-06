import styles from './DailyBriefingSlide1.module.css';
import SlideShell from './SlideShell';

export default function DailyBriefingSlide1({ data, asOf, options = {}, ...rest }) {
  const { styleMode = 'generic' } = options;
  const isRobot = styleMode === 'robot';

  // Prefer chatbot-derived content when available (richer editorial voice).
  const digest   = data?.chatDigest ?? null;
  const hasDigest = digest?.hasChatContent === true;

  const games    = data?.odds?.games ?? [];
  const ranked   = data?.rankingsTop25 ?? [];
  const rawHeadlines = data?.headlines ?? [];

  const gamesWithOdds = games.filter(g => g.spread != null || g.homeSpread != null || g.moneyline != null);
  const rankedInAction = games.filter(g => {
    const ht = (g.homeTeam || '').toLowerCase();
    const at = (g.awayTeam || '').toLowerCase();
    return ranked.some(r => {
      const n = (r.team || r.name || '').toLowerCase();
      return n && (ht.includes(n) || at.includes(n) || n.includes(ht) || n.includes(at));
    });
  });

  // Use digest storylines when chatbot content is available; fall back to raw headlines.
  const storyBullets = hasDigest
    ? digest.topStorylines
    : rawHeadlines.slice(0, 4).map(h => ({
        text: (h.title || h.headline || '').slice(0, 72) || '',
        source: h.source || null,
      })).filter(b => b.text);

  // Lead narrative line — chatbot recap phrase or null
  const leadText = hasDigest ? digest.leadNarrative : '';

  const stats = [
    { label: 'Games With Active Lines', value: gamesWithOdds.length > 0 ? gamesWithOdds.length : '—' },
    { label: 'Ranked Teams In Action',  value: rankedInAction.length > 0 ? rankedInAction.length : '—' },
    { label: 'Top 25 Matchups Today',   value: gamesWithOdds.length > 0 ? String(gamesWithOdds.length) : '—' },
    { label: 'Headlines Tracked',       value: rawHeadlines.length > 0 ? rawHeadlines.length : '—' },
  ];

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  });

  return (
    <SlideShell asOf={asOf} accentColor="#3C79B4" styleMode={styleMode} rest={rest}>
      {/* Date pill */}
      <div className={styles.datePill}>{today}</div>

      {/* Title */}
      <div className={styles.titleBlock}>
        <div className={styles.titleSup}>
          {isRobot ? 'MAXIMUS SAYS' : 'DAILY BRIEFING'}
        </div>
        <h2 className={styles.title}>
          {isRobot ? <>Here&rsquo;s today&rsquo;s<br />intel.</> : <>Today in<br />College Basketball</>}
        </h2>
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

      {/* Lead narrative from chatbot — shows as an editorial pull quote when available */}
      {leadText && (
        <div className={styles.leadNarrative}>{leadText}</div>
      )}

      {/* Storyline bullets — chatbot-derived when available, raw headlines as fallback */}
      {storyBullets.length > 0 && (
        <div className={styles.headlinesBlock}>
          <div className={styles.sectionLabel}>
            {isRobot
              ? "I'M TRACKING"
              : hasDigest ? 'TODAY\'S STORYLINES' : 'HEADLINES'}
          </div>
          {storyBullets.map((b, i) => (
            <div key={i} className={styles.headlineRow}>
              <span className={styles.headlineBullet}>→</span>
              <span className={styles.headlineText}>
                {(b.text || '').length > 80
                  ? (b.text || '').slice(0, 80) + '…'
                  : (b.text || '')}
              </span>
            </div>
          ))}
        </div>
      )}
    </SlideShell>
  );
}
