/**
 * buildNflCaption — Instagram captions for the NFL Content Studio.
 *
 * Reads only the normalized payload (normalizeNflStudioPayload), so a caption
 * can never claim something the slides do not show. Returns the shape
 * normalizeStudioCaption() expects: { shortCaption, longCaption, hashtags }.
 * shortCaption is what gets published; longCaption adds the detail lines.
 *
 * Voice: say the number, say the price, say why, and admit what was passed
 * on. No guarantees, no "locks", no invented stats.
 */

const SITE = 'maximussports.ai';
// Short link straight to this week's picks (a redirect in vercel.json), so a
// post about picks does not send people to the home page first.
const PICKS = `${SITE}/picks`;
const RESPONSIBLE = '21+. For entertainment only. Gambling problem? Call 1-800-GAMBLER.';

function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function join(lines) {
  return lines.filter((l) => l != null && l !== false && String(l).trim() !== '').join('\n');
}

function blocks(parts) {
  return parts.filter((p) => p != null && String(p).trim() !== '').join('\n\n');
}

function tagify(s) {
  return `#${String(s || '').replace(/[^A-Za-z0-9]/g, '')}`;
}

function baseTags(payload) {
  const tags = ['#NFL'];
  if (payload.week != null) tags.push(`#NFLWeek${payload.week}`);
  tags.push('#NFLPicks', '#NFLBetting', '#SportsBetting', '#MaximusSports');
  return tags;
}

function pickLine(p) {
  const where = p.matchupLabel ? `, ${p.matchupLabel}` : '';
  const price = p.priceLabel ? ` (${p.priceLabel})` : '';
  return `${p.label}${where}${price}`;
}

function pickMath(p) {
  const bits = [];
  if (p.fairPrice && p.offeredPrice) bits.push(`Fair price ${p.fairPrice}, offered ${p.offeredPrice}`);
  if (p.hitPct) bits.push(`wins ${p.hitPct}${p.pushPct ? ` and pushes ${p.pushPct}` : ''}`);
  else if (p.marketPct && p.modelPct) bits.push(`market ${p.marketPct}, Maximus ${p.modelPct}`);
  if (p.evLabel) bits.push(`expected value ${p.evLabel}`);
  if (!bits.length) return '';
  const s = bits.join(', ');
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}

function passLine(meta) {
  if (!meta.marketsChecked || !meta.held) return null;
  return `We checked ${plural(meta.marketsChecked, 'market')} and passed on ${meta.held}. Passing is part of the model.`;
}

function slateCaption(payload) {
  const { slateLabel, meta, topPick, upcoming, titleRace } = payload;
  const games = upcoming.length || meta.gamesOnSlate;
  const hook = meta.picksPublished > 0
    ? `${slateLabel}: ${plural(games, 'game')} on the board, ${plural(meta.picksPublished, 'bet')} that cleared the bar. 🏈`
    : `${slateLabel}: ${plural(games, 'game')} on the board and no bet that clears the bar yet. We wait for a price. 🏈`;

  const withSpread = upcoming.filter((g) => g.spreadHome != null);
  const biggest = [...withSpread].sort((a, b) => Math.abs(b.spreadHome) - Math.abs(a.spreadHome))[0];
  const tightest = [...withSpread].sort((a, b) => Math.abs(a.spreadHome) - Math.abs(b.spreadHome))[0];
  const highTotal = [...upcoming].filter((g) => g.total != null).sort((a, b) => b.total - a.total)[0];

  const detail = join([
    topPick && `Best number: ${pickLine(topPick)}. ${pickMath(topPick)}`.trim(),
    biggest && `Biggest favorite: ${biggest.spreadLabel} over ${biggest.favorite.abbrev === biggest.home.abbrev ? biggest.away.abbrev : biggest.home.abbrev}.`,
    tightest && tightest !== biggest && `Closest line: ${tightest.away.abbrev} @ ${tightest.home.abbrev} (${tightest.spreadLabel}).`,
    highTotal && `Highest total: ${highTotal.away.abbrev} @ ${highTotal.home.abbrev} at ${highTotal.total}.`,
    titleRace.length >= 3 && `Title race: ${titleRace.slice(0, 3).map((t) => `${t.abbrev} ${t.titleOddsLabel}`).join(', ')}.`,
  ]);

  const cta = `Every game, every price, every reason: ${PICKS}`;
  return {
    shortCaption: blocks([hook, topPick && `Best number: ${pickLine(topPick)}. ${pickMath(topPick)}`.trim(), passLine(meta), cta, RESPONSIBLE]),
    longCaption: blocks([hook, detail, passLine(meta), cta, RESPONSIBLE]),
    hashtags: baseTags(payload),
  };
}

/**
 * The daily post. Built to be sent and argued with: a hook that fits in the
 * first line Instagram shows, short lines, one question, one "send this"
 * prompt, and the record link so the wins can be checked.
 */
function dailyCaption(payload) {
  const d = payload.daily;
  if (!d?.ready) return null;
  const { hits: h, tonight: t, ahead: a } = d;

  const top = h?.rows?.[0];
  const hook = h
    ? `${plural(h.count, 'call')} cashed on ${h.dayName}. ${top ? `${top.label} was the cleanest.` : ''} ✅`.replace('  ', ' ')
    : t
      ? `${t.away.abbrev} at ${t.home.abbrev} tonight. Here is our number. 🏈`
      : `${a.totalGames} NFL games in the next week. These are the ones to circle. 🏈`;

  const hitLines = !h ? null : join([
    `${h.dayName}'s winners:`,
    ...h.rows.slice(0, 4).map((r) => `✓ ${r.label} (${r.matchup})${r.note ? `, ${r.note.toLowerCase()}` : ''}`),
    h.count > 4 && `and ${h.count - 4} more.`,
  ]);

  const tonightLine = !t ? null : (t.pick
    ? `Tonight: ${t.away.abbrev} at ${t.home.abbrev}, ${t.kickoffTime}. We have ${t.pick.label} at ${t.pick.offeredPrice || t.pick.priceLabel}${t.pick.book ? ` (${t.pick.book})` : ''}.`
    : `Tonight: ${t.away.abbrev} at ${t.home.abbrev}, ${t.kickoffTime}. No bet clears the bar at these prices, and passing is part of the model.`);

  const circle = a.games.slice(0, 3).map((g) => `${g.away.abbrev} at ${g.home.abbrev} (${g.window})`).join(', ');
  const aheadLine = a.games.length === 0 ? null : (a.thanksgivingGames > 0
    ? `Then a short week: ${plural(a.thanksgivingGames, 'game')} on Thanksgiving. Circle ${circle}.`
    : `Coming up: ${circle}.`);

  const question = t
    ? `Who are you taking tonight, ${t.away.abbrev} or ${t.home.abbrev}? Call it below. 👇`
    : a.games[0] ? `Which game are you circling? Call it below. 👇` : null;
  const send = a.thanksgivingGames > 0
    ? 'Send this to the group chat before the Thanksgiving lines move.'
    : 'Send this to the friend who always has a take.';
  const proof = h ? `Wins only above. Full record, losses included: ${SITE}/record` : null;
  const cta = `Every pick, every price, every reason: ${PICKS}`;

  const tags = [...baseTags(payload)];
  if (t) tags.push(tagify(`${t.away.abbrev}vs${t.home.abbrev}`));
  if (t?.window === 'Monday night') tags.push('#MNF');
  if (a.thanksgivingGames > 0) tags.push('#Thanksgiving');

  return {
    shortCaption: blocks([hook, tonightLine, aheadLine, question, send, proof, RESPONSIBLE]),
    longCaption: blocks([hook, hitLines, tonightLine, aheadLine, question, send, proof, cta, RESPONSIBLE]),
    hashtags: tags,
  };
}

function picksCaption(payload) {
  const { slateLabel, heroPicks, meta } = payload;
  if (heroPicks.length === 0) return null;
  const hook = `${slateLabel} picks are in. ${plural(heroPicks.length, 'bet')} cleared the bar${meta.marketsChecked ? ` out of ${plural(meta.marketsChecked, 'market')} checked` : ''}. 🏈`;

  const shortList = heroPicks.map((p, i) => `${i + 1}. ${pickLine(p)}`).join('\n');
  const longList = heroPicks
    .map((p, i) => join([`${i + 1}. ${pickLine(p)}`, pickMath(p) && `   ${pickMath(p)}`, p.reasons[2] && `   ${p.reasons[2]}`]))
    .join('\n\n');

  const promise = 'Each pick is locked at a real price at a real book and graded on that ticket. Wins and losses both get posted.';
  const cta = `Full reasoning for every pick: ${PICKS}`;
  return {
    shortCaption: blocks([hook, shortList, promise, cta, RESPONSIBLE]),
    longCaption: blocks([hook, longList, promise, cta, RESPONSIBLE]),
    hashtags: baseTags(payload),
  };
}

function gameCaption(payload) {
  const g = payload.selectedGame;
  if (!g || !g.away || !g.home) return null;
  const hook = `${g.away.name} at ${g.home.name}${g.kickoffLabel ? `, ${g.kickoffLabel}` : ''}${g.network ? ` on ${g.network}` : ''}. 🏈`;

  const proj = g.projection && g.projection.homePoints != null && g.projection.awayPoints != null
    ? `Maximus projection: ${g.home.abbrev} ${Math.round(g.projection.homePoints)}, ${g.away.abbrev} ${Math.round(g.projection.awayPoints)}${g.winProbLabel ? ` (${g.winProbLabel} to win)` : ''}.`
    : null;
  const line = g.spreadLabel || g.total != null
    ? `Market: ${[g.spreadLabel, g.total != null ? `total ${g.total}` : null].filter(Boolean).join(', ')}.`
    : null;
  const qbs = g.quarterbacks.away && g.quarterbacks.home
    ? `Quarterbacks: ${g.quarterbacks.away.name}${g.quarterbacks.away.changed ? ' (new starter)' : ''} against ${g.quarterbacks.home.name}${g.quarterbacks.home.changed ? ' (new starter)' : ''}.`
    : null;
  const wx = g.weather && !g.weather.indoor && g.weather.wind != null
    ? `Weather: ${g.weather.temp != null ? `${g.weather.temp}°F, ` : ''}${g.weather.wind} mph wind.`
    : g.weather?.indoor ? 'Indoors, so weather is off the table.' : null;
  const angle = g.situations[0]?.note ? `Angle: ${g.situations[0].note}` : null;
  const verdict = g.picks.length > 0
    ? `Maximus pick: ${g.picks.map((p) => `${p.label}${p.priceLabel ? ` (${p.priceLabel})` : ''}`).join(' and ')}. ${pickMath(g.picks[0])}`.trim()
    : 'Maximus verdict: no bet. The price is fair, so we pass.';

  const cta = `The full breakdown: ${SITE}`;
  const tags = [...baseTags(payload)];
  for (const t of [g.away, g.home]) {
    const nick = (t.name || '').split(' ').pop();
    if (nick) tags.splice(2, 0, tagify(nick));
  }
  return {
    shortCaption: blocks([hook, join([line, proj]), verdict, cta, RESPONSIBLE]),
    longCaption: blocks([hook, join([line, proj, qbs, wx, angle]), verdict, cta, RESPONSIBLE]),
    hashtags: [...new Set(tags)].slice(0, 8),
  };
}

function receiptsCaption(payload) {
  const r = payload.receipts;
  if (!r.hasGraded) return null;
  const hook = `Receipts. ${r.scope}: ${r.recordLabel} on published picks${r.unitsLabel ? `, ${r.unitsLabel}` : ''}${r.roiLabel ? `, ${r.roiLabel} ROI` : ''}.`;
  const clv = r.beatCloseLabel && r.clvSample > 0
    ? `Beat the closing line on ${r.beatCloseLabel} of ${plural(r.clvSample, 'ticket')}. That is the number that says whether the price was good, win or lose.`
    : null;
  const mark = { won: 'W', lost: 'L', push: 'P' };
  const list = r.recent
    .map((p) => `${mark[p.status]}  ${p.label}${p.matchupLabel ? `, ${p.matchupLabel}` : ''}${p.finalScore ? ` (${p.finalScore})` : ''}`)
    .join('\n');
  const promise = 'Every pick is locked before kickoff and graded at the price we posted. The losses stay up.';
  const cta = `Every pick, price and result: ${SITE}/record`;
  return {
    shortCaption: blocks([hook, clv, promise, cta, RESPONSIBLE]),
    longCaption: blocks([hook, clv, list, promise, cta, RESPONSIBLE]),
    hashtags: baseTags(payload),
  };
}

function teamCaption(payload) {
  const t = payload.team;
  if (!t) return null;
  const hook = `${t.name}: ${t.record}${t.standingLabel ? `, ${t.standingLabel}` : ''}. 🏈`;
  const outlook = join([
    t.playoffLabel && `Playoff chances: ${t.playoffLabel}.${t.projectedWinsLabel ? ` Projected wins: ${t.projectedWinsLabel}.` : ''}`,
    t.titleOddsLabel && `Super Bowl price: ${t.titleOddsLabel}.`,
    t.powerRank && `Maximus power rank: ${t.powerRank} of 32.`,
  ]);
  const n = t.next;
  const nextLine = n
    ? join([
        `Next: ${n.isHome ? 'vs' : 'at'} ${n.opponent.name}${n.kickoffLabel ? `, ${n.kickoffLabel}` : ''}.`,
        (n.spreadLabel || n.total != null) && `Line: ${[n.spreadLabel, n.total != null ? `total ${n.total}` : null].filter(Boolean).join(', ')}.`,
        n.winPct && `Maximus gives the ${t.nickname} a ${n.winPct} chance to win.`,
        n.pick ? `Our bet in this one: ${n.pick.label}${n.pick.priceLabel ? ` (${n.pick.priceLabel})` : ''}.` : 'No bet in this one. The price is fair.',
      ])
    : (t.onBye ? `The ${t.nickname} are on a bye this week.` : null);
  const cta = `The full ${t.nickname} breakdown: ${SITE}`;
  const tags = [...baseTags(payload)];
  tags.splice(1, 0, tagify(t.nickname));
  return {
    shortCaption: blocks([hook, nextLine, cta, RESPONSIBLE]),
    longCaption: blocks([hook, outlook, nextLine, cta, RESPONSIBLE]),
    hashtags: [...new Set(tags)].slice(0, 8),
  };
}

function reviewCaption(payload) {
  const r = payload.review;
  if (!r || r.finals === 0) return null;
  const hook = r.wrongSide === 0
    ? `${payload.slateLabel} so far: right winner in ${r.finals === 1 ? 'the one game played' : `all ${r.finals} games`}. The scores are where we missed. 🏈`
    : `${payload.slateLabel} so far: Maximus called ${r.rightSide} of ${plural(r.finals, 'winner')}. Here is what we got wrong. 🏈`;
  const misses = r.misses
    .map((m) => `${m.matchupLabel}: projected ${m.projected}, finished ${m.actual}. Off by ${m.missPts} points${m.rightSide ? '' : ', and on the wrong side'}.`)
    .join('\n');
  const picks = r.lostPicks.length
    ? `Losing bets: ${r.lostPicks.map((k) => `${k.label} (${k.matchupLabel})`).join(', ')}.`
    : null;
  const avg = r.avgMiss != null ? `Average miss on the margin: ${r.avgMiss} points.` : null;
  const promise = 'We post the misses the same way we post the wins.';
  const cta = `Every pick, price and result: ${SITE}/record`;
  return {
    shortCaption: blocks([hook, avg, picks, promise, cta, RESPONSIBLE]),
    longCaption: blocks([hook, misses, avg, picks, promise, cta, RESPONSIBLE]),
    hashtags: baseTags(payload),
  };
}

function explainCaption(payload) {
  const e = payload.explainer;
  if (!e) return null;
  const body = e.points.map((p, i) => `${i + 1}. ${p}`).join('\n');
  const cta = `See it applied to every game this week: ${PICKS}`;
  return {
    shortCaption: blocks([`${e.title} Save this one. 🏈`, body, e.closer, cta, RESPONSIBLE]),
    longCaption: blocks([`${e.title} Save this one. 🏈`, body, e.example, e.closer, cta, RESPONSIBLE]),
    hashtags: ['#NFL', '#SportsBetting', '#BettingTips', '#NFLBetting', '#MaximusSports'],
  };
}

/** @returns {{shortCaption:string,longCaption:string,hashtags:string[]}|null} null when the section has nothing to say. */
export function buildNflCaption(payload) {
  if (!payload) return null;
  switch (payload.section) {
    case 'nfl-daily': return dailyCaption(payload);
    case 'nfl-slate': return slateCaption(payload);
    case 'nfl-picks': return picksCaption(payload);
    case 'nfl-game': return gameCaption(payload);
    case 'nfl-receipts': return receiptsCaption(payload);
    case 'nfl-team': return teamCaption(payload);
    case 'nfl-review': return reviewCaption(payload);
    case 'nfl-explain': return explainCaption(payload);
    default: return null;
  }
}
