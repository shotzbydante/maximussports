/**
 * Countdown helpers for the offseason clock.
 *
 * `getCountdownParts` is a pure function so it can be unit-tested and reused
 * outside React; `useCountdown` re-reads the clock once a second rather than
 * decrementing a counter, so it never drifts and recovers after tab sleep.
 */

import { useEffect, useState } from 'react';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Parse an ISO timestamp to epoch ms; returns null when missing or invalid. */
export function parseTarget(target) {
  if (target == null) return null;
  const ms = target instanceof Date ? target.getTime() : Date.parse(target);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * @param {number|null} targetMs  epoch ms of the event
 * @param {number} nowMs          epoch ms of "now"
 * @returns {{ valid: boolean, done: boolean, days: number, hours: number, minutes: number, seconds: number, totalMs: number }}
 */
export function getCountdownParts(targetMs, nowMs) {
  if (targetMs == null || !Number.isFinite(targetMs)) {
    return { valid: false, done: false, days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
  }
  const totalMs = Math.max(0, targetMs - nowMs);
  return {
    valid: true,
    done: targetMs <= nowMs,
    days: Math.floor(totalMs / DAY),
    hours: Math.floor((totalMs % DAY) / HOUR),
    minutes: Math.floor((totalMs % HOUR) / MINUTE),
    seconds: Math.floor((totalMs % MINUTE) / SECOND),
    totalMs,
  };
}

/** Zero-pad a clock unit to two digits ("07"). */
export function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Spoken summary for assistive tech, e.g. "122 days, 21 hours, 14 minutes". */
export function describeCountdown(parts) {
  if (!parts.valid) return '';
  if (parts.done) return 'under way';
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return [plural(parts.days, 'day'), plural(parts.hours, 'hour'), plural(parts.minutes, 'minute')].join(', ');
}

/**
 * Live countdown to an ISO timestamp.
 * @param {string|Date|null} target
 */
export function useCountdown(target) {
  const targetMs = parseTarget(target);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (targetMs == null) return undefined;
    const tick = () => setNowMs(Date.now());
    // Nothing left to count once the event has started.
    if (targetMs <= Date.now()) return undefined;
    const id = setInterval(tick, SECOND);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [targetMs]);

  return getCountdownParts(targetMs, nowMs);
}
