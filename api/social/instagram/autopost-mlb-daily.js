/**
 * GET /api/social/instagram/autopost-mlb-daily
 *
 * Automated daily MLB Daily Briefing → Instagram carousel publisher.
 * Called by Vercel cron at 13:00 UTC (6:00 AM PT / 9:00 AM ET).
 *
 * Modes (via ?mode= query param):
 *   preview  — returns caption, date key, eligibility, idempotency status (publishes nothing)
 *   dry-run  — renders slides, uploads images, builds publish payload (does NOT call IG publish)
 *   live     — full end-to-end: render → upload → publish carousel to Instagram
 *   force    — like live, but bypasses "already posted today" idempotency check
 *
 * Security:
 *   Validates CRON_SECRET via Authorization header or ?secret= query param.
 *   Rejects unauthenticated requests.
 *
 * Data pipeline:
 *   Uses the same MLB data sources as the client-side Content Studio:
 *   - /api/mlb/live/games → live/final game results
 *   - /api/mlb/odds/championship → championship odds
 *   - Season model projections (imported directly)
 *   - buildMlbDailyHeadline + buildMlbHotPress for editorial content
 *   - buildMlbCaption for caption generation
 *
 * Idempotency:
 *   Checks social_posts table for existing 'posted' MLB Daily Briefing
 *   on the same PT-day. Uses America/Los_Angeles date boundary.
 */

import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { randomUUID } from 'node:crypto';

// Data pipeline (same as client-side slides)
import { MLB_TEAMS } from '../../../src/sports/mlb/teams.js';
import { getTeamProjection } from '../../../src/data/mlb/seasonModel.js';
import { buildMlbDailyHeadline, buildMlbHotPress } from '../../../src/features/mlb/contentStudio/buildMlbDailyHeadline.js';
import { buildMlbCaption } from '../../../src/features/mlb/contentStudio/buildMlbCaption.js';
import { stripEmojis, fmtOdds } from '../../../src/components/dashboard/slides/mlbDailyHelpers.js';

// Pixel-perfect browser renderer (primary) + Satori fallback
import { renderSlidesWithBrowser } from '../../_lib/mlbBrowserRenderer.js';
import { renderSlide1, renderSlide2, renderSlide3 } from '../../_lib/mlbSlideRenderer.js';

// ── Constants ──────────────────────────────────────────────────────────────

const CONTENT_TYPE = 'mlb-daily-briefing';
const PT_TZ = 'America/Los_Angeles';
const ENABLED_ENV_KEY = 'MLB_AUTOPOST_ENABLED';

// ── Helpers ────────────────────────────────────────────────────────────────

function createLogger(requestId) {
  const short = requestId.slice(0, 8);
  const prefix = `[autopost-mlb req=${short}]`;
  return {
    info: (...args) => console.log(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}

function getPtDateKey(dateOverride) {
  if (dateOverride && /^\d{4}-\d{2}-\d{2}$/.test(dateOverride)) return dateOverride;
  const now = new Date();
  return now.toLocaleDateString('en-CA', { timeZone: PT_TZ }); // YYYY-MM-DD
}

function getPtDateLabel() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: PT_TZ,
  });
}

function sanitizeEnv(value) {
  if (value == null) return '';
  let s = String(value).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function shortDiv(div) {
  if (!div) return '';
  return div.replace('American League ', 'AL ').replace('National League ', 'NL ');
}

function fmtConviction(tier) {
  if (!tier) return 'Edge';
  if (tier === 'high') return 'High';
  if (tier === 'medium-high') return 'Med-High';
  if (tier === 'medium') return 'Medium';
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function trim(text, max = 80) {
  if (!text) return '';
  let s = text.trim();
  s = s.replace(/^(Meanwhile,?\s*|In other action,?\s*|Additionally,?\s*|Also,?\s*)/i, '');
  if (s.length <= max) return s;
  const sentEnd = s.lastIndexOf('.', max);
  if (sentEnd > max * 0.5) return s.slice(0, sentEnd + 1);
  return s.slice(0, max).replace(/\s+\S*$/, '') + '.';
}

// ── Auth ───────────────────────────────────────────────────────────────────

function validateAuth(req) {
  const cronSecret = sanitizeEnv(process.env.CRON_SECRET);
  if (!cronSecret) return { ok: false, reason: 'CRON_SECRET not configured' };

  const url = new URL(req.url, 'http://localhost');
  const headerToken = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const querySecret = url.searchParams.get('secret') || '';

  if (headerToken === cronSecret || querySecret === cronSecret) {
    return { ok: true };
  }
  return { ok: false, reason: 'Invalid or missing secret' };
}

// ── Idempotency ────────────────────────────────────────────────────────────

async function checkAlreadyPosted(supabase, dateKey, log) {
  try {
    // Compute correct PT offset (PDT = -07:00, PST = -08:00)
    const ptOffset = getPtOffset(dateKey);
    const dayStart = `${dateKey}T00:00:00${ptOffset}`;
    const dayEnd = `${dateKey}T23:59:59${ptOffset}`;

    // NOTE: permalink is NOT a top-level column — it lives inside status_detail JSON.
    // Selecting it would cause a PostgREST error that silently breaks idempotency.
    const { data, error } = await supabase
      .from('social_posts')
      .select('id, posted_at, published_media_id, status_detail')
      .eq('platform', 'instagram')
      .eq('content_studio_section', 'daily-briefing')
      .eq('lifecycle_status', 'posted')
      .gte('posted_at', dayStart)
      .lte('posted_at', dayEnd)
      .limit(1);

    if (error) {
      log.warn('idempotency check failed:', error.message);
      return { alreadyPosted: false, existing: null };
    }

    if (data && data.length > 0) {
      // Extract permalink from status_detail JSON
      let permalink = null;
      try {
        const detail = typeof data[0].status_detail === 'string'
          ? JSON.parse(data[0].status_detail)
          : data[0].status_detail;
        permalink = detail?.permalink ?? null;
      } catch { /* malformed JSON */ }

      return { alreadyPosted: true, existing: { ...data[0], permalink } };
    }
    return { alreadyPosted: false, existing: null };
  } catch (e) {
    log.warn('idempotency check exception:', e.message);
    return { alreadyPosted: false, existing: null };
  }
}

/** Compute PT offset dynamically: PDT (-07:00) in summer, PST (-08:00) in winter */
function getPtOffset(dateKey) {
  // Create a date at noon PT and check its UTC offset
  const testDate = new Date(`${dateKey}T12:00:00`);
  const ptStr = testDate.toLocaleString('en-US', { timeZone: PT_TZ, timeZoneName: 'short' });
  return ptStr.includes('PDT') ? '-07:00' : '-08:00';
}

// ── Data assembly (same sources as client-side slides) ─────────────────────

async function fetchLiveGames(baseUrl, log) {
  try {
    const res = await fetch(`${baseUrl}/api/mlb/live/games?status=all`);
    if (!res.ok) { log.warn('live games fetch failed:', res.status); return []; }
    const data = await res.json();
    return data.games || [];
  } catch (e) {
    log.warn('live games fetch error:', e.message);
    return [];
  }
}

async function fetchChampOdds(baseUrl, log) {
  try {
    const res = await fetch(`${baseUrl}/api/mlb/odds/championship`);
    if (!res.ok) { log.warn('champ odds fetch failed:', res.status); return {}; }
    return await res.json();
  } catch (e) {
    log.warn('champ odds fetch error:', e.message);
    return {};
  }
}

async function fetchPicks(baseUrl, log) {
  try {
    const res = await fetch(`${baseUrl}/api/mlb/picks/built`);
    if (!res.ok) { log.warn('picks fetch failed:', res.status); return { categories: {} }; }
    return await res.json();
  } catch (e) {
    log.warn('picks fetch error:', e.message);
    return { categories: {} };
  }
}

async function fetchLeaders(baseUrl, log) {
  try {
    const res = await fetch(`${baseUrl}/api/mlb/leaders`);
    if (!res.ok) { log.warn('leaders fetch failed:', res.status); return {}; }
    return await res.json();
  } catch (e) {
    log.warn('leaders fetch error:', e.message);
    return {};
  }
}

async function fetchStandings(baseUrl, log) {
  try {
    const res = await fetch(`${baseUrl}/api/mlb/standings`);
    if (!res.ok) { log.warn('standings fetch failed:', res.status); return {}; }
    const data = await res.json();
    // Normalize to { slug: standings } map if needed
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
    return {};
  } catch (e) {
    log.warn('standings fetch error:', e.message);
    return {};
  }
}

function buildSlideContent(liveGames, champOdds, dateLabel) {
  // Headline + HOTP (same as Slide 1 & 2)
  const hl = buildMlbDailyHeadline({ liveGames, briefing: null, seasonIntel: null });
  const hotPress = buildMlbHotPress({ liveGames, briefing: null });
  const bullets = hotPress.slice(0, 3).map(b => ({ text: trim(b.text), logoSlug: b.logoSlug }));

  // Pennant Race top teams (same as Slide 2)
  const allTeams = [];
  for (const team of MLB_TEAMS) {
    const proj = getTeamProjection(team.slug);
    if (!proj || !proj.projectedWins) continue;
    const oddsData = (champOdds ?? {})[team.slug];
    const oddsVal = oddsData?.bestChanceAmerican ?? oddsData?.american ?? null;
    allTeams.push({
      slug: team.slug, abbrev: team.abbrev, name: team.name,
      division: team.division, league: team.league,
      projectedWins: proj.projectedWins,
      signals: proj.signals ?? [],
      confidenceTier: proj.confidenceTier ?? null,
      marketDelta: proj.marketDelta ?? null,
      strongestDriver: proj.takeaways?.strongestDriver ?? null,
      odds: oddsVal,
    });
  }
  allTeams.sort((a, b) => (b.projectedWins ?? 0) - (a.projectedWins ?? 0));

  const raceTeams = allTeams.slice(0, 4).map(t => ({
    team: t.abbrev, division: shortDiv(t.division),
    projectedWins: t.projectedWins,
    convictionLabel: t.confidenceTier || 'Projected',
    championshipOdds: t.odds != null ? fmtOdds(t.odds) : '—',
    summaryTag: t.signals?.[0] || null,
  }));

  // League board for Slide 3 (top 5 per league)
  const leagueBoard = allTeams.slice(0, 10).map(t => ({
    abbrev: t.abbrev, name: t.abbrev, league: t.league,
    projectedWins: t.projectedWins,
    championshipOdds: t.odds != null ? fmtOdds(t.odds) : '—',
    rationale: t.signals?.[0] || (t.strongestDriver ? t.strongestDriver : null),
    record: t.confidenceTier ? `${t.confidenceTier} confidence` : null,
  }));

  // Picks (top 3)
  // Note: picks data would need to be fetched from the API; for now we build from model signals
  const picks = raceTeams.slice(0, 3).map((t, i) => ({
    matchup: `${t.team} Game`, type: i === 0 ? 'ATS' : i === 1 ? "Pick 'Em" : 'O/U',
    selection: t.team, conviction: t.convictionLabel,
    rationale: `Model edge: ${t.convictionLabel.toLowerCase()}`,
  }));

  // Story cards (Slide 1)
  const storyCard1Title = hl.heroTitle?.split('.')[0]?.replace(/[.!]$/, '') || 'Results Land';
  const storyCard1Sub = hl.subhead?.split('.')[0]?.replace(/[.!]$/, '') || '';
  const storyCard2Title = (() => {
    const parts = (hl.heroTitle || '').split('.');
    if (parts.length >= 2 && parts[1].trim().length > 3) return parts[1].trim().replace(/[.!]$/, '');
    if (hotPress[1]?.text) {
      const s = hotPress[1].text.replace(/\.$/, '');
      return s.length > 40 ? s.slice(0, 40).replace(/\s+\S*$/, '') : s;
    }
    return 'The Board Reacts';
  })();
  const storyCard2Sub = hotPress[1]?.text?.replace(/\.$/, '') || '';

  return {
    dateLabel,
    headline: hl.heroTitle || 'MLB DAILY BRIEFING',
    subhead: hl.subhead || '',
    storyCard1Title, storyCard1Sub,
    storyCard2Title, storyCard2Sub: storyCard2Sub.length > 60 ? '' : storyCard2Sub,
    bullets,
    featureBullets: hotPress.slice(0, 4).map(b => ({ text: b.text })),
    featureTakeaway: hl.subhead || '',
    raceTeams,
    leagueBoard,
    picks,
  };
}

// ── Image upload ───────────────────────────────────────────────────────────

async function uploadPngBuffer(supabase, buffer, filename, log) {
  const { error } = await supabase.storage
    .from('social-assets')
    .upload(filename, buffer, { contentType: 'image/png', upsert: false, cacheControl: '31536000' });

  if (error) {
    log.error(`upload failed for ${filename}:`, error.message);
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from('social-assets')
    .getPublicUrl(filename);

  log.info(`uploaded ${filename} → ${publicUrl.slice(0, 80)}…`);
  return publicUrl;
}

// ── Carousel publish (calls the SAME endpoint as manual UI) ────────────────

async function publishCarousel(imageUrls, captionText, metadata, baseUrl, log) {
  log.info(`publishing carousel: ${imageUrls.length} images, caption_length=${captionText.length}`);

  const res = await fetch(`${baseUrl}/api/social/instagram/publish-carousel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrls, caption: captionText, metadata }),
  });

  const data = await res.json();
  if (!data.ok) {
    log.error('carousel publish failed:', data.error?.message || JSON.stringify(data));
    throw new Error(`Carousel publish failed at stage=${data.stage}: ${data.error?.message || 'unknown'}`);
  }

  log.info('carousel published:', data.publishedMediaId, data.permalink);
  return data;
}

// ── Main handler ───────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });

  const requestId = randomUUID();
  const log = createLogger(requestId);
  const startTs = Date.now();

  const url = new URL(req.url, `https://${req.headers.host || 'maximussports.ai'}`);
  const mode = url.searchParams.get('mode') || 'preview';
  const dateOverride = url.searchParams.get('date') || null;
  const dateKey = getPtDateKey(dateOverride);
  const dateLabel = getPtDateLabel();

  log.info(`mode=${mode}, dateKey=${dateKey}, dateOverride=${dateOverride || 'none'}`);

  // ── Auth ──
  const auth = validateAuth(req);
  if (!auth.ok) {
    log.warn('auth failed:', auth.reason);
    return res.status(401).json({ ok: false, error: auth.reason, requestId });
  }

  // ── Feature flag ──
  const enabled = sanitizeEnv(process.env[ENABLED_ENV_KEY]);
  if (enabled === 'false' && (mode === 'live' || mode === 'force')) {
    log.info('autopost disabled via env flag');
    return res.status(200).json({ ok: false, skipped: true, reason: 'MLB_AUTOPOST_ENABLED=false', requestId, dateKey });
  }

  // ── Supabase ──
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    log.error('supabase init failed:', e.message);
    return res.status(500).json({ ok: false, stage: 'supabase_init', error: e.message, requestId });
  }

  // ── Idempotency ──
  const { alreadyPosted, existing } = await checkAlreadyPosted(supabase, dateKey, log);
  log.info(`idempotency: alreadyPosted=${alreadyPosted}${existing ? `, mediaId=${existing.published_media_id}` : ''}`);

  if (alreadyPosted && mode === 'live') {
    log.info('skipping — already posted today');
    return res.status(200).json({
      ok: true, skipped: true,
      reason: 'Already posted for this date',
      requestId, dateKey, mode,
      existing: { id: existing.id, permalink: existing.permalink, mediaId: existing.published_media_id },
    });
  }

  // ── Preview mode: return metadata only ──
  if (mode === 'preview') {
    const baseUrl = `https://${req.headers.host || 'maximussports.ai'}`;
    const [liveGames, champOdds, mlbLeaders, mlbStandings, mlbPicks] = await Promise.all([
      fetchLiveGames(baseUrl, log),
      fetchChampOdds(baseUrl, log),
      fetchLeaders(baseUrl, log),
      fetchStandings(baseUrl, log),
      fetchPicks(baseUrl, log),
    ]);

    const content = buildSlideContent(liveGames, champOdds, dateLabel);
    const captionPayload = {
      section: 'daily-briefing',
      mlbLiveGames: liveGames,
      mlbBriefing: null,
      seasonIntel: null,
    };
    const { shortCaption, hashtags } = buildMlbCaption(captionPayload);
    const captionText = hashtags.length > 0 ? `${shortCaption}\n\n${hashtags.join(' ')}` : shortCaption;

    return res.status(200).json({
      ok: true, mode: 'preview', requestId, dateKey, dateLabel,
      alreadyPosted, existing: existing ? { id: existing.id, permalink: existing.permalink } : null,
      caption: captionText,
      captionLength: captionText.length,
      hashtagCount: hashtags.length,
      headline: content.headline,
      bulletCount: content.bullets.length,
      raceTeamCount: content.raceTeams.length,
      pickCount: content.picks.length,
      slideCount: 3,
      wouldPublish: !alreadyPosted,
      liveGameCount: liveGames.length,
      durationMs: Date.now() - startTs,
    });
  }

  // ── Render-preview mode: render slides, return base64 images (no publish) ──
  if (mode === 'render-preview') {
    const baseUrl = `https://${req.headers.host || 'maximussports.ai'}`;
    const [liveGames, champOdds, mlbLeaders, mlbStandings, mlbPicks] = await Promise.all([
      fetchLiveGames(baseUrl, log),
      fetchChampOdds(baseUrl, log),
      fetchLeaders(baseUrl, log),
      fetchStandings(baseUrl, log),
      fetchPicks(baseUrl, log),
    ]);

    const content = buildSlideContent(liveGames, champOdds, dateLabel);

    // Attempt browser render
    const browserData = {
      mlbLiveGames: liveGames,
      mlbChampOdds: champOdds ?? {},
      mlbLeaders: mlbLeaders ?? {},
      mlbStandings: mlbStandings ?? {},
      mlbBriefing: null,
      mlbPicks: mlbPicks ?? { categories: {} },
      canonicalPicks: mlbPicks ?? { categories: {} },
    };

    let slideBuffers;
    let renderMethod = 'unknown';

    try {
      const browserResult = await renderSlidesWithBrowser(baseUrl, browserData, log);
      if (browserResult && browserResult.length === 3) {
        slideBuffers = browserResult;
        renderMethod = 'browser';
      } else {
        slideBuffers = await Promise.all([
          renderSlide1(content),
          renderSlide2(content),
          renderSlide3(content),
        ]);
        renderMethod = 'satori-fallback';
      }
    } catch (e) {
      log.error('render-preview failed:', e.message);
      return res.status(500).json({ ok: false, stage: 'render_preview', error: e.message, requestId, dateKey });
    }

    // Return base64-encoded images for QA inspection
    const slides = slideBuffers.map((buf, i) => ({
      slide: i + 1,
      sizeKB: Math.round(buf.length / 1024),
      base64: `data:image/png;base64,${buf.toString('base64')}`,
    }));

    return res.status(200).json({
      ok: true, mode: 'render-preview', requestId, dateKey, dateLabel,
      renderMethod,
      headline: content.headline,
      slideCount: slides.length,
      slides,
      durationMs: Date.now() - startTs,
    });
  }

  // ── Failure persistence helper (visible in dashboard post history) ──
  async function persistFailure(stage, errorMsg) {
    try {
      await supabase.from('social_posts').insert([{
        platform: 'instagram',
        lifecycle_status: 'failed',
        content_type: 'carousel',
        title: `MLB Daily Briefing — ${dateKey}`,
        content_studio_section: 'daily-briefing',
        generated_by: 'autopost_cron',
        triggered_by: mode === 'force' ? 'manual_force' : 'cron_autopost',
        template_type: 'mlb-daily',
        route_used: '/api/social/instagram/autopost-mlb-daily',
        asset_version: requestId,
        response_stage: stage,
        error_message: errorMsg,
        status_detail: JSON.stringify({ mode, dateKey, stage, error: errorMsg, durationMs: Date.now() - startTs }),
      }]);
      log.info(`failure persisted to social_posts: stage=${stage}`);
    } catch (e) {
      log.warn('failure persistence failed (non-blocking):', e.message);
    }
  }

  // ── Assemble data ──
  const baseUrl = `https://${req.headers.host || 'maximussports.ai'}`;
  log.info('assembling data from:', baseUrl);

  let liveGames, champOdds, mlbLeaders, mlbStandings, mlbPicks;
  try {
    [liveGames, champOdds, mlbLeaders, mlbStandings, mlbPicks] = await Promise.all([
      fetchLiveGames(baseUrl, log),
      fetchChampOdds(baseUrl, log),
      fetchLeaders(baseUrl, log),
      fetchStandings(baseUrl, log),
      fetchPicks(baseUrl, log),
    ]);
    log.info(`data: ${liveGames.length} games, ${Object.keys(champOdds).length} odds, ${Object.keys(mlbLeaders?.categories || {}).length} leader cats, ${Object.keys(mlbStandings).length} standings, ${Object.keys(mlbPicks?.categories || {}).length} pick cats`);
  } catch (e) {
    log.error('data assembly failed:', e.message);
    if (mode === 'live' || mode === 'force') await persistFailure('data_assembly', e.message);
    return res.status(500).json({ ok: false, stage: 'data_assembly', error: e.message, requestId, dateKey });
  }

  // ── Build content ──
  let content;
  try {
    content = buildSlideContent(liveGames, champOdds, dateLabel);
    log.info(`content: headline="${content.headline?.slice(0, 50)}", ${content.bullets.length} bullets, ${content.raceTeams.length} race teams`);
  } catch (e) {
    log.error('content build failed:', e.message);
    if (mode === 'live' || mode === 'force') await persistFailure('content_build', e.message);
    return res.status(500).json({ ok: false, stage: 'content_build', error: e.message, requestId, dateKey });
  }

  // ── Build caption ──
  let captionText;
  try {
    const captionPayload = {
      section: 'daily-briefing',
      mlbLiveGames: liveGames,
      mlbBriefing: null,
      seasonIntel: null,
    };
    const { shortCaption, hashtags } = buildMlbCaption(captionPayload);
    captionText = hashtags.length > 0 ? `${shortCaption}\n\n${hashtags.join(' ')}` : shortCaption;
    log.info(`caption: ${captionText.length} chars, ${hashtags.length} hashtags`);
  } catch (e) {
    log.error('caption build failed:', e.message);
    if (mode === 'live' || mode === 'force') await persistFailure('caption_build', e.message);
    return res.status(500).json({ ok: false, stage: 'caption_build', error: e.message, requestId, dateKey });
  }

  // ── Render slides (browser primary, Satori fallback) ──
  let slideBuffers;
  let renderMethod = 'unknown';
  try {
    log.info('rendering 3 slides via headless browser...');

    // Build the data shape the real React slide components expect
    const browserData = {
      mlbLiveGames: liveGames,
      mlbChampOdds: champOdds ?? {},
      mlbLeaders: mlbLeaders ?? {},
      mlbStandings: mlbStandings ?? {},
      mlbBriefing: null,
      mlbPicks: mlbPicks ?? { categories: {} },
      canonicalPicks: mlbPicks ?? { categories: {} },
    };

    const browserResult = await renderSlidesWithBrowser(baseUrl, browserData, log);

    if (browserResult && browserResult.length === 3) {
      slideBuffers = browserResult;
      renderMethod = 'browser';
      log.info(`browser render SUCCESS: ${slideBuffers.map(b => `${(b.length / 1024).toFixed(0)}KB`).join(', ')}`);
    } else {
      log.warn('browser renderer returned null — falling back to Satori');
      slideBuffers = await Promise.all([
        renderSlide1(content),
        renderSlide2(content),
        renderSlide3(content),
      ]);
      renderMethod = 'satori-fallback';
      log.info(`Satori fallback rendered: ${slideBuffers.map(b => `${(b.length / 1024).toFixed(0)}KB`).join(', ')}`);
    }
  } catch (e) {
    log.error('slide render failed:', e.message, e.stack?.slice(0, 200));
    if (mode === 'live' || mode === 'force') await persistFailure('slide_render', e.message);
    return res.status(500).json({ ok: false, stage: 'slide_render', error: e.message, requestId, dateKey });
  }

  // ── Upload slides ──
  let imageUrls;
  try {
    log.info('uploading 3 slides to storage...');
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 6);
    imageUrls = await Promise.all(slideBuffers.map((buf, i) =>
      uploadPngBuffer(supabase, buf, `autopost_mlb_daily_${dateKey}_slide${i + 1}_${ts}_${rand}.png`, log)
    ));
    log.info('upload complete');
  } catch (e) {
    log.error('upload failed:', e.message);
    if (mode === 'live' || mode === 'force') await persistFailure('upload', e.message);
    return res.status(500).json({ ok: false, stage: 'upload', error: e.message, requestId, dateKey });
  }

  // ── Dry-run: stop before publishing ──
  if (mode === 'dry-run') {
    log.info('dry-run complete — not publishing');
    return res.status(200).json({
      ok: true, mode: 'dry-run', requestId, dateKey, dateLabel,
      caption: captionText,
      captionLength: captionText.length,
      imageUrls,
      imageCount: imageUrls.length,
      headline: content.headline,
      renderMethod,
      wouldPublish: true,
      durationMs: Date.now() - startTs,
    });
  }

  // ── Live / Force: publish carousel ──
  try {
    log.info(`publishing carousel (mode=${mode})...`);
    const metadata = {
      title: `MLB Daily Briefing — ${dateKey}`,
      contentStudioSection: 'daily-briefing',
      generatedBy: 'autopost_cron',
      templateType: 'mlb-daily',
      triggered_by: mode === 'force' ? 'manual_force' : 'cron_autopost',
    };

    const publishResult = await publishCarousel(imageUrls, captionText, metadata, baseUrl, log);

    // ── Update DB with autopost metadata ──
    if (publishResult.postId) {
      try {
        await supabase.from('social_posts').update({
          content_studio_section: 'daily-briefing',
          generated_by: 'autopost_cron',
          triggered_by: mode === 'force' ? 'manual_force' : 'cron_autopost',
          posted_at: new Date().toISOString(),
        }).eq('id', publishResult.postId);
      } catch (e) {
        log.warn('post-publish DB update failed (non-blocking):', e.message);
      }
    }

    const durationMs = Date.now() - startTs;
    log.info(`SUCCESS: published in ${durationMs}ms, permalink=${publishResult.permalink}`);

    return res.status(200).json({
      ok: true, mode, requestId, dateKey, dateLabel,
      publishedMediaId: publishResult.publishedMediaId,
      permalink: publishResult.permalink,
      postId: publishResult.postId,
      imageUrls,
      imageCount: imageUrls.length,
      renderMethod,
      captionLength: captionText.length,
      durationMs,
    });
  } catch (e) {
    log.error('publish failed:', e.message);
    // Note: publish-carousel.js handles its own DB failure persistence internally,
    // but the error from the autopost side should also be visible
    return res.status(502).json({
      ok: false, stage: 'publish', error: e.message,
      requestId, dateKey, mode,
      imageUrls,
      durationMs: Date.now() - startTs,
    });
  }
}
