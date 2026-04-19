/**
 * Conviction tier labeling — product language layered on top of the numeric
 * 0–100 conviction score.
 *
 *   90+    → Elite      (exceptional edge)
 *   80–89  → Strong     (high-quality edge)
 *   70–79  → Solid      (confident bet)
 *   < 70   → Lean       (directional value)
 *
 * Every surface that renders a conviction value should also render this label
 * so the score is interpretable without a scale reference.
 */

export function convictionTier(score) {
  const n = Number(score || 0);
  if (n >= 90) return { label: 'Elite',  variant: 'elite',  minScore: 90 };
  if (n >= 80) return { label: 'Strong', variant: 'strong', minScore: 80 };
  if (n >= 70) return { label: 'Solid',  variant: 'solid',  minScore: 70 };
  return             { label: 'Lean',   variant: 'lean',   minScore: 0 };
}

/** Short description used in tooltips / aria-labels. */
export function convictionDescription(score) {
  const t = convictionTier(score);
  const descByVariant = {
    elite:  'Exceptional edge — highest conviction band.',
    strong: 'High-quality edge with strong model and situational support.',
    solid:  'Confident bet — above threshold on every component.',
    lean:   'Directional value — not a standalone bet.',
  };
  return `${t.label} (${Math.round(Number(score) || 0)}/100) — ${descByVariant[t.variant]}`;
}
