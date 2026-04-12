/**
 * NbaPinnedTeamSection — MLB-parity "Pin a team" for NBA Home.
 *
 * Two states:
 * 1. Empty: left explainer panel + right Celtics preview card
 * 2. Filled: grid of NBA pinned team cards
 *
 * Uses the unified usePinnedTeams({ sport: 'nba' }) hook.
 */
import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getSupabase } from '../../lib/supabaseClient';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { getNbaEspnLogoUrl } from '../../utils/espnNbaLogos';
import { buildNbaTeamIntelSummary } from '../../data/nba/teamIntelSummary';
import usePinnedTeams, { getPinnedForSport } from '../../hooks/usePinnedTeams';
import { notifyPinnedChanged } from '../../utils/pinnedSync';
import { usePlan } from '../../hooks/usePlan';
import { NBA_TEAMS } from '../../sports/nba/teams';
import { fetchNbaChampionshipOdds } from '../../api/nbaChampionshipOdds';
import { fetchNbaTeamBoard } from '../../api/nbaTeamBoard';
import NbaTeamPickerModal from './NbaTeamPickerModal';
import styles from './NbaPinnedTeamSection.module.css';

const FREE_PIN_LIMIT = 3;
const DEFAULT_SLUG = 'bos';

function formatOdds(v) { return v == null ? '\u2014' : v > 0 ? `+${v}` : `${v}`; }

function formatRelTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch { return ''; }
}

/* ── Preview Card (empty state right side) ── */
function PreviewCard({ slug, odds, boardMap, onPin, buildPath }) {
  const team = NBA_TEAMS.find(t => t.slug === slug);
  const logo = team ? getNbaEspnLogoUrl(team.slug) : null;
  const teamOdds = odds?.[slug];
  const board = boardMap?.[slug];

  if (!team) return null;

  const intel = buildNbaTeamIntelSummary({
    team,
    odds: teamOdds ? { bestChanceAmerican: teamOdds.bestChanceAmerican } : null,
    record: board?.record || null,
    standing: board?.standing || null,
    streak: board?.streak || null,
  });

  return (
    <div className={styles.previewCard}>
      <div className={styles.previewHeader}>
        <span className={styles.previewLabel}>Preview</span>
        <button type="button" className={styles.previewClose} aria-label="Dismiss preview">&times;</button>
      </div>

      <div className={styles.cardHeader}>
        <div className={styles.cardIdentity}>
          {logo && <img src={logo} alt="" className={styles.cardLogo} width={32} height={32} />}
          <div>
            <Link to={buildPath(`/teams/${slug}`)} className={styles.cardName}>{team.name}</Link>
            <span className={styles.cardDiv}>{team.conference} &middot; {team.division}</span>
          </div>
        </div>
      </div>

      <div className={styles.statBoxes}>
        <div className={styles.statBox}>
          <span className={styles.statBoxLabel}>Record</span>
          <span className={styles.statBoxValue}>{board?.record || '\u2014'}</span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statBoxLabel}>Standing</span>
          <span className={styles.statBoxValue}>{board?.standing?.replace(/\s+in\s+/i, ' ') || '\u2014'}</span>
        </div>
        {board?.streak && (
          <div className={styles.statBox}>
            <span className={styles.statBoxLabel}>Streak</span>
            <span className={styles.statBoxValue}>{board.streak}</span>
          </div>
        )}
        {teamOdds && (
          <div className={styles.statBox}>
            <span className={styles.statBoxLabel}>Title Odds</span>
            <span className={styles.statBoxValue}>{formatOdds(teamOdds.bestChanceAmerican)}</span>
          </div>
        )}
      </div>

      {intel && <p className={styles.intelText}>{intel}</p>}

      <div className={styles.previewActions}>
        <button type="button" className={styles.pinBtnPrimary} onClick={() => onPin(slug)}>
          {'\uD83D\uDCCC'} Pin {team.name.split(' ').pop()}
        </button>
        <Link to={buildPath(`/teams/${slug}`)} className={styles.viewTeamCta}>
          View Team Intel &rarr;
        </Link>
      </div>
    </div>
  );
}

/* ── Pinned Team Card (filled state) ── */
function PinnedCard({ slug, odds, boardMap, schedule, onRemove, buildPath }) {
  const team = NBA_TEAMS.find(t => t.slug === slug);
  const logo = team ? getNbaEspnLogoUrl(team.slug) : null;
  const teamOdds = odds?.[slug];
  const board = boardMap?.[slug];

  if (!team) return null;

  const scheduleEvents = Array.isArray(schedule) ? schedule : schedule?.events ?? [];
  const espnRecord = Array.isArray(schedule) ? null : schedule?.teamRecord;

  const currentRecord = useMemo(() => {
    if (board?.record && board.record !== '0-0') return board.record;
    if (espnRecord) return espnRecord;
    if (!scheduleEvents.length) return '\u2014';
    const finals = scheduleEvents.filter(e => e.isFinal && e.ourScore != null && e.oppScore != null);
    if (finals.length === 0) return '0-0';
    const w = finals.filter(e => e.ourScore > e.oppScore).length;
    const l = finals.filter(e => e.ourScore < e.oppScore).length;
    return `${w}-${l}`;
  }, [board, espnRecord, scheduleEvents]);

  const intel = useMemo(() => buildNbaTeamIntelSummary({
    team,
    odds: teamOdds ? { bestChanceAmerican: teamOdds.bestChanceAmerican } : null,
    record: currentRecord,
    standing: board?.standing || null,
    streak: board?.streak || null,
  }), [team, teamOdds, currentRecord, board]);

  const nextGame = useMemo(() => {
    if (!scheduleEvents.length) return null;
    return scheduleEvents.filter(e => !e.isFinal).sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
  }, [scheduleEvents]);

  const handleShare = () => {
    const url = `${window.location.origin}/nba/teams/${slug}`;
    navigator.clipboard?.writeText(url).catch(() => {});
  };

  return (
    <div className={styles.pinnedCard}>
      <div className={styles.cardHeader}>
        <div className={styles.cardIdentity}>
          {logo && <img src={logo} alt="" className={styles.cardLogo} width={32} height={32} />}
          <div>
            <Link to={buildPath(`/teams/${slug}`)} className={styles.cardName}>{team.name}</Link>
            <span className={styles.cardDiv}>{team.conference} &middot; {team.division}</span>
          </div>
        </div>
        <div className={styles.cardActions}>
          <button type="button" className={styles.cardActionBtn} onClick={handleShare} title="Share">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          </button>
          <button type="button" className={styles.cardActionBtn} onClick={() => onRemove(slug)} title="Remove">&times;</button>
        </div>
      </div>

      <div className={styles.statBoxes}>
        <div className={styles.statBox}>
          <span className={styles.statBoxLabel}>Record</span>
          <span className={styles.statBoxValue}>{currentRecord}</span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statBoxLabel}>Standing</span>
          <span className={styles.statBoxValue}>{board?.standing?.replace(/\s+in\s+/i, ' ') || '\u2014'}</span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statBoxLabel}>Streak</span>
          <span className={styles.statBoxValue}>{board?.streak || '\u2014'}</span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statBoxLabel}>Title Odds</span>
          <span className={styles.statBoxValue}>{teamOdds ? formatOdds(teamOdds.bestChanceAmerican) : '\u2014'}</span>
        </div>
      </div>

      {nextGame && (
        <div className={styles.nextGame}>
          <span className={styles.nextGameLabel}>Next Game</span>
          <div className={styles.nextGameInfo}>
            <span>{nextGame.isHome ? 'vs' : '@'} {nextGame.opponent}</span>
            <span className={styles.nextGameTime}>{formatRelTime(nextGame.date)}</span>
            {nextGame.network && <span className={styles.nextGameNetwork}>{nextGame.network}</span>}
          </div>
          {nextGame.gamecastUrl && (
            <a href={nextGame.gamecastUrl} target="_blank" rel="noopener noreferrer" className={styles.gamecastLink}>
              Gamecast &#x2197;
            </a>
          )}
        </div>
      )}

      <p className={styles.intelText}>{intel}</p>

      <Link to={buildPath(`/teams/${slug}`)} className={styles.viewTeamCta}>
        View Team Intel &rarr;
      </Link>
    </div>
  );
}

/* ── Main Section ── */
export default function NbaPinnedTeamSection() {
  const { user } = useAuth();
  const { buildPath } = useWorkspace();
  const navigate = useNavigate();
  const { pinnedTeams: pinned, addTeam, removeTeam } = usePinnedTeams({ sport: 'nba' });
  const { isPro } = usePlan();
  const [odds, setOdds] = useState(null);
  const [boardMap, setBoardMap] = useState({});
  const [schedules, setSchedules] = useState({});
  const [limitHit, setLimitHit] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    Promise.allSettled([
      fetchNbaChampionshipOdds(),
      fetchNbaTeamBoard(),
    ]).then(([oddsRes, boardRes]) => {
      if (oddsRes.status === 'fulfilled') setOdds(oddsRes.value.odds ?? {});
      if (boardRes.status === 'fulfilled') {
        const map = {};
        for (const t of boardRes.value.board || []) map[t.slug] = t;
        setBoardMap(map);
      }
    });
  }, []);

  // Fetch schedules for pinned teams
  useEffect(() => {
    if (pinned.length === 0) return;
    pinned.forEach(slug => {
      setSchedules(prev => {
        if (prev[slug]) return prev;
        fetch(`/api/nba/team/schedule?slug=${slug}`)
          .then(r => r.json())
          .then(d => setSchedules(p => ({
            ...p,
            [slug]: { events: d.events ?? [], teamRecord: d.teamRecord || null },
          })))
          .catch(() => {});
        return { ...prev, [slug]: null };
      });
    });
  }, [pinned]);

  const handlePin = async (slug) => {
    if (!user) { navigate('/settings'); return; }
    if (!isPro && pinned.length >= FREE_PIN_LIMIT) {
      setLimitHit(true);
      return;
    }
    addTeam(slug);
    setLimitHit(false);
    const allSlugs = [...getPinnedForSport('ncaam'), ...getPinnedForSport('mlb'), ...getPinnedForSport('nba')];
    notifyPinnedChanged(allSlugs, 'home');
    try {
      const sb = getSupabase();
      if (sb && user?.id) {
        await sb.from('user_teams').upsert({
          user_id: user.id,
          team_slug: slug,
          is_primary: pinned.length === 0,
          created_at: new Date().toISOString(),
        }, { onConflict: 'user_id,team_slug' });
      }
    } catch { /* best-effort */ }
  };

  const handleRemove = async (slug) => {
    removeTeam(slug);
    setLimitHit(false);
    const allSlugs = [...getPinnedForSport('ncaam'), ...getPinnedForSport('mlb'), ...getPinnedForSport('nba')];
    notifyPinnedChanged(allSlugs, 'home');
    try {
      const sb = getSupabase();
      if (sb && user?.id) {
        await sb.from('user_teams').delete().eq('user_id', user.id).eq('team_slug', slug);
      }
    } catch { /* best-effort */ }
  };

  const isEmpty = pinned.length === 0;

  return (
    <section className={styles.section}>
      <div className={styles.eyebrow}>Following</div>
      <h2 className={styles.heading}>Teams You Follow</h2>

      {isEmpty ? (
        <div className={styles.emptyLayout}>
          <div className={styles.explainer}>
            <h3 className={styles.explainerTitle}>Pin teams to track them faster</h3>
            <ul className={styles.explainerList}>
              <li>Faster home dashboard tailored to you</li>
              <li>Instant access to standings, odds, and team intel</li>
              <li>Keep tabs on current form and next matchup</li>
              <li>Your personal NBA watchlist</li>
            </ul>
            <div className={styles.explainerActions}>
              <button type="button" className={styles.pinBtnPrimary} onClick={() => handlePin(DEFAULT_SLUG)}>
                {'\uD83D\uDCCC'} Pin Celtics (example)
              </button>
              <button type="button" className={styles.addTeamBtn} onClick={() => {
                if (!user) { navigate('/settings'); return; }
                setPickerOpen(true);
              }}>
                + Add team
              </button>
            </div>
            <p className={styles.explainerHelper}>
              Search for any NBA team. Try: Lakers, Warriors, Knicks&hellip;
            </p>
            <div className={styles.popularChips}>
              <span className={styles.popularLabel}>Popular:</span>
              {['lal', 'gsw', 'nyk', 'mil'].map(s => {
                const t = NBA_TEAMS.find(x => x.slug === s);
                return t ? (
                  <button key={s} type="button" className={styles.popularChip}
                    onClick={() => handlePin(s)}>{t.name.split(' ').pop()}</button>
                ) : null;
              })}
            </div>
          </div>
          <PreviewCard slug={DEFAULT_SLUG} odds={odds} boardMap={boardMap} onPin={handlePin} buildPath={buildPath} />
        </div>
      ) : (
        <>
          <div className={styles.pinnedHeader}>
            <span className={styles.pinnedLabel}>Pinned Teams</span>
            <button type="button" className={styles.addTeamCta} onClick={() => {
              if (!user) { navigate('/settings'); return; }
              setPickerOpen(true);
            }}>+ Add Team</button>
          </div>
          {limitHit && (
            <div className={styles.limitMsg}>
              <span>You&apos;ve reached the free limit of {FREE_PIN_LIMIT} teams.</span>
              <Link to="/settings" className={styles.upgradeLink}>Upgrade to Pro &rarr;</Link>
            </div>
          )}
          <div className={styles.pinnedGrid}>
            {pinned.map(slug => (
              <PinnedCard key={slug} slug={slug} odds={odds}
                boardMap={boardMap} schedule={schedules[slug]} onRemove={handleRemove} buildPath={buildPath} />
            ))}
          </div>
        </>
      )}
      <NbaTeamPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        pinnedTeams={pinned}
        addTeam={addTeam}
        removeTeam={removeTeam}
        isPinned={(slug) => pinned.includes(slug)}
        isPro={isPro}
      />
    </section>
  );
}
