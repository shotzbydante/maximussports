/**
 * MLB Team Intel detail page — premium, NCAA-inspired hierarchy.
 * Sections: Hero → Intel Briefing → Odds+ATS → Next Game → News → Schedule
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { getMLBTeamBySlug, getMLBEspnId } from '../../sports/mlb/teams';
import { getMlbEspnLogoUrl } from '../../utils/espnMlbLogos';
import { fetchMlbChampionshipOdds } from '../../api/mlbChampionshipOdds';
import { fetchMlbHeadlines } from '../../api/mlbNews';
import AffiliateCta from '../../components/common/AffiliateCta';
import MlbTeamIntelFeed from '../../components/mlb/MlbTeamIntelFeed';
import LiveGameCard from '../../components/mlb/LiveGameCard';
import styles from './MlbTeamDetail.module.css';

function formatOdds(american) {
  if (american == null) return '—';
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

function GamecastLink({ url }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={styles.gamecastLink}>
      <ESPNBadge /> <span className={styles.gamecastLabel}>Gamecast</span> <span aria-hidden>↗</span>
    </a>
  );
}

function GameStatusBadge({ ev }) {
  if (ev.gameStatus === 'final' || ev.isFinal) {
    return <span className={styles.statusFinal}>Final</span>;
  }
  if (ev.gameStatus === 'in_progress') {
    return <span className={styles.statusLive}>Live</span>;
  }
  // Future game — show time, never "Final"
  const timeStr = ev.date ? (() => {
    try { return new Date(ev.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); }
    catch { return ''; }
  })() : '';
  return <span className={styles.statusScheduled}>{timeStr || 'Scheduled'}</span>;
}

function ScheduleSection({ events }) {
  const [collapsed, setCollapsed] = useState({});

  const grouped = useMemo(() => {
    const spring = events.filter((e) => e.seasonTypeName === 'preseason');
    const regular = events.filter((e) => e.seasonTypeName === 'regular' || e.seasonTypeName === 'postseason' || (!e.seasonTypeName && e.seasonType !== 1));
    const noType = events.filter((e) => !e.seasonTypeName && e.seasonType !== 1 && e.seasonType !== 2 && e.seasonType !== 3);

    function groupByMonth(evs) {
      const months = {};
      for (const ev of evs) {
        const d = new Date(ev.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        if (!months[key]) months[key] = { key, label, events: [] };
        months[key].events.push(ev);
      }
      return Object.values(months).sort((a, b) => a.key.localeCompare(b.key));
    }

    const sections = [];
    if (spring.length > 0) sections.push({ id: 'spring', title: 'Spring Training', months: groupByMonth(spring) });
    const regEvents = [...regular, ...noType];
    if (regEvents.length > 0) sections.push({ id: 'regular', title: 'Regular Season', months: groupByMonth(regEvents) });
    return sections;
  }, [events]);

  const toggle = (key) => setCollapsed((p) => ({ ...p, [key]: !p[key] }));

  if (events.length === 0) return <p className={styles.muted}>No schedule data available yet.</p>;

  return (
    <div className={styles.scheduleContainer}>
      {grouped.map((section) => (
        <div key={section.id} className={styles.scheduleSection}>
          <h4 className={styles.scheduleSectionTitle}>{section.title}</h4>
          {section.months.map((month) => {
            const isCollapsed = collapsed[month.key];
            return (
              <div key={month.key} className={styles.monthBlock}>
                <button type="button" className={styles.monthHeader} onClick={() => toggle(month.key)}>
                  <span>{month.label}</span>
                  <span className={styles.monthCount}>{month.events.length} games</span>
                  <span className={styles.monthChevron} aria-hidden>{isCollapsed ? '▸' : '▾'}</span>
                </button>
                {!isCollapsed && (
                  <div className={styles.monthEvents}>
                    <div className={styles.scheduleHeaderRow}>
                      <span className={styles.schedColDate}>Date</span>
                      <span className={styles.schedColOpp}>Matchup</span>
                      <span className={styles.schedColResult}>Score</span>
                      <span className={styles.schedColStatus}>Status</span>
                      <span className={styles.schedColNetwork}>TV</span>
                      <span className={styles.schedColBetting}>Line</span>
                      <span className={styles.schedColLink}></span>
                    </div>
                    {month.events.map((ev) => {
                      const won = ev.isFinal && ev.ourScore != null && ev.oppScore != null && ev.ourScore > ev.oppScore;
                      const lost = ev.isFinal && ev.ourScore != null && ev.oppScore != null && ev.ourScore < ev.oppScore;
                      const scoreStr = ev.ourScore != null && ev.oppScore != null ? `${ev.ourScore}-${ev.oppScore}` : '';
                      const isLive = ev.gameStatus === 'in_progress';
                      return (
                        <div key={ev.id} className={`${styles.scheduleRow} ${isLive ? styles.scheduleRowLive : ''}`}>
                          <span className={styles.schedColDate}>{formatDate(ev.date)}</span>
                          <span className={styles.schedColOpp}>
                            <OpponentLogo logoUrl={ev.opponentLogo} abbrev={ev.opponentAbbrev} size={22} />
                            <span className={styles.schedOppText}>
                              <span className={styles.schedHomeAway}>{ev.homeAway === 'home' ? 'vs' : '@'}</span>
                              {ev.opponent}
                            </span>
                          </span>
                          <span className={`${styles.schedColResult} ${won ? styles.resultWin : ''} ${lost ? styles.resultLoss : ''}`}>
                            {ev.isFinal && scoreStr ? (
                              <>
                                {scoreStr}
                                {won && <span className={styles.wlBadge}>W</span>}
                                {lost && <span className={`${styles.wlBadge} ${styles.wlLoss}`}>L</span>}
                              </>
                            ) : (
                              <span className={styles.schedDash}>—</span>
                            )}
                          </span>
                          <span className={styles.schedColStatus}>
                            <GameStatusBadge ev={ev} />
                          </span>
                          <span className={styles.schedColNetwork}>
                            {ev.network ? (
                              <span className={styles.networkBadge}>{ev.network}</span>
                            ) : (
                              <span className={styles.schedMuted}>—</span>
                            )}
                          </span>
                          <span className={styles.schedColBetting}>
                            <span className={styles.bettingPlaceholder}>—</span>
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
      ))}
    </div>
  );
}

export default function MlbTeamDetail() {
  const { slug } = useParams();
  const { buildPath } = useWorkspace();
  const team = getMLBTeamBySlug(slug);
  const logoUrl = team ? getMlbEspnLogoUrl(team.slug) : null;
  const espnId = team ? getMLBEspnId(team.slug) : null;

  const [odds, setOdds] = useState(null);
  const [headlines, setHeadlines] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [teamRecord, setTeamRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [liveGame, setLiveGame] = useState(null);

  useEffect(() => {
    if (!team) return;
    let cancelled = false;
    async function loadLive() {
      try {
        const r = await fetch(`/api/mlb/live/team?slug=${team.slug}`);
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled && d.game) setLiveGame(d.game);
      } catch { /* network error */ }
    }
    loadLive();
    const iv = setInterval(loadLive, 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [team]);

  useEffect(() => {
    Promise.allSettled([
      fetchMlbChampionshipOdds(),
      fetchMlbHeadlines(),
    ]).then(([oddsRes, newsRes]) => {
      if (oddsRes.status === 'fulfilled') setOdds(oddsRes.value.odds ?? {});
      if (newsRes.status === 'fulfilled') setHeadlines(newsRes.value.headlines ?? []);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!espnId) { setScheduleLoading(false); return; }
    setScheduleLoading(true);
    fetch(`/api/mlb/team/schedule?teamId=${espnId}`)
      .then((r) => r.json())
      .then((data) => {
        setSchedule(data.events ?? []);
        setTeamRecord(data.teamRecord ?? null);
      })
      .catch(() => {})
      .finally(() => setScheduleLoading(false));
  }, [espnId]);

  const teamOdds = odds?.[team?.slug];

  const teamHeadlines = useMemo(() => {
    if (!team) return [];
    return headlines.filter((h) => {
      const t = (h.title || '').toLowerCase();
      const nameParts = team.name.toLowerCase().split(' ');
      return nameParts.some((p) => p.length > 3 && t.includes(p));
    }).slice(0, 10);
  }, [headlines, team]);

  const { recentGames, nextGame, formGuide, record, streak } = useMemo(() => {
    const finals = schedule.filter((e) => e.isFinal).sort((a, b) => new Date(b.date) - new Date(a.date));
    const upcoming = schedule.filter((e) => !e.isFinal).sort((a, b) => new Date(a.date) - new Date(b.date));

    let w = 0, l = 0;
    finals.forEach((e) => { if (e.ourScore != null && e.oppScore != null) { if (e.ourScore > e.oppScore) w++; else l++; } });
    const rec = (w + l > 0) ? `${w}-${l}` : teamRecord || null;

    let streakStr = null;
    const scored = finals.filter((e) => e.ourScore != null && e.oppScore != null);
    if (scored.length > 0) {
      const firstWin = scored[0].ourScore > scored[0].oppScore;
      let count = 1;
      for (let i = 1; i < scored.length; i++) {
        if ((scored[i].ourScore > scored[i].oppScore) === firstWin) count++;
        else break;
      }
      streakStr = firstWin ? `W${count}` : `L${count}`;
    }

    const form = finals.slice(0, 10).map((e) => {
      if (e.ourScore == null || e.oppScore == null) return null;
      return { won: e.ourScore > e.oppScore, score: `${e.ourScore}-${e.oppScore}`, opponent: e.opponent };
    }).filter(Boolean);

    return { recentGames: finals.slice(0, 7), nextGame: upcoming[0] || null, formGuide: form, record: rec, streak: streakStr };
  }, [schedule, teamRecord]);

  if (!team) {
    return (
      <div className={styles.page}>
        <div className={styles.notFound}>
          <h2>Team not found</h2>
          <p>No MLB team matches "{slug}".</p>
          <Link to={buildPath('/teams')} className={styles.backLink}>← Back to Team Intel</Link>
        </div>
      </div>
    );
  }

  const isSpringTraining = schedule.length > 0 && schedule.some((e) => e.seasonTypeName === 'preseason') && !schedule.some((e) => e.seasonTypeName === 'regular' && e.isFinal);

  return (
    <div className={styles.page}>
      {/* ── Hero ── */}
      <header className={styles.hero}>
        <div className={styles.heroAccent} />
        <Link to={buildPath('/teams')} className={styles.backLink}>← Team Intel Hub</Link>
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
                <span className={styles.divisionChip}>{team.division}</span>
                <span className={styles.leagueChip}>{team.league === 'AL' ? 'American League' : 'National League'}</span>
                {record && <span className={styles.recordChip}>{record}</span>}
                {streak && (
                  <span className={`${styles.streakChip} ${streak.startsWith('W') ? styles.streakWin : styles.streakLoss}`}>
                    {streak}
                  </span>
                )}
                {isSpringTraining && <span className={styles.springChip}>Spring Training</span>}
              </div>
              {!loading && teamOdds && (
                <div className={styles.champChip}>
                  <span className={styles.champIcon}>🏆</span>
                  <div>
                    <span className={styles.champLabel}>World Series</span>
                    <span className={styles.champValue}>{formatOdds(teamOdds.bestChanceAmerican)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Section Nav ── */}
      <nav className={styles.sectionNav}>
        {['Intel', 'Odds', 'News', 'Schedule'].map((s) => (
          <a key={s} href={`#${s.toLowerCase()}`} className={styles.navPill}
            onClick={(e) => { e.preventDefault(); document.getElementById(s.toLowerCase())?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
            {s}
          </a>
        ))}
      </nav>

      <div className={styles.content}>
        {/* ── Today's Game Intel ── */}
        {liveGame && (
          <section className={styles.todayGameSection}>
            <h3 className={styles.sectionTitle}>
              {liveGame.gameState?.isLive ? 'Live Now' : 'Today\'s Game'}
            </h3>
            <LiveGameCard game={liveGame} />
          </section>
        )}

        {/* ── Intel Briefing ── */}
        <section id="intel" className={styles.briefingCard}>
          <div className={styles.briefingHeader}>
            <img src="/mascot-mlb.png" alt="" className={styles.briefingMascot} aria-hidden />
            <h2 className={styles.briefingTitle}>Intel Briefing</h2>
          </div>
          <div className={styles.briefingBody}>
            <p>
              {team.name} {record ? `hold a ${record} record` : 'are gearing up'} {isSpringTraining ? 'in spring training' : 'this season'}.
              {teamOdds ? ` Their World Series odds sit at ${formatOdds(teamOdds.bestChanceAmerican)} across ${teamOdds.booksCount || 'multiple'} sportsbooks.` : ''}
              {streak ? ` Currently on a ${streak} streak.` : ''}
              {formGuide.length >= 5 ? ` Recent form: ${formGuide.slice(0, 5).map((g) => g.won ? 'W' : 'L').join('-')}.` : ''}
              {!teamOdds && !streak ? ' Championship odds and game data will populate as the season gets underway.' : ''}
            </p>
          </div>
        </section>

        {/* ── Odds + ATS row ── */}
        <div id="odds" className={styles.twoCol}>
          <section className={styles.oddsCard}>
            <h3 className={styles.sectionTitle}>🏆 World Series Odds</h3>
            {loading ? (
              <p className={styles.muted}>Loading odds…</p>
            ) : teamOdds ? (
              <>
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
                    <span className={styles.oddsValue}>{teamOdds.booksCount ?? '—'}</span>
                  </div>
                </div>
                <div className={styles.affiliateRow}>
                  <AffiliateCta
                    offer="xbet-welcome"
                    brand="xbet"
                    label="Bet at XBet"
                    sublabel="Welcome bonus"
                    variant="subtle"
                    slot="mlb-team-odds"
                    team={team.slug}
                  />
                  <AffiliateCta
                    offer="mybookie-welcome"
                    brand="mybookie"
                    label="Bet at MyBookie"
                    sublabel="Welcome bonus"
                    variant="subtle"
                    slot="mlb-team-odds"
                    team={team.slug}
                  />
                </div>
              </>
            ) : (
              <p className={styles.muted}>No championship odds available yet.</p>
            )}
          </section>

          <section className={styles.atsCard}>
            <h3 className={styles.sectionTitle}>ATS Profile</h3>
            <div className={styles.atsBody}>
              <div className={styles.atsGrid}>
                <div className={styles.atsStat}>
                  <span className={styles.atsLabel}>Season</span>
                  <span className={styles.atsValue}><span className={styles.atsPending}>{record || 'Pending'}</span></span>
                </div>
                <div className={styles.atsStat}>
                  <span className={styles.atsLabel}>ATS</span>
                  <span className={styles.atsValue}><span className={styles.atsPending}>Pending</span></span>
                </div>
              </div>
              <p className={styles.atsNote}>
                {isSpringTraining
                  ? 'ATS data will populate when the regular season begins.'
                  : 'ATS tracking activates once sufficient game data is available.'}
              </p>
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

        {/* ── Next Game ── */}
        {nextGame && (
          <section className={styles.nextGameCard}>
            <h3 className={styles.sectionTitle}>Next Game</h3>
            <div className={styles.nextGameBody}>
              <div className={styles.nextGameMatchup}>
                <OpponentLogo logoUrl={nextGame.opponentLogo} abbrev={nextGame.opponentAbbrev} size={28} />
                <span className={styles.nextGameVs}>{nextGame.homeAway === 'home' ? 'vs' : '@'}</span>
                <strong className={styles.nextGameOpp}>{nextGame.opponent}</strong>
                <span className={styles.nextGameTime}>{formatDateTime(nextGame.date)}</span>
              </div>
              {nextGame.venue && <p className={styles.nextGameVenue}>{nextGame.venue}</p>}
              <GamecastLink url={nextGame.gamecastUrl} />
            </div>
          </section>
        )}

        {/* ── Recent Results ── */}
        {recentGames.length > 0 && (
          <section className={styles.resultsSection}>
            <h3 className={styles.sectionTitle}>Recent Results</h3>
            <div className={styles.resultsList}>
              {recentGames.map((ev) => {
                const won = ev.ourScore > ev.oppScore;
                return (
                  <div key={ev.id} className={styles.resultRow}>
                    <span className={styles.resultDate}>{formatDate(ev.date)}</span>
                    <span className={styles.resultOpp}>
                      <OpponentLogo logoUrl={ev.opponentLogo} abbrev={ev.opponentAbbrev} size={20} />
                      {ev.homeAway === 'home' ? 'vs' : '@'} {ev.opponent}
                    </span>
                    <span className={`${styles.resultScore} ${won ? styles.resultWin : styles.resultLoss}`}>
                      {ev.ourScore}-{ev.oppScore}
                    </span>
                    <GamecastLink url={ev.gamecastUrl} />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Intel Feed: News + Videos ── */}
        <section id="news" className={styles.intelFeedSection}>
          <MlbTeamIntelFeed
            teamSlug={team.slug}
            teamName={team.name}
            headlines={teamHeadlines}
          />
        </section>

        {/* ── Full Schedule ── */}
        <section id="schedule" className={styles.scheduleOuter}>
          <h3 className={styles.sectionTitle}>Full Schedule</h3>
          {scheduleLoading ? (
            <p className={styles.muted}>Loading schedule…</p>
          ) : (
            <ScheduleSection events={schedule} />
          )}
        </section>
      </div>
    </div>
  );
}
