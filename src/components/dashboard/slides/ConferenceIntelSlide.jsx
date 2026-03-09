/**
 * ConferenceIntelSlide — Instagram Hero · Conference Intel
 *
 * Cinematic, premium, conference-level intelligence post.
 * Reuses the visual language of TeamIntelSlide4 but at the conference level.
 *
 * Content hierarchy:
 *   1. Header       — Maximus branding + timestamp
 *   2. Conference logo hero
 *   3. Conference name + subline
 *   4. Narrative headline (conference-level scoring engine)
 *   5. Quick intel subtext
 *   6. Intel bullets (3–5 conference-level insights)
 *   7. Featured teams with logos
 *   8. Footer
 */

import { TEAMS } from '../../../data/teams';
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

// ─── Conference logo path ─────────────────────────────────────────────────────

const CONF_LOGO_MAP = {
  'SEC':           '/conferences/sec.svg',
  'Big Ten':       '/conferences/big-ten.svg',
  'ACC':           '/conferences/acc.svg',
  'Big 12':        '/conferences/big-12.svg',
  'Big East':      '/conferences/big-east.svg',
  'WCC':           '/conferences/wcc.svg',
  'Mountain West': '/conferences/mwc.svg',
  'AAC':           '/conferences/aac.svg',
  'A-10':          '/conferences/a10.svg',
  'MVC':           '/conferences/mvc.svg',
  'MAC':           '/conferences/mac.svg',
  'CUSA':          '/conferences/cusa.svg',
  'WAC':           null,
  'Southland':     '/conferences/southland.svg',
};

function getConfLogo(conf) {
  return CONF_LOGO_MAP[conf] || null;
}

// ─── Phrase variation ─────────────────────────────────────────────────────────

function _hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function _pick(arr, seed) { return arr[_hash(seed || '') % arr.length]; }

// ─── Conference narrative engine ──────────────────────────────────────────────

function buildConferenceIntel(conf, allTeams, dashData) {
  const confTeams = allTeams.filter(t => t.conference === conf);
  if (confTeams.length === 0) {
    return {
      headline: `${conf.toUpperCase()}\nINTEL`,
      subtext: `Conference intelligence report for the ${conf}.`,
      bullets: [`${confTeams.length} tracked teams in the ${conf}`],
      featured: [],
    };
  }

  const isMarch = new Date().getMonth() === 2;
  const atsLeaders = dashData?.atsLeaders ?? { best: [], worst: [] };
  const allBest = [...(atsLeaders.best ?? [])];
  const allWorst = [...(atsLeaders.worst ?? [])];

  const confSlugs = new Set(confTeams.map(t => t.slug));

  const confBest = allBest.filter(r => confSlugs.has(r.slug));
  const confWorst = allWorst.filter(r => confSlugs.has(r.slug));

  const lockTeams = confTeams.filter(t => t.oddsTier === 'Lock');
  const contenders = confTeams.filter(t => t.oddsTier === 'Lock' || t.oddsTier === 'Should be in');

  const bullets = [];
  const featured = [];

  // Ranked teams (we don't have runtime rank data, so focus on tier)
  if (lockTeams.length > 0) {
    const names = lockTeams.slice(0, 3).map(t => t.name.split(' ').slice(0, -1).join(' ') || t.name);
    bullets.push(`${lockTeams.length} projected contender${lockTeams.length > 1 ? 's' : ''}: ${names.join(', ')}`);
    lockTeams.slice(0, 4).forEach(t => featured.push({ slug: t.slug, name: t.name.split(' ').slice(0, -1).join(' ') || t.name, detail: t.oddsTier }));
  }

  // ATS leaders in conference
  if (confBest.length > 0) {
    const top = confBest[0];
    const rec = top.rec || top.last30 || top.season;
    const pct = rec ? Math.round((rec.w / (rec.w + rec.l)) * 100) : null;
    const name = (top.name || top.slug || '').split(' ').slice(0, -1).join(' ') || top.name || top.slug;
    bullets.push(pct ? `ATS leader: ${name} covering at ${pct}%` : `ATS leader: ${name}`);
  }

  // Conference depth
  if (contenders.length >= 4) {
    bullets.push(`${contenders.length} teams in the tournament conversation`);
  }

  // March context
  if (isMarch) {
    bullets.push(`${conf} tournament positioning is heating up`);
  }

  // ATS cold in conference
  if (confWorst.length > 0) {
    const cold = confWorst[0];
    const name = (cold.name || cold.slug || '').split(' ').slice(0, -1).join(' ') || cold.name || cold.slug;
    bullets.push(`${name} struggling ATS \u2014 market may have adjusted`);
  }

  // Conference team count
  if (bullets.length < 3) {
    bullets.push(`${confTeams.length} tracked teams in the ${conf}`);
  }

  // Headline generation
  const headlineTemplates = {
    powerhouse: [
      [`${conf.toUpperCase()}`, 'POWER CLUSTER'],
      [`${conf.toUpperCase()}`, 'STOCK RISING'],
      [`${conf.toUpperCase()}`, 'FORCE TO WATCH'],
    ],
    balanced: [
      [`${conf.toUpperCase()}`, 'INTEL REPORT'],
      [`${conf.toUpperCase()}`, 'MARCH PUSH'],
      [`${conf.toUpperCase()}`, 'HEATING UP'],
    ],
    midMajor: [
      [`${conf.toUpperCase()}`, 'UNDER THE RADAR'],
      [`${conf.toUpperCase()}`, 'DARK HORSE WATCH'],
      [`${conf.toUpperCase()}`, 'SLEEPER ALERT'],
    ],
  };

  let category = 'balanced';
  if (lockTeams.length >= 4) category = 'powerhouse';
  else if (lockTeams.length <= 1 && confTeams.length <= 5) category = 'midMajor';

  if (isMarch) {
    if (category === 'powerhouse') {
      headlineTemplates.powerhouse.push([`${conf.toUpperCase()}`, 'MARCH MADNESS']);
    }
    headlineTemplates.balanced.push([`${conf.toUpperCase()}`, 'TOURNAMENT TIME']);
  }

  const templates = headlineTemplates[category];
  const chosen = _pick(templates, conf);
  const headline = chosen.join('\n');

  // Subtext
  const subtextTemplates = {
    powerhouse: [
      `The ${conf} continues to stack contenders as the season enters its final stretch.`,
      `Multiple ${conf} teams are making noise heading toward Selection Sunday.`,
      `Depth and talent define the ${conf} as the postseason approaches.`,
    ],
    balanced: [
      `Conference intel on the ${conf} \u2014 key teams, ATS trends, and what to watch.`,
      `The ${conf} is in the spotlight. Here\u2019s what the data says right now.`,
      `Full breakdown of ${conf} positioning, form, and market angles.`,
    ],
    midMajor: [
      `The ${conf} has value hiding in plain sight. Here\u2019s the full read.`,
      `Don\u2019t sleep on the ${conf}. The numbers tell an interesting story.`,
      `Small-conference intel that sharp bettors are watching closely.`,
    ],
  };

  const subtext = _pick(subtextTemplates[category], conf + 'sub');

  return {
    headline,
    subtext,
    bullets: bullets.slice(0, 5),
    featured: featured.slice(0, 5),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConferenceIntelSlide({ data, conferenceData, asOf, ...rest }) {
  const conf = conferenceData?.conference || 'Conference';
  const { primary, secondary } = getConfColors(conf);
  const logoSrc = getConfLogo(conf);
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
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={conf}
            className={styles.confLogo}
            crossOrigin="anonymous"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className={styles.confFallback}>
            {conf.replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase()}
          </div>
        )}
      </div>

      <div className={styles.identity}>
        <h1 className={styles.confName}>{conf.toUpperCase()} INTEL</h1>
        <div className={styles.confSubline}>{subline}</div>
      </div>

      <div className={styles.headlineZone}>
        <div className={styles.headlineDivider} />
        <h2 className={styles.headline}>
          {intel.headline.split('\n').map((line, i) => (
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
                <img
                  src={`/logos/${t.slug}.png`}
                  alt=""
                  className={styles.featuredLogo}
                  crossOrigin="anonymous"
                  onError={e => { e.currentTarget.style.display = 'none'; }}
                />
                <span className={styles.featuredName}>{t.name}</span>
                {t.detail && <span className={styles.featuredDetail}>{t.detail}</span>}
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
