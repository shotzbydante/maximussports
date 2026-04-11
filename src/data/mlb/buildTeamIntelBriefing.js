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
import { buildTeamWhyItMatters } from './whyItMatters';

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

// ─── Structured Briefing Builder ──────────────────────────────────────────

/**
 * Build 5 structured briefing items that power both the slide and team page.
 *
 * Each item is an object: { text, oppSlug?, type }
 *   - text: the briefing line (mini-narrative, not a data fragment)
 *   - oppSlug: opponent team slug for inline logo (optional)
 *   - type: 'division' | 'l10' | 'recent' | 'news' | 'next' | 'model' | 'profile'
 *
 * Priority: division/standings → L10 → recent games → news/profile → next game
 * Each bullet should feel like a mini-story, not a data label.
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
  record,
  standings,
  divContext,
  mlbLeaders,
}) {
  const items = [];
  const wins = projection?.projectedWins;
  const tk = projection?.takeaways || {};
  const inputs = slug ? TEAM_INPUTS[slug] : null;
  const { streak, l10Record, l10Wins, recentGames } = teamContext || {};
  const sn = shortName(teamName);

  // ── 1. Division / standings context — explicit rank + GB ──
  const rank = divContext?.rank ?? standings?.rank ?? null;
  const gb = divContext?.gb ?? standings?.gb ?? null;

  if (division && rank != null) {
    // We have real standings data — use explicit rank + GB
    const rankLabel = `${ordinal(rank)} in the ${division}`;
    const recPrefix = record ? `${record}, ` : '';

    if (rank === 1) {
      items.push({ text: `${recPrefix}${rankLabel} — leading the division. ${wins ? `Maximus model projects ${wins} wins.` : `The ${sn} are the team to beat.`}`, type: 'division' });
    } else if (gb != null && gb <= 3) {
      items.push({ text: `${recPrefix}${rankLabel}, ${gb === 0 ? 'tied for the lead' : `${gb} ${gb === 1 ? 'game' : 'games'} back`}. Within striking distance as every series carries weight.`, type: 'division' });
    } else if (gb != null && gb <= 8) {
      items.push({ text: `${recPrefix}${rankLabel}, sitting ${gb} games back. Still in the race, but the margin for error is shrinking fast.`, type: 'division' });
    } else if (gb != null && gb > 8) {
      items.push({ text: `${recPrefix}${rankLabel}, ${gb} games off the pace. The gap is real — this stretch will define whether they stay in it or start looking ahead.`, type: 'division' });
    } else {
      items.push({ text: `${recPrefix}${rankLabel}. ${wins ? `Maximus model projects ${wins} wins` : 'Competing'} — the next few weeks will shape the outlook.`, type: 'division' });
    }
  } else if (division) {
    // No standings data — fall back to model-based framing
    const outlookLow = (divOutlook || '').toLowerCase();
    const recPrefix = record ? `${record} in the ${division}` : `Competing in the ${division}`;
    if (outlookLow.includes('lead') || (wins && wins >= 94)) {
      items.push({ text: `${recPrefix} — model projects ${wins} wins, the pace-setter in the division.`, type: 'division' });
    } else if (outlookLow.includes('contend') || (wins && wins >= 86)) {
      items.push({ text: `${recPrefix}. Projected for ${wins} wins — right in the race, where every series carries weight.`, type: 'division' });
    } else if (wins && wins >= 78) {
      items.push({ text: `${recPrefix}. Projected at ${wins} wins — on the fringe, but the window is narrowing.`, type: 'division' });
    } else if (wins && wins < 72) {
      items.push({ text: `${recPrefix}. Rebuilding at ${wins} projected wins — the focus is development, not October.`, type: 'division' });
    } else {
      items.push({ text: `${recPrefix}. ${wins ? `${wins} projected wins` : 'Middle of the pack'} — searching for an identity.`, type: 'division' });
    }
  } else if (record) {
    items.push({ text: `${record} on the season. ${wins ? `Maximus model projects ${wins} wins.` : ''}`, type: 'division' });
  }

  // ── 2. L10 / recent form — prefer ESPN standings L10 (always full 10 games) ──
  const espnL10 = standings?.l10 ?? null;
  const effectiveL10 = espnL10 || l10Record;
  const effectiveL10Wins = espnL10
    ? parseInt(espnL10.split('-')[0]) || 0
    : l10Wins;
  const effectiveStreak = standings?.streak || streak;

  if (effectiveL10 && effectiveL10Wins != null) {
    let narrative;
    if (effectiveL10Wins >= 8) narrative = `L10: ${effectiveL10}. ${sn} are surging — this is the hottest stretch of their season and the standings are shifting.`;
    else if (effectiveL10Wins >= 7) narrative = `L10: ${effectiveL10}. Strong recent form with real momentum building. This is when good teams separate.`;
    else if (effectiveL10Wins === 6) narrative = `L10: ${effectiveL10}. Slightly above .500 over the last 10 — solid but not pulling away.`;
    else if (effectiveL10Wins === 5) narrative = `L10: ${effectiveL10}. Right at .500 over the last 10 — treading water without clear separation.`;
    else if (effectiveL10Wins === 4) narrative = `L10: ${effectiveL10}. Recent results have been inconsistent, and the margin for error is shrinking.`;
    else if (effectiveL10Wins === 3) narrative = `L10: ${effectiveL10}. The ${sn} are struggling to find traction — something needs to click soon.`;
    else narrative = `L10: ${effectiveL10}. A brutal stretch that's already costing them ground. The skid demands answers.`;

    const streakNote = effectiveStreak ? ` Currently on a ${effectiveStreak} streak.` : '';
    items.push({
      text: narrative + streakNote,
      type: 'l10',
    });
  }

  // ── 3. Last 1–2 games — tell the story of recent results ──
  const recent2 = (recentGames || []).slice(0, 2);
  if (recent2.length >= 2) {
    const r1 = recent2[0];
    const r2 = recent2[1];
    const opp1 = shortName(r1.opponent) || r1.oppAbbrev;
    const opp2 = shortName(r2.opponent) || r2.oppAbbrev;
    const sameOpp = r1.oppAbbrev === r2.oppAbbrev;
    const w = recent2.filter(r => r.won).length;

    let text;
    if (sameOpp && w === 2) {
      text = `Took both from ${opp1} — ${r2.won ? 'W' : 'L'} ${r2.ourScore}\u2013${r2.oppScore}, then ${r1.won ? 'W' : 'L'} ${r1.ourScore}\u2013${r1.oppScore}. A statement series.`;
    } else if (sameOpp && w === 0) {
      text = `Dropped both to ${opp1} — ${r2.won ? 'W' : 'L'} ${r2.ourScore}\u2013${r2.oppScore}, then ${r1.won ? 'W' : 'L'} ${r1.ourScore}\u2013${r1.oppScore}. A rough stretch that needs a response.`;
    } else if (sameOpp) {
      text = `Split with ${opp1} — ${r2.won ? 'W' : 'L'} ${r2.ourScore}\u2013${r2.oppScore}, then ${r1.won ? 'W' : 'L'} ${r1.ourScore}\u2013${r1.oppScore}. Competitive but no separation.`;
    } else if (w === 2) {
      text = `Won their last two: ${r1.ourScore}\u2013${r1.oppScore} over ${opp1} and ${r2.ourScore}\u2013${r2.oppScore} over ${opp2}. Offense and pitching both showing up.`;
    } else if (w === 0) {
      text = `Dropped their last two: ${r1.ourScore}\u2013${r1.oppScore} to ${opp1} and ${r2.ourScore}\u2013${r2.oppScore} to ${opp2}. The slide needs to stop here.`;
    } else {
      const winGame = recent2.find(r => r.won);
      const lossGame = recent2.find(r => !r.won);
      const wOpp = shortName(winGame.opponent) || winGame.oppAbbrev;
      const lOpp = shortName(lossGame.opponent) || lossGame.oppAbbrev;
      text = `Split the last two — beat ${wOpp} ${winGame.ourScore}\u2013${winGame.oppScore}, fell to ${lOpp} ${lossGame.ourScore}\u2013${lossGame.oppScore}. Inconsistency remains the story.`;
    }

    items.push({
      text,
      type: 'recent',
      oppSlug: r1.oppSlug || null,
    });
  } else if (recent2.length === 1) {
    const r = recent2[0];
    const opp = shortName(r.opponent) || r.oppAbbrev;
    const verb = r.won ? 'took down' : 'fell to';
    items.push({
      text: `Last out: ${verb} ${opp} ${r.ourScore}\u2013${r.oppScore}. ${r.won ? 'A result that keeps the momentum alive.' : 'Now facing real pressure to respond.'}`,
      type: 'recent',
      oppSlug: r.oppSlug || null,
    });
  }

  // ── 4. Team news / pitching / lineup / player storyline ──
  const cleanedNews = (newsHeadlines || [])
    .map(n => typeof n === 'string' ? n : cleanHeadline(n.headline || n.title || ''))
    .filter(Boolean);

  if (cleanedNews.length > 0) {
    items.push({ text: cleanedNews[0], type: 'news' });
  } else if (inputs) {
    // Fall back to editorial rotation/lineup profile narrative
    if (inputs.frontlineRotation >= 8) {
      items.push({ text: `Pitching continues to anchor this roster — the rotation is rated among the best in baseball and gives them a chance every night.`, type: 'profile' });
    } else if (inputs.topOfLineup >= 8) {
      items.push({ text: `The lineup is the engine here. Top-of-the-order production has been elite, giving the pitching staff real margin for error.`, type: 'profile' });
    } else if (inputs.bullpenQuality <= 4 || inputs.bullpenVolatility >= 5) {
      items.push({ text: `The bullpen remains a question mark — late-inning volatility continues to cost them in close games.`, type: 'profile' });
    } else if (inputs.frontlineRotation <= 4) {
      items.push({ text: `Rotation depth is a real concern. Without top-end arms, the margin for error is paper-thin.`, type: 'profile' });
    } else if (tk.strongestDriver) {
      const driver = tk.strongestDriver;
      const drag = tk.biggestDrag && tk.biggestDrag !== 'None significant' ? tk.biggestDrag : null;
      items.push({ text: `${driver} is carrying the load.${drag ? ` The risk: ${drag.toLowerCase()} could limit the ceiling.` : ''}`, type: 'profile' });
    }
  } else if (tk.strongestDriver) {
    items.push({ text: `${tk.strongestDriver} drives the outlook. The model's read hinges on that strength holding up over 162.`, type: 'profile' });
  }

  // ── 5. Upcoming game — why it matters ──
  const nOpp = nextGame?.opponent || nextLine?.nextEvent?.opponent;
  const nSpread = nextLine?.consensus?.spread;
  const nMl = nextLine?.consensus?.moneyline;
  const nTime = nextGame?.date || nextLine?.nextEvent?.commenceTime;
  const nOppSlug = nextGame?.oppSlug || slugFromName(nOpp);

  if (nOpp) {
    const oppShort = shortName(nOpp) || nOpp;
    let text = `Next up: ${oppShort}`;
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
    // Add context about why it matters
    const isDivision = nOppSlug && division && MLB_TEAMS.find(t => t.slug === nOppSlug)?.division === division;
    if (isDivision) {
      text += '. A divisional matchup with standings implications.';
    } else {
      text += '.';
    }
    items.push({ text, type: 'next', oppSlug: nOppSlug || null });
  }

  // ── Pad with additional context if under 5 bullets ──
  if (items.length < 5 && cleanedNews.length > 1) {
    items.push({ text: cleanedNews[1], type: 'news' });
  }
  // model-vs-market delta removed — low priority, wastes vertical space
  if (items.length < 5 && tk.depthProfile) {
    const depth = tk.depthProfile.toLowerCase();
    let depthNarrative;
    if (depth.includes('deep') || depth.includes('strong')) {
      depthNarrative = `Roster depth is a strength — this team can absorb injuries and maintain performance across a long season.`;
    } else if (depth.includes('thin') || depth.includes('shallow')) {
      depthNarrative = `Depth is a real vulnerability here. One or two injuries to key contributors could change the trajectory.`;
    } else {
      depthNarrative = `Depth is mixed — enough to stay competitive, but a key injury could expose the gaps quickly.`;
    }
    items.push({ text: depthNarrative, type: 'profile' });
  }
  if (items.length < 5 && cleanedNews.length > 2) {
    items.push({ text: cleanedNews[2], type: 'news' });
  }

  // ── Bullet 6: Team-specific season leaders ──
  const teamAbbrev = MLB_TEAMS.find(t => t.slug === slug)?.abbrev || '';
  if (teamAbbrev && mlbLeaders?.categories) {
    const cats = mlbLeaders.categories;
    const mentions = [];

    // Find this team's players in each leader category
    for (const [catKey, catLabel] of [['homeRuns', 'home runs'], ['RBIs', 'RBIs'], ['hits', 'hits'], ['wins', 'wins'], ['saves', 'saves']]) {
      const leaders = cats[catKey]?.leaders;
      if (!leaders) continue;
      for (let i = 0; i < leaders.length; i++) {
        if (leaders[i].teamAbbrev === teamAbbrev) {
          const lastName = (leaders[i].name || '').split(' ').pop();
          mentions.push({
            name: lastName,
            cat: catLabel,
            rank: i + 1,
            value: leaders[i].display || String(leaders[i].value || 0),
            isPitching: catKey === 'wins' || catKey === 'saves',
          });
        }
      }
    }

    if (mentions.length >= 2) {
      // Two+ mentions — combine the two best
      const hitting = mentions.find(m => !m.isPitching);
      const pitching = mentions.find(m => m.isPitching);
      if (hitting && pitching) {
        items.push({ text: `${hitting.name} ranks among MLB leaders in ${hitting.cat} (${hitting.value}), while ${pitching.name} anchors the pitching side with ${pitching.value} ${pitching.cat}.`, type: 'leaders' });
      } else {
        const [a, b] = mentions;
        items.push({ text: `${a.name} (${a.value} ${a.cat}) and ${b.name} (${b.value} ${b.cat}) both rank among MLB's season leaders.`, type: 'leaders' });
      }
    } else if (mentions.length === 1) {
      const m = mentions[0];
      const ordinal = m.rank === 1 ? 'leads MLB' : `ranks ${m.rank === 2 ? '2nd' : '3rd'} in MLB`;
      items.push({ text: `${m.name} ${ordinal} in ${m.cat} with ${m.value}, setting the pace for the club.`, type: 'leaders' });
    }
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
 * Extract the best player per stat category for a given team from league leaders.
 * @param {string} slug - team slug
 * @param {Object} mlbLeaders - from /api/mlb/leaders: { categories: { ... } }
 * @returns {Array<{ stat: string, label: string, player: string, value: string }>}
 */
function extractTeamLeaders(slug, mlbLeaders) {
  if (!slug || !mlbLeaders?.categories) return [];
  const teamAbbrev = MLB_TEAMS.find(t => t.slug === slug)?.abbrev || '';
  if (!teamAbbrev) return [];

  const cats = mlbLeaders.categories;
  const mapping = [
    { key: 'homeRuns', stat: 'HR', label: 'Home Runs' },
    { key: 'RBIs', stat: 'RBI', label: 'RBIs' },
    { key: 'hits', stat: 'H', label: 'Hits' },
    { key: 'wins', stat: 'W', label: 'Wins' },
    { key: 'saves', stat: 'SV', label: 'Saves' },
  ];

  const results = [];
  for (const { key, stat, label } of mapping) {
    const leaders = cats[key]?.leaders;
    if (!leaders) continue;
    const match = leaders.find(l => l.teamAbbrev === teamAbbrev);
    if (match) {
      results.push({
        stat,
        label,
        player: match.name || '—',
        value: match.display || String(match.value || 0),
      });
    }
  }
  return results;
}
