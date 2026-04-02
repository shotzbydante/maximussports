/**
 * MlbDailySlide2 — Today's Intel Briefing (Slide 2 of MLB Daily Briefing carousel)
 *
 * Premium bullet-driven editorial digest with team logo accents.
 * Structured: Feature card (HOT OFF THE PRESS) + Support grid (PENNANT RACE + MARKET SIGNAL)
 *
 * 1080×1350 · IG 4:5 portrait
 */

import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import { buildDailyContent, stripEmojis } from './mlbDailyHelpers';
import { parseBriefingToIntel } from '../../../features/mlb/contentStudio/normalizeMlbImagePayload';
import styles from './MlbSlides.module.css';

// ─── Team logo inline accent ──────────────────────────────────

function InlineLogo({ slug, size = 20 }) {
  const url = getMlbEspnLogoUrl(slug);
  if (!url) return null;
  return <img src={url} alt="" width={size} height={size} className={styles.slide2InlineLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />;
}

// ─── Shorten a sentence to be punchier ────────────────────────

function shorten(text, maxLen = 65) {
  if (!text) return '';
  let s = text.trim();
  // Remove common filler patterns
  s = s.replace(/^(Meanwhile,?\s*|In other action,?\s*|Additionally,?\s*|Looking at\s+)/i, '');
  if (s.length <= maxLen) return s;
  // Truncate at last word boundary before maxLen
  const cut = s.slice(0, maxLen).replace(/\s+\S*$/, '');
  return cut + '.';
}

// ─── Extract team slugs from text ─────────────────────────────

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
};

function findTeamSlug(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [kw, slug] of Object.entries(TEAM_KEYWORDS)) {
    if (lower.includes(kw)) return slug;
  }
  return null;
}

// ─── Transform briefing into structured bullet content ────────

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

  // Feature bullets — max 3 groups, shortened
  const p1 = getSentences(0);
  const featureBullets = [];
  for (let i = 0; i < Math.min(p1.length, 6); i += 2) {
    const lead = shorten(p1[i]);
    const support = p1[i + 1] ? shorten(p1[i + 1], 55) : null;
    if (lead) featureBullets.push({ lead, line: support, slug: findTeamSlug(p1[i]) });
  }
  if (featureBullets.length === 0) {
    featureBullets.push({ lead: 'Opening Day delivered', line: null, slug: null });
  }
  // Cap at 3
  featureBullets.length = Math.min(featureBullets.length, 3);

  // Pennant bullets — max 3 groups
  const p3 = getSentences(2);
  const pennantBullets = [];
  for (let i = 0; i < Math.min(p3.length, 6); i += 2) {
    const lead = shorten(p3[i]);
    const support = p3[i + 1] ? shorten(p3[i + 1], 50) : null;
    if (lead) pennantBullets.push({ lead, line: support, slug: findTeamSlug(p3[i]) });
  }
  if (pennantBullets.length === 0) {
    pennantBullets.push({ lead: 'Divisional races already taking shape', line: null, slug: null });
  }
  pennantBullets.length = Math.min(pennantBullets.length, 3);

  // Market bullets — max 3 groups
  const p2 = getSentences(1);
  const marketBullets = [];
  for (let i = 0; i < Math.min(p2.length, 6); i += 2) {
    const lead = shorten(p2[i]);
    const support = p2[i + 1] ? shorten(p2[i + 1], 50) : null;
    if (lead) marketBullets.push({ lead, line: support, slug: findTeamSlug(p2[i]) });
  }
  if (marketBullets.length === 0) {
    marketBullets.push({ lead: 'Market positioning still forming', line: null, slug: null });
  }
  marketBullets.length = Math.min(marketBullets.length, 3);

  // Market hero stat
  let marketOdds = '+210';
  let marketImplied = '32.3% IMPLIED';
  let marketLeadSlug = 'lad';
  const oddsMatch = (paras[1] || '').match(/\+\d+/);
  if (oddsMatch) marketOdds = oddsMatch[0];
  const impliedMatch = (paras[1] || '').match(/(\d+\.?\d*)%/);
  if (impliedMatch) marketImplied = `${impliedMatch[1]}% IMPLIED`;
  const leadSlug = findTeamSlug(paras[1] || '');
  if (leadSlug) marketLeadSlug = leadSlug;

  return {
    dateLabel: today,
    headline: content.headline,
    subhead: content.subheadline || null,
    featureBullets,
    featureTakeaway: 'Opening Day brought instant pressure, stars, and signals.',
    pennantBullets,
    pennantTakeaway: 'Divisional races already have shape — nothing is settled.',
    marketHero: { odds: marketOdds, implied: marketImplied, slug: marketLeadSlug },
    marketBullets,
    marketTakeaway: 'The market is clustering around a top tier with clear favorites.',
  };
}

// ─── Component ──────────────────────────────────────────────────

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
          <img src="/mlb-logo.png" alt="" className={styles.slide2TopLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span>TODAY'S INTEL BRIEFING</span>
        </div>
        <div className={styles.slide2Date}>{c.dateLabel}</div>
      </header>

      <section className={styles.slide2HeadlineBlock}>
        <h1 className={styles.slide2Headline}>{c.headline}</h1>
        {c.subhead && <p className={styles.slide2Subhead}>{c.subhead}</p>}
      </section>

      {/* Feature card — HOT OFF THE PRESS */}
      <section className={styles.slide2FeatureCard}>
        <div className={styles.slide2SectionPill}>HOT OFF THE PRESS</div>
        <div className={styles.slide2BulletGroups}>
          {c.featureBullets.map((b, idx) => (
            <div key={idx} className={styles.slide2BulletGroup}>
              <div className={styles.slide2BulletMarker} />
              <div className={styles.slide2BulletContent}>
                <div className={styles.slide2BulletLead}>
                  {b.slug && <InlineLogo slug={b.slug} size={22} />}
                  {b.lead}
                </div>
                {b.line && <div className={styles.slide2BulletLine}>{b.line}</div>}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.slide2Takeaway}>{c.featureTakeaway}</div>
      </section>

      {/* Support grid */}
      <section className={styles.slide2SupportGrid}>
        {/* Pennant Race */}
        <article className={styles.slide2SupportCard}>
          <div className={styles.slide2SectionPill}>PENNANT RACE</div>
          <div className={styles.slide2BulletGroups}>
            {c.pennantBullets.map((b, idx) => (
              <div key={idx} className={styles.slide2BulletGroup}>
                <div className={styles.slide2BulletMarker} />
                <div className={styles.slide2BulletContent}>
                  <div className={styles.slide2BulletLead}>
                    {b.slug && <InlineLogo slug={b.slug} size={18} />}
                    {b.lead}
                  </div>
                  {b.line && <div className={styles.slide2BulletLine}>{b.line}</div>}
                </div>
              </div>
            ))}
          </div>
          <div className={styles.slide2Takeaway}>{c.pennantTakeaway}</div>
        </article>

        {/* Market Signal */}
        <article className={styles.slide2SupportCard}>
          <div className={styles.slide2SectionPill}>MARKET SIGNAL</div>
          <div className={styles.slide2MarketHero}>
            <InlineLogo slug={c.marketHero.slug} size={26} />
            <div className={styles.slide2MarketOdds}>{c.marketHero.odds}</div>
            <div className={styles.slide2MarketImplied}>{c.marketHero.implied}</div>
          </div>
          <div className={styles.slide2BulletGroups}>
            {c.marketBullets.map((b, idx) => (
              <div key={idx} className={styles.slide2BulletGroup}>
                <div className={styles.slide2BulletMarker} />
                <div className={styles.slide2BulletContent}>
                  <div className={styles.slide2BulletLead}>
                    {b.slug && <InlineLogo slug={b.slug} size={18} />}
                    {b.lead}
                  </div>
                  {b.line && <div className={styles.slide2BulletLine}>{b.line}</div>}
                </div>
              </div>
            ))}
          </div>
          <div className={styles.slide2Takeaway}>{c.marketTakeaway}</div>
        </article>
      </section>

      <footer className={styles.slide2Footer}>
        <div className={styles.slide2SwipeCue}>Swipe for World Series Outlook →</div>
        <div className={styles.slide2Site}>maximussports.ai</div>
      </footer>
    </div>
  );
}
