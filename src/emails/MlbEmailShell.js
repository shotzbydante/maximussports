/**
 * MlbEmailShell — MLB-branded email wrapper (premium white-mode).
 *
 * Typography scale (email-safe, consistent):
 *   Eyebrow/date:     13px / 18px line-height / uppercase / red
 *   Headline:         20px / 28px line-height / 800 weight / #111827
 *   Intro paragraph:  16px / 26px line-height / #4b5563
 *   Section pill:     12px / 16px line-height / 700 weight / uppercase / red
 *   Bullet/body:      16px / 26px line-height / #1f2937
 *   Takeaway:         15px / 24px line-height / #7f1d1d
 *   CTA support:      14px / 20px line-height
 *   Footer:           12px / 18px line-height / muted
 */

const BG_OUTER  = '#f3f4f6';
const BG_BODY   = '#ffffff';
const BG_CARD   = '#fafbfc';
const BRAND_RED = '#c41e3a';
const NAVY      = '#0f2440';
const TEXT_PRIMARY   = '#111827';
const TEXT_BODY      = '#1f2937';
const TEXT_SECONDARY = '#4b5563';
const TEXT_MUTED     = '#9ca3af';
const BORDER         = '#e5e7eb';
const MASCOT_URL     = 'https://maximussports.ai/mascot-mlb.png';
const FONT_STACK     = "'DM Sans',Arial,Helvetica,sans-serif";

/* ═══════════════════════════════════════════════════════════════
   TEXT NORMALIZATION PIPELINE
   ═══════════════════════════════════════════════════════════════ */

/**
 * Strip inline emojis from body/bullet text.
 * Gmail renders emojis as oversized inline elements that force line breaks.
 */
export function stripInlineEmoji(text = '') {
  return text
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]+/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Fix punctuation-spacing artifacts left by emoji stripping and AI generation.
 * Handles: stray spaces before commas/periods, double spaces, spacing around
 * parentheses, spacing after closing strong tags before punctuation.
 * Preserves HTML tags.
 */
export function normalizeSpacing(text = '') {
  if (!text) return '';
  return text
    // Space before punctuation (but not inside HTML tags)
    .replace(/(<\/[^>]+>)\s+([.,;:!?])/g, '$1$2')
    .replace(/([^<\s])\s+([.,;:!?])/g, '$1$2')
    // Space after opening paren, before closing paren
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    // Collapse multiple spaces (outside tags)
    .replace(/  +/g, ' ')
    // Clean up space after bullet character
    .replace(/&bull;\s{2,}/g, '&bull; ')
    .trim();
}

/**
 * Clean raw AI narrative text for email rendering.
 * Full pipeline: strip markers → bold → dedupe headers → strip emojis → fix spacing.
 */
export function cleanNarrativeText(text) {
  if (!text) return '';
  let result = text
    // Strip paragraph markers: ¶1, ¶ 2, ¶1:, ¶1 —, standalone ¶
    .replace(/¶\s*\d+\s*[:—\-–]?\s*/g, '')
    .replace(/¶/g, '')
    .replace(/\*\*([^*]+)\*\*/g, `<strong style="color:${TEXT_PRIMARY};">$1</strong>`)
    .replace(/^(AROUND THE LEAGUE|WORLD SERIES ODDS PULSE|PENNANT RACE WATCH|SLEEPERS.*?VALUE|DIAMOND DISPATCH)\s*[:—\-–]\s*/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // Strip emojis from plain-text portions (preserve HTML tags)
  result = result.replace(/(>[^<]*)/g, (m) =>
    m.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]+/gu, '').replace(/\s{2,}/g, ' ')
  );
  result = result.replace(/^([^<]+)/, (m) =>
    m.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]+/gu, '').replace(/\s{2,}/g, ' ')
  );
  return normalizeSpacing(result);
}

/**
 * Full text preparation: clean + strip emojis + normalize spacing.
 * Use this for all bullet/body content before rendering.
 */
export function prepareBodyText(text) {
  return normalizeSpacing(stripInlineEmoji(cleanNarrativeText(text)));
}

/* ═══════════════════════════════════════════════════════════════
   EMAIL SHELL
   ═══════════════════════════════════════════════════════════════ */

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
    a { color: ${BRAND_RED}; }
    * { box-sizing: border-box; }
    @media only screen and (max-width: 480px) {
      .email-outer-td   { padding: 0 !important; }
      .email-container  { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; border-left: none !important; border-right: none !important; }
      .shell-header-td  { padding: 16px 20px 14px !important; }
      .hero-td          { padding: 20px 20px 10px !important; }
      .hero-h1          { font-size: 18px !important; line-height: 26px !important; }
      .intro-td         { padding: 0 20px 16px !important; }
      .section-td       { padding-left: 20px !important; padding-right: 20px !important; }
      .divider-td       { padding: 0 20px !important; }
      .cta-td           { padding: 12px 20px 20px !important; }
      .cta-link         { font-size: 15px !important; padding: 14px 20px !important; display: block !important; width: 100% !important; text-align: center !important; }
      .footer-td        { padding: 18px 20px 22px !important; }
      .mascot-img       { width: 44px !important; height: 44px !important; }
    }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
    }
  </style>
</head>
<body bgcolor="${BG_OUTER}" style="margin:0;padding:0;background-color:${BG_OUTER};font-family:${FONT_STACK};width:100%;min-width:100%;">

${previewText ? `<div style="display:none;font-size:1px;color:${BG_OUTER};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;" aria-hidden="true">${previewText}&nbsp;&zwnj;&hairsp;&zwnj;&hairsp;</div>` : ''}

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${BG_OUTER}"
       style="background-color:${BG_OUTER};width:100%;margin:0;padding:0;border-collapse:collapse;">
  <tr>
    <td align="center" valign="top" style="padding:20px 12px 28px;" class="email-outer-td">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" bgcolor="${BG_BODY}"
             class="email-container"
             style="max-width:560px;width:100%;background-color:${BG_BODY};border-radius:10px;border:1px solid ${BORDER};border-collapse:collapse;overflow:hidden;">

        <!-- ═══ HEADER ═══ -->
        <tr>
          <td style="padding:22px 28px 18px;border-bottom:3px solid ${BRAND_RED};" class="shell-header-td">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td valign="middle" style="width:52px;padding-right:16px;">
                  <img src="${MASCOT_URL}" alt="Maximus" width="48" height="48" class="mascot-img"
                       style="width:48px;height:48px;border-radius:10px;display:block;border:0;" />
                </td>
                <td valign="middle">
                  <span style="font-size:16px;font-weight:800;color:${NAVY};letter-spacing:0.05em;text-transform:uppercase;font-family:${FONT_STACK};display:block;line-height:20px;">MAXIMUS SPORTS</span>
                  <span style="font-size:11px;font-weight:700;color:${BRAND_RED};letter-spacing:0.1em;text-transform:uppercase;font-family:${FONT_STACK};display:block;margin-top:3px;line-height:14px;">MLB INTELLIGENCE</span>
                </td>
                <td align="right" valign="middle">
                  <a href="https://maximussports.ai/mlb" style="font-size:11px;color:${TEXT_MUTED};text-decoration:none;font-family:${FONT_STACK};">maximussports.ai</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ═══ CONTENT ═══ -->
        ${content}

        <!-- ═══ PRE-CTA DIVIDER ═══ -->
        <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding:0 28px;" class="divider-td">
            <div style="height:1px;background-color:${BORDER};font-size:0;line-height:0;">&nbsp;</div>
          </td>
        </tr>

        <!-- ═══ CTA BLOCK ═══ -->
        <tr>
          <td style="padding:22px 28px 6px;text-align:center;">
            <p style="margin:0 0 4px;font-size:14px;font-weight:700;line-height:20px;color:${NAVY};font-family:${FONT_STACK};">See the Full Board</p>
            <p style="margin:0;font-size:13px;line-height:18px;color:${TEXT_MUTED};font-family:${FONT_STACK};">Picks, team intel, live odds, and model signals.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 44px 24px;" class="cta-td">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td align="center" bgcolor="${BRAND_RED}" style="border-radius:8px;background-color:${BRAND_RED};">
                  <a href="${finalCtaUrl}" class="cta-link"
                     style="display:block;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 28px;text-align:center;letter-spacing:0.02em;font-family:${FONT_STACK};border-radius:8px;line-height:20px;">
                    ${finalCtaLabel}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ═══ FOOTER ═══ -->
        <tr>
          <td style="background-color:#f9fafb;border-top:1px solid ${BORDER};padding:20px 28px 24px;border-radius:0 0 10px 10px;" class="footer-td">
            <p style="margin:0 0 8px;font-size:12px;line-height:18px;color:${TEXT_MUTED};text-align:center;font-family:${FONT_STACK};">
              Not betting advice. Sports intelligence for informational purposes only.
            </p>
            <p style="margin:0 0 8px;font-size:12px;line-height:18px;color:${TEXT_MUTED};text-align:center;font-family:${FONT_STACK};">
              <a href="${manageUrl}" style="color:${BRAND_RED};text-decoration:underline;">Manage preferences</a>
              &nbsp;&middot;&nbsp;
              <a href="https://maximussports.ai/mlb" style="color:${BRAND_RED};text-decoration:underline;">maximussports.ai</a>
            </p>
            <p style="margin:0;font-size:11px;line-height:16px;color:#d1d5db;text-align:center;font-family:${FONT_STACK};">
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

/* ═══════════════════════════════════════════════════════════════
   COMPONENT HELPERS
   ═══════════════════════════════════════════════════════════════ */

/**
 * Hero block: eyebrow date + headline.
 */
export function mlbHeroBlock({ line, sublabel }) {
  return `
<tr>
  <td style="padding:26px 28px 10px;" class="hero-td">
    <p style="margin:0 0 8px;font-size:13px;font-weight:700;line-height:18px;color:${BRAND_RED};letter-spacing:0.06em;text-transform:uppercase;font-family:${FONT_STACK};">${sublabel || ''}</p>
    <h1 class="hero-h1" style="margin:0;font-size:20px;font-weight:800;line-height:28px;color:${TEXT_PRIMARY};letter-spacing:-0.01em;font-family:${FONT_STACK};">${line}</h1>
  </td>
</tr>`;
}

/**
 * Section header — red pill badge.
 */
export function mlbSectionHeader(emoji, title) {
  return `
<tr>
  <td style="padding:22px 28px 12px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:4px;padding:5px 12px 5px 10px;">
          <span style="font-size:12px;font-weight:700;line-height:16px;color:${BRAND_RED};letter-spacing:0.06em;text-transform:uppercase;font-family:${FONT_STACK};">${emoji} ${title}</span>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

/**
 * Section label — inline compact label for cards.
 */
export function mlbSectionLabel(label) {
  return `<span style="display:inline-block;font-size:11px;font-weight:700;line-height:14px;color:${BRAND_RED};letter-spacing:0.08em;text-transform:uppercase;font-family:${FONT_STACK};">${label}</span>`;
}

/**
 * Glass card — light panel with red left border.
 */
export function mlbGlassCard({ label, headline, body }) {
  return `
<tr>
  <td style="padding:0 28px 16px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:${BG_CARD};border:1px solid ${BORDER};border-left:3px solid ${BRAND_RED};border-radius:6px;border-collapse:collapse;">
      <tr>
        <td style="padding:16px 18px 14px;">
          ${label ? `<div style="margin-bottom:8px;">${mlbSectionLabel(label)}</div>` : ''}
          ${headline ? `<p style="margin:0 0 6px;font-size:15px;font-weight:700;line-height:22px;color:${TEXT_PRIMARY};font-family:${FONT_STACK};">${headline}</p>` : ''}
          <p style="margin:0;font-size:14px;line-height:22px;color:${TEXT_SECONDARY};font-family:${FONT_STACK};">${normalizeSpacing(body)}</p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

/**
 * Body paragraph.
 */
export function mlbParagraph(text) {
  return `
<tr>
  <td style="padding:0 28px 16px;" class="section-td">
    <p style="margin:0;font-size:16px;line-height:26px;color:${TEXT_BODY};font-family:${FONT_STACK};">${prepareBodyText(text)}</p>
  </td>
</tr>`;
}

/**
 * Convert a narrative paragraph into bullet-point strings.
 */
export function narrativeToBullets(text) {
  if (!text) return [];
  const cleaned = cleanNarrativeText(text);
  const plain = cleaned.replace(/<[^>]+>/g, '');
  const sentences = plain
    .split(/(?<=[.!?])\s+(?=[A-Z\u{1F300}-\u{1FAFF}])/u)
    .map(s => s.trim())
    .filter(s => s.length > 15);

  return sentences.map(sentence => {
    const boldPattern = /<strong[^>]*>([^<]+)<\/strong>/g;
    let result = sentence;
    let match;
    while ((match = boldPattern.exec(cleaned)) !== null) {
      if (sentence.includes(match[1])) {
        result = result.replace(match[1], match[0]);
      }
    }
    return result;
  }).filter(s => s.length > 15);
}

/**
 * Bullet list with optional takeaway.
 * Single <td>, inline bullet chars, no nested tables.
 */
export function mlbBulletSection(bullets, takeaway = '') {
  if (!bullets || bullets.length === 0) return '';

  const bulletHtml = bullets.map(b =>
    `<p style="margin:0 0 12px 0;font-size:16px;line-height:26px;color:${TEXT_BODY};font-family:${FONT_STACK};">&bull; ${normalizeSpacing(stripInlineEmoji(b))}</p>`
  ).join('\n');

  const takeawayHtml = takeaway
    ? `<p style="margin:16px 0 0 0;padding:14px 16px;font-size:15px;line-height:24px;color:#7f1d1d;font-family:${FONT_STACK};background-color:#fef2f2;border-radius:6px;border-left:3px solid ${BRAND_RED};">&rarr; <strong>Takeaway:</strong> ${normalizeSpacing(stripInlineEmoji(cleanNarrativeText(takeaway)))}</p>`
    : '';

  return `
<tr>
  <td style="padding:0 28px 16px;" class="section-td">
    ${bulletHtml}
    ${takeawayHtml}
  </td>
</tr>`;
}

/**
 * Divider row.
 */
export function mlbDividerRow() {
  return `
<tr>
  <td style="padding:8px 28px;" class="divider-td">
    <div style="height:1px;background-color:${BORDER};font-size:0;line-height:0;">&nbsp;</div>
  </td>
</tr>`;
}

/**
 * Spacer row.
 */
export function mlbSpacerRow(px = 8) {
  return `<tr><td style="height:${px}px;font-size:0;line-height:0;" aria-hidden="true">&nbsp;</td></tr>`;
}

/**
 * Team logo image — canonical source for ALL email templates.
 *
 * Uses the same self-hosted logos as Content Studio (src/utils/espnMlbLogos.js).
 * These were downloaded from ESPN's slug-based CDN and placed in public/logos/mlb/.
 * This replaced the old ESPN numeric-ID CDN approach which served stale logos
 * (e.g., Cleveland Indians Chief Wahoo mark instead of current Guardians logo).
 *
 * Canonical source: public/logos/mlb/{slug}.png
 * Absolute URL:     https://maximussports.ai/logos/mlb/{slug}.png
 */
const MLB_VALID_SLUGS = new Set([
  'nyy', 'bos', 'tor', 'tb', 'bal',
  'cle', 'min', 'det', 'cws', 'kc',
  'hou', 'sea', 'tex', 'laa', 'oak',
  'atl', 'nym', 'phi', 'mia', 'wsh',
  'chc', 'mil', 'stl', 'pit', 'cin',
  'lad', 'sd', 'sf', 'ari', 'col',
]);

export function mlbTeamLogoImg(team, size = 22) {
  const slug = team?.slug;
  const logoUrl = slug && MLB_VALID_SLUGS.has(slug)
    ? `https://maximussports.ai/logos/mlb/${slug}.png`
    : null;

  if (!logoUrl) {
    const abbr = (team?.abbrev || team?.shortName || slug || '??').slice(0, 3).toUpperCase();
    return `<span style="display:inline-block;width:${size}px;height:${size}px;line-height:${size}px;text-align:center;font-size:9px;font-weight:700;color:#6b7280;background:#f3f4f6;border-radius:4px;vertical-align:middle;">${abbr}</span>`;
  }

  return `<img src="${logoUrl}" alt="${team?.name || slug}" width="${size}" height="${size}"
    style="width:${size}px;height:${size}px;min-width:${size}px;border-radius:4px;vertical-align:middle;display:inline-block;border:0;line-height:1;outline:none;text-decoration:none;" />`;
}

/**
 * NBA team logo image — uses canonical ESPN CDN pattern from src/utils/espnNbaLogos.js.
 * Same source the app and Content Studio use, with absolute URLs for email.
 */
const NBA_ESPN_LOGO_IDS = {
  atl: '1', bos: '2', bkn: '17', cha: '30', chi: '4',
  cle: '5', dal: '6', den: '7', det: '8', gsw: '9',
  hou: '10', ind: '11', lac: '12', lal: '13', mem: '29',
  mia: '14', mil: '15', min: '16', nop: '3', nyk: '18',
  okc: '25', orl: '19', phi: '20', phx: '21', por: '22',
  sac: '23', sas: '24', tor: '28', uta: '26', was: '27',
};

export function nbaTeamLogoImg(team, size = 22) {
  const slug = team?.slug;
  const espnId = slug ? NBA_ESPN_LOGO_IDS[slug] : null;
  const logoUrl = espnId ? `https://a.espncdn.com/i/teamlogos/nba/500/${espnId}.png` : null;

  if (!logoUrl) {
    const abbr = (team?.abbrev || team?.shortName || slug || '??').slice(0, 3).toUpperCase();
    return `<span style="display:inline-block;width:${size}px;height:${size}px;line-height:${size}px;text-align:center;font-size:9px;font-weight:700;color:#6b7280;background:#f3f4f6;border-radius:4px;vertical-align:middle;">${abbr}</span>`;
  }

  return `<img src="${logoUrl}" alt="${team?.name || slug}" width="${size}" height="${size}"
    style="width:${size}px;height:${size}px;min-width:${size}px;border-radius:4px;vertical-align:middle;display:inline-block;border:0;line-height:1;outline:none;text-decoration:none;" />`;
}

/* ═══════════════════════════════════════════════════════════════
   SPORTSBOOK PARTNER CTA MODULE
   Shared across all email templates that include sportsbook CTAs.
   ═══════════════════════════════════════════════════════════════ */

const PARTNERS = {
  xbet: {
    name: 'XBet',
    offer: 'Welcome Offer',
    trust: 'Fast markets \u00B7 broad MLB coverage',
    url: 'https://record.webpartners.co/_HSjxL9LMlaLhIFuQAd3mRWNd7ZgqdRLk/1/',
  },
  mybookie: {
    name: 'MyBookie',
    offer: 'Welcome Bonus',
    trust: 'Bet-back protection for new users',
    url: 'https://record.webpartners.co/_HSjxL9LMlaIxuOePL6NGnGNd7ZgqdRLk/1/',
  },
};

function bookBrandMark(brand) {
  if (brand === 'xbet') {
    return `<span style="display:inline-block;font-size:16px;font-weight:800;color:${NAVY};letter-spacing:-0.02em;font-family:${FONT_STACK};">X<span style="color:${BRAND_RED};">Bet</span></span>`;
  }
  if (brand === 'mybookie') {
    return `<span style="display:inline-block;font-size:15px;font-weight:800;color:${NAVY};letter-spacing:-0.01em;font-family:${FONT_STACK};">My<span style="color:${BRAND_RED};">Bookie</span></span>`;
  }
  return '';
}

/**
 * Render the "ACT ON TODAY'S BOARD" sportsbook partner CTA module.
 * Identical output regardless of which template calls it.
 *
 * @param {object} [opts]
 * @param {string} [opts.padding] — outer td padding override (default '8px 28px 20px')
 */
export function renderPartnerModule(opts = {}) {
  const outerPad = opts.padding || '8px 28px 20px';

  const renderPartnerCard = (partner, brand) => `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="border:1px solid ${BORDER};border-radius:6px;border-collapse:collapse;background:#ffffff;">
      <tr>
        <td style="padding:16px 18px 14px;">
          <div style="margin:0 0 6px;">${bookBrandMark(brand)}</div>
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:${NAVY};font-family:${FONT_STACK};">${partner.offer}</p>
          <p style="margin:0 0 10px;font-size:11px;color:#b0b8c4;line-height:16px;font-family:${FONT_STACK};">${partner.trust}</p>
          <a href="${partner.url}" style="display:inline-block;font-size:11px;font-weight:700;color:${BRAND_RED};text-decoration:none;border:1px solid ${BRAND_RED};border-radius:5px;padding:8px 18px;font-family:${FONT_STACK};line-height:14px;letter-spacing:0.02em;" target="_blank">Claim ${partner.offer} &rarr;</a>
        </td>
      </tr>
    </table>`;

  return `
<tr>
  <td style="padding:${outerPad};" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background:#f9fafb;border:1px solid ${BORDER};border-radius:8px;border-collapse:collapse;">
      <tr>
        <td style="padding:18px 18px 8px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${NAVY};letter-spacing:0.08em;text-transform:uppercase;font-family:${FONT_STACK};">ACT ON TODAY'S BOARD</p>
          <p style="margin:0 0 14px;font-size:12px;line-height:18px;color:${TEXT_MUTED};font-family:${FONT_STACK};">If you\u2019re acting on today\u2019s Maximus Model signals, these partners provide live market access and new-user bonuses.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 18px 18px;">
          <!--[if mso]>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
            <td width="48%" valign="top">
          <![endif]-->
          <div style="display:inline-block;width:48%;vertical-align:top;min-width:200px;">
            ${renderPartnerCard(PARTNERS.xbet, 'xbet')}
          </div>
          <!--[if mso]>
            </td><td width="4%">&nbsp;</td><td width="48%" valign="top">
          <![endif]-->
          <div style="display:inline-block;width:48%;vertical-align:top;margin-left:3%;min-width:200px;">
            ${renderPartnerCard(PARTNERS.mybookie, 'mybookie')}
          </div>
          <!--[if mso]>
            </td></tr></table>
          <![endif]-->
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}
