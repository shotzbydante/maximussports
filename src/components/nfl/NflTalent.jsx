/**
 * Roster talent sections for the team page and the game matchup page.
 *
 * Shows where a roster is strong and thin: position-group grades with
 * league ranks, the counted starters with each rating behind their
 * Maximus score, and the unit-against-unit edges for a game.
 * Context only: none of it moves a fair price.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import NflLogo from './NflLogo';
import s from './nfl.module.css';
import t from './talent.module.css';
import { fetchNflTeamTalent, fetchNflGameTalent } from '../../api/nfl';
import {
  ordinal, unitPlayers, talentSentence, OFFENSE_GROUPS, DEFENSE_GROUPS, OFFENSE_UNITS,
} from '../../features/nfl/talent/talentView';

const UNIT_KEY = {
  quarterback: 'QB', 'pass protection': 'Pass protection', receivers: 'Receivers', 'run game': 'Run game',
  'pass defense': 'Pass defense', 'pass rush': 'Pass rush', coverage: 'Coverage', 'run defense': 'Run defense',
};
const TIER_CLASS = { Elite: 'tierElite', Good: 'tierGood', Average: 'tierAverage', 'Below average': 'tierBelow' };
const cap = (v) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : '');
const fmt = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? `${v}` : v.toFixed(1)) : '—');
const signed = (v) => (typeof v === 'number' ? `${v > 0 ? '+' : ''}${v.toFixed(1)}` : '—');
const tone = (rank, of = 32) => (rank == null ? '' : rank <= 10 ? t.strong : rank > of - 10 ? t.weak : '');

function Method({ data }) {
  const w = data.weights || {};
  const pct = (v) => `${Math.round((v || 0) * 100)}%`;
  return (
    <p className={s.footnote}>
      Maximus score blends a player&rsquo;s Madden overall ({pct(w.madden)}), his rank on PFF&rsquo;s position list ({pct(w.pff)})
      {' '}and 2026 production ({pct(w.production)}), using the parts he has. A group grade averages the starters counted there.
      {data.week ? ` Week ${data.week} snapshot.` : ''} {data.note}
    </p>
  );
}

/** Grade on a 60 to 100 track, with a tick at the league average. */
function GradeBar({ grade, average, rank }) {
  const at = (v) => `${Math.max(0, Math.min(100, ((v - 60) / 40) * 100))}%`;
  return (
    <span className={t.bar} aria-hidden>
      <span className={`${t.barFill} ${tone(rank)}`} style={{ width: typeof grade === 'number' ? at(grade) : 0 }} />
      {typeof average === 'number' && <span className={t.barTick} style={{ left: at(average) }} />}
    </span>
  );
}

function GroupTile({ row }) {
  return (
    <div className={t.tile}>
      <div className={t.tileTop}>
        <span className={t.tileLabel}>{row.label}</span>
        <span className={`${t.tileRank} ${tone(row.rank)}`}>{row.rank ? ordinal(row.rank) : '—'}</span>
      </div>
      <span className={`${t.tileGrade} ${s.num}`}>{fmt(row.grade)}</span>
      <GradeBar grade={row.grade} average={row.average} rank={row.rank} />
    </div>
  );
}

function Tier({ tier }) {
  return tier ? <span className={`${t.tier} ${t[TIER_CLASS[tier]] || ''}`}>{tier}</span> : null;
}

function PlayersTable({ players, title }) {
  if (!players.length) return null;
  return (
    <div className={`${s.card} ${s.cardFlush}`}>
      <div className={t.tableTitle}>{title}</div>
      <div className={s.tableWrap}>
        <table className={`${s.table} ${s.tableCompact}`}>
          <thead>
            <tr>
              <th>Player</th>
              <th>Pos</th>
              <th className={s.right}>Madden</th>
              <th className={`${s.right} ${s.hideSm}`}>PFF rank</th>
              <th className={`${s.right} ${s.hideSm}`}>Production</th>
              <th className={s.right}>Maximus</th>
              <th className={`${s.right} ${s.hideSm}`}>Pos. rank</th>
              <th className={s.right}>Tier</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={`${p.group}-${p.name}`}>
                <td className={s.cellStrong}>
                  {p.name}{p.xFactor && <span className={t.xf} title="Madden X-Factor">X</span>}
                </td>
                <td>{p.pos}</td>
                <td className={`${s.right} ${s.num}`}>{fmt(p.madden)}</td>
                <td className={`${s.right} ${s.num} ${s.hideSm}`}>{p.pffRank != null ? `#${p.pffRank}` : '—'}</td>
                <td className={`${s.right} ${s.num} ${s.hideSm}`}>{fmt(p.production)}</td>
                <td className={`${s.right} ${s.num} ${s.cellStrong}`}>{fmt(p.score)}</td>
                <td className={`${s.right} ${s.num} ${s.hideSm}`}>{p.groupRank != null ? `${p.group} ${p.groupRank}` : '—'}</td>
                <td className={s.right}><Tier tier={p.tier} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** One unit against the unit across from it, with the edge drawn from the middle. */
function EdgeRow({ m, teams, showPlayers }) {
  const off = teams[m.offenseTeam];
  const def = teams[m.defenseTeam];
  const width = `${Math.min(50, (Math.abs(m.edge) / 20) * 50)}%`;
  const toOffense = m.edge > 0;
  const names = (team, unit) => unitPlayers(team, UNIT_KEY[unit]).slice(0, 3).map((p) => `${p.name} ${fmt(p.score)}`).join(' · ');
  return (
    <div className={t.edge}>
      <div className={t.edgeSide}>
        <NflLogo slug={off?.slug} size={22} />
        <span>
          <span className={t.edgeUnit}>{cap(m.offense)}</span>
          <span className={`${t.edgeGrade} ${s.num}`}>{fmt(m.offenseGrade)}</span>
          {showPlayers && off && <span className={t.edgeNames}>{names(off, m.offense)}</span>}
        </span>
      </div>
      <div className={t.edgeMid}>
        <span className={t.edgeTrack} aria-hidden>
          {m.size !== 'even' && (
            <span
              className={`${t.edgeFill} ${toOffense ? t.edgeToOffense : t.edgeToDefense}`}
              style={toOffense ? { right: '50%', width } : { left: '50%', width }}
            />
          )}
        </span>
        <span className={`${t.chip} ${m.size === 'big' ? t.chipBig : m.size === 'edge' ? t.chipEdge : ''}`}>
          {m.size === 'even' ? 'Even' : `${m.favours} ${signed(Math.abs(m.edge))}`}
        </span>
      </div>
      <div className={`${t.edgeSide} ${t.edgeSideRight}`}>
        <span>
          <span className={t.edgeUnit}>{cap(m.defense)}</span>
          <span className={`${t.edgeGrade} ${s.num}`}>{fmt(m.defenseGrade)}</span>
          {showPlayers && def && <span className={t.edgeNames}>{names(def, m.defense)}</span>}
        </span>
        <NflLogo slug={def?.slug} size={22} />
      </div>
    </div>
  );
}

function Matchups({ data, showPlayers = false }) {
  const { matchup } = data;
  if (!matchup) return null;
  const teams = Object.fromEntries(data.teams.map((x) => [x.abbrev, x]));
  const order = OFFENSE_UNITS.map((u) => Object.keys(UNIT_KEY).find((k) => UNIT_KEY[k] === u));
  const side = (code) => matchup.matchups
    .filter((m) => m.offenseTeam === code)
    .sort((a, b) => order.indexOf(a.offense) - order.indexOf(b.offense));
  const [away, home] = data.teams;
  return (
    <div className={t.matchGrid}>
      {[away, home].map((x) => (
        <div key={x.abbrev} className={s.card}>
          <div className={t.matchHead}>
            <NflLogo slug={x.slug} size={22} />
            <span>When {x.nickname} have the ball</span>
          </div>
          {side(x.abbrev).map((m) => <EdgeRow key={m.offense} m={m} teams={teams} showPlayers={showPlayers} />)}
        </div>
      ))}
    </div>
  );
}

function leanLine(data) {
  const { matchup, teams } = data;
  if (!matchup) return '';
  const name = (code) => teams.find((x) => x.abbrev === code)?.nickname || code;
  const top = matchup.matchups[0];
  const biggest = top && top.size !== 'even'
    ? ` The biggest gap: ${name(top.favours)} ${top.favours === top.offenseTeam ? top.offense : top.defense}, by ${Math.abs(top.edge).toFixed(1)}.`
    : '';
  if (!matchup.leansTo) return `Roster talent is close to even across the eight unit matchups.${biggest}`;
  return `Roster talent leans to the ${name(matchup.leansTo)} by ${Math.abs(matchup.netHome).toFixed(1)} points across the eight unit matchups.${biggest}`;
}

/** Team page: ranks, position groups, starters, and this week's unit edges. */
export function TeamTalent({ team, game }) {
  const { buildPath } = useWorkspace();
  const [data, setData] = useState(null);
  const [week, setWeek] = useState(null);
  const away = game?.teams?.away?.slug;
  const home = game?.teams?.home?.slug;
  const upcoming = Boolean(away && home && !game?.gameState?.isFinal);

  useEffect(() => {
    let cancelled = false;
    fetchNflTeamTalent(team.slug).then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, [team.slug]);

  useEffect(() => {
    if (!upcoming) return undefined;
    let cancelled = false;
    fetchNflGameTalent({ away, home }).then((d) => { if (!cancelled) setWeek(d); });
    return () => { cancelled = true; };
  }, [upcoming, away, home]);

  if (data === null) return <section className={s.section}><h2 className={s.sectionTitle}>Roster talent</h2><div className={s.skeleton} /></section>;
  const me = data.available ? data.teams[0] : null;
  if (!me) return null;
  const offense = me.players.filter((p) => OFFENSE_GROUPS.includes(p.group));
  const defense = me.players.filter((p) => DEFENSE_GROUPS.includes(p.group));

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>Roster talent</h2>
        <span className={s.sectionSub}>Position groups, starters and ratings</span>
      </div>

      <div className={s.stats}>
        {[['Overall talent', me.overall], ['Offense', me.offense], ['Defense', me.defense]].map(([label, v]) => (
          <div key={label} className={s.stat}>
            <span className={s.statLabel}>{label}</span>
            <span className={s.statValue}>{fmt(v.grade)}</span>
            <span className={`${s.statSub} ${tone(v.rank)}`}>{v.rank ? `${ordinal(v.rank)} of ${data.teamCount}` : ''}</span>
          </div>
        ))}
        <div className={s.stat}>
          <span className={s.statLabel}>Strongest</span>
          <span className={s.statValue}>{me.strengths[0]?.label}</span>
          <span className={`${s.statSub} ${t.strong}`}>{me.strengths.map((r) => `${r.group} ${ordinal(r.rank)}`).join(' · ')}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>Thinnest</span>
          <span className={s.statValue}>{me.weaknesses[0]?.label}</span>
          <span className={`${s.statSub} ${t.weak}`}>{me.weaknesses.map((r) => `${r.group} ${ordinal(r.rank)}`).join(' · ')}</span>
        </div>
      </div>

      <p className={t.sentence}>{talentSentence(me, `The ${team.nickname}`)}</p>

      <div className={t.tiles}>{me.groups.map((row) => <GroupTile key={row.group} row={row} />)}</div>
      <p className={s.footnote}>Grade and league rank for each position group. The tick marks the league average. Blue is top ten, orange is bottom ten.</p>

      {week?.available && week.matchup && (
        <>
          <div className={s.sectionHead}>
            <h3 className={t.subTitle}>This week&rsquo;s talent matchup</h3>
            <Link to={buildPath(`/games/${away}-at-${home}`)}>Full matchup</Link>
          </div>
          <p className={t.sentence}>{leanLine(week)}</p>
          <Matchups data={week} />
        </>
      )}

      <h3 className={t.subTitle}>Starters and ratings</h3>
      <PlayersTable players={offense} title="Offense" />
      <PlayersTable players={defense} title="Defense" />
      <Method data={data} />
    </section>
  );
}

/** Game page: unit edges with the players behind them, groups side by side, both starting groups. */
export function MatchupTalent({ away, home }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchNflGameTalent({ away, home }).then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, [away, home]);

  if (data === null) return <div className={s.skeleton} />;
  if (!data.available || data.teams.length < 2) return <div className={s.empty}>Roster talent is unavailable for this game.</div>;
  const [a, h] = data.teams;
  const pairs = a.groups.map((row, i) => ({ away: row, home: h.groups[i] }));

  return (
    <>
      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>Talent matchup</h2>
          <span className={s.sectionSub}>Unit against unit, with the starters behind each grade</span>
        </div>
        <div className={s.stats}>
          {[a, h].map((x) => (
            <div key={x.abbrev} className={s.stat}>
              <span className={s.statLabel}>{x.nickname} talent</span>
              <span className={s.statValue}>{fmt(x.overall.grade)}</span>
              <span className={`${s.statSub} ${tone(x.overall.rank)}`}>
                {ordinal(x.overall.rank)} overall · {ordinal(x.offense.rank)} offense · {ordinal(x.defense.rank)} defense
              </span>
            </div>
          ))}
          <div className={s.stat}>
            <span className={s.statLabel}>Net talent edge</span>
            <span className={s.statValue}>
              {data.matchup?.leansTo ? `${data.matchup.leansTo} ${signed(Math.abs(data.matchup.netHome))}` : 'Even'}
            </span>
            <span className={s.statSub}>Sum of eight unit matchups</span>
          </div>
        </div>
        <p className={t.sentence}>{leanLine(data)}</p>
        <Matchups data={data} showPlayers />
        <p className={s.footnote}>
          Each edge is the offense unit&rsquo;s distance above league average minus the defense unit&rsquo;s. Three points is an edge, six a big one.
          The bar points to the side that holds it.
        </p>
      </section>

      <section className={s.section}>
        <h2 className={s.sectionTitle}>Position groups, side by side</h2>
        <div className={`${s.card} ${s.cardFlush}`}>
          <div className={s.tableWrap}>
            <table className={`${s.table} ${s.tableCompact}`}>
              <thead>
                <tr>
                  <th className={s.right}><span className={t.thTeam}><NflLogo slug={a.slug} size={18} />{a.abbrev}</span></th>
                  <th className={s.right}>Rank</th>
                  <th className={t.center}>Group</th>
                  <th>Rank</th>
                  <th><span className={t.thTeam}><NflLogo slug={h.slug} size={18} />{h.abbrev}</span></th>
                </tr>
              </thead>
              <tbody>
                {pairs.map(({ away: x, home: y }) => {
                  const diff = (x.grade ?? 0) - (y.grade ?? 0);
                  return (
                    <tr key={x.group}>
                      <td className={`${s.right} ${s.num} ${diff >= 3 ? s.cellStrong : ''}`}>{fmt(x.grade)}</td>
                      <td className={`${s.right} ${s.num} ${tone(x.rank)}`}>{ordinal(x.rank)}</td>
                      <td className={t.center}>{x.label}</td>
                      <td className={`${s.num} ${tone(y.rank)}`}>{ordinal(y.rank)}</td>
                      <td className={`${s.num} ${diff <= -3 ? s.cellStrong : ''}`}>{fmt(y.grade)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {[a, h].map((x) => (
        <section key={x.abbrev} className={s.section}>
          <h2 className={s.sectionTitle}>{x.name}: starters and ratings</h2>
          <PlayersTable players={x.players.filter((p) => OFFENSE_GROUPS.includes(p.group))} title="Offense" />
          <PlayersTable players={x.players.filter((p) => DEFENSE_GROUPS.includes(p.group))} title="Defense" />
        </section>
      ))}
      <Method data={data} />
    </>
  );
}
