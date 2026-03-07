import SlideShell from './SlideShell';
import styles from './GamePreviewSlide3.module.css';
import { buildMaximusPicks, confidenceLabel } from '../../../utils/maximusPicksModel';

const CONF_BG = {
  High:   'rgba(45,138,110,0.14)',
  Medium: 'rgba(183,152,108,0.14)',
  Low:    'rgba(60,121,180,0.10)',
};
const CONF_BORDER = {
  High:   'rgba(45,138,110,0.3)',
  Medium: 'rgba(183,152,108,0.28)',
  Low:    'rgba(60,121,180,0.22)',
};
const CONF_COLOR = {
  High:   '#2d8a6e',
  Medium: '#8a6e35',
  Low:    '#3C79B4',
};

export default function GamePreviewSlide3({ game, data, asOf, slideNumber, slideTotal, ...rest }) {
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };
  const games = data?.odds?.games ?? [];
  const headlines = data?.headlines ?? [];

  let gamePick = null;
  try {
    const picks = buildMaximusPicks({ games, atsLeaders });
    const all = [...(picks.atsPicks ?? []), ...(picks.mlPicks ?? [])];
    const awayLower = (game?.awayTeam || '').toLowerCase().split(' ').pop() || '';
    const homeLower = (game?.homeTeam || '').toLowerCase().split(' ').pop() || '';
    gamePick = all.find(p => {
      const line = (p.pickLine || '').toLowerCase();
      return (awayLower && line.includes(awayLower)) || (homeLower && line.includes(homeLower));
    }) ?? null;
  } catch { /* ignore */ }

  const confLabel = gamePick ? confidenceLabel(gamePick.confidence) : null;

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
      accentColor="#3C79B4"
      brandMode="light"
      category="game"
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
            <div
              className={styles.slipConf}
              style={{
                background: CONF_BG[confLabel] || CONF_BG.Low,
                border: `1px solid ${CONF_BORDER[confLabel] || CONF_BORDER.Low}`,
                color: CONF_COLOR[confLabel] || CONF_COLOR.Low,
              }}
            >
              {confLabel} Confidence
            </div>
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
