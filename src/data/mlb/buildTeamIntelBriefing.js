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

// ─── Team Tier Classification ─────────────────────────────────────────────

/**
 * Classify a team's competitive position into one of three editorial tiers.
 * Tone, implication phrasing, and bullet framing all branch on this tier
 * so a contender doesn't sound like a fringe team and a falling team
 * doesn't sound like a contender.
 *
 * @param {{ divisionRank?: number|null, gamesBack?: number|null, projectedWins?: number|null }} ctx
 * @returns {'contender' | 'in_race' | 'falling_behind'}
 */
export function classifyTeamTier({ divisionRank, gamesBack, projectedWins } = {}) {
  if (divisionRank != null && gamesBack != null) {
    if (divisionRank <= 2 && gamesBack <= 3) return 'contender';
    if (gamesBack <= 6) return 'in_race';
    return 'falling_behind';
  }
  // Fallback when standings are unavailable: lean on projection
  if (projectedWins != null) {
    if (projectedWins >= 92) return 'contender';
    if (projectedWins >= 80) return 'in_race';
    return 'falling_behind';
  }
  return 'in_race'; // neutral middle ground
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
 * Implication verb gate — every bullet must communicate a CONSEQUENCE,
 * not just a description. The five canonical verbs (per spec) cover all
 * standard conjugations: keep/keeps/kept/keeping, put/puts/putting,
 * limit/limits/limited/limiting, create/creates/created/creating,
 * force/forces/forced/forcing.
 */
const IMPLICATION_PATTERN = /\b(keep[a-z]*|put[a-z]*|limit[a-z]*|creat[a-z]*|forc[a-z]*)\b/i;

function hasImplicationVerb(text) {
  if (!text) return false;
  return IMPLICATION_PATTERN.test(text);
}

/**
 * Risk consequence verb gate — risk bullets must explicitly name what
 * BREAKS when the weakness continues, not just describe the weakness.
 * Soft phrasings like "limits the ceiling" alone are not enough — risk
 * bullets must also include a consequence verb from this set.
 *
 * Pattern covers: turn/turns/turning, make/makes/making/made,
 * force/forces/forcing/forced, widen/widens/widening,
 * cost/costs/costing, expose/exposes/exposing/exposed,
 * push/pushes/pushing/pushed.
 */
const RISK_CONSEQUENCE_PATTERN = /\b(turn[a-z]*|mak[a-z]*|forc[a-z]*|widen[a-z]*|cost[a-z]*|expos[a-z]*|push[a-z]*)\b/i;

function hasRiskConsequenceVerb(text) {
  if (!text) return false;
  return RISK_CONSEQUENCE_PATTERN.test(text);
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
 * Multi-stage validation. Every bullet must pass:
 *   [TEAM_INTEL_NARRATIVE_TOO_GENERIC] — banned vague phrasing,
 *     empty/short text, or no anchored entity
 *   [TEAM_INTEL_LOW_SIGNAL_BULLET] — bullet describes data without
 *     communicating an implication (no keep/put/limit/create/force verb)
 *
 * Position-specific bullets get additional checks via `extra` flags:
 *   extra.requireRiskConsequence — risk bullet must include
 *     turns/makes/forces/widens/costs/exposes/pushes (not just soft
 *     ceiling phrasing). Throws [TEAM_INTEL_RISK_TOO_SOFT].
 *   extra.requireDriverSpecificity — driver bullet (when player data
 *     is available) must include both a digit and a Capitalized name.
 *     Throws [TEAM_INTEL_DRIVER_TOO_GENERIC].
 *   extra.requireRecentGameContext — recent game bullet (when scores
 *     are available) must reference an opponent and a score and an
 *     implication. Throws [TEAM_INTEL_RECENT_GAME_TOO_WEAK].
 *
 * All throws fire immediately so any template drift fails loudly during
 * development and never silently ships generic copy.
 */
function validateBullet(text, position, expectedEntities, extra = {}) {
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
  if (!hasImplicationVerb(text)) {
    throw new Error(`[TEAM_INTEL_LOW_SIGNAL_BULLET] Bullet ${position} lacks implication verb (keeps/puts/limits/creates/forces): "${text}"`);
  }
  if (extra.requireRiskConsequence && !hasRiskConsequenceVerb(text)) {
    throw new Error(`[TEAM_INTEL_RISK_TOO_SOFT] Bullet ${position} (risk) lacks consequence verb (turns/makes/forces/widens/costs/exposes/pushes): "${text}"`);
  }
  if (extra.requireDriverSpecificity) {
    // Must contain a digit (stat) AND a Capitalized name past pos 0 (player)
    const hasDigit = /\b\d+\b/.test(text);
    const words = text.split(/\s+/);
    let hasPlayerName = false;
    for (let i = 1; i < words.length; i++) {
      if (/^[A-Z][a-z]+/.test(words[i])) { hasPlayerName = true; break; }
    }
    if (!hasDigit || !hasPlayerName) {
      throw new Error(`[TEAM_INTEL_DRIVER_TOO_GENERIC] Bullet ${position} (driver) must mention a named player and a stat value: "${text}"`);
    }
  }
  if (extra.requireRecentGameContext) {
    // Must reference an opponent (proper noun past pos 0) AND a score/digit
    const hasDigit = /\b\d+\b/.test(text);
    const words = text.split(/\s+/);
    let hasOpponent = false;
    for (let i = 1; i < words.length; i++) {
      if (/^[A-Z][a-z]+/.test(words[i])) { hasOpponent = true; break; }
    }
    if (!hasDigit || !hasOpponent) {
      throw new Error(`[TEAM_INTEL_RECENT_GAME_TOO_WEAK] Bullet ${position} (recent game) must reference opponent + score + implication: "${text}"`);
    }
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
    return `${sn}'s recent results may not hold — regression turns hot stretches into ordinary ones, which puts real pressure on the win pace and exposes the gap between current results and underlying talent.`;
  }
  if (lower.includes('underperf')) {
    return `${sn} have underperformed their underlying numbers — execution gaps keep costing winnable games, which limits how often the breaks turn their way even when the talent suggests better outcomes.`;
  }
  if (lower.includes('bullpen')) {
    return `Bullpen instability keeps putting late innings at risk — the misses turn winnable games into losses and expose ${sn} in the kinds of close contests contenders usually win.`;
  }
  if (lower.includes('rotation')) {
    return `Beyond the top of the rotation, innings quality falls off quickly — the gap forces ${sn} into bullpen-heavy games and costs them in series losses over longer stretches.`;
  }
  if (lower.includes('lineup top') || lower.includes('top of') || lower.includes('top-of')) {
    return `Thin top-of-order on-base forces the heart of the lineup into low-leverage at-bats, which limits run support and costs ${sn} real margin for the pitching staff.`;
  }
  if (lower.includes('lineup')) {
    return `Run production remains inconsistent — the gaps turn competitive games into losses whenever the pitching staff does not dominate, which puts real pressure on every start.`;
  }
  if (lower.includes('depth')) {
    return `Roster depth is the limiting factor — one injury to a core contributor exposes ${sn} in a way contenders absorb without flinching, and forces reactive moves that limit any in-season fix.`;
  }
  if (lower.includes('defense')) {
    return `Defense has cost ${sn} runs in close spots — when margins are tight, fielding mistakes turn winnable games into losses and keep the team losing the kinds of contests contenders bank.`;
  }
  if (lower.includes('age') || lower.includes('aging')) {
    return `Age is catching up to key players — injury risk to veterans exposes the lack of help behind them, which forces ${sn} into reactive moves and pushes the team toward midseason patches.`;
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
    return `${sn}'s rotation has been the engine — quality starts keep ${sn} in games most nights, even when the offense goes quiet.`;
  }
  if (lower.includes('bullpen')) {
    return `${sn}'s bullpen has been a real strength — high-leverage outs late keep close games tilted in their favor more often than not.`;
  }
  if (lower.includes('lineup top') || lower.includes('top of')) {
    return `${sn}'s top of the order has set the tone — table-setters reaching base consistently keeps the heart of the lineup in run-scoring spots.`;
  }
  if (lower.includes('lineup') || lower.includes('offense')) {
    return `${sn}'s offense has carried this team — the lineup creates runs in volume and puts pitching in a position to win on most nights.`;
  }
  if (lower.includes('defense')) {
    return `${sn}'s defense has saved runs in critical spots — clean fielding keeps small leads from turning into chaotic late innings.`;
  }
  if (lower.includes('manager') || lower.includes('coach')) {
    return `${sn}'s in-game management has squeezed out wins — sharp bullpen usage and lineup construction keep them in games that other teams give away.`;
  }
  return null;
}

// ─── Narrative Spike (1A) ──────────────────────────────────────────────────

/**
 * Returns ONE sharp editorial line that adds memorability to a team's
 * briefing without feeling templated. Use at most once per briefing,
 * appended naturally to bullet 1 or bullet 2.
 *
 * Variation seed (l10Wins + gamesBack + streakLen) selects across
 * multiple phrasings per branch so the same team doesn't get the
 * exact same spike on consecutive renders.
 */
export function injectNarrativeSpike({ teamTier, l10Wins, gamesBack, divisionRank, streak, projectedWins } = {}) {
  void divisionRank; void projectedWins; // accepted for API stability

  const streakLen = (typeof streak === 'string')
    ? (parseInt(streak.replace(/[^\d]/g, '')) || 0)
    : (typeof streak === 'number' ? streak : 0);
  const isWin = (typeof streak === 'string') ? streak.toUpperCase().startsWith('W') : true;

  const seed = (l10Wins ?? 0) + (gamesBack ?? 0) + streakLen;

  if (teamTier === 'contender' && (l10Wins ?? 0) >= 7) {
    const variants = [
      'They are starting to look like the team to beat in this division.',
      'This stretch is exactly what separates contenders from the field.',
      'The standings are bending in their direction in a real way.',
    ];
    return variants[seed % variants.length];
  }
  if (teamTier === 'in_race' && (gamesBack ?? 99) <= 3) {
    const variants = [
      'One strong week could completely change the shape of the standings.',
      'A short hot streak from here would put them right at the front of the race.',
      'The division is bunched enough that a single sweep changes everything.',
    ];
    return variants[seed % variants.length];
  }
  if (teamTier === 'falling_behind' && (gamesBack ?? 0) >= 6) {
    const variants = [
      'They are approaching a stretch where every series starts to feel must-win.',
      'The runway to make a real run is starting to shorten.',
      'Without a sustained surge, the wild-card path is the realistic ceiling.',
    ];
    return variants[seed % variants.length];
  }
  if (streakLen >= 4 && isWin) {
    return 'This is the kind of stretch that can reset the tone of a season.';
  }
  if (streakLen >= 4 && !isWin) {
    return 'A skid like this one can reshape the rest of the season if it does not stop now.';
  }
  return null;
}

// ─── Driver Balance Classification (1B) ────────────────────────────────────

/**
 * Classify how a team's production is distributed:
 *   'offense_driven'   — bats are doing the heavy lifting, pitching mediocre
 *   'pitching_driven'  — pitching is the reason they stay competitive
 *   'balanced'         — both sides contributing meaningfully
 *   'thin'             — one player or unit masking broader weakness
 *
 * Used by bullet 4 to choose between four diagnostic templates.
 */
export function classifyDriverBalance({
  hittingDrivers = [],
  pitchingDrivers = [],
  teamInputs = null,
  recentGames = [],
} = {}) {
  void recentGames; // accepted for API stability — future signal

  const hasStrongHit = hittingDrivers.some(h => h.isLeagueBest) || hittingDrivers.length >= 2;
  const hasStrongPit = pitchingDrivers.some(p => p.isLeagueBest) || pitchingDrivers.length >= 2;
  const hasAnyHit = hittingDrivers.length >= 1;
  const hasAnyPit = pitchingDrivers.length >= 1;

  const inputs = teamInputs || {};
  const offenseStrong = (inputs.topOfLineup ?? 5) >= 7;
  const offenseWeak   = (inputs.topOfLineup ?? 5) <= 4;
  const pitchStrong   = (inputs.frontlineRotation ?? 5) >= 7;
  const pitchWeak     = (inputs.frontlineRotation ?? 5) <= 4;

  // Thin: a single league-best player is essentially the entire production
  if (hittingDrivers.length + pitchingDrivers.length === 1) {
    const only = hittingDrivers[0] || pitchingDrivers[0];
    if (only?.isLeagueBest) return 'thin';
  }

  // Balanced: clear strength on both sides
  if (hasStrongHit && hasStrongPit) return 'balanced';
  if (hasAnyHit && hasAnyPit && offenseStrong && pitchStrong) return 'balanced';

  // Offense-driven: hitting strong, pitching mediocre/weak
  if (hasStrongHit && (pitchWeak || !hasStrongPit)) return 'offense_driven';
  if (offenseStrong && pitchWeak) return 'offense_driven';

  // Pitching-driven: pitching strong, offense mediocre/weak
  if (hasStrongPit && (offenseWeak || !hasStrongHit)) return 'pitching_driven';
  if (pitchStrong && offenseWeak) return 'pitching_driven';

  // Default: balanced if both sides have any contributors
  if (hasAnyHit && hasAnyPit) return 'balanced';

  // Single-side-only known
  if (hasAnyHit) return 'offense_driven';
  if (hasAnyPit) return 'pitching_driven';
  return 'thin';
}

// ─── Opponent Quality Classification (1D) ──────────────────────────────────

/**
 * Classify the strength of an opponent so wins and losses can be framed
 * with judgment rather than equally:
 *   'elite' / 'strong' / 'average' / 'weak' / 'unknown'
 *
 * Prefers ESPN standings win% (real, current); falls back to the season
 * model's projected wins; returns 'unknown' when neither source is
 * available, in which case bullet 3 keeps generic framing.
 */
export function classifyOpponentQuality(opponentSlug, mlbStandings, opponentProjection) {
  if (!opponentSlug) return 'unknown';

  const standing = mlbStandings?.[opponentSlug];
  if (standing && standing.wins != null && standing.losses != null) {
    const games = standing.wins + standing.losses;
    if (games >= 10) {
      const pct = standing.wins / games;
      if (pct >= 0.580) return 'elite';
      if (pct >= 0.520) return 'strong';
      if (pct >= 0.460) return 'average';
      return 'weak';
    }
  }

  const proj = opponentProjection || (opponentSlug ? getTeamProjection(opponentSlug) : null);
  if (proj?.projectedWins != null) {
    const w = proj.projectedWins;
    if (w >= 92) return 'elite';
    if (w >= 84) return 'strong';
    if (w >= 75) return 'average';
    return 'weak';
  }
  return 'unknown';
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

  // ── Tier classification — drives tone + framing across all 5 bullets ──
  const rank = divContext?.rank ?? standings?.rank ?? null;
  const gb = divContext?.gb ?? standings?.gb ?? null;
  const teamTier = classifyTeamTier({ divisionRank: rank, gamesBack: gb, projectedWins: wins });

  // ── Driver balance + opponent quality + narrative spike ──
  const drivers = findTeamPlayerDrivers(slug, mlbLeaders);
  const driverProfile = classifyDriverBalance({
    hittingDrivers: drivers.hitting,
    pitchingDrivers: drivers.pitching,
    teamInputs: inputs,
    recentGames,
  });
  const r1 = recentGames?.[0] || null;
  // Opponent-quality lookup falls back to projection when no full standings
  // map is in scope (buildIntelBriefingItems doesn't receive one currently).
  // The projection-based path covers every MLB team via getTeamProjection().
  const opponentQuality = r1 ? classifyOpponentQuality(r1.oppSlug, null, null) : 'unknown';
  const narrativeSpike = injectNarrativeSpike({
    teamTier,
    l10Wins: standings?.l10
      ? (parseInt(standings.l10.split('-')[0]) || 0)
      : l10Wins,
    gamesBack: gb,
    divisionRank: rank,
    streak: standings?.streak || streak,
    projectedWins: wins,
  });

  const bullets = [];
  const recPart = record ? `${record.replace(/-/g, '\u2013')}` : null;

  // ── 1. STANDINGS CONTEXT ─────────────────────────────────────────────
  // Tier-aware: contender = control / separation, in_race = pressure /
  // tight margins, falling_behind = urgency / fading window.
  let standingsText;
  if (recPart && rank != null && division) {
    const rankLabel = `${ordinal(rank)} in the ${division}`;
    const projBit = wins ? `, with the Maximus model projecting ${wins} wins` : '';

    if (teamTier === 'contender' && rank === 1 && (gb == null || gb === 0)) {
      standingsText = `${recPart}, ${rankLabel} \u2014 leading the division${projBit}, with every series creating more separation from the chasers.`;
    } else if (teamTier === 'contender' && gb === 0) {
      standingsText = `${recPart}, ${rankLabel} \u2014 tied for the division lead${projBit}. The next two weeks decide whether ${sn} create separation or get caught.`;
    } else if (teamTier === 'contender') {
      standingsText = `${recPart}, ${rankLabel}, ${gb} ${gb === 1 ? 'game' : 'games'} back${projBit} \u2014 firmly in control of their path, with every series creating real division weight.`;
    } else if (teamTier === 'in_race' && gb != null) {
      standingsText = `${recPart}, ${rankLabel}, ${gb} games back${projBit} \u2014 firmly in the mix, but every loss puts more pressure on the next series as the ${division} tightens.`;
    } else if (teamTier === 'falling_behind' && gb != null) {
      standingsText = `${recPart}, ${rankLabel}, ${gb} games off the pace in the ${division}${projBit} \u2014 the gap is widening, and only a sustained run keeps ${sn} in the playoff conversation.`;
    } else {
      standingsText = `${recPart}, ${rankLabel}${projBit} \u2014 the next month puts real pressure on ${sn} to define this season's identity.`;
    }
  } else if (recPart && division) {
    if (teamTier === 'contender') {
      standingsText = `${recPart} on the season in the ${division}${wins ? `, projecting at ${wins} wins` : ''} \u2014 the model keeps the ${sn} firmly in the contender tier with most of the schedule still ahead.`;
    } else if (teamTier === 'falling_behind') {
      standingsText = `${recPart} on the season in the ${division}${wins ? `, projecting at ${wins} wins` : ''} \u2014 a slow start that puts real pressure on the ${sn} to find a sustained run quickly.`;
    } else {
      standingsText = `${recPart} on the season in the ${division}${wins ? `, projecting at ${wins} wins` : ''} \u2014 every series from here either creates separation or limits the upside as the division tightens.`;
    }
  } else if (recPart) {
    standingsText = `${recPart} on the season${wins ? `, with the Maximus model projecting ${wins} total wins` : ''} \u2014 the ${sn} need to start stacking results before the division leaders create more separation.`;
  } else if (wins && division) {
    standingsText = `The ${sn} project for ${wins} wins in the ${division} \u2014 a clear measuring stick that puts every series on this calendar in proper context.`;
  } else if (division) {
    standingsText = `The ${sn} are working through their early stretch in the ${division} \u2014 the next two weeks put real pressure on this group to define what kind of team they are.`;
  } else {
    standingsText = `The ${sn} are still searching for a defining stretch this season \u2014 the next month puts the spotlight on whether this group has another gear.`;
  }
  validateBullet(standingsText, 1, expectedEntities);
  bullets.push({ text: standingsText, type: 'standings' });

  // ── 2. RECENT FORM (L10 + trend) ────────────────────────────────────
  // Tier-aware: surging vs treading vs struggling, with streak detection
  // when ≥3 and a directional implication tied to the division.
  const espnL10 = standings?.l10 ?? null;
  const effectiveL10 = espnL10 || l10Record;
  const effectiveL10Wins = espnL10
    ? (parseInt(espnL10.split('-')[0]) || 0)
    : l10Wins;
  const effectiveStreak = standings?.streak || streak;
  const streakNum = effectiveStreak ? parseInt(effectiveStreak.replace(/[^\d]/g, '')) || 0 : 0;
  const isWinStreak = effectiveStreak ? effectiveStreak.toUpperCase().startsWith('W') : false;
  const divLabel = division ? `the ${division}` : 'the division';

  let formText;
  if (effectiveL10 && effectiveL10Wins != null) {
    const l10Display = effectiveL10.replace(/-/g, '\u2013');
    if (effectiveL10Wins >= 8) {
      formText = `${l10Display} over their last 10 \u2014 ${sn} are surging, and the run is creating real separation from the rest of ${divLabel}.`;
    } else if (effectiveL10Wins >= 7) {
      formText = `A strong ${l10Display} over the last 10 \u2014 the momentum is building, and the surge is putting ${divLabel} on notice.`;
    } else if (effectiveL10Wins === 6) {
      formText = `Going ${l10Display} over the last 10 \u2014 above .500, but ${sn} need a hotter run to actually create ground on the leaders in ${divLabel}.`;
    } else if (effectiveL10Wins === 5) {
      formText = `At ${l10Display} over the last 10, ${sn} are treading water \u2014 not enough to gain ground as teams above them keep stacking wins.`;
    } else if (effectiveL10Wins === 4) {
      formText = `A ${l10Display} run over the last 10 has ${sn} struggling \u2014 the pace is losing close to a game a week to the field, which puts the division deficit firmly in play.`;
    } else if (effectiveL10Wins === 3) {
      formText = `Just ${l10Display} over the last 10, ${sn} are struggling and losing real ground \u2014 the slide forces a sharper response before the deficit becomes the season's defining story.`;
    } else {
      formText = `A brutal ${l10Display} over the last 10 \u2014 the skid is costing ${sn} standings position and forces an immediate response before more games slip away.`;
    }
    if (streakNum >= 3) {
      formText += isWinStreak
        ? ` Riding a ${effectiveStreak} streak that keeps the energy in the room.`
        : ` The ${effectiveStreak} skid only puts more pressure on the next series.`;
    }
  } else if (recentGames && recentGames.length > 0) {
    const w = recentGames.filter(r => r.won).length;
    const total = recentGames.length;
    formText = `${w} wins in the last ${total} games \u2014 not a full sample yet, but the early pace puts pressure on ${sn} to start stacking results before the leaders pull away.`;
  } else if (effectiveStreak && streakNum >= 2) {
    formText = isWinStreak
      ? `${sn} have won ${streakNum} in a row \u2014 a short surge that creates early-season belief and puts the next series in real focus.`
      : `${sn} have dropped ${streakNum} in a row \u2014 a short slide that puts pressure on the next series before the losses start to compound.`;
  } else {
    formText = `Recent form data is still building for ${sn} \u2014 the next 10 games put real definition on whether this group is closer to a contender or a rebuild.`;
  }

  // ── Narrative spike (1A): one sharp editorial line appended to the
  //    form bullet so it lands where the momentum/streak language already
  //    lives. Skipped when no spike condition is met.
  if (narrativeSpike) {
    formText += ` ${narrativeSpike}`;
  }

  validateBullet(formText, 2, expectedEntities);
  bullets.push({ text: formText, type: 'l10' });

  // ── 3. MOST RECENT GAME ──────────────────────────────────────────────
  // Smart framing: shutout / blowout / one-run / divisional + opponent
  // quality (1D). Wins and losses are NOT framed equally — beating an
  // elite team is a statement, beating a weak team is a needed result;
  // losing to a weak team widens the gap, losing to elite contextualizes.
  let recentText;
  let recentOppSlug = null;
  if (r1 && r1.ourScore != null && r1.oppScore != null) {
    const opp = shortName(r1.opponent) || r1.oppAbbrev || 'their opponent';
    const score = `${r1.ourScore}\u2013${r1.oppScore}`;
    const margin = Math.abs(r1.ourScore - r1.oppScore);
    const isDivisionGame = r1.oppSlug && division &&
      MLB_TEAMS.find(t => t.slug === r1.oppSlug)?.division === division;
    recentOppSlug = r1.oppSlug || null;

    // ── Opponent-quality-aware tail clauses ──
    // Division games still surface standings impact; opponent quality
    // adjusts the editorial weight of the result.
    const oqWinFrame = (() => {
      if (opponentQuality === 'elite' || opponentQuality === 'strong') {
        return isDivisionGame
          ? `a statement win that creates real weight in the ${division} race`
          : `a statement win against a strong opponent that puts the league on notice`;
      }
      if (opponentQuality === 'weak') {
        return isDivisionGame
          ? `a needed divisional result that keeps ${sn} from losing ground in the ${division}`
          : `a needed result the ${sn} are expected to bank \u2014 keeps the standings from slipping further`;
      }
      // average / unknown
      return isDivisionGame
        ? `a divisional win that keeps ${sn} in the ${division} conversation`
        : `a win that keeps the recent stretch pointed in the right direction`;
    })();

    const oqLossFrame = (() => {
      if (opponentQuality === 'elite' || opponentQuality === 'strong') {
        return isDivisionGame
          ? `a tough divisional loss to a strong opponent that puts pressure on the next series`
          : `a loss to a strong opponent \u2014 context matters, but it costs ${sn} ground and puts pressure on the next series`;
      }
      if (opponentQuality === 'weak') {
        return isDivisionGame
          ? `a divisional stumble that quietly widens the gap in the ${division} and puts pressure on the next series`
          : `losing to a weaker club is a stumble that quietly widens the deficit and forces a sharper response`;
      }
      // average / unknown
      return isDivisionGame
        ? `a divisional loss that puts pressure on the next series in the ${division}`
        : `a loss that puts a fresh dent in the margin for error`;
    })();

    // Tier modulates urgency overlay
    const tierUrgency = teamTier === 'falling_behind'
      ? `, and time is becoming the bigger opponent`
      : '';

    const winTail = ` \u2014 ${oqWinFrame}${tierUrgency}.`;
    const lossTail = ` \u2014 ${oqLossFrame}${tierUrgency}.`;

    if (r1.won && r1.oppScore === 0) {
      recentText = `${sn} blanked ${opp} ${score}${isDivisionGame ? ` in a divisional matchup` : ''} \u2014 a shutout that reinforces the pitching staff and keeps ${sn} pointed forward${isDivisionGame ? `, with the standings impact in the ${division} backing it up` : ''}.`;
    } else if (r1.won && margin >= 5) {
      recentText = `${sn} rolled ${opp} ${score}${isDivisionGame ? ` in a key ${division} matchup` : ''} \u2014 a dominant offensive showing${isDivisionGame ? ` that creates real standings weight in the ${division}` : ' that puts the rest of the league on notice'}.`;
    } else if (r1.won && margin <= 1) {
      recentText = `${sn} edged ${opp} ${score}${isDivisionGame ? ` in a tight ${division} battle` : ''}, executing in high-leverage spots${winTail}`;
    } else if (r1.won) {
      recentText = `${sn} took down ${opp} ${score}${isDivisionGame ? ` in a divisional contest` : ''}${winTail}`;
    } else if (r1.oppScore !== 0 && r1.ourScore === 0) {
      recentText = `${sn} were shut out by ${opp} ${score}${isDivisionGame ? ` in a divisional spot` : ''} \u2014 zero runs is the kind of game that lingers and forces a quick offensive response${isDivisionGame ? `, with real implications in the ${division}` : ''}.`;
    } else if (!r1.won && margin >= 5) {
      recentText = `${sn} were blown out by ${opp} ${score}${isDivisionGame ? ` in a key ${division} matchup` : ''} \u2014 a lopsided loss that puts real questions on the table${isDivisionGame ? ` and limits standings progress in the ${division}` : ''}.`;
    } else if (!r1.won && margin <= 1) {
      recentText = `${sn} fell to ${opp} ${score} in a one-run game${isDivisionGame ? ` against a ${division} rival` : ''}${lossTail}`;
    } else {
      recentText = `${sn} dropped a ${score} game to ${opp}${isDivisionGame ? ` in a divisional spot` : ''}${lossTail}`;
    }
  } else if (recentGames && recentGames.length > 0) {
    recentText = `${sn} have ${recentGames.filter(r => r.won).length} wins in their last ${recentGames.length} games \u2014 not a defining stretch yet, but the next series puts real definition on where this team stands.`;
  } else {
    recentText = `${sn} are between meaningful results right now \u2014 the next series puts the first real pressure on this group to define their tier.`;
  }
  validateBullet(recentText, 3, expectedEntities, {
    requireRecentGameContext: !!(r1 && r1.ourScore != null && r1.oppScore != null),
  });
  bullets.push({ text: recentText, type: 'recent', oppSlug: recentOppSlug });

  // ── 4. CORE TEAM DRIVER (asymmetric, diagnostic — 1B) ────────────────
  // Driver profile (offense_driven / pitching_driven / balanced / thin)
  // selects between four diagnostic templates that explicitly identify
  // who is carrying production and what's NOT supporting them.
  const hit = drivers.hitting;
  const pit = drivers.pitching;

  let driverText;
  const hasPlayerData = hit.length > 0 || pit.length > 0;

  if (hit.length > 0 && pit.length > 0) {
    const h = hit[0];
    const p = pit[0];
    const hLine = `${h.last}'s ${h.value} ${h.cat}`;
    const pLine = `${p.last}'s ${p.value} ${p.cat}`;

    if (driverProfile === 'balanced') {
      driverText = `${hLine} and ${pLine} are giving ${sn} balance \u2014 enough on both sides to keep the team in control even when one side has an off night.`;
    } else if (driverProfile === 'offense_driven') {
      driverText = `${hLine} are carrying the offense right now \u2014 without that production, ${sn} struggle to create run support, which puts every rotation start under real pressure.`;
    } else if (driverProfile === 'pitching_driven') {
      driverText = `${pLine} have stabilized the rotation, keeping ${sn} afloat \u2014 the offense still needs to put together more consistent run support to lift the team's ceiling.`;
    } else {
      // thin
      driverText = `Much of the ${sn} production is concentrated in too few places \u2014 ${hLine} and ${pLine} matter because there's little margin behind them, which forces dependence on a small healthy core.`;
    }
  } else if (hit.length >= 2) {
    const [a, b] = hit;
    const eliteTag = (a.isLeagueBest || b.isLeagueBest)
      ? `both rank among MLB's best at their spots and keep opposing pitching honest every night`
      : `both lead the club, and the offense needs them to keep producing or the run support dries up`;
    driverText = `${a.last}'s ${a.value} ${a.cat} and ${b.last}'s ${b.value} ${b.cat} are powering the ${sn} offense \u2014 ${eliteTag}.`;
  } else if (hit.length === 1) {
    const h = hit[0];
    if (driverProfile === 'thin' || h.isLeagueBest) {
      driverText = `${h.last} is carrying nearly all of the ${sn} offense, ranking among the team's leaders with ${h.value} ${h.cat} \u2014 when his bat goes cold, run production drops sharply, which makes any pitching slip-up costly.`;
    } else {
      driverText = `${h.last} leads the ${sn} with ${h.value} ${h.cat}, powering most of the run production \u2014 the rest of the lineup needs to create more support before the offense becomes a real strength.`;
    }
  } else if (pit.length >= 2) {
    const [a, b] = pit;
    driverText = `${a.last}'s ${a.value} ${a.cat} and ${b.last}'s ${b.value} ${b.cat} are anchoring the ${sn} staff \u2014 pitching keeps this team competitive while the offense still searches for consistent run support.`;
  } else if (pit.length === 1) {
    const p = pit[0];
    if (driverProfile === 'thin' || p.isLeagueBest) {
      driverText = `${p.last}'s ${p.value} ${p.cat} are the rotation's only real anchor \u2014 when his start lines up, ${sn} have a chance; otherwise the staff struggles to keep games close, which costs them winnable contests.`;
    } else {
      driverText = `${p.last} anchors the ${sn} staff with ${p.value} ${p.cat} \u2014 a top arm that keeps the rotation tier-defined and forces the rest of the staff to match the standard.`;
    }
  } else {
    // No player-leader data — translate the model's strongestDriver
    const driverPhrase = translateDriverToPlainEnglish(tk.strongestDriver, sn);
    if (driverPhrase) {
      driverText = driverPhrase;
    } else if (inputs && inputs.frontlineRotation >= 7) {
      driverText = `The ${sn} rotation has been the team's clearest strength \u2014 quality starts keep ${sn} in games every night, even on days the offense goes quiet.`;
    } else if (inputs && inputs.topOfLineup >= 7) {
      driverText = `The ${sn} top of the order has set the tone all season \u2014 table-setters reaching base consistently puts the heart of the lineup in run-scoring spots night after night.`;
    } else if (inputs && inputs.bullpenQuality >= 7) {
      driverText = `The ${sn} bullpen has been a true difference-maker \u2014 high-leverage outs late keep close games tilted in their favor more often than not.`;
    } else if (wins != null) {
      driverText = `The ${sn} are projected for ${wins} wins by the Maximus model \u2014 a ceiling that depends on the pitching staff continuing to keep games within reach for the offense.`;
    } else {
      driverText = `The ${sn} are still figuring out which unit \u2014 rotation, bullpen, or lineup \u2014 puts this team over the top; the next month should force the identity into focus.`;
    }
  }
  validateBullet(driverText, 4, expectedEntities, {
    requireDriverSpecificity: hasPlayerData,
  });
  bullets.push({ text: driverText, type: 'driver' });

  // ── 5. RISK / LIMITATION (consequence-oriented — 1C) ─────────────────
  // Every risk bullet must explicitly answer:
  //   what is the weakness · what breaks if it continues · what happens
  //   in standings/game outcomes
  // Soft phrasings like "limits the ceiling" alone are not enough — the
  // requireRiskConsequence validator forces a turn/make/force/widen/cost/
  // expose/push verb in every risk bullet.
  const drag = (tk.biggestDrag && tk.biggestDrag !== 'None significant') ? tk.biggestDrag : null;
  const translatedRisk = translateDragToPlainEnglish(drag, sn);

  let riskText;
  if (translatedRisk) {
    riskText = `The risk: ${translatedRisk}`;
  } else if (inputs && inputs.bullpenVolatility >= 5) {
    riskText = `The risk: ${sn} bullpen instability keeps putting late innings at risk \u2014 the misses turn winnable games into losses and expose the team in the kinds of close contests contenders usually win.`;
  } else if (inputs && inputs.frontlineRotation <= 4) {
    riskText = `The risk: beyond the top of the rotation, ${sn} innings quality falls off quickly \u2014 the gap forces the bullpen into too many high-leverage spots and costs them in series losses over longer stretches.`;
  } else if (inputs && inputs.topOfLineup <= 4) {
    riskText = `The risk: thin top-of-order on-base forces the heart of the ${sn} lineup into low-leverage at-bats, which limits run support and costs the pitching staff real margin every night.`;
  } else if (hit.length === 0 && pit.length > 0) {
    riskText = `The risk: ${sn} have leaned on pitching to win, but until the offense produces more runs, the inconsistency turns winnable games into losses and limits how high this team can realistically finish.`;
  } else if (pit.length === 0 && hit.length > 0) {
    riskText = `The risk: the ${sn} offense is doing the heavy lifting, but without more reliable starting pitching the rotation keeps putting the team in early-game holes that cost wins.`;
  } else if (wins != null && wins <= 78) {
    riskText = `The risk: at ${wins} projected wins, the ${sn} margin for error is razor-thin \u2014 every losing series costs them ground and limits the realistic path back into contention.`;
  } else if (wins != null && wins >= 92) {
    riskText = `The risk: the bar is set high at ${wins} projected wins \u2014 if ${sn} stop hitting that pace, the perception turns quickly from contender to disappointment, which puts the season's ceiling in question.`;
  } else {
    riskText = `The risk: ${sn} performance has been streaky enough that one cold week puts the entire division narrative in flux \u2014 sustained, daily execution is the only thing that keeps the season on track and stops a cold stretch from costing real ground.`;
  }

  // Falling-behind overlay: time-pressure clause. If the base risk doesn't
  // already mention time/games-back urgency, append a short clause.
  if (teamTier === 'falling_behind' && !/games?\s*back|time|gap|deficit|insurmountable/i.test(riskText)) {
    riskText += ` Time is becoming the biggest opponent \u2014 without a strong run soon, the deficit limits any realistic comeback and forces ${sn} into must-win mode for every series.`;
  }

  validateBullet(riskText, 5, expectedEntities, { requireRiskConsequence: true });
  bullets.push({ text: riskText, type: 'risk' });

  // Additive metadata for downstream consumers (slide, page, caption,
  // emails). All fields are optional — existing consumers keep working.
  return { items: bullets, teamTier, narrativeSpike, driverProfile, opponentQuality };
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

  const { items, teamTier, narrativeSpike, driverProfile, opponentQuality } = buildIntelBriefingItems({
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

  return {
    headline,
    subtext: enrichedSubtext,
    items,
    teamTier,
    narrativeSpike,
    driverProfile,
    opponentQuality,
    projection,
    whyItMatters,
    teamLeaders,
  };
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
