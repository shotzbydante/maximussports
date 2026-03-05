/* global process */
/**
 * News deduplication for email templates.
 *
 * Strategy (applied in order):
 *  1. Canonical URL key — normalize href (lowercase, strip utm/tracking params, trailing slash)
 *  2. Normalized title key — lowercase, no punctuation (covers same story from diff feeds)
 *
 * Keeps the FIRST occurrence (assumes input is sorted newest-first).
 * Returns decoded items (HTML entities in titles resolved to real chars).
 */

import { decodeHtmlEntities, normalizeForDedupe } from './text.js';

/**
 * Normalize a URL for use as a deduplication key.
 * Strips utm_* and common tracking query params; normalizes protocol/case.
 *
 * @param {string} url
 * @returns {string}
 */
function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url.trim());
    // Remove common tracking params
    const STRIP = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
                   'ref', 'referrer', 'source', 'cid', 'mc_cid', 'mc_eid'];
    for (const p of STRIP) u.searchParams.delete(p);
    // Normalize: lowercase host, remove trailing slash from pathname
    u.hostname = u.hostname.toLowerCase();
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    // Drop fragment
    u.hash = '';
    return u.toString().toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * Deduplicate an array of news items.
 *
 * Items are expected to have shape: { title, link, pubDate, source }
 * Entities in title are decoded before returning.
 *
 * @param {Array<{title?:string, link?:string, pubDate?:string, source?:string}>} items
 * @returns {Array}
 */
export function dedupeNewsItems(items) {
  if (!Array.isArray(items)) return [];

  const seenUrls = new Set();
  const seenTitles = new Set();
  const result = [];
  let removedCount = 0;

  for (const item of items) {
    const urlKey = normalizeUrl(item.link || '');
    const titleKey = normalizeForDedupe(item.title || '');

    // Skip if we've seen this URL or title before
    if (urlKey && seenUrls.has(urlKey)) { removedCount++; continue; }
    if (titleKey && seenTitles.has(titleKey)) { removedCount++; continue; }

    if (urlKey) seenUrls.add(urlKey);
    if (titleKey) seenTitles.add(titleKey);

    // Decode HTML entities in title before emitting
    result.push({
      ...item,
      title: decodeHtmlEntities(item.title || ''),
    });
  }

  if (process.env?.NODE_ENV !== 'production' && removedCount > 0) {
    console.log(`[newsDedupe] removed ${removedCount} duplicate(s) from ${items.length} items → ${result.length} unique`);
  }

  return result;
}
