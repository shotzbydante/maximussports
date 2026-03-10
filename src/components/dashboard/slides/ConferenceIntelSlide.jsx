/**
 * ConferenceIntelSlide — Instagram Hero · Conference Intel
 *
 * Cinematic, premium, conference-level intelligence post.
 * Reuses the visual language of TeamIntelSlide4 but at the conference level.
 *
 * Content hierarchy:
 *   1. Header       — Maximus branding + timestamp
 *   2. Conference logo hero (real PNGs where available, styled fallback otherwise)
 *   3. Conference name + subline
 *   4. Narrative headline (conference-level scoring engine)
 *   5. Quick intel subtext
 *   6. Intel bullets (4–5 conference-level insights)
 *   7. Featured teams with logos + rank badge + championship odds
 *   8. Footer
 */

import { useState } from 'react';
import { TEAMS } from '../../../data/teams';
import { getTeamSlug } from '../../../utils/teamSlug';
import { getEspnConfLogoUrl } from '../../../utils/conferenceLogos';
import styles from './ConferenceIntelSlide.module.css';

// ─── Conference color palette ─────────────────────────────────────────────────

const CONF_COLORS = {
  'SEC':           { primary: '#D4A843', secondary: '#1A1A2E' },
  'Big Ten':       { primary: '#0088CE', secondary: '#0A1628' },
  'ACC':           { primary: '#0054A6', secondary: '#0A1428' },
  'Big 12':        { primary: '#D32F2F', secondary: '#1A0F0F' },
  'Big East':      { primary: '#E0E0E0', secondary: '#141422' },
  'WCC':           { primary: '#1E88E5', secondary: '#0C1A2E' },
  'Mountain West': { primary: '#005EB8', secondary: '#0A1222' },
  'AAC':           { primary: '#E53935', secondary: '#1A1014' },
  'A-10':          { primary: '#9C27B0', secondary: '#14091A' },
  'MVC':           { primary: '#2E7D32', secondary: '#0A1A0C' },
  'MAC':           { primary: '#00695C', secondary: '#081A16' },
  'CUSA':          { primary: '#1565C0', secondary: '#0A1228' },
  'WAC':           { primary: '#1B5E20', secondary: '#0A1A0C' },
  'Southland':     { primary: '#F57C00', secondary: '#1A1208' },
};

function getConfColors(conf) {
  return CONF_COLORS[conf] || { primary: '#4A90D9', secondary: '#071422' };
}

// ─── Conference logo resolution ───────────────────────────────────────────────
// Uses ESPN CDN for up-to-date, clean conference logos.
// Fallback: styled badge with conference abbreviation.

// ─── Phrase variation ─────────────────────────────────────────────────────────

function _hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function _pick(arr, seed) { return arr[_hash(seed || '') % arr.length]; }

function shortName(fullName) {
  if (!fullName) return '';
  const parts = fullName.split(' ');
  if (parts.length <= 1) return fullName;
  return parts.slice(0, -1).join(' ');
}

// ─── Conference narrative engine ──────────────────────────────────────────────

function buildConferenceIntel(conf, allTeams, dashData) {
  const confTeams = allTeams.filter(t => t.conference === conf);
  if (confTeams.length === 0) {
    return {
      headline: `${conf.toUpperCase()}\nINTEL`,
      subtext: `Conference intelligence report for the ${conf}.`,
      bullets: [`Tracking ${conf} teams and market signals`],
      featured: [],
    };
  }

  const isMarch = new Date().getMonth() === 2;
  const atsLeaders = dashData?.atsLeaders ?? { best: [], worst: [] };
  const allBest = [...(atsLeaders.best ?? [])];
  const allWorst = [...(atsLeaders.worst ?? [])];
  const champOdds = dashData?.championshipOdds ?? {};

  // Build slug → AP rank map from rankingsTop25
  const rankBySlug = {};
  for (const r of (dashData?.rankingsTop25 ?? [])) {
    const name = r.teamName || r.name || r.team || '';
    if (!name) continue;
    const rank = r.rank ?? r.ranking ?? null;
    if (rank == null) continue;
    const slug = getTeamSlug(name);
    if (slug) rankBySlug[slug] = rank;
  }

  const confSlugs = new Set(confTeams.map(t => t.slug));
  const confBest = allBest.filter(r => confSlugs.has(r.slug));
  const confWorst = allWorst.filter(r => confSlugs.has(r.slug));

  const lockTeams = confTeams.filter(t => t.oddsTier === 'Lock');
  const shouldBeIn = confTeams.filter(t => t.oddsTier === 'Should be in');
  const contenders = [...lockTeams, ...shouldBeIn];
  const longShots = confTeams.filter(t => t.oddsTier === 'Long shot');

  // ── Build featured teams with metadata (top 6 by championship odds) ──
  const featured = [];
  const tierOrder = ['Lock', 'Should be in', 'Work to do', 'Long shot'];

  const sorted = [...confTeams].sort((a, b) => {
    const oddsA = champOdds[a.slug]?.bestChanceAmerican ?? champOdds[a.slug]?.american ?? null;
    const oddsB = champOdds[b.slug]?.bestChanceAmerican ?? champOdds[b.slug]?.american ?? null;
    if (oddsA != null && oddsB != null) return oddsA - oddsB;
    if (oddsA != null) return -1;
    if (oddsB != null) return 1;
    return tierOrder.indexOf(a.oddsTier) - tierOrder.indexOf(b.oddsTier);
  });

  const recordBySlug = {};
  for (const r of (dashData?.rankingsTop25 ?? [])) {
    const name = r.teamName || r.name || r.team || '';
    if (!name) continue;
    const record = r.recordSummary || r.record || null;
    const slug = getTeamSlug(name);
    if (slug && record) recordBySlug[slug] = record;
  }

  for (const t of sorted.slice(0, 6)) {
    const co = champOdds[t.slug];
    const odds = co?.bestChanceAmerican ?? co?.american ?? null;
    featured.push({
      slug: t.slug,
      name: shortName(t.name),
      tier: t.oddsTier,
      odds: typeof odds === 'number' ? odds : null,
      rank: rankBySlug[t.slug] ?? null,
      record: recordBySlug[t.slug] ?? null,
    });
  }

  // ── Build bullets (4–5 substantive insights, each with a contextual emoji) ──
  const bullets = [];

  if (lockTeams.length > 0) {
    const names = lockTeams.slice(0, 3).map(t => shortName(t.name));
    if (lockTeams.length >= 3) {
      bullets.push(_pick([
        `\uD83D\uDD25 ${conf} is stacked at the top \u2014 ${names.join(', ')} all in contention`,
        `\uD83D\uDD25 Title-tier depth: ${names.join(', ')} lead a loaded ${conf} field`,
        `\uD83D\uDD25 ${names.join(', ')} headline a ${conf} conference with serious March firepower`,
      ], conf + 'lock'));
    } else {
      bullets.push(`\uD83D\uDD25 ${names.join(' and ')} ${lockTeams.length === 1 ? 'leads' : 'lead'} the ${conf} as projected contender${lockTeams.length > 1 ? 's' : ''}`);
    }
  }

  if (confBest.length > 0) {
    const top = confBest[0];
    const rec = top.rec || top.last30 || top.season;
    const pct = rec ? Math.round((rec.w / (rec.w + rec.l)) * 100) : null;
    const name = shortName(top.name || top.slug || '');
    bullets.push(pct
      ? _pick([
        `\uD83C\uDFAF ${name} leads ${conf} ATS at ${pct}% \u2014 the market is still catching up`,
        `\uD83C\uDFAF ATS leader: ${name} covering at ${pct}%, a sharp bettor\u2019s favorite`,
        `\uD83C\uDFAF ${name} at ${pct}% ATS is the most profitable ${conf} team to back`,
      ], conf + 'ats')
      : `\uD83C\uDFAF ATS leader: ${name} \u2014 top cover rate in the ${conf}`);
  }

  if (contenders.length >= 4) {
    bullets.push(_pick([
      `\uD83C\uDFC0 ${contenders.length} teams in the tournament conversation \u2014 the ${conf} runs deep`,
      `\uD83C\uDFC0 Depth is the story: ${contenders.length} ${conf} teams with legitimate March positioning`,
      `\uD83C\uDFC0 The ${conf} has ${contenders.length} teams that could make noise in the bracket`,
    ], conf + 'depth'));
  } else if (contenders.length >= 2) {
    bullets.push(`\uD83C\uDFC0 ${contenders.length} teams positioned for March, but the gap is narrowing`);
  }

  if (isMarch) {
    bullets.push(_pick([
      `\uD83D\uDCC8 ${conf} tournament seeding on the line \u2014 every game matters from here`,
      `\uD83D\uDCC8 Conference tournament positioning is tightening across the ${conf}`,
      `\uD83D\uDCC8 March pressure building: ${conf} bracket implications rising daily`,
      `\uD83D\uDCC8 Selection Sunday looming \u2014 ${conf} bubble teams running out of time`,
    ], conf + 'march'));
  }

  if (confWorst.length > 0) {
    const cold = confWorst[0];
    const name = shortName(cold.name || cold.slug || '');
    bullets.push(_pick([
      `\u26A0\uFE0F ${name} struggling ATS \u2014 the market has adjusted`,
      `\u26A0\uFE0F Avoid alert: ${name} is cold against the spread and fading`,
      `\u26A0\uFE0F ${name} is the ${conf}\u2019s biggest ATS fade right now`,
    ], conf + 'cold'));
  }

  if (longShots.length >= 2 && bullets.length < 5) {
    bullets.push(_pick([
      `\uD83D\uDC40 ${longShots.length} ${conf} teams with long-shot value \u2014 watch for bracket busters`,
      `\uD83D\uDC40 Sleeper potential: ${shortName(longShots[0].name)} and ${shortName(longShots[1].name)} worth monitoring`,
    ], conf + 'longshot'));
  }

  if (bullets.length < 4) {
    bullets.push(`\uD83D\uDCCA ${confTeams.length} tracked teams across the ${conf} with active market signals`);
  }

  // ── Headline generation — editorial, never restates conference name ──
  const isPower = lockTeams.length >= 4;
  const isMid = lockTeams.length <= 1 && confTeams.length <= 5;
  const hasAtsValue = confBest.length >= 2;
  const hasBubble = contenders.length >= 3 && contenders.length <= 6;

  let headlinePool;
  if (isPower && hasAtsValue) {
    headlinePool = [
      'BRACKET BUILT\nDIFFERENT',
      'POWER AT\nTHE TOP',
      'DEPTH THAT\nTRAVELS',
      'MARCH\nSHARPNESS',
    ];
  } else if (isPower) {
    headlinePool = [
      'STOCK CLIMBING\nFAST',
      'LOADED FOR\nMARCH',
      'FIREPOWER\nRISING',
      'STACKED\nAND READY',
    ];
  } else if (isMid && longShots.length >= 2) {
    headlinePool = [
      'QUIETLY\nDANGEROUS',
      'SLEEPER VALUE\nRISING',
      'UNDER THE\nRADAR',
      'DARK HORSE\nTERRITORY',
    ];
  } else if (isMid) {
    headlinePool = [
      'TOURNAMENT\nTEETH',
      'HIDDEN\nEDGE',
      'WATCH THIS\nCONFERENCE',
      'MORE THAN\nYOU THINK',
    ];
  } else if (hasBubble) {
    headlinePool = [
      'BUBBLE\nHEAT',
      'SURVIVE AND\nADVANCE',
      'THE RACE\nTIGHTENS',
      'ON THE\nBUBBLE',
    ];
  } else {
    headlinePool = [
      'HEATING\nUP',
      'MARKET\nMOVING',
      'MOMENTUM\nBUILDING',
      'MAKING\nNOISE',
    ];
  }

  if (isMarch && isPower) headlinePool.push('MARCH\nREADY', 'FINAL FOUR\nVIBES');
  if (isMarch && hasBubble) headlinePool.push('SELECTION\nPRESSURE', 'DO OR\nDIE');

  const headline = _pick(headlinePool, conf);

  // ── Subtext ──
  let subtextPool;
  if (isPower) {
    subtextPool = [
      `The ${conf} is tightening up at the top with multiple contenders fighting for seeding and momentum.`,
      `Depth and talent define the ${conf} as the postseason approaches \u2014 this conference runs deep.`,
      `Multiple ${conf} teams are making noise \u2014 the national conversation starts here.`,
    ];
  } else if (isMid) {
    subtextPool = [
      `The ${conf} has value hiding in plain sight. Sharp bettors are paying attention.`,
      `Don\u2019t sleep on the ${conf} \u2014 the numbers tell an interesting story heading into March.`,
      `Small-conference intel that smart money is watching closely right now.`,
    ];
  } else {
    subtextPool = [
      `The ${conf} is in the spotlight. Here\u2019s what the data and the market say right now.`,
      `Full ${conf} breakdown: positioning, ATS trends, and what to watch heading forward.`,
      `Key teams, market signals, and tournament angles across the ${conf}.`,
    ];
  }
  const subtext = _pick(subtextPool, conf + 'sub');

  return {
    headline,
    subtext,
    bullets: bullets.slice(0, 5),
    featured: featured.slice(0, 6),
  };
}

// ─── Conference logo component with error handling ────────────────────────────

function ConfLogo({ conf, className, fallbackClassName }) {
  const [imgFailed, setImgFailed] = useState(false);
  const espnUrl = getEspnConfLogoUrl(conf);

  if (imgFailed || !espnUrl) {
    const abbr = conf.replace(/[^A-Z0-9]/gi, '').slice(0, 5).toUpperCase();
    return <div className={fallbackClassName}>{abbr}</div>;
  }

  return (
    <img
      src={espnUrl}
      alt={conf}
      className={className}
      crossOrigin="anonymous"
      onError={() => setImgFailed(true)}
    />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConferenceIntelSlide({ data, conferenceData, asOf, ...rest }) {
  const conf = conferenceData?.conference || 'Conference';
  const { primary, secondary } = getConfColors(conf);
  const intel = buildConferenceIntel(conf, TEAMS, data);

  const confTeams = TEAMS.filter(t => t.conference === conf);
  const subline = `${confTeams.length} team${confTeams.length !== 1 ? 's' : ''} tracked \u00b7 Conference Intel`;

  return (
    <div
      className={styles.artboard}
      style={{ '--conf-primary': primary, '--conf-secondary': secondary }}
      {...rest}
    >
      <div className={styles.bgBase} aria-hidden="true" />
      <div className={styles.bgGlow} aria-hidden="true" />
      <div className={styles.bgRay} aria-hidden="true" />
      <div className={styles.bgNoise} aria-hidden="true" />

      <header className={styles.header}>
        <div className={styles.logoRow}>
          <img src="/logo.png" alt="Maximus Sports" className={styles.brandLogo} crossOrigin="anonymous" />
          <div className={styles.logoMeta}>
            <span className={styles.brandName}>MAXIMUS SPORTS</span>
            <span className={styles.intelChip}>CONFERENCE INTEL</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          {asOf && <div className={styles.asOf}>As of {asOf}</div>}
          <div className={styles.maxIntel}>MAXIMUM INTELLIGENCE</div>
        </div>
      </header>

      <div className={styles.logoZone}>
        <div className={styles.logoGlowRing} aria-hidden="true" />
        <ConfLogo
          conf={conf}
          className={styles.confLogo}
          fallbackClassName={styles.confFallback}
        />
      </div>

      <div className={styles.identity}>
        <h1 className={styles.confName}>{conf.toUpperCase()} INTEL</h1>
        <div className={styles.confSubline}>{subline}</div>
      </div>

      <div className={styles.headlineZone}>
        <div className={styles.headlineDivider} />
        <h2 className={styles.headline}>
          {(intel.headline || '').split('\n').map((line, i) => (
            <span key={i} className={styles.headlineLine}>{line}</span>
          ))}
        </h2>
        <div className={styles.headlineDividerBottom} />
      </div>

      {intel.subtext && (
        <div className={styles.quickIntel}>{intel.subtext}</div>
      )}

      {intel.bullets.length > 0 && (
        <div className={styles.bulletModule}>
          <ul className={styles.bulletList}>
            {intel.bullets.map((b, i) => (
              <li key={i} className={styles.bulletItem}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {intel.featured.length > 0 && (
        <div className={styles.featuredSection}>
          <div className={styles.featuredTitle}>FEATURED TEAMS</div>
          <div className={styles.featuredGrid}>
            {intel.featured.map((t, i) => (
              <div key={i} className={styles.featuredChip}>
                {t.rank && <span className={styles.featuredRank}>#{t.rank}</span>}
                <img
                  src={`/logos/${t.slug}.png`}
                  alt=""
                  className={styles.featuredLogo}
                  crossOrigin="anonymous"
                  data-fallback-text={t.name?.slice(0, 2)?.toUpperCase() || ''}
                  onError={e => { e.currentTarget.style.display = 'none'; }}
                />
                <div className={styles.featuredMeta}>
                  <span className={styles.featuredName}>{t.name}</span>
                  {t.record && <span className={styles.featuredRecord}>{t.record}</span>}
                </div>
                {t.odds != null && (
                  <span className={styles.featuredOdds}>
                    🏆 {t.odds > 0 ? '+' : ''}{t.odds}
                  </span>
                )}
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
