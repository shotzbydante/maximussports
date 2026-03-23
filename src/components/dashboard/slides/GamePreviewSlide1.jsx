import SlideShell from './SlideShell';
import TeamLogo from '../../shared/TeamLogo';
import { getTeamSlug } from '../../../utils/teamSlug';
import { getTeamSeed, getTournamentPhase, getActiveRound, getRoundLabel } from '../../../utils/tournamentHelpers';
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
function fmtTotal(v) { return v == null ? '—' : String(v); }

function pickToTier(pick) {
  if (!pick) return null;
  const c = pick.confidence ?? 0;
  if (c >= 2) return TIERS.conviction;
  if (c >= 1) return TIERS.lean;
  return TIERS.tossUp;
}

/* ── Tournament round — uses GAME DATE, not today's date ──────────────── */

function inferGameRound(gameTime, awaySeedVal, homeSeedVal) {
  // Priority 1: Use the game's actual date to determine tournament phase
  if (gameTime) {
    try {
      const gameDate = new Date(gameTime);
      if (!isNaN(gameDate.getTime())) {
        const phase = getTournamentPhase(gameDate);
        if (phase && phase !== 'off') {
          const round = getActiveRound(phase);
          return getRoundLabel(round);
        }
      }
    } catch { /* fall through */ }
  }

  // Priority 2: Seed pairing as sanity check
  if (awaySeedVal != null && homeSeedVal != null) {
    const lo = Math.min(awaySeedVal, homeSeedVal);
    const hi = Math.max(awaySeedVal, homeSeedVal);
    if (lo + hi === 17) return 'Round of 64';
  }

  // Priority 3: Today's calendar phase
  const phase = getTournamentPhase();
  if (phase && phase !== 'off') {
    const round = getActiveRound(phase);
    return getRoundLabel(round);
  }

  return null;
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
    return null;
  } catch { return null; }
}

/* ── Force O/U lean — generate even at low conviction ─────────────────── */

function deriveOuLean(totalsPick, game, spreadNum) {
  // If the model already has a lean, use it
  if (totalsPick?.leanDirection) {
    return {
      direction: totalsPick.leanDirection === 'over' ? 'Over' : 'Under',
      confidence: totalsPick.confidence ?? 0,
      reason: totalsPick.whyValue || totalsPick.rationale || null,
    };
  }

  // Force derive: use spread magnitude as a heuristic for total lean
  const total = game?.total ?? game?.overUnder ?? null;
  if (total == null) return null;
  const totalNum = parseFloat(total);
  if (isNaN(totalNum)) return null;

  // Heuristic: large spreads correlate with higher-scoring games (favorites run up)
  // Small spreads suggest competitive, potentially lower-scoring games
  if (spreadNum != null && !isNaN(spreadNum)) {
    const absSpread = Math.abs(spreadNum);
    if (absSpread >= 8) {
      return { direction: 'Over', confidence: 0, reason: 'Large spread suggests the favorite may push pace.' };
    }
    if (absSpread <= 2.5) {
      return { direction: 'Under', confidence: 0, reason: 'Tight spread signals a grind-it-out game.' };
    }
  }

  return { direction: 'Under', confidence: 0, reason: 'Default lean toward Under in tournament play.' };
}

/* ── Reasoning engine — matchup-specific bullets ──────────────────────── */

function buildMatchupReasoning({ spreadNum, awaySeed, homeSeed, awayTeam, homeTeam, pickEmPick, atsPick, ouLean }) {
  const bullets = [];
  const awayShort = awayTeam?.split(' ').pop() || 'Away';
  const homeShort = homeTeam?.split(' ').pop() || 'Home';

  // Pick Em reasoning
  if (pickEmPick?.pickTeam) {
    const pickShort = pickEmPick.pickTeam.split(' ').pop() || pickEmPick.pickTeam;
    if (pickEmPick.confidence >= 2) {
      bullets.push(`Pick Em: Model favors ${pickShort} straight up with high composite signal strength.`);
    } else if (pickEmPick.confidence >= 1) {
      bullets.push(`Pick Em: Directional lean toward ${pickShort} based on efficiency and market inputs.`);
    } else {
      bullets.push(`Pick Em: Slight lean toward ${pickShort} — thin edge, proceed cautiously.`);
    }
  } else if (spreadNum != null) {
    const fav = spreadNum < 0 ? homeShort : awayShort;
    bullets.push(`Pick Em: ${fav} is the market favorite but model sees no clear edge beyond the line.`);
  }

  // ATS reasoning
  if (atsPick?.pickLine) {
    const edge = atsPick.atsEdge != null ? (Math.abs(atsPick.atsEdge) * 100).toFixed(0) : null;
    if (edge && parseInt(edge) > 10) {
      bullets.push(`ATS: ${atsPick.pickLine} — ${edge}% model edge vs market number.`);
    } else {
      bullets.push(`ATS: Lean ${atsPick.pickLine} based on spread analysis and cover profile.`);
    }
  } else if (spreadNum != null) {
    const abs = Math.abs(spreadNum);
    if (abs >= 10) bullets.push(`ATS: Double-digit spread makes covering difficult — no qualified ATS lean.`);
    else if (abs <= 3) bullets.push(`ATS: Tight line — model sees no reliable cover direction.`);
    else bullets.push(`ATS: Mid-range spread but insufficient edge for a qualified ATS lean.`);
  }

  // O/U reasoning
  if (ouLean?.reason) {
    bullets.push(`O/U: ${ouLean.reason}`);
  }

  // Seed gap context (tournament flavor)
  if (awaySeed != null && homeSeed != null) {
    const gap = Math.abs(awaySeed - homeSeed);
    if (gap >= 5) {
      const underdog = awaySeed > homeSeed ? awayShort : homeShort;
      bullets.push(`Tournament edge: ${gap}-seed gap — ${underdog} needs a ceiling game to survive.`);
    }
  }

  return bullets.slice(0, 4);
}

/* ── Sub-components ───────────────────────────────────────────────────── */

function ConvictionPill({ tier }) {
  if (!tier) return <span className={styles.convNone}>—</span>;
  return (
    <span className={styles.convPill} style={{ color: tier.igColor.text, background: tier.igColor.bg, border: `1px solid ${tier.igColor.border}` }}>
      {tier.icon} {tier.label}
    </span>
  );
}

/* ── Main ─────────────────────────────────────────────────────────────── */

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

  const awayMeta = getTeamBySlug(awaySlug);
  const homeMeta = getTeamBySlug(homeSlug);
  const awayConf = game.awayConference || game.awayConf || awayMeta?.conference || null;
  const homeConf = game.homeConference || game.homeConf || homeMeta?.conference || null;

  const homeSpread = game.homeSpread ?? game.spread ?? null;
  const homeSpreadNum = homeSpread != null ? parseFloat(homeSpread) : null;
  const awaySpreadNum = homeSpreadNum != null && !isNaN(homeSpreadNum) ? -homeSpreadNum : null;
  const ml = game.moneyline ?? game.ml ?? null;
  const total = game.total ?? game.overUnder ?? null;
  const gameTime = game.time || game.startTime || game.commenceTime || null;
  const network = game.network || game.broadcast || null;

  // Parse both moneylines
  let awayML = null;
  let homeML = null;
  if (typeof ml === 'string' && ml.includes('/')) {
    const parts = ml.split('/').map(s => parseFloat(s.trim()));
    if (!isNaN(parts[0])) awayML = parts[0];
    if (!isNaN(parts[1])) homeML = parts[1];
  } else if (ml != null) {
    const n = parseFloat(ml);
    if (!isNaN(n)) {
      if (homeSpreadNum != null && homeSpreadNum < 0) homeML = n;
      else awayML = n;
    }
  }

  const awayTC = getTeamColors(awaySlug);
  const homeTC = getTeamColors(homeSlug);
  const awayColor = awayTC?.primary || '#6EB3E8';
  const homeColor = homeTC?.primary || '#E8A96E';

  // Tournament round — GAME DATE AWARE
  const roundLabel = inferGameRound(gameTime, awaySeed, homeSeed);

  const awayAts = getTeamAtsDisplay(awaySlug);
  const homeAts = getTeamAtsDisplay(homeSlug);

  // Date/time formatting
  let dateStr = null;
  let timeStr = null;
  if (gameTime) {
    try {
      const d = new Date(gameTime);
      dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) + ' PT';
    } catch { /* ignore */ }
  }

  // Picks
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };
  const games = data?.odds?.games ?? [];
  let pickEmPick = null;
  let atsPick = null;
  let totalsPick = null;
  try {
    const picks = buildMaximusPicks({ games, atsLeaders });
    const matchFn = (p) => {
      const line = (p.pickLine || p.matchup || '').toLowerCase();
      const aw = (awayTeam || '').toLowerCase().split(' ').pop() || '';
      const hm = (homeTeam || '').toLowerCase().split(' ').pop() || '';
      return (aw && line.includes(aw)) || (hm && line.includes(hm));
    };
    pickEmPick = (picks.pickEmPicks ?? []).find(matchFn) ?? null;
    atsPick = (picks.atsPicks ?? []).find(matchFn) ?? null;
    totalsPick = (picks.totalsPicks ?? []).find(matchFn) ?? null;
  } catch { /* graceful */ }

  const pickEmTier = pickToTier(pickEmPick);
  const atsTier = pickToTier(atsPick);

  // Force O/U lean
  const ouLean = deriveOuLean(totalsPick, game, homeSpreadNum);
  const totalsTier = ouLean ? pickToTier(totalsPick) || TIERS.tossUp : null;

  // Build reasoning
  const reasoning = buildMatchupReasoning({
    spreadNum: homeSpreadNum, awaySeed, homeSeed, awayTeam, homeTeam,
    pickEmPick, atsPick, ouLean,
  });

  return (
    <SlideShell asOf={asOf} theme="single_game" brandMode="standard" slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      {/* Atmospheric team-color overlays */}
      <div className={styles.glowAway} style={{ background: `radial-gradient(ellipse at 0% 42%, ${awayColor}22 0%, transparent 50%)` }} />
      <div className={styles.glowHome} style={{ background: `radial-gradient(ellipse at 100% 42%, ${homeColor}22 0%, transparent 50%)` }} />

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.eyebrow}>MATCHUP INTEL</div>
        {roundLabel && <div className={styles.roundBadge}>{roundLabel}</div>}
        <div className={styles.metaRow}>
          {dateStr && <span className={styles.metaItem}>{dateStr}</span>}
          {timeStr && <><span className={styles.metaDot}>·</span><span className={styles.metaItem}>{timeStr}</span></>}
          {network && <span className={styles.netChip}>{network}</span>}
        </div>
      </div>

      {/* H2H */}
      <div className={styles.h2h}>
        {/* Away */}
        <div className={styles.panel} style={{ borderColor: `${awayColor}22`, background: `linear-gradient(160deg, ${awayColor}0D 0%, transparent 55%)` }}>
          <div className={styles.logoWrap}>
            <div className={styles.logoGlow} style={{ background: `radial-gradient(circle, ${awayColor}45 0%, transparent 55%)` }} />
            <TeamLogo team={awayObj} size={100} />
          </div>
          {awaySeed != null && <span className={styles.seedPill}>#{awaySeed}</span>}
          <div className={styles.teamName}>{awayTeam}</div>
          {awayConf && <div className={styles.conf}>{awayConf}</div>}
          <div className={styles.teamLine}>
            <div className={styles.teamLineItem}>
              <span className={styles.teamLineVal}>{awaySpreadNum != null ? fmtLine(awaySpreadNum) : '—'}</span>
              <span className={styles.teamLineKey}>SPREAD</span>
            </div>
            {awayML != null && (
              <div className={styles.teamLineItem}>
                <span className={styles.teamLineVal}>{fmtLine(awayML)}</span>
                <span className={styles.teamLineKey}>ML</span>
              </div>
            )}
          </div>
          {awayAts && <div className={styles.statRow}><span className={styles.statKey}>ATS</span><span className={styles.statVal}>{awayAts}</span></div>}
          <div className={styles.sideTag}>AWAY</div>
        </div>

        {/* Center */}
        <div className={styles.center}>
          <div className={styles.vsRing}>VS</div>
          <div className={styles.totalCard}>
            <span className={styles.totalVal}>{fmtTotal(total)}</span>
            <span className={styles.totalKey}>O/U TOTAL</span>
          </div>
        </div>

        {/* Home */}
        <div className={styles.panel} style={{ borderColor: `${homeColor}22`, background: `linear-gradient(200deg, ${homeColor}0D 0%, transparent 55%)` }}>
          <div className={styles.logoWrap}>
            <div className={styles.logoGlow} style={{ background: `radial-gradient(circle, ${homeColor}45 0%, transparent 55%)` }} />
            <TeamLogo team={homeObj} size={100} />
          </div>
          {homeSeed != null && <span className={styles.seedPill}>#{homeSeed}</span>}
          <div className={styles.teamName}>{homeTeam}</div>
          {homeConf && <div className={styles.conf}>{homeConf}</div>}
          <div className={styles.teamLine}>
            <div className={styles.teamLineItem}>
              <span className={styles.teamLineVal}>{homeSpreadNum != null ? fmtLine(homeSpreadNum) : '—'}</span>
              <span className={styles.teamLineKey}>SPREAD</span>
            </div>
            {homeML != null && (
              <div className={styles.teamLineItem}>
                <span className={styles.teamLineVal}>{fmtLine(homeML)}</span>
                <span className={styles.teamLineKey}>ML</span>
              </div>
            )}
          </div>
          {homeAts && <div className={styles.statRow}><span className={styles.statKey}>ATS</span><span className={styles.statVal}>{homeAts}</span></div>}
          <div className={styles.sideTag}>HOME</div>
        </div>
      </div>

      {/* Intel section */}
      <div className={styles.intel}>
        <div className={styles.intelTitle}>MAXIMUS PICK</div>
        <div className={styles.picksCols}>
          <div className={styles.pickCell}>
            <div className={styles.pickType}>PICK EM</div>
            <div className={styles.pickVal}>{pickEmPick?.pickTeam || 'No lean'}</div>
            <ConvictionPill tier={pickEmTier} />
          </div>
          <div className={styles.pickDiv} />
          <div className={styles.pickCell}>
            <div className={styles.pickType}>ATS</div>
            <div className={styles.pickVal}>{atsPick?.pickLine || 'No lean'}</div>
            <ConvictionPill tier={atsTier} />
          </div>
          <div className={styles.pickDiv} />
          <div className={styles.pickCell}>
            <div className={styles.pickType}>O/U</div>
            <div className={styles.pickVal}>
              {ouLean ? `${ouLean.direction} ${fmtTotal(total)}` : 'No lean'}
            </div>
            <ConvictionPill tier={totalsTier} />
          </div>
        </div>

        {reasoning.length > 0 && (
          <div className={styles.reasoning}>
            {reasoning.map((b, i) => (
              <div key={i} className={styles.reasonRow}>
                <span className={styles.reasonBullet}>→</span>
                <span className={styles.reasonText}>{b}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </SlideShell>
  );
}
