import SlideShell from './SlideShell';
import TeamLogo from '../../shared/TeamLogo';
import MaximusTakeCard from '../../shared/MaximusTakeCard';
import { getTeamSlug } from '../../../utils/teamSlug';
import { buildMaximusPicks } from '../../../utils/maximusPicksModel';
import { getSlideColors, getConfidenceLabel } from '../../../utils/confidenceSystem';
import styles from './OddsInsightsSlide1.module.css';

export default function OddsInsightsSlide1({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const games = data?.picksGames ?? data?.odds?.games ?? [];
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };

  let picks = { pickEmPicks: [], atsPicks: [], valuePicks: [], mlPicks: [], totalsPicks: [] };
  try {
    picks = buildMaximusPicks({ games, atsLeaders });
  } catch { /* ignore */ }

  const atsPicks = picks.atsPicks ?? [];
  const mlPicks = picks.mlPicks ?? [];
  const totalsPicks = picks.totalsPicks ?? [];
  const pickEmPicks = picks.pickEmPicks ?? [];
  const valuePicks = picks.valuePicks ?? [];
  const spreadMlPicks = [...atsPicks, ...mlPicks];
  const totalCount = spreadMlPicks.length;
  const allPicksForTake = [...pickEmPicks, ...atsPicks, ...valuePicks, ...totalsPicks, ...mlPicks];

  const strongestPick = spreadMlPicks.reduce((best, p) =>
    (p.confidence ?? 0) > (best?.confidence ?? -1) ? p : best, null);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  });

  const confStyle = getSlideColors(strongestPick?.confidence ?? 0);

  // Build featured picks list: top 3 picks by confidence
  const featuredPicks = spreadMlPicks
    .slice()
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 3);

  function makeTeamObj(name) {
    if (!name) return null;
    const cleaned = name.replace(/^(?:The |the )/, '').trim();
    return { name: cleaned, slug: getTeamSlug(cleaned) };
  }

  function buildRationale(pick) {
    if (pick.whyValue) return pick.whyValue;
    const conf = getConfidenceLabel(pick.confidence);
    const pickType = pick.type === 'ats' || pick.pickType === 'ats' ? 'spread' : 'moneyline';
    if (conf === 'HIGH') {
      return pickType === 'spread'
        ? 'Strong cover profile edge. Market still hasn\'t fully caught up on this side.'
        : 'Implied probability gap is significant. This price looks wrong.';
    }
    if (conf === 'MEDIUM') {
      return pickType === 'spread'
        ? 'Recent cover trend is solid and the number looks a bit light.'
        : 'Model sees a slight value edge versus the implied odds. Worth a lean.';
    }
    return pickType === 'spread'
      ? 'Slight ATS edge based on recent cover profile.'
      : 'Thin moneyline value edge. Low confidence, not a lock.';
  }

  return (
    <SlideShell
      asOf={asOf}
      accentColor="#3C79B4"
      brandMode="standard"
      category="odds"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      <div className={styles.datePill}>{today}</div>
      <div className={styles.titleSup}>MAXIMUS PICKS</div>
      <h2 className={styles.title}>Today&apos;s<br />Picks Card</h2>
      <div className={styles.divider} />

      {totalCount === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📊</div>
          <p className={styles.emptyTitle}>No qualified leans today</p>
          <p className={styles.emptyText}>The model found no edges meeting its threshold. Check back closer to tip-off.</p>
        </div>
      ) : (
        <>
          <div className={styles.countGrid}>
            <div className={styles.countCell}>
              <span className={styles.countValue}>{totalCount}</span>
              <span className={styles.countLabel}>Total Leans</span>
            </div>
            <div className={styles.countCell}>
              <span className={styles.countValue}>{atsPicks.length}</span>
              <span className={styles.countLabel}>Spread</span>
            </div>
            <div className={styles.countCell}>
              <span className={styles.countValue}>{mlPicks.length}</span>
              <span className={styles.countLabel}>Moneyline</span>
            </div>
            <div className={styles.countCell}>
              <span className={styles.countValue}>{totalsPicks.length}</span>
              <span className={styles.countLabel}>Totals</span>
            </div>
          </div>

          <div className={styles.takeWrap}>
            <MaximusTakeCard allPicks={allPicksForTake} variant="slide" />
          </div>

          <div className={styles.picksList}>
            {featuredPicks.map((pick, i) => {
              const isStrongest = i === 0;
              const cs = getSlideColors(pick.confidence);
              const teamObj = makeTeamObj(pick.pickTeam);
              const rationale = buildRationale(pick);
              const pickTypeLabel = (pick.type === 'ats' || pick.pickType === 'ats') ? 'SPREAD' : 'ML';
              return (
                <div key={i} className={`${styles.pickCard} ${isStrongest ? styles.pickCardTop : ''}`}>
                  <div className={styles.pickCardHeader}>
                    <span className={styles.pickTypeBadge}>{pickTypeLabel}</span>
                    {isStrongest && <span className={styles.strongestBadge}>STRONGEST</span>}
                    <span
                      className={styles.confBadge}
                      style={{ background: cs.bg, color: cs.text, border: `1px solid ${cs.border}` }}
                    >
                      {getConfidenceLabel(pick.confidence)}
                    </span>
                  </div>
                  <div className={styles.pickCardTeamRow}>
                    {teamObj && <TeamLogo team={teamObj} size={isStrongest ? 36 : 28} />}
                    <div className={styles.pickCardLine}>{pick.pickLine || '—'}</div>
                  </div>
                  <div className={styles.pickCardRationale}>{rationale}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className={styles.disclaimer}>Algorithmic leans only. Not financial advice. 21+</div>
    </SlideShell>
  );
}
