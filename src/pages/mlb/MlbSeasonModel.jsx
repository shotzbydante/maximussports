/**
 * MLB Season Model — v7 premium intelligence dashboard.
 *
 * v7 upgrades:
 *   - Removed redundant summary rail (concepts folded into Model Insights)
 *   - Clickable insight cards → scroll to team + expand
 *   - Expanded rows restructured as mini research briefs
 *   - Value-framing tags on insight cards
 *   - 7 insight types including Top Projection + Highest Confidence
 */
import { useState, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { getMlbEspnLogoUrl } from '../../utils/espnMlbLogos';
import MaximusModelIcon from '../../components/mlb/MaximusModelIcon';
import ModelStageIcon from '../../components/mlb/ModelStageIcon';
import ModelInsights from '../../components/mlb/ModelInsights';
import { MODEL_META } from '../../data/mlb/seasonModelMeta';
import {
  getSeasonProjections, sortTeams, filterTeams,
  SORT_OPTIONS,
} from '../../data/mlb/seasonModel';
import styles from './MlbSeasonModel.module.css';

const BADGE_CLS = {
  'Stable Contender': 'bGreen', 'Market Favorite': 'bNavy', 'Model Overweight': 'bTeal',
  'Quiet Value': 'bTeal', 'Rotation-Led': 'bNavy', 'Balanced Depth': 'bGreen',
  'Fragile Upside': 'bAmber', 'High Variance': 'bAmber', 'Bullpen Risk': 'bAmber',
  'Top-Heavy': 'bAmber', 'Division Grinder': 'bDefault', 'Volatile Middle': 'bDefault',
  'Prospect Rich': 'bTeal', 'Rebuild Watch': 'bRed', 'Developing': 'bDefault',
};

const LEAGUE_LOGOS = { AL: '/al-logo.png', NL: '/nl-logo.png' };

/** Team primary colors for left-accent treatment. */
const TEAM_COLORS = {
  nyy: '#003087', bos: '#BD3039', tor: '#134A8E', tb: '#092C5C', bal: '#DF4601',
  cle: '#00385D', min: '#002B5C', det: '#0C2340', cws: '#27251F', kc: '#004687',
  hou: '#002D62', laa: '#BA0021', sea: '#0C2C56', tex: '#003278', oak: '#003831',
  lad: '#005A9C', sd: '#2F241D', sf: '#FD5A1E', ari: '#A71930', col: '#33006F',
  atl: '#CE1141', nym: '#002D72', phi: '#E81828', was: '#AB0003', mia: '#00A3E0',
  mil: '#FFC52F', chc: '#0E3386', stl: '#C41E3A', cin: '#C6011F', pit: '#FDB827',
};

function LeagueLogo({ league, size = 28 }) {
  const src = LEAGUE_LOGOS[league];
  if (src) {
    return <img src={src} alt={league === 'AL' ? 'American League' : 'National League'}
      width={size} height={size} style={{ objectFit: 'contain' }} loading="lazy" />;
  }
  return null;
}

function getDriverPreview(decomp) {
  if (!decomp?.length) return [];
  return decomp
    .filter(d => !['Baseline', 'Market Blend', 'Trend'].includes(d.label))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 2);
}

/** Render a single team row with research-drawer expansion. */
function TeamRow({ team, idx, open, toggle, buildPath, highlight, accentColor }) {
  const logo = getMlbEspnLogoUrl(team.slug);
  const dCls = team.marketDelta > 0 ? styles.up : team.marketDelta < 0 ? styles.dn : '';
  const tk = team.takeaways || {};
  const drivers = getDriverPreview(team.decomposition);

  return (
    <article
      className={`${styles.card} ${open ? styles.cardOpen : ''} ${highlight ? styles.cardHighlight : ''}`}
      data-team-slug={team.slug}
      style={accentColor ? { '--team-accent': accentColor } : undefined}
    >
      <div className={styles.row}>
        {/* Layer 1: Identity + Projection */}
        <div className={styles.rowHeader}>
          <span className={styles.rank}>{idx + 1}</span>
          <div className={styles.ident}>
            {logo
              ? <img src={logo} alt="" className={styles.logo} width={34} height={34} loading="lazy" />
              : <span className={styles.logoFb}>{team.abbrev}</span>}
            <div className={styles.identText}>
              <Link to={buildPath(`/teams/${team.slug}`)} className={styles.name}>{team.name}</Link>
              <span className={styles.divLabel}>{team.division}</span>
            </div>
          </div>
          <div className={styles.projCol}>
            <span className={styles.projNum}>{team.projectedWins}</span>
            <span className={styles.projLabel}>proj. wins</span>
          </div>
        </div>

        {/* Layer 2: Supporting Stats */}
        <div className={styles.rowStats}>
          <div className={styles.statCol}>
            <span className={styles.statVal}>{team.floor}–{team.ceiling}</span>
            <span className={styles.statLbl}>range</span>
          </div>
          <div className={styles.statCol}>
            <span className={styles.statVal}>{team.champOdds}</span>
            <span className={styles.statLbl}>WS odds</span>
          </div>
          <div className={styles.statCol}>
            <span className={styles.statVal}>{team.playoffProb ?? '—'}%</span>
            <span className={styles.statLbl}>playoff</span>
          </div>
          <div className={styles.statCol}>
            <span className={`${styles.statVal} ${dCls}`}>
              {team.marketDelta > 0 ? '+' : ''}{team.marketDelta}
            </span>
            <span className={styles.statLbl}>vs mkt</span>
          </div>
        </div>

        {/* Layer 3: Signals + Badges */}
        <div className={styles.rowSignals}>
          <div className={styles.signalCol}>
            <div className={styles.badges}>
              {team.signals?.map(s => (
                <span key={s} className={`${styles.badge} ${styles[BADGE_CLS[s]] || styles.bDefault}`}>{s}</span>
              ))}
            </div>
            {drivers.length > 0 && (
              <div className={styles.driverPreview}>
                {drivers.map(d => (
                  <span key={d.label} className={`${styles.driver} ${d.value > 0 ? styles.up : styles.dn}`}>
                    {d.label} {d.value > 0 ? '+' : ''}{d.value}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Expand control */}
        <button type="button" className={styles.expandBtn}
          onClick={() => toggle(team.slug)} aria-label="Expand detail">
          <span className={`${styles.caret} ${open ? styles.caretOpen : ''}`}>&#9662;</span>
        </button>
      </div>

      {/* ── Research Drawer ── */}
      {open && (
        <div className={styles.detail}>
          {/* Outlook */}
          <div className={styles.detailSection}>
            <h5 className={styles.detailSectionTitle}>Outlook</h5>
            <div className={styles.detailStats}>
              <div className={styles.dCell}><span className={styles.dLbl}>Market Line</span><span className={styles.dVal}>{team.marketWinTotal ?? '—'}</span></div>
              <div className={styles.dCell}><span className={styles.dLbl}>Division</span><span className={styles.dVal}>{team.divOutlook}</span></div>
              <div className={styles.dCell}><span className={styles.dLbl}>Confidence</span><span className={styles.dVal}>{team.confidenceTier} ({team.confidenceScore}%)</span></div>
              <div className={styles.dCell}><span className={styles.dLbl}>Manager</span><span className={styles.dVal}>{team.manager}</span></div>
            </div>
          </div>

          {/* Key Drivers */}
          <div className={styles.detailSection}>
            <h5 className={styles.detailSectionTitle}>Key Drivers</h5>
            <div className={styles.tkRow}>
              <span className={styles.tkItem}><b>Strongest:</b> {tk.strongestDriver}</span>
              <span className={styles.tkItem}><b>Drag:</b> {tk.biggestDrag}</span>
              <span className={styles.tkItem}><b>Depth:</b> {tk.depthProfile}</span>
              <span className={styles.tkItem}><b>Risk:</b> {tk.riskProfile}</span>
              <span className={styles.tkItem}><b>Market:</b> {tk.marketStance}</span>
            </div>
          </div>

          {/* Projection Breakdown */}
          {team.decomposition?.length > 0 && (
            <div className={styles.detailSection}>
              <h5 className={styles.detailSectionTitle}>
                <MaximusModelIcon size={11} /> Projection Breakdown
              </h5>
              <div className={styles.decompGrid}>
                {team.decomposition.map(d => (
                  <div key={d.label} className={styles.decompItem}>
                    <span className={styles.decompLabel}>{d.label}</span>
                    <span className={`${styles.decompVal} ${d.value > 0 ? styles.up : d.value < 0 ? styles.dn : ''}`}>
                      {d.value > 0 ? '+' : ''}{d.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analyst Note */}
          <div className={styles.detailSection}>
            <h5 className={styles.detailSectionTitle}>Analyst Note</h5>
            <p className={styles.rationale}>{team.rationale}</p>
          </div>

          <Link to={buildPath(`/teams/${team.slug}`)} className={styles.teamCta}>
            View Full Team Intel &rarr;
          </Link>
        </div>
      )}
    </article>
  );
}

export default function MlbSeasonModel() {
  const { buildPath } = useWorkspace();
  const allTeams = useMemo(() => getSeasonProjections(), []);
  const [sort, setSort] = useState('wins-desc');
  const [viewMode, setViewMode] = useState('league');
  const [expanded, setExpanded] = useState(new Set());
  const [methExpanded, setMethExpanded] = useState(false);
  const [highlightSlug, setHighlightSlug] = useState(null);
  const [leagueCollapsed, setLeagueCollapsed] = useState({});
  const boardRef = useRef(null);

  const toggleLeague = (league) => setLeagueCollapsed(prev => ({
    ...prev, [league]: !prev[league],
  }));

  const toggle = (slug) => setExpanded(prev => {
    const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n;
  });

  const handleInsightClick = useCallback((slug) => {
    // Expand the team row
    setExpanded(prev => {
      const n = new Set(prev);
      n.add(slug);
      return n;
    });
    // Highlight briefly
    setHighlightSlug(slug);
    setTimeout(() => setHighlightSlug(null), 2000);
    // Scroll to team after a tick (to allow expansion to render)
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-team-slug="${slug}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }, []);

  const alTeams = useMemo(() => sortTeams(filterTeams(allTeams, { league: 'AL' }), sort), [allTeams, sort]);
  const nlTeams = useMemo(() => sortTeams(filterTeams(allTeams, { league: 'NL' }), sort), [allTeams, sort]);

  const groupByDiv = (teams) => {
    const divs = {};
    teams.forEach(t => {
      if (!divs[t.division]) divs[t.division] = [];
      divs[t.division].push(t);
    });
    const order = ['East', 'Central', 'West'];
    return Object.entries(divs)
      .sort(([a], [b]) => {
        const ai = order.findIndex(o => a.includes(o));
        const bi = order.findIndex(o => b.includes(o));
        return ai - bi;
      })
      .map(([div, teams]) => ({ division: div, teams: sortTeams(teams, sort) }));
  };

  const alDivisions = useMemo(() => groupByDiv(alTeams), [alTeams, sort]);
  const nlDivisions = useMemo(() => groupByDiv(nlTeams), [nlTeams, sort]);

  const allSorted = useMemo(() => sortTeams(allTeams, sort), [allTeams, sort]);
  const rankMap = useMemo(() => {
    const m = {};
    allSorted.forEach((t, i) => { m[t.slug] = i + 1; });
    return m;
  }, [allSorted]);

  const renderTeam = (team) => (
    <TeamRow key={team.slug} team={team} idx={rankMap[team.slug] - 1}
      open={expanded.has(team.slug)} toggle={toggle} buildPath={buildPath}
      highlight={highlightSlug === team.slug}
      accentColor={TEAM_COLORS[team.slug]} />
  );

  return (
    <div className={styles.page}>
      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroEyebrowRow}>
            <MaximusModelIcon size={15} className={styles.heroIcon} />
            <span className={styles.eyebrow}>2026 Season Model &middot; v{MODEL_META.version}</span>
          </div>
          <h1 className={styles.heroTitle}>MLB Season Wins Intelligence</h1>
          <p className={styles.heroBody}>
            Projected win totals for all 30 teams — built from historical baselines,
            roster composition, pitching depth, bullpen quality, manager track records,
            division difficulty, and market priors.
          </p>
        </div>
      </section>

      {/* ── Methodology ── */}
      <section className={styles.meth}>
        <div className={styles.methPreview}>
          <div className={styles.methPreviewHead}>
            <MaximusModelIcon size={14} className={styles.methIcon} />
            <span className={styles.methTitle}>How the Maximus Model Works</span>
          </div>
          <p className={styles.methSummary}>{MODEL_META.objective}</p>
          <div className={styles.stageGrid}>
            {MODEL_META.stages.map(s => (
              <div key={s.name} className={styles.stageCard}>
                <span className={styles.stageIconWrap}>
                  <ModelStageIcon stage={s.name} size={16} className={styles.stageIcon} />
                </span>
                <span className={styles.stageName}>{s.name}</span>
                <span className={styles.stagePct}>{Math.round(s.weight * 100)}%</span>
              </div>
            ))}
          </div>
          <div className={styles.methSourceRow}>
            {MODEL_META.sources.slice(0, 4).map(s => (
              <span key={s.name} className={styles.methSourceChip}>{s.name}</span>
            ))}
            {MODEL_META.sources.length > 4 && (
              <span className={styles.methSourceChip}>+{MODEL_META.sources.length - 4} more</span>
            )}
          </div>
          <div className={styles.methFooter}>
            <button type="button" className={styles.methExpandBtn}
              onClick={() => setMethExpanded(v => !v)}>
              {methExpanded ? 'Collapse methodology' : 'View full methodology'}
              <span className={`${styles.methCaret} ${methExpanded ? styles.methCaretOpen : ''}`}>&#9662;</span>
            </button>
          </div>
        </div>
        {methExpanded && (
          <div className={styles.methFull}>
            <div className={styles.methStages}>
              <h3 className={styles.methH3}>Model Stages</h3>
              <div className={styles.methStageGrid}>
                {MODEL_META.stages.map(s => (
                  <div key={s.name} className={styles.methStageCard}>
                    <div className={styles.methStageHead}>
                      <span className={styles.stageIconWrap}>
                        <ModelStageIcon stage={s.name} size={14} className={styles.methStageIco} />
                      </span>
                      <span className={styles.methStageLabel}>{s.name}</span>
                      <span className={styles.methStagePct}>{Math.round(s.weight * 100)}%</span>
                    </div>
                    <p className={styles.methStageDesc}>{s.description}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.methInputs}>
              <h3 className={styles.methH3}>Input Groups</h3>
              <div className={styles.methInputGrid}>
                {MODEL_META.inputGroups.map(g => (
                  <div key={g.name} className={styles.methInputCard}>
                    <h4 className={styles.methInputTitle}>{g.name}</h4>
                    <ul className={styles.methInputList}>
                      {g.inputs.map(i => <li key={i}>{i}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.methAllSources}>
              <h3 className={styles.methH3}>Data Sources</h3>
              <div className={styles.methSourceRow}>
                {MODEL_META.sources.map(s => (
                  <span key={s.name} className={`${styles.methSourceChip} ${s.status === 'live' ? styles.methSourceLive : ''}`}>
                    <span className={styles.methSourceDot} /> {s.name}
                  </span>
                ))}
              </div>
              <p className={styles.methNote}>{MODEL_META.futureNote}</p>
            </div>
            <p className={styles.methDisclaimer}>{MODEL_META.disclaimer}</p>
          </div>
        )}
      </section>

      {/* ── Controls ── */}
      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <label className={styles.controlLabel}>View</label>
          <div className={styles.pillRow}>
            <button type="button"
              className={`${styles.pill} ${viewMode === 'league' ? styles.pillActive : ''}`}
              onClick={() => setViewMode('league')}>League</button>
            <button type="button"
              className={`${styles.pill} ${viewMode === 'division' ? styles.pillActive : ''}`}
              onClick={() => setViewMode('division')}>Division</button>
          </div>
        </div>
        <div className={styles.controlGroup}>
          <label className={styles.controlLabel}>Sort</label>
          <select className={styles.sortSelect} value={sort}
            onChange={e => setSort(e.target.value)}>
            {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Model Insights (replaces old summary rail) ── */}
      <ModelInsights teams={allTeams} onTeamClick={handleInsightClick} />

      {/* ── Team Board: AL / NL split ── */}
      <div className={styles.leagueBoard} ref={boardRef}>
        {[
          { key: 'AL', label: 'American League', teams: alTeams, divs: alDivisions },
          { key: 'NL', label: 'National League', teams: nlTeams, divs: nlDivisions },
        ].map(lg => {
          const collapsed = !!leagueCollapsed[lg.key];
          return (
            <div key={lg.key} className={styles.leagueCol}>
              <button type="button" className={styles.leagueHeader}
                onClick={() => toggleLeague(lg.key)}>
                <LeagueLogo league={lg.key} size={30} />
                <span className={styles.leagueTitle}>{lg.label}</span>
                <span className={styles.leagueCount}>{lg.teams.length} teams</span>
                <span className={`${styles.leagueCaret} ${collapsed ? '' : styles.leagueCaretOpen}`}>&#9662;</span>
              </button>
              {!collapsed && (
                viewMode === 'league' ? (
                  <div className={styles.board}>{lg.teams.map(renderTeam)}</div>
                ) : (
                  lg.divs.map(dg => (
                    <div key={dg.division} className={styles.divGroup}>
                      <h4 className={styles.divGroupTitle}>{dg.division}</h4>
                      <div className={styles.board}>{dg.teams.map(renderTeam)}</div>
                    </div>
                  ))
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
