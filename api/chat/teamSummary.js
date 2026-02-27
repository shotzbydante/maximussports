/**
 * GET /api/chat/teamSummary?teamSlug=...&force=0|1
 * Three-tier KV cache for AI-generated team page summaries.
 * fresh KV (15 min) → lastKnown KV (72 h) → generate inline (force=1) or kick background.
 */

import { getJson, setJson } from '../_globalCache.js';
import { getOriginFromReq, getQueryParam } from '../_requestUrl.js';

const FRESH_TTL_SEC = 15 * 60;
const LASTKNOWN_TTL_SEC = 72 * 3600;
const OPENAI_MODEL = 'gpt-4o-mini';
const MAX_TOKENS = 380;
const FETCH_TIMEOUT_MS = 5000;
const OPENAI_TIMEOUT_MS = 20000;

const isDev = process.env.NODE_ENV !== 'production';

function freshKey(slug) { return `chat:team:${slug}:summary:v1`; }
function lastKnownKey(slug) { return `chat:team:${slug}:lastKnown:v1`; }

function getPstDate() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

async function fetchJsonSafe(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (err) {
    clearTimeout(t);
    if (isDev) console.warn('[chat/teamSummary] fetchJsonSafe failed', url, err?.message);
    return null;
  }
}

async function gatherTeamData(origin, slug) {
  const [teamResult, nextLineResult] = await Promise.allSettled([
    fetchJsonSafe(`${origin}/api/team/${slug}`),
    fetchJsonSafe(`${origin}/api/odds/teamNextLine/${slug}`),
  ]);

  const team = teamResult.status === 'fulfilled' && teamResult.value ? teamResult.value : {};
  const nextLineData = nextLineResult.status === 'fulfilled' && nextLineResult.value ? nextLineResult.value : {};

  return {
    team: team.team ?? {},
    schedule: team.schedule ?? { upcoming: [], recent: [] },
    ats: team.ats ?? {},
    teamNews: team.teamNews ?? [],
    rank: team.rank ?? null,
    nextLine: nextLineData,
  };
}

function winLoss(rec) {
  if (!rec || rec.total == null) return null;
  const w = rec.w ?? 0;
  const l = rec.l ?? 0;
  if (w + l === 0) return null;
  return `${w}-${l}`;
}

function buildPrompt(data) {
  const { team, schedule, ats, teamNews, rank, nextLine } = data;
  const teamName = team.name || 'This team';
  const conference = team.conference || '';
  const oddsTier = team.oddsTier || '';
  const recent = (schedule.recent || []).slice(0, 5);
  const upcoming = (schedule.upcoming || []).slice(0, 3);

  const recentLines = recent.length
    ? recent.map((g) => {
        const opp = g.opponent || g.awayTeam || g.homeTeam || 'Unknown';
        const score = (g.homeScore != null && g.awayScore != null) ? ` ${g.awayScore}–${g.homeScore}` : '';
        const result = g.result || '';
        return `${result} vs ${opp}${score}`;
      }).join(', ')
    : 'No recent results.';

  const atsRec = ats.last7 || ats.last30 || ats.season;
  const atsWl = winLoss(atsRec);
  const atsPct = atsRec?.coverPct != null ? `${atsRec.coverPct}%` : null;
  const atsVibe = atsRec?.coverPct >= 55
    ? 'Sharp money has noticed — they\'re beating the number.'
    : atsRec?.coverPct <= 45
      ? 'Struggling ATS. Market may be pricing them too high.'
      : 'Right around the number; no strong edge yet.';
  const atsLine = atsWl
    ? `ATS record: ${atsWl}${atsPct ? ` (${atsPct} cover)` : ''}. ${atsVibe}`
    : 'ATS data not yet available.';

  const nextEvent = nextLine.nextEvent;
  const consensus = nextLine.consensus || {};
  let nextGameLine = 'Next game line not yet available.';
  if (nextEvent) {
    const opp = nextEvent.opponent || nextEvent.awayTeam || nextEvent.homeTeam || 'TBD';
    const parts = [`vs ${opp}`];
    if (consensus.spread != null) parts.push(`spread ${consensus.spread > 0 ? '+' : ''}${consensus.spread}`);
    if (consensus.total != null) parts.push(`total ${consensus.total}`);
    if (consensus.moneyline != null) parts.push(`ML ${consensus.moneyline > 0 ? '+' : ''}${consensus.moneyline}`);
    nextGameLine = parts.join(' | ');
  } else if (upcoming.length > 0) {
    const next = upcoming[0];
    const opp = next.opponent || next.awayTeam || next.homeTeam || 'TBD';
    nextGameLine = `Up next vs ${opp} — line TBD.`;
  }

  const headlineLines = teamNews.slice(0, 4).map((h) => `- ${h.title || h}`).join('\n') || 'No recent headlines.';

  const rankLabel = rank != null ? `#${rank} nationally` : 'unranked';
  const tierLabel = oddsTier ? `Bracket tier: ${oddsTier}.` : '';

  const systemPrompt = `You are a sharp, witty college basketball analyst for Maximus Sports. Write a concise team insight in 4 short paragraphs using ONLY the data provided. Do not invent facts. If data is missing, skip that point gracefully.

FORMAT (4 paragraphs, no headers):
1. Team identity + rank + recent form (last 3–5 games, trend).
2. ATS interpretation — use bettor language: "covering the number", "market hasn't caught up", "priced aggressively", "sharp money". Include cover % and trend.
3. Next game: opponent + spread + total + moneyline if available. Frame it as a betting angle.
4. News pulse: 1–3 headlines + a punchy closing hook.

STYLE RULES:
- 120–220 words total.
- Bold (using **text**) only 1–2 team names or one key phrase per paragraph — not full sentences.
- Max 1 emoji per paragraph: 🔥 😬 👀 🚨 🏆
- Conversational, confident, bettor-friendly tone. Zero profanity.
- One brief clean quote ONLY in paragraph 1 if it fits naturally (SportsCenter energy or movie motivation).`;

  const userPrompt = `Today (PST): ${getPstDate()}

Team: ${teamName}
Ranking: ${rankLabel}
Conference: ${conference || 'Not specified'}
${tierLabel}

Recent results (last 5): ${recentLines}

ATS: ${atsLine}

Next game line: ${nextGameLine}

Headlines:
${headlineLines}

Write the team insight now.`;

  return { systemPrompt, userPrompt };
}

async function generateWithOpenAI(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    if (isDev) console.warn('[chat/teamSummary] OPENAI_API_KEY not set');
    return null;
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: MAX_TOKENS,
        temperature: 0.5,
      }),
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!r.ok) {
      const errBody = await r.text().catch(() => '');
      console.error('[chat/teamSummary] OpenAI error', r.status, errBody.slice(0, 200));
      return null;
    }
    const data = await r.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    clearTimeout(t);
    console.error('[chat/teamSummary] OpenAI fetch error', err?.message);
    return null;
  }
}

function kickBackgroundGenerate(origin, slug) {
  if (!origin || !slug) return;
  try {
    fetch(`${origin}/api/chat/teamSummary?teamSlug=${encodeURIComponent(slug)}&force=1&bg=1`).catch(() => {});
  } catch (_) {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const teamSlug = getQueryParam(req, 'teamSlug', '');
  if (!teamSlug || typeof teamSlug !== 'string' || teamSlug.trim() === '') {
    return res.status(400).json({ error: 'teamSlug is required' });
  }
  const slug = teamSlug.trim().toLowerCase();
  const force = getQueryParam(req, 'force') === '1';
  const bg = getQueryParam(req, 'bg') === '1';

  const fKey = freshKey(slug);
  const lKey = lastKnownKey(slug);

  // ── Force-generate path ───────────────────────────────────────────────────
  if (force) {
    const origin = getOriginFromReq(req);
    if (!origin) {
      if (isDev) console.log('[chat/teamSummary] force=1 but origin unavailable');
      return res.status(200).json({ summary: null, status: 'missing', reason: 'no_origin' });
    }
    if (isDev) console.log('[chat/teamSummary] force=1, gathering data for', slug);
    let summary = null;
    try {
      const pageData = await gatherTeamData(origin, slug);
      const { systemPrompt, userPrompt } = buildPrompt(pageData);
      summary = await generateWithOpenAI(systemPrompt, userPrompt);
      if (summary) {
        const payload = { summary, generatedAt: new Date().toISOString() };
        await Promise.all([
          setJson(fKey, payload, { exSeconds: FRESH_TTL_SEC }),
          setJson(lKey, payload, { exSeconds: LASTKNOWN_TTL_SEC }),
        ]).catch((e) => console.warn('[chat/teamSummary] KV write error', e?.message));
        if (isDev) console.log('[chat/teamSummary] generated + wrote KV for', slug);
      }
    } catch (err) {
      console.error('[chat/teamSummary] generate error', err?.message);
    }
    return res.status(200).json({
      summary: summary ?? null,
      status: summary ? 'fresh' : 'missing',
      generatedAt: summary ? new Date().toISOString() : null,
    });
  }

  // ── Read fresh KV ─────────────────────────────────────────────────────────
  const fresh = await getJson(fKey).catch(() => null);
  if (fresh?.summary && fresh?.generatedAt) {
    const ageMs = Date.now() - new Date(fresh.generatedAt).getTime();
    if (ageMs < FRESH_TTL_SEC * 1000) {
      if (isDev) console.log('[chat/teamSummary] fresh hit', slug, { ageSec: Math.round(ageMs / 1000) });
      return res.status(200).json({ summary: fresh.summary, status: 'fresh', generatedAt: fresh.generatedAt });
    }
  }

  // ── Read lastKnown KV ─────────────────────────────────────────────────────
  const lastKnown = await getJson(lKey).catch(() => null);
  const origin = getOriginFromReq(req);

  if (!bg) kickBackgroundGenerate(origin, slug);

  if (lastKnown?.summary) {
    if (isDev) console.log('[chat/teamSummary] lastKnown hit', slug, ', kicked background generate');
    return res.status(200).json({ summary: lastKnown.summary, status: 'stale', generatedAt: lastKnown.generatedAt });
  }

  if (isDev) console.log('[chat/teamSummary] missing', slug, ', kicked background generate');
  return res.status(200).json({ summary: null, status: 'missing' });
}
