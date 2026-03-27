import SlideShell from './SlideShell';
import styles from './GamePreviewSlide3.module.css';
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

export default function GamePreviewSlide3({ game, data, asOf, slideNumber, slideTotal, ...rest }) {
  const headlines = data?.headlines ?? [];

  // Read from canonical picks — single source of truth
  const cp = data?.canonicalPicks ?? {};
  const homeSlug = game?.homeSlug || game?.homeTeamSlug || getTeamSlug(game?.homeTeam || '');
  const awaySlug = game?.awaySlug || game?.awayTeamSlug || getTeamSlug(game?.awayTeam || '');
  const matchGame = (p) => p.homeSlug === homeSlug && p.awaySlug === awaySlug;
  const allPicks = [...(cp.atsPicks ?? []), ...(cp.mlPicks ?? [])];
  const gamePick = allPicks.find(matchGame) ?? null;

  const confLabel = gamePick ? confidenceLabel(gamePick.confidence) : null;
  const tier = pickToTier(gamePick);

  // Watch bullets from headlines
  const gameTerms = [game?.awayTeam, game?.homeTeam].filter(Boolean).map(t => t.toLowerCase().split(' ').pop() || '');
  const relatedHeadlines = headlines
    .filter(h => {
      const text = (h.title || h.headline || '').toLowerCase();
      return gameTerms.some(t => t && text.includes(t));
    })
    .slice(0, 2);

  const watchBullets = [
    relatedHeadlines[0]?.title || relatedHeadlines[0]?.headline,
    relatedHeadlines[1]?.title || relatedHeadlines[1]?.headline,
    game?.awayRank != null
      ? `Ranked team on the road — ${game.awayTeam} (#${game.awayRank}) playing away`
      : game?.homeRank != null
      ? `Home advantage for ranked squad — ${game.homeTeam} (#${game.homeRank})`
      : null,
  ].filter(Boolean).map(t => typeof t === 'string' && t.length > 72 ? t.slice(0, 72) + '…' : t).slice(0, 3);

  return (
    <SlideShell
      asOf={asOf}
      theme="single_game"
      brandMode="light"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      <div className={styles.titleSup}>GAME PREVIEW · SLIDE {slideNumber ?? 3}</div>
      <h2 className={styles.title}>The Lean +<br />What to Watch</h2>
      <div className={styles.divider} />

      {/* Pick slip */}
      <div className={styles.slipSection}>
        <div className={styles.slipLabel}>MAXIMUS LEAN</div>
        {gamePick ? (
          <div className={styles.slipCard}>
            <div className={styles.slipType}>{gamePick.type === 'ats' ? 'ATS' : 'ML'}</div>
            <div className={styles.slipLine}>{gamePick.pickLine}</div>
            {gamePick.whyValue && (
              <div className={styles.slipWhy}>{gamePick.whyValue}</div>
            )}
            {tier && (
              <div
                className={styles.slipConf}
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
        ) : (
          <div className={styles.noSlip}>No qualified lean for this matchup today.</div>
        )}
      </div>

      {/* Watch bullets */}
      {watchBullets.length > 0 && (
        <div className={styles.watchSection}>
          <div className={styles.watchLabel}>WHAT TO WATCH</div>
          {watchBullets.map((b, i) => (
            <div key={i} className={styles.watchRow}>
              <span className={styles.watchBullet}>→</span>
              <span className={styles.watchText}>{b}</span>
            </div>
          ))}
        </div>
      )}
    </SlideShell>
  );
}
