/**
 * Pinned Teams Dashboard — multi-select + search, cards with rank, next game, headlines.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { TEAMS, getTeamBySlug } from '../../data/teams';
import { getTeamsGroupedByConference } from '../../data/teams';
import {
  getPinnedTeams,
  togglePinnedTeam,
  addPinnedTeam,
  removePinnedTeam,
} from '../../utils/pinnedTeams';
import { fetchRankings } from '../../api/rankings';
import { fetchScores } from '../../api/scores';
import { fetchTeamNews } from '../../api/news';
import { buildSlugToRankMap } from '../../utils/rankingsNormalize';
import { getTeamSlug } from '../../utils/teamSlug';
import TeamLogo from '../shared/TeamLogo';
import SourceBadge from '../shared/SourceBadge';
import styles from './PinnedTeamsSection.module.css';

const TIER_CLASS = {
  Lock: styles.tierLock,
  'Should be in': styles.tierShould,
  'Work to do': styles.tierWork,
  'Long shot': styles.tierLong,
};

function formatTimePST(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return null;
  }
}

export default function PinnedTeamsSection({ onPinnedChange }) {
  const [pinned, setPinned] = useState(() => getPinnedTeams());
  const [rankMap, setRankMap] = useState({});
  const [scores, setScores] = useState({ games: [], loading: false });
  const [teamNews, setTeamNews] = useState({});
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const grouped = getTeamsGroupedByConference();

  const notify = useCallback(() => {
    onPinnedChange?.(getPinnedTeams());
  }, [onPinnedChange]);

  const handleToggle = useCallback((slug) => {
    setPinned(togglePinnedTeam(slug));
    notify();
  }, [notify]);

  const handleAdd = useCallback((slug) => {
    setPinned(addPinnedTeam(slug));
    setSearch('');
    setShowAdd(false);
    notify();
  }, [notify]);

  const handleRemove = useCallback((slug) => {
    setPinned(removePinnedTeam(slug));
    notify();
  }, [notify]);

  // Load rankings
  useEffect(() => {
    fetchRankings()
      .then((data) => setRankMap(buildSlugToRankMap(data, TEAMS)))
      .catch(() => setRankMap({}));
  }, []);

  // Load scores
  useEffect(() => {
    setScores((s) => ({ ...s, loading: true }));
    fetchScores()
      .then((games) => setScores({ games, loading: false }))
      .catch(() => setScores({ games: [], loading: false }));
  }, []);

  // Load news for pinned teams
  useEffect(() => {
    if (pinned.length === 0) {
      setTeamNews({});
      return;
    }
    const slugs = pinned.slice(0, 8);
    Promise.all(
      slugs.map((slug) =>
        fetchTeamNews(slug)
          .then((res) => ({ slug, headlines: res?.headlines || [] }))
          .catch(() => ({ slug, headlines: [] }))
      )
    ).then((results) => {
      const next = {};
      results.forEach(({ slug, headlines }) => {
        next[slug] = headlines.slice(0, 3);
      });
      setTeamNews(next);
    });
  }, [pinned.join(',')]);

  const filteredTeams = search.trim()
    ? TEAMS.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.conference.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  const getNextGame = (slug) => {
    const team = getTeamBySlug(slug);
    if (!team) return null;
    const games = scores.games || [];
    for (const g of games) {
      const homeSlug = getTeamSlug(g.homeTeam);
      const awaySlug = getTeamSlug(g.awayTeam);
      if (homeSlug === slug || awaySlug === slug) {
        const time = formatTimePST(g.startTime);
        return {
          vs: homeSlug === slug ? g.awayTeam : g.homeTeam,
          status: g.gameStatus,
          time,
          network: g.network,
        };
      }
    }
    return null;
  };

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>Pinned Teams</h2>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.addBtn}
            onClick={() => setShowAdd(!showAdd)}
            aria-expanded={showAdd}
          >
            {showAdd ? 'Done' : '+ Add team'}
          </button>
          <SourceBadge source="Google News" />
        </div>
      </div>

      {showAdd && (
        <div className={styles.addPanel}>
          <input
            type="search"
            placeholder="Search teams…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
            autoFocus
          />
          <div className={styles.searchResults}>
            {search.trim() ? (
              filteredTeams.length > 0 ? (
                filteredTeams.slice(0, 12).map((t) => (
                  <button
                    key={t.slug}
                    type="button"
                    className={styles.searchItem}
                    onClick={() => handleAdd(t.slug)}
                    disabled={pinned.includes(t.slug)}
                  >
                    <TeamLogo team={t} size={24} />
                    <span>{t.name}</span>
                    <span className={styles.conf}>{t.conference}</span>
                    {pinned.includes(t.slug) && <span className={styles.check}>✓</span>}
                  </button>
                ))
              ) : (
                <div className={styles.empty}>No teams found</div>
              )
            ) : (
              <div className={styles.multiSelect}>
                <span className={styles.multiLabel}>Or select from list:</span>
                {grouped.map(({ conference, tiers }) => (
                  <div key={conference} className={styles.tierGroup}>
                    <span className={styles.confLabel}>{conference}</span>
                    <div className={styles.checkboxList}>
                      {Object.values(tiers).flat().map((t) => (
                        <label key={t.slug} className={styles.checkbox}>
                          <input
                            type="checkbox"
                            checked={pinned.includes(t.slug)}
                            onChange={() => handleToggle(t.slug)}
                          />
                          <span>{t.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className={styles.cards}>
        {pinned.length === 0 ? (
          <p className={styles.emptyState}>
            Pin teams to track rankings, next games, and news. Use &quot;+ Add team&quot; to get started.
          </p>
        ) : (
          pinned.map((slug) => {
            const team = getTeamBySlug(slug);
            if (!team) return null;
            const rank = rankMap[slug];
            const nextGame = getNextGame(slug);
            const headlines = teamNews[slug] || [];
            return (
              <article key={slug} className={styles.card}>
                <div className={styles.cardHeader}>
                  <Link to={`/teams/${slug}`} className={styles.cardLink}>
                    <TeamLogo team={team} size={32} />
                    <div className={styles.cardMeta}>
                      <span className={styles.teamName}>{team.name}</span>
                      <span className={styles.conference}>{team.conference}</span>
                    </div>
                  </Link>
                  <div className={styles.cardBadges}>
                    {rank != null && (
                      <span className={styles.rank}>#{rank}</span>
                    )}
                    <span className={`${styles.tier} ${TIER_CLASS[team.oddsTier] || ''}`}>
                      {team.oddsTier}
                    </span>
                    <button
                      type="button"
                      className={styles.unpin}
                      onClick={() => handleRemove(slug)}
                      title="Unpin"
                      aria-label={`Unpin ${team.name}`}
                    >
                      ×
                    </button>
                  </div>
                </div>
                {nextGame && (
                  <div className={styles.nextGame}>
                    <span className={styles.nextLabel}>Next:</span>
                    <span>
                      vs {nextGame.vs} — {nextGame.status}
                      {nextGame.time && ` · ${nextGame.time} PST`}
                      {nextGame.network && ` · ${nextGame.network}`}
                    </span>
                  </div>
                )}
                {headlines.length > 0 && (
                  <ul className={styles.headlines}>
                    {headlines.map((h) => (
                      <li key={h.id || h.title}>
                        <a
                          href={h.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.headlineLink}
                        >
                          {h.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <Link to={`/teams/${slug}`} className={styles.teamLink}>
                  View team →
                </Link>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
