import SlideShell from './SlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import { getTeamSeed, getTournamentPhase } from '../../../utils/tournamentHelpers';
import { getTeamColors } from '../../../utils/teamColors';
import { buildMaximusPicks } from '../../../utils/maximusPicksModel';
import { TIERS } from '../../../utils/confidenceTier';
import { getAtsCache } from '../../../utils/atsCache';
import styles from './GamePreviewSlide1.module.css';

function fmtSpread(v) {
  if (v == null) return '—';
  const n = parseFloat(v);
  return isNaN(n) ? '—' : n > 0 ? `+${n}` : String(n);
}

function fmtML(v) {
  if (v == null) return '—';
  const n = parseFloat(v);
  return isNaN(n) ? '—' : n > 0 ? `+${n}` : String(n);
}

function fmtTotal(v) {
  if (v == null) return '—';
  return String(v);
}

function pickToTier(pick) {
  if (!pick) return null;
  const c = pick.confidence ?? 0;
  if (c >= 2) return TIERS.conviction;
  if (c >= 1) return TIERS.lean;
  return TIERS.tossUp;
}

function ConvictionPill({ tier }) {
  if (!tier) return <span className={styles.convNone}>—</span>;
  return (
    <span
      className={styles.convPill}
      style={{
        color: tier.igColor.text,
        background: tier.igColor.bg,
        border: `1px solid ${tier.igColor.border}`,
      }}
    >
      {tier.icon} {tier.label}
    </span>
  );
}

const PHASE_LABELS = {
  first_four: 'First Four',
  first_round: 'Round of 64',
  second_round: 'Round of 32',
  sweet_sixteen: 'Sweet 16',
  elite_eight: 'Elite Eight',
  final_four: 'Final Four',
  championship: 'National Championship',
  pre_tournament: 'NCAA Tournament',
};

function getTeamAtsStr(slug) {
  try {
    const cache = getAtsCache?.();
    if (!cache) return null;
    const rec = cache?.bySlug?.[slug];
    if (!rec) return null;
    const w = rec.atsWins ?? rec.wins ?? null;
    const l = rec.atsLosses ?? rec.losses ?? null;
    if (w != null && l != null) return `${w}-${l}`;
    const pct = rec.atsPct ?? rec.coverRate ?? null;
    if (pct != null) return `${Math.round(pct * 100)}%`;
    return null;
  } catch { return null; }
}

export default function GamePreviewSlide1({ game, data, asOf, slideNumber, slideTotal, ...rest }) {
  if (!game) {
    return (
      <SlideShell asOf={asOf} theme="single_game" brandMode="standard" slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
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
  const awaySeed = getTeamSeed(awaySlug || awayTeam);
  const homeSeed = getTeamSeed(homeSlug || homeTeam);
  const awayRank = game.awayRank ?? null;
  const homeRank = game.homeRank ?? null;

  const spread = game.homeSpread ?? game.spread ?? null;
  const ml = game.moneyline ?? game.ml ?? null;
  const total = game.total ?? game.overUnder ?? null;
  const gameTime = game.time || game.startTime || null;
  const network = game.network || game.broadcast || null;


  const awayTC = getTeamColors(awaySlug);
  const homeTC = getTeamColors(homeSlug);
  const awayAccent = awayTC?.primary || '#6EB3E8';
  const homeAccent = homeTC?.primary || '#6EB3E8';

  // Tournament round
  const phase = getTournamentPhase();
  const roundLabel = PHASE_LABELS[phase] || null;

  // ATS records
  const awayAts = getTeamAtsStr(awaySlug);
  const homeAts = getTeamAtsStr(homeSlug);

  // Conference (from team slug — extract from data if available)
  const awayConf = game.awayConference || game.awayConf || null;
  const homeConf = game.homeConference || game.homeConf || null;

  // Records
  const awayRecord = game.awayRecord || null;
  const homeRecord = game.homeRecord || null;

  // ── Maximus Picks ──
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };
  const games = data?.odds?.games ?? [];

  let pickEmPick = null;
  let atsPick = null;
  let totalsPick = null;

  try {
    const picks = buildMaximusPicks({ games, atsLeaders });

    const matchFn = (p) => {
      const line = (p.pickLine || p.matchup || '').toLowerCase();
      const awayLower = (awayTeam || '').toLowerCase().split(' ').pop() || '';
      const homeLower = (homeTeam || '').toLowerCase().split(' ').pop() || '';
      return (awayLower && line.includes(awayLower)) || (homeLower && line.includes(homeLower));
    };

    pickEmPick = (picks.pickEmPicks ?? []).find(matchFn) ?? null;
    atsPick = (picks.atsPicks ?? []).find(matchFn) ?? null;
    totalsPick = (picks.totalsPicks ?? []).find(matchFn) ?? null;
  } catch { /* ignore — graceful degradation */ }

  const pickEmTier = pickToTier(pickEmPick);
  const atsTier = pickToTier(atsPick);
  const totalsTier = pickToTier(totalsPick);

  // Format date for display
  let dateStr = null;
  if (gameTime) {
    try {
      const d = new Date(gameTime);
      dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } catch { dateStr = null; }
  }

  let timeStr = null;
  if (gameTime) {
    try {
      const d = new Date(gameTime);
      timeStr = d.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
      }) + ' PST';
    } catch { timeStr = null; }
  }

  return (
    <SlideShell
      asOf={asOf}
      theme="single_game"
      brandMode="standard"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      {/* ── Header area: round badge + meta ── */}
      <div className={styles.headerArea}>
        <div className={styles.spotlightLabel}>MATCHUP INTEL</div>
        {roundLabel && (
          <div className={styles.roundBadge}>{roundLabel}</div>
        )}
        <div className={styles.metaChips}>
          {dateStr && <span className={styles.metaChip}>{dateStr}</span>}
          {timeStr && <span className={styles.metaChip}>{timeStr}</span>}
          {network && <span className={styles.metaChip}>{network}</span>}
        </div>
      </div>

      {/* ── Team panels — head-to-head ── */}
      <div className={styles.teamsArea}>
        {/* Away team panel */}
        <div className={styles.teamPanel}>
          <div className={styles.teamLogoWrap}>
            <div className={styles.teamGlow} style={{ background: `radial-gradient(circle, ${awayAccent}30 0%, transparent 65%)` }} />
            <TeamLogo team={awayObj} size={90} />
          </div>
          {awaySeed != null && <span className={styles.seedPill}>#{awaySeed}</span>}
          {awayRank != null && !awaySeed && <span className={styles.rankPill}>#{awayRank}</span>}
          <div className={styles.teamName}>{awayTeam}</div>
          {awayConf && <div className={styles.teamConf}>{awayConf}</div>}
          <div className={styles.teamStats}>
            {awayRecord && <span className={styles.statChip}>{awayRecord}</span>}
            {awayAts && <span className={styles.statChip}>ATS {awayAts}</span>}
          </div>
          <div className={styles.sideLabel}>AWAY</div>
        </div>

        {/* Center spine */}
        <div className={styles.centerSpine}>
          <div className={styles.vsCircle}>VS</div>
          <div className={styles.lineStack}>
            <div className={styles.lineItem}>
              <span className={styles.lineVal}>{fmtSpread(spread)}</span>
              <span className={styles.lineKey}>SPREAD</span>
            </div>
            <div className={styles.lineDivider} />
            <div className={styles.lineItem}>
              <span className={styles.lineVal}>{fmtML(ml)}</span>
              <span className={styles.lineKey}>ML</span>
            </div>
            <div className={styles.lineDivider} />
            <div className={styles.lineItem}>
              <span className={styles.lineVal}>{fmtTotal(total)}</span>
              <span className={styles.lineKey}>TOTAL</span>
            </div>
          </div>
        </div>

        {/* Home team panel */}
        <div className={styles.teamPanel}>
          <div className={styles.teamLogoWrap}>
            <div className={styles.teamGlow} style={{ background: `radial-gradient(circle, ${homeAccent}30 0%, transparent 65%)` }} />
            <TeamLogo team={homeObj} size={90} />
          </div>
          {homeSeed != null && <span className={styles.seedPill}>#{homeSeed}</span>}
          {homeRank != null && !homeSeed && <span className={styles.rankPill}>#{homeRank}</span>}
          <div className={styles.teamName}>{homeTeam}</div>
          {homeConf && <div className={styles.teamConf}>{homeConf}</div>}
          <div className={styles.teamStats}>
            {homeRecord && <span className={styles.statChip}>{homeRecord}</span>}
            {homeAts && <span className={styles.statChip}>ATS {homeAts}</span>}
          </div>
          <div className={styles.sideLabel}>HOME</div>
        </div>
      </div>

      {/* ── Maximus Pick section ── */}
      <div className={styles.picksArea}>
        <div className={styles.picksLabel}>MAXIMUS PICK</div>
        <div className={styles.picksGrid}>
          {/* Pick Em */}
          <div className={styles.pickCol}>
            <div className={styles.pickType}>PICK EM</div>
            <div className={styles.pickValue}>
              {pickEmPick?.pickTeam || 'No lean'}
            </div>
            <ConvictionPill tier={pickEmTier} />
          </div>

          {/* ATS */}
          <div className={styles.pickCol}>
            <div className={styles.pickType}>ATS</div>
            <div className={styles.pickValue}>
              {atsPick?.pickLine || 'No lean'}
            </div>
            <ConvictionPill tier={atsTier} />
          </div>

          {/* Totals */}
          <div className={styles.pickCol}>
            <div className={styles.pickType}>O/U</div>
            <div className={styles.pickValue}>
              {totalsPick?.leanDirection
                ? `${totalsPick.leanDirection === 'over' ? 'Over' : 'Under'} ${fmtTotal(total)}`
                : totalsPick?.pickLine || 'No lean'}
            </div>
            <ConvictionPill tier={totalsTier} />
          </div>
        </div>
      </div>
    </SlideShell>
  );
}
