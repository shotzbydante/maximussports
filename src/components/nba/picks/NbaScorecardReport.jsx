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
  return (
    <div className={`${styles.row} ${styles[`row_${pick.status}`] || ''}`}>
      <div className={styles.rowLeft}>
        <span className={styles.matchup}>{pick.matchup}</span>
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
          <span className={styles.reason}>Awaiting tipoff or final.</span>
        )}
      </div>

      <div className={styles.rowRight}>
        <ResultBadge status={pick.status} />
      </div>
    </div>
  );
}

export default function NbaScorecardReport({ dateOverride, variant = 'full', insightsHref = '/nba/insights' } = {}) {
  const isCompact = variant === 'compact';
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
  // Skipped in compact mode (Home preview keeps the surface tight).
  useEffect(() => {
    if (isCompact) return;
    let cancelled = false;
    fetch('/api/nba/picks/performance?sport=nba')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setPerf(d || null); })
      .catch(() => { if (!cancelled) setPerf(null); });
    return () => { cancelled = true; };
  }, [isCompact]);

  if (loading) {
    return (
      <section className={styles.section}>
        <div className={styles.skel}><div className={styles.skelBlock} /><div className={styles.skelBlock} /></div>
      </section>
    );
  }

  // No graded slate anywhere in lookback → render a tight "awaiting"
  // tile rather than re-listing today's pending picks (those already
  // show in the Today's Picks board on Home, and on /insights the
  // pending-only state is also clearer than a misleading 0–0 record).
  //
  // HARD INVARIANT: if the selected slate has zero graded picks, never
  // show it as a graded scorecard — regardless of selectedReason. This
  // is the UI-side safety net for any server bug or stale cache that
  // returns "graded fallback" with all-pending rows.
  const apiGraded = data?.totals?.graded ?? 0;
  const apiPending = data?.totals?.pending ?? 0;
  const noGradedSlate = data?.selectedReason === 'no_graded_slate'
    || apiGraded === 0
    || (!data?.scorecard && !(data?.picks?.length));
  if (noGradedSlate) {
    if (apiGraded === 0 && data?.selectedReason && data?.selectedReason !== 'no_graded_slate') {
      // eslint-disable-next-line no-console
      console.warn('[NbaScorecardReport] invariant: server returned %s with 0 graded — rendering awaiting state',
        data.selectedReason);
    }
    const pendingForNote = apiPending || data?.diagnostics?.todayPendingCount || 0;
    return (
      <section className={`${styles.section} ${isCompact ? styles.sectionCompact : ''}`}>
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
        {isCompact && (
          <div className={styles.compactCtaRow}>
            <a href={insightsHref} className={styles.compactCta}>
              View today&rsquo;s picks &rarr;
            </a>
          </div>
        )}
      </section>
    );
  }

  const { scorecard, picks, totals, slateDate, usedFallback, selectedReason, diagnostics } = data;
  const takeaway = buildTakeaway({ totals, scorecardSummary: scorecard, selectedReason });
  const todayPendingSlate = diagnostics?.todayPendingSlate;
  const todayPendingCount = diagnostics?.todayPendingCount || 0;
  const showTodayPendingNote = (usedFallback || selectedReason === 'no_graded_slate')
    && todayPendingSlate && todayPendingSlate !== slateDate && todayPendingCount > 0;
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

  const displayPicks = isCompact ? sortedPicks.slice(0, 3) : sortedPicks;

  return (
    <section className={`${styles.section} ${isCompact ? styles.sectionCompact : ''}`}>
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
              Today&rsquo;s slate is still pending ({todayPendingCount} pick{todayPendingCount === 1 ? '' : 's'}).
              Showing last settled results{todayPendingLabel ? ` from ${todayPendingLabel}` : ''}.
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

      {/* Per-pick report */}
      {displayPicks.length > 0 ? (
        <div className={styles.picksList}>
          {!isCompact && (
            <div className={styles.picksHeader}>
              <span>Pick-by-Pick Results</span>
              <span className={styles.picksHeaderHint}>sorted by result</span>
            </div>
          )}
          {isCompact && (
            <div className={styles.picksHeader}>
              <span>Top Results</span>
              <span className={styles.picksHeaderHint}>
                {sortedPicks.length > displayPicks.length
                  ? `showing ${displayPicks.length} of ${sortedPicks.length}`
                  : 'sorted by result'}
              </span>
            </div>
          )}
          {displayPicks.map(p => <PickRow key={p.id || p.pickKey} pick={p} />)}
        </div>
      ) : (
        !isCompact && (
          <p className={styles.noPicks}>
            Per-pick detail is unavailable for this slate. The summary above reflects the persisted scorecard row.
          </p>
        )
      )}

      {isCompact && (
        <div className={styles.compactCtaRow}>
          <a href={insightsHref} className={styles.compactCta}>
            View full scorecard &rarr;
          </a>
        </div>
      )}

      {/* Rolling performance — full view only */}
      {!isCompact && <RollingPerformance perf={perf} />}

      {/* Model grading explainer — full view only */}
      {!isCompact && (
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
      )}
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
