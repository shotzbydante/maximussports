import PicksSlideShell from './PicksSlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import { buildMaximusPicks } from '../../../utils/maximusPicksModel';
import {
  getSlideColors, getConfidenceLabel, getBarBlocks, getEdgeText,
  getEditorialLine,
} from '../../../utils/confidenceSystem';
import styles from './MaxPicksTotalsSlide.module.css';

function makeTeamObj(name) {
  if (!name) return null;
  const cleaned = name.replace(/^(?:The |the )/, '').trim();
  return { name: cleaned, slug: getTeamSlug(cleaned) };
}

function MiniEdge({ pick }) {
  const filled = getBarBlocks(pick);
  const cs = getSlideColors(pick.confidence);
  const h = cs.barHeight ?? 6;
  return (
    <div className={styles.miniEdge}>
      <div className={styles.miniBar}>
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className={`${styles.miniBlock} ${i < filled ? styles.miniOn : ''}`}
            style={
              i < filled
                ? { height: h, background: cs.barFill, boxShadow: `0 0 4px ${cs.barGlow}` }
                : { height: h }
            }
          />
        ))}
      </div>
      <span className={styles.miniVal} style={{ color: cs.text }}>{getEdgeText(pick)}</span>
    </div>
  );
}

function TotalCard({ pick }) {
  const cs = getSlideColors(pick.confidence);
  const dir = pick.leanDirection;
  const isOver = dir === 'OVER';
  const isUnder = dir === 'UNDER';
  const homeObj = makeTeamObj(pick.homeTeam);
  const awayObj = makeTeamObj(pick.awayTeam);

  return (
    <div className={styles.card}>
      <div className={styles.cardInner}>
        <div className={styles.cardLeft}>
          <div className={styles.matchupLogos}>
            {awayObj && <TeamLogo team={awayObj} size={28} />}
            <span className={styles.vsText}>@</span>
            {homeObj && <TeamLogo team={homeObj} size={28} />}
          </div>
          <div className={styles.matchupNames}>
            <span className={styles.teamName}>{pick.awayTeam}</span>
            <span className={styles.teamNameDim}>vs {pick.homeTeam}</span>
          </div>
        </div>
        <div className={styles.cardRight}>
          {pick.lineValue != null && (
            <div className={styles.lineBlock}>
              <span className={styles.lineLabel}>O/U</span>
              <span className={styles.lineValue}>{pick.lineValue}</span>
            </div>
          )}
          <span className={`${styles.pickBadge} ${isOver ? styles.pickBadgeOver : isUnder ? styles.pickBadgeUnder : styles.pickBadgeNeutral}`}>
            {isOver && <span className={styles.arrow}>▲</span>}
            {isUnder && <span className={styles.arrow}>▼</span>}
            {dir ?? 'O/U'}
          </span>
          <span
            className={styles.confBadge}
            style={{ background: cs.bg, color: cs.text, borderColor: cs.border }}
          >
            {getConfidenceLabel(pick.confidence)}
          </span>
          <MiniEdge pick={pick} />
        </div>
      </div>
      <div className={styles.cardEditorial}>{getEditorialLine(pick)}</div>
    </div>
  );
}

function FeaturedTotalCard({ pick }) {
  const cs = getSlideColors(pick.confidence);
  const dir = pick.leanDirection;
  const isOver = dir === 'OVER';
  const isUnder = dir === 'UNDER';
  const homeObj = makeTeamObj(pick.homeTeam);
  const awayObj = makeTeamObj(pick.awayTeam);

  return (
    <div className={styles.featuredCard}>
      <div className={styles.featuredMatchup}>
        <div className={styles.featuredTeam}>
          {awayObj && <TeamLogo team={awayObj} size={38} />}
          <span className={styles.featuredTeamName}>{pick.awayTeam}</span>
        </div>
        <span className={styles.featuredVs}>vs</span>
        <div className={styles.featuredTeam}>
          {homeObj && <TeamLogo team={homeObj} size={38} />}
          <span className={styles.featuredTeamName}>{pick.homeTeam}</span>
        </div>
      </div>
      <div className={styles.featuredPickRow}>
        {pick.lineValue != null && (
          <div className={styles.featuredLineBlock}>
            <span className={styles.featuredLineLabel}>O/U</span>
            <span className={styles.featuredLineValue}>{pick.lineValue}</span>
          </div>
        )}
        <span className={`${styles.pickBadge} ${styles.pickBadgeLg} ${isOver ? styles.pickBadgeOver : isUnder ? styles.pickBadgeUnder : styles.pickBadgeNeutral}`}>
          {isOver && <span className={styles.arrow}>▲</span>}
          {isUnder && <span className={styles.arrow}>▼</span>}
          {dir ?? 'O/U'}
        </span>
        <span
          className={`${styles.confBadge} ${styles.confBadgeLg}`}
          style={{ background: cs.bg, color: cs.text, borderColor: cs.border }}
        >
          {getConfidenceLabel(pick.confidence)}
        </span>
        <MiniEdge pick={pick} />
      </div>
      <div className={styles.featuredEditorial}>{getEditorialLine(pick)}</div>
    </div>
  );
}

export default function MaxPicksTotalsSlide({ data, asOf, slideNumber, slideTotal, options = {}, ...rest }) {
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

  const totalsPicks = (picks.totalsPicks ?? []).slice(0, 4);
  const isSingle = totalsPicks.length === 1;

  return (
    <PicksSlideShell asOf={asOf} slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.titleSup}>MAXIMUS&apos;S PICKS · SLIDE {slideNumber}</div>
      <h2 className={styles.title}>{isSingle ? 'Featured Total' : 'Game Totals'}</h2>
      <div className={styles.divider} />

      {totalsPicks.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📊</div>
          <div className={styles.emptyTitle}>No totals qualify</div>
          <div className={styles.emptyText}>
            No totals cleared the model threshold today. Check back closer to tip-off as lines sharpen.
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
