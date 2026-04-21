/**
 * NbaMaximusPicksSection — NBA Maximus's Picks board.
 * Mirrors MLB MlbMaximusPicksSection structure 1:1 with navy palette.
 *
 * Modes:
 *   - "home": curated preview, collapsed caps, expand-to-full board CTA
 *   - "page": fuller board (Odds Insights page)
 */

import { useState, useEffect, useMemo } from 'react';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { buildNbaPicks, hasAnyNbaPicks } from '../../features/nba/picks/buildNbaPicks';
import { getNbaEspnLogoUrl } from '../../utils/espnNbaLogos';
import styles from './NbaMaximusPicksSection.module.css';

// ── SVG icons (parallel to MLB) ──

function IconPickEm() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <polyline points="4,6.5 6,8.5 9.5,4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
function IconAts() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <rect x="0.5" y="7.5" width="2.5" height="4.5" rx="1" fill="currentColor" opacity="0.65" />
      <rect x="5" y="4.5" width="2.5" height="7.5" rx="1" fill="currentColor" />
      <rect x="9.5" y="1.5" width="2.5" height="10.5" rx="1" fill="currentColor" opacity="0.45" />
    </svg>
  );
}
function IconValue() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <polyline points="1,11 4,7 7,9 10,3.5 12,2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
function IconTotals() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <line x1="4" y1="6.5" x2="9" y2="6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6.5" y1="4" x2="6.5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function ChevronIcon({ open }) {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true"
      className={open ? styles.chevronOpen : styles.chevron}>
      <polyline points="2,3.5 5.5,7.5 9,3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Column config — NBA-native descriptions ──

const COLUMNS = [
  {
    key: 'pickEms',
    title: "PICK 'EMS",
    Icon: IconPickEm,
    desc: 'Model-backed moneyline winners based on win probability, home-court edge, and market pricing.',
    storageKey: 'nbaPicksPickEmCollapsed',
  },
  {
    key: 'ats',
    title: 'AGAINST THE SPREAD',
    Icon: IconAts,
    desc: 'Spread plays where the model\u2019s fair line disagrees with the market number.',
    storageKey: 'nbaPicksAtsCollapsed',
  },
  {
    key: 'leans',
    title: 'VALUE LEANS',
    Icon: IconValue,
    desc: 'Softer directional value where market pricing may underestimate a side.',
    storageKey: 'nbaPicksValueCollapsed',
  },
  {
    key: 'totals',
    title: 'GAME TOTALS',
    Icon: IconTotals,
    desc: 'Over/under leans based on projected pace and scoring environment.',
    storageKey: 'nbaPicksTotalsCollapsed',
  },
];

const CONF_LABELS = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };
const COLLAPSED_CAP = 3;
const EXPANDED_CAP = 5;
const PAGE_CAP = 8;

function formatTime(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  catch { return ''; }
}

function formatDayLabel(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const gameDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((gameDay - today) / 86400000);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
    if (diffDays === 0) return `Today \u00B7 ${dateStr}`;
    if (diffDays === 1) return `Tomorrow \u00B7 ${dateStr}`;
    const dayStr = d.toLocaleDateString('en-US', { weekday: 'short' });
    return `${dayStr} \u00B7 ${dateStr}`;
  } catch { return ''; }
}

// ── Pick card — NBA parity with MLB ──

function PickCard({ pick, category }) {
  const { matchup, pick: p, confidence, model } = pick;
  const awayLogo = getNbaEspnLogoUrl(matchup?.awayTeam?.slug);
  const homeLogo = getNbaEspnLogoUrl(matchup?.homeTeam?.slug);
  const time = formatTime(matchup?.startTime);
  const dayLabel = formatDayLabel(matchup?.startTime);
  const isHigh = confidence === 'high';
  const isTotals = category === 'totals';

  return (
    <div className={`${styles.pickCard} ${isHigh ? styles.pickCardTop : ''}`}>
      <div className={styles.cardMetaRow}>
        {dayLabel && <span className={styles.dayChip}>{dayLabel}</span>}
        {time && <span className={styles.pickTime}>{time}</span>}
      </div>

      {isTotals ? (
        <>
          <div className={styles.cardMatchup}>
            <div className={styles.matchupTeam}>
              {awayLogo && <span className={styles.teamLogoWrap}><img src={awayLogo} alt="" width={20} height={20} loading="lazy" /></span>}
              <span className={styles.matchupName}>{matchup?.awayTeam?.shortName}</span>
            </div>
            <span className={styles.atLabel}>@</span>
            <div className={styles.matchupTeam}>
              {homeLogo && <span className={styles.teamLogoWrap}><img src={homeLogo} alt="" width={20} height={20} loading="lazy" /></span>}
              <span className={styles.matchupName}>{matchup?.homeTeam?.shortName}</span>
            </div>
          </div>
          <div className={styles.cardRecommendation}>
            <span className={styles.pickPill}>{p?.label}</span>
            {confidence && (
              <span className={`${styles.confChip} ${styles[`conf${confidence.charAt(0).toUpperCase() + confidence.slice(1)}`]}`}>
                {CONF_LABELS[confidence]}
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          <div className={styles.cardRecommendation}>
            {p?.side === 'away' && awayLogo && (
              <span className={styles.teamLogoWrap}><img src={awayLogo} alt="" width={20} height={20} loading="lazy" /></span>
            )}
            {p?.side === 'home' && homeLogo && (
              <span className={styles.teamLogoWrap}><img src={homeLogo} alt="" width={20} height={20} loading="lazy" /></span>
            )}
            <span className={styles.pickPill}>{p?.label}</span>
            {confidence && (
              <span className={`${styles.confChip} ${styles[`conf${confidence.charAt(0).toUpperCase() + confidence.slice(1)}`]}`}>
                {CONF_LABELS[confidence]}
              </span>
            )}
          </div>
          <div className={styles.cardOpponent}>
            <span className={styles.vsTag}>vs</span>
            {p?.side === 'away' && homeLogo && (
              <span className={styles.teamLogoWrap}><img src={homeLogo} alt="" width={18} height={18} loading="lazy" /></span>
            )}
            {p?.side === 'home' && awayLogo && (
              <span className={styles.teamLogoWrap}><img src={awayLogo} alt="" width={18} height={18} loading="lazy" /></span>
            )}
            <span className={styles.opponentName}>
              {p?.side === 'away' ? matchup?.homeTeam?.shortName : matchup?.awayTeam?.shortName}
            </span>
          </div>
        </>
      )}

      {/* Model edge */}
      {model?.edge != null && model.edge > 0 && (
        <div className={styles.modelEdge}>
          <span className={styles.edgePair}>
            <span className={styles.edgeLabel}>Edge</span>
            <span className={styles.edgeValue}>{(model.edge * 100).toFixed(1)}%</span>
          </span>
          {model?.dataQuality != null && (
            <span className={styles.edgePair}>
              <span className={styles.edgeLabel}>DQ</span>
              <span className={styles.edgeValue}>{Math.round(model.dataQuality * 100)}%</span>
            </span>
          )}
        </div>
      )}

      {/* Signals */}
      {p?.topSignals?.length > 0 && (
        <div className={styles.signalPanel}>
          {p.topSignals.slice(0, 2).map((s, i) => (
            <div key={i} className={styles.signalRow}>
              <span className={styles.signalCheck}>&#10003;</span>
              <span className={styles.signalText}>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Skeleton card ──

function SkeletonCard() {
  return (
    <div className={`${styles.pickCard} ${styles.skeletonCard}`} aria-hidden="true">
      <div className={styles.skLine} style={{ width: '45%', height: 8 }} />
      <div className={styles.skPill} />
      <div className={styles.skLine} style={{ width: '60%', height: 10 }} />
      <div className={styles.skBlock} />
    </div>
  );
}

// ── Pick column ──

function PickColumn({ config, picks, cap, slateComplete, mode, buildPath }) {
  const { title, Icon, desc, storageKey } = config;
  const [collapsed, setCollapsed] = useState(() => {
    if (mode === 'page') return false;
    try { return localStorage.getItem(storageKey) === '1'; } catch { return false; }
  });

  const toggleCollapse = () => {
    setCollapsed(v => {
      try { localStorage.setItem(storageKey, v ? '0' : '1'); } catch {}
      return !v;
    });
  };

  const visible = picks.slice(0, cap);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div className={styles.column}>
      <div className={styles.columnHeader}>
        <div className={styles.columnTitleRow}>
          <span className={styles.columnIcon}><Icon /></span>
          <span className={styles.columnTitle}>{title}</span>
          {picks.length > 0 && <span className={styles.columnCount}>{picks.length}</span>}
        </div>
        <p className={styles.columnDesc}>{desc}</p>
        <div className={styles.columnDivider} />
      </div>

      {isMobile && mode === 'home' && picks.length > 0 && (
        <button type="button" className={styles.accordionToggle} onClick={toggleCollapse}>
          <span className={styles.accordionLabel}>{collapsed ? 'Show picks' : 'Hide'}</span>
          <ChevronIcon open={!collapsed} />
        </button>
      )}

      <div className={`${styles.cardListWrapper} ${collapsed && isMobile ? styles.cardListCollapsed : ''}`}>
        <div className={styles.cardList}>
          {picks.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyReason}>
                {slateComplete ? 'Today\u2019s slate is complete.' : 'No qualified picks right now.'}
              </p>
            </div>
          ) : (
            visible.map(pick => <PickCard key={pick.id} pick={pick} category={config.key} />)
          )}
        </div>
      </div>

      {mode === 'home' && (
        <a href={buildPath('/insights')} className={styles.viewMoreLink}>
          {picks.length > 0 ? 'Full intel on NBA Odds Insights \u2192' : 'View NBA Odds Insights \u2192'}
        </a>
      )}
    </div>
  );
}

// ── Summary ──

function buildSummary(picks) {
  if (!picks?.categories) return null;
  const c = picks.categories;
  const pe = c.pickEms?.length || 0;
  const ats = c.ats?.length || 0;
  const leans = c.leans?.length || 0;
  const tots = c.totals?.length || 0;
  const total = pe + ats + leans + tots;
  if (total === 0) return null;

  const parts = [];
  if (pe > 0) parts.push(`${pe} moneyline pick${pe > 1 ? 's' : ''}`);
  if (ats > 0) parts.push(`${ats} spread play${ats > 1 ? 's' : ''}`);
  if (leans > 0) parts.push(`${leans} value lean${leans > 1 ? 's' : ''}`);
  if (tots > 0) parts.push(`${tots} total${tots > 1 ? 's' : ''}`);

  const highCount = [c.pickEms, c.ats, c.leans, c.totals]
    .flat().filter(p => p?.confidence === 'high').length;

  let quality = 'MIXED SLATE';
  if (highCount >= 4) quality = 'STRONG';
  else if (leans > pe + ats) quality = 'VALUE HEAVY';

  return { text: `Today\u2019s board: ${parts.join(', ')} across the NBA slate.`, quality };
}

// ── Main component ──

export default function NbaMaximusPicksSection({ mode = 'home' }) {
  const { buildPath } = useWorkspace();
  const [state, setState] = useState({ status: 'loading', games: [], meta: null, error: null });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/nba/picks/board')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        if (cancelled) return;
        setState({ status: 'ready', games: d.games ?? [], meta: d.meta ?? null, error: null });
      })
      .catch(() => {
        // Fallback: try live games endpoint (shape matches)
        fetch('/api/nba/live/games?status=all&sort=edge')
          .then(r => r.json())
          .then(d => {
            if (cancelled) return;
            setState({ status: 'ready', games: d.games ?? d ?? [], meta: null, error: null });
          })
          .catch(err => {
            if (cancelled) return;
            setState({ status: 'error', games: [], meta: null, error: err?.message });
          });
      });
    return () => { cancelled = true; };
  }, []);

  const { status, games, meta, error } = state;

  const picks = useMemo(() => {
    if (!games.length) return null;
    try { return buildNbaPicks({ games }); }
    catch { return null; }
  }, [games]);

  const hasPicks = picks && hasAnyNbaPicks(picks);
  const summary = useMemo(() => buildSummary(picks), [picks]);

  const getCap = () => {
    if (mode === 'page') return PAGE_CAP;
    return expanded ? EXPANDED_CAP : COLLAPSED_CAP;
  };

  // Skeleton loading
  if (status === 'loading') {
    return (
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeaderLeft}>
            <span className={styles.eyebrow}>Betting Intelligence</span>
            <h2 className={styles.sectionTitle}>{mode === 'page' ? 'NBA Odds Insights' : "Maximus's Picks"}</h2>
          </div>
        </div>
        <div className={styles.root}>
          {COLUMNS.map(col => (
            <div key={col.key} className={styles.column}>
              <div className={styles.columnHeader}>
                <div className={styles.columnTitleRow}>
                  <span className={styles.columnIcon}><col.Icon /></span>
                  <span className={styles.columnTitle}>{col.title}</span>
                </div>
                <p className={styles.columnDesc}>{col.desc}</p>
                <div className={styles.columnDivider} />
              </div>
              <div className={styles.cardList}>
                <SkeletonCard /><SkeletonCard /><SkeletonCard />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Diagnostic empty state
  const totalGames = meta?.upcoming ?? games.length;
  const gamesWithOdds = meta?.withOdds ?? 0;
  const qualifiedGames = picks?.meta?.qualifiedGames ?? 0;

  let emptyTitle = 'No qualified NBA edges right now';
  let emptyDesc = 'Maximus is waiting for stronger signal alignment before posting today\u2019s board.';
  if (status === 'error') {
    emptyTitle = 'Picks Temporarily Unavailable';
    emptyDesc = 'We couldn\u2019t load the board right now. Refresh in a moment or check back shortly.';
  } else if (!hasPicks) {
    if (totalGames === 0) {
      emptyTitle = 'No Games Scheduled';
      emptyDesc = 'The NBA picks board will return when the next slate of games tips off.';
    } else if (gamesWithOdds === 0) {
      emptyTitle = 'Odds Data Loading';
      emptyDesc = `${totalGames} upcoming ${totalGames === 1 ? 'game' : 'games'} on the slate, but market odds are syncing. Check back in a few minutes.`;
    } else if (qualifiedGames === 0) {
      emptyTitle = 'No Qualified Edges Right Now';
      emptyDesc = `The model evaluated ${gamesWithOdds} ${gamesWithOdds === 1 ? 'game' : 'games'} but none cleared our conviction threshold. Board refreshes as lines move.`;
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionHeaderLeft}>
          <span className={styles.eyebrow}>Betting Intelligence</span>
          <h2 className={styles.sectionTitle}>{mode === 'page' ? 'NBA Odds Insights' : "Maximus's Picks"}</h2>
        </div>
      </div>

      {summary && hasPicks && (
        <div className={styles.summaryStrip}>
          <span className={styles.summaryLabel}>NBA SLATE</span>
          <span className={styles.summaryText}>{summary.text}</span>
          <span className={`${styles.summaryBadge} ${styles[`quality${summary.quality.replace(/\s/g, '')}`]}`}>
            {summary.quality}
          </span>
        </div>
      )}

      {!hasPicks ? (
        <div className={styles.emptyBoard}>
          <p className={styles.emptyTitle}>{emptyTitle}</p>
          <p className={styles.emptyDesc}>{emptyDesc}</p>
        </div>
      ) : (
        <div className={styles.boardWrapper}>
          <div className={`${styles.boardContent} ${!expanded && mode === 'home' ? styles.boardCollapsed : ''}`}>
            <div className={styles.root}>
              {COLUMNS.map(col => (
                <PickColumn
                  key={col.key}
                  config={col}
                  picks={picks.categories[col.key] || []}
                  cap={getCap()}
                  slateComplete={false}
                  mode={mode}
                  buildPath={buildPath}
                />
              ))}
            </div>
          </div>
          {mode === 'home' && (
            <div className={styles.expandBar}>
              <button type="button" className={styles.expandBtn} onClick={() => setExpanded(v => !v)}>
                {expanded ? 'Collapse board' : 'Show full board'}
                <ChevronIcon open={expanded} />
              </button>
            </div>
          )}
        </div>
      )}

      {hasPicks && (
        <div className={styles.picksFooter}>
          <p className={styles.disclaimer}>
            For entertainment only. Please bet responsibly. Leans are data-driven, not advice.
          </p>
        </div>
      )}
    </section>
  );
}
