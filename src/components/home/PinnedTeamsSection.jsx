/**
 * Pinned Teams Dashboard — multi-select + search, cards with rank, next game, headlines, records.
 */

import { useState, useEffect, useCallback, useRef, Component } from 'react';
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
import { track } from '../../analytics/index';
import TeamLogo from '../shared/TeamLogo';
import SourceBadge from '../shared/SourceBadge';
import ExamplePinnedTeamCard from './ExamplePinnedTeamCard';
import ShareButton from '../common/ShareButton';
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

const DUKE_SLUG = 'duke-blue-devils';

/**
 * Lightweight error boundary that silently swallows crashes in ExamplePinnedTeamCard.
 * The LEFT onboarding column must always render; this protects it from right-column errors.
 */
class PreviewCardBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false };
  }
  static getDerivedStateFromError() { return { crashed: true }; }
  render() {
    if (this.state.crashed) return null; // right column simply disappears — left is unaffected
    return this.props.children;
  }
}

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

/** Small quick-select chip */
function QuickChip({ name, onClick }) {
  return (
    <button type="button" className={styles.quickChip} onClick={onClick}>
      {name}
    </button>
  );
}

/**
 * Two-column onboarding layout shown when no teams are pinned.
 * LEFT:  value props + "Pin Duke" + "Add team" buttons.
 * RIGHT: ExamplePinnedTeamCard (fully isolated, fetches its own data).
 */
function EmptyPinnedState({ onOpenAdd, onPinDuke, onDismissPreview, onShowPreview, showPreview, gamesForToday }) {
  // Fire once per mount — tells us how many users see the empty onboarding state
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    track('pinned_empty_state_shown', {
      show_preview: showPreview,
      hide_preview_flag: !showPreview,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={showPreview ? styles.emptyLayout : styles.emptyLayoutSingle}>
      {/* ── LEFT: onboarding copy — always visible ────────────────────── */}
      <div className={styles.onboardingCard}>
        <p className={styles.onboardingHeading}>Pin teams to track them faster</p>
        <ul className={styles.onboardingBullets}>
          <li>Instant ATS, last 10, and next game at a glance</li>
          <li>Faster home dashboard tailored to you</li>
          <li>Live ranking + bubble context</li>
          <li>Your personal March Madness watchlist</li>
        </ul>
        <div className={styles.emptyCtaRow}>
          <button type="button" className={styles.ctaBtn} onClick={onPinDuke}>
            📌 Pin Duke
          </button>
          <button type="button" className={styles.ctaBtnSecondary} onClick={onOpenAdd}>
            + Add team
          </button>
        </div>
        <p className={styles.ctaHint}>Search any D-I team. Try: Kansas, UConn, Houston…</p>
        {/* Popular picks row — excludes Duke since it's surfaced above */}
        <div className={styles.popularRow}>
          <span className={styles.popularLabel}>Popular picks</span>
          <div className={styles.quickChips}>
            {POPULAR_PICKS.filter((p) => p.slug !== DUKE_SLUG).slice(0, 4).map((p) => (
              <QuickChip key={p.slug} name={p.name} onClick={() => onPinDuke(p.slug)} />
            ))}
          </div>
        </div>
        {/* Re-enable preview if previously dismissed */}
        {!showPreview && (
          <button type="button" className={styles.showExampleBtn} onClick={onShowPreview}>
            Show example →
          </button>
        )}
      </div>

      {/* ── RIGHT: isolated Duke preview card — only when not dismissed ── */}
      {showPreview && (
        <PreviewCardBoundary>
          <ExamplePinnedTeamCard
            slug={DUKE_SLUG}
            gamesForToday={gamesForToday}
            onDismiss={onDismissPreview}
            onPinTeam={onPinDuke}
          />
        </PreviewCardBoundary>
      )}
    </div>
  );
}

const TIER_CLASS = {
  Lock: styles.tierLock,
  'Should be in': styles.tierShould,
  'Work to do': styles.tierWork,
  'Long shot': styles.tierLong,
};

/** Returns true when ?debugPins=1 is in the URL. */
const isDebugPins = () =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('debugPins');

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
  const [pinned, setPinned] = useState(() => {
    const initial = getPinnedTeams();
    if (isDebugPins()) {
      try {
        const raw = localStorage.getItem('maximus-pinned-teams');
        console.group('[debugPins] PinnedTeamsSection init');
        console.log('  localStorage raw:', raw);
        console.log('  parsed:', initial);
        console.log('  count:', initial.length);
        console.groupEnd();
      } catch (e) {
        console.warn('[debugPins] Could not read localStorage:', e);
      }
    }
    return initial;
  });

  // Ref used to detect when debugPins mode is active without triggering effects.
  const debugPinsRef = useRef(isDebugPins());
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
    const before = getPinnedTeams();
    const wasAdded = !pinned.includes(slug);
    const after = togglePinnedTeam(slug);   // writes to localStorage, returns new array
    if (debugPinsRef.current) {
      console.group(`[debugPins] handleToggle — ${wasAdded ? 'ADD' : 'REMOVE'} ${slug}`);
      console.log('  before:', before);
      console.log('  after:', after);
      console.log('  localStorage now:', localStorage.getItem('maximus-pinned-teams'));
      console.groupEnd();
    }
    setPinned(after);
    track(wasAdded ? 'pinned_team_add' : 'pinned_team_remove', {
      team_slug: slug,
      method: 'picker',
    });
    notify();
  }, [notify, pinned]);

  const handleAdd = useCallback((slug) => {
    const before = getPinnedTeams();
    const after = addPinnedTeam(slug);
    if (debugPinsRef.current) {
      console.group(`[debugPins] handleAdd — ADD ${slug}`);
      console.log('  before:', before);
      console.log('  after:', after);
      console.groupEnd();
    }
    setPinned(after);
    track('pinned_team_add', { team_slug: slug });
    setSearch('');
    setShowAdd(false);
    notify();
  }, [notify]);

  const handleRemove = useCallback((slug) => {
    const before = getPinnedTeams();
    const after = removePinnedTeam(slug);
    if (debugPinsRef.current) {
      console.group(`[debugPins] handleRemove — REMOVE ${slug}`);
      console.log('  before:', before);
      console.log('  after:', after);
      console.groupEnd();
    }
    setPinned(after);
    track('pinned_team_remove', { team_slug: slug });
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
    const before = getPinnedTeams();
    const after = addPinnedTeam(slug);
    if (debugPinsRef.current) {
      console.group(`[debugPins] handleDirectPin — QUICK PIN ${slug}`);
      console.log('  before:', before);
      console.log('  after:', after);
      console.log('  localStorage now:', localStorage.getItem('maximus-pinned-teams'));
      console.groupEnd();
    }
    setPinned(after);
    track('pinned_team_add', { team_slug: slug, method: 'quick_chip' });
    notify();
  }, [notify]);

  const handleDismissPreview = useCallback(() => {
    try { localStorage.setItem('pinnedTeamsHideExample', '1'); } catch { /* ignore storage errors */ }
    setShowPreview(false);
  }, []);

  const handleShowPreview = useCallback(() => {
    try { localStorage.removeItem('pinnedTeamsHideExample'); } catch { /* ignore storage errors */ }
    setShowPreview(true);
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

  // ?debugPins=1 — log every time React pinned state changes
  useEffect(() => {
    if (!debugPinsRef.current) return;
    try {
      const raw = localStorage.getItem('maximus-pinned-teams');
      console.log(
        `[debugPins] pinned state changed → length=${pinned.length}`,
        pinned,
        '| localStorage:',
        raw,
      );
    } catch {
      console.log('[debugPins] pinned state changed →', pinned);
    }
  }, [pinned]);

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

  // Filter to slugs that resolve to a real team.  Stale / renamed / removed slugs
  // would make pinned.length > 0 while every card maps to null — producing a blank
  // section with neither the empty-state onboarding nor any visible cards.  Only the
  // display conditions use validPinned; all data effects continue to use pinned so the
  // fetch / enrichment flow is completely unchanged.
  const validPinned = pinned.filter((s) => !!getTeamBySlug(s));

  const isCompact = validPinned.length === 1;
  const maxHeadlines = isCompact ? 2 : 3;

  return (
    <section className={styles.section}>
      {/* ── Section header ───────────────────────────────────────────────── */}
      <div className={styles.header}>
        <h2 className={styles.title}>Pinned Teams</h2>
        <div className={styles.actions}>
          {validPinned.length === 1 && !showAdd && (
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

      {/* ── Empty state: value props + isolated Duke example card ──────── */}
      {validPinned.length === 0 && (
        <EmptyPinnedState
          onOpenAdd={() => setShowAdd(true)}
          onPinDuke={(slug) => handleDirectPin(slug ?? DUKE_SLUG)}
          onDismissPreview={handleDismissPreview}
          onShowPreview={handleShowPreview}
          showPreview={showPreview}
          gamesForToday={scores.games}
        />
      )}

      {/* ── ?debugPins=1 debug panel ─────────────────────────────────────── */}
      {isDebugPins() && (
        <aside
          style={{
            position: 'fixed', bottom: 60, left: 12, zIndex: 9998,
            background: 'rgba(10,20,35,0.95)', color: '#86efac',
            border: '1px solid rgba(134,239,172,0.3)', borderRadius: 8,
            padding: '10px 14px', fontSize: '0.68rem', fontFamily: 'monospace',
            lineHeight: 1.6, maxWidth: 340, backdropFilter: 'blur(6px)',
            maxHeight: 260, overflowY: 'auto',
          }}
          aria-label="Pins debug panel"
        >
          <div style={{ fontWeight: 700, color: '#4ade80', marginBottom: 4 }}>
            📌 debugPins — PinnedTeamsSection
          </div>
          <div>React pinned ({pinned.length}): [{pinned.join(', ') || 'empty'}]</div>
          <div>
            localStorage raw:{' '}
            <span style={{ color: '#fcd34d' }}>
              {(() => { try { return localStorage.getItem('maximus-pinned-teams') ?? 'null'; } catch { return 'ERR'; } })()}
            </span>
          </div>
          <div>hidePreview flag: {(() => { try { return localStorage.getItem('pinnedTeamsHideExample') ?? 'null'; } catch { return 'ERR'; } })()}</div>
          <div>showPreview state: {String(showPreview)}</div>
          <div>loadedSlugs: [{[...loadedSlugs].join(', ') || 'none'}]</div>
          <div>pinnedTeamDataBySlug keys: [{Object.keys(pinnedTeamDataBySlug).join(', ') || 'none'}]</div>
          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              onClick={() => {
                try { localStorage.removeItem('maximus-pinned-teams'); window.location.reload(); } catch { /* ignore */ }
              }}
              style={{ fontSize: '0.65rem', padding: '2px 8px', cursor: 'pointer', borderRadius: 4, background: '#ef4444', color: '#fff', border: 'none', marginRight: 6 }}
            >
              Clear + reload
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  const v = JSON.stringify(getPinnedTeams());
                  console.log('[debugPins] full snapshot', { pinned, localStorage: v, pinnedTeamDataBySlug, loadedSlugs: [...loadedSlugs] });
                } catch { /* ignore */ }
              }}
              style={{ fontSize: '0.65rem', padding: '2px 8px', cursor: 'pointer', borderRadius: 4, background: '#3b82f6', color: '#fff', border: 'none' }}
            >
              Log snapshot
            </button>
          </div>
        </aside>
      )}

      {/* ── Pinned team cards grid ───────────────────────────────────────── */}
      {validPinned.length > 0 && (
        <div className={`${styles.cards} ${isCompact ? styles.cardsSingle : ''}`}>
          {validPinned.map((slug) => {
            const team = getTeamBySlug(slug);
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
                    {/* Compact icon-only share button */}
                    {(() => {
                      const cached = getAtsCache(slug);
                      const ats = cached?.season?.total > 0 ? cached.season : null;
                      const atsSubtitle = ats
                        ? `ATS Season: ${ats.wins}–${ats.losses}${ats.total > 0 ? ` (${Math.round((ats.wins / ats.total) * 100)}%)` : ''}`
                        : `${team.conference} · ${team.oddsTier}`;
                      return (
                        <ShareButton
                          shareType="team_card"
                          title={team.name}
                          subtitle={atsSubtitle}
                          meta="Pinned on Maximus Sports"
                          teamSlug={slug}
                          destinationPath={`/teams/${slug}`}
                          placement="pinned_team_card"
                          iconOnly
                          surface="light"
                          data-testid={`share-pinned-team-${slug}`}
                        />
                      );
                    })()}
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
