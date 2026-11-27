/**
 * GET /nfl-picks — this week's NFL picks in plain HTML, for search engines
 * and AI agents (the board at /nfl/insights needs JavaScript).
 *
 * It shows what a signed-out visitor sees on the board: the recommended
 * picks and the strongest lean in each other market, each with its price,
 * sportsbook and kickoff, plus the week's schedule with the market lines.
 * It carries no reasons and no model numbers.
 */
import { getLatestNflPicksBoard } from '../_lib/nflPicksBuilder.js';
import { byConviction, freeLeans } from '../../src/components/nfl/home/pickHelpers.js';
import { ORIGIN, SITE, FAQ } from '../../src/seo/siteCopy.js';
import { page, send, esc } from './_site.js';

const ET = (iso, opts) => { try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', ...opts }); } catch { return ''; } };
const kickoff = (iso) => (iso ? `${ET(iso, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET` : '');
const stamp = (iso) => (iso ? `${ET(iso, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET` : '');
const matchup = (m) => `${m?.awayTeam?.name || m?.awayTeam?.shortName || 'Away'} at ${m?.homeTeam?.name || m?.homeTeam?.shortName || 'Home'}`;
const MARKET = { runline: 'Spread', total: 'Over/under', moneyline: 'Moneyline' };
const signed = (v) => (v > 0 ? `+${v}` : v === 0 ? 'PK' : `${v}`);

/** The board cut down to what the public page states. Pure: no clock but `now`. */
export function publicPicks(board, { now = Date.now() } = {}) {
  const upcoming = (p) => (Date.parse(p?.matchup?.startTime) || 0) > now;
  const tiers = board?.tiers || {};
  const recommended = [...(tiers.tier1 || []), ...(tiers.tier2 || []), ...(tiers.tier3 || [])].filter(upcoming).sort(byConviction);
  const ids = new Set(recommended.map((p) => p.id));
  const leans = (board?.fullSlatePicks || []).filter((p) => !ids.has(p.id) && upcoming(p)).sort(byConviction);
  const row = (p) => ({
    label: p.selection?.label || '',
    market: MARKET[p.market?.type] || '',
    price: p.selection?.priceLabel || '',
    matchup: matchup(p.matchup),
    kickoff: kickoff(p.matchup?.startTime),
    lockedAt: p.lock?.lockedAt ? stamp(p.lock.lockedAt) : '',
  });
  const games = (board?.byGame || [])
    .filter((g) => (Date.parse(g.startTime) || 0) > now)
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
    .map((g) => ({
      matchup: matchup(g),
      startTime: g.startTime,
      kickoff: kickoff(g.startTime),
      spread: Number.isFinite(g.market?.spreadHome) ? `${g.homeTeam?.shortName || 'Home'} ${signed(g.market.spreadHome)}` : '',
      total: Number.isFinite(g.market?.total) ? String(g.market.total) : '',
      home: g.homeTeam?.name, away: g.awayTeam?.name,
    }));
  return {
    week: board?.week ? `Week ${board.week}` : 'this week',
    updated: board?.generatedAt ? stamp(board.generatedAt) : '',
    recommended: recommended.map(row),
    leans: freeLeans(leans, recommended, 3).map(row),
    games,
    calls: leans.length + recommended.length,
  };
}

export function renderNflPicks(board, { now = Date.now() } = {}) {
  const d = publicPicks(board, { now });
  const title = `NFL Picks ${d.week === 'this week' ? 'This Week' : d.week}: Spread, Over/Under and Moneyline | Maximus Sports`;
  const description = `Free NFL picks for ${d.week}: ${d.recommended.length ? d.recommended.slice(0, 3).map((p) => p.label).join(', ') : 'a call on every game'}. Each pick shows the price and sportsbook it was locked at, and every result is graded in public.`;
  const pickCard = (p, tag) => `<div class="card"><p><span class="tag${tag === 'Lean' ? ' lean' : ''}">${tag}</span><span class="meta">${esc(p.market)}</span></p><h3>${esc(p.label)}${p.price ? ` <span class="meta">${esc(p.price)}</span>` : ''}</h3><p>${esc(p.matchup)}. Kickoff ${esc(p.kickoff)}.</p>${p.lockedAt ? `<p class="meta">Locked ${esc(p.lockedAt)}. Lines move: check the price before you bet.</p>` : ''}</div>`;
  const body = `
<h1>NFL picks ${esc(d.week === 'this week' ? 'this week' : `for ${d.week}`)}</h1>
<p class="lead">Maximus Sports makes a call on every NFL game against the spread, on the over/under and on the moneyline. A pick is recommended only when a sportsbook’s price beats the market’s fair price. Every pick and lean is graded in public.</p>
${d.updated ? `<p class="meta">Board updated ${esc(d.updated)}.</p>` : ''}
<p><a class="cta" href="/nfl/insights">Open the full board</a><a class="cta" href="/nfl/ask">Ask Maximus about a game</a></p>

<h2>Recommended picks</h2>
${d.recommended.length
    ? d.recommended.map((p) => pickCard(p, 'Recommended')).join('\n')
    : '<p>No price clears the bar for a recommendation right now. That is normal: most games are not worth a bet, and the board says so.</p>'}

${d.leans.length ? `<h2>Top leans</h2>
<p>A lean is the model’s side when no sportsbook price beats the market. It is tracked and graded, not recommended.</p>
${d.leans.map((p) => pickCard(p, 'Lean')).join('\n')}` : ''}

${d.games.length ? `<h2>NFL games and lines</h2>
<table>
<tr><th>Game</th><th>Kickoff</th><th>Spread</th><th>Total</th></tr>
${d.games.map((g) => `<tr><td>${esc(g.matchup)}</td><td>${esc(g.kickoff)}</td><td>${esc(g.spread)}</td><td>${esc(g.total)}</td></tr>`).join('\n')}
</table>
<p>The board has a call on each of these games in every market${d.calls ? `, ${d.calls} calls in all` : ''}. <a href="/nfl/insights">A free account opens all of them</a>, and sends the picks by email on Thursday and Sunday.</p>` : ''}

<h2>How the picks are graded</h2>
<p>${esc(FAQ.find((f) => /record is real/.test(f.q)).a)} <a href="/record">Read the public record</a>.</p>
<h3>${esc(FAQ.find((f) => /lean/.test(f.q)).q)}</h3>
<p>${esc(FAQ.find((f) => /lean/.test(f.q)).a)}</p>
`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `NFL games ${d.week}`,
    url: `${ORIGIN}/nfl-picks`,
    isPartOf: { '@type': 'WebSite', name: SITE.name, url: ORIGIN },
    itemListElement: d.games.map((g, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'SportsEvent', name: g.matchup, startDate: g.startTime, sport: 'American football',
        homeTeam: { '@type': 'SportsTeam', name: g.home }, awayTeam: { '@type': 'SportsTeam', name: g.away },
      },
    })),
  };
  return page({ title, description, path: '/nfl-picks', body, jsonLd });
}

export default async function handler(req, res) {
  const board = await getLatestNflPicksBoard().catch(() => null);
  // Fresh enough to follow a line move, cached enough to be cheap.
  return send(res, renderNflPicks(board), { maxAge: 600 });
}
