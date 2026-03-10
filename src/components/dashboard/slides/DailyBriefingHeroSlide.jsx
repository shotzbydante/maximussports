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
 *   5. 3–5 editorial narrative bullets
 *   6. Title race module (top 5 teams with rank + logo + odds)
 *   7. Recent results module (sports desk recap)
 *   8. Footer
 */

import { getTeamSlug } from '../../../utils/teamSlug';
import styles from './DailyBriefingHeroSlide.module.css';

const RESULT_EMOJIS = {
  blowout:  '🔥',
  cover:    '📈',
  upset:    '⚠️',
  rivalry:  '🏀',
  streak:   '📈',
  default:  '▸',
};

function classifyResult(highlight) {
  if (!highlight) return 'default';
  const scores = (highlight.score || '').split('-').map(Number);
  const margin = scores.length === 2 ? Math.abs(scores[0] - scores[1]) : null;
  const line = (highlight.summaryLine || '').toLowerCase();
  if (line.includes('upset') || line.includes('stunned') || line.includes('shocked')) return 'upset';
  if (margin != null && margin >= 15) return 'blowout';
  if (line.includes('cover') || line.includes('ats')) return 'cover';
  if (line.includes('rival')) return 'rivalry';
  if (line.includes('streak') || line.includes('straight')) return 'streak';
  return 'default';
}

function buildEditorialBullet(highlight) {
  if (!highlight) return null;
  const { teamA, teamB, score } = highlight;
  if (!teamA) return null;

  const scores = score ? score.split('-').map(Number) : [];
  const margin = scores.length === 2 ? Math.abs(scores[0] - scores[1]) : null;
  const emoji = RESULT_EMOJIS[classifyResult(highlight)];

  if (teamB && score) {
    const verb = margin != null
      ? (margin >= 25 ? 'demolished' : margin >= 15 ? 'rolled past' : margin >= 8 ? 'handled' : 'edged')
      : 'beat';
    return `${emoji} ${teamA} ${verb} ${teamB} ${score}`;
  }
  if (score) return `${emoji} ${teamA} wins ${score}`;
  return `${emoji} ${teamA}`;
}

function buildDailyHeroContent(digest) {
  if (!digest?.hasChatContent) {
    return {
      headline: 'DAILY\nBRIEFING',
      subtext: 'Your morning intelligence report is live.',
      bullets: ['Full briefing loading — check back shortly'],
      titleRaceTeams: [],
      recentResults: [],
    };
  }

  // --- Editorial narrative bullets ---
  const bullets = [];

  if (digest.titleRace?.length > 0) {
    const leader = digest.titleRace[0];
    if (leader.team && leader.americanOdds) {
      bullets.push(`${leader.team} leads the title race at ${leader.americanOdds}`);
    }
  }

  if (digest.atsEdges?.length > 0) {
    const top = digest.atsEdges[0];
    const wl = top.wl ? ` (${top.wl})` : '';
    bullets.push(`📊 ATS edge: ${top.team} covering at ${top.atsRate}%${wl}`);
  }

  if (digest.gamesToWatch?.length > 0) {
    const game = digest.gamesToWatch[0];
    const spreadNote = game.spread ? ` · Spread: ${game.spread}` : '';
    bullets.push(`👀 Top game: ${game.matchup}${spreadNote}`);
  }

  if (digest.newsIntel?.length > 0) {
    const news = digest.newsIntel[0];
    const tag = news.tag ? `${news.tag}: ` : '';
    bullets.push(`📰 ${tag}${news.headline}`);
  }

  if (bullets.length < 3 && digest.maximusSays?.length > 0) {
    for (const b of digest.maximusSays) {
      if (bullets.length >= 5) break;
      if (!bullets.includes(b)) bullets.push(b);
    }
  }

  // --- Headline ---
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

  // --- Title race: top 5 teams with rank, slug, name, odds ---
  const titleRaceTeams = (digest.titleRace ?? []).slice(0, 5).map((t, i) => ({
    rank: i + 1,
    name: t.team,
    odds: t.americanOdds,
    slug: getTeamSlug(t.team),
  }));

  // --- Recent results from last night highlights ---
  const recentResults = (digest.lastNightHighlights ?? []).slice(0, 3)
    .map(buildEditorialBullet)
    .filter(Boolean);

  // Add ATS heater note if available and we have room
  if (recentResults.length < 3 && digest.atsEdges?.length > 0) {
    const top = digest.atsEdges[0];
    const wl = top.wl ? ` ${top.wl}` : '';
    recentResults.push(`📈 ATS heater: ${top.team} covering at ${top.atsRate}%${wl}`);
  }

  return {
    headline: headlineParts.join('\n'),
    subtext: subtext.slice(0, 140),
    bullets: bullets.slice(0, 4),
    titleRaceTeams,
    recentResults: recentResults.slice(0, 3),
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

      <div className={styles.ncaaLogoZone}>
        <img
          src="https://a.espncdn.com/i/teamlogos/leagues/500/ncaa.png"
          alt="NCAA"
          className={styles.ncaaLogo}
          crossOrigin="anonymous"
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
      </div>

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

      {content.titleRaceTeams.length > 0 && (
        <div className={styles.titleRaceSection}>
          <div className={styles.titleRaceHeader}>TITLE RACE</div>
          <div className={styles.titleRaceGrid}>
            {content.titleRaceTeams.map((t, i) => (
              <div key={i} className={styles.titleRaceChip}>
                <span className={styles.titleRaceRank}>#{t.rank}</span>
                {t.slug && (
                  <img
                    src={`/logos/${t.slug}.png`}
                    alt=""
                    className={styles.titleRaceLogo}
                    crossOrigin="anonymous"
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                <div className={styles.titleRaceMeta}>
                  <span className={styles.titleRaceName}>{t.name}</span>
                </div>
                <span className={styles.titleRaceOdds}>🏆 {t.odds}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {content.recentResults.length > 0 && (
        <div className={styles.recentResultsSection}>
          <div className={styles.recentResultsHeader}>RECENT RESULTS</div>
          <div className={styles.recentResultsList}>
            {content.recentResults.map((r, i) => (
              <div key={i} className={styles.recentResultItem}>{r}</div>
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
