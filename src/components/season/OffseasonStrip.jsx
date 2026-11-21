/**
 * OffseasonStrip — one-line season status for the top of secondary screens
 * (teams, news, models) while a workspace's season is completed: who won,
 * a running countdown to the next season, and a link to the full recap.
 */

import { Link } from 'react-router-dom';
import SeasonCountdown from './SeasonCountdown';
import TrophyIcon from './TrophyIcon';
import { accentStyle, shortTeamName } from './seasonFormat';
import styles from './season.module.css';

export default function OffseasonStrip({ workspace }) {
  const ch = workspace?.championship;
  if (!ch) return null;

  const seasonLabel = ch.seasonLabel || ch.year;

  return (
    <aside
      className={`${styles.scope} ${styles.strip}`}
      style={accentStyle(workspace)}
      aria-label={`${workspace.shortLabel} offseason status`}
    >
      <span className={styles.stripChamp}>
        <TrophyIcon size={16} className={styles.stripTrophy} />
        <span>
          {seasonLabel} season complete · <strong>{shortTeamName(ch.champion)}</strong> won the {ch.scoreLabel}
        </span>
      </span>
      <SeasonCountdown nextSeason={workspace.nextSeason} variant="inline" className={styles.stripClock} />
      <Link to={workspace.routeBase || '/'} className={styles.stripLink}>
        Season recap →
      </Link>
    </aside>
  );
}
