import PicksSlideShell from './PicksSlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import { buildMaximusPicks } from '../../../utils/maximusPicksModel';
import { getSlideColors, getConfidenceLabel } from '../../../utils/confidenceSystem';
import styles from './MaxPicksPickemsSlide.module.css';

function makeTeamObj(name) {
  if (!name) return null;
  const cleaned = name.replace(/^(?:The |the )/, '').trim();
  return { name: cleaned, slug: getTeamSlug(cleaned) };
}

export default function MaxPicksPickemsSlide({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  // Use canonical picks from Dashboard (single source of truth)
  let picks = data?.canonicalPicks;
  if (!picks) {
    const games      = data?.picksGames ?? data?.odds?.games ?? [];
    const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };
    const rankMap    = data?.rankMap ?? {};
    const champOdds  = data?.championshipOdds ?? {};
    picks = {};
    try { picks = buildMaximusPicks({ games, atsLeaders, rankMap, championshipOdds: champOdds }); } catch { /* ignore */ }
  }

  const pickEmPicks = (picks.pickEmPicks ?? []).slice(0, 4);

  return (
    <PicksSlideShell asOf={asOf} slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.titleSup}>MAXIMUS&apos;S PICKS · SLIDE {slideNumber}</div>
      <h2 className={styles.title}>Straight-Up Picks</h2>
      <div className={styles.subtitle}>The model&apos;s strongest predicted winners today</div>
      <div className={styles.divider} />

      {pickEmPicks.length === 0 ? (
        <div className={styles.empty}>No pick &apos;em leans qualify today.</div>
      ) : (
        <div className={styles.cardList}>
          {pickEmPicks.map((pick, i) => {
            const cs = getSlideColors(pick.confidence);
            const pickTeamObj = makeTeamObj(pick.pickTeam);
            const homeObj = makeTeamObj(pick.homeTeam);
            const awayObj = makeTeamObj(pick.awayTeam);
            const signals = (pick.signals ?? []).slice(0, 3);
            const mlPrice = pick.pickLine && pick.pickTeam && pick.pickLine.length > pick.pickTeam.length
              ? pick.pickLine.slice(pick.pickTeam.length).trim()
              : null;
            return (
              <div key={i} className={styles.card}>
                <div className={styles.cardPickRow}>
                  <span className={styles.pickLabel}>PICK</span>
                  {pickTeamObj && <TeamLogo team={pickTeamObj} size={28} />}
                  <span className={styles.pickTeamName}>{pick.pickTeam || '—'}</span>
                  {mlPrice && <span className={styles.mlLine}>{mlPrice}</span>}
                  <span
                    className={styles.confBadge}
                    style={{ background: cs.bg, color: cs.text, borderColor: cs.border }}
                  >
                    {getConfidenceLabel(pick.confidence)}
                  </span>
                </div>
                <div className={styles.cardMatchup}>
                  {pick.opponentTeam ? (
                    <>
                      <span className={styles.vsText}>vs</span>
                      <span className={styles.matchupTeam}>{pick.opponentTeam}</span>
                    </>
                  ) : (
                    <>
                      {awayObj && <TeamLogo team={awayObj} size={22} />}
                      <span className={styles.matchupTeam}>{pick.awayTeam}</span>
                      <span className={styles.vsText}>VS</span>
                      {homeObj && <TeamLogo team={homeObj} size={22} />}
                      <span className={styles.matchupTeam}>{pick.homeTeam}</span>
                    </>
                  )}
                  {pick.time && <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.4 }}>{pick.time}</span>}
                </div>
                {signals.length > 0 && (
                  <div className={styles.signalsList}>
                    {signals.map((s, j) => (
                      <div key={j} className={styles.signalItem}>{s}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className={styles.disclaimer}>Algorithmic leans only. Not financial advice. 21+</div>
    </PicksSlideShell>
  );
}
