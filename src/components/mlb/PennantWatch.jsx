/**
 * Pennant Watch — MLB Home section showing all 30 teams
 * grouped by AL/NL → division with World Series championship odds.
 * Clicking a team navigates to its MLB Team Intel page.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getMLBTeamsGroupedByDivision, MLB_TEAMS } from '../../sports/mlb/teams';
import { getMlbEspnLogoUrl } from '../../utils/espnMlbLogos';
import { fetchMlbChampionshipOdds } from '../../api/mlbChampionshipOdds';
import styles from './PennantWatch.module.css';

function formatOdds(american) {
  if (american == null) return '—';
  return american > 0 ? `+${american}` : `${american}`;
}

function TeamRow({ team, odds }) {
  const logoUrl = getMlbEspnLogoUrl(team.slug);
  const teamOdds = odds?.[team.slug];
  const oddsStr = teamOdds ? formatOdds(teamOdds.bestChanceAmerican) : '—';

  return (
    <Link to={`/mlb/teams/${team.slug}`} className={styles.teamRow}>
      <span className={styles.teamLogo}>
        {logoUrl ? (
          <img src={logoUrl} alt={team.name} width={28} height={28} loading="lazy" />
        ) : (
          <span className={styles.teamAbbrevFallback}>{team.abbrev}</span>
        )}
      </span>
      <span className={styles.teamName}>
        {team.name} <span className={styles.trophy} aria-hidden>🏆</span>
      </span>
      <span className={styles.teamOdds}>{oddsStr}</span>
    </Link>
  );
}

function DivisionBlock({ division, teams, odds }) {
  return (
    <div className={styles.divisionBlock}>
      <h4 className={styles.divisionTitle}>{division}</h4>
      <div className={styles.divisionTeams}>
        {teams.map((team) => (
          <TeamRow key={team.slug} team={team} odds={odds} />
        ))}
      </div>
    </div>
  );
}

export default function PennantWatch() {
  const [odds, setOdds] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMlbChampionshipOdds()
      .then((data) => setOdds(data.odds ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const grouped = getMLBTeamsGroupedByDivision();
  const alDivisions = grouped.filter((g) => g.division.startsWith('AL'));
  const nlDivisions = grouped.filter((g) => g.division.startsWith('NL'));

  return (
    <section className={styles.root}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>World Series Futures</span>
        <h3 className={styles.title}>Pennant Watch</h3>
      </div>

      <div className={styles.leagueGrid}>
        <div className={styles.league}>
          <h4 className={styles.leagueTitle}>American League</h4>
          {alDivisions.map(({ division, teams }) => (
            <DivisionBlock key={division} division={division} teams={teams} odds={odds} />
          ))}
        </div>
        <div className={styles.league}>
          <h4 className={styles.leagueTitle}>National League</h4>
          {nlDivisions.map(({ division, teams }) => (
            <DivisionBlock key={division} division={division} teams={teams} odds={odds} />
          ))}
        </div>
      </div>

      {loading && (
        <p className={styles.loadingNote}>Loading championship odds…</p>
      )}
    </section>
  );
}
