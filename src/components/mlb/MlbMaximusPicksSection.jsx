/**
 * MlbMaximusPicksSection — Maximus's Picks for MLB Home.
 *
 * 4 category columns: Pick 'Ems, ATS, Leans, Game Totals
 * Structurally parallels NCAAM MaximusPicks section.
 * MLB palette: burgundy / navy / white / warm neutrals.
 */

import { useState, useEffect, useMemo } from 'react';
import { buildMlbPicks, hasAnyPicks } from '../../features/mlb/picks/buildMlbPicks';
import { getMlbEspnLogoUrl } from '../../utils/espnMlbLogos';
import styles from './MlbMaximusPicksSection.module.css';

const CATEGORIES = [
  { key: 'pickEms', label: "PICK 'EMS", desc: 'Model-backed moneyline winners' },
  { key: 'ats', label: 'RUN LINE', desc: 'Spread-covering projections' },
  { key: 'leans', label: 'VALUE LEANS', desc: 'Directional value signals' },
  { key: 'totals', label: 'GAME TOTALS', desc: 'Over/under model leans' },
];

const CONF_LABELS = { high: 'HIGH', medium: 'MED', low: 'LOW' };
const CONF_CLS = { high: 'confHigh', medium: 'confMed', low: 'confLow' };
const MAX_SHOW = 4;

function formatTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

function PickCard({ pick }) {
  const { matchup, pick: p, confidence, model } = pick;
  const awayLogo = getMlbEspnLogoUrl(matchup.awayTeam.slug);
  const homeLogo = getMlbEspnLogoUrl(matchup.homeTeam.slug);
  const time = formatTime(matchup.startTime);

  return (
    <div className={styles.pickCard}>
      <div className={styles.pickHeader}>
        <span className={`${styles.confBadge} ${styles[CONF_CLS[confidence]] || ''}`}>
          {CONF_LABELS[confidence] || confidence}
        </span>
        {time && <span className={styles.pickTime}>{time}</span>}
      </div>

      <div className={styles.matchup}>
        <div className={styles.teamRow}>
          {awayLogo && <img src={awayLogo} alt="" className={styles.teamLogo} width={20} height={20} loading="lazy" />}
          <span className={styles.teamName}>{matchup.awayTeam.shortName}</span>
          {matchup.awayTeam.record && <span className={styles.teamRecord}>{matchup.awayTeam.record}</span>}
        </div>
        <div className={styles.teamRow}>
          {homeLogo && <img src={homeLogo} alt="" className={styles.teamLogo} width={20} height={20} loading="lazy" />}
          <span className={styles.teamName}>{matchup.homeTeam.shortName}</span>
          {matchup.homeTeam.record && <span className={styles.teamRecord}>{matchup.homeTeam.record}</span>}
        </div>
      </div>

      <div className={styles.pickLabel}>{p.label}</div>

      {p.topSignals?.length > 0 && (
        <div className={styles.signals}>
          {p.topSignals.slice(0, 2).map((s, i) => (
            <span key={i} className={styles.signalChip}>{s}</span>
          ))}
        </div>
      )}

      {model?.edge != null && (
        <span className={styles.edgeBadge}>
          {(model.edge * 100).toFixed(1)}% edge
        </span>
      )}
    </div>
  );
}

export default function MlbMaximusPicksSection() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/mlb/live/games?status=all&sort=importance')
      .then(r => r.json())
      .then(d => setGames(d.games ?? d ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const picks = useMemo(() => {
    if (!games.length) return null;
    try {
      return buildMlbPicks({ games });
    } catch {
      return null;
    }
  }, [games]);

  const showSection = !loading && picks && hasAnyPicks(picks);

  if (loading) return null; // Don't show skeleton for picks
  if (!showSection) return null; // Hide entirely if no qualified picks

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.eyebrow}>Betting Intelligence</span>
          <h2 className={styles.title}>Maximus's Picks</h2>
        </div>
        <span className={styles.subtitle}>Data-driven leans across today's MLB slate</span>
      </div>

      <div className={styles.categoryGrid}>
        {CATEGORIES.map(cat => {
          const items = picks.categories[cat.key] || [];
          return (
            <div key={cat.key} className={styles.category}>
              <div className={styles.catHeader}>
                <span className={styles.catLabel}>{cat.label}</span>
                {items.length > 0 && <span className={styles.catCount}>{items.length}</span>}
              </div>
              <p className={styles.catDesc}>{cat.desc}</p>
              <div className={styles.pickList}>
                {items.length === 0 ? (
                  <div className={styles.emptyState}>No qualified picks</div>
                ) : (
                  items.slice(0, MAX_SHOW).map(pick => (
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
    </section>
  );
}
