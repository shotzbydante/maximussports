import SlideShell from './SlideShell';
import InsightBullets from '../ui/InsightBullets';
import styles from './GamePreviewSlide2.module.css';
import { confidenceLabel } from '../../../utils/maximusPicksModel';
import { getTeamSlug } from '../../../utils/teamSlug';
import { TIERS } from '../../../utils/confidenceTier';

function pickToTier(pick) {
  if (!pick) return null;
  const c = pick.confidence ?? 0;
  if (c >= 2) return TIERS.conviction;
  if (c >= 1) return TIERS.lean;
  return TIERS.tossUp;
}

export default function GamePreviewSlide2({ game, data, asOf, slideNumber, slideTotal, ...rest }) {
  // Read from canonical picks — single source of truth (order-agnostic slug match)
  const cp = data?.canonicalPicks ?? {};
  const homeSlug = game?.homeSlug || game?.homeTeamSlug || getTeamSlug(game?.homeTeam || '');
  const awaySlug = game?.awaySlug || game?.awayTeamSlug || getTeamSlug(game?.awayTeam || '');
  const gameSlugs = new Set([homeSlug, awaySlug].filter(Boolean));
  const matchGame = (p) => gameSlugs.has(p.homeSlug) && gameSlugs.has(p.awaySlug) && gameSlugs.size === 2;
  const allPicks = [...(cp.atsPicks ?? []), ...(cp.mlPicks ?? [])];
  const gamePick = allPicks.find(matchGame) ?? null;

  const spread = game?.homeSpread ?? game?.spread ?? null;
  const spreadNum = spread != null ? parseFloat(spread) : null;

  const bullets = [];
  if (spreadNum != null && !isNaN(spreadNum)) {
    const absSp = Math.abs(spreadNum);
    if (absSp <= 3.5) bullets.push(`Tight spread of ${absSp <= 1.5 ? 'nearly even' : spreadNum} — line suggests a close game`);
    else if (absSp >= 12) bullets.push(`Heavy favorite — ${absSp}pt line reflects significant talent gap`);
    else bullets.push(`Spread of ${Math.abs(spreadNum)} indicates a competitive matchup`);
  }
  if (gamePick) {
    bullets.push(`Model identifies value edge on ${gamePick.pickLine}`);
  }
  if (game?.awayRank != null || game?.homeRank != null) {
    const rankedTeam = game.awayRank != null ? game.awayTeam : game.homeTeam;
    bullets.push(`Ranked team in action: ${rankedTeam} — elevated market attention`);
  }
  // Pad if needed
  if (bullets.length === 0) bullets.push('No strong model signal detected for this game');

  return (
    <SlideShell
      asOf={asOf}
      theme="single_game"
      brandMode="standard"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      <div className={styles.titleSup}>GAME PREVIEW · SLIDE {slideNumber ?? 2}</div>
      <h2 className={styles.title}>Why This<br />Line Matters</h2>
      <div className={styles.divider} />

      {game && (
        <div className={styles.matchupTag}>
          {game.awayTeam} @ {game.homeTeam}
        </div>
      )}

      <InsightBullets bullets={bullets} label="MODEL READ" />

      {gamePick && (() => {
        const tier = pickToTier(gamePick);
        return (
          <div className={styles.pickHighlight}>
            <div className={styles.pickLabel}>MODEL EDGE DETECTED</div>
            <div className={styles.pickLine}>{gamePick.pickLine}</div>
            <div className={styles.pickMeta}>
              {gamePick.type === 'ats' ? 'ATS pick' : 'ML pick'}
              {gamePick.atsEdge != null ? ` · ${(gamePick.atsEdge * 100).toFixed(0)}% edge` : ''}
            </div>
            {tier && (
              <div
                className={styles.pickConf}
                style={{
                  background: tier.igColor.bg,
                  border: `1px solid ${tier.igColor.border}`,
                  color: tier.igColor.text,
                }}
              >
                {tier.icon} {tier.label}
              </div>
            )}
          </div>
        );
      })()}
    </SlideShell>
  );
}
