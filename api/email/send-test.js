/**
 * POST /api/email/send-test
 * Admin-only endpoint that sends a test email for a given subscription type.
 *
 * Body:   { type: 'daily' | 'pinned' | 'odds' | 'news' }
 * Auth:   Authorization: Bearer <supabase-access-token>
 * Access: admin user only (see api/_lib/admin.js)
 *
 * Error codes returned in JSON:
 *   AUTH_UNAVAILABLE — Supabase env vars not configured on the server
 *   AUTH_INVALID     — JWT missing, expired, or invalid
 *   NOT_ADMIN        — Valid user but not the admin email
 *   BAD_TYPE         — type param missing or unrecognised
 */

import { verifyUserToken, getEnvStatus } from '../_lib/supabaseAdmin.js';
import { ADMIN_EMAIL, isAdminEmail } from '../_lib/admin.js';
import { sendEmail } from '../_lib/sendEmail.js';
import { fetchScoresSource, fetchRankingsSource, fetchNewsAggregateSource } from '../_sources.js';
import { getAtsLeadersPipeline } from '../home/atsPipeline.js';
import { getSubject as getDailySubject,  renderHTML as renderDailyHTML,  renderText as renderDailyText  } from '../../src/emails/templates/dailyBriefing.js';
import { getSubject as getPinnedSubject, renderHTML as renderPinnedHTML, renderText as renderPinnedText } from '../../src/emails/templates/pinnedTeamsAlerts.js';
import { getSubject as getOddsSubject,   renderHTML as renderOddsHTML,   renderText as renderOddsText   } from '../../src/emails/templates/oddsIntel.js';
import { getSubject as getNewsSubject,   renderHTML as renderNewsHTML,   renderText as renderNewsText   } from '../../src/emails/templates/breakingNews.js';

const VALID_TYPES = ['daily', 'pinned', 'odds', 'news'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed' });

  // ── Extract JWT ────────────────────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({ code: 'AUTH_INVALID', error: 'Not signed in.' });
  }

  // ── Verify JWT ─────────────────────────────────────────────────────────────
  let user;
  try {
    user = await verifyUserToken(token);
  } catch (err) {
    const env = getEnvStatus();
    console.error('[send-test] auth init failed', {
      code: err.code || 'AUTH_UNAVAILABLE',
      hasUrl: env.hasUrl,
      urlHost: env.urlHost,
      hasAnonKey: env.hasAnonKey,
      message: err.message,
    });
    return res.status(503).json({
      code: 'AUTH_UNAVAILABLE',
      error: 'Auth service unavailable. Check server environment configuration.',
    });
  }

  if (!user) {
    return res.status(401).json({ code: 'AUTH_INVALID', error: 'Invalid or expired session. Please sign out and back in.' });
  }

  // ── Admin gate ─────────────────────────────────────────────────────────────
  if (!isAdminEmail(user.email)) {
    return res.status(403).json({ code: 'NOT_ADMIN', error: 'Admin access only.' });
  }

  // ── Validate type param ────────────────────────────────────────────────────
  const { type } = req.body || {};
  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({
      code: 'BAD_TYPE',
      error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`,
    });
  }

  // ── Gather data and render ─────────────────────────────────────────────────
  try {
    const [scoresTodayRaw, rankingsData, atsResult, newsData] = await Promise.allSettled([
      fetchScoresSource(),
      fetchRankingsSource(),
      getAtsLeadersPipeline(),
      fetchNewsAggregateSource({ includeNational: true }),
    ]);

    const emailData = {
      displayName: 'Maximus Admin',
      scoresToday:   scoresTodayRaw.status === 'fulfilled' ? (scoresTodayRaw.value || []) : [],
      rankingsTop25: rankingsData.status  === 'fulfilled' ? (rankingsData.value?.rankings || []).slice(0, 25) : [],
      atsLeaders:    atsResult.status     === 'fulfilled'
        ? { best: atsResult.value?.best || [], worst: atsResult.value?.worst || [] }
        : { best: [], worst: [] },
      headlines:     newsData.status      === 'fulfilled' ? (newsData.value?.items || []) : [],
      pinnedTeams: [
        { name: 'Duke Blue Devils', slug: 'duke' },
        { name: 'Kansas Jayhawks', slug: 'kansas' },
      ],
    };

    let subject, html, text;
    switch (type) {
      case 'daily':  subject = getDailySubject(emailData);  html = renderDailyHTML(emailData);  text = renderDailyText(emailData);  break;
      case 'pinned': subject = getPinnedSubject(emailData); html = renderPinnedHTML(emailData); text = renderPinnedText(emailData); break;
      case 'odds':   subject = getOddsSubject(emailData);   html = renderOddsHTML(emailData);   text = renderOddsText(emailData);   break;
      case 'news':   subject = getNewsSubject(emailData);   html = renderNewsHTML(emailData);   text = renderNewsText(emailData);   break;
    }

    subject = `[TEST] ${subject}`;
    const sendTo = user.email;

    await sendEmail({ to: sendTo, subject, html, text });

    console.log(`[send-test] ok type=${type} to=${sendTo}`);
    return res.status(200).json({ ok: true, type, to: sendTo });

  } catch (err) {
    console.error(`[send-test] render/send failed type=${type}:`, err.message);
    return res.status(500).json({ code: 'SEND_FAILED', error: err.message || 'Failed to send test email.' });
  }
}
