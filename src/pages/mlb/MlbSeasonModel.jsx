/**
 * MLB Season Model — v6 premium intelligence dashboard.
 *
 * v6 upgrades:
 *   - Glassy methodology module with custom stage icons + % grid
 *   - AL/NL two-column filtering framework (League View / Division View)
 *   - Dark red / navy / white baseball palette (no light blue accents)
 *   - Better mobile real-estate in methodology expanded state
 *   - Preserved all model substance and expanded detail
 */
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { getMlbEspnLogoUrl } from '../../utils/espnMlbLogos';
import MaximusModelIcon from '../../components/mlb/MaximusModelIcon';
import ModelStageIcon from '../../components/mlb/ModelStageIcon';
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

const LeagueLogo = ({ league, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
    <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.6" opacity="0.55" />
    <text x="10" y="14.5" textAnchor="middle" fontSize="8.5" fontWeight="800"
      fill="currentColor" fontFamily="system-ui">{league}</text>
  </svg>
);

function deriveSummary(teams) {
  if (!teams.length) return [];
  const sorted = [...teams].sort((a, b) => b.projectedWins - a.projectedWins);
  const byDelta = [...teams].sort((a, b) => (b.marketDelta || 0) - (a.marketDelta || 0));
  const byRange = [...teams].sort((a, b) => (b.ceiling - b.floor) - (a.ceiling - a.floor));
  const byFloor = [...teams].sort((a, b) => b.floor - a.floor);
  const byConf = [...teams].sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
  return [
    { label: 'Top Projection', team: sorted[0].name, value: `${sorted[0].projectedWins}W`, color: 'accent' },
    { label: 'Best Value Gap', team: byDelta[0].name, value: `+${byDelta[0].marketDelta}`, color: 'green' },
    { label: 'Most Volatile', team: byRange[0].name, value: `${byRange[0].floor}–${byRange[0].ceiling}`, color: 'amber' },
    { label: 'Strongest Floor', team: byFloor[0].name, value: `${byFloor[0].floor}W floor`, color: 'green' },
    { label: 'Highest Confidence', team: byConf[0].name, value: byConf[0].confidenceTier, color: 'accent' },
  ];
}

function getDriverPreview(decomp) {
  if (!decomp?.length) return [];
  return decomp
    .filter(d => !['Baseline', 'Market Blend', 'Trend'].includes(d.label))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 2);
}

/** Render a single team row. */
function TeamRow({ team, idx, open, toggle, buildPath }) {
  const logo = getMlbEspnLogoUrl(team.slug);
  const dCls = team.marketDelta > 0 ? styles.up : team.marketDelta < 0 ? styles.dn : '';
  const tk = team.takeaways || {};
  const drivers = getDriverPreview(team.decomposition);

  return (
    <article className={`${styles.card} ${open ? styles.cardOpen : ''}`}>
      <div className={styles.row}>
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
        <button type="button" className={styles.expandBtn}
          onClick={() => toggle(team.slug)} aria-label="Expand detail">
          <span className={`${styles.caret} ${open ? styles.caretOpen : ''}`}>&#9662;</span>
        </button>
      </div>

      {open && (
        <div className={styles.detail}>
          <div className={styles.detailTop}>
            <div className={styles.tkRow}>
              <span className={styles.tkItem}><b>Driver:</b> {tk.strongestDriver}</span>
              <span className={styles.tkItem}><b>Drag:</b> {tk.biggestDrag}</span>
              <span className={styles.tkItem}><b>Depth:</b> {tk.depthProfile}</span>
              <span className={styles.tkItem}><b>Risk:</b> {tk.riskProfile}</span>
              <span className={styles.tkItem}><b>Market:</b> {tk.marketStance}</span>
            </div>
            <div className={styles.detailStats}>
              <div className={styles.dCell}><span className={styles.dLbl}>Market Line</span><span className={styles.dVal}>{team.marketWinTotal ?? '—'}</span></div>
              <div className={styles.dCell}><span className={styles.dLbl}>Outlook</span><span className={styles.dVal}>{team.divOutlook}</span></div>
              <div className={styles.dCell}><span className={styles.dLbl}>Confidence</span><span className={styles.dVal}>{team.confidenceTier} ({team.confidenceScore}%)</span></div>
              <div className={styles.dCell}><span className={styles.dLbl}>Manager</span><span className={styles.dVal}>{team.manager}</span></div>
            </div>
          </div>
          {team.decomposition?.length > 0 && (
            <div className={styles.decomp}>
              <h4 className={styles.decompTitle}>
                <MaximusModelIcon size={12} /> Projection Breakdown
              </h4>
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
          <p className={styles.rationale}>{team.rationale}</p>
          <Link to={buildPath(`/teams/${team.slug}`)} className={styles.teamCta}>
            View Team Intel &rarr;
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
  const [viewMode, setViewMode] = useState('league'); // 'league' | 'division'
  const [expanded, setExpanded] = useState(new Set());
  const [methExpanded, setMethExpanded] = useState(false);

  const toggle = (slug) => setExpanded(prev => {
    const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n;
  });

  const summaryItems = useMemo(() => deriveSummary(allTeams), [allTeams]);

  // Split teams into AL and NL, sorted
  const alTeams = useMemo(() => sortTeams(filterTeams(allTeams, { league: 'AL' }), sort), [allTeams, sort]);
  const nlTeams = useMemo(() => sortTeams(filterTeams(allTeams, { league: 'NL' }), sort), [allTeams, sort]);

  // For division view, group by division within each league
  const groupByDiv = (teams) => {
    const divs = {};
    teams.forEach(t => {
      if (!divs[t.division]) divs[t.division] = [];
      divs[t.division].push(t);
    });
    // Sort divisions: East, Central, West
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

  // Global ranking for numbering
  const allSorted = useMemo(() => sortTeams(allTeams, sort), [allTeams, sort]);
  const rankMap = useMemo(() => {
    const m = {};
    allSorted.forEach((t, i) => { m[t.slug] = i + 1; });
    return m;
  }, [allSorted]);

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

          {/* Stage icon + % grid */}
          <div className={styles.stageGrid}>
            {MODEL_META.stages.map(s => (
              <div key={s.name} className={styles.stageCard}>
                <ModelStageIcon stage={s.name} size={20} className={styles.stageIcon} />
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
                      <ModelStageIcon stage={s.name} size={16} className={styles.methStageIco} />
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
              onClick={() => setViewMode('league')}>
              League
            </button>
            <button type="button"
              className={`${styles.pill} ${viewMode === 'division' ? styles.pillActive : ''}`}
              onClick={() => setViewMode('division')}>
              Division
            </button>
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

      {/* ── Summary Rail ── */}
      <div className={styles.summaryRail}>
        {summaryItems.map(item => (
          <div key={item.label} className={styles.summaryCard}>
            <span className={styles.summaryLabel}>{item.label}</span>
            <span className={`${styles.summaryValue} ${styles[`sc_${item.color}`] || ''}`}>{item.value}</span>
            <span className={styles.summaryTeam}>{item.team}</span>
          </div>
        ))}
      </div>

      <p className={styles.resultCount}>30 teams</p>

      {/* ── Team Board: AL / NL split ── */}
      <div className={styles.leagueBoard}>
        {/* AL Column */}
        <div className={styles.leagueCol}>
          <div className={styles.leagueHeader}>
            <LeagueLogo league="AL" size={22} />
            <span className={styles.leagueTitle}>American League</span>
            <span className={styles.leagueCount}>{alTeams.length} teams</span>
          </div>
          {viewMode === 'league' ? (
            <div className={styles.board}>
              {alTeams.map(team => (
                <TeamRow key={team.slug} team={team} idx={rankMap[team.slug] - 1}
                  open={expanded.has(team.slug)} toggle={toggle} buildPath={buildPath} />
              ))}
            </div>
          ) : (
            alDivisions.map(dg => (
              <div key={dg.division} className={styles.divGroup}>
                <h4 className={styles.divGroupTitle}>{dg.division}</h4>
                <div className={styles.board}>
                  {dg.teams.map(team => (
                    <TeamRow key={team.slug} team={team} idx={rankMap[team.slug] - 1}
                      open={expanded.has(team.slug)} toggle={toggle} buildPath={buildPath} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* NL Column */}
        <div className={styles.leagueCol}>
          <div className={styles.leagueHeader}>
            <LeagueLogo league="NL" size={22} />
            <span className={styles.leagueTitle}>National League</span>
            <span className={styles.leagueCount}>{nlTeams.length} teams</span>
          </div>
          {viewMode === 'league' ? (
            <div className={styles.board}>
              {nlTeams.map(team => (
                <TeamRow key={team.slug} team={team} idx={rankMap[team.slug] - 1}
                  open={expanded.has(team.slug)} toggle={toggle} buildPath={buildPath} />
              ))}
            </div>
          ) : (
            nlDivisions.map(dg => (
              <div key={dg.division} className={styles.divGroup}>
                <h4 className={styles.divGroupTitle}>{dg.division}</h4>
                <div className={styles.board}>
                  {dg.teams.map(team => (
                    <TeamRow key={team.slug} team={team} idx={rankMap[team.slug] - 1}
                      open={expanded.has(team.slug)} toggle={toggle} buildPath={buildPath} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
