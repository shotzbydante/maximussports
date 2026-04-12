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
import { getUserPinnedTeams, getPinnedTeamSlugs, fetchUserTeamsBatch } from '../_lib/getUserPinnedTeams.js';
import { TEAM_DIGEST_MAX_TEAMS } from '../_lib/teamDigest.js';

import {
  VALID_EMAIL_TYPES, resolveTemplate, getEmailConfig, getEmailSport,
  assembleEmailData, buildEmailData, loadTeamLookup, filterSportSlugs,
  enrichMlbTeamDigests, emailPayloadDigest,
} from '../_lib/emailPipeline.js';

const DEBUG_MARKER = 'EMAIL_TEST_V5';
const VALID_TYPES = VALID_EMAIL_TYPES;

const FALLBACK_PINNED_TEAMS = [
  { name: 'Duke Blue Devils',  slug: 'duke-blue-devils' },
  { name: 'Kansas Jayhawks',   slug: 'kansas-jayhawks'  },
];

/** Template import map — matches the centralized EMAIL_REGISTRY */
const TEMPLATE_IMPORTS = {
  globalBriefing: () => import('../../src/emails/templates/globalBriefing.js'),
  daily:          () => import('../../src/emails/templates/dailyBriefing.js'),
  pinned:         () => import('../../src/emails/templates/pinnedTeamsAlerts.js'),
  odds:           () => import('../../src/emails/templates/oddsIntel.js'),
  news:           () => import('../../src/emails/templates/breakingNews.js'),
  teamDigest:     () => import('../../src/emails/templates/teamDigest.js'),
  mlbBriefing:    () => import('../../src/emails/templates/mlbBriefing.js'),
  mlbPicks:       () => import('../../src/emails/templates/mlbPicks.js'),
  mlbTeamDigest:  () => import('../../src/emails/templates/mlbTeamDigest.js'),
};

async function loadTemplate(type) {
  const tpl = resolveTemplate(type);
  const loader = tpl ? TEMPLATE_IMPORTS[tpl] : null;
  if (!loader) throw new Error(`Unknown template for type: ${type} (resolved: ${tpl})`);
  return loader();
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

    // ── STEP 1: load_template ──
    let step = 'load_template';
    console.log(`[send-test] ${DEBUG_MARKER} step=${step} type=${type}`);
    let tmpl;
    try { tmpl = await loadTemplate(type); }
    catch (err) {
      console.error(`[send-test] ${DEBUG_MARKER} FAIL step=${step}:`, err.message);
      return res.status(500).json({ ok: false, code: 'STEP_FAILED', step, error: err.message, marker: DEBUG_MARKER });
    }

    // ── STEP 2: assemble_data (via centralized pipeline) ──
    step = 'assemble_data';
    const tplName = resolveTemplate(type);
    const emailConfig = getEmailConfig(type);
    console.log(`[send-test] ${DEBUG_MARKER} step=${step} type=${type} template=${tplName} sport=${emailConfig?.sport}`);
    let emailData;
    try {
      const displayName = getUserDisplayName({ user });
      const host = req.headers.host || 'localhost:3000';
      const proto = host.includes('localhost') ? 'http' : 'https';
      const baseUrl = `${proto}://${host}`;

      // Canonical data assembly (same logic as all send paths)
      const assembled = await assembleEmailData(type, baseUrl);

      // Recipient context (pinned teams)
      let pinnedTeams = [];
      let pinnedSlugs = [];
      try {
        const sb = getSupabaseAdmin();
        pinnedTeams = await getUserPinnedTeams(sb, user.id);
        const teamMap = await fetchUserTeamsBatch(sb, [user.id]);
        pinnedSlugs = getPinnedTeamSlugs(teamMap[user.id] || []);
      } catch (e) { console.warn(`[send-test] pinned teams fetch failed: ${e.message}`); }

      // NCAAM fallback pinned teams
      if (pinnedTeams.length === 0 && emailConfig?.sport === 'ncaam') {
        pinnedTeams = FALLBACK_PINNED_TEAMS;
        pinnedSlugs = FALLBACK_PINNED_TEAMS.map(t => t.slug);
      }

      emailData = buildEmailData(type, assembled, { displayName, pinnedTeams, pinnedSlugs });

      // Parity digest
      const digest = emailPayloadDigest(type, emailData);
      console.log(`[send-test] ${DEBUG_MARKER} payload digest:`, JSON.stringify(digest));
    } catch (err) {
      console.error(`[send-test] ${DEBUG_MARKER} FAIL step=${step}:`, err.message, err.stack);
      return res.status(500).json({ ok: false, code: 'STEP_FAILED', step, error: err.message, marker: DEBUG_MARKER });
    }

    // ── STEP 3: render_email ──
    step = 'render_email';
    console.log(`[send-test] ${DEBUG_MARKER} step=${step} type=${type} template=${tplName}`);
    let subject, html, text;
    try {
      if (emailConfig?.isTeamDigest) {
        const getTeamBySlug = await loadTeamLookup(type);
        const sportSlugs = filterSportSlugs(emailData.pinnedSlugs, getTeamBySlug);
        console.log(`[send-test] Digest: total=${emailData.pinnedSlugs?.length} sport=${sportSlugs.length}`);
        const { assembleTeamDigestPayload: assemble } = await import('../_lib/teamDigest.js');
        const teamDigests = assemble(sportSlugs.slice(0, TEAM_DIGEST_MAX_TEAMS), emailData, getTeamBySlug);
        if (emailConfig.enrichTeamIntel) await enrichMlbTeamDigests(teamDigests, getTeamBySlug);
        const digestData = { ...emailData, teamDigests, totalTeamCount: sportSlugs.length };
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
