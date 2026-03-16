import styles from './SlideShell.module.css';

/**
 * Shared 1080×1350 IG 4:5 artboard wrapper.
 * Props:
 *   children      – slide body content
 *   asOf          – "10:30 AM PT" string
 *   accentColor   – CSS override for gradient glow (default: brand blue)
 *   brandMode     – "standard" (logo + robot) | "light" (logo only)
 *   styleMode     – "generic" (default) | "robot" (more prominent mascot + robot indicator)
 *   category      – optional 'daily'|'team'|'game'|'odds' for subtle category chip
 *   slideNumber   – optional 1-based index
 *   slideTotal    – optional total slides count
 *   rest          – spread onto root div (needed for data-slide attr used by exporter)
 */

const CATEGORY_CONFIG = {
  daily: { label: 'DAILY BRIEFING',  color: '#B7986C', bg: 'rgba(183,152,108,0.12)', border: 'rgba(183,152,108,0.28)' },
  team:  { label: 'TEAM INTEL',      color: '#4A90D9', bg: 'rgba(74,144,217,0.12)',  border: 'rgba(74,144,217,0.28)'  },
  game:  { label: 'GAME INSIGHTS',   color: '#5BA3D4', bg: 'rgba(91,163,212,0.10)',  border: 'rgba(91,163,212,0.24)'  },
  odds:  { label: 'ODDS INSIGHTS',   color: '#C4A55A', bg: 'rgba(196,165,90,0.12)',  border: 'rgba(196,165,90,0.28)'  },
};

export default function SlideShell({
  children,
  asOf,
  accentColor = '#3C79B4',
  brandMode = 'standard',
  styleMode = 'generic',
  category,
  slideNumber,
  slideTotal,
  rest = {},
}) {
  const isRobot = styleMode === 'robot';
  const catConfig = category ? CATEGORY_CONFIG[category] : null;

  return (
    <div
      className={styles.artboard}
      style={{ '--slide-accent': accentColor }}
      {...rest}
    >
      {/* Background gradient */}
      <div className={styles.bgLayer} />

      {/* Robot mascot corner accent */}
      {brandMode !== 'light' && (
        <div
          className={styles.mascotWrap}
          style={{ opacity: isRobot ? 0.85 : 0.78 }}
        >
          <img
            src="/mascot.png"
            alt=""
            className={styles.mascot}
            crossOrigin="anonymous"
          />
        </div>
      )}

      {/* Header: text logo left, mode indicator + timestamp right */}
      <header className={styles.header}>
        <div className={styles.logoRow}>
          <img
            src="/logo.png"
            alt="Maximus Sports"
            className={styles.logo}
            crossOrigin="anonymous"
          />
          <div className={styles.logoMeta}>
            <span className={styles.logoText}>MAXIMUS SPORTS</span>
            {catConfig && (
              <span
                className={styles.categoryChip}
                style={{ color: catConfig.color, background: catConfig.bg, borderColor: catConfig.border }}
              >
                {catConfig.label}
              </span>
            )}
          </div>
        </div>
        <div className={styles.headerRight}>
          {isRobot && <div className={styles.robotTag}>ROBOT MODE</div>}
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

      {/* Footer — raised to avoid IG overlay zone */}
      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
        <span className={styles.footerDisclaimer}>
          For entertainment only. Please bet responsibly.
        </span>
      </footer>
    </div>
  );
}
