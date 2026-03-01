/**
 * Structured, data-driven team insight formatter.
 *
 * Input:  { team, schedule, ats, news, rank, nextLine }
 * Output: Multi-section markdown string using **bold** / *italic* conventions
 *         understood by <FormattedSummary />.
 *
 * Rules:
 * - Never fabricate stats. If data is absent, write a useful fallback.
 * - All output is deterministic for a given input.
 * - Sections: Quick Pulse · ATS Performance · Next Game · News Pulse
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtRecord(wins, losses, pushes) {
  const w = wins ?? 0;
  const l = losses ?? 0;
  const p = pushes ?? 0;
  if (p > 0) return `${w}-${l}-${p}`;
  return `${w}-${l}`;
}

function fmtPct(pct) {
  if (pct == null) return null;
  return `${Math.round(pct * 100)}%`;
}

function fmtSpread(n) {
  if (n == null || typeof n !== 'number') return null;
  return n > 0 ? `+${n}` : String(n);
}

function fmtDateTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

// ─── Section builders ─────────────────────────────────────────────────────────

function buildQuickPulse(teamName, schedule, rank) {
  const recent = (schedule?.recent ?? []).filter((e) => e.isFinal);
  const last10 = recent.slice(0, 10);
  const last5  = recent.slice(0, 5);

  const rankNote = rank != null ? ` (ranked **#${rank}**)` : '';

  if (last10.length === 0) {
    return `**Quick Pulse** — **${teamName}**${rankNote} · Schedule data is still loading.`;
  }

  // Only count games that have actual scores
  const scoredLast10 = last10.filter((e) => e.ourScore != null && e.oppScore != null);
  const scoredLast5  = last5.filter((e)  => e.ourScore != null && e.oppScore != null);

  if (scoredLast10.length === 0) {
    return `**Quick Pulse** — **${teamName}**${rankNote} has **${last10.length}** games in the recent schedule — score data loading.`;
  }

  const w10 = scoredLast10.filter((e) => e.ourScore > e.oppScore).length;
  const l10 = scoredLast10.length - w10;

  let trendNote = '';
  if (scoredLast5.length === 5) {
    const w5 = scoredLast5.filter((e) => e.ourScore > e.oppScore).length;
    const l5 = scoredLast5.length - w5;
    const form = `**${w5}-${l5}** in the last 5`;
    if (w5 >= 4) {
      trendNote = ` — ${form}. Red-hot stretch of basketball right now.`;
    } else if (w5 <= 1) {
      trendNote = ` — ${form}. A rough run lately; something needs to turn around.`;
    } else {
      const dir = w5 > w10 / 2 ? 'trending up' : 'trending down';
      trendNote = ` — ${form}. Form is ${dir} recently.`;
    }
  }

  return `**Quick Pulse** — **${teamName}**${rankNote} is **${w10}-${l10}** over their last ${scoredLast10.length} games${trendNote}`;
}

function buildAtsPulse(ats) {
  const season = ats?.season;
  const last30 = ats?.last30;
  const last7  = ats?.last7;

  const lines = [];

  if (last7?.wins != null || last7?.losses != null) {
    const rec  = fmtRecord(last7.wins, last7.losses, last7.pushes);
    const pctS = last7.pct != null ? ` (${fmtPct(last7.pct)})` : '';
    lines.push(`Last 7: **${rec}**${pctS}`);
  }

  if (last30?.wins != null || last30?.losses != null) {
    const rec  = fmtRecord(last30.wins, last30.losses, last30.pushes);
    const pctS = last30.pct != null ? ` (${fmtPct(last30.pct)})` : '';
    lines.push(`Last 30: **${rec}**${pctS}`);
  }

  if (season?.wins != null || season?.losses != null) {
    const rec  = fmtRecord(season.wins, season.losses, season.pushes);
    const pctS = season.pct != null ? ` (${fmtPct(season.pct)})` : '';
    lines.push(`Season: **${rec}**${pctS}`);
  }

  if (lines.length === 0) {
    return '**ATS Performance** — Insufficient data to compute ATS record yet. Check back as the schedule fills in.';
  }

  let take = '';
  if (season?.pct != null) {
    if (season.pct >= 0.6) {
      take = ' Sharp followers have been rewarded this year.';
    } else if (season.pct <= 0.4) {
      take = ' The market consistently has this team\'s number — fade with care.';
    } else if (season.pct >= 0.52) {
      take = ' Slight edge for the bettors this year.';
    } else {
      take = ' Coin-flip season against the spread so far.';
    }
  }

  return `**ATS Performance** — ${lines.join(' · ')}.${take}`;
}

function buildNextGame(nextLine, schedule) {
  const nextEvent  = nextLine?.nextEvent;
  const consensus  = nextLine?.consensus ?? {};
  const movement   = nextLine?.movement;

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
      const delta = Math.abs(movement.spread.delta);
      movNote = ` Spread ${dir} (${delta > 0 ? '+' : ''}${movement.spread.delta} pts / last ${movement.windowMinutes}m).`;
    }

    return `**Next Game** — vs **${nextEvent.opponent}**${timeNote}.${lineNote}${movNote}`;
  }

  // Fall back to schedule upcoming
  const upcoming = schedule?.upcoming ?? [];
  if (upcoming.length > 0) {
    const next  = upcoming[0];
    const label = next.homeAway === 'home' ? 'vs' : '@';
    return `**Next Game** — ${label} **${next.opponent}**. Line not yet available — check back closer to tip-off.`;
  }

  return '**Next Game** — No upcoming games scheduled in the data yet.';
}

function buildNewsPulse(news) {
  const items = Array.isArray(news) ? news : [];
  const recent = items.filter((n) => {
    if (!n.pubDate) return true;
    const ageMs = Date.now() - new Date(n.pubDate).getTime();
    return ageMs < 7 * 24 * 60 * 60 * 1000;
  });

  if (recent.length === 0) {
    return '**News Pulse** — No recent headlines surfaced in the last 7 days. We\'ll keep monitoring.';
  }

  const count   = recent.length;
  const top     = recent[0];
  const topNote = top?.title
    ? ` Most recent: *"${top.title.slice(0, 90)}${top.title.length > 90 ? '…' : ''}"*`
    : '';

  return `**News Pulse** — **${count}** headline${count !== 1 ? 's' : ''} in the last 7 days.${topNote}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a structured, data-driven team insight string.
 *
 * @param {{ team, schedule, ats, news, rank, nextLine }} data
 * @returns {string}
 */
export function formatTeamInsight(data) {
  const { team, schedule, ats, news, rank, nextLine } = data ?? {};
  const teamName = team?.name ?? 'This team';

  const sections = [
    buildQuickPulse(teamName, schedule, rank),
    buildAtsPulse(ats),
    buildNextGame(nextLine, schedule),
    buildNewsPulse(news),
  ];

  return sections.join('\n\n');
}
