/**
 * Editorial team insight formatter — produces a premium, punchy intel briefing.
 *
 * Input:  { team, schedule, ats, news, rank, nextLine }
 * Output: Multi-section string using **bold** / *italic* understood by <FormattedSummary />.
 *
 * Design goals:
 * - Lead with what's most interesting right now
 * - Bettor-friendly, sharp, concise
 * - Dynamic ordering: hottest angle goes first
 * - ~70-120 words, skimmable
 * - Select emojis used tastefully
 */

function safe(fn, fallback = '') {
  try { return fn(); } catch { return fallback; }
}

function fmtRecord(wins, losses, pushes) {
  const w = wins ?? 0;
  const l = losses ?? 0;
  const p = pushes ?? 0;
  return p > 0 ? `${w}-${l}-${p}` : `${w}-${l}`;
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

function normRec(rec) {
  if (!rec) return null;
  const w = rec.wins ?? rec.w ?? 0;
  const l = rec.losses ?? rec.l ?? 0;
  const p = rec.pushes ?? rec.p ?? 0;
  const total = rec.total ?? (w + l + p);
  const pct = rec.pct ?? (rec.coverPct != null ? rec.coverPct / 100 : (total > 0 ? w / total : null));
  return { wins: w, losses: l, pushes: p, total, pct };
}

function isWatchSpam(title) {
  const t = (title || '').toLowerCase();
  return ['how to watch', 'where to watch', 'tv channel', 'live stream',
    'streaming options', 'watch online', 'stream live'].some((p) => t.includes(p));
}

function getFormSignal(recent) {
  if (!recent || recent.length < 3) return null;
  const scored = recent.filter((e) => e.ourScore != null && e.oppScore != null);
  if (scored.length < 3) return null;
  const last5 = scored.slice(0, 5);
  const wins = last5.filter((e) => e.ourScore > e.oppScore).length;
  const losses = last5.length - wins;
  if (wins >= 4) return { type: 'hot', wins, losses, label: `${wins}-${losses}` };
  if (losses >= 4) return { type: 'cold', wins, losses, label: `${wins}-${losses}` };
  return { type: 'mixed', wins, losses, label: `${wins}-${losses}` };
}

function getAtsSignal(ats) {
  const season = normRec(ats?.season);
  const last30 = normRec(ats?.last30);
  const last7 = normRec(ats?.last7);
  const best = last30?.total >= 3 ? last30 : (season?.total >= 5 ? season : last7);
  if (!best || best.total < 3) return null;
  const pct = best.pct != null ? Math.round(best.pct * 100) : null;
  if (pct === null) return null;
  if (pct >= 65) return { type: 'fire', pct, rec: best, label: 'dominant' };
  if (pct >= 55) return { type: 'strong', pct, rec: best, label: 'profitable' };
  if (pct <= 35) return { type: 'struggle', pct, rec: best, label: 'struggling' };
  if (pct <= 45) return { type: 'cold', pct, rec: best, label: 'cold' };
  return { type: 'neutral', pct, rec: best, label: 'even' };
}

function scoreAngle(formSignal, atsSignal, hasNextLine, hasNews) {
  const angles = [];
  if (atsSignal?.type === 'fire') angles.push({ key: 'ats', weight: 100 });
  else if (atsSignal?.type === 'struggle') angles.push({ key: 'ats', weight: 90 });
  else if (atsSignal?.type === 'strong') angles.push({ key: 'ats', weight: 70 });
  else if (atsSignal?.type === 'cold') angles.push({ key: 'ats', weight: 65 });
  else if (atsSignal) angles.push({ key: 'ats', weight: 40 });

  if (formSignal?.type === 'hot') angles.push({ key: 'form', weight: 85 });
  else if (formSignal?.type === 'cold') angles.push({ key: 'form', weight: 80 });
  else if (formSignal) angles.push({ key: 'form', weight: 35 });

  if (hasNextLine) angles.push({ key: 'nextGame', weight: 60 });
  if (hasNews) angles.push({ key: 'news', weight: 30 });

  return angles.sort((a, b) => b.weight - a.weight);
}

function buildLeadSentence(teamName, rank, formSignal, atsSignal, tier) {
  return safe(() => {
    const rankStr = rank != null ? `#${rank} ` : '';

    if (atsSignal?.type === 'fire') {
      return `🔥 **${rankStr}${teamName}** is covering at **${atsSignal.pct}%** — sharp money is paying attention.`;
    }
    if (formSignal?.type === 'hot') {
      return `🔥 **${rankStr}${teamName}** is rolling — **${formSignal.label}** in their last 5 and looking dangerous.`;
    }
    if (atsSignal?.type === 'struggle') {
      return `😬 **${rankStr}${teamName}** has been a market trap — just **${atsSignal.pct}%** ATS. Bettors, beware.`;
    }
    if (formSignal?.type === 'cold') {
      return `📉 **${rankStr}${teamName}** is in a rough patch — **${formSignal.label}** in the last 5. Momentum is fading.`;
    }
    if (atsSignal?.type === 'strong') {
      return `👀 **${rankStr}${teamName}** quietly covering at **${atsSignal.pct}%** — the market may still be catching up.`;
    }
    if (rank != null && rank <= 10) {
      return `🏆 **${rankStr}${teamName}** — elite status, ranked in the top 10. Here's what to know.`;
    }
    if (tier === 'Lock') {
      return `**${rankStr}${teamName}** is a tournament lock. Here's the current intelligence.`;
    }
    return `**${rankStr}${teamName}** — here's your intel briefing.`;
  }, `**${teamName}** — intel briefing loading.`);
}

function buildAtsBullet(ats) {
  return safe(() => {
    const season = normRec(ats?.season);
    const last30 = normRec(ats?.last30);
    const last7 = normRec(ats?.last7);
    const parts = [];

    if (last7 && last7.total > 0) {
      parts.push(`L7: **${fmtRecord(last7.wins, last7.losses, last7.pushes)}**`);
    }
    if (last30 && last30.total > 0) {
      const pct = last30.pct != null ? ` (${Math.round(last30.pct * 100)}%)` : '';
      parts.push(`L30: **${fmtRecord(last30.wins, last30.losses, last30.pushes)}**${pct}`);
    }
    if (season && season.total > 0) {
      const pct = season.pct != null ? ` (${Math.round(season.pct * 100)}%)` : '';
      parts.push(`Season: **${fmtRecord(season.wins, season.losses, season.pushes)}**${pct}`);
    }

    if (parts.length === 0) return null;
    return `📊 ATS: ${parts.join(' · ')}`;
  }, null);
}

function buildNextGameBullet(nextLine, schedule) {
  return safe(() => {
    const nextEvent = nextLine?.nextEvent;
    const consensus = nextLine?.consensus ?? {};

    if (nextEvent?.opponent) {
      const lineItems = [];
      const sp = fmtSpread(consensus.spread);
      if (sp) lineItems.push(sp);
      if (consensus.total != null) lineItems.push(`O/U ${consensus.total}`);

      const lineStr = lineItems.length > 0 ? ` *${lineItems.join(' · ')}*` : '';
      const timeStr = fmtDateTime(nextEvent.commenceTime);
      const timeNote = timeStr ? ` · ${timeStr}` : '';

      return `🎯 Next: vs **${nextEvent.opponent}**${timeNote}${lineStr}`;
    }

    const upcoming = schedule?.upcoming ?? [];
    if (upcoming.length > 0) {
      const next = upcoming[0];
      const label = next.homeAway === 'home' ? 'vs' : '@';
      return `🎯 Next: ${label} **${next.opponent}** — line TBD`;
    }
    return null;
  }, null);
}

function buildFormBullet(schedule) {
  return safe(() => {
    const events = schedule?.events ?? [];
    const recentFromEvents = events.length > 0
      ? events.filter((e) => e?.isFinal).sort((a, b) => new Date(b.date) - new Date(a.date))
      : null;
    const recent = recentFromEvents ?? (schedule?.recent ?? []).filter((e) => e?.isFinal);
    const scored = recent.filter((e) => e.ourScore != null && e.oppScore != null).slice(0, 10);
    if (scored.length < 3) return null;

    const w = scored.filter((e) => e.ourScore > e.oppScore).length;
    const l = scored.length - w;
    const last5 = scored.slice(0, 5);
    const w5 = last5.filter((e) => e.ourScore > e.oppScore).length;

    let trend = '';
    if (w5 >= 4) trend = ' — on a heater';
    else if (w5 <= 1) trend = ' — struggling';

    return `📈 Form: **${w}-${l}** last ${scored.length}${trend}`;
  }, null);
}

function buildNewsBullet(news) {
  return safe(() => {
    const items = Array.isArray(news) ? news : [];
    const recent = items.filter((n) => {
      if (!n?.pubDate) return true;
      return Date.now() - new Date(n.pubDate).getTime() < 7 * 24 * 60 * 60 * 1000;
    });
    if (recent.length === 0) return null;
    const topStory = recent.find((n) => !isWatchSpam(n.title || '')) ?? recent[0];
    if (!topStory?.title) return null;
    const title = topStory.title.slice(0, 80) + (topStory.title.length > 80 ? '…' : '');
    return `📰 *"${title}"*`;
  }, null);
}

/**
 * Generate a premium editorial team intel briefing.
 * Always returns a non-empty string; never throws.
 */
export function formatTeamInsight(data) {
  try {
    const { team, schedule, ats, news, rank, nextLine } = data ?? {};
    const teamName = team?.name ?? 'This team';
    const tier = team?.oddsTier;

    const events = schedule?.events ?? [];
    const recentFromEvents = events.length > 0
      ? events.filter((e) => e?.isFinal).sort((a, b) => new Date(b.date) - new Date(a.date))
      : null;
    const recent = recentFromEvents ?? (schedule?.recent ?? []);

    const formSignal = getFormSignal(recent);
    const atsSignal = getAtsSignal(ats);
    const hasNextLine = !!nextLine?.nextEvent;
    const hasNews = Array.isArray(news) && news.length > 0;

    const lead = buildLeadSentence(teamName, rank, formSignal, atsSignal, tier);

    const bullets = [];
    const angles = scoreAngle(formSignal, atsSignal, hasNextLine, hasNews);

    for (const angle of angles) {
      if (angle.key === 'ats') {
        const b = buildAtsBullet(ats);
        if (b) bullets.push(b);
      } else if (angle.key === 'form') {
        const b = buildFormBullet(schedule);
        if (b) bullets.push(b);
      } else if (angle.key === 'nextGame') {
        const b = buildNextGameBullet(nextLine, schedule);
        if (b) bullets.push(b);
      } else if (angle.key === 'news') {
        const b = buildNewsBullet(news);
        if (b) bullets.push(b);
      }
    }

    if (bullets.length === 0) {
      const atsBullet = buildAtsBullet(ats);
      const formBullet = buildFormBullet(schedule);
      const nextBullet = buildNextGameBullet(nextLine, schedule);
      if (atsBullet) bullets.push(atsBullet);
      if (formBullet) bullets.push(formBullet);
      if (nextBullet) bullets.push(nextBullet);
    }

    return [lead, ...bullets].filter(Boolean).join('\n\n');
  } catch {
    return 'Intel briefing loading. Check back in a moment.';
  }
}
