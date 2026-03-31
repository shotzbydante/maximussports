/**
 * MlbTeamIntelSlide — Instagram Hero Summary for MLB Team Intel
 *
 * Cinematic, premium, information-dense — ported from NCAAM TeamIntelSlide4.
 * Fully custom artboard — does not use SlideShell.
 *
 * Content hierarchy:
 *   1. Header        — Maximus branding + timestamp
 *   2. Logo hero     — team logo with animated glow (MLB ESPN CDN)
 *   3. Identity      — division · projected wins · WS odds chips
 *   4. Record line   — season record · last 10 form
 *   5. Headline      — MLB narrative scoring engine (buildMlbHeroNarrative)
 *   6. Subtext       — editorial sentence from highest-scoring signal
 *   7. Stat band     — Projected Wins / Range / WS Odds / Playoff %
 *   8. Schedule      — LAST game result → NEXT game (spread · total · datetime)
 *   9. Intel module  — Key drivers + analyst note
 *  10. News intel    — Recent team headlines
 *  11. Footer        — URL + disclaimer
 *
 * Data source of truth: getTeamProjection() from seasonModel.js
 */

import { useState } from 'react';
import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import { getTeamProjection } from '../../../data/mlb/seasonModel';
import styles from './MlbTeamIntelSlide.module.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSpread(spread) {
  if (spread == null) return null;
  const n = parseFloat(spread);
  if (isNaN(n)) return String(spread);
  return n > 0 ? `+${n}` : String(n);
}

function fmtOdds(american) {
  if (american == null || typeof american !== 'number') return null;
  return american > 0 ? `+${american}` : String(american);
}

function cap(str, max = 110) {
  if (!str) return '';
  return str.length <= max ? str : str.slice(0, max - 1) + '\u2026';
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickPhrase(phrases, seed) {
  return phrases[hashStr(seed || '') % phrases.length];
}

// ─── MLB Team Colors (dark red base + team accent) ──────────────────────────

const MLB_TEAM_COLORS = {
  nyy: { primary: '#003087', secondary: '#0C2340' },
  bos: { primary: '#BD3039', secondary: '#0C2340' },
  tor: { primary: '#134A8E', secondary: '#1D2D5C' },
  tb:  { primary: '#092C5C', secondary: '#8FBCE6' },
  bal: { primary: '#DF4601', secondary: '#27251F' },
  cle: { primary: '#00385D', secondary: '#E31937' },
  min: { primary: '#002B5C', secondary: '#D31145' },
  det: { primary: '#0C2340', secondary: '#FA4616' },
  cws: { primary: '#C4CED4', secondary: '#27251F' },
  kc:  { primary: '#004687', secondary: '#BD9B60' },
  hou: { primary: '#EB6E1F', secondary: '#002D62' },
  sea: { primary: '#0C2C56', secondary: '#005C5C' },
  tex: { primary: '#003278', secondary: '#C0111F' },
  laa: { primary: '#BA0021', secondary: '#862633' },
  oak: { primary: '#003831', secondary: '#EFB21E' },
  atl: { primary: '#CE1141', secondary: '#13274F' },
  nym: { primary: '#002D72', secondary: '#FF5910' },
  phi: { primary: '#E81828', secondary: '#002D72' },
  mia: { primary: '#00A3E0', secondary: '#EF3340' },
  wsh: { primary: '#AB0003', secondary: '#14225A' },
  chc: { primary: '#0E3386', secondary: '#CC3433' },
  mil: { primary: '#FFC52F', secondary: '#12284B' },
  stl: { primary: '#C41E3A', secondary: '#0C2340' },
  pit: { primary: '#FDB827', secondary: '#27251F' },
  cin: { primary: '#C6011F', secondary: '#000000' },
  lad: { primary: '#005A9C', secondary: '#EF3E42' },
  sd:  { primary: '#2F241D', secondary: '#FFC425' },
  sf:  { primary: '#FD5A1E', secondary: '#27251F' },
  ari: { primary: '#A71930', secondary: '#E3D4AD' },
  col: { primary: '#33006F', secondary: '#C4CED4' },
};

function getMlbTeamColors(slug) {
  return MLB_TEAM_COLORS[slug] || { primary: '#DC143C', secondary: '#1a0508' };
}

// ─── News Headline Cleaning ──────────────────────────────────────────────────

function cleanNewsHeadline(raw) {
  if (!raw) return '';
  let s = raw.trim();
  const sepIdx = Math.max(
    s.lastIndexOf(' \u2013 '), s.lastIndexOf(' - '),
    s.lastIndexOf(' \u2014 '), s.lastIndexOf(' | ')
  );
  if (sepIdx > s.length * 0.35) s = s.slice(0, sepIdx);
  s = s.replace(/^(?:MLB|Baseball|Béisbol)\s*(?:Preview|Recap|Report|Update|Analysis|Roundup):\s*/i, '');
  s = s.replace(/\s*[-\u2013\u2014|]\s*(?:ESPN|CBS|Yahoo|Fox|NBC|AP|SI|The Athletic)[\s\w]*$/i, '');
  if (s.length > 80) s = s.slice(0, 79) + '\u2026';
  return s;
}

// ─── MLB Narrative Engine ───────────────────────────────────────────────────

const MLB_PHRASE_LIB = {
  marketMovement: [
    'The market is scrambling to catch up.',
    'Books are still adjusting.',
    'Pricing is tightening.',
    'The edge is narrowing.',
    'The number has started to move.',
  ],
  momentum: [
    'Momentum is real.',
    'This team is heating up.',
    'Form is trending up.',
    'They are peaking at the right time.',
    'The timing looks strong.',
  ],
  valueTheses: [
    'THE NUMBER\nIS WRONG',
    'MARKET\nMISPRICED',
    'HIDDEN\nVALUE',
    'UNDERVALUED',
  ],
  contenderTheses: [
    'BUILT TO\nWIN NOW',
    'LEGIT\nCONTENDER',
    'PENNANT\nHUNGRY',
    'WORLD SERIES\nCALIBER',
  ],
  rebuildTheses: [
    'REBUILD\nWATCH',
    'LONG ROAD\nAHEAD',
    'BUILDING FOR\nTOMORROW',
    'PATIENCE\nREQUIRED',
  ],
  transitionTheses: [
    'IN THE\nMIDDLE',
    'CROSSROADS\nSEASON',
    'PROVE IT\nYEAR',
    'THE QUESTION\nMARK',
  ],
  fringeTheses: [
    'DARK HORSE\nALERT',
    'DON\'T SLEEP\nON THEM',
    'FRINGE\nCONTENDER',
    'OCTOBER\nOUTSIDER',
  ],
  rotationTheses: [
    'ARM\nDOMINANCE',
    'PITCHING\nFORTRESS',
    'ROTATION\nEDGE',
  ],
  offenseTheses: [
    'LINEUP\nLOADED',
    'OFFENSE\nFIRST',
    'POWER\nSURGE',
  ],
};

function buildMlbHeroNarrative({ teamName, slug, projection }) {
  if (!projection) {
    return {
      headline: 'INTEL\nFILE',
      subtext: `Full market intelligence on ${teamName}.`,
      signalType: 'standard',
      score: 10,
    };
  }

  const proj = projection;
  const tk = proj.takeaways || {};
  const wins = proj.projectedWins;
  const delta = proj.marketDelta || 0;
  const driver = tk.strongestDriver || '';
  const driverLow = driver.toLowerCase();
  const signals = [];
  const seed = slug || teamName;

  // Value signal — model significantly above market
  if (delta >= 3) {
    signals.push({
      type: 'valueAbove', score: 95,
      headline: pickPhrase(MLB_PHRASE_LIB.valueTheses, seed + 'val'),
      subtext: `The model sees ${teamName} ${Math.abs(delta).toFixed(1)} wins above the market consensus. There is real upside here.`,
    });
  }

  // Market overvalued — model significantly below
  if (delta <= -3) {
    signals.push({
      type: 'valueBelow', score: 85,
      headline: 'MARKET HAS\nOVERCORRECTED',
      subtext: `${teamName} sits ${Math.abs(delta).toFixed(1)} wins below market expectations. The hype may be ahead of reality.`,
    });
  }

  // Elite contender
  if (wins >= 95) {
    signals.push({
      type: 'eliteContender', score: 90,
      headline: pickPhrase(MLB_PHRASE_LIB.contenderTheses, seed + 'elite'),
      subtext: `${teamName} projects as one of baseball's elite at ${wins} wins. This roster is built for October.`,
    });
  }

  // Contender
  if (wins >= 88 && wins < 95) {
    signals.push({
      type: 'contender', score: 75,
      headline: pickPhrase(MLB_PHRASE_LIB.contenderTheses, seed + 'cont'),
      subtext: `${teamName} projects at ${wins} wins — a legitimate contender with postseason upside.`,
    });
  }

  // Fringe contender
  if (wins >= 80 && wins < 88) {
    signals.push({
      type: 'fringe', score: 60,
      headline: pickPhrase(MLB_PHRASE_LIB.fringeTheses, seed + 'fringe'),
      subtext: `${teamName} at ${wins} projected wins — close enough to matter, but no margin for error.`,
    });
  }

  // Transition / rebuild territory
  if (wins >= 68 && wins < 80) {
    signals.push({
      type: 'transition', score: 50,
      headline: pickPhrase(MLB_PHRASE_LIB.transitionTheses, seed + 'trans'),
      subtext: `${teamName} projects at ${wins} wins. A transition year with narrow paths to meaningful October.`,
    });
  }

  if (wins < 68) {
    signals.push({
      type: 'rebuild', score: 45,
      headline: pickPhrase(MLB_PHRASE_LIB.rebuildTheses, seed + 'reb'),
      subtext: `${wins} projected wins puts ${teamName} in rebuilding territory. The long game is the play here.`,
    });
  }

  // Rotation-led
  if (driverLow.includes('rotation') || driverLow.includes('pitching')) {
    signals.push({
      type: 'rotationLed', score: 65,
      headline: pickPhrase(MLB_PHRASE_LIB.rotationTheses, seed + 'rot'),
      subtext: `Pitching anchors ${teamName}'s outlook. The rotation gives them a legitimate edge most nights.`,
    });
  }

  // Offense-led
  if (driverLow.includes('offense') || driverLow.includes('lineup')) {
    signals.push({
      type: 'offenseLed', score: 65,
      headline: pickPhrase(MLB_PHRASE_LIB.offenseTheses, seed + 'off'),
      subtext: `The lineup is the engine for ${teamName} — enough firepower to keep them in games consistently.`,
    });
  }

  // Overperformance correction
  if (driverLow.includes('overperf')) {
    signals.push({
      type: 'overperfCorrection', score: 80,
      headline: 'BOUNCE-BACK\nCANDIDATE',
      subtext: `Overperformance correction is the primary positive driver for ${teamName}. Run differential says they were underrated.`,
    });
  }

  // Fallback
  signals.push({
    type: 'standard', score: 10,
    headline: 'FULL\nBREAKDOWN',
    subtext: `Full model intelligence on ${teamName}. ${wins} projected wins.`,
  });

  signals.sort((a, b) => b.score - a.score);
  const winner = signals[0];
  return {
    headline: winner.headline,
    subtext: cap(winner.subtext, 110),
    signalType: winner.type,
    score: winner.score,
  };
}

// ─── Team Logo Hero ──────────────────────────────────────────────────────────

function TeamLogoHero({ slug, name }) {
  const [failed, setFailed] = useState(false);
  const url = getMlbEspnLogoUrl(slug);
  const initials = (name || '').split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();

  if (failed || !url) {
    return <div className={styles.logoFallbackText}>{initials}</div>;
  }

  return (
    <img
      src={url}
      alt={name}
      className={styles.teamLogo}
      crossOrigin="anonymous"
      onError={() => setFailed(true)}
    />
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function MlbTeamIntelSlide({ data, teamData, asOf, options = {}, ...rest }) {
  const team = teamData?.team ?? options?.mlbTeam ?? {};
  const name = team.name || team.displayName || data?.selectedTeamName || '\u2014';
  const slug = team.slug || data?.selectedTeamSlug || null;

  // Team colors
  const { primary: teamPrimary, secondary: teamSecondary } = getMlbTeamColors(slug);

  // Season intelligence
  const projection = slug ? getTeamProjection(slug) : null;
  const tk = projection?.takeaways || {};
  const champOdds = data?.mlbChampOdds ?? {};
  const oddsData = champOdds?.[slug];
  const wsOdds = oddsData?.bestChanceAmerican ?? oddsData?.american ?? null;

  // Division & record
  const division = team.division || '';
  const record = team.record?.items?.[0]?.summary
    || team.recordSummary
    || (typeof team.record === 'string' ? team.record : null)
    || null;

  // Narrative engine
  const narrative = buildMlbHeroNarrative({ teamName: name, slug, projection });

  // Stat band items
  const statBand = [];
  if (projection) {
    statBand.push({ label: 'PROJ. WINS', value: String(projection.projectedWins) });
    statBand.push({ label: 'RANGE', value: `${projection.floor}\u2013${projection.ceiling}` });
    if (wsOdds != null) {
      statBand.push({ label: 'WS ODDS', value: fmtOdds(wsOdds) || '\u2014' });
    }
    if (projection.playoffPct != null) {
      statBand.push({ label: 'PLAYOFF %', value: `${Math.round(projection.playoffPct * 100)}%` });
    } else if (projection.confidenceTier) {
      statBand.push({ label: 'CONFIDENCE', value: projection.confidenceTier });
    }
  }

  // Key drivers
  const keyDrivers = [];
  if (tk.strongestDriver) keyDrivers.push({ label: 'Strongest', value: tk.strongestDriver });
  if (tk.biggestDrag && tk.biggestDrag !== 'None significant') keyDrivers.push({ label: 'Drag', value: tk.biggestDrag });
  if (tk.depthProfile) keyDrivers.push({ label: 'Depth', value: tk.depthProfile });
  if (tk.riskProfile) keyDrivers.push({ label: 'Risk', value: tk.riskProfile });

  // Market stance
  const marketDelta = projection?.marketDelta;
  const marketStance = tk.marketStance || null;

  // Schedule / next game
  const nextLine = teamData?.nextLine ?? null;
  const spread = nextLine?.consensus?.spread ?? null;
  const ml = nextLine?.consensus?.moneyline ?? null;
  const total = nextLine?.consensus?.total ?? null;
  let nextOpp = nextLine?.nextEvent?.opponent ?? null;
  let nextTime = null;

  if (nextLine?.nextEvent?.commenceTime) {
    const d = new Date(nextLine.nextEvent.commenceTime);
    nextTime = d.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      timeZone: 'America/Los_Angeles',
    }) + ' ' + d.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit',
      timeZone: 'America/Los_Angeles',
    });
  }

  // News headlines
  const rawNews = teamData?.last7News?.length > 0
    ? teamData.last7News
    : (teamData?.teamNews ?? []);
  const newsHeadlines = rawNews
    .slice(0, 3)
    .map(n => cleanNewsHeadline(n.headline || n.title || ''))
    .filter(Boolean);

  // Identity chips
  const chips = [];
  if (projection?.projectedWins) chips.push({ text: `${projection.projectedWins} Proj. W`, type: 'stat' });
  if (wsOdds != null) chips.push({ text: `\uD83C\uDFC6 ${fmtOdds(wsOdds)}`, type: 'odds' });
  if (division) chips.push({ text: division, type: 'conf' });

  // Record / form line
  const recordParts = [];
  if (record) recordParts.push(`${record.replace('-', '\u2013')} season`);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  return (
    <div
      className={styles.artboard}
      style={{ '--team-primary': teamPrimary, '--team-secondary': teamSecondary }}
      {...rest}
    >
      {/* Background atmosphere */}
      <div className={styles.bgBase} aria-hidden="true" />
      <div className={styles.bgGlow} aria-hidden="true" />
      <div className={styles.bgRay} aria-hidden="true" />
      <div className={styles.bgNoise} aria-hidden="true" />

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logoRow}>
          <img src="/logo.png" alt="Maximus Sports" className={styles.brandLogo} crossOrigin="anonymous" />
          <div className={styles.logoMeta}>
            <span className={styles.brandName}>MAXIMUS SPORTS</span>
            <span className={styles.intelChip}>MLB TEAM INTEL</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          {asOf && <div className={styles.asOf}>As of {asOf}</div>}
          <div className={styles.maxIntel}>MAXIMUM INTELLIGENCE</div>
        </div>
      </header>

      {/* Team logo hero */}
      <div className={styles.logoZone}>
        <div className={styles.logoGlowRing} aria-hidden="true" />
        <TeamLogoHero slug={slug} name={name} />
      </div>

      {/* Team identity */}
      <div className={styles.identity}>
        <div className={styles.metaRow}>
          {chips.map((chip, i) => (
            <span key={i} className={styles[`${chip.type}Pill`] || styles.confPill}>{chip.text}</span>
          ))}
        </div>
        <h1 className={styles.teamName}>{name.toUpperCase()}</h1>
        {recordParts.length > 0 && (
          <div className={styles.formLine}>{recordParts.join(' \u00b7 ')}</div>
        )}
      </div>

      {/* Editorial headline — powered by MLB narrative engine */}
      <div className={styles.headlineZone}>
        <div className={styles.headlineDivider} />
        <h2 className={styles.headline}>
          {narrative.headline.split('\n').map((line, i) => (
            <span key={i} className={styles.headlineLine}>{line}</span>
          ))}
        </h2>
        <div className={styles.headlineDividerBottom} />
      </div>

      {/* Contextual subtext */}
      {narrative.subtext && (
        <div className={styles.quickIntel}>{narrative.subtext}</div>
      )}

      {/* Stat band — at-a-glance projection stats */}
      {statBand.length > 0 && (
        <div className={styles.statGrid}>
          {statBand.map((s, i) => (
            <div key={i} className={styles.statChip}>
              <div className={styles.statLabel}>{s.label}</div>
              <div className={styles.statValue}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Key drivers + market stance */}
      {(keyDrivers.length > 0 || marketStance) && (
        <div className={styles.driversModule}>
          <div className={styles.driversTitle}>KEY DRIVERS</div>
          <div className={styles.driversRow}>
            {keyDrivers.map((d, i) => (
              <span key={i} className={styles.driverItem}>
                <span className={styles.driverLabel}>{d.label}:</span> {d.value}
              </span>
            ))}
          </div>
          {marketStance && marketDelta != null && (
            <div className={styles.marketLine}>
              Market: {marketStance} ({marketDelta > 0 ? '+' : ''}{marketDelta.toFixed(1)} vs consensus)
            </div>
          )}
        </div>
      )}

      {/* Next game / matchup module */}
      {nextOpp && (
        <div className={styles.scheduleModule}>
          <div className={styles.schedRow}>
            <span className={styles.schedBadge}>NEXT</span>
            <span className={styles.schedContent}>
              <span className={styles.schedOpp}>vs {nextOpp}</span>
              {spread != null && <span className={styles.schedLine}>{fmtSpread(spread)}</span>}
              {spread == null && ml != null && <span className={styles.schedLine}>{ml > 0 ? `+${ml}` : ml} ML</span>}
              {total != null && <span className={styles.schedLine}>{total}o/u</span>}
              {nextTime && <span className={styles.schedTime}>{nextTime}</span>}
            </span>
          </div>
        </div>
      )}

      {/* News INTEL module */}
      {newsHeadlines.length > 0 && (
        <div className={styles.intelModule}>
          <div className={styles.intelTitle}>INTEL</div>
          <ul className={styles.intelList}>
            {newsHeadlines.map((item, i) => (
              <li key={i} className={styles.intelItem}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <footer className={styles.footer}>
        <span className={styles.footerUrl}>maximussports.ai</span>
        <span className={styles.footerDisclaimer}>
          For entertainment only. Please bet responsibly. 21+
        </span>
      </footer>
    </div>
  );
}
