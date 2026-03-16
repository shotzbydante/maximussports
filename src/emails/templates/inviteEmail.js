/**
 * Invite Email — premium branded invite using the EmailShell frame.
 *
 * @param {object} data
 * @param {string} [data.inviterName]   — display name of the person inviting
 * @param {string}  data.inviteLink     — full invite URL with ref param
 */

import { EmailShell, heroBlock, sectionLabel } from '../EmailShell.js';

const TEXT_PRIMARY   = '#1a1a2e';
const TEXT_SECONDARY = '#4a5568';
const TEXT_MUTED     = '#8a94a6';
const ACCENT         = '#2d6ca8';
const BORDER         = '#e8ecf0';

export function getSubject(data = {}) {
  const name = data.inviterName;
  if (name) return `${name} invited you to join Maximus Sports`;
  return "You've been invited to Maximus Sports";
}

export function renderHTML(data = {}) {
  const { inviterName, inviteLink = 'https://maximussports.ai/join' } = data;
  const headline = inviterName
    ? `${inviterName} invited you to join Maximus Sports`
    : 'You\'ve been invited to join Maximus Sports';

  const socialProof = inviterName
    ? `Join ${inviterName} on Maximus Sports and get model-driven picks, bracket intel, and daily basketball insights.`
    : 'Join Maximus Sports and get model-driven picks, bracket intel, and daily basketball insights.';

  const content = `
${heroBlock({
  line: headline,
  sublabel: 'Maximum Intelligence.',
})}

<tr>
  <td style="padding:10px 24px 18px;" class="intro-td">
    <p style="margin:0 0 14px;font-size:15px;color:${TEXT_SECONDARY};line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      Maximus Sports is an AI-powered college basketball intelligence platform built to help you:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td valign="top" style="width:18px;color:${ACCENT};font-size:14px;padding-top:1px;font-family:'DM Sans',Arial,sans-serif;">&bull;</td>
        <td valign="top" style="font-size:14px;color:${TEXT_SECONDARY};line-height:1.6;font-family:'DM Sans',Arial,sans-serif;padding-bottom:6px;">Discover smarter picks</td>
      </tr>
      <tr>
        <td valign="top" style="width:18px;color:${ACCENT};font-size:14px;padding-top:1px;font-family:'DM Sans',Arial,sans-serif;">&bull;</td>
        <td valign="top" style="font-size:14px;color:${TEXT_SECONDARY};line-height:1.6;font-family:'DM Sans',Arial,sans-serif;padding-bottom:6px;">Analyze matchups with model-driven edge</td>
      </tr>
      <tr>
        <td valign="top" style="width:18px;color:${ACCENT};font-size:14px;padding-top:1px;font-family:'DM Sans',Arial,sans-serif;">&bull;</td>
        <td valign="top" style="font-size:14px;color:${TEXT_SECONDARY};line-height:1.6;font-family:'DM Sans',Arial,sans-serif;padding-bottom:6px;">Spot upset alerts before they happen</td>
      </tr>
      <tr>
        <td valign="top" style="width:18px;color:${ACCENT};font-size:14px;padding-top:1px;font-family:'DM Sans',Arial,sans-serif;">&bull;</td>
        <td valign="top" style="font-size:14px;color:${TEXT_SECONDARY};line-height:1.6;font-family:'DM Sans',Arial,sans-serif;padding-bottom:6px;">Build better brackets</td>
      </tr>
    </table>
  </td>
</tr>

<tr>
  <td style="padding:0 24px;" class="divider-td">
    <div style="height:1px;background-color:${BORDER};font-size:0;line-height:0;">&nbsp;</div>
  </td>
</tr>
<tr><td style="height:14px;font-size:0;line-height:0;">&nbsp;</td></tr>

<!-- Today's Model Signals — static preview -->
<tr>
  <td style="padding:0 24px 4px;" class="section-td">
    <div style="margin-bottom:10px;">${sectionLabel("TODAY'S MODEL SIGNALS")}</div>
  </td>
</tr>
<tr>
  <td style="padding:0 24px 12px;" class="section-td">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:#f9fafb;border:1px solid ${BORDER};border-radius:6px;border-collapse:collapse;">
      <tr>
        <td style="padding:14px 16px 12px;border-bottom:1px solid ${BORDER};">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td valign="middle" style="font-size:14px;font-family:'DM Sans',Arial,sans-serif;">
                <span style="font-size:15px;margin-right:6px;">&#127936;</span>
                <span style="font-weight:600;color:${TEXT_PRIMARY};">Duke vs Creighton</span>
              </td>
              <td align="right" valign="middle" style="white-space:nowrap;">
                <span style="font-size:13px;font-weight:700;color:${ACCENT};font-family:'DM Sans',Arial,sans-serif;">Model Edge: Duke 97%</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 16px 12px;border-bottom:1px solid ${BORDER};">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td valign="middle" style="font-size:14px;font-family:'DM Sans',Arial,sans-serif;">
                <span style="font-size:15px;margin-right:6px;">&#127936;</span>
                <span style="font-weight:600;color:${TEXT_PRIMARY};">Houston vs Oklahoma</span>
              </td>
              <td align="right" valign="middle" style="white-space:nowrap;">
                <span style="font-size:13px;font-weight:700;color:${ACCENT};font-family:'DM Sans',Arial,sans-serif;">Model Edge: Houston 91%</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 16px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td valign="middle" style="font-size:14px;font-family:'DM Sans',Arial,sans-serif;">
                <span style="font-size:15px;margin-right:6px;">&#9888;&#65039;</span>
                <span style="font-weight:600;color:${TEXT_PRIMARY};">UCF vs Texas</span>
              </td>
              <td align="right" valign="middle" style="white-space:nowrap;">
                <span style="font-size:12px;font-weight:700;color:#c05621;font-family:'DM Sans',Arial,sans-serif;">Upset Radar &mdash; volatility alert</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </td>
</tr>

<tr><td style="height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>

<!-- Social proof line -->
<tr>
  <td style="padding:0 24px 6px;">
    <p style="margin:0;font-size:13px;color:${TEXT_MUTED};line-height:1.6;font-family:'DM Sans',Arial,Helvetica,sans-serif;text-align:center;font-style:italic;">
      ${socialProof}
    </p>
  </td>
</tr>`;

  return EmailShell({
    content,
    previewText: headline,
    ctaUrl: inviteLink,
    ctaLabel: 'Join Maximus Sports &rarr;',
  });
}

export function renderText(data = {}) {
  const { inviterName, inviteLink = 'https://maximussports.ai/join' } = data;
  const headline = inviterName
    ? `${inviterName} invited you to join Maximus Sports`
    : "You've been invited to join Maximus Sports";
  return [
    'MAXIMUS SPORTS',
    'Maximum Intelligence.',
    '',
    headline,
    '',
    'Maximus Sports is an AI-powered college basketball intelligence platform.',
    '- Discover smarter picks',
    '- Analyze matchups',
    '- Spot upset alerts',
    '- Build better brackets',
    '',
    `Join here: ${inviteLink}`,
    '',
    'Not betting advice. For entertainment purposes only.',
    'maximussports.ai',
  ].join('\n');
}
