import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import styles from './DailyBriefingSlide4.module.css';
import SlideShell from './SlideShell';

function makeTeam(name) {
  if (!name) return null;
  const cleaned = name
    .replace(/^(?:The |the )/, '')
    .replace(/^(?:No\.\s*\d+\s+|#\d+\s+)/, '')
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
      acc.push({
        team:      name,
        atsRate:   rate,
        timeframe: l.games ? `last ${l.games}` : 'season',
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

  return (
    <SlideShell asOf={asOf} accentColor="#B7986C" styleMode={styleMode} rest={rest}>
      <div className={styles.titleBlock}>
        <div className={styles.titleSup}>ATS SPOTLIGHT</div>
        <h2 className={styles.title}>COVER<br />THE SPREAD</h2>
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
                    <span className={styles.edgeTimeframe}>{edge.timeframe}</span>
                    {isLeader && (
                      <span className={styles.leaderBadge}>LEADER</span>
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

                  {/* ¶4 insight sentence when available */}
                  {edge.insight && (
                    <div className={styles.edgeInsight}>{edge.insight}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className={styles.footNote}>
        {isRobot
          ? 'Cover % signals. Not financial advice.'
          : 'ATS cover % over last 30 days — one of the strongest persistent edges in CBB.'}
      </div>
    </SlideShell>
  );
}
