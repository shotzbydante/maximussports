/**
 * Confirm Signup email template.
 * Sent via /api/auth/send-confirm-signup when a user submits their email.
 *
 * Updated to match editorial newsletter shell (light theme).
 *
 * @param {{ confirmUrl: string, isWelcome?: boolean }} opts
 */

import { EmailShell, spacerRow, sectionLabel } from '../EmailShell.js';

export function getSubject({ isWelcome = false } = {}) {
  return isWelcome
    ? 'Welcome to Maximus Sports'
    : 'Maximus Sports: confirm your email';
}

export function renderHTML({ confirmUrl = '#', isWelcome = false } = {}) {
  const subhead = isWelcome
    ? 'Your account is ready. Here&#8217;s what Maximus Sports brings to your game.'
    : 'Confirm your email below to unlock personalized college basketball intelligence.';

  const content = `
    ${spacerRow(8)}

    <!-- HERO -->
    <tr>
      <td style="padding:28px 24px 22px;text-align:center;" class="hero-td">
        <img
          src="https://maximussports.ai/mascot.png"
          alt="Maximus robot"
          width="80"
          style="width:80px;height:auto;max-width:80px;display:block;margin:0 auto 16px;border:0;outline:none;"
        />
        <h1 class="hero-h1"
            style="margin:0 0 10px;font-size:24px;font-weight:800;color:#1a1a2e;letter-spacing:-0.02em;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.2;">
          Welcome to Maximus Sports
        </h1>
        <p style="margin:0 auto;font-size:15px;color:#4a5568;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.6;max-width:400px;">
          ${subhead}
        </p>
      </td>
    </tr>

    ${spacerRow(12)}

    <!-- VALUE BULLETS -->
    <tr>
      <td style="padding:0 24px 4px;" class="section-td">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
               style="background-color:#f9fafb;border:1px solid #e8ecf0;border-radius:6px;border-collapse:collapse;">
          <tr>
            <td style="padding:16px 18px 14px;" class="card-td">
              <div style="margin-bottom:12px;">${sectionLabel('WHAT YOU GET')}</div>

              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-bottom:7px;">
                <tr>
                  <td valign="top" style="width:18px;padding-top:3px;">
                    <span style="display:inline-block;color:#2d6ca8;font-size:11px;font-weight:700;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1;">&#x2726;</span>
                  </td>
                  <td valign="top">
                    <span style="font-size:14px;color:#4a5568;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.55;">Pin your favorite teams and get a personalized AI briefing every morning</span>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-bottom:7px;">
                <tr>
                  <td valign="top" style="width:18px;padding-top:3px;">
                    <span style="display:inline-block;color:#2d6ca8;font-size:11px;font-weight:700;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1;">&#x2726;</span>
                  </td>
                  <td valign="top">
                    <span style="font-size:14px;color:#4a5568;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.55;">Track ATS edges, line movement, and spread context across the board</span>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-bottom:7px;">
                <tr>
                  <td valign="top" style="width:18px;padding-top:3px;">
                    <span style="display:inline-block;color:#2d6ca8;font-size:11px;font-weight:700;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1;">&#x2726;</span>
                  </td>
                  <td valign="top">
                    <span style="font-size:14px;color:#4a5568;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.55;">See market sentiment and public betting indicators before tip-off</span>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td valign="top" style="width:18px;padding-top:3px;">
                    <span style="display:inline-block;color:#2d6ca8;font-size:11px;font-weight:700;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1;">&#x2726;</span>
                  </td>
                  <td valign="top">
                    <span style="font-size:14px;color:#4a5568;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.55;">Breaking news and video highlights for every team you follow</span>
                  </td>
                </tr>
              </table>

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
                style="background-color:#f9fafb;border:1px solid #e8ecf0;border-radius:6px;padding:14px 15px;">
              <div style="margin-bottom:9px;">
                <span style="display:inline-block;font-size:10px;font-weight:700;color:#8a94a6;letter-spacing:0.1em;text-transform:uppercase;font-family:'DM Sans',Arial,Helvetica,sans-serif;">Free</span>
              </div>
              <p style="margin:0 0 7px;font-size:13px;font-weight:700;color:#1a1a2e;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.3;">Start for free</p>
              <p style="margin:0;font-size:12px;color:#8a94a6;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.65;">
                Up to 3 pinned teams<br/>
                Standard AI intel<br/>
                News &amp; highlights
              </p>
            </td>

            <td width="4%" style="font-size:0;line-height:0;" aria-hidden="true">&nbsp;</td>

            <td width="48%" valign="top"
                style="background-color:#eef4fb;border:1px solid #c6daf0;border-radius:6px;padding:14px 15px;">
              <div style="margin-bottom:9px;">
                <span style="display:inline-block;font-size:10px;font-weight:700;color:#2d6ca8;letter-spacing:0.1em;text-transform:uppercase;font-family:'DM Sans',Arial,Helvetica,sans-serif;">Pro</span>
              </div>
              <p style="margin:0 0 7px;font-size:13px;font-weight:700;color:#1a1a2e;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.3;">Unlock full depth</p>
              <p style="margin:0 0 10px;font-size:12px;color:#4a5568;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.65;">
                Unlimited pinned teams<br/>
                Full odds &amp; ATS insights<br/>
                Premium AI intel
              </p>
              <a href="https://maximussports.ai/settings?openBilling=1"
                 style="font-size:12px;color:#2d6ca8;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
                See Pro benefits &#x2192;
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    ${spacerRow(20)}

    ${!isWelcome ? `
    <tr>
      <td style="padding:0 24px 6px;text-align:center;" class="section-td">
        <p style="margin:0;font-size:12px;color:#8a94a6;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.65;">
          If the button below doesn&apos;t work, confirm here:
        </p>
        <p style="margin:4px 0 0;font-size:11px;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.5;word-break:break-all;">
          <a href="${confirmUrl}" style="color:#2d6ca8;text-decoration:underline;">${confirmUrl}</a>
        </p>
      </td>
    </tr>` : ''}

    ${spacerRow(4)}
  `;

  const previewText = isWelcome
    ? 'Your Maximus Sports account is ready. Personalized college basketball intelligence awaits.'
    : 'Confirm your email to unlock personalized college basketball intelligence.';

  return EmailShell({
    content,
    previewText,
    ctaUrl: isWelcome ? 'https://maximussports.ai' : confirmUrl,
    ctaLabel: isWelcome ? 'Open Maximus Sports &rarr;' : 'Confirm email &rarr;',
  });
}

export function renderText({ confirmUrl = '', isWelcome = false } = {}) {
  const year = new Date().getFullYear();
  const lines = [
    'Welcome to Maximus Sports',
    '='.repeat(40),
    '',
  ];

  if (isWelcome) {
    lines.push('Your account is ready. Here\'s what Maximus Sports brings to your game.');
  } else {
    lines.push('Confirm your email to unlock personalized college basketball intelligence.');
    lines.push('');
    lines.push('Confirm here: ' + confirmUrl);
  }

  lines.push(
    '',
    '-'.repeat(40),
    'What you get with Maximus Sports:',
    '',
    '+ Pin your favorite teams and get a personalized AI briefing every morning',
    '+ Track ATS edges, line movement, and spread context',
    '+ See market sentiment and public betting indicators before tip-off',
    '+ Breaking news and video highlights for every team you follow',
    '',
    '-'.repeat(40),
    'Free plan:  Up to 3 pinned teams · standard AI intel · news & highlights',
    'Pro plan:   Unlimited teams · full odds & ATS insights · premium AI intel',
    '',
    'See Pro benefits: https://maximussports.ai/settings?openBilling=1',
    '',
    '='.repeat(40),
    isWelcome
      ? "You're receiving this because you created an account at maximussports.ai."
      : "You're receiving this because you started signing up at maximussports.ai.",
    'Not betting advice. For informational purposes only.',
    `\u00A9 ${year} Maximus Sports \u00B7 winning@maximussports.ai`,
  );
  return lines.join('\n');
}
