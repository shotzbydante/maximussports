/**
 * GuestLanding — logged-out homepage for maximussports.ai
 *
 * Positioning: sports intelligence for prediction markets and betting.
 * Leads with the problem solved (model vs. market), shows one sample
 * signal above the fold, and keeps a single primary CTA.
 *
 * Renders its own header and footer; Layout drops the app chrome for
 * guests on "/". All numbers in the signal preview are illustrative
 * placeholders and are labelled as such.
 */

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { track } from '../../analytics/index';
import { trackAccountCreateSkipped } from '../../lib/analytics/posthog';
import styles from './GuestLanding.module.css';

const WelcomeModal = lazy(() => import('../../components/marketing/WelcomeModal'));

const SIGNUP_ROUTE = '/settings';

const META = {
  title: 'Maximus Sports — Sports Intelligence for Prediction Markets and Betting',
  description:
    'Model-driven probabilities, market context, and clear analysis to help you read sports markets and make more informed decisions across MLB, NBA, and college basketball.',
  url: 'https://maximussports.ai',
  image: 'https://maximussports.ai/og.png',
};

const NAV_LINKS = [
  { href: '#platform', label: 'Platform' },
  { href: '#signal', label: 'Market intelligence' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#sports', label: 'Sports' },
  { href: '#methodology', label: 'Methodology' },
];

/* Illustrative placeholders only — not Maximus predictions or market data. */
const SAMPLES = [
  { id: 'nba', label: 'NBA', home: 'BOS', away: 'NYK', model: 62, market: 55 },
  { id: 'mlb', label: 'MLB', home: 'LAD', away: 'SD', model: 57, market: 53 },
  { id: 'ncaam', label: 'NCAAM', home: 'DUKE', away: 'UNC', model: 64, market: 59 },
];

const DRIVERS = ['Recent performance', 'Injuries & availability', 'Market movement'];

const ADVANTAGES = [
  {
    icon: 'diamond',
    title: 'Model probabilities',
    body: 'Analyze game outcome estimates and matchup-specific signals through a consistent, data-driven framework.',
  },
  {
    icon: 'arrow',
    title: 'Market intelligence',
    body: 'Understand how implied probabilities and odds evolve, and where model and market views differ.',
  },
  {
    icon: 'waves',
    title: 'The why behind it',
    body: 'Contextualize every signal with team form, injuries, situational factors, and concise AI-powered analysis.',
  },
];

const STEPS = [
  {
    title: 'Start with the matchup',
    body: 'Game outlook, teams, form, injuries, and current context.',
  },
  {
    title: 'Understand the probabilities',
    body: 'Compare model estimates with market-implied probabilities.',
  },
  {
    title: 'Decide with better information',
    body: 'See the rationale, important changes, and remaining uncertainty.',
  },
];

const LEAGUES = [
  { badge: 'MLB', title: 'Baseball intelligence', meta: 'Matchups · projections · odds', to: '/mlb' },
  { badge: 'NBA', title: 'Basketball intelligence', meta: 'Games · picks · markets', to: '/nba' },
  { badge: 'NCAA', title: 'College basketball', meta: 'Teams · brackets · outlooks', to: '/ncaam' },
];

const PRINCIPLES = [
  {
    title: 'Estimates, not certainties',
    body: 'A model probability is a forecast of how often an outcome should happen. It can be wrong on any single game, and the analysis says where the uncertainty sits.',
  },
  {
    title: 'A gap is not a return',
    body: 'A seven-point difference between model and market is not a seven percent expected return. It is a prompt to look closer at price, timing, and context.',
  },
  {
    title: 'Context before conclusions',
    body: 'Every signal sits next to the form, availability, and market movement behind it, so you can judge the reasoning and not only the number.',
  },
];

function Icon({ name }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
  if (name === 'diamond') {
    return (
      <svg {...common}>
        <path d="M12 3l9 9-9 9-9-9 9-9z" />
        <path d="M12 8.5l3.5 3.5-3.5 3.5L8.5 12 12 8.5z" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (name === 'waves') {
    return (
      <svg {...common}>
        <path d="M3 8c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0" />
        <path d="M3 13c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0" />
        <path d="M3 18c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0" />
      </svg>
    );
  }
  if (name === 'right') {
    return (
      <svg {...common} width={16} height={16}>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    );
  }
  // 'arrow' — up-right
  return (
    <svg {...common} width={name === 'arrowSm' ? 14 : 20} height={name === 'arrowSm' ? 14 : 20}>
      <path d="M7 17L17 7M9 7h8v8" />
    </svg>
  );
}

function trackCta(cta, location) {
  track('landing_cta_clicked', { cta, location, variant: 'guest_v2' });
}

export default function GuestLanding() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sampleId, setSampleId] = useState(SAMPLES[0].id);
  const tabRefs = useRef({});

  const sample = SAMPLES.find((s) => s.id === sampleId) || SAMPLES[0];
  const gap = sample.model - sample.market;

  // Welcome modal is opt-in here (?welcome=1) so the hero and the sample
  // signal are the first thing a new visitor sees.
  const [welcomeOpen, setWelcomeOpen] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('welcome') === '1';
    } catch {
      return false;
    }
  });
  const closeWelcome = useCallback(() => setWelcomeOpen(false), []);

  useEffect(() => {
    track('landing_viewed', { variant: 'guest_v2' });
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const selectSample = (id) => {
    setSampleId(id);
    track('landing_sample_selected', { league: id, variant: 'guest_v2' });
  };

  const onTabKeyDown = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = SAMPLES.findIndex((s) => s.id === sampleId);
    const next = SAMPLES[(i + (e.key === 'ArrowRight' ? 1 : SAMPLES.length - 1)) % SAMPLES.length];
    selectSample(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <>
      <Helmet>
        <title>{META.title}</title>
        <meta name="description" content={META.description} />
        <link rel="canonical" href={META.url} />
        <meta property="og:title" content={META.title} />
        <meta property="og:description" content={META.description} />
        <meta property="og:url" content={META.url} />
        <meta property="og:image" content={META.image} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Maximus Sports" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={META.title} />
        <meta name="twitter:description" content={META.description} />
        <meta name="twitter:image" content={META.image} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@700;800&display=swap"
        />
      </Helmet>

      {welcomeOpen && (
        <Suspense fallback={null}>
          <WelcomeModal
            open={welcomeOpen}
            onClose={closeWelcome}
            onSignup={() => {
              closeWelcome();
              navigate(SIGNUP_ROUTE);
            }}
            onExplore={() => {
              trackAccountCreateSkipped({ reason: 'welcome_modal_explore' });
              closeWelcome();
            }}
          />
        </Suspense>
      )}

      <div className={styles.page}>
        <a href="#main" className={styles.skipLink}>Skip to content</a>

        {/* ── Header ── */}
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <Link to="/" className={styles.brand} aria-label="Maximus Sports home">
              <img src="/logo-wordmark.png" alt="Maximus Sports" width={158} height={80} />
            </Link>

            <nav className={styles.nav} aria-label="Primary">
              {NAV_LINKS.map((l) => (
                <a key={l.href} href={l.href} className={styles.navLink}>{l.label}</a>
              ))}
            </nav>

            <div className={styles.headerActions}>
              <Link
                to={SIGNUP_ROUTE}
                className={styles.loginLink}
                onClick={() => trackCta('log_in', 'header')}
              >
                Log in
              </Link>
              <Link
                to={SIGNUP_ROUTE}
                className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`}
                onClick={() => trackCta('get_started_free', 'header')}
              >
                Get started free <Icon name="arrowSm" />
              </Link>
              <button
                type="button"
                className={styles.menuBtn}
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={menuOpen}
                aria-controls="guest-mobile-menu"
                onClick={() => setMenuOpen((o) => !o)}
              >
                <span className={styles.menuBars} data-open={menuOpen} aria-hidden="true" />
              </button>
            </div>
          </div>

          {menuOpen && (
            <nav id="guest-mobile-menu" className={styles.mobileMenu} aria-label="Mobile">
              {NAV_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className={styles.mobileLink}
                  onClick={() => setMenuOpen(false)}
                >
                  {l.label}
                </a>
              ))}
              <Link
                to={SIGNUP_ROUTE}
                className={styles.mobileLink}
                onClick={() => trackCta('log_in', 'mobile_menu')}
              >
                Log in
              </Link>
            </nav>
          )}
        </header>

        <main id="main">
          {/* ── Hero ── */}
          <section className={styles.hero}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>
                <span className={styles.eyebrowDot} aria-hidden="true" />
                Intelligence for sports markets
              </p>
              <h1 className={styles.headline}>
                Know the game.
                <span className={styles.headlineAccent}>Read the market.</span>
              </h1>
              <p className={styles.lede}>
                Model-driven probabilities, market context, and clear analysis for smarter
                decisions in <strong>prediction markets and sports betting.</strong>
              </p>
              <div className={styles.heroCtas}>
                <Link
                  to={SIGNUP_ROUTE}
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={() => trackCta('explore_free_intelligence', 'hero')}
                >
                  Explore free intelligence <Icon name="arrowSm" />
                </Link>
                <a
                  href="#how-it-works"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  onClick={() => trackCta('see_how_it_works', 'hero')}
                >
                  See how it works <Icon name="right" />
                </a>
              </div>
              <p className={styles.heroMeta}>
                No credit card required
                <span className={styles.metaDot} aria-hidden="true" />
                MLB · NBA · NCAAM
              </p>
            </div>

            {/* ── Sample signal ── */}
            <div id="signal" className={styles.signal}>
              <div className={styles.signalTop}>
                <h2 className={styles.signalTitle}>
                  <svg width="42" height="18" viewBox="0 0 42 18" aria-hidden="true">
                    <rect x="0" y="12" width="12" height="6" fill="#38bdf8" />
                    <rect x="13" y="8" width="12" height="10" fill="#2f9bff" />
                    <rect x="26" y="2" width="16" height="16" fill="#1d8bff" />
                  </svg>
                  Model signal preview
                </h2>
                <span className={styles.signalTag}>Illustrative example</span>
              </div>

              <div className={styles.tabs} role="tablist" aria-label="Sample league">
                {SAMPLES.map((s) => (
                  <button
                    key={s.id}
                    ref={(el) => { tabRefs.current[s.id] = el; }}
                    type="button"
                    role="tab"
                    id={`sample-tab-${s.id}`}
                    aria-selected={s.id === sampleId}
                    aria-controls="sample-panel"
                    tabIndex={s.id === sampleId ? 0 : -1}
                    className={styles.tab}
                    onClick={() => selectSample(s.id)}
                    onKeyDown={onTabKeyDown}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div
                id="sample-panel"
                role="tabpanel"
                aria-labelledby={`sample-tab-${sample.id}`}
                className={styles.signalCard}
              >
                <div className={styles.matchup}>
                  <div className={styles.teams}>
                    <span className={styles.team}>{sample.home}</span>
                    <span className={styles.vs}>vs</span>
                    <span className={styles.team}>{sample.away}</span>
                  </div>
                  <p className={styles.matchupMeta}>
                    Sample matchup<br />Moneyline · {sample.home} win
                  </p>
                </div>

                <div className={styles.probRow}>
                  <div className={styles.probHead}>
                    <span>Maximus model probability</span>
                    <span className={styles.probValue}>{sample.model}%</span>
                  </div>
                  <div className={styles.bar} aria-hidden="true">
                    <span className={styles.barModel} style={{ width: `${sample.model}%` }} />
                  </div>
                </div>
                <div className={styles.probRow}>
                  <div className={styles.probHead}>
                    <span>Market-implied probability</span>
                    <span className={styles.probValue}>{sample.market}%</span>
                  </div>
                  <div className={styles.bar} aria-hidden="true">
                    <span className={styles.barMarket} style={{ width: `${sample.market}%` }} />
                  </div>
                </div>

                <div className={styles.diverge}>
                  <div>
                    <h3 className={styles.divergeTitle}>See where projections diverge</h3>
                    <p className={styles.divergeBody}>
                      Compare model estimates with market pricing and explore the drivers
                      behind the difference.
                    </p>
                  </div>
                  <div className={styles.gap}>
                    <span className={styles.gapValue}>+{gap.toFixed(1)} pp</span>
                    <span className={styles.gapLabel}>Probability gap</span>
                  </div>
                </div>

                <ul className={styles.drivers} aria-label="Signal drivers">
                  {DRIVERS.map((d) => <li key={d}>{d}</li>)}
                </ul>
              </div>

              <p className={styles.signalNote}>
                Concept preview only. Not live market data or a betting recommendation.
              </p>
            </div>
          </section>

          {/* ── Advantage ── */}
          <section id="platform" className={styles.section}>
            <div className={styles.sectionHead}>
              <div>
                <p className={styles.kicker}>The Maximus advantage</p>
                <h2 className={styles.h2}>More than picks.<br />The intelligence behind them.</h2>
              </div>
              <p className={styles.sectionAside}>
                Get the context to understand an opportunity, not just another number on a screen.
              </p>
            </div>
            <div className={styles.grid3}>
              {ADVANTAGES.map((a) => (
                <article key={a.title} className={styles.card}>
                  <span className={styles.cardIcon}><Icon name={a.icon} /></span>
                  <div>
                    <h3 className={styles.cardTitle}>{a.title}</h3>
                    <p className={styles.cardBody}>{a.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* ── How it works ── */}
          <section id="how-it-works" className={styles.section}>
            <div className={styles.panel}>
              <div className={styles.panelCopy}>
                <p className={styles.kicker}>From data to conviction</p>
                <h2 className={styles.h2}>One clear view.<br />Every signal in context.</h2>
                <p className={styles.panelBody}>
                  A premium research workspace for people who follow sports and sports
                  markets seriously.
                </p>
                <Link
                  to="/nba/insights"
                  className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`}
                  onClick={() => trackCta('explore_sample_insight', 'how_it_works')}
                >
                  Explore a sample insight <Icon name="right" />
                </Link>
              </div>
              <ol className={styles.steps}>
                {STEPS.map((s, i) => (
                  <li key={s.title} className={styles.step}>
                    <span className={styles.stepNum} aria-hidden="true">0{i + 1}</span>
                    <div>
                      <h3 className={styles.stepTitle}>{s.title}</h3>
                      <p className={styles.stepBody}>{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* ── Methodology ── */}
          <section id="methodology" className={styles.section}>
            <div className={styles.sectionHead}>
              <div>
                <p className={styles.kicker}>How to read a signal</p>
                <h2 className={styles.h2}>Built to be questioned.</h2>
              </div>
              <p className={styles.sectionAside}>
                Good analysis shows its reasoning and its limits.
              </p>
            </div>
            <div className={styles.grid3}>
              {PRINCIPLES.map((p) => (
                <article key={p.title} className={`${styles.card} ${styles.cardPlain}`}>
                  <h3 className={styles.cardTitle}>{p.title}</h3>
                  <p className={styles.cardBody}>{p.body}</p>
                </article>
              ))}
            </div>
          </section>

          {/* ── Sports ── */}
          <section id="sports" className={styles.section}>
            <div className={styles.sectionHead}>
              <div>
                <p className={styles.kicker}>Sport-specific intelligence</p>
                <h2 className={styles.h2}>Go deeper on the sports you follow.</h2>
              </div>
              <p className={styles.sectionAside}>
                Access dedicated models, coverage, briefings, and markets by league.
              </p>
            </div>
            <div className={styles.grid3}>
              {LEAGUES.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className={styles.league}
                  onClick={() => trackCta(`league_${l.badge.toLowerCase()}`, 'sports')}
                >
                  <span className={styles.leagueBadge}>{l.badge}</span>
                  <span className={styles.leagueText}>
                    <span className={styles.leagueTitle}>{l.title}</span>
                    <span className={styles.leagueMeta}>{l.meta}</span>
                  </span>
                  <span className={styles.leagueArrow}><Icon name="arrowSm" /></span>
                </Link>
              ))}
            </div>
          </section>

          {/* ── Closing CTA ── */}
          <section className={styles.section}>
            <div className={`${styles.panel} ${styles.closing}`}>
              <p className={styles.kicker}>Maximus Sports</p>
              <h2 className={styles.h2}>Make your next sports decision<br />more informed.</h2>
              <p className={styles.panelBody}>
                Start exploring the models, markets, and stories driving the game.
              </p>
              <Link
                to={SIGNUP_ROUTE}
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => trackCta('get_started_free', 'closing')}
              >
                Get started free <Icon name="arrowSm" />
              </Link>
            </div>
          </section>
        </main>

        {/* ── Footer ── */}
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <p className={styles.footerNote}>
              © {new Date().getFullYear()} Maximus Sports. Sample probabilities on this page are
              illustrative only.<br />
              Analysis is informational and does not guarantee outcomes.
            </p>
            <nav className={styles.footerLinks} aria-label="Footer">
              <a href="#how-it-works">How it works</a>
              <a href="#methodology">Methodology</a>
              <Link to="/privacy">Privacy</Link>
              <Link to="/terms">Terms</Link>
              <Link to="/contact">Contact</Link>
            </nav>
          </div>
        </footer>
      </div>
    </>
  );
}
