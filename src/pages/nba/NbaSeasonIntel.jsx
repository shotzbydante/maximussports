/**
 * NBA Season Intelligence — conference standings, championship odds,
 * and team outlooks.
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { NBA_TEAMS } from '../../sports/nba/teams';
import { getNbaEspnLogoUrl } from '../../utils/espnNbaLogos';
import { fetchNbaChampionshipOdds } from '../../api/nbaChampionshipOdds';
import styles from './NbaSeasonIntel.module.css';

function formatOdds(american) {
  if (american == null) return '\u2014';
  return american > 0 ? `+${american}` : `${american}`;
}

function impliedPct(american) {
  if (american == null) return null;
  const p = american < 0 ? Math.abs(american) / (Math.abs(american) + 100) : 100 / (american + 100);
  return Math.round(p * 1000) / 10;
}

export default function NbaSeasonIntel() {
  const { workspace, buildPath } = useWorkspace();
  const [odds, setOdds] = useState({});
  const [loading, setLoading] = useState(true);
  const [confFilter, setConfFilter] = useState('All');

  useEffect(() => {
    fetchNbaChampionshipOdds()
      .then(d => setOdds(d.odds || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const rankedTeams = useMemo(() => {
    return NBA_TEAMS
      .map(t => {
        const o = odds[t.slug];
        return {
          ...t,
          odds: o?.bestChanceAmerican ?? null,
          payout: o?.bestPayoutAmerican ?? null,
          implied: o?.bestChanceAmerican != null ? impliedPct(o.bestChanceAmerican) : null,
          booksCount: o?.booksCount ?? 0,
        };
      })
      .filter(t => confFilter === 'All' || t.conference === confFilter)
      .sort((a, b) => (b.implied ?? 0) - (a.implied ?? 0));
  }, [odds, confFilter]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>{workspace.emoji} NBA Season Intelligence</h1>
        <p className={styles.subtitle}>Championship odds, conference context, and team outlooks across the league</p>
      </header>

      <div className={styles.controls}>
        {['All', 'Eastern', 'Western'].map(c => (
          <button key={c} type="button"
            className={`${styles.confPill} ${confFilter === c ? styles.confPillActive : ''}`}
            onClick={() => setConfFilter(c)}>
            {c === 'All' ? 'All Teams' : `${c} Conference`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.loadingState}><p>Loading season intelligence...</p></div>
      ) : rankedTeams.length === 0 ? (
        <div className={styles.emptyState}><p>No championship odds available yet.</p></div>
      ) : (
        <div className={styles.teamList}>
          {rankedTeams.map((team, idx) => {
            const logo = getNbaEspnLogoUrl(team.slug);
            return (
              <Link key={team.slug} to={buildPath(`/teams/${team.slug}`)} className={styles.teamCard}>
                <span className={styles.rank}>{idx + 1}</span>
                {logo && <img src={logo} alt="" className={styles.teamLogo} width={32} height={32} loading="lazy" />}
                <div className={styles.teamInfo}>
                  <span className={styles.teamName}>{team.name}</span>
                  <span className={styles.teamConf}>{team.conference} &middot; {team.division}</span>
                </div>
                <div className={styles.oddsInfo}>
                  {team.odds != null ? (
                    <>
                      <span className={styles.oddsValue}>{formatOdds(team.payout)}</span>
                      {team.implied != null && (
                        <span className={styles.impliedPct}>{team.implied}%</span>
                      )}
                    </>
                  ) : (
                    <span className={styles.oddsNA}>N/A</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
