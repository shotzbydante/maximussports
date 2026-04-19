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

import { getTeamProjection } from './seasonModel.js';
import TEAM_INPUTS from './seasonModelInputs.js';
import { MLB_TEAMS } from '../../sports/mlb/teams.js';
import { buildTeamWhyItMatters } from './whyItMatters.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortName(fullName) {
  if (!fullName) return '';
  if (/White Sox$/i.test(fullName)) return 'White Sox';
  if (/Red Sox$/i.test(fullName)) return 'Red Sox';
  if (/Blue Jays$/i.test(fullName)) return 'Blue Jays';
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

  // Only show L10 if we have at least 5 games — avoids misleading "L10: 0–1"
  const l10Pool = results.slice(0, 10);
  const l10Wins = l10Pool.filter(r => r.won).length;
  const l10Losses = l10Pool.length - l10Wins;
  const l10Record = l10Pool.length >= 5 ? `${l10Wins}\u2013${l10Losses}` : null;

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
    l10Wins: l10Pool.length >= 5 ? l10Wins : null,
    streak,
    gamesPlayed: results.length,
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

  // Only show L10 if we have at least 5 games — avoids misleading partial records
  const l10Pool = results.slice(0, 10);
  const l10Wins = l10Pool.filter(r => r.won).length;
  const l10Losses = l10Pool.length - l10Wins;
  const l10Record = l10Pool.length >= 5 ? `${l10Wins}\u2013${l10Losses}` : null;

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
    l10Wins: l10Pool.length >= 5 ? l10Wins : null,
    streak,
    gamesPlayed: results.length,
  };
}

// ─── Division Rank / Games Back (derived from model projections) ──────────

/**
 * Compute approximate division rank + games back from projected wins.
 * Uses season model data for every team in the same division.
 * Returns { rank, gb, divTeams, leader } or null if unavailable.
 */
function getDivisionContext(slug, division) {
  if (!slug || !division) return null;

  const divTeams = MLB_TEAMS
    .filter(t => t.division === division)
    .map(t => {
      const proj = getTeamProjection(t.slug);
      return { slug: t.slug, abbrev: t.abbrev, projectedWins: proj?.projectedWins ?? 81 };
    })
    .sort((a, b) => b.projectedWins - a.projectedWins);

  const idx = divTeams.findIndex(t => t.slug === slug);
  if (idx === -1) return null;

  const rank = idx + 1;
  const leader = divTeams[0];
  const gb = leader.projectedWins - divTeams[idx].projectedWins;

  return { rank, gb, leader, divTeams };
}

function ordinal(n) {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
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
 * Priority: recent results → streaks → L10 trends → division race → model tier.
 *
 * Headlines should feel DAILY — referencing actual opponents and scores,
 * not vague labels like "FORM FALLING" or "AT A CROSSROADS".
 */
export function buildTopicalHeadline({ teamName, slug, projection, teamContext, division, record, divContext }) {
  const sn = shortName(teamName).toUpperCase();
  const seed = slug || teamName;
  const { streak, l10Record, l10Wins, recentGames } = teamContext || {};
  const recent1 = recentGames?.[0];
  const recent2 = recentGames?.[1];

  if (!projection) {
    return { headline: `${sn}\nINTEL FILE`, subtext: `Full market intelligence on ${teamName}.` };
  }

  const wins = projection.projectedWins;
  const delta = projection.marketDelta || 0;

  const signals = [];

  // ─── RECENT-RESULT HEADLINES (most topical — use opponent names) ───

  if (recent1 && recent1.oppAbbrev) {
    const oppName = shortName(recent1.opponent) || recent1.oppAbbrev;
    const oppUp = oppName.toUpperCase();
    const score = `${recent1.ourScore}\u2013${recent1.oppScore}`;

    // Big win headline
    if (recent1.won) {
      const margin = (recent1.ourScore || 0) - (recent1.oppScore || 0);
      if (streak?.startsWith('W') && parseInt(streak.slice(1)) >= 4) {
        const n = parseInt(streak.slice(1));
        signals.push({ score: 105,
          headline: `${sn} WIN\n${n} STRAIGHT`,
          subtext: `The latest: a ${score} win over ${oppName}. ${teamName} have won ${n} consecutive and the momentum is building.`,
        });
      } else if (margin >= 5) {
        signals.push({ score: 102,
          headline: `${sn} ROLL\nPAST ${oppUp}`,
          subtext: `A convincing ${score} win over ${oppName}. The offense showed up when it mattered.`,
        });
      } else if (margin <= 1) {
        signals.push({ score: 100,
          headline: `${sn} EDGE\n${oppUp}`,
          subtext: `A tight ${score} win over ${oppName}. Close games have been going their way.`,
        });
      } else {
        signals.push({ score: 99,
          headline: `${sn} TAKE DOWN\n${oppUp}`,
          subtext: `A ${score} win over ${oppName} keeps the momentum going. The recent stretch matters.`,
        });
      }
    }

    // Loss headline
    if (!recent1.won) {
      const margin = (recent1.oppScore || 0) - (recent1.ourScore || 0);
      if (streak?.startsWith('L') && parseInt(streak.slice(1)) >= 4) {
        const n = parseInt(streak.slice(1));
        signals.push({ score: 105,
          headline: `${sn} DROP\n${n} STRAIGHT`,
          subtext: `The latest: a ${score} loss to ${oppName}. ${n} in a row now, and the pressure is mounting.`,
        });
      } else if (margin >= 5) {
        signals.push({ score: 100,
          headline: `${oppUp} BLOW\nPAST ${sn}`,
          subtext: `A lopsided ${score} loss to ${oppName}. Not the kind of game that inspires confidence.`,
        });
      } else if (margin <= 1) {
        signals.push({ score: 98,
          headline: `${sn} FALL SHORT\nVS ${oppUp}`,
          subtext: `A heartbreaker — ${score} against ${oppName}. The margins have been razor-thin.`,
        });
      } else {
        signals.push({ score: 97,
          headline: `${sn} DROP ONE\nTO ${oppUp}`,
          subtext: `A ${score} loss to ${oppName}. Questions linger after another tough result.`,
        });
      }
    }

    // 2-game series context (split, swept, etc.)
    if (recent2 && recent2.oppAbbrev === recent1.oppAbbrev) {
      const w = [recent1, recent2].filter(r => r.won).length;
      if (w === 2) {
        signals.push({ score: 103,
          headline: `${sn} SWEEP\n${oppUp}`,
          subtext: `${teamName} take both from ${oppName}. Back-to-back wins send a message.`,
        });
      } else if (w === 0) {
        signals.push({ score: 101,
          headline: `${oppUp} SWEEP\n${sn}`,
          subtext: `${teamName} drop both to ${oppName}. A rough stretch that demands a response.`,
        });
      }
    }
  }

  // ─── STREAK HEADLINES (without specific opponent) ───

  if (streak) {
    const n = parseInt(streak.slice(1));
    if (streak.startsWith('W') && n >= 5 && !recent1) {
      signals.push({ score: 96,
        headline: `${sn} WIN\n${n} STRAIGHT`,
        subtext: `${teamName} are on fire with ${n} consecutive wins. The standings are shifting.`,
      });
    }
    if (streak.startsWith('W') && n === 3) {
      signals.push({ score: 88,
        headline: `${sn}\nGAIN GROUND`,
        subtext: `Three straight wins for ${teamName}. The recent push is creating separation.`,
      });
    }
    if (streak.startsWith('L') && n >= 5 && !recent1) {
      signals.push({ score: 94,
        headline: `${sn} DROP\n${n} STRAIGHT`,
        subtext: `${n} straight losses. ${teamName} need a spark before this slide gets worse.`,
      });
    }
  }

  // ─── L10 TREND HEADLINES ───

  if (l10Wins != null && l10Record) {
    if (l10Wins >= 8) {
      signals.push({ score: 85,
        headline: `${sn}\nON A TEAR`,
        subtext: `${l10Record} over their last 10. ${teamName} are playing their best ball of the season right now.`,
      });
    }
    if (l10Wins <= 2) {
      signals.push({ score: 84,
        headline: `${sn}\nIN FREEFALL`,
        subtext: `${l10Record} in their last 10. ${teamName} are hemorrhaging ground and need answers fast.`,
      });
    }
    if (l10Wins === 3) {
      signals.push({ score: 78,
        headline: `${sn} SEARCH\nFOR ANSWERS`,
        subtext: `Just ${l10Record} in their last 10. The recent slide is putting real pressure on ${teamName}.`,
      });
    }
  }

  // ─── DIVISION RACE HEADLINES ───

  if (division && wins >= 92) {
    signals.push({ score: 72,
      headline: `${sn}\nSET THE PACE`,
      subtext: `${teamName} project at ${wins} wins — the team to beat in the ${division}.`,
    });
  }
  if (division && wins >= 85 && wins < 92) {
    signals.push({ score: 62,
      headline: `${sn}\nSTAY IN THE HUNT`,
      subtext: `${wins} projected wins keeps ${teamName} right in the ${division} conversation.`,
    });
  }

  // ─── MODEL EDGE HEADLINES (lower priority) ───

  if (delta >= 5) {
    signals.push({ score: 65,
      headline: `${sn} ARE\nUNDERPRICED`,
      subtext: `The model sees ${teamName} ${delta.toFixed(1)} wins above market. The number hasn't caught up yet.`,
    });
  }
  if (delta <= -5) {
    signals.push({ score: 60,
      headline: `MARKET\nTOO HIGH ON ${sn}`,
      subtext: `${teamName} sit ${Math.abs(delta).toFixed(1)} wins below expectations. The price may be ahead of the product.`,
    });
  }

  // ─── TIER FALLBACKS (only if nothing more current) ───

  if (wins >= 95) {
    signals.push({ score: 50, headline: `${sn}\nARE FOR REAL`,
      subtext: `${wins} projected wins. ${teamName} have the depth to go deep into October.` });
  } else if (wins >= 85) {
    signals.push({ score: 40, headline: `${sn}\nIN THE MIX`,
      subtext: `${teamName} project at ${wins} wins — firmly in the playoff conversation.` });
  } else if (wins >= 75) {
    signals.push({ score: 30,
      headline: pickOne([`${sn}\nAT A CROSSROADS`, `THE ${sn}\nQUESTION`], seed),
      subtext: `${wins} projected wins. ${teamName} are stuck between contending and retooling.` });
  } else {
    signals.push({ score: 20,
      headline: pickOne([`${sn}\nBUILDING`, `LONG ROAD\nFOR ${sn}`], seed),
      subtext: `${wins} projected wins. The focus for ${teamName} is the future, not October.` });
  }

  signals.sort((a, b) => b.score - a.score);
  const w = signals[0];
  const sub = w.subtext.length > 130 ? w.subtext.slice(0, 129) + '\u2026' : w.subtext;
  return { headline: w.headline, subtext: sub };
}

// ─── Narrative Validation ─────────────────────────────────────────────────

/**
 * Banned vague phrases. Any bullet containing these strings will fail
 * validation. The list is exhaustive of the model jargon and editorially
 * weak language we explicitly do not want surfaced to users.
 */
const BANNED_VAGUE_PHRASES = [
  'overperf. corr',
  'overperf corr',
  'underperf. corr',
  'underperf corr',
  'roster misc',
  'proj. wins',
  'market mispricing',
  'market delta',
  'carrying the load',
  'momentum alive',
  'depth is mixed',
  'solid enough',
  'late-inning volatility',
  'roster construction',
  'searching for an identity',
  'middle of the pack',
];

function containsBannedLanguage(text) {
  if (!text) return true;
  const lower = text.toLowerCase();
  return BANNED_VAGUE_PHRASES.some(p => lower.includes(p));
}

/**
 * A bullet must contain at least one of:
 *   - a digit (specific stat / score / rank)
 *   - the team's short name or full name
 *   - a recognizable proper noun (capitalized word past position 0)
 *
 * This rules out generic copy that doesn't anchor to a real entity.
 */
function hasSpecificEntity(text, expectedEntities = []) {
  if (!text) return false;
  if (/\b\d+\b/.test(text)) return true;
  for (const e of expectedEntities) {
    if (e && text.includes(e)) return true;
  }
  const words = text.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    if (/^[A-Z][a-z]/.test(words[i])) return true;
  }
  return false;
}

/**
 * Throws [TEAM_INTEL_NARRATIVE_TOO_GENERIC] if the bullet violates any of
 * the editorial rules. Called after every bullet is constructed so any
 * future contributor adding a vague fallback hits the error immediately.
 */
function validateBullet(text, position, expectedEntities) {
  if (!text || text.trim().length === 0) {
    throw new Error(`[TEAM_INTEL_NARRATIVE_TOO_GENERIC] Bullet ${position} is empty`);
  }
  if (text.length < 60) {
    throw new Error(`[TEAM_INTEL_NARRATIVE_TOO_GENERIC] Bullet ${position} too short (${text.length} chars): "${text}"`);
  }
  if (containsBannedLanguage(text)) {
    throw new Error(`[TEAM_INTEL_NARRATIVE_TOO_GENERIC] Bullet ${position} contains banned vague phrasing: "${text}"`);
  }
  if (!hasSpecificEntity(text, expectedEntities)) {
    throw new Error(`[TEAM_INTEL_NARRATIVE_TOO_GENERIC] Bullet ${position} lacks specific entity (player/stat/team): "${text}"`);
  }
}

// ─── Plain-English Translators ────────────────────────────────────────────

/**
 * Translate raw model "biggestDrag" jargon into a fan-readable risk
 * narrative. The model emits compact codes like "Overperf. Corr." or
 * "Bullpen Volatility" — these are not acceptable for end-user copy.
 */
function translateDragToPlainEnglish(rawDrag, sn, ctx = {}) {
  if (!rawDrag) return null;
  const lower = rawDrag.toLowerCase();
  if (lower.includes('overperf')) {
    return `${sn}'s recent results may not be sustainable — if pitching regresses or the offense cools off, expect the win pace to drop in the second half.`;
  }
  if (lower.includes('underperf')) {
    return `${sn} have underperformed their underlying numbers — the talent suggests room for a positive correction, but only if execution catches up.`;
  }
  if (lower.includes('bullpen')) {
    return `The bullpen is the soft spot — late-inning runs allowed have cost ${sn} multiple winnable games and remain the clearest path to a losing stretch.`;
  }
  if (lower.includes('rotation')) {
    return `Rotation depth is the biggest concern — once you get past the top of the staff, ${sn} have struggled to keep games close, and hitters know it.`;
  }
  if (lower.includes('lineup top') || lower.includes('top of') || lower.includes('top-of')) {
    return `Top-of-the-order production has been inconsistent — without more on-base from the leadoff and two-hole spots, run support for the pitching staff stays thin.`;
  }
  if (lower.includes('lineup')) {
    return `Run production is the question — ${sn} have leaned on pitching to win, and without more consistent offense the upside stays capped.`;
  }
  if (lower.includes('depth')) {
    return `Roster depth is the limiting factor — one injury to a core contributor would expose ${sn} in a way contenders rarely allow themselves to be exposed.`;
  }
  if (lower.includes('defense')) {
    return `Defense has cost ${sn} runs in close spots — when the margins are tight, fielding mistakes have flipped winnable games into losses.`;
  }
  if (lower.includes('age') || lower.includes('aging')) {
    return `Age is catching up to key players — ${sn} need their veterans to stay healthy, because there isn't enough behind them to absorb a midseason absence.`;
  }
  return null;
}

/**
 * Translate raw model "strongestDriver" jargon into a fan-readable
 * positive driver narrative. Used as a fallback when no league-leader
 * data is available for the team.
 */
function translateDriverToPlainEnglish(rawDriver, sn) {
  if (!rawDriver) return null;
  const lower = rawDriver.toLowerCase();
  if (lower.includes('rotation')) {
    return `${sn}'s rotation has been the engine — quality starts have given them a chance most nights, even on days the offense goes quiet.`;
  }
  if (lower.includes('bullpen')) {
    return `${sn}'s bullpen has been a real strength — high-leverage outs late have turned close games into wins more often than not.`;
  }
  if (lower.includes('lineup top') || lower.includes('top of')) {
    return `${sn}'s top of the order has set the tone — table-setters reaching base consistently has driven most of the run production.`;
  }
  if (lower.includes('lineup') || lower.includes('offense')) {
    return `${sn}'s offense has carried this team — the lineup is producing runs in volume, giving the pitching staff plenty of breathing room.`;
  }
  if (lower.includes('defense')) {
    return `${sn}'s defense has saved runs in critical spots — clean fielding has been a quiet but significant advantage.`;
  }
  if (lower.includes('manager') || lower.includes('coach')) {
    return `${sn}'s in-game management has squeezed out wins — sharp bullpen usage and lineup construction have been a real edge.`;
  }
  return null;
}

// ─── Player Driver Resolution ──────────────────────────────────────────────

/**
 * Find the best hitter and best pitcher for a team across the league
 * leaders + team-best maps. Returns { hitting: [...], pitching: [...] }
 * with named players, stats, and value.
 */
function findTeamPlayerDrivers(slug, mlbLeaders) {
  const teamAbbrev = MLB_TEAMS.find(t => t.slug === slug)?.abbrev || '';
  if (!teamAbbrev || !mlbLeaders?.categories) {
    return { hitting: [], pitching: [], teamAbbrev: '' };
  }
  const cats = mlbLeaders.categories;
  const mentions = [];
  const catMap = [
    ['homeRuns', 'home runs', 'home runs'],
    ['RBIs',     'RBIs',      'RBIs'],
    ['hits',     'hits',      'hits'],
    ['wins',     'wins',      'wins'],
    ['saves',    'saves',     'saves'],
  ];
  for (const [catKey, catLabel] of catMap) {
    const cat = cats[catKey];
    if (!cat) continue;
    const isPitching = catKey === 'wins' || catKey === 'saves';
    const leaders = cat.leaders || [];
    for (let i = 0; i < leaders.length; i++) {
      if (leaders[i].teamAbbrev === teamAbbrev) {
        mentions.push({
          full: leaders[i].name || '',
          last: (leaders[i].name || '').split(' ').pop(),
          cat: catLabel, rank: i + 1,
          value: leaders[i].display || String(leaders[i].value || 0),
          isPitching,
          isLeagueBest: true,
        });
      }
    }
    const tb = cat.teamBest?.[teamAbbrev];
    if (tb && tb.name && tb.name !== '\u2014') {
      const exists = mentions.some(m => m.full === tb.name && m.cat === catLabel);
      if (!exists) {
        mentions.push({
          full: tb.name,
          last: (tb.name || '').split(' ').pop(),
          cat: catLabel, rank: null,
          value: tb.display || String(tb.value || 0),
          isPitching,
          isLeagueBest: false,
        });
      }
    }
  }
  return {
    hitting: mentions.filter(m => !m.isPitching),
    pitching: mentions.filter(m => m.isPitching),
    teamAbbrev,
  };
}

// ─── Structured Briefing Builder ──────────────────────────────────────────

/**
 * Build EXACTLY 5 structured briefing items in fixed order:
 *   1. Standings Context  — record, division rank, GB, implication
 *   2. Recent Form        — L10 record + interpretation (+ streak if ≥3)
 *   3. Most Recent Game   — opponent, score, narrative framing
 *   4. Core Team Driver   — named players + specific stats
 *   5. Risk / Limitation  — plain-English risk derived from model signal
 *
 * Every bullet must:
 *   - contain a specific entity (digit, team name, or proper noun)
 *   - be at least 60 chars
 *   - contain no banned vague phrasing
 *
 * If any bullet fails these rules, throws [TEAM_INTEL_NARRATIVE_TOO_GENERIC]
 * so we never silently ship vague copy to users.
 *
 * Each item is { text, type, oppSlug? } — preserved for downstream
 * consumers (slide, team page, caption). 'recent' type retains its
 * opponent-logo behavior in the slide renderer.
 */
export function buildIntelBriefingItems({
  slug,
  teamName,
  division,
  divOutlook,
  projection,
  teamContext,
  newsHeadlines,    // unused in new structure — kept for back-compat call sites
  nextGame,         // unused
  nextLine,         // unused
  record,
  standings,
  divContext,
  mlbLeaders,
}) {
  void newsHeadlines; void nextGame; void nextLine; void divOutlook;

  const wins = projection?.projectedWins;
  const tk = projection?.takeaways || {};
  const inputs = slug ? TEAM_INPUTS[slug] : null;
  const { streak, l10Record, l10Wins, recentGames } = teamContext || {};
  const sn = shortName(teamName) || teamName || 'The team';
  const expectedEntities = [sn, teamName, division].filter(Boolean);

  const bullets = [];

  // ── 1. STANDINGS CONTEXT ─────────────────────────────────────────────
  // record · rank · games back · implication
  const rank = divContext?.rank ?? standings?.rank ?? null;
  const gb = divContext?.gb ?? standings?.gb ?? null;
  const recPart = record ? `${record.replace(/-/g, '\u2013')}` : null;

  let standingsText;
  if (recPart && rank != null && division) {
    const rankLabel = `${ordinal(rank)} in the ${division}`;
    if (rank === 1 && (gb == null || gb === 0)) {
      standingsText = `${recPart}, ${rankLabel} \u2014 leading the division${wins ? `, with the Maximus model projecting ${wins} wins` : ''}. Every series from here either widens the gap or invites the chasers.`;
    } else if (gb != null && gb === 0) {
      standingsText = `${recPart}, ${rankLabel} \u2014 tied for the division lead. The next two weeks will decide whether the ${sn} pull away or get caught.`;
    } else if (gb != null && gb <= 3) {
      standingsText = `${recPart}, ${rankLabel}, ${gb} ${gb === 1 ? 'game' : 'games'} back. Within striking distance \u2014 every series carries weight while the top of the division stays bunched.`;
    } else if (gb != null && gb <= 8) {
      standingsText = `${recPart}, ${rankLabel}, sitting ${gb} games back. The margin for error is shrinking quickly as the ${division} starts to separate.`;
    } else if (gb != null) {
      standingsText = `${recPart}, ${rankLabel}, ${gb} games off the pace in the ${division}. The gap is real \u2014 this stretch will define whether the ${sn} push back or start looking ahead.`;
    } else {
      standingsText = `${recPart}, ${rankLabel}${wins ? `. Maximus model projects ${wins} wins on the season` : ''} \u2014 the next month sets the tone for the rest of the year.`;
    }
  } else if (recPart && division) {
    standingsText = `${recPart} on the season in the ${division}.${wins ? ` Maximus model projects ${wins} wins \u2014 every series matters from here.` : ` The ${sn} are looking to find consistency before the division separates.`}`;
  } else if (recPart) {
    standingsText = `${recPart} on the season${wins ? `, with the Maximus model projecting ${wins} total wins` : ''}. The ${sn} need to start stacking results to climb the standings.`;
  } else if (wins && division) {
    standingsText = `The ${sn} project for ${wins} wins in the ${division} \u2014 a clear measuring stick for whether they're a contender, a fringe team, or already out of it.`;
  } else if (division) {
    standingsText = `The ${sn} are working through their early stretch in the ${division} \u2014 the next two weeks of play will set the tone for the rest of the season.`;
  } else {
    standingsText = `The ${sn} are still searching for a defining stretch this season \u2014 the next month will reveal whether this group has another gear.`;
  }
  validateBullet(standingsText, 1, expectedEntities);
  bullets.push({ text: standingsText, type: 'standings' });

  // ── 2. RECENT FORM (L10 + trend) ────────────────────────────────────
  const espnL10 = standings?.l10 ?? null;
  const effectiveL10 = espnL10 || l10Record;
  const effectiveL10Wins = espnL10
    ? (parseInt(espnL10.split('-')[0]) || 0)
    : l10Wins;
  const effectiveStreak = standings?.streak || streak;
  const streakNum = effectiveStreak ? parseInt(effectiveStreak.replace(/[^\d]/g, '')) || 0 : 0;
  const isWinStreak = effectiveStreak ? effectiveStreak.toUpperCase().startsWith('W') : false;

  let formText;
  if (effectiveL10 && effectiveL10Wins != null) {
    const l10Display = effectiveL10.replace(/-/g, '\u2013');
    if (effectiveL10Wins >= 8) {
      formText = `${l10Display} over their last 10 games \u2014 ${sn} are surging through the hottest stretch of their season, and the standings reflect it.`;
    } else if (effectiveL10Wins >= 7) {
      formText = `A strong ${l10Display} over the last 10 \u2014 real momentum is building, and this is exactly when contenders start separating from the pack.`;
    } else if (effectiveL10Wins === 6) {
      formText = `Going ${l10Display} over the last 10 \u2014 above .500 recently, but ${sn} need a hotter stretch to actually gain ground in the division race.`;
    } else if (effectiveL10Wins === 5) {
      formText = `Treading water at ${l10Display} over the last 10 \u2014 ${sn} aren't gaining ground, which quietly benefits every team chasing them.`;
    } else if (effectiveL10Wins === 4) {
      formText = `A ${l10Display} run over the last 10 games has ${sn} losing close to a game per week to the field \u2014 a pace that compounds quickly in a tight division.`;
    } else if (effectiveL10Wins === 3) {
      formText = `At ${l10Display} over the last 10, ${sn} are losing real ground. Something needs to shift before the division deficit becomes the season's defining storyline.`;
    } else {
      formText = `A brutal ${l10Display} over the last 10. This is the kind of skid that costs ${sn} standings position and demands an immediate response from the dugout.`;
    }
    if (streakNum >= 3) {
      formText += isWinStreak
        ? ` Riding a ${effectiveStreak} streak \u2014 ${sn} are stacking wins in a way that changes the room.`
        : ` The ${effectiveStreak} skid only adds to the urgency.`;
    }
  } else if (recentGames && recentGames.length > 0) {
    const w = recentGames.filter(r => r.won).length;
    const total = recentGames.length;
    formText = `${w} wins in the last ${total} games \u2014 not a complete sample yet, but ${sn} need to start stacking results consistently to move up the standings.`;
  } else if (effectiveStreak && streakNum >= 2) {
    formText = isWinStreak
      ? `${sn} have won ${streakNum} in a row \u2014 the early-season form is showing real signs of life, and the next series tests whether it holds up.`
      : `${sn} have dropped ${streakNum} in a row \u2014 the slide is short but it's the kind of stretch that needs an answer before it snowballs.`;
  } else {
    formText = `Recent form data is still building for ${sn} this season \u2014 the next 10 games will tell us whether this group is closer to a contender or a rebuild.`;
  }
  validateBullet(formText, 2, expectedEntities);
  bullets.push({ text: formText, type: 'l10' });

  // ── 3. MOST RECENT GAME ──────────────────────────────────────────────
  // opponent · score · narrative framing (blowout / close / consequence)
  const r1 = recentGames?.[0] || null;
  let recentText;
  let recentOppSlug = null;
  if (r1 && r1.ourScore != null && r1.oppScore != null) {
    const opp = shortName(r1.opponent) || r1.oppAbbrev || 'their opponent';
    const score = `${r1.ourScore}\u2013${r1.oppScore}`;
    const margin = Math.abs(r1.ourScore - r1.oppScore);
    const isDivisionGame = r1.oppSlug && division &&
      MLB_TEAMS.find(t => t.slug === r1.oppSlug)?.division === division;
    recentOppSlug = r1.oppSlug || null;

    if (r1.won && r1.oppScore === 0) {
      recentText = `${sn} blanked ${opp} ${score}${isDivisionGame ? ` in a divisional matchup` : ''} \u2014 a shutout reinforces the pitching depth and is the kind of result that builds confidence.`;
    } else if (r1.won && margin >= 5) {
      recentText = `${sn} rolled ${opp} ${score}${isDivisionGame ? ` in a key ${division} matchup` : ''} \u2014 a dominant offensive showing that sends a message to the rest of the league.`;
    } else if (r1.won && margin <= 1) {
      recentText = `${sn} edged ${opp} ${score}${isDivisionGame ? ` in a tight ${division} battle` : ''} \u2014 a one-run win that shows ${sn} can execute when the leverage is highest.`;
    } else if (r1.won) {
      recentText = `${sn} took down ${opp} ${score}${isDivisionGame ? ` in a divisional contest` : ''} \u2014 a solid win that keeps the recent stretch pointed in the right direction.`;
    } else if (r1.oppScore !== 0 && r1.ourScore === 0) {
      recentText = `${sn} were blanked by ${opp} ${score}${isDivisionGame ? ` in a divisional spot` : ''} \u2014 zero runs against a beatable opponent is the kind of game that lingers, and the offense needs a quick response.`;
    } else if (!r1.won && margin >= 5) {
      recentText = `${sn} were blown out by ${opp} ${score}${isDivisionGame ? ` in a key ${division} matchup` : ''} \u2014 a lopsided loss that raises real questions about where the next answer comes from.`;
    } else if (!r1.won && margin <= 1) {
      recentText = `${sn} fell to ${opp} ${score} in a one-run game${isDivisionGame ? ` against a division rival` : ''} \u2014 close losses carry double weight in a tight race, and this one stings.`;
    } else {
      recentText = `${sn} dropped a ${score} game to ${opp}${isDivisionGame ? ` in a divisional spot` : ''} \u2014 the consequence is real, and the next series offers the chance to respond.`;
    }
  } else if (recentGames && recentGames.length > 0) {
    recentText = `${sn} have ${recentGames.filter(r => r.won).length} wins in their last ${recentGames.length} games \u2014 not a defining stretch yet, but the next series sets the tone.`;
  } else {
    recentText = `${sn} are between meaningful results right now \u2014 the next series will be the first real read on where this team stands relative to the division.`;
  }
  validateBullet(recentText, 3, expectedEntities);
  bullets.push({ text: recentText, type: 'recent', oppSlug: recentOppSlug });

  // ── 4. CORE TEAM DRIVER (named players + specific stats) ─────────────
  const drivers = findTeamPlayerDrivers(slug, mlbLeaders);
  const hit = drivers.hitting;
  const pit = drivers.pitching;

  let driverText;
  if (hit.length > 0 && pit.length > 0) {
    const h = hit[0];
    const p = pit[0];
    const hPhrase = h.isLeagueBest
      ? `${h.last} ranks among MLB leaders in ${h.cat} (${h.value})`
      : `${h.last} leads the club in ${h.cat} (${h.value})`;
    const pPhrase = p.isLeagueBest
      ? `${p.last} sits among MLB leaders with ${p.value} ${p.cat}`
      : `${p.last} anchors the staff with ${p.value} ${p.cat}`;
    driverText = `On offense, ${hPhrase}, providing most of the run production. On the mound, ${pPhrase} \u2014 a key reason the ${sn} stay competitive on most nights.`;
  } else if (hit.length >= 2) {
    const [a, b] = hit;
    driverText = `${a.last} (${a.value} ${a.cat}) and ${b.last} (${b.value} ${b.cat}) are driving the ${sn} offense \u2014 ${a.isLeagueBest || b.isLeagueBest ? "both rank among MLB's best at their spots." : "both lead the club at their spots, and the lineup needs them to keep producing."}`;
  } else if (hit.length === 1) {
    const h = hit[0];
    driverText = h.isLeagueBest
      ? `${h.last} is the engine of the ${sn} offense, ranking among MLB leaders with ${h.value} ${h.cat} \u2014 a single bat carrying a meaningful share of the run production.`
      : `${h.last} leads the ${sn} with ${h.value} ${h.cat}, providing much of the run production while the rest of the lineup looks to catch up.`;
  } else if (pit.length >= 2) {
    const [a, b] = pit;
    driverText = `${a.last} (${a.value} ${a.cat}) and ${b.last} (${b.value} ${b.cat}) are anchoring the ${sn} staff \u2014 the pitching is doing the heavy lifting while the offense still searches for consistency.`;
  } else if (pit.length === 1) {
    const p = pit[0];
    driverText = p.isLeagueBest
      ? `${p.last} has been the staff's backbone, sitting among MLB leaders with ${p.value} ${p.cat} \u2014 a top arm forcing the rest of the rotation to match the standard.`
      : `${p.last} anchors the ${sn} staff with ${p.value} ${p.cat} \u2014 the rotation has needed a top arm to set the tone, and that arm has shown up.`;
  } else {
    // No leader data — translate the model's strongestDriver
    const driverPhrase = translateDriverToPlainEnglish(tk.strongestDriver, sn);
    if (driverPhrase) {
      driverText = driverPhrase;
    } else if (inputs && inputs.frontlineRotation >= 7) {
      driverText = `The ${sn} rotation has been the team's clearest strength \u2014 quality starts have given them a chance every night, even on days the offense goes quiet.`;
    } else if (inputs && inputs.topOfLineup >= 7) {
      driverText = `The ${sn} top of the order has set the tone all season \u2014 table-setters reaching base consistently has driven the bulk of the run production.`;
    } else if (inputs && inputs.bullpenQuality >= 7) {
      driverText = `The ${sn} bullpen has been a true difference-maker \u2014 high-leverage outs late have flipped close games into wins more often than not.`;
    } else if (wins != null) {
      driverText = `The ${sn} are projected for ${wins} wins by the Maximus model \u2014 a ceiling that depends on the pitching staff continuing to keep games within reach for the offense.`;
    } else {
      driverText = `The ${sn} are still figuring out which unit \u2014 rotation, bullpen, or lineup \u2014 will carry the season; the next month should clarify the identity.`;
    }
  }
  validateBullet(driverText, 4, expectedEntities);
  bullets.push({ text: driverText, type: 'driver' });

  // ── 5. RISK / LIMITATION (plain-English) ─────────────────────────────
  const drag = (tk.biggestDrag && tk.biggestDrag !== 'None significant') ? tk.biggestDrag : null;
  const translatedRisk = translateDragToPlainEnglish(drag, sn);

  let riskText;
  if (translatedRisk) {
    riskText = `The risk: ${translatedRisk}`;
  } else if (inputs && inputs.bullpenVolatility >= 5) {
    riskText = `The risk: the ${sn} bullpen has been volatile in late innings \u2014 if that continues, expect more close games to flip the wrong way.`;
  } else if (inputs && inputs.frontlineRotation <= 4) {
    riskText = `The risk: the ${sn} rotation lacks a top arm to lean on \u2014 in a tight series, that gap shows up against contenders who have one.`;
  } else if (inputs && inputs.topOfLineup <= 4) {
    riskText = `The risk: ${sn} run production has been thin from the top of the order \u2014 without more on-base ahead of the heart of the lineup, the offense stays inconsistent.`;
  } else if (hit.length === 0 && pit.length > 0) {
    riskText = `The risk: ${sn} have leaned on pitching to win, but until the offense produces more consistent runs, the ceiling on this group stays capped.`;
  } else if (pit.length === 0 && hit.length > 0) {
    riskText = `The risk: the ${sn} offense is doing the heavy lifting, but without more reliable starting pitching the team will keep losing games it shouldn't.`;
  } else if (wins != null && wins <= 78) {
    riskText = `The risk: at ${wins} projected wins, the ${sn} margin for error is razor-thin \u2014 every losing series this month makes the climb back into contention steeper.`;
  } else if (wins != null && wins >= 92) {
    riskText = `The risk: the bar is set high at ${wins} projected wins \u2014 if the ${sn} stop hitting that pace, the perception flips quickly from contender to disappointment.`;
  } else {
    riskText = `The risk: ${sn} performance has been streaky enough that one cold week could shift the entire division narrative \u2014 sustained, daily execution is the only answer.`;
  }
  validateBullet(riskText, 5, expectedEntities);
  bullets.push({ text: riskText, type: 'risk' });

  return bullets;
}

// ─── Full Structured Briefing ──────────────────────────────────────────────

/**
 * Main entry point: build a complete structured team intel briefing.
 *
 * @param {Object} opts
 * @param {string} opts.slug - team slug
 * @param {string} opts.teamName - full team name
 * @param {string} opts.division - e.g., "AL East"
 * @param {string} [opts.record] - overall W-L record string (e.g., "82-80")
 * @param {Object} opts.teamContext - from extractTeamContext() or extractTeamContextFromSchedule()
 * @param {Array} opts.newsHeadlines - array of headline strings or {title, headline} objects
 * @param {Object} [opts.nextGame] - { opponent, date, oppSlug }
 * @param {Object} [opts.nextLine] - { nextEvent, consensus }
 * @param {Object} [opts.projection] - from getTeamProjection() (auto-fetched if not provided)
 * @param {Object} [opts.standings] - ESPN standings: { wins, losses, record, gb, gbDisplay, rank, l10, streak, division }
 * @returns {{ headline, subtext, items: Array<{text, oppSlug?, type}> }}
 */
export function buildMlbTeamIntelBriefing(opts) {
  const { slug, teamName, division, record, standings } = opts;
  const projection = opts.projection || (slug ? getTeamProjection(slug) : null);
  const divOutlook = projection?.divOutlook ?? '';

  const teamContext = opts.teamContext || { recentGames: [], l10Record: null, l10Wins: null, streak: null };

  // Compute division context from ESPN standings or fall back to model projections
  const divContext = standings?.rank
    ? { rank: standings.rank, gb: standings.gb ?? 0 }
    : getDivisionContext(slug, division);

  const { headline, subtext } = buildTopicalHeadline({
    teamName, slug, projection, teamContext, division, record, divContext,
  });

  const items = buildIntelBriefingItems({
    slug, teamName, division, divOutlook, projection, teamContext,
    newsHeadlines: opts.newsHeadlines,
    nextGame: opts.nextGame,
    nextLine: opts.nextLine,
    mlbLeaders: opts.mlbLeaders,
    record,
    standings,
    divContext,
  });

  // "Why It Matters" — shared narrative signals for this team
  const whyItMatters = buildTeamWhyItMatters({
    slug,
    teamName,
    division,
    standings,
    projection,
    teamContext,
    champOdds: opts.champOdds,
  });

  // Enrich subtext with top "why" signal when headline subtext is generic
  let enrichedSubtext = subtext;
  const topWhy = whyItMatters.top;
  if (topWhy && topWhy.priority >= 70 && subtext && subtext.length < 100) {
    // Append "why it matters" context to short subtexts
    enrichedSubtext = subtext.replace(/\.\s*$/, '') + '. ' + topWhy.short + '.';
    if (enrichedSubtext.length > 130) enrichedSubtext = subtext; // revert if too long
  }

  // ── Team Leaders: best player per stat category for this team ──
  const teamLeaders = extractTeamLeaders(slug, opts.mlbLeaders);

  return { headline, subtext: enrichedSubtext, items, projection, whyItMatters, teamLeaders };
}

/**
 * Extract the best player per stat category for a given team.
 * Uses teamBest map (per-team best from full leaderboard) first,
 * falls back to scanning the top-3 league leaders array.
 *
 * ALWAYS returns exactly 5 items in fixed order: HR, RBI, Hits, Wins, Saves.
 * Missing categories get a graceful fallback so the UI never has gaps.
 *
 * @param {string} slug - team slug
 * @param {Object} mlbLeaders - from /api/mlb/leaders: { categories: { ... } }
 * @returns {Array<{ stat: string, label: string, player: string, value: string }>}
 */
function extractTeamLeaders(slug, mlbLeaders) {
  const mapping = [
    { key: 'homeRuns', stat: 'HR', label: 'Home Runs' },
    { key: 'RBIs', stat: 'RBI', label: 'RBIs' },
    { key: 'hits', stat: 'H', label: 'Hits' },
    { key: 'wins', stat: 'W', label: 'Wins' },
    { key: 'saves', stat: 'SV', label: 'Saves' },
  ];

  // If no data at all, return 5 fallback items so UI still renders
  if (!slug || !mlbLeaders?.categories) {
    return mapping.map(({ stat, label }) => ({
      stat, label, player: '—', value: '—',
    }));
  }

  const teamAbbrev = MLB_TEAMS.find(t => t.slug === slug)?.abbrev || '';
  if (!teamAbbrev) {
    return mapping.map(({ stat, label }) => ({
      stat, label, player: '—', value: '—',
    }));
  }

  const cats = mlbLeaders.categories;

  return mapping.map(({ key, stat, label }) => {
    const cat = cats[key];

    // Try teamBest map first (covers all teams from full leaderboard)
    const tb = cat?.teamBest?.[teamAbbrev];
    if (tb && tb.name && tb.name !== '—') {
      return {
        stat, label,
        player: tb.name,
        value: tb.display || String(tb.value || 0),
      };
    }

    // Fallback: scan top-3 league leaders
    const match = (cat?.leaders || []).find(l => l.teamAbbrev === teamAbbrev);
    if (match && match.name && match.name !== '—') {
      return {
        stat, label,
        player: match.name,
        value: match.display || String(match.value || 0),
      };
    }

    // Last resort: graceful fallback — category still renders
    return { stat, label, player: '—', value: '—' };
  });
}
