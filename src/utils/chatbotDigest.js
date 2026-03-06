/**
 * chatbotDigest.js
 *
 * Parses and structures the AI-generated home chatbot summary (from /api/chat/homeSummary)
 * into a canonical Daily Briefing Digest consumed by all three Daily Briefing slides,
 * the caption builder, and any future content surface.
 *
 * The AI summary follows a 5-paragraph format:
 *   ¶1  Yesterday recap   — completed games, scores, winners
 *   ¶2  Odds pulse        — championship odds, implied probability
 *   ¶3  Today + Tomorrow  — upcoming matchups, spreads
 *   ¶4  ATS Spotlight     — ATS leaders, cover %, bettor language
 *   ¶5  News Pulse+Closer — headlines, "what to watch" hook
 *
 * Exports:
 *   parseChatbotSummary(text)           → { paragraphs, recap, oddsPulse, todayTomorrow, atsSpotlight, newsPulse }
 *   buildDailyBriefingDigest(opts)      → DailyBriefingDigest
 *   stripMarkdown(text)                 → clean string
 *   extractBoldPhrases(text)            → string[]
 */

// ─── Markdown helpers ─────────────────────────────────────────────────────────

/**
 * Strip **bold** and *italic* markdown markers, returning plain text.
 * @param {string} text
 * @returns {string}
 */
export function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1');
}

/**
 * Extract all **bold** phrases from a paragraph.
 * @param {string} text
 * @returns {string[]}
 */
export function extractBoldPhrases(text) {
  if (!text) return [];
  return (text.match(/\*\*(.+?)\*\*/g) ?? []).map(m => m.replace(/\*\*/g, ''));
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

/**
 * Truncate text to maxChars at a word boundary, appending "…".
 */
function truncateAtWord(text, maxChars) {
  if (!text || text.length <= maxChars) return text || '';
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '…';
}

/**
 * Split a paragraph into sentences. Handles .!? followed by whitespace.
 * Filters out very short fragments.
 * @param {string} text
 * @param {number} minLen
 * @returns {string[]}
 */
function toSentences(text, minLen = 20) {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= minLen);
}

/**
 * Find the closing/punchline sentence of a paragraph.
 * Returns last sentence under 140 chars, or second-to-last as fallback.
 */
function closingSentence(text) {
  if (!text) return '';
  const sentences = toSentences(stripMarkdown(text));
  for (let i = sentences.length - 1; i >= Math.max(0, sentences.length - 3); i--) {
    const s = sentences[i];
    if (s.length >= 20 && s.length <= 140) return s;
  }
  return '';
}

// ─── Core parser ──────────────────────────────────────────────────────────────

/**
 * Parse an AI home summary text into named paragraph sections.
 *
 * @param {string} text
 * @returns {{
 *   paragraphs: string[],
 *   recap:         string,
 *   oddsPulse:     string,
 *   todayTomorrow: string,
 *   atsSpotlight:  string,
 *   newsPulse:     string,
 * }}
 */
export function parseChatbotSummary(text) {
  const empty = {
    paragraphs: [], recap: '', oddsPulse: '',
    todayTomorrow: '', atsSpotlight: '', newsPulse: '',
  };
  if (!text || typeof text !== 'string') return empty;

  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  return {
    paragraphs,
    recap:         paragraphs[0] ?? '',
    oddsPulse:     paragraphs[1] ?? '',
    todayTomorrow: paragraphs[2] ?? '',
    atsSpotlight:  paragraphs[3] ?? '',
    newsPulse:     paragraphs[4] ?? '',
  };
}

// ─── Content builders ─────────────────────────────────────────────────────────

/**
 * Build 3–5 storyline bullets combining chatbot narrative sentences + raw headlines.
 * Prefers chatbot-derived sentences (they carry editorial voice); fills with headlines.
 *
 * @param {string} recapText
 * @param {string} newsPulseText
 * @param {Array}  headlines
 * @returns {Array<{ text: string, source: string|null }>}
 */
function buildStorylines(recapText, newsPulseText, headlines) {
  const bullets = [];
  const used = new Set();

  // Extract short punchy sentences from recap (scores, winners)
  const recapSentences = toSentences(stripMarkdown(recapText))
    .sort((a, b) => {
      // Prefer sentences with numbers (scores) or team name signals
      const aScore = (a.match(/\d/g)?.length ?? 0);
      const bScore = (b.match(/\d/g)?.length ?? 0);
      return bScore - aScore;
    });

  for (const s of recapSentences) {
    if (bullets.length >= 2) break;
    const shortened = truncateAtWord(s, 88);
    if (!used.has(shortened)) {
      bullets.push({ text: shortened, source: 'briefing' });
      used.add(shortened);
    }
  }

  // Add 1–2 sentences from news pulse / closer
  const newsSentences = toSentences(stripMarkdown(newsPulseText));
  for (const s of newsSentences) {
    if (bullets.length >= 4) break;
    const shortened = truncateAtWord(s, 85);
    if (!used.has(shortened) && shortened.length > 25) {
      bullets.push({ text: shortened, source: 'briefing' });
      used.add(shortened);
    }
  }

  // Fill remaining slots with raw headlines
  for (const h of headlines) {
    if (bullets.length >= 5) break;
    const title = truncateAtWord((h.title || h.headline || '').trim(), 85);
    if (title.length > 20 && !used.has(title)) {
      bullets.push({ text: title, source: h.source || null });
      used.add(title);
    }
  }

  return bullets.slice(0, 5);
}

/**
 * Extract the primary ATS/betting angle sentence from the ATS spotlight paragraph.
 * Looks for sentences mentioning cover%, ATS, spread, or bettor language.
 */
function extractBettingAngle(atsText) {
  if (!atsText) return '';
  const clean = stripMarkdown(atsText);
  const sentences = toSentences(clean);
  const atsSentence = sentences.find(s =>
    /cover|ats|spread|number|pct|%|sharp|market/.test(s.toLowerCase())
  );
  return atsSentence ? truncateAtWord(atsSentence.trim(), 130) : '';
}

/**
 * Build watch framings: game matchups enriched with chatbot narrative "why it matters".
 * Matches team name fragments from chatbot text to produce contextual framing.
 *
 * @param {string} todayText
 * @param {string} newsPulseText
 * @param {Array}  games
 * @returns {Array<{ away: string, home: string, spread: number|null, time: string|null, why: string|null }>}
 */
function buildWatchFramings(todayText, newsPulseText, games) {
  const allText = todayText + ' ' + newsPulseText;
  const allSentences = toSentences(allText);

  const framings = [];
  for (const g of games.slice(0, 5)) {
    const away = g.awayTeam || '';
    const home = g.homeTeam || '';
    if (!away && !home) continue;

    // Use last word of each team name as a reliable fragment to match
    const awayFragment = away.toLowerCase().split(/\s+/).slice(-1)[0] ?? '';
    const homeFragment = home.toLowerCase().split(/\s+/).slice(-1)[0] ?? '';

    let why = null;
    if (awayFragment || homeFragment) {
      const match = allSentences.find(s => {
        const sl = s.toLowerCase();
        return (awayFragment && sl.includes(awayFragment)) ||
               (homeFragment && sl.includes(homeFragment));
      });
      if (match) {
        why = truncateAtWord(stripMarkdown(match.trim()), 82);
      }
    }

    framings.push({
      away,
      home,
      spread: g.spread ?? g.homeSpread ?? null,
      time:   g.time || null,
      why,
    });
    if (framings.length >= 3) break;
  }
  return framings;
}

/**
 * Build a social-ready caption narrative string from parsed chatbot sections + picks.
 * Anchors on ¶4 (ATS spotlight — most actionable) and ¶5 closer (editorial hook).
 */
function buildCaptionNarrative(parsed, picks) {
  const parts = [];

  // ATS spotlight drives the primary value proposition
  if (parsed.atsSpotlight) {
    parts.push(truncateAtWord(stripMarkdown(parsed.atsSpotlight), 220));
  }

  // News pulse closing sentence — editorial voice
  const closer = closingSentence(parsed.newsPulse);
  if (closer && closer.length > 20) {
    parts.push(closer);
  }

  // Top algorithmic pick as concrete call-to-action
  if (picks?.length > 0 && picks[0]?.pickLine) {
    parts.push(`Top lean: ${picks[0].pickLine}.`);
  }

  return parts.filter(Boolean).join(' ');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DailyBriefingDigest
 * @property {boolean}  hasChatContent        - Whether AI narrative was available
 * @property {string|null} chatStatus         - 'fresh'|'stale'|'missing'|null
 * @property {string}   leadNarrative         - Short editorial lead from chatbot recap (Slide 1)
 * @property {Array<{text:string,source:string|null}>} topStorylines - Slide 1 bullet lines
 * @property {string}   atsContextText        - Chatbot ATS paragraph for Slide 2 framing
 * @property {string}   bettingAngle          - Single sharpest ATS/cover sentence for Slide 2
 * @property {string}   watchNarrative        - Chatbot "today's matchups" framing for Slide 3
 * @property {Array<{away:string,home:string,spread:number|null,time:string|null,why:string|null}>} watchGameFramings
 * @property {string}   voiceLine             - Punchy closer for caption / tag line
 * @property {string}   captionNarrative      - Full social-ready narrative for caption builder
 * @property {object|null} _parsed            - Raw parsed paragraphs (debug only)
 */

/**
 * Build a structured Daily Briefing Digest from the AI chatbot home summary
 * and structured fallback data.
 *
 * This is the single canonical content source for:
 *   - Daily Briefing Slide 1 (lead editorial / top storylines)
 *   - Daily Briefing Slide 2 (ATS context framing + picks)
 *   - Daily Briefing Slide 3 (what to watch + game framings)
 *   - Caption builder (narrative + voice line)
 *
 * @param {{
 *   chatSummary?:  string|null,   // Full AI narrative text from /api/chat/homeSummary
 *   chatStatus?:   string|null,   // 'fresh'|'stale'|'missing'
 *   games?:        Array,         // odds.games (structural fallback for watch framings)
 *   headlines?:    Array,         // raw headline objects { title, source, ... }
 *   picks?:        Array,         // Maximus algorithmic picks
 * }} opts
 * @returns {DailyBriefingDigest}
 */
export function buildDailyBriefingDigest({
  chatSummary = null,
  chatStatus  = null,
  games       = [],
  // atsLeaders and rankingsTop25 reserved for future structural fallback
  headlines   = [],
  picks       = [],
} = {}) {
  const parsed = parseChatbotSummary(chatSummary);
  const hasChatContent = !!chatSummary && parsed.paragraphs.length >= 3;

  // ── Slide 1: Lead editorial / top storylines ──────────────────────────────
  // Prefers chatbot ¶1 (recap) as the editorial lead.
  const leadNarrative = hasChatContent
    ? truncateAtWord(stripMarkdown(parsed.recap), 200)
    : '';

  const topStorylines = hasChatContent
    ? buildStorylines(parsed.recap, parsed.newsPulse, headlines)
    : headlines.slice(0, 5).map(h => ({
        text: truncateAtWord((h.title || h.headline || '').trim(), 85),
        source: h.source || null,
      })).filter(b => b.text.length > 10);

  // ── Slide 2: ATS/betting context ─────────────────────────────────────────
  const atsContextText = hasChatContent && parsed.atsSpotlight
    ? truncateAtWord(stripMarkdown(parsed.atsSpotlight), 190)
    : '';

  const bettingAngle = hasChatContent
    ? extractBettingAngle(parsed.atsSpotlight)
    : '';

  // ── Slide 3: What to watch ────────────────────────────────────────────────
  const watchNarrative = hasChatContent && parsed.todayTomorrow
    ? truncateAtWord(stripMarkdown(parsed.todayTomorrow), 170)
    : '';

  const watchGameFramings = hasChatContent
    ? buildWatchFramings(parsed.todayTomorrow, parsed.newsPulse, games)
    : games.slice(0, 3).map(g => ({
        away:   g.awayTeam || '',
        home:   g.homeTeam || '',
        spread: g.spread ?? g.homeSpread ?? null,
        time:   g.time || null,
        why:    null,
      }));

  // ── Caption voice line (punchy closer) ───────────────────────────────────
  const voiceLine = hasChatContent
    ? closingSentence(parsed.newsPulse || parsed.atsSpotlight)
    : '';

  // ── Caption narrative ─────────────────────────────────────────────────────
  const captionNarrative = hasChatContent
    ? buildCaptionNarrative(parsed, picks)
    : '';

  return {
    hasChatContent,
    chatStatus,
    // Slide 1
    leadNarrative,
    topStorylines,
    // Slide 2
    atsContextText,
    bettingAngle,
    // Slide 3
    watchNarrative,
    watchGameFramings,
    // Caption
    voiceLine,
    captionNarrative,
    // Raw data (available for debug tools; not surfaced in default UI)
    _parsed: hasChatContent ? parsed : null,
  };
}
