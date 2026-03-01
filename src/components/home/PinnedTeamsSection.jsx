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
import { ESPNGamecastLink } from '../shared/ESPNGamecastLink';
import { fetchTeamSummary } from '../../api/summary';
import { fetchTeamPage } from '../../api/team';
import { getCached, setCached } from '../../utils/ytClientCache';
import TeamLogo from '../shared/TeamLogo';
import SourceBadge from '../shared/SourceBadge';
import styles from './PinnedTeamsSection.module.css';

// Popular teams to suggest to new users
const POPULAR_PICKS = [
  { slug: 'duke-blue-devils',    name: 'Duke' },
  { slug: 'kansas-jayhawks',     name: 'Kansas' },
  { slug: 'connecticut-huskies', name: 'UConn' },
  { slug: 'houston-cougars',     name: 'Houston' },
  { slug: 'kentucky-wildcats',   name: 'Kentucky' },
  { slug: 'gonzaga-bulldogs',    name: 'Gonzaga' },
];

const DUKE_SLUG          = 'duke-blue-devils';
const DUKE_PREVIEW_KEY   = 'previewCard:duke-blue-devils';
const DUKE_PREVIEW_TTL   = 5 * 60 * 1000; // 5 min

// Evergreen fallback — only shown if Duke data fails to load
const PREVIEW_CARD_FALLBACK = {
  rank: null,
  season: '—',
  last10: '—',
  ats: '—',
  nextGame: null,
  summary: 'Lock-tier ACC program. Elite recruiting, strong perimeter defense, perennial March Madness contender. Check the team page for full live intel.',
};

const PICKER_SEARCH_ICON = (
  <svg
    width="14" height="14" viewBox="0 0 14 14" fill="none"
    aria-hidden className={styles.pickerSearchIcon}
  >
    <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4" />
    <line x1="8.8" y1="8.8" x2="12.5" y2="12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const CLOSE_ICON = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
    <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

/** Small quick-select chip — opens picker with team prefilled */
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
        Pin your first team
      </button>
      <p className={styles.ctaHint}>Search any team by name. Try: Duke, Kansas, UConn…</p>
      {availableChips.length > 0 && (
        <div className={styles.popularRow}>
          <span className={styles.popularLabel}>Popular picks</span>
          <div className={styles.quickChips}>
            {availableChips.map((p) => (
              <QuickChip
                key={p.slug}
                name={p.name}
                onClick={() => onQuickPin(p.slug)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Preview card showing real Duke data (or evergreen fallback on error).
 * Fetches Duke's core data once on mount (cache-first, 5-min TTL).
 */
function DukePreviewCard({ onDismiss, gamesForToday }) {
  const dukeTeam  = getTeamBySlug(DUKE_SLUG);
  const [data,    setData]    = useState(() => getCached(DUKE_PREVIEW_KEY) ?? null);
  const [loading, setLoading] = useState(!getCached(DUKE_PREVIEW_KEY));

  useEffect(() => {
    if (getCached(DUKE_PREVIEW_KEY)) return; // already cached
    let cancelled = false;
    fetchTeamPage(DUKE_SLUG, { coreOnly: true })
      .then((res) => {
        if (cancelled) return;
        setCached(DUKE_PREVIEW_KEY, res, DUKE_PREVIEW_TTL);
        setData(res);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Compute records from schedule events
  const events  = data?.schedule?.events ?? [];
  const finals  = events.filter((e) => e.isFinal).sort((a, b) => new Date(b.date) - new Date(a.date));
  const l10     = finals.slice(0, 10);
  const l10W    = l10.filter((e) => e.ourScore != null && Number(e.ourScore) > Number(e.oppScore)).length;
  const l10L    = l10.filter((e) => e.ourScore != null && Number(e.ourScore) < Number(e.oppScore)).length;
  const seasonW = finals.filter((e) => e.ourScore != null && Number(e.ourScore) > Number(e.oppScore)).length;
  const seasonL = finals.filter((e) => e.ourScore != null && Number(e.ourScore) < Number(e.oppScore)).length;

  const rank      = data?.rank ?? null;
  const hasL10    = l10.length > 0;
  const hasSeason = finals.length > 0;

  const seasonStr = hasSeason ? `${seasonW}–${seasonL}` : '—';
  const l10Str    = hasL10    ? `${l10W}–${l10L}`       : '—';

  // Next game from today's schedule
  const todayGame = (() => {
    if (!Array.isArray(gamesForToday)) return null;
    for (const g of gamesForToday) {
      const homeSlug = getTeamSlug(g.homeTeam);
      const awaySlug = getTeamSlug(g.awayTeam);
      if (homeSlug === DUKE_SLUG || awaySlug === DUKE_SLUG) {
        const vs = homeSlug === DUKE_SLUG ? g.awayTeam : g.homeTeam;
        return { vs, status: g.gameStatus, network: g.network, gameId: g.gameId };
      }
    }
    return null;
  })();

  // Upcoming from schedule events
  const nextScheduled = (() => {
    if (todayGame) return null;
    const upcoming = events
      .filter((e) => !e.isFinal)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    return upcoming[0] ?? null;
  })();

  const fallback = !data && !loading;

  return (
    <article className={styles.previewCard} aria-label="Duke Blue Devils preview card">
      <div className={styles.previewTopBar}>
        <span className={styles.exampleLabel}>Preview</span>
        <button
          type="button"
          className={styles.dismissBtn}
          onClick={onDismiss}
          aria-label="Dismiss preview card"
        >
          {CLOSE_ICON}
        </button>
      </div>

      <div className={styles.previewCardBody}>
        <div className={styles.cardHeader}>
          <div className={styles.cardLinkMock}>
            <TeamLogo team={dukeTeam} size={32} />
            <div className={styles.cardMeta}>
              <span className={styles.teamName}>{dukeTeam?.name ?? 'Duke Blue Devils'}</span>
              <span className={styles.conference}>{dukeTeam?.conference ?? 'ACC'}</span>
            </div>
          </div>
          <div className={styles.cardBadges}>
            {rank != null && <span className={styles.rank}>#{rank}</span>}
            <span className={`${styles.tier} ${TIER_CLASS['Lock'] || ''}`}>Lock</span>
          </div>
        </div>

        {/* Next game */}
        {todayGame && (
          <div className={styles.nextGame}>
            <span className={styles.nextLabel}>Today:</span>
            <span>vs {todayGame.vs} — {todayGame.status}
              {todayGame.network && ` · ${todayGame.network}`}
            </span>
          </div>
        )}
        {!todayGame && nextScheduled && (
          <div className={styles.nextGame}>
            <span className={styles.nextLabel}>Next:</span>
            <span>{nextScheduled.homeAway === 'home' ? 'vs' : '@'} {nextScheduled.opponent}</span>
          </div>
        )}

        {/* Records skeleton or real data */}
        {loading ? (
          <div className={styles.recordsSkeletonRow} aria-label="Loading records">
            {['Season', 'L10', 'ATS'].map((lbl) => (
              <div key={lbl} className={styles.recordSkeleton}>
                <div className={styles.recordSkeletonLabel} />
                <div className={styles.recordSkeletonValue} />
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.recordsRow}>
            <span className={styles.recordCell}>
              <span className={styles.recordLabel}>Season</span>
              <span className={styles.recordValue}>{fallback ? PREVIEW_CARD_FALLBACK.season : seasonStr}</span>
            </span>
            <span className={styles.recordCell}>
              <span className={styles.recordLabel}>L10</span>
              <span className={styles.recordValue}>{fallback ? PREVIEW_CARD_FALLBACK.last10 : l10Str}</span>
            </span>
            <span className={styles.recordCell}>
              <span className={styles.recordLabel}>ATS</span>
              <span className={styles.recordValue}>—</span>
            </span>
          </div>
        )}

        <div className={styles.teamSummary}>
          {loading ? (
            <div className={styles.summarySkeletonLines} aria-label="Loading summary">
              <div className={styles.summarySkeletonLine} style={{ width: '100%' }} />
              <div className={styles.summarySkeletonLine} style={{ width: '75%' }} />
            </div>
          ) : (
            <p className={styles.teamSummaryText}>{PREVIEW_CARD_FALLBACK.summary}</p>
          )}
        </div>

        <Link to={`/teams/${DUKE_SLUG}`} className={styles.teamLink}>View team →</Link>
      </div>
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
  const [showPreview, setShowPreview] = useState(() => {
    try { return localStorage.getItem('pinnedTeamsHideExample') !== '1'; } catch { return true; }
  });
  // Tracks which slugs have had any API response arrive (even if the data is sparse/empty).
  // Lets us distinguish "still fetching" from "fetched but empty" for better UX.
  const [loadedSlugs, setLoadedSlugs] = useState(new Set());

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

  const handleClearAll = useCallback(() => {
    [...pinned].forEach((slug) => removePinnedTeam(slug));
    setPinned([]);
    notify();
  }, [pinned, notify]);

  const handlePickerDone = useCallback(() => {
    setShowAdd(false);
    setSearch('');
  }, []);

  /**
   * Directly pin a team (no modal open). Used by header quick-chips and
   * EmptyStateCard popular picks — one tap pins immediately.
   */
  const handleDirectPin = useCallback((slug) => {
    setPinned(addPinnedTeam(slug));
    notify();
  }, [notify]);

  const handleDismissPreview = useCallback(() => {
    try { localStorage.setItem('pinnedTeamsHideExample', '1'); } catch {}
    setShowPreview(false);
  }, []);


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

  useEffect(() => {
    if (pinned.length === 0) {
      setTeamRecords({});
      setLoadedSlugs((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }
    const slugs = pinned.slice(0, 8);
    const records = {};
    const news = {};
    slugs.forEach((slug) => {
      const slot = pinnedTeamDataBySlug[slug];
      // Use !== undefined so we detect "data arrived but empty" vs "not yet fetched"
      if (slot !== undefined) {
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
    // Mark which slugs have received a response — update only if set content changed
    const nowLoaded = slugs.filter((s) => pinnedTeamDataBySlug[s] !== undefined);
    setLoadedSlugs((prev) => {
      const changed = nowLoaded.length !== prev.size || nowLoaded.some((s) => !prev.has(s));
      return changed ? new Set(nowLoaded) : prev;
    });
    if (Object.keys(news).length > 0) {
      setTeamNews((prev) => ({ ...prev, ...news }));
    }
  }, [pinned.join(','), pinnedTeamDataBySlug]);

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

  // DEV diagnostics — append ?debugPinned=1 to any URL to log per-slug data health
  useEffect(() => {
    if (!import.meta.env?.DEV) return;
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('debugPinned') !== '1') return;
    console.group('[PinnedTeams] diagnostic snapshot');
    pinned.slice(0, 8).forEach((slug) => {
      const slot = pinnedTeamDataBySlug[slug];
      const teamInfo = getTeamBySlug(slug);
      console.group(`  ${slug}`);
      console.log('  in TEAMS:', teamInfo ? `✓ (${teamInfo.conference}, ${teamInfo.oddsTier})` : '✗ MISSING from teams data — slug mismatch?');
      console.log('  slot defined:', slot !== undefined, '| slot:', slot);
      console.log('  schedule.events count:', slot?.schedule?.events?.length ?? 'no schedule');
      console.log('  teamNews count:', (slot?.teamNews ?? []).length);
      console.log('  computed records:', teamRecords[slug] ?? 'null — check schedule.events or ATS data');
      console.log('  headlines in state:', (teamNews[slug] ?? []).length);
      console.log('  summary:', teamSummaries[slug] ?? 'null');
      console.log('  loaded state:', loadedSlugs.has(slug) ? 'loaded' : 'PENDING fetch');
      console.groupEnd();
    });
    console.groupEnd();
  }, [pinnedTeamDataBySlug, teamRecords, teamNews, teamSummaries, loadedSlugs, pinned.join(',')]);

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
          gameId: g.gameId,
        };
      }
    }
    return null;
  };

  const isCompact = pinned.length === 1;
  const maxHeadlines = isCompact ? 2 : 3;

  return (
    <section className={styles.section}>
      {/* ── Section header ───────────────────────────────────────────────── */}
      <div className={styles.header}>
        <h2 className={styles.title}>Pinned Teams</h2>
        <div className={styles.actions}>
          {pinned.length === 1 && !showAdd && (
            <div className={styles.addMoreHint}>
              <span className={styles.addMoreText}>Pin a few more for faster tracking</span>
              {POPULAR_PICKS.filter((p) => !pinned.includes(p.slug)).slice(0, 3).map((p) => (
                <QuickChip key={p.slug} name={p.name} onClick={() => handleDirectPin(p.slug)} />
              ))}
            </div>
          )}
          <button
            type="button"
            className={styles.addBtn}
            onClick={() => setShowAdd(!showAdd)}
            aria-expanded={showAdd}
            aria-controls="team-picker-panel"
          >
            {showAdd ? 'Close' : '+ Add team'}
          </button>
        </div>
      </div>

      {/* ── Premium team picker panel ─────────────────────────────────────── */}
      {showAdd && (
        <div
          id="team-picker-panel"
          className={styles.pickerPanel}
          role="dialog"
          aria-label="Add teams to your watchlist"
          aria-modal="true"
        >
          {/* Header */}
          <div className={styles.pickerHeader}>
            <div className={styles.pickerHeaderText}>
              <p className={styles.pickerTitle}>Add teams to your watchlist</p>
              <p className={styles.pickerSubtitle}>Pin teams to track rankings, ATS, odds, and news.</p>
            </div>
            <button
              type="button"
              className={styles.pickerCloseBtn}
              onClick={handlePickerDone}
              aria-label="Close"
            >
              {CLOSE_ICON}
            </button>
          </div>

          {/* Search input */}
          <div className={styles.pickerSearchWrap}>
            {PICKER_SEARCH_ICON}
            <input
              type="search"
              placeholder="Search teams (Duke, Kansas, UConn…)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.pickerSearchInput}
              autoFocus={typeof window !== 'undefined' && window.innerWidth >= 768}
              aria-label="Search teams"
            />
          </div>

          {/* Selected summary bar */}
          {pinned.length > 0 && (
            <div className={styles.selectedBar}>
              <span className={styles.selectedCount}>Selected: {pinned.length}</span>
              <div className={styles.selectedChips}>
                {pinned.slice(0, 5).map((slug) => {
                  const t = getTeamBySlug(slug);
                  return t ? (
                    <button
                      key={slug}
                      type="button"
                      className={styles.selectedChip}
                      onClick={() => handleToggle(slug)}
                      aria-label={`Remove ${t.name}`}
                    >
                      <span className={styles.selectedChipName}>{t.name.split(' ')[0]}</span>
                      <span className={styles.selectedChipX} aria-hidden>×</span>
                    </button>
                  ) : null;
                })}
                {pinned.length > 5 && (
                  <span className={styles.selectedMore}>+{pinned.length - 5} more</span>
                )}
              </div>
              <button type="button" className={styles.clearBtn} onClick={handleClearAll}>
                Clear
              </button>
            </div>
          )}

          {/* Team list (scrollable) */}
          <div className={styles.pickerList} role="listbox" aria-label="Teams">
            {search.trim() ? (
              filteredTeams.length > 0 ? (
                filteredTeams.slice(0, 12).map((t) => (
                  <button
                    key={t.slug}
                    type="button"
                    role="option"
                    aria-selected={pinned.includes(t.slug)}
                    className={`${styles.pickerRow} ${pinned.includes(t.slug) ? styles.pickerRowActive : ''}`}
                    onClick={() => handleToggle(t.slug)}
                  >
                    <span className={styles.pickerRowLogo}>
                      <TeamLogo team={t} size={22} />
                    </span>
                    <span className={styles.pickerRowName}>{t.name}</span>
                    <span className={styles.pickerRowConf}>{t.conference}</span>
                    <span className={pinned.includes(t.slug) ? styles.pickerRowCheck : styles.pickerRowAdd} aria-hidden>
                      {pinned.includes(t.slug) ? '✓' : '+'}
                    </span>
                  </button>
                ))
              ) : (
                <div className={styles.pickerEmpty}>No teams found for &ldquo;{search}&rdquo;</div>
              )
            ) : (
              grouped.map(({ conference, tiers }) => (
                <div key={conference} className={styles.pickerGroup}>
                  <div className={styles.pickerGroupHeader}>{conference}</div>
                  {Object.values(tiers).flat().map((t) => (
                    <button
                      key={t.slug}
                      type="button"
                      role="option"
                      aria-selected={pinned.includes(t.slug)}
                      className={`${styles.pickerRow} ${pinned.includes(t.slug) ? styles.pickerRowActive : ''}`}
                      onClick={() => handleToggle(t.slug)}
                    >
                      <span className={styles.pickerRowLogo}>
                        <TeamLogo team={t} size={22} />
                      </span>
                      <span className={styles.pickerRowName}>{t.name}</span>
                      <span className={pinned.includes(t.slug) ? styles.pickerRowCheck : styles.pickerRowAdd} aria-hidden>
                        {pinned.includes(t.slug) ? '✓' : '+'}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Footer — single primary action */}
          <div className={styles.pickerFooter}>
            <span className={styles.pickerPinnedCount}>
              Pinned: {pinned.length}
            </span>
            <button type="button" className={styles.pickerFooterDone} onClick={handlePickerDone}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* ── Empty state: onboarding + Duke live preview card ───────────── */}
      {pinned.length === 0 && (
        <div className={showPreview ? styles.emptyLayout : styles.emptyLayoutSingle}>
          <EmptyStateCard
            onOpenAdd={() => setShowAdd(true)}
            onQuickPin={handleDirectPin}
            pinned={pinned}
          />
          {showPreview && (
            <DukePreviewCard
              onDismiss={handleDismissPreview}
              gamesForToday={scores.games}
            />
          )}
        </div>
      )}

      {/* ── Pinned team cards grid ───────────────────────────────────────── */}
      {pinned.length > 0 && (
        <div className={`${styles.cards} ${isCompact ? styles.cardsSingle : ''}`}>
          {pinned.map((slug) => {
            const team = getTeamBySlug(slug);
            if (!team) return null;
            const rank = rankMap[slug];
            const nextGame = getNextGame(slug);
            const headlines = teamNews[slug] || [];
            return (
              <article key={slug} className={`${styles.card} ${isCompact ? styles.cardCompact : ''}`}>
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
                    <ESPNGamecastLink game={nextGame} />
                  </div>
                )}
                {(() => {
                  const isLoading = !loadedSlugs.has(slug);
                  const rec = teamRecords[slug];
                  const cached = getAtsCache(slug);
                  const season = rec?.season;
                  const last10 = rec?.last10;
                  const ats = rec?.ats ?? (cached?.season?.total > 0 ? cached.season : null);
                  const seasonStr = season?.w != null && season?.l != null ? `${season.w}–${season.l}` : '—';
                  const l10Str = last10?.w != null && last10?.l != null ? `${last10.w}–${last10.l}` : '—';
                  const atsStr = ats?.total > 0 ? `${ats.w}–${ats.l}${ats.p > 0 ? `–${ats.p}` : ''}` : '—';
                  const hasData = seasonStr !== '—' || l10Str !== '—' || atsStr !== '—';
                  const isWarming = !isLoading && !hasData;

                  if (isLoading) {
                    return (
                      <div className={styles.recordsSkeletonRow} aria-label="Loading records">
                        {['Season', 'L10', 'ATS'].map((lbl) => (
                          <div key={lbl} className={styles.recordSkeleton}>
                            <div className={styles.recordSkeletonLabel} />
                            <div className={styles.recordSkeletonValue} />
                          </div>
                        ))}
                      </div>
                    );
                  }
                  if (isWarming) {
                    return (
                      <div className={styles.warmingRow}>
                        <span className={styles.warmingPill} role="status" aria-live="polite">
                          <span className={styles.warmingSpinner} aria-hidden />
                          Warming data
                        </span>
                      </div>
                    );
                  }
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
                  {!loadedSlugs.has(slug) ? (
                    <div className={styles.summarySkeletonLines} aria-label="Loading summary">
                      <div className={styles.summarySkeletonLine} style={{ width: '100%' }} />
                      <div className={styles.summarySkeletonLine} style={{ width: '82%' }} />
                    </div>
                  ) : headlines.length > 0 ? (
                    (teamSummaries[slug] != null && teamSummaries[slug] !== '') ? (
                      <p className={`${styles.teamSummaryText} ${isCompact ? styles.teamSummaryCompact : ''}`}>
                        {teamSummaries[slug]}
                      </p>
                    ) : (
                      <p className={styles.teamSummaryGenerating}>Generating summary…</p>
                    )
                  ) : null}
                </div>
                {headlines.length > 0 && (
                  <ul className={styles.headlines}>
                    {headlines.slice(0, maxHeadlines).map((h) => (
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
                    {isCompact && headlines.length > maxHeadlines && (
                      <li className={styles.headlinesMore}>
                        +{headlines.length - maxHeadlines} more
                      </li>
                    )}
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
