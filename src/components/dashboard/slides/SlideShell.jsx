import styles from './SlideShell.module.css';

/**
 * Shared 1080×1350 artboard wrapper for every Daily Briefing slide.
 * Renders the Maximus logo header, content area, and standard footer.
 */
export default function SlideShell({ children, asOf, accentColor = '#3C79B4', rest = {} }) {
  return (
    <div className={styles.artboard} style={{ '--slide-accent': accentColor }} {...rest}>
      {/* ── Background gradient ──────────────────────── */}
      <div className={styles.bgLayer} />

      {/* ── Header ──────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.logoRow}>
          <img
            src="/logo.png"
            alt="Maximus Sports"
            className={styles.logo}
            crossOrigin="anonymous"
          />
          <span className={styles.logoText}>MAXIMUS SPORTS</span>
        </div>
        <div className={styles.asOf}>As of {asOf}</div>
      </header>

      {/* ── Content area ────────────────────────────── */}
      <main className={styles.content}>
        {children}
      </main>

      {/* ── Footer ──────────────────────────────────── */}
      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
        <span className={styles.footerDisclaimer}>
          For entertainment only. Please bet responsibly.
        </span>
      </footer>
    </div>
  );
}
