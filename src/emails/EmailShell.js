/**
 * EmailShell — wraps any email template content in the Maximus Sports HTML frame.
 *
 * Design philosophy: premium editorial newsletter (Morning Brew / The Athletic).
 * - Clean, restrained brand presence
 * - Solid backgrounds (no gradients that Gmail strips)
 * - High text-to-image ratio for primary inbox placement
 * - Mobile-first: single-column, generous type, tappable targets
 * - All critical styles inline (Gmail iOS strips <style> blocks)
 *
 * @param {object} opts
 * @param {string} opts.content        — inner HTML (sections)
 * @param {string} [opts.previewText]  — hidden preview text shown in inbox
 * @param {string} [opts.userId]       — user ID for preference link (optional)
 * @param {string} [opts.ctaUrl]       — CTA button URL (defaults to maximussports.ai)
 * @param {string} [opts.ctaLabel]     — CTA button label (defaults to "Open Maximus Sports")
 */

const BG_OUTER  = '#f7f8fa';
const BG_BODY   = '#ffffff';
const BRAND     = '#0f2440';
const ACCENT    = '#2d6ca8';
const TEXT_PRIMARY   = '#1a1a2e';
const TEXT_SECONDARY = '#4a5568';
const TEXT_MUTED     = '#8a94a6';
const BORDER         = '#e8ecf0';

export function EmailShell({ content, previewText = '', userId = '', ctaUrl = '', ctaLabel = '' }) {
  const manageUrl = `https://maximussports.ai/settings${userId ? `?uid=${userId}` : ''}`;
  const year = new Date().getFullYear();
  const finalCtaUrl = ctaUrl || 'https://maximussports.ai';
  const finalCtaLabel = ctaLabel || 'Open Maximus Sports &rarr;';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
  <title>Maximus Sports</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&display=swap');

    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; line-height: 100%; outline: none; text-decoration: none; display: block; }
    body { margin: 0 !important; padding: 0 !important; background-color: ${BG_OUTER} !important; width: 100% !important; }
    a { color: ${ACCENT}; }
    * { box-sizing: border-box; }

    @media only screen and (max-width: 480px) {
      .email-outer-td   { padding: 0 !important; }
      .email-container  { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; border-left: none !important; border-right: none !important; }
      .shell-header-td  { padding: 16px 18px 14px !important; }
      .shell-wordmark   { font-size: 15px !important; }
      .shell-content-td { padding: 0 !important; }
      .hero-td          { padding: 18px 18px 14px !important; }
      .hero-date        { font-size: 11px !important; }
      .hero-h1          { font-size: 20px !important; line-height: 1.28 !important; }
      .intro-td         { padding: 0 18px 14px !important; }
      .section-td       { padding: 0 18px 12px !important; }
      .card-td          { padding: 14px 16px 13px !important; }
      .divider-td       { padding: 0 18px !important; }
      .cta-td           { padding: 14px 18px 20px !important; }
      .cta-link         { font-size: 15px !important; padding: 14px 20px !important; display: block !important; width: 100% !important; text-align: center !important; }
      .footer-td        { padding: 16px 18px 20px !important; }
      .row-pad          { padding: 10px 16px !important; }
      .game-card-td     { padding: 10px 16px !important; }
      .team-logo-cell   { width: 24px !important; padding-right: 7px !important; }
      .news-item        { font-size: 14px !important; padding: 10px 0 !important; line-height: 1.5 !important; }
      .video-card-td    { padding: 10px 16px !important; }
    }

    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
    }
  </style>
</head>
<body bgcolor="${BG_OUTER}" style="margin:0;padding:0;background-color:${BG_OUTER};font-family:'DM Sans',Arial,Helvetica,sans-serif;width:100%;min-width:100%;">

${previewText ? `<div style="display:none;font-size:1px;color:${BG_OUTER};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;" aria-hidden="true">${previewText}&nbsp;&zwnj;&hairsp;&zwnj;&hairsp;&zwnj;&hairsp;&zwnj;&hairsp;&zwnj;&hairsp;&zwnj;&hairsp;&zwnj;&hairsp;&zwnj;</div>` : ''}

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${BG_OUTER}"
       style="background-color:${BG_OUTER};width:100%;margin:0;padding:0;border-collapse:collapse;">
  <tr>
    <td align="center" valign="top" style="padding:20px 12px 28px;background-color:${BG_OUTER};" class="email-outer-td">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" bgcolor="${BG_BODY}"
             class="email-container"
             style="max-width:560px;width:100%;background-color:${BG_BODY};border-radius:8px;border:1px solid ${BORDER};border-collapse:collapse;">

        <!-- HEADER: clean brand bar -->
        <tr>
          <td style="padding:18px 24px 16px;border-bottom:2px solid ${BRAND};" class="shell-header-td">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td valign="middle">
                  <span class="shell-wordmark" style="font-size:16px;font-weight:800;color:${BRAND};letter-spacing:0.06em;text-transform:uppercase;font-family:'DM Sans',Arial,Helvetica,sans-serif;">MAXIMUS SPORTS</span>
                </td>
                <td align="right" valign="middle">
                  <a href="https://maximussports.ai" style="font-size:12px;color:${TEXT_MUTED};text-decoration:none;font-family:'DM Sans',Arial,Helvetica,sans-serif;">maximussports.ai</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CONTENT -->
        ${content}

        <!-- SPACER -->
        <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- DIVIDER -->
        <tr>
          <td style="padding:0 24px;" class="divider-td">
            <div style="height:1px;background-color:${BORDER};font-size:0;line-height:0;">&nbsp;</div>
          </td>
        </tr>

        <!-- CTA BUTTON -->
        <tr>
          <td style="padding:18px 24px 20px;" class="cta-td">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
              <tr>
                <td align="center" bgcolor="${ACCENT}" style="border-radius:6px;background-color:${ACCENT};">
                  <a href="${finalCtaUrl}" class="cta-link"
                     style="display:block;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 24px;text-align:center;letter-spacing:0.02em;font-family:'DM Sans',Arial,Helvetica,sans-serif;border-radius:6px;line-height:1.3;">
                    ${finalCtaLabel}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background-color:#f9fafb;border-top:1px solid ${BORDER};padding:16px 24px 20px;border-radius:0 0 8px 8px;" class="footer-td">
            <p style="margin:0 0 6px;font-size:12px;color:${TEXT_MUTED};line-height:1.5;text-align:center;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
              Not betting advice. Sports intelligence for informational purposes only.
            </p>
            <p style="margin:0 0 6px;font-size:12px;color:${TEXT_MUTED};text-align:center;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
              <a href="${manageUrl}" style="color:${ACCENT};text-decoration:underline;">Manage preferences</a>
              &nbsp;&middot;&nbsp;
              <a href="https://maximussports.ai" style="color:${ACCENT};text-decoration:underline;">maximussports.ai</a>
            </p>
            <p style="margin:0;font-size:11px;color:#b0b8c4;text-align:center;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
              &copy; ${year} Maximus Sports
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
}

/**
 * Hero block: date line + large editorial headline.
 */
export function heroBlock({ line, sublabel }) {
  return `
<tr>
  <td style="padding:24px 24px 6px;background-color:${BG_BODY};" class="hero-td">
    <p class="hero-date" style="margin:0 0 8px;font-size:12px;font-weight:600;color:${ACCENT};letter-spacing:0.06em;text-transform:uppercase;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.4;">${sublabel || ''}</p>
    <h1 class="hero-h1" style="margin:0;font-size:22px;font-weight:800;color:${TEXT_PRIMARY};line-height:1.28;letter-spacing:-0.02em;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${line}</h1>
  </td>
</tr>`;
}

/**
 * Inline section label — lightweight alternative to pill for editorial feel.
 */
export function sectionLabel(label) {
  return `<span style="display:inline-block;font-size:10px;font-weight:700;color:${ACCENT};letter-spacing:0.1em;text-transform:uppercase;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.5;">${label}</span>`;
}

/**
 * Inline colored pill badge — kept for backwards compat, but simplified.
 */
export function pill(label, type = 'intel') {
  return `<span style="display:inline-block;font-size:10px;font-weight:700;color:${ACCENT};letter-spacing:0.1em;text-transform:uppercase;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.5;">${label}</span>`;
}

/**
 * Section card: clean bordered card with label, optional headline, and body text.
 */
export function sectionCard({ pillLabel, pillType, headline, body }) {
  return `
<tr>
  <td style="padding:0 24px 12px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:#f9fafb;border:1px solid ${BORDER};border-radius:6px;border-collapse:collapse;">
      <tr>
        <td style="padding:16px 18px 14px;" class="card-td">
          <div style="margin-bottom:8px;">${sectionLabel(pillLabel)}</div>
          ${headline ? `<p style="margin:0 0 6px;font-size:15px;font-weight:700;color:${TEXT_PRIMARY};line-height:1.35;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${headline}</p>` : ''}
          <p style="margin:0;font-size:14px;color:${TEXT_SECONDARY};line-height:1.6;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${body}</p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

/**
 * Team logo <img> for email use (PNG for Gmail reliability).
 */
export function teamLogoImg(team, size = 22, baseUrl = 'https://maximussports.ai') {
  const slug = team?.slug;
  if (!slug) return `<span style="display:inline-block;width:${size}px;height:${size}px;background-color:#e8ecf0;border-radius:3px;vertical-align:middle;"></span>`;
  const src = `${baseUrl}/logos/${slug}.png`;
  const alt = team?.name || slug;
  return `<img src="${src}" alt="${alt}" width="${size}" height="${size}"
    style="width:${size}px;height:${size}px;min-width:${size}px;border-radius:3px;vertical-align:middle;display:inline-block;border:0;line-height:1;outline:none;" />`;
}

/**
 * Spacer row.
 */
export function spacerRow(px = 8) {
  return `<tr><td style="height:${px}px;font-size:0;line-height:0;" aria-hidden="true">&nbsp;</td></tr>`;
}

/**
 * Divider row — subtle horizontal rule.
 */
export function dividerRow() {
  return `
<tr>
  <td style="padding:4px 24px;" class="divider-td">
    <div style="height:1px;background-color:${BORDER};font-size:0;line-height:0;">&nbsp;</div>
  </td>
</tr>`;
}
