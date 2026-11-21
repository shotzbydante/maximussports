/**
 * NFL Team Intel — every team by division, with record, playoff seed,
 * point differential, power rating and Super Bowl price.
 * A second view ranks all 32 by power rating.
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import SEOHead from '../../components/seo/SEOHead';
import { NFL_DIVISIONS } from '../../sports/nfl/teams';
import NflLogo from '../../components/nfl/NflLogo';
import { fetchNflTeamBoard, fetchNflChampionshipOdds } from '../../api/nfl';
import s from '../../components/nfl/nfl.module.css';

function fmtOdds(v) { return v == null ? '—' : v > 0 ? `+${v}` : `${v}`; }
function fmtSigned(v) { return v == null ? '—' : v > 0 ? `+${v}` : `${v}`; }
function signClass(v) { return v == null || v === 0 ? '' : v > 0 ? s.pos : s.neg; }

function Seed({ seed }) {
  if (seed == null) return <span className={s.muted}>{'—'}</span>;
  return <span className={`${s.seed} ${seed > 7 ? s.seedOut : ''}`} title={seed <= 7 ? 'In the playoff field' : 'Outside the playoff field'}>{seed}</span>;
}

function TeamCell({ team, to, rank }) {
  return (
    <span className={s.teamCell}>
      {rank != null && <span className={s.rank}>{rank}</span>}
      <NflLogo slug={team.slug} />
      <Link to={to}>
        <span className={s.nameFull}>{team.name}</span>
        <span className={s.nameShort}>{team.nickname || team.name}</span>
      </Link>
    </span>
  );
}

function DivisionTable({ division, teams, odds, buildPath }) {
  return (
    <div className={`${s.card} ${s.cardFlush}`}>
      <div className={s.divisionHead}>{division}</div>
      <div className={s.tableWrap}>
        <table className={`${s.table} ${s.tableCompact}`}>
          <thead>
            <tr>
              <th>Team</th>
              <th className={s.right}>Record</th>
              <th className={s.right}>Seed</th>
              <th className={`${s.right} ${s.hideSm}`}>Diff</th>
              <th className={s.right}>Rating</th>
              <th className={s.right}>Title</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.slug}>
                <td><TeamCell team={t} to={buildPath(`/teams/${t.slug}`)} /></td>
                <td className={`${s.right} ${s.num}`}><strong>{t.record}</strong></td>
                <td className={s.right}><Seed seed={t.playoffSeed} /></td>
                <td className={`${s.right} ${s.num} ${s.hideSm} ${signClass(t.pointDiff)}`}>{fmtSigned(t.pointDiff)}</td>
                <td className={`${s.right} ${s.num} ${signClass(t.rating)}`}>{fmtSigned(t.rating)}</td>
                <td className={`${s.right} ${s.num}`}>{fmtOdds(odds[t.slug]?.bestChanceAmerican)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function NflTeams() {
  const { buildPath } = useWorkspace();
  const [board, setBoard] = useState(null);
  const [odds, setOdds] = useState({});
  const [view, setView] = useState('divisions');

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchNflTeamBoard(), fetchNflChampionshipOdds()]).then(([b, o]) => {
      if (cancelled) return;
      setBoard(b.board || []);
      setOdds(o.odds || {});
    });
    return () => { cancelled = true; };
  }, []);

  const byDivision = useMemo(() => {
    const map = Object.fromEntries(NFL_DIVISIONS.map((d) => [d, []]));
    for (const t of board || []) map[t.division]?.push(t);
    for (const list of Object.values(map)) {
      list.sort((a, b) => (a.divisionRank ?? 9) - (b.divisionRank ?? 9) || b.pct - a.pct);
    }
    return map;
  }, [board]);

  const byRating = useMemo(
    () => [...(board || [])].sort((a, b) => (a.powerRank ?? 99) - (b.powerRank ?? 99)),
    [board],
  );

  const hasRatings = (board || []).some((t) => t.rating != null);

  return (
    <div className={s.page}>
      <SEOHead
        title="NFL Team Intel: Standings, Power Ratings & Super Bowl Odds"
        description="Every NFL team by division with record, playoff seed, point differential, Maximus power rating and Super Bowl odds."
      />
      <header className={s.pageHeader}>
        <span className={s.eyebrow}>NFL</span>
        <div className={s.headerRow}>
          <div>
            <h1 className={s.pageTitle}>Team Intel</h1>
            <p className={s.pageSubtitle}>
              All 32 teams with record, playoff seed, power rating and title price. Pick a team for its schedule, news and outlook.
            </p>
          </div>
          <div className={s.tabs} role="tablist" aria-label="Team view">
            <button type="button" role="tab" aria-selected={view === 'divisions'} className={`${s.tab} ${view === 'divisions' ? s.tabActive : ''}`} onClick={() => setView('divisions')}>Divisions</button>
            <button type="button" role="tab" aria-selected={view === 'power'} className={`${s.tab} ${view === 'power' ? s.tabActive : ''}`} onClick={() => setView('power')}>Power ratings</button>
          </div>
        </div>
      </header>

      {board === null ? (
        <div className={s.gridDivisions}>
          {Array.from({ length: 4 }, (_, i) => <div key={i} className={s.skeleton} style={{ minHeight: 220 }} />)}
        </div>
      ) : board.length === 0 ? (
        <div className={s.empty}>
          <span className={s.emptyTitle}>Standings are unavailable right now</span>
          Try again in a minute.
        </div>
      ) : view === 'divisions' ? (
        ['AFC', 'NFC'].map((conf) => (
          <section key={conf} className={s.section}>
            <h2 className={s.sectionTitle}>{conf}</h2>
            <div className={s.gridDivisions}>
              {NFL_DIVISIONS.filter((d) => d.startsWith(conf)).map((d) => (
                <DivisionTable key={d} division={d} teams={byDivision[d]} odds={odds} buildPath={buildPath} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className={`${s.card} ${s.cardFlush}`}>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Team</th>
                  <th className={s.right}>Rating</th>
                  <th className={`${s.right} ${s.hideSm}`}>Offense</th>
                  <th className={`${s.right} ${s.hideSm}`}>Defense</th>
                  <th className={s.right}>Record</th>
                  <th className={`${s.right} ${s.hideSm}`}>Diff</th>
                  <th className={`${s.right} ${s.hideSm}`}>Streak</th>
                  <th className={s.right}>Seed</th>
                  <th className={s.right}>Title</th>
                </tr>
              </thead>
              <tbody>
                {byRating.map((t) => (
                  <tr key={t.slug}>
                    <td><TeamCell team={t} to={buildPath(`/teams/${t.slug}`)} rank={t.powerRank} /></td>
                    <td className={`${s.right} ${s.num} ${signClass(t.rating)}`}><strong>{fmtSigned(t.rating)}</strong></td>
                    <td className={`${s.right} ${s.num} ${s.hideSm} ${signClass(t.offense)}`}>{fmtSigned(t.offense)}</td>
                    <td className={`${s.right} ${s.num} ${s.hideSm} ${signClass(t.defense)}`}>{fmtSigned(t.defense)}</td>
                    <td className={`${s.right} ${s.num}`}>{t.record}</td>
                    <td className={`${s.right} ${s.num} ${s.hideSm} ${signClass(t.pointDiff)}`}>{fmtSigned(t.pointDiff)}</td>
                    <td className={`${s.right} ${s.num} ${s.hideSm}`}>{t.streak || '—'}</td>
                    <td className={s.right}><Seed seed={t.playoffSeed} /></td>
                    <td className={`${s.right} ${s.num}`}>{fmtOdds(odds[t.slug]?.bestChanceAmerican)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {board?.length > 0 && (
        <p className={s.note}>
          {hasRatings
            ? 'Rating is points better or worse than an average team on a neutral field, adjusted for opponents and split into offense and defense. Seed is the current conference playoff seed; 1 to 7 are in the field.'
            : 'Power ratings appear once the season has results to rate. Seed is the current conference playoff seed; 1 to 7 are in the field.'}
        </p>
      )}
    </div>
  );
}
