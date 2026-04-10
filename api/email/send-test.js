/* global process */
/**
 * POST /api/email/send-test
 * Admin-only endpoint that sends a test email for a given subscription type.
 *
 * Body:   { type: '<email_type>' }  (see VALID_TYPES)
 * Auth:   Authorization: Bearer <supabase-access-token>
 * Access: admin user only (see api/_lib/admin.js)
 *
 * GET returns a health/debug response without requiring auth.
 *
 * MLB types use assembleMlbEmailData() for MLB-only content.
 * NCAAM/global types use the original NCAAM-based pipeline.
 */

import { verifyUserToken, getEnvStatus, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { isAdminEmail } from '../_lib/admin.js';
import { sendEmail } from '../_lib/sendEmail.js';
import { getUserDisplayName } from '../_lib/personalization.js';
import { dedupeNewsItems } from '../_lib/newsDedupe.js';
import { fetchScoresSource, fetchRankingsSource, fetchNewsAggregateSource, fetchOddsSource } from '../_sources.js';
import { getAtsLeadersPipeline } from '../home/atsPipeline.js';
import { getJson } from '../_globalCache.js';
import { getUserPinnedTeams, getPinnedTeamSlugs, fetchUserTeamsBatch } from '../_lib/getUserPinnedTeams.js';
import { assembleMlbEmailData } from '../_lib/mlbEmailData.js';

const DEBUG_MARKER = 'EMAIL_TEST_V4';
const VALID_TYPES = [
  'global_briefing',
  'mlb_briefing', 'mlb_team_digest', 'mlb_picks',
  'ncaam_briefing', 'ncaam_team_digest', 'ncaam_picks',
];

/** Map new type → template key for dynamic import. */
const TYPE_TO_TEMPLATE = {
  global_briefing:   'daily',
  ncaam_briefing:    'daily',
  ncaam_team_digest: 'pinned',
  ncaam_picks:       'odds',
  mlb_briefing:      'mlbBriefing',
  mlb_team_digest:   'mlbTeamDigest',
  mlb_picks:         'mlbPicks',
};

const FALLBACK_PINNED_TEAMS = [
  { name: 'Duke Blue Devils',  slug: 'duke-blue-devils' },
  { name: 'Kansas Jayhawks',   slug: 'kansas-jayhawks'  },
];

async function loadTemplate(type) {
  const tpl = TYPE_TO_TEMPLATE[type] || type;
  switch (tpl) {
    case 'daily':        return import('../../src/emails/templates/dailyBriefing.js');
    case 'pinned':       return import('../../src/emails/templates/pinnedTeamsAlerts.js');
    case 'odds':         return import('../../src/emails/templates/oddsIntel.js');
    case 'news':         return import('../../src/emails/templates/breakingNews.js');
    case 'teamDigest':   return import('../../src/emails/templates/teamDigest.js');
    case 'mlbBriefing':  return import('../../src/emails/templates/mlbBriefing.js');
    case 'mlbPicks':     return import('../../src/emails/templates/mlbPicks.js');
    case 'mlbTeamDigest': return import('../../src/emails/templates/mlbTeamDigest.js');
    default:             throw new Error(`Unknown template type: ${type} (mapped: ${tpl})`);
  }
}

async function getBotIntelBullets(atsLeaders, rankingsTop25, scoresToday) {
  try {
    const kvSummary = await getJson('chat:home:summary:v1');
    if (kvSummary?.text || kvSummary?.summary) {
      const text = kvSummary.text || kvSummary.summary || '';
      const rawLines = text.split(/[-\n•*]+/).map(l => l.replace(/^\d+\.\s*/, '').trim()).filter(l => l.length > 20 && l.length < 200);
      if (rawLines.length >= 2) return rawLines.slice(0, 4);
    }
  } catch { /* KV unavailable */ }
  const bullets = [];
  const best = atsLeaders?.best || [];
  if (best.length > 0) {
    const top = best[0];
    const pct = top.pct != null ? `${Math.round(top.pct * 100)}%` : null;
    bullets.push(`${top.name || top.team} leans as the top ATS cover trend right now${pct ? ` (${pct} cover rate)` : ''} — worth monitoring before tip.`);
  }
  if (scoresToday.length > 0) bullets.push(`${scoresToday.length} game${scoresToday.length !== 1 ? 's' : ''} on the board today.`);
  return bullets.slice(0, 4);
}

export default async function handler(req, res) {
  console.log(`[send-test] ${DEBUG_MARKER} handler entered method=${req.method}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true, route: '/api/email/send-test', marker: DEBUG_MARKER,
      env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
      note: 'POST required for test send',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed', marker: DEBUG_MARKER });
  }

  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) return res.status(401).json({ code: 'AUTH_INVALID', error: 'Not signed in.', marker: DEBUG_MARKER });

    let user;
    try { user = await verifyUserToken(token); }
    catch (err) {
      console.error('[send-test] auth init failed', err.message);
      return res.status(503).json({ code: 'AUTH_UNAVAILABLE', error: 'Auth service unavailable.', marker: DEBUG_MARKER });
    }
    if (!user) return res.status(401).json({ code: 'AUTH_INVALID', error: 'Invalid or expired session.', marker: DEBUG_MARKER });
    if (!isAdminEmail(user.email)) return res.status(403).json({ code: 'NOT_ADMIN', error: 'Admin access only.', marker: DEBUG_MARKER });

    const { type } = req.body || {};
    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({ code: 'BAD_TYPE', error: `Must be one of: ${VALID_TYPES.join(', ')}`, marker: DEBUG_MARKER });
    }

    const tplType = TYPE_TO_TEMPLATE[type] || type;
    const isMLB = type.startsWith('mlb_');

    // ── STEP 1: load_template ──
    let step = 'load_template';
    console.log(`[send-test] ${DEBUG_MARKER} step=${step} type=${type} isMLB=${isMLB}`);
    let tmpl;
    try { tmpl = await loadTemplate(type); }
    catch (err) {
      console.error(`[send-test] ${DEBUG_MARKER} FAIL step=${step}:`, err.message);
      return res.status(500).json({ ok: false, code: 'STEP_FAILED', step, error: err.message, marker: DEBUG_MARKER });
    }

    // ── STEP 2: assemble_data ──
    step = 'assemble_data';
    console.log(`[send-test] ${DEBUG_MARKER} step=${step} isMLB=${isMLB}`);
    let emailData;
    try {
      const displayName = getUserDisplayName({ user });
      const host = req.headers.host || 'localhost:3000';
      const baseUrl = `http://${host}`;

      if (isMLB) {
        // ── MLB-SPECIFIC DATA (no NCAAM contamination possible) ──
        const mlbData = await assembleMlbEmailData(baseUrl, {
          includeSummary: tplType === 'mlbBriefing',
          includePicks: tplType === 'mlbPicks',
        });

        let pinnedTeams = [];
        let pinnedSlugs = [];
        try {
          const sb = getSupabaseAdmin();
          pinnedTeams = await getUserPinnedTeams(sb, user.id);
          const teamMap = await fetchUserTeamsBatch(sb, [user.id]);
          pinnedSlugs = getPinnedTeamSlugs(teamMap[user.id] || []);
        } catch (e) { console.warn(`[send-test] pinned teams fetch failed: ${e.message}`); }

        emailData = {
          displayName,
          ...mlbData,
          pinnedTeams,
          pinnedSlugs,
          maximusNote: mlbData.botIntelBullets[0] || '',
        };

        console.log(`[send-test] ${DEBUG_MARKER} MLB data assembled: ${mlbData.headlines.length} headlines, ${mlbData.scoresToday.length} scores`);

      } else {
        // ── NCAAM / GLOBAL DATA (original pipeline) ──
        const [scoresTodayRaw, rankingsData, atsResult, newsData, oddsRaw] = await Promise.allSettled([
          fetchScoresSource(),
          fetchRankingsSource(),
          getAtsLeadersPipeline(),
          fetchNewsAggregateSource({ includeNational: true }),
          (tplType === 'odds') ? fetchOddsSource() : Promise.resolve(null),
        ]);

        const scoresToday   = scoresTodayRaw.status === 'fulfilled' ? (scoresTodayRaw.value || []) : [];
        const rankingsTop25 = rankingsData.status  === 'fulfilled' ? (rankingsData.value?.rankings || []).slice(0, 25) : [];
        const atsLeaders    = atsResult.status     === 'fulfilled'
          ? { best: atsResult.value?.best || [], worst: atsResult.value?.worst || [] }
          : { best: [], worst: [] };
        const headlinesRaw  = newsData.status      === 'fulfilled' ? (newsData.value?.items || []) : [];
        const headlines     = dedupeNewsItems(headlinesRaw);
        const oddsGames     = (oddsRaw.status === 'fulfilled' && oddsRaw.value?.games)
          ? oddsRaw.value.games.map(g => ({ ...g, gameStatus: 'Scheduled', startTime: g.commenceTime || null }))
          : [];

        let botIntelBullets = [];
        if (tplType === 'daily' || tplType === 'pinned') {
          try { botIntelBullets = await getBotIntelBullets(atsLeaders, rankingsTop25, scoresToday); }
          catch { botIntelBullets = []; }
        }

        let pinnedTeams = [];
        let pinnedSlugs = [];
        try {
          const sb = getSupabaseAdmin();
          pinnedTeams = await getUserPinnedTeams(sb, user.id);
          const teamMap = await fetchUserTeamsBatch(sb, [user.id]);
          pinnedSlugs = getPinnedTeamSlugs(teamMap[user.id] || []);
        } catch (e) { console.warn(`[send-test] pinned teams fetch failed: ${e.message}`); }
        if (pinnedTeams.length === 0) {
          pinnedTeams = FALLBACK_PINNED_TEAMS;
          pinnedSlugs = FALLBACK_PINNED_TEAMS.map(t => t.slug);
        }

        emailData = {
          displayName, scoresToday, rankingsTop25, atsLeaders, headlines,
          pinnedTeams, pinnedSlugs, botIntelBullets,
          maximusNote: botIntelBullets[0] || '', oddsGames,
        };
      }
    } catch (err) {
      console.error(`[send-test] ${DEBUG_MARKER} FAIL step=${step}:`, err.message, err.stack);
      return res.status(500).json({ ok: false, code: 'STEP_FAILED', step, error: err.message, marker: DEBUG_MARKER });
    }

    // ── STEP 3: render_email ──
    step = 'render_email';
    console.log(`[send-test] ${DEBUG_MARKER} step=${step} type=${type}`);
    let subject, html, text;
    try {
      if (tplType === 'teamDigest' || tplType === 'mlbTeamDigest') {
        const { assembleTeamDigestPayload: assemble, TEAM_DIGEST_MAX_TEAMS: max } = await import('../_lib/teamDigest.js');
        const { getTeamBySlug } = await import('../../src/data/teams.js');
        const teamDigests = assemble(emailData.pinnedSlugs.slice(0, max), emailData, getTeamBySlug);
        const digestData = { ...emailData, teamDigests, totalTeamCount: emailData.pinnedSlugs.length };
        subject = tmpl.getSubject(digestData);
        html    = tmpl.renderHTML(digestData);
        text    = tmpl.renderText(digestData);
      } else {
        subject = tmpl.getSubject(emailData);
        html    = tmpl.renderHTML(emailData);
        text    = tmpl.renderText(emailData);
      }
    } catch (err) {
      console.error(`[send-test] ${DEBUG_MARKER} FAIL step=${step}:`, err.message, err.stack);
      return res.status(500).json({ ok: false, code: 'STEP_FAILED', step, error: err.message, marker: DEBUG_MARKER });
    }
    console.log(`[send-test] ${DEBUG_MARKER} step=${step} ok subject="${subject?.slice(0, 60)}"`);

    // ── STEP 4: send_email ──
    step = 'send_email';
    console.log(`[send-test] ${DEBUG_MARKER} step=${step} to=${user.email}`);
    try {
      subject = `[TEST] ${subject}`;
      await sendEmail({ to: user.email, subject, html, text });
    } catch (err) {
      console.error(`[send-test] ${DEBUG_MARKER} FAIL step=${step}:`, err.message, err.stack);
      return res.status(500).json({ ok: false, code: 'STEP_FAILED', step, error: err.message, marker: DEBUG_MARKER });
    }

    console.log(`[send-test] ${DEBUG_MARKER} ALL STEPS OK type=${type} to=${user.email}`);
    return res.status(200).json({ ok: true, type, to: user.email, displayName: emailData.displayName, marker: DEBUG_MARKER });

  } catch (err) {
    console.error(`[send-test] ${DEBUG_MARKER} UNHANDLED:`, err.message, err.stack);
    return res.status(500).json({ ok: false, code: 'UNHANDLED', step: 'unknown', error: err.message, marker: DEBUG_MARKER });
  }
}
