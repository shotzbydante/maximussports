/**
 * NbaScorecardReport — full daily scorecard report for /nba/insights.
 *
 * Sections:
 *   1. Header strip — slate date, total/graded/pending counts, fallback label
 *   2. Category record chips — Overall, Pick 'Em, ATS, Totals
 *   3. Performance takeaway (dynamic, category-aware)
 *   4. Per-pick report rows — matchup, recommendation, line, conviction,
 *      final score, result, reason
 *
 * Fetches /api/nba/picks/scorecard?includePicks=1.
 */

import { useEffect, useState } from 'react';
import styles from './NbaScorecardReport.module.css';
import { resolveTeamLogo } from '../../../utils/teamLogo';

const TIER_LABELS = { tier1: 'Top Play', tier2: 'Strong', tier3: 'Watch' };
const STATUS_LABELS = { won: 'Win', lost: 'Loss', push: 'Push', pending: 'Pending' };

function formatRecord(rec) {
  if (!rec) return '—';
  const { won = 0, lost = 0, push = 0, pending = 0 } = rec;
  const graded = won + lost + push;
  if (graded === 0 && pending === 0) return '—';
  if (graded === 0) return `0–0 (${pending} pending)`;
  return push > 0 ? `${won}–${lost}–${push}` : `${won}–${lost}`;
}

function winRate(rec) {
  if (!rec) return null;
  const g = (rec.won ?? 0) + (rec.lost ?? 0);
  return g > 0 ? Math.round((rec.won / g) * 100) : null;
}

function CategoryChip({ label, rec, accent }) {
  const rate = winRate(rec);
  const has = rec && (rec.won + rec.lost + rec.push + rec.pending) > 0;
  return (
    <div className={`${styles.chip} ${has ? styles[`chip_${accent}`] : ''}`}>
      <span className={styles.chipLabel}>{label}</span>
      <span className={styles.chipValue}>{formatRecord(rec)}</span>
      {rate != null && <span className={styles.chipRate}>{rate}%</span>}
      {rec?.pending > 0 && <span className={styles.chipPending}>{rec.pending} pending</span>}
    </div>
  );
}

function buildTakeaway({ totals, scorecardSummary, selectedReason }) {
  if (!totals) return null;
  const { published, graded, pending, record, byMarket } = totals;

  if (published === 0) return { text: 'No picks published for this slate.', tone: 'neutral' };
  if (graded === 0 && pending > 0) {
    // Only happens when there is no graded slate anywhere in lookback —
    // soften the copy so the card doesn't read like a bad performance day.
    if (selectedReason === 'no_graded_slate') {
      return {
        text: `Scorecard tracking begins after the first graded slate. ${pending} pick${pending === 1 ? '' : 's'} pending.`,
        tone: 'neutral',
      };
    }
    return { text: `Awaiting final settlement — ${pending} of ${published} picks still pending.`, tone: 'neutral' };
  }
  if (graded === 0) {
    return { text: 'Picks were not graded for this slate.', tone: 'neutral' };
  }
  if (graded < 3) {
    return {
      text: `Small sample: ${record.won}–${record.lost} graded${pending > 0 ? `, ${pending} pending` : ''}.`,
      tone: 'neutral',
    };
  }

  // Identify best + worst category by win rate (only with ≥2 graded)
  const cats = [
    { key: 'moneyline', label: "Pick ’Ems", rec: byMarket.moneyline },
    { key: 'spread',    label: 'ATS',          rec: byMarket.spread },
    { key: 'total',     label: 'Totals',       rec: byMarket.total },
  ];
  const scored = cats
    .map(c => ({ ...c, n: (c.rec?.won ?? 0) + (c.rec?.lost ?? 0), rate: winRate(c.rec) }))
    .filter(c => c.n >= 2 && c.rate != null);

  scored.sort((a, b) => b.rate - a.rate);
  const best = scored[0];
  const worst = scored.length > 1 ? scored[scored.length - 1] : null;

  const overall = `${record.won}–${record.lost}${record.push ? `–${record.push}` : ''}`;
  const winning = record.won > record.lost;
  const losing = record.lost > record.won;

  if (winning && best && best.rate >= 75) {
    return {
      text: `Strong slate: ${overall} overall, led by ${best.label} going ${best.rec.won}–${best.rec.lost}.`,
      tone: 'positive',
    };
  }
  if (winning) {
    return {
      text: `Winning day — finished ${overall}${best ? `, ${best.label} carried it.` : '.'}`,
      tone: 'positive',
    };
  }
  if (losing && worst) {
    return {
      text: `Tough night: ${overall} overall, ${worst.label} struggled at ${worst.rec.won}–${worst.rec.lost}.`,
      tone: 'negative',
    };
  }
  if (losing) {
    return { text: `Tough night — finished ${overall}.`, tone: 'negative' };
  }
  if (best && worst) {
    return {
      text: `Mixed slate: ${best.label} held up at ${best.rec.won}–${best.rec.lost}, but ${worst.label} missed.`,
      tone: 'neutral',
    };
  }
  return { text: `Split day — finished ${overall}.`, tone: 'neutral' };
}

/**
 * v8 — Today's Pending Full-Slate Picks strip.
 *
 * Renders below the takeaway + category chips and ABOVE the graded
 * pick-by-pick list. Surfaces today's (or the most recent ungraded)
 * full-slate picks so the scorecard never feels stale on a Game 7 day.
 * Pending picks are kept out of the graded record by the endpoint.
 */
function PendingSlateStrip({ pendingSlate, insightsHref }) {
  const dateLabel = (() => {
    if (!pendingSlate.slateDate) return null;
    try {
      const d = new Date(`${pendingSlate.slateDate}T12:00:00`);
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    } catch { return pendingSlate.slateDate; }
  })();
  const headerLabel = pendingSlate.isToday ? "Today's Pending Full-Slate Picks" : 'Pending Full-Slate Picks';
  const subhead = `${pendingSlate.pickCount} pick${pendingSlate.pickCount === 1 ? '' : 's'} across ${pendingSlate.games.length} game${pendingSlate.games.length === 1 ? '' : 's'} · awaiting results`;
  return (
    <section className={styles.pendingStrip} aria-label="Today's pending full-slate picks">
      <header className={styles.pendingHeader}>
        <div className={styles.pendingHeaderLeft}>
          <span className={styles.pendingKicker}>Live · Pending</span>
          <h3 className={styles.pendingTitle}>{headerLabel}</h3>
          {dateLabel && <span className={styles.pendingDate}>{dateLabel}</span>}
        </div>
        <span className={styles.pendingSubhead}>{subhead}</span>
      </header>
      <ul className={styles.pendingGameList}>
        {pendingSlate.games.map(g => <PendingGameRow key={g.gameId} game={g} />)}
      </ul>
      {insightsHref && (
        <a href={insightsHref} className={styles.pendingCta}>
          See every pending pick &rarr;
        </a>
      )}
      <p className={styles.pendingDisclaimer}>
        Pending picks are tracked but excluded from the graded record below.
      </p>
    </section>
  );
}

function PendingGameRow({ game }) {
  const awayLogo = resolveTeamLogo({ sport: 'nba', slug: game.awayTeam });
  const homeLogo = resolveTeamLogo({ sport: 'nba', slug: game.homeTeam });
  const awayAbbr = (game.awayTeam || '').toUpperCase();
  const homeAbbr = (game.homeTeam || '').toUpperCase();
  const time = (() => {
    if (!game.startTime) return '';
    try { return new Date(game.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
    catch { return ''; }
  })();
  return (
    <li className={styles.pendingGame}>
      <div className={styles.pendingMatchup}>
        {awayLogo && <img src={awayLogo} alt="" width={16} height={16} className={styles.teamLogo} loading="lazy" />}
        <span className={styles.teamSlug}>{awayAbbr}</span>
        <span className={styles.matchupAt}>@</span>
        {homeLogo && <img src={homeLogo} alt="" width={16} height={16} className={styles.teamLogo} loading="lazy" />}
        <span className={styles.teamSlug}>{homeAbbr}</span>
        {time && <span className={styles.pendingTime}>{time}</span>}
      </div>
      <div className={styles.pendingMarkets}>
        <PendingMarketChip pick={game.picks?.moneyline} label="ML" />
        <PendingMarketChip pick={game.picks?.runline}   label="ATS" />
        <PendingMarketChip pick={game.picks?.total}     label="TOT" />
      </div>
    </li>
  );
}

function PendingMarketChip({ pick, label }) {
  if (!pick) {
    return <span className={`${styles.pendingMarket} ${styles.pendingMarketEmpty}`}>{label} —</span>;
  }
  const text = pick.pickLabel || pick.selection?.label || label;
  return (
    <span className={styles.pendingMarket} title={pick.resultReason || pick.rationale?.headline || ''}>
      <span className={styles.pendingMarketLabel}>{label}</span>
      <span className={styles.pendingMarketPick}>{text}</span>
    </span>
  );
}

function ResultBadge({ status }) {
  const cls = status === 'won' ? styles.badgeWon
            : status === 'lost' ? styles.badgeLost
            : status === 'push' ? styles.badgePush
            : styles.badgePending;
  return <span className={`${styles.badge} ${cls}`}>{STATUS_LABELS[status] || status}</span>;
}

function PickRow({ pick }) {
  const cat = pick.marketType === 'moneyline' ? "Pick ’Em"
           : pick.marketType === 'runline' || pick.marketType === 'spread' ? 'ATS'
           : pick.marketType === 'total' ? 'Total'
           : pick.marketType;
  // Single-line context label — date + round + game number when known.
  // Falls back to date-only when no playoff context is available, never
  // invents a game number.
  const contextLabel = pick.contextLabel
    || pick.gameDateLabel
    || (pick.slateDate ? formatGameDate(pick.slateDate) : null);
  // Team logos via the canonical NBA-safe resolver. Both await/home slugs
  // are persisted (`pick.awayTeam` / `pick.homeTeam` per annotatePick), so
  // every row can render the matchup with logos. `loading="lazy"` +
  // `onError` text-only fallback keeps the row safe when a slug doesn't
  // resolve (rare but possible if a future enricher emits an unknown id).
  const awayLogo = resolveTeamLogo({ sport: 'nba', slug: pick.awayTeam });
  const homeLogo = resolveTeamLogo({ sport: 'nba', slug: pick.homeTeam });
  const awayAbbr = (pick.awayTeam || '').toUpperCase();
  const homeAbbr = (pick.homeTeam || '').toUpperCase();

  return (
    <div className={`${styles.row} ${styles[`row_${pick.status}`] || ''}`}>
      <div className={styles.rowLeft}>
        <span className={styles.matchup}>
          {awayLogo && (
            <img
              src={awayLogo}
              alt=""
              width={18}
              height={18}
              className={styles.teamLogo}
              loading="lazy"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
          <span className={styles.teamSlug}>{awayAbbr}</span>
          <span className={styles.matchupAt}>@</span>
          {homeLogo && (
            <img
              src={homeLogo}
              alt=""
              width={18}
              height={18}
              className={styles.teamLogo}
              loading="lazy"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
          <span className={styles.teamSlug}>{homeAbbr}</span>
        </span>
        {contextLabel && (
          <span className={styles.gameContext} title={pick.seriesScoreSummary || undefined}>
            {contextLabel}
            {pick.isGameSeven && pick.gameNumber !== 7 && (
              <span className={styles.gameContextFlag}> · Game 7</span>
            )}
          </span>
        )}
        <span className={styles.metaRow}>
          <span className={styles.cat}>{cat}</span>
          {pick.convictionTier && (
            <span className={styles.tier}>{TIER_LABELS[pick.convictionTier] || pick.convictionTier}</span>
          )}
        </span>
      </div>

      <div className={styles.rowMid}>
        <span className={styles.pickLabel}>{pick.pickLabel}</span>
        {pick.finalScore && <span className={styles.finalScore}>{pick.finalScore}</span>}
        {pick.resultReason && <span className={styles.reason}>{pick.resultReason}</span>}
        {!pick.finalScore && pick.status === 'pending' && (
          <span className={styles.reason}>{pendingReasonFor(pick)}</span>
        )}
      </div>

      <div className={styles.rowRight}>
        <ResultBadge status={pick.status} />
      </div>
    </div>
  );
}

function formatGameDate(ymd) {
  if (!ymd) return null;
  try {
    const d = new Date(`${ymd}T12:00:00`);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return ymd; }
}

/**
 * Pending-pick copy that uses series context when available so repeat
 * playoff matchups read clearly:
 *   "Game 7 awaiting tipoff."
 *   "Game 5 awaiting settlement."  (when slate date is in the past)
 *   "Awaiting tipoff or final."    (fallback)
 */
function pendingReasonFor(pick) {
  const gn = pick.gameNumber;
  const today = new Date().toISOString().slice(0, 10);
  const slate = pick.slateDate || pick.gameDate || null;
  const isPast = slate && slate < today;
  if (gn) {
    return isPast
      ? `Game ${gn} awaiting settlement.`
      : `Game ${gn} awaiting tipoff.`;
  }
  return isPast ? 'Awaiting settlement.' : 'Awaiting tipoff or final.';
}

export default function NbaScorecardReport({ dateOverride, variant = 'full', insightsHref = '/nba/insights' } = {}) {
  // `embedded` controls layout/density only (e.g. when hosted inside the
  // NBA Home picks hero shell). It MUST NOT truncate rows — the canonical
  // per-pick scorecard renders identically on /nba and /nba/insights so a
  // user sees the same picks, statuses, and reasons in both places. The
  // pre-2026-05-04 `compact` variant clipped to `slice(0, 3)` and showed a
  // "Top Results · showing 3 of 6" header — that disparity is removed.
  const embedded = variant === 'compact' || variant === 'embedded';
  const [data, setData] = useState(null);
  const [perf, setPerf] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // 1-minute cache-buster bucket — keeps results responsive to mid-day
    // pending → graded transitions while still allowing edge re-use within
    // the bucket. Combined with the endpoint's 30s s-maxage this prevents
    // stale "Most Recent Graded Slate · …" headlines from sticking.
    const bucket = Math.floor(Date.now() / 60000);
    const base = dateOverride
      ? `/api/nba/picks/scorecard?includePicks=1&date=${dateOverride}`
      : '/api/nba/picks/scorecard?includePicks=1';
    const url = `${base}&t=${bucket}`;
    fetch(url, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setData(d || null); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dateOverride]);

  // Rolling 7d/30d performance — non-blocking; report still renders without it.
  // Always fetched (Home + Insights render the same content; only chrome differs).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/nba/picks/performance?sport=nba')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setPerf(d || null); })
      .catch(() => { if (!cancelled) setPerf(null); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <section className={styles.section}>
        <div className={styles.skel}><div className={styles.skelBlock} /><div className={styles.skelBlock} /></div>
      </section>
    );
  }

  // Render based on the server-resolved dataMode (tri-state):
  //   • graded_with_rows      → full report (header, chips, takeaway, rows)
  //   • graded_aggregate_only → header, chips, takeaway + "details unavailable"
  //   • no_graded_history     → "Awaiting first graded slate" / "Today's slate pending"
  //
  // HARD INVARIANT (UI safety net): if dataMode is missing for any reason
  // and totals.graded === 0 with no aggregate scorecard, fall back to the
  // pending state — never let a 0-graded slate render as graded.
  const apiGraded = data?.totals?.graded ?? 0;
  const apiPending = data?.totals?.pending ?? 0;
  const aggregateGraded = data?.scorecard?.overall
    ? ((data.scorecard.overall.won ?? 0) + (data.scorecard.overall.lost ?? 0) + (data.scorecard.overall.push ?? 0))
    : 0;
  // Truth-source for rendering: do we actually have row-level picks to render?
  // Don't trust `dataMode` alone — backend may still misclassify if pick_results
  // join shape changes. Picks-array presence is the only thing the row renderer
  // actually needs.
  const hasRowData = Array.isArray(data?.picks) && data.picks.length > 0;
  const dataMode = data?.dataMode
    || (apiGraded > 0 ? 'graded_with_rows'
        : aggregateGraded > 0 ? 'graded_aggregate_only'
        : 'no_graded_history');
  // No graded data: only treat as "no graded" when both dataMode says so AND
  // we lack row data. Row-presence wins over dataMode in either direction.
  const noGradedSlate = dataMode === 'no_graded_history' && !hasRowData;
  // Strict invariant: if backend reports graded totals but UI got no rows,
  // surface the inconsistency in the console for ops visibility.
  if (apiGraded > 0 && !hasRowData) {
    // eslint-disable-next-line no-console
    console.warn('[NbaScorecardReport] data inconsistency: totals.graded=%d but picks.length=0 — falling back to aggregate display', apiGraded);
  }
  // eslint-disable-next-line no-console
  if (typeof window !== 'undefined' && import.meta?.env?.DEV) {
    // eslint-disable-next-line no-console
    console.log('NBA SCORECARD PICKS:', data?.picks, { dataMode, hasRowData, apiGraded, apiPending, selectedSlateDate: data?.selectedSlateDate });
  }

  if (noGradedSlate) {
    if (apiGraded === 0 && aggregateGraded === 0 && data?.selectedReason
        && data.selectedReason !== 'no_graded_slate') {
      // eslint-disable-next-line no-console
      console.warn('[NbaScorecardReport] invariant: server returned %s with no graded data — rendering awaiting state',
        data.selectedReason);
    }
    const pendingForNote = apiPending || data?.diagnostics?.todayPendingCount || 0;
    return (
      <section className={`${styles.section} ${embedded ? styles.sectionEmbedded : ''}`}>
        <div className={styles.headerStrip}>
          <div className={styles.headerLeft}>
            <span className={styles.eyebrow}>Model Performance</span>
            <h2 className={styles.title}>How Maximus&rsquo;s Picks Are Performing</h2>
            <span className={styles.slateDate}>
              {pendingForNote > 0 ? "Today's slate pending" : 'Awaiting first graded slate'}
            </span>
          </div>
        </div>
        <p className={styles.takeaway + ' ' + styles.takeaway_neutral}>
          <span className={styles.takeawayKicker}>Tracking</span>
          {pendingForNote > 0
            ? `Today's picks are live (${pendingForNote} pick${pendingForNote === 1 ? '' : 's'}) and will grade after final scores post. Results will appear here once games go final.`
            : "Scorecard tracking begins after the first graded slate. Today's picks are listed in the picks board below; results post here once games go final."}
        </p>
        {embedded && (
          <div className={styles.compactCtaRow}>
            <a href={insightsHref} className={styles.compactCta}>
              View today&rsquo;s picks &rarr;
            </a>
          </div>
        )}
      </section>
    );
  }

  const { scorecard, picks, totals, slateDate, usedFallback, selectedReason, diagnostics, pendingSlate } = data;
  const takeaway = buildTakeaway({ totals, scorecardSummary: scorecard, selectedReason });
  const targetPrior = diagnostics?.targetPrior;

  // Awaiting state for the canonical target prior slate (yesterday). When
  // yesterday has picks + finals but no graded results, we want a dated,
  // prominent banner — "Apr 30 awaiting settlement" — not a quiet note.
  const awaitingSettlement = selectedReason === 'awaiting_settlement'
    || (targetPrior?.awaitingSettlement && slateDate !== targetPrior.date);
  const awaitingFinals = selectedReason === 'awaiting_finals'
    || (targetPrior?.awaitingFinals && slateDate !== targetPrior.date);

  const todayPendingSlate = (awaitingSettlement || awaitingFinals)
    ? targetPrior?.date
    : diagnostics?.todayPendingSlate;
  const todayPendingCount = (awaitingSettlement || awaitingFinals)
    ? (targetPrior?.picksCount || 0)
    : (diagnostics?.todayPendingCount || 0);
  const showTodayPendingNote = (
    usedFallback || selectedReason === 'no_graded_slate'
    || awaitingSettlement || awaitingFinals
  ) && todayPendingSlate && todayPendingSlate !== slateDate && todayPendingCount > 0;
  const todayPendingLabel = (() => {
    if (!todayPendingSlate) return null;
    try {
      const d = new Date(`${todayPendingSlate}T12:00:00`);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch { return todayPendingSlate; }
  })();

  const slateLabel = (() => {
    try {
      const d = new Date(`${slateDate}T12:00:00`);
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    } catch { return slateDate; }
  })();

  const pickRows = picks || [];
  const sortedPicks = [...pickRows].sort((a, b) => {
    const order = { won: 0, lost: 1, push: 2, pending: 3 };
    const oa = order[a.status] ?? 4;
    const ob = order[b.status] ?? 4;
    if (oa !== ob) return oa - ob;
    return (b.betScore || 0) - (a.betScore || 0);
  });

  // Always render every persisted row in canonical order — Home and Insights
  // are required to be identical (no truncation, no "Top Results 3 of 6").
  const displayPicks = sortedPicks;

  return (
    <section className={`${styles.section} ${embedded ? styles.sectionEmbedded : ''}`}>
      {/* Header strip */}
      <div className={styles.headerStrip}>
        <div className={styles.headerLeft}>
          <span className={styles.eyebrow}>Model Performance</span>
          <h2 className={styles.title}>How Maximus&rsquo;s Picks Are Performing</h2>
          <span className={styles.slateDate}>
            {usedFallback
              ? 'Most Recent Graded Slate'
              : selectedReason === 'no_graded_slate'
                ? 'Awaiting first graded slate'
                : 'Yesterday'} &middot; {slateLabel}
          </span>
          {showTodayPendingNote && (
            <span className={styles.pendingNote}>
              {awaitingSettlement
                ? `${todayPendingLabel} slate awaiting settlement (${todayPendingCount} pick${todayPendingCount === 1 ? '' : 's'}). Showing last settled results.`
                : awaitingFinals
                  ? `${todayPendingLabel} slate in progress (${todayPendingCount} pick${todayPendingCount === 1 ? '' : 's'}). Showing last settled results.`
                  : `Today's slate is still pending (${todayPendingCount} pick${todayPendingCount === 1 ? '' : 's'}). Showing last settled results${todayPendingLabel ? ` from ${todayPendingLabel}` : ''}.`}
            </span>
          )}
        </div>
        {totals && (
          <div className={styles.headerStats}>
            <div className={styles.statCol}>
              <span className={styles.statLabel}>Published</span>
              <span className={styles.statValue}>{totals.published}</span>
            </div>
            <div className={styles.statCol}>
              <span className={styles.statLabel}>Graded</span>
              <span className={styles.statValue}>{totals.graded}</span>
            </div>
            {totals.pending > 0 && (
              <div className={styles.statCol}>
                <span className={styles.statLabel}>Pending</span>
                <span className={styles.statValue}>{totals.pending}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Takeaway */}
      {takeaway?.text && (
        <p className={`${styles.takeaway} ${styles[`takeaway_${takeaway.tone}`]}`}>
          <span className={styles.takeawayKicker}>Takeaway</span>
          {takeaway.text}
        </p>
      )}

      {/* Category chips */}
      {totals && (
        <div className={styles.chipRow}>
          <CategoryChip label="Overall" rec={totals.record} accent="overall" />
          <CategoryChip label={"Pick ’Em"} rec={totals.byMarket.moneyline} accent="ml" />
          <CategoryChip label="ATS" rec={totals.byMarket.spread} accent="ats" />
          <CategoryChip label="Totals" rec={totals.byMarket.total} accent="tot" />
        </div>
      )}

      {/* v8: today's pending full-slate picks. Rendered only when the
          endpoint exposes a non-null pendingSlate AND the slate isn't
          the same as the graded one already on display. Counts shown
          here are NOT folded into the graded record. */}
      {pendingSlate && pendingSlate.games?.length > 0 && (
        <PendingSlateStrip pendingSlate={pendingSlate} insightsHref={insightsHref} />
      )}

      {/* Per-pick report — every row, every status. Single canonical
          presentation used by /nba (embedded) and /nba/insights (page). */}
      {displayPicks.length > 0 ? (
        <div className={styles.picksList}>
          <div className={styles.picksHeader}>
            <span>Pick-by-Pick Results</span>
            <span className={styles.picksHeaderHint}>sorted by result</span>
          </div>
          {displayPicks.map(p => <PickRow key={p.id || p.pickKey} pick={p} />)}
        </div>
      ) : (
        <p className={styles.noPicks}>
          Per-pick detail is unavailable for this slate. The summary above reflects the persisted scorecard row.
        </p>
      )}

      {/* Rolling performance — always rendered (Home + Insights parity). */}
      <RollingPerformance perf={perf} />

      {/* Model grading explainer — always rendered (Home + Insights parity). */}
      <div className={styles.explainer}>
        <h3 className={styles.explainerTitle}>How the model is graded</h3>
        <ul className={styles.explainerList}>
          <li>Every published pick is persisted at slate publish time and graded after final scores post.</li>
          <li><strong>Pick &rsquo;Em</strong> — graded against the game&rsquo;s outright winner.</li>
          <li><strong>ATS</strong> — graded against the published spread; pushes are exact landings.</li>
          <li><strong>Totals</strong> — graded against the projected line; over/under or push.</li>
          <li>Daily results inform future confidence calibration — performance is tracked, not invented.</li>
        </ul>
      </div>
    </section>
  );
}

/* ── Rolling Performance subsection ── */
function RollingPerformance({ perf }) {
  if (!perf) return null;
  const w7 = perf.windows?.trailing7d;
  const w30 = perf.windows?.trailing30d;
  const tp = perf.topPlay;

  // Hide the entire block when nothing meaningful is available
  const hasAny = (w7 && w7.state !== 'none') || (w30 && w30.state !== 'none') || (tp && tp.graded > 0);
  if (!hasAny) {
    return (
      <div className={styles.rolling}>
        <h3 className={styles.rollingTitle}>Rolling Performance</h3>
        <p className={styles.rollingEmpty}>
          Rolling track record builds after the next graded slate. Each finalized day adds to the trailing window.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.rolling}>
      <h3 className={styles.rollingTitle}>Rolling Performance</h3>
      <div className={styles.rollingGrid}>
        <RollingCol label="Last 7 days" win={w7} />
        <RollingCol label="Last 30 days" win={w30} />
        {tp && tp.graded > 0 && (
          <div className={styles.rollingCard}>
            <span className={styles.rollingCardLabel}>Top Play (30d)</span>
            <span className={styles.rollingCardValue}>
              {tp.won}–{tp.lost}
              {tp.push ? `–${tp.push}` : ''}
            </span>
            {tp.hitRate != null && (
              <span className={styles.rollingCardRate}>{Math.round(tp.hitRate * 100)}%</span>
            )}
            <span className={styles.rollingCardSample}>{tp.graded} graded</span>
          </div>
        )}
      </div>
    </div>
  );
}

function RollingCol({ label, win }) {
  if (!win || win.state === 'none') {
    return (
      <div className={styles.rollingCard}>
        <span className={styles.rollingCardLabel}>{label}</span>
        <span className={styles.rollingCardEmpty}>—</span>
        <span className={styles.rollingCardSample}>tracking</span>
      </div>
    );
  }
  if (win.state === 'pending') {
    return (
      <div className={styles.rollingCard}>
        <span className={styles.rollingCardLabel}>{label}</span>
        <span className={styles.rollingCardEmpty}>Awaiting</span>
        <span className={styles.rollingCardSample}>{win.pending} picks pending</span>
      </div>
    );
  }
  return (
    <div className={styles.rollingCard}>
      <span className={styles.rollingCardLabel}>{label}</span>
      <span className={styles.rollingCardValue}>{win.record || '—'}</span>
      {win.winRate != null && (
        <span className={styles.rollingCardRate}>{win.winRate}%</span>
      )}
      <span className={styles.rollingCardSample}>
        {win.sample ? `${win.sample} graded` : 'tracking'}
        {win.sparse ? ' · small sample' : ''}
      </span>
    </div>
  );
}
