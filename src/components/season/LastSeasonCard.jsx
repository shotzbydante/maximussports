/**
 * LastSeasonCard — compact recap of the previous season for an in-season
 * home page: the defending champion and final result, with the full recap
 * and key facts one tap away. No countdown; the new season is already live.
 */

import SeasonTeamLogo from './SeasonTeamLogo';
import TrophyIcon from './TrophyIcon';
import { FactList } from './SeasonRecap';
import { accentStyle, formatSeasonDate } from './seasonFormat';
import styles from './season.module.css';

export default function LastSeasonCard({ workspace, tinted = false }) {
  const ch = workspace?.championship;
  if (!ch) return null;

  const recap = workspace.recap || {};
  const seasonLabel = ch.seasonLabel || ch.year;
  const decided = formatSeasonDate(ch.decidedOn);
  const hasDetails = recap.paragraphs?.length > 0 || recap.facts?.length > 0;

  return (
    <section
      className={`${styles.scope} ${styles.last}`}
      style={tinted ? accentStyle(workspace) : undefined}
      aria-label={`${seasonLabel} season recap`}
    >
      <div className={styles.lastHead}>
        <div className={styles.lastBadge}>
          <TrophyIcon size={22} />
        </div>
        <div className={styles.lastBody}>
          <span className={styles.eyebrow}>
            {seasonLabel} season recap · {ch.defendingTitle || ch.championTitle}
          </span>
          <div className={styles.lastTeamRow}>
            <SeasonTeamLogo workspaceId={workspace.id} slug={ch.championSlug} name={ch.champion} size={28} />
            <h2 className={styles.lastTeam}>{ch.champion}</h2>
            <span className={styles.lastResult}>
              {ch.score} over {ch.runnerUp}
              {decided ? ` · ${decided}` : ''}
            </span>
          </div>
        </div>
      </div>

      {hasDetails && (
        <details className={styles.lastDetails}>
          <summary className={styles.lastSummary}>
            <span className={styles.whenClosed}>Read the {seasonLabel} season recap</span>
            <span className={styles.whenOpen}>Hide the {seasonLabel} season recap</span>
          </summary>
          <div className={styles.lastContent}>
            <div className={styles.recapCopy}>
              {(recap.paragraphs || []).map((text) => (
                <p key={text.slice(0, 32)}>{text}</p>
              ))}
            </div>
            {recap.facts?.length > 0 && (
              <div>
                <span className={styles.eyebrow}>At a glance</span>
                <FactList items={recap.facts} />
              </div>
            )}
          </div>
        </details>
      )}
    </section>
  );
}
