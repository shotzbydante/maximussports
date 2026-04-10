/**
 * POST /api/email/global-send
 *
 * Admin-only endpoint to trigger a real global send for an email type.
 * Uses the v2 subscription model (global_briefing, mlb_*, ncaam_*).
 *
 * Body:
 *   { type: '<email_type>', override?: boolean }
 *
 * override=true → sends to ALL users regardless of subscription preferences.
 * override=false (default) → sends only to eligible subscribed users.
 *
 * Auth: Authorization: Bearer <supabase-access-token>
 * Access: admin user only
 */

import { verifyUserToken, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { isAdminEmail } from '../_lib/admin.js';
import { sendEmailThrottled } from '../_lib/sendEmail.js';
import { getUserDisplayName } from '../_lib/personalization.js';
import { DEFAULT_EMAIL_PREFS, resolvePreferences } from '../_lib/emailDefaults.js';
import { dedupeNewsItems } from '../_lib/newsDedupe.js';
import { fetchScoresSource, fetchRankingsSource, fetchNewsAggregateSource, fetchOddsSource } from '../_sources.js';
import { getAtsLeadersPipeline } from '../home/atsPipeline.js';
import { getJson } from '../_globalCache.js';
import { getSubject as getDailySubject, renderHTML as renderDailyHTML, renderText as renderDailyText } from '../../src/emails/templates/dailyBriefing.js';
import { getSubject as getPinnedSubject, renderHTML as renderPinnedHTML, renderText as renderPinnedText } from '../../src/emails/templates/pinnedTeamsAlerts.js';
import { getSubject as getOddsSubject, renderHTML as renderOddsHTML, renderText as renderOddsText } from '../../src/emails/templates/oddsIntel.js';
import { getSubject as getNewsSubject, renderHTML as renderNewsHTML, renderText as renderNewsText } from '../../src/emails/templates/breakingNews.js';
import { getSubject as getDigestSubject, renderHTML as renderDigestHTML, renderText as renderDigestText } from '../../src/emails/templates/teamDigest.js';
import { getSubject as getMlbBriefingSubject, renderHTML as renderMlbBriefingHTML, renderText as renderMlbBriefingText } from '../../src/emails/templates/mlbBriefing.js';
import { getSubject as getMlbPicksSubject, renderHTML as renderMlbPicksHTML, renderText as renderMlbPicksText } from '../../src/emails/templates/mlbPicks.js';
import { getSubject as getMlbDigestSubject, renderHTML as renderMlbDigestHTML, renderText as renderMlbDigestText } from '../../src/emails/templates/mlbTeamDigest.js';
import { assembleTeamDigestPayload, TEAM_DIGEST_MAX_TEAMS } from '../_lib/teamDigest.js';
import { getProfileEntitlements } from '../_lib/entitlements.js';
import { fetchUserTeamsBatch, resolveTeamRows, getPinnedTeamSlugs } from '../_lib/getUserPinnedTeams.js';
import { assembleMlbEmailData } from '../_lib/mlbEmailData.js';

const TYPE_TO_PREF_KEY = {
  global_briefing:   'global_briefing',
  ncaam_briefing:    'ncaam_briefing',
  ncaam_team_digest: 'ncaam_team_digest',
  ncaam_picks:       'ncaam_picks',
  mlb_briefing:      'mlb_briefing',
  mlb_team_digest:   'mlb_team_digest',
  mlb_picks:         'mlb_picks',
};

const VALID_TYPES = Object.keys(TYPE_TO_PREF_KEY);

/** Map new type → template rendering function set. */
const TYPE_TO_TEMPLATE = {
  global_briefing:   'daily',
  ncaam_briefing:    'daily',
  ncaam_team_digest: 'pinned',
  ncaam_picks:       'odds',
  mlb_briefing:      'mlbBriefing',
  mlb_team_digest:   'mlbTeamDigest',
  mlb_picks:         'mlbPicks',
};

function makeDateKey(type) {
  const today = new Date().toISOString().slice(0, 10);
  return `${today}_${type}`;
}

async function fetchAllProfiles(sb) {
  const { data, error } = await sb
    .from('profiles')
    .select('id, display_name, username, preferences, plan_tier, subscription_status')
    .limit(5000);
  if (error) throw new Error(`profiles fetch: ${error.message}`);
  return data || [];
}

// fetchUserTeams replaced by shared fetchUserTeamsBatch from getUserPinnedTeams.js

async function fetchAlreadySent(sb, dateKey) {
  const { data, error } = await sb
    .from('email_send_log')
    .select('user_id')
    .eq('date_key', dateKey);
  if (error) return new Set();
  return new Set((data || []).map(r => r.user_id));
}

async function logEmailSend(sb, { userId, email, type, dateKey }) {
  try {
    const { error } = await sb.from('email_send_log').insert({
      user_id: userId, email, type, date_key: dateKey, sent_at: new Date().toISOString(),
    });
    if (error) {
      console.warn(`[global-send] email_send_log insert failed for ${userId}: ${error.message} (code=${error.code})`);
    }
  } catch (err) {
    console.warn(`[global-send] email_send_log insert exception for ${userId}: ${err.message}`);
  }
}

async function logJobRun(sb, record) {
  try {
    const { error } = await sb.from('email_job_runs').insert(record);
    if (error) {
      console.error(`[global-send] email_job_runs insert FAILED: ${error.message} (code=${error.code})`);
    } else {
      console.log(`[global-send] email_job_runs row inserted: type=${record.digest_type} status=${record.status} mode=${record.run_mode}`);
    }
  } catch (err) {
    console.error(`[global-send] email_job_runs insert exception: ${err.message}`);
  }
}

// resolvePinnedTeams replaced by shared resolveTeamRows from getUserPinnedTeams.js

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
  if (best.length > 1) bullets.push(`Watch ${best[1].name || best[1].team} as a secondary value edge — strong recent ATS form.`);
  if (scoresToday.length > 0) bullets.push(`${scoresToday.length} game${scoresToday.length !== 1 ? 's' : ''} on the board today.`);
  if (rankingsTop25.length >= 3) {
    const t = rankingsTop25[0];
    const name = t.teamName || t.name || t.team || '';
    if (name) bullets.push(`${name} holds the top spot in the AP poll.`);
  }
  return bullets.slice(0, 4);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Not signed in.' });

  let user;
  try {
    user = await verifyUserToken(token);
  } catch {
    return res.status(503).json({ error: 'Auth service unavailable.' });
  }
  if (!user || !isAdminEmail(user.email)) {
    return res.status(403).json({ error: 'Admin access only.' });
  }

  const { type, override = false } = req.body || {};
  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
  }

  const prefKey = TYPE_TO_PREF_KEY[type];
  const dateKey = makeDateKey(type);
  const runMode = override ? 'override' : 'manual';
  const startedAt = Date.now();
  const startedAtISO = new Date(startedAt).toISOString();

  console.log(`[global-send] ▶ Starting ${runMode} send: type=${type} by=${user.email}`);

  let sb;
  try {
    sb = getSupabaseAdmin();
  } catch {
    return res.status(500).json({ error: 'Database service unavailable.' });
  }

  const skipCounts = { opted_out: 0, no_email: 0, no_profile: 0, already_sent: 0, no_digest_teams: 0 };

  try {
    const authUsers = [];
    let page = 1;
    const perPage = 1000;
    while (true) {
      const { data: authData, error: authError } = await sb.auth.admin.listUsers({ page, perPage });
      if (authError) throw new Error(`auth.admin.listUsers error: ${authError.message}`);
      const users = authData?.users || [];
      authUsers.push(...users);
      if (users.length < perPage) break;
      page++;
    }

    if (authUsers.length === 0) {
      await logJobRun(sb, {
        digest_type: type, started_at: startedAtISO, completed_at: new Date().toISOString(),
        status: 'success', scanned_count: 0, eligible_count: 0, sent_count: 0, failed_count: 0,
        skipped_counts: skipCounts, run_mode: runMode,
      });
      return res.status(200).json({ ok: true, type, sent: 0, message: 'No users found.' });
    }

    const profiles = await fetchAllProfiles(sb);
    const profileMap = {};
    for (const p of profiles) profileMap[p.id] = p;

    const subscribedUsers = authUsers.filter(u => {
      if (!u.email) { skipCounts.no_email++; return false; }
      const profile = profileMap[u.id];
      if (!profile) {
        skipCounts.no_profile++;
        console.log(`[global-send] SKIP user=${u.id} reason=no_profile_row`);
        return false;
      }

      if (override) return true;

      const prefs = resolvePreferences(profile.preferences);
      const subscribed = prefs[prefKey] === true;
      if (!subscribed) skipCounts.opted_out++;
      return subscribed;
    });

    if (subscribedUsers.length === 0) {
      await logJobRun(sb, {
        digest_type: type, started_at: startedAtISO, completed_at: new Date().toISOString(),
        status: 'success', scanned_count: authUsers.length, eligible_count: 0, sent_count: 0, failed_count: 0,
        skipped_counts: skipCounts, run_mode: runMode,
      });
      return res.status(200).json({ ok: true, type, sent: 0, message: 'No eligible recipients.' });
    }

    const alreadySent = override ? new Set() : await fetchAlreadySent(sb, dateKey);
    skipCounts.already_sent = alreadySent.size;

    const toSend = subscribedUsers.filter(u => !alreadySent.has(u.id));

    if (toSend.length === 0) {
      await logJobRun(sb, {
        digest_type: type, started_at: startedAtISO, completed_at: new Date().toISOString(),
        status: 'success', scanned_count: authUsers.length, eligible_count: subscribedUsers.length,
        sent_count: 0, failed_count: 0, skipped_counts: skipCounts, run_mode: runMode,
      });
      return res.status(200).json({ ok: true, type, sent: 0, message: 'All already sent today.' });
    }

    const tplType = TYPE_TO_TEMPLATE[type];
    const isMLB = type.startsWith('mlb_');

    let scoresToday = [];
    let rankingsTop25 = [];
    let atsLeaders = { best: [], worst: [] };
    let headlines = [];
    let oddsGames = [];
    let botIntelBullets = [];
    let mlbNarrativeParagraph = '';
    let picksBoard = null;

    if (isMLB) {
      // MLB-specific data via shared helper (no NCAAM contamination possible)
      const host = req.headers.host || 'localhost:3000';
      const mlbData = await assembleMlbEmailData(`http://${host}`, {
        includeSummary: tplType === 'mlbBriefing',
        includePicks: tplType === 'mlbPicks',
      });
      headlines = mlbData.headlines;
      scoresToday = mlbData.scoresToday;
      botIntelBullets = mlbData.botIntelBullets;
      mlbNarrativeParagraph = mlbData.narrativeParagraph;
      rankingsTop25 = mlbData.rankingsTop25;
      atsLeaders = mlbData.atsLeaders;
      oddsGames = mlbData.oddsGames;
      picksBoard = mlbData.picksBoard;
      console.log(`[global-send] MLB data: ${headlines.length} headlines, ${scoresToday.length} games, picks=${!!picksBoard}`);
    } else {
      // NCAAM / Global data fetching
      const [scoresTodayRaw, rankingsData, atsResult, newsData, oddsRaw] = await Promise.allSettled([
        fetchScoresSource(), fetchRankingsSource(), getAtsLeadersPipeline(),
        fetchNewsAggregateSource({ includeNational: true }),
        tplType === 'odds' ? fetchOddsSource() : Promise.resolve(null),
      ]);
      scoresToday = scoresTodayRaw.status === 'fulfilled' ? (scoresTodayRaw.value || []) : [];
      rankingsTop25 = rankingsData.status === 'fulfilled' ? (rankingsData.value?.rankings || []).slice(0, 25) : [];
      atsLeaders = atsResult.status === 'fulfilled' ? { best: atsResult.value?.best || [], worst: atsResult.value?.worst || [] } : { best: [], worst: [] };
      const headlinesRaw = newsData.status === 'fulfilled' ? (newsData.value?.items || []) : [];
      headlines = dedupeNewsItems(headlinesRaw);
      oddsGames = (oddsRaw.status === 'fulfilled' && oddsRaw.value?.games)
        ? oddsRaw.value.games.map(g => ({ ...g, gameStatus: 'Scheduled', startTime: g.commenceTime || null })) : [];
      if (tplType === 'daily' || tplType === 'pinned') {
        try { botIntelBullets = await getBotIntelBullets(atsLeaders, rankingsTop25, scoresToday); } catch { /* ok */ }
      }
    }

    let getTeamBySlugFn = null;
    try { const m = await import('../../src/data/teams.js'); getTeamBySlugFn = m.getTeamBySlug; } catch { /* ok */ }

    const userIds = toSend.map(u => u.id);
    const userTeamsMap = await fetchUserTeamsBatch(sb, userIds);

    let sent = 0;
    let failed = 0;
    const errors = [];
    const total = toSend.length;

    console.log(`[global-send] Queued ${total} recipients for ${type} (${runMode})`);

    for (let i = 0; i < total; i++) {
      const authUser = toSend[i];
      const userId = authUser.id;
      const email = authUser.email;
      const profile = profileMap[userId];
      const displayName = getUserDisplayName({ user: authUser, profile });
      // Resolve pinned teams from user_teams (single source of truth)
      const teamRows = userTeamsMap[userId] || [];
      const pinnedTeams = getTeamBySlugFn ? resolveTeamRows(teamRows, getTeamBySlugFn) : [];
      const pinnedSlugs = getPinnedTeamSlugs(teamRows);

      if (tplType === 'pinned' || tplType === 'teamDigest') {
        console.log(`[global-send] Team resolve user=${userId} email=${email} slugs=[${pinnedSlugs.join(',')}] names=[${pinnedTeams.map(t => t.name).join(',')}]`);
      }

      const maximusNote = botIntelBullets.length > 0 ? botIntelBullets[0] : '';
      const emailData = { displayName, scoresToday, rankingsTop25, atsLeaders, headlines, pinnedTeams, botIntelBullets, maximusNote, oddsGames, narrativeParagraph: isMLB ? mlbNarrativeParagraph : '', picksBoard: picksBoard || null };

      let subject, html, text;
      try {
        switch (tplType) {
          case 'daily':
            subject = getDailySubject(emailData); html = renderDailyHTML(emailData); text = renderDailyText(emailData); break;
          case 'pinned':
            subject = getPinnedSubject(emailData); html = renderPinnedHTML(emailData); text = renderPinnedText(emailData); break;
          case 'odds':
            subject = getOddsSubject(emailData); html = renderOddsHTML(emailData); text = renderOddsText(emailData); break;
          case 'news':
            subject = getNewsSubject(emailData); html = renderNewsHTML(emailData); text = renderNewsText(emailData); break;
          case 'teamDigest': {
            if (!getTeamBySlugFn || pinnedSlugs.length === 0) {
              skipCounts.no_digest_teams++;
              console.log(`[global-send] SKIP user=${userId} reason=no_pinned_teams email=${email}`);
              continue;
            }
            const planEntitlements = getProfileEntitlements(profile);
            const maxEmailTeams = isFinite(planEntitlements.maxEmailTeams) ? planEntitlements.maxEmailTeams : TEAM_DIGEST_MAX_TEAMS;
            const digestSlugs = pinnedSlugs.slice(0, Math.min(maxEmailTeams, TEAM_DIGEST_MAX_TEAMS));
            const teamDigests = assembleTeamDigestPayload(digestSlugs, { scoresToday, rankingsTop25, atsLeaders, headlines }, getTeamBySlugFn);

            const renderedSlugs = teamDigests.map(d => d.team.slug);
            const unexpectedTeams = renderedSlugs.filter(s => !pinnedSlugs.includes(s));
            if (unexpectedTeams.length > 0) {
              console.error(`[global-send] INTEGRITY VIOLATION: user=${userId} rendered=[${renderedSlugs.join(',')}] pinned=[${pinnedSlugs.join(',')}]. Aborting.`);
              failed++;
              errors.push(`${email}: integrity violation`);
              continue;
            }

            const digestEmailData = { ...emailData, teamDigests, totalTeamCount: pinnedSlugs.length };
            subject = getDigestSubject(digestEmailData); html = renderDigestHTML(digestEmailData); text = renderDigestText(digestEmailData);
            break;
          }
          case 'mlbBriefing':
            subject = getMlbBriefingSubject(emailData); html = renderMlbBriefingHTML(emailData); text = renderMlbBriefingText(emailData); break;
          case 'mlbPicks':
            subject = getMlbPicksSubject(emailData); html = renderMlbPicksHTML(emailData); text = renderMlbPicksText(emailData); break;
          case 'mlbTeamDigest': {
            if (!getTeamBySlugFn || pinnedSlugs.length === 0) {
              skipCounts.no_digest_teams++;
              continue;
            }
            const pe = getProfileEntitlements(profile);
            const met = isFinite(pe.maxEmailTeams) ? pe.maxEmailTeams : TEAM_DIGEST_MAX_TEAMS;
            const ds = pinnedSlugs.slice(0, Math.min(met, TEAM_DIGEST_MAX_TEAMS));
            const td = assembleTeamDigestPayload(ds, { scoresToday, rankingsTop25, atsLeaders, headlines }, getTeamBySlugFn);
            const dd = { ...emailData, teamDigests: td, totalTeamCount: pinnedSlugs.length };
            subject = getMlbDigestSubject(dd); html = renderMlbDigestHTML(dd); text = renderMlbDigestText(dd);
            break;
          }
        }

        console.log(`[global-send] Sending ${i + 1}/${total} to=${email}`);
        await sendEmailThrottled({ to: email, subject, html, text });
        await logEmailSend(sb, { userId, email, type, dateKey });
        sent++;
      } catch (err) {
        failed++;
        errors.push(`${email}: ${err.message}`);
        console.error(`[global-send] FAIL ${i + 1}/${total} to=${email}: ${err.message}`);
      }
    }

    const completedAtISO = new Date().toISOString();
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    const jobStatus = failed === 0 ? 'success' : (sent > 0 ? 'partial' : 'failed');

    await logJobRun(sb, {
      digest_type: type, started_at: startedAtISO, completed_at: completedAtISO,
      status: jobStatus, scanned_count: authUsers.length, eligible_count: subscribedUsers.length,
      sent_count: sent, failed_count: failed, skipped_counts: skipCounts,
      error_message: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
      run_mode: runMode,
    });

    console.log(`[global-send] ═══ ${type.toUpperCase()} ${runMode.toUpperCase()} COMPLETE: sent=${sent} failed=${failed} elapsed=${elapsed}s ═══`);

    return res.status(200).json({
      ok: true, type, status: jobStatus, sent, failed,
      total: subscribedUsers.length, totalAuth: authUsers.length,
      runMode, elapsed: `${elapsed}s`,
      ...(errors.length ? { errors: errors.slice(0, 5) } : {}),
    });

  } catch (err) {
    console.error('[global-send] Fatal error:', err.message);
    await logJobRun(sb, {
      digest_type: type, started_at: startedAtISO, completed_at: new Date().toISOString(),
      status: 'error', scanned_count: 0, eligible_count: 0, sent_count: 0, failed_count: 0,
      skipped_counts: skipCounts, error_message: err.message, run_mode: runMode,
    });
    return res.status(500).json({ error: err.message || 'Internal server error.' });
  }
}
