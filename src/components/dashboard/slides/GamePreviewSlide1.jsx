import SlideShell from './SlideShell';
import LineBlock from '../ui/LineBlock';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import { getTeamSeed } from '../../../utils/tournamentHelpers';
import { getTeamColors } from '../../../utils/teamColors';
import styles from './GamePreviewSlide1.module.css';

function fmtSpread(v) {
  if (v == null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n > 0 ? `+${n}` : String(n);
}

export default function GamePreviewSlide1({ game, asOf, slideNumber, slideTotal, ...rest }) {
  if (!game) {
    return (
      <SlideShell asOf={asOf} theme="single_game" brandMode="standard" slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
        <div className={styles.noGame}>Select a game to preview.</div>
      </SlideShell>
    );
  }

  const awayTeam = game.awayTeam || '\u2014';
  const homeTeam = game.homeTeam || '\u2014';
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

  const awayTC = getTeamColors(awaySlug);
  const homeTC = getTeamColors(homeSlug);
  const awayAccent = awayTC?.primary || '#6EB3E8';
  const homeAccent = homeTC?.primary || '#6EB3E8';

  return (
    <SlideShell
      asOf={asOf}
      theme="single_game"
      brandMode="standard"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      {/* Spotlight top label */}
      <div className={styles.spotlightLabel}>GAME PREVIEW</div>
      <h2 className={styles.title}>Matchup<br />Breakdown</h2>

      {/* Hero matchup composition */}
      <div className={styles.heroMatchup}>
        {/* Away team — left spotlight */}
        <div className={styles.heroSide}>
          <div className={styles.heroLogoWrap}>
            <div className={styles.heroGlow} style={{ background: `radial-gradient(circle, ${awayAccent}25 0%, transparent 65%)` }} />
            <TeamLogo team={awayObj} size={130} />
          </div>
          {awaySeed != null && <span className={styles.heroSeedPill}>#{awaySeed}</span>}
          {awayRank != null && !awaySeed && <span className={styles.heroRankPill}>#{awayRank}</span>}
          <div className={styles.heroTeamName}>{awayTeam}</div>
          <div className={styles.heroSideLabel}>AWAY</div>
        </div>

        {/* Center spotlight — VS + spread */}
        <div className={styles.heroCenter}>
          <div className={styles.heroVsRing}>
            <span className={styles.heroVsText}>VS</span>
          </div>
          {spreadStr && (
            <div className={styles.heroSpreadBlock}>
              <span className={styles.heroSpreadVal}>{spreadStr}</span>
              <span className={styles.heroSpreadKey}>SPREAD</span>
            </div>
          )}
        </div>

        {/* Home team — right spotlight */}
        <div className={styles.heroSide}>
          <div className={styles.heroLogoWrap}>
            <div className={styles.heroGlow} style={{ background: `radial-gradient(circle, ${homeAccent}25 0%, transparent 65%)` }} />
            <TeamLogo team={homeObj} size={130} />
          </div>
          {homeSeed != null && <span className={styles.heroSeedPill}>#{homeSeed}</span>}
          {homeRank != null && !homeSeed && <span className={styles.heroRankPill}>#{homeRank}</span>}
          <div className={styles.heroTeamName}>{homeTeam}</div>
          <div className={styles.heroSideLabel}>HOME</div>
        </div>
      </div>

      {/* Game meta */}
      {(gameTime || venue) && (
        <div className={styles.gameMeta}>
          {gameTime && <span>{gameTime}</span>}
          {gameTime && venue && <span className={styles.metaDot}>\u00b7</span>}
          {venue && <span>{venue}</span>}
        </div>
      )}

      {/* Glass-panel line block */}
      <div className={styles.lineBlockWrap}>
        <LineBlock spread={spread} ml={ml} total={total} label="FULL LINE" />
      </div>
    </SlideShell>
  );
}
