/**
 * Feature Spotlight Reel — template configuration.
 *
 * Structure: branded intro → trimmed demo footage with text beats → CTA outro.
 * Output: 1080×1920 9:16, 30 fps, silent H.264 MP4.
 *
 * Safe zones follow IG Reels chrome placement:
 *   top    0–15 %  → unsafe (camera / story icons)
 *   middle 15–78 % → safe for content
 *   bottom 78–100% → unsafe (username / captions / actions)
 */

export const FEATURE_SPOTLIGHT = {
  id: 'feature-spotlight',
  name: 'Feature Spotlight',
  description: 'Branded intro → product demo → CTA outro',

  width: 1080,
  height: 1920,
  fps: 30,

  scenes: {
    intro: { durationMs: 1500 },
    footage: { defaultDurationMs: 9000, minMs: 4000, maxMs: 12000 },
    outro: { durationMs: 2000 },
  },

  safeZone: {
    top: 0.15,
    bottom: 0.78,
  },

  overlays: [
    {
      id: 'headline',
      field: 'headline',
      startPct: 0.08,
      endPct: 0.45,
      fadeMs: 300,
      yPct: 0.20,
      maxFontSize: 52,
      lineHeight: 1.25,
    },
    {
      id: 'subhead',
      field: 'subhead',
      startPct: 0.50,
      endPct: 0.88,
      fadeMs: 300,
      yPct: 0.20,
      maxFontSize: 40,
      lineHeight: 1.3,
    },
  ],

  brand: {
    logo: '/logo.png',
    name: 'MAXIMUS SPORTS',
    url: 'maximussports.ai',
    accentColor: '#3C79B4',
    gradientStart: '#0a0e1a',
    gradientEnd: '#131c30',
  },
};

export const TEMPLATES = [FEATURE_SPOTLIGHT];

export function getTemplate(id) {
  return TEMPLATES.find(t => t.id === id) || FEATURE_SPOTLIGHT;
}
