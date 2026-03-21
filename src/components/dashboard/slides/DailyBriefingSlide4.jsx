import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import styles from './DailyBriefingSlide4.module.css';
import SlideShell from './SlideShell';

function makeTeam(name) {
  if (!name) return null;
  const cleaned = name
    .replace(/^(?:The |the )/, '')
    .replace(/^(?:No\.\s*\d+\s+|#\d+\s+)/, '')
    .replace(/\s*\((?:FL|OH|PA|CA|NY|TX|WA|OR|CO|AZ|NM|NV|UT|ID|MT|WY|ND|SD|NE|KS|MN|IA|MO|WI|IL|IN|MI|KY|TN|GA|AL|MS|AR|LA|OK)\)$/i, '')
    .trim();
  return { name: cleaned, slug: getTeamSlug(cleaned) };
}

export default function DailyBriefingSlide4({ data, asOf, options = {}, ...rest }) {
  const { styleMode = 'generic' } = options;
  const isRobot = styleMode === 'robot';

  const digest    = data?.chatDigest ?? null;
  const hasDigest = digest?.hasChatContent === true;

  // ¶4 → ATS edges, top 3 only
  let edgeEntries = hasDigest ? (digest.atsEdges ?? []) : [];

  // Secondary: raw atsLeaders structural data
  if (!edgeEntries.length) {
    const leaders = data?.atsLeaders?.best ?? [];
    edgeEntries = leaders.slice(0, 4).reduce((acc, l) => {
      const name = l.team || l.name || '';
      if (!name) return acc;
      const raw = l.coverPct ?? l.atsPercent ?? null;
      if (raw == null) return acc;
      const rate = raw > 1 ? Math.round(raw) : Math.round(raw * 100);
      if (rate < 30 || rate > 99) return acc;
      // Extract W-L record from sub-window objects
      const rec = l.rec || l.last30 || l.season || null;
      const wl  = rec && rec.w != null ? `${rec.w}-${rec.l ?? 0}` : null;
      const gameCount = rec ? ((rec.w ?? 0) + (rec.l ?? 0)) : (l.games || 0);
      acc.push({
        team:      name,
        atsRate:   rate,
        timeframe: gameCount ? `last ${gameCount}` : 'season',
        wl,
        insight:   '',
      });
      return acc;
    }, []).sort((a, b) => b.atsRate - a.atsRate);
  }

  // Curate to top 3
  edgeEntries = edgeEntries.slice(0, 3);

  // ¶4 → direct chatbot ATS narrative sentence
  const atsNarrative = hasDigest
    ? (digest.bettingAngle || digest.atsContextText || '')
    : '';

  const maxRate = edgeEntries.length > 0
    ? Math.max(...edgeEntries.map(e => e.atsRate))
    : 70;

  /**
   * Generate a concise, human-readable rationale for a team's ATS profile.
   * Uses the same data available in the edge entry.
   */
  function buildRationale(edge) {
    const rate = edge.atsRate;
    const wl   = edge.wl;
    const tf   = edge.timeframe || 'recently';
    if (rate >= 70) {
      return wl
        ? `${wl} ${tf} — quiet heater against the number. Market still hasn't caught up.`
        : `Covering at ${rate}% ${tf}. Strong cover profile and the market is behind.`;
    }
    if (rate >= 60) {
      return wl
        ? `${wl} ${tf} — holding firm at ${rate}%. Consistent edge the books haven't fully priced.`
        : `Covering at ${rate}% ${tf}. Reliable against the spread with a solid recent lean.`;
    }
    if (rate >= 55) {
      return wl
        ? `${wl} ${tf} — steady ${rate}% cover rate. A slight but persistent edge.`
        : `${rate}% cover rate ${tf}. Not screaming value, but a consistent trend.`;
    }
    return wl
      ? `${wl} ${tf} — ${rate}% cover rate over this stretch.`
      : `${rate}% ATS ${tf}.`;
  }

  return (
    <SlideShell asOf={asOf} accentColor="#B7986C" styleMode={styleMode} category="daily" rest={rest}>
      <div className={styles.titleBlock}>
        <div className={styles.titleSup}>DAILY BRIEFING</div>
        <h2 className={styles.title}>AGAINST<br />THE SPREAD</h2>
      </div>

      {/* ¶4 narrative lead — chatbot's direct voice */}
      {atsNarrative && (
        <div className={styles.atsNarrative}>{atsNarrative}</div>
      )}

      <div className={styles.divider} />

      {edgeEntries.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>ATS data loading&hellip;</p>
        </div>
      ) : (
        <div className={styles.edgeList}>
          {edgeEntries.map((edge, i) => {
            const barPct = maxRate > 0
              ? Math.min(100, Math.round((edge.atsRate / maxRate) * 100))
              : edge.atsRate;
            const isLeader = i === 0;
            const aboveAvg = edge.atsRate >= 55;
            const teamObj  = makeTeam(edge.team);

            return (
              <div
                key={i}
                className={`${styles.edgeRow} ${isLeader ? styles.edgeRowTop : ''}`}
              >
                <div className={styles.edgeLogoWrap}>
                  <TeamLogo team={teamObj} size={52} />
                </div>

                <div className={styles.edgeInfo}>
                  <div className={styles.edgeHeader}>
                    <span className={styles.edgeTeam}>{teamObj?.name || edge.team}</span>
                    {isLeader && (
                      <span className={styles.edgeLeaderBadge}>LEADER</span>
                    )}
                  </div>

                  <div className={styles.barRow}>
                    <div className={styles.barTrack}>
                      <div
                        className={`${styles.barFill} ${aboveAvg ? styles.barFillHot : ''}`}
                        style={{ width: `${barPct}%` }}
                      />
                      <div className={styles.barMidline} />
                    </div>
                    <span className={`${styles.barPct} ${aboveAvg ? styles.barPctHot : ''}`}>
                      {edge.atsRate}%
                    </span>
                  </div>

                  {/* W-L record + timeframe context */}
                  <div className={styles.edgeMeta}>
                    {edge.wl && (
                      <span className={styles.edgeWL}>{edge.wl}</span>
                    )}
                    <span className={styles.edgeTimeframe}>{edge.timeframe}</span>
                  </div>

                  {/* Rationale — use chatbot insight if available, otherwise auto-generate */}
                  <div className={styles.edgeInsight}>
                    {edge.insight || buildRationale(edge)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className={styles.footNote}>
        {isRobot
          ? 'Cover % signals. Not financial advice.'
          : 'Against the spread cover % over last 30 days — one of the strongest persistent edges in NCAAM.'}
      </div>
    </SlideShell>
  );
}
