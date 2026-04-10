/**
 * buildMlbTeamIntelBriefing — shared structured team intel for:
 *   - MLB Team Intel IG slide (Content Studio)
 *   - MLB team profile page (Intel Briefing section)
 *   - Team Intel caption generator
 *
 * Assembles a structured briefing from:
 *   - ESPN schedule / recent games / record / streak
 *   - Live games data (mlbLiveGames)
 *   - Team news headlines
 *   - Season model projection + curated inputs
 *   - Next game / upcoming schedule
 *   - Championship odds
 *
 * Returns a structured object, NOT a rendered string — each consumer
 * (slide, team page, caption) renders it in its own format.
 */

import { getTeamProjection } from './seasonModel';
import TEAM_INPUTS from './seasonModelInputs';
import { MLB_TEAMS } from '../../sports/mlb/teams';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortName(fullName) {
  if (!fullName) return '';
  const parts = fullName.split(' ');
  return parts[parts.length - 1];
}

/** Clean raw news headline — strip source suffix, length-limit. */
function cleanHeadline(raw) {
  if (!raw) return '';
  let s = raw.trim();
  const sepIdx = Math.max(
    s.lastIndexOf(' \u2013 '), s.lastIndexOf(' - '),
    s.lastIndexOf(' \u2014 '), s.lastIndexOf(' | ')
  );
  if (sepIdx > s.length * 0.35) s = s.slice(0, sepIdx);
  s = s.replace(/^(?:MLB|Baseball)\s*(?:Preview|Recap|Report|Update|Analysis|Roundup):\s*/i, '');
  s = s.replace(/\s*[-\u2013\u2014|]\s*(?:ESPN|CBS|Yahoo|Fox|NBC|AP|SI|The Athletic)[\s\w]*$/i, '');
  if (s.length > 90) s = s.slice(0, 89) + '\u2026';
  return s;
}

/** Find team slug from name or abbreviation. */
function slugFromName(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  const team = MLB_TEAMS.find(t =>
    t.name.toLowerCase().includes(lower) ||
    lower.includes(t.name.split(' ').pop().toLowerCase()) ||
    t.abbrev.toLowerCase() === lower
  );
  return team?.slug ?? null;
}

// ─── Live Game Context Extraction ─────────────────────────────────────────

/**
 * Extract recent results, L10, streak from an array of live/final games
 * for a specific team slug.
 */
export function extractTeamContext(liveGames, slug) {
  if (!liveGames?.length || !slug) {
    return { recentGames: [], l10Record: null, l10Wins: null, streak: null };
  }

  const teamFinals = liveGames
    .filter(g => g.gameState?.isFinal && (g.teams?.home?.slug === slug || g.teams?.away?.slug === slug))
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

  if (teamFinals.length === 0) {
    return { recentGames: [], l10Record: null, l10Wins: null, streak: null };
  }

  const results = teamFinals.map(g => {
    const isHome = g.teams?.home?.slug === slug;
    const ourScore = isHome ? g.teams?.home?.score : g.teams?.away?.score;
    const oppScore = isHome ? g.teams?.away?.score : g.teams?.home?.score;
    const opponent = isHome ? g.teams?.away?.name : g.teams?.home?.name;
    const oppAbbrev = isHome ? g.teams?.away?.abbrev : g.teams?.home?.abbrev;
    const oppSlug = isHome ? g.teams?.away?.slug : g.teams?.home?.slug;
    const won = ourScore != null && oppScore != null && ourScore > oppScore;
    return { won, ourScore, oppScore, opponent, oppAbbrev, oppSlug, date: g.startTime };
  });

  const last10 = results.slice(0, 10);
  const l10Wins = last10.filter(r => r.won).length;
  const l10Losses = last10.length - l10Wins;
  const l10Record = last10.length > 0 ? `${l10Wins}\u2013${l10Losses}` : null;

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

  return {
    recentGames: results.slice(0, 5),
    l10Record,
    l10Wins,
    streak,
  };
}

/**
 * Alternative: extract team context from ESPN schedule events (used by team page).
 * Schedule events have different shape than live games.
 */
export function extractTeamContextFromSchedule(events) {
  if (!events?.length) {
    return { recentGames: [], l10Record: null, l10Wins: null, streak: null };
  }

  const finals = events
    .filter(e => e.isFinal)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (finals.length === 0) {
    return { recentGames: [], l10Record: null, l10Wins: null, streak: null };
  }

  const results = finals.map(e => {
    const won = e.isWin ?? (e.ourScore != null && e.oppScore != null && e.ourScore > e.oppScore);
    return {
      won,
      ourScore: e.ourScore,
      oppScore: e.oppScore,
      opponent: e.opponent,
      oppAbbrev: e.opponentAbbrev,
      oppSlug: slugFromName(e.opponent) || slugFromName(e.opponentAbbrev),
      oppLogo: e.opponentLogo ?? null,
      date: e.date,
    };
  });

  const last10 = results.slice(0, 10);
  const l10Wins = last10.filter(r => r.won).length;
  const l10Losses = last10.length - l10Wins;
  const l10Record = last10.length > 0 ? `${l10Wins}\u2013${l10Losses}` : null;

  let streak = null;
  const scored = results.filter(r => r.ourScore != null && r.oppScore != null);
  if (scored.length > 0) {
    const firstResult = scored[0].won;
    let count = 1;
    for (let i = 1; i < scored.length; i++) {
      if (scored[i].won === firstResult) count++;
      else break;
    }
    streak = firstResult ? `W${count}` : `L${count}`;
  }

  return {
    recentGames: results.slice(0, 5),
    l10Record,
    l10Wins,
    streak,
  };
}

// ─── Topical Headline Engine ───────────────────────────────────────────────

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function pickOne(arr, seed) {
  return arr[hashStr(seed || '') % arr.length];
}

/**
 * Generate topical, team-specific headline + subtext.
 * Priority: recent form → division race → team strengths → model tier.
 */
export function buildTopicalHeadline({ teamName, slug, projection, teamContext, division }) {
  const sn = shortName(teamName).toUpperCase();
  const div = (division || '').toUpperCase();
  const seed = slug || teamName;

  if (!projection) {
    return { headline: `${sn}\nINTEL FILE`, subtext: `Full market intelligence on ${teamName}.` };
  }

  const wins = projection.projectedWins;
  const delta = projection.marketDelta || 0;
  const driverLow = (projection.takeaways?.strongestDriver || '').toLowerCase();
  const { streak, l10Record, l10Wins } = teamContext || {};

  const signals = [];

  // ── FORM-BASED (most topical) ──
  if (streak) {
    const n = parseInt(streak.slice(1));
    if (streak.startsWith('W') && n >= 5) {
      signals.push({ score: 100,
        headline: `${sn} WIN\n${n} STRAIGHT`,
        subtext: `${teamName} are surging with ${n} consecutive wins. The momentum is real and the standings are shifting.`,
      });
    } else if (streak.startsWith('W') && n >= 3) {
      signals.push({ score: 95,
        headline: `${sn}\nGAIN GROUND`,
        subtext: `${teamName} have won ${n} straight. The recent stretch is creating separation.`,
      });
    } else if (streak.startsWith('L') && n >= 5) {
      signals.push({ score: 98,
        headline: `${sn} DROP\n${n} STRAIGHT`,
        subtext: `${teamName} have lost ${n} in a row. The skid is putting serious pressure on the roster.`,
      });
    } else if (streak.startsWith('L') && n >= 3) {
      signals.push({ score: 93,
        headline: 'BATS QUIET\nPRESSURE RISES',
        subtext: `${teamName} have dropped ${n} straight. Something needs to shift — and soon.`,
      });
    }
  }

  if (l10Wins != null) {
    if (l10Wins >= 7) {
      signals.push({ score: 90,
        headline: 'L10 TREND\nTURNS POSITIVE',
        subtext: `${teamName} are ${l10Record} in their last 10. The recent form is the best story in their season.`,
      });
    }
    if (l10Wins <= 3) {
      signals.push({ score: 88,
        headline: 'FORM\nFALLING',
        subtext: `${teamName} are ${l10Record} over their last 10. The slide is eroding their position.`,
      });
    }
  }

  // ── DIVISION RACE ──
  if (div && wins >= 92) {
    signals.push({ score: 82,
      headline: `${div}\nFRONTRUNNER`,
      subtext: `${teamName} project as the team to beat in the ${division}. ${wins} projected wins sets the pace.`,
    });
  }
  if (div && wins >= 85 && wins < 92) {
    signals.push({ score: 72,
      headline: `${div}\nPRESSURE BUILDS`,
      subtext: `${teamName} are right in the ${division} race at ${wins} projected wins. Every series matters.`,
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

  // ── TIER FALLBACKS ──
  if (wins >= 95) {
    signals.push({ score: 60, headline: `${sn}\nARE FOR REAL`,
      subtext: `${wins} projected wins. ${teamName} have the roster depth to go deep into October.` });
  } else if (wins >= 85) {
    signals.push({ score: 50, headline: `${sn}\nSTAY IN THE MIX`,
      subtext: `${teamName} project at ${wins} wins — firmly in the playoff conversation.` });
  } else if (wins >= 75) {
    signals.push({ score: 40,
      headline: pickOne([`${sn}\nAT A CROSSROADS`, `${sn}\nSEARCH FOR ANSWERS`], seed),
      subtext: `${wins} projected wins. ${teamName} are in no-man's land — not contending, not rebuilding.` });
  } else {
    signals.push({ score: 30,
      headline: pickOne(['BUILDING FOR\nTOMORROW', 'LONG ROAD\nAHEAD'], seed),
      subtext: `${wins} projected wins. ${teamName} are in rebuild mode. The future is the focus.` });
  }

  signals.sort((a, b) => b.score - a.score);
  const w = signals[0];
  const sub = w.subtext.length > 120 ? w.subtext.slice(0, 119) + '\u2026' : w.subtext;
  return { headline: w.headline, subtext: sub };
}

// ─── Structured Briefing Builder ──────────────────────────────────────────

/**
 * Build 5 structured briefing items that power both the slide and team page.
 *
 * Each item is an object: { text, oppSlug?, type }
 *   - text: the briefing line
 *   - oppSlug: opponent team slug for inline logo (optional)
 *   - type: 'division' | 'l10' | 'recent' | 'news' | 'next' | 'model' | 'profile'
 *
 * Priority: division → L10 → recent games → news → next game → model
 */
export function buildIntelBriefingItems({
  slug,
  teamName,
  division,
  divOutlook,
  projection,
  teamContext,
  newsHeadlines,
  nextGame,
  nextLine,
}) {
  const items = [];
  const wins = projection?.projectedWins;
  const tk = projection?.takeaways || {};
  const inputs = slug ? TEAM_INPUTS[slug] : null;
  const { streak, l10Record, l10Wins, recentGames } = teamContext || {};

  // ── 1. Division standing ──
  if (division && divOutlook) {
    const outlookLow = divOutlook.toLowerCase();
    if (outlookLow.includes('contend') || outlookLow.includes('lead')) {
      items.push({ text: `${division} contender. Model projects ${wins} wins — firmly in the race.`, type: 'division' });
    } else if (outlookLow.includes('compet') || outlookLow.includes('fringe')) {
      items.push({ text: `Fringe contender in the ${division} at ${wins} projected wins.`, type: 'division' });
    } else if (outlookLow.includes('rebuild') || outlookLow.includes('retool')) {
      items.push({ text: `${division}, rebuild phase. ${wins} projected wins — focused on the long game.`, type: 'division' });
    } else {
      items.push({ text: `${division}. Model: ${wins} projected wins. Outlook: ${divOutlook}.`, type: 'division' });
    }
  } else if (division && wins) {
    items.push({ text: `Competing in the ${division} with ${wins} projected wins.`, type: 'division' });
  }

  // ── 2. L10 / form ──
  if (l10Record) {
    let interp;
    if (l10Wins >= 8) interp = 'surging — the hottest stretch of the season';
    else if (l10Wins >= 7) interp = 'strong recent form with momentum building';
    else if (l10Wins >= 5) interp = 'steady but without clear separation';
    else if (l10Wins >= 4) interp = 'recent results have been inconsistent';
    else if (l10Wins >= 3) interp = 'struggling to find traction';
    else interp = 'in a prolonged cold stretch that demands answers';

    const streakNote = streak ? `, currently on a ${streak} streak` : '';
    items.push({
      text: `L10: ${l10Record}${streakNote}. ${interp.charAt(0).toUpperCase() + interp.slice(1)}.`,
      type: 'l10',
    });
  }

  // ── 3. Last 2 games ──
  const recent2 = (recentGames || []).slice(0, 2);
  if (recent2.length === 2) {
    const w = recent2.filter(r => r.won).length;
    const lines = recent2.map(r => {
      const opp = r.oppAbbrev || shortName(r.opponent);
      return `${r.won ? 'W' : 'L'} ${r.ourScore}\u2013${r.oppScore} vs ${opp}`;
    });
    let text;
    if (w === 2) text = `Won both of their last 2: ${lines.join(', ')}.`;
    else if (w === 0) text = `Dropped both of their last 2: ${lines.join(', ')}.`;
    else text = `Split the last 2: ${lines.join(', ')}.`;

    items.push({
      text,
      type: 'recent',
      // Include oppSlug of most recent opponent for logo rendering
      oppSlug: recent2[0]?.oppSlug || null,
    });
  } else if (recent2.length === 1) {
    const r = recent2[0];
    items.push({
      text: `Last result: ${r.won ? 'Won' : 'Lost'} ${r.ourScore}\u2013${r.oppScore} vs ${r.oppAbbrev || shortName(r.opponent)}.`,
      type: 'recent',
      oppSlug: r.oppSlug || null,
    });
  }

  // ── 4. Team news / player / pitching storyline ──
  const cleanedNews = (newsHeadlines || [])
    .map(n => typeof n === 'string' ? n : cleanHeadline(n.headline || n.title || ''))
    .filter(Boolean);

  if (cleanedNews.length > 0) {
    items.push({ text: cleanedNews[0], type: 'news' });
  } else if (inputs) {
    // Fall back to rotation/lineup profile
    if (inputs.frontlineRotation >= 8) {
      items.push({ text: `Rotation rated elite (${inputs.frontlineRotation}/10). Front-end arms anchor the staff.`, type: 'profile' });
    } else if (inputs.topOfLineup >= 8) {
      items.push({ text: `Lineup rated elite (${inputs.topOfLineup}/10). Offensive firepower carries the roster.`, type: 'profile' });
    } else if (inputs.bullpenQuality <= 4 || inputs.bullpenVolatility >= 5) {
      items.push({ text: `Bullpen remains a concern — quality ${inputs.bullpenQuality}/10, volatility ${inputs.bullpenVolatility}/6.`, type: 'profile' });
    } else if (tk.strongestDriver) {
      items.push({ text: `Key driver: ${tk.strongestDriver}. ${tk.biggestDrag && tk.biggestDrag !== 'None significant' ? `Drag: ${tk.biggestDrag}.` : ''}`, type: 'profile' });
    }
  } else if (tk.strongestDriver) {
    items.push({ text: `Key driver: ${tk.strongestDriver}.`, type: 'profile' });
  }

  // ── 5. Upcoming game / what's next ──
  const nOpp = nextGame?.opponent || nextLine?.nextEvent?.opponent;
  const nSpread = nextLine?.consensus?.spread;
  const nMl = nextLine?.consensus?.moneyline;
  const nTime = nextGame?.date || nextLine?.nextEvent?.commenceTime;
  const nOppSlug = nextGame?.oppSlug || slugFromName(nOpp);

  if (nOpp) {
    let text = `Next up: vs ${nOpp}`;
    if (nSpread != null) {
      const sp = parseFloat(nSpread);
      text += ` (${sp > 0 ? '+' : ''}${sp})`;
    } else if (nMl != null) {
      text += ` (${nMl > 0 ? '+' : ''}${nMl} ML)`;
    }
    if (nTime) {
      const d = new Date(nTime);
      if (!isNaN(d)) {
        text += ` — ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })}`;
      }
    }
    text += '.';
    items.push({ text, type: 'next', oppSlug: nOppSlug || null });
  }

  // ── Pad with additional news or model context ──
  if (items.length < 5 && cleanedNews.length > 1) {
    items.push({ text: cleanedNews[1], type: 'news' });
  }
  if (items.length < 5) {
    const delta = projection?.marketDelta;
    if (delta != null && Math.abs(delta) >= 2) {
      const dir = delta > 0 ? 'above' : 'below';
      items.push({ text: `Model: ${Math.abs(delta).toFixed(1)} wins ${dir} market consensus. ${tk.marketStance || ''}`.trim(), type: 'model' });
    }
  }
  if (items.length < 5 && tk.depthProfile) {
    items.push({ text: `Roster depth: ${tk.depthProfile}. ${tk.stability ? `Stability: ${tk.stability}.` : ''}`.trim(), type: 'profile' });
  }
  if (items.length < 5 && cleanedNews.length > 2) {
    items.push({ text: cleanedNews[2], type: 'news' });
  }

  return items.slice(0, 5);
}

// ─── Full Structured Briefing ──────────────────────────────────────────────

/**
 * Main entry point: build a complete structured team intel briefing.
 *
 * @param {Object} opts
 * @param {string} opts.slug - team slug
 * @param {string} opts.teamName - full team name
 * @param {string} opts.division - e.g., "AL East"
 * @param {Object} opts.teamContext - from extractTeamContext() or extractTeamContextFromSchedule()
 * @param {Array} opts.newsHeadlines - array of headline strings or {title, headline} objects
 * @param {Object} [opts.nextGame] - { opponent, date, oppSlug }
 * @param {Object} [opts.nextLine] - { nextEvent, consensus }
 * @param {Object} [opts.projection] - from getTeamProjection() (auto-fetched if not provided)
 * @returns {{ headline, subtext, items: Array<{text, oppSlug?, type}> }}
 */
export function buildMlbTeamIntelBriefing(opts) {
  const { slug, teamName, division } = opts;
  const projection = opts.projection || (slug ? getTeamProjection(slug) : null);
  const divOutlook = projection?.divOutlook ?? '';

  const teamContext = opts.teamContext || { recentGames: [], l10Record: null, l10Wins: null, streak: null };

  const { headline, subtext } = buildTopicalHeadline({
    teamName, slug, projection, teamContext, division,
  });

  const items = buildIntelBriefingItems({
    slug, teamName, division, divOutlook, projection, teamContext,
    newsHeadlines: opts.newsHeadlines,
    nextGame: opts.nextGame,
    nextLine: opts.nextLine,
  });

  return { headline, subtext, items, projection };
}
