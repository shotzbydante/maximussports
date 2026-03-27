import SlideShell from './SlideShell';
import { getTeamSlug } from '../../../utils/teamSlug';
import { getTeamSeed, getTournamentPhase, getActiveRound, getRoundLabel } from '../../../utils/tournamentHelpers';
import { getTeamColors } from '../../../utils/teamColors';
import { getTeamBySlug } from '../../../data/teams';
import { getEspnLogoUrl } from '../../../utils/espnTeamLogos';
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

/* ── Export-safe logo URL ─────────────────────────────────────────────── */

function getExportSafeLogoUrl(slug) {
  if (!slug) return null;
  const espnUrl = getEspnLogoUrl(slug);
  if (espnUrl) {
    // Use ESPN combiner for CORS-safe export + consistent sizing
    return espnUrl.replace(
      'https://a.espncdn.com/i/teamlogos/ncaa/500/',
      'https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/'
    ) + '&h=150&w=150';
  }
  return `/logos/${slug}.png`;
}

/* ── STRICT pick matching — prevents Michigan/Michigan State collisions ── */

function matchPickToGame(pick, awaySlug, homeSlug, awayTeam, homeTeam) {
  if (!pick) return false;

  // Resolve the pick's team identity to a canonical slug
  const pickSlug = getTeamSlug(pick.pickTeam || '') || getTeamSlug(pick.homeTeam || '') || getTeamSlug(pick.awayTeam || '');

  // Method 1: Direct slug comparison (most reliable)
  const homeSlugField = (pick.homeSlug || pick.homeTeamSlug || '').toLowerCase();
  const awaySlugField = (pick.awaySlug || pick.awayTeamSlug || '').toLowerCase();
  if (awaySlug && (awaySlugField === awaySlug || homeSlugField === awaySlug)) return true;
  if (homeSlug && (awaySlugField === homeSlug || homeSlugField === homeSlug)) return true;

  // Method 2: Canonical slug from pick's team name
  if (pickSlug && (pickSlug === awaySlug || pickSlug === homeSlug)) return true;

  // Method 3: Matchup field slug comparison
  const matchupStr = (pick.matchup || '').toLowerCase();
  if (matchupStr && awaySlug && homeSlug) {
    const matchupSlugs = matchupStr.split(/\s+(?:@|vs\.?|v)\s+/i).map(s => getTeamSlug(s.trim()));
    if (matchupSlugs.some(s => s === awaySlug) && matchupSlugs.some(s => s === homeSlug)) return true;
  }

  // Method 4: STRICT name matching — mascot only (last word, 5+ chars to avoid collisions)
  // This avoids "michigan" matching both Michigan and Michigan State
  const line = (pick.pickLine || pick.matchup || '').toLowerCase();
  const pickTeamField = (pick.pickTeam || '').toLowerCase();
  for (const name of [awayTeam, homeTeam]) {
    if (!name) continue;
    const words = name.toLowerCase().split(/\s+/);
    // Only use mascot (last word) if it's 5+ chars and distinct
    const mascot = words.length > 1 ? words[words.length - 1] : null;
    if (mascot && mascot.length >= 5 && (line.includes(mascot) || pickTeamField.includes(mascot))) return true;
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

/* ── Force Pick 'Em lean — always take a side when spread exists ────── */

function derivePickEmLean(pickEmPick, homeSpreadNum, homeTeam, awayTeam, homeML, awayML) {
  if (pickEmPick?.pickTeam) return pickEmPick; // model already picked
  if (homeSpreadNum == null || isNaN(homeSpreadNum)) return null;
  // Favor the team the spread favors (negative = favored)
  const isFav = homeSpreadNum < 0;
  const pickTeam = isFav ? homeTeam : awayTeam;
  const pickML = isFav ? homeML : awayML;
  return { pickTeam, pickLine: pickTeam, confidence: 0, _derived: true, _ml: pickML };
}

/* ── Force ATS lean ───────────────────────────────────────────────────── */

function deriveAtsLean(atsPick, homeSpreadNum, homeTeam, awayTeam) {
  if (atsPick?.pickLine) return atsPick;
  if (homeSpreadNum == null || isNaN(homeSpreadNum)) return null;
  const abs = Math.abs(homeSpreadNum);
  if (abs >= 2 && abs <= 12) {
    const homeShort = homeTeam?.split(' ').pop() || 'Home';
    const awayShort = awayTeam?.split(' ').pop() || 'Away';
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
  const fav = homeSpreadNum != null ? (homeSpreadNum < 0 ? homeShort : awayShort) : null;

  let peIntel = null;
  if (pickEmPick?.pickTeam) {
    const ps = pickEmPick.pickTeam.split(' ').pop() || pickEmPick.pickTeam;
    if (pickEmPick.confidence >= 2) peIntel = `Model and market align on ${ps}. High composite signal across ranking, efficiency, and ATS profile.`;
    else if (pickEmPick.confidence >= 1) peIntel = `Efficiency + market inputs lean ${ps}. Moderate edge above model threshold.`;
    else peIntel = `Thin edge toward ${ps}. Win probability sits near model fair value.`;
  } else if (fav) {
    peIntel = `Model and market both lean ${fav}, with no meaningful separation in win probability.`;
  }

  let atsIntel = null;
  if (atsPick?.pickLine) {
    if (atsPick._derived) atsIntel = 'Spread sits near model fair value. No clear cover edge after price adjustment.';
    else {
      const edge = atsPick.atsEdge != null ? (Math.abs(atsPick.atsEdge) * 100).toFixed(0) : null;
      if (edge && parseInt(edge) > 12) atsIntel = `${edge}% ATS edge — well above qualified threshold. Cover profile and market price both support.`;
      else if (edge && parseInt(edge) > 8) atsIntel = `Moderate ${edge}% edge. Spread analysis and historical cover profile favor this side.`;
      else atsIntel = 'Spread analysis and cover profile offer a marginal lean. Proceed with standard sizing.';
    }
  } else if (homeSpreadNum != null) {
    const abs = Math.abs(homeSpreadNum);
    if (abs >= 10) atsIntel = 'Double-digit spread compresses cover value on both sides. No qualified edge.';
    else if (abs <= 2) atsIntel = 'Pick-em range. No reliable cover direction after price adjustment.';
    else atsIntel = 'Spread sits near model fair value, with no clear cover edge after price adjustment.';
  }

  return { peIntel, atsIntel, ouIntel: ouLean?.reason || null };
}

/* ── Icons ────────────────────────────────────────────────────────────── */

function PickEmIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className={styles.pickIcon}>
      <circle cx="20" cy="20" r="18" stroke="rgba(110,179,232,0.40)" strokeWidth="1.5" fill="rgba(110,179,232,0.08)" />
      <path d="M12 20.5L17 25.5L28 14" stroke="rgba(110,179,232,0.80)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AtsIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className={styles.pickIcon}>
      <circle cx="20" cy="20" r="18" stroke="rgba(110,179,232,0.40)" strokeWidth="1.5" fill="rgba(110,179,232,0.08)" />
      <path d="M10 26L16 16L22 21L30 12" stroke="rgba(110,179,232,0.80)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OuIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className={styles.pickIcon}>
      <circle cx="20" cy="20" r="18" stroke="rgba(110,179,232,0.40)" strokeWidth="1.5" fill="rgba(110,179,232,0.08)" />
      <rect x="12" y="22" width="5" height="7" rx="1" fill="rgba(110,179,232,0.50)" />
      <rect x="17.5" y="17" width="5" height="12" rx="1" fill="rgba(110,179,232,0.65)" />
      <rect x="23" y="12" width="5" height="17" rx="1" fill="rgba(110,179,232,0.80)" />
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

function SlideTeamLogo({ slug, name, size }) {
  const url = getExportSafeLogoUrl(slug);
  const initials = name ? name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() : '??';
  if (!url) {
    return <span className={styles.logoFallback} style={{ width: size, height: size, fontSize: size * 0.3 }}>{initials}</span>;
  }
  return (
    <img src={url} alt="" width={size} height={size} loading="eager" decoding="sync"
      crossOrigin="anonymous" className={styles.logoImg}
      style={{ objectFit: 'contain', maxWidth: size, maxHeight: size }}
      data-fallback-text={initials} data-team-slug={slug} />
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

  // Picks — strict game-scoped matching
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

  // Always take a side: derive picks when model doesn't qualify one
  const finalPickEm = pickEmPick || derivePickEmLean(pickEmPick, homeSpreadNum, homeTeam, awayTeam, homeML, awayML);
  const atsPick = rawAtsPick || deriveAtsLean(rawAtsPick, homeSpreadNum, homeTeam, awayTeam);
  const ouLean = deriveOuLean(totalsPick, game, homeSpreadNum);

  // Tiers: derived picks get TOSS-UP tier (lowest), model picks keep their tier
  const pickEmTier = finalPickEm ? (pickToTier(finalPickEm) || TIERS.tossUp) : null;
  const atsTier = atsPick ? (pickToTier(atsPick) || TIERS.tossUp) : null;
  const totalsTier = ouLean ? (pickToTier(totalsPick) || TIERS.tossUp) : null;

  // Extract ML for the Pick 'Em team to display next to the team name
  const pickEmML = finalPickEm?._ml ?? (() => {
    if (!finalPickEm?.pickTeam) return null;
    const isHome = finalPickEm.pickTeam === homeTeam;
    return isHome ? homeML : awayML;
  })();

  const { peIntel, atsIntel, ouIntel } = buildMicroIntel({
    pickEmPick: finalPickEm, atsPick, ouLean, homeSpreadNum, awayTeam, homeTeam,
  });

  return (
    <SlideShell asOf={asOf} theme="single_game" brandMode="standard" slideNumber={slideNumber} slideTotal={slideTotal} rest={rest}>
      <div className={styles.glowAway} style={{ background: `radial-gradient(ellipse at 0% 38%, ${awayColor}30 0%, transparent 55%)` }} />
      <div className={styles.glowHome} style={{ background: `radial-gradient(ellipse at 100% 38%, ${homeColor}30 0%, transparent 55%)` }} />

      <div className={styles.header}>
        <div className={styles.heroRow}>
          <h2 className={styles.heroTitle}>MATCHUP INTEL</h2>
          <img src="/mascot.png" alt="" className={styles.heroMascot} crossOrigin="anonymous" />
        </div>
        {roundLabel && <div className={styles.roundBadge}>{roundLabel}</div>}
      </div>

      <div className={styles.h2h}>
        <div className={styles.panel} style={{ borderColor: `${awayColor}60`, background: `linear-gradient(155deg, ${awayColor}28 0%, ${awayColor}10 35%, transparent 70%)`, boxShadow: `0 6px 32px rgba(0,0,0,0.28), inset 0 0 50px ${awayColor}10, 0 0 36px ${awayColor}1A` }}>
          <div className={styles.logoWrap}>
            <div className={styles.logoGlow} style={{ background: `radial-gradient(circle, ${awayColor}70 0%, transparent 55%)` }} />
            <SlideTeamLogo slug={awaySlug} name={awayTeam} size={115} />
          </div>
          {awaySeed != null && <span className={styles.seedPill} style={{ borderColor: `${awayColor}40`, background: `linear-gradient(135deg, ${awayColor}18 0%, rgba(255,255,255,0.08) 100%)` }}>#{awaySeed}</span>}
          <div className={styles.teamName}>{awayTeam}</div>
          {awayConf && <div className={styles.conf}>{awayConf}</div>}
          <div className={styles.teamLine}>
            <div className={styles.teamLineItem}><span className={styles.teamLineVal}>{awaySpreadNum != null ? fmtLine(awaySpreadNum) : '—'}</span><span className={styles.teamLineKey}>SPREAD</span></div>
            {awayML != null && <div className={styles.teamLineItem}><span className={styles.teamLineVal}>{fmtLine(awayML)}</span><span className={styles.teamLineKey}>ML</span></div>}
          </div>
          {awayAts && <div className={styles.statRow}><span className={styles.statKey}>ATS</span><span className={styles.statVal}>{awayAts}</span></div>}
          <div className={styles.sideTag}>AWAY</div>
        </div>

        <div className={styles.center}>
          <div className={styles.vsRing}>VS</div>
          <div className={styles.totalCard}><span className={styles.totalVal}>{fmtTotal(total)}</span><span className={styles.totalKey}>O/U TOTAL</span></div>
        </div>

        <div className={styles.panel} style={{ borderColor: `${homeColor}60`, background: `linear-gradient(205deg, ${homeColor}28 0%, ${homeColor}10 35%, transparent 70%)`, boxShadow: `0 6px 32px rgba(0,0,0,0.28), inset 0 0 50px ${homeColor}10, 0 0 36px ${homeColor}1A` }}>
          <div className={styles.logoWrap}>
            <div className={styles.logoGlow} style={{ background: `radial-gradient(circle, ${homeColor}70 0%, transparent 55%)` }} />
            <SlideTeamLogo slug={homeSlug} name={homeTeam} size={115} />
          </div>
          {homeSeed != null && <span className={styles.seedPill} style={{ borderColor: `${homeColor}40`, background: `linear-gradient(135deg, ${homeColor}18 0%, rgba(255,255,255,0.08) 100%)` }}>#{homeSeed}</span>}
          <div className={styles.teamName}>{homeTeam}</div>
          {homeConf && <div className={styles.conf}>{homeConf}</div>}
          <div className={styles.teamLine}>
            <div className={styles.teamLineItem}><span className={styles.teamLineVal}>{homeSpreadNum != null ? fmtLine(homeSpreadNum) : '—'}</span><span className={styles.teamLineKey}>SPREAD</span></div>
            {homeML != null && <div className={styles.teamLineItem}><span className={styles.teamLineVal}>{fmtLine(homeML)}</span><span className={styles.teamLineKey}>ML</span></div>}
          </div>
          {homeAts && <div className={styles.statRow}><span className={styles.statKey}>ATS</span><span className={styles.statVal}>{homeAts}</span></div>}
          <div className={styles.sideTag}>HOME</div>
        </div>
      </div>

      <div className={styles.intel}>
        <div className={styles.intelTitle}>MAXIMUS&apos;S PICKS</div>
        <div className={styles.picksCols}>
          <div className={styles.pickCell}><PickEmIcon /><div className={styles.pickType}>PICK EM</div><div className={styles.pickVal}>{finalPickEm?.pickTeam ? `${finalPickEm.pickTeam}${pickEmML != null ? ` ${fmtLine(pickEmML)}` : ''}` : 'No lean'}</div><ConvictionPill tier={pickEmTier} />{peIntel && <div className={styles.microIntel}>{peIntel}</div>}</div>
          <div className={styles.pickDiv} />
          <div className={styles.pickCell}><AtsIcon /><div className={styles.pickType}>ATS</div><div className={styles.pickVal}>{atsPick?.pickLine || 'No lean'}</div><ConvictionPill tier={atsTier} />{atsIntel && <div className={styles.microIntel}>{atsIntel}</div>}</div>
          <div className={styles.pickDiv} />
          <div className={styles.pickCell}><OuIcon /><div className={styles.pickType}>O/U</div><div className={styles.pickVal}>{ouLean ? `${ouLean.direction} ${fmtTotal(total)}` : 'No lean'}</div><ConvictionPill tier={totalsTier} />{ouIntel && <div className={styles.microIntel}>{ouIntel}</div>}</div>
        </div>
      </div>
    </SlideShell>
  );
}
