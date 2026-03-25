/**
 * Tasteful Maximus Pro promotion block for emails.
 * Premium, restrained — never salesy.
 */

const ACCENT = '#2d6ca8';
const TEXT_MUTED = '#8a94a6';
const BORDER = '#e8ecf0';
const FONT = "'DM Sans',Arial,Helvetica,sans-serif";

/**
 * Render a subtle Pro promotion card.
 * @param {'inline'|'footer'} variant — placement style
 * @returns {string} HTML
 */
export function proPlugCard(variant = 'inline') {
  if (variant === 'footer') {
    return `
<tr>
  <td style="padding:0 24px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="border:1px solid ${BORDER};border-radius:8px;border-collapse:collapse;">
      <tr>
        <td style="padding:16px 18px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td valign="middle">
                <span style="font-size:13px;font-weight:700;color:${ACCENT};font-family:${FONT};">✨ Go Pro</span>
                <span style="font-size:13px;color:${TEXT_MUTED};font-family:${FONT};"> — deeper picks, more signals, more team intel</span>
              </td>
              <td align="right" valign="middle" style="white-space:nowrap;">
                <a href="https://maximussports.ai/settings" style="font-size:12px;font-weight:700;color:${ACCENT};text-decoration:none;font-family:${FONT};">Learn more &rarr;</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
  }

  // Inline variant — compact, sits after picks
  return `
<tr>
  <td style="padding:4px 24px 14px;">
    <div style="text-align:center;padding:10px 0;">
      <span style="font-size:12px;color:${TEXT_MUTED};font-family:${FONT};">
        ✨ <a href="https://maximussports.ai/settings" style="color:${ACCENT};text-decoration:none;font-weight:600;">Maximus Pro</a> members get the full edge — deeper model intel, more signals, unlimited tracking.
      </span>
    </div>
  </td>
</tr>`;
}
