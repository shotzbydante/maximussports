import { Link } from 'react-router-dom';
import { getTeamsGroupedByConference } from '../data/teams';
import TeamLogo from '../components/shared/TeamLogo';
import styles from './Teams.module.css';

const TIER_ORDER = ['Lock', 'Should be in', 'Work to do', 'Long shot'];
const TIER_CLASS = {
  Lock: styles.tierLock,
  'Should be in': styles.tierShould,
  'Work to do': styles.tierWork,
  'Long shot': styles.tierLong,
};

export default function Teams() {
  const grouped = getTeamsGroupedByConference();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Bubble Watch</h1>
        <p className={styles.subtitle}>ESPN bubble breakdown by conference & odds tier</p>
      </header>

      <div className={styles.grid}>
        {grouped.map(({ conference, tiers }) => (
          <section key={conference} className={styles.conferenceSection}>
            <h2 className={styles.conferenceTitle}>{conference}</h2>
            {TIER_ORDER.map((tier) => {
              const teams = tiers[tier];
              if (!teams || teams.length === 0) return null;
              return (
                <div key={tier} className={styles.tierBlock}>
                  <span className={styles.tierLabel}>{tier}</span>
                  <ul className={styles.teamList}>
                    {teams.map((team) => (
                      <li key={team.slug}>
                        <Link to={`/teams/${team.slug}`} className={styles.teamRow}>
                          <TeamLogo team={team} size={24} />
                          <span className={styles.teamName}>{team.name}</span>
                          <span className={`${styles.badge} ${TIER_CLASS[tier]}`}>{tier}</span>
                          <span className={styles.chevron}>→</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
