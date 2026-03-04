import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchHomeFast, fetchHomeSlow, mergeHomeData } from '../api/home';
import { fetchTeamPage } from '../api/team';
import { useAtsLeaders } from '../hooks/useAtsLeaders';
import { buildMaximusPicks } from '../utils/maximusPicksModel';
import { buildCaption, formatCaptionFile } from '../components/dashboard/captions/buildCaption';
import CarouselComposer from '../components/dashboard/CarouselComposer';
import { TEAMS } from '../data/teams';
import styles from './Dashboard.module.css';

const ADMIN_EMAIL = 'dantedicicco@gmail.com';

const TEMPLATES = [
  { id: 'daily',  label: 'Daily Briefing',  defaultSlides: 3 },
  { id: 'team',   label: 'Team Intel',       defaultSlides: 3 },
  { id: 'game',   label: 'Game Preview',     defaultSlides: 3 },
  { id: 'odds',   label: 'Odds Insights',    defaultSlides: 3 },
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

  // ── template / picker state ──────────────────────────────
  const [template, setTemplate] = useState('daily');
  const [slideCount, setSlideCount] = useState(3);
  const [teamSearch, setTeamSearch] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);

  // ── data state ───────────────────────────────────────────
  const [dashData, setDashData] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState(null);
  const [teamPageData, setTeamPageData] = useState(null);
  const [teamPageLoading, setTeamPageLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── export state ─────────────────────────────────────────
  const [assetsReady, setAssetsReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [zipping, setZipping] = useState(false);

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

  // ── load home data ───────────────────────────────────────
  const loadData = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      const [fast, slow] = await Promise.all([fetchHomeFast(), fetchHomeSlow()]);
      const merged = mergeHomeData(fast, slow);
      setDashData({ ...merged, atsLeaders: atsLeaders?.best?.length ? atsLeaders : merged.atsLeaders });
    } catch (err) {
      setDataError(err.message || 'Failed to load data');
    } finally {
      setDataLoading(false);
    }
  }, [atsLeaders]);

  useEffect(() => {
    if (isAuthorized) loadData();
  }, [isAuthorized, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── load team page when team selected ────────────────────
  useEffect(() => {
    if (!selectedTeam?.slug || template !== 'team') {
      setTeamPageData(null);
      return;
    }
    setTeamPageLoading(true);
    fetchTeamPage(selectedTeam.slug)
      .then(d => setTeamPageData(d))
      .catch(() => setTeamPageData(null))
      .finally(() => setTeamPageLoading(false));
  }, [selectedTeam, template]);

  // ── auto-select first game when template === game ─────────
  useEffect(() => {
    if (template === 'game' && dashData?.odds?.games?.length && !selectedGame) {
      const first = dashData.odds.games.find(g => g.spread != null || g.homeSpread != null || g.moneyline != null);
      setSelectedGame(first ?? dashData.odds.games[0] ?? null);
    }
  }, [template, dashData, selectedGame]);

  // ── sync slideCount when template changes ─────────────────
  useEffect(() => {
    const tmpl = TEMPLATES.find(t => t.id === template);
    if (tmpl) setSlideCount(tmpl.defaultSlides);
  }, [template]);

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

    const stats = {
      gamesWithOdds: (games.filter(g => g.spread != null || g.homeSpread != null)).length,
      rank: teamPageData?.rank ?? null,
      record: (teamPageData?.team?.record?.items?.[0]?.summary) ?? null,
      atsRecord: null,
    };

    return buildCaption({
      template,
      team: teamPageData?.team ?? selectedTeam,
      game: selectedGame,
      picks,
      stats,
      atsLeaders: atsL,
      headlines: dashData?.headlines ?? [],
      asOf,
    });
  }, [template, dashData, teamPageData, selectedTeam, selectedGame]);

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
      const slides = exportRef.current.querySelectorAll('[data-slide]');
      const prefix = `maximus_${template}`;
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
  }, [template]);

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
      const zip = new JSZip();
      const slides = exportRef.current.querySelectorAll('[data-slide]');
      const prefix = `maximus_${template}`;
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
  }, [template, caption]);

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

  const gamesForPicker = (dashData?.odds?.games ?? []).filter(g =>
    g.awayTeam && g.homeTeam
  );

  const isWorking = dataLoading || teamPageLoading;
  const canExport = !isWorking && !!dashData && (template !== 'team' || !!teamPageData);

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

        {/* ─── Left: Controls + Caption ─────────────── */}
        <aside className={styles.controls}>

          {/* Template selector */}
          <div className={styles.controlGroup}>
            <label className={styles.controlLabel}>Template</label>
            <div className={styles.selectWrap}>
              <select
                className={styles.select}
                value={template}
                onChange={e => { setTemplate(e.target.value); setAssetsReady(false); }}
              >
                {TEMPLATES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Slide count */}
          <div className={styles.controlGroup}>
            <label className={styles.controlLabel}>Slides</label>
            <div className={styles.chipGroup}>
              {[3, 4, 5].map(n => (
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

          {/* Team picker */}
          {template === 'team' && (
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
          )}

          {/* Game picker */}
          {template === 'game' && (
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

          {/* Action buttons */}
          <div className={styles.actionGroup}>
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
        </aside>

        {/* ─── Right: Slide previews ─────────────────── */}
        <section className={styles.previewArea}>
          {isWorking || !dashData ? (
            <div className={styles.skeletonRow}>
              {Array.from({ length: slideCount }).map((_, i) => (
                <div key={i} className={styles.skeletonSlide} />
              ))}
            </div>
          ) : (
            <CarouselComposer
              template={template}
              slideCount={slideCount}
              data={dashData}
              teamData={teamPageData}
              selectedGame={selectedGame}
              exportRef={exportRef}
              onAssetsReady={() => setAssetsReady(true)}
            />
          )}
        </section>
      </div>
    </div>
  );
}
