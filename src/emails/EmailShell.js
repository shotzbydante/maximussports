/**
 * EmailShell — wraps any email template content in the full Maximus Sports HTML frame.
 *
 * Gmail iOS rendering strategy:
 *  - Gmail iOS STRIPS <style> blocks in some versions; class-based CSS is unreliable.
 *  - Critical layout values are set as INLINE style= attributes (desktop values).
 *  - <style> media queries provide ADDITIVE overrides on clients that support them.
 *  - CTA uses a table-based button (full-width natively, no media-query needed).
 *  - Team logos use PNG (not SVG) — Gmail iOS proxy has unreliable SVG support.
 *  - width/height HTML attributes are always set alongside CSS.
 *
 * @param {object} opts
 * @param {string} opts.content        — inner HTML (hero + sections)
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

    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; background-color: #090d18; width: 100% !important; }
    a { color: #5a9fd4; }

    /* ── Mobile ≤480px — supplemental overrides (inline styles hold desktop baseline) */
    @media only screen and (max-width: 480px) {
      .email-outer-td  { padding: 0 !important; }
      .email-container { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; border-left: 0 !important; border-right: 0 !important; }
      .hero-td         { padding: 20px 16px 16px !important; }
      .hero-h1         { font-size: 20px !important; line-height: 1.28 !important; }
      .hero-date       { font-size: 10px !important; }
      .section-td      { padding: 0 12px 12px !important; }
      .card-td         { padding: 14px 14px !important; }
      .divider-td      { padding: 0 12px !important; }
      .cta-td          { padding: 16px 12px 20px !important; }
      .footer-td       { padding: 14px 16px 18px !important; }
      .header-td       { padding: 18px 16px 14px !important; }
      .row-pad         { padding: 8px 12px !important; }
    }

    /* ── Tablet 481–620px */
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#090d18;font-family:'DM Sans',Arial,sans-serif;width:100%;min-width:100%;">

${previewText ? `<!-- Preview -->
<div style="display:none;font-size:1px;color:#090d18;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${previewText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ''}

<!-- Outer wrapper -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background-color:#090d18;width:100%;margin:0;padding:0;border-collapse:collapse;">
  <tr>
    <td align="center" style="padding:20px 12px 28px;" class="email-outer-td">

      <!-- Container: 600px max, full-width on mobile -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
             class="email-container"
             style="max-width:600px;width:100%;background-color:#0d1220;border-radius:12px;border:1px solid rgba(255,255,255,0.07);border-collapse:collapse;">

        <!-- ── HEADER ── -->
        <tr>
          <td style="background:linear-gradient(135deg,#0d1220 0%,#111827 100%);border-bottom:1px solid rgba(255,255,255,0.07);padding:20px 28px 16px;" class="header-td">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td valign="middle">
                  <!-- Intelligence badge -->
                  <div style="display:inline-block;background:linear-gradient(135deg,#3C79B4,#5a9fd4);padding:2px 9px 3px;border-radius:4px;margin-bottom:7px;">
                    <span style="font-size:10px;font-weight:700;letter-spacing:0.12em;color:#ffffff;text-transform:uppercase;font-family:'DM Sans',Arial,sans-serif;">Intelligence</span>
                  </div>
                  <div>
                    <span style="font-size:20px;font-weight:800;color:#f0f4f8;letter-spacing:-0.02em;font-family:'DM Sans',Arial,sans-serif;line-height:1.2;">MAXIMUS SPORTS</span>
                  </div>
                  <div style="margin-top:3px;">
                    <span style="font-size:11px;font-weight:500;color:#6b7f99;font-family:'DM Sans',Arial,sans-serif;">Maximus Sports. Maximum intelligence.</span>
                  </div>
                </td>
                <td align="right" valign="top" style="padding-left:8px;">
                  <a href="https://maximussports.ai" style="font-size:11px;color:#5a9fd4;text-decoration:none;font-weight:600;white-space:nowrap;font-family:'DM Sans',Arial,sans-serif;">maximussports.ai</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── CONTENT ── -->
        ${content}

        <!-- ── DIVIDER ── -->
        <tr>
          <td style="padding:0 28px;" class="divider-td">
            <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent);font-size:0;line-height:0;">&nbsp;</div>
          </td>
        </tr>

        <!-- ── CTA BUTTON (table-based = full-width natively, no media query needed) ── -->
        <tr>
          <td style="padding:20px 28px 24px;" class="cta-td">
            <!--[if mso]><table cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center" bgcolor="#3466a5" style="border-radius:8px;"><![endif]-->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
              <tr>
                <td align="center"
                    bgcolor="#3466a5"
                    style="border-radius:8px;background:linear-gradient(135deg,#3C79B4 0%,#2d6ca8 100%);mso-padding-alt:0;">
                  <a href="https://maximussports.ai"
                     style="display:block;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 24px;text-align:center;letter-spacing:0.02em;font-family:'DM Sans',Arial,sans-serif;border-radius:8px;-webkit-text-size-adjust:none;">
                    Open Maximus Sports &rarr;
                  </a>
                </td>
              </tr>
            </table>
            <!--[if mso]></td></tr></table><![endif]-->
          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td style="background:#080c16;border-top:1px solid rgba(255,255,255,0.06);padding:16px 28px 20px;" class="footer-td">
            <p style="margin:0 0 6px;font-size:11px;color:#3d4f63;line-height:1.6;text-align:center;font-family:'DM Sans',Arial,sans-serif;">
              Not betting advice. Maximus Sports provides sports intelligence for informational purposes only.
            </p>
            <p style="margin:0 0 6px;font-size:11px;color:#3d4f63;text-align:center;font-family:'DM Sans',Arial,sans-serif;">
              <a href="${manageUrl}" style="color:#4a7fa8;text-decoration:underline;">Manage preferences</a>
              &nbsp;&middot;&nbsp;
              <a href="https://maximussports.ai" style="color:#4a7fa8;text-decoration:underline;">maximussports.ai</a>
            </p>
            <p style="margin:0;font-size:10px;color:#2d3d4f;text-align:center;font-family:'DM Sans',Arial,sans-serif;">
              &copy; ${year} Maximus Sports &middot; winning@maximussports.ai
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
 * Inline colored pill badge.
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
  return `<span style="display:inline-block;background:${c.bg};border:1px solid ${c.border};color:${c.text};font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding:3px 8px;border-radius:4px;font-family:'DM Sans',Arial,sans-serif;line-height:1.4;">${label}</span>`;
}

/**
 * Section card: dark rounded card with pill label, optional headline, and body text.
 */
export function sectionCard({ pillLabel, pillType, headline, body }) {
  return `
<tr>
  <td style="padding:0 28px 12px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background:#111827;border:1px solid rgba(255,255,255,0.07);border-radius:8px;border-collapse:collapse;">
      <tr>
        <td style="padding:16px 18px 14px;" class="card-td">
          <div style="margin-bottom:8px;">${pill(pillLabel, pillType)}</div>
          ${headline ? `<p style="margin:0 0 7px;font-size:14px;font-weight:700;color:#f0f4f8;line-height:1.4;font-family:'DM Sans',Arial,sans-serif;">${headline}</p>` : ''}
          <p style="margin:0;font-size:13px;color:#8892a4;line-height:1.65;font-family:'DM Sans',Arial,sans-serif;">${body}</p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

/**
 * Hero block: date label + large headline.
 * hero-h1 class enables mobile font-size override where CSS is respected.
 */
export function heroBlock({ line, sublabel }) {
  return `
<tr>
  <td style="padding:26px 28px 18px;background:linear-gradient(180deg,#0f1828 0%,#0d1220 100%);" class="hero-td">
    <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#4a7fa8;letter-spacing:0.1em;text-transform:uppercase;font-family:'DM Sans',Arial,sans-serif;" class="hero-date">${sublabel || 'Maximus Intelligence'}</p>
    <h1 style="margin:0;font-size:24px;font-weight:800;color:#f0f4f8;line-height:1.25;letter-spacing:-0.02em;font-family:'DM Sans',Arial,sans-serif;" class="hero-h1">${line}</h1>
  </td>
</tr>`;
}

/**
 * Team logo <img> for email use.
 *
 * Uses PNG (not SVG) for Gmail iOS reliability.
 * Sets both HTML width/height attributes AND inline style dimensions.
 * line-height:1 / vertical-align:middle prevents Gmail iOS from adding extra spacing.
 *
 * @param {{ slug?: string, name?: string }} team
 * @param {number} [size=22]
 * @param {string} [baseUrl='https://maximussports.ai']
 * @returns {string}
 */
export function teamLogoImg(team, size = 22, baseUrl = 'https://maximussports.ai') {
  const slug = team?.slug;
  if (!slug) return '';
  // PNG primary — better Gmail iOS support
  const src = `${baseUrl}/logos/${slug}.png`;
  const alt = team?.name || '';
  return `<img src="${src}" alt="${alt}" width="${size}" height="${size}"
    style="width:${size}px;height:${size}px;min-width:${size}px;border-radius:3px;vertical-align:middle;display:inline-block;border:0;line-height:1;outline:none;" />`;
}
