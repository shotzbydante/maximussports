import styles from './TeamRow.module.css';

/** Single team row: logo + name + optional rank pill + optional stat. */
export default function TeamRow({ slug, name, rank, stat, statLabel, size = 'md' }) {
  return (
    <div className={`${styles.root} ${styles[size] || ''}`}>
      <div className={styles.logoWrap}>
        {slug ? (
          <img
            src={`/logos/${slug}.png`}
            alt={name || ''}
            className={styles.logo}
            crossOrigin="anonymous"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className={styles.logoFallback} />
        )}
      </div>
      <div className={styles.info}>
        <span className={styles.name}>{name || '—'}</span>
        {rank != null && <span className={styles.rankPill}>#{rank}</span>}
      </div>
      {stat != null && (
        <div className={styles.statBlock}>
          <span className={styles.statVal}>{stat}</span>
          {statLabel && <span className={styles.statKey}>{statLabel}</span>}
        </div>
      )}
    </div>
  );
}
