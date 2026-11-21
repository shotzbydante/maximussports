/**
 * NFL Team Detail — one team's outlook: record and seed, power rating,
 * projection, this week's game, full schedule, and its news and videos.
 */

import { useState, useEffect, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import SEOHead from '../../components/seo/SEOHead';
import NflGameCard from '../../components/nfl/NflGameCard';
import NflIntelFeed from '../../components/nfl/NflIntelFeed';
import usePinnedTeams, { getAllPinnedSlugs } from '../../hooks/usePinnedTeams';
import { useTeamPin } from '../../hooks/useTeamPin';
import { usePlan } from '../../hooks/usePlan';
import { notifyPinnedChanged } from '../../utils/pinnedSync';
import { getNflTeamBySlug } from '../../sports/nfl/teams';
import NflLogo from '../../components/nfl/NflLogo';
import { buildNflTeamIntelSummary } from '../../data/nfl/teamIntelSummary';
import {
  fetchNflTeamBoard, fetchNflChampionshipOdds, fetchNflSeasonModel, fetchNflGames, fetchNflTeamSchedule,
} from '../../api/nfl';
import s from '../../components/nfl/nfl.module.css';

const FREE_PIN_LIMIT = 3;

function fmtOdds(v) { return v == null ? '—' : v > 0 ? `+${v}` : `${v}`; }
function fmtSigned(v) { return v == null ? '—' : v > 0 ? `+${v}` : `${v}`; }
function pct(v) {
  if (v == null) return '—';
  if (v >= 0.995) return '>99%';
  if (v > 0 && v < 0.005) return '<1%';
  return `${Math.round(v * 100)}%`;
}
function ordinal(n) {
  const sfx = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (sfx[(v - 20) % 10] || sfx[v] || sfx[0]);
}
function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  catch { return ''; }
}
function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  catch { return ''; }
}

function Stat({ label, value, sub }) {
  return (
    <div className={s.stat}>
      <span className={s.statLabel}>{label}</span>
      <span className={s.statValue}>{value}</span>
      {sub && <span className={s.statSub}>{sub}</span>}
    </div>
  );
}

function ScheduleTable({ events, byeWeek, buildPath }) {
  // Slot the bye into week order so the gap in the schedule is explained.
  const rows = [...events.filter((e) => e.seasonType !== 1)];
  if (byeWeek != null && !rows.some((e) => e.week === byeWeek && e.seasonType === 2)) {
    rows.push({ id: 'bye', week: byeWeek, seasonType: 2, bye: true });
  }
  rows.sort((a, b) => (a.seasonType ?? 2) - (b.seasonType ?? 2) || (a.week ?? 0) - (b.week ?? 0));

  return (
    <div className={`${s.card} ${s.cardFlush}`}>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Week</th>
              <th>Opponent</th>
              <th className={s.hideSm}>Date</th>
              <th className={s.right}>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => e.bye ? (
              <tr key="bye">
                <td className={s.num}>{e.week}</td>
                <td colSpan={3} className={s.muted}>Bye week</td>
              </tr>
            ) : (
              <tr key={e.id}>
                <td className={s.num}>{e.seasonType === 3 ? 'Playoffs' : e.week ?? '—'}</td>
                <td>
                  <span className={s.teamCell}>
                    <span className={s.muted}>{e.neutralSite ? 'vs' : e.isHome ? 'vs' : 'at'}</span>
                    <NflLogo slug={e.opponentSlug} src={e.opponentLogo} />
                    {e.opponentSlug ? (
                      <Link to={buildPath(`/teams/${e.opponentSlug}`)}>
                        <span className={s.nameFull}>{e.opponent}</span>
                        <span className={s.nameShort}>{getNflTeamBySlug(e.opponentSlug)?.nickname || e.opponent}</span>
                      </Link>
                    ) : <span>{e.opponent}</span>}
                  </span>
                </td>
                <td className={`${s.hideSm} ${s.muted}`}>{fmtDate(e.date)}</td>
                <td className={`${s.right} ${s.num}`}>
                  {e.isFinal && e.result ? (
                    <span>
                      <strong className={e.result === 'W' ? s.pos : e.result === 'L' ? s.neg : ''}>{e.result}</strong>{' '}
                      {e.ourScore}–{e.oppScore}
                    </span>
                  ) : e.gameStatus === 'in_progress' ? (
                    <span className={`${s.pill} ${s.pillLive}`}>Live</span>
                  ) : (
                    <span className={s.muted}>{fmtTime(e.date)}{e.network ? ` · ${e.network}` : ''}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function NflTeamDetail() {
  const { slug: rawSlug } = useParams();
  const { buildPath } = useWorkspace();
  const team = getNflTeamBySlug((rawSlug || '').toLowerCase());

  if (!team) {
    return (
      <div className={s.page}>
        <div className={s.empty}>
          <span className={s.emptyTitle}>Team not found</span>
          <Link to={buildPath('/teams')}>Back to Team Intel</Link>
        </div>
      </div>
    );
  }
  // Keyed by team so navigating between teams starts from clean state.
  return <TeamDetail key={team.slug} team={team} />;
}

function TeamDetail({ team }) {
  const { buildPath } = useWorkspace();
  const { user } = useAuth();
  const { isPro } = usePlan();
  const navigate = useNavigate();
  const { isPinned, addTeam, removeTeam } = usePinnedTeams({ sport: 'nfl' });
  const { pinTeam, unpinTeam, isPinning } = useTeamPin();

  const [board, setBoard] = useState(null);
  const [odds, setOdds] = useState(null);
  const [model, setModel] = useState(null);
  const [game, setGame] = useState(null);
  const [onBye, setOnBye] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const [pinError, setPinError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchNflTeamBoard().then((b) => { if (!cancelled) setBoard(b.board.find((t) => t.slug === team.slug) || {}); });
    fetchNflChampionshipOdds().then((o) => { if (!cancelled) setOdds(o.odds[team.slug] || {}); });
    fetchNflSeasonModel().then((m) => { if (!cancelled) setModel(m.teams.find((t) => t.slug === team.slug) || {}); });
    fetchNflGames().then((g) => {
      if (cancelled) return;
      setGame(g.games.find((x) => x.teams?.home?.slug === team.slug || x.teams?.away?.slug === team.slug) || null);
      setOnBye(g.byeTeams.includes(team.slug));
    });
    fetchNflTeamSchedule(team.slug).then((d) => { if (!cancelled) setSchedule(d); });
    return () => { cancelled = true; };
  }, [team]);

  const summary = useMemo(
    () => (board ? buildNflTeamIntelSummary({ team, board, odds, model }) : ''),
    [team, board, odds, model],
  );

  const pinned = isPinned(team.slug);

  const togglePin = async () => {
    if (!user) { navigate(`/settings?next=${encodeURIComponent(buildPath(`/teams/${team.slug}`))}`); return; }
    setPinError(null);
    if (pinned) {
      removeTeam(team.slug);
      await unpinTeam(team.slug, { surface: 'nfl_team_detail' });
    } else {
      if (!isPro && getAllPinnedSlugs().length >= FREE_PIN_LIMIT) {
        setPinError(`Free plans can follow ${FREE_PIN_LIMIT} teams across all sports.`);
        return;
      }
      addTeam(team.slug);
      const result = await pinTeam(team.slug, { surface: 'nfl_team_detail', allSlugs: getAllPinnedSlugs() });
      if (!result.ok) {
        removeTeam(team.slug);
        setPinError(result.error || 'Could not follow this team.');
        return;
      }
    }
    notifyPinnedChanged(getAllPinnedSlugs(), 'home');
  };

  const b = board || {};
  const m = model || {};

  return (
    <div className={s.page}>
      <SEOHead
        title={`${team.name}: Record, Power Rating, Schedule & Odds`}
        description={`${team.name} intel: record, playoff seed, Maximus power rating, projected wins, schedule, Super Bowl odds and the latest news.`}
      />

      <header className={s.pageHeader}>
        <span className={s.breadcrumb}>
          <Link to={buildPath('/teams')}>Team Intel</Link> / {team.division}
        </span>
        <div className={s.teamHero}>
          <div className={s.teamIdentity}>
            <NflLogo slug={team.slug} size={64} className={s.teamHeroLogo} />
            <div>
              <h1 className={s.pageTitle}>{team.name}</h1>
              <div className={s.metaLine}>
                <span>{b.record ? `${b.record}` : team.division}</span>
                {b.standing && <span className={s.metaDot}>{b.standing}</span>}
                {b.streak && <span className={s.metaDot}>{b.streak}</span>}
              </div>
            </div>
          </div>
          <button
            type="button"
            className={`${s.btn} ${pinned ? '' : s.btnPrimary}`}
            onClick={togglePin}
            disabled={isPinning}
            aria-pressed={pinned}
          >
            {pinned ? 'Following' : 'Follow team'}
          </button>
        </div>
        {pinError && (
          <div className={s.notice}>
            <span>{pinError}</span>
            <Link to="/settings">Upgrade to Pro</Link>
          </div>
        )}
      </header>

      {board === null ? (
        <div className={s.skeleton} />
      ) : (
        <div className={s.stats}>
          <Stat label="Record" value={b.record || '—'} sub={b.homeRecord && b.roadRecord ? `${b.homeRecord} home · ${b.roadRecord} road` : null} />
          <Stat
            label="Playoff seed"
            value={b.playoffSeed != null ? ordinal(b.playoffSeed) : '—'}
            sub={b.playoffSeed != null ? (b.playoffSeed <= 7 ? `In the ${team.conference} field` : `Outside the ${team.conference} field`) : null}
          />
          <Stat label="Power rating" value={fmtSigned(b.rating)} sub={b.powerRank ? `${ordinal(b.powerRank)} of 32` : null} />
          <Stat label="Point diff" value={fmtSigned(b.pointDiff)} sub={b.pointsFor != null ? `${b.pointsFor} for · ${b.pointsAgainst} against` : null} />
          <Stat label="Projected wins" value={m.projectedWins != null ? m.projectedWins.toFixed(1) : '—'} sub={m.gamesRemaining != null ? `${m.gamesRemaining} games left` : null} />
          <Stat label="Playoff odds" value={pct(m.playoffPct)} sub={m.divisionPct != null ? `${pct(m.divisionPct)} to win division` : null} />
          <Stat label="Super Bowl" value={fmtOdds(odds?.bestChanceAmerican)} sub={m.titleImpliedPct != null ? `${(m.titleImpliedPct * 100).toFixed(1)}% of the market` : null} />
        </div>
      )}

      {summary && (
        <section className={`${s.card} ${s.cardAccent} ${s.briefing}`}>
          <h2 className={s.sectionTitle}>Intel briefing</h2>
          <p className={s.briefingBody}>{summary}</p>
        </section>
      )}

      <section className={s.section}>
        <h2 className={s.sectionTitle}>This week</h2>
        {game ? (
          <div className={s.gridGames}><NflGameCard game={game} /></div>
        ) : onBye ? (
          <div className={s.empty}><span className={s.emptyTitle}>Bye week</span>The {team.nickname} are off this week.</div>
        ) : (
          <div className={s.empty}>No game on this week’s board.</div>
        )}
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>Schedule</h2>
          {schedule?.byeWeek != null && <span className={s.sectionSub}>Bye: Week {schedule.byeWeek}</span>}
        </div>
        {schedule === null ? (
          <div className={s.skeleton} />
        ) : schedule.events.length === 0 ? (
          <div className={s.empty}>The schedule is unavailable right now.</div>
        ) : (
          <ScheduleTable events={schedule.events} byeWeek={schedule.byeWeek} buildPath={buildPath} />
        )}
      </section>

      <NflIntelFeed team={team.slug} title={`${team.nickname} news and video`} showMore={false} />
    </div>
  );
}
