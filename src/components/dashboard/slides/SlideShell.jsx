import styles from './SlideShell.module.css';

/**
 * Shared 1080×1350 IG 4:5 artboard wrapper.
 * Props:
 *   children      – slide body content
 *   asOf          – "10:30 AM PT" string
 *   accentColor   – CSS override for gradient glow (default: brand blue)
 *   brandMode     – "standard" (logo + robot) | "light" (logo only)
 *   slideNumber   – optional 1-based index
 *   slideTotal    – optional total slides count
 *   rest          – spread onto root div (needed for data-slide attr used by exporter)
 */
export default function SlideShell({
  children,
  asOf,
  accentColor = '#3C79B4',
  brandMode = 'standard',
  slideNumber,
  slideTotal,
  rest = {},
}) {
  return (
    <div
      className={styles.artboard}
      style={{ '--slide-accent': accentColor }}
      {...rest}
    >
      {/* Background gradient */}
      <div className={styles.bgLayer} />

      {/* Robot mascot corner accent (standard mode only) */}
      {brandMode !== 'light' && (
        <div className={styles.mascotWrap}>
          <img
            src="/mascot.png"
            alt=""
            className={styles.mascot}
            crossOrigin="anonymous"
          />
        </div>
      )}

      {/* Header: text logo left, timestamp right */}
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
        <div className={styles.headerRight}>
          {asOf && <div className={styles.asOf}>As of {asOf}</div>}
          {slideNumber != null && slideTotal != null && (
            <div className={styles.slideNum}>{slideNumber}&thinsp;/&thinsp;{slideTotal}</div>
          )}
        </div>
      </header>

      {/* Main content area */}
      <main className={styles.content}>
        {children}
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
        <span className={styles.footerDisclaimer}>
          For entertainment only. Please bet responsibly.
        </span>
      </footer>
    </div>
  );
}
