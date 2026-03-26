import SlideShell from './SlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import styles from './OddsInsightsSlide4.module.css';
import { buildMaximusPicks } from '../../../utils/maximusPicksModel';

/**
 * Safely convert an ATS record object/string to a display string.
 * Never returns [object Object].
 */
function recStr(row) {
  if (!row) return '—';
  const r = row.last30 || row.rec || row.season || null;
  if (!r) return '—';
  if (typeof r === 'string') return r;
  if (typeof r !== 'object') return String(r);
  const w = r.w ?? r.wins ?? null;
  const l = r.l ?? r.losses ?? null;
  if (w != null && l != null) {
    const pct = r.coverPct != null ? ` (${Math.round(r.coverPct)}%)` : '';
    return `${w}–${l}${pct}`;
  }
  if (r.coverPct != null) return `${Math.round(r.coverPct)}%`;
  return '—';
}

function makeTeamObj(name) {
  if (!name) return null;
  const cleaned = name.replace(/^(?:The |the )/, '').trim();
  return { name: cleaned, slug: getTeamSlug(cleaned) };
}

/**
 * Slide 4 (4-slide mode only): Totals informational + quick market notes (ATS leaders).
 */
export default function OddsInsightsSlide4({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const games = data?.picksGames ?? data?.odds?.games ?? [];
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };

  let picks = { totalsPicks: [] };
  try {
    picks = buildMaximusPicks({ games, atsLeaders });
  } catch { /* ignore */ }

  const totalsPicks = picks.totalsPicks ?? [];
  const best = (atsLeaders.best ?? []).slice(0, 4);
  const worst = (atsLeaders.worst ?? []).slice(0, 4);
  const hasAts = best.length > 0 || worst.length > 0;

  // Quick market stats
  const gamesWithOdds = games.filter(g => g.spread != null || g.homeSpread != null || g.total != null);
  const totalsArr = gamesWithOdds.map(g => parseFloat(g.total ?? 0)).filter(x => x > 0);
  const medTotal = totalsArr.length > 0
    ? totalsArr.sort((a, b) => a - b)[Math.floor(totalsArr.length / 2)]
    : null;

  return (
    <SlideShell
      asOf={asOf}
      accentColor="#3C79B4"
      brandMode="light"
      category="odds"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      <div className={styles.titleSup}>ODDS INSIGHTS · SLIDE {slideNumber ?? 4}</div>
      <h2 className={styles.title}>Totals &amp;<br />Market Notes</h2>
      <div className={styles.divider} />

      {/* Totals list */}
      {totalsPicks.length > 0 && (
        <div className={styles.totalsSection}>
          <div className={styles.sectionLabel}>
            O/U LINES
            {medTotal ? <span className={styles.medLabel}> · Median: {medTotal.toFixed(1)}</span> : null}
          </div>
          <div className={styles.totalsList}>
            {totalsPicks.slice(0, 4).map((p, i) => (
              <div key={i} className={styles.totalsRow}>
                <span className={styles.totalsMatchup}>{p.matchup}</span>
                <span className={styles.totalsLine}>{p.pickLine}</span>
              </div>
            ))}
          </div>
          <div className={styles.totalsNote}>
            Totals are informational — no model projection delta yet.
          </div>
        </div>
      )}

      {/* ATS leaders */}
      {hasAts ? (
        <div className={styles.atsSection}>
          <div className={styles.sectionLabel}>AGAINST THE SPREAD LEADERS (L30)</div>
          <div className={styles.atsColumns}>
            <div className={styles.col}>
              <div className={styles.colLabel}>HOT</div>
              {best.map((r, i) => {
                const tObj = makeTeamObj(r.team || r.name || '');
                return (
                  <div key={i} className={styles.atsRow}>
                    <span className={styles.atsRank}>{i + 1}</span>
                    <div className={styles.atsLogoWrap}>
                      <TeamLogo team={tObj} size={26} />
                    </div>
                    <span className={styles.atsName}>{tObj?.name || '—'}</span>
                    <span className={styles.atsRec}>{recStr(r)}</span>
                  </div>
                );
              })}
            </div>
            <div className={styles.col}>
              <div className={styles.colLabel}>COLD</div>
              {worst.map((r, i) => {
                const tObj = makeTeamObj(r.team || r.name || '');
                return (
                  <div key={i} className={styles.atsRow}>
                    <span className={styles.atsRank}>{i + 1}</span>
                    <div className={styles.atsLogoWrap}>
                      <TeamLogo team={tObj} size={26} />
                    </div>
                    <span className={styles.atsName}>{tObj?.name || '—'}</span>
                    <span className={`${styles.atsRec} ${styles.atsRecDown}`}>{recStr(r)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : totalsPicks.length === 0 ? (
        <div className={styles.atsWarming}>
          <div className={styles.atsWarmingTitle}>ATS leaders warming</div>
          <div className={styles.atsWarmingText}>Coverage builds throughout the day. Regenerate shortly to populate.</div>
        </div>
      ) : null}
    </SlideShell>
  );
}
