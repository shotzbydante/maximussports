import { useMemo } from 'react';
import { getTeamSlug } from '../../utils/teamSlug';
import styles from './MaximusPicks.module.css';

// ─── tuneable constants ────────────────────────────────────────────────────────
const ATS_EDGE_MIN = 0.12;
const ATS_EDGE_HIGH = 0.18;
const ATS_EDGE_MED = 0.14;
const ML_VALUE_MIN = 0.04;
const ML_VALUE_HIGH = 0.07;
const ML_VALUE_MED = 0.05;
const ML_AVOID_PRICE = -350;
const HOME_BUMP = 0.02;
const ATS_ML_WEIGHT = 0.35;
const TOTALS_DELTA_MIN = 6;
const TOTALS_DELTA_HIGH = 10;
const TOTALS_DELTA_MED = 8;
const TOTALS_DISPERSION_HIGH = 3.0;
const PICKS_PER_SECTION = 5;

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Convert American moneyline to implied probability (0–1). */
function mlToImplied(ml) {
  if (ml == null || isNaN(ml)) return null;
  if (ml > 0) return 100 / (ml + 100);
  return Math.abs(ml) / (Math.abs(ml) + 100);
}

/** Safely parse a float from a raw string/number. Returns null on failure. */
function parseNum(v) {
  if (v == null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

/**
 * Return the "best" ATS record for a team slug from atsLeaders,
 * checking last30 → season → last7 in priority order.
 * Returns null if not found or no decided games.
 */
function getBestAtsRecord(slug, atsLeaders) {
  if (!slug || !atsLeaders) return null;
  const all = [...(atsLeaders.best || []), ...(atsLeaders.worst || [])];
  const row = all.find((r) => r.slug === slug);
  if (!row) return null;
  // prefer last30, then season, then last7
  for (const key of ['last30', 'season', 'last7']) {
    const rec = row[key];
    if (rec && rec.total > 0 && rec.coverPct != null) return { ...rec, window: key };
  }
  return null;
}

/** Clamp a number between min and max. */
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/** Format a UTC ISO string to a compact "Tue 7:30p" label. */
function fmtTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const day = d.toLocaleDateString('en-US', { weekday: 'short' });
    const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      .replace(':00', '').replace(' AM', 'a').replace(' PM', 'p');
    return `${day} ${t}`;
  } catch {
    return '';
  }
}

/** Format a moneyline price as "+120" or "-145". */
function fmtPrice(price) {
  if (price == null) return '';
  return price > 0 ? `+${price}` : String(price);
}

/** Derive confidence chip label from level number. */
function confidenceLabel(level) {
  if (level >= 2) return 'High';
  if (level >= 1) return 'Med';
  return 'Low';
}

// ─── pick derivation ──────────────────────────────────────────────────────────

function deriveSpreadPicks(games, atsLeaders) {
  const picks = [];

  for (const game of games) {
    if (!game.spread && game.spread !== 0) continue;
    const spreadNum = parseNum(game.spread);
    if (spreadNum == null) continue;

    const homeSlug = getTeamSlug(game.homeTeam);
    const awaySlug = getTeamSlug(game.awayTeam);

    const homeAts = getBestAtsRecord(homeSlug, atsLeaders);
    const awayAts = getBestAtsRecord(awaySlug, atsLeaders);

    if (!homeAts || !awayAts) continue;

    const homePct = homeAts.coverPct / 100;
    const awayPct = awayAts.coverPct / 100;
    const edge = homePct - awayPct; // positive = home edge

    if (Math.abs(edge) < ATS_EDGE_MIN) continue;

    const pickHome = edge > 0;
    const pickTeam = pickHome ? game.homeTeam : game.awayTeam;
    const pickAts = pickHome ? homeAts : awayAts;
    const oppAts = pickHome ? awayAts : homeAts;

    // The ATS spread convention: game.spread is from home perspective (neg = home fav)
    // If picking home favorite with a big line, downgrade unless edge is very high
    const homeIsFav = spreadNum < 0;
    const isBigFav = Math.abs(spreadNum) >= 10;
    if (isBigFav && homeIsFav && pickHome && Math.abs(edge) < ATS_EDGE_HIGH) continue;

    const spreadLabel = pickHome
      ? (spreadNum < 0 ? spreadNum : `+${spreadNum}`)
      : (spreadNum > 0 ? `-${spreadNum}` : `+${Math.abs(spreadNum)}`);

    const windowLabel = pickAts.window === 'last30' ? 'last 30' : pickAts.window === 'last7' ? 'last 7' : 'season';

    let confidence = 0;
    if (Math.abs(edge) >= ATS_EDGE_HIGH) confidence = 2;
    else if (Math.abs(edge) >= ATS_EDGE_MED) confidence = 1;

    picks.push({
      key: game.gameId || `${game.homeTeam}-${game.awayTeam}`,
      matchup: `${game.awayTeam} @ ${game.homeTeam}`,
      time: fmtTime(game.startTime || game.commence_time),
      pickTeam,
      pickLine: `${pickTeam} ${spreadLabel > 0 ? '+' : ''}${spreadLabel}`,
      rationale: `ATS edge: ${pickTeam.split(' ').pop()} ${Math.round(pickAts.coverPct)}% vs opp ${Math.round(oppAts.coverPct)}% (${windowLabel})`,
      confidence,
      edgeMag: Math.abs(edge),
    });
  }

  return picks
    .sort((a, b) => b.edgeMag - a.edgeMag)
    .slice(0, PICKS_PER_SECTION);
}

function deriveMoneylinePicks(games, atsLeaders) {
  const picks = [];

  for (const game of games) {
    if (!game.moneyline) continue;
    const [rawHome, rawAway] = String(game.moneyline).split('/');
    const homeML = parseNum(rawHome);
    const awayML = parseNum(rawAway);
    if (homeML == null || awayML == null) continue;

    const homeImplied = mlToImplied(homeML);
    const awayImplied = mlToImplied(awayML);
    if (!homeImplied || !awayImplied) continue;

    const homeSlug = getTeamSlug(game.homeTeam);
    const awaySlug = getTeamSlug(game.awayTeam);

    const homeAts = getBestAtsRecord(homeSlug, atsLeaders);
    const awayAts = getBestAtsRecord(awaySlug, atsLeaders);

    const homeCover = homeAts ? homeAts.coverPct / 100 : 0.5;
    const awayCover = awayAts ? awayAts.coverPct / 100 : 0.5;
    const atsDiff = homeCover - awayCover;

    const homeModelProb = clamp(0.5 + atsDiff * ATS_ML_WEIGHT + HOME_BUMP, 0.35, 0.75);
    const awayModelProb = 1 - homeModelProb;

    const homeValue = homeModelProb - homeImplied;
    const awayValue = awayModelProb - awayImplied;

    let pickTeam, pickML, pickProb, impliedPct, value;
    if (homeValue >= awayValue && homeValue >= ML_VALUE_MIN) {
      if (homeML <= ML_AVOID_PRICE) continue;
      pickTeam = game.homeTeam;
      pickML = homeML;
      pickProb = homeModelProb;
      impliedPct = homeImplied;
      value = homeValue;
    } else if (awayValue >= ML_VALUE_MIN) {
      if (awayML <= ML_AVOID_PRICE) continue;
      pickTeam = game.awayTeam;
      pickML = awayML;
      pickProb = awayModelProb;
      impliedPct = awayImplied;
      value = awayValue;
    } else {
      continue;
    }

    const windowLabel = (homeAts || awayAts)
      ? ((homeAts?.window || awayAts?.window) === 'last30' ? 'last 30' : 'season')
      : '';

    let confidence = 0;
    if (value >= ML_VALUE_HIGH) confidence = 2;
    else if (value >= ML_VALUE_MED) confidence = 1;

    picks.push({
      key: game.gameId || `${game.homeTeam}-${game.awayTeam}`,
      matchup: `${game.awayTeam} @ ${game.homeTeam}`,
      time: fmtTime(game.startTime || game.commence_time),
      pickTeam,
      pickLine: `${pickTeam} ${fmtPrice(pickML)}`,
      rationale: `Lean: ${Math.round(pickProb * 100)}% vs market ${Math.round(impliedPct * 100)}%${windowLabel ? ` · ATS form (${windowLabel})` : ''}`,
      confidence,
      value,
    });
  }

  return picks
    .sort((a, b) => b.value - a.value)
    .slice(0, PICKS_PER_SECTION);
}

function deriveTotalsPicks(games) {
  const picks = [];

  for (const game of games) {
    if (!game.total) continue;
    const marketTotal = parseNum(game.total);
    if (marketTotal == null) continue;

    // We do not have per-team recent scoring in the home payload,
    // so we rely solely on market dispersion (multi-book variance).
    // The merged game object has a single "best" total. We cannot compute
    // cross-book dispersion without the raw bookmaker array, so we skip
    // the dispersion check and only proceed when there's a notable line.
    // This is intentionally conservative — show the best available line.

    // With a single book we can only show the line itself. Include it as
    // a "best number" card only if the total is notably low or high
    // (proxy for interesting market position), using a threshold of ±0.
    // Since we have no scoring stats to compare against, all totals get
    // an informational card with Low confidence rather than fabricating data.

    // Emit a card so the section isn't silently empty when totals exist.
    const overPrice = game.overPrice ? fmtPrice(parseNum(game.overPrice)) : null;
    const underPrice = game.underPrice ? fmtPrice(parseNum(game.underPrice)) : null;
    const priceNote = overPrice || underPrice
      ? ` (O ${overPrice ?? '—'} / U ${underPrice ?? '—'})`
      : '';

    picks.push({
      key: game.gameId || `${game.homeTeam}-${game.awayTeam}`,
      matchup: `${game.awayTeam} @ ${game.homeTeam}`,
      time: fmtTime(game.startTime || game.commence_time),
      pickTeam: null,
      pickLine: `O/U ${marketTotal}${priceNote}`,
      rationale: `Best number available: ${marketTotal}`,
      confidence: 0,
      lineValue: marketTotal,
    });
  }

  return picks
    .sort((a, b) => b.lineValue - a.lineValue)
    .slice(0, PICKS_PER_SECTION);
}

// ─── sub-components ───────────────────────────────────────────────────────────

function ConfidenceChip({ level }) {
  const label = confidenceLabel(level);
  return (
    <span
      className={`${styles.confChip} ${level >= 2 ? styles.confHigh : level >= 1 ? styles.confMed : styles.confLow}`}
      aria-label={`Confidence: ${label}`}
    >
      {label}
    </span>
  );
}

function PickRow({ pick }) {
  return (
    <div className={styles.pickRow}>
      <div className={styles.pickMeta}>
        <span className={styles.pickMatchup}>{pick.matchup}</span>
        {pick.time && <span className={styles.pickTime}>{pick.time}</span>}
      </div>
      <div className={styles.pickMain}>
        <span className={styles.pickPill}>{pick.pickLine}</span>
        <ConfidenceChip level={pick.confidence} />
      </div>
      <p className={styles.pickRationale}>{pick.rationale}</p>
    </div>
  );
}

function PickSection({ title, picks, emptyReason }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      {picks.length === 0 ? (
        <p className={styles.emptyState}>{emptyReason || 'Not enough market data yet.'}</p>
      ) : (
        <div className={styles.pickList}>
          {picks.map((p) => (
            <PickRow key={p.key} pick={p} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

/**
 * MaximusPicks — deterministic picks derived from data already on the Home page.
 *
 * Props:
 *   games        {Array}  — merged game objects (from mergeGamesWithOdds)
 *   atsLeaders   {Object} — { best: AtsLeaderRow[], worst: AtsLeaderRow[] }
 */
export default function MaximusPicks({ games = [], atsLeaders = { best: [], worst: [] } }) {
  const spreadPicks = useMemo(
    () => deriveSpreadPicks(games, atsLeaders),
    [games, atsLeaders],
  );
  const mlPicks = useMemo(
    () => deriveMoneylinePicks(games, atsLeaders),
    [games, atsLeaders],
  );
  const totalsPicks = useMemo(
    () => deriveTotalsPicks(games),
    [games],
  );

  const hasAny = spreadPicks.length > 0 || mlPicks.length > 0 || totalsPicks.length > 0;

  if (!hasAny && games.length === 0) {
    return (
      <div className={styles.emptyAll}>
        <p>Not enough market data yet. Check back once lines are posted.</p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <PickSection
        title="Against the Spread"
        picks={spreadPicks}
        emptyReason="Not enough market data yet."
      />
      <PickSection
        title="Pick 'Ems (Moneyline)"
        picks={mlPicks}
        emptyReason="Not enough market data yet."
      />
      <PickSection
        title="Totals (O/U)"
        picks={totalsPicks}
        emptyReason="Not enough market data yet."
      />
      <p className={styles.disclaimer}>
        For entertainment only. Please bet responsibly. Leans are data-driven, not advice.
      </p>
    </div>
  );
}
