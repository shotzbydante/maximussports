import SlideShell from './SlideShell';
import styles from './TeamIntelSlide2.module.css';

function parseRecord(rec) {
  if (!rec) return null;
  if (typeof rec === 'string') {
    const m = rec.match(/(\d+)-(\d+)/);
    if (!m) return null;
    const w = parseInt(m[1], 10);
    const l = parseInt(m[2], 10);
    if (w + l === 0) return null;
    return { w, l, pct: w / (w + l) };
  }
  if (typeof rec === 'object') {
    const w = parseInt(rec.wins ?? rec.w ?? 0, 10);
    const l = parseInt(rec.losses ?? rec.l ?? 0, 10);
    if (w + l === 0) return null;
    return { w, l, pct: w / (w + l) };
  }
  return null;
}

function CoverBar({ pct }) {
  const width = Math.round((pct ?? 0) * 100);
  return (
    <div className={styles.barTrack}>
      <div className={styles.barFill} style={{ width: `${width}%` }} />
      <span className={styles.barLabel}>{width}%</span>
    </div>
  );
}

export default function TeamIntelSlide2({ data, teamData, asOf, slideNumber, slideTotal, ...rest }) {
  const ats = teamData?.ats ?? {};

  // ATS rows: windows
  const windows = [
    { key: 'last7',  label: 'Last 7',  rec: ats.last7  ?? ats.l7  ?? null },
    { key: 'last30', label: 'Last 30', rec: ats.last30 ?? ats.l30 ?? null },
    { key: 'season', label: 'Season',  rec: ats.season ?? ats.s   ?? null },
  ];

  // fallback: look up from atsLeaders in home data
  const name = teamData?.team?.displayName || teamData?.team?.name || data?.selectedTeamName || null;
  const slug = teamData?.team?.slug || data?.selectedTeamSlug || null;
  if (name && !ats.last30) {
    const leaders = [...(data?.atsLeaders?.best ?? []), ...(data?.atsLeaders?.worst ?? [])];
    const found = leaders.find(l => l.slug === slug || (l.team || l.name || '').toLowerCase().includes((name.split(' ').pop() || '').toLowerCase()));
    if (found) {
      windows[1].rec = found.last30 || found.rec || null;
      windows[2].rec = found.season || null;
      windows[0].rec = found.last7 || null;
    }
  }

  const hasAnyData = windows.some(w => w.rec != null);

  // Signal label
  const best = windows.find(w => w.rec != null && parseRecord(w.rec) != null);
  const bestParsed = best ? parseRecord(best.rec) : null;
  const signalText = bestParsed == null ? null
    : bestParsed.pct >= 0.65 ? 'Strong ATS lean — model tracks edge'
    : bestParsed.pct >= 0.55 ? 'Mild ATS lean — moderate signal'
    : bestParsed.pct <= 0.40 ? 'Unfavorable ATS trend'
    : 'Neutral ATS record — no clear edge';

  return (
    <SlideShell
      asOf={asOf}
      accentColor="#B7986C"
      brandMode="standard"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      <div className={styles.titleSup}>TEAM INTEL · SLIDE {slideNumber ?? 2}</div>
      <h2 className={styles.title}>ATS<br />Performance</h2>
      <div className={styles.divider} />

      {!hasAnyData ? (
        <div className={styles.emptyState}>
          <p>ATS data not available for this team right now.</p>
        </div>
      ) : (
        <div className={styles.windowList}>
          {windows.map(w => {
            const parsed = parseRecord(w.rec);
            return (
              <div key={w.key} className={styles.windowRow}>
                <div className={styles.windowLabel}>{w.label}</div>
                <div className={styles.windowRec}>
                  {parsed ? `${parsed.w}–${parsed.l}` : (w.rec ? String(w.rec) : '—')}
                </div>
                {parsed && <CoverBar pct={parsed.pct} />}
                {!parsed && <div className={styles.barTrackEmpty} />}
              </div>
            );
          })}
        </div>
      )}

      {signalText && (
        <div className={styles.signalBlock}>
          <div className={styles.signalLabel}>ATS SIGNAL</div>
          <div className={styles.signalText}>{signalText}</div>
        </div>
      )}
    </SlideShell>
  );
}
