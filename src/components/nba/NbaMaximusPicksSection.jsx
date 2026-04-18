/**
 * NbaMaximusPicksSection — 4-column picks board for NBA Home + Odds Insights.
 * Canonical builder: consumes /api/nba/picks/board (games + meta),
 * classifies client-side via buildNbaPicks. Mirrors MLB architecture.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { getNbaEspnLogoUrl } from '../../utils/espnNbaLogos';
import { buildNbaPicks, hasAnyNbaPicks } from '../../features/nba/picks/buildNbaPicks';
import styles from './NbaMaximusPicksSection.module.css';

const COLUMNS = [
  { key: 'pickEms', label: "Pick 'Ems", icon: '\u2714' },
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

function PickColumn({ column, picks, expanded, onToggle, mode }) {
  const shownCount = expanded ? picks.length : (mode === 'page' ? 5 : 3);
  const shown = picks.slice(0, shownCount);
  const hasMore = picks.length > shownCount;

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
  const { buildPath } = useWorkspace();
  const [boardState, setBoardState] = useState({ status: 'loading', picks: null, meta: null, error: null });
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    let cancelled = false;
    fetch('/api/nba/picks/board')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (cancelled) return;
        const games = Array.isArray(data.games) ? data.games : [];
        const picks = buildNbaPicks({ games });
        setBoardState({
          status: 'ready',
          picks,
          meta: {
            ...data.meta,
            buildMeta: picks.meta,
          },
          error: null,
        });
      })
      .catch(err => {
        if (cancelled) return;
        setBoardState({ status: 'error', picks: null, meta: null, error: err?.message || 'Failed to load' });
      });
    return () => { cancelled = true; };
  }, []);

  const { status, picks, meta, error } = boardState;
  const hasPicks = picks && hasAnyNbaPicks(picks);
  const totalPicks = picks?.categories
    ? Object.values(picks.categories).reduce((n, arr) => n + arr.length, 0)
    : 0;

  // ── Loading state ──
  if (status === 'loading') {
    return (
      <section className={styles.section}>
        <div className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Maximus Model</span>
            <h2 className={styles.title}>Maximus&rsquo;s Picks</h2>
          </div>
        </div>
        <div className={styles.loadingGrid}>
          {COLUMNS.map(col => (
            <div key={col.key} className={styles.loadingCol}>
              <div className={styles.skelHeader} />
              <div className={styles.skelCard} />
              <div className={styles.skelCard} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // ── Error state ──
  if (status === 'error') {
    return (
      <section className={styles.section}>
        <div className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Maximus Model</span>
            <h2 className={styles.title}>Maximus&rsquo;s Picks</h2>
          </div>
        </div>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>{'\u26A0\uFE0F'}</span>
          <h3>Picks Temporarily Unavailable</h3>
          <p>We couldn&rsquo;t load the picks board right now. Refresh in a moment or check back shortly.</p>
        </div>
      </section>
    );
  }

  // ── Diagnose empty state ──
  // Distinguish between: no games today, games exist but no edges, odds API missing
  const totalGames = meta?.upcoming ?? 0;
  const gamesWithOdds = meta?.withOdds ?? meta?.buildMeta?.gamesWithOdds ?? 0;
  const qualifiedGames = meta?.buildMeta?.qualifiedGames ?? 0;

  let emptyReason = null;
  if (!hasPicks) {
    if (totalGames === 0) {
      emptyReason = {
        title: 'No Games Scheduled',
        body: 'The NBA picks board will return when the next slate of games tips off.',
      };
    } else if (gamesWithOdds === 0) {
      emptyReason = {
        title: 'Odds Data Loading',
        body: `${totalGames} upcoming ${totalGames === 1 ? 'game' : 'games'} on the slate, but market odds are syncing. Check back in a few minutes.`,
      };
    } else if (qualifiedGames === 0) {
      emptyReason = {
        title: 'No Qualified Edges Right Now',
        body: `The model evaluated ${gamesWithOdds} ${gamesWithOdds === 1 ? 'game' : 'games'} but none cleared our conviction threshold. Board refreshes as lines move.`,
      };
    } else {
      emptyReason = {
        title: 'Board Building',
        body: 'Picks are being compiled. Refresh in a moment.',
      };
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Maximus Model</span>
          <h2 className={styles.title}>Maximus&rsquo;s Picks</h2>
        </div>
        <div className={styles.headerRight}>
          {totalPicks > 0 && <span className={styles.boardBadge}>{totalPicks} picks today</span>}
          {mode === 'home' && totalPicks > 0 && (
            <Link to={buildPath('/insights')} className={styles.viewAllLink}>View all &rarr;</Link>
          )}
        </div>
      </div>

      {hasPicks ? (
        <div className={styles.grid}>
          {COLUMNS.map(col => (
            <PickColumn
              key={col.key}
              column={col}
              picks={picks.categories[col.key] || []}
              expanded={!!expanded[col.key]}
              onToggle={() => setExpanded(prev => ({ ...prev, [col.key]: !prev[col.key] }))}
              mode={mode}
            />
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>{'\uD83C\uDFC0'}</span>
          <h3>{emptyReason.title}</h3>
          <p>{emptyReason.body}</p>
        </div>
      )}

      {hasPicks && <p className={styles.disclaimer}>For entertainment purposes only. Not financial advice.</p>}
    </section>
  );
}
