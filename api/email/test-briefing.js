/**
 * POST /api/email/test-briefing
 *
 * Admin diagnostic endpoint: checks eligibility and optionally sends
 * a Daily Briefing to a specific user.
 *
 * Body: { email?: string, userId?: string, send?: boolean }
 *   - Provide email or userId to identify the target user.
 *   - Set send: true to actually deliver the email (default: dry run).
 *
 * Auth: admin JWT required.
 *
 * Response (dry run):
 * {
 *   eligible: true/false,
 *   reason: "briefing enabled by default" | "opted_out" | ...,
 *   profile: { exists, preferences },
 *   emailSent: false
 * }
 */

import { verifyUserToken, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { isAdminEmail } from '../_lib/admin.js';
import { DEFAULT_EMAIL_PREFS } from '../_lib/emailDefaults.js';
import { sendEmail } from '../_lib/sendEmail.js';
import { getUserDisplayName } from '../_lib/personalization.js';
import { dedupeNewsItems } from '../_lib/newsDedupe.js';
import { fetchScoresSource, fetchRankingsSource, fetchNewsAggregateSource } from '../_sources.js';
import { getAtsLeadersPipeline } from '../home/atsPipeline.js';
import { getJson } from '../_globalCache.js';
import { getSubject as getDailySubject, renderHTML as renderDailyHTML, renderText as renderDailyText } from '../../src/emails/templates/dailyBriefing.js';

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
  } catch { /* fallthrough */ }

  const bullets = [];
  const best = atsLeaders?.best || [];
  if (best.length > 0) {
    const top = best[0];
    const pct = top.pct != null ? `${Math.round(top.pct * 100)}%` : null;
    bullets.push(`${top.name || top.team} leans as the top ATS cover trend right now${pct ? ` (${pct} cover rate)` : ''}.`);
  }
  if (scoresToday.length > 0) {
    bullets.push(`${scoresToday.length} game${scoresToday.length !== 1 ? 's' : ''} on the board today.`);
  }
  return bullets.slice(0, 4);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Not signed in.' });

  let caller;
  try { caller = await verifyUserToken(token); } catch { return res.status(503).json({ error: 'Auth unavailable.' }); }
  if (!caller || !isAdminEmail(caller.email)) return res.status(403).json({ error: 'Admin only.' });

  const { email: targetEmail, userId: targetUserId, send = false } = req.body || {};
  if (!targetEmail && !targetUserId) {
    return res.status(400).json({ error: 'Provide email or userId.' });
  }

  let sb;
  try { sb = getSupabaseAdmin(); } catch { return res.status(503).json({ error: 'DB unavailable.' }); }

  try {
    // Resolve the target auth user
    let authUser = null;
    if (targetUserId) {
      const { data, error } = await sb.auth.admin.getUserById(targetUserId);
      if (!error && data?.user) authUser = data.user;
    } else {
      const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
      authUser = (list?.users || []).find(u => u.email?.toLowerCase() === targetEmail.toLowerCase());
    }

    if (!authUser) {
      return res.status(404).json({ eligible: false, reason: 'user_not_found', emailSent: false });
    }

    if (!authUser.email) {
      return res.status(200).json({ eligible: false, reason: 'no_deliverable_email', emailSent: false });
    }

    // Load profile
    const { data: profile } = await sb
      .from('profiles')
      .select('id, full_name, display_name, username, preferences, plan_tier')
      .eq('id', authUser.id)
      .maybeSingle();

    const prefs = { ...DEFAULT_EMAIL_PREFS, ...(profile?.preferences || {}) };
    const briefingEnabled = prefs.briefing === true;

    const result = {
      userId: authUser.id,
      email: authUser.email,
      profileExists: !!profile,
      preferences: prefs,
      eligible: briefingEnabled,
      reason: !profile
        ? 'no_profile_using_defaults_briefing_true'
        : briefingEnabled
          ? 'briefing_enabled'
          : 'briefing_opted_out',
      emailSent: false,
    };

    if (!briefingEnabled || !send) {
      return res.status(200).json(result);
    }

    // Build and send the email
    const [scoresTodayRaw, rankingsData, atsResult, newsData] = await Promise.allSettled([
      fetchScoresSource(), fetchRankingsSource(), getAtsLeadersPipeline(),
      fetchNewsAggregateSource({ includeNational: true }),
    ]);

    const scoresToday = scoresTodayRaw.status === 'fulfilled' ? (scoresTodayRaw.value || []) : [];
    const rankingsTop25 = rankingsData.status === 'fulfilled'
      ? (rankingsData.value?.rankings || []).slice(0, 25) : [];
    const atsLeaders = atsResult.status === 'fulfilled'
      ? { best: atsResult.value?.best || [], worst: atsResult.value?.worst || [] }
      : { best: [], worst: [] };
    const headlines = dedupeNewsItems(
      newsData.status === 'fulfilled' ? (newsData.value?.items || []) : []
    );

    let botIntelBullets = [];
    try { botIntelBullets = await getBotIntelBullets(atsLeaders, rankingsTop25, scoresToday); } catch { /* ok */ }

    const displayName = getUserDisplayName({ user: authUser, profile });
    const emailData = {
      displayName, scoresToday, rankingsTop25, atsLeaders, headlines,
      pinnedTeams: [], botIntelBullets,
      maximusNote: botIntelBullets[0] || '', oddsGames: [],
    };

    const subject = `[DIAG] ${getDailySubject(emailData)}`;
    const html = renderDailyHTML(emailData);
    const text = renderDailyText(emailData);

    await sendEmail({ to: authUser.email, subject, html, text });

    result.emailSent = true;
    console.log(`[test-briefing] Sent diagnostic briefing to ${authUser.email}`);
    return res.status(200).json(result);

  } catch (err) {
    console.error('[test-briefing] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
