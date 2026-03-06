import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchHomeFast, fetchHomeSlow, mergeHomeData } from '../api/home';
import { fetchTeamPage } from '../api/team';
import { fetchTeamNextLine } from '../api/teamNextLine';
import { fetchAtsLeaders, fetchAtsRefresh } from '../api/atsLeaders';
import { useAtsLeaders } from '../hooks/useAtsLeaders';
import { fetchChampionshipOdds } from '../api/championshipOdds';
import { buildMaximusPicks } from '../utils/maximusPicksModel';
import { buildCaption, formatCaptionFile } from '../components/dashboard/captions/buildCaption';
import { buildDailyBriefingDigest } from '../utils/chatbotDigest';
import { computeAtsFromScheduleAndHistory } from '../components/team/MaximusInsight';
import { buildTeamSnapshot } from '../utils/teamSnapshot';
import CarouselComposer from '../components/dashboard/CarouselComposer';
import TagSuggestionsPanel from '../components/dashboard/tags/TagSuggestionsPanel';
import { waitForImages } from '../components/dashboard/utils/exportReady';
import { TEAMS } from '../data/teams';
import { getTeamSlug } from '../utils/teamSlug';
import styles from './Dashboard.module.css';

const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

const PREVIEW_SCALES = { small: 0.25, medium: 0.35, large: 0.44 };

const ADMIN_EMAIL = 'dantedicicco@gmail.com';

const SECTIONS = [
  { id: 'daily', label: 'Daily Briefing', icon: '📅' },
  { id: 'team',  label: 'Team Intel',     icon: '🏀' },
  { id: 'game',  label: 'Game Insights',  icon: '📊' },
  { id: 'odds',  label: 'Odds Insights',  icon: '📈' },
];

function gameLabel(g) {
  if (!g) return '';
  const spread = g.homeSpread ?? g.spread;
  const spreadStr = spread != null ? ` (${parseFloat(spread) > 0 ? '+' : ''}${parseFloat(spread)})` : '';
  const time = g.time ? ` · ${g.time}` : '';
  return `${g.awayTeam || '?'} @ ${g.homeTeam || '?'}${spreadStr}${time}`;
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const isAuthorized = !authLoading && user?.email === ADMIN_EMAIL;
  const isUnauthorized = !authLoading && (!user || user.email !== ADMIN_EMAIL);

  // ── section / template state ────────────────────────────
  const [activeSection, setActiveSection] = useState('daily');

  // ── section-specific options ─────────────────────────────
  const [dailyStyleMode, setDailyStyleMode] = useState('generic');
  const [includeHeadlines, setIncludeHeadlines] = useState(true);
  const [gameAngle, setGameAngle] = useState('value');
  const [picksMode, setPicksMode] = useState('top3');
  const [riskMode, setRiskMode] = useState('standard');

  // ── slide count (per section default) ────────────────────
  const SECTION_SLIDE_DEFAULTS = { daily: 5, team: 3, game: 3, odds: 3 };
  const SECTION_SLIDE_MAX = { daily: 5, team: 3, game: 3, odds: 4 };
  const [slideCount, setSlideCount] = useState(SECTION_SLIDE_DEFAULTS.daily);

  // ── picker state ──────────────────────────────────────────
  const [teamSearch, setTeamSearch] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);
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
  const [refreshKey, setRefreshKey] = useState(0);

  // ── export state ─────────────────────────────────────────
  const [assetsReady, setAssetsReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [zipping, setZipping] = useState(false);

  // ── preview size ──────────────────────────────────────────
  const [previewSize, setPreviewSize] = useState(() => {
    try { return localStorage.getItem('maximus_preview_size') || 'medium'; } catch { return 'medium'; }
  });

  // ── caption state ────────────────────────────────────────
  const [captionTab, setCaptionTab] = useState('short');
  const [copied, setCopied] = useState(false);

  const exportRef = useRef(null);
  const { atsLeaders } = useAtsLeaders({ initialWindow: 'last30' });

  // ── team search filter ───────────────────────────────────
  const filteredTeams = useMemo(() => {
    if (!teamSearch.trim()) return TEAMS.slice(0, 20);
    const q = teamSearch.toLowerCase();
    return TEAMS.filter(t => t.name.toLowerCase().includes(q)).slice(0, 12);
  }, [teamSearch]);

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
      headlines:       dashData?.headlines ?? [],
      picks,
      atsLeaders:      atsL,
      scoresYesterday: dashData?.scoresYesterday ?? [],
      scores:          dashData?.scores ?? [],
      rankingsTop25:   dashData?.rankingsTop25 ?? [],
    });
  }, [dashData, chatSummary, chatStatus]);

  // ── compute caption ───────────────────────────────────────
  const caption = useMemo(() => {
    if (!dashData) return null;
    const games = dashData?.odds?.games ?? [];
    const atsL = dashData?.atsLeaders ?? { best: [], worst: [] };
    let picks = [];
    try {
      const p = buildMaximusPicks({ games, atsLeaders: atsL });
      picks = [...(p.atsPicks ?? []), ...(p.mlPicks ?? [])].slice(0, 3);
    } catch { /* ignore */ }

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
      // Pass digest for richer daily caption
      chatDigest: activeSection === 'daily' ? dailyDigest : null,
    });
  }, [activeSection, dashData, teamPageData, selectedTeam, selectedGame, dailyStyleMode, dailyDigest]);

  // ── regenerate ────────────────────────────────────────────
  const handleRegenerate = () => {
    setAssetsReady(false);
    setRefreshKey(k => k + 1);
  };

  // ── export PNGs ───────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!exportRef.current) return;
    setExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      await document.fonts.ready;
      await waitForImages(exportRef.current);
      const slides = exportRef.current.querySelectorAll('[data-slide]');
      const prefix = `maximus_${activeSection}`;
      let idx = 1;
      for (const slide of slides) {
        const dataUrl = await toPng(slide, {
          width: 1080, height: 1350, pixelRatio: 1, skipAutoScale: true, cacheBust: true,
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
      setExporting(false);
    }
  }, [activeSection]);

  // ── download ZIP ──────────────────────────────────────────
  const handleDownloadZip = useCallback(async () => {
    if (!exportRef.current) return;
    setZipping(true);
    try {
      const [{ toPng }, JSZip] = await Promise.all([
        import('html-to-image'),
        import('jszip').then(m => m.default),
      ]);
      await document.fonts.ready;
      await waitForImages(exportRef.current);
      const zip = new JSZip();
      const slides = exportRef.current.querySelectorAll('[data-slide]');
      const prefix = `maximus_${activeSection}`;
      let idx = 1;
      for (const slide of slides) {
        const dataUrl = await toPng(slide, {
          width: 1080, height: 1350, pixelRatio: 1, skipAutoScale: true, cacheBust: true,
        });
        const base64 = dataUrl.split(',')[1];
        zip.file(`${prefix}_${idx}.png`, base64, { base64: true });
        idx++;
      }
      if (caption) {
        zip.file('caption.txt', formatCaptionFile(caption));
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
      setZipping(false);
    }
  }, [activeSection, caption]);

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

  // ── derive tag context from selected game ─────────────────
  const gameTagContext = useMemo(() => {
    if (!selectedGame) return {};
    return {
      awaySlug: getTeamSlug(selectedGame.awayTeam),
      homeSlug: getTeamSlug(selectedGame.homeTeam),
    };
  }, [selectedGame]);

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
  const canExport = !isWorking && !!dashData && (activeSection !== 'team' || !!enhancedTeamData);
  const previewScale = PREVIEW_SCALES[previewSize] || PREVIEW_SCALES.medium;

  const options = {
    styleMode: activeSection === 'daily' ? dailyStyleMode : 'generic',
    riskMode,
    picksMode,
    gameAngle,
    includeHeadlines,
    slideCount,
  };

  return (
    <div className={styles.root}>
      {/* ── Page header ──────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <h1 className={styles.pageTitle}>Social Content Studio</h1>
          <span className={styles.adminBadge}>Admin Only</span>
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
            {SECTIONS.map(sec => (
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
                <div className={styles.teamPickerWrap}>
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Search teams…"
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

          {/* ─── Game Insights controls ────────────────── */}
          {activeSection === 'game' && (
            <div className={styles.sectionControls}>
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
            </div>
          )}

          {/* ─── Odds Insights controls ────────────────── */}
          {activeSection === 'odds' && (
            <div className={styles.sectionControls}>
              <div className={styles.controlGroup}>
                <label className={styles.controlLabel}>Picks focus</label>
                <div className={styles.chipGroup}>
                  {[
                    { id: 'top3', label: 'Top 3' },
                    { id: 'full', label: 'Full card' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      className={`${styles.chip} ${picksMode === opt.id ? styles.chipActive : ''}`}
                      onClick={() => { setPicksMode(opt.id); setAssetsReady(false); }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.controlGroup}>
                <label className={styles.controlLabel}>Risk mode</label>
                <div className={styles.chipGroup}>
                  {[
                    { id: 'standard', label: 'Standard' },
                    { id: 'conservative', label: 'Conservative' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      className={`${styles.chip} ${riskMode === opt.id ? styles.chipActive : ''}`}
                      onClick={() => { setRiskMode(opt.id); setAssetsReady(false); }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.controlGroup}>
                <label className={styles.controlLabel}>Slides</label>
                <div className={styles.chipGroup}>
                  {[3, 4].map(n => (
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
                      try { localStorage.setItem('maximus_preview_size', size); } catch {}
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
          </div>

          {/* Caption panel */}
          {caption && (
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
            conference={selectedTeam?.conference}
            awaySlug={gameTagContext.awaySlug}
            homeSlug={gameTagContext.homeSlug}
          />

        </aside>

        {/* ─── Right: Slide previews ─────────────────── */}
        <section className={styles.previewArea}>
          {isWorking || !dashData ? (
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
              data={activeSection === 'daily' && dailyDigest ? { ...dashData, chatDigest: dailyDigest } : dashData}
              teamData={enhancedTeamData}
              selectedGame={selectedGame}
              exportRef={exportRef}
              onAssetsReady={() => setAssetsReady(true)}
              options={options}
              previewScale={previewScale}
            />
          )}
        </section>
      </div>
    </div>
  );
}
