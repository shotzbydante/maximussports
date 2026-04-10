/**
 * NBA Team Intel detail page — premium team intelligence surface.
 * Sections: Hero → Odds → News → Schedule
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { getNbaTeamBySlug, getNbaEspnId } from '../../sports/nba/teams';
import { getNbaEspnLogoUrl } from '../../utils/espnNbaLogos';
import { fetchNbaChampionshipOdds } from '../../api/nbaChampionshipOdds';
import { fetchNbaHeadlines } from '../../api/nbaNews';
import NbaLiveGameCard from '../../components/nba/NbaLiveGameCard';
import styles from './NbaTeamDetail.module.css';

function formatOdds(american) {
  if (american == null) return '\u2014';
  return american > 0 ? `+${american}` : `${american}`;
}

function formatDateTime(str) {
  if (!str) return '';
  try { return new Date(str).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return str; }
}

export default function NbaTeamDetail() {
  const { slug } = useParams();
  const { workspace, buildPath } = useWorkspace();
  const team = getNbaTeamBySlug(slug);
  const logoUrl = getNbaEspnLogoUrl(slug);

  const [champOdds, setChampOdds] = useState(null);
  const [headlines, setHeadlines] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [nextGame, setNextGame] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!team) return;
    let cancelled = false;

    async function load() {
      const results = await Promise.allSettled([
        fetchNbaChampionshipOdds(),
        fetchNbaHeadlines(),
        fetch(`/api/nba/team/schedule?slug=${slug}`).then(r => r.json()).catch(() => ({})),
      ]);

      if (cancelled) return;

      if (results[0].status === 'fulfilled') {
        const odds = results[0].value?.odds?.[slug];
        setChampOdds(odds || null);
      }

      if (results[1].status === 'fulfilled') {
        const all = results[1].value?.headlines ?? [];
        const teamLower = team.name.toLowerCase();
        const abbrevLower = team.abbrev.toLowerCase();
        const filtered = all.filter(h => {
          const t = (h.title || '').toLowerCase();
          return t.includes(teamLower) || t.includes(abbrevLower) || t.includes(team.slug);
        });
        setHeadlines(filtered.length > 0 ? filtered.slice(0, 8) : all.slice(0, 5));
      }

      if (results[2].status === 'fulfilled') {
        const data = results[2].value;
        setSchedule(data.events || []);
        const upcoming = (data.events || []).find(ev => ev.gameStatus === 'upcoming' || ev.gameStatus === 'scheduled');
        setNextGame(upcoming || null);
      }

      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [slug, team]);

  if (!team) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <h3>Team not found</h3>
          <p>Could not find an NBA team with slug "{slug}".</p>
          <Link to={buildPath('/teams')}>Back to Team Intel</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Hero */}
      <header className={styles.hero}>
        {logoUrl && (
          <img src={logoUrl} alt={team.name} className={styles.heroLogo} width={80} height={80} />
        )}
        <div className={styles.heroInfo}>
          <h1 className={styles.heroName}>{team.name}</h1>
          <div className={styles.heroMeta}>
            <span className={styles.heroDivision}>{team.conference} &middot; {team.division}</span>
          </div>
        </div>
      </header>

      {/* Championship Odds */}
      {champOdds && (
        <section className={styles.oddsSection}>
          <h2 className={styles.sectionTitle}>Championship Odds</h2>
          <div className={styles.oddsGrid}>
            <div className={styles.oddsCard}>
              <span className={styles.oddsLabel}>Best Odds</span>
              <span className={styles.oddsValue}>{formatOdds(champOdds.bestPayoutAmerican)}</span>
            </div>
            <div className={styles.oddsCard}>
              <span className={styles.oddsLabel}>Implied Chance</span>
              <span className={styles.oddsValue}>
                {champOdds.bestChanceAmerican != null
                  ? `${Math.round((champOdds.bestChanceAmerican < 0
                      ? Math.abs(champOdds.bestChanceAmerican) / (Math.abs(champOdds.bestChanceAmerican) + 100)
                      : 100 / (champOdds.bestChanceAmerican + 100)) * 1000) / 10}%`
                  : '\u2014'}
              </span>
            </div>
            <div className={styles.oddsCard}>
              <span className={styles.oddsLabel}>Books</span>
              <span className={styles.oddsValue}>{champOdds.booksCount ?? '\u2014'}</span>
            </div>
          </div>
        </section>
      )}

      {/* Next Game */}
      {nextGame && (
        <section className={styles.nextGameSection}>
          <h2 className={styles.sectionTitle}>Next Game</h2>
          <div className={styles.nextGameCard}>
            <span className={styles.nextGameOpp}>
              {nextGame.isHome ? 'vs' : '@'} {nextGame.opponent || 'TBD'}
            </span>
            <span className={styles.nextGameTime}>{formatDateTime(nextGame.date)}</span>
            {nextGame.network && <span className={styles.nextGameNetwork}>{nextGame.network}</span>}
          </div>
        </section>
      )}

      {/* News */}
      <section className={styles.newsSection}>
        <h2 className={styles.sectionTitle}>Latest Headlines</h2>
        {headlines.length === 0 ? (
          <p className={styles.emptyMsg}>No team-specific headlines right now.</p>
        ) : (
          <div className={styles.newsList}>
            {headlines.map((h, i) => (
              <a key={h.link || i} href={h.link} target="_blank" rel="noopener noreferrer" className={styles.newsItem}>
                <span className={styles.newsSource}>{h.source}</span>
                <span className={styles.newsTitle}>{h.title}</span>
                {h.time && <span className={styles.newsTime}>{h.time}</span>}
              </a>
            ))}
          </div>
        )}
      </section>

      {/* Schedule */}
      {schedule.length > 0 && (
        <section className={styles.scheduleSection}>
          <h2 className={styles.sectionTitle}>Schedule</h2>
          <div className={styles.scheduleList}>
            {schedule.slice(0, 15).map((ev, i) => (
              <div key={ev.id || i} className={styles.scheduleRow}>
                <span className={styles.scheduleDate}>{formatDateTime(ev.date)}</span>
                <span className={styles.scheduleOpp}>
                  {ev.isHome ? 'vs' : '@'} {ev.opponent || 'TBD'}
                </span>
                {ev.gameStatus === 'final' || ev.isFinal ? (
                  <span className={styles.scheduleScore}>
                    {ev.ourScore}-{ev.oppScore}
                  </span>
                ) : (
                  <span className={styles.scheduleStatus}>{ev.network || 'Scheduled'}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
