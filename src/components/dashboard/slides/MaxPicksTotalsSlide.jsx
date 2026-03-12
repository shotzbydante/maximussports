import PicksSlideShell from './PicksSlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import { buildMaximusPicks, confidenceLabel } from '../../../utils/maximusPicksModel';
import styles from './MaxPicksTotalsSlide.module.css';

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

export default function MaxPicksTotalsSlide({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const games = data?.odds?.games ?? [];
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };

  let picks = { totalsPicks: [] };
  try { picks = buildMaximusPicks({ games, atsLeaders }); } catch { /* ignore */ }

  const totalsPicks = (picks.totalsPicks ?? []).slice(0, 4);

  return (
    <PicksSlideShell asOf={asOf} slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.titleSup}>MAXIMUS&apos;S PICKS · SLIDE {slideNumber}</div>
      <h2 className={styles.title}>Totals to Watch</h2>
      <div className={styles.subtitle}>Game totals where teams&apos; scoring trends favor a side</div>
      <div className={styles.divider} />

      {totalsPicks.length === 0 ? (
        <div className={styles.empty}>No totals leans qualify today.</div>
      ) : (
        <div className={styles.cardList}>
          {totalsPicks.map((pick, i) => {
            const cs = confStyle(pick.confidence);
            const dir = pick.leanDirection ?? 'OVER';
            const isOver = dir === 'OVER';
            const homeObj = makeTeamObj(pick.homeTeam);
            const awayObj = makeTeamObj(pick.awayTeam);
            const signals = (pick.signals ?? []).slice(0, 3);
            return (
              <div key={i} className={styles.card}>
                <div className={styles.cardPickRow}>
                  <span className={`${styles.ouBadge} ${isOver ? styles.ouBadgeOver : styles.ouBadgeUnder}`}>
                    {dir}
                  </span>
                  {pick.lineValue != null && <span className={styles.ouLine}>{pick.lineValue}</span>}
                  <span className={styles.matchupText}>{pick.pickLine || '—'}</span>
                  <span
                    className={styles.confBadge}
                    style={{ background: cs.bg, color: cs.text, borderColor: cs.border }}
                  >
                    {confidenceLabel(pick.confidence)}
                  </span>
                </div>
                <div className={styles.cardMatchup}>
                  {awayObj && <TeamLogo team={awayObj} size={22} />}
                  <span>{pick.awayTeam}</span>
                  <span style={{ opacity: 0.35, fontSize: 11 }}>vs</span>
                  {homeObj && <TeamLogo team={homeObj} size={22} />}
                  <span>{pick.homeTeam}</span>
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
