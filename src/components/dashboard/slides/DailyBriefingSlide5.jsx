import styles from './DailyBriefingSlide5.module.css';
import SlideShell from './SlideShell';

export default function DailyBriefingSlide5({ data, asOf, options = {}, ...rest }) {
  const { styleMode = 'generic' } = options;
  const isRobot = styleMode === 'robot';

  const digest    = data?.chatDigest ?? null;
  const hasDigest = digest?.hasChatContent === true;

  // ¶5 → opening march/chaos framing sentence
  const newsLead = hasDigest ? (digest.newsLead || '') : '';

  // ¶5 → editorial intel bullets (2-3 max)
  let intelItems = hasDigest ? (digest.newsIntel ?? []) : [];

  // Fallback: raw headlines
  if (!intelItems.length) {
    intelItems = (data?.headlines ?? []).slice(0, 3).map(h => ({
      headline:         (h.title || h.headline || '').slice(0, 88),
      editorialContext: h.source || null,
    })).filter(item => item.headline.length > 10);
  }

  // ¶5 → closing voice line (last punchy sentence — March energy)
  const voiceLine = hasDigest ? (digest.voiceLine || '') : '';

  // How many intel bullets to show (fewer if we have both lead + closer)
  const bulletLimit = (newsLead && voiceLine) ? 2 : 3;

  return (
    <SlideShell asOf={asOf} accentColor="#3C79B4" styleMode={styleMode} rest={rest}>
      <div className={styles.titleBlock}>
        <div className={styles.titleSup}>
          {isRobot ? 'TRACKING NOW' : 'NEWS & CHAOS'}
        </div>
        <h2 className={styles.title}>
          IN THE<br />NEWS
        </h2>
      </div>

      {/* ¶5 opening march framing */}
      {newsLead && (
        <div className={styles.newsLead}>{newsLead}</div>
      )}

      <div className={styles.divider} />

      {intelItems.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>Intel loading&hellip;</p>
        </div>
      ) : (
        <div className={styles.intelList}>
          {intelItems.slice(0, bulletLimit).map((item, i) => (
            <div key={i} className={`${styles.intelRow} ${i === 0 ? styles.intelRowLead : ''}`}>
              <span className={styles.intelArrow}>→</span>
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

      {/* ¶5 closing march/madness voice line */}
      {voiceLine && (
        <div className={styles.voiceBlock}>
          <span className={styles.voiceMark}>&ldquo;</span>
          <span className={styles.voiceLine}>{voiceLine}</span>
        </div>
      )}
    </SlideShell>
  );
}
