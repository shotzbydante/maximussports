/**
 * MlbMaximusPicksSection — premium MLB picks board.
 *
 * Supports two modes:
 *   - "home": compact with expand/collapse, curated caps
 *   - "page": fuller board for standalone Odds Insights page
 *
 * Features:
 *   - Date/time clarity for series games
 *   - Expand/collapse like NCAAM
 *   - Board summary strip
 *   - Glass premium treatment
 */

import { useState, useEffect, useMemo } from 'react';
import { buildMlbPicks, hasAnyPicks } from '../../features/mlb/picks/buildMlbPicks';
import { getMlbEspnLogoUrl } from '../../utils/espnMlbLogos';
import styles from './MlbMaximusPicksSection.module.css';

const CATEGORIES = [
  { key: 'pickEms', label: "PICK 'EMS", icon: '🎯', desc: 'Model-backed moneyline winners' },
  { key: 'ats', label: 'AGAINST THE SPREAD', icon: '📐', desc: 'Run line recommendations' },
  { key: 'leans', label: 'VALUE LEANS', icon: '💡', desc: 'Directional value opportunities' },
  { key: 'totals', label: 'GAME TOTALS', icon: '📊', desc: 'Over/under model leans' },
];

const CONF_LABELS = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };
const CONF_CLS = { high: 'confHigh', medium: 'confMed', low: 'confLow' };
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
    if (diffDays === 0) return 'TODAY';
    if (diffDays === 1) return 'TOMORROW';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
  } catch { return ''; }
}

/** Generate a board summary sentence. */
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
  if (ats > 0) parts.push(`${ats} run line signal${ats > 1 ? 's' : ''}`);
  if (leans > 0) parts.push(`${leans} value lean${leans > 1 ? 's' : ''}`);
  if (tots > 0) parts.push(`${tots} total${tots > 1 ? 's' : ''} spot${tots > 1 ? 's' : ''}`);

  const highCount = [c.pickEms, c.ats, c.leans, c.totals]
    .flat().filter(p => p?.confidence === 'high').length;

  let quality = 'MIXED SLATE';
  if (highCount >= 4) quality = 'STRONG';
  else if (leans > pe + ats) quality = 'VALUE HEAVY';

  return { text: `Today's board: ${parts.join(', ')} across the MLB slate.`, quality };
}

function PickCard({ pick }) {
  const { matchup, pick: p, confidence, model } = pick;
  const awayLogo = getMlbEspnLogoUrl(matchup?.awayTeam?.slug);
  const homeLogo = getMlbEspnLogoUrl(matchup?.homeTeam?.slug);
  const time = formatTime(matchup?.startTime);
  const dayLabel = formatDayLabel(matchup?.startTime);
  const isHigh = confidence === 'high';

  return (
    <div className={`${styles.pickCard} ${isHigh ? styles.pickCardHigh : ''}`}>
      {/* Day/time header */}
      <div className={styles.pickHeader}>
        <div className={styles.pickHeaderLeft}>
          {dayLabel && <span className={styles.dayBadge}>{dayLabel}</span>}
          {confidence && (
            <span className={`${styles.confBadge} ${styles[CONF_CLS[confidence]] || ''}`}>
              {CONF_LABELS[confidence]}
            </span>
          )}
        </div>
        {time && <span className={styles.pickTime}>{time}</span>}
      </div>

      {/* Matchup */}
      <div className={styles.matchup}>
        <div className={styles.teamRow}>
          {awayLogo && <img src={awayLogo} alt="" className={styles.teamLogo} width={22} height={22} loading="lazy" />}
          <span className={styles.teamName}>{matchup?.awayTeam?.shortName}</span>
          {matchup?.awayTeam?.record && <span className={styles.teamRecord}>{matchup.awayTeam.record}</span>}
        </div>
        <span className={styles.vsLabel}>vs</span>
        <div className={styles.teamRow}>
          {homeLogo && <img src={homeLogo} alt="" className={styles.teamLogo} width={22} height={22} loading="lazy" />}
          <span className={styles.teamName}>{matchup?.homeTeam?.shortName}</span>
          {matchup?.homeTeam?.record && <span className={styles.teamRecord}>{matchup.homeTeam.record}</span>}
        </div>
      </div>

      {/* Pick value — hero element */}
      <div className={styles.pickValue}>{p?.label}</div>

      {/* Signals */}
      {p?.topSignals?.length > 0 && (
        <div className={styles.signals}>
          {p.topSignals.slice(0, 2).map((s, i) => (
            <span key={i} className={styles.signalChip}>✓ {s}</span>
          ))}
        </div>
      )}

      {/* Edge + model info */}
      {model?.edge != null && model.edge > 0 && (
        <div className={styles.edgeRow}>
          <span className={styles.edgeBadge}>{(model.edge * 100).toFixed(1)}% edge</span>
          {model?.dataQuality != null && (
            <span className={styles.dqLabel}>DQ: {Math.round(model.dataQuality * 100)}%</span>
          )}
        </div>
      )}
    </div>
  );
}

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

  if (loading) {
    return (
      <section className={styles.section}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.eyebrow}>Betting Intelligence</span>
            <h2 className={styles.title}>{mode === 'page' ? 'Odds Insights' : "Maximus's Picks"}</h2>
          </div>
        </div>
        <div className={styles.loadingState}>
          <span className={styles.loadingDot} />
          Evaluating today's MLB slate…
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.eyebrow}>Betting Intelligence</span>
          <h2 className={styles.title}>{mode === 'page' ? 'Odds Insights' : "Maximus's Picks"}</h2>
        </div>
        <div className={styles.headerRight}>
          {hasPicks && mode === 'home' && (
            <button type="button" className={styles.expandToggle}
              onClick={() => setExpanded(v => !v)}>
              {expanded ? 'Collapse picks ▴' : 'Show all picks ▾'}
            </button>
          )}
        </div>
      </div>

      {/* Summary strip */}
      {summary && hasPicks && (
        <div className={styles.summaryStrip}>
          <span className={styles.summaryLabel}>NEXT SLATE PICKS</span>
          <span className={styles.summaryText}>{summary.text}</span>
          <span className={styles.summaryBadge} data-quality={summary.quality.toLowerCase().replace(/\s/g, '-')}>
            {summary.quality}
          </span>
        </div>
      )}

      {!hasPicks ? (
        <div className={styles.emptyBoard}>
          <div className={styles.emptyIcon}>⚾</div>
          <p className={styles.emptyTitle}>No qualified MLB edges right now</p>
          <p className={styles.emptyDesc}>
            Maximus is waiting for stronger signal alignment before posting today's board.
            Check back as lines and slate context settle.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.categoryGrid}>
            {CATEGORIES.map(cat => {
              const items = picks.categories[cat.key] || [];
              const cap = getCap();
              return (
                <div key={cat.key} className={styles.category}>
                  <div className={styles.catHeader}>
                    <span className={styles.catIcon}>{cat.icon}</span>
                    <span className={styles.catLabel}>{cat.label}</span>
                    {items.length > 0 && <span className={styles.catCount}>{items.length}</span>}
                  </div>
                  <p className={styles.catDesc}>{cat.desc}</p>
                  <div className={styles.pickList}>
                    {items.length === 0 ? (
                      <div className={styles.catEmpty}>No qualified picks</div>
                    ) : (
                      items.slice(0, cap).map(pick => (
                        <PickCard key={pick.id} pick={pick} />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {picks.meta && (
            <p className={styles.metaLine}>
              {picks.meta.qualifiedGames} game{picks.meta.qualifiedGames !== 1 ? 's' : ''} with picks · {picks.meta.totalCandidates} candidates evaluated
            </p>
          )}
        </>
      )}
    </section>
  );
}
