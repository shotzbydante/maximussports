import PicksSlideShell from './PicksSlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import { buildMaximusPicks, confidenceLabel } from '../../../utils/maximusPicksModel';
import styles from './MaxPicksHeroSlide.module.css';

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

const CATEGORY_META = {
  pickem: { label: 'PICK \'EMS', emoji: '🏀' },
  ats:    { label: 'ATS',       emoji: '📊' },
  value:  { label: 'VALUE',     emoji: '💰' },
  total:  { label: 'TOTALS',    emoji: '🔢' },
};

export default function MaxPicksHeroSlide({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const games = data?.odds?.games ?? [];
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };

  let picks = { pickEmPicks: [], atsPicks: [], valuePicks: [], totalsPicks: [] };
  try { picks = buildMaximusPicks({ games, atsLeaders }); } catch { /* ignore */ }

  const pickEmPicks = picks.pickEmPicks ?? [];
  const atsPicks = picks.atsPicks ?? [];
  const valuePicks = picks.valuePicks ?? [];
  const totalsPicks = picks.totalsPicks ?? [];

  const totalCount = pickEmPicks.length + atsPicks.length + valuePicks.length + totalsPicks.length;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  });

  const highlights = [
    ...pickEmPicks.slice(0, 2).map(p => ({ ...p, _cat: 'pickem' })),
    ...atsPicks.slice(0, 1).map(p => ({ ...p, _cat: 'ats' })),
    ...valuePicks.slice(0, 1).map(p => ({ ...p, _cat: 'value' })),
    ...totalsPicks.slice(0, 1).map(p => ({ ...p, _cat: 'total' })),
  ].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 4);

  return (
    <PicksSlideShell asOf={asOf} slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.datePill}>{today}</div>
      <div className={styles.titleSup}>MAXIMUS PICKS</div>
      <h2 className={styles.title}>MAXIMUS&apos;S PICKS</h2>
      <div className={styles.subtitle}>Today&apos;s Top Data-Driven Leans</div>
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
              <span className={styles.countValue}>{valuePicks.length}</span>
              <span className={styles.countLabel}>Value</span>
            </div>
            <div className={styles.countCell}>
              <span className={styles.countValue}>{totalsPicks.length}</span>
              <span className={styles.countLabel}>Totals</span>
            </div>
          </div>

          <div className={styles.highlightsGrid}>
            {highlights.map((pick, i) => {
              const meta = CATEGORY_META[pick._cat] || CATEGORY_META.pickem;
              const cs = confStyle(pick.confidence);
              const teamObj = makeTeamObj(pick.pickTeam);
              const signal = pick.signals?.[0] || '';
              return (
                <div key={i} className={styles.highlightCard}>
                  <div className={styles.highlightCategory}>
                    {meta.emoji} {meta.label}
                  </div>
                  <div className={styles.highlightTeamRow}>
                    {teamObj && <TeamLogo team={teamObj} size={28} />}
                    <div className={styles.highlightLine}>{pick.pickLine || '—'}</div>
                  </div>
                  <div className={styles.highlightConfRow}>
                    <span
                      className={styles.confBadge}
                      style={{ background: cs.bg, color: cs.text, borderColor: cs.border }}
                    >
                      {confidenceLabel(pick.confidence)}
                    </span>
                  </div>
                  {signal && <div className={styles.highlightSignal}>{signal}</div>}
                </div>
              );
            })}
          </div>

          <div className={styles.methodNote}>
            Model combines rankings, ATS trends, price inefficiencies, and matchup signals.
          </div>
        </>
      )}
    </PicksSlideShell>
  );
}
