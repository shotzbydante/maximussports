import styles from './DailyBriefingSlide5.module.css';
import SlideShell from './SlideShell';

/** Category tag colors (inline style accent) */
const TAG_COLORS = {
  UPSET:    { color: '#ff6b6b', bg: 'rgba(255,107,107,0.12)', border: 'rgba(255,107,107,0.28)' },
  INJURY:   { color: '#ffa94d', bg: 'rgba(255,169,77,0.12)',  border: 'rgba(255,169,77,0.28)'  },
  TRANSFER: { color: '#74c0fc', bg: 'rgba(116,192,252,0.10)', border: 'rgba(116,192,252,0.25)' },
  TOURNEY:  { color: '#B7986C', bg: 'rgba(183,152,108,0.12)', border: 'rgba(183,152,108,0.28)' },
  RANKINGS: { color: '#a9e34b', bg: 'rgba(169,227,75,0.10)',  border: 'rgba(169,227,75,0.25)'  },
  COACHING: { color: '#cc5de8', bg: 'rgba(204,93,232,0.10)',  border: 'rgba(204,93,232,0.25)'  },
};

/** Strip chatbot section label prefixes that sometimes leak into bullet text */
const SECTION_LABEL_RE = /^(?:YESTERDAY\s+RECAP|ODDS?\s+PULSE|TODAY(?:'S)?\s+GAMES?|ATS\s+SPOTLIGHT|NEWS\s+PULSE(?:\s*\+\s*CLOSER)?|SCORES?)\s*[:\-–]\s*/i;

function cleanBulletText(text) {
  if (!text) return '';
  return text.replace(SECTION_LABEL_RE, '').trim();
}

export default function DailyBriefingSlide5({ data, asOf, options = {}, ...rest }) {
  const { styleMode = 'generic' } = options;
  const isRobot = styleMode === 'robot';

  const digest    = data?.chatDigest ?? null;
  const hasDigest = digest?.hasChatContent === true;

  // ¶5 → opening march/chaos framing sentence (strip any label prefix)
  const newsLead = hasDigest
    ? cleanBulletText(digest.newsLead || '')
    : '';

  // ¶5 → editorial intel bullets (always aim for 3), cleaned of label prefixes
  let intelItems = hasDigest
    ? (digest.newsIntel ?? []).map(item => ({
        ...item,
        headline: cleanBulletText(item.headline),
      })).filter(item => item.headline.length > 15)
    : [];

  // Fallback: raw headlines (always fill to 3)
  if (intelItems.length < 3) {
    const rawHeadlines = (data?.headlines ?? []).map(h => ({
      headline:         (h.title || h.headline || '').slice(0, 88),
      editorialContext: h.source || null,
      tag:              null,
    })).filter(item => item.headline.length > 15);
    const existing = new Set(intelItems.map(i => i.headline));
    for (const item of rawHeadlines) {
      if (intelItems.length >= 3) break;
      if (!existing.has(item.headline)) {
        intelItems.push(item);
        existing.add(item.headline);
      }
    }
  }

  // ¶5 → closing voice line (last punchy sentence — March energy)
  const voiceLine = hasDigest ? (digest.voiceLine || '') : '';

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
          <p className={styles.emptyText}>No intel available yet.</p>
        </div>
      ) : (
        <div className={styles.intelList}>
          {intelItems.slice(0, 3).map((item, i) => {
            const tagStyle = item.tag ? TAG_COLORS[item.tag] : null;
            return (
              <div key={i} className={`${styles.intelRow} ${i === 0 ? styles.intelRowLead : ''}`}>
                <span className={styles.intelArrow}>{i === 0 ? '→' : '→'}</span>
                <div className={styles.intelBody}>
                  {item.tag && tagStyle && (
                    <span
                      className={styles.intelTag}
                      style={{ color: tagStyle.color, background: tagStyle.bg, borderColor: tagStyle.border }}
                    >
                      {item.tag}
                    </span>
                  )}
                  <div className={styles.intelHeadline}>{item.headline}</div>
                  {item.editorialContext && (
                    <span className={styles.intelSource}>{item.editorialContext}</span>
                  )}
                </div>
              </div>
            );
          })}
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
