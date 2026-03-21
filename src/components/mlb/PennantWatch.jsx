/**
 * Pennant Watch — MLB Home section showing all 30 teams in two league
 * columns (AL / NL), grouped by division or ranked by championship odds.
 * Clicking a team navigates to its MLB Team Intel page.
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getMLBTeamsGroupedByDivision } from '../../sports/mlb/teams';
import { getMlbEspnLogoUrl } from '../../utils/espnMlbLogos';
import { fetchMlbChampionshipOdds } from '../../api/mlbChampionshipOdds';
import styles from './PennantWatch.module.css';

function formatOdds(american) {
  if (american == null) return '—';
  return american > 0 ? `+${american}` : `${american}`;
}

function oddsSort(a, b) {
  const aVal = a.odds ?? Infinity;
  const bVal = b.odds ?? Infinity;
  if (aVal === bVal) return a.team.name.localeCompare(b.team.name);
  return aVal - bVal;
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
      <span className={styles.teamName}>{team.name}</span>
      <span className={styles.oddsBadge}>
        <span className={styles.oddsBadgeTrophy} aria-hidden>🏆</span>
        {oddsStr}
      </span>
    </Link>
  );
}

function DivisionBlock({ division, teams, odds }) {
  const sorted = useMemo(() => {
    return [...teams].sort((a, b) => oddsSort(
      { team: a, odds: odds?.[a.slug]?.bestChanceAmerican },
      { team: b, odds: odds?.[b.slug]?.bestChanceAmerican },
    ));
  }, [teams, odds]);

  return (
    <div className={styles.divisionBlock}>
      <h4 className={styles.divisionTitle}>{division}</h4>
      <div className={styles.divisionTeams}>
        {sorted.map((team) => (
          <TeamRow key={team.slug} team={team} odds={odds} />
        ))}
      </div>
    </div>
  );
}

export default function PennantWatch() {
  const [odds, setOdds] = useState({});
  const [loading, setLoading] = useState(true);
  const [alMode, setAlMode] = useState('division');
  const [nlMode, setNlMode] = useState('division');

  useEffect(() => {
    fetchMlbChampionshipOdds()
      .then((data) => setOdds(data.odds ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const grouped = getMLBTeamsGroupedByDivision();
  const alDivisions = grouped.filter((g) => g.division.startsWith('AL'));
  const nlDivisions = grouped.filter((g) => g.division.startsWith('NL'));

  const handleFilter = (league, mode) => {
    if (league === 'AL') setAlMode(mode);
    else setNlMode(mode);
  };

  return (
    <section className={styles.root}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>World Series Futures</span>
        <h3 className={styles.title}>Pennant Watch</h3>
      </div>

      <div className={styles.leagueGrid}>
        <LeagueColumnWithFilter
          league="AL"
          divisions={alDivisions}
          odds={odds}
          mode={alMode}
          onFilter={handleFilter}
        />
        <LeagueColumnWithFilter
          league="NL"
          divisions={nlDivisions}
          odds={odds}
          mode={nlMode}
          onFilter={handleFilter}
        />
      </div>

      {loading && (
        <p className={styles.loadingNote}>Loading championship odds…</p>
      )}
    </section>
  );
}

function LeagueColumnWithFilter({ league, divisions, odds, mode, onFilter }) {
  const isAL = league === 'AL';
  const logoSrc = isAL ? '/al-logo.svg' : '/nl-logo.svg';
  const leagueFull = isAL ? 'American League' : 'National League';

  const flatSorted = useMemo(() => {
    if (mode !== 'odds') return null;
    const allTeams = divisions.flatMap((d) => d.teams);
    return allTeams
      .map((t) => ({ team: t, odds: odds?.[t.slug]?.bestChanceAmerican ?? null }))
      .sort(oddsSort)
      .map(({ team }) => team);
  }, [divisions, odds, mode]);

  return (
    <div className={styles.league}>
      <div className={styles.leagueHeader}>
        <img src={logoSrc} alt={leagueFull} className={styles.leagueLogo} />
        <span className={styles.leagueLabel}>{leagueFull}</span>
      </div>

      <div className={styles.filterRow}>
        <button
          className={`${styles.filterBtn} ${mode === 'division' ? styles.filterBtnActive : ''}`}
          onClick={() => onFilter(league, 'division')}
        >
          By Division
        </button>
        <button
          className={`${styles.filterBtn} ${mode === 'odds' ? styles.filterBtnActive : ''}`}
          onClick={() => onFilter(league, 'odds')}
        >
          By Odds
        </button>
      </div>

      {mode === 'division' ? (
        divisions.map(({ division, teams }) => (
          <DivisionBlock key={division} division={division} teams={teams} odds={odds} />
        ))
      ) : (
        <div className={styles.divisionBlock}>
          <div className={styles.divisionTeams}>
            {flatSorted?.map((team) => (
              <TeamRow key={team.slug} team={team} odds={odds} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
