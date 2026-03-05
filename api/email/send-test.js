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
import { getUserDisplayName } from '../_lib/personalization.js';
import { dedupeNewsItems } from '../_lib/newsDedupe.js';
import { fetchScoresSource, fetchRankingsSource, fetchNewsAggregateSource } from '../_sources.js';
import { getAtsLeadersPipeline } from '../home/atsPipeline.js';
import { getJson } from '../_globalCache.js';
import { getSubject as getDailySubject,  renderHTML as renderDailyHTML,  renderText as renderDailyText  } from '../../src/emails/templates/dailyBriefing.js';
import { getSubject as getPinnedSubject, renderHTML as renderPinnedHTML, renderText as renderPinnedText } from '../../src/emails/templates/pinnedTeamsAlerts.js';
import { getSubject as getOddsSubject,   renderHTML as renderOddsHTML,   renderText as renderOddsText   } from '../../src/emails/templates/oddsIntel.js';
import { getSubject as getNewsSubject,   renderHTML as renderNewsHTML,   renderText as renderNewsText   } from '../../src/emails/templates/breakingNews.js';
import { getSubject as getDigestSubject, renderHTML as renderDigestHTML, renderText as renderDigestText } from '../../src/emails/templates/teamDigest.js';
import { assembleTeamDigestPayload, TEAM_DIGEST_MAX_TEAMS } from '../_lib/teamDigest.js';

const VALID_TYPES = ['daily', 'pinned', 'odds', 'news', 'teamDigest'];

// Test pinned teams using correct full slugs from data/teams.js
const TEST_PINNED_TEAMS = [
  { name: 'Duke Blue Devils',  slug: 'duke-blue-devils',  logo: '/logos/duke-blue-devils.svg' },
  { name: 'Kansas Jayhawks',   slug: 'kansas-jayhawks',   logo: '/logos/kansas-jayhawks.svg'  },
];

// Test teams for Team Digest
const TEST_DIGEST_TEAM_SLUGS = ['duke-blue-devils', 'kansas-jayhawks', 'uconn-huskies'];

/**
 * Try to extract concise bullets from cached LLM home summary,
 * falling back to data-derived bullets if unavailable.
 */
async function getBotIntelBullets(atsLeaders, rankingsTop25, scoresToday) {
  try {
    const kvSummary = await getJson('chat:home:summary:v1');
    if (kvSummary?.text || kvSummary?.summary) {
      const text = kvSummary.text || kvSummary.summary || '';
      const rawLines = text
        .split(/[-\n•*]+/)
        .map(l => l.replace(/^\d+\.\s*/, '').trim())
        .filter(l => l.length > 20 && l.length < 200);
      if (rawLines.length >= 2) return rawLines.slice(0, 4);
    }
  } catch {
    // KV unavailable
  }

  const bullets = [];
  const best = atsLeaders?.best || [];
  if (best.length > 0) {
    const top = best[0];
    const pct = top.pct != null ? `${Math.round(top.pct * 100)}%` : null;
    bullets.push(`${top.name || top.team} leans as the top ATS cover trend right now${pct ? ` (${pct} cover rate)` : ''} — worth monitoring before tip.`);
  }
  if (best.length > 1) {
    bullets.push(`Watch ${best[1].name || best[1].team} as a secondary value edge — strong recent ATS form.`);
  }
  if (scoresToday.length > 0) {
    bullets.push(`${scoresToday.length} game${scoresToday.length !== 1 ? 's' : ''} on the board today. Monitor line movement in the hour before tip for sharp action.`);
  }
  if (rankingsTop25.length >= 3) {
    const t = rankingsTop25[0];
    const name = t.teamName || t.name || t.team || '';
    if (name) bullets.push(`${name} holds the top spot in the AP poll. Ranked teams trend value late in the season.`);
  }
  return bullets.slice(0, 4);
}

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

    const scoresToday   = scoresTodayRaw.status === 'fulfilled' ? (scoresTodayRaw.value || []) : [];
    const rankingsTop25 = rankingsData.status  === 'fulfilled' ? (rankingsData.value?.rankings || []).slice(0, 25) : [];
    const atsLeaders    = atsResult.status     === 'fulfilled'
      ? { best: atsResult.value?.best || [], worst: atsResult.value?.worst || [] }
      : { best: [], worst: [] };
    const headlinesRaw  = newsData.status      === 'fulfilled' ? (newsData.value?.items || []) : [];
    const headlines     = dedupeNewsItems(headlinesRaw);

    // Resolve display name from the authenticated admin user
    const displayName = getUserDisplayName({ user });

    // Bot intel bullets for daily/pinned types
    let botIntelBullets = [];
    if (type === 'daily' || type === 'pinned') {
      try {
        botIntelBullets = await getBotIntelBullets(atsLeaders, rankingsTop25, scoresToday);
      } catch {
        botIntelBullets = [];
      }
    }

    const maximusNote = botIntelBullets.length > 0 ? botIntelBullets[0] : '';

    const emailData = {
      displayName,
      scoresToday,
      rankingsTop25,
      atsLeaders,
      headlines,
      pinnedTeams: TEST_PINNED_TEAMS,
      botIntelBullets,
      maximusNote,
    };

    let subject, html, text;
    switch (type) {
      case 'daily':  subject = getDailySubject(emailData);  html = renderDailyHTML(emailData);  text = renderDailyText(emailData);  break;
      case 'pinned': subject = getPinnedSubject(emailData); html = renderPinnedHTML(emailData); text = renderPinnedText(emailData); break;
      case 'odds':   subject = getOddsSubject(emailData);   html = renderOddsHTML(emailData);   text = renderOddsText(emailData);   break;
      case 'news':   subject = getNewsSubject(emailData);   html = renderNewsHTML(emailData);   text = renderNewsText(emailData);   break;
      case 'teamDigest': {
        const { getTeamBySlug } = await import('../../src/data/teams.js');
        const sharedDigestData = { scoresToday, rankingsTop25, atsLeaders, headlines };
        const teamDigests = assembleTeamDigestPayload(
          TEST_DIGEST_TEAM_SLUGS.slice(0, TEAM_DIGEST_MAX_TEAMS),
          sharedDigestData,
          getTeamBySlug
        );
        const digestData = { ...emailData, teamDigests, totalTeamCount: TEST_DIGEST_TEAM_SLUGS.length };
        subject = getDigestSubject(digestData);
        html    = renderDigestHTML(digestData);
        text    = renderDigestText(digestData);
        break;
      }
    }

    subject = `[TEST] ${subject}`;
    const sendTo = user.email;

    await sendEmail({ to: sendTo, subject, html, text });

    console.log(`[send-test] ok type=${type} to=${sendTo} displayName=${displayName}`);
    return res.status(200).json({ ok: true, type, to: sendTo, displayName });

  } catch (err) {
    console.error(`[send-test] render/send failed type=${type}:`, err.message);
    return res.status(500).json({ code: 'SEND_FAILED', error: err.message || 'Failed to send test email.' });
  }
}
