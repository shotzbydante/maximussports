/**
 * Email game card renderer.
 *
 * Shared helper for rendering premium, email-safe game cards with:
 *  - Both team logos (PNG, Gmail iOS safe)
 *  - Both team names + scores
 *  - Clean status display (Upcoming / Live / Final)
 *  - Spread and O/U line info (only when available)
 *  - ESPN Gamecast link
 *
 * All output is table-based email HTML with fully inline styles.
 * No flex, no grid, no class-only layout — every critical style is inline.
 *
 * Data model accepted by renderEmailGameCard():
 * {
 *   gameId?:       string|number,
 *   awayTeam:      string,
 *   homeTeam:      string,
 *   awaySlug?:     string,  // derived if absent
 *   homeSlug?:     string,  // derived if absent
 *   awayScore?:    string|number|null,
 *   homeScore?:    string|number|null,
 *   gameStatus:    string,  // 'Final', '1st 8:32', 'Halftime', 'Scheduled', etc.
 *   startTime?:    string,  // ISO date string
 *   spread?:       string|null,
 *   overUnder?:    string|null,
 *   total?:        string|null,
 *   links?:        Array<{rel: string[], href: string}>,
 * }
 */

import { resolveGamecastUrl } from '../../src/utils/espnGamecast.js';

const BASE_URL = 'https://maximussports.ai';

/**
 * Derive a best-effort team slug from a display name.
 * e.g. "Duke Blue Devils" → "duke-blue-devils"
 * Used only as a logo fallback; fuzzy matches are acceptable.
 */
function slugFromName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Inline PNG logo img tag, email-safe.
 * Falls back to a muted placeholder span when slug is unavailable.
 */
function logoImg(slug, name, size = 28) {
  if (!slug) {
    return `<span style="display:inline-block;width:${size}px;height:${size}px;background:rgba(255,255,255,0.07);border-radius:3px;vertical-align:middle;"></span>`;
  }
  const src = `${BASE_URL}/logos/${slug}.png`;
  return `<img src="${src}" alt="${name || slug}" width="${size}" height="${size}"
    style="width:${size}px;height:${size}px;min-width:${size}px;border-radius:3px;vertical-align:middle;display:inline-block;border:0;line-height:1;outline:none;-ms-interpolation-mode:bicubic;" />`;
}

/**
 * Classify a gameStatus string.
 * @returns {'final' | 'live' | 'scheduled'}
 */
function classifyStatus(statusStr) {
  if (!statusStr) return 'scheduled';
  const s = statusStr.toLowerCase();
  if (/final|postponed|cancelled/i.test(s)) return 'final';
  if (/halftime|\d+st|\d+nd|progress|live|in progress/i.test(s)) return 'live';
  return 'scheduled';
}

/**
 * Format a UTC ISO date string as "7:00 PM ET" style.
 */
function formatStartTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York',
      timeZoneName: 'short',
    });
  } catch {
    return '';
  }
}

/**
 * Normalize the spread label for display.
 * Handles numeric (e.g. -6.5) and string formats.
 */
function formatSpread(spread) {
  if (spread == null || spread === '') return null;
  const s = String(spread).trim();
  if (!s || s === '0' || s === 'Even') return 'PK';
  return s;
}

/**
 * Normalize the over/under for display.
 */
function formatOU(overUnder, total) {
  const val = overUnder || total;
  if (val == null || val === '') return null;
  return `O/U ${val}`;
}

/**
 * Build a normalized game card data object from a raw scores game object.
 * Accepts the same shape produced by fetchScoresSource() in api/_sources.js.
 *
 * @param {object} game - raw game object
 * @returns {object} normalized game card data
 */
export function buildGameCardData(game) {
  if (!game) return null;

  const awaySlug = game.awaySlug || slugFromName(game.awayTeam);
  const homeSlug = game.homeSlug || slugFromName(game.homeTeam);

  const statusKind = classifyStatus(game.gameStatus || game.status || '');
  const spread = formatSpread(game.spread);
  const ou = formatOU(game.overUnder, game.total);
  const gamcastUrl = resolveGamecastUrl(game);
  const timeLabel = statusKind === 'scheduled' ? formatStartTime(game.startTime) : null;

  return {
    gameId:      game.gameId || null,
    awayTeam:    game.awayTeam || 'Away',
    homeTeam:    game.homeTeam || 'Home',
    awaySlug,
    homeSlug,
    awayScore:   game.awayScore != null ? String(game.awayScore) : null,
    homeScore:   game.homeScore != null ? String(game.homeScore) : null,
    statusKind,  // 'final' | 'live' | 'scheduled'
    statusDisplay: game.gameStatus || game.status || 'Scheduled',
    timeLabel,
    spread,
    ou,
    gamcastUrl,
    network:     game.network || null,
  };
}

/**
 * Render a premium, email-safe game card HTML row.
 *
 * The card renders in a single column so it works at 320px–600px.
 * Spread/OU/Gamecast are only shown when data is present.
 *
 * @param {object} game         - raw game object OR pre-built card data
 * @param {object} [opts]
 * @param {boolean} [opts.compact=false] - smaller footprint (for list contexts)
 * @param {string}  [opts.baseColor]     - card background override
 * @returns {string} HTML string
 */
export function renderEmailGameCard(game, opts = {}) {
  const card = game?.statusKind ? game : buildGameCardData(game);
  if (!card) return '';

  const { compact = false, baseColor = '#0f1825' } = opts;
  const pad = compact ? '10px 14px' : '13px 16px';

  // ── Status chip
  const statusChipColors = {
    final:     { bg: 'rgba(45,140,90,0.15)', border: '#2a7050', text: '#38aa70' },
    live:      { bg: 'rgba(220,100,30,0.15)', border: '#c05020', text: '#e07030' },
    scheduled: { bg: 'rgba(50,110,170,0.12)', border: '#2d5e90', text: '#4a8fc0' },
  };
  const sc = statusChipColors[card.statusKind] || statusChipColors.scheduled;
  const statusLabel = card.statusKind === 'final'
    ? 'Final'
    : card.statusKind === 'live'
      ? `LIVE · ${card.statusDisplay}`
      : card.timeLabel || card.statusDisplay || 'Upcoming';

  const statusChip = `<span style="display:inline-block;background:${sc.bg};border:1px solid ${sc.border};color:${sc.text};font-size:9px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;padding:2px 7px;border-radius:3px;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.5;white-space:nowrap;vertical-align:middle;">${statusLabel}</span>`;

  // ── Away row
  const awayLogo = logoImg(card.awaySlug, card.awayTeam, compact ? 24 : 28);
  const awayScoreHtml = card.awayScore != null
    ? `<span style="font-size:${compact ? 16 : 18}px;font-weight:800;color:#edf2f8;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1;">${card.awayScore}</span>`
    : '';

  // ── Home row
  const homeLogo = logoImg(card.homeSlug, card.homeTeam, compact ? 24 : 28);
  const homeScoreHtml = card.homeScore != null
    ? `<span style="font-size:${compact ? 16 : 18}px;font-weight:800;color:#edf2f8;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1;">${card.homeScore}</span>`
    : '';

  // Highlight winner
  const awayWins = card.statusKind === 'final' && card.awayScore != null && card.homeScore != null && Number(card.awayScore) > Number(card.homeScore);
  const homeWins = card.statusKind === 'final' && card.awayScore != null && card.homeScore != null && Number(card.homeScore) > Number(card.awayScore);

  const awayNameColor = card.statusKind === 'final' ? (awayWins ? '#edf2f8' : '#60748a') : '#c8d4e0';
  const homeNameColor = card.statusKind === 'final' ? (homeWins ? '#edf2f8' : '#60748a') : '#c8d4e0';
  const awayNameWeight = awayWins ? '700' : '500';
  const homeNameWeight = homeWins ? '700' : '500';

  // ── Line info row
  const lineItems = [card.spread ? `Spread: ${card.spread}` : null, card.ou || null].filter(Boolean);
  const lineRow = lineItems.length > 0
    ? `<tr>
        <td colspan="2" style="padding:0 ${compact ? 14 : 16}px ${compact ? 8 : 10}px;font-size:11px;color:#4a7fa8;font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.4;">
          ${lineItems.join('&nbsp;&nbsp;&middot;&nbsp;&nbsp;')}
        </td>
      </tr>`
    : '';

  // ── Gamecast link
  const gamcastRow = card.gamcastUrl
    ? `<tr>
        <td colspan="2" style="padding:0 ${compact ? 14 : 16}px ${compact ? 9 : 11}px;">
          <a href="${card.gamcastUrl}" style="font-size:11px;color:#3C79B4;text-decoration:none;font-weight:600;font-family:'DM Sans',Arial,Helvetica,sans-serif;" target="_blank">View Gamecast &rarr;</a>
        </td>
      </tr>`
    : '';

  const teamNameFontSize = compact ? 12 : 13;
  const logoSize = compact ? 24 : 28;

  return `
<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
       style="background:${baseColor};border:1px solid rgba(255,255,255,0.09);border-radius:7px;border-collapse:collapse;overflow:hidden;">
  <tr>
    <td colspan="2" style="padding:${compact ? 10 : 12}px ${compact ? 14 : 16}px 8px;">
      ${statusChip}
    </td>
  </tr>
  <!-- Away team row -->
  <tr>
    <td style="padding:5px ${compact ? 14 : 16}px 4px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td valign="middle" style="width:${logoSize + 8}px;padding-right:8px;">${awayLogo}</td>
          <td valign="middle">
            <span style="font-size:${teamNameFontSize}px;font-weight:${awayNameWeight};color:${awayNameColor};font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.3;">${card.awayTeam}</span>
          </td>
        </tr>
      </table>
    </td>
    <td align="right" valign="middle" style="padding:5px ${compact ? 14 : 16}px 4px;white-space:nowrap;">
      ${awayScoreHtml}
    </td>
  </tr>
  <!-- Home team row -->
  <tr>
    <td style="padding:4px ${compact ? 14 : 16}px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td valign="middle" style="width:${logoSize + 8}px;padding-right:8px;">${homeLogo}</td>
          <td valign="middle">
            <span style="font-size:${teamNameFontSize}px;font-weight:${homeNameWeight};color:${homeNameColor};font-family:'DM Sans',Arial,Helvetica,sans-serif;line-height:1.3;">${card.homeTeam}</span>
          </td>
        </tr>
      </table>
    </td>
    <td align="right" valign="middle" style="padding:4px ${compact ? 14 : 16}px 8px;white-space:nowrap;">
      ${homeScoreHtml}
    </td>
  </tr>
  <!-- Divider -->
  ${lineRow || gamcastRow ? `<tr><td colspan="2" style="height:1px;background:rgba(255,255,255,0.06);font-size:0;line-height:0;">&nbsp;</td></tr>` : ''}
  ${lineRow}
  ${gamcastRow}
</table>`;
}

/**
 * Render a list of game cards wrapped in the standard section-td padding.
 * Used for "What to Watch" / scores sections.
 *
 * @param {Array} games - array of raw game objects
 * @param {object} [opts]
 * @param {number} [opts.max=3]         - max games to show
 * @param {boolean} [opts.compact=false] - use compact card variant
 * @returns {string} HTML string (complete <tr> rows ready to insert into email table)
 */
export function renderEmailGameList(games, opts = {}) {
  const { max = 3, compact = false } = opts;
  if (!Array.isArray(games) || games.length === 0) return '';

  const cards = games
    .slice(0, max)
    .map(g => renderEmailGameCard(g, { compact }))
    .filter(Boolean);

  if (cards.length === 0) return '';

  return cards.map(cardHtml => `
<tr>
  <td style="padding:0 24px 8px;" class="section-td">
    ${cardHtml}
  </td>
</tr>`).join('');
}
