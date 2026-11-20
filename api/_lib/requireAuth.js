/**
 * Shared request guards for privileged routes.
 *
 *   hasCronSecret(req)          — true when the request carries CRON_SECRET as a
 *                                 Bearer token (Vercel Cron sends this automatically
 *                                 when CRON_SECRET is set on the project).
 *   requireAdminOrCron(req,res) — allows the cron secret or a signed-in admin.
 *
 * Guards fail closed: when CRON_SECRET or Supabase auth is not configured the
 * request is rejected rather than allowed through.
 *
 * Each guard resolves to true when the caller is authorized. Otherwise it sends
 * the 401/403/503 response itself and resolves to false, so handlers can write:
 *
 *   if (!(await requireAdminOrCron(req, res))) return;
 */

import { timingSafeEqual } from 'node:crypto';
import { verifyUserToken } from './supabaseAdmin.js';
import { isAdminEmail } from './admin.js';

function bearerToken(req) {
  const header = String(req?.headers?.authorization ?? '');
  return /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : '';
}

function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function cronSecret() {
  // Tolerate values pasted with surrounding quotes or whitespace.
  return String(process.env.CRON_SECRET ?? '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();
}

/** True when the request's Bearer token matches CRON_SECRET. */
export function hasCronSecret(req) {
  const secret = cronSecret();
  const token = bearerToken(req);
  return Boolean(secret) && Boolean(token) && safeEqual(token, secret);
}

/** Authorization header value for server-to-server calls between our own routes. */
export function internalAuthHeader() {
  const secret = cronSecret();
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

/**
 * Allow Vercel Cron / internal callers (CRON_SECRET) or a signed-in admin user.
 * Sends the error response and resolves to false when the caller is not allowed.
 */
export async function requireAdminOrCron(req, res) {
  if (hasCronSecret(req)) return true;

  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return false;
  }

  let user;
  try {
    user = await verifyUserToken(token);
  } catch {
    res.status(503).json({ ok: false, error: 'Auth service unavailable' });
    return false;
  }

  if (!user || !isAdminEmail(user.email)) {
    res.status(user ? 403 : 401).json({ ok: false, error: user ? 'Admin access only' : 'Unauthorized' });
    return false;
  }
  return true;
}
