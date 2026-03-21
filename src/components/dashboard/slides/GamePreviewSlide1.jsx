import SlideShell from './SlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import { getTeamSeed, getTournamentPhase } from '../../../utils/tournamentHelpers';
import { getTeamColors } from '../../../utils/teamColors';
import { getTeamBySlug } from '../../../data/teams';
import { buildMaximusPicks } from '../../../utils/maximusPicksModel';
import { TIERS } from '../../../utils/confidenceTier';
import { getAtsCache } from '../../../utils/atsCache';
import styles from './GamePreviewSlide1.module.css';

/* ── formatters ───────────────────────────────────────────────────────── */

function fmtLine(v) {
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

/* ── Tournament round inference from seeds ────────────────────────────── */

const R64_PAIRS = [[1,16],[2,15],[3,14],[4,13],[5,12],[6,11],[7,10],[8,9]];

function inferRoundLabel(awaySeedVal, homeSeedVal) {
  // If both seeds exist, infer round from pairing
  if (awaySeedVal != null && homeSeedVal != null) {
    const lo = Math.min(awaySeedVal, homeSeedVal);
    const hi = Math.max(awaySeedVal, homeSeedVal);
    // R64: pairs sum to 17
    if (R64_PAIRS.some(([a, b]) => a === lo && b === hi)) return 'Round of 64';
    // R32: winner of 1v16 plays winner of 8v9 → possible combos are seeds 1-16 vs 8-9
    // But in practice, after R64, the higher seed plays a lower seed from the other half.
    // Best heuristic: if both seeds ≤ 8, it's at least R32. Use calendar for specificity.
    const phase = getTournamentPhase();
    const PHASE_MAP = {
      second_round: 'Round of 32',
      sweet_sixteen: 'Sweet 16',
      elite_eight: 'Elite Eight',
      final_four: 'Final Four',
      championship: 'National Championship',
    };
    return PHASE_MAP[phase] || 'Round of 32';
  }
  // No seeds — fall back to calendar
  const phase = getTournamentPhase();
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
  return PHASE_LABELS[phase] || null;
}

/* ── ATS helper ───────────────────────────────────────────────────────── */

function getTeamAtsDisplay(slug) {
  try {
    const cache = getAtsCache?.();
    if (!cache) return null;
    const rec = cache?.bySlug?.[slug];
    if (!rec) return null;
    const w = rec.atsWins ?? rec.wins ?? null;
    const l = rec.atsLosses ?? rec.losses ?? null;
    if (w != null && l != null) return `${w}–${l}`;
    const pct = rec.atsPct ?? rec.coverRate ?? null;
    if (pct != null) return `${Math.round(pct * 100)}%`;
    return null;
  } catch { return null; }
}

/* ── Sub-components ───────────────────────────────────────────────────── */

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

/* ── Main component ───────────────────────────────────────────────────── */

export default function GamePreviewSlide1({ game, data, asOf, slideNumber, slideTotal, ...rest }) {
  if (!game) {
    return (
      <SlideShell asOf={asOf} theme="single_game" brandMode="standard" slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
        <div className={styles.noGame}>Select a game to preview.</div>
      </SlideShell>
    );
  }

  // ── Team identity ──
  const awayTeam = game.awayTeam || '—';
  const homeTeam = game.homeTeam || '—';
  const awaySlug = game.awaySlug || game.awayTeamSlug || getTeamSlug(awayTeam) || null;
  const homeSlug = game.homeSlug || game.homeTeamSlug || getTeamSlug(homeTeam) || null;
  const awayObj = { name: awayTeam, slug: awaySlug };
  const homeObj = { name: homeTeam, slug: homeSlug };
  const awaySeed = getTeamSeed(awaySlug || awayTeam);
  const homeSeed = getTeamSeed(homeSlug || homeTeam);

  // ── Team metadata from registry ──
  const awayMeta = getTeamBySlug(awaySlug);
  const homeMeta = getTeamBySlug(homeSlug);
  const awayConf = game.awayConference || game.awayConf || awayMeta?.conference || null;
  const homeConf = game.homeConference || game.homeConf || homeMeta?.conference || null;

  // ── Game data ──
  const spread = game.homeSpread ?? game.spread ?? null;
  const ml = game.moneyline ?? game.ml ?? null;
  const total = game.total ?? game.overUnder ?? null;
  const gameTime = game.time || game.startTime || null;
  const network = game.network || game.broadcast || null;
  const venue = game.venue || game.location || null;

  // ── Team colors for gradient atmospherics ──
  const awayTC = getTeamColors(awaySlug);
  const homeTC = getTeamColors(homeSlug);
  const awayColor = awayTC?.primary || '#6EB3E8';
  const homeColor = homeTC?.primary || '#E86E6E';

  // ── Tournament round (seed-inferred, not just calendar) ──
  const roundLabel = inferRoundLabel(awaySeed, homeSeed);

  // ── ATS records ──
  const awayAts = getTeamAtsDisplay(awaySlug);
  const homeAts = getTeamAtsDisplay(homeSlug);

  // ── Format date / time ──
  let dateStr = null;
  let timeStr = null;
  if (gameTime) {
    try {
      const d = new Date(gameTime);
      dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) + ' PT';
    } catch { /* ignore */ }
  }

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
  } catch { /* graceful degradation */ }

  const pickEmTier = pickToTier(pickEmPick);
  const atsTier = pickToTier(atsPick);
  const totalsTier = pickToTier(totalsPick);

  return (
    <SlideShell
      asOf={asOf}
      theme="single_game"
      brandMode="standard"
      slideNumber={slideNumber}
      slideTotal={slideTotal}
      rest={rest}
    >
      {/* ── Team-color gradient overlays ── */}
      <div className={styles.gradientAway} style={{ background: `radial-gradient(ellipse at 0% 40%, ${awayColor}18 0%, transparent 55%)` }} />
      <div className={styles.gradientHome} style={{ background: `radial-gradient(ellipse at 100% 40%, ${homeColor}18 0%, transparent 55%)` }} />

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.eyebrow}>MATCHUP INTEL</div>
        {roundLabel && <div className={styles.roundBadge}>{roundLabel}</div>}
      </div>

      {/* ── Game Info Card ── */}
      <div className={styles.gameInfoCard}>
        {dateStr && <span className={styles.infoItem}>{dateStr}</span>}
        {timeStr && <><span className={styles.infoDot}>·</span><span className={styles.infoItem}>{timeStr}</span></>}
        {venue && <><span className={styles.infoDot}>·</span><span className={styles.infoItem}>{venue}</span></>}
        {network && <span className={styles.networkChip}>{network}</span>}
      </div>

      {/* ── Head-to-head zone ── */}
      <div className={styles.h2h}>
        {/* Away side */}
        <div className={styles.side}>
          <div className={styles.logoWrap}>
            <div className={styles.logoGlow} style={{ background: `radial-gradient(circle, ${awayColor}35 0%, transparent 60%)` }} />
            <TeamLogo team={awayObj} size={100} />
          </div>
          {awaySeed != null && <span className={styles.seedPill}>#{awaySeed}</span>}
          <div className={styles.teamName}>{awayTeam}</div>
          {awayConf && <div className={styles.confLabel}>{awayConf}</div>}

          {/* Profile stats */}
          <div className={styles.profileBox}>
            {awayAts && (
              <div className={styles.profileRow}>
                <span className={styles.profileKey}>ATS</span>
                <span className={styles.profileVal}>{awayAts}</span>
              </div>
            )}
          </div>
          <div className={styles.sideTag}>AWAY</div>
        </div>

        {/* Center matchup spine */}
        <div className={styles.spine}>
          <div className={styles.vsRing}>VS</div>
          <div className={styles.linesCard}>
            <div className={styles.lineRow}>
              <span className={styles.lineVal}>{fmtLine(spread)}</span>
              <span className={styles.lineLabel}>SPREAD</span>
            </div>
            <div className={styles.lineDiv} />
            <div className={styles.lineRow}>
              <span className={styles.lineVal}>{fmtLine(ml)}</span>
              <span className={styles.lineLabel}>ML</span>
            </div>
            <div className={styles.lineDiv} />
            <div className={styles.lineRow}>
              <span className={styles.lineVal}>{fmtTotal(total)}</span>
              <span className={styles.lineLabel}>TOTAL</span>
            </div>
          </div>
        </div>

        {/* Home side */}
        <div className={styles.side}>
          <div className={styles.logoWrap}>
            <div className={styles.logoGlow} style={{ background: `radial-gradient(circle, ${homeColor}35 0%, transparent 60%)` }} />
            <TeamLogo team={homeObj} size={100} />
          </div>
          {homeSeed != null && <span className={styles.seedPill}>#{homeSeed}</span>}
          <div className={styles.teamName}>{homeTeam}</div>
          {homeConf && <div className={styles.confLabel}>{homeConf}</div>}

          <div className={styles.profileBox}>
            {homeAts && (
              <div className={styles.profileRow}>
                <span className={styles.profileKey}>ATS</span>
                <span className={styles.profileVal}>{homeAts}</span>
              </div>
            )}
          </div>
          <div className={styles.sideTag}>HOME</div>
        </div>
      </div>

      {/* ── Maximus Pick ── */}
      <div className={styles.picksPanel}>
        <div className={styles.picksTitle}>MAXIMUS PICK</div>
        <div className={styles.picksCols}>
          <div className={styles.pickCell}>
            <div className={styles.pickType}>PICK EM</div>
            <div className={styles.pickVal}>{pickEmPick?.pickTeam || 'No lean'}</div>
            <ConvictionPill tier={pickEmTier} />
          </div>
          <div className={styles.pickDivider} />
          <div className={styles.pickCell}>
            <div className={styles.pickType}>ATS</div>
            <div className={styles.pickVal}>{atsPick?.pickLine || 'No lean'}</div>
            <ConvictionPill tier={atsTier} />
          </div>
          <div className={styles.pickDivider} />
          <div className={styles.pickCell}>
            <div className={styles.pickType}>O/U</div>
            <div className={styles.pickVal}>
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
