/**
 * Chatbot Summary Engine — instant, client-side synthesis for Home and Team pages.
 * Uses only data already on the page. No network calls. Deterministic (no Math.random).
 * Returns a string with **bold** and *italic*; use FormattedSummary for React.
 */

const QUOTES = {
  energy: [
    'Boo-yah!',
    "It's awesome, baby!",
    'As cool as the other side of the pillow',
    'En fuego',
    'A little dipsy-doo, dunk-a-roo!',
  ],
  diaperDandy: ['Diaper Dandy'],
  motivation: [
    "Clear eyes, full hearts, can't lose!",
    'Our deepest fear is not that we are inadequate...',
    'Juuuuuuuuust a bit outside.',
    'If you put your effort and concentration into playing to your potential...',
    "Ducks fly together!",
    "Show me the money!",
  ],
  legends: [
    'Talent wins games, but teamwork and intelligence win championships.',
    "I've failed over and over and over again in my life. And that is why I succeed.",
    'Ask what you can do for your teammates.',
  ],
  humor: [
    'Google me, Chuck!',
    'Rings, Erneh!',
    "That's turrible.",
    "Are you too good for your home?! Answer me!",
    "I eat pieces of shit like you for breakfast!",
  ],
};

/** Deterministic hash from string (stable for same input). */
function simpleHash(str) {
  let h = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

/** Pick one quote from pool deterministically (no Math.random). Uses date + situation + used count as seed. */
function pickQuote(situation, used = new Set()) {
  const pool = QUOTES[situation];
  if (!pool || pool.length === 0) return null;
  const available = pool.filter((q) => !used.has(q));
  if (available.length === 0) return null;
  const dateStr = typeof globalThis !== 'undefined' && globalThis.Date ? new Date().toDateString() : '';
  const seed = simpleHash(dateStr + situation + used.size);
  const index = seed % available.length;
  const q = available[index];
  used.add(q);
  return q;
}

/** Parse **bold** and *italic* (bold takes precedence). Returns array of { type, content }. */
export function parseFormattedSummary(text) {
  if (!text || typeof text !== 'string') return [];
  const parts = [];
  let remaining = text;
  while (remaining.length > 0) {
    const boldIdx = remaining.indexOf('**');
    const italicIdx = remaining.indexOf('*');
    let next = -1;
    let type = null;
    if (boldIdx >= 0 && (italicIdx < 0 || boldIdx <= italicIdx)) {
      next = boldIdx;
      type = 'bold';
    } else if (italicIdx >= 0) {
      next = italicIdx;
      type = 'italic';
    }
    if (next < 0) {
      parts.push({ type: 'text', content: remaining });
      break;
    }
    if (next > 0) parts.push({ type: 'text', content: remaining.slice(0, next) });
    if (type === 'bold') {
      const end = remaining.indexOf('**', next + 2);
      if (end < 0) {
        parts.push({ type: 'text', content: remaining.slice(next) });
        break;
      }
      parts.push({ type: 'bold', content: remaining.slice(next + 2, end) });
      remaining = remaining.slice(end + 2);
    } else {
      const end = remaining.indexOf('*', next + 1);
      if (end < 0) {
        parts.push({ type: 'text', content: remaining.slice(next) });
        break;
      }
      parts.push({ type: 'italic', content: remaining.slice(next + 1, end) });
      remaining = remaining.slice(end + 1);
    }
  }
  return parts;
}

function firstTeamName(entries, fallback = '') {
  const e = Array.isArray(entries) ? entries[0] : null;
  return (e && (e.name || e.teamName)) || fallback;
}

function winLoss(rec) {
  if (!rec || rec.total == null) return null;
  const w = rec.w ?? 0;
  const l = rec.l ?? 0;
  if (w + l === 0) return null;
  return w + '-' + l;
}

function wordCount(str) {
  if (!str || typeof str !== 'string') return 0;
  return str.trim().split(/\s+/).filter(Boolean).length;
}

const DEV = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

/**
 * Generate instant chatbot summary for Home or Team page.
 * @param {'home'|'team'} pageType
 * @param {object} data - Page data (only use what's provided; do not fabricate).
 * @returns {string} Formatted summary with **bold** and *italic* (and emojis).
 */
export function generateChatSummary(pageType, data) {
  const d = data || {};
  if (pageType === 'home') {
    const result = generateHomeSummary(d);
    const text = typeof result === 'string' ? result : (result && result.text) || '';
    if (DEV && text) {
      console.log('[chatSummary] home', { wordCount: wordCount(text), sections: (result && result.sections) || [] });
    }
    return text;
  }
  if (pageType === 'team') {
    const result = generateTeamSummary(d);
    const text = typeof result === 'string' ? result : (result && result.text) || '';
    if (DEV && text) {
      console.log('[chatSummary] team', { wordCount: wordCount(text), sections: (result && result.sections) || [] });
    }
    return text;
  }
  return '';
}

function generateHomeSummary(data) {
  const usedQuotes = new Set();
  const sections = [];
  const top25 = data.top25 || [];
  const atsBest = data.atsLeaders?.best || data.atsBest || [];
  const atsWorst = data.atsLeaders?.worst || data.atsWorst || [];
  const recentGames = data.recentGames || [];
  const upcomingGames = data.upcomingGames || [];
  const headlines = data.headlines || [];
  const championshipOdds = data.championshipOdds || {};
  const upsetCount = data.upsetCount ?? 0;
  const rankedInAction = data.rankedInAction ?? 0;
  const atsWindow = data.atsWindow || 'last30';
  const pinnedTeams = data.pinnedTeams || [];
  const bubbleWatchSlice = data.bubbleWatchSlice || [];

  const hasRankings = top25.length > 0;
  const hasScores = recentGames.length > 0 || upcomingGames.length > 0;
  const hasAts = atsBest.length > 0 || atsWorst.length > 0;
  const hasNews = headlines.length > 0;
  const hasChampOdds = Object.keys(championshipOdds).length > 0;
  const hasPinned = pinnedTeams.length > 0;
  const hasBubble = bubbleWatchSlice.length > 0;

  const paragraphs = [];

  // —— 1. Opening: landscape + at least 2 team names when possible ——
  let opening = 'March Madness season is in full swing. ';
  if (hasRankings) {
    sections.push('rankings');
    const first = top25[0];
    const firstName = (first && (first.teamName || first.name)) || 'the polls';
    opening += '**' + firstName + '** leads the latest rankings. ';
    if (top25.length >= 2 && top25[1]) {
      const secondName = top25[1].teamName || top25[1].name || '';
      if (secondName) opening += '**' + secondName + '** is right behind. ';
    }
  }
  if (rankedInAction > 0) {
    opening += '**' + rankedInAction + '** ranked team' + (rankedInAction > 1 ? 's' : '') + ' in action today. ';
  }
  if (upsetCount > 0) {
    opening += "We've seen **" + upsetCount + "** upset" + (upsetCount > 1 ? 's' : '') + ' already — buckle up. ';
  }
  if (!hasRankings && !hasScores && hasNews) {
    opening = 'The college hoops landscape is shifting. Headlines are rolling in and the bubble is taking shape. ';
  }
  if (!hasRankings && !hasScores && !hasNews) {
    opening = "Welcome to the hub. As scores and rankings load, we'll break down who's hot and who's not. ";
  }
  paragraphs.push(opening.trim());
  if (paragraphs[0].length < 80 && hasNews && headlines[0]) {
    paragraphs[0] += " Top story: " + (headlines[0].title || headlines[0]).slice(0, 60) + (headlines[0].title && headlines[0].title.length > 60 ? '…' : '') + '.';
  }

  // —— 2. ATS **or** market watch / bracket pressure fallback (never skip) ——
  if (hasAts) {
    sections.push('ats');
    const best = firstTeamName(atsBest);
    const worst = firstTeamName(atsWorst);
    const recBest = atsBest[0]?.[atsWindow] || atsBest[0]?.season || atsBest[0]?.rec;
    const recWorst = atsWorst[0]?.[atsWindow] || atsWorst[0]?.season || atsWorst[0]?.rec;
    const wlBest = winLoss(recBest);
    const wlWorst = winLoss(recWorst);
    const pctBest = recBest && recBest.coverPct != null ? recBest.coverPct : null;
    let atsLine = 'On the spread: ';
    if (best && wlBest) {
      atsLine += '**' + best + '** is covering at ' + wlBest + (pctBest != null ? ' (' + pctBest + '% cover)' : '') + ' over ' + atsWindow.replace('last', 'L') + '. ';
    }
    if (worst && wlWorst) {
      atsLine += 'Meanwhile **' + worst + '** has struggled ATS at ' + wlWorst + '. ';
    }
    atsLine += 'Worth watching when the lines drop.';
    paragraphs.push(atsLine);
    const q = pickQuote('energy', usedQuotes);
    if (q) paragraphs.push('*"' + q + '"*');
  } else {
    sections.push('marketWatch');
    let fallback = '';
    if (hasChampOdds) {
      const entries = Object.entries(championshipOdds)
        .filter(([, v]) => v != null && (v.bestChanceAmerican != null || v.american != null))
        .sort((a, b) => {
          const aVal = a[1].bestChanceAmerican ?? a[1].american ?? 9999;
          const bVal = b[1].bestChanceAmerican ?? b[1].american ?? 9999;
          return aVal - bVal;
        })
        .slice(0, 3);
      if (entries.length > 0) {
        const names = entries.map(([slug]) => slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')).join(', ');
        fallback = 'Championship odds still favor **' + names + '**. ';
      }
    }
    if (rankedInAction > 0) fallback += 'Ranked teams are in action — check the board for live lines. ';
    if (hasPinned) {
      const names = pinnedTeams.slice(0, 2).map((p) => p.name || p.teamName).filter(Boolean);
      if (names.length) fallback += 'Pinned: **' + names.join('**, **') + '**. ';
    }
    if (hasNews) fallback += 'Headlines are rolling in; the bubble is moving. ';
    if (upcomingGames.length > 0) fallback += '**' + upcomingGames.length + '** games on the slate. ';
    if (hasBubble) {
      const bubbleNames = bubbleWatchSlice.slice(0, 2).map((b) => b.teamName || b.name).filter(Boolean);
      if (bubbleNames.length) fallback += 'Bubble watch: **' + bubbleNames.join('**, **') + '** need results. ';
    }
    if (!fallback) fallback = 'ATS data is still loading — use Refresh once the board is ready. Market angles and bracket pressure will sharpen as more data lands.';
    paragraphs.push(fallback.trim());
  }

  // —— 3. Championship odds or bracket angle ——
  if (hasChampOdds) {
    sections.push('odds');
    const entries = Object.entries(championshipOdds)
      .filter(([, v]) => v != null && (v.bestChanceAmerican != null || v.american != null))
      .sort((a, b) => {
        const aVal = a[1].bestChanceAmerican ?? a[1].american ?? 9999;
        const bVal = b[1].bestChanceAmerican ?? b[1].american ?? 9999;
        return aVal - bVal;
      })
      .slice(0, 3);
    if (entries.length > 0) {
      const names = entries.map(([slug]) => slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')).join(', ');
      paragraphs.push('Championship odds favor **' + names + '** — bracket pressure is real. ');
      const q = pickQuote('legends', usedQuotes);
      if (q) paragraphs.push('*"' + q + '"*');
    }
  }

  // —— 4. Forward-looking: next matchup, storyline, or market angle ——
  if (upcomingGames.length > 0) {
    paragraphs.push('Up next: **' + upcomingGames.length + '** game' + (upcomingGames.length > 1 ? 's' : '') + ' on the slate. Check the board and lock in your picks before lines move.');
  } else if (hasNews) {
    paragraphs.push("Keep an eye on the news feed and bubble watch — things change fast this time of year.");
  } else {
    paragraphs.push("When more games and odds load, we'll highlight the best angles and storylines.");
  }

  const text = paragraphs.filter(Boolean).join('\n\n');
  return DEV ? { text, sections } : text;
}

function generateTeamSummary(data) {
  const usedQuotes = new Set();
  const sections = [];
  const team = data.team || {};
  const teamName = team.name || 'This team';
  const schedule = data.schedule || {};
  const upcoming = schedule.upcoming || [];
  const recent = schedule.recent || [];
  const ats = data.ats || {};
  const news = data.news || [];
  const rank = data.rank;
  const nextLine = data.nextLine || {};
  const nextEvent = nextLine.nextEvent;
  const consensus = nextLine.consensus || {};

  const paragraphs = [];

  // —— 1. Team identity + trajectory (rank, record, tier) ——
  sections.push('identity');
  let trajectory = '**' + teamName + '**';
  if (rank != null) {
    trajectory += ' (No. **' + rank + '**)';
    sections.push('rank');
  }
  trajectory += ' — ';
  if (recent.length > 0) {
    const withScores = recent.filter((e) => e.homeScore != null && e.awayScore != null);
    if (withScores.length > 0) {
      const wins = recent.filter((e) => e.result === 'W' || (e.homeScore != null && e.awayScore != null && (e.isHome ? e.homeScore > e.awayScore : e.awayScore > e.homeScore))).length;
      const total = recent.length;
      trajectory += "they've gone " + wins + '-' + (total - wins) + " in their last " + total + " — ";
      sections.push('recent');
    }
  }
  trajectory += (team.oddsTier || 'bubble') + ' territory.';
  paragraphs.push(trajectory);
  const motQuote = pickQuote('motivation', usedQuotes);
  if (motQuote) paragraphs.push('*"' + motQuote + '"*');

  // —— 2. ATS **or** season record / trajectory fallback ——
  const last7Ats = ats.last7;
  const last30Ats = ats.last30;
  const seasonAts = ats.season;
  const rec = last7Ats || last30Ats || seasonAts;
  if (rec && rec.total > 0) {
    sections.push('ats');
    const wl = winLoss(rec);
    if (wl) {
      const pct = rec.coverPct != null ? ' (' + rec.coverPct + '% cover)' : '';
      const vibe = rec.coverPct >= 55 ? "They've been covering — sharp money has noticed." : rec.coverPct <= 45 ? 'Tough stretch against the number.' : 'Right around the number.';
      paragraphs.push('ATS: **' + wl + '**' + pct + ' over their recent games. ' + vibe);
    }
  } else {
    if (recent.length > 0) {
      paragraphs.push('Recent results are in; ATS data will sharpen as odds history loads. Focus on the next matchup and line movement.');
    } else {
      paragraphs.push('Season context and ATS angles will appear as more data loads. For now, the next game and news feed tell the story.');
    }
  }

  // —— 3. Next matchup + line (or upcoming opponent) ——
  if (nextEvent && (consensus.spread != null || consensus.total != null || consensus.moneyline != null)) {
    sections.push('nextLine');
    const opp = nextEvent.opponent || 'TBD';
    let line = 'Next up: **vs ' + opp + '**. ';
    if (consensus.spread != null) {
      const s = consensus.spread;
      line += 'Spread: ' + (s > 0 ? '+' : '') + s + '. ';
    }
    if (consensus.total != null) line += 'Total: ' + consensus.total + '. ';
    line += 'Lock in before the line moves.';
    paragraphs.push(line);
  } else if (upcoming.length > 0) {
    const next = upcoming[0];
    const opp = next.opponent || next.awayTeam || next.homeTeam || 'TBD';
    paragraphs.push('Up next: **' + opp + '**. Get the latest line when it drops.');
  }

  // —— 4. Strength/weakness or news ——
  if (news.length > 0) {
    sections.push('news');
    paragraphs.push('**' + news.length + '** headline' + (news.length > 1 ? 's' : '') + ' in the feed — stay tuned for updates.');
  } else {
    paragraphs.push('Keep an eye on the schedule and next line; we\'ll surface strengths and betting angles as more data lands.');
  }

  const text = paragraphs.filter(Boolean).join('\n\n');
  return DEV ? { text, sections } : text;
}
