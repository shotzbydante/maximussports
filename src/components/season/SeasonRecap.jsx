/**
 * SeasonRecap — the offseason home for a completed season.
 *
 * Champion highlight + countdown to the next season up top, then the season
 * recap with key facts and honors. Everything is read from the workspace
 * config (`championship`, `recap`, `nextSeason`), so a new season only needs
 * a config update.
 */

import { useId } from 'react';
import SeasonCountdown from './SeasonCountdown';
import SeasonTeamLogo from './SeasonTeamLogo';
import TrophyIcon from './TrophyIcon';
import { accentStyle, formatSeasonDate } from './seasonFormat';
import styles from './season.module.css';

export default function SeasonRecap({ workspace }) {
  const headingId = useId();
  const ch = workspace?.championship;
  if (!ch) return null;

  const recap = workspace.recap || {};
  const nextSeason = workspace.nextSeason;
  const seasonLabel = ch.seasonLabel || ch.year;
  const decided = formatSeasonDate(ch.decidedOn);
  const meta = [decided, ch.venue].filter(Boolean).join(' · ');

  return (
    <section
      className={`${styles.scope} ${styles.recap}`}
      style={accentStyle(workspace)}
      aria-labelledby={headingId}
    >
      <div className={styles.recapHero}>
        <div className={styles.champ}>
          <div className={styles.trophyBadge}>
            <TrophyIcon size={26} />
          </div>
          <div className={styles.champBody}>
            <span className={styles.eyebrow}>{seasonLabel} {ch.championTitle}</span>
            <div className={styles.champTeamRow}>
              <SeasonTeamLogo workspaceId={workspace.id} slug={ch.championSlug} name={ch.champion} size={44} />
              <h2 id={headingId} className={styles.champTeam}>{ch.champion}</h2>
            </div>
            <div className={styles.resultRow}>
              <span className={styles.resultLabel}>{ch.scoreLabel}</span>
              <span className={styles.scoreBadge}>{ch.score}</span>
              <span>over</span>
              <span className={styles.runnerUp}>
                <SeasonTeamLogo workspaceId={workspace.id} slug={ch.runnerUpSlug} name={ch.runnerUp} size={22} />
                {ch.runnerUp}
              </span>
            </div>
            {meta && <p className={styles.resultMeta}>{meta}</p>}
          </div>
        </div>

        <SeasonCountdown nextSeason={nextSeason} />
      </div>

      <div className={styles.recapBody}>
        <div className={styles.recapCopy}>
          <span className={styles.eyebrow}>{seasonLabel} season recap</span>
          <h3 className={styles.recapTitle}>{ch.headline}</h3>
          {(recap.paragraphs || []).map((text) => (
            <p key={text.slice(0, 32)}>{text}</p>
          ))}
        </div>

        <aside aria-label={`${seasonLabel} season at a glance`}>
          {recap.facts?.length > 0 && (
            <div className={styles.sideBlock}>
              <span className={styles.eyebrow}>At a glance</span>
              <FactList items={recap.facts} />
            </div>
          )}
          {recap.honors?.length > 0 && (
            <div className={styles.sideBlock}>
              <span className={styles.eyebrow}>Major awards</span>
              <FactList items={recap.honors} />
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

export function FactList({ items }) {
  return (
    <ul className={styles.facts}>
      {items.map((item) => (
        <li key={item.label} className={styles.fact}>
          <span className={styles.factLabel}>{item.label}</span>
          <span className={styles.factValue}>
            {item.value}
            {item.team && <span className={styles.factTeam}>{item.team}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
