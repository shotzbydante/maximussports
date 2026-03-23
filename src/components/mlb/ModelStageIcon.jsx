/**
 * ModelStageIcon — custom SVG icons for each Maximus model methodology stage.
 * All icons share a consistent stroke-based visual language.
 */

const ICONS = {
  'Historical Baseline': (
    <g>
      <rect x="3" y="10" width="3" height="8" rx="0.8" />
      <rect x="8.5" y="6" width="3" height="12" rx="0.8" />
      <rect x="14" y="3" width="3" height="15" rx="0.8" />
    </g>
  ),
  'Multi-Year Trend': (
    <g>
      <polyline points="2,16 7,11 11,13 18,4" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="14,4 18,4 18,8" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
  'Roster Quality': (
    <g>
      <path d="M10 2 L18 10 L10 18 L2 10 Z" fill="none" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="2.2" fill="currentColor" opacity="0.6" />
    </g>
  ),
  'Manager & Continuity': (
    <g>
      <rect x="3" y="3" width="14" height="14" rx="2" fill="none" strokeWidth="1.5" />
      <line x1="3" y1="7" x2="17" y2="7" strokeWidth="1.3" />
      <line x1="7" y1="7" x2="7" y2="17" strokeWidth="1.3" />
    </g>
  ),
  'Division & Schedule': (
    <g>
      <circle cx="10" cy="10" r="7.5" fill="none" strokeWidth="1.5" />
      <line x1="10" y1="2.5" x2="10" y2="17.5" strokeWidth="1.2" opacity="0.4" />
      <line x1="2.5" y1="10" x2="17.5" y2="10" strokeWidth="1.2" opacity="0.4" />
      <circle cx="10" cy="10" r="3" fill="none" strokeWidth="1.3" />
    </g>
  ),
  'Market Prior Blend': (
    <g>
      <polyline points="3,14 7,8 11,12 15,5 17,7" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="3" y1="17" x2="17" y2="17" strokeWidth="1.3" strokeLinecap="round" opacity="0.4" />
      <line x1="3" y1="4" x2="3" y2="17" strokeWidth="1.3" strokeLinecap="round" opacity="0.4" />
    </g>
  ),
};

export default function ModelStageIcon({ stage, size = 20, className = '' }) {
  const icon = ICONS[stage];
  if (!icon) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="currentColor"
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      {icon}
    </svg>
  );
}
