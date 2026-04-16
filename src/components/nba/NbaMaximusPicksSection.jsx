/**
 * NbaMaximusPicksSection — 4-column picks board for NBA Home.
 * Categories: Pick 'Ems, ATS, Value Leans, Game Totals.
 * Mirrors MLB MlbMaximusPicksSection architecture.
 */

import { useState, useEffect } from 'react';
import { getNbaEspnLogoUrl } from '../../utils/espnNbaLogos';
import styles from './NbaMaximusPicksSection.module.css';

const COLUMNS = [
  { key: 'pickEms', label: "Pick 'Ems", icon: '\u2714\uFE0F' },
  { key: 'ats', label: 'ATS', icon: '\uD83D\uDCCA' },
  { key: 'leans', label: 'Value Leans', icon: '\uD83D\uDCC8' },
  { key: 'totals', label: 'Game Totals', icon: '\u00B1' },
];

const CONF_LABELS = { high: 'High', medium: 'Med', low: 'Low' };

function PickCard({ pick }) {
  const { matchup, pick: p, confidence } = pick;
  const awayLogo = getNbaEspnLogoUrl(matchup.awayTeam?.slug);
  const homeLogo = getNbaEspnLogoUrl(matchup.homeTeam?.slug);

  return (
    <div className={styles.pickCard}>
      <div className={styles.pickMatchup}>
        <div className={styles.pickTeam}>
          {awayLogo && <img src={awayLogo} alt="" className={styles.pickLogo} />}
          <span className={styles.pickTeamName}>{matchup.awayTeam?.abbrev || matchup.awayTeam?.shortName}</span>
        </div>
        <span className={styles.pickVs}>@</span>
        <div className={styles.pickTeam}>
          {homeLogo && <img src={homeLogo} alt="" className={styles.pickLogo} />}
          <span className={styles.pickTeamName}>{matchup.homeTeam?.abbrev || matchup.homeTeam?.shortName}</span>
        </div>
      </div>
      <div className={styles.pickBody}>
        <span className={styles.pickLabel}>{p.label}</span>
        <span className={`${styles.confBadge} ${styles[`conf${confidence}`]}`}>{CONF_LABELS[confidence] || confidence}</span>
      </div>
      {p.topSignals?.length > 0 && (
        <div className={styles.pickSignals}>
          {p.topSignals.map((s, i) => <span key={i} className={styles.signal}>{s}</span>)}
        </div>
      )}
      {p.explanation && <p className={styles.pickExplainer}>{p.explanation}</p>}
    </div>
  );
}

function PickColumn({ column, picks, expanded, onToggle }) {
  const shown = expanded ? picks : picks.slice(0, 3);
  const hasMore = picks.length > 3;

  return (
    <div className={styles.column}>
      <div className={styles.colHeader}>
        <span className={styles.colIcon}>{column.icon}</span>
        <span className={styles.colLabel}>{column.label}</span>
        <span className={styles.colCount}>{picks.length}</span>
      </div>
      <div className={styles.colBody}>
        {shown.length === 0 ? (
          <p className={styles.emptyCol}>No qualified picks</p>
        ) : (
          shown.map(pick => <PickCard key={pick.id} pick={pick} />)
        )}
      </div>
      {hasMore && (
        <button type="button" className={styles.expandBtn} onClick={onToggle}>
          {expanded ? 'Show less' : `Show all ${picks.length}`}
        </button>
      )}
    </div>
  );
}

export default function NbaMaximusPicksSection({ mode = 'home' }) {
  const [categories, setCategories] = useState({ pickEms: [], ats: [], leans: [], totals: [] });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    fetch('/api/nba/picks/board')
      .then(r => r.json())
      .then(d => setCategories(d.categories || { pickEms: [], ats: [], leans: [], totals: [] }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalPicks = Object.values(categories).reduce((n, arr) => n + arr.length, 0);

  if (loading) {
    return (
      <section className={styles.section}>
        <div className={styles.header}>
          <span className={styles.eyebrow}>Maximus Model</span>
          <h2 className={styles.title}>Maximus&rsquo;s Picks</h2>
        </div>
        <p className={styles.loading}>Loading picks board&hellip;</p>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Maximus Model</span>
          <h2 className={styles.title}>Maximus&rsquo;s Picks</h2>
        </div>
        {totalPicks > 0 && (
          <span className={styles.boardBadge}>Today&rsquo;s board: {totalPicks} picks</span>
        )}
      </div>

      {totalPicks === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>{'\uD83C\uDFC0'}</span>
          <h3>No Picks on Today&rsquo;s Board</h3>
          <p>Check back when games are scheduled for model picks and market edges.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {COLUMNS.map(col => (
            <PickColumn
              key={col.key}
              column={col}
              picks={categories[col.key] || []}
              expanded={!!expanded[col.key]}
              onToggle={() => setExpanded(prev => ({ ...prev, [col.key]: !prev[col.key] }))}
            />
          ))}
        </div>
      )}

      <p className={styles.disclaimer}>For entertainment purposes only. Not financial advice.</p>
    </section>
  );
}
