/**
 * POST /api/email/send-test
 * Admin-only endpoint to send a test email for QA purposes.
 *
 * Body: { type: 'daily' | 'pinned' | 'odds' | 'news' }
 * Auth: Bearer JWT in Authorization header.
 * Restricted to: dantedicco@gmail.com
 */

import { verifyUserToken } from '../_lib/supabaseAdmin.js';
import { sendEmail } from '../_lib/sendEmail.js';
import { fetchScoresSource, fetchRankingsSource, fetchNewsAggregateSource } from '../_sources.js';
import { getAtsLeadersPipeline } from '../home/atsPipeline.js';
import { getSubject as getDailySubject, renderHTML as renderDailyHTML, renderText as renderDailyText } from '../../src/emails/templates/dailyBriefing.js';
import { getSubject as getPinnedSubject, renderHTML as renderPinnedHTML, renderText as renderPinnedText } from '../../src/emails/templates/pinnedTeamsAlerts.js';
import { getSubject as getOddsSubject, renderHTML as renderOddsHTML, renderText as renderOddsText } from '../../src/emails/templates/oddsIntel.js';
import { getSubject as getNewsSubject, renderHTML as renderNewsHTML, renderText as renderNewsText } from '../../src/emails/templates/breakingNews.js';

const ADMIN_EMAIL = 'dantedicco@gmail.com';

const VALID_TYPES = ['daily', 'pinned', 'odds', 'news'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Auth check
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authorization required.' });

  let user;
  try {
    user = await verifyUserToken(token);
  } catch (err) {
    return res.status(500).json({ error: 'Auth service unavailable.' });
  }

  if (!user) return res.status(401).json({ error: 'Invalid or expired token.' });
  if (user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin access only.' });

  // ── Body validation
  const { type } = req.body || {};
  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
  }

  try {
    // ── Gather shared data
    const [scoresTodayRaw, rankingsData, atsResult, newsData] = await Promise.allSettled([
      fetchScoresSource(),
      fetchRankingsSource(),
      getAtsLeadersPipeline(),
      fetchNewsAggregateSource({ includeNational: true }),
    ]);

    const scoresToday = scoresTodayRaw.status === 'fulfilled' ? (scoresTodayRaw.value || []) : [];
    const rankingsTop25 = rankingsData.status === 'fulfilled'
      ? (rankingsData.value?.rankings || []).slice(0, 25) : [];
    const atsLeaders = atsResult.status === 'fulfilled'
      ? { best: atsResult.value?.best || [], worst: atsResult.value?.worst || [] }
      : { best: [], worst: [] };
    const headlines = newsData.status === 'fulfilled' ? (newsData.value?.items || []) : [];

    // Test data context — admin sends to themselves
    const emailData = {
      displayName: 'Maximus Admin',
      scoresToday,
      rankingsTop25,
      atsLeaders,
      headlines,
      pinnedTeams: [
        { name: 'Duke Blue Devils', slug: 'duke' },
        { name: 'Kansas Jayhawks', slug: 'kansas' },
      ],
    };

    let subject, html, text;
    switch (type) {
      case 'daily':
        subject = getDailySubject(emailData);
        html    = renderDailyHTML(emailData);
        text    = renderDailyText(emailData);
        break;
      case 'pinned':
        subject = getPinnedSubject(emailData);
        html    = renderPinnedHTML(emailData);
        text    = renderPinnedText(emailData);
        break;
      case 'odds':
        subject = getOddsSubject(emailData);
        html    = renderOddsHTML(emailData);
        text    = renderOddsText(emailData);
        break;
      case 'news':
        subject = getNewsSubject(emailData);
        html    = renderNewsHTML(emailData);
        text    = renderNewsText(emailData);
        break;
    }

    subject = `[TEST] ${subject}`;

    await sendEmail({ to: ADMIN_EMAIL, subject, html, text });

    console.log(`[send-test] Sent ${type} test email to ${ADMIN_EMAIL}`);
    return res.status(200).json({ ok: true, type, to: ADMIN_EMAIL });

  } catch (err) {
    console.error('[send-test] error:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to send test email.' });
  }
}
