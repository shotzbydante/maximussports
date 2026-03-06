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

  // Dynamic, context-driven ATS signal text.
  // Uses the most recent window (last7 → last30 → season) for the primary read,
  // and compares it to the other windows for trend direction.
  const last7Parsed   = parseRecord(windows[0].rec);
  const last30Parsed  = parseRecord(windows[1].rec);
  const seasonParsed  = parseRecord(windows[2].rec);
  const primaryParsed = last7Parsed ?? last30Parsed ?? seasonParsed;

  function buildSignalText(pParsed, l7, l30, season) {
    if (!pParsed) return null;
    const p = pParsed.pct;
    const w = pParsed.w;
    const l = pParsed.l;
    const total = w + l;
    const pct = Math.round(p * 100);
    // Trend: is last7 better or worse than last30?
    const trending = l7 && l30 ? (l7.pct > l30.pct + 0.08 ? 'up' : l7.pct < l30.pct - 0.08 ? 'down' : 'flat') : 'flat';

    if (p >= 0.70) {
      if (trending === 'up') return `Cover trend is accelerating. Market still hasn't caught up.`;
      if (trending === 'down') return `Still a strong ${pct}% ATS cover rate, but the recent pace is cooling.`;
      return `Covering at ${pct}% over the last ${total}. Quiet heater against the number.`;
    }
    if (p >= 0.60) {
      if (trending === 'up') return `ATS cover rate climbing — approaching that 60% threshold. Watch this.`;
      if (trending === 'down') return `Still a solid ${pct}%, but the recent trend has softened. Keep an eye on it.`;
      return `Holding firm at ${pct}% ATS. Consistent value — market hasn't fully priced this in.`;
    }
    if (p >= 0.52) {
      if (trending === 'up') return `Cover rate is quietly improving. Not screaming edge yet, but worth watching.`;
      if (trending === 'down') return `ATS profile is fading. ${pct}% and trending the wrong way.`;
      return `Pretty close to fairly priced right now. Steady, not spectacular.`;
    }
    if (p >= 0.45) {
      if (trending === 'down') return `Cooling off ATS after a stronger stretch. ${pct}% and sliding.`;
      if (trending === 'up') return `Bouncing back ATS — ${pct}% with the trend moving higher. Monitor this.`;
      return `Not much edge at the moment. ${pct}% ATS is right around break-even.`;
    }
    if (p >= 0.35) {
      if (trending === 'up') return `Starting to recover ATS, but ${pct}% is still well below value territory.`;
      return `ATS profile is weak at ${pct}%. Value may sit on the other side of this one.`;
    }
    return `Struggling against the spread. ${pct}% cover rate over ${total} — rough patch or structural?`;
  }

  const signalText = buildSignalText(primaryParsed, last7Parsed, last30Parsed, seasonParsed);

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
