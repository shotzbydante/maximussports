/**
 * Narrative team intel briefing — reads like an analyst note, not a stat dump.
 *
 * Synthesizes: ATS data, recent results, ranking, championship odds, news, next game.
 * Determines the most compelling storyline and leads with it.
 * ~80-120 words, editorial tone, 2-4 narrative bullets.
 */

function safe(fn, fallback = '') {
  try { return fn(); } catch { return fallback; }
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
  if (total === 0) return null;
  const pct = rec.pct ?? (rec.coverPct != null ? rec.coverPct / 100 : w / total);
  if (pct == null || isNaN(pct)) return null;
  return { wins: w, losses: l, pushes: p, total, pct };
}

function isWatchSpam(title) {
  const t = (title || '').toLowerCase();
  return ['how to watch', 'where to watch', 'tv channel', 'live stream',
    'streaming options', 'watch online', 'stream live'].some((p) => t.includes(p));
}

function getRecentScored(schedule) {
  const events = schedule?.events ?? [];
  const recentFromEvents = events.length > 0
    ? events.filter((e) => e?.isFinal).sort((a, b) => new Date(b.date) - new Date(a.date))
    : null;
  const recent = recentFromEvents ?? (schedule?.recent ?? []).filter((e) => e?.isFinal);
  return recent.filter((e) => e.ourScore != null && e.oppScore != null);
}

function getFormSignal(scored) {
  if (scored.length < 3) return null;
  const last5 = scored.slice(0, 5);
  const wins = last5.filter((e) => e.ourScore > e.oppScore).length;
  const losses = last5.length - wins;
  const last10 = scored.slice(0, 10);
  const w10 = last10.filter((e) => e.ourScore > e.oppScore).length;
  const l10 = last10.length - w10;
  if (wins >= 4) return { type: 'hot', wins, losses, w10, l10, count: last10.length };
  if (losses >= 4) return { type: 'cold', wins, losses, w10, l10, count: last10.length };
  return { type: 'mixed', wins, losses, w10, l10, count: last10.length };
}

function getAtsSignal(ats) {
  const season = normRec(ats?.season);
  const last30 = normRec(ats?.last30);
  const best = last30?.total >= 3 ? last30 : (season?.total >= 5 ? season : null);
  if (!best) return null;
  const pct = Math.round(best.pct * 100);
  if (isNaN(pct)) return null;
  const window = best === last30 ? 'last 30 days' : 'this season';
  if (pct >= 65) return { type: 'fire', pct, rec: best, window };
  if (pct >= 55) return { type: 'strong', pct, rec: best, window };
  if (pct <= 35) return { type: 'struggle', pct, rec: best, window };
  if (pct <= 45) return { type: 'cold', pct, rec: best, window };
  return { type: 'neutral', pct, rec: best, window };
}

function getChampOddsLabel(champOdds) {
  if (!champOdds || typeof champOdds !== 'number') return null;
  return champOdds > 0 ? `+${champOdds}` : String(champOdds);
}

function getTopHeadline(news) {
  const items = Array.isArray(news) ? news : [];
  const recent = items.filter((n) => {
    if (!n?.pubDate) return true;
    return Date.now() - new Date(n.pubDate).getTime() < 7 * 24 * 60 * 60 * 1000;
  });
  if (recent.length === 0) return null;
  return recent.find((n) => !isWatchSpam(n.title || '')) ?? recent[0];
}

function getBigResult(scored) {
  if (scored.length === 0) return null;
  const last = scored[0];
  const won = last.ourScore > last.oppScore;
  const margin = Math.abs(last.ourScore - last.oppScore);
  if (margin >= 15) return { type: won ? 'blowout_win' : 'blowout_loss', game: last, margin };
  return null;
}

function scoreAngles(formSignal, atsSignal, hasNextLine, headline, bigResult, champOdds, rank) {
  const angles = [];

  if (bigResult?.type === 'blowout_loss') angles.push({ key: 'bigResult', weight: 95 });
  else if (bigResult?.type === 'blowout_win') angles.push({ key: 'bigResult', weight: 75 });

  if (atsSignal?.type === 'fire') angles.push({ key: 'ats', weight: 100 });
  else if (atsSignal?.type === 'struggle') angles.push({ key: 'ats', weight: 88 });
  else if (atsSignal?.type === 'strong') angles.push({ key: 'ats', weight: 68 });
  else if (atsSignal?.type === 'cold') angles.push({ key: 'ats', weight: 63 });
  else if (atsSignal) angles.push({ key: 'ats', weight: 38 });

  if (formSignal?.type === 'hot') angles.push({ key: 'form', weight: 82 });
  else if (formSignal?.type === 'cold') angles.push({ key: 'form', weight: 78 });
  else if (formSignal) angles.push({ key: 'form', weight: 33 });

  if (hasNextLine) angles.push({ key: 'nextGame', weight: 55 });
  if (champOdds) angles.push({ key: 'champOdds', weight: 45 });
  if (headline) angles.push({ key: 'news', weight: 30 });

  return angles.sort((a, b) => b.weight - a.weight);
}

function buildLeadSentence(teamName, rank, formSignal, atsSignal, tier, bigResult, conference) {
  return safe(() => {
    const name = rank != null ? `**#${rank} ${teamName}**` : `**${teamName}**`;

    if (bigResult?.type === 'blowout_loss') {
      const g = bigResult.game;
      return `😬 ${name} just dropped a ${bigResult.margin}-point loss to ${g.opponent}. That's the kind of result that raises questions heading into tournament time.`;
    }
    if (atsSignal?.type === 'fire') {
      return `🔥 ${name} remains one of the most reliable teams against the number ${atsSignal.window}, covering in **${atsSignal.pct}%** of games. Sharp money has taken notice.`;
    }
    if (bigResult?.type === 'blowout_win') {
      const g = bigResult.game;
      return `🔥 ${name} just steamrolled ${g.opponent} by ${bigResult.margin} points. The momentum is real heading into their next matchup.`;
    }
    if (formSignal?.type === 'hot') {
      return `🔥 ${name} is surging — **${formSignal.wins}-${formSignal.losses}** in the last 5 and playing some of their best basketball of the season.`;
    }
    if (atsSignal?.type === 'struggle') {
      return `😬 ${name} has been a market trap ${atsSignal.window} — just **${atsSignal.pct}%** ATS. The public keeps betting them, and the house keeps winning.`;
    }
    if (formSignal?.type === 'cold') {
      return `📉 ${name} is struggling — **${formSignal.wins}-${formSignal.losses}** in the last 5. The slide is real and bettors should be cautious.`;
    }
    if (atsSignal?.type === 'strong') {
      return `👀 ${name} is quietly covering at **${atsSignal.pct}%** ${atsSignal.window} — the market may still be catching up.`;
    }
    if (rank != null && rank <= 10) {
      return `🏆 ${name} remains firmly inside the top 10. Here's what the numbers say right now.`;
    }
    if (tier === 'Lock') {
      return `${name} is locked into the tournament field. Here's the latest intelligence from the ${conference}.`;
    }
    return `${name} — here's what you need to know from the ${conference}.`;
  }, `**${teamName}** — intel briefing.`);
}

function buildFormBullet(formSignal, teamName) {
  return safe(() => {
    if (!formSignal) return null;
    const { w10, l10, count, type } = formSignal;
    if (count < 3) return null;

    if (type === 'hot') {
      return `📈 Despite being heavily targeted by oddsmakers, the ${teamName.split(' ').slice(-1)[0]} keep finding ways to win — **${w10}-${l10}** over their last ${count} outings.`;
    }
    if (type === 'cold') {
      return `📉 A mixed **${w10}-${l10}** stretch over the last ${count} games tells the story. This team isn't playing at the level the market expects.`;
    }
    return `📈 Overall form sits at **${w10}-${l10}** over the last ${count} games — a mixed bag that suggests caution with spread bets.`;
  }, null);
}

function buildAtsBullet(atsSignal) {
  return safe(() => {
    if (!atsSignal) return null;
    const { pct, rec, window, type } = atsSignal;

    if (type === 'fire' || type === 'strong') {
      return `📊 The ATS profile is impressive: **${rec.wins}-${rec.losses}** ${window} (${pct}% cover rate). The market continues to undervalue this team against the number.`;
    }
    if (type === 'struggle' || type === 'cold') {
      return `📊 The numbers against the spread are concerning: **${rec.wins}-${rec.losses}** ${window} (${pct}% cover). Bettors backing this team have been burning money.`;
    }
    return `📊 ATS profile ${window}: **${rec.wins}-${rec.losses}** (${pct}%). Right around the market's expectation — no strong edge either way.`;
  }, null);
}

function buildNextGameBullet(nextLine, schedule, conference) {
  return safe(() => {
    const nextEvent = nextLine?.nextEvent;
    const consensus = nextLine?.consensus ?? {};

    if (nextEvent?.opponent && nextEvent.opponent !== 'TBD') {
      const lineItems = [];
      const sp = fmtSpread(consensus.spread);
      if (sp) lineItems.push(sp);
      if (consensus.total != null) lineItems.push(`O/U ${consensus.total}`);
      const lineStr = lineItems.length > 0 ? ` Line: *${lineItems.join(', ')}*.` : ' Line pending.';
      return `🎯 Next up: **${nextEvent.opponent}**.${lineStr}`;
    }

    const upcoming = schedule?.upcoming ?? [];
    if (upcoming.length > 0) {
      const next = upcoming[0];
      if (next.opponent && next.opponent !== 'TBD') {
        const label = next.homeAway === 'home' ? 'vs' : 'at';
        return `🎯 Up next: ${label} **${next.opponent}**. Line pending.`;
      }
    }

    if (conference) {
      return `🎯 Next matchup is in the **${conference} Tournament** — opponent and line TBD. Stay tuned.`;
    }
    return null;
  }, null);
}

function buildChampOddsBullet(champOdds, tier) {
  return safe(() => {
    const label = getChampOddsLabel(champOdds);
    if (!label) return null;

    if (tier === 'Lock') {
      return `🏆 Championship odds at **${label}** — firmly in the contender conversation.`;
    }
    if (tier === 'Should be in') {
      return `🏆 Title odds sit at **${label}**, placing them in the second tier of legitimate contenders.`;
    }
    return `🏆 Championship odds: **${label}**.`;
  }, null);
}

function buildNewsBullet(headline) {
  return safe(() => {
    if (!headline?.title) return null;
    const title = headline.title.slice(0, 90) + (headline.title.length > 90 ? '…' : '');
    return `📰 Latest: *"${title}"*`;
  }, null);
}

/**
 * Generate a narrative-driven team intel briefing.
 * Always returns a non-empty string; never throws.
 *
 * @param {{ team?, schedule?, ats?, news?, rank?, nextLine?, championshipOdds? }} data
 */
export function formatTeamInsight(data) {
  try {
    const { team, schedule, ats, news, rank, nextLine, championshipOdds } = data ?? {};
    const teamName = team?.name ?? 'This team';
    const tier = team?.oddsTier;
    const conference = team?.conference;

    const scored = getRecentScored(schedule);
    const formSignal = getFormSignal(scored);
    const atsSignal = getAtsSignal(ats);
    const headline = getTopHeadline(news);
    const bigResult = getBigResult(scored);
    const champOdds = championshipOdds ?? null;
    const hasNextLine = !!nextLine?.nextEvent;

    const angles = scoreAngles(formSignal, atsSignal, hasNextLine, headline, bigResult, champOdds, rank);

    const lead = buildLeadSentence(teamName, rank, formSignal, atsSignal, tier, bigResult, conference);
    const bullets = [];
    const usedKeys = new Set();

    for (const angle of angles) {
      if (bullets.length >= 3) break;
      if (usedKeys.has(angle.key)) continue;
      if (angle.key === 'bigResult') { usedKeys.add('bigResult'); continue; }

      let b = null;
      if (angle.key === 'ats') b = buildAtsBullet(atsSignal);
      else if (angle.key === 'form') b = buildFormBullet(formSignal, teamName);
      else if (angle.key === 'nextGame') b = buildNextGameBullet(nextLine, schedule, conference);
      else if (angle.key === 'champOdds') b = buildChampOddsBullet(champOdds, tier);
      else if (angle.key === 'news') b = buildNewsBullet(headline);

      if (b) { bullets.push(b); usedKeys.add(angle.key); }
    }

    if (bullets.length === 0) {
      const fb1 = buildFormBullet(formSignal, teamName);
      const fb2 = buildNextGameBullet(nextLine, schedule, conference);
      const fb3 = buildChampOddsBullet(champOdds, tier);
      if (fb1) bullets.push(fb1);
      if (fb2) bullets.push(fb2);
      if (fb3) bullets.push(fb3);
    }

    return [lead, ...bullets].filter(Boolean).join('\n\n');
  } catch {
    return 'Intel briefing loading. Check back in a moment.';
  }
}
