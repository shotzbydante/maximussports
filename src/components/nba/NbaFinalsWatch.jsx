/**
 * NbaFinalsWatch — conference-organized team standings with championship odds.
 * Parallel to MLB PennantWatch.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { NBA_TEAMS } from '../../sports/nba/teams';
import { getNbaEspnLogoUrl } from '../../utils/espnNbaLogos';
import { fetchNbaChampionshipOdds } from '../../api/nbaChampionshipOdds';
import styles from './NbaFinalsWatch.module.css';

function formatOdds(american) {
  if (american == null) return '\u2014';
  return american > 0 ? `+${american}` : `${american}`;
}

export default function NbaFinalsWatch() {
  const { buildPath } = useWorkspace();
  const [odds, setOdds] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNbaChampionshipOdds()
      .then(d => setOdds(d.odds || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (Object.keys(odds).length === 0) return null;

  const eastern = NBA_TEAMS
    .filter(t => t.conference === 'Eastern')
    .map(t => ({ ...t, oddsVal: odds[t.slug]?.bestPayoutAmerican ?? null }))
    .filter(t => t.oddsVal != null)
    .sort((a, b) => {
      const aP = a.oddsVal < 0 ? Math.abs(a.oddsVal) / (Math.abs(a.oddsVal) + 100) : 100 / (a.oddsVal + 100);
      const bP = b.oddsVal < 0 ? Math.abs(b.oddsVal) / (Math.abs(b.oddsVal) + 100) : 100 / (b.oddsVal + 100);
      return bP - aP;
    });

  const western = NBA_TEAMS
    .filter(t => t.conference === 'Western')
    .map(t => ({ ...t, oddsVal: odds[t.slug]?.bestPayoutAmerican ?? null }))
    .filter(t => t.oddsVal != null)
    .sort((a, b) => {
      const aP = a.oddsVal < 0 ? Math.abs(a.oddsVal) / (Math.abs(a.oddsVal) + 100) : 100 / (a.oddsVal + 100);
      const bP = b.oddsVal < 0 ? Math.abs(b.oddsVal) / (Math.abs(b.oddsVal) + 100) : 100 / (b.oddsVal + 100);
      return bP - aP;
    });

  const renderConf = (label, teams) => (
    <div className={styles.confColumn}>
      <h3 className={styles.confTitle}>{label}</h3>
      <div className={styles.teamList}>
        {teams.map(t => {
          const logo = getNbaEspnLogoUrl(t.slug);
          return (
            <Link key={t.slug} to={buildPath(`/teams/${t.slug}`)} className={styles.teamRow}>
              {logo && <img src={logo} alt="" className={styles.teamLogo} width={22} height={22} loading="lazy" />}
              <span className={styles.teamName}>{t.name}</span>
              <span className={styles.teamOdds}>{formatOdds(t.oddsVal)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Finals Watch</h2>
      <p className={styles.sectionSub}>Championship odds by conference</p>
      <div className={styles.grid}>
        {renderConf('Eastern Conference', eastern)}
        {renderConf('Western Conference', western)}
      </div>
    </section>
  );
}
