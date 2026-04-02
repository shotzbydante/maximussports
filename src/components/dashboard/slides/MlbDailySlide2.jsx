/**
 * MlbDailySlide2 — Today's Intel Briefing (Slide 2 of MLB Daily Briefing carousel)
 *
 * Premium bullet-driven editorial digest. Each section has exactly 3 bullet groups,
 * each with one lead line + one support line. Specific names, teams, outcomes.
 *
 * 1080×1350 · IG 4:5 portrait
 */

import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import { buildDailyContent, stripEmojis } from './mlbDailyHelpers';
import { parseBriefingToIntel } from '../../../features/mlb/contentStudio/normalizeMlbImagePayload';
import styles from './MlbSlides.module.css';

// ─── Helpers ──────────────────────────────────────────────────

const TEAM_KEYWORDS = {
  'diamondbacks': 'ari', 'arizona': 'ari', 'd-backs': 'ari',
  'dodgers': 'lad', 'los angeles dodgers': 'lad',
  'yankees': 'nyy', 'new york yankees': 'nyy',
  'blue jays': 'tor', 'toronto': 'tor',
  'phillies': 'phi', 'philadelphia': 'phi',
  'astros': 'hou', 'houston': 'hou',
  'mets': 'nym', 'new york mets': 'nym',
  'braves': 'atl', 'atlanta': 'atl',
  'guardians': 'cle', 'cleveland': 'cle',
  'tigers': 'det', 'detroit': 'det',
  'mariners': 'sea', 'seattle': 'sea',
  'rangers': 'tex', 'texas': 'tex',
  'orioles': 'bal', 'baltimore': 'bal',
  'padres': 'sd', 'san diego': 'sd',
  'giants': 'sf', 'san francisco': 'sf',
  'cubs': 'chc', 'chicago cubs': 'chc',
  'red sox': 'bos', 'boston': 'bos',
};

function findSlug(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [kw, slug] of Object.entries(TEAM_KEYWORDS)) {
    if (lower.includes(kw)) return slug;
  }
  return null;
}

function logoSrc(slug) {
  return slug ? getMlbEspnLogoUrl(slug) : null;
}

/** Trim filler words but keep specificity — allow up to 80 chars */
function trim(text, max = 80) {
  if (!text) return '';
  let s = text.trim();
  s = s.replace(/^(Meanwhile,?\s*|In other action,?\s*|Additionally,?\s*|Also,?\s*)/i, '');
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/\s+\S*$/, '') + '.';
}

// ─── Content builder ──────────────────────────────────────────

function buildSlide2Content(data) {
  const content = buildDailyContent(data);
  const intel = parseBriefingToIntel(data?.mlbBriefing);
  const paras = intel?.rawParagraphs || [];

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  const getSentences = (idx) => {
    const para = paras[idx];
    if (!para) return [];
    const cleaned = stripEmojis(para);
    if (!cleaned || cleaned.length < 30) return [];
    const labelMatch = cleaned.match(/^([A-Z][A-Z\s&+\-:]*[A-Z])\s*[:—–-]\s*/);
    const body = labelMatch ? cleaned.slice(labelMatch[0].length) : cleaned;
    return (body.match(/[^.!?]*[.!?]+/g) || [body]).map(s => s.trim()).filter(Boolean);
  };

  // Build bullet group: always { lead, support, logoSrc }
  const buildGroup = (leadSent, supportSent) => {
    const lead = trim(leadSent);
    const support = supportSent ? trim(supportSent, 60) : '';
    const slug = findSlug(leadSent);
    return { lead, support, logoSrc: logoSrc(slug) };
  };

  // P1 = Around the League → 3 feature bullet groups
  const p1 = getSentences(0);
  const featureBullets = [];
  for (let i = 0; i < Math.min(p1.length, 6) && featureBullets.length < 3; i += 2) {
    if (p1[i]) featureBullets.push(buildGroup(p1[i], p1[i + 1]));
  }
  while (featureBullets.length < 3) {
    featureBullets.push({ lead: 'Opening Day delivered instant signals', support: 'Stars and contenders set the tone', logoSrc: null });
  }

  // P3 = Pennant Race → 3 groups
  const p3 = getSentences(2);
  const pennantBullets = [];
  for (let i = 0; i < Math.min(p3.length, 6) && pennantBullets.length < 3; i += 2) {
    if (p3[i]) pennantBullets.push(buildGroup(p3[i], p3[i + 1]));
  }
  while (pennantBullets.length < 3) {
    const fills = [
      { lead: 'Divisional races are forming early', support: 'Positioning matters from day one', logoSrc: null },
      { lead: 'Contenders are making early moves', support: 'Every win counts in tight divisions', logoSrc: null },
      { lead: 'Early standings shape the narrative', support: 'The race is already on', logoSrc: null },
    ];
    pennantBullets.push(fills[pennantBullets.length] || fills[0]);
  }

  // P2 = World Series Odds → 3 groups + hero stat
  const p2 = getSentences(1);
  const marketBullets = [];
  for (let i = 0; i < Math.min(p2.length, 6) && marketBullets.length < 3; i += 2) {
    if (p2[i]) marketBullets.push(buildGroup(p2[i], p2[i + 1]));
  }
  while (marketBullets.length < 3) {
    const fills = [
      { lead: 'Market positioning is taking shape', support: 'Early favorites are emerging', logoSrc: null },
      { lead: 'The chase pack is forming behind', support: 'Several teams in contention', logoSrc: null },
      { lead: 'Odds will shift as the season unfolds', support: 'Early signals set the tone', logoSrc: null },
    ];
    marketBullets.push(fills[marketBullets.length] || fills[0]);
  }

  // Market hero stat extraction
  let odds = '+210';
  let implied = '32.3% IMPLIED';
  let heroSlug = 'lad';
  const oddsMatch = (paras[1] || '').match(/\+\d+/);
  if (oddsMatch) odds = oddsMatch[0];
  const impliedMatch = (paras[1] || '').match(/(\d+\.?\d*)%/);
  if (impliedMatch) implied = `${impliedMatch[1]}% IMPLIED`;
  const detectedSlug = findSlug(paras[1] || '');
  if (detectedSlug) heroSlug = detectedSlug;

  return {
    dateLabel: today,
    mlbLogoSrc: '/mlb-logo.png',
    headline: content.headline,
    subhead: content.subheadline || null,
    featureBullets,
    featureTakeaway: 'Opening Day brought stars, statements, and instant pressure.',
    pennantBullets,
    pennantTakeaway: 'Divisional races already have shape — nothing is settled.',
    marketHero: { odds, implied, logoSrc: logoSrc(heroSlug) },
    marketBullets,
    marketTakeaway: 'The market is clustering around a clear top tier.',
  };
}

// ─── Component ──────────────────────────────────────────────────

function InlineLogo({ src, size = 20, className }) {
  if (!src) return null;
  return <img src={src} alt="" width={size} height={size} className={className} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />;
}

export default function MlbDailySlide2({ data, asOf, ...rest }) {
  const c = buildSlide2Content(data);

  return (
    <div className={styles.slide2} {...rest}>
      <div className={styles.bgBase} />
      <div className={styles.bgGlow} />
      <div className={styles.bgRay} />
      <div className={styles.bgStadium} />
      <div className={styles.bgStreaks} />
      <div className={styles.bgNoise} />

      <header className={styles.slide2Top}>
        <div className={styles.slide2TopPill}>
          <img src={c.mlbLogoSrc} alt="" className={styles.slide2TopLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span>TODAY'S INTEL BRIEFING</span>
        </div>
        <div className={styles.slide2Date}>{c.dateLabel}</div>
      </header>

      <section className={styles.slide2HeadlineBlock}>
        <h1 className={styles.slide2Headline}>{c.headline}</h1>
        {c.subhead && <p className={styles.slide2Subhead}>{c.subhead}</p>}
      </section>

      {/* Feature card */}
      <section className={styles.slide2FeatureCard}>
        <div className={styles.slide2SectionPill}>HOT OFF THE PRESS</div>
        <div className={styles.slide2FeatureBullets}>
          {c.featureBullets.map((b, i) => (
            <div key={i} className={styles.slide2BulletGroup}>
              <div className={styles.slide2BulletMarker} />
              <div className={styles.slide2BulletContent}>
                <div className={styles.slide2FeatureLead}>
                  <InlineLogo src={b.logoSrc} size={22} className={styles.slide2InlineLogo} />
                  {b.lead}
                </div>
                <div className={styles.slide2FeatureLine}>{b.support}</div>
              </div>
            </div>
          ))}
        </div>
        <div className={styles.slide2FeatureTakeaway}>{c.featureTakeaway}</div>
      </section>

      {/* Support grid */}
      <section className={styles.slide2SupportGrid}>
        {/* Pennant Race */}
        <article className={styles.slide2SupportCard}>
          <div className={styles.slide2SectionPill}>PENNANT RACE</div>
          <div className={styles.slide2SupportBullets}>
            {c.pennantBullets.map((b, i) => (
              <div key={i} className={styles.slide2BulletGroup}>
                <div className={styles.slide2BulletMarker} />
                <div className={styles.slide2BulletContent}>
                  <div className={styles.slide2SupportLead}>
                    <InlineLogo src={b.logoSrc} size={18} className={styles.slide2InlineLogoSm} />
                    {b.lead}
                  </div>
                  <div className={styles.slide2SupportLine}>{b.support}</div>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.slide2SupportTakeaway}>{c.pennantTakeaway}</div>
        </article>

        {/* Market Signal */}
        <article className={styles.slide2SupportCard}>
          <div className={styles.slide2SectionPill}>MARKET SIGNAL</div>
          <div className={styles.slide2MarketHero}>
            <InlineLogo src={c.marketHero.logoSrc} size={24} className={styles.slide2MarketLogo} />
            <div className={styles.slide2MarketHeroText}>
              <div className={styles.slide2MarketOdds}>{c.marketHero.odds}</div>
              <div className={styles.slide2MarketImplied}>{c.marketHero.implied}</div>
            </div>
          </div>
          <div className={styles.slide2SupportBullets}>
            {c.marketBullets.map((b, i) => (
              <div key={i} className={styles.slide2BulletGroup}>
                <div className={styles.slide2BulletMarker} />
                <div className={styles.slide2BulletContent}>
                  <div className={styles.slide2SupportLead}>
                    <InlineLogo src={b.logoSrc} size={18} className={styles.slide2InlineLogoSm} />
                    {b.lead}
                  </div>
                  <div className={styles.slide2SupportLine}>{b.support}</div>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.slide2SupportTakeaway}>{c.marketTakeaway}</div>
        </article>
      </section>

      <footer className={styles.slide2Footer}>
        <div className={styles.slide2SwipeCue}>Swipe for World Series Outlook →</div>
        <div className={styles.slide2Site}>maximussports.ai</div>
      </footer>
    </div>
  );
}
