/**
 * DailyBriefingHeroSlide — Instagram Hero · Daily Briefing
 *
 * Cinematic, premium daily briefing post matching the Team Intel / Conference Intel family.
 * Distills the homepage intelligence briefing into a visual card.
 *
 * Content hierarchy:
 *   1. Header       — Maximus branding + timestamp
 *   2. Date + category badge
 *   3. Narrative headline for the day
 *   4. Short summary / deck line
 *   5. 3–5 core bullets from the intelligence briefing
 *   6. Optional spotlight (biggest result, ATS trend, championship odds)
 *   7. Featured teams row
 *   8. Footer
 */

import { getTeamSlug } from '../../../utils/teamSlug';
import styles from './DailyBriefingHeroSlide.module.css';

function buildDailyHeroContent(digest) {
  if (!digest?.hasChatContent) {
    return {
      headline: 'DAILY\nBRIEFING',
      subtext: 'Your morning intelligence report is live.',
      bullets: ['Full briefing loading — check back shortly'],
      spotlight: null,
      featuredTeams: [],
    };
  }

  const bullets = [];

  const highlight = digest.lastNightHighlights?.[0];
  if (highlight?.teamA && highlight?.score) {
    bullets.push(`${highlight.teamA} ${highlight.teamB ? `over ${highlight.teamB}` : ''} ${highlight.score}`);
  }

  if (digest.titleRace?.length > 0) {
    const leader = digest.titleRace[0];
    if (leader.team && leader.americanOdds) {
      bullets.push(`${leader.team} leads the title race at ${leader.americanOdds}`);
    }
  }

  if (digest.atsEdges?.length > 0) {
    const top = digest.atsEdges[0];
    const wl = top.wl ? ` (${top.wl})` : '';
    bullets.push(`ATS edge: ${top.team} covering at ${top.atsRate}%${wl}`);
  }

  if (digest.gamesToWatch?.length > 0) {
    const game = digest.gamesToWatch[0];
    const spreadNote = game.spread ? ` · Spread: ${game.spread}` : '';
    bullets.push(`Top game: ${game.matchup}${spreadNote}`);
  }

  if (digest.newsIntel?.length > 0) {
    bullets.push(digest.newsIntel[0].headline);
  }

  if (bullets.length < 3 && digest.maximusSays?.length > 0) {
    for (const b of digest.maximusSays) {
      if (bullets.length >= 5) break;
      if (!bullets.includes(b)) bullets.push(b);
    }
  }

  // Headline
  const isMarch = new Date().getMonth() === 2;
  let headlineParts;
  if (digest.lastNightHighlights?.length >= 3) {
    headlineParts = ['ACTION-PACKED', 'NIGHT'];
  } else if (digest.titleRace?.length >= 3) {
    headlineParts = ['TITLE RACE', 'HEATING UP'];
  } else if (isMarch) {
    headlineParts = ['MARCH', 'INTELLIGENCE'];
  } else {
    headlineParts = ['DAILY', 'BRIEFING'];
  }

  const subtext = digest.recapLeadLine
    || digest.titleMarketLead
    || 'Your morning college basketball intelligence report.';

  // Spotlight
  let spotlight = null;
  if (digest.titleRace?.length >= 2) {
    spotlight = {
      label: 'TITLE RACE',
      items: digest.titleRace.slice(0, 3).map(t => ({
        name: t.team,
        value: t.americanOdds,
        slug: getTeamSlug(t.team),
      })),
    };
  } else if (digest.atsEdges?.length >= 2) {
    spotlight = {
      label: 'ATS LEADERS',
      items: digest.atsEdges.slice(0, 3).map(t => ({
        name: t.team,
        value: `${t.atsRate}%`,
        slug: getTeamSlug(t.team),
      })),
    };
  }

  // Featured teams from highlights + title race
  const teamSlugs = new Set();
  const featuredTeams = [];
  for (const h of (digest.lastNightHighlights ?? []).slice(0, 3)) {
    const slug = getTeamSlug(h.teamA);
    if (slug && !teamSlugs.has(slug)) {
      teamSlugs.add(slug);
      featuredTeams.push({ name: h.teamA?.split(' ').slice(0, -1).join(' ') || h.teamA, slug });
    }
  }
  for (const t of (digest.titleRace ?? []).slice(0, 3)) {
    const slug = getTeamSlug(t.team);
    if (slug && !teamSlugs.has(slug)) {
      teamSlugs.add(slug);
      featuredTeams.push({ name: t.team?.split(' ').slice(0, -1).join(' ') || t.team, slug });
    }
  }

  return {
    headline: headlineParts.join('\n'),
    subtext: subtext.slice(0, 140),
    bullets: bullets.slice(0, 5),
    spotlight,
    featuredTeams: featuredTeams.slice(0, 5),
  };
}

export default function DailyBriefingHeroSlide({ data, asOf, ...rest }) {
  const digest = data?.chatDigest ?? null;
  const content = buildDailyHeroContent(digest);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  return (
    <div className={styles.artboard} {...rest}>
      <div className={styles.bgBase} aria-hidden="true" />
      <div className={styles.bgGlow} aria-hidden="true" />
      <div className={styles.bgRay} aria-hidden="true" />
      <div className={styles.bgNoise} aria-hidden="true" />

      <header className={styles.header}>
        <div className={styles.logoRow}>
          <img src="/logo.png" alt="Maximus Sports" className={styles.brandLogo} crossOrigin="anonymous" />
          <div className={styles.logoMeta}>
            <span className={styles.brandName}>MAXIMUS SPORTS</span>
            <span className={styles.intelChip}>DAILY BRIEFING</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          {asOf && <div className={styles.asOf}>As of {asOf}</div>}
          <div className={styles.maxIntel}>MAXIMUM INTELLIGENCE</div>
        </div>
      </header>

      <div className={styles.dateZone}>
        <span className={styles.dateLabel}>{today}</span>
        <span className={styles.dateSub}>College Basketball Intelligence</span>
      </div>

      <div className={styles.headlineZone}>
        <div className={styles.headlineDivider} />
        <h2 className={styles.headline}>
          {content.headline.split('\n').map((line, i) => (
            <span key={i} className={styles.headlineLine}>{line}</span>
          ))}
        </h2>
        <div className={styles.headlineDividerBottom} />
      </div>

      {content.subtext && (
        <div className={styles.quickIntel}>{content.subtext}</div>
      )}

      {content.bullets.length > 0 && (
        <div className={styles.bulletModule}>
          <ul className={styles.bulletList}>
            {content.bullets.map((b, i) => (
              <li key={i} className={styles.bulletItem}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {content.spotlight && (
        <div className={styles.spotlightSection}>
          <div className={styles.spotlightTitle}>{content.spotlight.label}</div>
          <div className={styles.spotlightGrid}>
            {content.spotlight.items.map((item, i) => (
              <div key={i} className={styles.spotlightChip}>
                {item.slug && (
                  <img
                    src={`/logos/${item.slug}.png`}
                    alt=""
                    className={styles.spotlightLogo}
                    crossOrigin="anonymous"
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                <span className={styles.spotlightName}>{item.name}</span>
                <span className={styles.spotlightValue}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {content.featuredTeams.length > 0 && (
        <div className={styles.featuredSection}>
          <div className={styles.featuredTitle}>FEATURED TEAMS</div>
          <div className={styles.featuredGrid}>
            {content.featuredTeams.map((t, i) => (
              <div key={i} className={styles.featuredChip}>
                <img
                  src={`/logos/${t.slug}.png`}
                  alt=""
                  className={styles.featuredLogo}
                  crossOrigin="anonymous"
                  onError={e => { e.currentTarget.style.display = 'none'; }}
                />
                <span className={styles.featuredName}>{t.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
        <span className={styles.footerDisclaimer}>
          For entertainment only. Please bet responsibly. 21+
        </span>
      </footer>
    </div>
  );
}
