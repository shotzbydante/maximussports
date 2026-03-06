import styles from './DailyBriefingSlide5.module.css';
import SlideShell from './SlideShell';

export default function DailyBriefingSlide5({ data, asOf, options = {}, ...rest }) {
  const { styleMode = 'generic' } = options;
  const isRobot = styleMode === 'robot';

  const digest    = data?.chatDigest ?? null;
  const hasDigest = digest?.hasChatContent === true;

  // Primary: chatbot-parsed news intel bullets
  let intelItems = hasDigest ? (digest.newsIntel ?? []) : [];

  // Fallback: raw headlines
  if (!intelItems.length) {
    intelItems = (data?.headlines ?? []).slice(0, 5).map(h => ({
      headline:        (h.title || h.headline || '').slice(0, 82),
      editorialContext: h.source || null,
    })).filter(item => item.headline.length > 10);
  }

  const voiceLine = hasDigest ? (digest.voiceLine || '') : '';

  return (
    <SlideShell asOf={asOf} accentColor="#3C79B4" styleMode={styleMode} rest={rest}>
      <div className={styles.titleBlock}>
        <div className={styles.titleSup}>
          {isRobot ? 'TRACKING NOW' : 'NEWS INTEL'}
        </div>
        <h2 className={styles.title}>
          INTEL &<br />CHAOS
        </h2>
      </div>

      <div className={styles.divider} />

      {intelItems.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>Intel loading…</p>
        </div>
      ) : (
        <div className={styles.intelList}>
          {intelItems.slice(0, 5).map((item, i) => (
            <div key={i} className={styles.intelRow}>
              <span className={styles.intelIdx}>{String(i + 1).padStart(2, '0')}</span>
              <div className={styles.intelBody}>
                <div className={styles.intelHeadline}>{item.headline}</div>
                {item.editorialContext && (
                  <span className={styles.intelSource}>{item.editorialContext}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {voiceLine && (
        <div className={styles.voiceBlock}>
          <span className={styles.voiceMark}>&ldquo;</span>
          <span className={styles.voiceLine}>{voiceLine}</span>
        </div>
      )}
    </SlideShell>
  );
}
