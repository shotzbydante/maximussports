/**
 * Signed-out question limits, kept in KV.
 *
 * A guest has no account to count against, so three counters stand in:
 * one per device (the cap the visitor sees), one per network address (so
 * clearing storage does not reset it, with room for shared wifi), and one
 * for all guests together (a ceiling on what signed-out traffic can cost
 * in a day). All three reset at midnight Eastern.
 *
 * Fails closed: if KV cannot be reached, guests are told chat is
 * unavailable. An open, uncounted route to a paid model is the one thing
 * this file exists to prevent.
 */

import { createHash } from 'node:crypto';
import { incrWithTtl, decrCounter, getJson } from '../../_globalCache.js';

const TTL_SECONDS = 36 * 3600;

/** The Eastern calendar day, the same day the account caps and the picks use. */
export function easternDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}

const digest = (v) => createHash('sha256').update(String(v)).digest('hex').slice(0, 24);

/** A device id is a random token the page keeps in localStorage. Anything else is ignored. */
export function cleanDeviceId(raw) {
  const v = String(raw || '');
  return /^[A-Za-z0-9-]{16,64}$/.test(v) ? v : null;
}

export function clientIp(req) {
  return String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim()
    || String(req?.headers?.['x-real-ip'] || '').trim()
    || null;
}

function keys({ ip, device, day }) {
  // A visitor with no device id is counted by address alone.
  const who = device ? `d:${digest(device)}` : `i:${digest(ip || 'unknown')}`;
  return {
    device: `ask:guest:${day}:${who}`,
    ip: `ask:guest:${day}:ip:${digest(ip || 'unknown')}`,
    all: `ask:guest:${day}:all`,
  };
}

/**
 * Count one guest question, or refuse it.
 * @returns {Promise<{ ok:true, used:number } | { ok:false, code:'capped'|'busy'|'unavailable', used?:number }>}
 *   capped: this visitor's own limit. busy: a shared ceiling. unavailable: no KV.
 */
export async function takeGuestTurn({ ip, device, cap, perIp, all, now = new Date(), incr = incrWithTtl }) {
  const k = keys({ ip, device, day: easternDay(now) });
  const used = await incr(k.device, TTL_SECONDS);
  if (used == null) return { ok: false, code: 'unavailable' };
  if (used > cap) return { ok: false, code: 'capped', used: cap };
  const fromIp = await incr(k.ip, TTL_SECONDS);
  if (fromIp == null) return { ok: false, code: 'unavailable' };
  if (fromIp > perIp) return { ok: false, code: 'capped', used: cap };
  const total = await incr(k.all, TTL_SECONDS);
  if (total == null) return { ok: false, code: 'unavailable' };
  if (total > all) return { ok: false, code: 'busy', used };
  return { ok: true, used };
}

/** Questions this visitor has used today. Resolves to null when it cannot be read. */
export async function guestUsed({ ip, device, now = new Date(), read = getJson }) {
  try {
    const n = Number(await read(keys({ ip, device, day: easternDay(now) }).device));
    return Number.isFinite(n) ? n : 0;
  } catch { return null; }
}

/** Give a question back after its turn failed, so it does not count. */
export async function refundGuestTurn({ ip, device, now = new Date(), decr = decrCounter }) {
  const k = keys({ ip, device, day: easternDay(now) });
  await Promise.all([decr(k.device), decr(k.ip), decr(k.all)]);
}
