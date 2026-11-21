/**
 * NflPinnedTeamSection — "Teams you follow" on the NFL briefing.
 *
 * Same behaviour as the MLB and NBA sections: optimistic local update,
 * then the server-validated /api/teams/pin call, reverting if the server
 * rejects. Uses the unified usePinnedTeams({ sport: 'nfl' }) store.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getSupabase } from '../../lib/supabaseClient';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import usePinnedTeams, { getAllPinnedSlugs } from '../../hooks/usePinnedTeams';
import { notifyPinnedChanged } from '../../utils/pinnedSync';
import { usePlan } from '../../hooks/usePlan';
import { useTeamPin } from '../../hooks/useTeamPin';
import { refreshTeamPersonPropertiesFromBackend } from '../../analytics/teamPinTracking';
import { getNflTeamBySlug } from '../../sports/nfl/teams';
import { fetchNflChampionshipOdds, fetchNflTeamBoard, fetchNflGames } from '../../api/nfl';
import NflTeamPickerModal from './NflTeamPickerModal';
import NflLogo from './NflLogo';
import s from './nfl.module.css';

const FREE_PIN_LIMIT = 3;
const SUGGESTED = ['chiefs', 'eagles', 'bills', 'lions', '49ers'];

function fmtOdds(v) { return v == null ? '—' : v > 0 ? `+${v}` : `${v}`; }

function nextGameLine(slug, games, byeTeams) {
  if (byeTeams.includes(slug)) return 'On bye this week';
  const g = games.find((x) => x.teams?.home?.slug === slug || x.teams?.away?.slug === slug);
  if (!g) return null;
  const isHome = g.teams.home.slug === slug;
  const opp = isHome ? g.teams.away : g.teams.home;
  const us = isHome ? g.teams.home : g.teams.away;
  if (g.status === 'final') {
    const won = (us.score ?? 0) > (opp.score ?? 0);
    const tied = us.score === opp.score;
    return `${tied ? 'Tied' : won ? 'Won' : 'Lost'} ${us.score}–${opp.score} ${isHome ? 'vs' : 'at'} ${opp.abbrev}`;
  }
  if (g.status === 'live') return `Live: ${us.score}–${opp.score} ${isHome ? 'vs' : 'at'} ${opp.abbrev}, ${g.gameState?.periodLabel || ''}`;
  const spread = g.market?.pregameSpread;
  const line = spread != null ? ` · ${us.abbrev} ${isHome ? fmt(spread) : fmt(-spread)}` : '';
  return `${isHome ? 'vs' : 'at'} ${opp.abbrev} · ${kickoffLabel(g.startTime)}${line}`;
}
function fmt(v) { return v > 0 ? `+${v}` : v === 0 ? 'PK' : `${v}`; }
/** Kickoff in the viewer's own time zone. */
function kickoffLabel(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).replace(',', '');
  } catch { return ''; }
}

function PinnedCard({ slug, board, odds, nextLine, onRemove, buildPath }) {
  const team = getNflTeamBySlug(slug);
  if (!team) return null;
  return (
    <div className={`${s.card} ${s.pinCard}`}>
      <div className={s.pinHead}>
        <div className={s.pinIdentity}>
          <NflLogo slug={slug} size={36} />
          <div>
            <Link to={buildPath(`/teams/${slug}`)} className={s.pinName}>{team.name}</Link>
            <div className={s.pinSub}>{board?.standing || team.division}</div>
          </div>
        </div>
        <button type="button" className={s.iconBtn} onClick={() => onRemove(slug)} aria-label={`Stop following ${team.name}`}>×</button>
      </div>
      <div className={s.stats}>
        <div className={s.stat}>
          <span className={s.statLabel}>Record</span>
          <span className={s.statValue}>{board?.record || '—'}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>Seed</span>
          <span className={s.statValue}>{board?.playoffSeed ?? '—'}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>Rating</span>
          <span className={s.statValue}>{board?.rating != null ? (board.rating > 0 ? `+${board.rating}` : board.rating) : '—'}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>Title</span>
          <span className={s.statValue}>{fmtOdds(odds?.bestChanceAmerican)}</span>
        </div>
      </div>
      {nextLine && <div className={s.pinNext}>{nextLine}</div>}
    </div>
  );
}

export default function NflPinnedTeamSection() {
  const { user } = useAuth();
  const { buildPath } = useWorkspace();
  const navigate = useNavigate();
  const { pinnedTeams: pinned, addTeam, removeTeam } = usePinnedTeams({ sport: 'nfl' });
  const { isPro } = usePlan();
  const { pinTeam, unpinTeam } = useTeamPin();
  const [odds, setOdds] = useState({});
  const [boardMap, setBoardMap] = useState({});
  const [slate, setSlate] = useState({ games: [], byeTeams: [] });
  const [limitHit, setLimitHit] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchNflChampionshipOdds(), fetchNflTeamBoard(), fetchNflGames()]).then(([o, b, g]) => {
      if (cancelled) return;
      setOdds(o.odds || {});
      setBoardMap(Object.fromEntries((b.board || []).map((t) => [t.slug, t])));
      setSlate({ games: g.games || [], byeTeams: g.byeTeams || [] });
    });
    return () => { cancelled = true; };
  }, []);

  // The free cap counts every sport together; the server re-validates.
  // Re-read on every render: `pinned` changing is what triggers the render.
  const totalPinned = getAllPinnedSlugs().length;
  const atLimit = !isPro && totalPinned >= FREE_PIN_LIMIT;

  const userId = user?.id || null;
  const refreshAnalytics = useCallback(async () => {
    try {
      const sb = getSupabase();
      if (sb && userId) await refreshTeamPersonPropertiesFromBackend(sb, userId);
    } catch { /* non-fatal */ }
  }, [userId]);

  const handlePin = useCallback(async (slug) => {
    if (!user) { navigate('/settings?next=/nfl'); return; }
    if (!isPro && getAllPinnedSlugs().length >= FREE_PIN_LIMIT) { setLimitHit(true); return; }

    addTeam(slug);
    setLimitHit(false);
    const result = await pinTeam(slug, { surface: 'nfl_home', allSlugs: getAllPinnedSlugs() });
    if (!result.ok) {
      removeTeam(slug);
      setLimitHit(true);
      return;
    }
    await refreshAnalytics();
    notifyPinnedChanged(getAllPinnedSlugs(), 'home');
  }, [user, isPro, navigate, addTeam, removeTeam, pinTeam, refreshAnalytics]);

  const handleRemove = useCallback(async (slug) => {
    removeTeam(slug);
    setLimitHit(false);
    await unpinTeam(slug, { surface: 'nfl_home' });
    await refreshAnalytics();
    notifyPinnedChanged(getAllPinnedSlugs(), 'home');
  }, [removeTeam, unpinTeam, refreshAnalytics]);

  const openPicker = () => {
    if (!user) { navigate('/settings?next=/nfl'); return; }
    setPickerOpen(true);
  };

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>Teams you follow</h2>
        {pinned.length > 0 && (
          <button type="button" className={`${s.btn} ${s.btnSmall}`} onClick={openPicker}>Add team</button>
        )}
      </div>

      {limitHit && (
        <div className={s.notice}>
          <span>Free plans can follow {FREE_PIN_LIMIT} teams across all sports.</span>
          <Link to="/settings">Upgrade to Pro</Link>
        </div>
      )}

      {pinned.length === 0 ? (
        <div className={`${s.card} ${s.pinEmpty}`}>
          <div>
            <strong>Follow a team to keep it on this page.</strong>
            <p className={s.note}>Record, playoff seed, power rating, title price and this week’s game at a glance.</p>
          </div>
          <div className={s.chipRow}>
            {SUGGESTED.map((slug) => {
              const t = getNflTeamBySlug(slug);
              return (
                <button key={slug} type="button" className={s.chipBtn} onClick={() => handlePin(slug)}>
                  {t.nickname}
                </button>
              );
            })}
            <button type="button" className={`${s.btn} ${s.btnSmall} ${s.btnPrimary}`} onClick={openPicker}>All teams</button>
          </div>
        </div>
      ) : (
        <div className={s.pinGrid}>
          {pinned.map((slug) => (
            <PinnedCard
              key={slug}
              slug={slug}
              board={boardMap[slug]}
              odds={odds[slug]}
              nextLine={nextGameLine(slug, slate.games, slate.byeTeams)}
              onRemove={handleRemove}
              buildPath={buildPath}
            />
          ))}
        </div>
      )}

      <NflTeamPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        isPinned={(slug) => pinned.includes(slug)}
        onPin={handlePin}
        onUnpin={handleRemove}
        atLimit={atLimit}
        limit={FREE_PIN_LIMIT}
        totalPinned={totalPinned}
        isPro={isPro}
      />
    </section>
  );
}
