import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { getMLBTeamsGroupedByDivision } from '../../sports/mlb/teams';
import styles from './MlbShared.module.css';

export default function MlbTeams() {
  const { workspace, buildPath } = useWorkspace();
  const grouped = getMLBTeamsGroupedByDivision();
  const [expandedDivs, setExpandedDivs] = useState({});

  const toggleDiv = (div) =>
    setExpandedDivs((prev) => ({ ...prev, [div]: !prev[div] }));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>{workspace.emoji} MLB Team Intel</h1>
        <p className={styles.subtitle}>All 30 MLB teams organized by division</p>
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
              <span aria-hidden>{expandedDivs[division] ? '▾' : '▸'}</span>
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
