import PicksSlideShell from './PicksSlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import { buildMaximusPicks } from '../../../utils/maximusPicksModel';
import { getSlideColors, getConfidenceLabel } from '../../../utils/confidenceSystem';
import styles from './MaxPicksATSSlide.module.css';

function makeTeamObj(name) {
  if (!name) return null;
  const cleaned = name.replace(/^(?:The |the )/, '').trim();
  return { name: cleaned, slug: getTeamSlug(cleaned) };
}

function fmtSpread(n) {
  if (n == null) return '';
  if (n > 0) return `+${n}`;
  return String(n);
}

export default function MaxPicksATSSlide({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const games = data?.odds?.games ?? [];
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };

  let picks = { atsPicks: [] };
  try { picks = buildMaximusPicks({ games, atsLeaders }); } catch { /* ignore */ }

  const atsPicks = (picks.atsPicks ?? []).slice(0, 4);

  return (
    <PicksSlideShell asOf={asOf} slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.titleSup}>MAXIMUS&apos;S PICKS · SLIDE {slideNumber}</div>
      <h2 className={styles.title}>Spread Leans</h2>
      <div className={styles.subtitle}>ATS recommendations based on cover profiles and matchup efficiency</div>
      <div className={styles.divider} />

      {atsPicks.length === 0 ? (
        <div className={styles.empty}>No ATS leans qualify today.</div>
      ) : (
        <div className={styles.cardList}>
          {atsPicks.map((pick, i) => {
            const cs = getSlideColors(pick.confidence);
            const pickTeamObj = makeTeamObj(pick.pickTeam);
            const homeObj = makeTeamObj(pick.homeTeam);
            const awayObj = makeTeamObj(pick.awayTeam);
            const spreadStr = fmtSpread(pick.spread);
            const signals = (pick.signals ?? []).slice(0, 3);
            return (
              <div key={i} className={styles.card}>
                <div className={styles.cardPickRow}>
                  <span className={styles.spreadBadge}>SPREAD</span>
                  {spreadStr && <span className={styles.spreadValue}>{spreadStr}</span>}
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
