/**
 * MlbDailySlide2 — Today's Intel Briefing (Slide 2 of MLB Daily Briefing carousel)
 *
 *   HOT OFF THE PRESS   → 4-5 current top-news bullets (19px)
 *   PENNANT RACE        → 4 Season Intelligence bullets (18px)
 *   MAXIMUS'S PICKS     → 3-4 game-intel pick modules
 *
 * 1080×1350 · IG 4:5 portrait
 */

import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import { buildDailyContent, stripEmojis, buildSeasonIntelLeaders } from './mlbDailyHelpers';
import { parseBriefingToIntel } from '../../../features/mlb/contentStudio/normalizeMlbImagePayload';
import styles from './MlbSlides.module.css';

// ─── Helpers ──────────────────────────────────────────────────

const TEAM_KW = {
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
  'angels': 'laa', 'nationals': 'wsh', 'rays': 'tb',
  'twins': 'min', 'royals': 'kc', 'reds': 'cin',
  'brewers': 'mil', 'pirates': 'pit', 'cardinals': 'stl',
  'rockies': 'col', 'white sox': 'cws', 'athletics': 'oak',
  'marlins': 'mia',
};

function findSlug(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [kw, slug] of Object.entries(TEAM_KW)) {
    if (lower.includes(kw)) return slug;
  }
  return null;
}

function logoUrl(slug) {
  return slug ? getMlbEspnLogoUrl(slug) : null;
}

function trim(text, max = 85) {
  if (!text) return '';
  let s = text.trim();
  s = s.replace(/^(Meanwhile,?\s*|In other action,?\s*|Additionally,?\s*|Also,?\s*)/i, '');
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/\s+\S*$/, '') + '.';
}

/** Format confidence tier for display */
function fmtConviction(tier) {
  if (!tier) return 'Edge';
  if (tier === 'high') return 'High';
  if (tier === 'medium-high') return 'Med-High';
  if (tier === 'medium') return 'Medium';
  return tier.charAt(0).toUpperCase() + tier.slice(1);
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

  // ── HOT OFF THE PRESS: 4-5 bullets ──
  const p1 = getSentences(0);
  const featureBullets = p1.slice(0, 5).map(s => ({
    text: trim(s),
    logoSrc: logoUrl(findSlug(s)),
  }));
  while (featureBullets.length < 4) {
    featureBullets.push({ text: 'Contenders wasted no time making early statements', logoSrc: null });
  }

  // ── PENNANT RACE: 4 bullets from Season Intelligence ──
  const champOdds = data?.mlbChampOdds ?? {};
  const seasonIntel = buildSeasonIntelLeaders(champOdds) || [];
  const pennantBullets = seasonIntel.slice(0, 4).map(t => {
    const signal = t.signals?.[0] || '';
    let line = `${t.abbrev} projects at ${t.projectedWins} wins`;
    if (signal) line += ` — ${signal}`;
    else if (t.marketDelta > 0) line += ` (+${t.marketDelta.toFixed(1)} vs market)`;
    return { text: trim(line), logoSrc: logoUrl(t.slug) };
  });
  while (pennantBullets.length < 4) {
    pennantBullets.push({ text: 'Top contenders are establishing early separation', logoSrc: null });
  }

  // ── MAXIMUS'S PICKS: 3-4 structured pick modules ──
  const pickCats = data?.mlbPicks?.categories || data?.canonicalPicks?.categories || {};
  const rawPicks = [
    ...(pickCats.pickEms || []).map(p => ({ ...p, type: "Pick 'Em" })),
    ...(pickCats.ats || []).map(p => ({ ...p, type: 'ATS' })),
    ...(pickCats.totals || []).map(p => ({ ...p, type: 'O/U' })),
  ];
  rawPicks.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

  const picks = rawPicks.slice(0, 4).map(p => {
    const away = p.matchup?.awayTeam?.shortName || p.matchup?.awayTeam?.name || '?';
    const home = p.matchup?.homeTeam?.shortName || p.matchup?.homeTeam?.name || '?';
    const matchup = `${away} vs ${home}`;
    const selection = p.pick?.label || '—';
    const conviction = fmtConviction(p.confidence);
    const rationale = p.pick?.explanation ? trim(p.pick.explanation, 60) : `Model edge: ${conviction.toLowerCase()} conviction`;
    return { matchup, type: p.type, selection, conviction, rationale };
  });
  while (picks.length < 3) {
    picks.push({ matchup: 'TBD vs TBD', type: "Pick 'Em", selection: '—', conviction: 'Edge', rationale: 'More picks in the full daily board' });
  }

  return {
    dateLabel: today,
    mlbLogoSrc: '/mlb-logo.png',
    headline: content.headline,
    subhead: content.subheadline || null,
    featureBullets,
    featureTakeaway: "Today's board is being shaped by stars, debuts, and early pressure.",
    pennantBullets,
    pennantTakeaway: 'The board is tightening around a familiar contender tier.',
    picks,
  };
}

// ─── Component ──────────────────────────────────────────────────

function InlineLogo({ src, size = 20 }) {
  if (!src) return null;
  return <img src={src} alt="" width={size} height={size} className={styles.slide2InlineLogo} crossOrigin="anonymous" onError={e => { e.currentTarget.style.display = 'none'; }} />;
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

      {/* HOT OFF THE PRESS */}
      <section className={styles.slide2FeatureCard}>
        <div className={styles.slide2SectionPill}>HOT OFF THE PRESS</div>
        <div className={styles.slide2BulletList}>
          {c.featureBullets.map((b, i) => (
            <div key={i} className={styles.slide2BulletRow}>
              <div className={styles.slide2BulletMarker} />
              <InlineLogo src={b.logoSrc} size={20} />
              <div className={styles.slide2FeatureText}>{b.text}</div>
            </div>
          ))}
        </div>
        {c.featureTakeaway && <div className={styles.slide2CardTakeaway}>{c.featureTakeaway}</div>}
      </section>

      <section className={styles.slide2SupportGrid}>
        {/* PENNANT RACE */}
        <article className={styles.slide2SupportCard}>
          <div className={styles.slide2SectionPill}>PENNANT RACE</div>
          <div className={styles.slide2BulletList}>
            {c.pennantBullets.map((b, i) => (
              <div key={i} className={styles.slide2BulletRow}>
                <div className={styles.slide2BulletMarker} />
                <InlineLogo src={b.logoSrc} size={18} />
                <div className={styles.slide2BulletText}>{b.text}</div>
              </div>
            ))}
          </div>
          {c.pennantTakeaway && <div className={styles.slide2CardTakeaway}>{c.pennantTakeaway}</div>}
        </article>

        {/* MAXIMUS'S PICKS */}
        <article className={styles.slide2SupportCard}>
          <div className={styles.slide2SectionPill}>MAXIMUS'S PICKS</div>
          <div className={styles.slide2PicksList}>
            {c.picks.map((p, i) => (
              <div key={i} className={styles.slide2PickCard}>
                <div className={styles.slide2PickTopRow}>
                  <div className={styles.slide2PickMatchup}>{p.matchup}</div>
                  <div className={styles.slide2PickTypePill}>{p.type}</div>
                </div>
                <div className={styles.slide2PickMiddleRow}>
                  <div className={styles.slide2PickSelection}>{p.selection}</div>
                  <div className={styles.slide2PickConviction}>{p.conviction}</div>
                </div>
                <div className={styles.slide2PickRationale}>{p.rationale}</div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <footer className={styles.slide2Footer}>
        <div className={styles.slide2SwipeCue}>Swipe for World Series Outlook →</div>
        <div className={styles.slide2Site}>maximussports.ai</div>
      </footer>
    </div>
  );
}
