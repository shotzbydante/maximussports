/**
 * DailyBriefingHeroSlide — Instagram Hero · Daily Briefing
 *
 * Cinematic, premium daily briefing post matching the Team Intel / Conference Intel family.
 * Distills the homepage intelligence briefing into a visual card.
 *
 * Content hierarchy:
 *   1. Header       — Maximus branding + timestamp
 *   2. Program strip divider
 *   3. NCAA logo + date + category
 *   4. Narrative headline for the day
 *   5. Short summary / deck line
 *   6. Intel recap panel (3–4 editorial bullets)
 *   7. Title race module (top 5 teams with rank + logo + odds)
 *   8. Recent results module (sports desk recap)
 *   9. Footer
 */

import { getTeamSlug } from '../../../utils/teamSlug';
import { getTeamEmoji } from '../../../utils/getTeamEmoji';
import styles from './DailyBriefingHeroSlide.module.css';

// ─── NCAA logo — local asset with text fallback ─────────────────────────────

function NcaaLogo({ className }) {
  return (
    <img
      src="/logos/ncaa.png"
      alt="NCAA"
      className={className}
      crossOrigin="anonymous"
      data-fallback-text="NCAA"
      onError={e => {
        const span = document.createElement('span');
        span.textContent = 'NCAA';
        span.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;letter-spacing:0.12em;color:rgba(255,255,255,0.55);text-transform:uppercase;';
        span.setAttribute('aria-label', 'NCAA');
        e.currentTarget.replaceWith(span);
      }}
    />
  );
}

// ─── Team emoji helper ──────────────────────────────────────────────────────

function teamEmoji(name) {
  if (!name) return '';
  const slug = getTeamSlug(name);
  const e = getTeamEmoji(slug, name);
  return e ? `${e} ` : '';
}

// ─── Result classification for editorial verbs ──────────────────────────────

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

// ─── Varied verb library ────────────────────────────────────────────────────

function pickVerb(margin, kind, seed) {
  if (kind === 'upset') return 'stunned';
  if (kind === 'rivalry') {
    const pool = ['handled', 'took down', 'got the better of', 'came out on top against'];
    return pool[hashStr(seed) % pool.length];
  }
  if (margin == null) return 'beat';
  if (margin >= 25) return 'demolished';
  if (margin >= 18) return 'ran away from';
  if (margin >= 12) return 'rolled past';
  if (margin >= 8) {
    const pool = ['took care of', 'handled', 'dispatched'];
    return pool[hashStr(seed) % pool.length];
  }
  if (margin >= 4) {
    const pool = ['held off', 'edged', 'fended off', 'outlasted'];
    return pool[hashStr(seed) % pool.length];
  }
  return 'edged';
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function colorForKind(kind) {
  if (kind === 'blowout') return '🔥';
  if (kind === 'upset') return '⚠️';
  if (kind === 'cover') return '💰';
  if (kind === 'rivalry') return '⚔️';
  if (kind === 'streak') return '📈';
  return '▸';
}

// ─── Editorial result bullet ────────────────────────────────────────────────

function buildEditorialBullet(highlight) {
  if (!highlight) return null;
  const { teamA, teamB, score } = highlight;
  if (!teamA) return null;

  const scores = score ? score.split('-').map(Number) : [];
  const margin = scores.length === 2 ? Math.abs(scores[0] - scores[1]) : null;
  const kind = classifyResult(highlight);
  const emoji = colorForKind(kind);
  const eA = teamEmoji(teamA);
  const verb = pickVerb(margin, kind, teamA + (teamB || ''));

  if (teamB && score) {
    const qualifier = margin != null && margin <= 4
      ? ' in a tight one'
      : (margin != null && margin >= 20 ? '' : '');
    return `${eA || emoji + ' '}${teamA} ${verb} ${teamB}, ${score}${qualifier}`;
  }
  if (score) return `${eA || emoji + ' '}${teamA} wins ${score}`;
  return `${eA || emoji + ' '}${teamA}`;
}

// ─── Subtext variation library ──────────────────────────────────────────────

const SUBTEXT_POOL = {
  actionPacked: [
    'Yesterday was chaos in college hoops.',
    'Wild night on the hardwood. Here\u2019s what happened.',
    'Another busy night. We have the receipts.',
  ],
  titleRace: [
    'The title race is getting interesting.',
    'The championship picture just shifted.',
    'Movement at the top of the board.',
  ],
  march: [
    'March Madness is in the air. Intel is live.',
    'The road to the Final Four runs through today\u2019s briefing.',
    'Tournament positioning. Bracket watch. It\u2019s all here.',
  ],
  default: [
    'Your morning college basketball intelligence report.',
    'Fresh data. Fresh signals. Start here.',
    'The morning rundown, powered by Maximus.',
  ],
};

// ─── Content builder ────────────────────────────────────────────────────────

function buildDailyHeroContent(digest) {
  if (!digest?.hasChatContent) {
    return {
      headline: 'DAILY\nBRIEFING',
      subtext: 'Your morning intelligence report is live.',
      bullets: ['Full briefing loading \u2014 check back shortly'],
      titleRaceTeams: [],
      recentResults: [],
    };
  }

  const seed = new Date().toISOString().slice(0, 10);

  // --- Editorial narrative bullets ---
  const bullets = [];

  if (digest.titleRace?.length > 0) {
    const leader = digest.titleRace[0];
    const e = teamEmoji(leader.team);
    if (leader.team && leader.americanOdds) {
      bullets.push(`${e}${leader.team} sits atop the title board at ${leader.americanOdds}`);
    }
  }

  if (digest.atsEdges?.length > 0) {
    const top = digest.atsEdges[0];
    const e = teamEmoji(top.team);
    const wl = top.wl ? ` (${top.wl})` : '';
    bullets.push(`${e || '💰 '}${top.team} keeps cashing ATS at ${top.atsRate}%${wl}`);
  }

  if (digest.gamesToWatch?.length > 0) {
    const game = digest.gamesToWatch[0];
    const spreadNote = game.spread ? ` (${game.spread})` : '';
    bullets.push(`👀 Radar game: ${game.matchup}${spreadNote}`);
  }

  if (digest.newsIntel?.length > 0) {
    const news = digest.newsIntel[0];
    bullets.push(`📰 ${news.headline}`);
  }

  if (bullets.length < 3 && digest.maximusSays?.length > 0) {
    for (const b of digest.maximusSays) {
      if (bullets.length >= 4) break;
      if (!bullets.includes(b)) bullets.push(`🏀 ${b}`);
    }
  }

  // --- Headline ---
  const isMarch = new Date().getMonth() === 2;
  let headlineParts;
  let subtextPool;
  if (digest.lastNightHighlights?.length >= 3) {
    headlineParts = ['ACTION-PACKED', 'NIGHT'];
    subtextPool = SUBTEXT_POOL.actionPacked;
  } else if (digest.titleRace?.length >= 3) {
    headlineParts = ['TITLE RACE', 'HEATING UP'];
    subtextPool = SUBTEXT_POOL.titleRace;
  } else if (isMarch) {
    headlineParts = ['MARCH', 'INTELLIGENCE'];
    subtextPool = SUBTEXT_POOL.march;
  } else {
    headlineParts = ['DAILY', 'BRIEFING'];
    subtextPool = SUBTEXT_POOL.default;
  }

  const subtext = digest.recapLeadLine
    || digest.titleMarketLead
    || subtextPool[hashStr(seed) % subtextPool.length];

  // --- Title race: top 5 teams with rank, slug, name, odds ---
  const titleRaceTeams = (digest.titleRace ?? []).slice(0, 5).map((t, i) => ({
    rank: i + 1,
    name: t.team,
    odds: t.americanOdds,
    slug: getTeamSlug(t.team),
  }));

  // --- Recent results with editorial voice ---
  const recentResults = (digest.lastNightHighlights ?? []).slice(0, 3)
    .map(buildEditorialBullet)
    .filter(Boolean);

  if (recentResults.length < 3 && digest.atsEdges?.length > 0) {
    const top = digest.atsEdges[0];
    const e = teamEmoji(top.team);
    const wl = top.wl ? ` ${top.wl}` : '';
    recentResults.push(`${e || '💰 '}${top.team} stays hot ATS \u2014 covering at ${top.atsRate}%${wl}`);
  }

  return {
    headline: headlineParts.join('\n'),
    subtext: subtext.slice(0, 140),
    bullets: bullets.slice(0, 4),
    titleRaceTeams,
    recentResults: recentResults.slice(0, 3),
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

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

      <div className={styles.programStrip} aria-hidden="true" />

      <div className={styles.ncaaLogoZone}>
        <NcaaLogo className={styles.ncaaLogo} />
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
          <div className={styles.bulletModuleHeader}>TODAY&rsquo;S INTEL</div>
          <ul className={styles.bulletList}>
            {content.bullets.map((b, i) => (
              <li key={i} className={styles.bulletItem}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {content.titleRaceTeams.length > 0 && (
        <div className={styles.titleRaceSection}>
          <div className={styles.titleRaceHeader}>LIVE TITLE BOARD</div>
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
                    data-fallback-text={t.name?.slice(0, 2)?.toUpperCase() || ''}
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                <div className={styles.titleRaceMeta}>
                  <span className={styles.titleRaceName}>{t.name}</span>
                </div>
                <span className={styles.titleRaceOdds}>{t.odds}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {content.recentResults.length > 0 && (
        <div className={styles.recentResultsSection}>
          <div className={styles.recentResultsHeader}>LAST NIGHT</div>
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
