/**
 * NFL Season Intelligence — where the season is heading.
 *
 * 1. Playoff picture: current seeds in each conference and who is chasing.
 * 2. Projections: schedule-aware projected wins and simulated playoff,
 *    division and top-seed probabilities for all 32 teams, sortable.
 * 3. Record against scoring: who has won more or fewer games than their
 *    point differential supports.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import SEOHead from '../../components/seo/SEOHead';
import { fetchNflSeasonModel } from '../../api/nfl';
import NflLogo from '../../components/nfl/NflLogo';
import s from '../../components/nfl/nfl.module.css';
import { trackFilterChange } from '../../analytics/sportEvents';

function fmtOdds(v) { return v == null ? '—' : v > 0 ? `+${v}` : `${v}`; }
function fmtSigned(v, digits = 1) { return v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(digits)}`; }
function signClass(v) { return v == null || v === 0 ? '' : v > 0 ? s.pos : s.neg; }

function pctText(v) {
  if (v == null) return '—';
  if (v >= 0.995) return '>99%';
  if (v > 0 && v < 0.005) return '<1%';
  return `${Math.round(v * 100)}%`;
}

function Meter({ value }) {
  if (value == null) return <span className={s.muted}>{'—'}</span>;
  return (
    <span className={s.meter}>
      <span className={s.meterTrack}><span className={s.meterFill} style={{ width: `${Math.round(value * 100)}%` }} /></span>
      <span className={s.meterValue}>{pctText(value)}</span>
    </span>
  );
}

function TeamCell({ team, to, lead }) {
  return (
    <span className={s.teamCell}>
      {lead}
      <NflLogo slug={team.slug} />
      <Link to={to}>
        <span className={s.nameFull}>{team.name}</span>
        <span className={s.nameShort}>{team.nickname || team.name}</span>
      </Link>
    </span>
  );
}

function PictureColumn({ conference, picture, bySlug, buildPath }) {
  const field = (picture?.in || []).map((slug) => bySlug[slug]).filter(Boolean);
  const hunt = (picture?.hunt || []).map((slug) => bySlug[slug]).filter(Boolean);
  const row = (t, cut) => (
    <tr key={t.slug} className={cut ? s.rowCut : undefined}>
      <td>
        <TeamCell
          team={t}
          to={buildPath(`/teams/${t.slug}`)}
          lead={<span className={`${s.seed} ${t.playoffSeed > 7 ? s.seedOut : ''}`}>{t.playoffSeed}</span>}
        />
      </td>
      <td className={`${s.right} ${s.num}`}><strong>{t.record}</strong></td>
      <td className={`${s.right} ${s.hideSm} ${s.muted}`}>{t.playoffSeed <= 4 ? 'Division leader' : t.playoffSeed <= 7 ? 'Wild card' : 'In the hunt'}</td>
      <td className={s.right}><Meter value={t.playoffPct} /></td>
    </tr>
  );
  return (
    <div className={`${s.card} ${s.cardFlush}`}>
      <div className={s.divisionHead}>
        <span>{conference}</span>
        <span className={s.muted}>Playoff odds</span>
      </div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <tbody>
            {field.map((t, i) => row(t, i === field.length - 1 && hunt.length > 0))}
            {hunt.map((t) => row(t, false))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const COLUMNS = [
  { key: 'projectedWins', label: 'Proj. wins', title: 'Wins to date plus the win probability of every remaining game' },
  { key: 'playoffPct', label: 'Playoffs', meter: true },
  { key: 'divisionPct', label: 'Division', hideSm: true },
  { key: 'topSeedPct', label: 'No. 1 seed', hideSm: true },
  { key: 'rating', label: 'Rating', title: 'Points better than an average team' },
  { key: 'sos', label: 'SOS', hideSm: true, title: 'Average rating of opponents played so far' },
  { key: 'luck', label: 'Luck', hideSm: true, title: 'Wins above what the scoring margin supports' },
  { key: 'titleImpliedPct', label: 'Title mkt', title: 'Share of the Super Bowl market' },
];

export default function NflSeasonModel() {
  const { buildPath } = useWorkspace();
  const [data, setData] = useState(null);
  const [sortKey, setSortKey] = useState('projectedWins');
  const [conference, setConference] = useState('all');

  useEffect(() => {
    let cancelled = false;
    fetchNflSeasonModel().then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, []);

  const teams = useMemo(() => data?.teams || [], [data]);
  const bySlug = useMemo(() => Object.fromEntries(teams.map((t) => [t.slug, t])), [teams]);
  const sorted = useMemo(() => {
    const list = conference === 'all' ? teams : teams.filter((t) => t.conference === conference);
    return [...list].sort((a, b) => (b[sortKey] ?? -Infinity) - (a[sortKey] ?? -Infinity) || (b.projectedWins ?? 0) - (a.projectedWins ?? 0));
  }, [teams, sortKey, conference]);

  const luckiest = useMemo(
    () => [...teams].filter((t) => t.luck != null).sort((a, b) => b.luck - a.luck),
    [teams],
  );
  const overperformers = luckiest.filter((t) => t.luck >= 0.8).slice(0, 4);
  const underperformers = luckiest.filter((t) => t.luck <= -0.8).slice(-4).reverse();

  const hasGames = teams.some((t) => t.wins + t.losses + t.ties > 0);
  const hasSim = teams.some((t) => t.playoffPct != null && t.gamesRemaining > 0);
  const hasTitle = teams.some((t) => t.titleImpliedPct != null);
  const columns = COLUMNS.filter((c) => (c.key === 'titleImpliedPct' ? hasTitle : true));
  const weekLabel = data?.week != null ? `Through Week ${Math.max(0, data.week - 1)}` : null;

  return (
    <div className={s.page}>
      <SEOHead
        title="NFL Season Intelligence: Projected Wins, Playoff Odds & Power Ratings"
        description="Schedule-aware projected wins, simulated playoff, division and top-seed odds, and power ratings for all 32 NFL teams."
      />
      <header className={s.pageHeader}>
        <span className={s.eyebrow}>NFL{weekLabel ? ` · ${weekLabel}` : ''}</span>
        <h1 className={s.pageTitle}>Season Intelligence</h1>
        <p className={s.pageSubtitle}>
          The playoff picture today, and where the ratings say the season is heading: projected wins and playoff
          odds from {data?.meta?.sims ? data.meta.sims.toLocaleString() : 'thousands of'} simulated runs of the remaining schedule.
        </p>
      </header>

      {data === null ? (
        <>
          <div className={s.grid2}><div className={s.skeleton} style={{ minHeight: 360 }} /><div className={s.skeleton} style={{ minHeight: 360 }} /></div>
          <div className={s.skeleton} style={{ minHeight: 420 }} />
        </>
      ) : !hasGames ? (
        <div className={s.empty}>
          <span className={s.emptyTitle}>The season has not produced results yet</span>
          Projections appear once games have been played.
        </div>
      ) : (
        <>
          <section className={s.section}>
            <div className={s.sectionHead}>
              <div>
                <h2 className={s.sectionTitle}>Playoff picture</h2>
                <p className={s.sectionSub}>Current seeds with the league’s tiebreakers applied. Seven teams qualify from each conference.</p>
              </div>
            </div>
            <div className={s.grid2}>
              <PictureColumn conference="AFC" picture={data.picture?.AFC} bySlug={bySlug} buildPath={buildPath} />
              <PictureColumn conference="NFC" picture={data.picture?.NFC} bySlug={bySlug} buildPath={buildPath} />
            </div>
          </section>

          <section className={s.section}>
            <div className={s.sectionHead}>
              <div>
                <h2 className={s.sectionTitle}>Projections</h2>
                <p className={s.sectionSub}>
                  {hasSim ? `${data.meta.gamesRemaining} games left to play. Select a column to sort.` : 'The regular season is complete.'}
                </p>
              </div>
              <div className={s.tabs} role="tablist" aria-label="Conference">
                {['all', 'AFC', 'NFC'].map((c) => (
                  <button key={c} type="button" role="tab" aria-selected={conference === c} className={`${s.tab} ${conference === c ? s.tabActive : ''}`} onClick={() => {
                    setConference(c);
                    trackFilterChange({ sport: 'nfl', page: 'season_model', filter: 'conference', value: c });
                  }}>
                    {c === 'all' ? 'All' : c}
                  </button>
                ))}
              </div>
            </div>
            <div className={`${s.card} ${s.cardFlush}`}>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th className={s.right}>Record</th>
                      {columns.map((c) => (
                        <th
                          key={c.key}
                          className={`${s.right} ${c.hideSm ? s.hideSm : ''}`}
                          aria-sort={sortKey === c.key ? 'descending' : 'none'}
                        >
                          <button
                            type="button"
                            className={`${s.thBtn} ${sortKey === c.key ? s.thActive : ''}`}
                            onClick={() => {
                              setSortKey(c.key);
                              trackFilterChange({ sport: 'nfl', page: 'season_model', filter: 'sort', value: c.key });
                            }}
                            title={c.title}
                          >
                            {c.label}{sortKey === c.key ? ' ↓' : ''}
                          </button>
                        </th>
                      ))}
                      <th className={`${s.right} ${s.hideSm}`}>Title</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((t, i) => (
                      <tr key={t.slug}>
                        <td><TeamCell team={t} to={buildPath(`/teams/${t.slug}`)} lead={<span className={s.rank}>{i + 1}</span>} /></td>
                        <td className={`${s.right} ${s.num}`}>{t.record}</td>
                        {columns.map((c) => {
                          const v = t[c.key];
                          const cls = `${s.right} ${s.num} ${c.hideSm ? s.hideSm : ''}`;
                          if (c.key === 'projectedWins') return <td key={c.key} className={cls}><strong>{v != null ? v.toFixed(1) : '—'}</strong></td>;
                          if (c.meter) return <td key={c.key} className={cls}><Meter value={v} /></td>;
                          if (c.key === 'rating' || c.key === 'sos' || c.key === 'luck') return <td key={c.key} className={`${cls} ${signClass(v)}`}>{fmtSigned(v)}</td>;
                          if (c.key === 'titleImpliedPct') return <td key={c.key} className={cls}>{v != null ? `${(v * 100).toFixed(1)}%` : '—'}</td>;
                          return <td key={c.key} className={cls}>{pctText(v)}</td>;
                        })}
                        <td className={`${s.right} ${s.num} ${s.hideSm}`}>{fmtOdds(t.titleOdds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {(overperformers.length > 0 || underperformers.length > 0) && (
            <section className={s.section}>
              <div className={s.sectionHead}>
                <div>
                  <h2 className={s.sectionTitle}>Record against scoring</h2>
                  <p className={s.sectionSub}>
                    Wins above or below what each team’s points for and against would normally produce. Large gaps tend to close.
                  </p>
                </div>
              </div>
              <div className={s.grid2}>
                {[['Winning more than their margin supports', overperformers], ['Winning less than their margin supports', underperformers]].map(([title, list]) => (
                  <div key={title} className={`${s.card} ${s.cardFlush}`}>
                    <div className={s.divisionHead}>{title}</div>
                    {list.length === 0 ? (
                      <p className={s.note} style={{ padding: 14 }}>No team is far enough from its margin to list.</p>
                    ) : (
                      <table className={s.table}>
                        <tbody>
                          {list.map((t) => (
                            <tr key={t.slug}>
                              <td><TeamCell team={t} to={buildPath(`/teams/${t.slug}`)} /></td>
                              <td className={`${s.right} ${s.num}`}>{t.record}</td>
                              <td className={`${s.right} ${s.num} ${s.muted}`}>{t.pointDiff != null ? `${t.pointDiff > 0 ? '+' : ''}${t.pointDiff} pts` : ''}</td>
                              <td className={`${s.right} ${s.num} ${signClass(t.luck)}`}><strong>{fmtSigned(t.luck)} wins</strong></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className={s.note}>
            Playoff, division and top-seed odds come from simulating the remaining schedule with the power ratings.
            Tiebreakers in the simulation are simplified (head-to-head, division record, conference record, then
            rating), so a team on the bubble can be off by a few points. Current seeds in the playoff picture use the
            league’s full tiebreakers.
            {data.meta?.scheduleComplete === false ? ' Part of the remaining schedule could not be loaded, so projections may be incomplete.' : ''}
            {data.meta?.ratingSource === 'standings' ? ' Ratings are currently based on points for and against only; opponent adjustment returns when game logs load.' : ''}
          </p>
        </>
      )}
    </div>
  );
}
