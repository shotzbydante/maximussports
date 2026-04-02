/**
 * MlbMaximusPicksSection — NCAAM-parity MLB picks board.
 *
 * Mirrors the NCAAM MaximusPicks component structure:
 *   - 4-column grid (Pick 'Ems, ATS, Value Leans, Game Totals)
 *   - SVG icons per column (not emojis)
 *   - Accordion on mobile
 *   - Same card hierarchy and information architecture
 *   - MLB color palette (#b8293d red accent)
 *
 * Modes:
 *   - "home": compact with accordion, curated caps
 *   - "page": fuller board for standalone page
 */

import { useState, useEffect, useMemo } from 'react';
import { buildMlbPicks, hasAnyPicks } from '../../features/mlb/picks/buildMlbPicks';
import { getMlbEspnLogoUrl } from '../../utils/espnMlbLogos';
import styles from './MlbMaximusPicksSection.module.css';

// ── Inline SVG icons (matching NCAAM patterns) ──

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

// ── Column config (matches NCAAM structure) ──

const COLUMNS = [
  {
    key: 'pickEms',
    title: "PICK 'EMS",
    Icon: IconPickEm,
    desc: 'Model-backed moneyline winners based on projections, odds, and team quality.',
    storageKey: 'mlbPicksPickEmCollapsed',
  },
  {
    key: 'ats',
    title: 'AGAINST THE SPREAD',
    Icon: IconAts,
    desc: 'Run line recommendations evaluating spread efficiency and matchup edges.',
    storageKey: 'mlbPicksAtsCollapsed',
  },
  {
    key: 'leans',
    title: 'VALUE LEANS',
    Icon: IconValue,
    desc: 'Directional value where market pricing may underestimate a side.',
    storageKey: 'mlbPicksValueCollapsed',
  },
  {
    key: 'totals',
    title: 'GAME TOTALS',
    Icon: IconTotals,
    desc: 'Over/under leans based on team offense and pitching matchups.',
    storageKey: 'mlbPicksTotalsCollapsed',
  },
];

const CONF_LABELS = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };
const COLLAPSED_CAP = 3;
const EXPANDED_CAP = 6;
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
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return ''; }
}

// ── Pick card (NCAAM-parity structure) ──

function PickCard({ pick, category }) {
  const { matchup, pick: p, confidence, model } = pick;
  const awayLogo = getMlbEspnLogoUrl(matchup?.awayTeam?.slug);
  const homeLogo = getMlbEspnLogoUrl(matchup?.homeTeam?.slug);
  const time = formatTime(matchup?.startTime);
  const dayLabel = formatDayLabel(matchup?.startTime);
  const isHigh = confidence === 'high';
  const isTotals = category === 'totals';

  return (
    <div className={`${styles.pickCard} ${isHigh ? styles.pickCardTop : ''}`}>
      {/* Meta row: day + time */}
      <div className={styles.cardMetaRow}>
        {dayLabel && <span className={styles.dayChip}>{dayLabel}</span>}
        {time && <span className={styles.pickTime}>{time}</span>}
      </div>

      {isTotals ? (
        /* Totals: show both teams in matchup style */
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
          {/* Pick pill + confidence */}
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
        /* Non-totals: pick team + opponent */
        <>
          {/* Pick recommendation: logo + pick pill + confidence */}
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
          {/* Opponent */}
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
              <span className={styles.signalCheck}>✓</span>
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

// ── Pick column (matches NCAAM PickColumn pattern) ──

function PickColumn({ config, picks, cap, slateComplete, mode }) {
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
      {/* Column header */}
      <div className={styles.columnHeader}>
        <div className={styles.columnTitleRow}>
          <span className={styles.columnIcon}><Icon /></span>
          <span className={styles.columnTitle}>{title}</span>
          {picks.length > 0 && <span className={styles.columnCount}>{picks.length}</span>}
        </div>
        <p className={styles.columnDesc}>{desc}</p>
        <div className={styles.columnDivider} />
      </div>

      {/* Mobile accordion toggle */}
      {isMobile && mode === 'home' && picks.length > 0 && (
        <button type="button" className={styles.accordionToggle} onClick={toggleCollapse}>
          <span className={styles.accordionLabel}>{collapsed ? 'Show picks' : 'Hide'}</span>
          <ChevronIcon open={!collapsed} />
        </button>
      )}

      {/* Card list */}
      <div className={`${styles.cardListWrapper} ${collapsed && isMobile ? styles.cardListCollapsed : ''}`}>
        <div className={styles.cardList}>
          {picks.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyReason}>
                {slateComplete ? "Today's slate is complete." : 'No qualified picks right now.'}
              </p>
            </div>
          ) : (
            visible.map(pick => <PickCard key={pick.id} pick={pick} category={config.key} />)
          )}
        </div>
      </div>

      {/* CTA */}
      {mode === 'home' && (
        <a href="/mlb/picks" className={styles.viewMoreLink}>
          {picks.length > 0 ? 'Full intel on MLB Picks →' : 'View MLB Picks →'}
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
  if (ats > 0) parts.push(`${ats} run line${ats > 1 ? 's' : ''}`);
  if (leans > 0) parts.push(`${leans} value lean${leans > 1 ? 's' : ''}`);
  if (tots > 0) parts.push(`${tots} total${tots > 1 ? 's' : ''}`);

  const highCount = [c.pickEms, c.ats, c.leans, c.totals]
    .flat().filter(p => p?.confidence === 'high').length;

  let quality = 'MIXED SLATE';
  if (highCount >= 4) quality = 'STRONG';
  else if (leans > pe + ats) quality = 'VALUE HEAVY';

  return { text: `Today's board: ${parts.join(', ')} across the MLB slate.`, quality };
}

// ── Main component ──

export default function MlbMaximusPicksSection({ mode = 'home' }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch('/api/mlb/picks/board')
      .then(r => r.json())
      .then(d => setGames(d.games ?? []))
      .catch(() => {
        fetch('/api/mlb/live/games?status=all&sort=importance')
          .then(r => r.json())
          .then(d => setGames(d.games ?? d ?? []))
          .catch(() => {});
      })
      .finally(() => setLoading(false));
  }, []);

  const picks = useMemo(() => {
    if (!games.length) return null;
    try { return buildMlbPicks({ games }); }
    catch { return null; }
  }, [games]);

  const hasPicks = picks && hasAnyPicks(picks);
  const summary = useMemo(() => buildSummary(picks), [picks]);

  const getCap = () => {
    if (mode === 'page') return PAGE_CAP;
    return expanded ? EXPANDED_CAP : COLLAPSED_CAP;
  };

  // Skeleton loading
  if (loading) {
    return (
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Betting Intelligence</span>
          <h2 className={styles.sectionTitle}>{mode === 'page' ? 'MLB Odds Insights' : "Maximus's Picks"}</h2>
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

  return (
    <section className={styles.section}>
      {/* Header */}
      <div className={styles.sectionHeader}>
        <div className={styles.sectionHeaderLeft}>
          <span className={styles.eyebrow}>Betting Intelligence</span>
          <h2 className={styles.sectionTitle}>{mode === 'page' ? 'MLB Odds Insights' : "Maximus's Picks"}</h2>
        </div>
        {/* expand/collapse moved to bottom of board */}
      </div>

      {/* Summary strip */}
      {summary && hasPicks && (
        <div className={styles.summaryStrip}>
          <span className={styles.summaryLabel}>MLB SLATE</span>
          <span className={styles.summaryText}>{summary.text}</span>
          <span className={`${styles.summaryBadge} ${styles[`quality${summary.quality.replace(/\s/g, '')}`]}`}>
            {summary.quality}
          </span>
        </div>
      )}

      {!hasPicks ? (
        <div className={styles.emptyBoard}>
          <p className={styles.emptyTitle}>No qualified MLB edges right now</p>
          <p className={styles.emptyDesc}>
            Maximus is waiting for stronger signal alignment before posting today's board.
          </p>
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
                />
              ))}
            </div>
          </div>
          {/* Expand/collapse CTA — bottom-right */}
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

      {/* Footer */}
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
