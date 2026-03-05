/* global process */
/**
 * GET /api/email/preview?type=daily|pinned|odds|news&secret=<PREVIEW_SECRET>
 *
 * Dev/admin-only endpoint: returns rendered HTML for any email template
 * so you can inspect it in-browser without sending a real email.
 *
 * Security:
 *  - Must provide `?secret=<PREVIEW_SECRET>` matching the env var, OR
 *  - NODE_ENV must not be 'production' (local dev)
 *  - Falls back to admin email check via Authorization: Bearer <token> if neither above
 *
 * Usage:
 *   http://localhost:3000/api/email/preview?type=daily&secret=mysecret
 *   https://your-domain.vercel.app/api/email/preview?type=pinned&secret=mysecret
 */

import { fetchScoresSource, fetchRankingsSource, fetchNewsAggregateSource } from '../_sources.js';
import { getAtsLeadersPipeline } from '../home/atsPipeline.js';
import { getJson } from '../_globalCache.js';
import { dedupeNewsItems } from '../_lib/newsDedupe.js';
import { verifyUserToken } from '../_lib/supabaseAdmin.js';
import { isAdminEmail } from '../_lib/admin.js';
import { renderHTML as renderDailyHTML }  from '../../src/emails/templates/dailyBriefing.js';
import { renderHTML as renderPinnedHTML } from '../../src/emails/templates/pinnedTeamsAlerts.js';
import { renderHTML as renderOddsHTML }   from '../../src/emails/templates/oddsIntel.js';
import { renderHTML as renderNewsHTML }   from '../../src/emails/templates/breakingNews.js';

const VALID_TYPES = ['daily', 'pinned', 'odds', 'news'];

const PREVIEW_PINNED_TEAMS = [
  { name: 'Duke Blue Devils', slug: 'duke-blue-devils', logo: '/logos/duke-blue-devils.svg' },
  { name: 'Kansas Jayhawks',  slug: 'kansas-jayhawks',  logo: '/logos/kansas-jayhawks.svg'  },
  { name: 'UConn Huskies',    slug: 'uconn-huskies',    logo: '/logos/uconn-huskies.svg'    },
];

async function getBotIntelBullets(atsLeaders, rankingsTop25, scoresToday) {
  try {
    const kv = await getJson('chat:home:summary:v1');
    if (kv?.text || kv?.summary) {
      const text = kv.text || kv.summary || '';
      const lines = text
        .split(/[-\n•*]+/)
        .map(l => l.replace(/^\d+\.\s*/, '').trim())
        .filter(l => l.length > 20 && l.length < 200);
      if (lines.length >= 2) return lines.slice(0, 4);
    }
  } catch { /* KV unavailable */ }

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
  return bullets.slice(0, 4);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth gate ──────────────────────────────────────────────────────────────
  const isDev = process.env.NODE_ENV !== 'production';
  const previewSecret = process.env.PREVIEW_SECRET || process.env.CRON_SECRET;
  const providedSecret = req.query?.secret;

  let authorized = false;

  if (isDev) {
    authorized = true; // local dev: always allow
  } else if (previewSecret && providedSecret === previewSecret) {
    authorized = true; // secret param matches
  } else {
    // Fall back to JWT admin check
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (token) {
      try {
        const user = await verifyUserToken(token);
        if (user && isAdminEmail(user.email)) authorized = true;
      } catch { /* ignore */ }
    }
  }

  if (!authorized) {
    return res.status(403).json({ error: 'Forbidden. Provide ?secret= or admin Authorization header.' });
  }

  // ── Type param ─────────────────────────────────────────────────────────────
  const type = req.query?.type;
  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).send(`
      <html><body style="font-family:monospace;padding:24px;background:#090d18;color:#f0f4f8;">
        <h2>Email Preview</h2>
        <p>Provide <code>?type=</code> — one of: ${VALID_TYPES.map(t => `<a href="?type=${t}${providedSecret ? `&secret=${providedSecret}` : ''}" style="color:#5a9fd4;">${t}</a>`).join(', ')}</p>
      </body></html>
    `);
  }

  // ── Fetch data ─────────────────────────────────────────────────────────────
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

    let botIntelBullets = [];
    if (type === 'daily' || type === 'pinned') {
      botIntelBullets = await getBotIntelBullets(atsLeaders, rankingsTop25, scoresToday);
    }
    const maximusNote = botIntelBullets[0] || '';

    const emailData = {
      displayName: 'Dante',  // use a realistic preview name
      scoresToday,
      rankingsTop25,
      atsLeaders,
      headlines,
      pinnedTeams: PREVIEW_PINNED_TEAMS,
      botIntelBullets,
      maximusNote,
    };

    let html;
    switch (type) {
      case 'daily':  html = renderDailyHTML(emailData);  break;
      case 'pinned': html = renderPinnedHTML(emailData); break;
      case 'odds':   html = renderOddsHTML(emailData);   break;
      case 'news':   html = renderNewsHTML(emailData);   break;
    }

    // Inject a small debug banner at the top so it's obvious this is a preview
    const banner = `<div style="position:fixed;top:0;left:0;right:0;background:#e06c3a;color:#fff;font-family:monospace;font-size:12px;padding:6px 12px;z-index:9999;text-align:center;">
      EMAIL PREVIEW — type: <strong>${type}</strong> — ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PT
      &nbsp;&nbsp;|&nbsp;&nbsp;
      ${VALID_TYPES.filter(t => t !== type).map(t => `<a href="?type=${t}${providedSecret ? `&secret=${providedSecret}` : ''}" style="color:#fff;font-weight:bold;">${t}</a>`).join(' &nbsp; ')}
    </div>
    <div style="height:36px;"></div>`;

    const finalHtml = html.replace('<body', `<body`).replace(/<body[^>]*>/, match => match + banner);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(finalHtml);

  } catch (err) {
    console.error(`[preview] Error rendering type=${type}:`, err.message);
    return res.status(500).json({ error: err.message });
  }
}
