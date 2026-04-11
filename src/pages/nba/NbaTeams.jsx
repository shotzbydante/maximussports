/**
 * NBA Team Intel — premium conference/division board.
 * Two conference columns (East/West) with 3 divisions each.
 * Fetches live standings, records, and championship odds.
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../workspaces/WorkspaceContext';
import { NBA_TEAMS } from '../../sports/nba/teams';
import { getNbaEspnLogoUrl } from '../../utils/espnNbaLogos';
import { fetchNbaTeamBoard } from '../../api/nbaTeamBoard';
import { fetchNbaChampionshipOdds } from '../../api/nbaChampionshipOdds';
import styles from './NbaTeams.module.css';

const EAST_DIVISIONS = ['Atlantic', 'Central', 'Southeast'];
const WEST_DIVISIONS = ['Northwest', 'Pacific', 'Southwest'];

function formatOdds(american) {
  if (american == null) return '\u2014';
  return american > 0 ? `+${american}` : `${american}`;
}

function TeamRow({ team, boardData, odds, buildPath }) {
  const logo = getNbaEspnLogoUrl(team.slug);
  const board = boardData?.[team.slug];
  const teamOdds = odds?.[team.slug];

  return (
    <Link to={buildPath(`/teams/${team.slug}`)} className={styles.teamRow}>
      <div className={styles.teamIdentity}>
        {logo && <img src={logo} alt="" className={styles.teamLogo} width={28} height={28} loading="lazy" />}
        <div className={styles.teamNameCol}>
          <span className={styles.teamName}>{team.name}</span>
          <span className={styles.teamAbbrev}>{team.abbrev}</span>
        </div>
      </div>
      <div className={styles.teamStats}>
        {board?.record ? (
          <span className={styles.record}>{board.record}</span>
        ) : (
          <span className={styles.recordEmpty}>\u2014</span>
        )}
        {board?.standing ? (
          <span className={styles.standing}>{board.standing}</span>
        ) : (
          <span className={styles.standingEmpty}>\u2014</span>
        )}
        {board?.streak ? (
          <span className={`${styles.streak} ${board.streak.startsWith('W') ? styles.streakWin : styles.streakLoss}`}>
            {board.streak}
          </span>
        ) : (
          <span className={styles.streakEmpty}>\u2014</span>
        )}
      </div>
      <div className={styles.teamOdds}>
        {teamOdds?.bestPayoutAmerican != null ? (
          <span className={styles.oddsValue}>{formatOdds(teamOdds.bestPayoutAmerican)}</span>
        ) : (
          <span className={styles.oddsEmpty}>\u2014</span>
        )}
      </div>
      <span className={styles.chevron} aria-hidden>&#8250;</span>
    </Link>
  );
}

function DivisionCard({ division, teams, boardData, odds, buildPath }) {
  return (
    <div className={styles.divisionCard}>
      <div className={styles.divisionHeader}>
        <span className={styles.divisionLabel}>{division}</span>
        <span className={styles.divisionCount}>{teams.length} teams</span>
      </div>
      <div className={styles.divisionHeaderRow}>
        <span className={styles.colTeam}>Team</span>
        <span className={styles.colRecord}>Record</span>
        <span className={styles.colStanding}>Standing</span>
        <span className={styles.colStreak}>Streak</span>
        <span className={styles.colOdds}>Title</span>
        <span className={styles.colChevron}></span>
      </div>
      <div className={styles.teamList}>
        {teams.map(team => (
          <TeamRow
            key={team.slug}
            team={team}
            boardData={boardData}
            odds={odds}
            buildPath={buildPath}
          />
        ))}
      </div>
    </div>
  );
}

export default function NbaTeams() {
  const { workspace, buildPath } = useWorkspace();
  const [boardData, setBoardData] = useState({});
  const [odds, setOdds] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      fetchNbaTeamBoard(),
      fetchNbaChampionshipOdds(),
    ]).then(([boardRes, oddsRes]) => {
      if (boardRes.status === 'fulfilled') {
        const board = boardRes.value.board || [];
        const map = {};
        for (const t of board) map[t.slug] = t;
        setBoardData(map);
      }
      if (oddsRes.status === 'fulfilled') {
        setOdds(oddsRes.value.odds || {});
      }
    }).finally(() => setLoading(false));
  }, []);

  const eastTeams = useMemo(() => {
    const byDiv = {};
    for (const div of EAST_DIVISIONS) byDiv[div] = [];
    for (const t of NBA_TEAMS) {
      if (t.conference === 'Eastern' && byDiv[t.division]) {
        byDiv[t.division].push(t);
      }
    }
    // Sort by conference rank within division
    for (const div of EAST_DIVISIONS) {
      byDiv[div].sort((a, b) => (boardData[a.slug]?.confRank || 99) - (boardData[b.slug]?.confRank || 99));
    }
    return byDiv;
  }, [boardData]);

  const westTeams = useMemo(() => {
    const byDiv = {};
    for (const div of WEST_DIVISIONS) byDiv[div] = [];
    for (const t of NBA_TEAMS) {
      if (t.conference === 'Western' && byDiv[t.division]) {
        byDiv[t.division].push(t);
      }
    }
    for (const div of WEST_DIVISIONS) {
      byDiv[div].sort((a, b) => (boardData[a.slug]?.confRank || 99) - (boardData[b.slug]?.confRank || 99));
    }
    return byDiv;
  }, [boardData]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>
          <img src="/nba-logo.png" alt="NBA" className={styles.headerLogo} width={28} height={28} />
          NBA Team Intel
        </h1>
        <p className={styles.subtitle}>All 30 NBA teams — standings, championship odds, and intel across both conferences</p>
      </header>

      {loading ? (
        <div className={styles.loadingState}><p>Loading team intel...</p></div>
      ) : (
        <div className={styles.conferenceGrid}>
          {/* Eastern Conference */}
          <div className={styles.conferenceColumn}>
            <div className={styles.confHeader}>
              <img src="/nba-east-logo.png" alt="Eastern Conference" className={styles.confLogo} width={28} height={28} />
              <h2 className={styles.confTitle}>Eastern Conference</h2>
            </div>
            {EAST_DIVISIONS.map(div => (
              <DivisionCard
                key={div}
                division={div}
                teams={eastTeams[div] || []}
                boardData={boardData}
                odds={odds}
                buildPath={buildPath}
              />
            ))}
          </div>

          {/* Western Conference */}
          <div className={styles.conferenceColumn}>
            <div className={styles.confHeader}>
              <img src="/nba-west-logo.png" alt="Western Conference" className={styles.confLogo} width={28} height={28} />
              <h2 className={styles.confTitle}>Western Conference</h2>
            </div>
            {WEST_DIVISIONS.map(div => (
              <DivisionCard
                key={div}
                division={div}
                teams={westTeams[div] || []}
                boardData={boardData}
                odds={odds}
                buildPath={buildPath}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
