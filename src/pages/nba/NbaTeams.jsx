import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { getNbaTeamsGroupedByDivision } from '../../sports/nba/teams';
import styles from './NbaShared.module.css';

export default function NbaTeams() {
  const { workspace, buildPath } = useWorkspace();
  const grouped = getNbaTeamsGroupedByDivision();
  const [expandedDivs, setExpandedDivs] = useState({});

  const toggleDiv = (div) =>
    setExpandedDivs((prev) => ({ ...prev, [div]: !prev[div] }));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>{workspace.emoji} NBA Team Intel</h1>
        <p className={styles.subtitle}>All 30 NBA teams organized by division</p>
      </header>

      <div className={styles.divisionGrid}>
        {grouped.map(({ division, teams }) => (
          <div key={division} className={styles.divisionCard}>
            <button
              type="button"
              className={styles.divisionHeader}
              onClick={() => toggleDiv(division)}
              aria-expanded={!!expandedDivs[division]}
            >
              <span className={styles.divisionLabel}>{division}</span>
              <span className={styles.divisionCount}>{teams.length} teams</span>
              <span aria-hidden>{expandedDivs[division] ? '\u25BE' : '\u25B8'}</span>
            </button>
            {expandedDivs[division] && (
              <div className={styles.teamList}>
                {teams.map((team) => (
                  <NavLink
                    key={team.slug}
                    to={buildPath(`/teams/${team.slug}`)}
                    className={styles.teamItem}
                  >
                    <span className={styles.teamAbbrev}>{team.abbrev}</span>
                    <span>{team.name}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
