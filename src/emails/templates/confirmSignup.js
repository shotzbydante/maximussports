/**
 * Confirm Signup email template.
 * Sent via /api/auth/send-confirm-signup when a user submits their email,
 * and via /api/auth/send-welcome (isWelcome) once the account exists.
 *
 * Order matters here: the one thing the reader has to do is confirm, so the
 * button comes first, right under the headline. What they get comes after it,
 * football first. The raw link is the fallback and sits last, small.
 *
 * @param {{ confirmUrl: string, isWelcome?: boolean }} opts
 */

import { EmailShell, spacerRow, sectionLabel } from '../EmailShell.js';

const F = "'DM Sans',Arial,Helvetica,sans-serif";
const SITE = 'https://maximussports.ai';

/** What an account gets. Football leads; every line is something in the app today. */
export const BENEFITS = [
  ['A call on every NFL game.', 'Spread, total and moneyline, with picks locked at a real price and graded in public.'],
  ['Matchups down to the position group.', 'Every starter rated, for every game and all 32 teams.'],
  ['Your teams on your home page.', 'Follow teams in the NFL, college basketball and MLB.'],
  ['Emails worth opening.', 'The Daily Brief every morning, and NFL Picks on Thursday and Sunday.'],
];

export function getSubject({ isWelcome = false } = {}) {
  return isWelcome
    ? 'Welcome to Maximus Sports'
    : 'Confirm your email for Maximus Sports';
}

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function benefitRow([title, text], last) {
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;${last ? '' : 'margin-bottom:10px;'}">
                <tr>
                  <td valign="top" width="22" style="width:22px;padding-top:1px;font-size:14px;line-height:21px;color:#16a34a;font-weight:700;font-family:${F};">&#10003;</td>
                  <td valign="top" style="font-size:14px;color:#4a5568;font-family:${F};line-height:21px;"><span style="font-weight:700;color:#1a1a2e;">${title}</span> ${text}</td>
                </tr>
              </table>`;
}

export function renderHTML({ confirmUrl = '#', isWelcome = false } = {}) {
  const url = esc(confirmUrl);
  const headline = isWelcome ? 'Welcome to Maximus Sports' : 'Confirm your email';
  const subhead = isWelcome
    ? 'Your account is ready. Here is what is inside.'
    : 'One tap and your account is ready.';
  const actionUrl = isWelcome ? `${SITE}/nfl` : url;
  const actionLabel = isWelcome ? 'See this week&rsquo;s NFL picks' : 'Confirm email';

  const content = `
    ${spacerRow(8)}

    <!-- HERO: headline, then the one action -->
    <tr>
      <td style="padding:22px 24px 8px;text-align:center;" class="hero-td">
        <img
          src="${SITE}/mascot.png"
          alt="Maximus, the Maximus Sports mascot"
          width="112"
          style="width:112px;height:auto;max-width:112px;display:block;margin:0 auto 14px;border:0;outline:none;"
        />
        <h1 class="hero-h1"
            style="margin:0 0 8px;font-size:26px;font-weight:800;color:#1a1a2e;letter-spacing:-0.02em;font-family:${F};line-height:1.2;">
          ${headline}
        </h1>
        <p style="margin:0 auto;font-size:15px;color:#4a5568;font-family:${F};line-height:1.6;max-width:400px;">
          ${subhead}
        </p>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:14px 24px 26px;" class="section-td">
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
          <tr>
            <td align="center" bgcolor="#1668e3" style="background-color:#1668e3;border-radius:8px;">
              <a href="${actionUrl}" target="_blank"
                 style="display:inline-block;padding:14px 34px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;font-family:${F};line-height:1;border-radius:8px;">
                ${actionLabel}
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- WHAT YOU GET -->
    <tr>
      <td style="padding:0 24px 4px;" class="section-td">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
               style="background-color:#f9fafb;border:1px solid #e8ecf0;border-radius:8px;border-collapse:separate;">
          <tr>
            <td style="padding:16px 18px 16px;" class="card-td">
              <div style="margin-bottom:12px;">${sectionLabel('WHAT YOU GET')}</div>
${BENEFITS.map((b, i) => benefitRow(b, i === BENEFITS.length - 1)).join('')}
            </td>
          </tr>
        </table>
      </td>
    </tr>

    ${spacerRow(10)}

    <!-- FREE VS PRO -->
    <tr>
      <td style="padding:0 24px 4px;" class="section-td">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
          <tr>
            <td width="48%" valign="top"
                style="background-color:#f9fafb;border:1px solid #e8ecf0;border-radius:8px;padding:14px 15px;">
              <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#1a1a2e;font-family:${F};line-height:1.3;">Free</p>
              <p style="margin:0;font-size:12px;color:#6b7280;font-family:${F};line-height:1.65;">
                Follow up to 3 teams<br/>
                Standard AI intel<br/>
                News and highlights
              </p>
            </td>
            <td width="4%" style="font-size:0;line-height:0;" aria-hidden="true">&nbsp;</td>
            <td width="48%" valign="top"
                style="background-color:#eef4fb;border:1px solid #c6daf0;border-radius:8px;padding:14px 15px;">
              <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#1a1a2e;font-family:${F};line-height:1.3;">Pro</p>
              <p style="margin:0 0 8px;font-size:12px;color:#4a5568;font-family:${F};line-height:1.65;">
                Unlimited teams<br/>
                Full odds and ATS insights<br/>
                Premium AI intel
              </p>
              <a href="${SITE}/settings?openBilling=1"
                 style="font-size:12px;color:#2d6ca8;text-decoration:none;font-weight:600;font-family:${F};">
                See what Pro adds
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    ${!isWelcome ? `
    <!-- FALLBACK LINK: last, for mail apps that block buttons -->
    <tr>
      <td style="padding:22px 24px 4px;" class="section-td">
        <p style="margin:0;font-size:12px;color:#8a94a6;font-family:${F};line-height:1.6;">
          Button not working? Paste this link into your browser:
        </p>
        <p style="margin:4px 0 0;font-size:11px;font-family:${F};line-height:1.5;word-break:break-all;">
          <a href="${url}" style="color:#8a94a6;text-decoration:underline;">${url}</a>
        </p>
        <p style="margin:12px 0 0;font-size:12px;color:#8a94a6;font-family:${F};line-height:1.6;">
          Did not sign up? Ignore this email and nothing happens.
        </p>
      </td>
    </tr>` : ''}

    ${spacerRow(12)}`;

  const previewText = isWelcome
    ? 'Your account is ready: a call on every NFL game, matchups down to the position group, and your teams on your home page.'
    : 'One tap to confirm and your Maximus Sports account is ready.';

  return EmailShell({
    content,
    previewText,
    ctaUrl: isWelcome ? SITE : confirmUrl,
    ctaLabel: isWelcome ? 'Open Maximus Sports &rarr;' : 'Confirm email &rarr;',
  });
}

export function renderText({ confirmUrl = '', isWelcome = false } = {}) {
  const year = new Date().getFullYear();
  const lines = [isWelcome ? 'Welcome to Maximus Sports' : 'Confirm your email for Maximus Sports', '='.repeat(40), ''];

  if (isWelcome) {
    lines.push('Your account is ready. Here is what is inside.');
  } else {
    lines.push('One tap and your account is ready. Confirm here:', '', confirmUrl);
  }

  lines.push(
    '',
    '-'.repeat(40),
    'What you get:',
    '',
    ...BENEFITS.map(([title, text]) => `+ ${title} ${text}`),
    '',
    '-'.repeat(40),
    'Free: follow up to 3 teams, standard AI intel, news and highlights',
    'Pro:  unlimited teams, full odds and ATS insights, premium AI intel',
    '',
    `See what Pro adds: ${SITE}/settings?openBilling=1`,
    '',
    '='.repeat(40),
    isWelcome
      ? "You're receiving this because you created an account at maximussports.ai."
      : "You're receiving this because you started signing up at maximussports.ai. Did not sign up? Ignore this email.",
    'Not betting advice. For informational purposes only.',
    `© ${year} Maximus Sports · winning@maximussports.ai`,
  );
  return lines.join('\n');
}
