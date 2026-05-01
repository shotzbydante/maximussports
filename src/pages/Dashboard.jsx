import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isAdminUser } from '../config/admin';
import { fetchHomeFast, fetchHomeSlow, mergeHomeData } from '../api/home';
import { fetchTeamPage } from '../api/team';
import { fetchTeamNextLine } from '../api/teamNextLine';
import { fetchAtsLeaders, fetchAtsRefresh } from '../api/atsLeaders';
import { useAtsLeaders } from '../hooks/useAtsLeaders';
import { fetchChampionshipOdds } from '../api/championshipOdds';
import { buildMaximusPicks } from '../utils/maximusPicksModel';
import { mergeGamesWithOdds } from '../api/odds';
import { buildActivePicksGames } from '../utils/activePicksGames';
import { buildCaption, formatCaptionFile } from '../components/dashboard/captions/buildCaption';
import { buildDailyBriefingDigest } from '../utils/chatbotDigest';
import { computeAtsFromScheduleAndHistory } from '../components/team/MaximusInsight';
import { buildTeamSnapshot } from '../utils/teamSnapshot';
import CarouselComposer, { getTemplateDimensions } from '../components/dashboard/CarouselComposer';
import TagSuggestionsPanel from '../components/dashboard/tags/TagSuggestionsPanel';
import InstagramPublishButton from '../components/dashboard/InstagramPublishButton';
import PostHistory from '../components/dashboard/PostHistory';
import NextScheduledPost from '../components/dashboard/NextScheduledPost';
import VideosEditor from '../components/dashboard/videos/VideosEditor';
import { sanitizeImagesForExport } from '../components/dashboard/utils/exportReady';
import { TEAMS } from '../data/teams';
import { getTeamSlug } from '../utils/teamSlug';
import SeedBadge from '../components/common/SeedBadge';
import {
  SEED_LINE_PRESETS,
  getPresetMatchups,
  getFirstRoundMatchupsByRegion,
  getUpsetRadarGames,
  getUpsetRadarByDay,
  getUpsetRadarSlateOptions,
  getBatchTournamentInsights,
  getTeamSeed,
  getTeamRegion,
  setOfficialBracketData,
  getTournamentDataMode,
  getTournamentPhase,
  getRoundLabel,
} from '../utils/tournamentHelpers';
import { fetchBracketData } from '../data/bracketData';
import { REGIONS } from '../config/bracketology';
import { useWorkspace } from '../workspaces/WorkspaceContext';
import { WorkspaceId, WORKSPACES } from '../workspaces/config';
import { getVisibleWorkspaces } from '../workspaces/access';
import { MLB_TEAMS, MLB_DIVISIONS } from '../sports/mlb/teams';
import { NBA_TEAMS } from '../sports/nba/teams';
import { normalizeMlbImagePayload } from '../features/mlb/contentStudio/normalizeMlbImagePayload';
import { buildMlbCaption } from '../features/mlb/contentStudio/buildMlbCaption';
import { normalizeNbaImagePayload } from '../features/nba/contentStudio/normalizeNbaImagePayload';
import { buildNbaCaption } from '../features/nba/contentStudio/buildNbaCaption';
import { normalizeStudioCaption, MIN_PUBLISHABLE_CAPTION_CHARS } from '../features/mlb/contentStudio/normalizeStudioCaption';
import { buildMlbPicks, hasAnyPicks as hasAnyMlbPicks } from '../features/mlb/picks/buildMlbPicks';
import { fetchMlbHeadlines } from '../api/mlbNews';
import { fetchMlbChampionshipOdds } from '../api/mlbChampionshipOdds';
import styles from './Dashboard.module.css';

const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

const PREVIEW_SCALES = { small: 0.25, medium: 0.35, large: 0.44 };

const CBB_SECTIONS = [
  { id: 'daily',      label: 'Daily Briefing',    icon: '📅',  requiredCap: null },
  { id: 'team',       label: 'Team Intel',         icon: '🏀',  requiredCap: 'teamIntel' },
  { id: 'conference', label: 'Conference Intel',    icon: '🏟️', requiredCap: 'conferenceIntel' },
  { id: 'game',       label: 'Game Insights',      icon: '📊',  requiredCap: 'games' },
  { id: 'picks',      label: "Maximus's Picks",    icon: '📈',  requiredCap: 'picks' },
  { id: 'videos',     label: 'Videos',             icon: '🎬',  requiredCap: null,  shared: true },
];

const MLB_SECTIONS = [
  { id: 'mlb-daily',    label: 'Daily Briefing',    icon: '📅',  requiredCap: null },
  { id: 'mlb-team',     label: 'Team Intel',         icon: '⚾',  requiredCap: 'teamIntel' },
  { id: 'mlb-league',   label: 'League Intel',        icon: '🌎',  requiredCap: 'leagueIntel' },
  { id: 'mlb-division', label: 'Divisional Intel',    icon: '🏟️', requiredCap: 'divisionIntel' },
  { id: 'mlb-game',     label: 'Game Insights',      icon: '📊',  requiredCap: 'games' },
  { id: 'mlb-picks',    label: "Maximus's Picks",    icon: '📈',  requiredCap: 'picks' },
  { id: 'videos',       label: 'Videos',             icon: '🎬',  requiredCap: null,  shared: true },
];

/**
 * NBA Content Studio sections — Phase 2 launch.
 *
 * Daily Briefing + Team Intel are fully implemented. Other NBA sections
 * are intentionally NOT listed here (not even as "coming soon") so NBA
 * never silently renders NCAAM placeholder slides. When Phase 3 adds
 * Picks/Game Insights/Conference Intel we'll append them here.
 */
const NBA_SECTIONS = [
  { id: 'nba-daily',    label: 'Daily Briefing',    icon: '📅',  requiredCap: null },
  { id: 'nba-team',     label: 'Team Intel',         icon: '🏀',  requiredCap: 'teamIntel' },
  { id: 'videos',       label: 'Videos',             icon: '🎬',  requiredCap: null,  shared: true },
];

function getSectionsForWorkspace(workspaceConfig) {
  let sections = CBB_SECTIONS;
  if (workspaceConfig.id === WorkspaceId.MLB) sections = MLB_SECTIONS;
  else if (workspaceConfig.id === WorkspaceId.NBA) sections = NBA_SECTIONS;
  return sections.filter(sec =>
    sec.requiredCap === null || workspaceConfig.capabilities[sec.requiredCap],
  );
}

/** Returns true if the active section is an MLB template */
function isMlbSection(sectionId) {
  return sectionId?.startsWith('mlb-');
}

/** Returns true if the active section is an NBA template */
function isNbaSection(sectionId) {
  return sectionId?.startsWith('nba-');
}

/** Extracts MLB template type from section id: 'mlb-daily' → 'daily' */
function mlbTemplateType(sectionId) {
  return sectionId?.replace('mlb-', '') || 'daily';
}

/** Extracts NBA template type from section id: 'nba-daily' → 'daily' */
function nbaTemplateType(sectionId) {
  return sectionId?.replace('nba-', '') || 'daily';
}

function gameLabel(g) {
  if (!g) return '';
  const spread = g.homeSpread ?? g.spread;
  const spreadStr = spread != null ? ` (${parseFloat(spread) > 0 ? '+' : ''}${parseFloat(spread)})` : '';
  const time = g.time ? ` · ${g.time}` : '';
  return `${g.awayTeam || '?'} @ ${g.homeTeam || '?'}${spreadStr}${time}`;
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const isAuthorized = !authLoading && isAdminUser(user?.email);
  const isUnauthorized = !authLoading && !isAdminUser(user?.email);

  // ── workspace scoping for Content Studio ───────────────
  const [studioWorkspaceId, setStudioWorkspaceId] = useState(WorkspaceId.MLB);
  const studioWorkspace = WORKSPACES[studioWorkspaceId] ?? WORKSPACES[WorkspaceId.CBB];
  const availableStudioWorkspaces = useMemo(
    () => (user ? getVisibleWorkspaces(user) : []),
    [user],
  );
  const isCbbStudio = studioWorkspaceId === WorkspaceId.CBB;

  // ── section / template state ────────────────────────────
  const [activeSection, setActiveSection] = useState('mlb-daily');

  // ── section-specific options ─────────────────────────────
  const [dailyStyleMode, setDailyStyleMode] = useState('generic');
  const [includeHeadlines, setIncludeHeadlines] = useState(true);
  const [gameAngle, setGameAngle] = useState('value');
  const [gameMode, setGameMode] = useState('tournament'); // 'standard' | '5games' | 'tournament' | 'upset-radar'
  const [upsetRadarSlate, setUpsetRadarSlate] = useState('auto'); // 'auto' | 'thu' | 'fri' | 'day1' | 'day2'
  const [fiveGamesSlate, setFiveGamesSlate] = useState('auto'); // 'auto' | 'thu' | 'fri' | 'day1' | 'day2'
  const [tournamentPreset, setTournamentPreset] = useState('1-seeds');
  const [tournamentRegion, setTournamentRegion] = useState(null);
  const [tournamentSelectedMatchups, setTournamentSelectedMatchups] = useState([]);
  const [picksMode, setPicksMode] = useState('top3');
  const [riskMode, setRiskMode] = useState('standard');

  // ── slide count (per section default) ────────────────────
  const SECTION_SLIDE_DEFAULTS = { daily: 6, team: 4, conference: 1, game: 3, picks: 6, odds: 3 };
  const SECTION_SLIDE_MAX = { daily: 6, team: 3, conference: 1, game: 3, picks: 6, odds: 4 };
  const [slideCount, setSlideCount] = useState(SECTION_SLIDE_DEFAULTS.daily);

  // ── picker state ──────────────────────────────────────────
  const [teamSearch, setTeamSearch] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedConference, setSelectedConference] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);

  // ── data state ───────────────────────────────────────────
  const [dashData, setDashData] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState(null);
  const [chatSummary, setChatSummary] = useState(null);
  const [chatStatus, setChatStatus] = useState(null);
  const [teamPageData, setTeamPageData] = useState(null);
  const [teamPageLoading, setTeamPageLoading] = useState(false);
  const [teamNextLineData, setTeamNextLineData] = useState(null);
  const [teamChampOdds, setTeamChampOdds] = useState(null);
  // Championship odds map for Daily Briefing Slide 2 (fetched once at load)
  const [dailyChampOdds, setDailyChampOdds] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── MLB-specific state ─────────────────────────────────
  const [mlbGames, setMlbGames] = useState([]);
  const [mlbGamesLoading, setMlbGamesLoading] = useState(false);
  const [mlbHeadlines, setMlbHeadlines] = useState([]);
  const [mlbSelectedTeam, setMlbSelectedTeam] = useState(null);
  const [mlbSelectedGame, setMlbSelectedGame] = useState(null);
  const [mlbLeague, setMlbLeague] = useState('AL'); // 'AL' | 'NL'
  const [mlbDivision, setMlbDivision] = useState('AL East');
  const [mlbGameAngle, setMlbGameAngle] = useState('value');
  const [mlbSlateMode, setMlbSlateMode] = useState('full'); // 'full' | 'featured' | 'division'
  const [mlbBriefing, setMlbBriefing] = useState(null);     // raw briefing text from /api/mlb/chat/homeSummary
  const [mlbLiveGames, setMlbLiveGames] = useState([]);    // today's full slate (including final) from /api/mlb/live/games
  const [mlbChampOdds, setMlbChampOdds] = useState(null);  // { odds: { slug: { bestChanceAmerican, ... } } }
  const [mlbStandings, setMlbStandings] = useState(null);  // { slug: { wins, losses, record, gb, rank, l10, streak, division } }
  const [mlbLeaders, setMlbLeaders] = useState(null);     // { categories: { homeRuns, RBIs, hits, wins, saves } }
  const isMlbStudio = studioWorkspaceId === WorkspaceId.MLB;

  // ── NBA Content Studio state (mirrors MLB exactly; playoff-framed) ──
  const [nbaPicks, setNbaPicks] = useState(null);          // canonical picks board from /api/nba/picks/built (V2)
  const [nbaLiveGames, setNbaLiveGames] = useState([]);    // /api/nba/live/games (today)
  const [nbaWindowGames, setNbaWindowGames] = useState([]); // /api/nba/playoff-window (last 7d + tomorrow)
  const [nbaChampOdds, setNbaChampOdds] = useState(null);  // { slug: { bestChanceAmerican } }  ← inner map only
  const [nbaStandings, setNbaStandings] = useState(null);  // { slug: { wins, losses, record, rank, conference, playoffSeed } }
  const [nbaLeaders, setNbaLeaders] = useState(null);      // postseason leaders: { categories: { avgPoints, ... } }
  const [nbaNews, setNbaNews] = useState([]);
  const [nbaSelectedTeam, setNbaSelectedTeam] = useState(null);
  const [nbaGamesLoading, setNbaGamesLoading] = useState(false);
  const isNbaStudio = studioWorkspaceId === WorkspaceId.NBA;

  // ── Gemini image generation state (MLB only) ───────────
  const [geminiImage, setGeminiImage] = useState(null);       // { base64, mimeType }
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiError, setGeminiError] = useState(null);
  const [geminiMode, setGeminiMode] = useState(false);        // true = show generated image

  // ── export state ─────────────────────────────────────────
  const [assetsReady, setAssetsReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [zipping, setZipping] = useState(false);

  // ── post history refresh key ──────────────────────────────
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // ── preview size (workspace-scoped via local storage) ─────
  const [previewSize, setPreviewSize] = useState(() => {
    try { return localStorage.getItem(`workspace:${studioWorkspaceId}:preview_size`) || localStorage.getItem('maximus_preview_size') || 'medium'; } catch { return 'medium'; }
  });

  // ── caption state ────────────────────────────────────────
  const [captionTab, setCaptionTab] = useState('short');
  const [copied, setCopied] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);

  const exportRef = useRef(null);
  const { atsLeaders } = useAtsLeaders({ initialWindow: 'last30' });

  // ── team picker filters ─────────────────────────────────
  const [confFilter, setConfFilter] = useState('All');
  const [teamSort, setTeamSort] = useState('alpha');

  const CONF_FILTERS = useMemo(() => {
    const confs = [...new Set(TEAMS.map(t => t.conference))];
    const order = ['All', 'Top 25', 'SEC', 'Big Ten', 'Big 12', 'ACC', 'Big East', 'WCC', 'AAC', 'Mountain West', 'A-10', 'MVC', 'MAC', 'CUSA'];
    const known = new Set(order);
    const extra = confs.filter(c => !known.has(c) && c !== 'Others').sort();
    return [...order, ...extra, 'Other'];
  }, []);

  const filteredTeams = useMemo(() => {
    let list = [...TEAMS];

    if (confFilter === 'Top 25') {
      // Top 25 is a placeholder filter — shows all teams sorted (ranking data not in static list)
      // Will show all teams alphabetically — user can search for ranked teams
    } else if (confFilter !== 'All') {
      if (confFilter === 'Other') {
        const knownConfs = new Set(['SEC', 'Big Ten', 'Big 12', 'ACC', 'Big East', 'WCC', 'AAC', 'Mountain West', 'A-10', 'MVC', 'MAC', 'CUSA']);
        list = list.filter(t => !knownConfs.has(t.conference));
      } else {
        list = list.filter(t => t.conference === confFilter);
      }
    }

    if (teamSearch.trim()) {
      const q = teamSearch.toLowerCase();
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.conference.toLowerCase().includes(q) ||
        (t.slug || '').toLowerCase().includes(q)
      );
    }

    if (teamSort === 'alpha') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (teamSort === 'conference') {
      list.sort((a, b) => a.conference.localeCompare(b.conference) || a.name.localeCompare(b.name));
    }

    return list.slice(0, teamSearch.trim() ? 20 : 30);
  }, [teamSearch, confFilter, teamSort, CONF_FILTERS]);

  // ── load home data + ATS leaders + chatbot summary in parallel ──────────
  const loadData = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);

    // Fetch chatbot summary in parallel — failure is non-fatal
    fetch('/api/chat/homeSummary')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.summary) {
          setChatSummary(d.summary);
          setChatStatus(d.status ?? 'fresh');
        }
      })
      .catch(() => { /* non-fatal */ });

    // Fetch championship odds for Slide 2 — non-fatal, runs in parallel
    fetchChampionshipOdds()
      .then(d => { if (d?.odds) setDailyChampOdds(d.odds); })
      .catch(() => {});

    try {
      const [fast, slow, atsResult] = await Promise.all([
        fetchHomeFast(),
        fetchHomeSlow(),
        fetchAtsLeaders('last30').catch(() => null),
      ]);
      const merged = mergeHomeData(fast, slow);

      // Prefer direct ATS fetch → merged home ATS (empty fallback)
      const atsFromDirect  = atsResult?.atsLeaders ?? { best: [], worst: [] };
      const hasDirectAts   = (atsFromDirect.best?.length || 0) + (atsFromDirect.worst?.length || 0) > 0;
      const hasMergedAts   = (merged.atsLeaders?.best?.length || 0) + (merged.atsLeaders?.worst?.length || 0) > 0;
      const finalAts       = hasDirectAts ? atsFromDirect : (hasMergedAts ? merged.atsLeaders : { best: [], worst: [] });
      const isWarming      = !hasDirectAts && !hasMergedAts;

      if (isDev) {
        console.debug('[Dashboard] ATS leaders load', {
          directBest: atsFromDirect.best?.length ?? 0,
          directWorst: atsFromDirect.worst?.length ?? 0,
          mergedBest: merged.atsLeaders?.best?.length ?? 0,
          source: hasDirectAts ? 'direct' : hasMergedAts ? 'merged' : 'EMPTY',
          warming: isWarming,
        });
      }

      // If still warming, fire a refresh in background and schedule a follow-up fetch
      if (isWarming) {
        fetchAtsRefresh('last30').catch(() => {});
        setTimeout(() => {
          fetchAtsLeaders('last30').then(r => {
            const incoming = r?.atsLeaders ?? { best: [], worst: [] };
            const hasIncoming = (incoming.best?.length || 0) + (incoming.worst?.length || 0) > 0;
            if (isDev) console.debug('[Dashboard] ATS leaders follow-up', { best: incoming.best?.length, worst: incoming.worst?.length });
            if (hasIncoming) {
              setDashData(prev => prev ? { ...prev, atsLeaders: incoming } : prev);
            }
          }).catch(() => {});
        }, 3000);
      }

      setDashData({ ...merged, atsLeaders: finalAts });
    } catch (err) {
      setDataError(err.message || 'Failed to load data');
    } finally {
      setDataLoading(false);
    }
  }, []); // no atsLeaders dependency — we fetch directly

  useEffect(() => {
    if (isAuthorized) loadData();
  }, [isAuthorized, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── ensure tournament helpers use official bracket when available ──
  useEffect(() => {
    if (!isAuthorized) return;
    if (getTournamentDataMode() === 'official') return;
    fetchBracketData().then(bracket => {
      if (bracket?.bracketMode === 'official') {
        setOfficialBracketData(bracket);
      }
    }).catch(() => {});
  }, [isAuthorized]);

  // ── MLB data loading ──────────────────────────────────────
  useEffect(() => {
    if (!isAuthorized || !isMlbStudio) return;
    setMlbGamesLoading(true);
    Promise.all([
      fetch('/api/mlb/picks/board').then(r => r.json()).catch(() => ({ games: [] })),
      fetchMlbHeadlines().catch(() => []),
      fetch('/api/mlb/chat/homeSummary').then(r => r.ok ? r.json() : null).catch(() => null),
      fetchMlbChampionshipOdds().catch(() => ({ odds: {} })),
      fetch('/api/mlb/live/games?status=all&includeYesterday=true').then(r => r.ok ? r.json() : { games: [] }).catch(() => ({ games: [] })),
      fetch('/api/mlb/standings').then(r => r.ok ? r.json() : { teams: {} }).catch(() => ({ teams: {} })),
      fetch('/api/mlb/leaders').then(r => r.ok ? r.json() : { categories: {} }).catch(() => ({ categories: {} })),
    ]).then(([boardData, headlines, briefingData, champData, liveData, standingsData, leadersData]) => {
      setMlbGames(boardData?.games ?? []);
      setMlbHeadlines(Array.isArray(headlines) ? headlines : headlines?.headlines ?? []);
      if (briefingData?.summary) setMlbBriefing(briefingData.summary);
      if (champData?.odds) setMlbChampOdds(champData.odds);
      setMlbLiveGames(liveData?.games ?? []);
      setMlbStandings(standingsData?.teams ?? null);
      setMlbLeaders(leadersData ?? null);
    }).finally(() => setMlbGamesLoading(false));
  }, [isAuthorized, isMlbStudio, refreshKey]);

  // ── MLB picks (memoized from games) ───────────────────────
  const mlbPicks = useMemo(() => {
    if (!mlbGames.length) return null;
    try { return buildMlbPicks({ games: mlbGames }); }
    catch { return null; }
  }, [mlbGames]);

  // ── NBA data loading (canonical endpoints only; no hand-rolled shape) ──
  useEffect(() => {
    if (!isAuthorized || !isNbaStudio) return;
    setNbaGamesLoading(true);
    Promise.all([
      fetch('/api/nba/picks/built').then(r => r.ok ? r.json() : { categories: {} }).catch(() => ({ categories: {} })),
      fetch('/api/nba/live/games?status=all').then(r => r.ok ? r.json() : { games: [] }).catch(() => ({ games: [] })),
      // 14-day playoff schedule window — feeds real game results into
      // playoffContext so series state isn't computed from static bracket
      // 0-0 placeholders. 14 days covers full Round 1 (Apr 18 → May 4).
      // Earlier 7-day window missed Games 1-2 of series and produced
      // wrong scores like "HOU lead 2-1" instead of "LAL lead 3-2".
      fetch('/api/nba/playoff-window?daysBack=14&daysForward=1').then(r => r.ok ? r.json() : { games: [] }).catch(() => ({ games: [] })),
      fetch('/api/nba/odds/championship').then(r => r.ok ? r.json() : { odds: {} }).catch(() => ({ odds: {} })),
      fetch('/api/nba/standings').then(r => r.ok ? r.json() : { teams: {} }).catch(() => ({ teams: {} })),
      // POSTSEASON leaders during the playoffs (was: regular season).
      // Builder falls back to regular-season cache if postseason is empty.
      fetch('/api/nba/leaders?seasonType=postseason').then(r => r.ok ? r.json() : { categories: {} }).catch(() => ({ categories: {} })),
      fetch('/api/nba/news/headlines').then(r => r.ok ? r.json() : { headlines: [] }).catch(() => ({ headlines: [] })),
    ]).then(([picksData, liveData, windowData, champData, standingsData, leadersData, newsData]) => {
      setNbaPicks(picksData ?? null);
      setNbaLiveGames(liveData?.games ?? []);
      setNbaWindowGames(windowData?.games ?? []);
      // IMPORTANT: /api/nba/odds/championship returns { odds: {...}, source } —
      // we store the INNER map to match what slide components expect. Same
      // shape guarantee we enforced for MLB after the autopost fix.
      setNbaChampOdds(champData?.odds ?? null);
      setNbaStandings(standingsData?.teams ?? null);
      setNbaLeaders(leadersData ?? null);
      setNbaNews(Array.isArray(newsData) ? newsData : newsData?.headlines ?? []);
      console.log('[NBA_CONTENT_STUDIO_PAYLOAD]', {
        picksCategoryKeys: Object.keys(picksData?.categories || {}),
        liveGamesCount: liveData?.games?.length || 0,
        windowGamesCount: windowData?.games?.length || 0,
        windowFinals: windowData?.counts?.final || 0,
        windowUpcoming: windowData?.counts?.upcoming || 0,
        standingsTeams: Object.keys(standingsData?.teams || {}).length,
        leaderCategoryKeys: Object.keys(leadersData?.categories || {}),
        leaderSource: leadersData?._source || leadersData?.seasonType || 'unknown',
        champOddsTeams: Object.keys(champData?.odds || {}).length,
      });
    }).finally(() => setNbaGamesLoading(false));
  }, [isAuthorized, isNbaStudio, refreshKey]);

  // ── patch dashData.atsLeaders when hook resolves late ─────
  useEffect(() => {
    const hasHookData = (atsLeaders?.best?.length || 0) + (atsLeaders?.worst?.length || 0) > 0;
    if (!hasHookData) return;
    setDashData(prev => {
      if (!prev) return prev;
      const prevCount = (prev.atsLeaders?.best?.length || 0) + (prev.atsLeaders?.worst?.length || 0);
      const hookCount = (atsLeaders.best?.length || 0) + (atsLeaders.worst?.length || 0);
      // Only upgrade if hook has more data than what's already loaded
      if (prevCount >= hookCount) return prev;
      if (isDev) console.debug('[Dashboard] ATS leaders patched from hook', { best: atsLeaders.best?.length, worst: atsLeaders.worst?.length });
      return { ...prev, atsLeaders };
    });
  }, [atsLeaders]);

  // ── load team page + championship odds when team selected ─
  useEffect(() => {
    if (!selectedTeam?.slug || activeSection !== 'team') {
      setTeamPageData(null);
      setTeamNextLineData(null);
      setTeamChampOdds(null);
      return;
    }
    setTeamPageLoading(true);
    Promise.all([
      fetchTeamPage(selectedTeam.slug),
      fetchChampionshipOdds().catch(() => ({ odds: {}, oddsMeta: null })),
    ])
      .then(([teamData, champData]) => {
        setTeamPageData(teamData);
        setTeamChampOdds(champData ?? null);
      })
      .catch(() => setTeamPageData(null))
      .finally(() => setTeamPageLoading(false));
  }, [selectedTeam, activeSection]);

  // ── load team next line (same source as Team Page) ───────
  useEffect(() => {
    if (!selectedTeam?.slug || activeSection !== 'team') {
      setTeamNextLineData(null);
      return;
    }
    fetchTeamNextLine(selectedTeam.slug)
      .then(d => setTeamNextLineData(d))
      .catch(() => setTeamNextLineData(null));
  }, [selectedTeam, activeSection]);

  // ── sync slideCount when section changes ──────────────────
  useEffect(() => {
    setSlideCount(SECTION_SLIDE_DEFAULTS[activeSection] ?? 3);
    setAssetsReady(false);
  }, [activeSection]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── enhanced team data: same computed values as Team Page ─
  const enhancedTeamData = useMemo(() => {
    if (!teamPageData) return null;
    const teamObj = teamPageData.team ?? selectedTeam;
    const teamName = teamObj?.name ?? selectedTeam?.name ?? null;

    // Compute ATS from schedule + odds history (identical to MaximusInsight on Team Page)
    const ats = (teamPageData.schedule && teamPageData.oddsHistory && teamName)
      ? computeAtsFromScheduleAndHistory(teamPageData.schedule, teamPageData.oddsHistory, teamName)
      : null;

    // Split news into last-7 / prev-90 (identical to TeamPage split)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const last7News = (teamPageData.teamNews ?? []).filter(
      n => new Date(n.pubDate || 0).getTime() >= sevenDaysAgo,
    );

    // Championship (title) odds: look up by team slug or team name
    const oddsMap = teamChampOdds?.odds ?? {};
    const slug = selectedTeam?.slug ?? teamObj?.slug;
    const titleEntry = (slug && oddsMap[slug])
      ? oddsMap[slug]
      : (teamName && oddsMap[teamName] ? oddsMap[teamName] : null);
    // Prefer best-chance odds (lowest payout = most likely), then payout for display
    const titleOdds = titleEntry?.bestChanceAmerican ?? titleEntry?.american ?? null;

    // Build canonical snapshot (adds personality, ranked headlines, deduped news)
    const champOddsMap = teamChampOdds?.odds ?? {};
    const snapshot = buildTeamSnapshot({
      slug:             selectedTeam?.slug ?? teamObj?.slug ?? '',
      teamPageData,
      teamNextLineData,
      champOddsMap,
    });

    return {
      ...teamPageData,
      ats,
      nextLine:    teamNextLineData ?? null,
      last7News,
      titleOdds,
      // Expose snapshot for slides / caption that want normalized team intel
      snapshot,
    };
  }, [teamPageData, teamNextLineData, selectedTeam, teamChampOdds]);

  // ── build daily briefing digest from chatbot + structured data ───────────
  // Single canonical content source powering all three Daily Briefing slides + caption.
  const dailyDigest = useMemo(() => {
    if (!dashData) return null;
    const games = dashData?.odds?.games ?? [];
    const atsL  = dashData?.atsLeaders ?? { best: [], worst: [] };
    let picks = [];
    try {
      const p = buildMaximusPicks({ games, atsLeaders: atsL });
      picks = [...(p.atsPicks ?? []), ...(p.mlPicks ?? [])].slice(0, 3);
    } catch { /* ignore */ }
    return buildDailyBriefingDigest({
      chatSummary,
      chatStatus,
      games,
      headlines:              dashData?.headlines ?? [],
      picks,
      atsLeaders:             atsL,
      scoresYesterday:        dashData?.scoresYesterday ?? [],
      scores:                 dashData?.scores ?? [],
      rankingsTop25:          dashData?.rankingsTop25 ?? [],
      upcomingGamesWithSpreads: dashData?.upcomingGamesWithSpreads ?? [],
      // Championship odds map powers Slide 2 as structured fallback when chatbot odds parse is sparse
      championshipOdds:       dailyChampOdds ?? {},
    });
  }, [dashData, chatSummary, chatStatus, dailyChampOdds]);

  // ── tournament insights (March Madness intelligence) ──────
  const tournamentInsightsData = useMemo(() => {
    if (activeSection !== 'game') return null;
    if (gameMode !== 'tournament' && gameMode !== 'upset-radar' && gameMode !== '5games') return null;

    // Build real enrichment context from available app data —
    // same sources that power Maximus Picks on the Home page.
    const rankMap = {};
    for (const r of (dashData?.rankingsTop25 ?? [])) {
      const name = r.teamName || r.name || r.team || '';
      if (!name) continue;
      const rank = r.rank ?? r.ranking ?? null;
      if (rank == null) continue;
      const slug = getTeamSlug(name);
      if (slug) rankMap[slug] = rank;
    }

    const champOddsRaw = dailyChampOdds ?? {};
    const championshipOdds = {};
    for (const [slug, entry] of Object.entries(champOddsRaw)) {
      if (!entry) continue;
      const american = entry.bestChanceAmerican ?? entry.american ?? null;
      if (american != null) championshipOdds[slug] = { american };
    }

    const atsLeadersData = dashData?.atsLeaders ?? { best: [], worst: [] };
    const atsBySlug = {};
    for (const row of [...(atsLeadersData.best ?? []), ...(atsLeadersData.worst ?? [])]) {
      if (!row.slug) continue;
      atsBySlug[row.slug] = {
        season: row.season ?? row.rec ?? null,
        last30: row.last30 ?? row.rec ?? null,
        last7:  row.last7  ?? row.rec ?? null,
      };
    }

    const context = { rankMap, championshipOdds, atsBySlug };

    if (gameMode === '5games') {
      const phase = getTournamentPhase();
      const slateOpts = getUpsetRadarSlateOptions(phase);
      const selectedOpt = slateOpts.options.find(o => o.id === fiveGamesSlate);
      const regionFilter = selectedOpt?.regions || null;

      const games = dashData?.odds?.games ?? [];
      const atsLeadersRaw = dashData?.atsLeaders ?? { best: [], worst: [] };
      let allPicks = [];
      try {
        const res = buildMaximusPicks({
          games,
          atsLeaders: atsLeadersRaw,
          atsBySlug,
          rankMap,
          championshipOdds,
        });
        allPicks = [...(res.atsPicks ?? []), ...(res.mlPicks ?? [])].filter(p => p.itemType === 'lean');
      } catch { /* ignore */ }

      let filteredPicks = allPicks;
      if (regionFilter) {
        filteredPicks = allPicks.filter(p => {
          const homeRegion = getTeamRegion(p.homeSlug || '');
          const awayRegion = getTeamRegion(p.awaySlug || '');
          return regionFilter.includes(homeRegion) || regionFilter.includes(awayRegion);
        });
      }

      filteredPicks.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
      const top5 = filteredPicks.slice(0, 5);

      const dayLabel = selectedOpt?.id !== 'auto' ? (selectedOpt?.label || '') : '';
      const roundLabel = slateOpts.roundLabel;

      return {
        mode: '5games',
        fiveGamesPicks: top5,
        dayLabel,
        roundLabel,
        slateOptions: slateOpts,
        insights: [],
        title: '5 Key\nGames',
        subtitle: dayLabel ? `${dayLabel.toUpperCase()} · ${roundLabel.toUpperCase()}` : 'TOP ATS PICKS',
      };
    }

    if (gameMode === 'upset-radar') {
      const phase = getTournamentPhase();
      const slateOpts = getUpsetRadarSlateOptions(phase);
      const selectedOpt = slateOpts.options.find(o => o.id === upsetRadarSlate);
      const regionFilter = selectedOpt?.regions || null;

      let upsetGames;
      let dayLabel = '';
      let roundLabel = slateOpts.roundLabel;

      if (upsetRadarSlate === 'auto' || !selectedOpt) {
        upsetGames = getUpsetRadarGames(context, { round: slateOpts.round, limit: 5 });
      } else {
        upsetGames = getUpsetRadarGames(context, {
          round: slateOpts.round,
          limit: 5,
          regionFilter,
        });
        dayLabel = selectedOpt.label;
      }

      const dayCards = getUpsetRadarByDay(context, phase);

      return {
        mode: 'upset-radar',
        upsetGames,
        dayCards,
        dayLabel,
        roundLabel,
        slateOptions: slateOpts,
        insights: [],
        title: 'Upset\nRadar',
        subtitle: 'UPSET INTELLIGENCE',
      };
    }

    let matchups = [];
    let title = 'March Madness\nInsights';
    let subtitle = 'TOURNAMENT INTELLIGENCE';

    if (tournamentPreset) {
      matchups = getPresetMatchups(tournamentPreset);
      const preset = SEED_LINE_PRESETS.find(p => p.id === tournamentPreset);
      if (preset) {
        title = preset.label.replace('All ', '').replace(' Seeds', ' Seeds\nBreakdown');
        subtitle = `${preset.label.toUpperCase()} · TOURNAMENT INTELLIGENCE`;
        if (tournamentPreset === '1-seeds') {
          title = 'All No. 1\nSeeds';
          subtitle = 'NO. 1 SEEDS · TOURNAMENT INTELLIGENCE';
        }
      }
    } else if (tournamentRegion) {
      const byRegion = getFirstRoundMatchupsByRegion();
      matchups = byRegion[tournamentRegion] || [];
      title = `${tournamentRegion}\nRegion`;
      subtitle = `${tournamentRegion.toUpperCase()} REGION · ROUND OF 64`;
    } else if (tournamentSelectedMatchups.length > 0) {
      matchups = tournamentSelectedMatchups;
      title = `${matchups.length} Selected\nMatchups`;
      subtitle = 'CUSTOM SELECTION · TOURNAMENT INTELLIGENCE';
    }

    const insights = getBatchTournamentInsights(matchups, context);
    return { mode: 'tournament', insights, title, subtitle, matchups, upsetGames: [], preset: tournamentPreset || null };
  }, [activeSection, gameMode, upsetRadarSlate, fiveGamesSlate, tournamentPreset, tournamentRegion, tournamentSelectedMatchups, dashData, dailyChampOdds]);

  // ── Canonical picks games: shared by BOTH slide enrichment AND caption ──
  const canonicalPicksGames = useMemo(() => {
    if (!dashData) return [];
    try {
      return buildActivePicksGames({
        todayScores: dashData.scores ?? [],
        oddsGames: dashData.odds?.games ?? [],
        upcomingGamesWithSpreads: dashData.upcomingGamesWithSpreads ?? [],
        getSlug: getTeamSlug,
        mergeWithOdds: mergeGamesWithOdds,
      });
    } catch (err) {
      console.warn('[Dashboard] canonicalPicksGames failed:', err?.message);
      return [];
    }
  }, [dashData]);

  // ── Working slate: the active set of games for Maximus's Picks ──────
  // During round transition, only the next-round games are the active slate.
  // This single source is used by the game picker, IG slide game counts, and
  // the canonical picks computation — ensuring all surfaces agree.
  const workingSlate = useMemo(() => {
    const nextRound = canonicalPicksGames.filter(g => g._nextRoundFromFeed);
    return nextRound.length > 0 ? nextRound : canonicalPicksGames;
  }, [canonicalPicksGames]);

  // ── auto-select first game when section === game ──────────
  useEffect(() => {
    if (activeSection === 'game' && !selectedGame) {
      const first = workingSlate.find(g => g.spread != null || g.homeSpread != null || g.moneyline != null);
      setSelectedGame(first ?? workingSlate[0] ?? null);
    }
  }, [activeSection, workingSlate, selectedGame]);

  // ── Canonical picks result: ONE model call, shared by slide + caption ──
  // Must use the same enrichment inputs as Home page to produce identical picks.
  // Uses workingSlate (not full canonicalPicksGames) so picks are scoped to the
  // active round only. dashData has rankingsTop25 (raw) not rankMap (processed),
  // and dailyChampOdds is a separate state variable.
  const canonicalPicks = useMemo(() => {
    const empty = { pickEmPicks: [], atsPicks: [], valuePicks: [], totalsPicks: [] };
    if (!workingSlate || !workingSlate.length) return empty;
    try {
      const atsL = dashData?.atsLeaders ?? { best: [], worst: [] };
      // Build rankMap from rankingsTop25 (same as Home page)
      const rm = {};
      for (const r of (dashData?.rankingsTop25 ?? [])) {
        const name = r.teamName || r.name || r.team || '';
        const rank = r.rank ?? r.ranking ?? null;
        if (name && rank != null) {
          const slug = getTeamSlug(name);
          if (slug) rm[slug] = rank;
        }
      }
      // Use dailyChampOdds (same source as Home page)
      const co = dailyChampOdds ?? {};
      return buildMaximusPicks({ games: workingSlate, atsLeaders: atsL, rankMap: rm, championshipOdds: co });
    } catch (err) {
      console.warn('[Dashboard] canonicalPicks failed:', err?.message);
      return { pickEmPicks: [], atsPicks: [], valuePicks: [], totalsPicks: [] };
    }
  }, [workingSlate, dashData, dailyChampOdds]);

  // ── Deduped top leans: exact same rows the slide card renders ──
  // No hard limit — during Final Four with 2 games, this yields 2 per category.
  const canonicalRenderedPicks = useMemo(() => {
    try {
      const dedupBucket = (arr) => {
        const leans = (arr ?? []).filter(x => x?.itemType === 'lean')
          .sort((a, b) => ((b?.confidence ?? 0) - (a?.confidence ?? 0)) || ((b?.edgeMag ?? 0) - (a?.edgeMag ?? 0)));
        const seen = new Set();
        const result = [];
        for (const pick of leans) {
          const slug = getTeamSlug(pick.pickTeam || '') || (pick.pickTeam || '').toLowerCase();
          if (slug && seen.has(slug)) continue;
          const hSlug = pick.homeSlug || getTeamSlug(pick.homeTeam || '') || '';
          const aSlug = pick.awaySlug || getTeamSlug(pick.awayTeam || '') || '';
          const mKey = [hSlug, aSlug].filter(Boolean).sort().join('|');
          if (mKey && seen.has(`m:${mKey}`)) continue;
          if (slug) seen.add(slug);
          if (mKey) seen.add(`m:${mKey}`);
          result.push(pick);
        }
        return result;
      };
      const p = canonicalPicks ?? {};
      return [
        ...dedupBucket(p.pickEmPicks),
        ...dedupBucket(p.atsPicks),
        ...dedupBucket(p.valuePicks),
        ...dedupBucket(p.totalsPicks),
      ];
    } catch (err) {
      console.warn('[Dashboard] canonicalRenderedPicks failed:', err?.message);
      return [];
    }
  }, [canonicalPicks]);

  // ── MLB / NBA active flags (must precede caption useMemo which references them) ──
  const mlbActive = isMlbSection(activeSection);
  const nbaActive = isNbaSection(activeSection);

  // ── compute caption ───────────────────────────────────────
  const caption = useMemo(() => {
    // ── NBA caption (playoff-framed, canonical normalizer path) ──
    if (nbaActive) {
      const payloadDiag = {
        activeSection,
        liveGamesCount: nbaLiveGames?.length ?? 0,
        pickCats: Object.keys(nbaPicks?.categories || {}),
        leaderCats: Object.keys(nbaLeaders?.categories || {}),
        standingsTeams: Object.keys(nbaStandings || {}).length,
        hasChampOdds: !!nbaChampOdds && Object.keys(nbaChampOdds).length > 0,
        hasSelectedTeam: !!nbaSelectedTeam,
      };
      console.log('[NBA_CAPTION_STATE]', payloadDiag);

      let payload;
      try {
        payload = normalizeNbaImagePayload({
          activeSection,
          nbaPicks,
          nbaGames: [],
          nbaLiveGames,
          nbaWindowGames,
          nbaSelectedTeam,
          nbaChampOdds,
          nbaStandings,
          nbaLeaders,
          nbaNews,
        });
      } catch (err) {
        console.error('[NBA_CAPTION_PAYLOAD_FAILED]', err?.message || err);
        return { ok: false, reason: 'payload_build_failed', error: err?.message || 'normalizer threw' };
      }

      let built;
      try {
        built = buildNbaCaption(payload);
      } catch (err) {
        console.error('[NBA_CAPTION_BUILD_FAILED]', err?.message || err);
        return { ok: false, reason: 'caption_build_failed', error: err?.message || 'buildNbaCaption threw' };
      }

      const normalized = normalizeStudioCaption(built);
      console.log('[NBA_DAILY_CAPTION_BUILT]', {
        section: payload?.section,
        ok: normalized.ok,
        reason: normalized.reason,
        bodyLength: normalized.bodyLength,
        totalLength: normalized.totalLength,
        hashtagCount: normalized.hashtags.length,
        preview: normalized.fullCaption.slice(0, 200),
      });
      return normalized;
    }

    // ── MLB caption (sourced from intelBriefing + payload normalizer) ──
    if (mlbActive) {
      // ── PAYLOAD DIAGNOSTIC — log completeness before caption build ──
      const payloadDiag = {
        activeSection,
        hasBriefing: !!mlbBriefing,
        liveGamesCount: mlbLiveGames?.length ?? 0,
        pickCats: Object.keys(mlbPicks?.categories || {}),
        leaderCats: Object.keys(mlbLeaders?.categories || {}),
        standingsTeams: Object.keys(mlbStandings || {}).length,
        hasChampOdds: !!mlbChampOdds && Object.keys(mlbChampOdds).length > 0,
        hasSelectedTeam: !!mlbSelectedTeam,
      };
      console.log('[DASHBOARD_CAPTION_STATE]', payloadDiag);

      let payload;
      try {
        payload = normalizeMlbImagePayload({
          activeSection,
          mlbPicks,
          mlbGames,
          mlbLiveGames,
          mlbHeadlines,
          mlbSelectedTeam,
          mlbSelectedGame,
          mlbLeague,
          mlbDivision,
          mlbGameAngle,
          mlbBriefing,
          mlbChampOdds,
          mlbStandings,
          mlbLeaders,
        });
      } catch (err) {
        console.error('[CAPTION_PAYLOAD_FAILED]', err?.message || err);
        // Tagged failure — InstagramPublishButton uses .reason for
        // user-facing error copy ("Caption generation failed for this
        // post. Refresh or regenerate before publishing.")
        return { ok: false, reason: 'payload_build_failed', error: err?.message || 'normalizer threw' };
      }

      let built;
      try {
        built = buildMlbCaption(payload);
      } catch (err) {
        console.error('[CAPTION_BUILD_FAILED]', err?.message || err);
        return { ok: false, reason: 'caption_build_failed', error: err?.message || 'buildMlbCaption threw' };
      }

      // Single canonical contract — every consumer downstream uses
      // .fullCaption only. No more shape drift between layers.
      const normalized = normalizeStudioCaption(built);

      console.log('[DAILY_CAPTION_BUILT]', {
        section: payload?.section,
        ok: normalized.ok,
        reason: normalized.reason,
        bodyLength: normalized.bodyLength,
        totalLength: normalized.totalLength,
        hashtagCount: normalized.hashtags.length,
        preview: normalized.fullCaption.slice(0, 200),
      });

      // Preserve back-compat: still expose shortCaption + longCaption for
      // any consumer that hasn't migrated to fullCaption yet, but the
      // canonical field is .fullCaption.
      return normalized;
    }

    // ── CBB caption (unchanged) ──
    if (!dashData) return null;
    const picks = canonicalRenderedPicks;

    const asOf = new Date().toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short',
    });

    const ats = enhancedTeamData?.ats;
    const atsRecord = ats?.season
      ? `${ats.season.w}-${ats.season.l}${ats.season.coverPct != null ? ` (${ats.season.coverPct}%)` : ''}`
      : null;

    const stats = {
      gamesWithOdds: (canonicalPicksGames.filter(g => g.spread != null || g.homeSpread != null)).length,
      rank: enhancedTeamData?.rank ?? null,
      record: (enhancedTeamData?.team?.record?.items?.[0]?.summary) ?? null,
      atsRecord,
    };

    let cbbBuilt;
    try {
      cbbBuilt = buildCaption({
        template: activeSection,
        team: enhancedTeamData?.team ?? selectedTeam,
        game: selectedGame,
        picks,
        stats,
        atsLeaders: dashData?.atsLeaders ?? { best: [], worst: [] },
        headlines: dashData?.headlines ?? [],
        asOf,
        styleMode: activeSection === 'daily' ? dailyStyleMode : 'generic',
        chatDigest: activeSection === 'daily' ? dailyDigest : null,
        nextGame: activeSection === 'team' ? (enhancedTeamData?.nextLine?.nextEvent ?? null) : null,
        conference: activeSection === 'conference' ? selectedConference : null,
        tournamentInsights: activeSection === 'game' ? (tournamentInsightsData ?? null) : null,
      });
    } catch (err) {
      console.error('[CBB_CAPTION_BUILD_FAILED]', err?.message || err);
      return { ok: false, reason: 'caption_build_failed', error: err?.message || 'buildCaption threw' };
    }
    return normalizeStudioCaption(cbbBuilt);
  }, [activeSection, dashData, teamPageData, selectedTeam, selectedGame, dailyStyleMode, dailyDigest, selectedConference, tournamentInsightsData, canonicalRenderedPicks, canonicalPicksGames, mlbActive, mlbGames, mlbLiveGames, mlbPicks, mlbLeaders, mlbStandings, mlbChampOdds, mlbSelectedTeam, mlbSelectedGame, mlbBriefing, mlbHeadlines, mlbLeague, mlbDivision, mlbGameAngle, nbaActive, nbaPicks, nbaLiveGames, nbaWindowGames, nbaLeaders, nbaStandings, nbaChampOdds, nbaNews, nbaSelectedTeam]);

  // ── Instagram Hero Summary caption (Slide 4 — Team Intel only) ────────────
  // Separate from the generic team caption — this is the viral-optimized caption
  // tied specifically to the Instagram Hero Summary slide.
  const summaryCaptionData = useMemo(() => {
    if (activeSection !== 'team' || !enhancedTeamData || !dashData) return null;
    const games = dashData?.odds?.games ?? [];
    const atsL  = dashData?.atsLeaders ?? { best: [], worst: [] };
    let picks = [];
    try {
      const p = buildMaximusPicks({ games, atsLeaders: atsL });
      picks = [...(p.atsPicks ?? []), ...(p.mlPicks ?? [])].slice(0, 3);
    } catch { /* ignore */ }

    const asOf = new Date().toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short',
    });

    const ats = enhancedTeamData?.ats ?? {};

    // Compute last5Wins for storyline detection
    const schedEvents = enhancedTeamData?.schedule?.events ?? [];
    const recentFin = schedEvents
      .filter(e => e.isFinal && e.ourScore != null && e.oppScore != null)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const last5 = recentFin.slice(0, 5);
    const last5Wins = last5.filter(e => Number(e.ourScore) > Number(e.oppScore)).length;

    return buildCaption({
      template:    'team-summary',
      team:        enhancedTeamData?.team ?? selectedTeam,
      picks,
      ats,
      stats: {
        rank:       enhancedTeamData?.rank ?? null,
        record:     enhancedTeamData?.team?.record?.items?.[0]?.summary ?? null,
        last5Wins,
        totalGames: last5.length,
      },
      asOf,
      nextGame: (() => {
        const evt = enhancedTeamData?.nextLine?.nextEvent ?? null;
        if (!evt) return null;
        const c = enhancedTeamData?.nextLine?.consensus ?? {};
        return { ...evt, spread: evt.spread ?? c.spread ?? null, moneyline: evt.moneyline ?? c.moneyline ?? null, total: evt.total ?? c.total ?? null };
      })(),
      teamNews: enhancedTeamData?.last7News ?? enhancedTeamData?.teamNews ?? [],
    });
  }, [activeSection, dashData, enhancedTeamData, selectedTeam]);

  // ── regenerate ────────────────────────────────────────────
  const handleRegenerate = () => {
    setAssetsReady(false);
    setGeminiImage(null);
    setGeminiMode(false);
    setGeminiError(null);
    setRefreshKey(k => k + 1);
  };

  // ── Gemini image generation (MLB only) ──────────────────
  const handleGeminiGenerate = useCallback(async () => {
    if (!mlbActive) return;
    setGeminiLoading(true);
    setGeminiError(null);
    setGeminiImage(null);
    try {
      const payload = normalizeMlbImagePayload({
        activeSection,
        mlbPicks,
        mlbGames,
        mlbHeadlines,
        mlbSelectedTeam,
        mlbSelectedGame,
        mlbLeague,
        mlbDivision,
        mlbGameAngle,
        mlbBriefing,
        mlbChampOdds,
        mlbStandings,
        mlbLeaders,
      });
      const res = await fetch('/api/mlb/content-studio/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) {
        setGeminiError(data.error || 'Generation failed');
        return;
      }
      setGeminiImage({ base64: data.imageBase64, mimeType: data.mimeType });
      setGeminiMode(true);
    } catch (err) {
      setGeminiError(err.message || 'Network error during generation');
    } finally {
      setGeminiLoading(false);
    }
  }, [mlbActive, activeSection, mlbPicks, mlbGames, mlbLiveGames, mlbHeadlines, mlbSelectedTeam, mlbSelectedGame, mlbLeague, mlbDivision, mlbGameAngle, mlbBriefing]);

  // ── export PNGs ───────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!exportRef.current) return;
    setExporting(true);
    const layer = exportRef.current;
    const prevVis = layer.style.visibility;
    layer.style.visibility = 'visible';
    const dims = getTemplateDimensions(activeSection);
    try {
      const { toPng } = await import('html-to-image');
      await document.fonts.ready;
      await sanitizeImagesForExport(exportRef.current);
      const slides = exportRef.current.querySelectorAll('[data-slide]');
      const prefix = `maximus_${activeSection}`;
      let idx = 1;
      for (const slide of slides) {
        slide.style.visibility = 'visible';
        const dataUrl = await toPng(slide, {
          width: dims.width, height: dims.height, pixelRatio: 1, skipAutoScale: true,
        });
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${prefix}_${idx}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        idx++;
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (err) {
      console.error('[Dashboard] Export failed:', err);
    } finally {
      layer.style.visibility = prevVis;
      setExporting(false);
    }
  }, [activeSection]);

  // ── download ZIP ──────────────────────────────────────────
  const handleDownloadZip = useCallback(async () => {
    if (!exportRef.current) return;
    setZipping(true);
    const layer = exportRef.current;
    const prevVis = layer.style.visibility;
    layer.style.visibility = 'visible';
    const dims = getTemplateDimensions(activeSection);
    try {
      const [{ toPng }, JSZip] = await Promise.all([
        import('html-to-image'),
        import('jszip').then(m => m.default),
      ]);
      await document.fonts.ready;
      await sanitizeImagesForExport(exportRef.current);
      const zip = new JSZip();
      const slides = exportRef.current.querySelectorAll('[data-slide]');
      const prefix = `maximus_${activeSection}`;
      let idx = 1;
      for (const slide of slides) {
        slide.style.visibility = 'visible';
        const dataUrl = await toPng(slide, {
          width: dims.width, height: dims.height, pixelRatio: 1, skipAutoScale: true,
        });
        const base64 = dataUrl.split(',')[1];
        zip.file(`${prefix}_${idx}.png`, base64, { base64: true });
        idx++;
      }
      if (caption) {
        zip.file('caption.txt', formatCaptionFile(caption));
      }
      // Bundle the viral Instagram Hero Summary caption with Team Intel ZIPs
      if (activeSection === 'team' && summaryCaptionData) {
        const summaryText = [
          '=== INSTAGRAM HERO CAPTION (Slide 4 — Post this one) ===',
          '',
          summaryCaptionData.longCaption,
          '',
          (summaryCaptionData.hashtags || []).join(' '),
          '',
          '─'.repeat(40),
          '',
          '=== POSTING NOTES ===',
          'Post Slide 4 as a single image to Instagram feed.',
          'This caption is written for the summary hero post.',
          'Link in bio: maximussports.ai',
          'Best times: 11 AM – 1 PM or 7–9 PM ET.',
        ].join('\n');
        zip.file('instagram_caption_slide4.txt', summaryText);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${prefix}_pack.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Dashboard] ZIP failed:', err);
    } finally {
      layer.style.visibility = prevVis;
      setZipping(false);
    }
  }, [activeSection, caption, summaryCaptionData]);

  // ── copy caption ──────────────────────────────────────────
  const handleCopyCaption = () => {
    if (!caption) return;
    const text = captionTab === 'short' ? caption.shortCaption : caption.longCaption;
    const hashStr = (caption.hashtags || []).join(' ');
    navigator.clipboard.writeText(`${text}\n\n${hashStr}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── copy summary caption (Slide 4 Instagram Hero) ─────────
  const handleCopySummaryCaption = () => {
    if (!summaryCaptionData) return;
    const hashStr = (summaryCaptionData.hashtags || []).join(' ');
    navigator.clipboard.writeText(`${summaryCaptionData.longCaption}\n\n${hashStr}`).then(() => {
      setSummaryCopied(true);
      setTimeout(() => setSummaryCopied(false), 2000);
    });
  };

  // ── derive tag context from selected game ─────────────────
  const gameTagContext = useMemo(() => {
    if (!selectedGame) return {};
    return {
      awaySlug: getTeamSlug(selectedGame.awayTeam),
      homeSlug: getTeamSlug(selectedGame.homeTeam),
    };
  }, [selectedGame]);

  // ── Instagram publish metadata ────────────────────────────
  const publishMetadata = useMemo(() => {
    const sections = getSectionsForWorkspace(studioWorkspace);
    const section = sections.find(s => s.id === activeSection);
    return {
      title:                 section?.label ?? activeSection,
      templateType:          activeSection,
      contentType:           'social_carousel_slide',
      contentStudioSection:  activeSection,
      teamSlug:              selectedTeam?.slug  ?? null,
      teamName:              selectedTeam?.name  ?? null,
    };
  }, [activeSection, selectedTeam, studioWorkspace]);

  const handlePublishSuccess = useCallback(() => {
    setHistoryRefreshKey(k => k + 1);
  }, []);

  // ── Gates ─────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className={styles.gateWrap}>
        <div className={styles.gateCard}>
          <div className={styles.spinner} />
          <p className={styles.gateSubtext}>Checking authorization…</p>
        </div>
      </div>
    );
  }

  if (isUnauthorized) {
    return (
      <div className={styles.gateWrap}>
        <div className={styles.gateCard}>
          <div className={styles.gateLockIcon}>🔒</div>
          <h1 className={styles.gateTitle}>Unauthorized</h1>
          <p className={styles.gateSubtext}>
            {user ? 'Your account does not have access to this page.' : 'You must be signed in to access this page.'}
          </p>
          <Link to="/settings" className={styles.gateBtn}>
            {user ? 'Go to Settings' : 'Sign In'}
          </Link>
        </div>
      </div>
    );
  }

  // Game picker uses the same workingSlate as Maximus's Picks — ensures the
  // single-game selector and IG slide show the same set of games.
  const gamesForPicker = (() => {
    const pool = (workingSlate.length > 0 ? workingSlate : (dashData?.odds?.games ?? []))
      .filter(g => g.awayTeam && g.homeTeam);
    return pool.sort((a, b) => {
      const ta = a.startTime || a.commenceTime || '';
      const tb = b.startTime || b.commenceTime || '';
      return ta.localeCompare(tb);
    });
  })();
  // mlbActive / nbaActive are declared earlier (before caption useMemo)
  const isWorking = nbaActive
    ? nbaGamesLoading
    : (mlbActive ? mlbGamesLoading : (dataLoading || teamPageLoading));
  const canExport = nbaActive
    ? (!nbaGamesLoading && (activeSection !== 'nba-team' || !!nbaSelectedTeam))
    : (mlbActive
      ? (!mlbGamesLoading && (activeSection !== 'mlb-game' || !!mlbSelectedGame))
      : (!isWorking && !!dashData && (activeSection !== 'team' || !!enhancedTeamData) && (activeSection !== 'conference' || !!selectedConference)));
  const previewScale = PREVIEW_SCALES[previewSize] || PREVIEW_SCALES.medium;

  // MLB / NBA slide counts — daily gets 3-slide carousel, team intel 1 slide
  const MLB_SLIDE_COUNTS = { 'mlb-daily': 3, 'mlb-team': 1 };
  const NBA_SLIDE_COUNTS = { 'nba-daily': 3, 'nba-team': 1 };
  const effectiveSlideCount = nbaActive
    ? (NBA_SLIDE_COUNTS[activeSection] ?? 1)
    : (mlbActive
      ? (MLB_SLIDE_COUNTS[activeSection] ?? 1)
      : slideCount);

  const options = nbaActive ? {
    nbaTemplate: nbaTemplateType(activeSection),
    slideCount: effectiveSlideCount,
  } : mlbActive ? {
    mlbTemplate: mlbTemplateType(activeSection),
    mlbLeague,
    mlbDivision,
    gameAngle: mlbGameAngle,
    mlbSlateMode,
    slideCount: effectiveSlideCount,
  } : {
    styleMode: activeSection === 'daily' ? dailyStyleMode : 'generic',
    riskMode,
    picksMode,
    gameAngle,
    gameMode,
    includeHeadlines,
    slideCount,
    ...(tournamentInsightsData?.mode === 'tournament' ? {
      tournamentInsights: {
        title: tournamentInsightsData.title,
        subtitle: tournamentInsightsData.subtitle,
        insights: tournamentInsightsData.insights,
      },
    } : {}),
    ...(tournamentInsightsData?.mode === 'upset-radar' ? {
      upsetRadarGames: tournamentInsightsData.upsetGames,
      dayLabel: tournamentInsightsData.dayLabel || '',
      roundLabel: tournamentInsightsData.roundLabel || '',
      dayCards: upsetRadarSlate === 'auto' ? (tournamentInsightsData.dayCards || []) : [],
    } : {}),
    ...(tournamentInsightsData?.mode === '5games' ? {
      fiveGamesPicks: tournamentInsightsData.fiveGamesPicks || [],
      dayLabel: tournamentInsightsData.dayLabel || '',
      roundLabel: tournamentInsightsData.roundLabel || '',
    } : {}),
  };

  return (
    <div className={styles.root}>
      {/* ── Page header ──────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <h1 className={styles.pageTitle}>Social Content Studio</h1>
          <span className={styles.adminBadge}>Admin Only</span>
          {availableStudioWorkspaces.length > 1 && (
            <div className={styles.workspacePills}>
              {availableStudioWorkspaces.map(ws => (
                <button
                  key={ws.id}
                  className={`${styles.workspacePill} ${ws.id === studioWorkspaceId ? styles.workspacePillActive : ''}`}
                  onClick={() => {
                    setStudioWorkspaceId(ws.id);
                    setAssetsReady(false);
                    const nextSection = ws.id === WorkspaceId.MLB
                      ? 'mlb-daily'
                      : ws.id === WorkspaceId.NBA
                        ? 'nba-daily'
                        : 'daily';
                    setActiveSection(nextSection);
                  }}
                >
                  {ws.emoji} {ws.shortLabel}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={styles.authStatus}>
          <span className={styles.authDot} />
          {user.email}
        </div>
      </div>

      {/* ── Studio layout: controls left, preview right ── */}
      <div className={styles.studio}>

        {/* ─── Left: Controls + Caption + Tags ─────────── */}
        <aside className={styles.controls}>

          {/* Section tabs */}
          <div className={`${styles.sectionTabs} ${isMlbStudio ? styles.sectionTabsMlb : ''}`}>
            {getSectionsForWorkspace(studioWorkspace).map(sec => (
              <React.Fragment key={sec.id}>
                {sec.shared && <div className={styles.sharedDivider}><span className={styles.sharedLabel}>Shared Tools</span></div>}
                <button
                  className={`${styles.sectionTab} ${activeSection === sec.id ? styles.sectionTabActive : ''} ${isMlbStudio ? styles.sectionTabMlb : ''}`}
                  onClick={() => {
                    setActiveSection(sec.id);
                    setAssetsReady(false);
                  }}
                >
                  <span className={styles.tabIcon}>{sec.icon}</span>
                  <span className={styles.tabLabel}>{sec.label}</span>
                </button>
              </React.Fragment>
            ))}
          </div>

          {activeSection !== 'videos' && (<>

          {/* ─── Daily Briefing controls ──────────────── */}
          {activeSection === 'daily' && (
            <div className={styles.sectionControls}>
              <div className={styles.controlGroup}>
                <label className={styles.controlLabel}>Style</label>
                <div className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>Generic info</span>
                  <button
                    className={`${styles.toggle} ${dailyStyleMode === 'robot' ? styles.toggleOn : ''}`}
                    onClick={() => {
                      setDailyStyleMode(m => m === 'robot' ? 'generic' : 'robot');
                      setAssetsReady(false);
                    }}
                    role="switch"
                    aria-checked={dailyStyleMode === 'robot'}
                  >
                    <span className={styles.toggleThumb} />
                  </button>
                  <span className={`${styles.toggleLabel} ${dailyStyleMode === 'robot' ? styles.toggleLabelActive : ''}`}>
                    Robot voice
                  </span>
                </div>
              </div>
              <div className={styles.controlGroup}>
                <label className={styles.controlLabel}>Slides</label>
                <div className={styles.chipGroup}>
                  <button
                    className={`${styles.chip} ${styles.chipActive}`}
                    disabled
                  >
                    5
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── Team Intel controls ───────────────────── */}
          {activeSection === 'team' && (
            <div className={styles.sectionControls}>
              <div className={styles.controlGroup}>
                <label className={styles.controlLabel}>Team</label>

                {/* Conference filter chips */}
                <div className={styles.confFilterRow}>
                  {CONF_FILTERS.filter(c => ['All', 'Top 25', 'SEC', 'Big Ten', 'Big 12', 'ACC', 'Big East', 'WCC', 'AAC', 'Mountain West', 'A-10', 'Other'].includes(c)).map(c => (
                    <button
                      key={c}
                      className={`${styles.confChip} ${confFilter === c ? styles.confChipActive : ''}`}
                      onClick={() => { setConfFilter(c); setShowTeamDropdown(true); }}
                    >
                      {c}
                    </button>
                  ))}
                </div>

                {/* Sort toggle */}
                <div className={styles.sortRow}>
                  <button
                    className={`${styles.sortBtn} ${teamSort === 'alpha' ? styles.sortBtnActive : ''}`}
                    onClick={() => setTeamSort('alpha')}
                  >A–Z</button>
                  <button
                    className={`${styles.sortBtn} ${teamSort === 'conference' ? styles.sortBtnActive : ''}`}
                    onClick={() => setTeamSort('conference')}
                  >By Conf</button>
                </div>

                <div className={styles.teamPickerWrap}>
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Search teams or conferences…"
                    value={teamSearch}
                    onChange={e => { setTeamSearch(e.target.value); setShowTeamDropdown(true); }}
                    onFocus={() => setShowTeamDropdown(true)}
                  />
                  {showTeamDropdown && filteredTeams.length > 0 && (
                    <div className={styles.teamDropdown}>
                      {filteredTeams.map(t => (
                        <button
                          key={t.slug}
                          className={`${styles.teamOption} ${selectedTeam?.slug === t.slug ? styles.teamOptionActive : ''}`}
                          onClick={() => {
                            setSelectedTeam(t);
                            setTeamSearch(t.name);
                            setShowTeamDropdown(false);
                            setAssetsReady(false);
                          }}
                        >
                          <img
                            src={`/logos/${t.slug}.png`}
                            alt=""
                            className={styles.teamOptionLogo}
                            onError={e => { e.currentTarget.style.display = 'none'; }}
                          />
                          <span>{t.name}</span>
                          <span className={styles.teamConf}>{t.conference}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedTeam && (
                  <div className={styles.selectedTeamPill}>
                    <img
                      src={`/logos/${selectedTeam.slug}.png`}
                      alt=""
                      className={styles.selectedTeamLogo}
                      onError={e => { e.currentTarget.style.display = 'none'; }}
                    />
                    {selectedTeam.name}
                    <button
                      className={styles.clearBtn}
                      onClick={() => { setSelectedTeam(null); setTeamSearch(''); setAssetsReady(false); }}
                    >×</button>
                  </div>
                )}
                {teamPageLoading && <div className={styles.miniSpinner} />}
              </div>
              <div className={styles.controlGroup}>
                <div className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>Recent headlines</span>
                  <button
                    className={`${styles.toggle} ${includeHeadlines ? styles.toggleOn : ''}`}
                    onClick={() => { setIncludeHeadlines(v => !v); setAssetsReady(false); }}
                    role="switch"
                    aria-checked={includeHeadlines}
                  >
                    <span className={styles.toggleThumb} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── Conference Intel controls ─────────────── */}
          {activeSection === 'conference' && (
            <div className={styles.sectionControls}>
              <div className={styles.controlGroup}>
                <label className={styles.controlLabel}>Conference</label>
                <div className={styles.confFilterRow}>
                  {['SEC', 'Big Ten', 'Big 12', 'ACC', 'Big East', 'WCC', 'Mountain West', 'AAC', 'A-10', 'MVC', 'MAC', 'CUSA'].map(c => (
                    <button
                      key={c}
                      className={`${styles.confChip} ${selectedConference === c ? styles.confChipActive : ''}`}
                      onClick={() => { setSelectedConference(c); setAssetsReady(false); }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                {selectedConference && (
                  <div className={styles.selectedTeamPill}>
                    {selectedConference} Intel
                    <button
                      className={styles.clearBtn}
                      onClick={() => { setSelectedConference(null); setAssetsReady(false); }}
                    >&times;</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Game Insights controls (March Madness Intelligence) */}
          {activeSection === 'game' && (
            <div className={styles.sectionControls}>
              <div className={styles.controlGroup}>
                <label className={styles.controlLabel}>Mode</label>
                <div className={styles.chipGroup}>
                  {[
                    { id: 'tournament', label: 'Tournament' },
                    { id: 'upset-radar', label: 'Upset Radar' },
                    { id: 'standard', label: 'Single Game' },
                    { id: '5games',   label: '5 Key Games' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      className={`${styles.chip} ${gameMode === opt.id ? styles.chipActive : ''}`}
                      onClick={() => {
                        setGameMode(opt.id);
                        if (opt.id === 'tournament' && !tournamentPreset) setTournamentPreset('1-seeds');
                        setAssetsReady(false);
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Tournament mode: presets + region browse ── */}
              {gameMode === 'tournament' && (
                <>
                  <div className={styles.controlGroup}>
                    <label className={styles.controlLabel}>Seed-Line Presets</label>
                    <div className={styles.confFilterRow}>
                      {SEED_LINE_PRESETS.filter(p => p.id !== 'upset').map(preset => (
                        <button
                          key={preset.id}
                          className={`${styles.confChip} ${tournamentPreset === preset.id ? styles.confChipActive : ''}`}
                          onClick={() => {
                            setTournamentPreset(preset.id);
                            setTournamentRegion(null);
                            setTournamentSelectedMatchups([]);
                            setAssetsReady(false);
                          }}
                        >
                          {preset.icon} {preset.label.replace('All ', '')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={styles.controlGroup}>
                    <label className={styles.controlLabel}>Browse by Region</label>
                    <div className={styles.chipGroup}>
                      {REGIONS.map(region => (
                        <button
                          key={region}
                          className={`${styles.chip} ${tournamentRegion === region && !tournamentPreset ? styles.chipActive : ''}`}
                          onClick={() => {
                            setTournamentRegion(region);
                            setTournamentPreset(null);
                            setTournamentSelectedMatchups([]);
                            setAssetsReady(false);
                          }}
                        >
                          {region}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Show selected preset or region info */}
                  {tournamentPreset && (
                    <div className={styles.selectedTeamPill}>
                      {SEED_LINE_PRESETS.find(p => p.id === tournamentPreset)?.icon}{' '}
                      {SEED_LINE_PRESETS.find(p => p.id === tournamentPreset)?.label}
                      <button className={styles.clearBtn} onClick={() => { setTournamentPreset(null); setAssetsReady(false); }}>&times;</button>
                    </div>
                  )}
                  {!tournamentPreset && tournamentRegion && (
                    <div className={styles.selectedTeamPill}>
                      {tournamentRegion} Region — 8 First Round Matchups
                      <button className={styles.clearBtn} onClick={() => { setTournamentRegion(null); setAssetsReady(false); }}>&times;</button>
                    </div>
                  )}
                  {/* Region matchup list for manual multi-select */}
                  {!tournamentPreset && tournamentRegion && (() => {
                    const byRegion = getFirstRoundMatchupsByRegion();
                    const matchups = byRegion[tournamentRegion] || [];
                    return (
                      <div className={styles.controlGroup}>
                        <label className={styles.controlLabel}>Select Matchups</label>
                        <div className={styles.matchupSelectList}>
                          {matchups.map((m, i) => {
                            const isSelected = tournamentSelectedMatchups.some(
                              s => s.topTeam?.slug === m.topTeam?.slug && s.bottomTeam?.slug === m.bottomTeam?.slug,
                            );
                            return (
                              <button
                                key={i}
                                className={`${styles.matchupSelectRow} ${isSelected ? styles.matchupSelectRowActive : ''}`}
                                onClick={() => {
                                  setTournamentSelectedMatchups(prev => {
                                    const exists = prev.some(
                                      s => s.topTeam?.slug === m.topTeam?.slug && s.bottomTeam?.slug === m.bottomTeam?.slug,
                                    );
                                    const next = exists
                                      ? prev.filter(s => !(s.topTeam?.slug === m.topTeam?.slug && s.bottomTeam?.slug === m.bottomTeam?.slug))
                                      : [...prev, m];
                                    return next;
                                  });
                                  setAssetsReady(false);
                                }}
                              >
                                <SeedBadge seed={m.topSeed} size="sm" variant={m.topSeed <= 4 ? 'gold' : 'default'} />
                                <span className={styles.matchupTeamName}>{m.topTeam?.shortName}</span>
                                <span className={styles.matchupVs}>vs</span>
                                <span className={styles.matchupTeamName}>{m.bottomTeam?.shortName}</span>
                                <SeedBadge seed={m.bottomSeed} size="sm" />
                                <span className={styles.matchupCheck}>{isSelected ? '✓' : ''}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}

              {/* ── 5 Key Games mode ────────────────────── */}
              {gameMode === '5games' && (() => {
                const slateOpts = tournamentInsightsData?.slateOptions;
                const options = slateOpts?.options || [{ id: 'auto', shortLabel: 'Auto' }];
                const displayPicks = (tournamentInsightsData?.fiveGamesPicks || []).slice(0, 5);
                const activeDayLabel = tournamentInsightsData?.dayLabel || '';
                const activeRoundLabel = tournamentInsightsData?.roundLabel || '';

                return (
                  <>
                    {/* Slate / Day Selector */}
                    <div className={styles.controlGroup}>
                      <label className={styles.controlLabel}>
                        {activeRoundLabel || 'Round'} · Slate
                      </label>
                      <div className={styles.slateSegmented}>
                        {options.map(opt => (
                          <button
                            key={opt.id}
                            className={`${styles.slateBtn} ${fiveGamesSlate === opt.id ? styles.slateBtnActive : ''}`}
                            onClick={() => {
                              setFiveGamesSlate(opt.id);
                              setAssetsReady(false);
                            }}
                          >
                            {opt.shortLabel}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Candidate list */}
                    <div className={styles.controlGroup}>
                      <label className={styles.controlLabel}>
                        {activeDayLabel
                          ? `${activeDayLabel} · Top 5 ATS Picks`
                          : 'Top 5 ATS Picks'
                        }
                      </label>
                      <div className={styles.matchupSelectList}>
                        {displayPicks.length === 0 ? (
                          <div className={styles.emptyPicker}>No ATS picks for this slate</div>
                        ) : (
                          displayPicks.map((p, i) => (
                            <div key={i} className={`${styles.matchupSelectRow} ${styles.matchupSelectRowActive}`}>
                              <span className={styles.matchupRank}>{i + 1}</span>
                              <span className={styles.matchupTeamName}>{p.awayTeam}</span>
                              <span className={styles.matchupVs}>@</span>
                              <span className={styles.matchupTeamName}>{p.homeTeam}</span>
                              <span className={styles.matchupPct}>{p.pickLine}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* ── Upset Radar mode ──────────────────────── */}
              {gameMode === 'upset-radar' && (() => {
                const slateOpts = tournamentInsightsData?.slateOptions;
                const options = slateOpts?.options || [{ id: 'auto', shortLabel: 'Auto' }];
                const displayGames = (tournamentInsightsData?.upsetGames || []).slice(0, 5);
                const activeDayLabel = tournamentInsightsData?.dayLabel || '';
                const activeRoundLabel = tournamentInsightsData?.roundLabel || '';

                return (
                  <>
                    {/* Slate / Day Selector */}
                    <div className={styles.controlGroup}>
                      <label className={styles.controlLabel}>
                        {activeRoundLabel || 'Round'} · Slate
                      </label>
                      <div className={styles.slateSegmented}>
                        {options.map(opt => (
                          <button
                            key={opt.id}
                            className={`${styles.slateBtn} ${upsetRadarSlate === opt.id ? styles.slateBtnActive : ''}`}
                            onClick={() => {
                              setUpsetRadarSlate(opt.id);
                              setAssetsReady(false);
                            }}
                          >
                            {opt.shortLabel}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Candidate list */}
                    <div className={styles.controlGroup}>
                      <label className={styles.controlLabel}>
                        {activeDayLabel
                          ? `${activeDayLabel} · Top 5 Upset Watch`
                          : 'Top 5 Upset Watch Games'
                        }
                      </label>
                      <div className={styles.matchupSelectList}>
                        {displayGames.length === 0 ? (
                          <div className={styles.emptyPicker}>No games for this slate</div>
                        ) : (
                          displayGames.map((g, i) => (
                            <div key={i} className={`${styles.matchupSelectRow} ${styles.matchupSelectRowActive}`}>
                              <span className={styles.matchupRank}>{i + 1}</span>
                              <SeedBadge seed={g.topSeed} size="sm" />
                              <span className={styles.matchupTeamName}>{g.topTeam?.shortName}</span>
                              <span className={styles.matchupVs}>vs</span>
                              <span className={styles.matchupTeamName}>{g.bottomTeam?.shortName}</span>
                              <SeedBadge seed={g.bottomSeed} size="sm" />
                              <span className={styles.matchupPct}>{Math.round((g.upsetProbability ?? 0) * 100)}%</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* ── Single game mode (legacy) ─────────────── */}
              {gameMode === 'standard' && (
                <>
                  <div className={styles.controlGroup}>
                    <label className={styles.controlLabel}>Game</label>
                    {gamesForPicker.length === 0 ? (
                      <div className={styles.emptyPicker}>No games with lines available</div>
                    ) : (
                      <div className={styles.selectWrap}>
                        <select
                          className={styles.select}
                          value={selectedGame ? JSON.stringify({ away: selectedGame.awayTeam, home: selectedGame.homeTeam }) : ''}
                          onChange={e => {
                            const val = e.target.value;
                            if (!val) return;
                            const { away, home } = JSON.parse(val);
                            const g = gamesForPicker.find(x => x.awayTeam === away && x.homeTeam === home);
                            setSelectedGame(g ?? null);
                            setAssetsReady(false);
                          }}
                        >
                          {gamesForPicker.map((g, i) => (
                            <option key={i} value={JSON.stringify({ away: g.awayTeam, home: g.homeTeam })}>
                              {gameLabel(g)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className={styles.controlGroup}>
                    <label className={styles.controlLabel}>Angle</label>
                    <div className={styles.chipGroup}>
                      {[
                        { id: 'value', label: 'Value' },
                        { id: 'story', label: 'Story' },
                      ].map(opt => (
                        <button
                          key={opt.id}
                          className={`${styles.chip} ${gameAngle === opt.id ? styles.chipActive : ''}`}
                          onClick={() => { setGameAngle(opt.id); setAssetsReady(false); }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─── Maximus's Picks controls ─────────────── */}
          {activeSection === 'picks' && (
            <div className={styles.sectionControls}>
              <div className={styles.controlGroup}>
                <label className={styles.controlLabel}>Slides</label>
                <div className={styles.chipGroup}>
                  {[6].map(n => (
                    <button
                      key={n}
                      className={`${styles.chip} ${slideCount === n ? styles.chipActive : ''}`}
                      onClick={() => { setSlideCount(n); setAssetsReady(false); }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.controlGroup}>
                <label className={styles.controlLabel}>Format</label>
                <div className={styles.chipGroup}>
                  <span className={styles.chip} style={{ opacity: 0.6, cursor: 'default' }}>
                    1080 × 1080
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ─── NBA controls ─────────────────────────── */}
          {nbaActive && (
            <div className={styles.sectionControls}>
              <div className={styles.controlGroup}>
                <label className={styles.controlLabel}>Format</label>
                <div className={styles.chipGroup}>
                  <span className={styles.chip} style={{ opacity: 0.6, cursor: 'default' }}>
                    {activeSection === 'nba-daily' ? '3-Slide Carousel · 1080 × 1350' : 'Single Slide · 1080 × 1350'}
                  </span>
                </div>
              </div>

              {/* Team picker for NBA Team Intel */}
              {activeSection === 'nba-team' && (
                <div className={styles.controlGroup}>
                  <label className={styles.controlLabel}>Team</label>
                  <div className={styles.selectWrap}>
                    <select
                      className={styles.select}
                      value={nbaSelectedTeam?.slug || ''}
                      onChange={e => {
                        const slug = e.target.value;
                        const team = NBA_TEAMS.find(t => t.slug === slug) || null;
                        setNbaSelectedTeam(team);
                        setAssetsReady(false);
                      }}
                    >
                      <option value="">Select team…</option>
                      {['Eastern', 'Western'].map(conf => (
                        <optgroup key={conf} label={`${conf} Conference`}>
                          {NBA_TEAMS.filter(t => t.conference === conf).sort((a, b) => a.name.localeCompare(b.name)).map(t => (
                            <option key={t.slug} value={t.slug}>{t.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── MLB controls ─────────────────────────── */}
          {mlbActive && (
            <div className={styles.sectionControls}>
              {/* MLB always produces 1 slide — show format badge */}
              <div className={styles.controlGroup}>
                <label className={styles.controlLabel}>Format</label>
                <div className={styles.chipGroup}>
                  <span className={styles.chip} style={{ opacity: 0.6, cursor: 'default' }}>
                    Single Slide · 1080 × 1350
                  </span>
                </div>
              </div>

              {/* Team picker for Team Intel */}
              {activeSection === 'mlb-team' && (
                <div className={styles.controlGroup}>
                  <label className={styles.controlLabel}>Team</label>
                  <div className={styles.selectWrap}>
                    <select
                      className={styles.select}
                      value={mlbSelectedTeam?.slug || ''}
                      onChange={e => {
                        const slug = e.target.value;
                        const team = MLB_TEAMS.find(t => t.slug === slug) || null;
                        setMlbSelectedTeam(team);
                        setAssetsReady(false);
                      }}
                    >
                      <option value="">Select team…</option>
                      {MLB_DIVISIONS.map(div => (
                        <optgroup key={div} label={div}>
                          {MLB_TEAMS.filter(t => t.division === div).sort((a, b) => a.name.localeCompare(b.name)).map(t => (
                            <option key={t.slug} value={t.slug}>{t.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* League picker for League Intel */}
              {activeSection === 'mlb-league' && (
                <div className={styles.controlGroup}>
                  <label className={styles.controlLabel}>League</label>
                  <div className={styles.chipGroup}>
                    {['AL', 'NL'].map(lg => (
                      <button
                        key={lg}
                        className={`${styles.chip} ${mlbLeague === lg ? styles.chipActive : ''} ${isMlbStudio ? styles.chipMlb : ''}`}
                        onClick={() => { setMlbLeague(lg); setAssetsReady(false); }}
                      >
                        {lg === 'AL' ? 'American League' : 'National League'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Division picker for Divisional Intel */}
              {activeSection === 'mlb-division' && (
                <div className={styles.controlGroup}>
                  <label className={styles.controlLabel}>Division</label>
                  <div className={styles.selectWrap}>
                    <select
                      className={styles.select}
                      value={mlbDivision}
                      onChange={e => { setMlbDivision(e.target.value); setAssetsReady(false); }}
                    >
                      {MLB_DIVISIONS.map(div => (
                        <option key={div} value={div}>{div}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Game picker for Game Insights */}
              {activeSection === 'mlb-game' && (
                <>
                  <div className={styles.controlGroup}>
                    <label className={styles.controlLabel}>Game</label>
                    {mlbGames.length === 0 ? (
                      <div className={styles.emptyPicker}>No MLB games available</div>
                    ) : (
                      <div className={styles.selectWrap}>
                        <select
                          className={styles.select}
                          value={mlbSelectedGame ? `${mlbSelectedGame.awayTeam}@${mlbSelectedGame.homeTeam}` : ''}
                          onChange={e => {
                            const val = e.target.value;
                            if (!val) return;
                            const [away, home] = val.split('@');
                            const g = mlbGames.find(x => x.awayTeam === away && x.homeTeam === home);
                            setMlbSelectedGame(g ?? null);
                            setAssetsReady(false);
                          }}
                        >
                          <option value="">Select game…</option>
                          {mlbGames.filter(g => g.awayTeam && g.homeTeam).map((g, i) => (
                            <option key={i} value={`${g.awayTeam}@${g.homeTeam}`}>
                              {gameLabel(g)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className={styles.controlGroup}>
                    <label className={styles.controlLabel}>Angle</label>
                    <div className={styles.chipGroup}>
                      {[{ id: 'value', label: 'Value' }, { id: 'story', label: 'Story' }].map(opt => (
                        <button
                          key={opt.id}
                          className={`${styles.chip} ${mlbGameAngle === opt.id ? styles.chipActive : ''} ${isMlbStudio ? styles.chipMlb : ''}`}
                          onClick={() => { setMlbGameAngle(opt.id); setAssetsReady(false); }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Mode for Daily Briefing / Picks */}
              {(activeSection === 'mlb-daily' || activeSection === 'mlb-picks') && (
                <div className={styles.controlGroup}>
                  <label className={styles.controlLabel}>Slate Mode</label>
                  <div className={styles.chipGroup}>
                    {[
                      { id: 'full', label: 'Full Slate' },
                      { id: 'featured', label: 'Featured' },
                      { id: 'division', label: 'Division' },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        className={`${styles.chip} ${mlbSlateMode === opt.id ? styles.chipActive : ''} ${isMlbStudio ? styles.chipMlb : ''}`}
                        onClick={() => { setMlbSlateMode(opt.id); setAssetsReady(false); }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {dataError && !mlbActive && (
            <div className={styles.errorBanner}>
              <strong>Error:</strong> {dataError}
            </div>
          )}

          {/* Status */}
          {assetsReady && <div className={styles.readyBadge}>✓ Ready to export</div>}
          {isWorking && <div className={styles.loadingBadge}>⏳ Loading data…</div>}

          {/* Preview size + action buttons */}
          <div className={styles.actionGroup}>
            <div className={styles.previewSizeRow}>
              <span className={styles.previewSizeLabel}>Preview</span>
              <div className={styles.chipGroup}>
                {['small', 'medium', 'large'].map(size => (
                  <button
                    key={size}
                    className={`${styles.chip} ${previewSize === size ? styles.chipActive : ''}`}
                    onClick={() => {
                      setPreviewSize(size);
                      try { localStorage.setItem('maximus_preview_size', size); } catch { /* non-fatal */ }
                    }}
                  >
                    {size === 'small' ? 'S' : size === 'medium' ? 'M' : 'L'}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.sectionLabel}>Actions</div>
            <button className={styles.btnSecondary} onClick={handleRegenerate} disabled={isWorking || exporting || zipping}>
              {dataLoading ? 'Loading…' : 'Regenerate'}
            </button>
            <button className={styles.btnPrimary} onClick={handleExport} disabled={!canExport || exporting || zipping}>
              {exporting ? 'Exporting…' : 'Export PNGs'}
            </button>
            <button className={styles.btnSecondary} onClick={handleDownloadZip} disabled={!canExport || exporting || zipping}>
              {zipping ? 'Zipping…' : 'Download ZIP'}
            </button>

            {/* ── Gemini generation (MLB only) ──────────── */}
            {mlbActive && (
              <>
                <div className={styles.publishDivider} />
                <div className={styles.sectionLabel}>AI Generation</div>
                <button
                  className={styles.btnGemini}
                  onClick={handleGeminiGenerate}
                  disabled={geminiLoading || isWorking}
                >
                  {geminiLoading ? '✨ Generating…' : '✨ Generate with Gemini'}
                </button>
                {geminiMode && geminiImage && (
                  <button
                    className={styles.btnSecondary}
                    onClick={() => { setGeminiMode(false); }}
                    style={{ fontSize: '10px' }}
                  >
                    ← Standard Preview
                  </button>
                )}
                {geminiError && (
                  <div className={styles.geminiError}>
                    ⚠ {geminiError}
                  </div>
                )}
              </>
            )}

            <div className={styles.publishDivider} />
            <div className={styles.sectionLabel}>Publish</div>
            <div className={styles.postBlock}>
              <InstagramPublishButton
                exportRef={exportRef}
                caption={caption}
                canPublish={canExport && !exporting && !zipping}
                metadata={publishMetadata}
                onSuccess={handlePublishSuccess}
                template={activeSection}
              />
              {canExport && (
                <div className={styles.postMeta}>
                  {(() => {
                    const labelMap = {
                      'mlb-daily': 'Daily Briefing',
                      'mlb-team': 'Team Intel',
                      'mlb-picks': "Maximus's Picks",
                      'mlb-league': 'League Intel',
                      'mlb-division': 'Division Intel',
                      'mlb-game': 'Game Insights',
                      daily: 'Daily Briefing',
                      team: 'Team Intel',
                      picks: "Maximus's Picks",
                      game: 'Game Insights',
                      conference: 'Conference Intel',
                      odds: 'Odds Insights',
                    };
                    const sectionLabel = labelMap[activeSection] || 'Post';
                    const slideSuffix = slideCount ? `${slideCount} slide${slideCount === 1 ? '' : 's'}` : '1 slide';
                    return `Posts ${slideSuffix} · ${sectionLabel}`;
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* Instagram Hero Summary Caption (Team Intel — Slide 4) */}
          {activeSection === 'team' && summaryCaptionData && (
            <div className={styles.captionPanel}>
              <div className={styles.captionHeader}>
                <span className={styles.captionTitle}>
                  📸 Instagram Caption
                  <span style={{ fontSize: '11px', fontWeight: 400, opacity: 0.55, marginLeft: 6 }}>
                    Slide 4 · Hero Summary
                  </span>
                </span>
                <button className={styles.copyBtn} onClick={handleCopySummaryCaption}>
                  {summaryCopied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className={styles.captionBody}>
                <pre className={styles.captionText}>
                  {summaryCaptionData.longCaption}
                </pre>
                <div className={styles.captionHashtags}>
                  {(summaryCaptionData.hashtags || []).join(' ')}
                </div>
              </div>
            </div>
          )}

          {/* Caption panel (standard — non-Team Intel or fallback) */}
          {/* Only render when the normalized caption is actually publish-ready.
              When caption.ok === false (builder threw / missing data / too short),
              render a small empty-state so the user sees why preview is blank. */}
          {caption && activeSection !== 'team' && caption.ok !== false && (caption.shortCaption || caption.longCaption || caption.fullCaption) && (
            <div className={styles.captionPanel}>
              <div className={styles.captionHeader}>
                <span className={styles.captionTitle}>Caption</span>
                <div className={styles.captionTabs}>
                  {['short', 'long'].map(tab => (
                    <button
                      key={tab}
                      className={`${styles.captionTab} ${captionTab === tab ? styles.captionTabActive : ''}`}
                      onClick={() => setCaptionTab(tab)}
                    >
                      {tab === 'short' ? 'Short' : 'Long'}
                    </button>
                  ))}
                </div>
                <button className={styles.copyBtn} onClick={handleCopyCaption}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className={styles.captionBody}>
                <pre className={styles.captionText}>
                  {captionTab === 'short' ? caption.shortCaption : caption.longCaption}
                </pre>
                <div className={styles.captionHashtags}>
                  {(caption.hashtags || []).join(' ')}
                </div>
              </div>
            </div>
          )}
          {caption && caption.ok === false && activeSection !== 'team' && (
            <div className={styles.captionPanel}>
              <div className={styles.captionHeader}>
                <span className={styles.captionTitle}>Caption</span>
              </div>
              <div className={styles.captionBody}>
                <pre className={styles.captionText} style={{ opacity: 0.7 }}>
                  {caption.reason === 'caption_build_failed' && 'Caption generation failed for this post. Regenerate content to retry.'}
                  {caption.reason === 'payload_build_failed' && 'Caption payload could not be assembled. Regenerate content to retry.'}
                  {caption.reason === 'too_short' && `Caption is incomplete (${caption.totalLength ?? 0} chars). Regenerate to retry.`}
                  {caption.reason === 'missing_body' && 'Caption builder returned unexpected shape. Regenerate to retry.'}
                  {caption.reason === 'null_builder_output' && 'No caption was produced. Generate content first.'}
                  {!['caption_build_failed','payload_build_failed','too_short','missing_body','null_builder_output'].includes(caption.reason) && 'Caption is not ready. Regenerate content before publishing.'}
                </pre>
              </div>
            </div>
          )}

          {/* Tag Suggestions panel */}
          <TagSuggestionsPanel
            template={activeSection}
            teamSlug={selectedTeam?.slug}
            conference={activeSection === 'conference' ? selectedConference : selectedTeam?.conference}
            awaySlug={gameTagContext.awaySlug}
            homeSlug={gameTagContext.homeSlug}
            gameMode={activeSection === 'game' ? gameMode : undefined}
          />

          </>)}
        </aside>

        {/* ─── Right: Preview area ──────────────────────── */}
        <section className={styles.previewArea}>
          {activeSection === 'videos' ? (
            <VideosEditor />
          ) : geminiMode && geminiImage && mlbActive ? (
            /* ── Gemini-generated image preview (MLB only) ── */
            <div className={styles.geminiPreview}>
              <div className={styles.geminiLabel}>✨ Gemini Generated · Single Slide</div>
              <div className={styles.geminiImageWrap} style={{ width: `${Math.round(1080 * previewScale)}px` }}>
                <img
                  src={`data:${geminiImage.mimeType};base64,${geminiImage.base64}`}
                  alt="Generated MLB IG card"
                  className={styles.geminiImage}
                  style={{ width: '100%', height: 'auto', borderRadius: '8px' }}
                />
              </div>
              <div className={styles.geminiActions}>
                <button className={styles.btnGemini} onClick={handleGeminiGenerate} disabled={geminiLoading}>
                  {geminiLoading ? '✨ Regenerating…' : '✨ Regenerate'}
                </button>
                <button className={styles.btnSecondary} onClick={() => setGeminiMode(false)}>
                  Standard Preview
                </button>
              </div>
            </div>
          ) : isWorking || (!mlbActive && !nbaActive && !dashData) ? (
            <div className={styles.skeletonRow}>
              {Array.from({ length: effectiveSlideCount }).map((_, i) => (
                <div
                  key={i}
                  className={styles.skeletonSlide}
                  style={{
                    width: `${Math.round(1080 * previewScale)}px`,
                    height: `${Math.round(1350 * previewScale)}px`,
                  }}
                />
              ))}
            </div>
          ) : (
            <CarouselComposer
              template={activeSection}
              slideCount={effectiveSlideCount}
              data={(() => {
                // NBA data path — route EVERYTHING through normalizeNbaImagePayload
                // so every slide and the caption consume the same canonical shape.
                // No hand-rolled payload construction.
                if (nbaActive) {
                  try {
                    const payload = normalizeNbaImagePayload({
                      activeSection,
                      nbaPicks,
                      nbaGames: [],
                      nbaLiveGames,
                      nbaWindowGames,
                      nbaSelectedTeam,
                      nbaChampOdds,
                      nbaStandings,
                      nbaLeaders,
                      nbaNews,
                    });
                    console.log('[NBA_CONTENT_STUDIO_PAYLOAD_CANONICAL]', {
                      section: payload.section,
                      heroTitle: payload.heroTitle?.slice(0, 80),
                      bulletCount: payload.bullets?.length || 0,
                      playoffRound: payload.nbaPlayoffContext?.round,
                      seriesCount: payload.nbaPlayoffContext?.series?.length || 0,
                      completedSeriesCount: payload.nbaPlayoffContext?.completedSeries?.length || 0,
                      outlookEastCount: payload.playoffOutlook?.east?.length || 0,
                      outlookWestCount: payload.playoffOutlook?.west?.length || 0,
                    });
                    // Slide 1 + Slide 2 must consume the same bullets array.
                    // Emit the canonical HOTP payload here once so both slides
                    // can never silently diverge.
                    console.log('[NBA_HOTP_PAYLOAD]', {
                      count: payload.bullets?.length || 0,
                      sources: (payload.bullets || []).map(b => b.source),
                      first: payload.bullets?.[0]?.text?.slice(0, 120),
                    });
                    // Postseason leaders sanity check — flags missing categories
                    // with the source classification so Slide 2's "Postseason
                    // feed updating" placeholder isn't a mystery.
                    const leaderCats = Object.keys(payload.nbaLeaders?.categories || {});
                    if (leaderCats.length < 5) {
                      console.warn('[NBA_POSTSEASON_LEADERS_INCOMPLETE]', {
                        source: payload.nbaLeaders?._source || payload.nbaLeaders?.seasonType || 'unknown',
                        present: leaderCats,
                        missingCount: 5 - leaderCats.length,
                      });
                    }
                    return payload;
                  } catch (err) {
                    console.error('[NBA_PAYLOAD_BUILD_FAILED]', err?.message || err);
                    // Fall back to raw fields so the slide's internal normalizer
                    // still has something to work with. Do NOT silently render
                    // NCAAM — the hard-fail guard in getSlides() catches template drift.
                    return {
                      nbaLiveGames: nbaLiveGames ?? [],
                      nbaPicks: nbaPicks ?? { categories: {} },
                      canonicalPicks: nbaPicks ?? { categories: {} },
                      nbaLeaders: nbaLeaders ?? { categories: {} },
                      nbaStandings: nbaStandings ?? {},
                      nbaChampOdds: nbaChampOdds ?? {},
                      nbaNews: nbaNews ?? [],
                      nbaSelectedTeam: nbaSelectedTeam ?? null,
                      games: [],
                    };
                  }
                }
                // MLB data path — includes briefing + championship odds
                if (mlbActive) {
                  return {
                    mlbGames,
                    mlbLiveGames,
                    mlbHeadlines,
                    mlbBriefing,
                    mlbChampOdds: mlbChampOdds ?? {},
                    mlbStandings: mlbStandings ?? {},
                    mlbLeaders: mlbLeaders ?? {},
                    mlbPicks: mlbPicks ?? {},
                    canonicalPicks: mlbPicks ?? {},
                    games: mlbGames,
                  };
                }
                // CBB data path (unchanged)
                let d = dashData;
                if (!d) return d;
                const enrichments = {};
                if (dailyChampOdds) enrichments.championshipOdds = dailyChampOdds;
                if (d.rankingsTop25) {
                  const rm = {};
                  for (const r of d.rankingsTop25) {
                    const name = r.teamName || r.name || r.team || '';
                    const rank = r.rank ?? r.ranking ?? null;
                    if (name && rank != null) {
                      const slug = getTeamSlug(name);
                      if (slug) rm[slug] = rank;
                    }
                  }
                  if (Object.keys(rm).length > 0) enrichments.rankMap = rm;
                }
                if (activeSection === 'daily' && dailyDigest) enrichments.chatDigest = dailyDigest;
                enrichments.picksGames = workingSlate ?? [];
                enrichments.canonicalPicks = canonicalPicks ?? { pickEmPicks: [], atsPicks: [], valuePicks: [], totalsPicks: [] };
                return Object.keys(enrichments).length > 0 ? { ...d, ...enrichments } : d;
              })()}
              teamData={
                nbaActive && nbaSelectedTeam ? { team: nbaSelectedTeam }
                  : mlbActive && mlbSelectedTeam ? { team: mlbSelectedTeam }
                  : enhancedTeamData
              }
              conferenceData={activeSection === 'conference' && selectedConference ? { conference: selectedConference } : null}
              selectedGame={mlbActive ? mlbSelectedGame : selectedGame}
              exportRef={exportRef}
              onAssetsReady={() => setAssetsReady(true)}
              options={options}
              previewScale={previewScale}
            />
          )}
        </section>
      </div>

      {/* ── Next Scheduled Post ─────────────────────────── */}
      <NextScheduledPost refreshKey={historyRefreshKey} />

      {/* ── Post History ──────────────────────────────── */}
      <PostHistory refreshKey={historyRefreshKey} />
    </div>
  );
}
