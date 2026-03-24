/**
 * BaseballRobotAvatar — Maximus Sports mascot: baseball variant.
 * Same Maximus robot identity but posed as a baseball player mid-swing:
 * - baseball cap (colored to match jersey)
 * - button-up baseball jersey
 * - bat held in swing position
 * - dynamic, friendly pose
 * Enhanced with softer forms, richer shading, and more expressive features.
 */

export default function BaseballRobotAvatar({
  jerseyNumber = '',
  jerseyColor = '#1a2d3d',
  robotColor = '#4a90c4',
  size = 120,
  className = '',
}) {
  const displayText = jerseyNumber || 'M';
  const fontSize = displayText.length > 1 ? 14 : 17;
  const isLJ = isLight(jerseyColor);
  const textColor = isLJ ? '#1a2d3d' : '#ffffff';
  const trim = isLJ ? darken(jerseyColor, 0.15) : lighten(jerseyColor, 0.3);

  const bm = robotColor;
  const bl = lighten(robotColor, 0.18);
  const bd = darken(robotColor, 0.15);
  const bs = lighten(robotColor, 0.35);
  const oc = darken(robotColor, 0.3);
  const ck = lighten(robotColor, 0.28);

  return (
    <span className={className} style={{ width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 140 148" style={{ width: '100%', height: '100%' }} aria-hidden fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="bbHeadGrad" cx="0.4" cy="0.35" r="0.6">
            <stop offset="0%" stopColor={bs} stopOpacity="0.25" />
            <stop offset="100%" stopColor={bm} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bbCapGrad" cx="0.4" cy="0.3" r="0.7">
            <stop offset="0%" stopColor={lighten(jerseyColor, 0.12)} />
            <stop offset="100%" stopColor={jerseyColor} />
          </radialGradient>
        </defs>

        {/* === BAT (behind body) === */}
        <line x1="18" y1="42" x2="105" y2="68" stroke="#8B6914" strokeWidth="4" strokeLinecap="round" />
        <line x1="18" y1="42" x2="105" y2="68" stroke="#C4A24A" strokeWidth="2.5" strokeLinecap="round" />
        {/* Bat knob */}
        <circle cx="108" cy="69" r="3.5" fill="#6B4F10" stroke="#5A4010" strokeWidth="0.8" />
        {/* Bat barrel highlight */}
        <line x1="22" y1="41" x2="50" y2="50" stroke="#D4B85A" strokeWidth="1" strokeLinecap="round" opacity="0.5" />

        {/* === CAP === */}
        <ellipse cx="68" cy="30" rx="36" ry="8" fill="url(#bbCapGrad)" stroke={oc} strokeWidth="1.2" />
        <path d="M32 30 Q35 8 68 5 Q101 8 104 30" fill="url(#bbCapGrad)" stroke={oc} strokeWidth="1.4" />
        {/* Cap brim — pointing slightly forward */}
        <path d="M34 30 Q22 33 20 35 Q23 39 45 34 Q40 31 34 30Z" fill={trim} stroke={oc} strokeWidth="0.8" />
        {/* Cap button */}
        <circle cx="68" cy="5" r="2.5" fill={trim} stroke={oc} strokeWidth="0.6" />
        {/* Cap M logo */}
        <text x="68" y="19" textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="900" fill={textColor} fontFamily="'Oswald',sans-serif" opacity="0.75">M</text>

        {/* === HEAD === */}
        <ellipse cx="68" cy="40" rx="34" ry="26" fill={bm} stroke={oc} strokeWidth="1.8" />
        <ellipse cx="68" cy="40" rx="34" ry="26" fill="url(#bbHeadGrad)" />

        {/* Eye sockets — rounder, softer */}
        <ellipse cx="55" cy="42" rx="10" ry="8" fill={bd} stroke={oc} strokeWidth="0.7" />
        <ellipse cx="81" cy="42" rx="10" ry="8" fill={bd} stroke={oc} strokeWidth="0.7" />

        {/* Eyes — larger, more expressive */}
        <ellipse cx="55" cy="42" rx="7" ry="6" fill="#d0f0ff" />
        <ellipse cx="81" cy="42" rx="7" ry="6" fill="#d0f0ff" />
        {/* Eye highlights */}
        <ellipse cx="57" cy="40" rx="3" ry="2.5" fill="#ffffff" opacity="0.9" />
        <ellipse cx="83" cy="40" rx="3" ry="2.5" fill="#ffffff" opacity="0.9" />
        {/* Pupils — looking forward, confident */}
        <ellipse cx="54" cy="43" rx="2.8" ry="2.5" fill={oc} opacity="0.6" />
        <ellipse cx="80" cy="43" rx="2.8" ry="2.5" fill={oc} opacity="0.6" />
        {/* Tiny catchlights */}
        <circle cx="56" cy="40" r="1" fill="#ffffff" opacity="0.7" />
        <circle cx="82" cy="40" r="1" fill="#ffffff" opacity="0.7" />

        {/* Eyebrows — confident, slightly raised */}
        <path d="M46 35 Q53 31 62 34" stroke={oc} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        <path d="M74 34 Q83 31 90 35" stroke={oc} strokeWidth="1.4" fill="none" strokeLinecap="round" />

        {/* Cheeks — warm blush */}
        <ellipse cx="43" cy="50" rx="5" ry="3" fill={ck} opacity="0.25" />
        <ellipse cx="93" cy="50" rx="5" ry="3" fill={ck} opacity="0.25" />

        {/* Nose */}
        <path d="M66 49 L68 51 L70 49" stroke={oc} strokeWidth="1" fill="none" strokeLinecap="round" />

        {/* Big happy smile — wider, more expressive */}
        <path d="M52 54 Q60 62 68 62 Q76 62 84 54" stroke={oc} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M54 55 Q68 63 82 55 Q68 60 54 55Z" fill="#ffffff" opacity="0.92" />

        {/* Ear panels */}
        <rect x="32" y="38" width="5" height="9" rx="2.5" fill={bd} stroke={oc} strokeWidth="0.8" />
        <rect x="99" y="38" width="5" height="9" rx="2.5" fill={bd} stroke={oc} strokeWidth="0.8" />

        {/* === NECK === */}
        <rect x="58" y="64" width="20" height="6" rx="3" fill={bd} stroke={oc} strokeWidth="0.8" />

        {/* === JERSEY === */}
        <path
          d="M40 69 L30 80 L40 84 L40 114 L96 114 L96 84 L106 80 L96 69 L84 76 C78 80 58 80 52 76 Z"
          fill={jerseyColor} stroke={oc} strokeWidth="1.5" strokeLinejoin="round"
        />
        {/* Collar — V-neck */}
        <path d="M58 76 L68 85 L78 76" stroke={trim} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        {/* Button line */}
        <line x1="68" y1="85" x2="68" y2="112" stroke={trim} strokeWidth="0.8" opacity="0.4" />
        <circle cx="68" cy="90" r="1" fill={trim} opacity="0.5" />
        <circle cx="68" cy="96" r="1" fill={trim} opacity="0.5" />
        <circle cx="68" cy="102" r="1" fill={trim} opacity="0.5" />
        {/* Bottom trim */}
        <line x1="40" y1="112" x2="96" y2="112" stroke={trim} strokeWidth="2" />
        {/* Arm trim */}
        <path d="M40 84 L40 71" stroke={trim} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M96 84 L96 71" stroke={trim} strokeWidth="1.5" strokeLinecap="round" />

        {/* Jersey number — left chest */}
        <text x="54" y="96" textAnchor="middle" dominantBaseline="middle"
          fontSize={fontSize} fontWeight="800" fontFamily="'Oswald','Impact',sans-serif"
          fill={textColor} letterSpacing="0.02em">{displayText}</text>

        {/* === LEFT ARM — gripping bat (swing follow-through) === */}
        <path d="M30 80 L20 72 L16 64" fill="none" stroke={oc} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M30 80 L21 73" fill={bm} stroke={oc} strokeWidth="1.5" />
        <circle cx="24" cy="76" r="2.8" fill={bl} stroke={oc} strokeWidth="0.8" />
        {/* Hand on bat */}
        <circle cx="16" cy="63" r="4.5" fill={bl} stroke={oc} strokeWidth="0.8" />
        <line x1="13" y1="60" x2="12" y2="58" stroke={oc} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="16" y1="59" x2="16" y2="57" stroke={oc} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="19" y1="60" x2="20" y2="58" stroke={oc} strokeWidth="0.8" strokeLinecap="round" />

        {/* === RIGHT ARM — follow-through of swing === */}
        <path d="M106 80 L116 70 L122 60" fill="none" stroke={oc} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M106 80 L115 71" fill={bm} stroke={oc} strokeWidth="1.5" />
        <circle cx="111" cy="75" r="2.8" fill={bl} stroke={oc} strokeWidth="0.8" />
        {/* Hand on bat */}
        <circle cx="122" cy="58" r="4.5" fill={bl} stroke={oc} strokeWidth="0.8" />
        <line x1="119" y1="55" x2="118" y2="53" stroke={oc} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="122" y1="54" x2="122" y2="52" stroke={oc} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="125" y1="55" x2="126" y2="53" stroke={oc} strokeWidth="0.8" strokeLinecap="round" />

        {/* === BELT === */}
        <rect x="48" y="114" width="40" height="5" rx="2" fill={bd} stroke={oc} strokeWidth="0.8" />
        <circle cx="68" cy="116.5" r="2" fill={bs} stroke={oc} strokeWidth="0.5" />

        {/* === LEGS — baseball pants === */}
        <rect x="51" y="119" width="13" height="11" rx="4" fill="#e8edf2" stroke={oc} strokeWidth="0.8" />
        <rect x="72" y="119" width="13" height="11" rx="4" fill="#e8edf2" stroke={oc} strokeWidth="0.8" />

        {/* === CLEATS === */}
        <path d="M49 130 L49 135 Q49 138 51 138 L66 138 Q68 138 68 136 L68 130Z" fill="#2a2a2a" stroke={oc} strokeWidth="0.8" />
        <path d="M68 130 L68 135 Q68 138 70 138 L85 138 Q87 138 87 136 L87 130Z" fill="#2a2a2a" stroke={oc} strokeWidth="0.8" />
        <line x1="49" y1="134" x2="68" y2="134" stroke={bm} strokeWidth="1.5" />
        <line x1="68" y1="134" x2="87" y2="134" stroke={bm} strokeWidth="1.5" />
      </svg>
    </span>
  );
}

function isLight(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}
function lighten(hex, a) { return adj(hex, a); }
function darken(hex, a) { return adj(hex, -a); }
function adj(hex, a) {
  const c = hex.replace('#', '');
  const r = Math.min(255, Math.max(0, parseInt(c.substring(0, 2), 16) + Math.round(255 * a)));
  const g = Math.min(255, Math.max(0, parseInt(c.substring(2, 4), 16) + Math.round(255 * a)));
  const b = Math.min(255, Math.max(0, parseInt(c.substring(4, 6), 16) + Math.round(255 * a)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
