import PicksSlideShell from './PicksSlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import { buildMaximusPicks } from '../../../utils/maximusPicksModel';
import { getSlideColors, getConfidenceLabel } from '../../../utils/confidenceSystem';
import styles from './MaxPicksValueSlide.module.css';

function makeTeamObj(name) {
  if (!name) return null;
  const cleaned = name.replace(/^(?:The |the )/, '').trim();
  return { name: cleaned, slug: getTeamSlug(cleaned) };
}

export default function MaxPicksValueSlide({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const games      = data?.odds?.games ?? [];
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };
  const rankMap    = data?.rankMap ?? {};
  const champOdds  = data?.championshipOdds ?? {};

  let picks = { valuePicks: [] };
  try { picks = buildMaximusPicks({ games, atsLeaders, rankMap, championshipOdds: champOdds }); } catch { /* ignore */ }

  const valuePicks = (picks.valuePicks ?? []).slice(0, 4);

  return (
    <PicksSlideShell asOf={asOf} slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.titleSup}>MAXIMUS&apos;S PICKS · SLIDE {slideNumber}</div>
      <h2 className={styles.title}>Value Spots the<br />Market May Miss</h2>
      <div className={styles.subtitle}>Teams where the model believes odds are mispriced</div>
      <div className={styles.divider} />

      {valuePicks.length === 0 ? (
        <div className={styles.empty}>No value leans qualify today.</div>
      ) : (
        <div className={styles.cardList}>
          {valuePicks.map((pick, i) => {
            const cs = getSlideColors(pick.confidence);
            const pickTeamObj = makeTeamObj(pick.pickTeam);
            const signals = (pick.signals ?? []).slice(0, 3);
            return (
              <div key={i} className={styles.card}>
                <div className={styles.cardPickRow}>
                  <span className={styles.valueBadge}>VALUE</span>
                  {pick.mlPriceLabel && <span className={styles.mlPrice}>{pick.mlPriceLabel}</span>}
                  {pickTeamObj && <TeamLogo team={pickTeamObj} size={28} />}
                  <span className={styles.pickTeamName}>{pick.pickTeam || '—'}</span>
                  <span
                    className={styles.confBadge}
                    style={{ background: cs.bg, color: cs.text, borderColor: cs.border }}
                  >
                    {getConfidenceLabel(pick.confidence)}
                  </span>
                </div>
                <div className={styles.cardMatchup}>
                  <span>{pick.opponentTeam ? `vs ${pick.opponentTeam}` : (pick.matchup || `${pick.awayTeam} @ ${pick.homeTeam}`)}</span>
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
