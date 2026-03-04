import SlideShell from './SlideShell';
import LineBlock from '../ui/LineBlock';
import styles from './GamePreviewSlide1.module.css';

function fmtSpread(v) {
  if (v == null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n > 0 ? `+${n}` : String(n);
}

export default function GamePreviewSlide1({ game, asOf, slideNumber, slideTotal, ...rest }) {
  if (!game) {
    return (
      <SlideShell asOf={asOf} brandMode="standard" slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
        <div className={styles.noGame}>Select a game to preview.</div>
      </SlideShell>
    );
  }

  const awayTeam = game.awayTeam || '—';
  const homeTeam = game.homeTeam || '—';
  const awaySlug = game.awaySlug || game.awayTeamSlug || null;
  const homeSlug = game.homeSlug || game.homeTeamSlug || null;
  const awayRank = game.awayRank ?? null;
  const homeRank = game.homeRank ?? null;

  const spread = game.homeSpread ?? game.spread ?? null;
  const ml = game.moneyline ?? null;
  const total = game.total ?? null;
  const gameTime = game.time || game.startTime || null;
  const venue = game.venue || game.location || null;

  const spreadStr = fmtSpread(spread);

  return (
    <SlideShell
      asOf={asOf}
      accentColor="#3C79B4"
      brandMode="standard"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      <div className={styles.titleSup}>GAME PREVIEW</div>
      <h2 className={styles.title}>Matchup<br />Breakdown</h2>
      <div className={styles.divider} />

      {/* Teams vs block */}
      <div className={styles.matchupRow}>
        {/* Away team */}
        <div className={styles.teamSide}>
          <div className={styles.logoWrap}>
            {awaySlug && (
              <img
                src={`/logos/${awaySlug}.png`}
                alt={awayTeam}
                className={styles.teamLogo}
                crossOrigin="anonymous"
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
            )}
          </div>
          {awayRank != null && <span className={styles.rankPill}>#{awayRank}</span>}
          <div className={styles.teamName}>{awayTeam}</div>
          <div className={styles.sideLabel}>AWAY</div>
        </div>

        {/* VS divider */}
        <div className={styles.vsBlock}>
          <div className={styles.vsText}>VS</div>
          {spreadStr && (
            <div className={styles.spreadCenter}>
              <span className={styles.spreadVal}>{spreadStr}</span>
              <span className={styles.spreadKey}>SPREAD</span>
            </div>
          )}
        </div>

        {/* Home team */}
        <div className={styles.teamSide}>
          <div className={styles.logoWrap}>
            {homeSlug && (
              <img
                src={`/logos/${homeSlug}.png`}
                alt={homeTeam}
                className={styles.teamLogo}
                crossOrigin="anonymous"
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
            )}
          </div>
          {homeRank != null && <span className={styles.rankPill}>#{homeRank}</span>}
          <div className={styles.teamName}>{homeTeam}</div>
          <div className={styles.sideLabel}>HOME</div>
        </div>
      </div>

      {/* Game meta */}
      {(gameTime || venue) && (
        <div className={styles.gameMeta}>
          {gameTime && <span>{gameTime}</span>}
          {gameTime && venue && <span className={styles.metaDot}>·</span>}
          {venue && <span>{venue}</span>}
        </div>
      )}

      {/* Full line block */}
      <LineBlock spread={spread} ml={ml} total={total} label="FULL LINE" />
    </SlideShell>
  );
}
