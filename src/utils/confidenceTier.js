/**
 * Shared confidence-tier classifier for matchup predictions.
 *
 * Provides consistent conviction / toss-up / upset indicators across
 * Bracketology and IG game intel cards.
 *
 * Tiers (based on predicted-winner probability):
 *   conviction  — >= 70%  "MODEL EDGE" — strong Maximus signal
 *   tossUp      — 60–69%  "TOSS-UP" — competitive, roll-of-the-dice
 *   lean        — 55–59%  "SLIGHT EDGE" — low edge, could go either way
 *   upsetAlert  — isUpset  "UPSET ALERT" — model picks the lower seed
 *
 * When winProbability < 55% and no upset flag, falls back to tossUp.
 */

export const TIERS = {
  conviction: {
    id: 'conviction',
    label: 'MODEL EDGE',
    shortLabel: '◆',
    icon: '◆',
    cssClass: 'tierConviction',
    igColor: { text: '#5FE8A8', bg: 'rgba(95,232,168,0.12)', border: 'rgba(95,232,168,0.30)' },
  },
  tossUp: {
    id: 'tossUp',
    label: 'TOSS-UP',
    shortLabel: '\u2684',
    icon: '\u2684',
    cssClass: 'tierTossUp',
    igColor: { text: '#8EAFC4', bg: 'rgba(142,175,196,0.12)', border: 'rgba(142,175,196,0.30)' },
  },
  upsetAlert: {
    id: 'upsetAlert',
    label: 'UPSET ALERT',
    shortLabel: '\u25B2',
    icon: '\u25B2',
    cssClass: 'tierUpset',
    igColor: { text: '#E8845F', bg: 'rgba(232,132,95,0.14)', border: 'rgba(232,132,95,0.30)' },
  },
  lean: {
    id: 'lean',
    label: 'SLIGHT EDGE',
    shortLabel: '\u2192',
    icon: '\u2192',
    cssClass: 'tierLean',
    igColor: { text: '#D4B87A', bg: 'rgba(212,184,122,0.12)', border: 'rgba(212,184,122,0.30)' },
  },
};

/**
 * Classify a prediction into a confidence tier.
 *
 * @param {number} winProbability — predicted winner's probability (0–1)
 * @param {boolean} [isUpset=false] — model picks the lower-seeded team
 * @returns {{ id, label, shortLabel, icon, cssClass, igColor }}
 */
export function getConfidenceTier(winProbability, isUpset = false) {
  const pct = (winProbability ?? 0.5) * 100;

  if (isUpset) return TIERS.upsetAlert;
  if (pct >= 70) return TIERS.conviction;
  if (pct >= 60) return TIERS.tossUp;
  if (pct >= 55) return TIERS.lean;
  return TIERS.tossUp;
}
