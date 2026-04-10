/**
 * MlbEmailShell — MLB-branded email wrapper (light mode, premium polish).
 *
 * Design: light body, white cards, MLB red accents, baseball mascot header.
 * Premium editorial feel optimized for Gmail rendering.
 */

const BG_OUTER  = '#f3f4f6';
const BG_BODY   = '#ffffff';
const BG_CARD   = '#fafbfc';
const BRAND_RED = '#c41e3a';
const ACCENT    = '#c41e3a';
const NAVY      = '#0f2440';
const TEXT_PRIMARY   = '#111827';
const TEXT_SECONDARY = '#4b5563';
const TEXT_MUTED     = '#9ca3af';
const BORDER         = '#e5e7eb';
const MASCOT_URL     = 'https://maximussports.ai/mascot-mlb.png';

/**
 * Clean raw AI narrative text for email rendering.
 * - Converts markdown bold (**text**) to <strong> tags
 * - Strips paragraph markers (¶1, ¶2)
 * - Removes duplicate section headers that appear inline
 * - Trims excessive whitespace
 */
export function cleanNarrativeText(text) {
  if (!text) return '';
  return text
    // Strip paragraph markers
    .replace(/¶\d+\s*/g, '')
    // Convert markdown bold to HTML
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#111827;">$1</strong>')
    // Remove inline section headers that duplicate our template headers
    .replace(/^(AROUND THE LEAGUE|WORLD SERIES ODDS PULSE|PENNANT RACE WATCH|SLEEPERS.*?VALUE|DIAMOND DISPATCH)\s*[:—\-–]\s*/gim, '')
    // Clean up excessive whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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
      .shell-header-td  { padding: 14px 18px 12px !important; }
      .hero-td          { padding: 18px 18px 14px !important; }
      .hero-h1          { font-size: 19px !important; line-height: 1.3 !important; }
      .intro-td         { padding: 0 18px 14px !important; }
      .section-td       { padding: 0 18px 12px !important; }
      .card-td          { padding: 14px 16px 13px !important; }
      .divider-td       { padding: 0 18px !important; }
      .cta-td           { padding: 14px 18px 20px !important; }
      .cta-link         { font-size: 15px !important; padding: 14px 20px !important; display: block !important; width: 100% !important; text-align: center !important; }
      .footer-td        { padding: 16px 18px 20px !important; }
      .mascot-img       { width: 48px !important; height: 48px !important; }
    }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
    }
  </style>
</head>
<body bgcolor="${BG_OUTER}" style="margin:0;padding:0;background-color:${BG_OUTER};font-family:'DM Sans',Arial,Helvetica,sans-serif;width:100%;min-width:100%;">

${previewText ? `<div style="display:none;font-size:1px;color:${BG_OUTER};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;" aria-hidden="true">${previewText}&nbsp;&zwnj;&hairsp;&zwnj;&hairsp;&zwnj;&hairsp;</div>` : ''}

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${BG_OUTER}"
       style="background-color:${BG_OUTER};width:100%;margin:0;padding:0;border-collapse:collapse;">
  <tr>
    <td align="center" valign="top" style="padding:20px 12px 28px;background-color:${BG_OUTER};" class="email-outer-td">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" bgcolor="${BG_BODY}"
             class="email-container"
             style="max-width:560px;width:100%;background-color:${BG_BODY};border-radius:10px;border:1px solid ${BORDER};border-collapse:collapse;overflow:hidden;">

        <!-- HEADER: Mascot + MLB brand bar -->
        <tr>
          <td style="padding:20px 24px 16px;border-bottom:3px solid ${BRAND_RED};background-color:#fefefe;" class="shell-header-td">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td valign="middle" style="width:56px;padding-right:14px;">
                  <img src="${MASCOT_URL}" alt="Maximus" width="52" height="52" class="mascot-img"
                       style="width:52px;height:52px;border-radius:12px;display:block;border:0;" />
                </td>
                <td valign="middle">
                  <span style="font-size:17px;font-weight:800;color:${NAVY};letter-spacing:0.04em;text-transform:uppercase;font-family:'DM Sans',Arial,Helvetica,sans-serif;display:block;line-height:1.2;">MAXIMUS SPORTS</span>
                  <span style="font-size:11px;font-weight:700;color:${BRAND_RED};letter-spacing:0.1em;text-transform:uppercase;font-family:'DM Sans',Arial,sans-serif;display:block;margin-top:2px;">MLB INTELLIGENCE</span>
                </td>
                <td align="right" valign="middle">
                  <a href="https://maximussports.ai/mlb" style="font-size:11px;color:${TEXT_MUTED};text-decoration:none;font-family:'DM Sans',Arial,Helvetica,sans-serif;">maximussports.ai</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CONTENT -->
        ${content}

        <!-- PRE-CTA SPACER -->
        <tr><td style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- DIVIDER -->
        <tr>
          <td style="padding:0 24px;" class="divider-td">
            <div style="height:1px;background-color:${BORDER};font-size:0;line-height:0;">&nbsp;</div>
          </td>
        </tr>

        <!-- CTA BLOCK -->
        <tr>
          <td style="padding:20px 24px 8px;text-align:center;">
            <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:${NAVY};font-family:'DM Sans',Arial,sans-serif;">Dive into the full picture</p>
            <p style="margin:0;font-size:12px;color:${TEXT_MUTED};font-family:'DM Sans',Arial,sans-serif;">Picks, team intel, live odds, and more.</p>
          </td>
        </tr>

        <!-- CTA BUTTON -->
        <tr>
          <td style="padding:10px 40px 22px;" class="cta-td">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
              <tr>
                <td align="center" bgcolor="${BRAND_RED}" style="border-radius:8px;background-color:${BRAND_RED};">
                  <a href="${finalCtaUrl}" class="cta-link"
                     style="display:block;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 24px;text-align:center;letter-spacing:0.02em;font-family:'DM Sans',Arial,Helvetica,sans-serif;border-radius:8px;line-height:1.3;">
                    ${finalCtaLabel}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background-color:#f9fafb;border-top:1px solid ${BORDER};padding:16px 24px 20px;border-radius:0 0 10px 10px;" class="footer-td">
            <p style="margin:0 0 6px;font-size:11px;color:${TEXT_MUTED};line-height:1.5;text-align:center;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
              Not betting advice. Sports intelligence for informational purposes only.
            </p>
            <p style="margin:0 0 6px;font-size:11px;color:${TEXT_MUTED};text-align:center;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
              <a href="${manageUrl}" style="color:${ACCENT};text-decoration:underline;">Manage preferences</a>
              &nbsp;&middot;&nbsp;
              <a href="https://maximussports.ai/mlb" style="color:${ACCENT};text-decoration:underline;">maximussports.ai</a>
            </p>
            <p style="margin:0;font-size:10px;color:#d1d5db;text-align:center;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
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
 * MLB hero block: date line + bold editorial headline.
 */
export function mlbHeroBlock({ line, sublabel }) {
  return `
<tr>
  <td style="padding:22px 24px 8px;background-color:${BG_BODY};" class="hero-td">
    <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:${BRAND_RED};letter-spacing:0.08em;text-transform:uppercase;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.4;">${sublabel || ''}</p>
    <h1 class="hero-h1" style="margin:0;font-size:21px;font-weight:800;color:${TEXT_PRIMARY};line-height:1.32;letter-spacing:-0.02em;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${line}</h1>
  </td>
</tr>`;
}

/**
 * MLB section header — red pill badge with emoji + title.
 */
export function mlbSectionHeader(emoji, title) {
  return `
<tr>
  <td style="padding:18px 24px 10px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:4px;padding:4px 10px 4px 8px;">
          <span style="font-size:13px;font-weight:800;color:${BRAND_RED};letter-spacing:0.04em;text-transform:uppercase;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.4;">${emoji} ${title}</span>
        </td>
      </tr>
    </table>
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
 * MLB card — light panel with red left border accent.
 */
export function mlbGlassCard({ label, headline, body }) {
  return `
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:${BG_CARD};border:1px solid ${BORDER};border-left:3px solid ${BRAND_RED};border-radius:6px;border-collapse:collapse;">
      <tr>
        <td style="padding:16px 18px 14px;" class="card-td">
          ${label ? `<div style="margin-bottom:6px;">${mlbSectionLabel(label)}</div>` : ''}
          ${headline ? `<p style="margin:0 0 5px;font-size:15px;font-weight:700;color:${TEXT_PRIMARY};line-height:1.35;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${headline}</p>` : ''}
          <p style="margin:0;font-size:13.5px;color:${TEXT_SECONDARY};line-height:1.6;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${body}</p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

/**
 * MLB body paragraph — clean editorial text block.
 */
export function mlbParagraph(text) {
  return `
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    <p style="margin:0;font-size:14px;color:${TEXT_SECONDARY};line-height:1.7;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${cleanNarrativeText(text)}</p>
  </td>
</tr>`;
}

/**
 * Convert a narrative paragraph into an array of bullet-point strings.
 * Splits on sentence boundaries and groups into digestible insights.
 */
export function narrativeToBullets(text) {
  if (!text) return [];
  const cleaned = cleanNarrativeText(text);
  // Strip HTML tags for splitting, but keep them for output
  const plain = cleaned.replace(/<[^>]+>/g, '');
  // Split on sentence endings followed by space + uppercase or emoji
  const sentences = plain
    .split(/(?<=[.!?])\s+(?=[A-Z\u{1F300}-\u{1FAFF}])/u)
    .map(s => s.trim())
    .filter(s => s.length > 15);

  // Re-apply bold formatting from the cleaned HTML version
  return sentences.map(sentence => {
    // Find the sentence in the cleaned HTML and return that version
    const idx = cleaned.replace(/<[^>]+>/g, '').indexOf(sentence.slice(0, 30));
    if (idx >= 0) {
      // Extract the HTML version of this sentence
      let htmlStart = 0;
      let plainCount = 0;
      for (let i = 0; i < cleaned.length; i++) {
        if (cleaned[i] === '<') {
          const end = cleaned.indexOf('>', i);
          if (end > i) { i = end; continue; }
        }
        if (plainCount === idx) { htmlStart = i; break; }
        plainCount++;
      }
      // Find sentence end in HTML
      let htmlEnd = htmlStart;
      let matchedPlain = 0;
      for (let i = htmlStart; i < cleaned.length; i++) {
        if (cleaned[i] === '<') {
          const end = cleaned.indexOf('>', i);
          if (end > i) { i = end; continue; }
        }
        matchedPlain++;
        if (matchedPlain >= sentence.length) { htmlEnd = i + 1; break; }
      }
      const htmlSentence = cleaned.slice(htmlStart, htmlEnd + 20).replace(/\s+$/, '');
      if (htmlSentence.length > 20) return htmlSentence;
    }
    return sentence;
  }).filter(s => s.length > 15);
}

/**
 * Render a bullet list with optional takeaway line.
 * Each bullet is a table row with bullet character + text.
 */
export function mlbBulletSection(bullets, takeaway = '') {
  if (!bullets || bullets.length === 0) return '';

  const bulletRows = bullets.map(b =>
    `<tr>
  <td style="padding:0 24px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td valign="top" style="width:18px;padding:4px 0;font-size:14px;color:${BRAND_RED};font-family:'DM Sans',Arial,sans-serif;line-height:1.6;">&bull;</td>
        <td style="padding:4px 0;font-size:13.5px;color:${TEXT_SECONDARY};line-height:1.6;font-family:'DM Sans',Arial,Helvetica,sans-serif;">${b}</td>
      </tr>
    </table>
  </td>
</tr>`
  ).join('\n');

  const takeawayRow = takeaway ? `
<tr>
  <td style="padding:6px 24px 0;" class="section-td">
    <p style="margin:0;font-size:13px;font-weight:700;color:${NAVY};line-height:1.5;font-family:'DM Sans',Arial,Helvetica,sans-serif;">&rarr; Takeaway: <span style="font-weight:500;color:${TEXT_SECONDARY};">${cleanNarrativeText(takeaway)}</span></p>
  </td>
</tr>` : '';

  return `${bulletRows}\n${takeawayRow}\n<tr><td style="height:10px;font-size:0;">&nbsp;</td></tr>`;
}

/**
 * MLB divider row — subtle separator.
 */
export function mlbDividerRow() {
  return `
<tr>
  <td style="padding:6px 24px;" class="divider-td">
    <div style="height:1px;background-color:${BORDER};font-size:0;line-height:0;">&nbsp;</div>
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
  if (!slug) return `<span style="display:inline-block;width:${size}px;height:${size}px;background-color:#e5e7eb;border-radius:4px;vertical-align:middle;"></span>`;
  const src = `https://maximussports.ai/logos/${slug}.png`;
  const alt = team?.name || slug;
  return `<img src="${src}" alt="${alt}" width="${size}" height="${size}"
    style="width:${size}px;height:${size}px;min-width:${size}px;border-radius:4px;vertical-align:middle;display:inline-block;border:0;line-height:1;outline:none;" />`;
}
