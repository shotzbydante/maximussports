/**
 * Embedded / In-App Browser Detection & Platform Helpers
 *
 * Google blocks OAuth from WebViews (403 disallowed_useragent).
 * This module detects in-app browsers so we can intercept before
 * the user ever hits Google's error page.
 */

const ua = () =>
  typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';

const EMBEDDED_PATTERNS = [
  /FBAN/i,                // Facebook app
  /FBAV/i,                // Facebook app (version)
  /FB_IAB/i,              // Facebook in-app browser
  /Instagram/i,           // Instagram
  /LinkedInApp/i,         // LinkedIn
  /Twitter/i,             // Twitter / X app
  /BytedanceWebview/i,    // TikTok (Android)
  /musical_ly/i,          // TikTok (legacy)
  /TikTok/i,              // TikTok
  /Snapchat/i,            // Snapchat
  /Pinterest/i,           // Pinterest
  /\bLine\//i,            // LINE messenger
  /\bwv\b/i,              // Generic Android WebView flag
  /\bMessenger\b/i,       // Facebook Messenger
];

/**
 * Returns true if the current browser is an embedded/in-app WebView
 * that Google will reject for OAuth.
 */
export function isEmbeddedBrowser() {
  if (typeof navigator === 'undefined') return false;
  const agent = ua();
  if (!agent) return false;

  if (EMBEDDED_PATTERNS.some((re) => re.test(agent))) return true;

  // iOS WebView: lacks "Safari" token but has AppleWebKit
  if (/iPhone|iPad|iPod/i.test(agent) && /AppleWebKit/i.test(agent) && !/Safari/i.test(agent)) {
    return true;
  }
  // Android WebView: Version/X.X signals system WebView
  if (/Android/i.test(agent) && /Version\/[\d.]+/i.test(agent) && !/Chrome\/[\d.]+/i.test(agent)) {
    return true;
  }

  return false;
}

/**
 * Detect the source app name from the user agent, for analytics.
 */
export function getEmbeddedSource() {
  const agent = ua();
  if (/LinkedInApp/i.test(agent)) return 'linkedin';
  if (/Instagram/i.test(agent)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(agent)) return 'facebook';
  if (/\bMessenger\b/i.test(agent)) return 'messenger';
  if (/Twitter/i.test(agent)) return 'twitter';
  if (/TikTok|BytedanceWebview|musical_ly/i.test(agent)) return 'tiktok';
  if (/Snapchat/i.test(agent)) return 'snapchat';
  if (/Pinterest/i.test(agent)) return 'pinterest';
  return 'unknown_webview';
}

/**
 * Detect the user's platform for smart CTA labels.
 */
export function getPlatform() {
  const agent = ua();
  if (/iPhone|iPad|iPod/i.test(agent)) return 'ios';
  if (/Android/i.test(agent)) return 'android';
  return 'desktop';
}

/**
 * Returns a platform-appropriate browser label for the CTA button.
 */
export function getPreferredBrowserLabel() {
  const platform = getPlatform();
  if (platform === 'ios') return 'Open in Safari';
  if (platform === 'android') return 'Open in Chrome';
  return 'Open in browser';
}

/**
 * Returns platform-specific helper text for fallback instructions.
 */
export function getFallbackInstructions() {
  const platform = getPlatform();
  if (platform === 'ios') return 'Tap the share icon \u2192 "Open in Safari"';
  if (platform === 'android') return 'Tap \u22EE \u2192 "Open in Chrome"';
  return 'Copy the link and paste it into your browser';
}

/**
 * Best-effort attempt to open the current page in the device's default browser.
 * WebViews are restrictive, so this may not always work.
 */
export function openInExternalBrowser() {
  const url = buildExternalUrl();
  const platform = getPlatform();

  // Android intent: explicit Chrome target
  if (platform === 'android') {
    try {
      const intentUrl =
        `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
      window.location.href = intentUrl;
      return true;
    } catch { /* fall through */ }
  }

  // iOS: x-safari-https scheme (works from some WebViews)
  if (platform === 'ios') {
    try {
      window.location.href = `x-safari-https://${url.replace(/^https?:\/\//, '')}`;
      return true;
    } catch { /* fall through */ }
  }

  // Generic fallback
  try {
    const opened = window.open(url, '_system') || window.open(url, '_blank');
    if (opened) return true;
  } catch { /* fall through */ }

  try {
    window.location.href = url;
    return true;
  } catch { /* fall through */ }

  return false;
}

function buildExternalUrl() {
  const base = window.location.origin + window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  params.set('openExternal', 'true');
  return `${base}?${params.toString()}`;
}
