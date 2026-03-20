/* global process */
/**
 * GET /api/email/run-daily?type=daily|pinned|odds|news|teamDigest
 *
 * Automated daily email engine. Called by Vercel cron jobs.
 *
 * Staggered cadence (configured in vercel.json, all times UTC):
 *   daily:       0 13 * * *  → 6:00 AM PDT / 5:00 AM PST  — Morning briefing
 *   news:       30 16 * * *  → 9:30 AM PDT / 8:30 AM PST  — Breaking news digest
 *   odds:       15 19 * * *  → 12:15 PM PDT / 11:15 AM PST — Odds & ATS intel
 *   pinned:     45 22 * * *  → 3:45 PM PDT / 2:45 PM PST  — Pinned teams alerts
 *   teamDigest: 30  2 * * *  → 7:30 PM PDT / 6:30 PM PST  — Team digest
 *
 * Designed so a fully subscribed user gets emails spread through the day,
 * not all at once. Times target Pacific Daylight (PDT, UTC-7).
 *
 * For each email type:
 *  1. Fetch all users from Supabase auth
 *  2. Load their profiles and preferences
 *  3. Check email_send_log to prevent duplicate sends (max 1/type/day)
 *  4. Gather data for the email type
 *  5. Render and send personalized emails
 *  6. Log each send to email_send_log
 *  7. Log the job run to email_job_runs for admin visibility
 *
 * Eligibility rules:
 *   daily   → ALL users by default unless explicitly opted out (briefing: false)
 *   pinned  → subscribed users (teamAlerts: true, default true)
 *   odds    → subscribed users (oddsIntel: true, default false — opt-in only)
 *   news    → subscribed users (newsDigest: true, default true)
 *   teamDigest → subscribed users with at least one selected team
 *
 * New users without a profile row receive default preferences
 * (briefing: true, teamAlerts: true, newsDigest: true) so they are
 * automatically included in the next eligible send after signup.
 */

import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { sendEmailThrottled } from '../_lib/sendEmail.js';
import { getUserDisplayName } from '../_lib/personalization.js';
import { DEFAULT_EMAIL_PREFS } from '../_lib/emailDefaults.js';
import { dedupeNewsItems } from '../_lib/newsDedupe.js';
import { fetchScoresSource, fetchRankingsSource, fetchNewsAggregateSource, fetchOddsSource } from '../_sources.js';
import { getAtsLeadersPipeline } from '../home/atsPipeline.js';
import { getJson } from '../_globalCache.js';
import { getSubject as getDailySubject, renderHTML as renderDailyHTML, renderText as renderDailyText } from '../../src/emails/templates/dailyBriefing.js';
import { isTournamentWeek, isPreTournament } from '../../src/emails/tournamentWindow.js';
import { getSubject as getPinnedSubject, renderHTML as renderPinnedHTML, renderText as renderPinnedText } from '../../src/emails/templates/pinnedTeamsAlerts.js';
import { getSubject as getOddsSubject, renderHTML as renderOddsHTML, renderText as renderOddsText } from '../../src/emails/templates/oddsIntel.js';
import { getSubject as getNewsSubject, renderHTML as renderNewsHTML, renderText as renderNewsText } from '../../src/emails/templates/breakingNews.js';
import { getSubject as getDigestSubject, renderHTML as renderDigestHTML, renderText as renderDigestText } from '../../src/emails/templates/teamDigest.js';
import { assembleTeamDigestPayload, TEAM_DIGEST_MAX_TEAMS } from '../_lib/teamDigest.js';
import { getProfileEntitlements } from '../_lib/entitlements.js';
import { fetchUserTeamsBatch, resolveTeamRows, getPinnedTeamSlugs } from '../_lib/getUserPinnedTeams.js';

const TYPE_TO_PREF_KEY = {
  daily:      'briefing',
  pinned:     'teamAlerts',
  odds:       'oddsIntel',
  news:       'newsDigest',
  teamDigest: 'teamDigest',
};

const VALID_TYPES = Object.keys(TYPE_TO_PREF_KEY);

function makeDateKey(type) {
  const today = new Date().toISOString().slice(0, 10);
  return `${today}_${type}`;
}

async function fetchAllProfiles(sb) {
  const { data: profiles, error } = await sb
    .from('profiles')
    .select('id, display_name, username, preferences, plan_tier, subscription_status')
    .limit(5000);
  if (error) throw new Error(`[run-daily] profiles fetch error: ${error.message}`);
  return profiles || [];
}

// fetchUserTeams replaced by shared fetchUserTeamsBatch from getUserPinnedTeams.js

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

async function logEmailSend(sb, { userId, email, type, dateKey }) {
  try {
    const { error } = await sb.from('email_send_log').insert({
      user_id:  userId,
      email:    email,
      type:     type,
      date_key: dateKey,
      sent_at:  new Date().toISOString(),
    });
    if (error) {
      console.warn(`[run-daily] email_send_log insert failed for ${userId}: ${error.message} (code=${error.code})`);
    }
  } catch (err) {
    console.warn(`[run-daily] email_send_log insert exception for ${userId}: ${err.message}`);
  }
}

async function logJobRun(sb, record) {
  try {
    const { error } = await sb.from('email_job_runs').insert(record);
    if (error) {
      console.error(`[run-daily] email_job_runs insert FAILED: ${error.message} (code=${error.code})`);
    } else {
      console.log(`[run-daily] email_job_runs row inserted: type=${record.digest_type} status=${record.status} mode=${record.run_mode}`);
    }
  } catch (err) {
    console.error(`[run-daily] email_job_runs insert exception: ${err.message}`);
  }
}

/** Probe whether email_job_runs table is accessible (lightweight check). */
async function probeJobRunsTable(sb) {
  try {
    const { error } = await sb.from('email_job_runs').select('id').limit(1);
    if (error) {
      console.warn('[run-daily] email_job_runs table not accessible:', error.message);
      console.warn('[run-daily] Run the migration in docs/email-job-runs-migration.sql to create it.');
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// resolvePinnedTeams replaced by shared resolveTeamRows from getUserPinnedTeams.js

/**
 * Classify a game status string as final, live, or scheduled.
 */
function classifyGameStatus(status) {
  const s = (status || '').toLowerCase();
  if (s === 'final' || s.includes('final')) return 'final';
  if (s.startsWith('q') || s.includes('halftime') || s.includes('progress')) return 'live';
  return 'scheduled';
}

/**
 * Build the full email briefing context — narrative, prior-day results,
 * today's key matchups, Maximus Picks summary, and bot intel bullets.
 *
 * Pulls from the same KV cache as the Home page briefing when available,
 * falling back to structured data-driven generation.
 */
async function buildEmailBriefingContext(atsLeaders, rankingsTop25, scoresToday, modelSignals) {
  const showTournament = isTournamentWeek();
  const best = atsLeaders?.best || [];

  // Separate prior-day finals from today's upcoming/live games
  const priorDayResults = scoresToday
    .filter(g => classifyGameStatus(g.gameStatus) === 'final')
    .map(g => {
      const hs = parseInt(g.homeScore, 10);
      const as = parseInt(g.awayScore, 10);
      const hasScore = !isNaN(hs) && !isNaN(as);
      const winner = hasScore ? (hs > as ? g.homeTeam : g.awayTeam) : null;
      const loser = hasScore ? (hs > as ? g.awayTeam : g.homeTeam) : null;
      const winScore = hasScore ? Math.max(hs, as) : null;
      const loseScore = hasScore ? Math.min(hs, as) : null;
      const margin = hasScore ? Math.abs(hs - as) : 0;
      const spread = g.spread != null ? parseFloat(g.spread) : null;
      const isCoverUpset = spread != null && hasScore && winner
        ? (winner === g.homeTeam ? (spread < 0 && margin < Math.abs(spread)) : (spread > 0 && margin < Math.abs(spread)))
        : false;
      return { ...g, winner, loser, winScore, loseScore, margin, isCoverUpset, hasScore };
    })
    .sort((a, b) => (b.margin || 0) - (a.margin || 0));

  const todayUpcoming = scoresToday.filter(g => {
    const kind = classifyGameStatus(g.gameStatus);
    return kind === 'scheduled' || kind === 'live';
  });

  // Try to pull narrative from KV cache (same source as Home page)
  let narrativeParagraph = '';
  try {
    const kvSummary = await getJson('chat:home:summary:v1');
    if (kvSummary?.text || kvSummary?.summary) {
      narrativeParagraph = (kvSummary.text || kvSummary.summary || '').trim();
    }
  } catch { /* KV unavailable */ }

  // Build bot intel bullets (concise key insights)
  const bullets = [];
  if (showTournament) {
    if (priorDayResults.length > 0 && priorDayResults[0].hasScore) {
      const m = priorDayResults[0];
      bullets.push(`${m.winner} defeated ${m.loser} ${m.winScore}-${m.loseScore} in tournament action — a result that reshapes bracket projections heading into the next round.`);
    }
    if (best.length > 0) {
      const top = best[0];
      const pct = top.pct != null ? `${Math.round(top.pct * 100)}%` : null;
      bullets.push(
        `${top.name || top.team} has been the sharpest ATS cover trend${pct ? ` (${pct})` : ''} — tournament teams with strong cover rates historically carry momentum into March.`
      );
    }
    bullets.push('Check the bracket below for the model\'s latest edge signals, upset picks, and tournament matchup analysis.');
  } else {
    if (best.length > 0) {
      const top = best[0];
      const pct = top.pct != null ? `${Math.round(top.pct * 100)}%` : null;
      bullets.push(`${top.name || top.team} leans as the top ATS cover trend${pct ? ` (${pct} cover rate)` : ''} — worth monitoring before tip.`);
    }
    if (scoresToday.length > 0) {
      bullets.push(`${scoresToday.length} game${scoresToday.length !== 1 ? 's' : ''} on the board today.`);
    }
    if (rankingsTop25.length >= 3) {
      const t = rankingsTop25[0];
      const name = t.teamName || t.name || t.team || '';
      if (name) bullets.push(`${name} holds the top spot in the AP poll.`);
    }
  }

  // Build picks summary (aligned with IG card summary logic)
  let picksSummary = '';
  if (Array.isArray(modelSignals) && modelSignals.length > 0) {
    const topPicks = modelSignals.slice(0, 3);
    const parts = topPicks.map(p => {
      const matchup = p.matchup || `${p.awayTeam || '?'} vs ${p.homeTeam || '?'}`;
      if (p.isUpset) return `${matchup} (upset pick)`;
      const prob = p.probability || p.winProb || p.modelProb || null;
      const winner = p.winner || p.pick || p.favored || '';
      const pctStr = prob != null ? `${Math.round(prob * 100)}%` : '';
      return winner && pctStr ? `${winner} ${pctStr}` : matchup;
    }).filter(Boolean);
    if (parts.length > 0) {
      picksSummary = `Today's strongest model signals: ${parts.join(' · ')}.`;
    }
  }

  return {
    narrativeParagraph,
    priorDayResults: priorDayResults.slice(0, 6),
    todayUpcoming,
    botIntelBullets: bullets.slice(0, 4),
    picksSummary,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers['authorization'] || '';
    const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (provided !== cronSecret) {
      console.warn(`[run-daily] Auth failed — CRON_SECRET mismatch. Header present: ${Boolean(authHeader)}`);
      return res.status(401).json({ error: 'Unauthorized.' });
    }
  }

  const _url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const type = _url.searchParams.get('type');
  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
  }

  const prefKey = TYPE_TO_PREF_KEY[type];
  const dateKey = makeDateKey(type);
  const startedAt = Date.now();
  const startedAtISO = new Date(startedAt).toISOString();

  console.log(`[run-daily] ▶ Starting email run: type=${type} dateKey=${dateKey} startedAt=${startedAtISO}`);

  let sb;
  try {
    sb = getSupabaseAdmin();
  } catch (err) {
    console.error('[run-daily] Supabase admin init failed:', err.message);
    return res.status(500).json({ error: 'Database service unavailable.' });
  }

  // Probe table existence (non-blocking diagnostic)
  const tableOk = await probeJobRunsTable(sb);
  if (!tableOk) {
    console.warn('[run-daily] Continuing without job logging — table missing.');
  }

  // Track skip reasons for the summary
  const skipCounts = { opted_out: 0, no_email: 0, no_profile: 0, already_sent: 0, no_digest_teams: 0 };

  try {
    // ── 1. Get all users from auth (paginated)
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

    console.log(`[run-daily] Fetched ${authUsers.length} auth users (${page} page${page > 1 ? 's' : ''})`);

    if (authUsers.length === 0) {
      const summary = { ok: true, type, sent: 0, skipped: 0, message: 'No users found.' };
      await logJobRun(sb, {
        digest_type: type, started_at: startedAtISO, completed_at: new Date().toISOString(),
        status: 'success', scanned_count: 0, eligible_count: 0, sent_count: 0, failed_count: 0,
        skipped_counts: skipCounts, run_mode: 'scheduled',
      });
      return res.status(200).json(summary);
    }

    // ── 2. Load profiles and preferences
    const profiles = await fetchAllProfiles(sb);
    const profileMap = {};
    for (const p of profiles) profileMap[p.id] = p;

    // ── 3. Filter to subscribed users (profile row required — no-profile users are skipped)
    const skippedReasons = [];

    const subscribedUsers = authUsers.filter(u => {
      if (!u.email) {
        skipCounts.no_email++;
        skippedReasons.push({ id: u.id, reason: 'no_deliverable_email' });
        console.log(`[run-daily] SKIP user=${u.id} reason=no_deliverable_email`);
        return false;
      }

      const profile = profileMap[u.id];
      if (!profile) {
        skipCounts.no_profile++;
        skippedReasons.push({ id: u.id, email: u.email, reason: 'no_profile_row' });
        console.log(`[run-daily] SKIP user=${u.id} reason=no_profile_row — account not fully created`);
        return false;
      }

      const prefs = { ...DEFAULT_EMAIL_PREFS, ...(profile.preferences || {}) };
      const subscribed = prefs[prefKey] === true;

      if (!subscribed) {
        skipCounts.opted_out++;
        skippedReasons.push({ id: u.id, email: u.email, reason: `opted_out_${prefKey}` });
        console.log(`[run-daily] SKIP user=${u.id} reason=opted_out_${prefKey}`);
      }
      return subscribed;
    });

    console.log(`[run-daily] Recipient filter for '${type}' (prefKey=${prefKey}): ${subscribedUsers.length} subscribed, ${skipCounts.opted_out} opted-out, ${skipCounts.no_profile} no-profile (skipped), ${skipCounts.no_email} no-email, ${authUsers.length} total`);

    if (subscribedUsers.length === 0) {
      const summary = { ok: true, type, sent: 0, skipped: 0, message: 'No subscribers.' };
      await logJobRun(sb, {
        digest_type: type, started_at: startedAtISO, completed_at: new Date().toISOString(),
        status: 'success', scanned_count: authUsers.length, eligible_count: 0, sent_count: 0, failed_count: 0,
        skipped_counts: skipCounts, run_mode: 'scheduled',
      });
      return res.status(200).json(summary);
    }

    // ── 4. Check already-sent for today
    const alreadySent = await fetchAlreadySent(sb, dateKey);
    skipCounts.already_sent = alreadySent.size;

    // ── 5. Determine who still needs to receive
    const toSend = subscribedUsers.filter(u => {
      if (alreadySent.has(u.id)) {
        console.log(`[run-daily] SKIP user=${u.id} reason=already_sent_today`);
        return false;
      }
      return true;
    });
    console.log(`[run-daily] ${toSend.length} users to send (${alreadySent.size} already sent today)`);

    if (toSend.length === 0) {
      const summary = { ok: true, type, sent: 0, skipped: subscribedUsers.length, message: 'All already sent today.' };
      await logJobRun(sb, {
        digest_type: type, started_at: startedAtISO, completed_at: new Date().toISOString(),
        status: 'success', scanned_count: authUsers.length, eligible_count: subscribedUsers.length,
        sent_count: 0, failed_count: 0, skipped_counts: skipCounts, run_mode: 'scheduled',
      });
      return res.status(200).json(summary);
    }

    // ── 6. Fetch shared data
    const [scoresTodayRaw, rankingsData, atsResult, newsData, oddsRaw] = await Promise.allSettled([
      fetchScoresSource(),
      fetchRankingsSource(),
      getAtsLeadersPipeline(),
      fetchNewsAggregateSource({ includeNational: true }),
      type === 'odds' ? fetchOddsSource() : Promise.resolve(null),
    ]);

    const scoresToday = scoresTodayRaw.status === 'fulfilled' ? (scoresTodayRaw.value || []) : [];
    const rankingsTop25 = rankingsData.status === 'fulfilled'
      ? (rankingsData.value?.rankings || []).slice(0, 25) : [];
    const atsLeaders = atsResult.status === 'fulfilled'
      ? { best: atsResult.value?.best || [], worst: atsResult.value?.worst || [] }
      : { best: [], worst: [] };
    const headlinesRaw = newsData.status === 'fulfilled' ? (newsData.value?.items || []) : [];
    const headlines = dedupeNewsItems(headlinesRaw);

    const oddsGames = (oddsRaw.status === 'fulfilled' && oddsRaw.value?.games)
      ? oddsRaw.value.games.map(g => ({
          ...g,
          gameStatus: 'Scheduled',
          startTime: g.commenceTime || null,
        }))
      : [];

    // ── 7. Email briefing context (narrative, results, matchups, picks)
    let botIntelBullets = [];
    let briefingContext = {};
    if (type === 'daily' || type === 'pinned') {
      try {
        briefingContext = await buildEmailBriefingContext(atsLeaders, rankingsTop25, scoresToday, []);
        botIntelBullets = briefingContext.botIntelBullets || [];
      } catch {
        botIntelBullets = [];
        briefingContext = {};
      }
    }

    // ── 7b. Model signals + tournament meta (for daily briefing)
    let modelSignals = [];
    let tournamentMeta = {};
    if (type === 'daily') {
      try {
        const cached = await getJson('picks:latest:v1');
        if (Array.isArray(cached) && cached.length > 0) {
          modelSignals = cached.slice(0, 5);
        }
      } catch { /* non-critical */ }

      if (isTournamentWeek()) {
        let topSeedNames = [];
        try {
          const bracketRes = await fetch(new URL('/api/bracketology/data', `http://${req.headers.host || 'localhost:3000'}`).href);
          if (bracketRes.ok) {
            const bracketJson = await bracketRes.json();
            const bracket = bracketJson?.bracket;
            if (bracket?.regions?.length > 0) {
              for (const region of bracket.regions) {
                for (const m of (region.matchups || [])) {
                  const top = m.topTeam;
                  if (top && !top.isPlaceholder && top.seed === 1 && top.shortName) {
                    topSeedNames.push(top.shortName);
                  }
                }
              }
            }
          }
        } catch { /* bracket fetch failed — use fallback */ }

        if (topSeedNames.length === 0) {
          topSeedNames = ['Houston', 'Duke', 'Auburn', 'Florida'];
        }

        tournamentMeta.topSeeds = topSeedNames;
        tournamentMeta.bracketTip = '8 vs 9 matchups are historically coin flips \u2014 but the model still finds slight edges based on team efficiency and conference strength of schedule.';

        if (isPreTournament()) {
          tournamentMeta.storyline = 'The bracket is locked in. The model has scanned every region and is flagging edges across all four quadrants.';
          tournamentMeta.confRecap = [
            'Conference tournament champions are set — several auto-bids enter March Madness with momentum.',
            'Watch for teams that won 3+ games in conference tournaments. Recent form correlates with first-round cover rates.',
          ];
          tournamentMeta.upsetMatchups = [
            { matchup: '8 vs 9 seed matchups', comment: 'Historically near coin flips (49% upset rate). The model still finds edges based on efficiency margins.' },
            { matchup: '5 vs 12 seed matchups', comment: '12-seeds upset at a 36% clip since 2011. Multiple matchups this year show elevated volatility.' },
          ];
        }
      }
    }

    // ── 7c. Rebuild picks summary now that modelSignals are loaded
    if (type === 'daily' && modelSignals.length > 0 && briefingContext) {
      const topPicks = modelSignals.slice(0, 3);
      const parts = topPicks.map(p => {
        const matchup = p.matchup || `${p.awayTeam || '?'} vs ${p.homeTeam || '?'}`;
        if (p.isUpset) return `${matchup} (upset pick)`;
        const prob = p.probability || p.winProb || p.modelProb || null;
        const winner = p.winner || p.pick || p.favored || '';
        const pctStr = prob != null ? `${Math.round(prob * 100)}%` : '';
        return winner && pctStr ? `${winner} ${pctStr}` : matchup;
      }).filter(Boolean);
      if (parts.length > 0) {
        briefingContext.picksSummary = `Today's strongest model signals: ${parts.join(' · ')}.`;
      }
    }

    // ── 7d. Pre-load team data (used by all team-related emails)
    let getTeamBySlugFn = null;
    try {
      const teamsModule = await import('../../src/data/teams.js');
      getTeamBySlugFn = teamsModule.getTeamBySlug;
    } catch (err) {
      console.warn('[run-daily] failed to load teams data:', err.message);
    }

    // ── 8. Load user_teams (single source of truth for pinned teams)
    const userIds = toSend.map(u => u.id);
    const userTeamsMap = await fetchUserTeamsBatch(sb, userIds);

    // ── 9. Send emails (throttled to respect Resend rate limits)
    let sent = 0;
    let failed = 0;
    const errors = [];
    const total = toSend.length;

    console.log(`[run-daily] Queued ${total} recipients for ${type} (scheduled)`);

    for (let i = 0; i < total; i++) {
      const authUser = toSend[i];
      const userId = authUser.id;
      const email = authUser.email;
      const profile = profileMap[userId];

      const displayName = getUserDisplayName({ user: authUser, profile });

      // Resolve pinned teams from user_teams (single source of truth)
      const teamRows = userTeamsMap[userId] || [];
      const pinnedTeams = getTeamBySlugFn
        ? resolveTeamRows(teamRows, getTeamBySlugFn)
        : [];
      const pinnedSlugs = getPinnedTeamSlugs(teamRows);

      // Debug logging: team resolution
      if (type === 'pinned' || type === 'teamDigest') {
        console.log(`[run-daily] Team resolve user=${userId} email=${email} raw_slugs=[${pinnedSlugs.join(',')}] resolved_names=[${pinnedTeams.map(t => t.name).join(',')}] count=${pinnedTeams.length}`);
      }

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
        oddsGames,
        modelSignals,
        tournamentMeta,
        // Enhanced briefing context for upgraded email
        narrativeParagraph: briefingContext.narrativeParagraph || '',
        priorDayResults: briefingContext.priorDayResults || [],
        todayUpcoming: briefingContext.todayUpcoming || [],
        picksSummary: briefingContext.picksSummary || '',
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
            // Team Digest now uses pinned teams (user_teams) as single source of truth
            if (!getTeamBySlugFn || pinnedSlugs.length === 0) {
              skipCounts.no_digest_teams++;
              console.log(`[run-daily] SKIP user=${userId} reason=no_pinned_teams email=${email}`);
              continue;
            }
            const planEntitlements = getProfileEntitlements(profile);
            const maxEmailTeams = isFinite(planEntitlements.maxEmailTeams)
              ? planEntitlements.maxEmailTeams
              : TEAM_DIGEST_MAX_TEAMS;
            const digestSlugs = pinnedSlugs.slice(0, Math.min(maxEmailTeams, TEAM_DIGEST_MAX_TEAMS));
            const sharedDigestData = {
              scoresToday,
              rankingsTop25,
              atsLeaders,
              headlines,
            };
            const teamDigests = assembleTeamDigestPayload(
              digestSlugs,
              sharedDigestData,
              getTeamBySlugFn
            );

            // Integrity check: verify rendered teams match resolved pinned teams
            const renderedSlugs = teamDigests.map(d => d.team.slug);
            const unexpectedTeams = renderedSlugs.filter(s => !pinnedSlugs.includes(s));
            if (unexpectedTeams.length > 0) {
              console.error(`[run-daily] INTEGRITY VIOLATION: user=${userId} rendered teams [${renderedSlugs.join(',')}] contain slugs not in pinned teams [${pinnedSlugs.join(',')}]. Aborting send for this user.`);
              failed++;
              errors.push(`${email}: integrity violation — rendered teams don't match pinned teams`);
              continue;
            }

            const digestEmailData = { ...emailData, teamDigests, totalTeamCount: pinnedSlugs.length };
            subject = getDigestSubject(digestEmailData);
            html    = renderDigestHTML(digestEmailData);
            text    = renderDigestText(digestEmailData);
            break;
          }
        }

        console.log(`[run-daily] Sending ${i + 1}/${total} to=${email}`);
        await sendEmailThrottled({ to: email, subject, html, text });
        await logEmailSend(sb, { userId, email, type, dateKey });
        sent++;
        console.log(`[run-daily] SENT ${i + 1}/${total} type=${type} to=${email}`);

      } catch (err) {
        failed++;
        const msg = `Failed for ${email}: ${err.message}`;
        console.error(`[run-daily] FAIL ${i + 1}/${total} type=${type} to=${email} error=${err.message}`);
        errors.push(msg);
      }
    }

    const completedAtISO = new Date().toISOString();
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    // ── 10. Summary
    const summaryLog = [
      `\n[run-daily] ═══ ${type.toUpperCase()} DIGEST RUN SUMMARY ═══`,
      `  digest_type:  ${type}`,
      `  status:       ${failed === 0 ? 'success' : (sent > 0 ? 'partial' : 'failed')}`,
      `  scanned:      ${authUsers.length}`,
      `  eligible:     ${subscribedUsers.length}`,
      `  sent:         ${sent}`,
      `  failed:       ${failed}`,
      `  skipped:`,
      `    opted_out:        ${skipCounts.opted_out}`,
      `    no_email:         ${skipCounts.no_email}`,
      `    no_profile:       ${skipCounts.no_profile} (used defaults)`,
      `    already_sent:     ${skipCounts.already_sent}`,
      `    no_digest_teams:  ${skipCounts.no_digest_teams}`,
      `  started_at:   ${startedAtISO}`,
      `  completed_at: ${completedAtISO}`,
      `  elapsed:      ${elapsed}s`,
      `[run-daily] ═══════════════════════════════════\n`,
    ].join('\n');
    console.log(summaryLog);

    // ── 11. Persist job run to email_job_runs
    const jobStatus = failed === 0 ? 'success' : (sent > 0 ? 'partial' : 'failed');
    await logJobRun(sb, {
      digest_type:    type,
      started_at:     startedAtISO,
      completed_at:   completedAtISO,
      status:         jobStatus,
      scanned_count:  authUsers.length,
      eligible_count: subscribedUsers.length,
      sent_count:     sent,
      failed_count:   failed,
      skipped_counts: skipCounts,
      error_message:  errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
      run_mode:       'scheduled',
    });

    return res.status(200).json({
      ok: true,
      type,
      status: jobStatus,
      sent,
      failed,
      skipped: alreadySent.size,
      total: subscribedUsers.length,
      totalAuth: authUsers.length,
      noProfile: skipCounts.no_profile,
      optedOut: skipCounts.opted_out,
      elapsed: `${elapsed}s`,
      startedAt: startedAtISO,
      completedAt: completedAtISO,
      ...(errors.length ? { errors: errors.slice(0, 5) } : {}),
    });

  } catch (err) {
    console.error('[run-daily] Fatal error:', err.message);
    await logJobRun(sb, {
      digest_type:   type,
      started_at:    startedAtISO,
      completed_at:  new Date().toISOString(),
      status:        'error',
      scanned_count: 0,
      eligible_count: 0,
      sent_count:    0,
      failed_count:  0,
      skipped_counts: skipCounts,
      error_message: err.message,
      run_mode:      'scheduled',
    });
    return res.status(500).json({ error: err.message || 'Internal server error.' });
  }
}
