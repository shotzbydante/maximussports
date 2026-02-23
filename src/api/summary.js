/**
 * Summary API — Home recap (POST + SSE) and pinned team card summary.
 */

/**
 * Streams summary from POST /api/summary. Calls onMessage for each SSE event.
 * @param {Object} payload - { top25, atsLeaders: { best, worst }, recentGames, upcomingGames, headlines }
 * @param {{ force?: boolean, onMessage: (data: object) => void }} options
 * @returns {Promise<void>}
 */
export async function fetchSummaryStream(payload, options = {}) {
  const { force = false, onMessage } = options;
  if (!onMessage || typeof onMessage !== 'function') {
    throw new Error('onMessage callback required');
  }
  const qs = new URLSearchParams({ stream: 'true' });
  if (force) qs.set('force', 'true');
  const res = await fetch(`/api/summary?${qs.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    onMessage({ error: true, message: err.error || `HTTP ${res.status}` });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const raw = trimmed.slice(6);
        try {
          const data = JSON.parse(raw);
          onMessage(data);
        } catch (_) {}
      }
    }
  }
  if (buffer.trim().startsWith('data: ')) {
    try {
      const data = JSON.parse(buffer.trim().slice(6));
      onMessage(data);
    } catch (_) {}
  }
}

/**
 * Builds the payload for the Team page GPT summary (upcoming, last week, ATS, headlines).
 * @param {{ team: object, schedule: { upcoming?: array, recent?: array }, ats: object, news: array }}
 * @returns {object} Payload for POST /api/summary/team
 */
export function buildTeamSummaryPayload({ team, schedule, ats, news }) {
  return {
    teamName: team?.name,
    upcomingGames: (schedule?.upcoming || []).slice(0, 5),
    lastWeek: (schedule?.recent || []).slice(0, 5),
    atsSummary: ats ?? {},
    headlines: (news || []).slice(0, 4).map((h) => ({ title: h.title, source: h.source })),
  };
}

/**
 * Fetches the Team page GPT briefing using the full payload (no extra API calls in handler).
 * @param {{ slug: string, payload: object }} params - payload from buildTeamSummaryPayload
 * @returns {Promise<{ summary: string | null, updatedAt: string | null, message?: string }>}
 */
export async function fetchTeamSummaryFromPayload({ slug, payload }) {
  if (!payload) {
    return { summary: null, updatedAt: null, message: 'Summary unavailable — no payload.' };
  }
  const res = await fetch('/api/summary/team', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: slug || '', ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  return {
    summary: data.summary ?? null,
    updatedAt: data.updatedAt ?? null,
    message: data.message,
  };
}

/**
 * Fetches a short GPT summary for a pinned team card (1–2 sentences) from its headlines.
 * @param {{ slug: string, headlines: Array<{ title: string, source?: string }> }} params
 * @returns {Promise<{ summary: string | null, message?: string }>}
 */
export async function fetchTeamSummary({ slug, headlines }) {
  if (!slug || !Array.isArray(headlines) || headlines.length === 0) {
    return { summary: null, message: 'Summary unavailable — no headlines.' };
  }
  const res = await fetch('/api/summary/team', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug,
      teamName: slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      upcomingGames: [],
      lastWeek: [],
      atsSummary: {},
      headlines: headlines.map((h) => ({ title: h.title, source: h.source })),
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { summary: data.summary ?? null, updatedAt: data.updatedAt ?? null, message: data.message };
}
