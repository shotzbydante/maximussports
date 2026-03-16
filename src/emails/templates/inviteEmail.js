/**
 * Invite Email — premium branded invite with dynamic March Madness content.
 *
 * Layout:
 *   Header (via EmailShell)
 *   Hero / invite message
 *   Value proposition bullets
 *   March Madness narrative block (conditional — tournament window)
 *   Model signals preview (dynamic or static fallback)
 *   Early tournament edges (conditional — pre-tournament)
 *   Social proof
 *   CTA (via EmailShell)
 *   Footer (via EmailShell)
 *
 * @param {object} data
 * @param {string}  [data.inviterName]     — display name of the inviter
 * @param {string}   data.inviteLink       — full invite URL with ref param
 * @param {Array}   [data.modelSignals]    — dynamic signal objects from the picks pipeline
 * @param {object}  [data.tournamentMeta]  — { topSeeds, upsetMatchups, bracketNarrative }
 */

import { EmailShell, heroBlock, sectionLabel, sectionCard } from '../EmailShell.js';
import { signalCard, buildSignalsFromPicks, FALLBACK_SIGNALS } from '../helpers/signalRows.js';
import { isTournamentWeek, isPreTournament, isTournamentActive } from '../tournamentWindow.js';

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
  const {
    inviterName,
    inviteLink = 'https://maximussports.ai/join',
    modelSignals = [],
    tournamentMeta = {},
  } = data;

  const headline = inviterName
    ? `${inviterName} invited you to join Maximus Sports`
    : 'You were invited to Maximus Sports';

  const socialProof = inviterName
    ? `Join ${inviterName} on Maximus Sports and get model-driven picks, bracket intel, and daily basketball insights.`
    : 'Join Maximus Sports and get model-driven picks, bracket intel, and daily basketball insights.';

  const signals = modelSignals.length > 0
    ? buildSignalsFromPicks(modelSignals, 5)
    : FALLBACK_SIGNALS;

  const showTournament = isTournamentWeek();
  const showPreTournament = isPreTournament();
  const showActive = isTournamentActive();

  // ── Value proposition bullets ──
  const valueBullets = `
<tr>
  <td style="padding:10px 24px 20px;" class="intro-td">
    <p style="margin:0 0 16px;font-size:15px;color:${TEXT_SECONDARY};line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      Maximus Sports is an AI-powered college basketball intelligence platform built to help you:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${bulletRow('Find smarter picks backed by model probability')}
      ${bulletRow('Analyze matchups with real-time model edge')}
      ${bulletRow('Spot upset alerts before they happen')}
      ${bulletRow('Build stronger, data-informed brackets')}
    </table>
  </td>
</tr>`;

  // ── March Madness narrative block (tournament window only) ──
  let marchMadnessBlock = '';
  if (showTournament) {
    const narrativeTitle = showPreTournament
      ? 'MARCH MADNESS IS HERE'
      : 'TOURNAMENT IN PROGRESS';

    const narrativeBody = showPreTournament
      ? `The NCAA tournament bracket is set &mdash; and the model is already flagging early edges across all four regions.`
      : `The tournament is underway. Maximus is tracking every result, updating model edges in real time.`;

    const storylines = tournamentMeta.storylines || [
      'Top seeds under the microscope &mdash; model confidence vs. consensus',
      'Early-round upset alerts from the Upset Radar',
      'Matchups where the model sees a different outcome than the market',
    ];

    const storylineRows = storylines.map(s =>
      `<tr>
        <td valign="top" style="width:18px;color:${ACCENT};font-size:14px;padding-top:1px;font-family:'DM Sans',Arial,sans-serif;">&bull;</td>
        <td valign="top" style="font-size:14px;color:${TEXT_SECONDARY};line-height:1.6;font-family:'DM Sans',Arial,sans-serif;padding-bottom:6px;">${s}</td>
      </tr>`
    ).join('');

    marchMadnessBlock = `
${divider()}
<tr>
  <td style="padding:0 24px 4px;" class="section-td">
    <div style="margin-bottom:10px;">${sectionLabel(narrativeTitle)}</div>
  </td>
</tr>
<tr>
  <td style="padding:0 24px 16px;" class="section-td">
    <p style="margin:0 0 14px;font-size:15px;color:${TEXT_SECONDARY};line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      ${narrativeBody}
    </p>
    <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:${TEXT_PRIMARY};line-height:1.5;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      Top storylines from this year&rsquo;s bracket:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${storylineRows}
    </table>
  </td>
</tr>`;
  }

  // ── Model signals section ──
  const signalsLabel = showActive ? "LIVE MODEL SIGNALS" : "TODAY'S MODEL SIGNALS";
  const signalsBlock = `
${divider()}
<tr>
  <td style="padding:0 24px 4px;" class="section-td">
    <div style="margin-bottom:10px;">${sectionLabel(signalsLabel)}</div>
  </td>
</tr>
<tr>
  <td style="padding:0 24px 14px;" class="section-td">
    ${signalCard(signals)}
  </td>
</tr>`;

  // ── Early tournament edges (pre-tournament window only) ──
  let bracketEdgesBlock = '';
  if (showPreTournament) {
    const edgeNarrative = tournamentMeta.bracketNarrative
      || 'The model currently flags several Round of 64 matchups worth watching.';

    const edgeBullets = tournamentMeta.edgeBullets || [
      'Strong favorite signals on top seeds entering the tournament',
      'Multiple volatile 8 vs 9 matchups that are statistical coin flips',
      'Classic 5 vs 12 upset opportunities with elevated model volatility',
    ];

    const edgeRows = edgeBullets.map(b =>
      `<tr>
        <td valign="top" style="width:18px;color:${ACCENT};font-size:14px;padding-top:1px;font-family:'DM Sans',Arial,sans-serif;">&bull;</td>
        <td valign="top" style="font-size:14px;color:${TEXT_SECONDARY};line-height:1.6;font-family:'DM Sans',Arial,sans-serif;padding-bottom:6px;">${b}</td>
      </tr>`
    ).join('');

    bracketEdgesBlock = `
${divider()}
<tr>
  <td style="padding:0 24px 4px;" class="section-td">
    <div style="margin-bottom:10px;">${sectionLabel('EARLY TOURNAMENT EDGES')}</div>
  </td>
</tr>
<tr>
  <td style="padding:0 24px 16px;" class="section-td">
    <p style="margin:0 0 14px;font-size:15px;color:${TEXT_SECONDARY};line-height:1.65;font-family:'DM Sans',Arial,Helvetica,sans-serif;">
      ${edgeNarrative}
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      ${edgeRows}
    </table>
  </td>
</tr>`;
  }

  // ── Social proof line ──
  const socialProofBlock = `
<tr><td style="height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr>
  <td style="padding:0 24px 6px;">
    <p style="margin:0;font-size:13px;color:${TEXT_MUTED};line-height:1.6;font-family:'DM Sans',Arial,Helvetica,sans-serif;text-align:center;font-style:italic;">
      ${socialProof}
    </p>
  </td>
</tr>`;

  // ── Assemble content ──
  const content = `
${heroBlock({
  line: headline,
  sublabel: 'Maximum Intelligence.',
})}

${valueBullets}

${marchMadnessBlock}

${signalsBlock}

${bracketEdgesBlock}

${socialProofBlock}`;

  return EmailShell({
    content,
    previewText: headline,
    ctaUrl: inviteLink,
    ctaLabel: 'Join Maximus Sports &rarr;',
  });
}

export function renderText(data = {}) {
  const { inviterName, inviteLink = 'https://maximussports.ai/join', modelSignals = [] } = data;
  const headline = inviterName
    ? `${inviterName} invited you to join Maximus Sports`
    : "You've been invited to join Maximus Sports";

  const showTournament = isTournamentWeek();

  const lines = [
    'MAXIMUS SPORTS',
    'Maximum Intelligence.',
    '',
    headline,
    '',
    'Maximus Sports is an AI-powered college basketball intelligence platform.',
    '- Find smarter picks backed by model probability',
    '- Analyze matchups with real-time model edge',
    '- Spot upset alerts before they happen',
    '- Build stronger, data-informed brackets',
    '',
  ];

  if (showTournament) {
    lines.push(
      'MARCH MADNESS IS HERE',
      'The NCAA tournament bracket is set — the model is already flagging early edges.',
      '',
    );
  }

  lines.push(
    "TODAY'S MODEL SIGNALS",
    ...(modelSignals.length > 0
      ? modelSignals.slice(0, 5).map(s => `- ${s.matchup || '?'}: ${s.edge || 'model edge'}`)
      : [
        '- Duke vs Creighton: Model Edge Duke 97%',
        '- Houston vs Oklahoma: Model Edge Houston 91%',
        '- UCF vs Texas: Upset Radar — volatility alert',
      ]),
    '',
    `Join here: ${inviteLink}`,
    '',
    'Not betting advice. Sports intelligence for informational purposes only.',
    'maximussports.ai',
  );

  return lines.join('\n');
}

// ── Helpers ──

function bulletRow(text) {
  return `<tr>
  <td valign="top" style="width:18px;color:${ACCENT};font-size:14px;padding-top:1px;font-family:'DM Sans',Arial,sans-serif;">&bull;</td>
  <td valign="top" style="font-size:14px;color:${TEXT_SECONDARY};line-height:1.6;font-family:'DM Sans',Arial,sans-serif;padding-bottom:8px;">${text}</td>
</tr>`;
}

function divider() {
  return `<tr>
  <td style="padding:0 24px;" class="divider-td">
    <div style="height:1px;background-color:${BORDER};font-size:0;line-height:0;">&nbsp;</div>
  </td>
</tr>
<tr><td style="height:14px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
}
