import PicksSlideShell from './PicksSlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import { buildMaximusPicks, confidenceLabel } from '../../../utils/maximusPicksModel';
import styles from './MaxPicksValueSlide.module.css';

const CONF_COLOR = {
  high:   { bg: 'rgba(45,138,110,0.18)', text: '#2d8a6e', border: 'rgba(45,138,110,0.35)' },
  medium: { bg: 'rgba(183,152,108,0.18)', text: '#B7986C', border: 'rgba(183,152,108,0.35)' },
  low:    { bg: 'rgba(60,121,180,0.12)', text: '#3C79B4', border: 'rgba(60,121,180,0.25)' },
};

function confStyle(level) {
  return CONF_COLOR[level === 2 ? 'high' : level === 1 ? 'medium' : 'low'];
}

function makeTeamObj(name) {
  if (!name) return null;
  const cleaned = name.replace(/^(?:The |the )/, '').trim();
  return { name: cleaned, slug: getTeamSlug(cleaned) };
}

export default function MaxPicksValueSlide({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const games = data?.odds?.games ?? [];
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };

  let picks = { valuePicks: [] };
  try { picks = buildMaximusPicks({ games, atsLeaders }); } catch { /* ignore */ }

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
            const cs = confStyle(pick.confidence);
            const pickTeamObj = makeTeamObj(pick.pickTeam);
            const signals = (pick.signals ?? []).slice(0, 3);
            return (
              <div key={i} className={styles.card}>
                <div className={styles.cardMatchup}>
                  <span>{pick.matchup || `${pick.awayTeam} @ ${pick.homeTeam}`}</span>
                </div>
                <div className={styles.cardPickRow}>
                  <span className={styles.valueBadge}>VALUE</span>
                  {pick.mlPriceLabel && <span className={styles.mlPrice}>{pick.mlPriceLabel}</span>}
                  {pickTeamObj && <TeamLogo team={pickTeamObj} size={28} />}
                  <span className={styles.pickTeamName}>{pick.pickTeam || '—'}</span>
                  <span
                    className={styles.confBadge}
                    style={{ background: cs.bg, color: cs.text, borderColor: cs.border }}
                  >
                    {confidenceLabel(pick.confidence)}
                  </span>
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
