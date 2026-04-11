/**
 * MLB Team Intel — premium league-wide team intelligence hub.
 *
 * Design: two-column AL/NL layout derived from PennantWatch, with enriched
 * team rows showing 2025 record, 2025 finish, projected wins, and
 * championship odds. Each row links to the team detail page.
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { getMLBTeamsGroupedByDivision } from '../../sports/mlb/teams';
import { getTeamMeta } from '../../data/mlb/teamMeta';
import { getSeasonProjections } from '../../data/mlb/seasonModel';
import { getMlbEspnLogoUrl } from '../../utils/espnMlbLogos';
import { fetchMlbChampionshipOdds } from '../../api/mlbChampionshipOdds';
import styles from './MlbTeams.module.css';

function formatOdds(american) {
  if (american == null) return null;
  return american > 0 ? `+${american}` : `${american}`;
}

function TeamRow({ team, meta, projection, odds, divRank }) {
  const logoUrl = getMlbEspnLogoUrl(team.slug);
  const teamOdds = odds?.[team.slug];
  const oddsStr = teamOdds ? formatOdds(teamOdds.bestChanceAmerican) : null;

  return (
    <Link to={`/mlb/teams/${team.slug}`} className={styles.teamRow}>
      <div className={styles.teamIdentity}>
        <span className={styles.teamLogo}>
          {logoUrl ? (
            <img src={logoUrl} alt={team.name} width={32} height={32} loading="lazy" />
          ) : (
            <span className={styles.teamAbbrevFallback}>{team.abbrev}</span>
          )}
        </span>
        <div className={styles.teamNameCol}>
          <span className={styles.teamName}>{team.name}</span>
          {divRank && (
            <span className={styles.divRank}>{divRank} in {team.division}</span>
          )}
        </div>
      </div>

      <div className={styles.statStrip}>
        {meta?.record2025 && (
          <div className={styles.statCell}>
            <span className={styles.statLabel}>2025</span>
            <span className={styles.statValue}>{meta.record2025}</span>
          </div>
        )}
        {meta?.finish && (
          <div className={`${styles.statCell} ${styles.statCellWide}`}>
            <span className={styles.statLabel}>Finish</span>
            <span className={styles.statValueMuted}>{meta.finish}</span>
          </div>
        )}
        {projection?.projectedWins != null && (
          <div className={styles.statCell}>
            <span className={styles.statLabel}>Proj. W</span>
            <span className={styles.statValueAccent}>{projection.projectedWins}</span>
          </div>
        )}
        {oddsStr && (
          <div className={styles.statCell}>
            <span className={styles.statLabel}>WS</span>
            <span className={styles.oddsPill}>{oddsStr}</span>
          </div>
        )}
      </div>

      <span className={styles.rowArrow} aria-hidden>&rsaquo;</span>
    </Link>
  );
}

function DivisionBlock({ division, teams, odds, projectionMap, metaMap, divRanks }) {
  return (
    <div className={styles.divisionBlock}>
      <h4 className={styles.divisionTitle}>{division}</h4>
      <div className={styles.divisionTeams}>
        {teams.map((team) => (
          <TeamRow
            key={team.slug}
            team={team}
            meta={metaMap[team.slug]}
            projection={projectionMap[team.slug]}
            odds={odds}
            divRank={divRanks[team.slug]}
          />
        ))}
      </div>
    </div>
  );
}

function LeagueColumn({ league, divisions, odds, projectionMap, metaMap, divRanks }) {
  const isAL = league === 'AL';
  const logoSrc = isAL ? '/al-logo.png' : '/nl-logo.png';
  const leagueFull = isAL ? 'American League' : 'National League';

  return (
    <div className={styles.league}>
      <div className={styles.leagueHeader}>
        <img src={logoSrc} alt={leagueFull} className={styles.leagueLogo} loading="lazy" />
        <span className={`${styles.leagueBadge} ${isAL ? styles.leagueBadgeAL : styles.leagueBadgeNL}`}>
          {leagueFull}
        </span>
      </div>
      {divisions.map(({ division, teams }) => (
        <DivisionBlock
          key={division}
          division={division}
          teams={teams}
          odds={odds}
          projectionMap={projectionMap}
          metaMap={metaMap}
          divRanks={divRanks}
        />
      ))}
    </div>
  );
}

export default function MlbTeams() {
  const { workspace } = useWorkspace();
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

  const { projectionMap, metaMap, divRanks } = useMemo(() => {
    const projections = getSeasonProjections();
    const pMap = {};
    const mMap = {};
    for (const p of projections) {
      pMap[p.slug] = p;
      mMap[p.slug] = getTeamMeta(p.slug);
    }

    // Compute division rank by projected wins (descending)
    const ranks = {};
    for (const { division, teams } of grouped) {
      const sorted = [...teams].sort((a, b) =>
        (pMap[b.slug]?.projectedWins ?? 0) - (pMap[a.slug]?.projectedWins ?? 0)
      );
      sorted.forEach((t, i) => {
        const pos = i + 1;
        const suffix = pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th';
        ranks[t.slug] = `${pos}${suffix}`;
      });
    }

    return { projectionMap: pMap, metaMap: mMap, divRanks: ranks };
  }, [grouped]);

  return (
    <div className={styles.page}>
      <header className={styles.heroSection}>
        <span className={styles.eyebrow}>Team Intelligence</span>
        <h1 className={styles.pageTitle}>{workspace.emoji} MLB Team Intel</h1>
        <p className={styles.subtitle}>
          All 30 MLB teams with projected wins, championship odds, and Maximus season outlook.
        </p>
      </header>

      <div className={styles.leagueGrid}>
        <LeagueColumn
          league="AL"
          divisions={alDivisions}
          odds={odds}
          projectionMap={projectionMap}
          metaMap={metaMap}
          divRanks={divRanks}
        />
        <LeagueColumn
          league="NL"
          divisions={nlDivisions}
          odds={odds}
          projectionMap={projectionMap}
          metaMap={metaMap}
          divRanks={divRanks}
        />
      </div>

      {loading && (
        <p className={styles.loadingNote}>Loading championship odds...</p>
      )}
    </div>
  );
}
