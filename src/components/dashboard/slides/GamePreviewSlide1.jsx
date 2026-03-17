import SlideShell from './SlideShell';
import LineBlock from '../ui/LineBlock';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import { getTeamSeed } from '../../../utils/tournamentHelpers';
import styles from './GamePreviewSlide1.module.css';

function fmtSpread(v) {
  if (v == null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n > 0 ? `+${n}` : String(n);
}

export default function GamePreviewSlide1({ game, asOf, slideNumber, slideTotal, ...rest }) {
  if (!game) {
    return (
      <SlideShell asOf={asOf} brandMode="standard" category="game" slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
        <div className={styles.noGame}>Select a game to preview.</div>
      </SlideShell>
    );
  }

  const awayTeam = game.awayTeam || '—';
  const homeTeam = game.homeTeam || '—';
  const awaySlug = game.awaySlug || game.awayTeamSlug || getTeamSlug(awayTeam) || null;
  const homeSlug = game.homeSlug || game.homeTeamSlug || getTeamSlug(homeTeam) || null;
  const awayObj = { name: awayTeam, slug: awaySlug };
  const homeObj = { name: homeTeam, slug: homeSlug };
  const awayRank = game.awayRank ?? null;
  const homeRank = game.homeRank ?? null;
  const awaySeed = getTeamSeed(awaySlug || awayTeam);
  const homeSeed = getTeamSeed(homeSlug || homeTeam);

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
      category="game"
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
            <TeamLogo team={awayObj} size={110} />
          </div>
          {awaySeed != null && <span className={styles.seedPill}>#{awaySeed}</span>}
          {awayRank != null && !awaySeed && <span className={styles.rankPill}>#{awayRank}</span>}
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
            <TeamLogo team={homeObj} size={110} />
          </div>
          {homeSeed != null && <span className={styles.seedPill}>#{homeSeed}</span>}
          {homeRank != null && !homeSeed && <span className={styles.rankPill}>#{homeRank}</span>}
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
