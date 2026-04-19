/**
 * NBA Team Intel detail page — premium, MLB-inspired hierarchy.
 * Sections: Hero → Intel Briefing → Odds → Next Game → Recent Results → News → Schedule
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { getNbaTeamBySlug, getNbaEspnId } from '../../sports/nba/teams';
import { getNbaEspnLogoUrl } from '../../utils/espnNbaLogos';
import { fetchNbaChampionshipOdds } from '../../api/nbaChampionshipOdds';
import { fetchNbaHeadlines } from '../../api/nbaNews';
import { fetchNbaTeamBoard } from '../../api/nbaTeamBoard';
import { buildNbaTeamIntelSummary } from '../../data/nba/teamIntelSummary';
import NbaLiveGameCard from '../../components/nba/NbaLiveGameCard';
import styles from './NbaTeamDetail.module.css';

function formatOdds(american) {
  if (american == null) return '\u2014';
  return american > 0 ? `+${american}` : `${american}`;
}
function formatDate(str) {
  if (!str) return '';
  try { return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return str; }
}
function formatDateTime(str) {
  if (!str) return '';
  try { return new Date(str).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return str; }
}

function OpponentLogo({ logoUrl, abbrev, size = 24 }) {
  if (logoUrl) return <img src={logoUrl} alt={abbrev || ''} width={size} height={size} className={styles.oppLogo} loading="lazy" />;
  if (abbrev) return <span className={styles.oppAbbrevBadge}>{abbrev}</span>;
  return null;
}

function ESPNBadge() {
  return (
    <svg width="32" height="13" viewBox="0 0 32 13" fill="none" aria-hidden focusable="false" style={{ flexShrink: 0 }}>
      <rect width="32" height="13" rx="2" fill="#CC0000" />
      <text x="16" y="9.5" textAnchor="middle" fill="white" fontSize="8" fontFamily="Arial,Helvetica,sans-serif" fontWeight="bold" letterSpacing="0.4">ESPN</text>
    </svg>
  );
}

function GameStatusBadge({ ev }) {
  if (ev.gameStatus === 'final' || ev.isFinal) return <span className={styles.statusFinal}>Final</span>;
  if (ev.gameStatus === 'in_progress') return <span className={styles.statusLive}>Live</span>;
  const timeStr = ev.date ? (() => {
    try { return new Date(ev.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); }
    catch { return ''; }
  })() : '';
  return <span className={styles.statusScheduled}>{timeStr || 'Scheduled'}</span>;
}

function ScheduleSection({ events }) {
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const months = useMemo(() => {
    const seen = new Set();
    const deduped = events.filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
    const byMonth = {};
    for (const ev of deduped) {
      const d = new Date(ev.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!byMonth[key]) byMonth[key] = { key, label, events: [] };
      byMonth[key].events.push(ev);
    }
    return Object.values(byMonth).sort((a, b) => a.key.localeCompare(b.key));
  }, [events]);

  const [collapsed, setCollapsed] = useState(() => {
    const initial = {};
    for (const month of months) {
      initial[month.key] = month.key !== currentMonthKey;
    }
    return initial;
  });

  const toggle = (key) => setCollapsed((p) => ({ ...p, [key]: !p[key] }));

  if (events.length === 0) return <p className={styles.muted}>No schedule data available yet.</p>;

  return (
    <div className={styles.scheduleContainer}>
      {months.map((month) => {
        const isCollapsed = collapsed[month.key] ?? month.key !== currentMonthKey;
        return (
          <div key={month.key} className={styles.monthBlock}>
            <button type="button" className={styles.monthHeader} onClick={() => toggle(month.key)}>
              <span>{month.label}</span>
              <span className={styles.monthCount}>
                {(() => {
                  const finals = month.events.filter((e) => e.isFinal && e.ourScore != null && e.oppScore != null);
                  const w = finals.filter((e) => e.ourScore > e.oppScore).length;
                  const l = finals.filter((e) => e.ourScore < e.oppScore).length;
                  return finals.length > 0 ? `${w}-${l} \u00B7 ${month.events.length} games` : `${month.events.length} games`;
                })()}
              </span>
              <span className={styles.monthChevron} aria-hidden>{isCollapsed ? '\u25B8' : '\u25BE'}</span>
            </button>
            {!isCollapsed && (
              <div className={styles.monthEvents}>
                <div className={styles.scheduleHeaderRow}>
                  <span className={styles.schedColDate}>Date</span>
                  <span className={styles.schedColOpp}>Matchup</span>
                  <span className={styles.schedColResult}>Score</span>
                  <span className={styles.schedColStatus}>Status</span>
                  <span className={styles.schedColNetwork}>TV</span>
                  <span className={styles.schedColLink}></span>
                </div>
                {month.events.map((ev) => {
                  const won = ev.isFinal && ev.ourScore != null && ev.oppScore != null && ev.ourScore > ev.oppScore;
                  const lost = ev.isFinal && ev.ourScore != null && ev.oppScore != null && ev.ourScore < ev.oppScore;
                  const scoreStr = ev.ourScore != null && ev.oppScore != null ? `${ev.ourScore}-${ev.oppScore}` : '';
                  const isLive = ev.gameStatus === 'in_progress';
                  const isPast = ev.isFinal;
                  return (
                    <div key={ev.id} className={`${styles.scheduleRow} ${isLive ? styles.scheduleRowLive : ''} ${isPast ? styles.scheduleRowPast : ''}`}>
                      <span className={styles.schedColDate}>{formatDate(ev.date)}</span>
                      <span className={styles.schedColOpp}>
                        <OpponentLogo logoUrl={ev.opponentLogo} abbrev={ev.opponentSlug?.toUpperCase()} size={20} />
                        <span className={styles.schedHomeAway}>{ev.isHome ? 'vs' : '@'}</span>
                        <span className={styles.schedOppText}>{ev.opponent}</span>
                      </span>
                      <span className={`${styles.schedColResult} ${won ? styles.resultWin : ''} ${lost ? styles.resultLoss : ''}`}>
                        {ev.isFinal && scoreStr ? (
                          <>
                            {scoreStr}
                            {won && <span className={styles.wlBadge}>W</span>}
                            {lost && <span className={`${styles.wlBadge} ${styles.wlLoss}`}>L</span>}
                          </>
                        ) : (
                          <span className={styles.schedDash}>&mdash;</span>
                        )}
                      </span>
                      <span className={styles.schedColStatus}>
                        <GameStatusBadge ev={ev} />
                      </span>
                      <span className={styles.schedColNetwork}>
                        {ev.network ? <span className={styles.networkBadge}>{ev.network}</span> : <span className={styles.schedMuted}>&mdash;</span>}
                      </span>
                      <span className={styles.schedColLink}>
                        {ev.gamecastUrl && (
                          <a href={ev.gamecastUrl} target="_blank" rel="noopener noreferrer" className={styles.scheduleEspn} title="ESPN Gamecast">
                            <ESPNBadge />
                          </a>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function NbaTeamDetail() {
  const { slug } = useParams();
  const { buildPath } = useWorkspace();
  const team = getNbaTeamBySlug(slug);
  const logoUrl = team ? getNbaEspnLogoUrl(team.slug) : null;

  const [odds, setOdds] = useState(null);
  const [headlines, setHeadlines] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [teamRecord, setTeamRecord] = useState(null);
  const [boardEntry, setBoardEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [liveGame, setLiveGame] = useState(null);

  // Poll for live games
  useEffect(() => {
    if (!team) return;
    let cancelled = false;
    async function loadLive() {
      try {
        const r = await fetch(`/api/nba/live/games?status=all&sort=importance`);
        if (!r.ok) return;
        const d = await r.json();
        const match = (d.games || []).find(g =>
          g.teams?.home?.slug === team.slug || g.teams?.away?.slug === team.slug
        );
        if (!cancelled && match && (match.gameState?.isLive || match.status === 'upcoming')) {
          setLiveGame(match);
        }
      } catch { /* network error */ }
    }
    loadLive();
    const iv = setInterval(loadLive, 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [team]);

  // Load data
  useEffect(() => {
    if (!team) return;
    Promise.allSettled([
      fetchNbaChampionshipOdds(),
      fetchNbaHeadlines(),
      fetchNbaTeamBoard(),
    ]).then(([oddsRes, newsRes, boardRes]) => {
      if (oddsRes.status === 'fulfilled') setOdds(oddsRes.value.odds ?? {});
      if (newsRes.status === 'fulfilled') setHeadlines(newsRes.value.headlines ?? []);
      if (boardRes.status === 'fulfilled') {
        const board = boardRes.value.board || [];
        const entry = board.find(t => t.slug === team.slug);
        if (entry) setBoardEntry(entry);
      }
    }).finally(() => setLoading(false));
  }, [team]);

  // Load schedule
  useEffect(() => {
    if (!team) { setScheduleLoading(false); return; }
    setScheduleLoading(true);
    fetch(`/api/nba/team/schedule?slug=${team.slug}`)
      .then(r => r.json())
      .then(data => {
        setSchedule(data.events ?? []);
        setTeamRecord(data.teamRecord ?? null);
      })
      .catch(() => {})
      .finally(() => setScheduleLoading(false));
  }, [team]);

  const teamOdds = odds?.[team?.slug];
  const record = boardEntry?.record || teamRecord || null;
  const standing = boardEntry?.standing || null;
  const streak = boardEntry?.streak || null;

  const teamHeadlines = useMemo(() => {
    if (!team) return [];
    return headlines.filter((h) => {
      const t = (h.title || '').toLowerCase();
      const nameParts = team.name.toLowerCase().split(' ');
      return nameParts.some((p) => p.length > 3 && t.includes(p));
    }).slice(0, 10);
  }, [headlines, team]);

  const { recentGames, nextGame, formGuide } = useMemo(() => {
    const finals = schedule.filter(e => e.isFinal).sort((a, b) => new Date(b.date) - new Date(a.date));
    const upcoming = schedule.filter(e => !e.isFinal).sort((a, b) => new Date(a.date) - new Date(b.date));

    const form = finals.slice(0, 10).map(e => {
      if (e.ourScore == null || e.oppScore == null) return null;
      return { won: e.ourScore > e.oppScore, score: `${e.ourScore}-${e.oppScore}`, opponent: e.opponent };
    }).filter(Boolean);

    return { recentGames: finals.slice(0, 7), nextGame: upcoming[0] || null, formGuide: form };
  }, [schedule]);

  if (!team) {
    return (
      <div className={styles.page}>
        <div className={styles.notFound}>
          <h2>Team not found</h2>
          <p>No NBA team matches "{slug}".</p>
          <Link to={buildPath('/teams')} className={styles.backLink}>&larr; Back to Team Intel</Link>
        </div>
      </div>
    );
  }

  const intelSummary = buildNbaTeamIntelSummary({ team, odds: teamOdds, record, standing, streak });

  return (
    <div className={styles.page}>
      {/* Hero */}
      <header className={styles.hero}>
        <div className={styles.heroAccent} />
        <Link to={buildPath('/teams')} className={styles.backLink}>&larr; Team Intel Hub</Link>
        <div className={styles.heroMain}>
          <div className={styles.heroIdentity}>
            {logoUrl ? (
              <img src={logoUrl} alt={team.name} className={styles.heroLogo} width={56} height={56} />
            ) : (
              <span className={styles.heroLogoFallback}>{team.abbrev}</span>
            )}
            <div className={styles.heroText}>
              <h1 className={styles.teamName}>{team.name}</h1>
              <div className={styles.heroMeta}>
                <span className={styles.confChip}>{team.conference}</span>
                <span className={styles.divisionChip}>{team.division}</span>
                {record && <span className={styles.recordChip}>{record}</span>}
                {standing && <span className={styles.standingChip}>{standing}</span>}
                {streak && (
                  <span className={`${styles.streakChip} ${streak.startsWith('W') ? styles.streakWin : styles.streakLoss}`}>
                    {streak}
                  </span>
                )}
              </div>
              {!loading && teamOdds && (
                <div className={styles.champChip}>
                  <span className={styles.champIcon}>{'\uD83C\uDFC6'}</span>
                  <div>
                    <span className={styles.champLabel}>NBA Championship</span>
                    <span className={styles.champValue}>{formatOdds(teamOdds.bestChanceAmerican)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Section Nav */}
      <nav className={styles.sectionNav}>
        {['Intel', 'Odds', 'News', 'Schedule'].map((s) => (
          <a key={s} href={`#${s.toLowerCase()}`} className={styles.navPill}
            onClick={(e) => { e.preventDefault(); document.getElementById(s.toLowerCase())?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
            {s}
          </a>
        ))}
      </nav>

      <div className={styles.content}>
        {/* Intel Briefing */}
        <section id="intel" className={styles.briefingCard}>
          <div className={styles.briefingHeader}>
            <img src="/mascot.png" alt="" className={styles.briefingMascot} aria-hidden />
            <h2 className={styles.briefingTitle}>Intel Briefing</h2>
          </div>
          <div className={styles.briefingBody}>
            <p>{intelSummary}</p>
            {(record || streak || formGuide.length > 0) && (
              <div className={styles.briefingContext}>
                {record && <span className={styles.briefingChip}>{record}</span>}
                {streak && (
                  <span className={`${styles.briefingChip} ${streak.startsWith('W') ? styles.briefingChipWin : styles.briefingChipLoss}`}>
                    {streak}
                  </span>
                )}
                {formGuide.length >= 3 && (
                  <span className={styles.briefingForm}>
                    Form: {formGuide.slice(0, 5).map((g) => g.won ? 'W' : 'L').join('-')}
                  </span>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Today's Game */}
        {liveGame && (
          <section className={styles.todayGameSection}>
            <h3 className={styles.sectionTitle}>
              {liveGame.gameState?.isLive ? 'Live Now' : "Today's Game"}
            </h3>
            <NbaLiveGameCard game={liveGame} />
          </section>
        )}

        {/* Odds + Season Profile */}
        <div id="odds" className={styles.twoCol}>
          <section className={styles.oddsCard}>
            <h3 className={styles.sectionTitle}>{'\uD83C\uDFC6'} Championship Odds</h3>
            {loading ? (
              <p className={styles.muted}>Loading odds&hellip;</p>
            ) : teamOdds ? (
              <div className={styles.oddsGrid}>
                <div className={styles.oddsStat}>
                  <span className={styles.oddsLabel}>Best Line</span>
                  <span className={styles.oddsValue}>{formatOdds(teamOdds.bestChanceAmerican)}</span>
                </div>
                <div className={styles.oddsStat}>
                  <span className={styles.oddsLabel}>Best Payout</span>
                  <span className={styles.oddsValue}>{formatOdds(teamOdds.bestPayoutAmerican)}</span>
                </div>
                <div className={styles.oddsStat}>
                  <span className={styles.oddsLabel}>Books</span>
                  <span className={styles.oddsValue}>{teamOdds.booksCount ?? '\u2014'}</span>
                </div>
              </div>
            ) : (
              <p className={styles.muted}>No championship odds available yet.</p>
            )}
          </section>

          <section className={styles.atsCard}>
            <h3 className={styles.sectionTitle}>Season Profile</h3>
            <div className={styles.atsGrid}>
              <div className={styles.atsStat}>
                <span className={styles.atsLabel}>Record</span>
                <span className={styles.atsValue}>{record || '0-0'}</span>
              </div>
              <div className={styles.atsStat}>
                <span className={styles.atsLabel}>Conference</span>
                <span className={styles.atsValue}>{standing || '\u2014'}</span>
              </div>
              <div className={styles.atsStat}>
                <span className={styles.atsLabel}>Form</span>
                <span className={styles.atsValue}>
                  {formGuide.length >= 3
                    ? formGuide.slice(0, 5).map(g => g.won ? 'W' : 'L').join('-')
                    : <span className={styles.atsPending}>Building</span>}
                </span>
              </div>
              <div className={styles.atsStat}>
                <span className={styles.atsLabel}>Streak</span>
                <span className={styles.atsValue}>{streak || '\u2014'}</span>
              </div>
            </div>
            {formGuide.length > 0 && (
              <div className={styles.formGuide}>
                <span className={styles.formLabel}>Form</span>
                <div className={styles.formStrip}>
                  {formGuide.slice(0, 10).map((g, i) => (
                    <span key={i} className={`${styles.formDot} ${g.won ? styles.formWin : styles.formLoss}`} title={`${g.won ? 'W' : 'L'} ${g.score} vs ${g.opponent}`}>
                      {g.won ? 'W' : 'L'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Next Game */}
        {nextGame && (
          <section className={styles.nextGameCard}>
            <h3 className={styles.sectionTitle}>Next Game</h3>
            <div className={styles.nextGameBody}>
              <div className={styles.nextGameMatchup}>
                <span className={styles.nextGameVsTag}>{nextGame.isHome ? 'vs' : '@'}</span>
                <OpponentLogo logoUrl={nextGame.opponentLogo} abbrev={nextGame.opponentSlug?.toUpperCase()} size={36} />
                <div className={styles.nextGameDetails}>
                  <strong className={styles.nextGameOpp}>{nextGame.opponent}</strong>
                  <span className={styles.nextGameTime}>{formatDateTime(nextGame.date)}</span>
                </div>
              </div>
              <div className={styles.nextGameMeta}>
                {nextGame.network && <span className={styles.networkBadge}>{nextGame.network}</span>}
              </div>
              {nextGame.gamecastUrl && (
                <a href={nextGame.gamecastUrl} target="_blank" rel="noopener noreferrer" className={styles.gamecastLink}>
                  <ESPNBadge /> <span className={styles.gamecastLabel}>Gamecast</span> <span aria-hidden>&nearr;</span>
                </a>
              )}
            </div>
          </section>
        )}

        {/* Recent Results */}
        {recentGames.length > 0 && (
          <section className={styles.resultsSection}>
            <h3 className={styles.sectionTitle}>Recent Results</h3>
            <div className={styles.resultsList}>
              {recentGames.map((ev) => {
                const won = ev.ourScore != null && ev.oppScore != null && ev.ourScore > ev.oppScore;
                const lost = ev.ourScore != null && ev.oppScore != null && ev.ourScore < ev.oppScore;
                return (
                  <div key={ev.id} className={`${styles.resultRow} ${won ? styles.resultRowWin : ''} ${lost ? styles.resultRowLoss : ''}`}>
                    <span className={`${styles.resultWL} ${won ? styles.resultWin : styles.resultLoss}`}>
                      {won ? 'W' : 'L'}
                    </span>
                    <span className={styles.resultDate}>{formatDate(ev.date)}</span>
                    <span className={styles.resultOpp}>
                      <OpponentLogo logoUrl={ev.opponentLogo} abbrev={ev.opponentSlug?.toUpperCase()} size={22} />
                      <span className={styles.resultHomeAway}>{ev.isHome ? 'vs' : '@'}</span>
                      <span className={styles.resultOppName}>{ev.opponent}</span>
                    </span>
                    <span className={`${styles.resultScore} ${won ? styles.resultWin : styles.resultLoss}`}>
                      {ev.ourScore != null ? `${ev.ourScore}-${ev.oppScore}` : '\u2014'}
                    </span>
                    {ev.network && <span className={styles.resultNetwork}>{ev.network}</span>}
                    {ev.gamecastUrl && (
                      <a href={ev.gamecastUrl} target="_blank" rel="noopener noreferrer" className={styles.scheduleEspn} title="ESPN">
                        <ESPNBadge />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* News */}
        <section id="news" className={styles.newsSection}>
          <h3 className={styles.sectionTitle}>Latest Headlines</h3>
          {teamHeadlines.length === 0 ? (
            <p className={styles.muted}>No team-specific headlines right now.</p>
          ) : (
            <div className={styles.newsList}>
              {teamHeadlines.map((h, i) => (
                <div key={h.link || i} className={styles.newsItem}>
                  <a href={h.link} target="_blank" rel="noopener noreferrer" className={styles.newsLink}>
                    <span className={styles.newsTitle}>{h.title}</span>
                    <div className={styles.newsMeta}>
                      <span className={styles.newsSource}>{h.source}</span>
                      {h.time && <span className={styles.newsTime}>{h.time}</span>}
                    </div>
                  </a>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Full Schedule */}
        <section id="schedule" className={styles.scheduleOuter}>
          <h3 className={styles.sectionTitle}>Full Schedule</h3>
          {scheduleLoading ? (
            <p className={styles.muted}>Loading schedule&hellip;</p>
          ) : (
            <ScheduleSection events={schedule} />
          )}
        </section>
      </div>
    </div>
  );
}
