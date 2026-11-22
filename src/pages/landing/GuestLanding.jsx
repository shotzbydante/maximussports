/**
 * GuestLanding — logged-out homepage for maximussports.ai
 *
 * Positioning: sports intelligence for prediction markets and betting.
 * The page shows the product instead of describing it: one real, graded
 * NFL ticket above the fold, then this week's games live with the top
 * three picks open (live/LiveWeek.jsx), then the every-game board, a
 * position-group matchup and the weekly clock, filled with a dated
 * snapshot from the app (showcase/week11.js). It says what the app does
 * and how often, and leaves out how the numbers are made.
 *
 * Renders its own header and footer; Layout drops the app chrome for
 * guests on "/".
 */

import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { MASCOTS } from '../../brand/mascots';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { track } from '../../analytics/index';
import { trackAccountCreateSkipped } from '../../lib/analytics/posthog';
import { PickTicket, EveryGame, MatchupWindow, WeekClock } from './showcase/NflShowcase';
import { WEEK, ALSO } from './showcase/week11';
import LiveWeek from './live/LiveWeek';
import styles from './GuestLanding.module.css';

const WelcomeModal = lazy(() => import('../../components/marketing/WelcomeModal'));

const SIGNUP_ROUTE = '/settings';

const META = {
  title: 'Maximus Sports — Sports Intelligence for Prediction Markets and Betting',
  description:
    'A call on every NFL game against the spread, the total and the moneyline, picks locked at a real price and graded in public, and matchups broken down to the position group. Plus NBA, MLB and college basketball.',
  url: 'https://maximussports.ai',
  image: 'https://maximussports.ai/og.png',
};

/* Matches --gl-bg in GuestLanding.module.css. */
const PAGE_BG = '#040a1a';

const NAV_LINKS = [
  { href: '#this-week', label: 'Live games' },
  { href: '#every-game', label: 'Every game' },
  { href: '#matchups', label: 'Matchups' },
  { href: '#week', label: 'The week' },
  { href: '#methodology', label: 'Reading a signal' },
  { href: '#sports', label: 'Sports' },
];

/* How each market is handled. What we do, not how the numbers are made. */
const FRAMEWORK = [
  ['Spreads', 'A side on every game, ranked by conviction.'],
  ['Over/under', 'Over or under on every game, with the kickoff forecast at that stadium.'],
  ['Moneyline', 'Listed only when a sportsbook pays more than the fair price. Most weeks that is very few.'],
  ['Recommended or lean', 'A recommended pick beats the market’s fair price. A lean has no price edge: it is saved and graded, never recommended.'],
];

const LEAGUES = [
  { badge: 'NFL', sport: 'football', title: 'Football intelligence', meta: 'Spreads · totals · playoff odds', to: '/nfl' },
  { badge: 'MLB', sport: 'baseball', title: 'Baseball intelligence', meta: 'Matchups · projections · odds', to: '/mlb' },
  { badge: 'NBA', sport: 'basketball', title: 'Basketball intelligence', meta: 'Games · picks · markets', to: '/nba' },
  { badge: 'NCAA', sport: 'basketball', title: 'College basketball', meta: 'Teams · brackets · outlooks', to: '/ncaam' },
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
  track('landing_cta_clicked', { cta, location, variant: 'guest_v3' });
}

export default function GuestLanding() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  // Welcome modal is opt-in here (?welcome=1) so the hero and the example
  // pick are the first thing a new visitor sees.
  const [welcomeOpen, setWelcomeOpen] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('welcome') === '1';
    } catch {
      return false;
    }
  });
  const closeWelcome = useCallback(() => setWelcomeOpen(false), []);

  useEffect(() => {
    track('landing_viewed', { variant: 'guest_v3' });
  }, []);

  // The app's own background is light. While this dark page is up, paint the
  // document dark too, so the phone's status bar, the browser's toolbar tint
  // and the overscroll bounce match the page and do not flash light.
  useEffect(() => {
    const { documentElement: html, body } = document;
    const prev = [html.style.backgroundColor, body.style.backgroundColor];
    html.style.backgroundColor = PAGE_BG;
    body.style.backgroundColor = PAGE_BG;
    return () => {
      [html.style.backgroundColor, body.style.backgroundColor] = prev;
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

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
              <img src="/logo-wordmark.png" alt="Maximus Sports" width={158} height={76} />
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
                A call on every NFL game against the spread, the total and the moneyline.
                Picks locked at a real price and graded in public. Matchups broken down to
                the position group. For <strong>prediction markets and sports betting.</strong>
              </p>
              <div className={styles.heroCtas}>
                <Link
                  to={SIGNUP_ROUTE}
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={() => trackCta('explore_free_intelligence', 'hero')}
                >
                  Explore free intelligence <Icon name="arrowSm" />
                </Link>
                <Link
                  to="/nfl"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  onClick={() => trackCta('see_nfl_board', 'hero')}
                >
                  See this week&rsquo;s NFL picks <Icon name="right" />
                </Link>
              </div>
              <p className={styles.heroMeta}>
                No credit card required
                <span className={styles.metaDot} aria-hidden="true" />
                NFL · NBA · MLB · NCAAM
              </p>
            </div>

            {/* ── A real ticket: locked, then graded ── */}
            <div id="pick" className={styles.shot}>
              <img
                src="/brand/mascots/football-3d.webp"
                alt=""
                aria-hidden="true"
                className={styles.heroMascot}
                width={487}
                height={900}
              />
              <PickTicket />
              <p className={styles.shotNote}>
                Two {WEEK.label} leans on one game, shown as they were locked on November 21, 2026
                and graded against the final score. One game is not a record: every result, win or
                lose, is on{' '}
                <Link to="/record" onClick={() => trackCta('public_record', 'hero')}>the public record</Link>.
              </p>
            </div>
          </section>

          {/* ── This week, live: every game, the top three picks open ── */}
          <LiveWeek signupTo={SIGNUP_ROUTE} />

          {/* ── Every game, three markets ── */}
          <section id="every-game" className={styles.section}>
            <div className={styles.split}>
              <div className={styles.splitCopy}>
                <p className={styles.kicker}>
                  {WEEK.label}: {WEEK.calls} calls, {WEEK.recommended} recommended
                </p>
                <h2 className={styles.h2}>A call on every game. A pick only when the price is right.</h2>
                <p className={styles.panelBody}>
                  Most games are not worth a bet, and the board says so. Every game gets a call
                  in each market, ranked from strongest to weakest, with one line on why.
                </p>
                <dl className={styles.framework}>
                  {FRAMEWORK.map(([term, body]) => (
                    <div key={term}>
                      <dt>{term}</dt>
                      <dd>{body}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <EveryGame />
            </div>
          </section>

          {/* ── Matchups ── */}
          <section id="matchups" className={styles.section}>
            <div className={styles.sectionHead}>
              <div>
                <p className={styles.kicker}>Player and position-group matchups</p>
                <h2 className={styles.h2}>See where a game is won,<br />down to the position group.</h2>
              </div>
              <p className={styles.sectionAside}>
                Every starter is rated. Starters roll up to position groups, and position
                groups to the units that line up against each other on Sunday.
              </p>
            </div>
            <MatchupWindow />
            <p className={styles.afterShot}>
              Built for every game on the slate and every team in the league.{' '}
              <Link to="/nfl/teams" onClick={() => trackCta('nfl_teams', 'matchups')}>
                Browse the 32 team pages <Icon name="right" />
              </Link>
            </p>
          </section>

          {/* ── The week ── */}
          <section id="week" className={styles.section}>
            <div className={styles.sectionHead}>
              <div>
                <p className={styles.kicker}>How often the board moves</p>
                <h2 className={styles.h2}>The football week, on a clock.</h2>
              </div>
              <p className={styles.sectionAside}>
                Lines move all week. The board keeps up, and it keeps the receipts.
              </p>
            </div>
            <WeekClock />
            <p className={styles.afterShot}>
              Every pick, price and result is public.{' '}
              <Link to="/record" onClick={() => trackCta('public_record', 'week')}>
                Read the record <Icon name="right" />
              </Link>
            </p>
          </section>

          {/* ── The rest of the NFL section ── */}
          <section id="platform" className={styles.section}>
            <div className={styles.panel}>
              <div className={styles.panelCopy}>
                <p className={styles.kicker}>Also in the NFL section</p>
                <h2 className={styles.h2}>Everything around the pick.</h2>
                <p className={styles.panelBody}>
                  The pick is one line. The reading that gets you there is the rest of the
                  section, and it is free to explore.
                </p>
                <Link
                  to="/nfl"
                  className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`}
                  onClick={() => trackCta('open_nfl', 'platform')}
                >
                  Open the NFL section <Icon name="right" />
                </Link>
              </div>
              <dl className={styles.also}>
                {ALSO.map(([term, body]) => (
                  <div key={term}>
                    <dt>{term}</dt>
                    <dd>{body}</dd>
                  </div>
                ))}
              </dl>
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
                The NFL is in season. Baseball, basketball and college basketball each have
                their own briefings, picks and markets.
              </p>
            </div>
            <div className={styles.gridLeagues}>
              {LEAGUES.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className={styles.league}
                  onClick={() => trackCta(`league_${l.badge.toLowerCase()}`, 'sports')}
                >
                  <img
                    src={MASCOTS[l.sport].render}
                    alt=""
                    aria-hidden="true"
                    className={styles.leagueMascot}
                    loading="lazy"
                    decoding="async"
                  />
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
              <img
                src="/brand/mascots/football-3d.webp"
                alt=""
                aria-hidden="true"
                className={styles.closingMascot}
                width={487}
                height={900}
                loading="lazy"
                decoding="async"
              />
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
            <img
              src="/brand/watermark-color-30.png"
              alt="Maximus Sports"
              className={styles.footerMark}
              width={700}
              height={325}
              loading="lazy"
              decoding="async"
            />
            <p className={styles.footerNote}>
              © {new Date().getFullYear()} Maximus Sports. Examples on this page are real picks and
              ratings from {WEEK.label} of the 2026 season, shown as they appeared in the app.<br />
              Analysis is informational and does not guarantee outcomes. 21+. Gambling problem?
              Call 1-800-GAMBLER.
            </p>
            <nav className={styles.footerLinks} aria-label="Footer">
              <a href="#this-week">Live games</a>
              <a href="#every-game">Every game</a>
              <a href="#methodology">Reading a signal</a>
              <Link to="/record">The record</Link>
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
