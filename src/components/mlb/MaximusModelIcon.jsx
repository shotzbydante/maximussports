/**
 * MaximusModelIcon — proprietary model icon for Maximus intelligence surfaces.
 *
 * A custom SVG combining a neural-network node pattern with a rising
 * chart line and precision crosshair — evoking intelligence, prediction,
 * and analytical precision. Works at 14–32px.
 */
export default function MaximusModelIcon({ size = 18, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Rising trend line */}
      <path
        d="M3 17L8 12L12 14L21 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Precision dot at peak */}
      <circle cx="21" cy="6" r="2.5" fill="currentColor" opacity="0.85" />
      {/* Signal pulse rings */}
      <circle cx="21" cy="6" r="4.5" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
      {/* Data nodes along the line */}
      <circle cx="8" cy="12" r="1.5" fill="currentColor" opacity="0.6" />
      <circle cx="12" cy="14" r="1.5" fill="currentColor" opacity="0.6" />
      {/* Base grid line */}
      <line x1="3" y1="20" x2="21" y2="20" stroke="currentColor" strokeWidth="0.8" opacity="0.2" />
    </svg>
  );
}
