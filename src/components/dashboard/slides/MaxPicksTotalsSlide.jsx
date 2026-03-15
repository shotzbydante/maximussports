import PicksSlideShell from './PicksSlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import { buildMaximusPicks } from '../../../utils/maximusPicksModel';
import { getSlideColors, getConfidenceLabel, getBarBlocks, getEdgeText } from '../../../utils/confidenceSystem';
import styles from './MaxPicksTotalsSlide.module.css';

function makeTeamObj(name) {
  if (!name) return null;
  const cleaned = name.replace(/^(?:The |the )/, '').trim();
  return { name: cleaned, slug: getTeamSlug(cleaned) };
}

function TotalCard({ pick }) {
  const cs = getSlideColors(pick.confidence);
  const dir = pick.leanDirection ?? 'OVER';
  const isOver = dir === 'OVER';
  const homeObj = makeTeamObj(pick.homeTeam);
  const awayObj = makeTeamObj(pick.awayTeam);
  const signals = (pick.signals ?? []).slice(0, 3);

  return (
    <div className={styles.card}>
      <div className={styles.cardPickRow}>
        <span className={`${styles.ouBadge} ${isOver ? styles.ouBadgeOver : styles.ouBadgeUnder}`}>
          {dir}
        </span>
        {pick.lineValue != null && <span className={styles.ouLine}>{pick.lineValue}</span>}
        <span
          className={styles.confBadge}
          style={{ background: cs.bg, color: cs.text, borderColor: cs.border }}
        >
          {getConfidenceLabel(pick.confidence)}
        </span>
      </div>
      <div className={styles.cardMatchup}>
        {awayObj && <TeamLogo team={awayObj} size={22} />}
        <span className={styles.matchupTeam}>{pick.awayTeam}</span>
        <span className={styles.vsText}>vs</span>
        {homeObj && <TeamLogo team={homeObj} size={22} />}
        <span className={styles.matchupTeam}>{pick.homeTeam}</span>
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
}

function FeaturedTotalCard({ pick }) {
  const cs = getSlideColors(pick.confidence);
  const dir = pick.leanDirection ?? 'OVER';
  const isOver = dir === 'OVER';
  const homeObj = makeTeamObj(pick.homeTeam);
  const awayObj = makeTeamObj(pick.awayTeam);
  const signals = (pick.signals ?? []).slice(0, 4);
  const filled = getBarBlocks(pick);

  return (
    <div className={styles.featuredCard}>
      <div className={styles.featuredPickRow}>
        <span className={`${styles.ouBadge} ${styles.ouBadgeLg} ${isOver ? styles.ouBadgeOver : styles.ouBadgeUnder}`}>
          {dir}
        </span>
        {pick.lineValue != null && <span className={styles.ouLineLg}>{pick.lineValue}</span>}
        <span
          className={styles.confBadge}
          style={{ background: cs.bg, color: cs.text, borderColor: cs.border }}
        >
          {getConfidenceLabel(pick.confidence)}
        </span>
      </div>
      <div className={styles.featuredMatchup}>
        {awayObj && <TeamLogo team={awayObj} size={28} />}
        <span className={styles.featuredTeamName}>{pick.awayTeam}</span>
        <span className={styles.vsText}>vs</span>
        {homeObj && <TeamLogo team={homeObj} size={28} />}
        <span className={styles.featuredTeamName}>{pick.homeTeam}</span>
      </div>
      <div className={styles.featuredEdgeBar}>
        <div className={styles.edgeBlocks}>
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className={`${styles.edgeBlock} ${i < filled ? styles.edgeBlockOn : ''}`}
              style={i < filled ? { background: cs.barFill, boxShadow: `0 0 4px ${cs.barGlow}` } : undefined}
            />
          ))}
        </div>
        <span className={styles.edgeLabel} style={{ color: cs.text }}>{getEdgeText(pick)}</span>
      </div>
      {pick.rationale && (
        <div className={styles.featuredRationale}>{pick.rationale}</div>
      )}
      {signals.length > 0 && (
        <div className={styles.signalsList}>
          {signals.map((s, j) => (
            <div key={j} className={styles.signalItem}>{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MaxPicksTotalsSlide({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
  const games      = data?.odds?.games ?? [];
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };
  const rankMap    = data?.rankMap ?? {};
  const champOdds  = data?.championshipOdds ?? {};

  let picks = { totalsPicks: [] };
  try { picks = buildMaximusPicks({ games, atsLeaders, rankMap, championshipOdds: champOdds }); } catch { /* ignore */ }

  const totalsPicks = (picks.totalsPicks ?? [])
    .filter(p => p.leanDirection)
    .slice(0, 4);

  const isSingle = totalsPicks.length === 1;

  return (
    <PicksSlideShell asOf={asOf} slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.titleSup}>MAXIMUS&apos;S PICKS · SLIDE {slideNumber}</div>
      <h2 className={styles.title}>{isSingle ? 'Featured Total' : 'Totals to Watch'}</h2>
      <div className={styles.subtitle}>
        {isSingle
          ? 'One qualifying total where the model sees a clear directional edge'
          : 'Game totals where teams\' scoring trends favor a side'}
      </div>
      <div className={styles.divider} />

      {totalsPicks.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📊</div>
          <div className={styles.emptyTitle}>No totals qualify</div>
          <div className={styles.emptyText}>
            The model found no clear over/under edges today. Check back closer to tip-off as lines sharpen.
          </div>
        </div>
      ) : isSingle ? (
        <div className={styles.featuredWrap}>
          <FeaturedTotalCard pick={totalsPicks[0]} />
        </div>
      ) : (
        <div className={styles.cardList}>
          {totalsPicks.map((pick, i) => (
            <TotalCard key={i} pick={pick} />
          ))}
        </div>
      )}
      <div className={styles.disclaimer}>Algorithmic leans only. Not financial advice. 21+</div>
    </PicksSlideShell>
  );
}
