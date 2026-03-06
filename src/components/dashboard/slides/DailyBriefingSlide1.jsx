import styles from './DailyBriefingSlide1.module.css';
import SlideShell from './SlideShell';

export default function DailyBriefingSlide1({ data, asOf, options = {}, ...rest }) {
  const { styleMode = 'generic' } = options;

  const digest    = data?.chatDigest ?? null;
  const hasDigest = digest?.hasChatContent === true;

  // Primary: cross-section "Maximus Says" bullets
  // Secondary: topStorylines fallback
  // Final: raw headlines
  let bullets = [];
  if (hasDigest && digest.maximusSays?.length > 0) {
    bullets = digest.maximusSays;
  } else if (hasDigest && digest.topStorylines?.length > 0) {
    bullets = digest.topStorylines.map(b => (typeof b === 'string' ? b : b.text || '')).filter(Boolean);
  } else {
    bullets = (data?.headlines ?? [])
      .slice(0, 4)
      .map(h => (h.title || h.headline || '').slice(0, 102))
      .filter(Boolean);
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  });

  return (
    <SlideShell asOf={asOf} accentColor="#3C79B4" styleMode={styleMode} rest={rest}>
      <div className={styles.datePill}>{today}</div>

      <div className={styles.titleBlock}>
        <div className={styles.titleSup}>MAXIMUS SAYS</div>
        <h2 className={styles.title}>HERE&rsquo;S YOUR<br />EDGE TODAY.</h2>
      </div>

      <div className={styles.divider} />

      {bullets.length > 0 ? (
        <div className={styles.bulletList}>
          {bullets.slice(0, 4).map((b, i) => (
            <div key={i} className={`${styles.bullet} ${i === 0 ? styles.bulletLead : ''}`}>
              <span className={styles.bulletArrow}>→</span>
              <span className={styles.bulletText}>{b}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>Briefing loading&hellip;</p>
        </div>
      )}
    </SlideShell>
  );
}
