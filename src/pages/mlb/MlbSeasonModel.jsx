/**
 * MLB Season Model — v3 premium intelligence dashboard.
 *
 * New in v3:
 *   - "How the model works" dynamic explainer section
 *   - MaximusModelIcon branding
 *   - Decomposition breakdown in expanded detail
 *   - Takeaway fields (strongest driver, biggest drag, etc.)
 *   - AL/NL logos in league filter controls
 *   - Explicit expand button + separate team intel CTA
 *   - Tighter, denser team board with clearer zones
 */
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { getMlbEspnLogoUrl } from '../../utils/espnMlbLogos';
import MaximusModelIcon from '../../components/mlb/MaximusModelIcon';
import { MODEL_META } from '../../data/mlb/seasonModelMeta';
import {
  getSeasonProjections, sortTeams, filterTeams,
  SORT_OPTIONS, LEAGUE_FILTERS, DIVISION_FILTERS,
} from '../../data/mlb/seasonModel';
import styles from './MlbSeasonModel.module.css';

const BADGE_CLS = {
  'Stable Contender': 'bGreen', 'Market Favorite': 'bBlue', 'Model Overweight': 'bTeal',
  'Quiet Value': 'bTeal', 'Rotation-Led': 'bBlue', 'Balanced Depth': 'bGreen',
  'Fragile Upside': 'bAmber', 'High Variance': 'bAmber', 'Bullpen Risk': 'bAmber',
  'Top-Heavy': 'bAmber', 'Division Grinder': 'bDefault', 'Volatile Middle': 'bDefault',
  'Prospect Rich': 'bTeal', 'Rebuild Watch': 'bRed', 'Developing': 'bDefault',
};

/* Inline SVG for AL / NL league logos */
const LeagueLogo = ({ league, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
    <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
    <text x="10" y="14" textAnchor="middle" fontSize="8" fontWeight="800"
      fill="currentColor" fontFamily="system-ui">{league}</text>
  </svg>
);

export default function MlbSeasonModel() {
  const { buildPath } = useWorkspace();
  const allTeams = useMemo(() => getSeasonProjections(), []);
  const [sort, setSort] = useState('wins-desc');
  const [league, setLeague] = useState('All');
  const [division, setDivision] = useState('All');
  const [expanded, setExpanded] = useState(new Set());
  const [showMethodology, setShowMethodology] = useState(false);

  const filtered = useMemo(
    () => sortTeams(filterTeams(allTeams, { league, division }), sort),
    [allTeams, league, division, sort],
  );

  const toggle = (slug) => setExpanded(prev => {
    const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n;
  });

  const visDivs = league === 'All' ? DIVISION_FILTERS
    : ['All', ...DIVISION_FILTERS.filter(d => d !== 'All' && d.startsWith(league))];

  return (
    <div className={styles.page}>
      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroEyebrowRow}>
            <MaximusModelIcon size={16} className={styles.heroIcon} />
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

      {/* ── How the Model Works ── */}
      <section className={styles.methSection}>
        <button type="button" className={styles.methToggle}
          onClick={() => setShowMethodology(v => !v)}>
          <MaximusModelIcon size={15} className={styles.methIcon} />
          <span>How the model works</span>
          <span className={`${styles.methCaret} ${showMethodology ? styles.methCaretOpen : ''}`}>&#9662;</span>
        </button>

        {showMethodology && (
          <div className={styles.methBody}>
            <p className={styles.methIntro}>{MODEL_META.objective}</p>

            {/* Weight bars */}
            <div className={styles.methWeights}>
              <h3 className={styles.methH3}>Model Stages &amp; Weights</h3>
              {MODEL_META.stages.map(s => (
                <div key={s.name} className={styles.methRow}>
                  <div className={styles.methRowHead}>
                    <span className={styles.methLabel}>{s.name}</span>
                    <span className={styles.methPct}>{Math.round(s.weight * 100)}%</span>
                  </div>
                  <div className={styles.methBar}>
                    <div className={styles.methBarFill} style={{ width: `${s.weight * 100}%` }} />
                  </div>
                  <p className={styles.methDesc}>{s.description}</p>
                </div>
              ))}
            </div>

            {/* Input groups */}
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

            {/* Sources */}
            <div className={styles.methSources}>
              <h3 className={styles.methH3}>Data Sources</h3>
              <div className={styles.methSourceRow}>
                {MODEL_META.sources.map(s => (
                  <span key={s.name} className={`${styles.methSourceChip} ${s.status === 'live' ? styles.methSourceLive : ''}`}>
                    {s.name}
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
          <label className={styles.controlLabel}>League</label>
          <div className={styles.pillRow}>
            {LEAGUE_FILTERS.map(l => (
              <button key={l} type="button"
                className={`${styles.pill} ${league === l ? styles.pillActive : ''}`}
                onClick={() => { setLeague(l); if (l !== 'All') setDivision('All'); }}>
                {l !== 'All' && <LeagueLogo league={l} size={13} />}
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.controlGroup}>
          <label className={styles.controlLabel}>Division</label>
          <div className={styles.pillRow}>
            {visDivs.map(d => (
              <button key={d} type="button"
                className={`${styles.pill} ${division === d ? styles.pillActive : ''}`}
                onClick={() => setDivision(d)}>
                {d === 'All' ? 'All' : d.replace(/^(AL|NL) /, '')}
              </button>
            ))}
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

      <p className={styles.resultCount}>{filtered.length} team{filtered.length !== 1 ? 's' : ''}</p>

      {/* ── Team Board ── */}
      <div className={styles.board}>
        {filtered.map((team, idx) => {
          const logo = getMlbEspnLogoUrl(team.slug);
          const open = expanded.has(team.slug);
          const dCls = team.marketDelta > 0 ? styles.up : team.marketDelta < 0 ? styles.dn : '';
          const tk = team.takeaways || {};

          return (
            <article key={team.slug} className={`${styles.card} ${open ? styles.cardOpen : ''}`}>
              {/* ── Top row ── */}
              <div className={styles.cardTop}>
                <span className={styles.rank}>{idx + 1}</span>
                <div className={styles.ident}>
                  {logo
                    ? <img src={logo} alt="" className={styles.logo} width={34} height={34} loading="lazy" />
                    : <span className={styles.logoFb}>{team.abbrev}</span>}
                  <div className={styles.identText}>
                    <Link to={buildPath(`/teams/${team.slug}`)} className={styles.name}
                      onClick={e => e.stopPropagation()}>{team.name}</Link>
                    <span className={styles.divLabel}>{team.division}</span>
                  </div>
                </div>

                {/* Hero stat */}
                <div className={styles.heroStat}>
                  <span className={styles.heroNum}>{team.projectedWins}</span>
                  <span className={styles.heroLabel}>Wins</span>
                </div>

                {/* Inline stats */}
                <div className={styles.inlineStats}>
                  <span className={styles.iStat}>{team.floor}–{team.ceiling}</span>
                  <span className={styles.iStat}>{team.champOdds}</span>
                  <span className={`${styles.iStat} ${dCls}`}>
                    {team.marketDelta > 0 ? '+' : ''}{team.marketDelta}
                  </span>
                </div>

                {/* Badges */}
                <div className={styles.badges}>
                  {team.signals?.map(s => (
                    <span key={s} className={`${styles.badge} ${styles[BADGE_CLS[s]] || styles.bDefault}`}>{s}</span>
                  ))}
                </div>

                {/* Explicit expand button */}
                <button type="button" className={styles.expandBtn}
                  onClick={() => toggle(team.slug)} aria-label="Show detail">
                  <span className={`${styles.caret} ${open ? styles.caretOpen : ''}`}>&#9662;</span>
                </button>
              </div>

              {/* ── Expanded detail ── */}
              {open && (
                <div className={styles.detail}>
                  {/* Quick takeaways */}
                  <div className={styles.takeaways}>
                    <span className={styles.tkItem}><b>Driver:</b> {tk.strongestDriver}</span>
                    <span className={styles.tkItem}><b>Drag:</b> {tk.biggestDrag}</span>
                    <span className={styles.tkItem}><b>Depth:</b> {tk.depthProfile}</span>
                    <span className={styles.tkItem}><b>Risk:</b> {tk.riskProfile}</span>
                    <span className={styles.tkItem}><b>Market:</b> {tk.marketStance}</span>
                  </div>

                  {/* Stat grid */}
                  <div className={styles.detailGrid}>
                    <div className={styles.dCell}><span className={styles.dLbl}>Playoff</span><span className={styles.dVal}>{team.playoffProb ?? '—'}%</span></div>
                    <div className={styles.dCell}><span className={styles.dLbl}>Market Line</span><span className={styles.dVal}>{team.marketWinTotal ?? '—'}</span></div>
                    <div className={styles.dCell}><span className={styles.dLbl}>Outlook</span><span className={styles.dVal}>{team.divOutlook}</span></div>
                    <div className={styles.dCell}><span className={styles.dLbl}>Confidence</span><span className={styles.dVal}>{team.confidenceTier} ({team.confidenceScore}%)</span></div>
                    <div className={styles.dCell}><span className={styles.dLbl}>Manager</span><span className={styles.dVal}>{team.manager}</span></div>
                  </div>

                  {/* Decomposition */}
                  {team.decomposition?.length > 0 && (
                    <div className={styles.decomp}>
                      <h4 className={styles.decompTitle}>
                        <MaximusModelIcon size={13} /> Projection Breakdown
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

                  {/* Rationale */}
                  <p className={styles.rationale}>{team.rationale}</p>

                  {/* CTA */}
                  <Link to={buildPath(`/teams/${team.slug}`)} className={styles.teamCta}>
                    View Team Intel &rarr;
                  </Link>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
