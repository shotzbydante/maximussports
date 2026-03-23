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

/* ── Tournament round — uses GAME DATE ────────────────────────────────── */

function inferGameRound(gameTime, awaySeedVal, homeSeedVal) {
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
  if (awaySeedVal != null && homeSeedVal != null) {
    const lo = Math.min(awaySeedVal, homeSeedVal);
    const hi = Math.max(awaySeedVal, homeSeedVal);
    if (lo + hi === 17) return 'Round of 64';
  }
  const phase = getTournamentPhase();
  if (phase && phase !== 'off') return getRoundLabel(getActiveRound(phase));
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

/* ── Force O/U lean ───────────────────────────────────────────────────── */

function deriveOuLean(totalsPick, game, spreadNum) {
  if (totalsPick?.leanDirection) {
    return {
      direction: totalsPick.leanDirection === 'over' ? 'Over' : 'Under',
      confidence: totalsPick.confidence ?? 0,
      reason: totalsPick.whyValue || totalsPick.rationale || null,
    };
  }
  const total = game?.total ?? game?.overUnder ?? null;
  if (total == null) return null;
  if (isNaN(parseFloat(total))) return null;

  if (spreadNum != null && !isNaN(spreadNum)) {
    const abs = Math.abs(spreadNum);
    if (abs >= 8) return { direction: 'Over', confidence: 0, reason: 'Large spread suggests the favorite pushes pace.' };
    if (abs <= 2.5) return { direction: 'Under', confidence: 0, reason: 'Tight spread signals a grinding, defensive game.' };
  }
  return { direction: 'Under', confidence: 0, reason: 'Tournament pace and pressure lean toward the under.' };
}

/* ── Force ATS lean — derive when model pick missing ──────────────────── */

function deriveAtsLean(atsPick, game, homeSpreadNum, homeTeam, awayTeam) {
  if (atsPick?.pickLine) return atsPick;
  // If spread exists, derive a lean from spread magnitude
  if (homeSpreadNum == null || isNaN(homeSpreadNum)) return null;
  const abs = Math.abs(homeSpreadNum);
  const homeShort = homeTeam?.split(' ').pop() || 'Home';
  const awayShort = awayTeam?.split(' ').pop() || 'Away';
  // Favor the underdog in tournament play for mid-range spreads
  if (abs >= 3 && abs <= 9) {
    const dog = homeSpreadNum < 0 ? awayShort : homeShort;
    const dogSpread = homeSpreadNum < 0 ? fmtLine(-homeSpreadNum) : fmtLine(homeSpreadNum);
    return { pickLine: `${dog} ${dogSpread}`, confidence: 0, atsEdge: null, _derived: true };
  }
  return null;
}

/* ── Per-column micro-intel ───────────────────────────────────────────── */

function buildMicroIntel({ pickEmPick, atsPick, ouLean, homeSpreadNum, awayTeam, homeTeam }) {
  const awayShort = awayTeam?.split(' ').pop() || 'Away';
  const homeShort = homeTeam?.split(' ').pop() || 'Home';

  // Pick Em
  let peIntel = null;
  if (pickEmPick?.pickTeam) {
    const pickShort = pickEmPick.pickTeam.split(' ').pop() || pickEmPick.pickTeam;
    if (pickEmPick.confidence >= 2) peIntel = `Strong composite signal favors ${pickShort}.`;
    else if (pickEmPick.confidence >= 1) peIntel = `Efficiency + market inputs lean ${pickShort}.`;
    else peIntel = `Thin edge toward ${pickShort}. Proceed cautiously.`;
  } else if (homeSpreadNum != null) {
    const fav = homeSpreadNum < 0 ? homeShort : awayShort;
    peIntel = `${fav} favored by market. No model separation.`;
  }

  // ATS
  let atsIntel = null;
  if (atsPick?.pickLine) {
    const edge = atsPick.atsEdge != null ? (Math.abs(atsPick.atsEdge) * 100).toFixed(0) : null;
    if (atsPick._derived) {
      atsIntel = 'Tournament underdog cover tendency. Low-conviction lean.';
    } else if (edge && parseInt(edge) > 10) {
      atsIntel = `${edge}% model edge vs market number.`;
    } else {
      atsIntel = 'Spread analysis and cover profile support this lean.';
    }
  } else if (homeSpreadNum != null) {
    const abs = Math.abs(homeSpreadNum);
    if (abs >= 10) atsIntel = 'Double-digit spread — hard to cover either side.';
    else if (abs <= 3) atsIntel = 'Pick-em range. No reliable cover direction.';
    else atsIntel = 'Mid-range spread. Insufficient edge for a qualified lean.';
  }

  // O/U
  let ouIntel = ouLean?.reason || null;

  return { peIntel, atsIntel, ouIntel };
}

/* ── Icons ────────────────────────────────────────────────────────────── */

function PickEmIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className={styles.pickIcon}>
      <circle cx="14" cy="14" r="12" stroke="rgba(168,208,240,0.30)" strokeWidth="1.5" fill="rgba(168,208,240,0.06)" />
      <path d="M9 14.5L12.5 18L19 11" stroke="rgba(168,208,240,0.65)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AtsIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className={styles.pickIcon}>
      <circle cx="14" cy="14" r="12" stroke="rgba(168,208,240,0.30)" strokeWidth="1.5" fill="rgba(168,208,240,0.06)" />
      <path d="M8 17L12 11L16 15L20 9" stroke="rgba(168,208,240,0.65)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OuIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className={styles.pickIcon}>
      <circle cx="14" cy="14" r="12" stroke="rgba(168,208,240,0.30)" strokeWidth="1.5" fill="rgba(168,208,240,0.06)" />
      <rect x="9" y="16" width="3" height="4" rx="0.5" fill="rgba(168,208,240,0.45)" />
      <rect x="12.5" y="12" width="3" height="8" rx="0.5" fill="rgba(168,208,240,0.55)" />
      <rect x="16" y="9" width="3" height="11" rx="0.5" fill="rgba(168,208,240,0.65)" />
    </svg>
  );
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

  const roundLabel = inferGameRound(gameTime, awaySeed, homeSeed);
  const awayAts = getTeamAtsDisplay(awaySlug);
  const homeAts = getTeamAtsDisplay(homeSlug);

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
  let rawAtsPick = null;
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
    rawAtsPick = (picks.atsPicks ?? []).find(matchFn) ?? null;
    totalsPick = (picks.totalsPicks ?? []).find(matchFn) ?? null;
  } catch { /* graceful */ }

  // Force ATS lean
  const atsPick = rawAtsPick || deriveAtsLean(rawAtsPick, game, homeSpreadNum, homeTeam, awayTeam);

  const pickEmTier = pickToTier(pickEmPick);
  const atsTier = atsPick ? (pickToTier(atsPick) || TIERS.tossUp) : null;
  const ouLean = deriveOuLean(totalsPick, game, homeSpreadNum);
  const totalsTier = ouLean ? pickToTier(totalsPick) || TIERS.tossUp : null;

  // Per-column micro-intel
  const { peIntel, atsIntel, ouIntel } = buildMicroIntel({
    pickEmPick, atsPick, ouLean, homeSpreadNum, awayTeam, homeTeam,
  });

  return (
    <SlideShell asOf={asOf} theme="single_game" brandMode="standard" slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      {/* Atmospheric overlays */}
      <div className={styles.glowAway} style={{ background: `radial-gradient(ellipse at 0% 38%, ${awayColor}30 0%, transparent 55%)` }} />
      <div className={styles.glowHome} style={{ background: `radial-gradient(ellipse at 100% 38%, ${homeColor}30 0%, transparent 55%)` }} />

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
        <div className={styles.panel} style={{ borderColor: `${awayColor}45`, background: `linear-gradient(155deg, ${awayColor}1C 0%, ${awayColor}0C 35%, transparent 70%)`, boxShadow: `0 6px 32px rgba(0,0,0,0.22), inset 0 0 50px ${awayColor}0C, 0 0 24px ${awayColor}10` }}>
          <div className={styles.logoWrap}>
            <div className={styles.logoGlow} style={{ background: `radial-gradient(circle, ${awayColor}58 0%, transparent 55%)` }} />
            <TeamLogo team={awayObj} size={115} />
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

        <div className={styles.center}>
          <div className={styles.vsRing}>VS</div>
          <div className={styles.totalCard}>
            <span className={styles.totalVal}>{fmtTotal(total)}</span>
            <span className={styles.totalKey}>O/U TOTAL</span>
          </div>
        </div>

        <div className={styles.panel} style={{ borderColor: `${homeColor}45`, background: `linear-gradient(205deg, ${homeColor}1C 0%, ${homeColor}0C 35%, transparent 70%)`, boxShadow: `0 6px 32px rgba(0,0,0,0.22), inset 0 0 50px ${homeColor}0C, 0 0 24px ${homeColor}10` }}>
          <div className={styles.logoWrap}>
            <div className={styles.logoGlow} style={{ background: `radial-gradient(circle, ${homeColor}58 0%, transparent 55%)` }} />
            <TeamLogo team={homeObj} size={115} />
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

      {/* Intel section — per-column micro-intel */}
      <div className={styles.intel}>
        <div className={styles.intelTitle}>MAXIMUS&apos;S PICK</div>
        <div className={styles.picksCols}>
          <div className={styles.pickCell}>
            <PickEmIcon />
            <div className={styles.pickType}>PICK EM</div>
            <div className={styles.pickVal}>{pickEmPick?.pickTeam || 'No lean'}</div>
            <ConvictionPill tier={pickEmTier} />
            {peIntel && <div className={styles.microIntel}>{peIntel}</div>}
          </div>
          <div className={styles.pickDiv} />
          <div className={styles.pickCell}>
            <AtsIcon />
            <div className={styles.pickType}>ATS</div>
            <div className={styles.pickVal}>{atsPick?.pickLine || 'No lean'}</div>
            <ConvictionPill tier={atsTier} />
            {atsIntel && <div className={styles.microIntel}>{atsIntel}</div>}
          </div>
          <div className={styles.pickDiv} />
          <div className={styles.pickCell}>
            <OuIcon />
            <div className={styles.pickType}>O/U</div>
            <div className={styles.pickVal}>
              {ouLean ? `${ouLean.direction} ${fmtTotal(total)}` : 'No lean'}
            </div>
            <ConvictionPill tier={totalsTier} />
            {ouIntel && <div className={styles.microIntel}>{ouIntel}</div>}
          </div>
        </div>
      </div>
    </SlideShell>
  );
}
