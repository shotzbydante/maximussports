/**
 * MLB Season Model — premium season-wins intelligence dashboard (v2).
 *
 * Features: stat strips, signal badges, expanded sort/filter, mobile
 * rationale collapse, team CTAs, and rich confidence/band data.
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

/** Badge color mapping. */
const BADGE_STYLE = {
  'Stable Contender': 'badgeGreen',
  'Market Favorite':  'badgeBlue',
  'Model Overweight': 'badgeTeal',
  'Quiet Value':      'badgeTeal',
  'Fragile Upside':   'badgeAmber',
  'High Variance':    'badgeAmber',
  'Division Grinder': 'badgeDefault',
  'Volatile Middle':  'badgeDefault',
  'Rebuild Watch':    'badgeRed',
  'Developing':       'badgeDefault',
  'Prospect Rich':    'badgeTeal',
  'Bullpen Risk':     'badgeAmber',
  'Top-Heavy':        'badgeAmber',
};

export default function MlbSeasonModel() {
  const { buildPath } = useWorkspace();

  const allTeams = useMemo(() => getSeasonProjections(), []);
  const [sort, setSort] = useState('wins-desc');
  const [league, setLeague] = useState('All');
  const [division, setDivision] = useState('All');
  const [expanded, setExpanded] = useState(new Set());

  const filtered = useMemo(
    () => sortTeams(filterTeams(allTeams, { league, division }), sort),
    [allTeams, league, division, sort],
  );

  const toggle = (slug) => setExpanded((prev) => {
    const n = new Set(prev);
    n.has(slug) ? n.delete(slug) : n.add(slug);
    return n;
  });

  const visDivs = league === 'All'
    ? DIVISION_FILTERS
    : ['All', ...DIVISION_FILTERS.filter((d) => d !== 'All' && d.startsWith(league))];

  return (
    <div className={styles.page}>
      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.eyebrow}>2026 Season Model</span>
          <h1 className={styles.heroTitle}>MLB Season Wins Intelligence</h1>
          <p className={styles.heroBody}>
            Projected win totals for all 30 teams — built from historical baselines,
            roster composition, pitching depth, bullpen quality, manager track records,
            division difficulty, and market priors. The model sharpens as data flows in.
          </p>
        </div>
      </section>

      {/* ── Controls ── */}
      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <label className={styles.controlLabel}>League</label>
          <div className={styles.pillRow}>
            {LEAGUE_FILTERS.map((l) => (
              <button key={l} type="button"
                className={`${styles.pill} ${league === l ? styles.pillActive : ''}`}
                onClick={() => { setLeague(l); if (l !== 'All') setDivision('All'); }}
              >{l}</button>
            ))}
          </div>
        </div>
        <div className={styles.controlGroup}>
          <label className={styles.controlLabel}>Division</label>
          <div className={styles.pillRow}>
            {visDivs.map((d) => (
              <button key={d} type="button"
                className={`${styles.pill} ${division === d ? styles.pillActive : ''}`}
                onClick={() => setDivision(d)}
              >{d === 'All' ? 'All' : d.replace(/^(AL|NL) /, '')}</button>
            ))}
          </div>
        </div>
        <div className={styles.controlGroup}>
          <label className={styles.controlLabel}>Sort</label>
          <select className={styles.sortSelect} value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <p className={styles.resultCount}>{filtered.length} team{filtered.length !== 1 ? 's' : ''}</p>

      {/* ── Team List ── */}
      <div className={styles.teamList}>
        {filtered.map((team, idx) => {
          const logo = getMlbEspnLogoUrl(team.slug);
          const open = expanded.has(team.slug);
          const dCls = team.marketDelta > 0 ? styles.deltaPos : team.marketDelta < 0 ? styles.deltaNeg : '';

          return (
            <div key={team.slug} className={`${styles.teamRow} ${open ? styles.teamRowOpen : ''}`}>
              {/* ── Header row ── */}
              <div className={styles.teamMain} onClick={() => toggle(team.slug)} role="button" tabIndex={0}>
                <span className={styles.rank}>{idx + 1}</span>

                <div className={styles.teamIdent}>
                  {logo
                    ? <img src={logo} alt="" className={styles.teamLogo} width={36} height={36} loading="lazy" />
                    : <span className={styles.teamLogoFb}>{team.abbrev}</span>}
                  <div className={styles.teamMeta}>
                    <Link to={buildPath(`/teams/${team.slug}`)} className={styles.teamName}
                      onClick={(e) => e.stopPropagation()}>{team.name}</Link>
                    <span className={styles.teamDiv}>{team.division}</span>
                  </div>
                </div>

                {/* Hero stat */}
                <div className={styles.statBlock}>
                  <span className={styles.statHero}>{team.projectedWins}</span>
                  <span className={styles.statCaption}>Proj. W</span>
                </div>

                {/* Secondary stats — visible on all sizes */}
                <div className={styles.statBlock}>
                  <span className={styles.statVal}>{team.champOdds}</span>
                  <span className={styles.statCaption}>WS Odds</span>
                </div>

                <div className={`${styles.statBlock} ${styles.dHide}`}>
                  <span className={styles.statVal}>{team.playoffProb != null ? `${team.playoffProb}%` : '—'}</span>
                  <span className={styles.statCaption}>Playoff</span>
                </div>

                <div className={`${styles.statBlock} ${styles.dHide}`}>
                  <span className={`${styles.statVal} ${dCls}`}>
                    {team.marketDelta > 0 ? '+' : ''}{team.marketDelta}
                  </span>
                  <span className={styles.statCaption}>vs Mkt</span>
                </div>

                <span className={`${styles.caret} ${open ? styles.caretOpen : ''}`}>&#9662;</span>
              </div>

              {/* ── Stat strip + badges ── */}
              <div className={styles.strip}>
                <div className={styles.stripStats}>
                  <span className={styles.stripCell}><b>{team.floor}</b>–<b>{team.ceiling}</b> <em>range</em></span>
                  <span className={styles.stripCell}><b>{team.playoffProb ?? '—'}%</b> <em>playoff</em></span>
                  <span className={styles.stripCell}>
                    <b className={dCls}>{team.marketDelta > 0 ? '+' : ''}{team.marketDelta}</b> <em>vs mkt</em>
                  </span>
                  <span className={styles.stripCell}><b>{team.confidenceTier}</b> <em>conf.</em></span>
                </div>
                <div className={styles.badges}>
                  {team.signals?.map((s) => (
                    <span key={s} className={`${styles.badge} ${styles[BADGE_STYLE[s]] || styles.badgeDefault}`}>{s}</span>
                  ))}
                </div>
              </div>

              {/* ── Expanded detail ── */}
              {open && (
                <div className={styles.detail}>
                  <div className={styles.detailGrid}>
                    <div className={styles.dCell}><span className={styles.dLbl}>Market Line</span><span className={styles.dVal}>{team.marketWinTotal ?? '—'}</span></div>
                    <div className={styles.dCell}><span className={styles.dLbl}>Outlook</span><span className={styles.dVal}>{team.divOutlook}</span></div>
                    <div className={styles.dCell}><span className={styles.dLbl}>Manager</span><span className={styles.dVal}>{team.manager}</span></div>
                    <div className={styles.dCell}><span className={styles.dLbl}>Conf. Score</span><span className={styles.dVal}>{team.confidenceScore}%</span></div>
                  </div>
                  <p className={styles.rationale}>{team.rationale}</p>
                  <Link to={buildPath(`/teams/${team.slug}`)} className={styles.teamCta}
                    onClick={(e) => e.stopPropagation()}>
                    View Team Intel &rarr;
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
