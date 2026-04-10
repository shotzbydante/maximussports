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
 *   4. Record line   — season record · L10 · streak
 *   5. Headline      — topical narrative engine (form, division, storyline)
 *   6. Subtext       — editorial sentence supporting headline
 *   7. Stat band     — Projected Wins / Range / WS Odds / Confidence
 *   8. Intel brief   — TEAM INTEL BRIEFING: 5 rich bullets (the hero section)
 *   9. Footer        — URL + disclaimer
 *
 * Data: getTeamProjection() + seasonModelInputs + mlbLiveGames + teamNews
 */

import { useState } from 'react';
import { getMlbEspnLogoUrl } from '../../../utils/espnMlbLogos';
import { getTeamProjection } from '../../../data/mlb/seasonModel';
import TEAM_INPUTS from '../../../data/mlb/seasonModelInputs';
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

function cap(str, max = 120) {
  if (!str) return '';
  return str.length <= max ? str : str.slice(0, max - 1) + '\u2026';
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickOne(arr, seed) {
  return arr[hashStr(seed || '') % arr.length];
}

// Short team name: "Tampa Bay Rays" → "Rays", "New York Yankees" → "Yankees"
function shortName(fullName) {
  if (!fullName) return '';
  const parts = fullName.split(' ');
  return parts[parts.length - 1];
}

// Division short: "AL East" → "AL East" (already short), used in headlines
function divShort(div) {
  return div || '';
}

// ─── MLB Team Colors ──────────────────────────────────────────────────────

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
  if (s.length > 85) s = s.slice(0, 84) + '\u2026';
  return s;
}

// ─── Live Game Context Extraction ───────────────────────────────────────────

function extractTeamContext(liveGames, slug) {
  if (!liveGames?.length || !slug) {
    return { recentGames: [], l10Record: null, streak: null };
  }

  const teamFinals = liveGames
    .filter(g => g.gameState?.isFinal && (g.teams?.home?.slug === slug || g.teams?.away?.slug === slug))
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

  if (teamFinals.length === 0) {
    return { recentGames: [], l10Record: null, streak: null };
  }

  const results = teamFinals.map(g => {
    const isHome = g.teams?.home?.slug === slug;
    const ourScore = isHome ? g.teams?.home?.score : g.teams?.away?.score;
    const oppScore = isHome ? g.teams?.away?.score : g.teams?.home?.score;
    const opponent = isHome ? g.teams?.away?.name : g.teams?.home?.name;
    const oppAbbrev = isHome ? g.teams?.away?.abbrev : g.teams?.home?.abbrev;
    const won = ourScore != null && oppScore != null && ourScore > oppScore;
    return { won, ourScore, oppScore, opponent, oppAbbrev, date: g.startTime };
  });

  // L10
  const last10 = results.slice(0, 10);
  const l10Wins = last10.filter(r => r.won).length;
  const l10Losses = last10.length - l10Wins;
  const l10Record = last10.length > 0 ? `${l10Wins}\u2013${l10Losses}` : null;

  // Streak
  let streak = null;
  if (results.length > 0) {
    const firstResult = results[0].won;
    let count = 1;
    for (let i = 1; i < results.length; i++) {
      if (results[i].won === firstResult) count++;
      else break;
    }
    streak = firstResult ? `W${count}` : `L${count}`;
  }

  return { recentGames: results.slice(0, 5), l10Record, streak, l10Wins };
}

// ─── Topical Headline Engine ───────────────────────────────────────────────

/**
 * Generate topical, team-specific headlines that connect to real data.
 * Priority: recent form → division race → team strengths → model context.
 *
 * Headlines should feel like "RAYS GAIN GROUND" or "ROTATION LEADS THE PUSH"
 * — not generic labels like "UNDERVALUED" or "MARKET MISPRICED".
 */
function buildMlbHeroNarrative({ teamName, slug, projection, teamContext, division, inputs }) {
  const sn = shortName(teamName).toUpperCase();
  const div = divShort(division);

  if (!projection) {
    return {
      headline: `${sn}\nINTEL FILE`,
      subtext: `Full market intelligence on ${teamName}.`,
    };
  }

  const tk = projection.takeaways || {};
  const wins = projection.projectedWins;
  const delta = projection.marketDelta || 0;
  const driver = tk.strongestDriver || '';
  const driverLow = driver.toLowerCase();
  const { streak, l10Record, recentGames, l10Wins } = teamContext || {};
  const seed = slug || teamName;

  const signals = [];

  // ── FORM-BASED (most topical) ──

  if (streak && streak.startsWith('W') && parseInt(streak.slice(1)) >= 5) {
    const n = parseInt(streak.slice(1));
    signals.push({ score: 100,
      headline: `${sn} WIN\n${n} STRAIGHT`,
      subtext: `${teamName} are surging with ${n} consecutive wins. The momentum is real and the standings are shifting.`,
    });
  } else if (streak && streak.startsWith('W') && parseInt(streak.slice(1)) >= 3) {
    signals.push({ score: 95,
      headline: `${sn}\nGAIN GROUND`,
      subtext: `${teamName} have won ${streak.slice(1)} straight. The recent stretch is creating separation.`,
    });
  }

  if (streak && streak.startsWith('L') && parseInt(streak.slice(1)) >= 5) {
    const n = parseInt(streak.slice(1));
    signals.push({ score: 98,
      headline: `${sn} DROP\n${n} STRAIGHT`,
      subtext: `${teamName} have lost ${n} in a row. The skid is putting serious pressure on the roster.`,
    });
  } else if (streak && streak.startsWith('L') && parseInt(streak.slice(1)) >= 3) {
    signals.push({ score: 93,
      headline: 'BATS QUIET\nPRESSURE RISES',
      subtext: `${teamName} have dropped ${streak.slice(1)} straight. Something needs to shift — and soon.`,
    });
  }

  // Strong L10
  if (l10Wins != null && l10Wins >= 7) {
    signals.push({ score: 90,
      headline: 'L10 TREND\nTURNS POSITIVE',
      subtext: `${teamName} are ${l10Record} in their last 10. The recent form is the best story in their season.`,
    });
  }
  if (l10Wins != null && l10Wins <= 3) {
    signals.push({ score: 88,
      headline: 'FORM\nFALLING',
      subtext: `${teamName} are ${l10Record} over their last 10. The slide is eroding their position.`,
    });
  }

  // ── DIVISION RACE ──

  if (div && wins >= 92) {
    signals.push({ score: 82,
      headline: `${div.toUpperCase()}\nFRONTRUNNER`,
      subtext: `${teamName} project as the team to beat in the ${div}. ${wins} projected wins sets the pace.`,
    });
  }
  if (div && wins >= 85 && wins < 92) {
    signals.push({ score: 72,
      headline: `${div.toUpperCase()}\nPRESSURE BUILDS`,
      subtext: `${teamName} are right in the ${div} race at ${wins} projected wins. Every series matters from here.`,
    });
  }

  // ── DRIVER-BASED ──

  if (driverLow.includes('rotation') || driverLow.includes('pitching')) {
    signals.push({ score: 68,
      headline: 'ROTATION\nLEADS THE PUSH',
      subtext: `Pitching is the engine for ${teamName}. The rotation gives them a legitimate edge most nights.`,
    });
  }
  if (driverLow.includes('offense') || driverLow.includes('lineup')) {
    signals.push({ score: 68,
      headline: 'LINEUP\nDRIVES THE BUS',
      subtext: `The bats carry ${teamName}. Offensive production is their margin for error.`,
    });
  }

  // ── MODEL EDGE ──

  if (delta >= 4) {
    signals.push({ score: 75,
      headline: `${sn} ARE\nUNDERPRICED`,
      subtext: `The model sees ${teamName} ${delta.toFixed(1)} wins above market. The number has not caught up yet.`,
    });
  }
  if (delta <= -4) {
    signals.push({ score: 70,
      headline: 'MARKET\nTOO HIGH',
      subtext: `${teamName} sit ${Math.abs(delta).toFixed(1)} wins below expectations. The price may be ahead of the product.`,
    });
  }

  // ── TIER-BASED FALLBACKS (still more specific than old generic labels) ──

  if (wins >= 95) {
    signals.push({ score: 60,
      headline: `${sn}\nARE FOR REAL`,
      subtext: `${wins} projected wins. ${teamName} have the roster depth to go deep into October.`,
    });
  } else if (wins >= 85) {
    signals.push({ score: 50,
      headline: `${sn}\nSTAY IN THE MIX`,
      subtext: `${teamName} project at ${wins} wins — firmly in the playoff conversation with room to run.`,
    });
  } else if (wins >= 75) {
    signals.push({ score: 40,
      headline: pickOne([
        `${sn}\nAT A CROSSROADS`,
        `${sn}\nSEARCH FOR ANSWERS`,
      ], seed),
      subtext: `${wins} projected wins. ${teamName} are in no-man's land — not contending, not rebuilding.`,
    });
  } else {
    signals.push({ score: 30,
      headline: pickOne([
        'BUILDING FOR\nTOMORROW',
        'LONG ROAD\nAHEAD',
      ], seed),
      subtext: `${wins} projected wins. ${teamName} are in rebuild mode. The future is the focus.`,
    });
  }

  signals.sort((a, b) => b.score - a.score);
  const winner = signals[0];
  return {
    headline: winner.headline,
    subtext: cap(winner.subtext, 120),
  };
}

// ─── Team Intel Briefing Builder ────────────────────────────────────────────

/**
 * Build the 5 hero intel bullets that form the lower-half content engine.
 *
 * Priority order (per spec):
 *   1. Division standing — rank, outlook, gap context
 *   2. L10 record — with editorial interpretation
 *   3. Last 2 games — specific recent results
 *   4. Team news / player / pitching storyline
 *   5. What's next — upcoming game + why it matters
 */
function buildIntelBriefing({
  division, divOutlook, projection, teamContext, inputs,
  newsHeadlines, nextOpp, spread, ml, nextTime, teamName, tk,
}) {
  const bullets = [];
  const wins = projection?.projectedWins;

  // ── BULLET 1: Division standing ──
  if (division && divOutlook) {
    const outlookLow = divOutlook.toLowerCase();
    if (outlookLow.includes('contend') || outlookLow.includes('lead')) {
      bullets.push(`${division} contender. Model projects ${wins} wins — firmly in the race.`);
    } else if (outlookLow.includes('compet') || outlookLow.includes('fringe')) {
      bullets.push(`Positioned in the ${division} as a fringe contender at ${wins} projected wins.`);
    } else if (outlookLow.includes('rebuild') || outlookLow.includes('retool')) {
      bullets.push(`${division}, rebuilding phase. ${wins} projected wins — focused on the long game.`);
    } else {
      bullets.push(`${division}. Model projects ${wins} wins. Outlook: ${divOutlook}.`);
    }
  } else if (division && wins) {
    bullets.push(`Competing in the ${division} with ${wins} projected wins.`);
  }

  // ── BULLET 2: L10 record ──
  if (teamContext.l10Record) {
    const l10w = teamContext.l10Wins ?? parseInt(teamContext.l10Record);
    let interp;
    if (l10w >= 8) interp = 'surging — the hottest stretch of the season';
    else if (l10w >= 7) interp = 'strong recent form with momentum building';
    else if (l10w >= 5) interp = 'steady but without clear separation';
    else if (l10w >= 4) interp = 'recent results have been inconsistent';
    else if (l10w >= 3) interp = 'struggling to find traction over the past week';
    else interp = 'in a prolonged cold stretch that demands answers';

    const streakNote = teamContext.streak ? `, currently on a ${teamContext.streak} streak` : '';
    bullets.push(`L10: ${teamContext.l10Record}${streakNote}. ${interp.charAt(0).toUpperCase() + interp.slice(1)}.`);
  }

  // ── BULLET 3: Last 2 games ──
  const recent = teamContext.recentGames?.slice(0, 2) || [];
  if (recent.length === 2) {
    const w = recent.filter(r => r.won).length;
    const lines = recent.map(r =>
      `${r.won ? 'W' : 'L'} ${r.ourScore}\u2013${r.oppScore} vs ${r.oppAbbrev || shortName(r.opponent)}`
    );
    if (w === 2) {
      bullets.push(`Won both of their last 2: ${lines.join(', ')}.`);
    } else if (w === 0) {
      bullets.push(`Dropped both of their last 2: ${lines.join(', ')}.`);
    } else {
      bullets.push(`Split the last 2: ${lines.join(', ')}.`);
    }
  } else if (recent.length === 1) {
    const r = recent[0];
    bullets.push(`Last result: ${r.won ? 'Won' : 'Lost'} ${r.ourScore}\u2013${r.oppScore} vs ${r.oppAbbrev || shortName(r.opponent)}.`);
  }

  // ── BULLET 4: Team storyline / news / pitching-offense profile ──
  // First try news headlines for a current storyline
  if (newsHeadlines?.length > 0) {
    bullets.push(newsHeadlines[0]);
  } else if (inputs) {
    // Fall back to rotation/lineup/bullpen profile from model inputs
    const rot = inputs.frontlineRotation;
    const lineup = inputs.topOfLineup;
    const bp = inputs.bullpenQuality;
    const bpVol = inputs.bullpenVolatility;

    if (rot >= 8) {
      bullets.push(`Rotation rated elite (${rot}/10). Front-end arms anchor the pitching staff.`);
    } else if (lineup >= 8) {
      bullets.push(`Lineup rated elite (${lineup}/10). Offensive firepower carries the roster.`);
    } else if (bp <= 4 || bpVol >= 5) {
      bullets.push(`Bullpen remains a concern — quality ${bp}/10, volatility ${bpVol}/6.`);
    } else if (tk?.riskProfile && tk.riskProfile !== 'Standard risk') {
      bullets.push(`Risk profile: ${tk.riskProfile}. ${tk.stability ? `Stability: ${tk.stability}.` : ''}`);
    } else if (tk?.strongestDriver) {
      bullets.push(`Key driver: ${tk.strongestDriver}. ${tk.biggestDrag && tk.biggestDrag !== 'None significant' ? `Biggest drag: ${tk.biggestDrag}.` : ''}`);
    }
  } else if (tk?.strongestDriver) {
    bullets.push(`Key driver: ${tk.strongestDriver}.`);
  }

  // ── BULLET 5: What's next ──
  if (nextOpp) {
    let nextBullet = `Next up: vs ${nextOpp}`;
    if (spread != null) nextBullet += ` (${fmtSpread(spread)})`;
    else if (ml != null) nextBullet += ` (${ml > 0 ? '+' : ''}${ml} ML)`;
    if (nextTime) nextBullet += ` — ${nextTime}`;
    nextBullet += '.';
    bullets.push(nextBullet);
  } else {
    // Fall back to market/model context
    const delta = projection?.marketDelta;
    if (delta != null && Math.abs(delta) >= 2) {
      const dir = delta > 0 ? 'above' : 'below';
      bullets.push(`Model sees them ${Math.abs(delta).toFixed(1)} wins ${dir} market consensus — the gap creates opportunity.`);
    }
  }

  // Pad to 5 with remaining news headlines or model context if short
  if (bullets.length < 5 && newsHeadlines?.length > 1) {
    bullets.push(newsHeadlines[1]);
  }
  if (bullets.length < 5 && newsHeadlines?.length > 2) {
    bullets.push(newsHeadlines[2]);
  }
  if (bullets.length < 5 && projection?.marketDelta != null && Math.abs(projection.marketDelta) >= 1.5) {
    const dir = projection.marketDelta > 0 ? 'above' : 'below';
    bullets.push(`Model: ${Math.abs(projection.marketDelta).toFixed(1)} wins ${dir} market. ${tk?.marketStance || ''}`);
  }
  if (bullets.length < 5 && tk?.depthProfile) {
    bullets.push(`Roster depth: ${tk.depthProfile}. ${tk.stability ? `Stability rating: ${tk.stability}.` : ''}`);
  }

  return bullets.slice(0, 5);
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
  const inputs = slug ? TEAM_INPUTS[slug] : null;
  const champOdds = data?.mlbChampOdds ?? {};
  const oddsData = champOdds?.[slug];
  const wsOdds = oddsData?.bestChanceAmerican ?? oddsData?.american ?? null;

  // Division & record
  const division = team.division || projection?.division || '';
  const record = team.record?.items?.[0]?.summary
    || team.recordSummary
    || (typeof team.record === 'string' ? team.record : null)
    || null;

  // Live team context
  const liveGames = data?.mlbLiveGames ?? [];
  const teamContext = extractTeamContext(liveGames, slug);

  // Schedule / next game
  const nextLine = teamData?.nextLine ?? null;
  const spread = nextLine?.consensus?.spread ?? null;
  const ml = nextLine?.consensus?.moneyline ?? null;
  const total = nextLine?.consensus?.total ?? null;
  const nextOpp = nextLine?.nextEvent?.opponent ?? null;
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
    .slice(0, 4)
    .map(n => cleanNewsHeadline(n.headline || n.title || ''))
    .filter(Boolean);

  // ── Narrative headline — topical, team-specific ──
  const divOutlook = projection?.divOutlook ?? '';
  const narrative = buildMlbHeroNarrative({
    teamName: name, slug, projection, teamContext, division, inputs,
  });

  // ── Stat band ──
  const statBand = [];
  if (projection) {
    statBand.push({ label: 'PROJ. WINS', value: String(projection.projectedWins) });
    statBand.push({ label: 'RANGE', value: `${projection.floor}\u2013${projection.ceiling}` });
    if (wsOdds != null) {
      statBand.push({ label: 'WS ODDS', value: fmtOdds(wsOdds) || '\u2014' });
    }
    if (projection.confidenceTier) {
      statBand.push({ label: 'CONFIDENCE', value: projection.confidenceTier });
    }
  }

  // ── Team Intel Briefing — the hero section of the lower half ──
  const briefingBullets = buildIntelBriefing({
    division, divOutlook, projection, teamContext, inputs,
    newsHeadlines, nextOpp, spread, ml, nextTime, teamName: name, tk,
  });

  // Identity chips
  const chips = [];
  if (projection?.projectedWins) chips.push({ text: `Projected wins: ${projection.projectedWins}`, type: 'stat' });
  if (wsOdds != null) chips.push({ text: `\uD83C\uDFC6 ${fmtOdds(wsOdds)}`, type: 'odds' });
  if (division) chips.push({ text: division, type: 'conf' });

  // Record / form line
  const recordParts = [];
  if (record) recordParts.push(record.replace('-', '\u2013'));
  if (teamContext.l10Record) recordParts.push(`L10: ${teamContext.l10Record}`);
  if (teamContext.streak) recordParts.push(teamContext.streak);

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

      {/* Editorial headline */}
      <div className={styles.headlineZone}>
        <div className={styles.headlineDivider} />
        <h2 className={styles.headline}>
          {narrative.headline.split('\n').map((line, i) => (
            <span key={i} className={styles.headlineLine}>{line}</span>
          ))}
        </h2>
        <div className={styles.headlineDividerBottom} />
      </div>

      {/* Subtext */}
      {narrative.subtext && (
        <div className={styles.quickIntel}>{narrative.subtext}</div>
      )}

      {/* Stat band */}
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

      {/* ═══ TEAM INTEL BRIEFING — the hero content section ═══ */}
      {briefingBullets.length > 0 && (
        <div className={styles.briefingModule}>
          <div className={styles.briefingHeader}>
            <div className={styles.briefingTitle}>TEAM INTEL BRIEFING</div>
            <div className={styles.briefingAccent} />
          </div>
          <ol className={styles.briefingList}>
            {briefingBullets.map((bullet, i) => (
              <li key={i} className={styles.briefingItem}>{bullet}</li>
            ))}
          </ol>
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
