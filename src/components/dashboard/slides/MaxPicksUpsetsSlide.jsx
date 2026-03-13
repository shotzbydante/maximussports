import PicksSlideShell from './PicksSlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import { buildMaximusPicks } from '../../../utils/maximusPicksModel';
import { getSlideColors, getConfidenceLabel } from '../../../utils/confidenceSystem';
import styles from './MaxPicksUpsetsSlide.module.css';

function makeTeamObj(name) {
  if (!name) return null;
  const cleaned = name.replace(/^(?:The |the )/, '').trim();
  return { name: cleaned, slug: getTeamSlug(cleaned) };
}

/**
 * Build upset candidates from value picks (plus-money underdogs)
 * and ATS picks where the team is getting significant points.
 */
function findUpsetCandidates(picks) {
  const candidates = [];

  for (const p of (picks.valuePicks ?? [])) {
    const price = p.mlPriceLabel;
    if (!price) continue;
    const num = parseInt(price.replace('+', ''), 10);
    if (isNaN(num) || num < 100) continue;
    candidates.push({
      ...p,
      _upsetOdds: price,
      _upsetScore: (p.confidence ?? 0) * 100 + (p.value ?? 0) * 1000 + num * 0.1,
    });
  }

  for (const p of (picks.atsPicks ?? [])) {
    if ((p.spread ?? 0) <= 3) continue;
    const already = candidates.find(c => c.key === p.key && c.pickTeam === p.pickTeam);
    if (already) continue;
    candidates.push({
      ...p,
      _upsetOdds: p.pickLine || `+${p.spread}`,
      _upsetScore: (p.confidence ?? 0) * 80 + (p.spread ?? 0) * 10,
    });
  }

  return candidates
    .sort((a, b) => b._upsetScore - a._upsetScore)
    .slice(0, 3);
}

export default function MaxPicksUpsetsSlide({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const games = data?.odds?.games ?? [];
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };

  let picks = { valuePicks: [], atsPicks: [] };
  try { picks = buildMaximusPicks({ games, atsLeaders }); } catch { /* ignore */ }

  const upsets = findUpsetCandidates(picks);

  return (
    <PicksSlideShell asOf={asOf} slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.titleSup}>MAXIMUS&apos;S PICKS · SLIDE {slideNumber}</div>
      <h2 className={styles.title}>Upset Alerts 🚨</h2>
      <div className={styles.subtitle}>Underdogs the model thinks could win outright or cover big spreads</div>
      <div className={styles.divider} />

      {upsets.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>🚨</span>
          <span>No upset candidates identified today.</span>
        </div>
      ) : (
        <div className={styles.cardList}>
          {upsets.map((pick, i) => {
            const cs = getSlideColors(pick.confidence);
            const pickTeamObj = makeTeamObj(pick.pickTeam);
            const homeObj = makeTeamObj(pick.homeTeam);
            const awayObj = makeTeamObj(pick.awayTeam);
            const signals = (pick.signals ?? []).slice(0, 3);
            return (
              <div key={i} className={styles.card}>
                <div className={styles.cardPickRow}>
                  <span className={styles.alertBadge}>🚨 UPSET</span>
                  {pick._upsetOdds && <span className={styles.oddsPrice}>{pick._upsetOdds}</span>}
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
