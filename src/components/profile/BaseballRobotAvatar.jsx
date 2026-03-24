/**
 * BaseballRobotAvatar — Maximus Sports mascot: baseball variant.
 * Same friendly robot face/body as basketball version, but with:
 * - baseball cap (colored to match jersey)
 * - baseball jersey (button-up style)
 * - baseball in left hand instead of basketball
 * - baseball glove on right hand
 *
 * Shares the same color system, sizing, and customization props.
 */

export default function BaseballRobotAvatar({
  jerseyNumber = '',
  jerseyColor = '#1a2d3d',
  robotColor = '#4a90c4',
  size = 120,
  className = '',
  glow = false,
}) {
  const displayText = jerseyNumber || 'M';
  const fontSize = displayText.length > 1 ? 16 : 20;
  const isLightJersey = isLight(jerseyColor);
  const textColor = isLightJersey ? '#1a2d3d' : '#ffffff';
  const jerseyTrim = isLightJersey ? darken(jerseyColor, 0.15) : lighten(jerseyColor, 0.3);

  const bodyMain = robotColor;
  const bodyLight = lighten(robotColor, 0.18);
  const bodyDark = darken(robotColor, 0.15);
  const bodyShine = lighten(robotColor, 0.35);
  const outlineColor = darken(robotColor, 0.3);
  const cheekColor = lighten(robotColor, 0.28);

  return (
    <span
      className={`${className}`}
      style={{
        width: size, height: size, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        ...(glow ? { filter: 'drop-shadow(0 0 6px rgba(74,144,196,0.35))' } : {}),
      }}
    >
      <svg
        viewBox="0 0 130 140"
        style={{ width: '100%', height: '100%' }}
        aria-hidden
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Baseball Cap — sits on top of head */}
        <ellipse cx="63" cy="28" rx="35" ry="8" fill={jerseyColor} stroke={outlineColor} strokeWidth="1.2" />
        <path d="M28 28 Q30 8 63 6 Q96 8 98 28" fill={jerseyColor} stroke={outlineColor} strokeWidth="1.5" />
        {/* Cap brim */}
        <path d="M30 28 Q20 30 18 32 Q20 36 40 32 Q35 30 30 28Z" fill={jerseyTrim} stroke={outlineColor} strokeWidth="0.8" />
        {/* Cap button */}
        <circle cx="63" cy="6" r="2.5" fill={jerseyTrim} stroke={outlineColor} strokeWidth="0.7" />
        {/* Cap M logo */}
        <text x="63" y="18" textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="900" fill={textColor} fontFamily="'Oswald',sans-serif" opacity="0.8">M</text>

        {/* Head — large round toddler dome (slightly covered by cap) */}
        <ellipse cx="63" cy="38" rx="33" ry="25" fill={bodyMain} stroke={outlineColor} strokeWidth="1.8" />
        <ellipse cx="55" cy="30" rx="16" ry="8" fill={bodyShine} opacity="0.15" />

        {/* Eye sockets */}
        <path d="M41 38 L51 34 L59 38 L59 46 L51 49 L41 46Z" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />
        <path d="M67 38 L75 34 L85 38 L85 46 L75 49 L67 46Z" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />

        {/* Eyes */}
        <ellipse cx="50" cy="42" rx="6" ry="5" fill="#c0e8ff" />
        <ellipse cx="76" cy="42" rx="6" ry="5" fill="#c0e8ff" />
        <ellipse cx="52" cy="40" rx="2.5" ry="2" fill="#ffffff" opacity="0.85" />
        <ellipse cx="78" cy="40" rx="2.5" ry="2" fill="#ffffff" opacity="0.85" />
        <ellipse cx="49" cy="43" rx="2.2" ry="2" fill={outlineColor} opacity="0.55" />
        <ellipse cx="75" cy="43" rx="2.2" ry="2" fill={outlineColor} opacity="0.55" />

        {/* Eyebrows */}
        <path d="M43 35 Q50 32 57 35" stroke={outlineColor} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M69 35 Q76 32 83 35" stroke={outlineColor} strokeWidth="1.2" fill="none" strokeLinecap="round" />

        {/* Blush cheeks */}
        <ellipse cx="41" cy="49" rx="4" ry="2.5" fill={cheekColor} opacity="0.3" />
        <ellipse cx="85" cy="49" rx="4" ry="2.5" fill={cheekColor} opacity="0.3" />

        {/* Nose */}
        <path d="M61 48 L63 50 L65 48" stroke={outlineColor} strokeWidth="0.9" fill="none" strokeLinecap="round" />

        {/* Big smile */}
        <path d="M49 53 Q56 60 63 60 Q70 60 77 53" stroke={outlineColor} strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M51 54 Q63 61 75 54 Q63 58 51 54Z" fill="#ffffff" opacity="0.9" />

        {/* Ear panels */}
        <rect x="28" y="36" width="5" height="9" rx="2" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />
        <rect x="93" y="36" width="5" height="9" rx="2" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />

        {/* Neck */}
        <rect x="53" y="62" width="20" height="6" rx="3" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />
        <line x1="58" y1="63.5" x2="58" y2="66.5" stroke={outlineColor} strokeWidth="0.5" opacity="0.4" />
        <line x1="63" y1="63.5" x2="63" y2="66.5" stroke={outlineColor} strokeWidth="0.5" opacity="0.4" />
        <line x1="68" y1="63.5" x2="68" y2="66.5" stroke={outlineColor} strokeWidth="0.5" opacity="0.4" />

        {/* Baseball Jersey — button-up style */}
        <path
          d="M36 67 L28 77 L36 81 L36 110 L90 110 L90 81 L98 77 L90 67 L79 73 C73 77 53 77 47 73 Z"
          fill={jerseyColor}
          stroke={outlineColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Collar — V-neck baseball style */}
        <path d="M53 73 L63 82 L73 73" stroke={jerseyTrim} strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* Button line */}
        <line x1="63" y1="82" x2="63" y2="108" stroke={jerseyTrim} strokeWidth="1" opacity="0.5" />
        {/* Buttons */}
        <circle cx="63" cy="87" r="1.2" fill={jerseyTrim} opacity="0.6" />
        <circle cx="63" cy="93" r="1.2" fill={jerseyTrim} opacity="0.6" />
        <circle cx="63" cy="99" r="1.2" fill={jerseyTrim} opacity="0.6" />
        {/* Jersey trim — bottom */}
        <line x1="36" y1="108" x2="90" y2="108" stroke={jerseyTrim} strokeWidth="2" />
        {/* Jersey trim — armholes */}
        <path d="M36 81 L36 69" stroke={jerseyTrim} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M90 81 L90 69" stroke={jerseyTrim} strokeWidth="1.5" strokeLinecap="round" />

        {/* Jersey number — on left chest */}
        <text
          x="50"
          y="92"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={fontSize * 0.85}
          fontWeight="800"
          fontFamily="'Oswald', 'Impact', sans-serif"
          fill={textColor}
          letterSpacing="0.02em"
        >
          {displayText}
        </text>

        {/* LEFT ARM: holding a baseball */}
        <path d="M28 77 L17 69 L12 63" fill="none" stroke={outlineColor} strokeWidth="1.3" strokeLinecap="round" />
        <path d="M28 77 L18 70" fill={bodyMain} stroke={outlineColor} strokeWidth="1.3" strokeLinejoin="round" />
        <circle cx="21" cy="73" r="2.5" fill={bodyLight} stroke={outlineColor} strokeWidth="0.8" />
        <circle cx="12" cy="61" r="4" fill={bodyLight} stroke={outlineColor} strokeWidth="0.8" />
        <line x1="9" y1="59" x2="8" y2="57" stroke={outlineColor} strokeWidth="0.7" strokeLinecap="round" />
        <line x1="12" y1="58" x2="12" y2="55" stroke={outlineColor} strokeWidth="0.7" strokeLinecap="round" />
        <line x1="15" y1="59" x2="16" y2="57" stroke={outlineColor} strokeWidth="0.7" strokeLinecap="round" />

        {/* Baseball */}
        <circle cx="12" cy="49" r="7" fill="#f5f5f0" stroke="#cc0000" strokeWidth="0.8" />
        <path d="M7 44 Q10 48 7 54" stroke="#cc0000" strokeWidth="0.7" fill="none" />
        <path d="M17 44 Q14 48 17 54" stroke="#cc0000" strokeWidth="0.7" fill="none" />
        {/* Stitch marks */}
        <line x1="7.5" y1="45" x2="8.5" y2="46" stroke="#cc0000" strokeWidth="0.4" />
        <line x1="7" y1="47" x2="8" y2="48" stroke="#cc0000" strokeWidth="0.4" />
        <line x1="7" y1="50" x2="8" y2="51" stroke="#cc0000" strokeWidth="0.4" />
        <line x1="7.5" y1="52.5" x2="8.5" y2="53.5" stroke="#cc0000" strokeWidth="0.4" />
        <line x1="16.5" y1="45" x2="15.5" y2="46" stroke="#cc0000" strokeWidth="0.4" />
        <line x1="17" y1="47" x2="16" y2="48" stroke="#cc0000" strokeWidth="0.4" />
        <line x1="17" y1="50" x2="16" y2="51" stroke="#cc0000" strokeWidth="0.4" />
        <line x1="16.5" y1="52.5" x2="15.5" y2="53.5" stroke="#cc0000" strokeWidth="0.4" />

        {/* RIGHT ARM: waving with glove */}
        <path d="M98 77 L109 65 L117 55" fill="none" stroke={outlineColor} strokeWidth="1.3" strokeLinecap="round" />
        <path d="M98 77 L108 66" fill={bodyMain} stroke={outlineColor} strokeWidth="1.3" strokeLinejoin="round" />
        <circle cx="104" cy="71" r="2.5" fill={bodyLight} stroke={outlineColor} strokeWidth="0.8" />
        {/* Baseball glove */}
        <ellipse cx="117" cy="53" rx="6" ry="5.5" fill="#8B4513" stroke="#5C2E0A" strokeWidth="1" />
        <path d="M113 49 L112 46" stroke="#5C2E0A" strokeWidth="0.8" strokeLinecap="round" />
        <path d="M116" y1="48" x2="115" y2="44" stroke="#5C2E0A" strokeWidth="0.8" strokeLinecap="round" />
        <ellipse cx="117" cy="53" rx="3.5" ry="3" fill="#A0522D" opacity="0.5" />

        {/* Waist / belt */}
        <rect x="44" y="110" width="38" height="5" rx="2" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />

        {/* Legs — baseball pants */}
        <rect x="47" y="115" width="12" height="10" rx="3" fill="#e8edf2" stroke={outlineColor} strokeWidth="0.8" />
        <rect x="67" y="115" width="12" height="10" rx="3" fill="#e8edf2" stroke={outlineColor} strokeWidth="0.8" />

        {/* Cleats */}
        <path d="M45 125 L45 130 Q45 133 47 133 L61 133 Q63 133 63 131 L63 125Z" fill="#2a2a2a" stroke={outlineColor} strokeWidth="0.8" />
        <path d="M63 125 L63 130 Q63 133 65 133 L79 133 Q81 133 81 131 L81 125Z" fill="#2a2a2a" stroke={outlineColor} strokeWidth="0.8" />
        <line x1="45" y1="129" x2="63" y2="129" stroke={bodyMain} strokeWidth="1.5" />
        <line x1="63" y1="129" x2="81" y2="129" stroke={bodyMain} strokeWidth="1.5" />
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
function lighten(hex, amount) { return adjustColor(hex, amount); }
function darken(hex, amount) { return adjustColor(hex, -amount); }
function adjustColor(hex, amount) {
  const c = hex.replace('#', '');
  const r = Math.min(255, Math.max(0, parseInt(c.substring(0, 2), 16) + Math.round(255 * amount)));
  const g = Math.min(255, Math.max(0, parseInt(c.substring(2, 4), 16) + Math.round(255 * amount)));
  const b = Math.min(255, Math.max(0, parseInt(c.substring(4, 6), 16) + Math.round(255 * amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
