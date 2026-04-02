/**
 * MlbDailySlide2 — Today's Intel Briefing (Slide 2 of MLB Daily Briefing carousel)
 *
 * Premium bullet-driven editorial digest. No paragraphs.
 * Structured: Feature card (HOT OFF THE PRESS) + Support grid (PENNANT RACE + MARKET SIGNAL)
 *
 * 1080×1350 · IG 4:5 portrait
 */

import { buildDailyContent, stripEmojis } from './mlbDailyHelpers';
import { parseBriefingToIntel } from '../../../features/mlb/contentStudio/normalizeMlbImagePayload';
import styles from './MlbSlides.module.css';

// ─── Transform briefing into structured bullet content ──────────

function buildSlide2Content(data) {
  const content = buildDailyContent(data);
  const intel = parseBriefingToIntel(data?.mlbBriefing);
  const paras = intel?.rawParagraphs || [];

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  // Extract sentences from a paragraph
  const getSentences = (idx) => {
    const para = paras[idx];
    if (!para) return [];
    const cleaned = stripEmojis(para);
    if (!cleaned || cleaned.length < 30) return [];
    const labelMatch = cleaned.match(/^([A-Z][A-Z\s&+\-:]*[A-Z])\s*[:—–-]\s*/);
    const body = labelMatch ? cleaned.slice(labelMatch[0].length) : cleaned;
    return (body.match(/[^.!?]*[.!?]+/g) || [body]).map(s => s.trim()).filter(Boolean);
  };

  // P1 = Around the League → feature bullets
  const p1 = getSentences(0);
  const featureBullets = [];
  // Group sentences into bullet groups of ~2
  for (let i = 0; i < Math.min(p1.length, 6); i += 2) {
    featureBullets.push({
      lead: p1[i] || '',
      lines: p1[i + 1] ? [p1[i + 1]] : [],
    });
  }
  if (featureBullets.length === 0) {
    featureBullets.push({ lead: content.headline || 'Opening Day delivered', lines: [] });
  }

  // P3 = Pennant Race → bullets
  const p3 = getSentences(2);
  const pennantBullets = [];
  for (let i = 0; i < Math.min(p3.length, 4); i += 2) {
    pennantBullets.push({
      lead: p3[i] || '',
      lines: p3[i + 1] ? [p3[i + 1]] : [],
    });
  }
  if (pennantBullets.length === 0) {
    pennantBullets.push({ lead: 'Divisional races already taking shape', lines: [] });
  }

  // P2 = World Series Odds Pulse → market bullets + hero stat
  const p2 = getSentences(1);
  const marketBullets = [];
  for (let i = 0; i < Math.min(p2.length, 4); i += 2) {
    marketBullets.push({
      lead: p2[i] || '',
      lines: p2[i + 1] ? [p2[i + 1]] : [],
    });
  }
  if (marketBullets.length === 0) {
    marketBullets.push({ lead: 'Market positioning still forming', lines: [] });
  }

  // Extract market hero stat from P2 text
  let marketOdds = '+210';
  let marketImplied = '32.3% IMPLIED';
  const oddsMatch = (paras[1] || '').match(/\+\d+/);
  if (oddsMatch) marketOdds = oddsMatch[0];
  const impliedMatch = (paras[1] || '').match(/(\d+\.?\d*)%/);
  if (impliedMatch) marketImplied = `${impliedMatch[1]}% IMPLIED`;

  return {
    dateLabel: today,
    headline: content.headline,
    subhead: content.subheadline || null,
    featureBullets,
    featureTakeaway: 'The season opened with stars, statements, and instant pressure.',
    pennantBullets,
    pennantTakeaway: 'Divisional races already have shape — nothing is settled.',
    marketHero: { odds: marketOdds, implied: marketImplied },
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

      <section className={styles.slide2FeatureCard}>
        <div className={styles.slide2SectionPill}>HOT OFF THE PRESS</div>
        <div className={styles.slide2BulletGroups}>
          {c.featureBullets.map((group, idx) => (
            <div key={idx} className={styles.slide2BulletGroup}>
              <div className={styles.slide2BulletMarker} />
              <div className={styles.slide2BulletContent}>
                <div className={styles.slide2BulletLead}>{group.lead}</div>
                {group.lines?.map((line, li) => (
                  <div key={li} className={styles.slide2BulletLine}>{line}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.slide2FeatureTakeaway}>{c.featureTakeaway}</div>
      </section>

      <section className={styles.slide2SupportGrid}>
        {/* Pennant Race */}
        <article className={styles.slide2SupportCard}>
          <div className={styles.slide2SectionPill}>PENNANT RACE</div>
          <div className={styles.slide2BulletGroups}>
            {c.pennantBullets.map((group, idx) => (
              <div key={idx} className={styles.slide2BulletGroup}>
                <div className={styles.slide2BulletMarker} />
                <div className={styles.slide2BulletContent}>
                  <div className={styles.slide2SupportLead}>{group.lead}</div>
                  {group.lines?.map((line, li) => (
                    <div key={li} className={styles.slide2SupportLine}>{line}</div>
                  ))}
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
            <div className={styles.slide2MarketOdds}>{c.marketHero.odds}</div>
            <div className={styles.slide2MarketImplied}>{c.marketHero.implied}</div>
          </div>
          <div className={styles.slide2BulletGroups}>
            {c.marketBullets.map((group, idx) => (
              <div key={idx} className={styles.slide2BulletGroup}>
                <div className={styles.slide2BulletMarker} />
                <div className={styles.slide2BulletContent}>
                  <div className={styles.slide2SupportLead}>{group.lead}</div>
                  {group.lines?.map((line, li) => (
                    <div key={li} className={styles.slide2SupportLine}>{line}</div>
                  ))}
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
