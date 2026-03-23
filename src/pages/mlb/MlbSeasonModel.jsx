/**
 * MLB Season Model — premium season-wins intelligence surface.
 *
 * Shows projected wins, championship odds, confidence bands, and
 * detailed rationale for all 30 MLB teams with sort/filter controls.
 */
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { getMlbEspnLogoUrl } from '../../utils/espnMlbLogos';
import {
  getSeasonProjections,
  sortTeams,
  filterTeams,
  SORT_OPTIONS,
  LEAGUE_FILTERS,
  DIVISION_FILTERS,
} from '../../data/mlb/seasonModel';
import styles from './MlbSeasonModel.module.css';

export default function MlbSeasonModel() {
  const { buildPath } = useWorkspace();

  const allTeams = useMemo(() => getSeasonProjections(), []);
  const [sort, setSort] = useState('wins-desc');
  const [league, setLeague] = useState('All');
  const [division, setDivision] = useState('All');
  const [expanded, setExpanded] = useState(/** @type {Set<string>} */ (new Set()));

  const filtered = useMemo(
    () => sortTeams(filterTeams(allTeams, { league, division }), sort),
    [allTeams, league, division, sort],
  );

  const toggleExpand = (slug) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  };

  // Contextual division filter — show only divisions for selected league
  const visibleDivisions = division !== 'All' ? DIVISION_FILTERS :
    league === 'All' ? DIVISION_FILTERS :
    ['All', ...DIVISION_FILTERS.filter((d) => d !== 'All' && d.startsWith(league))];

  return (
    <div className={styles.page}>
      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.eyebrow}>2026 Season Model</span>
          <h1 className={styles.heroTitle}>MLB Season Wins Intelligence</h1>
          <p className={styles.heroBody}>
            Projected win totals for all 30 teams — built from historical baselines,
            roster moves, manager quality, division difficulty, and market priors.
            An early-season first pass; the model sharpens as data flows in.
          </p>
        </div>
      </section>

      {/* ── Controls ── */}
      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <label className={styles.controlLabel}>League</label>
          <div className={styles.pillRow}>
            {LEAGUE_FILTERS.map((l) => (
              <button
                key={l}
                type="button"
                className={`${styles.pill} ${league === l ? styles.pillActive : ''}`}
                onClick={() => { setLeague(l); if (l !== 'All') setDivision('All'); }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.controlGroup}>
          <label className={styles.controlLabel}>Division</label>
          <div className={styles.pillRow}>
            {visibleDivisions.map((d) => (
              <button
                key={d}
                type="button"
                className={`${styles.pill} ${division === d ? styles.pillActive : ''}`}
                onClick={() => setDivision(d)}
              >
                {d === 'All' ? 'All' : d.replace('AL ', '').replace('NL ', '')}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.controlGroup}>
          <label className={styles.controlLabel}>Sort</label>
          <select
            className={styles.sortSelect}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Count ── */}
      <p className={styles.resultCount}>{filtered.length} team{filtered.length !== 1 ? 's' : ''}</p>

      {/* ── Team List ── */}
      <div className={styles.teamList}>
        {filtered.map((team, idx) => {
          const logoUrl = getMlbEspnLogoUrl(team.slug);
          const isOpen = expanded.has(team.slug);
          const deltaClass = team.marketDelta > 0 ? styles.deltaPos :
                             team.marketDelta < 0 ? styles.deltaNeg : '';
          return (
            <div key={team.slug} className={styles.teamRow}>
              {/* Main row */}
              <div className={styles.teamMain} onClick={() => toggleExpand(team.slug)} role="button" tabIndex={0}>
                <span className={styles.rank}>{idx + 1}</span>

                <div className={styles.teamIdent}>
                  {logoUrl ? (
                    <img src={logoUrl} alt="" className={styles.teamLogo} width={36} height={36} loading="lazy" />
                  ) : (
                    <span className={styles.teamLogoFallback}>{team.abbrev}</span>
                  )}
                  <div className={styles.teamMeta}>
                    <Link
                      to={buildPath(`/teams/${team.slug}`)}
                      className={styles.teamName}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {team.name}
                    </Link>
                    <span className={styles.teamDiv}>{team.division}</span>
                  </div>
                </div>

                <div className={styles.statBlock}>
                  <span className={styles.statHero}>{team.projectedWins}</span>
                  <span className={styles.statCaption}>Proj. Wins</span>
                </div>

                <div className={styles.statBlock}>
                  <span className={styles.statVal}>{team.champOdds}</span>
                  <span className={styles.statCaption}>WS Odds</span>
                </div>

                <div className={`${styles.statBlock} ${styles.hideOnMobile}`}>
                  <span className={styles.statVal}>{team.playoffProb != null ? `${team.playoffProb}%` : '—'}</span>
                  <span className={styles.statCaption}>Playoff %</span>
                </div>

                <div className={`${styles.statBlock} ${styles.hideOnMobile}`}>
                  <span className={`${styles.statVal} ${deltaClass}`}>
                    {team.marketDelta > 0 ? '+' : ''}{team.marketDelta}
                  </span>
                  <span className={styles.statCaption}>vs Market</span>
                </div>

                <span className={`${styles.expandIcon} ${isOpen ? styles.expandOpen : ''}`}>&#9662;</span>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div className={styles.teamDetail}>
                  <div className={styles.detailStats}>
                    <div className={styles.detailStat}>
                      <span className={styles.detailLabel}>Win Range</span>
                      <span className={styles.detailValue}>{team.floor}–{team.ceiling}</span>
                    </div>
                    <div className={styles.detailStat}>
                      <span className={styles.detailLabel}>Market Wins</span>
                      <span className={styles.detailValue}>{team.marketWins ?? '—'}</span>
                    </div>
                    <div className={styles.detailStat}>
                      <span className={styles.detailLabel}>Outlook</span>
                      <span className={styles.detailValue}>{team.divOutlook}</span>
                    </div>
                    <div className={styles.detailStat}>
                      <span className={styles.detailLabel}>Confidence</span>
                      <span className={styles.detailValue}>{team.confidenceTier}</span>
                    </div>
                    <div className={styles.detailStat}>
                      <span className={styles.detailLabel}>Manager</span>
                      <span className={styles.detailValue}>{team.manager}</span>
                    </div>
                  </div>
                  <p className={styles.rationale}>{team.rationale}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
