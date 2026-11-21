/**
 * OffseasonPanel — stands in for a live surface (games slate, daily picks)
 * while a workspace's season is completed. Names the champion, shows the
 * countdown to the next season, and points to the full recap.
 *
 * `returns` finishes the sentence "… return(s) on Opening Night", e.g.
 * "The daily slate returns" or "Daily picks return".
 */

import { Link } from 'react-router-dom';
import SeasonCountdown from './SeasonCountdown';
import SeasonTeamLogo from './SeasonTeamLogo';
import { accentStyle } from './seasonFormat';
import styles from './season.module.css';

export default function OffseasonPanel({ workspace, returns, links = [] }) {
  const ch = workspace?.championship;
  if (!ch) return null;

  const nextSeason = workspace.nextSeason;
  const seasonLabel = ch.seasonLabel || ch.year;
  const comeback = nextSeason
    ? `${returns || 'Live coverage returns'} on ${nextSeason.shortLabel || nextSeason.label}.`
    : `${returns || 'Live coverage returns'} when the next season starts.`;

  return (
    <section className={`${styles.scope} ${styles.panel}`} style={accentStyle(workspace)}>
      <div>
        <span className={styles.eyebrow}>Offseason</span>
        <h2 className={styles.panelTitle}>The {seasonLabel} {workspace.shortLabel} season is complete</h2>
        <p className={styles.panelText}>
          <span className={styles.panelChamp}>
            <SeasonTeamLogo workspaceId={workspace.id} slug={ch.championSlug} name={ch.champion} size={20} />
            {ch.champion}
          </span>{' '}
          won the {ch.scoreLabel}, {ch.score} over the {ch.runnerUp}.
        </p>
        <p className={styles.panelText}>{comeback}</p>
        <div className={styles.actions}>
          <Link to={workspace.routeBase || '/'} className={styles.primaryLink}>
            View the {seasonLabel} season recap
          </Link>
          {links.map((l) => (
            <Link key={l.to} to={l.to} className={styles.secondaryLink}>{l.label}</Link>
          ))}
        </div>
      </div>

      <SeasonCountdown nextSeason={nextSeason} />
    </section>
  );
}
