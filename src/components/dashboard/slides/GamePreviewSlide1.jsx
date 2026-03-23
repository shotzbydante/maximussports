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
function fmtTotal(v) { return v == null ? '—' : String(v); }

function pickToTier(pick) {
  if (!pick) return null;
  const c = pick.confidence ?? 0;
  if (c >= 2) return TIERS.conviction;
  if (c >= 1) return TIERS.lean;
  return TIERS.tossUp;
}

/* ── Tournament round from seeds ──────────────────────────────────────── */

const R64_PAIRS = [[1,16],[2,15],[3,14],[4,13],[5,12],[6,11],[7,10],[8,9]];

function inferRoundLabel(awaySeedVal, homeSeedVal) {
  if (awaySeedVal != null && homeSeedVal != null) {
    const lo = Math.min(awaySeedVal, homeSeedVal);
    const hi = Math.max(awaySeedVal, homeSeedVal);
    if (R64_PAIRS.some(([a, b]) => a === lo && b === hi)) return 'Round of 64';
    const phase = getTournamentPhase();
    const map = { second_round: 'Round of 32', sweet_sixteen: 'Sweet 16', elite_eight: 'Elite Eight', final_four: 'Final Four', championship: 'National Championship' };
    return map[phase] || 'Round of 32';
  }
  const phase = getTournamentPhase();
  const labels = { first_four: 'First Four', first_round: 'Round of 64', second_round: 'Round of 32', sweet_sixteen: 'Sweet 16', elite_eight: 'Elite Eight', final_four: 'Final Four', championship: 'National Championship', pre_tournament: 'NCAA Tournament' };
  return labels[phase] || null;
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

/* ── Deterministic reasoning bullets ──────────────────────────────────── */

function buildReasoningBullets(game, { spread, total, awaySeed, homeSeed, awayAts, homeAts, pickEmPick, atsPick, totalsPick }) {
  const bullets = [];
  const spreadNum = spread != null ? parseFloat(spread) : null;

  // Spread context
  if (spreadNum != null && !isNaN(spreadNum)) {
    const abs = Math.abs(spreadNum);
    if (abs <= 2) bullets.push('Market sees this as essentially a pick\'em — razor-thin edge either way.');
    else if (abs <= 5) bullets.push(`Spread of ${abs} points signals a competitive, closely matched game.`);
    else if (abs >= 10) bullets.push(`Double-digit spread indicates a significant talent disparity.`);
  }

  // Model edge
  if (atsPick?.atsEdge != null && Math.abs(atsPick.atsEdge) > 0.08) {
    const edgePct = (Math.abs(atsPick.atsEdge) * 100).toFixed(0);
    bullets.push(`Model detects a ${edgePct}% ATS edge — above our threshold for a qualified lean.`);
  } else if (pickEmPick?.edgeMag != null && pickEmPick.edgeMag > 0.06) {
    bullets.push('Model identifies a directional lean based on composite signal strength.');
  }

  // Seed mismatch context
  if (awaySeed != null && homeSeed != null) {
    const gap = Math.abs(awaySeed - homeSeed);
    if (gap >= 5) bullets.push(`${gap}-seed gap — higher seed must defend against bracket chaos potential.`);
    else if (gap <= 1) bullets.push('Near-equal seeds — tournament bracket treats this as a true toss-up.');
  }

  // ATS context
  if (awayAts && homeAts) {
    bullets.push(`ATS profiles: ${game.awayTeam?.split(' ').pop() || 'Away'} (${awayAts}) vs ${game.homeTeam?.split(' ').pop() || 'Home'} (${homeAts}).`);
  }

  // Total context
  if (totalsPick?.leanDirection && total != null) {
    const dir = totalsPick.leanDirection === 'over' ? 'Over' : 'Under';
    bullets.push(`Totals lean: ${dir} ${total} based on pace and efficiency projections.`);
  }

  return bullets.slice(0, 3);
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

  // Game data — spread is from home perspective
  const homeSpread = game.homeSpread ?? game.spread ?? null;
  const homeSpreadNum = homeSpread != null ? parseFloat(homeSpread) : null;
  const awaySpreadNum = homeSpreadNum != null && !isNaN(homeSpreadNum) ? -homeSpreadNum : null;
  const ml = game.moneyline ?? game.ml ?? null;
  const total = game.total ?? game.overUnder ?? null;
  const gameTime = game.time || game.startTime || null;
  const network = game.network || game.broadcast || null;

  // Parse both moneylines if available; ml field is often "away / home" or a single value
  let awayML = null;
  let homeML = null;
  if (typeof ml === 'string' && ml.includes('/')) {
    const parts = ml.split('/').map(s => parseFloat(s.trim()));
    if (!isNaN(parts[0])) awayML = parts[0];
    if (!isNaN(parts[1])) homeML = parts[1];
  } else if (ml != null) {
    // Single ML value — typically for the home team (or favorite)
    const n = parseFloat(ml);
    if (!isNaN(n)) {
      if (homeSpreadNum != null && homeSpreadNum < 0) { homeML = n; }
      else { awayML = n; }
    }
  }

  // Team colors
  const awayTC = getTeamColors(awaySlug);
  const homeTC = getTeamColors(homeSlug);
  const awayColor = awayTC?.primary || '#6EB3E8';
  const homeColor = homeTC?.primary || '#E8A96E';

  const roundLabel = inferRoundLabel(awaySeed, homeSeed);
  const awayAts = getTeamAtsDisplay(awaySlug);
  const homeAts = getTeamAtsDisplay(homeSlug);

  // Date/time
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
  const totalsTier = pickToTier(totalsPick);

  // Reasoning bullets
  const reasoning = buildReasoningBullets(game, {
    spread: homeSpread, total, awaySeed, homeSeed,
    awayAts, homeAts, pickEmPick, atsPick, totalsPick,
  });

  return (
    <SlideShell asOf={asOf} theme="single_game" brandMode="standard" slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      {/* Atmospheric team-color overlays */}
      <div className={styles.glowAway} style={{ background: `radial-gradient(ellipse at 5% 45%, ${awayColor}20 0%, transparent 50%)` }} />
      <div className={styles.glowHome} style={{ background: `radial-gradient(ellipse at 95% 45%, ${homeColor}20 0%, transparent 50%)` }} />

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

      {/* H2H panels */}
      <div className={styles.h2h}>
        {/* Away panel — team-colored glass */}
        <div className={styles.panel} style={{ borderColor: `${awayColor}20`, background: `linear-gradient(160deg, ${awayColor}0C 0%, transparent 60%)` }}>
          <div className={styles.logoWrap}>
            <div className={styles.logoGlow} style={{ background: `radial-gradient(circle, ${awayColor}40 0%, transparent 55%)` }} />
            <TeamLogo team={awayObj} size={100} />
          </div>
          {awaySeed != null && <span className={styles.seedPill}>#{awaySeed}</span>}
          <div className={styles.teamName}>{awayTeam}</div>
          {awayConf && <div className={styles.conf}>{awayConf}</div>}

          {/* Per-team spread + ML */}
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

          {awayAts && (
            <div className={styles.statRow}>
              <span className={styles.statKey}>ATS</span>
              <span className={styles.statVal}>{awayAts}</span>
            </div>
          )}
          <div className={styles.sideTag}>AWAY</div>
        </div>

        {/* Center VS + Total */}
        <div className={styles.center}>
          <div className={styles.vsRing}>VS</div>
          <div className={styles.totalCard}>
            <span className={styles.totalVal}>{fmtTotal(total)}</span>
            <span className={styles.totalKey}>O/U TOTAL</span>
          </div>
        </div>

        {/* Home panel */}
        <div className={styles.panel} style={{ borderColor: `${homeColor}20`, background: `linear-gradient(200deg, ${homeColor}0C 0%, transparent 60%)` }}>
          <div className={styles.logoWrap}>
            <div className={styles.logoGlow} style={{ background: `radial-gradient(circle, ${homeColor}40 0%, transparent 55%)` }} />
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

          {homeAts && (
            <div className={styles.statRow}>
              <span className={styles.statKey}>ATS</span>
              <span className={styles.statVal}>{homeAts}</span>
            </div>
          )}
          <div className={styles.sideTag}>HOME</div>
        </div>
      </div>

      {/* Maximus Pick + Reasoning */}
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
              {totalsPick?.leanDirection
                ? `${totalsPick.leanDirection === 'over' ? 'Over' : 'Under'} ${fmtTotal(total)}`
                : totalsPick?.pickLine || 'No lean'}
            </div>
            <ConvictionPill tier={totalsTier} />
          </div>
        </div>

        {/* Reasoning bullets */}
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
