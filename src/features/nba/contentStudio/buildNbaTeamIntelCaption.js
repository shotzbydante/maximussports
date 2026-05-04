/**
 * buildNbaTeamIntelCaption — editorial Team Intel caption builder.
 *
 * Reads the SAME canonical payload the Team Intel slide reads — no
 * separate sort, no separate filter, no fabricated stat lines. Produces
 * a punchy, ESPN-style caption with these sections:
 *
 *   A. Hook                 — 1-line headline anchored on the team's
 *                             current playoff moment (won, lost, leads,
 *                             trails, survived Game 7, etc.)
 *   B. What happened        — last game + series result
 *   C. Why it matters       — next round / next opponent context
 *   D. Model outlook        — derived from resolveCanonicalNbaPicks
 *                             (same source as Slide 1/2/caption picks).
 *                             Falls back to "no posted model pick yet."
 *   E. Key driver           — series-leader phrasing (playoff leader),
 *                             never fabricated single-game stat lines.
 *   F. Big picture          — title odds + tier framing.
 *   G. CTA                  — "More playoff intel → maximussports.ai"
 *   H. Disclaimer           — gambling line.
 *   I. Hashtags             — team-specific + playoff-specific, capped 8.
 *
 * Data integrity rules:
 *   - Every fact must come from the payload.
 *   - No fabricated stats. Use "playoff leader" framing for season
 *     averages instead of inventing tonight's box-score line.
 *   - Missing model board / schedule / leader → graceful fallback copy.
 */

import { resolveCanonicalNbaPicks } from './resolveSlidePicks.js';
import { LEADER_CATEGORIES } from '../../../data/nba/seasonLeaders.js';
import { NBA_TEAMS } from '../../../sports/nba/teams.js';

function teamMeta(slug) {
  return NBA_TEAMS.find(t => t.slug === slug) || null;
}

function fmtAmerican(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  return v > 0 ? `+${v}` : `${v}`;
}

function classifyContender(prob) {
  if (prob == null) return 'long shot';
  if (prob >= 0.15) return 'title favorite';
  if (prob >= 0.06) return 'contender';
  if (prob >= 0.02) return 'upside team';
  return 'long shot';
}

function oddsToProb(american) {
  if (american == null || !Number.isFinite(Number(american))) return null;
  const v = Number(american);
  return v < 0 ? Math.abs(v) / (Math.abs(v) + 100) : 100 / (v + 100);
}

function nicknameFor(team) {
  if (!team) return 'Team';
  if (/Trail Blazers$/i.test(team.name)) return 'Trail Blazers';
  return team.name?.split(' ').slice(-1)[0] || team.abbrev || 'Team';
}

function roundShortForConf(round, conference) {
  if (round === 2) return conference === 'Eastern' ? 'East Semifinals' : 'West Semifinals';
  if (round === 3) return conference === 'Eastern' ? 'East Finals' : 'West Finals';
  if (round === 4) return 'NBA Finals';
  return 'first round';
}

function findTeamSeries(payload, slug) {
  const pool = payload?.nbaPlayoffContext?.allSeries
    || payload?.nbaPlayoffContext?.series
    || [];
  const here = pool.filter(s => s?.topTeam?.slug === slug || s?.bottomTeam?.slug === slug);
  // Prefer the highest-round active series; otherwise the highest-
  // round series the team has played at all.
  const sorted = here.slice().sort((a, b) => (b.round || 0) - (a.round || 0));
  const active = sorted.find(s => !s.isComplete);
  const completed = sorted.find(s => s.isComplete);
  return { active, completed, primary: active || completed || sorted[0] || null };
}

function findRecentFinal(payload, slug) {
  const all = [
    ...(payload?.nbaLiveGames || []),
    ...(payload?.nbaWindowGames || []),
  ];
  const seen = new Set();
  const deduped = [];
  for (const g of all) {
    if (!g?.gameId || seen.has(g.gameId)) continue;
    seen.add(g.gameId);
    deduped.push(g);
  }
  const finals = deduped
    .filter(g => (g.gameState?.isFinal || g.status === 'final')
      && (g.teams?.away?.slug === slug || g.teams?.home?.slug === slug))
    .sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0));
  return finals[0] || null;
}

function findTeamLeader(payload, abbrev) {
  const cats = payload?.nbaLeaders?.categories || {};
  for (const meta of LEADER_CATEGORIES) {
    const list = cats[meta.key]?.leaders || [];
    const found = list.find(l => l.teamAbbrev === abbrev);
    if (found) return { meta, leader: found };
  }
  return null;
}

function resolveTeamModelOutlook(slug, payload) {
  if (!slug) return null;
  const picks = resolveCanonicalNbaPicks(payload || {});
  const teamPicks = picks.filter(p => {
    const a = p?.matchup?.awayTeam?.slug;
    const h = p?.matchup?.homeTeam?.slug;
    return a === slug || h === slug;
  });
  if (teamPicks.length === 0) return null;
  const sample = teamPicks[0];
  const isAway = sample?.matchup?.awayTeam?.slug === slug;
  const opp = isAway ? sample?.matchup?.homeTeam : sample?.matchup?.awayTeam;
  const teamSide = isAway ? 'away' : 'home';
  function direction(p) {
    if (!p) return null;
    return p?.pick?.side === teamSide ? 'team' : 'opp';
  }
  const ml = teamPicks.find(p => p._cat === 'Moneyline');
  const ats = teamPicks.find(p => p._cat === 'Spread');
  const totals = teamPicks.find(p => p._cat === 'Total');
  return {
    opp,
    ml: ml ? { dir: direction(ml), label: ml?.pick?.label || '—' } : null,
    ats: ats ? { dir: direction(ats), label: ats?.pick?.label || '—' } : null,
    totals: totals ? { label: totals?.pick?.label || '—' } : null,
  };
}

// ── Section builders ──────────────────────────────────────────────────────

function buildHook(team, mySeries) {
  const nick = nicknameFor(team);
  const short = team.abbrev || nick;
  if (!mySeries) {
    return `🏀 ${team.name} — Playoff Intel.`;
  }
  const isTop = mySeries.topTeam?.slug === team.slug;
  const myWins = isTop ? (mySeries.seriesScore?.top ?? 0) : (mySeries.seriesScore?.bottom ?? 0);
  const oppWins = isTop ? (mySeries.seriesScore?.bottom ?? 0) : (mySeries.seriesScore?.top ?? 0);
  const oppNick = nicknameFor(isTop ? mySeries.bottomTeam : mySeries.topTeam);
  const states = mySeries.seriesStates || {};
  if (mySeries.isComplete) {
    const won = states.winnerSlug === team.slug;
    if (won) {
      // Path-verified Game 7 survival narrative — fires only when
      // clinchedInGame7 AND the winner was NOT down 3-1.
      if (states.clinchedInGame7 && !states.winnerWasDown31) {
        return `😤 ${nick} survive Game 7 and move on.`;
      }
      if (states.winnerWasDown31) {
        return `🚨 ${nick} complete the 3-1 comeback to stun ${oppNick}.`;
      }
      if (oppWins === 0) {
        return `💥 ${nick} sweep ${oppNick} ${myWins}-${oppWins} and advance.`;
      }
      return `🔥 ${nick} close out ${oppNick} ${myWins}-${oppWins} and advance.`;
    }
    return `🏁 ${nick} fall to ${oppNick} ${oppWins}-${myWins} — playoff run ends here.`;
  }
  if (myWins > oppWins) return `🔥 ${nick} lead ${oppNick} ${myWins}-${oppWins}.`;
  if (myWins < oppWins) return `⚠️ ${nick} trail ${oppNick} ${oppWins}-${myWins} — series shift needed.`;
  if (myWins === oppWins && myWins > 0) return `⚖️ ${nick} and ${oppNick} are tied ${myWins}-${oppWins}.`;
  return `🏀 ${nick} open the ${roundShortForConf(mySeries.round || 1, team.conference)} vs ${oppNick}.`;
}

function buildWhatHappened(team, mySeries, recentFinal) {
  if (!mySeries && !recentFinal) return null;
  const nick = nicknameFor(team);
  const isTop = mySeries?.topTeam?.slug === team.slug;
  const oppNick = mySeries
    ? nicknameFor(isTop ? mySeries.bottomTeam : mySeries.topTeam)
    : null;
  // Last-game clause — verified score from box.
  let lastGameClause = '';
  if (recentFinal) {
    const aSlug = recentFinal.teams?.away?.slug;
    const hSlug = recentFinal.teams?.home?.slug;
    const aScore = Number(recentFinal.teams?.away?.score ?? 0);
    const hScore = Number(recentFinal.teams?.home?.score ?? 0);
    const isAway = team.slug === aSlug;
    const oppSlug = isAway ? hSlug : aSlug;
    const oppMeta = teamMeta(oppSlug);
    const oppName = nicknameFor(oppMeta) || (oppSlug?.toUpperCase() || 'opp');
    const myScore = isAway ? aScore : hScore;
    const oppScore = isAway ? hScore : aScore;
    const won = myScore > oppScore;
    lastGameClause = won
      ? `${nick} beat ${oppName} ${myScore}-${oppScore}`
      : `${nick} fell to ${oppName} ${oppScore}-${myScore}`;
  }
  // Series clause — complete vs in-progress.
  if (mySeries?.isComplete) {
    const won = mySeries.seriesStates?.winnerSlug === team.slug;
    const myWins = isTop ? mySeries.seriesScore?.top : mySeries.seriesScore?.bottom;
    const oppWins = isTop ? mySeries.seriesScore?.bottom : mySeries.seriesScore?.top;
    if (won) {
      const next = (mySeries.round || 1) === 4
        ? 'the championship'
        : roundShortForConf((mySeries.round || 1) + 1, team.conference);
      const open = lastGameClause
        ? `${lastGameClause} to close out the series ${myWins}-${oppWins}`
        : `${nick} closed out the series ${myWins}-${oppWins} over ${oppNick}`;
      return `${open} and punch a ticket to the ${next}.`;
    }
    return lastGameClause
      ? `${lastGameClause} as the series ends ${oppWins}-${myWins}.`
      : `${nick} fell to ${oppNick} ${oppWins}-${myWins} as the series ends here.`;
  }
  if (mySeries) {
    const myWins = isTop ? mySeries.seriesScore?.top : mySeries.seriesScore?.bottom;
    const oppWins = isTop ? mySeries.seriesScore?.bottom : mySeries.seriesScore?.top;
    let standing;
    if (myWins > oppWins) standing = `${nick} lead the series ${myWins}-${oppWins}`;
    else if (myWins < oppWins) standing = `${nick} trail ${myWins}-${oppWins}`;
    else if (myWins > 0) standing = `${nick} are tied ${myWins}-${oppWins}`;
    else standing = `${roundShortForConf(mySeries.round || 1, team.conference)} just getting started`;
    if (lastGameClause) return `${lastGameClause}; ${standing}.`;
    return `${standing}.`;
  }
  return lastGameClause ? `${lastGameClause}.` : null;
}

function buildWhyItMatters(team, mySeries) {
  if (!mySeries) return null;
  const nick = nicknameFor(team);
  if (mySeries.isComplete) {
    const won = mySeries.seriesStates?.winnerSlug === team.slug;
    if (!won) return null;
    if ((mySeries.round || 1) === 4) {
      return `Now ${nick} hoist the trophy and the season ends on top.`;
    }
    const nextRound = roundShortForConf((mySeries.round || 1) + 1, team.conference);
    return `Now the focus shifts to the ${nextRound} — every series win compresses ${nick}' title-path market.`;
  }
  if (mySeries.isElimination && mySeries.eliminationFor) {
    const isTop = mySeries.topTeam?.slug === team.slug;
    const facingElim = (isTop && mySeries.eliminationFor === 'top')
                   || (!isTop && mySeries.eliminationFor === 'bottom');
    if (facingElim) return `${nick} face elimination — the next game decides whether the season continues.`;
    return `${nick} can close it out next — closeout wins are the hardest in the playoffs.`;
  }
  if (mySeries.isUpset) {
    const isTop = mySeries.topTeam?.slug === team.slug;
    const leaderIsMe = (isTop && mySeries.leader === 'top')
                   || (!isTop && mySeries.leader === 'bottom');
    return leaderIsMe
      ? `${nick} are flipping the bracket — every win compounds the upset's market value.`
      : `${nick} are in upset danger — the bracket is shifting around this series.`;
  }
  return null;
}

function buildModelOutlook(team, modelOutlook) {
  const nick = nicknameFor(team);
  if (!modelOutlook) {
    return `📈 Model watch: No Maximus board posted yet for the next game. Picks should publish closer to tip-off.`;
  }
  const oppAbbr = modelOutlook.opp?.abbrev || modelOutlook.opp?.slug?.toUpperCase() || 'opp';
  const parts = [];
  if (modelOutlook.ml) {
    parts.push(modelOutlook.ml.dir === 'team'
      ? `ML lean ${nick}`
      : `ML lean ${oppAbbr}`);
  }
  if (modelOutlook.ats) parts.push(`ATS: ${modelOutlook.ats.label}`);
  if (modelOutlook.totals) parts.push(`Total: ${modelOutlook.totals.label}`);
  if (parts.length === 0) {
    return `📈 Model watch: No Maximus board posted yet for the next game.`;
  }
  return `📈 Model watch: ${parts.join(' · ')}.`;
}

function buildKeyDriver(team, payload) {
  const found = findTeamLeader(payload, team.abbrev);
  if (!found) return null;
  const { meta, leader } = found;
  const nick = nicknameFor(team);
  const value = leader.display || leader.value;
  // Phrase as a SERIES leader (per-game playoff average), not as a
  // single-game stat line we don't have. Integrity > hype.
  const catLabel = meta.label.toLowerCase();
  const suffix = meta.abbrev === 'PTS' ? ' PPG'
    : meta.abbrev === 'AST' ? ' APG'
    : meta.abbrev === 'REB' ? ' RPG'
    : meta.abbrev === 'STL' ? ' SPG'
    : meta.abbrev === 'BLK' ? ' BPG'
    : '';
  return `💪 Key driver: ${leader.name} continues to set the tone for ${nick} and leads the team in playoff ${catLabel} at ${value}${suffix}.`;
}

function buildBigPicture(team, champOddsEntry, payload) {
  const american = champOddsEntry?.bestChanceAmerican ?? champOddsEntry?.american ?? null;
  if (american == null) return null;
  const nick = nicknameFor(team);
  const prob = oddsToProb(american);
  const tier = classifyContender(prob);
  // Path-aware tail clause — punchier when the team's series implies
  // momentum or pressure.
  const pc = payload?.nbaPlayoffContext;
  const myActive = (pc?.allSeries || []).find(s =>
    !s.isComplete && (s.topTeam?.slug === team.slug || s.bottomTeam?.slug === team.slug)
  );
  let tail;
  if (tier === 'title favorite') tail = 'Every series win tightens the market further.';
  else if (tier === 'contender') tail = 'A series win pushes them up the title board.';
  else if (myActive?.isElimination) tail = 'A closeout win could compress the price overnight.';
  else tail = 'A series win could move the title-path number meaningfully.';
  // Article agreement — "an upside team" / "a contender" etc. The
  // tier is one of: title favorite, contender, upside team, long shot.
  const article = /^[aeiou]/i.test(tier) ? 'an' : 'a';
  return `🏆 Big picture: At ${fmtAmerican(american)} to win the title, ${nick} profile as ${article} ${tier}. ${tail}`;
}

function buildHashtags(team, mySeries) {
  const nick = nicknameFor(team);
  const cleanName = (team.name || '').replace(/\s+/g, '');
  const tags = ['#NBA', '#NBAPlayoffs'];
  if (cleanName) tags.push(`#${cleanName}`);
  if (nick && nick !== cleanName) tags.push(`#${nick.replace(/\s+/g, '')}`);
  if (mySeries?.round === 2) {
    tags.push(team.conference === 'Eastern' ? '#EastSemis' : '#WestSemis');
  } else if (mySeries?.round === 3) {
    tags.push(team.conference === 'Eastern' ? '#EastFinals' : '#WestFinals');
  } else if (mySeries?.round === 4) {
    tags.push('#NBAFinals');
  }
  tags.push('#BasketballIntel');
  tags.push('#MaximusSports');
  // Cap at 8.
  return Array.from(new Set(tags)).slice(0, 8);
}

// ── Main ──────────────────────────────────────────────────────────────────

/**
 * @param {object} payload — Team Intel canonical payload (output of
 *                           normalizeNbaImagePayload, section='team-intel').
 * @returns {{ caption: string, hashtags: string[] }}
 */
export function buildNbaTeamIntelCaption(payload) {
  const team = payload?.teamA?.slug
    ? { ...payload.teamA, conference: payload.conference, name: payload.teamA.name }
    : payload?.nbaSelectedTeam || null;
  if (!team?.slug) {
    // No team selected — minimal caption (the slide also renders a
    // "select a team" placeholder, so the caption mirrors that).
    return {
      caption: '🏀 Select an NBA team to generate Team Intel.\n\nMore → maximussports.ai',
      hashtags: ['#NBA', '#NBAPlayoffs', '#MaximusSports'],
    };
  }
  // Re-resolve missing fields from canonical data (the slide does this
  // at render — caption mirrors it so caption == slide).
  const fullTeam = teamMeta(team.slug) || team;
  const slug = fullTeam.slug;
  const standings = payload?.nbaStandings?.[slug] || null;
  const champOddsEntry = payload?.nbaChampOdds?.[slug] || null;
  const { primary: mySeries } = findTeamSeries(payload, slug);
  const recentFinal = findRecentFinal(payload, slug);
  const modelOutlook = resolveTeamModelOutlook(slug, payload);

  const lines = [];
  // A. HOOK
  lines.push(buildHook(fullTeam, mySeries));
  lines.push('');
  // B. WHAT HAPPENED
  const what = buildWhatHappened(fullTeam, mySeries, recentFinal);
  if (what) {
    lines.push(what);
    lines.push('');
  }
  // C. WHY IT MATTERS
  const why = buildWhyItMatters(fullTeam, mySeries);
  if (why) {
    lines.push(why);
    lines.push('');
  }
  // D. MODEL OUTLOOK
  lines.push(buildModelOutlook(fullTeam, modelOutlook));
  lines.push('');
  // E. KEY DRIVER
  const driver = buildKeyDriver(fullTeam, payload);
  if (driver) {
    lines.push(driver);
    lines.push('');
  }
  // F. BIG PICTURE
  const big = buildBigPicture(fullTeam, champOddsEntry, payload);
  if (big) {
    lines.push(big);
    lines.push('');
  }
  // G. CTA
  lines.push('More playoff intel → maximussports.ai');
  lines.push('');
  // H. DISCLAIMER
  lines.push('For entertainment only. Please bet responsibly. 21+');

  // Standings tail (record + seed) — included only when the hook
  // didn't already establish enough team-identity context. Skipped
  // for now to keep length compact; available for future passes.
  void standings;

  const hashtags = buildHashtags(fullTeam, mySeries);

  // [NBA_TEAM_INTEL_CAPTION_FINAL] — single line so a future caption
  // accuracy bug is traceable from logs alone.
  if (typeof console !== 'undefined') {
    console.log('[NBA_TEAM_INTEL_CAPTION_FINAL]', JSON.stringify({
      team: fullTeam.abbrev || slug,
      seriesIsComplete: !!mySeries?.isComplete,
      seriesScore: mySeries?.seriesScore?.summary,
      hasModelOutlook: !!modelOutlook,
      hasDriver: !!driver,
      hasOdds: !!champOddsEntry,
      lineCount: lines.length,
    }));
  }

  return { caption: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n', hashtags };
}

export default buildNbaTeamIntelCaption;
