import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
import styles from './Dashboard.module.css';

const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

const PREVIEW_SCALES = { small: 0.25, medium: 0.35, large: 0.44 };

const ALL_SECTIONS = [
  { id: 'daily',      label: 'Daily Briefing',    icon: '📅',  requiredCap: null },
  { id: 'team',       label: 'Team Intel',         icon: '🏀',  requiredCap: 'teamIntel' },
  { id: 'conference', label: 'Conference Intel',    icon: '🏟️', requiredCap: 'conferenceIntel' },
  { id: 'game',       label: 'Game Insights',      icon: '📊',  requiredCap: 'games' },
  { id: 'picks',      label: "Maximus's Picks",    icon: '📈',  requiredCap: 'picks' },
  { id: 'videos',     label: 'Videos',             icon: '🎬',  requiredCap: null },
];

function getSectionsForWorkspace(workspaceConfig) {
  return ALL_SECTIONS.filter(sec =>
    sec.requiredCap === null || workspaceConfig.capabilities[sec.requiredCap],
  );
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
  const [studioWorkspaceId, setStudioWorkspaceId] = useState(WorkspaceId.CBB);
  const studioWorkspace = WORKSPACES[studioWorkspaceId] ?? WORKSPACES[WorkspaceId.CBB];
  const availableStudioWorkspaces = useMemo(
    () => (user ? getVisibleWorkspaces(user) : []),
    [user],
  );
  const isCbbStudio = studioWorkspaceId === WorkspaceId.CBB;

  // ── section / template state ────────────────────────────
  const [activeSection, setActiveSection] = useState('daily');

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

  // ── auto-select first game when section === game ──────────
  useEffect(() => {
    if (activeSection === 'game' && dashData?.odds?.games?.length && !selectedGame) {
      const first = dashData.odds.games.find(g => g.spread != null || g.homeSpread != null || g.moneyline != null);
      setSelectedGame(first ?? dashData.odds.games[0] ?? null);
    }
  }, [activeSection, dashData, selectedGame]);

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
    return buildActivePicksGames({
      todayScores: dashData.scores ?? [],
      oddsGames: dashData.odds?.games ?? [],
      upcomingGamesWithSpreads: dashData.upcomingGamesWithSpreads ?? [],
      getSlug: getTeamSlug,
      mergeWithOdds: mergeGamesWithOdds,
    });
  }, [dashData]);

  // ── Canonical picks result: ONE model call, shared by slide + caption ──
  const canonicalPicks = useMemo(() => {
    if (!canonicalPicksGames.length) return { pickEmPicks: [], atsPicks: [], valuePicks: [], totalsPicks: [] };
    const atsL = dashData?.atsLeaders ?? { best: [], worst: [] };
    const rm = dashData?.rankMap ?? {};
    const co = dashData?.championshipOdds ?? {};
    try {
      return buildMaximusPicks({ games: canonicalPicksGames, atsLeaders: atsL, rankMap: rm, championshipOdds: co });
    } catch { return { pickEmPicks: [], atsPicks: [], valuePicks: [], totalsPicks: [] }; }
  }, [canonicalPicksGames, dashData]);

  // ── Deduped top leans: exact same rows the slide card renders ──
  const dedupedTopLeans = (arr, n = 3) => {
    const leans = arr.filter(x => x.itemType === 'lean')
      .sort((a, b) => (b.confidence - a.confidence) || (b.edgeMag - a.edgeMag));
    const seen = new Set();
    const result = [];
    for (const pick of leans) {
      if (result.length >= n) break;
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

  const canonicalRenderedPicks = useMemo(() => [
    ...dedupedTopLeans(canonicalPicks.pickEmPicks ?? []),
    ...dedupedTopLeans(canonicalPicks.atsPicks ?? []),
    ...dedupedTopLeans(canonicalPicks.valuePicks ?? []),
    ...dedupedTopLeans(canonicalPicks.totalsPicks ?? []),
  ], [canonicalPicks]);

  // ── compute caption ───────────────────────────────────────
  const caption = useMemo(() => {
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
      gamesWithOdds: (games.filter(g => g.spread != null || g.homeSpread != null)).length,
      rank: enhancedTeamData?.rank ?? null,
      record: (enhancedTeamData?.team?.record?.items?.[0]?.summary) ?? null,
      atsRecord,
    };

    return buildCaption({
      template: activeSection,
      team: enhancedTeamData?.team ?? selectedTeam,
      game: selectedGame,
      picks,
      stats,
      atsLeaders: atsL,
      headlines: dashData?.headlines ?? [],
      asOf,
      styleMode: activeSection === 'daily' ? dailyStyleMode : 'generic',
      chatDigest: activeSection === 'daily' ? dailyDigest : null,
      nextGame: activeSection === 'team' ? (enhancedTeamData?.nextLine?.nextEvent ?? null) : null,
      conference: activeSection === 'conference' ? selectedConference : null,
      tournamentInsights: activeSection === 'game' ? (tournamentInsightsData ?? null) : null,
    });
  }, [activeSection, dashData, teamPageData, selectedTeam, selectedGame, dailyStyleMode, dailyDigest, selectedConference, tournamentInsightsData]);

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
    setRefreshKey(k => k + 1);
  };

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

  const gamesForPicker = (dashData?.odds?.games ?? []).filter(g => g.awayTeam && g.homeTeam);
  const isWorking = dataLoading || teamPageLoading;
  const canExport = !isWorking && !!dashData && (activeSection !== 'team' || !!enhancedTeamData) && (activeSection !== 'conference' || !!selectedConference);
  const previewScale = PREVIEW_SCALES[previewSize] || PREVIEW_SCALES.medium;

  const options = {
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
                    setActiveSection('daily');
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
          <div className={styles.sectionTabs}>
            {getSectionsForWorkspace(studioWorkspace).map(sec => (
              <button
                key={sec.id}
                className={`${styles.sectionTab} ${activeSection === sec.id ? styles.sectionTabActive : ''}`}
                onClick={() => {
                  setActiveSection(sec.id);
                  setAssetsReady(false);
                }}
              >
                <span className={styles.tabIcon}>{sec.icon}</span>
                <span className={styles.tabLabel}>{sec.label}</span>
              </button>
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

          {/* Error */}
          {dataError && (
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
            <button className={styles.btnSecondary} onClick={handleRegenerate} disabled={isWorking || exporting || zipping}>
              {dataLoading ? 'Loading…' : 'Regenerate'}
            </button>
            <button className={styles.btnPrimary} onClick={handleExport} disabled={!canExport || exporting || zipping}>
              {exporting ? 'Exporting…' : 'Export PNGs'}
            </button>
            <button className={styles.btnSecondary} onClick={handleDownloadZip} disabled={!canExport || exporting || zipping}>
              {zipping ? 'Zipping…' : 'Download ZIP'}
            </button>
            <div className={styles.publishDivider} />
            <InstagramPublishButton
              exportRef={exportRef}
              caption={caption}
              canPublish={canExport && !exporting && !zipping}
              metadata={publishMetadata}
              onSuccess={handlePublishSuccess}
              template={activeSection}
            />
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
          {caption && activeSection !== 'team' && (
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
          ) : isWorking || !dashData ? (
            <div className={styles.skeletonRow}>
              {Array.from({ length: slideCount }).map((_, i) => (
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
              slideCount={slideCount}
              data={(() => {
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
                enrichments.picksGames = canonicalPicksGames;
                return Object.keys(enrichments).length > 0 ? { ...d, ...enrichments } : d;
              })()}
              teamData={enhancedTeamData}
              conferenceData={activeSection === 'conference' && selectedConference ? { conference: selectedConference } : null}
              selectedGame={selectedGame}
              exportRef={exportRef}
              onAssetsReady={() => setAssetsReady(true)}
              options={options}
              previewScale={previewScale}
            />
          )}
        </section>
      </div>

      {/* ── Post History ──────────────────────────────── */}
      <PostHistory refreshKey={historyRefreshKey} />
    </div>
  );
}
