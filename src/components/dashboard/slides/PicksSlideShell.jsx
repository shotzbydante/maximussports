import styles from './PicksSlideShell.module.css';

/**
 * Shared 1080×1080 Instagram square artboard for Maximus's Picks.
 * Cinematic dark navy gradient with gold accents — matches hero slide design language.
 */
export default function PicksSlideShell({
  children,
  asOf,
  slideNumber,
  slideTotal,
  rest = {},
}) {
  return (
    <div className={styles.artboard} {...rest}>
      <div className={styles.bgBase} aria-hidden="true" />
      <div className={styles.bgGlow} aria-hidden="true" />
      <div className={styles.bgRay} aria-hidden="true" />
      <div className={styles.bgNoise} aria-hidden="true" />

      <div className={styles.mascotWrap}>
        <img
          src="/mascot.png"
          alt=""
          className={styles.mascot}
          crossOrigin="anonymous"
        />
      </div>

      <header className={styles.header}>
        <div className={styles.logoRow}>
          <img
            src="/logo.png"
            alt="Maximus Sports"
            className={styles.brandLogo}
            crossOrigin="anonymous"
          />
          <div className={styles.logoMeta}>
            <span className={styles.brandName}>MAXIMUS SPORTS</span>
            <span className={styles.intelChip}>MAXIMUS&apos;S PICKS</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          {asOf && <div className={styles.asOf}>As of {asOf}</div>}
          {slideNumber != null && slideTotal != null && (
            <div className={styles.slideNum}>
              {slideNumber}&thinsp;/&thinsp;{slideTotal}
            </div>
          )}
        </div>
      </header>

      <main className={styles.content}>{children}</main>

      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
        <span className={styles.footerDisclaimer}>
          For entertainment only. Please bet responsibly. 21+
        </span>
      </footer>
    </div>
  );
}
