/**
 * GET /api/mlb/chat/homeSummary?force=0|1
 * AI-generated MLB home briefing using OpenAI + Odds API + Google News.
 * Three-tier KV cache: fresh (15 min) → lastKnown (72 h) → generate.
 * Mirrors the NCAAM homeSummary architecture.
 */

import { getJson, setJson, tryAcquireLock } from '../../_globalCache.js';
import { getQueryParam } from '../../_requestUrl.js';
import { createCache } from '../../_cache.js';
import { MLB_TEAMS } from '../../../src/sports/mlb/teams.js';

const FRESH_KEY      = 'chat:mlb:home:summary:v2';
const LASTKNOWN_KEY  = 'chat:mlb:home:lastKnown:v2';
const GEN_LOCK_KEY   = 'chat:mlb:home:genLock';
const FORCE_LOCK_KEY = 'chat:mlb:home:forceLock';

const FRESH_TTL_SEC      = 15 * 60;
const LASTKNOWN_TTL_SEC  = 72 * 3600;
const GEN_LOCK_TTL_SEC   = 90;
const FORCE_LOCK_TTL_SEC = 45;

const OPENAI_MODEL    = 'gpt-4o-mini';
const MAX_TOKENS      = 1200;
const TEMPERATURE     = 0.5;
const OPENAI_TIMEOUT  = 18000;
const NEWS_FETCH_TIMEOUT_MS = 5000;

const isDev = process.env.NODE_ENV !== 'production';

const MLB_QUERIES = [
  'MLB baseball',
  'MLB trade rumors',
  'MLB injuries roster moves',
  'MLB standings',
];

const newsCache = createCache(15 * 60 * 1000);

const APPROVED_QUOTES = [
  'Juuuuuuuuust a bit outside.',
  'It might be, it could be, it IS!',
  'How about that!',
  "You can't stop what you can't catch.",
  'Holy cow!',
  'Touch \'em all!',
  'Going, going, gone!',
  "That ball is high! It is far! It is... gone!",
  'And the pitch...',
].join(' | ');

function getPstDate() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function impliedPct(american) {
  if (american == null) return null;
  const p = american < 0 ? (-american) / ((-american) + 100) : 100 / (american + 100);
  return Math.round(p * 1000) / 10;
}

async function fetchGoogleNewsRSS(query) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`"${query}" when:3d`)}&hl=en-US&gl=US&ceid=US:en`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NEWS_FETCH_TIMEOUT_MS);
  let r;
  try {
    r = await fetch(rssUrl, { headers: { 'User-Agent': 'MaximusSports/1.0' }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) return [];
  const text = await r.text();
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(text)) !== null) {
    const block = match[1];
    const title = (block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/) || [])[1] || '';
    const source = (block.match(/<source[^>]*>(.*?)<\/source>/) || [])[1] || '';
    if (title) items.push({ title: title.trim(), source: source.trim() });
  }
  return items;
}

async function fetchMlbHeadlines() {
  const cached = newsCache.get('mlb:headlines:brief');
  if (cached) return cached;
  try {
    const results = await Promise.allSettled(MLB_QUERIES.map(fetchGoogleNewsRSS));
    const all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    const seen = new Set();
    const deduped = all.filter((it) => {
      const key = it.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const headlines = deduped.slice(0, 15).map((it) => ({ title: it.title, source: it.source }));
    newsCache.set('mlb:headlines:brief', headlines);
    return headlines;
  } catch { return []; }
}

async function fetchMlbOdds() {
  const kvKey = 'odds:championship:mlb:v1';
  const cached = await getJson(kvKey).catch(() => null);
  return cached?.odds ?? {};
}

async function fetchMlbStandings() {
  try {
    const year = new Date().getFullYear();
    const url = `https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings?season=${year}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) return {};
    const data = await r.json();
    const teams = {};
    const entries = data?.children?.flatMap(c => c?.standings?.entries || []) || [];
    for (const entry of entries) {
      const abbr = entry?.team?.abbreviation?.toLowerCase();
      if (!abbr) continue;
      const slugMap = { 'chw': 'cws', 'wsh': 'wsh', 'ari': 'ari' };
      const slug = slugMap[abbr] || MLB_TEAMS.find(t => t.abbrev === abbr.toUpperCase())?.slug || abbr;
      const stats = {};
      for (const s of (entry?.stats || [])) { stats[s.name] = s; }
      const wins = parseInt(stats.wins?.value) || 0;
      const losses = parseInt(stats.losses?.value) || 0;
      teams[slug] = {
        wins, losses,
        record: `${wins}-${losses}`,
        gb: parseFloat(stats.gamesBehind?.value) || 0,
        l10: stats.record?.displayValue || '',
        streak: stats.streak?.displayValue || '',
      };
    }
    // Compute division ranks
    const divGroups = {};
    for (const [s, st] of Object.entries(teams)) {
      const div = MLB_TEAMS.find(t => t.slug === s)?.division || '';
      if (!div) continue;
      st.division = div;
      if (!divGroups[div]) divGroups[div] = [];
      divGroups[div].push({ slug: s, wins: st.wins });
    }
    for (const [, group] of Object.entries(divGroups)) {
      group.sort((a, b) => b.wins - a.wins);
      group.forEach((t, i) => { teams[t.slug].rank = i + 1; });
    }
    return teams;
  } catch {
    return {};
  }
}

async function buildMlbSummaryData() {
  const [headlines, champOdds, standings] = await Promise.allSettled([
    fetchMlbHeadlines(),
    fetchMlbOdds(),
    fetchMlbStandings(),
  ]);

  return {
    headlines: headlines.status === 'fulfilled' ? headlines.value : [],
    championshipOdds: champOdds.status === 'fulfilled' ? champOdds.value : {},
    standings: standings.status === 'fulfilled' ? standings.value : {},
  };
}

function getMlbSeasonPhase() {
  const d = new Date().toISOString().slice(0, 10);
  const n = Number(d.replace(/-/g, ''));
  if (n < 20260327) return 'spring_training';
  if (n < 20260930) return 'regular_season';
  if (n < 20261101) return 'postseason';
  return 'offseason';
}

function buildPayload(data) {
  const { headlines, championshipOdds, standings } = data;

  const slugToName = Object.fromEntries(MLB_TEAMS.map((t) => [t.slug, t.name]));

  const champEntries = Object.entries(championshipOdds)
    .filter(([, v]) => v?.bestChanceAmerican != null)
    .map(([slug, v]) => {
      const o = v.bestChanceAmerican;
      return {
        team: slugToName[slug] || slug,
        slug,
        odds: typeof o === 'number' && o > 0 ? '+' + o : o,
        impliedPct: impliedPct(o),
      };
    })
    .sort((a, b) => (b.impliedPct ?? 0) - (a.impliedPct ?? 0));

  const champTop = champEntries.slice(0, 10);
  const champSleepers = champEntries.slice(10, 16);

  const headlinesTop = headlines.slice(0, 12).map((h) => ({
    title: h.title || '',
    source: h.source || 'News',
  }));

  // Build compact standings summary by division
  const standingsSummary = buildStandingsBlock(standings, slugToName);

  return {
    dateNow: getPstDate(),
    timezone: 'America/Los_Angeles',
    champOdds: champTop,
    champSleepers,
    headlines: headlinesTop,
    seasonPhase: getMlbSeasonPhase(),
    standings: standingsSummary,
  };
}

function buildStandingsBlock(standings, slugToName) {
  if (!standings || Object.keys(standings).length === 0) return null;
  const divisions = {};
  for (const [slug, st] of Object.entries(standings)) {
    const div = st.division || MLB_TEAMS.find(t => t.slug === slug)?.division || '';
    if (!div) continue;
    if (!divisions[div]) divisions[div] = [];
    divisions[div].push({
      team: slugToName[slug] || slug,
      record: st.record || `${st.wins}-${st.losses}`,
      gb: st.gb ?? 0,
      rank: st.rank ?? 99,
      l10: st.l10 || '',
    });
  }
  const result = {};
  for (const [div, teams] of Object.entries(divisions)) {
    teams.sort((a, b) => a.rank - b.rank);
    result[div] = teams.map(t => ({
      team: t.team,
      record: t.record,
      gb: t.gb === 0 ? '—' : `${t.gb} GB`,
      l10: t.l10,
    }));
  }
  return result;
}

const TEAM_EMOJIS = {
  lad: '🔵', nyy: '🗽', hou: '🚀',
  atl: '🪓', phi: '🔔', nym: '🍎',
  sd:  '🟤', sea: '⚓', bal: '🐦',
  tex: '⭐', chc: '🐻', min: '🎯',
  mil: '🍺', cle: '🛡️', det: '🐯',
  tb:  '☀️', tor: '🇨🇦', bos: '🧦',
  sf:  '🌉', stl: '🐦‍🔥', ari: '🐍',
  cws: '🖤', cin: '🔴', kc:  '👑',
  laa: '😇', mia: '🐟', oak: '🟢',
  pit: '🏴‍☠️', col: '⛰️', wsh: '🇺🇸',
};

function buildPrompt(data) {
  const payload = buildPayload(data);
  const phase = payload.seasonPhase;

  const slugToName = Object.fromEntries(MLB_TEAMS.map((t) => [t.slug, t.name]));
  const emojiMap = Object.entries(TEAM_EMOJIS)
    .map(([slug, emoji]) => `${slugToName[slug] || slug}: ${emoji}`)
    .join(', ');

  let p1, p2, p3, p4, p5;

  if (phase === 'spring_training') {
    p1 = '¶1 SPRING TRAINING INTEL: Open with 3–4 of the most compelling headlines from headlines[]. Set the scene — where are we in spring training? Reference specific stories: pitching duels, roster battles, prospect call-ups, trade rumors, or injury updates. Name the teams involved with their emoji. Be specific with details from the headlines, not generic.';
    p2 = '¶2 WORLD SERIES FUTURES & CONTENDER PULSE: Reference 4–5 top contenders from champOdds with their exact odds (positive odds MUST include "+") and their team emoji. Frame as pre-season market positioning — who the sharp money likes, how Grapefruit/Cactus League performance is (or isn\'t) shifting the market. Call out which favorites look locked in and which have questions to answer. Be analytical, not just a list.';
    p3 = '¶3 ROSTER MOVES, INJURIES & STORYLINES: Synthesize 2–3 headlines about player news — signings, injuries, trades, breakout performances, position battles. Use team emojis. Connect the dots: how does a key injury or signing shift a club\'s outlook? Reference champOdds or champSleepers if a team\'s stock should move. This should feel like inside intel, not a wire recap.';
    p4 = '¶4 SLEEPERS & VALUE PLAYS: Call out 2–3 teams from champSleepers with longer odds that could surprise. Use their emojis. Reference any headlines that support the case — a prospect arriving, a rotation upgrade, a new manager. Frame with bettor language: "value on the board", "line hasn\'t moved yet", "sharp money creeping in". Also flag 1–2 division races that look tighter than the odds suggest.';
    p5 = '¶5 DIAMOND DISPATCH & CLOSER: 2–3 remaining headlines from headlines[]. Surface any buzzy storylines — home run chases, clubhouse drama, schedule notes, Opening Day countdown. End with a punchy, energetic closer that builds anticipation for the season. Make the reader feel the season is coming. Use a baseball metaphor or call-to-action.';
  } else if (phase === 'regular_season') {
    p1 = '¶1 AROUND THE LEAGUE: Open with 3–4 top headlines from headlines[] with team emojis. Set the scene — where are we in the season? Reference specific results, trades, milestones, or breakout performances. Name teams and be specific.';
    p2 = '¶2 WORLD SERIES ODDS PULSE: Reference 4–5 teams from champOdds whose stock is moving with exact odds (positive odds MUST include "+") and team emojis. Frame as market reads — who\'s rising, who\'s fading, and why. Connect to headlines where possible.';
    p3 = '¶3 PENNANT RACE & DIVISION WATCH: Use the standings[] data to discuss 2–3 tight division races. Reference ACTUAL records, games back, and L10 trends from standings. Which teams are closing the gap? Where is separation happening? Name teams with emojis. Frame around "why it matters" — how today\'s results shift the bigger picture. Connect standings movement to champOdds where possible. This paragraph should feel like an analyst breaking down the race, not a generic summary.';
    p4 = '¶4 SLEEPERS, INJURIES & VALUE: Call out 1–2 teams from champSleepers overperforming (check standings to validate), plus any major injury/roster news from headlines[]. Frame as betting value or dark horse stories. Use team emojis.';
    p5 = '¶5 DIAMOND DISPATCH + CLOSER: 2–3 remaining headlines. Surface buzzy storylines. End with a sharp, punchy closer — what to watch tonight or this week. Make it feel urgent and premium.';
  } else if (phase === 'postseason') {
    p1 = '¶1 OCTOBER BASEBALL: We\'re in the postseason. Recap the most compelling headlines from headlines[] with team emojis. Frame the active series and elimination games with urgency and drama.';
    p2 = '¶2 WORLD SERIES ODDS: Reference 3–4 remaining contenders from champOdds with exact odds (positive MUST include "+") and team emojis. Who does the market like? How have the odds shifted?';
    p3 = '¶3 SERIES WATCH: Break down the key matchup storylines — pitching advantages, lineup depth, bullpen edges, home-field factors. Use team emojis. Frame with analytical bettor intel.';
    p4 = '¶4 UPSET WATCH & VALUE: Any underdogs with live odds from champOdds? Which series could flip? Frame as sharp-money angles with team emojis.';
    p5 = '¶5 OCTOBER CLOSER: 1–2 headlines. End with maximum October baseball energy. This is the biggest stage in baseball — make it feel like it.';
  } else {
    p1 = '¶1 OFFSEASON INTEL: Open with 3–4 headlines from headlines[] with team emojis. What\'s moving in the MLB offseason? Trades, free agency, signings, managerial changes.';
    p2 = '¶2 WORLD SERIES FUTURES: Reference 4–5 early championship favorites from champOdds with exact odds (positive MUST include "+") and team emojis. Who\'s the early market favorite and why?';
    p3 = '¶3 HOT STOVE STORYLINES: Key offseason moves and surprises from headlines[] with team emojis. Connect the dots between signings and team outlook.';
    p4 = '¶4 EARLY VALUE & SLEEPERS: 2–3 teams from champSleepers with longer odds worth tracking, with team emojis. What makes them interesting?';
    p5 = '¶5 CLOSER: Build anticipation for the upcoming season with energy and personality.';
  }

  const systemPrompt = `You are a sharp, energetic MLB baseball intelligence host for Maximus Sports — think Baseball Tonight meets sharp bettor insight meets premium editorial sports journalism.

Write a home-page daily briefing using ONLY the JSON data provided. DO NOT invent any scores, teams, odds, players, or facts not present in the data.

TEAM EMOJIS (use the matching emoji when mentioning a team by name):
${emojiMap}

FORMAT — exactly 5 substantive paragraphs (no headers, no bullet lists, no numbered sections):

${p1}

${p2}

${p3}

${p4}

${p5}

STANDINGS DATA:
- If standings[] is present, it contains REAL current MLB standings grouped by division with records, GB, and L10 trends.
- Use this data to ground your ¶3 (Pennant Race) analysis in actual standings context — reference real records and games back.
- When discussing a team's trajectory, connect their L10 record to whether they're gaining or losing ground.
- Always answer "why it matters" — don't just report standings, explain what the standings mean for the race.

STYLE RULES:
- Target 350–450 words total (hard limit: 500 words). This should feel substantive, not thin.
- Bold (**text**) team names or 1–2 key phrases per paragraph — never full sentences.
- Use the team emoji AFTER the bolded team name when first mentioned (e.g. "**Los Angeles Dodgers** 🔵").
- Max 1 additional decorative emoji per paragraph from: 🔥 😬 👀 🚨 🏆 ⚾
- Zero profanity. Clean humor only.
- APPROVED QUOTES (use at most ONE total, only if it fits naturally): ${APPROVED_QUOTES}
- NEVER use quotes not in the approved list.
- If a data section is empty, acknowledge it briefly and move on — do NOT skip the paragraph.
- Use baseball language: "pennant race", "rotation", "bullpen", "lineup", "slugger", "ace", "on the mound", "diamond", "Grapefruit League", "Cactus League", "spring training", "clubhouse", "farm system", "prospect".
- Do NOT use college basketball terminology (bracket, seed, March Madness, tournament path, bubble).
- Each paragraph should have narrative flow and editorial opinion — not just a list of facts. Connect dots, draw conclusions, frame storylines.
- Write like a premium sports intelligence product, not a wire service recap.`;

  const userPrompt = `DATA:\n${JSON.stringify(payload, null, 2)}\n\nWrite the briefing now. Exactly 5 substantive paragraphs, no headers. Use team emojis from the mapping above.`;

  return { systemPrompt, userPrompt };
}

function fixPositiveOdds(text) {
  if (!text) return text;
  return text
    .replace(/\bat\s+(\d{3,4})(?=[\s.,;!?)\-–—]|$)/g, (match, num) => {
      const n = parseInt(num, 10);
      if (n >= 100 && n <= 9999) return `at +${num}`;
      return match;
    })
    .replace(/\((\d{3,4})\)/g, (match, num) => {
      const n = parseInt(num, 10);
      if (n >= 100 && n <= 9999) return `(+${num})`;
      return match;
    });
}

async function generateWithOpenAI(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    if (isDev) console.warn('[mlb/chat/homeSummary] OPENAI_API_KEY not set');
    return null;
  }
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), OPENAI_TIMEOUT);
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE,
        }),
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        console.error('[mlb/chat/homeSummary] OpenAI error', r.status, body.slice(0, 200));
        return null;
      }
      const json = await r.json();
      const raw = json?.choices?.[0]?.message?.content?.trim() || null;
      return raw ? fixPositiveOdds(raw) : null;
    } catch (err) {
      clearTimeout(t);
      if (err?.name === 'AbortError' && attempt < maxAttempts) {
        console.warn(`[mlb/chat/homeSummary] timeout attempt ${attempt}, retrying…`);
        continue;
      }
      console[err?.name === 'AbortError' ? 'warn' : 'error']('[mlb/chat/homeSummary]', err?.message);
      return null;
    }
  }
  return null;
}

async function readCached() {
  const fresh = await getJson(FRESH_KEY).catch(() => null);
  if (fresh?.summary && fresh?.generatedAt) {
    const ageMs = Date.now() - new Date(fresh.generatedAt).getTime();
    if (ageMs < FRESH_TTL_SEC * 1000) return { summary: fresh.summary, status: 'fresh', generatedAt: fresh.generatedAt };
  }
  const lastKnown = await getJson(LASTKNOWN_KEY).catch(() => null);
  if (lastKnown?.summary) return { summary: lastKnown.summary, status: 'stale', generatedAt: lastKnown.generatedAt };
  return null;
}

async function generateAndCache() {
  const data = await buildMlbSummaryData();
  const { systemPrompt, userPrompt } = buildPrompt(data);
  const summary = await generateWithOpenAI(systemPrompt, userPrompt);
  if (summary) {
    const payload = { summary, generatedAt: new Date().toISOString() };
    await Promise.all([
      setJson(FRESH_KEY, payload, { exSeconds: FRESH_TTL_SEC }),
      setJson(LASTKNOWN_KEY, payload, { exSeconds: LASTKNOWN_TTL_SEC }),
    ]).catch((e) => console.warn('[mlb/chat/homeSummary] KV write error', e?.message));
  }
  return summary;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const force = getQueryParam(req, 'force') === '1';

  if (force) {
    const gotForceLock = await tryAcquireLock(FORCE_LOCK_KEY, FORCE_LOCK_TTL_SEC);
    if (!gotForceLock) {
      const cached = await readCached();
      return res.status(200).json({
        summary: cached?.summary ?? null,
        status: cached?.status ?? 'missing',
        generatedAt: cached?.generatedAt ?? null,
        rateLimited: true,
      });
    }
    let summary = null;
    try { summary = await generateAndCache(); }
    catch (err) { console.error('[mlb/chat/homeSummary] force error', err?.message); }
    if (summary) return res.status(200).json({ summary, status: 'fresh', generatedAt: new Date().toISOString() });
    const fallback = await readCached();
    return res.status(200).json({
      summary: fallback?.summary ?? null,
      status: fallback?.status ?? 'missing',
      generatedAt: fallback?.generatedAt ?? null,
    });
  }

  const fresh = await getJson(FRESH_KEY).catch(() => null);
  if (fresh?.summary && fresh?.generatedAt) {
    const ageMs = Date.now() - new Date(fresh.generatedAt).getTime();
    if (ageMs < FRESH_TTL_SEC * 1000) {
      return res.status(200).json({ summary: fresh.summary, status: 'fresh', generatedAt: fresh.generatedAt });
    }
  }

  const lastKnown = await getJson(LASTKNOWN_KEY).catch(() => null);

  if (lastKnown?.summary) {
    tryAcquireLock(GEN_LOCK_KEY, GEN_LOCK_TTL_SEC).then((acquired) => {
      if (acquired) generateAndCache().catch(() => {});
    }).catch(() => {});
    return res.status(200).json({ summary: lastKnown.summary, status: 'stale', generatedAt: lastKnown.generatedAt });
  }

  const gotLock = await tryAcquireLock(GEN_LOCK_KEY, GEN_LOCK_TTL_SEC);
  if (gotLock) {
    try {
      const summary = await generateAndCache();
      if (summary) {
        return res.status(200).json({ summary, status: 'fresh', generatedAt: new Date().toISOString() });
      }
    } catch (err) {
      console.error('[mlb/chat/homeSummary] inline gen error', err?.message);
    }
  }

  return res.status(200).json({ summary: null, status: 'missing' });
}
