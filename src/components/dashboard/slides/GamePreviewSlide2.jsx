import SlideShell from './SlideShell';
import InsightBullets from '../ui/InsightBullets';
import styles from './GamePreviewSlide2.module.css';
import { buildMaximusPicks, confidenceLabel } from '../../../utils/maximusPicksModel';

export default function GamePreviewSlide2({ game, data, asOf, slideNumber, slideTotal, ...rest }) {
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };
  const games = data?.odds?.games ?? [];

  let gamePick = null;
  try {
    const picks = buildMaximusPicks({ games, atsLeaders });
    const allPicks = [...(picks.atsPicks ?? []), ...(picks.mlPicks ?? [])];
    const awayLower = (game?.awayTeam || '').toLowerCase().split(' ').pop() || '';
    const homeLower = (game?.homeTeam || '').toLowerCase().split(' ').pop() || '';
    gamePick = allPicks.find(p => {
      const line = (p.pickLine || '').toLowerCase();
      return (awayLower && line.includes(awayLower)) || (homeLower && line.includes(homeLower));
    }) ?? null;
  } catch { /* ignore */ }

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
      accentColor="#B7986C"
      brandMode="standard"
      category="game"
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

      {gamePick && (
        <div className={styles.pickHighlight}>
          <div className={styles.pickLabel}>VALUE EDGE DETECTED</div>
          <div className={styles.pickLine}>{gamePick.pickLine}</div>
          <div className={styles.pickMeta}>
            {gamePick.type === 'ats' ? 'ATS pick' : 'ML pick'} ·{' '}
            {confidenceLabel(gamePick.confidence)} confidence
            {gamePick.atsEdge != null ? ` · ${(gamePick.atsEdge * 100).toFixed(0)}% edge` : ''}
          </div>
        </div>
      )}
    </SlideShell>
  );
}
