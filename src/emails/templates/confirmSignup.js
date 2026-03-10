/**
 * Confirm Signup email template.
 * Sent via /api/auth/send-confirm-signup when a user submits their email on the Settings page.
 *
 * Design goals:
 *  - Premium, branded welcome moment — consistent with intel email family
 *  - 3D Maximus robot "Welcome" hero
 *  - Confirmation CTA at the bottom (EmailShell button) + fallback plain link
 *  - Tasteful Free vs Pro section (not salesy)
 *  - Transactional — no unsubscribe needed
 *  - Gmail + iOS Mail safe: table-only layout, all-inline critical styles, PNG images
 *
 * @param {{ confirmUrl: string }} opts
 */

import { EmailShell, spacerRow, dividerRow, pill } from '../EmailShell.js';

export function getSubject({ isWelcome = false } = {}) {
  return isWelcome
    ? 'Welcome to Maximus Sports'
    : 'Maximus Sports: Welcome. Confirm your email';
}

export function renderHTML({ confirmUrl = '#', isWelcome = false } = {}) {
  const subhead = isWelcome
    ? 'Your account is ready. Here&#8217;s what Maximus Sports brings to your game.'
    : 'Confirm your email below to unlock personalized college basketball intelligence.';

  const content = `
    ${spacerRow(8)}

    <!-- ═══ ROBOT HERO ═══ -->
    <tr>
      <td bgcolor="#0f1c30"
          style="background-color:#101e30;background-image:linear-gradient(180deg,#101e30 0%,#0d1422 100%);padding:32px 24px 26px;text-align:center;"
          class="hero-td">

        <!-- Robot image — public asset, absolute URL, PNG for Gmail iOS -->
        <img
          src="https://maximussports.ai/mascot.png"
          alt="Maximus robot — your AI sports intelligence assistant"
          width="96"
          style="width:96px;height:auto;max-width:96px;display:block;margin:0 auto 18px;border:0;outline:none;line-height:100%;-ms-interpolation-mode:bicubic;"
        />

        <!-- Welcome headline -->
        <h1
          class="hero-h1"
          style="margin:0 0 10px;font-size:24px;font-weight:800;color:#edf2f8;letter-spacing:-0.022em;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.2;">
          Welcome to Maximus Sports
        </h1>

        <!-- Subhead -->
        <p style="margin:0 auto;font-size:14px;color:#6b7d90;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.6;max-width:400px;">
          ${subhead}
        </p>

      </td>
    </tr>

    ${spacerRow(20)}

    <!-- ═══ VALUE BULLETS ═══ -->
    <tr>
      <td style="padding:0 24px 4px;" class="section-td">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#0f1825"
               style="background-color:#0f1825;border:1px solid rgba(255,255,255,0.09);border-radius:8px;border-collapse:collapse;"
               class="email-card-dark">
          <tr>
            <td bgcolor="#0f1825" style="padding:16px 18px 14px;background-color:#0f1825;" class="card-td">

              <div style="margin-bottom:12px;">${pill('What you get', 'intel')}</div>

              <!-- Bullet: line 1 -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-bottom:7px;">
                <tr>
                  <td valign="top" style="width:18px;padding-top:3px;">
                    <span style="display:inline-block;color:#3d7aaa;font-size:11px;font-weight:700;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1;">&#x2726;</span>
                  </td>
                  <td valign="top">
                    <span style="font-size:13px;color:#7d8fa0;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.55;">Pin your favorite teams and get a personalized AI briefing every morning</span>
                  </td>
                </tr>
              </table>

              <!-- Bullet: line 2 -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-bottom:7px;">
                <tr>
                  <td valign="top" style="width:18px;padding-top:3px;">
                    <span style="display:inline-block;color:#3d7aaa;font-size:11px;font-weight:700;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1;">&#x2726;</span>
                  </td>
                  <td valign="top">
                    <span style="font-size:13px;color:#7d8fa0;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.55;">Track ATS edges, line movement, and spread context across the board</span>
                  </td>
                </tr>
              </table>

              <!-- Bullet: line 3 -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-bottom:7px;">
                <tr>
                  <td valign="top" style="width:18px;padding-top:3px;">
                    <span style="display:inline-block;color:#3d7aaa;font-size:11px;font-weight:700;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1;">&#x2726;</span>
                  </td>
                  <td valign="top">
                    <span style="font-size:13px;color:#7d8fa0;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.55;">See market sentiment and public betting indicators before tip-off</span>
                  </td>
                </tr>
              </table>

              <!-- Bullet: line 4 -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td valign="top" style="width:18px;padding-top:3px;">
                    <span style="display:inline-block;color:#3d7aaa;font-size:11px;font-weight:700;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1;">&#x2726;</span>
                  </td>
                  <td valign="top">
                    <span style="font-size:13px;color:#7d8fa0;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.55;">Breaking news and video highlights for every team you follow</span>
                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>
      </td>
    </tr>

    ${spacerRow(10)}

    <!-- ═══ FREE VS PRO — 2-column tasteful section ═══ -->
    <tr>
      <td style="padding:0 24px 4px;" class="section-td">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
          <tr>

            <!-- Free column -->
            <td width="48%" valign="top" bgcolor="#0f1825"
                style="background-color:#0f1825;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:14px 15px 14px;"
                class="email-card-dark">
              <div style="margin-bottom:9px;">
                <span style="display:inline-block;background-color:#1a2233;border:1px solid rgba(255,255,255,0.1);color:#8090a8;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding:3px 8px;border-radius:3px;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.5;white-space:nowrap;">Free</span>
              </div>
              <p style="margin:0 0 7px;font-size:12px;font-weight:700;color:#c0cad8;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.3;">Start for free</p>
              <p style="margin:0;font-size:11px;color:#566070;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.65;">
                Up to 3 pinned teams<br/>
                Standard AI intel<br/>
                News &amp; highlights
              </p>
            </td>

            <!-- Spacer column -->
            <td width="4%" style="font-size:0;line-height:0;" aria-hidden="true">&nbsp;</td>

            <!-- Pro column — subtle blue tint -->
            <td width="48%" valign="top" bgcolor="#0d1d30"
                style="background-color:#0d1d30;border:1px solid rgba(60,121,180,0.3);border-radius:8px;padding:14px 15px 14px;"
                class="email-card-dark">
              <div style="margin-bottom:9px;">
                <span style="display:inline-block;background-color:#1a3a5c;background-image:linear-gradient(135deg,#1a3a5c,#2d6ca8);border:1px solid rgba(90,159,212,0.5);color:#7ab4e0;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding:3px 8px;border-radius:3px;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.5;white-space:nowrap;">Pro</span>
              </div>
              <p style="margin:0 0 7px;font-size:12px;font-weight:700;color:#c0cad8;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.3;">Unlock full depth</p>
              <p style="margin:0 0 10px;font-size:11px;color:#566070;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.65;">
                Unlimited pinned teams<br/>
                Full odds &amp; ATS insights<br/>
                Premium AI intel
              </p>
              <a href="https://maximussports.ai/settings?openBilling=1"
                 style="font-size:11px;color:#4a8fc0;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,Helvetica,sans-serif;letter-spacing:0.01em;">
                See Pro benefits &#x2192;
              </a>
            </td>

          </tr>
        </table>
      </td>
    </tr>

    ${spacerRow(20)}

    ${!isWelcome ? `<!-- ═══ FALLBACK LINK — shown above the main CTA button ═══ -->
    <tr>
      <td style="padding:0 24px 6px;text-align:center;" class="section-td">
        <p style="margin:0;font-size:12px;color:#4a5870;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.65;">
          If the button below doesn&apos;t work, confirm here:
        </p>
        <p style="margin:4px 0 0;font-size:11px;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.5;word-break:break-all;">
          <a href="${confirmUrl}"
             style="color:#3d6e90;text-decoration:underline;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${confirmUrl}</a>
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
    `© ${year} Maximus Sports · winning@maximussports.ai`,
  );
  return lines.join('\n');
}
