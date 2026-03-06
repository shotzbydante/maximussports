/**
 * Structured, data-driven team insight formatter.
 *
 * Input:  { team, schedule, ats, news, rank, nextLine }
 * Output: Multi-section string using **bold** / *italic* understood by <FormattedSummary />.
 *
 * Guarantees:
 * - formatTeamInsight() NEVER throws. Every section has its own try/catch.
 * - Returns a non-empty string for any input, including null/undefined.
 * - Does NOT fabricate stats. Falls back to informational text for missing data.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safe(fn, fallback = '') {
  try { return fn(); } catch { return fallback; }
}

function fmtRecord(wins, losses, pushes) {
  const w = wins ?? 0;
  const l = losses ?? 0;
  const p = pushes ?? 0;
  return p > 0 ? `${w}-${l}-${p}` : `${w}-${l}`;
}

function fmtPct(pct) {
  return pct != null ? `${Math.round(pct * 100)}%` : null;
}

function fmtSpread(n) {
  if (n == null || typeof n !== 'number') return null;
  return n > 0 ? `+${n}` : String(n);
}

function fmtDateTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return null; }
}

// ─── Section builders — each is individually defensive ───────────────────────

function buildQuickPulse(teamName, schedule, rank) {
  return safe(() => {
    // Support both shapes: { events: [...] } (canonical from API) and { recent: [...] } (pre-derived).
    // Derive from events list first (more robust); fall back to pre-derived recent array.
    const events = schedule?.events ?? [];
    const recentFromEvents = events.length > 0
      ? events.filter((e) => e?.isFinal).sort((a, b) => new Date(b.date) - new Date(a.date))
      : null;
    const recent  = recentFromEvents ?? (schedule?.recent ?? []).filter((e) => e?.isFinal);
    const last10  = recent.slice(0, 10);
    const last5   = recent.slice(0, 5);
    const rankNote = rank != null ? ` (ranked **#${rank}**)` : '';

    if (last10.length === 0) {
      return `**Quick Pulse** — **${teamName}**${rankNote}. Schedule data is loading.`;
    }

    // Only count games that have actual scores
    const s10 = last10.filter((e) => e.ourScore != null && e.oppScore != null);
    const s5  = last5.filter((e)  => e.ourScore != null && e.oppScore != null);

    if (s10.length === 0) {
      return `**Quick Pulse** — **${teamName}**${rankNote} has ${last10.length} games in the recent schedule. Score data loading.`;
    }

    const w10 = s10.filter((e) => e.ourScore > e.oppScore).length;
    const l10 = s10.length - w10;

    let trendNote = '';
    if (s5.length === 5) {
      const w5 = s5.filter((e) => e.ourScore > e.oppScore).length;
      const form = `**${w5}-${s5.length - w5}** in the last 5`;
      if (w5 >= 4) {
        trendNote = ` — ${form}. Red-hot stretch of basketball right now.`;
      } else if (w5 <= 1) {
        trendNote = ` — ${form}. A rough run lately.`;
      } else {
        trendNote = ` — ${form}.`;
      }
    }

    return `**Quick Pulse** — **${teamName}**${rankNote} is **${w10}-${l10}** over their last ${s10.length} games${trendNote}`;
  }, `**Quick Pulse** — Data unavailable for ${teamName}.`);
}

/** Normalize ATS record from UI shape ({ w, l, p, total, coverPct }) to formatter shape (wins, losses, pushes, pct). */
function normRec(rec) {
  if (!rec) return null;
  const w = rec.wins ?? rec.w ?? 0;
  const l = rec.losses ?? rec.l ?? 0;
  const p = rec.pushes ?? rec.p ?? 0;
  const pct = rec.pct ?? (rec.coverPct != null ? rec.coverPct / 100 : null);
  return { wins: w, losses: l, pushes: p, pct };
}

function buildAtsPulse(ats) {
  return safe(() => {
    const season = normRec(ats?.season);
    const last30 = normRec(ats?.last30);
    const last7  = normRec(ats?.last7);
    const lines  = [];

    if (last7 && (last7.wins != null || last7.losses != null)) {
      const pctStr = last7.pct != null ? ` (${fmtPct(last7.pct)})` : '';
      lines.push(`Last 7: **${fmtRecord(last7.wins, last7.losses, last7.pushes)}**${pctStr}`);
    }
    if (last30 && (last30.wins != null || last30.losses != null)) {
      const pctStr = last30.pct != null ? ` (${fmtPct(last30.pct)})` : '';
      lines.push(`Last 30: **${fmtRecord(last30.wins, last30.losses, last30.pushes)}**${pctStr}`);
    }
    if (season && (season.wins != null || season.losses != null)) {
      const pctStr = season.pct != null ? ` (${fmtPct(season.pct)})` : '';
      lines.push(`Season: **${fmtRecord(season.wins, season.losses, season.pushes)}**${pctStr}`);
    }

    if (lines.length === 0) {
      return '**ATS Performance** — Insufficient data. Check back as odds history accumulates.';
    }

    let take = '';
    const p = season?.pct ?? last30?.pct ?? last7?.pct;
    if (p != null) {
      if (p >= 0.60)      take = ' Sharp followers have been rewarded this year.';
      else if (p <= 0.40) take = " The market has this team's number — approach spreads carefully.";
      else if (p >= 0.52) take = ' Slight edge for the bettors this year.';
      else                take = ' Coin-flip season against the spread.';
    }

    return `**ATS Performance** — ${lines.join(' · ')}.${take}`;
  }, '**ATS Performance** — ATS data unavailable right now.');
}

function buildNextGame(nextLine, schedule) {
  return safe(() => {
    const nextEvent = nextLine?.nextEvent;
    const consensus = nextLine?.consensus ?? {};
    const movement  = nextLine?.movement;

    if (nextEvent?.opponent) {
      const timeStr  = fmtDateTime(nextEvent.commenceTime);
      const timeNote = timeStr ? ` · ${timeStr}` : '';

      const lineItems = [];
      const sp = fmtSpread(consensus.spread);
      if (sp) lineItems.push(`Spread ${sp}`);
      if (consensus.total != null) lineItems.push(`O/U ${consensus.total}`);
      if (consensus.moneyline != null) lineItems.push(`ML ${fmtSpread(consensus.moneyline)}`);

      const lineNote = lineItems.length > 0
        ? ` Line: *${lineItems.join(' · ')}*`
        : ' Line not yet posted.';

      let movNote = '';
      if (movement?.samples > 0 && movement.spread?.delta != null && movement.spread.delta !== 0) {
        const dir   = movement.spread.delta > 0 ? 'rising' : 'falling';
        movNote = ` Spread ${dir} (${movement.spread.delta > 0 ? '+' : ''}${movement.spread.delta} pts / last ${movement.windowMinutes}m).`;
      }

      return `**Next Game** — vs **${nextEvent.opponent}**${timeNote}.${lineNote}${movNote}`;
    }

    const upcoming = schedule?.upcoming ?? [];
    if (upcoming.length > 0) {
      const next  = upcoming[0];
      const label = next.homeAway === 'home' ? 'vs' : '@';
      return `**Next Game** — ${label} **${next.opponent}**. Line not yet available.`;
    }

    return '**Next Game** — No upcoming games scheduled yet.';
  }, '**Next Game** — Upcoming game data unavailable.');
}

// Watch-spam detector (mirrors server-side scoring in api/_sources.js)
function isWatchSpam(title) {
  const t = (title || '').toLowerCase();
  return [
    'how to watch', 'where to watch', 'tv channel', 'live stream',
    'streaming options', 'watch online', 'stream live', 'broadcast guide',
    'ways to watch', 'free stream',
  ].some((p) => t.includes(p));
}

function buildNewsPulse(news) {
  return safe(() => {
    const items  = Array.isArray(news) ? news : [];
    const recent = items.filter((n) => {
      if (!n?.pubDate) return true;
      return Date.now() - new Date(n.pubDate).getTime() < 7 * 24 * 60 * 60 * 1000;
    });

    if (recent.length === 0) {
      return "**News Pulse** — No men's basketball coverage found in last 7 days.";
    }

    const count = recent.length;

    // Prefer non-spam headline for the "top storyline" display.
    // News is already quality-ranked by the server, so first non-spam is the best real story.
    const topStory = recent.find((n) => !isWatchSpam(n.title || '')) ?? recent[0];
    const topNote = topStory?.title
      ? ` Top storyline: *"${topStory.title.slice(0, 90)}${topStory.title.length > 90 ? '…' : ''}"*`
      : '';

    return `**News Pulse** — **${count}** headline${count !== 1 ? 's' : ''} in the last 7 days.${topNote}`;
  }, '**News Pulse** — News data unavailable.');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a structured, data-driven team insight string.
 * Always returns a non-empty string; never throws.
 *
 * @param {{ team?, schedule?, ats?, news?, rank?, nextLine? }} data
 * @returns {string}
 */
export function formatTeamInsight(data) {
  try {
    const { team, schedule, ats, news, rank, nextLine } = data ?? {};
    const teamName = team?.name ?? 'This team';

    return [
      buildQuickPulse(teamName, schedule, rank),
      buildAtsPulse(ats),
      buildNextGame(nextLine, schedule),
      buildNewsPulse(news),
    ].join('\n\n');
  } catch {
    return 'Insight data is loading. Check back in a moment.';
  }
}
