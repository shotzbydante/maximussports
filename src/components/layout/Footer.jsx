import { Link } from 'react-router-dom';
import mascot2d from '../../assets/mascot-2d.png';
import { REPO_URL, LINKEDIN_URL, GOOGLE_CLOUD_URL } from '../../config/links';
import styles from './Footer.module.css';

/* ─── Stack tech logos as inline SVG / wordmark badges ─────────────────── */

const AnthropicLogo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674L9.019 8.682 6.8 14.586h3.525l1.097 2.966H5.025L3.603 20H0L6.57 3.52z"/>
  </svg>
);

const VercelLogo = () => (
  <svg width="16" height="14" viewBox="0 0 116 100" fill="currentColor" aria-hidden>
    <path d="M57.5 0L115 100H0L57.5 0z"/>
  </svg>
);

const GitHubLogo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
  </svg>
);

const CursorLogo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
  </svg>
);

const GoogleCloudLogo = () => (
  <svg width="18" height="14" viewBox="0 0 24 19" fill="currentColor" aria-hidden>
    <path d="M14.8 4.6L13.5 3.3C12.3 2.1 10.7 1.4 9 1.4c-3.3 0-6 2.7-6 6 0 .2 0 .5.1.7C1.3 8.9 0 10.7 0 12.8c0 2.5 2 4.6 4.6 4.6h14.3c2.3 0 4.1-1.9 4.1-4.1 0-2-1.5-3.7-3.4-4l-.6-.1-.2-.6c-.6-2.2-2.5-3.9-4.8-4H14zm.1 1.5c1.7.1 3.1 1.2 3.7 2.7l.5 1.3 1.4.2c1.3.2 2.3 1.3 2.3 2.6 0 1.4-1.2 2.6-2.6 2.6H4.6C2.9 15.5 1.5 14.1 1.5 12.4c0-1.4 1-2.7 2.3-3l1.2-.3-.1-1.3c0-.2-.1-.4-.1-.7 0-2.5 2-4.5 4.5-4.5 1.3 0 2.5.5 3.4 1.4l1.5 1.5.7-.4z"/>
  </svg>
);

const STACK = [
  { name: 'Claude',       Icon: AnthropicLogo,   href: 'https://anthropic.com', repoLabel: false },
  { name: 'Vercel',       Icon: VercelLogo,      href: 'https://vercel.com',    repoLabel: false },
  { name: 'GitHub',       Icon: GitHubLogo,      href: REPO_URL,                repoLabel: true  },
  { name: 'Cursor',       Icon: CursorLogo,      href: 'https://cursor.com',    repoLabel: false },
  { name: 'Google Cloud', Icon: GoogleCloudLogo, href: GOOGLE_CLOUD_URL,        repoLabel: false },
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>

        {/* ── Brand cluster: mascot left + text right, centered as a unit ── */}
        <div className={styles.brandCluster}>
          <img
            src={mascot2d}
            alt="Maximus, the Maximus Sports mascot"
            className={styles.mascot}
          />
          <div className={styles.brandText}>
            <img src="/brand/logo-white.png" alt="Maximus Sports" className={styles.brandLogo} width={720} height={347} loading="lazy" decoding="async" />
            <span className={styles.brandTagline}>Maximum Sports. Maximum Intelligence.</span>
          </div>
        </div>

        <div className={styles.divider} />

        {/* ── Stack ── */}
        <div className={styles.stackSection}>
          <p className={styles.stackLabel}>Stack</p>
          <div className={styles.stackRow}>
            {STACK.map((item) => {
              const LogoIcon = item.Icon;
              return (
                <div key={item.name} className={styles.stackItem}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.stackBadge}
                    title={item.name}
                  >
                    <LogoIcon />
                    <span className={styles.stackBadgeName}>{item.name}</span>
                  </a>
                  {item.repoLabel && (
                    <span className={styles.stackRepoLabel}>Link to repo</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.divider} />

        {/* ── SEO footer navigation ── */}
        <nav className={styles.seoNav} aria-label="Explore">
          <Link to="/" className={styles.seoNavLink}>Home</Link>
          <Link to="/nfl" className={styles.seoNavLink}>NFL</Link>
          <Link to="/nba" className={styles.seoNavLink}>NBA</Link>
          <Link to="/mlb" className={styles.seoNavLink}>MLB</Link>
          <Link to="/ncaam" className={styles.seoNavLink}>College Basketball</Link>
        </nav>

        <div className={styles.divider} />

        {/* ── Attribution ── */}
        <p className={styles.attribution}>
          Built by Maximus 🤖, the genius toddler AI sports guru. Independent open source
          project by{' '}
          <a
            href={LINKEDIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.attributionLink}
          >
            Dante DiCicco
          </a>
          .
        </p>

        {/* ── SEO microcopy ── */}
        <p className={styles.seoMicrocopy}>
          Maximus Sports provides data-driven betting intelligence for the NFL, NBA, MLB and
          college basketball: model-graded picks, odds analysis, team intel and season
          projections, updated daily.
        </p>

        {/* ── Legal links + support ── */}
        <div className={styles.legalRow}>
          <nav className={styles.legalLinks} aria-label="Legal">
            <Link to="/privacy" className={styles.legalLink}>Privacy</Link>
            <span className={styles.legalDot} aria-hidden>•</span>
            <Link to="/terms" className={styles.legalLink}>Terms</Link>
            <span className={styles.legalDot} aria-hidden>•</span>
            <Link to="/contact" className={styles.legalLink}>Contact</Link>
          </nav>

          <div className={styles.legalDivider} aria-hidden />

          <div className={styles.support}>
            Questions? Reach out to{' '}
            <a href="mailto:winning@maximussports.ai" className={styles.supportLink}>
              winning@maximussports.ai
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
}
