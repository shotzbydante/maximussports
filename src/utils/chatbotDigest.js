/**
 * chatbotDigest.js
 *
 * Parses and structures the AI-generated home chatbot summary (from /api/chat/homeSummary)
 * into a canonical Daily Briefing Digest consumed by all five Daily Briefing slides,
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
 * Build 3–4 "Maximus Says" editorial bullets for Slide 1.
 * Pulls the highest-signal sentence from each section so Slide 1 reads
 * like a cross-section morning briefing — not just a recap.
 *
 * Priority order:
 *   1. Betting/ATS angle (¶4) — most actionable
 *   2. Top game to watch framing (¶3 → gamesToWatch[0])
 *   3. Title race leader sentence (¶2)
 *   4. Editorial closer (¶5 / voiceLine)
 *   5. Fill from ¶1 recap sentences if still under 3 bullets
 */
function buildMaximusSays(parsed, { gamesToWatch, titleRace, bettingAngle, voiceLine }) {
  const bullets = [];
  const used = new Set();

  function addBullet(text) {
    if (!text || text.length < 20) return false;
    const clean = truncateAtWord(text, 102);
    if (used.has(clean)) return false;
    bullets.push(clean);
    used.add(clean);
    return true;
  }

  // 1. ATS angle — most actionable edge
  if (bettingAngle) addBullet(bettingAngle);

  // 2. Top game storyline
  const topGameStory = gamesToWatch?.[0]?.storyline;
  if (topGameStory) addBullet(topGameStory);

  // 3. Title race leader
  if (titleRace?.length > 0 && bullets.length < 3) {
    const leader = titleRace[0];
    const sentence = `${leader.team} leads the title race at ${leader.americanOdds}.`;
    addBullet(sentence);
  }

  // 4. Voice closer from ¶5
  if (voiceLine && bullets.length < 4) addBullet(voiceLine);

  // 5. Fill from ¶3 today/tomorrow narrative
  if (parsed.todayTomorrow && bullets.length < 3) {
    const sentences = toSentences(stripMarkdown(parsed.todayTomorrow));
    for (const s of sentences) {
      if (bullets.length >= 4) break;
      addBullet(s);
    }
  }

  // 6. Fill from ¶1 recap if still light
  if (parsed.recap && bullets.length < 3) {
    const sentences = toSentences(stripMarkdown(parsed.recap));
    for (const s of sentences) {
      if (bullets.length >= 4) break;
      addBullet(s);
    }
  }

  return bullets.slice(0, 4);
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

// ─── Editorial section parsers ────────────────────────────────────────────────

/**
 * Parse last-night score highlights from the recap paragraph (¶1).
 * Looks for basketball score patterns (NN-NN) with surrounding team names.
 *
 * @param {string} recapText
 * @returns {Array<{ teamA: string, teamB: string, score: string, summaryLine: string }>}
 */
function parseLastNightHighlights(recapText) {
  if (!recapText) return [];
  const clean = stripMarkdown(recapText);
  const sentences = toSentences(clean);
  const highlights = [];

  for (const sentence of sentences) {
    const scoreMatch = sentence.match(/\b(\d{2,3})\s*[-–]\s*(\d{2,3})\b/);
    if (!scoreMatch) continue;
    const s1 = parseInt(scoreMatch[1], 10);
    const s2 = parseInt(scoreMatch[2], 10);
    // Basketball scores sit in this range
    if (s1 < 40 || s1 > 165 || s2 < 40 || s2 > 165) continue;

    let teamA = '';
    let teamB = '';
    const before = sentence.slice(0, scoreMatch.index).trim();

    // "TeamA verb TeamB"
    const verbMatch = before.match(
      /^(.+?)\s+(?:defeated|beat|edged|topped|downed|outlasted|handled|rolled\s+past|routed|crushed|bested|upended|upset|knocked\s+off|blew\s+out|escaped|survived|overcame|held\s+off)\s+(.+?)[\s,]*$/i,
    );
    if (verbMatch) {
      teamA = verbMatch[1].replace(/^(?:No\.\s*\d+\s+|#\d+\s+)/, '').trim();
      teamB = verbMatch[2].replace(/^(?:No\.\s*\d+\s+|#\d+\s+)/, '').trim();
    } else {
      const overMatch = before.match(/^(.+?)\s+over\s+(.+?)[\s,]*$/i);
      if (overMatch) {
        teamA = overMatch[1].replace(/^(?:No\.\s*\d+\s+|#\d+\s+)/, '').trim();
        teamB = overMatch[2].replace(/^(?:No\.\s*\d+\s+|#\d+\s+)/, '').trim();
      } else if (before.length > 3) {
        teamA = before.replace(/^(?:No\.\s*\d+\s+|#\d+\s+)/, '').trim();
      }
    }

    if (!teamA) continue;

    highlights.push({
      teamA,
      teamB,
      score: `${scoreMatch[1]}-${scoreMatch[2]}`,
      summaryLine: truncateAtWord(sentence, 98),
    });
    if (highlights.length >= 4) break;
  }
  return highlights;
}

/**
 * Parse championship title race from the odds-pulse paragraph (¶2).
 * Looks for American odds patterns (+XXX / -XXX) near team names.
 *
 * @param {string} oddsPulseText
 * @returns {Array<{ team: string, americanOdds: string, impliedProbability: number, commentary: string }>}
 */
function parseTitleRace(oddsPulseText) {
  if (!oddsPulseText) return [];
  const clean = stripMarkdown(oddsPulseText);
  const titleRace = [];
  const used = new Set();

  // Two common formats: "Duke (-200)" and "Duke at +350"
  const patterns = [
    /([A-Z][A-Za-z'&.]+(?:\s+[A-Z][A-Za-z'&.]+){0,3})\s*\(([-+]\d{3,4})\)/g,
    /([A-Z][A-Za-z'&.]+(?:\s+[A-Z][A-Za-z'&.]+){0,3})\s+(?:at|sits?\s+at|has|holds?)\s+([-+]\d{3,4})/gi,
  ];

  const SKIP_WORDS = new Set(['The', 'This', 'That', 'Their', 'These', 'Those', 'With', 'From', 'When', 'Then', 'They']);

  for (const re of patterns) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(clean)) !== null) {
      const team = match[1].trim();
      const oddsRaw = parseInt(match[2], 10);
      if (!team || team.length < 3 || SKIP_WORDS.has(team)) continue;
      if (used.has(team.toLowerCase())) continue;

      const impliedProbability = oddsRaw < 0
        ? Math.round((-oddsRaw / (-oddsRaw + 100)) * 100)
        : Math.round((100 / (oddsRaw + 100)) * 100);

      // Pull surrounding context for a brief commentary
      const start = Math.max(0, match.index - 20);
      const end   = Math.min(clean.length, match.index + match[0].length + 110);
      const commentary = truncateAtWord(clean.slice(start, end).trim(), 82);

      titleRace.push({
        team,
        americanOdds: oddsRaw > 0 ? `+${oddsRaw}` : String(oddsRaw),
        impliedProbability,
        commentary,
      });
      used.add(team.toLowerCase());
      if (titleRace.length >= 6) break;
    }
    if (titleRace.length >= 6) break;
  }

  return titleRace
    .sort((a, b) => b.impliedProbability - a.impliedProbability)
    .slice(0, 5);
}

/**
 * Build enriched games-to-watch entries from chatbot today/tomorrow paragraph (¶3) + games data.
 *
 * @param {string} todayText
 * @param {string} newsPulseText
 * @param {Array}  games
 * @returns {Array<{ matchup: string, away: string, home: string, spread: string|null, time: string|null, storyline: string|null }>}
 */
function parseGamesToWatch(todayText, newsPulseText, games) {
  const allText = `${todayText || ''} ${newsPulseText || ''}`;
  const sentences = toSentences(allText);
  const result = [];

  for (const g of games) {
    if (result.length >= 4) break;
    const away = g.awayTeam || '';
    const home = g.homeTeam || '';
    if (!away && !home) continue;

    const awayFrag = away.toLowerCase().split(/\s+/).pop() ?? '';
    const homeFrag = home.toLowerCase().split(/\s+/).pop() ?? '';

    const matchSentence = sentences.find(s => {
      const sl = s.toLowerCase();
      return (awayFrag && sl.includes(awayFrag)) || (homeFrag && sl.includes(homeFrag));
    });

    const spread = g.spread ?? g.homeSpread ?? null;
    const spreadNum = spread != null ? parseFloat(spread) : null;
    const spreadStr = spreadNum != null
      ? (spreadNum > 0 ? `+${spreadNum}` : String(spreadNum))
      : null;

    result.push({
      matchup:  `${away} @ ${home}`,
      away,
      home,
      spread:   spreadStr,
      time:     g.time || null,
      storyline: matchSentence ? truncateAtWord(stripMarkdown(matchSentence), 92) : null,
    });
  }
  return result;
}

/**
 * Extract ATS edges from the ATS spotlight paragraph (¶4) and structured atsLeaders data.
 *
 * @param {string} atsText
 * @param {object|null} atsLeaders
 * @returns {Array<{ team: string, atsRate: number, timeframe: string, insight: string }>}
 */
function parseAtsEdges(atsText, atsLeaders) {
  const edges = [];
  const used = new Set();

  if (atsText) {
    const clean = stripMarkdown(atsText);
    const sentences = toSentences(clean);

    const coverPatterns = [
      /([A-Z][A-Za-z'&.]+(?:\s+[A-Z][A-Za-z'&.]+){0,2})\s+(?:is\s+)?covering\s+at\s+(\d+)%/gi,
      /([A-Z][A-Za-z'&.]+(?:\s+[A-Z][A-Za-z'&.]+){0,2})\s+(?:has\s+)?covers?\s+(\d+)%/gi,
      /([A-Z][A-Za-z'&.]+(?:\s+[A-Z][A-Za-z'&.]+){0,2})\s+at\s+(\d+)%\s+ATS/gi,
      /([A-Z][A-Za-z'&.]+(?:\s+[A-Z][A-Za-z'&.]+){0,2})\s+(\d+)%\s+(?:ATS|cover)/gi,
    ];

    for (const re of coverPatterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(clean)) !== null) {
        const team = m[1].trim();
        const rate = parseInt(m[2], 10);
        if (used.has(team.toLowerCase())) continue;
        if (rate < 30 || rate > 95) continue;

        const insight = sentences.find(s =>
          s.toLowerCase().includes(team.toLowerCase())
        );

        edges.push({
          team,
          atsRate:   rate,
          timeframe: 'season',
          insight:   insight ? truncateAtWord(insight, 88) : '',
        });
        used.add(team.toLowerCase());
        if (edges.length >= 4) break;
      }
      if (edges.length >= 4) break;
    }
  }

  // Fill remaining slots from structured atsLeaders data
  if (atsLeaders?.best) {
    for (const leader of atsLeaders.best) {
      if (edges.length >= 4) break;
      const name = leader.team || leader.name || '';
      if (!name || used.has(name.toLowerCase())) continue;
      const raw = leader.coverPct ?? leader.atsPercent ?? null;
      if (raw == null) continue;
      const rate = raw > 1 ? Math.round(raw) : Math.round(raw * 100);
      if (rate < 30 || rate > 99) continue;

      edges.push({
        team:      name,
        atsRate:   rate,
        timeframe: leader.games ? `last ${leader.games}` : 'season',
        insight:   '',
      });
      used.add(name.toLowerCase());
    }
  }

  return edges.sort((a, b) => b.atsRate - a.atsRate).slice(0, 4);
}

/**
 * Build news intel bullets from the news-pulse paragraph (¶5) and raw headlines.
 *
 * @param {string} newsPulseText
 * @param {Array}  headlines
 * @returns {Array<{ headline: string, editorialContext: string|null }>}
 */
function parseNewsIntel(newsPulseText, headlines) {
  const intel = [];
  const used = new Set();

  if (newsPulseText) {
    const clean = stripMarkdown(newsPulseText);
    for (const sentence of toSentences(clean)) {
      if (intel.length >= 3) break;
      const headline = truncateAtWord(sentence, 84);
      if (headline.length < 20 || used.has(headline)) continue;
      intel.push({ headline, editorialContext: null });
      used.add(headline);
    }
  }

  for (const h of (headlines || [])) {
    if (intel.length >= 5) break;
    const title = truncateAtWord((h.title || h.headline || '').trim(), 82);
    if (title.length < 15 || used.has(title)) continue;
    intel.push({ headline: title, editorialContext: h.source || null });
    used.add(title);
  }

  return intel.slice(0, 5);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DailyBriefingDigest
 * @property {boolean}     hasChatContent        - Whether AI narrative was available
 * @property {string|null} chatStatus            - 'fresh'|'stale'|'missing'|null
 *
 * — Slide 1: HERE'S YOUR EDGE TODAY (Maximus Says) —
 * @property {string[]}    maximusSays           - 3–4 cross-section editorial bullets
 *
 * — Slide 2: LAST NIGHT'S SHOCKWAVES —
 * @property {Array<{teamA:string,teamB:string,score:string,summaryLine:string}>} lastNightHighlights
 * @property {string}      leadNarrative         - Full recap paragraph fallback
 * @property {Array<{text:string,source:string|null}>} topStorylines
 *
 * — Slide 3: WHAT TO WATCH TODAY —
 * @property {Array<{matchup:string,away:string,home:string,spread:string|null,time:string|null,storyline:string|null}>} gamesToWatch
 * @property {string}      watchNarrative
 * @property {Array<{away:string,home:string,spread:number|null,time:string|null,why:string|null}>} watchGameFramings
 *
 * — Slide 4: ATS EDGE —
 * @property {Array<{team:string,atsRate:number,timeframe:string,insight:string}>} atsEdges
 * @property {string}      atsContextText
 * @property {string}      bettingAngle
 *
 * — Slide 5: RANKINGS + INTEL —
 * @property {Array<{team:string,americanOdds:string,impliedProbability:number,commentary:string}>} titleRace
 * @property {Array<{headline:string,editorialContext:string|null}>} newsIntel
 *
 * — Caption —
 * @property {string}      voiceLine             - Punchy editorial closer
 * @property {string}      captionNarrative
 *
 * @property {object|null} _parsed               - Raw parsed paragraphs (debug only)
 */

/**
 * Build a structured Daily Briefing Digest from the AI chatbot home summary
 * and structured fallback data.
 *
 * This is the single canonical content source for all five Daily Briefing slides
 * and the caption builder.
 *
 * @param {{
 *   chatSummary?:  string|null,   // Full AI narrative text from /api/chat/homeSummary
 *   chatStatus?:   string|null,   // 'fresh'|'stale'|'missing'
 *   games?:        Array,         // odds.games (structural fallback for watch framings)
 *   headlines?:    Array,         // raw headline objects { title, source, ... }
 *   picks?:        Array,         // Maximus algorithmic picks
 *   atsLeaders?:   object|null,   // { best: [], worst: [] } from ATS data
 * }} opts
 * @returns {DailyBriefingDigest}
 */
export function buildDailyBriefingDigest({
  chatSummary = null,
  chatStatus  = null,
  games       = [],
  headlines   = [],
  picks       = [],
  atsLeaders  = null,
} = {}) {
  const parsed = parseChatbotSummary(chatSummary);
  const hasChatContent = !!chatSummary && parsed.paragraphs.length >= 3;

  // ── Slide 1: LAST NIGHT'S SHOCKWAVES ────────────────────────────────────
  const lastNightHighlights = hasChatContent
    ? parseLastNightHighlights(parsed.recap)
    : [];

  const leadNarrative = hasChatContent
    ? truncateAtWord(stripMarkdown(parsed.recap), 200)
    : '';

  const topStorylines = hasChatContent
    ? buildStorylines(parsed.recap, parsed.newsPulse, headlines)
    : headlines.slice(0, 5).map(h => ({
        text: truncateAtWord((h.title || h.headline || '').trim(), 85),
        source: h.source || null,
      })).filter(b => b.text.length > 10);

  // ── Slide 2: TITLE RACE — MARKET WATCH ──────────────────────────────────
  const titleRace = hasChatContent
    ? parseTitleRace(parsed.oddsPulse)
    : [];

  // ── Slide 3: TODAY'S GAMES TO WATCH ─────────────────────────────────────
  const gamesToWatch = hasChatContent
    ? parseGamesToWatch(parsed.todayTomorrow, parsed.newsPulse, games)
    : games.slice(0, 4).map(g => ({
        matchup:   `${g.awayTeam || ''} @ ${g.homeTeam || ''}`,
        away:      g.awayTeam || '',
        home:      g.homeTeam || '',
        spread:    null,
        time:      g.time || null,
        storyline: null,
      }));

  // Preserved for backward-compat (Slide 3 legacy path)
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

  // ── Slide 4: MARKET EDGE — ATS TRENDS ───────────────────────────────────
  const atsEdges = parseAtsEdges(
    hasChatContent ? parsed.atsSpotlight : '',
    atsLeaders,
  );

  const atsContextText = hasChatContent && parsed.atsSpotlight
    ? truncateAtWord(stripMarkdown(parsed.atsSpotlight), 190)
    : '';

  const bettingAngle = hasChatContent
    ? extractBettingAngle(parsed.atsSpotlight)
    : '';

  // ── Slide 5: RANKINGS + INTEL ─────────────────────────────────────────────
  const newsIntel = parseNewsIntel(
    hasChatContent ? parsed.newsPulse : '',
    headlines,
  );

  // ── Caption voice line — prefers short punchy sentence ──────────────────
  const voiceLine = hasChatContent
    ? (closingSentence(parsed.newsPulse) || closingSentence(parsed.atsSpotlight))
    : '';

  const captionNarrative = hasChatContent
    ? buildCaptionNarrative(parsed, picks)
    : '';

  // ── Slide 1 — HERE'S YOUR EDGE TODAY (Maximus Says) ─────────────────────
  const maximusSays = hasChatContent
    ? buildMaximusSays(parsed, { gamesToWatch, titleRace, bettingAngle, voiceLine })
    : [];

  return {
    hasChatContent,
    chatStatus,
    // Slide 1 — HERE'S YOUR EDGE TODAY (Maximus Says)
    maximusSays,
    // Slide 2 — LAST NIGHT'S SHOCKWAVES
    lastNightHighlights,
    leadNarrative,
    topStorylines,
    // Slide 3 — WHAT TO WATCH TODAY
    gamesToWatch,
    watchNarrative,
    watchGameFramings,
    // Slide 4 — ATS EDGE
    atsEdges,
    atsContextText,
    bettingAngle,
    // Slide 5 — RANKINGS + INTEL
    titleRace,
    newsIntel,
    // Caption
    voiceLine,
    captionNarrative,
    // Raw paragraphs (debug only)
    _parsed: hasChatContent ? parsed : null,
  };
}
