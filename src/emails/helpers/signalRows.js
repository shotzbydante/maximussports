/**
 * Reusable email-safe signal card rows.
 *
 * Used in both invitation and daily briefing emails to render
 * model edge picks and upset radar alerts in a consistent card style.
 */

const TEXT_PRIMARY   = '#1a1a2e';
const ACCENT         = '#2d6ca8';
const BORDER         = '#e8ecf0';
const UPSET_COLOR    = '#c05621';

/**
 * Render a single signal row (model edge or upset radar).
 *
 * @param {object} signal
 * @param {string} signal.matchup      — e.g. "Duke vs Creighton"
 * @param {string} [signal.edge]       — e.g. "Duke 97%" (model edge)
 * @param {boolean} [signal.isUpset]   — true for upset radar items
 * @param {string} [signal.upsetLabel] — e.g. "volatility alert"
 * @param {boolean} [isLast]           — omit bottom border on last row
 * @returns {string} HTML table row
 */
export function signalRow({ matchup, edge, isUpset = false, upsetLabel }, isLast = false) {
  const icon = isUpset ? '&#9888;&#65039;' : '&#127936;';
  const rightColor = isUpset ? UPSET_COLOR : ACCENT;
  const rightText = isUpset
    ? `Upset Radar &mdash; ${upsetLabel || 'volatility alert'}`
    : `Model Edge: ${edge}`;
  const rightSize = isUpset ? '12px' : '13px';
  const borderStyle = isLast ? '' : `border-bottom:1px solid ${BORDER};`;

  return `<tr>
  <td style="padding:14px 16px 12px;${borderStyle}">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td valign="middle" style="font-size:14px;font-family:'DM Sans',Arial,sans-serif;">
          <span style="font-size:15px;margin-right:6px;">${icon}</span>
          <span style="font-weight:600;color:${TEXT_PRIMARY};">${matchup}</span>
        </td>
        <td align="right" valign="middle" style="white-space:nowrap;">
          <span style="font-size:${rightSize};font-weight:700;color:${rightColor};font-family:'DM Sans',Arial,sans-serif;">${rightText}</span>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

/**
 * Render a full model signals card from an array of signal objects.
 *
 * @param {Array} signals — array of { matchup, edge?, isUpset?, upsetLabel? }
 * @returns {string} HTML for the signals table card
 */
export function signalCard(signals = []) {
  if (signals.length === 0) return '';
  const rows = signals.map((s, i) => signalRow(s, i === signals.length - 1)).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
       style="background-color:#f9fafb;border:1px solid ${BORDER};border-radius:6px;border-collapse:collapse;">
  ${rows}
</table>`;
}

/**
 * Build signal objects from raw model picks data.
 * Normalizes various data shapes into the standard signal format.
 *
 * @param {Array} picks — raw picks array from the model pipeline
 * @param {number} [max=5] — maximum signals to include
 * @returns {Array} normalized signal objects
 */
export function buildSignalsFromPicks(picks = [], max = 5) {
  if (!Array.isArray(picks) || picks.length === 0) return [];

  return picks.slice(0, max).map(p => {
    const matchup = p.matchup || `${p.awayTeam || p.team1 || '?'} vs ${p.homeTeam || p.team2 || '?'}`;
    const prob = p.probability || p.winProb || p.modelProb || null;
    const isVolatile = p.isUpset || p.volatile || p.upsetRadar || false;
    const winner = p.winner || p.pick || p.favored || '';

    if (isVolatile) {
      return {
        matchup,
        isUpset: true,
        upsetLabel: p.upsetLabel || 'volatility alert',
      };
    }

    const pctStr = prob != null ? `${Math.round(prob * 100)}%` : '';
    return {
      matchup,
      edge: winner && pctStr ? `${winner} ${pctStr}` : pctStr || 'model edge',
    };
  });
}

/**
 * Default static signals for when dynamic data is unavailable.
 * Used as fallback in invite emails.
 */
export const FALLBACK_SIGNALS = [
  { matchup: 'Duke vs Creighton', edge: 'Duke 97%' },
  { matchup: 'Houston vs Oklahoma', edge: 'Houston 91%' },
  { matchup: 'UCF vs Texas', isUpset: true, upsetLabel: 'volatility alert' },
];
