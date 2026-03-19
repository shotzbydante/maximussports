import styles from './SlideShell.module.css';
import { getSlideTheme, themeToCSS } from './slideThemes';

/**
 * Shared 1080x1350 IG 4:5 artboard wrapper.
 *
 * Now theme-aware: pass `theme` key (tournament | upset_radar | single_game | key_games)
 * to drive background, chrome, and accent treatment from the theme token system.
 * Falls back to legacy `accentColor` / `category` behavior when no theme is provided.
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
  theme: themeKey,
  slideNumber,
  slideTotal,
  rest = {},
}) {
  const isRobot = styleMode === 'robot';
  const theme = themeKey ? getSlideTheme(themeKey) : null;

  const catConfig = theme
    ? { label: theme.categoryLabel, color: theme.categoryColor, bg: theme.categoryBg, border: theme.categoryBorder }
    : category ? CATEGORY_CONFIG[category] : null;

  const resolvedAccent = theme ? theme.accent : accentColor;

  const rootStyle = {
    '--slide-accent': resolvedAccent,
    ...(theme ? themeToCSS(theme) : {}),
  };

  const artboardClass = [
    styles.artboard,
    theme ? styles[`theme_${theme.key}`] : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={artboardClass}
      style={rootStyle}
      {...rest}
    >
      {/* Background — theme-driven or legacy */}
      <div
        className={styles.bgLayer}
        style={theme ? {
          background: `${theme.bgGradient}`,
        } : undefined}
      />

      {/* Robot mascot — top-right branded accent */}
      {brandMode !== 'light' && (
        <div
          className={styles.mascotWrap}
          style={{ opacity: isRobot ? 0.60 : 0.50 }}
        >
          <img
            src="/mascot.png"
            alt=""
            className={styles.mascot}
            style={theme ? { filter: theme.mascotFilter } : undefined}
            crossOrigin="anonymous"
          />
        </div>
      )}

      {/* Header */}
      <header
        className={styles.header}
        style={theme ? { borderBottomColor: theme.headerBorder } : undefined}
      >
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

      {/* Footer */}
      <footer
        className={styles.footer}
        style={theme ? { borderTopColor: theme.footerBorder } : undefined}
      >
        <span
          className={styles.footerUrl}
          style={theme ? { color: theme.footerUrlColor } : undefined}
        >
          maximussports.ai
        </span>
        <span className={styles.footerDisclaimer}>
          For entertainment only. Please bet responsibly.
        </span>
      </footer>
    </div>
  );
}
