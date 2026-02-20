import { Link } from 'react-router-dom';
import { TEAMS } from '../data/teams';
import styles from './Teams.module.css';

export default function Teams() {
  return (
    <div className={styles.page}>
      <h1>Teams</h1>
      <p className={styles.subtitle}>Browse team pages with Reddit discussion & sentiment</p>
      <ul className={styles.teamList}>
        {TEAMS.map((team) => (
          <li key={team.slug}>
            <Link to={`/teams/${team.slug}`} className={styles.teamLink}>
              {team.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
