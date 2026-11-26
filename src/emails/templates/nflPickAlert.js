/**
 * NFL pick alert: one short email the moment a recommended pick is locked
 * (preference key nfl_pick_alerts, Pro only). Sent by api/_lib/nflPickAlerts.js.
 *
 * A pick is locked at one book's line and price. Lines move after that, so
 * the email leads with the pick, the price and the book, and says when it
 * was taken. It carries the same reason the app shows, nothing more.
 */

import { EmailShell } from '../EmailShell.js';
import { launchPicks, pickCard, sectionTitle } from './nflLaunch.js';

const F = "'DM Sans',Arial,Helvetica,sans-serif";
const NAVY = '#0f2440';
const BODY = '#4b5563';
const DIM = '#8a94a6';
const SITE = 'https://maximussports.ai';
const UTM = 'utm_source=email&utm_medium=email&utm_campaign=nfl_pick_alert';
const PICKS_URL = `${SITE}/nfl/insights?${UTM}`;

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The stored picks as the plain fields the pick card renders. */
export function alertPicks(picks = [], { now = Date.now() } = {}) {
  return launchPicks({ tiers: { tier1: picks } }, { max: 10, now });
}

function where(p) {
  return [p.price, p.book ? `at ${p.book}` : ''].filter(Boolean).join(' ');
}

export function getSubject({ picks = [], now } = {}) {
  const list = alertPicks(picks, { now });
  if (list.length === 0) return 'New NFL pick from Maximus';
  const [first] = list;
  const head = [first.pick, where(first)].filter(Boolean).join(' ');
  return list.length === 1
    ? `New pick: ${head} (${first.matchup})`
    : `${list.length} new picks: ${head} and ${list.length - 1} more`;
}

export function renderHTML({ picks = [], displayName, userId, now } = {}) {
  const list = alertPicks(picks, { now });
  const many = list.length !== 1;
  const hero = `
<tr>
  <td bgcolor="${NAVY}" style="background-color:${NAVY};padding:22px 24px 20px;" class="hero-td">
    <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#7fb2e5;letter-spacing:0.14em;text-transform:uppercase;font-family:${F};">Pick alert &middot; Pro</p>
    <h1 class="hero-h1" style="margin:0;font-size:26px;font-weight:800;color:#ffffff;line-height:1.15;letter-spacing:-0.02em;font-family:${F};">${many ? `${list.length} picks just locked.` : 'A pick just locked.'}</h1>
    <p style="margin:10px 0 0;font-size:14px;color:#d6e2f0;line-height:21px;font-family:${F};">${displayName ? `${esc(displayName)}, this` : 'This'} is the price Maximus took. Lines move, so check it is still there before you bet.</p>
  </td>
</tr>`;
  const close = `
<tr>
  <td style="padding:14px 24px 6px;" class="section-td">
    <p style="margin:0;font-size:13px;color:${BODY};line-height:20px;font-family:${F};">The pick is graded at this line, price and book, win or lose. You get this email because pick alerts are on for your Pro account. Turn them off in Settings.</p>
    <p style="margin:12px 0 0;font-size:11px;color:${DIM};line-height:17px;font-family:${F};">21+. For entertainment only. Gambling problem? Call 1-800-GAMBLER.</p>
  </td>
</tr>`;
  return EmailShell({
    content: [hero, sectionTitle('Recommended', many ? 'The picks' : 'The pick'), list.map(pickCard).join(''), close].join('\n'),
    previewText: `${list.map((p) => [p.pick, where(p)].filter(Boolean).join(' ')).join(', ')}. Taken just now.`,
    userId,
    ctaUrl: PICKS_URL,
    ctaLabel: 'Open the NFL board &rarr;',
  });
}

export function renderText({ picks = [], now } = {}) {
  const list = alertPicks(picks, { now });
  const out = [list.length === 1 ? 'A pick just locked.' : `${list.length} picks just locked.`, ''];
  for (const p of list) {
    out.push(`${p.pick} ${where(p)}`.trim(), p.matchup, p.why || '', '');
  }
  out.push('Lines move: check the price before you bet.', PICKS_URL, '', '21+. For entertainment only. Gambling problem? Call 1-800-GAMBLER.');
  return out.join('\n');
}
