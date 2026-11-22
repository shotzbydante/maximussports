/**
 * NflScorecardReport — how the model's NFL picks have done.
 *
 * Shows the trailing window (last week plus the week in progress), the
 * season record, the split between recommended and tracking picks, and
 * every graded pick by game day. Reads /api/nfl/picks/scorecard.
 *
 *   variant="full"      Odds Insights: every pick listed
 *   variant="embedded"  Briefing: totals only, with a link to the full list
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchNflScorecard } from '../../api/nfl';
import NflLogo from './NflLogo';
import s from './nfl.module.css';

const MARKET_LABEL = { moneyline: 'Moneyline', runline: 'Spread', total: 'Total' };

function graded(r) { return (r?.won || 0) + (r?.lost || 0) + (r?.push || 0); }
function recordText(r) {
  if (!r) return '0-0';
  return r.push > 0 ? `${r.won}-${r.lost}-${r.push}` : `${r.won}-${r.lost}`;
}
function winRate(r) {
  const decided = (r?.won || 0) + (r?.lost || 0);
  return decided > 0 ? `${Math.round((r.won / decided) * 100)}%` : null;
}
function dayLabel(ymd) {
  try {
    return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  } catch { return ymd; }
}

function RecordStat({ label, record, sub }) {
  const rate = winRate(record);
  return (
    <div className={s.stat}>
      <span className={s.statLabel}>{label}</span>
      <span className={s.statValue}>{graded(record) > 0 ? recordText(record) : '—'}</span>
      <span className={s.statSub}>{graded(record) > 0 ? (rate ? `${rate} win rate` : 'All pushes') : (sub || 'Nothing graded yet')}</span>
    </div>
  );
}

function signed(v, digits = 1, suffix = '') {
  if (v == null || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}${suffix}`;
}
function priceText(v) {
  if (v == null || !Number.isFinite(Number(v))) return '';
  return Number(v) > 0 ? `+${v}` : `${v}`;
}

/** Units and closing-line value for one role. Hidden until something is graded. */
function PerformanceStat({ label, perf, sub }) {
  const gradedCount = (perf?.record?.won || 0) + (perf?.record?.lost || 0) + (perf?.record?.push || 0);
  if (!perf || gradedCount === 0) {
    return (
      <div className={s.stat}>
        <span className={s.statLabel}>{label}</span>
        <span className={s.statValue}>—</span>
        <span className={s.statSub}>{sub || 'Nothing graded yet'}</span>
      </div>
    );
  }
  return (
    <div className={s.stat}>
      <span className={s.statLabel}>{label}</span>
      <span className={s.statValue}>{signed(perf.units, 2, 'u')}</span>
      <span className={s.statSub}>
        {perf.roiPct != null ? `${signed(perf.roiPct, 1, '%')} return` : ''}
        {perf.clvEvPct != null ? ` · ${signed(perf.clvEvPct, 1, '%')} vs the close (${perf.clvSample})` : ''}
      </span>
    </div>
  );
}

function StatusPill({ pick }) {
  const cls = pick.status === 'won' ? s.pillWin : pick.status === 'lost' ? s.pillLoss : '';
  const text = pick.status === 'won' ? 'Won' : pick.status === 'lost' ? 'Lost' : pick.status === 'push' ? 'Push' : pick.status === 'void' ? 'Void' : 'Pending';
  return (
    <span className={`${s.pill} ${cls}`} title={pick.provisional ? 'Graded from the final score; official settlement runs overnight.' : undefined}>
      {text}{pick.provisional ? '*' : ''}
    </span>
  );
}

export default function NflScorecardReport({ variant = 'full', insightsHref = '/nfl/insights' }) {
  const [data, setData] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchNflScorecard().then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, []);

  if (data === undefined) {
    return <section className={s.section}><div className={s.skeleton} aria-busy="true" /></section>;
  }

  const hasPicks = (data?.slates || []).length > 0;
  const seasonGraded = graded(data?.season?.record);
  const anyProvisional = (data?.slates || []).some((sl) => sl.picks.some((p) => p.provisional));

  return (
    <section className={s.section} aria-label="NFL model performance">
      <div className={s.sectionHead}>
        <div>
          <h2 className={s.sectionTitle}>Model performance</h2>
          <p className={s.sectionSub}>
            Every pick is locked before kickoff and graded against the final score and the closing line.
          </p>
        </div>
        {variant === 'embedded' && <Link to={insightsHref} className={s.sectionLink}>Every graded pick →</Link>}
      </div>

      {!hasPicks && seasonGraded === 0 ? (
        <div className={s.empty}>
          <span className={s.emptyTitle}>No graded NFL picks yet</span>
          The record starts with the first slate that finishes. Picks lock in the day before kickoff
          and results post the morning after each game day.
        </div>
      ) : (
        <>
          <div className={s.stats}>
            <RecordStat label="Last 9 days" record={data.record} />
            <RecordStat label="Recommended" record={data.byPickRole?.hero} sub="Tiered picks only" />
            <RecordStat label="Spread" record={data.byMarket?.runline} />
            <RecordStat label="Moneyline" record={data.byMarket?.moneyline} />
            <RecordStat label="Total" record={data.byMarket?.total} />
            <RecordStat label="Season" record={data.season?.record} sub="Posts after the first settled slate" />
            <PerformanceStat label="Recommended units" perf={data.performance?.hero} sub="One unit per pick at the locked price" />
            <PerformanceStat label="Model leans units" perf={data.performance?.tracking} sub="Tracked, never recommended" />
          </div>

          {variant === 'full' && hasPicks && (
            <div className={`${s.card} ${s.cardFlush}`}>
              {data.slates.map((slate) => (
                <div key={slate.date}>
                  <div className={s.slateHead}>
                    <span>{dayLabel(slate.date)}</span>
                    <span className={s.num}>
                      {graded(slate.record) > 0 ? recordText(slate.record) : 'Pending'}
                      {slate.record.pending > 0 && graded(slate.record) > 0 ? ` · ${slate.record.pending} pending` : ''}
                    </span>
                  </div>
                  <div className={s.tableWrap}>
                    <table className={s.table}>
                      <thead>
                        <tr>
                          <th>Game</th>
                          <th>Pick</th>
                          <th className={s.hideSm}>Market</th>
                          <th className={s.hideSm}>Type</th>
                          <th className={`${s.right} ${s.hideSm}`}>Price</th>
                          <th className={`${s.right} ${s.hideSm}`}>Vs close</th>
                          <th className={s.hideSm}>Final</th>
                          <th className={`${s.right} ${s.hideSm}`}>Units</th>
                          <th className={s.right}>Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slate.picks.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <span className={s.teamCell}>
                                <NflLogo slug={p.awayTeam} />
                                <span>{p.awayAbbrev} @ {p.homeAbbrev}</span>
                              </span>
                            </td>
                            <td>
                              <strong>{p.label}</strong>
                              {p.why && <span className={s.pickWhy}>{/[.!?]$/.test(p.why) ? p.why : `${p.why}.`}</span>}
                              {p.review?.note && (
                                <span className={s.pickReview}><span className={s.pickReviewTag}>What happened</span> {p.review.note}</span>
                              )}
                            </td>
                            <td className={s.hideSm}>{MARKET_LABEL[p.market] || p.market}</td>
                            <td className={s.hideSm}>
                              {p.pickRole === 'hero'
                                ? <span className={`${s.pill} ${s.pillAccent}`}>Recommended</span>
                                : <span className={s.muted}>Tracking</span>}
                            </td>
                            <td className={`${s.right} ${s.hideSm} ${s.num}`} title={p.book || undefined}>{priceText(p.price) || '—'}</td>
                            <td className={`${s.right} ${s.hideSm} ${s.num}`} title="Expected value of this ticket against the closing consensus">
                              {signed(p.clvEv != null ? p.clvEv * 100 : null, 1, '%') || '—'}
                            </td>
                            <td className={`${s.hideSm} ${s.num}`}>{p.finalScore || '—'}</td>
                            <td className={`${s.right} ${s.hideSm} ${s.num}`}>{signed(p.units, 2) || '—'}</td>
                            <td className={s.right}><StatusPill pick={p} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className={s.note}>
            Recommended picks are locked at a line, price and book when published; that ticket is what is graded.
            Tracking picks are the model’s lean on every other market, locked a day before kickoff; they are not
            recommendations. “Vs close” is the value of the ticket against the closing line, the earliest sign of
            whether picks are any good.
            {anyProvisional ? ' Results marked * are graded from the final score and become official overnight.' : ''}
          </p>
        </>
      )}
    </section>
  );
}
