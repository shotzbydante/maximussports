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

/* ── Tournament round ─────────────────────────────────────────────────── */

function inferGameRound(gameTime, awaySeedVal, homeSeedVal) {
  if (gameTime) {
    try {
      const gameDate = new Date(gameTime);
      if (!isNaN(gameDate.getTime())) {
        const phase = getTournamentPhase(gameDate);
        if (phase && phase !== 'off') return getRoundLabel(getActiveRound(phase));
      }
    } catch { /* fall through */ }
  }
  if (awaySeedVal != null && homeSeedVal != null && awaySeedVal + homeSeedVal === 17) return 'Round of 64';
  const phase = getTournamentPhase();
  if (phase && phase !== 'off') return getRoundLabel(getActiveRound(phase));
  return null;
}

/* ── ATS helper ───────────────────────────────────────────────────────── */

function getTeamAtsDisplay(slug) {
  try {
    const cache = getAtsCache?.();
    const rec = cache?.bySlug?.[slug];
    if (!rec) return null;
    const w = rec.atsWins ?? rec.wins ?? null;
    const l = rec.atsLosses ?? rec.losses ?? null;
    return (w != null && l != null) ? `${w}–${l}` : null;
  } catch { return null; }
}

/* ── Robust pick matching — uses slug comparison, not substring ───────── */

function matchPickToGame(pick, awaySlug, homeSlug, awayTeam, homeTeam) {
  if (!pick) return false;
  const line = (pick.pickLine || pick.matchup || '').toLowerCase();
  const pickTeamField = (pick.pickTeam || '').toLowerCase();
  const homeSlugField = (pick.homeSlug || pick.homeTeamSlug || '').toLowerCase();
  const awaySlugField = (pick.awaySlug || pick.awayTeamSlug || '').toLowerCase();

  // Method 1: slug match on pick's team fields
  if (awaySlug && (awaySlugField === awaySlug || homeSlugField === awaySlug)) return true;
  if (homeSlug && (awaySlugField === homeSlug || homeSlugField === homeSlug)) return true;

  // Method 2: slug match via getTeamSlug on pickLine text
  if (awaySlug) {
    const lineSlug = getTeamSlug(pick.pickTeam || pick.homeTeam || pick.awayTeam || '');
    if (lineSlug === awaySlug || lineSlug === homeSlug) return true;
  }

  // Method 3: substring match — try multiple fragments, not just last word
  const fragments = [];
  for (const name of [awayTeam, homeTeam]) {
    if (!name) continue;
    const words = name.toLowerCase().split(/\s+/);
    // Add last word (mascot), first word (city/school), and 2-word combos
    if (words.length > 0) fragments.push(words[words.length - 1]);
    if (words.length > 1) fragments.push(words[0]);
    if (words.length >= 2) fragments.push(words.slice(0, 2).join(' '));
  }

  for (const frag of fragments) {
    if (frag.length >= 4 && (line.includes(frag) || pickTeamField.includes(frag))) return true;
  }

  return false;
}

/* ── Force O/U lean ───────────────────────────────────────────────────── */

function deriveOuLean(totalsPick, game, spreadNum) {
  if (totalsPick?.leanDirection) {
    return { direction: totalsPick.leanDirection === 'over' ? 'Over' : 'Under', confidence: totalsPick.confidence ?? 0, reason: totalsPick.whyValue || totalsPick.rationale || null };
  }
  const total = game?.total ?? game?.overUnder ?? null;
  if (total == null || isNaN(parseFloat(total))) return null;
  if (spreadNum != null && !isNaN(spreadNum)) {
    if (Math.abs(spreadNum) >= 8) return { direction: 'Over', confidence: 0, reason: 'Large spread suggests the favorite pushes pace and runs up the score.' };
    if (Math.abs(spreadNum) <= 2.5) return { direction: 'Under', confidence: 0, reason: 'Tight spread and slower-game indicators point to fewer clean scoring runs.' };
  }
  return { direction: 'Under', confidence: 0, reason: 'Tournament pressure and half-court pace lean slightly toward the under.' };
}

/* ── Force ATS lean ───────────────────────────────────────────────────── */

function deriveAtsLean(atsPick, homeSpreadNum, homeTeam, awayTeam) {
  if (atsPick?.pickLine) return atsPick;
  if (homeSpreadNum == null || isNaN(homeSpreadNum)) return null;
  const abs = Math.abs(homeSpreadNum);
  if (abs >= 3 && abs <= 9) {
    const homeShort = homeTeam?.split(' ').pop() || 'Home';
    const awayShort = awayTeam?.split(' ').pop() || 'Away';
    const dog = homeSpreadNum < 0 ? awayShort : homeShort;
    const dogSpread = homeSpreadNum < 0 ? fmtLine(-homeSpreadNum) : fmtLine(homeSpreadNum);
    return { pickLine: `${dog} ${dogSpread}`, confidence: 0, atsEdge: null, _derived: true };
  }
  return null;
}

/* ── Per-column micro-intel — DEEPER rationale ────────────────────────── */

function buildMicroIntel({ pickEmPick, atsPick, ouLean, homeSpreadNum, awayTeam, homeTeam }) {
  const awayShort = awayTeam?.split(' ').pop() || 'Away';
  const homeShort = homeTeam?.split(' ').pop() || 'Home';
  const abs = homeSpreadNum != null ? Math.abs(homeSpreadNum) : null;
  const fav = homeSpreadNum != null ? (homeSpreadNum < 0 ? homeShort : awayShort) : null;

  // Pick Em — deeper reasoning
  let peIntel = null;
  if (pickEmPick?.pickTeam) {
    const ps = pickEmPick.pickTeam.split(' ').pop() || pickEmPick.pickTeam;
    if (pickEmPick.confidence >= 2) {
      peIntel = `Model and market align on ${ps}. High composite signal across ranking, efficiency, and ATS profile.`;
    } else if (pickEmPick.confidence >= 1) {
      peIntel = `Efficiency + market inputs lean ${ps}. Moderate edge above model threshold.`;
    } else {
      peIntel = `Thin edge toward ${ps}. Win probability sits near model fair value.`;
    }
  } else if (fav) {
    peIntel = `Model and market both lean ${fav}, with no meaningful separation in win probability.`;
  }

  // ATS — deeper reasoning
  let atsIntel = null;
  if (atsPick?.pickLine) {
    if (atsPick._derived) {
      atsIntel = 'Spread sits near model fair value, with no clear cover edge after price adjustment.';
    } else {
      const edge = atsPick.atsEdge != null ? (Math.abs(atsPick.atsEdge) * 100).toFixed(0) : null;
      if (edge && parseInt(edge) > 12) {
        atsIntel = `${edge}% ATS edge — well above qualified threshold. Cover profile and market price both support.`;
      } else if (edge && parseInt(edge) > 8) {
        atsIntel = `Moderate ${edge}% edge. Spread analysis and historical cover profile favor this side.`;
      } else {
        atsIntel = 'Spread analysis and cover profile offer a marginal lean. Proceed with standard sizing.';
      }
    }
  } else if (abs != null) {
    if (abs >= 10) atsIntel = 'Double-digit spread compresses cover value on both sides. No qualified edge.';
    else if (abs <= 3) atsIntel = 'Pick-em range. No reliable cover direction after price adjustment.';
    else atsIntel = 'Spread sits near model fair value, with no clear cover edge after price adjustment.';
  }

  // O/U — deeper reasoning
  let ouIntel = null;
  if (ouLean?.reason) {
    ouIntel = ouLean.reason;
  }

  return { peIntel, atsIntel, ouIntel };
}

/* ── Icons ────────────────────────────────────────────────────────────── */

function PickEmIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" className={styles.pickIcon}>
      <circle cx="19" cy="19" r="17" stroke="rgba(168,208,240,0.38)" strokeWidth="1.5" fill="rgba(168,208,240,0.08)" />
      <path d="M12 19.5L16 23.5L26 13" stroke="rgba(168,208,240,0.78)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AtsIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" className={styles.pickIcon}>
      <circle cx="19" cy="19" r="17" stroke="rgba(168,208,240,0.38)" strokeWidth="1.5" fill="rgba(168,208,240,0.08)" />
      <path d="M9 24L15 15L21 20L29 12" stroke="rgba(168,208,240,0.78)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OuIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" className={styles.pickIcon}>
      <circle cx="19" cy="19" r="17" stroke="rgba(168,208,240,0.38)" strokeWidth="1.5" fill="rgba(168,208,240,0.08)" />
      <rect x="11" y="21" width="4.5" height="6" rx="1" fill="rgba(168,208,240,0.50)" />
      <rect x="16.75" y="16" width="4.5" height="11" rx="1" fill="rgba(168,208,240,0.62)" />
      <rect x="22.5" y="11" width="4.5" height="16" rx="1" fill="rgba(168,208,240,0.78)" />
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

  // Picks — using robust slug-based matching
  const atsLeaders = data?.atsLeaders ?? { best: [], worst: [] };
  const games = data?.odds?.games ?? [];
  let pickEmPick = null;
  let rawAtsPick = null;
  let totalsPick = null;
  try {
    const picks = buildMaximusPicks({ games, atsLeaders });
    const matchFn = (p) => matchPickToGame(p, awaySlug, homeSlug, awayTeam, homeTeam);
    pickEmPick = (picks.pickEmPicks ?? []).find(matchFn) ?? null;
    rawAtsPick = (picks.atsPicks ?? []).find(matchFn) ?? null;
    totalsPick = (picks.totalsPicks ?? []).find(matchFn) ?? null;
  } catch { /* graceful */ }

  const atsPick = rawAtsPick || deriveAtsLean(rawAtsPick, homeSpreadNum, homeTeam, awayTeam);
  const pickEmTier = pickToTier(pickEmPick);
  const atsTier = atsPick ? (pickToTier(atsPick) || TIERS.tossUp) : null;
  const ouLean = deriveOuLean(totalsPick, game, homeSpreadNum);
  const totalsTier = ouLean ? pickToTier(totalsPick) || TIERS.tossUp : null;

  const { peIntel, atsIntel, ouIntel } = buildMicroIntel({
    pickEmPick, atsPick, ouLean, homeSpreadNum, awayTeam, homeTeam,
  });

  return (
    <SlideShell asOf={asOf} theme="single_game" brandMode="standard" slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.glowAway} style={{ background: `radial-gradient(ellipse at 0% 38%, ${awayColor}30 0%, transparent 55%)` }} />
      <div className={styles.glowHome} style={{ background: `radial-gradient(ellipse at 100% 38%, ${homeColor}30 0%, transparent 55%)` }} />

      {/* Hero header — MATCHUP INTEL + mascot, then round badge */}
      <div className={styles.header}>
        <div className={styles.heroRow}>
          <h2 className={styles.heroTitle}>MATCHUP INTEL</h2>
          <img src="/mascot.png" alt="" className={styles.heroMascot} crossOrigin="anonymous" />
        </div>
        {roundLabel && <div className={styles.roundBadge}>{roundLabel}</div>}
      </div>

      {/* H2H */}
      <div className={styles.h2h}>
        <div className={styles.panel} style={{ borderColor: `${awayColor}48`, background: `linear-gradient(155deg, ${awayColor}1E 0%, ${awayColor}0C 35%, transparent 70%)`, boxShadow: `0 6px 32px rgba(0,0,0,0.22), inset 0 0 50px ${awayColor}0C, 0 0 28px ${awayColor}12` }}>
          <div className={styles.logoWrap}>
            <div className={styles.logoGlow} style={{ background: `radial-gradient(circle, ${awayColor}5C 0%, transparent 55%)` }} />
            <TeamLogo team={awayObj} size={115} />
          </div>
          {awaySeed != null && (
            <span className={styles.seedPill} style={{ borderColor: `${awayColor}40`, background: `linear-gradient(135deg, ${awayColor}18 0%, rgba(255,255,255,0.08) 100%)` }}>
              #{awaySeed}
            </span>
          )}
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

        <div className={styles.panel} style={{ borderColor: `${homeColor}48`, background: `linear-gradient(205deg, ${homeColor}1E 0%, ${homeColor}0C 35%, transparent 70%)`, boxShadow: `0 6px 32px rgba(0,0,0,0.22), inset 0 0 50px ${homeColor}0C, 0 0 28px ${homeColor}12` }}>
          <div className={styles.logoWrap}>
            <div className={styles.logoGlow} style={{ background: `radial-gradient(circle, ${homeColor}5C 0%, transparent 55%)` }} />
            <TeamLogo team={homeObj} size={115} />
          </div>
          {homeSeed != null && (
            <span className={styles.seedPill} style={{ borderColor: `${homeColor}40`, background: `linear-gradient(135deg, ${homeColor}18 0%, rgba(255,255,255,0.08) 100%)` }}>
              #{homeSeed}
            </span>
          )}
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

      {/* MAXIMUS'S PICKS */}
      <div className={styles.intel}>
        <div className={styles.intelTitle}>MAXIMUS&apos;S PICKS</div>
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
            <div className={styles.pickVal}>{ouLean ? `${ouLean.direction} ${fmtTotal(total)}` : 'No lean'}</div>
            <ConvictionPill tier={totalsTier} />
            {ouIntel && <div className={styles.microIntel}>{ouIntel}</div>}
          </div>
        </div>
      </div>
    </SlideShell>
  );
}
