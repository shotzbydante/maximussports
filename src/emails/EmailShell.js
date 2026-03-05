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
 *  - All td padding is explicit inline — never rely on class-only padding for layout.
 *  - No negative margins, no flexbox, no CSS grid — table layout only.
 *  - Font stack: DM Sans → Arial → sans-serif, always explicitly stated.
 *
 * @param {object} opts
 * @param {string} opts.content        — inner HTML (hero + sections)
 * @param {string} [opts.previewText]  — hidden preview text shown in inbox
 * @param {string} [opts.userId]       — user ID for preference link (optional)
 * @param {string} [opts.ctaUrl]       — CTA button URL (defaults to maximussports.ai)
 * @param {string} [opts.ctaLabel]     — CTA button label (defaults to "Open Maximus Sports →")
 */
export function EmailShell({ content, previewText = '', userId = '', ctaUrl = '', ctaLabel = '' }) {
  const manageUrl = `https://maximussports.ai/settings${userId ? `?uid=${userId}` : ''}`;
  const year = new Date().getFullYear();
  const finalCtaUrl = ctaUrl || 'https://maximussports.ai';
  const finalCtaLabel = ctaLabel || 'Open Maximus Sports &rarr;';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
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

    /* ── Reset ── */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; line-height: 100%; outline: none; text-decoration: none; display: block; }
    body { margin: 0 !important; padding: 0 !important; background-color: #090d18 !important; width: 100% !important; min-width: 100% !important; }
    a { color: #5a9fd4; }
    * { box-sizing: border-box; }

    /* ── Prevent iOS Mail / Apple Mail from auto-inverting dark-mode emails ── */
    :root { color-scheme: dark; }
    [data-ogsc] body, [data-ogsb] body { background-color: #090d18 !important; }
    u + .email-outer-bg { background-color: #090d18 !important; }
    #MessageViewBody a { color: #5a9fd4; }

    /* ── Mobile ≤480px — supplemental overrides (inline styles hold desktop baseline) ──
       Gmail iOS may strip these; all critical values are also set inline.
       These are additive polish only. Hierarchy mirrors desktop but compact. */
    @media only screen and (max-width: 480px) {
      .email-outer-td   { padding: 0 !important; }
      .email-container  { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; border-left: none !important; border-right: none !important; }
      /* Header: keep same hierarchy (logo → wordmark → tagline), just tighter */
      .header-td        { padding: 12px 16px 10px !important; }
      .header-wordmark  { font-size: 17px !important; letter-spacing: -0.02em !important; }
      /* Show tagline on mobile at smaller size — preserve desktop hierarchy */
      .header-tagline   { display: block !important; margin-top: 2px !important; }
      .header-tagline span { font-size: 10px !important; color: #475e72 !important; }
      /* Hero */
      .hero-td          { padding: 16px 16px 12px !important; }
      .hero-eyebrow     { font-size: 10px !important; letter-spacing: 0.08em !important; margin-bottom: 4px !important; }
      .hero-h1          { font-size: 19px !important; line-height: 1.25 !important; letter-spacing: -0.015em !important; }
      /* Cards */
      .section-td       { padding: 0 12px 10px !important; }
      .card-td          { padding: 12px 14px 11px !important; }
      .card-headline    { font-size: 13px !important; line-height: 1.35 !important; }
      .card-body        { font-size: 12px !important; line-height: 1.55 !important; }
      /* Layout helpers */
      .divider-td       { padding: 0 12px !important; }
      .cta-td           { padding: 12px 12px 18px !important; }
      .cta-link         { font-size: 14px !important; padding: 13px 16px !important; display: block !important; width: 100% !important; box-sizing: border-box !important; }
      /* Footer */
      .footer-td        { padding: 12px 16px 16px !important; }
      .footer-text      { font-size: 11px !important; line-height: 1.5 !important; }
      /* Game cards & team logos */
      .row-pad          { padding: 7px 14px !important; }
      .game-card-td     { padding: 9px 14px !important; }
      .team-logo-cell   { width: 24px !important; padding-right: 7px !important; }
      /* News & video */
      .news-item        { font-size: 12px !important; padding: 6px 0 !important; }
      .video-card-td    { padding: 9px 14px !important; }
    }

    /* ── Tablet 481–620px ── */
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
    }

    /* ── Dark mode: preserve dark surfaces across all clients ── */
    @media (prefers-color-scheme: dark) {
      .email-outer-bg  { background-color: #090d18 !important; }
      .email-container { background-color: #0d1220 !important; }
      .email-card-dark { background-color: #0f1825 !important; }
    }
  </style>
</head>
<body bgcolor="#090d18" style="margin:0;padding:0;background-color:#090d18;font-family:'DM Sans',Arial,Helvetica,sans-serif;width:100%;min-width:100%;" class="email-outer-bg">

${previewText ? `<!-- Preview text (hidden in inbox, visible in notifications) -->
<div style="display:none;font-size:1px;color:#090d18;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;" aria-hidden="true">${previewText}&nbsp;&zwnj;&hairsp;&zwnj;&hairsp;&zwnj;&hairsp;&zwnj;&hairsp;&zwnj;&hairsp;&zwnj;&hairsp;&zwnj;&hairsp;&zwnj;&hairsp;&zwnj;&hairsp;&zwnj;&hairsp;&zwnj;</div>` : ''}

<!-- ═══ OUTER WRAPPER ═══ -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#090d18"
       style="background-color:#090d18;width:100%;margin:0;padding:0;border-collapse:collapse;">
  <tr>
    <td align="center" valign="top" bgcolor="#090d18" style="padding:16px 8px 24px;background-color:#090d18;" class="email-outer-td">

      <!-- ═══ CONTAINER (600px desktop / 100% mobile) ═══ -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="#0d1220"
             class="email-container"
             style="max-width:600px;width:100%;background-color:#0d1220;border-radius:10px;border:1px solid rgba(255,255,255,0.08);border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">

        <!-- ── HEADER ── -->
        <tr>
          <td bgcolor="#0f1828" style="background:linear-gradient(160deg,#0f1828 0%,#0d1220 100%);border-bottom:1px solid rgba(255,255,255,0.07);padding:18px 24px 14px;border-radius:10px 10px 0 0;" class="header-td">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td valign="middle">
                  <!-- Intelligence badge -->
                  <div style="display:inline-block;background:linear-gradient(135deg,#2d6ca8,#5a9fd4);padding:2px 8px 3px;border-radius:3px;margin-bottom:6px;line-height:1;">
                    <span style="font-size:9px;font-weight:700;letter-spacing:0.14em;color:#ffffff;text-transform:uppercase;font-family:'DM Sans',Arial,Helvetica,sans-serif;">Intelligence</span>
                  </div>
                  <div style="line-height:1.2;">
                    <span class="header-wordmark" style="font-size:20px;font-weight:800;color:#f0f4f8;letter-spacing:-0.025em;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.15;">MAXIMUS SPORTS</span>
                  </div>
                  <div style="margin-top:2px;" class="header-tagline">
                    <span style="font-size:11px;font-weight:400;color:#526070;font-family:'DM Sans',Arial,Helvetica,sans-serif;letter-spacing:0.01em;">Maximus Sports. Maximum intelligence.</span>
                  </div>
                </td>
                <td align="right" valign="top" style="padding-left:12px;white-space:nowrap;">
                  <a href="https://maximussports.ai" style="font-size:11px;color:#4a8fc0;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,Helvetica,sans-serif;letter-spacing:0.01em;">maximussports.ai</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── CONTENT ── -->
        ${content}

        <!-- ── SPACER ── -->
        <tr>
          <td style="height:4px;font-size:0;line-height:0;">&nbsp;</td>
        </tr>

        <!-- ── DIVIDER ── -->
        <tr>
          <td style="padding:0 24px;" class="divider-td">
            <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.07),transparent);font-size:0;line-height:0;">&nbsp;</div>
          </td>
        </tr>

        <!-- ── CTA BUTTON ── -->
        <tr>
          <td style="padding:18px 24px 22px;" class="cta-td">
            <!--[if mso]><table cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center" bgcolor="#2d6ca8" style="border-radius:7px;"><![endif]-->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
              <tr>
                <td align="center"
                    bgcolor="#2d6ca8"
                    style="border-radius:7px;background:linear-gradient(135deg,#3C79B4 0%,#2660a0 100%);mso-padding-alt:0;">
                  <a href="${finalCtaUrl}"
                     class="cta-link"
                     style="display:block;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:13px 24px;text-align:center;letter-spacing:0.02em;font-family:'DM Sans',Arial,Helvetica,sans-serif;border-radius:7px;-webkit-text-size-adjust:none;line-height:1.3;">
                    ${finalCtaLabel}
                  </a>
                </td>
              </tr>
            </table>
            <!--[if mso]></td></tr></table><![endif]-->
          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td bgcolor="#07090f" style="background:#07090f;border-top:1px solid rgba(255,255,255,0.06);padding:13px 24px 18px;border-radius:0 0 10px 10px;" class="footer-td">
            <p class="footer-text" style="margin:0 0 5px;font-size:11px;color:#374555;line-height:1.55;text-align:center;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
              Not betting advice. Maximus Sports provides sports intelligence for informational purposes only.
            </p>
            <p class="footer-text" style="margin:0 0 5px;font-size:11px;color:#374555;text-align:center;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
              <a href="${manageUrl}" style="color:#3d6e90;text-decoration:underline;font-family:'DM Sans',Arial,Helvetica,sans-serif;">Manage preferences</a>
              &nbsp;&middot;&nbsp;
              <a href="https://maximussports.ai" style="color:#3d6e90;text-decoration:underline;font-family:'DM Sans',Arial,Helvetica,sans-serif;">maximussports.ai</a>
            </p>
            <p style="margin:0;font-size:10px;color:#263040;text-align:center;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
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
 * @param {'ats'|'upset'|'watch'|'intel'|'headlines'|'news'|'alert'|'team'|'video'} type
 */
export function pill(label, type = 'intel') {
  const colors = {
    ats:       { bg: '#0f2540', border: '#2d6ca8', text: '#5a9fd4' },
    upset:     { bg: '#2e1e06', border: '#c8a84e', text: '#d4b05a' },
    watch:     { bg: '#0a2418', border: '#2d8060', text: '#3aaa7a' },
    intel:     { bg: '#1c1430', border: '#6e4db0', text: '#9b77e0' },
    headlines: { bg: '#231208', border: '#c05a28', text: '#d87840' },
    news:      { bg: '#231208', border: '#c05a28', text: '#d87840' },
    alert:     { bg: '#180a0a', border: '#a83828', text: '#cc4830' },
    team:      { bg: '#0a1f30', border: '#2d6ca8', text: '#5ab4e8' },
    video:     { bg: '#1a0e20', border: '#7840a0', text: '#a060d0' },
  };
  const c = colors[type] || colors.intel;
  return `<span style="display:inline-block;background:${c.bg};border:1px solid ${c.border};color:${c.text};font-size:9px;font-weight:700;letter-spacing:0.11em;text-transform:uppercase;padding:3px 8px 3px;border-radius:3px;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.5;white-space:nowrap;vertical-align:middle;">${label}</span>`;
}

/**
 * Section card: dark rounded card with pill label, optional headline, and body text.
 * Padding is set both inline (desktop baseline) and via class (mobile override).
 */
export function sectionCard({ pillLabel, pillType, headline, body }) {
  return `
<tr>
  <td style="padding:0 24px 10px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#0f1825"
           style="background:#0f1825;border:1px solid rgba(255,255,255,0.09);border-radius:8px;border-collapse:collapse;"
           class="email-card-dark">
      <tr>
        <td bgcolor="#0f1825" style="padding:15px 17px 13px;background:#0f1825;" class="card-td">
          <div style="margin-bottom:9px;">${pill(pillLabel, pillType)}</div>
          ${headline ? `<p class="card-headline" style="margin:0 0 7px;font-size:14px;font-weight:700;color:#e8edf5;line-height:1.35;font-family:'DM Sans',Arial,Helvetica,sans-serif;letter-spacing:-0.01em;">${headline}</p>` : ''}
          <p class="card-body" style="margin:0;font-size:13px;color:#7d8fa0;line-height:1.6;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${body}</p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

/**
 * Hero block: eyebrow label + large headline.
 *
 * Inline styles hold the desktop baseline. Class names allow media-query overrides
 * on clients that honour <style> blocks (Apple Mail, some Android Gmail).
 */
export function heroBlock({ line, sublabel }) {
  return `
<tr>
  <td bgcolor="#101c2c" style="padding:22px 24px 16px;background:linear-gradient(180deg,#101c2c 0%,#0d1422 100%);" class="hero-td">
    <p class="hero-eyebrow" style="margin:0 0 7px;font-size:10px;font-weight:600;color:#3d7aaa;letter-spacing:0.1em;text-transform:uppercase;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.4;">${sublabel || 'Maximus Intelligence'}</p>
    <h1 class="hero-h1" style="margin:0;font-size:23px;font-weight:800;color:#edf2f8;line-height:1.22;letter-spacing:-0.02em;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${line}</h1>
  </td>
</tr>`;
}

/**
 * Team logo <img> for email use.
 *
 * Uses PNG (not SVG) for Gmail iOS reliability.
 * Sets both HTML width/height attributes AND inline style dimensions.
 * line-height:1 / vertical-align:middle prevents Gmail iOS from adding extra spacing.
 * display:block inside a dedicated td prevents spacing artifacts.
 *
 * @param {{ slug?: string, name?: string }} team
 * @param {number} [size=22]
 * @param {string} [baseUrl='https://maximussports.ai']
 * @returns {string}
 */
export function teamLogoImg(team, size = 22, baseUrl = 'https://maximussports.ai') {
  const slug = team?.slug;
  if (!slug) return `<span style="display:inline-block;width:${size}px;height:${size}px;background:rgba(255,255,255,0.06);border-radius:3px;vertical-align:middle;"></span>`;
  const src = `${baseUrl}/logos/${slug}.png`;
  const alt = team?.name || slug;
  return `<img src="${src}" alt="${alt}" width="${size}" height="${size}"
    style="width:${size}px;height:${size}px;min-width:${size}px;border-radius:3px;vertical-align:middle;display:inline-block;border:0;line-height:1;outline:none;-ms-interpolation-mode:bicubic;" />`;
}

/**
 * Spacer row — adds consistent vertical breathing room between sections.
 * @param {number} [px=8]
 */
export function spacerRow(px = 8) {
  return `<tr><td style="height:${px}px;font-size:0;line-height:0;" aria-hidden="true">&nbsp;</td></tr>`;
}

/**
 * Divider row — subtle horizontal rule between sections.
 */
export function dividerRow() {
  return `
<tr>
  <td style="padding:2px 24px 2px;" class="divider-td">
    <div style="height:1px;background:rgba(255,255,255,0.06);font-size:0;line-height:0;">&nbsp;</div>
  </td>
</tr>`;
}
