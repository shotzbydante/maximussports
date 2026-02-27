/**
 * Pinned Teams Dashboard — multi-select + search, cards with rank, next game, headlines, records.
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
import { getTeamSlug } from '../../utils/teamSlug';
import { getAtsCache, setAtsCache } from '../../utils/atsCache';
import { fetchTeamSummary } from '../../api/summary';
import TeamLogo from '../shared/TeamLogo';
import SourceBadge from '../shared/SourceBadge';
import styles from './PinnedTeamsSection.module.css';

// Popular teams to suggest to new users
const POPULAR_PICKS = [
  { slug: 'duke-blue-devils',     name: 'Duke' },
  { slug: 'kansas-jayhawks',      name: 'Kansas' },
  { slug: 'connecticut-huskies',  name: 'UConn' },
  { slug: 'houston-cougars',      name: 'Houston' },
  { slug: 'kentucky-wildcats',    name: 'Kentucky' },
  { slug: 'gonzaga-bulldogs',     name: 'Gonzaga' },
];

// Static preview card data — no fetching, illustrative only
const PREVIEW_CARD = {
  team: { name: 'Duke Blue Devils', conference: 'ACC', oddsTier: 'Lock', slug: 'duke-blue-devils' },
  rank: 2,
  season: '22–5',
  last10: '8–2',
  ats: '14–10',
  nextGame: 'vs North Carolina · Sat 6:00 PM PT',
  summary: 'Led by 21 PPG from Cooper Flagg. Top seed projection, strong ATS cover rate in ACC play.',
  headlines: [
    'Flagg named ACC Player of the Week for third time this season',
    'Duke locks in NCAA Tournament top seed with road win',
  ],
};

/** Small quick-select chip */
function QuickChip({ name, onClick }) {
  return (
    <button type="button" className={styles.quickChip} onClick={onClick}>
      {name}
    </button>
  );
}

/** Premium empty-state onboarding card */
function EmptyStateCard({ onOpenAdd, onQuickPin, pinned }) {
  const availableChips = POPULAR_PICKS.filter((p) => !pinned.includes(p.slug));
  return (
    <div className={styles.onboardingCard}>
      <p className={styles.onboardingHeading}>Track your teams, all in one place</p>
      <ul className={styles.onboardingBullets}>
        <li>Live ranking + bubble context</li>
        <li>Next game · tipoff time · odds</li>
        <li>ATS performance spotlight</li>
        <li>Recent results (L10 record)</li>
        <li>News velocity &amp; latest headlines</li>
      </ul>
      <button type="button" className={styles.ctaBtn} onClick={onOpenAdd}>
        + Add team
      </button>
      <p className={styles.ctaHint}>Search any team by name. Try: Duke, Kansas, UConn…</p>
      {availableChips.length > 0 && (
        <div className={styles.popularRow}>
          <span className={styles.popularLabel}>Popular picks</span>
          <div className={styles.quickChips}>
            {availableChips.map((p) => (
              <QuickChip key={p.slug} name={p.name} onClick={() => onQuickPin(p.slug)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Static preview card — shows what a pinned team card looks like */
function PreviewCard() {
  const { team, rank, season, last10, ats, nextGame, summary, headlines } = PREVIEW_CARD;
  return (
    <article className={`${styles.card} ${styles.previewCard}`} aria-label="Example pinned team card">
      <div className={styles.exampleBadge}>Example</div>
      <div className={styles.cardHeader}>
        <div className={styles.cardLinkMock}>
          <TeamLogo team={team} size={32} />
          <div className={styles.cardMeta}>
            <span className={styles.teamName}>{team.name}</span>
            <span className={styles.conference}>{team.conference}</span>
          </div>
        </div>
        <div className={styles.cardBadges}>
          <span className={styles.rank}>#{rank}</span>
          <span className={`${styles.tier} ${styles.tierLock}`}>{team.oddsTier}</span>
        </div>
      </div>
      <div className={styles.nextGame}>
        <span className={styles.nextLabel}>Next:</span>
        <span>{nextGame}</span>
      </div>
      <div className={styles.recordsRow}>
        <span className={styles.recordCell}>
          <span className={styles.recordLabel}>Season</span>
          <span className={styles.recordValue}>{season}</span>
        </span>
        <span className={styles.recordCell}>
          <span className={styles.recordLabel}>L10</span>
          <span className={styles.recordValue}>{last10}</span>
        </span>
        <span className={styles.recordCell}>
          <span className={styles.recordLabel}>ATS</span>
          <span className={styles.recordValue}>{ats}</span>
        </span>
      </div>
      <div className={styles.teamSummary}>
        <p className={styles.teamSummaryText}>{summary}</p>
      </div>
      <ul className={styles.headlines}>
        {headlines.map((h) => (
          <li key={h}><span className={styles.headlineMock}>{h}</span></li>
        ))}
      </ul>
      <span className={styles.teamLinkMock}>View team →</span>
    </article>
  );
}

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

function recordFromBatchData(batchSlot) {
  if (!batchSlot?.schedule?.events) return null;
  const past = batchSlot.schedule.events.filter((e) => e.isFinal).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (past.length === 0) return null;
  const seasonW = past.filter((e) => (e.ourScore != null && e.oppScore != null) && Number(e.ourScore) > Number(e.oppScore)).length;
  const seasonL = past.filter((e) => (e.ourScore != null && e.oppScore != null) && Number(e.ourScore) < Number(e.oppScore)).length;
  const last10 = past.slice(0, 10);
  const l10W = last10.filter((e) => (e.ourScore != null && e.oppScore != null) && Number(e.ourScore) > Number(e.oppScore)).length;
  const l10L = last10.filter((e) => (e.ourScore != null && e.oppScore != null) && Number(e.ourScore) < Number(e.oppScore)).length;
  const ats = batchSlot.ats?.season?.total > 0 ? batchSlot.ats.season : null;
  return { season: { w: seasonW, l: seasonL }, last10: { w: l10W, l: l10L }, ats };
}

export default function PinnedTeamsSection({ onPinnedChange, rankMap: rankMapProp = {}, games: gamesProp, teamNewsBySlug: teamNewsBySlugProp = {}, pinnedTeamDataBySlug = {} }) {
  const [pinned, setPinned] = useState(() => getPinnedTeams());
  const [rankMap, setRankMap] = useState(rankMapProp);
  const [scores, setScores] = useState({ games: Array.isArray(gamesProp) ? gamesProp : [], loading: false });
  const [teamNews, setTeamNews] = useState(() => {
    if (teamNewsBySlugProp && typeof teamNewsBySlugProp === 'object') {
      const next = {};
      Object.entries(teamNewsBySlugProp).forEach(([slug, headlines]) => {
        next[slug] = Array.isArray(headlines) ? headlines.slice(0, 3) : [];
      });
      return next;
    }
    return {};
  });
  const [teamRecords, setTeamRecords] = useState({});
  const [teamSummaries, setTeamSummaries] = useState({});
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

  useEffect(() => {
    if (Object.keys(rankMapProp).length > 0) setRankMap(rankMapProp);
  }, [rankMapProp]);

  useEffect(() => {
    if (Array.isArray(gamesProp)) setScores((s) => ({ ...s, games: gamesProp }));
  }, [gamesProp]);

  useEffect(() => {
    if (teamNewsBySlugProp && typeof teamNewsBySlugProp === 'object') {
      const next = {};
      Object.entries(teamNewsBySlugProp).forEach(([slug, headlines]) => {
        next[slug] = Array.isArray(headlines) ? headlines.slice(0, 3) : [];
      });
      setTeamNews(next);
    }
  }, [teamNewsBySlugProp]);

  // Derive teamRecords and teamNews from batch data (from Home: /api/team/batch + staggered refresh)
  useEffect(() => {
    if (pinned.length === 0) {
      setTeamRecords({});
      return;
    }
    const slugs = pinned.slice(0, 8);
    const records = {};
    const news = {};
    slugs.forEach((slug) => {
      const slot = pinnedTeamDataBySlug[slug];
      if (slot) {
        const rec = recordFromBatchData(slot);
        if (rec) {
          records[slug] = rec;
          if (rec.ats) setAtsCache(slug, { season: rec.ats, last30: null, last7: null });
        }
        const headlines = slot.teamNews || [];
        news[slug] = Array.isArray(headlines) ? headlines.slice(0, 3) : [];
      }
    });
    setTeamRecords(records);
    if (Object.keys(news).length > 0) {
      setTeamNews((prev) => ({ ...prev, ...news }));
    }
  }, [pinned.join(','), pinnedTeamDataBySlug]);

  // GPT summary per pinned team (from that card's headlines only); cache on server ~30 min
  useEffect(() => {
    if (pinned.length === 0) return;
    pinned.slice(0, 8).forEach((slug) => {
      const headlines = teamNews[slug] || [];
      if (headlines.length === 0) {
        setTeamSummaries((prev) => ({ ...prev, [slug]: null }));
        return;
      }
      fetchTeamSummary({
        slug,
        headlines: headlines.map((h) => ({ title: h.title, source: h.source })),
      }).then(({ summary }) => {
        setTeamSummaries((prev) => ({ ...prev, [slug]: summary }));
      }).catch(() => {
        setTeamSummaries((prev) => ({ ...prev, [slug]: null }));
      });
    });
  }, [pinned.join(','), teamNews]);

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

  const handleQuickPin = useCallback((slug) => {
    handleAdd(slug);
  }, [handleAdd]);

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>Pinned Teams</h2>
        <div className={styles.actions}>
          {/* "Add more" prompt when exactly 1 team is tracked */}
          {pinned.length === 1 && !showAdd && (
            <div className={styles.addMoreHint}>
              <span className={styles.addMoreText}>Pin a few more for faster tracking</span>
              {POPULAR_PICKS.filter((p) => !pinned.includes(p.slug)).slice(0, 3).map((p) => (
                <QuickChip key={p.slug} name={p.name} onClick={() => handleQuickPin(p.slug)} />
              ))}
            </div>
          )}
          <button
            type="button"
            className={styles.addBtn}
            onClick={() => setShowAdd(!showAdd)}
            aria-expanded={showAdd}
          >
            {showAdd ? 'Done' : '+ Add team'}
          </button>
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

      {/* Empty state: onboarding card + preview card */}
      {pinned.length === 0 && (
        <div className={styles.emptyLayout}>
          <EmptyStateCard
            onOpenAdd={() => setShowAdd(true)}
            onQuickPin={handleQuickPin}
            pinned={pinned}
          />
          <PreviewCard />
        </div>
      )}

      {/* Pinned team cards grid */}
      {pinned.length > 0 && (
        <div className={styles.cards}>
          {pinned.map((slug) => {
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
                {(() => {
                  const rec = teamRecords[slug];
                  const cached = getAtsCache(slug);
                  const season = rec?.season;
                  const last10 = rec?.last10;
                  const ats = rec?.ats ?? (cached?.season?.total > 0 ? cached.season : null);
                  const seasonStr = season?.w != null && season?.l != null ? `${season.w}–${season.l}` : '—';
                  const l10Str = last10?.w != null && last10?.l != null ? `${last10.w}–${last10.l}` : '—';
                  const atsStr = ats?.total > 0 ? `${ats.w}–${ats.l}${ats.p > 0 ? `–${ats.p}` : ''}` : '—';
                  const hasData = seasonStr !== '—' || l10Str !== '—' || atsStr !== '—';
                  return (
                    <>
                      <div className={styles.recordsRow}>
                        <span className={styles.recordCell}>
                          <span className={styles.recordLabel}>Season</span>
                          <span className={styles.recordValue}>{seasonStr}</span>
                        </span>
                        <span className={styles.recordCell}>
                          <span className={styles.recordLabel}>L10</span>
                          <span className={styles.recordValue}>{l10Str}</span>
                        </span>
                        <span className={styles.recordCell}>
                          <span className={styles.recordLabel}>ATS</span>
                          <span className={styles.recordValue}>{atsStr}</span>
                        </span>
                      </div>
                      {hasData && (
                        <div className={styles.recordsSource}>
                          <SourceBadge source="ESPN" />
                          <SourceBadge source="Odds API" />
                        </div>
                      )}
                    </>
                  );
                })()}
                <div className={styles.teamSummary}>
                  {headlines.length > 0 ? (
                    (teamSummaries[slug] != null && teamSummaries[slug] !== '') ? (
                      <p className={styles.teamSummaryText}>{teamSummaries[slug]}</p>
                    ) : (
                      <p className={styles.teamSummaryUnavailable}>Summary unavailable</p>
                    )
                  ) : (
                    <p className={styles.teamSummaryUnavailable}>Summary unavailable</p>
                  )}
                </div>
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
          })}
        </div>
      )}
    </section>
  );
}
