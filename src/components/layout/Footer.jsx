import mascot2d from '../../assets/mascot-2d.png';
import { REPO_URL, LINKEDIN_URL, GOOGLE_CLOUD_URL } from '../../config/links';
import styles from './Footer.module.css';

/* ─── Stack tech logos as inline SVG / wordmark badges ─────────────────── */

const OpenAILogo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 004.981 4.18a5.985 5.985 0 00-3.998 2.9 6.046 6.046 0 00.743 7.097 5.98 5.98 0 00.51 4.911 6.051 6.051 0 006.515 2.9A5.985 5.985 0 0013.26 24a6.056 6.056 0 005.772-4.206 5.99 5.99 0 003.997-2.9 6.056 6.056 0 00-.747-7.073zM13.26 22.43a4.476 4.476 0 01-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 00.392-.681v-6.737l2.02 1.168a.071.071 0 01.038.052v5.583a4.504 4.504 0 01-4.494 4.494zM3.6 18.304a4.47 4.47 0 01-.535-3.014l.142.085 4.783 2.759a.771.771 0 00.78 0l5.843-3.369v2.332a.08.08 0 01-.033.062L9.74 19.95a4.5 4.5 0 01-6.14-1.646zM2.34 7.896a4.485 4.485 0 012.366-1.973V11.6a.766.766 0 00.388.676l5.815 3.355-2.02 1.168a.076.076 0 01-.071 0L4.01 13.95a4.5 4.5 0 01-1.671-6.055zm16.55 3.867l-5.843-3.369 2.02-1.164a.076.076 0 01.071 0l4.816 2.779a4.5 4.5 0 01-.676 8.105v-5.677a.79.79 0 00-.389-.674zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 00-.785 0L9.37 9.218V6.886a.071.071 0 01.028-.065l4.816-2.773a4.5 4.5 0 016.547 4.666zm-12.64 4.135l-2.02-1.164a.08.08 0 01-.038-.057V6.075a4.5 4.5 0 017.375-3.453l-.142.08-4.778 2.758a.795.795 0 00-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
  </svg>
);

const AnthropicLogo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674L9.019 8.682 6.8 14.586h3.525l1.097 2.966H5.025L3.603 20H0L6.57 3.52z"/>
  </svg>
);

const VercelLogo = () => (
  <svg width="18" height="16" viewBox="0 0 116 100" fill="currentColor" aria-hidden>
    <path d="M57.5 0L115 100H0L57.5 0z"/>
  </svg>
);

const GitHubLogo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
  </svg>
);

const CursorLogo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
  </svg>
);

const GoogleCloudLogo = () => (
  <svg width="20" height="16" viewBox="0 0 24 19" fill="currentColor" aria-hidden>
    <path d="M14.8 4.6L13.5 3.3C12.3 2.1 10.7 1.4 9 1.4c-3.3 0-6 2.7-6 6 0 .2 0 .5.1.7C1.3 8.9 0 10.7 0 12.8c0 2.5 2 4.6 4.6 4.6h14.3c2.3 0 4.1-1.9 4.1-4.1 0-2-1.5-3.7-3.4-4l-.6-.1-.2-.6c-.6-2.2-2.5-3.9-4.8-4H14zm.1 1.5c1.7.1 3.1 1.2 3.7 2.7l.5 1.3 1.4.2c1.3.2 2.3 1.3 2.3 2.6 0 1.4-1.2 2.6-2.6 2.6H4.6C2.9 15.5 1.5 14.1 1.5 12.4c0-1.4 1-2.7 2.3-3l1.2-.3-.1-1.3c0-.2-.1-.4-.1-.7 0-2.5 2-4.5 4.5-4.5 1.3 0 2.5.5 3.4 1.4l1.5 1.5.7-.4z"/>
  </svg>
);

const STACK = [
  { name: 'OpenAI',        Icon: OpenAILogo,      href: 'https://openai.com',    label: null },
  { name: 'Claude',        Icon: AnthropicLogo,   href: 'https://anthropic.com', label: null },
  { name: 'Vercel',        Icon: VercelLogo,      href: 'https://vercel.com',    label: null },
  { name: 'GitHub',        Icon: GitHubLogo,      href: REPO_URL,                label: 'Link to repo' },
  { name: 'Cursor',        Icon: CursorLogo,      href: 'https://cursor.com',    label: null },
  { name: 'Google Cloud',  Icon: GoogleCloudLogo, href: GOOGLE_CLOUD_URL,        label: null },
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>

        {/* ── Brand + tagline ── */}
        <div className={styles.brand}>
          <div className={styles.brandText}>
            <span className={styles.brandName}>Maximus Sports</span>
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
                <a
                  key={item.name}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.stackBadge}
                  title={item.name}
                >
                  <LogoIcon />
                  <span className={styles.stackBadgeName}>{item.name}</span>
                  {item.label && (
                    <span className={styles.stackBadgeLabel}>{item.label}</span>
                  )}
                </a>
              );
            })}
          </div>
        </div>

        <div className={styles.divider} />

        {/* ── Attribution ── */}
        <p className={styles.attribution}>
          Built by Maximus, the genius toddler AI sports guru with soul. Independent open source
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

        {/* ── Mascot — bottom centered ── */}
        <div className={styles.mascotRow}>
          <img
            src={mascot2d}
            alt="Maximus mascot"
            className={styles.mascot}
          />
        </div>
      </div>
    </footer>
  );
}
