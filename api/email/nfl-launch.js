/**
 * /api/email/nfl-launch — the one-time "football is here" announcement.
 *
 * Driven by one row in public.email_broadcasts (id = BROADCAST_ID). The row is
 * the authorization: nothing here takes a secret, and nothing is sent to users
 * unless the row says so.
 *   approved    — must be true before anything is sent to users
 *   status      — 'draft' → 'sending' → 'sent' (claimed atomically; never re-sent)
 *   send_after  — earliest send time
 *   expires_at  — after this the broadcast will not send
 *   config      — { audience: { excludeTest, excludeOptedOut, excludeUnconfirmed },
 *                   screenshots: [{ url, caption, alt, link }], fallbackPicks: [...],
 *                   previewOpen: bool, testsRemaining: int }
 *
 * Modes (?mode=):
 *   send (default) — sends to the audience once, if approved, due and not expired.
 *                    A run that is cut short is picked up by the next call.
 *   preview        — returns the rendered HTML (while config.previewOpen).
 *   dry            — returns audience counts only, no addresses (while config.previewOpen).
 *   test           — sends one copy to the admin address (while config.testsRemaining > 0).
 *
 * Every send is written to email_send_log (digest_type = 'nfl_launch') first,
 * and anyone already logged is skipped, so nobody is mailed twice.
 */

import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { ADMIN_EMAIL } from '../_lib/admin.js';
import { sendEmailThrottled } from '../_lib/sendEmail.js';
import { resolvePreferences } from '../_lib/emailDefaults.js';
import { getSubject, renderHTML, renderText, launchPicks, launchLeans } from '../../src/emails/templates/nflLaunch.js';

export const config = { maxDuration: 300 };

const BROADCAST_ID = 'nfl_launch_2026_11_22';
const DIGEST_TYPE = 'nfl_launch';
const BATCH_SIZE = 20;
const BATCH_GAP_MS = 700;
const STALE_CLAIM_MS = 3 * 60_000;

const isTestAddress = (email) => /\+.*@/.test(email) || /(^|[._-])test/i.test(email.split('@')[0]) || /@(example|test)\./i.test(email);

function isOptedOut(profile) {
  const stored = profile?.preferences;
  if (!stored || typeof stored !== 'object') return false;
  const emailKeys = ['global_briefing', 'mlb_briefing', 'mlb_team_digest', 'mlb_picks', 'ncaam_briefing', 'ncaam_team_digest', 'ncaam_picks',
    'briefing', 'teamAlerts', 'oddsIntel', 'newsDigest', 'teamDigest'];
  if (!emailKeys.some((k) => k in stored)) return false;
  const prefs = resolvePreferences(stored);
  // Opted out = the user has saved preferences and switched every email off.
  return !['global_briefing', 'mlb_briefing', 'mlb_team_digest', 'mlb_picks', 'ncaam_briefing', 'ncaam_team_digest', 'ncaam_picks']
    .some((k) => prefs[k] === true);
}

/** A first name for the greeting, only when we hold a real-looking name. Never guessed from the address. */
function greetingName(user, profile) {
  const candidates = [user?.user_metadata?.full_name, user?.user_metadata?.name, profile?.display_name];
  for (const c of candidates) {
    const n = typeof c === 'string' ? c.trim() : '';
    if (/^[A-Za-z][A-Za-z' -]{1,30}$/.test(n)) {
      const first = n.split(/\s+/)[0];
      return first.charAt(0).toUpperCase() + first.slice(1);
    }
  }
  return '';
}

/** The board the cron already built (a KV read). No feeds are pulled here. */
async function loadBoard() {
  try {
    const { getLatestNflPicksBoard } = await import('../_lib/nflPicksBuilder.js');
    return await Promise.race([
      getLatestNflPicksBoard(),
      new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
  } catch (err) {
    console.warn(`[nfl-launch] board load failed: ${err.message}`);
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One Resend batch call (up to 100 emails). Returns the ids in order. */
async function sendBatch(emails) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set.');
  const res = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(emails),
  });
  const body = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`Resend batch ${res.status}: ${body.slice(0, 300)}`);
  let parsed = null;
  try { parsed = JSON.parse(body); } catch { /* ignore */ }
  return (parsed?.data || []).map((d) => d?.id || null);
}

async function listAuthUsers(sb) {
  const out = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`auth.admin.listUsers: ${error.message}`);
    const users = data?.users || [];
    out.push(...users);
    if (users.length < perPage) break;
    page++;
  }
  return out;
}

function buildAudience(authUsers, profileMap, audience = {}) {
  const { excludeTest = true, excludeOptedOut = true, excludeUnconfirmed = false } = audience;
  const counts = { total: authUsers.length, no_email: 0, test_address: 0, opted_out: 0, unconfirmed: 0, duplicate: 0 };
  const seen = new Set();
  const recipients = [];
  for (const u of authUsers) {
    const email = (u.email || '').trim().toLowerCase();
    if (!email) { counts.no_email++; continue; }
    if (seen.has(email)) { counts.duplicate++; continue; }
    seen.add(email);
    const test = isTestAddress(email);
    const out = isOptedOut(profileMap[u.id]);
    const unconfirmed = !u.email_confirmed_at;
    if (test) counts.test_address++;
    if (out) counts.opted_out++;
    if (unconfirmed) counts.unconfirmed++;
    if ((excludeTest && test) || (excludeOptedOut && out) || (excludeUnconfirmed && unconfirmed)) continue;
    recipients.push({ id: u.id, email, user: u, profile: profileMap[u.id] || null });
  }
  return { recipients, counts };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const mode = url.searchParams.get('mode') || 'send';
  if (!['send', 'preview', 'dry', 'test'].includes(mode)) return res.status(400).json({ error: 'Unknown mode.' });

  let sb;
  try { sb = getSupabaseAdmin(); } catch { return res.status(500).json({ error: 'Database unavailable.' }); }

  const { data: row, error: rowErr } = await sb.from('email_broadcasts').select('*').eq('id', BROADCAST_ID).maybeSingle();
  if (rowErr || !row) return res.status(404).json({ error: 'Broadcast not configured.' });

  const config = row.config || {};
  const now = Date.now();

  // ── Send gate: approved, due, not expired, not already claimed ──
  if (mode === 'send') {
    const stale = row.status === 'sending' && row.started_at && now - Date.parse(row.started_at) > STALE_CLAIM_MS;
    if (row.status !== 'draft' && !stale) return res.status(200).json({ ok: true, skipped: `status_${row.status}` });
    if (row.approved !== true) return res.status(200).json({ ok: true, skipped: 'not_approved' });
    if (row.send_after && now < Date.parse(row.send_after)) return res.status(200).json({ ok: true, skipped: 'not_due' });
    if (row.expires_at && now > Date.parse(row.expires_at)) return res.status(200).json({ ok: true, skipped: 'expired' });
  }

  const board = await loadBoard();
  let picks = board ? launchPicks(board) : [];
  if (picks.length === 0 && Array.isArray(config.fallbackPicks)) {
    picks = config.fallbackPicks.filter((p) => !p.kickoff || Date.parse(p.kickoff) > now);
  }
  const leans = board ? launchLeans(board) : [];
  const week = board?.week || config.week || null;
  const boardForRender = board || { week, fullSlatePicks: [] };
  const subject = getSubject({ week });
  const screenshots = config.screenshots || [];

  if ((mode === 'preview' || mode === 'dry') && config.previewOpen !== true) {
    return res.status(403).json({ error: 'Preview is closed.' });
  }

  if (mode === 'preview') {
    const html = renderHTML({ board: boardForRender, picks, leans, displayName: 'Dante', screenshots });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  }

  if (mode === 'test') {
    const remaining = Number(config.testsRemaining) || 0;
    if (remaining <= 0) return res.status(403).json({ error: 'No test sends remaining.' });
    await sb.from('email_broadcasts').update({ config: { ...config, testsRemaining: remaining - 1 } }).eq('id', BROADCAST_ID);
    const html = renderHTML({ board: boardForRender, picks, leans, displayName: 'Dante', screenshots });
    const text = renderText({ board: boardForRender, picks, leans, displayName: 'Dante' });
    const result = await sendEmailThrottled({ to: ADMIN_EMAIL, subject: `[TEST] ${subject}`, html, text });
    return res.status(200).json({ ok: true, mode, subject, picks: picks.length, boardLive: Boolean(board), id: result?.id || null });
  }

  const authUsers = await listAuthUsers(sb);
  const { data: profiles, error: profErr } = await sb.from('profiles').select('id, display_name, username, preferences').limit(5000);
  if (profErr) return res.status(500).json({ error: `profiles: ${profErr.message}` });
  const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  const { recipients, counts } = buildAudience(authUsers, profileMap, config.audience);

  const { data: logged } = await sb.from('email_send_log').select('user_id').eq('digest_type', DIGEST_TYPE);
  const already = new Set((logged || []).map((r) => r.user_id));
  const pending = recipients.filter((r) => !already.has(r.id));

  if (mode === 'dry') {
    return res.status(200).json({
      ok: true, mode, subject, week, picks: picks.map((p) => `${p.matchup}: ${p.pick} ${p.price} ${p.book}`), leans: leans.map((p) => `${p.matchup}: ${p.pick} ${p.price} ${p.book}`), boardLive: Boolean(board),
      audience: config.audience || {}, counts, wouldSend: pending.length, alreadySent: already.size,
      approved: row.approved === true, status: row.status, send_after: row.send_after, expires_at: row.expires_at,
    });
  }

  if (picks.length === 0) {
    console.error('[nfl-launch] no picks available; not sending');
    return res.status(200).json({ ok: false, skipped: 'no_picks' });
  }

  // ── Claim the broadcast so two invocations can never send at once ──
  const claimedAt = new Date().toISOString();
  let claim = sb.from('email_broadcasts').update({ status: 'sending', started_at: claimedAt }).eq('id', BROADCAST_ID).eq('approved', true);
  claim = row.status === 'draft' ? claim.eq('status', 'draft') : claim.eq('status', 'sending').eq('started_at', row.started_at);
  const { data: claimed, error: claimErr } = await claim.select('id');
  if (claimErr || !claimed || claimed.length === 0) {
    return res.status(200).json({ ok: true, skipped: 'already_claimed' });
  }

  const from = `Maximus Sports <${process.env.RESEND_FROM || 'winning@maximussports.ai'}>`;
  console.log(`[nfl-launch] sending to ${pending.length} recipients (audience counts: ${JSON.stringify(counts)})`);
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const chunk = pending.slice(i, i + BATCH_SIZE);
    // Log first: anyone logged is never mailed again, even if this run is cut short.
    const { error: logErr } = await sb.from('email_send_log').insert(chunk.map((r) => ({
      digest_type: DIGEST_TYPE, user_id: r.id, email: r.email, sent_at: new Date().toISOString(),
      run_mode: 'broadcast', metadata: { broadcast: BROADCAST_ID },
    })));
    if (logErr) {
      failed += chunk.length;
      console.error(`[nfl-launch] send log insert failed, chunk skipped: ${logErr.message}`);
      continue;
    }
    try {
      const ids = await sendBatch(chunk.map((r) => {
        const displayName = greetingName(r.user, r.profile);
        return {
          from, to: [r.email], subject,
          html: renderHTML({ board: boardForRender, picks, leans, displayName, userId: r.id, screenshots }),
          text: renderText({ board: boardForRender, picks, leans, displayName }),
          headers: { 'List-Unsubscribe': `<https://maximussports.ai/settings?uid=${r.id}>` },
        };
      }));
      sent += chunk.length;
      console.log(`[nfl-launch] batch ok: ${chunk.length} emails, first id ${ids[0] || '(none)'}`);
    } catch (err) {
      failed += chunk.length;
      console.error(`[nfl-launch] batch failed (${chunk.length} recipients, logged and not retried): ${err.message}`);
      await sb.from('email_send_log').update({ metadata: { broadcast: BROADCAST_ID, failed: true, error: String(err.message).slice(0, 200) } })
        .eq('digest_type', DIGEST_TYPE).in('user_id', chunk.map((r) => r.id));
    }
    if (i + BATCH_SIZE < pending.length) await sleep(BATCH_GAP_MS);
  }

  const result = { sent, failed, eligible: recipients.length, alreadySent: already.size, counts, subject, picks: picks.length, boardLive: Boolean(board) };
  await sb.from('email_broadcasts')
    .update({ status: 'sent', completed_at: new Date().toISOString(), result })
    .eq('id', BROADCAST_ID);
  console.log(`[nfl-launch] done: ${JSON.stringify(result)}`);
  return res.status(200).json({ ok: true, ...result });
}
