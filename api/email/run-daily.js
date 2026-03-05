/* global process */
/**
 * GET /api/email/run-daily?type=daily|pinned|odds|news
 *
 * Automated daily email engine. Called by Vercel cron jobs.
 *
 * For each email type:
 *  1. Fetch all users from Supabase auth
 *  2. Load their profiles and preferences
 *  3. Check email_send_log to prevent duplicate sends (max 1/type/day)
 *  4. Gather data for the email type
 *  5. Render and send personalized emails
 *  6. Log each send to email_send_log
 *
 * Security: Vercel cron requests include `Authorization: Bearer <CRON_SECRET>`.
 * Falls back to open access if CRON_SECRET is not set (safe for initial deploy).
 */

import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { sendEmail } from '../_lib/sendEmail.js';
import { getUserDisplayName } from '../_lib/personalization.js';
import { dedupeNewsItems } from '../_lib/newsDedupe.js';
import { fetchScoresSource, fetchRankingsSource, fetchNewsAggregateSource } from '../_sources.js';
import { getAtsLeadersPipeline } from '../home/atsPipeline.js';
import { getJson } from '../_globalCache.js';
import { getSubject as getDailySubject, renderHTML as renderDailyHTML, renderText as renderDailyText } from '../../src/emails/templates/dailyBriefing.js';
import { getSubject as getPinnedSubject, renderHTML as renderPinnedHTML, renderText as renderPinnedText } from '../../src/emails/templates/pinnedTeamsAlerts.js';
import { getSubject as getOddsSubject, renderHTML as renderOddsHTML, renderText as renderOddsText } from '../../src/emails/templates/oddsIntel.js';
import { getSubject as getNewsSubject, renderHTML as renderNewsHTML, renderText as renderNewsText } from '../../src/emails/templates/breakingNews.js';
import { getSubject as getDigestSubject, renderHTML as renderDigestHTML, renderText as renderDigestText } from '../../src/emails/templates/teamDigest.js';
import { assembleTeamDigestPayload, TEAM_DIGEST_MAX_TEAMS } from '../_lib/teamDigest.js';

const TYPE_TO_PREF_KEY = {
  daily:      'briefing',
  pinned:     'teamAlerts',
  odds:       'oddsIntel',
  news:       'newsDigest',
  teamDigest: 'teamDigest',
};

const VALID_TYPES = Object.keys(TYPE_TO_PREF_KEY);

/** Returns today's date key for the send log, e.g. "2026-03-04_daily" */
function makeDateKey(type) {
  const today = new Date().toISOString().slice(0, 10);
  return `${today}_${type}`;
}

/** Fetch all profiles (up to 5000) with their preferences */
async function fetchAllProfiles(sb) {
  const { data: profiles, error } = await sb
    .from('profiles')
    .select('id, full_name, display_name, username, preferences')
    .limit(5000);
  if (error) throw new Error(`[run-daily] profiles fetch error: ${error.message}`);
  return profiles || [];
}

/** Fetch all user_teams for a list of user IDs */
async function fetchUserTeams(sb, userIds) {
  if (!userIds.length) return {};
  const { data, error } = await sb
    .from('user_teams')
    .select('user_id, team_slug, is_primary')
    .in('user_id', userIds);
  if (error) {
    console.warn('[run-daily] user_teams fetch error:', error.message);
    return {};
  }
  const map = {};
  for (const row of (data || [])) {
    if (!map[row.user_id]) map[row.user_id] = [];
    map[row.user_id].push(row);
  }
  return map;
}

/** Get set of user IDs that already received this type today */
async function fetchAlreadySent(sb, dateKey) {
  const { data, error } = await sb
    .from('email_send_log')
    .select('user_id')
    .eq('date_key', dateKey);
  if (error) {
    console.warn('[run-daily] email_send_log read error:', error.message);
    return new Set();
  }
  return new Set((data || []).map(r => r.user_id));
}

/** Log a successful email send */
async function logEmailSend(sb, { userId, email, type, dateKey }) {
  const { error } = await sb.from('email_send_log').insert({
    user_id:  userId,
    email:    email,
    type:     type,
    date_key: dateKey,
    sent_at:  new Date().toISOString(),
  });
  if (error) {
    console.warn(`[run-daily] failed to log send for ${userId}:`, error.message);
  }
}

/** Fetch pinned team metadata from teams data */
async function resolvePinnedTeams(teamRows) {
  if (!teamRows || teamRows.length === 0) return [];
  const { getTeamBySlug } = await import('../../src/data/teams.js');
  return teamRows
    .map(row => {
      const team = getTeamBySlug(row.team_slug);
      return team
        ? { name: team.name, slug: team.slug, tier: team.oddsTier || null, logo: `/logos/${team.slug}.svg` }
        : null;
    })
    .filter(Boolean);
}

/**
 * Try to extract 2–4 concise intel bullets from the cached LLM home summary.
 * Falls back to data-derived bullets if the cache is empty or unparseable.
 *
 * @param {object} atsLeaders
 * @param {Array}  rankingsTop25
 * @param {Array}  scoresToday
 * @returns {Promise<string[]>}
 */
async function getBotIntelBullets(atsLeaders, rankingsTop25, scoresToday) {
  // Try to read from the KV-cached LLM home summary first
  try {
    const kvSummary = await getJson('chat:home:summary:v1');
    if (kvSummary?.text || kvSummary?.summary) {
      const text = kvSummary.text || kvSummary.summary || '';
      // Split into sentences / bullet-like lines; pick 2–4 concise ones
      const rawLines = text
        .split(/[-\n•*]+/)
        .map(l => l.replace(/^\d+\.\s*/, '').trim())
        .filter(l => l.length > 20 && l.length < 200);
      if (rawLines.length >= 2) {
        return rawLines.slice(0, 4);
      }
    }
  } catch {
    // KV unavailable — fall through to data-derived bullets
  }

  // Data-derived fallback bullets
  const bullets = [];
  const best = atsLeaders?.best || [];
  if (best.length > 0) {
    const top = best[0];
    const pct = top.pct != null ? `${Math.round(top.pct * 100)}%` : null;
    bullets.push(
      `${top.name || top.team} leans as the top ATS cover trend right now${pct ? ` (${pct} cover rate)` : ''} — worth monitoring before tip.`
    );
  }
  if (best.length > 1) {
    bullets.push(`Watch ${best[1].name || best[1].team} as a secondary value edge — strong recent ATS form with line movement potential.`);
  }
  if (scoresToday.length > 0) {
    bullets.push(`${scoresToday.length} game${scoresToday.length !== 1 ? 's' : ''} on the board today. Monitor line movement in the hour before tip for sharp action.`);
  }
  if (rankingsTop25.length >= 3) {
    const t = rankingsTop25[0];
    const name = t.teamName || t.name || t.team || '';
    if (name) bullets.push(`${name} holds the top spot in the AP poll. Ranked teams cover at a higher rate this late in the season.`);
  }

  return bullets.slice(0, 4);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Cron secret verification (optional but recommended)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers['authorization'] || '';
    const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (provided !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
  }

  // ── Type param
  const type = req.query?.type;
  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
  }

  const prefKey = TYPE_TO_PREF_KEY[type];
  const dateKey = makeDateKey(type);
  const startedAt = Date.now();

  console.log(`[run-daily] Starting email run: type=${type} dateKey=${dateKey}`);

  let sb;
  try {
    sb = getSupabaseAdmin();
  } catch (err) {
    console.error('[run-daily] Supabase admin init failed:', err.message);
    return res.status(500).json({ error: 'Database service unavailable.' });
  }

  try {
    // ── 1. Get all users from auth
    const { data: authData, error: authError } = await sb.auth.admin.listUsers({ perPage: 1000 });
    if (authError) throw new Error(`auth.admin.listUsers error: ${authError.message}`);
    const authUsers = authData?.users || [];

    if (authUsers.length === 0) {
      return res.status(200).json({ ok: true, type, sent: 0, skipped: 0, message: 'No users found.' });
    }

    // ── 2. Load profiles and preferences
    const profiles = await fetchAllProfiles(sb);
    const profileMap = {};
    for (const p of profiles) profileMap[p.id] = p;

    // ── 3. Filter to subscribed users only
    const subscribedUsers = authUsers.filter(u => {
      if (!u.email) return false;
      const profile = profileMap[u.id];
      const prefs = profile?.preferences || {};
      return prefs[prefKey] === true;
    });

    console.log(`[run-daily] ${subscribedUsers.length}/${authUsers.length} users subscribed to '${type}'`);

    if (subscribedUsers.length === 0) {
      return res.status(200).json({ ok: true, type, sent: 0, skipped: 0, message: 'No subscribers.' });
    }

    // ── 4. Check already-sent for today
    const alreadySent = await fetchAlreadySent(sb, dateKey);

    // ── 5. Determine who still needs to receive
    const toSend = subscribedUsers.filter(u => !alreadySent.has(u.id));
    console.log(`[run-daily] ${toSend.length} users to send (${alreadySent.size} already sent today)`);

    if (toSend.length === 0) {
      return res.status(200).json({ ok: true, type, sent: 0, skipped: subscribedUsers.length, message: 'All already sent today.' });
    }

    // ── 6. Fetch shared data for this email type
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
    const headlinesRaw = newsData.status === 'fulfilled' ? (newsData.value?.items || []) : [];
    const headlines = dedupeNewsItems(headlinesRaw);

    // ── 7. Fetch bot intel bullets (shared for all users in this run)
    let botIntelBullets = [];
    if (type === 'daily' || type === 'pinned') {
      try {
        botIntelBullets = await getBotIntelBullets(atsLeaders, rankingsTop25, scoresToday);
      } catch {
        botIntelBullets = [];
      }
    }

    // ── 7b. Pre-load team data for Team Digest (one-time lookup)
    let getTeamBySlugFn = null;
    if (type === 'teamDigest') {
      try {
        const teamsModule = await import('../../src/data/teams.js');
        getTeamBySlugFn = teamsModule.getTeamBySlug;
      } catch (err) {
        console.warn('[run-daily] failed to load teams data for digest:', err.message);
      }
    }

    // ── 8. Load user_teams for pinned-type (and always for personalization)
    const userIds = toSend.map(u => u.id);
    const userTeamsMap = await fetchUserTeams(sb, userIds);

    // ── 9. Send emails
    let sent = 0;
    let failed = 0;
    const errors = [];

    for (const authUser of toSend) {
      const userId = authUser.id;
      const email = authUser.email;
      const profile = profileMap[userId];

      // Resolve display name using the shared helper
      const displayName = getUserDisplayName({ user: authUser, profile });

      // Resolve pinned teams for this user
      const teamRows = userTeamsMap[userId] || [];
      let pinnedTeams = [];
      try {
        pinnedTeams = await resolvePinnedTeams(teamRows);
      } catch {
        pinnedTeams = [];
      }

      // Build a short "MAXIMUS SAYS" note for pinned alerts (use first bullet)
      const maximusNote = botIntelBullets.length > 0 ? botIntelBullets[0] : '';

      const emailData = {
        displayName,
        scoresToday,
        rankingsTop25,
        atsLeaders,
        headlines,
        pinnedTeams,
        botIntelBullets,
        maximusNote,
      };

      let subject, html, text;
      try {
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
          case 'teamDigest': {
            const prefs = profile?.preferences || {};
            const digestSlugs = Array.isArray(prefs.teamDigestTeams) ? prefs.teamDigestTeams : [];
            if (!getTeamBySlugFn || digestSlugs.length === 0) {
              // Skip users with no digest teams configured
              console.log(`[run-daily] teamDigest: skipping ${email} — no digest teams configured`);
              continue;
            }
            const sharedDigestData = {
              scoresToday,
              rankingsTop25,
              atsLeaders,
              headlines,
            };
            const teamDigests = assembleTeamDigestPayload(
              digestSlugs.slice(0, TEAM_DIGEST_MAX_TEAMS),
              sharedDigestData,
              getTeamBySlugFn
            );
            const digestEmailData = { ...emailData, teamDigests, totalTeamCount: digestSlugs.length };
            subject = getDigestSubject(digestEmailData);
            html    = renderDigestHTML(digestEmailData);
            text    = renderDigestText(digestEmailData);
            break;
          }
        }

        await sendEmail({ to: email, subject, html, text });
        await logEmailSend(sb, { userId, email, type, dateKey });
        sent++;

      } catch (err) {
        failed++;
        const msg = `Failed for ${email}: ${err.message}`;
        console.error('[run-daily]', msg);
        errors.push(msg);
      }
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[run-daily] Done. type=${type} sent=${sent} failed=${failed} skipped=${alreadySent.size} elapsed=${elapsed}s`);

    return res.status(200).json({
      ok: true,
      type,
      sent,
      failed,
      skipped: alreadySent.size,
      total: subscribedUsers.length,
      elapsed: `${elapsed}s`,
      ...(errors.length ? { errors: errors.slice(0, 5) } : {}),
    });

  } catch (err) {
    console.error('[run-daily] Fatal error:', err.message);
    return res.status(500).json({ error: err.message || 'Internal server error.' });
  }
}
