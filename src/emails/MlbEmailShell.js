/**
 * MlbEmailShell — MLB-branded email wrapper.
 *
 * Design: dark navy body, deep red accents, glassmorphism cards.
 * Premium editorial feel — The Athletic meets Bloomberg Terminal.
 *
 * All critical styles inline (Gmail strips <style> blocks).
 * Solid backgrounds only (Gmail strips gradients).
 */

const BG_OUTER  = '#0a0e1a';
const BG_BODY   = '#111827';
const BG_CARD   = '#1a2236';
const BRAND_RED = '#c41e3a';
const ACCENT    = '#e8364f';
const GOLD      = '#d4a843';
const TEXT_PRIMARY   = '#f0f4f8';
const TEXT_SECONDARY = '#94a3b8';
const TEXT_MUTED     = '#64748b';
const BORDER         = 'rgba(196,30,58,0.18)';
const BORDER_SOLID   = '#2a1520';
const GLOW_BORDER    = '#3a1525';

export function MlbEmailShell({ content, previewText = '', userId = '', ctaUrl = '', ctaLabel = '' }) {
  const manageUrl = `https://maximussports.ai/settings${userId ? `?uid=${userId}` : ''}`;
  const year = new Date().getFullYear();
  const finalCtaUrl = ctaUrl || 'https://maximussports.ai/mlb';
  const finalCtaLabel = ctaLabel || 'Open MLB Intelligence &rarr;';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
  <title>Maximus Sports — MLB</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
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
      .shell-wordmark   { font-size: 14px !important; }
      .shell-content-td { padding: 0 !important; }
      .hero-td          { padding: 18px 18px 14px !important; }
      .hero-h1          { font-size: 20px !important; line-height: 1.28 !important; }
      .intro-td         { padding: 0 18px 14px !important; }
      .section-td       { padding: 0 18px 12px !important; }
      .card-td          { padding: 14px 16px 13px !important; }
      .divider-td       { padding: 0 18px !important; }
      .cta-td           { padding: 14px 18px 20px !important; }
      .cta-link         { font-size: 15px !important; padding: 14px 20px !important; display: block !important; width: 100% !important; text-align: center !important; }
      .footer-td        { padding: 16px 18px 20px !important; }
      .section-header   { font-size: 13px !important; }
      .news-item        { font-size: 14px !important; padding: 10px 0 !important; line-height: 1.5 !important; }
    }

    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
    }
  </style>
</head>
<body bgcolor="${BG_OUTER}" style="margin:0;padding:0;background-color:${BG_OUTER};font-family:'DM Sans',Arial,Helvetica,sans-serif;width:100%;min-width:100%;">

${previewText ? `<div style="display:none;font-size:1px;color:${BG_OUTER};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;" aria-hidden="true">${previewText}&nbsp;&zwnj;&hairsp;&zwnj;&hairsp;&zwnj;&hairsp;&zwnj;&hairsp;</div>` : ''}

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${BG_OUTER}"
       style="background-color:${BG_OUTER};width:100%;margin:0;padding:0;border-collapse:collapse;">
  <tr>
    <td align="center" valign="top" style="padding:20px 12px 28px;background-color:${BG_OUTER};" class="email-outer-td">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" bgcolor="${BG_BODY}"
             class="email-container"
             style="max-width:560px;width:100%;background-color:${BG_BODY};border-radius:10px;border:1px solid ${GLOW_BORDER};border-collapse:collapse;">

        <!-- HEADER: MLB brand bar -->
        <tr>
          <td style="padding:18px 24px 16px;border-bottom:2px solid ${BRAND_RED};" class="shell-header-td">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td valign="middle">
                  <span class="shell-wordmark" style="font-size:16px;font-weight:800;color:${TEXT_PRIMARY};letter-spacing:0.06em;text-transform:uppercase;font-family:'DM Sans',Arial,Helvetica,sans-serif;">MAXIMUS SPORTS</span>
                  <span style="font-size:11px;font-weight:700;color:${BRAND_RED};letter-spacing:0.08em;text-transform:uppercase;font-family:'DM Sans',Arial,sans-serif;margin-left:8px;">MLB</span>
                </td>
                <td align="right" valign="middle">
                  <a href="https://maximussports.ai/mlb" style="font-size:12px;color:${TEXT_MUTED};text-decoration:none;font-family:'DM Sans',Arial,Helvetica,sans-serif;">maximussports.ai</a>
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
            <div style="height:1px;background-color:${BORDER_SOLID};font-size:0;line-height:0;">&nbsp;</div>
          </td>
        </tr>

        <!-- DIVE DEEPER CTA -->
        <tr>
          <td style="padding:18px 24px 6px;text-align:center;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:${TEXT_PRIMARY};font-family:'DM Sans',Arial,sans-serif;">&#128073; Dive deeper</p>
            <p style="margin:0;font-size:12px;color:${TEXT_SECONDARY};font-family:'DM Sans',Arial,sans-serif;">Get full picks, team intel, and live insights:</p>
          </td>
        </tr>

        <!-- CTA BUTTON -->
        <tr>
          <td style="padding:10px 24px 20px;" class="cta-td">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
              <tr>
                <td align="center" bgcolor="${BRAND_RED}" style="border-radius:8px;background-color:${BRAND_RED};">
                  <a href="${finalCtaUrl}" class="cta-link"
                     style="display:block;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 24px;text-align:center;letter-spacing:0.03em;font-family:'DM Sans',Arial,Helvetica,sans-serif;border-radius:8px;line-height:1.3;">
                    ${finalCtaLabel}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background-color:#0d1117;border-top:1px solid ${BORDER_SOLID};padding:16px 24px 20px;border-radius:0 0 10px 10px;" class="footer-td">
            <p style="margin:0 0 6px;font-size:12px;color:${TEXT_MUTED};line-height:1.5;text-align:center;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
              Not betting advice. Sports intelligence for informational purposes only.
            </p>
            <p style="margin:0 0 6px;font-size:12px;color:${TEXT_MUTED};text-align:center;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
              <a href="${manageUrl}" style="color:${ACCENT};text-decoration:underline;">Manage preferences</a>
              &nbsp;&middot;&nbsp;
              <a href="https://maximussports.ai/mlb" style="color:${ACCENT};text-decoration:underline;">maximussports.ai</a>
            </p>
            <p style="margin:0;font-size:11px;color:#475569;text-align:center;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
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
 * MLB hero block: date + bold headline, dark bg with red accents.
 */
export function mlbHeroBlock({ line, sublabel }) {
  return `
<tr>
  <td style="padding:24px 24px 6px;background-color:${BG_BODY};" class="hero-td">
    <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:${BRAND_RED};letter-spacing:0.06em;text-transform:uppercase;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.4;">${sublabel || ''}</p>
    <h1 class="hero-h1" style="margin:0;font-size:22px;font-weight:800;color:${TEXT_PRIMARY};line-height:1.28;letter-spacing:-0.02em;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${line}</h1>
  </td>
</tr>`;
}

/**
 * MLB section header — emoji + ALL CAPS title with red glow effect.
 */
export function mlbSectionHeader(emoji, title) {
  return `
<tr>
  <td style="padding:16px 24px 8px;" class="section-td">
    <p class="section-header" style="margin:0;font-size:14px;font-weight:800;color:${TEXT_PRIMARY};letter-spacing:0.06em;text-transform:uppercase;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.4;text-shadow:0 0 20px rgba(196,30,58,0.25);">${emoji} ${title}</p>
  </td>
</tr>`;
}

/**
 * MLB section label — inline compact label.
 */
export function mlbSectionLabel(label) {
  return `<span style="display:inline-block;font-size:10px;font-weight:700;color:${BRAND_RED};letter-spacing:0.1em;text-transform:uppercase;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.5;">${label}</span>`;
}

/**
 * MLB glass card — dark panel with subtle red border glow.
 */
export function mlbGlassCard({ label, headline, body }) {
  return `
<tr>
  <td style="padding:0 24px 12px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:${BG_CARD};border:1px solid ${GLOW_BORDER};border-radius:8px;border-collapse:collapse;">
      <tr>
        <td style="padding:16px 18px 14px;" class="card-td">
          ${label ? `<div style="margin-bottom:8px;">${mlbSectionLabel(label)}</div>` : ''}
          ${headline ? `<p style="margin:0 0 6px;font-size:15px;font-weight:700;color:${TEXT_PRIMARY};line-height:1.35;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${headline}</p>` : ''}
          <p style="margin:0;font-size:14px;color:${TEXT_SECONDARY};line-height:1.6;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${body}</p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

/**
 * MLB body paragraph — standard text block.
 */
export function mlbParagraph(text) {
  return `
<tr>
  <td style="padding:0 24px 12px;" class="section-td">
    <p style="margin:0;font-size:14px;color:${TEXT_SECONDARY};line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${text}</p>
  </td>
</tr>`;
}

/**
 * MLB divider row.
 */
export function mlbDividerRow() {
  return `
<tr>
  <td style="padding:4px 24px;" class="divider-td">
    <div style="height:1px;background-color:${BORDER_SOLID};font-size:0;line-height:0;">&nbsp;</div>
  </td>
</tr>`;
}

/**
 * MLB spacer row.
 */
export function mlbSpacerRow(px = 8) {
  return `<tr><td style="height:${px}px;font-size:0;line-height:0;" aria-hidden="true">&nbsp;</td></tr>`;
}

/**
 * MLB team logo image.
 */
export function mlbTeamLogoImg(team, size = 22) {
  const slug = team?.slug;
  if (!slug) return `<span style="display:inline-block;width:${size}px;height:${size}px;background-color:#1a2236;border-radius:3px;vertical-align:middle;"></span>`;
  const src = `https://maximussports.ai/logos/${slug}.png`;
  const alt = team?.name || slug;
  return `<img src="${src}" alt="${alt}" width="${size}" height="${size}"
    style="width:${size}px;height:${size}px;min-width:${size}px;border-radius:3px;vertical-align:middle;display:inline-block;border:0;line-height:1;outline:none;" />`;
}
