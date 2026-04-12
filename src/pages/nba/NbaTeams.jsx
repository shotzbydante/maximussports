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
  if (american == null) return null;
  return american > 0 ? `+${american}` : `${american}`;
}

/** Shorten "2nd in Eastern" → "2nd East", "1st in Western" → "1st West" */
function shortenStanding(s) {
  if (!s) return null;
  return s
    .replace(/\s+in\s+Eastern/i, ' East')
    .replace(/\s+in\s+Western/i, ' West');
}

/** Parse streak string like "W4" or "L10|4" into clean form */
function parseStreak(raw) {
  if (!raw || typeof raw !== 'string') return null;
  // ESPN sometimes sends "W4", "L3", or "L10|4" formats
  const clean = raw.split('|')[0].trim();
  if (/^[WL]\d+$/i.test(clean)) return clean.toUpperCase();
  return null;
}

function FormDots({ streak, l10 }) {
  // Prefer L10 record if available
  if (l10) {
    return <span className={styles.formL10}>{l10}</span>;
  }
  // Fallback to streak pill
  const parsed = parseStreak(streak);
  if (!parsed) return <span className={styles.formEmpty}>{'\u2014'}</span>;

  const isWin = parsed.startsWith('W');
  return (
    <span className={`${styles.formPill} ${isWin ? styles.formPillWin : styles.formPillLoss}`}>
      {parsed}
    </span>
  );
}

function TeamRow({ team, boardData, odds, buildPath }) {
  const logo = getNbaEspnLogoUrl(team.slug);
  const board = boardData?.[team.slug];
  const teamOdds = odds?.[team.slug];
  const oddsStr = formatOdds(teamOdds?.bestPayoutAmerican);
  const standingStr = shortenStanding(board?.standing);

  return (
    <Link to={buildPath(`/teams/${team.slug}`)} className={styles.teamRow}>
      <span className={styles.colTeamCell}>
        {logo && <img src={logo} alt="" className={styles.teamLogo} width={26} height={26} loading="lazy" />}
        <span className={styles.teamNameCol}>
          <span className={styles.teamName}>{team.name}</span>
        </span>
      </span>
      <span className={styles.colRecordCell}>
        {board?.record || '\u2014'}
      </span>
      <span className={styles.colStandingCell}>
        {standingStr || '\u2014'}
      </span>
      <span className={styles.colFormCell}>
        <FormDots streak={board?.streak} l10={board?.l10} />
      </span>
      <span className={styles.colOddsCell}>
        {oddsStr ? (
          <span className={styles.oddsPill}>{oddsStr}</span>
        ) : (
          <span className={styles.oddsEmpty}>{'\u2014'}</span>
        )}
      </span>
    </Link>
  );
}

function DivisionCard({ division, teams, boardData, odds, buildPath }) {
  return (
    <div className={styles.divisionCard}>
      <div className={styles.divisionHeader}>
        <span className={styles.divisionLabel}>{division}</span>
      </div>
      <div className={styles.colHeaders}>
        <span className={styles.hdrTeam}>Team</span>
        <span className={styles.hdrRecord}>Record</span>
        <span className={styles.hdrStanding}>Standing</span>
        <span className={styles.hdrForm}>L10</span>
        <span className={styles.hdrOdds}>Title</span>
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
          <img src="/nba-logo.png" alt="NBA" className={styles.headerLogo} />
          NBA Team Intel
        </h1>
        <p className={styles.subtitle}>All 30 NBA teams &mdash; standings, championship odds, and intel across both conferences</p>
      </header>

      {loading ? (
        <div className={styles.loadingState}><p>Loading team intel...</p></div>
      ) : (
        <div className={styles.conferenceGrid}>
          {/* Eastern Conference */}
          <div className={styles.conferenceColumn}>
            <div className={`${styles.confHeader} ${styles.confHeaderEast}`}>
              <img src="/nba-east-logo.png" alt="Eastern Conference" className={styles.confLogo} />
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
            <div className={`${styles.confHeader} ${styles.confHeaderWest}`}>
              <img src="/nba-west-logo.png" alt="Western Conference" className={styles.confLogo} />
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
