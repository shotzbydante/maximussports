import PicksSlideShell from './PicksSlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import { buildMaximusPicks, confidenceLabel } from '../../../utils/maximusPicksModel';
import styles from './MaxPicksATSSlide.module.css';

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
            const cs = confStyle(pick.confidence);
            const pickTeamObj = makeTeamObj(pick.pickTeam);
            const homeObj = makeTeamObj(pick.homeTeam);
            const awayObj = makeTeamObj(pick.awayTeam);
            const spreadStr = fmtSpread(pick.spread);
            const signals = (pick.signals ?? []).slice(0, 3);
            return (
              <div key={i} className={styles.card}>
                <div className={styles.cardMatchup}>
                  {awayObj && <TeamLogo team={awayObj} size={22} />}
                  <span>{pick.awayTeam}</span>
                  <span className={styles.vsText}>VS</span>
                  {homeObj && <TeamLogo team={homeObj} size={22} />}
                  <span>{pick.homeTeam}</span>
                </div>
                <div className={styles.cardPickRow}>
                  <span className={styles.spreadBadge}>SPREAD</span>
                  {spreadStr && <span className={styles.spreadValue}>{spreadStr}</span>}
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
