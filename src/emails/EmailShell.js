/**
 * EmailShell — wraps any email template content in the full Maximus Sports HTML frame.
 *
 * Rendering notes:
 *  - All critical styles are inline for Gmail/Outlook compatibility.
 *  - An embedded <style> block handles responsive overrides (Gmail iOS supports some).
 *  - Outer table is 100% fluid; inner container caps at 600px with mobile full-bleed.
 *  - At ≤480px: padding tightens, hero fonts shrink, CTA becomes full-width.
 *
 * @param {object} opts
 * @param {string} opts.content        — inner HTML content (hero + sections)
 * @param {string} [opts.previewText]  — hidden preview text shown in inbox
 * @param {string} [opts.userId]       — user ID for preference link (optional)
 */
export function EmailShell({ content, previewText = '', userId = '' }) {
  const manageUrl = `https://maximussports.ai/settings${userId ? `?uid=${userId}` : ''}`;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
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
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');

    /* Base resets */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; background-color: #090d18; width: 100% !important; }
    a { color: #5a9fd4; }

    /* ── Mobile breakpoint (≤480px) ── */
    @media only screen and (max-width: 480px) {
      /* Outer wrapper: zero padding so email bleeds edge-to-edge */
      .email-wrapper { padding: 0 !important; }

      /* Container: full-width, no rounded corners on mobile */
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
        border-radius: 0 !important;
        border-left: 0 !important;
        border-right: 0 !important;
      }

      /* Tighter section padding */
      .section-pad { padding: 16px 16px !important; }
      .hero-pad    { padding: 22px 16px 18px !important; }
      .footer-pad  { padding: 16px 16px !important; }
      .row-pad     { padding: 8px 16px !important; }

      /* Hero h1 — shrink from 24px → 20px */
      .hero-h1 { font-size: 20px !important; line-height: 1.3 !important; }

      /* CTA button — full width on mobile */
      .btn-cta {
        display: block !important;
        width: 100% !important;
        text-align: center !important;
        box-sizing: border-box !important;
      }

      /* Card inner padding */
      .card-inner { padding: 14px 14px !important; }

      /* Team logo: keep compact */
      .team-logo { width: 20px !important; height: 20px !important; }

      /* Text scale */
      .text-sm  { font-size: 11px !important; }
      .text-md  { font-size: 12px !important; }
      .text-lg  { font-size: 14px !important; }
    }

    /* Wider mobile (481–620px) */
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
      .section-pad { padding: 18px 18px !important; }
      .hero-pad    { padding: 26px 18px 20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#090d18;font-family:'DM Sans',Arial,sans-serif;width:100%;">

${previewText ? `<!-- Preview text (hidden) -->
<div style="display:none;font-size:1px;color:#090d18;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${previewText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ''}

<!-- Outer wrapper: 100% fluid background -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background-color:#090d18;width:100%;margin:0;padding:0;" class="email-wrapper">
  <tr>
    <td align="center" style="padding:20px 12px 28px;" class="email-wrapper">

      <!-- Inner container: max 600px -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"
             width="600" class="email-container"
             style="max-width:600px;width:100%;background-color:#0d1220;border-radius:12px;border:1px solid rgba(255,255,255,0.07);overflow:hidden;">

        <!-- ── HEADER ── -->
        <tr>
          <td style="background:linear-gradient(135deg,#0d1220 0%,#111827 100%);border-bottom:1px solid rgba(255,255,255,0.07);padding:22px 28px 18px;" class="section-pad">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td valign="middle">
                  <div style="display:inline-block;background:linear-gradient(135deg,#3C79B4,#5a9fd4);padding:2px 10px 3px;border-radius:4px;margin-bottom:7px;">
                    <span style="font-size:10px;font-weight:700;letter-spacing:0.12em;color:#ffffff;text-transform:uppercase;font-family:'DM Sans',Arial,sans-serif;">Intelligence</span>
                  </div>
                  <div>
                    <span style="font-size:21px;font-weight:800;color:#f0f4f8;letter-spacing:-0.02em;font-family:'DM Sans',Arial,sans-serif;">MAXIMUS SPORTS</span>
                  </div>
                  <div style="margin-top:3px;">
                    <span style="font-size:11px;font-weight:500;color:#6b7f99;font-family:'DM Sans',Arial,sans-serif;">Maximus Sports. Maximum intelligence.</span>
                  </div>
                </td>
                <td align="right" valign="top">
                  <a href="https://maximussports.ai" style="font-size:11px;color:#5a9fd4;text-decoration:none;font-weight:600;letter-spacing:0.04em;white-space:nowrap;font-family:'DM Sans',Arial,sans-serif;">maximussports.ai</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── CONTENT (injected by template) ── -->
        ${content}

        <!-- ── DIVIDER ── -->
        <tr>
          <td style="padding:0 28px;" class="section-pad">
            <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent);"></div>
          </td>
        </tr>

        <!-- ── CTA BUTTON ── -->
        <tr>
          <td align="center" style="padding:20px 28px 24px;" class="section-pad">
            <!--[if mso]><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><![endif]-->
            <a href="https://maximussports.ai"
               style="display:inline-block;background:linear-gradient(135deg,#3C79B4,#2d6ca8);color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 36px;border-radius:8px;letter-spacing:0.03em;font-family:'DM Sans',Arial,sans-serif;mso-padding-alt:13px 36px;"
               class="btn-cta">
              Open Maximus &rarr;
            </a>
            <!--[if mso]></td></tr></table><![endif]-->
          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td style="background:#080c16;border-top:1px solid rgba(255,255,255,0.06);padding:18px 28px 22px;" class="footer-pad">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center">
                  <p style="margin:0 0 7px;font-size:11px;color:#3d4f63;line-height:1.6;font-family:'DM Sans',Arial,sans-serif;">
                    Not betting advice. Maximus Sports provides sports intelligence for informational purposes only.
                  </p>
                  <p style="margin:0 0 7px;font-size:11px;color:#3d4f63;font-family:'DM Sans',Arial,sans-serif;">
                    <a href="${manageUrl}" style="color:#4a7fa8;text-decoration:underline;">Manage preferences</a>
                    &nbsp;&middot;&nbsp;
                    <a href="https://maximussports.ai" style="color:#4a7fa8;text-decoration:underline;">maximussports.ai</a>
                  </p>
                  <p style="margin:0;font-size:10px;color:#2d3d4f;font-family:'DM Sans',Arial,sans-serif;">
                    &copy; ${year} Maximus Sports &middot; winning@maximussports.ai
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
      <!-- /Inner container -->

    </td>
  </tr>
</table>

</body>
</html>`;
}

/**
 * Renders an inline pill badge for email templates.
 * @param {string} label
 * @param {'ats'|'upset'|'watch'|'intel'|'headlines'|'news'|'alert'} type
 */
export function pill(label, type = 'intel') {
  const colors = {
    ats:       { bg: '#1a3a5c', border: '#3C79B4', text: '#5a9fd4' },
    upset:     { bg: '#3a2a10', border: '#e8c96d', text: '#e8c96d' },
    watch:     { bg: '#0f2e1e', border: '#3d9c74', text: '#3d9c74' },
    intel:     { bg: '#231a3d', border: '#8764c8', text: '#a98ae8' },
    headlines: { bg: '#2d1a0f', border: '#e06c3a', text: '#e88c5a' },
    news:      { bg: '#2d1a0f', border: '#e06c3a', text: '#e88c5a' },
    alert:     { bg: '#1a0f0f', border: '#c44f3a', text: '#e05a3a' },
  };
  const c = colors[type] || colors.intel;
  return `<span style="display:inline-block;background:${c.bg};border:1px solid ${c.border};color:${c.text};font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding:3px 8px;border-radius:4px;font-family:'DM Sans',Arial,sans-serif;">${label}</span>`;
}

/**
 * Renders a section card block inside an email.
 */
export function sectionCard({ pillLabel, pillType, headline, body }) {
  return `
<tr>
  <td style="padding:0 28px 14px;" class="section-pad">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background:#111827;border:1px solid rgba(255,255,255,0.07);border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px 18px 14px;" class="card-inner">
          <div style="margin-bottom:8px;">${pill(pillLabel, pillType)}</div>
          ${headline ? `<p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#f0f4f8;line-height:1.4;font-family:'DM Sans',Arial,sans-serif;" class="text-lg">${headline}</p>` : ''}
          <p style="margin:0;font-size:13px;color:#8892a4;line-height:1.65;font-family:'DM Sans',Arial,sans-serif;" class="text-md">${body}</p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

/**
 * Renders the hero block of an email.
 * The h1 uses class="hero-h1" for mobile font-size override.
 */
export function heroBlock({ line, sublabel }) {
  return `
<tr>
  <td style="padding:28px 28px 20px;background:linear-gradient(180deg,#0f1828 0%,#0d1220 100%);" class="hero-pad">
    <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#4a7fa8;letter-spacing:0.1em;text-transform:uppercase;font-family:'DM Sans',Arial,sans-serif;" class="text-sm">${sublabel || 'Maximus Intelligence'}</p>
    <h1 style="margin:0;font-size:24px;font-weight:800;color:#f0f4f8;line-height:1.25;letter-spacing:-0.02em;font-family:'DM Sans',Arial,sans-serif;" class="hero-h1">${line}</h1>
  </td>
</tr>`;
}

/**
 * Renders a team logo <img> suitable for use inside email table cells.
 * Falls back gracefully if no logo path is available.
 *
 * @param {{ slug?: string, logo?: string, name?: string }} team
 * @param {number} [size=22]
 * @param {string} [baseUrl='https://maximussports.ai']
 * @returns {string}
 */
export function teamLogoImg(team, size = 22, baseUrl = 'https://maximussports.ai') {
  const path = team?.logo || (team?.slug ? `/logos/${team.slug}.svg` : null);
  if (!path) return '';
  const src = path.startsWith('http') ? path : `${baseUrl}${path}`;
  const alt = team?.name || '';
  return `<img src="${src}" alt="${alt}" width="${size}" height="${size}"
    style="width:${size}px;height:${size}px;border-radius:3px;vertical-align:middle;display:inline-block;border:0;"
    class="team-logo" />`;
}
