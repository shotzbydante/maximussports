/**
 * Snapshot module — market-style stat tiles.
 * Upset alerts, ranked teams in action, news velocity.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getTeamBySlug } from '../../data/teams';
import { getTeamSlug } from '../../utils/teamSlug';
import TeamLogo from '../shared/TeamLogo';
import styles from './DynamicStats.module.css';

const UpsetIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M8 2.5L14 13.5H2L8 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <line x1="8" y1="7" x2="8" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="8" cy="12.5" r="0.8" fill="currentColor" />
  </svg>
);

const RankedIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M8 2L9.6 6.4L14.5 6.6L10.8 9.5L12.1 14.2L8 11.5L3.9 14.2L5.2 9.5L1.5 6.6L6.4 6.4L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

const NewsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <line x1="5" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="5" y1="9" x2="11" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="5" y1="12" x2="8.5" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ICONS = [UpsetIcon, RankedIcon, NewsIcon];

function getTileVariant(stat, index) {
  if (index === 0 && stat.value > 0) return 'alert';
  if (index === 1 && stat.value > 0) return 'active';
  if (index === 2 && stat.value > 0) return 'news';
  return 'neutral';
}

export default function DynamicStats({ stats, compact = false, games = [] }) {
  const teamLogos = useMemo(() => {
    if (!compact || !games?.length) return [];
    const seen = new Set();
    const logos = [];
    for (const g of games) {
      for (const name of [g.homeTeam, g.awayTeam]) {
        const slug = getTeamSlug(name);
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        const team = getTeamBySlug(slug);
        if (team) logos.push({ team, slug, gameId: g.gameId });
      }
      if (logos.length >= 10) break;
    }
    return logos;
  }, [compact, games]);

  if (!stats?.length && teamLogos.length === 0) return null;

  if (compact) {
    const active = stats.filter((s) => s.value > 0);
    if (active.length === 0 && teamLogos.length === 0) return null;
    return (
      <section className={styles.strip}>
        <span className={styles.stripLabel}>Today</span>
        {teamLogos.length > 0 && (
          <div className={styles.stripLogos}>
            {teamLogos.map(({ team, slug }) => (
              <Link key={slug} to={`/teams/${slug}`} className={styles.stripLogoLink} title={team.name}>
                <TeamLogo team={team} size={22} />
              </Link>
            ))}
          </div>
        )}
        {active.length > 0 && <span className={styles.stripSep} aria-hidden />}
        <div className={styles.stripItems}>
          {active.map((stat, i) => {
            const Icon = ICONS[stats.indexOf(stat) % ICONS.length];
            const variant = getTileVariant(stat, stats.indexOf(stat));
            return (
              <span key={stat.label} className={`${styles.stripItem} ${styles[`strip--${variant}`]}`}>
                <span className={`${styles.stripIcon} ${styles[`icon--${variant}`]}`}><Icon /></span>
                <span className={styles.stripValue}>{stat.value}</span>
                <span className={styles.stripName}>{stat.label}</span>
              </span>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <span className={styles.sectionLabel}>Snapshot</span>
      </div>
      <div className={styles.tiles}>
        {stats.map((stat, i) => {
          const Icon = ICONS[i % ICONS.length];
          const variant = getTileVariant(stat, i);
          return (
            <div key={stat.label} className={`${styles.tile} ${styles[`tile--${variant}`]}`}>
              <div className={styles.tileTop}>
                <span className={`${styles.tileIcon} ${styles[`icon--${variant}`]}`}>
                  <Icon />
                </span>
                <span className={styles.tileLabel}>{stat.label}</span>
              </div>
              <div className={`${styles.tileValue} ${styles[`value--${variant}`]}`}>
                {stat.value}
              </div>
              <div className={styles.tileContext}>{stat.subtext}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
