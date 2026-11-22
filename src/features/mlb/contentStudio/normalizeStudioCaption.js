/**
 * normalizeStudioCaption — single source of truth for Content Studio
 * caption output shape.
 *
 * Every Content Studio flow (Dashboard preview, InstagramPublishButton,
 * client publish helpers, autopost cron) consumes this normalized shape
 * so there is never contract drift between builders and consumers.
 *
 * Input: raw builder output of ANY supported shape:
 *   { shortCaption, longCaption, hashtags }      (buildMlbCaption output)
 *   { caption, hashtags }                        (legacy section builder)
 *   { body, hashtags }                           (NCAAM buildCaption output)
 *   null / undefined                             (build failure)
 *
 * Output:
 *   {
 *     fullCaption: string,       // body + '\n\n' + hashtag line — NEVER empty if ok
 *     shortCaption: string|null, // preserved for back-compat
 *     longCaption:  string|null, // preserved for back-compat
 *     hashtags:     string[],
 *     bodyLength:   number,
 *     totalLength:  number,
 *     ok:           boolean,     // true iff fullCaption is publish-ready
 *     reason:       string|null, // when ok=false, one of:
 *                                //   'null_builder_output' | 'missing_body' |
 *                                //   'too_short' | 'banned_phrase' | 'unknown_shape'
 *   }
 */

// Minimum chars for a publishable caption. Matches server-side guards in
// /api/social/instagram/publish{,-carousel}.js so all layers agree.
import { findVoiceIssues, ensureResponsibleLine } from '../../contentStudio/voice.js';

export const MIN_PUBLISHABLE_CAPTION_CHARS = 80;

export function normalizeStudioCaption(raw) {
  if (raw == null) {
    return {
      fullCaption: '',
      shortCaption: null,
      longCaption: null,
      hashtags: [],
      bodyLength: 0,
      totalLength: 0,
      ok: false,
      reason: 'null_builder_output',
    };
  }

  // Extract body, tolerating the three shapes we know about.
  let body = null;
  if (typeof raw === 'string') {
    body = raw;
  } else if (typeof raw === 'object') {
    body = raw.shortCaption ?? raw.longCaption ?? raw.caption ?? raw.body ?? null;
  }

  if (!body || typeof body !== 'string') {
    return {
      fullCaption: '',
      shortCaption: raw?.shortCaption ?? null,
      longCaption: raw?.longCaption ?? null,
      hashtags: Array.isArray(raw?.hashtags) ? raw.hashtags : [],
      bodyLength: 0,
      totalLength: 0,
      ok: false,
      reason: 'missing_body',
    };
  }

  const hashtags = Array.isArray(raw?.hashtags) ? raw.hashtags.filter(Boolean) : [];
  const hashtagLine = hashtags.join(' ');
  // Voice rules apply to every sport: the age-and-help line is always there,
  // and a caption that promises an outcome is not publishable.
  const bodyTrim = ensureResponsibleLine(body);
  const fullCaption = hashtagLine ? `${bodyTrim}\n\n${hashtagLine}` : bodyTrim;
  const voiceIssues = findVoiceIssues(fullCaption);

  const bodyLength = bodyTrim.length;
  const totalLength = fullCaption.length;
  const longEnough = totalLength >= MIN_PUBLISHABLE_CAPTION_CHARS;
  const ok = longEnough && voiceIssues.length === 0;

  return {
    fullCaption,
    shortCaption: raw?.shortCaption ?? body,
    longCaption:  raw?.longCaption  ?? body,
    hashtags,
    bodyLength,
    totalLength,
    ok,
    reason: ok ? null : (longEnough ? 'banned_phrase' : 'too_short'),
    voiceIssues,
  };
}

/**
 * Assemble the final string sent to the Instagram publish API. Use this
 * single helper wherever a final caption is constructed — preview UI,
 * publish button, client helper, autopost — so no layer ever concatenates
 * body + hashtags differently.
 */
export function buildFinalInstagramCaption(normalized) {
  if (!normalized || !normalized.ok) return '';
  return normalized.fullCaption;
}
