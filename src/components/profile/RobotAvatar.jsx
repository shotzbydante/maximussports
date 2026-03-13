/**
 * RobotAvatar — customizable Maximus Sports mascot avatar rendered as inline SVG.
 * Closely matches the 2D mascot: dome-headed robot with headband, expressive eyes,
 * wide smile, basketball jersey with trim, and robotic arms.
 *
 * Customizable: jerseyColor, robotColor, jerseyNumber.
 */
import styles from './RobotAvatar.module.css';

const DEFAULT_JERSEY_COLOR = '#1a2d3d';
const DEFAULT_ROBOT_COLOR = '#4a90c4';

export const JERSEY_COLORS = [
  { id: 'black',   hex: '#1a2d3d', label: 'Black' },
  { id: 'navy',    hex: '#1e3a5f', label: 'Navy' },
  { id: 'royal',   hex: '#2563eb', label: 'Royal Blue' },
  { id: 'crimson', hex: '#b91c1c', label: 'Crimson' },
  { id: 'forest',  hex: '#166534', label: 'Forest Green' },
  { id: 'orange',  hex: '#c2410c', label: 'Orange' },
  { id: 'purple',  hex: '#6d28d9', label: 'Purple' },
  { id: 'white',   hex: '#e8edf2', label: 'White' },
];

export const ROBOT_COLORS = [
  { id: 'blue',    hex: '#4a90c4', label: 'Blue' },
  { id: 'steel',   hex: '#6b7b8d', label: 'Steel Gray' },
  { id: 'silver',  hex: '#a8b8c8', label: 'Silver' },
  { id: 'teal',    hex: '#0d9488', label: 'Teal' },
  { id: 'indigo',  hex: '#4f46e5', label: 'Indigo' },
  { id: 'sunset',  hex: '#d97706', label: 'Orange' },
  { id: 'white',   hex: '#c8d4e0', label: 'White' },
];

export const DEFAULT_ROBOT_CONFIG = {
  jerseyNumber: '',
  jerseyColor: DEFAULT_JERSEY_COLOR,
  robotColor: DEFAULT_ROBOT_COLOR,
};

export default function RobotAvatar({
  jerseyNumber = '',
  jerseyColor = DEFAULT_JERSEY_COLOR,
  robotColor = DEFAULT_ROBOT_COLOR,
  size = 120,
  className = '',
  glow = false,
}) {
  const displayText = jerseyNumber || 'M';
  const fontSize = displayText.length > 1 ? 20 : 24;
  const isLightJersey = isLight(jerseyColor);
  const textColor = isLightJersey ? '#1a2d3d' : '#ffffff';
  const jerseyTrim = isLightJersey ? darken(jerseyColor, 0.15) : lighten(jerseyColor, 0.3);

  const bodyMain = robotColor;
  const bodyLight = lighten(robotColor, 0.18);
  const bodyDark = darken(robotColor, 0.15);
  const bodyShine = lighten(robotColor, 0.35);
  const outlineColor = darken(robotColor, 0.3);

  return (
    <span
      className={`${styles.robotWrap} ${glow ? styles.glow : ''} ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 120 140"
        className={styles.robotSvg}
        aria-hidden
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Antenna stem + ball */}
        <line x1="60" y1="6" x2="60" y2="18" stroke={outlineColor} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="60" cy="5" r="4" fill={bodyShine} stroke={outlineColor} strokeWidth="1.2" />

        {/* Head dome — rounder, more like the mascot */}
        <ellipse cx="60" cy="36" rx="30" ry="24" fill={bodyMain} stroke={outlineColor} strokeWidth="1.8" />
        {/* Head highlight */}
        <ellipse cx="54" cy="28" rx="16" ry="10" fill={bodyShine} opacity="0.25" />

        {/* Headband */}
        <path d="M30 32 Q60 26 90 32 Q90 38 60 34 Q30 38 30 32Z" fill="#ffffff" opacity="0.85" stroke={outlineColor} strokeWidth="0.8" />
        {/* Headband emblem */}
        <circle cx="60" cy="31" r="3" fill={bodyLight} stroke={outlineColor} strokeWidth="0.6" />
        <line x1="60" y1="29" x2="60" y2="33" stroke={outlineColor} strokeWidth="0.5" />
        <line x1="58" y1="31" x2="62" y2="31" stroke={outlineColor} strokeWidth="0.5" />

        {/* Eye sockets — angular frames like the mascot */}
        <path d="M40 36 L48 33 L56 36 L56 43 L48 45 L40 43Z" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />
        <path d="M64 36 L72 33 L80 36 L80 43 L72 45 L64 43Z" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />

        {/* Eyes — bright, expressive */}
        <ellipse cx="48" cy="39" rx="5" ry="3.5" fill="#c0e8ff" />
        <ellipse cx="72" cy="39" rx="5" ry="3.5" fill="#c0e8ff" />
        {/* Eye highlights */}
        <ellipse cx="49.5" cy="38" rx="2" ry="1.5" fill="#ffffff" opacity="0.8" />
        <ellipse cx="73.5" cy="38" rx="2" ry="1.5" fill="#ffffff" opacity="0.8" />
        {/* Pupils */}
        <ellipse cx="47.5" cy="40" rx="1.5" ry="1.2" fill={outlineColor} opacity="0.6" />
        <ellipse cx="71.5" cy="40" rx="1.5" ry="1.2" fill={outlineColor} opacity="0.6" />

        {/* Nose hint */}
        <path d="M58 44 L60 46 L62 44" stroke={outlineColor} strokeWidth="0.8" fill="none" strokeLinecap="round" />

        {/* Smile — wide, showing teeth */}
        <path d="M48 49 Q54 55 60 55 Q66 55 72 49" stroke={outlineColor} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        {/* Teeth */}
        <path d="M50 50 Q60 56 70 50 Q60 54 50 50Z" fill="#ffffff" opacity="0.85" />

        {/* Side head panels / ear bolts */}
        <rect x="28" y="33" width="5" height="10" rx="2" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />
        <rect x="87" y="33" width="5" height="10" rx="2" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />

        {/* Neck segment */}
        <rect x="52" y="58" width="16" height="7" rx="3" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />
        <line x1="55" y1="60" x2="55" y2="63" stroke={outlineColor} strokeWidth="0.5" opacity="0.4" />
        <line x1="60" y1="60" x2="60" y2="63" stroke={outlineColor} strokeWidth="0.5" opacity="0.4" />
        <line x1="65" y1="60" x2="65" y2="63" stroke={outlineColor} strokeWidth="0.5" opacity="0.4" />

        {/* Jersey / Torso with trim */}
        <path
          d="M32 68 L26 78 L33 82 L33 116 L87 116 L87 82 L94 78 L88 68 L76 74 C70 78 50 78 44 74 Z"
          fill={jerseyColor}
          stroke={outlineColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Jersey trim — collar */}
        <path d="M44 74 Q52 80 60 80 Q68 80 76 74" stroke={jerseyTrim} strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* Jersey trim — bottom */}
        <line x1="33" y1="114" x2="87" y2="114" stroke={jerseyTrim} strokeWidth="2" />
        {/* Jersey trim — armholes */}
        <path d="M33 82 L33 70" stroke={jerseyTrim} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M87 82 L87 70" stroke={jerseyTrim} strokeWidth="1.5" strokeLinecap="round" />

        {/* Jersey number */}
        <text
          x="60"
          y="100"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={fontSize}
          fontWeight="800"
          fontFamily="'Oswald', 'Impact', sans-serif"
          fill={textColor}
          letterSpacing="0.02em"
          style={{ textShadow: isLightJersey ? 'none' : '0 1px 2px rgba(0,0,0,0.3)' }}
        >
          {displayText}
        </text>

        {/* Arms — segmented robotic */}
        <path d="M26 78 L18 92 L14 92" fill="none" stroke={outlineColor} strokeWidth="1.2" strokeLinecap="round" />
        <path d="M26 78 L19 92" fill={bodyMain} stroke={outlineColor} strokeWidth="1.2" strokeLinejoin="round" />
        <circle cx="22" cy="85" r="2.5" fill={bodyLight} stroke={outlineColor} strokeWidth="0.8" />
        <path d="M94 78 L102 92 L106 92" fill="none" stroke={outlineColor} strokeWidth="1.2" strokeLinecap="round" />
        <path d="M94 78 L101 92" fill={bodyMain} stroke={outlineColor} strokeWidth="1.2" strokeLinejoin="round" />
        <circle cx="98" cy="85" r="2.5" fill={bodyLight} stroke={outlineColor} strokeWidth="0.8" />

        {/* Hands — 3-finger robotic */}
        <circle cx="14" cy="94" r="4.5" fill={bodyLight} stroke={outlineColor} strokeWidth="0.8" />
        <line x1="11" y1="96" x2="10" y2="99" stroke={outlineColor} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="14" y1="97" x2="14" y2="100" stroke={outlineColor} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="17" y1="96" x2="18" y2="99" stroke={outlineColor} strokeWidth="0.8" strokeLinecap="round" />
        <circle cx="106" cy="94" r="4.5" fill={bodyLight} stroke={outlineColor} strokeWidth="0.8" />
        <line x1="103" y1="96" x2="102" y2="99" stroke={outlineColor} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="106" y1="97" x2="106" y2="100" stroke={outlineColor} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="109" y1="96" x2="110" y2="99" stroke={outlineColor} strokeWidth="0.8" strokeLinecap="round" />

        {/* Waist / belt */}
        <rect x="42" y="116" width="36" height="5" rx="2" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />

        {/* Legs — short, stubby robot legs */}
        <rect x="44" y="121" width="12" height="10" rx="2" fill={bodyMain} stroke={outlineColor} strokeWidth="0.8" />
        <rect x="64" y="121" width="12" height="10" rx="2" fill={bodyMain} stroke={outlineColor} strokeWidth="0.8" />

        {/* Feet / sneakers */}
        <path d="M42 131 L42 136 Q42 138 44 138 L58 138 Q60 138 60 136 L60 131Z" fill="#ffffff" stroke={outlineColor} strokeWidth="0.8" />
        <path d="M60 131 L60 136 Q60 138 62 138 L76 138 Q78 138 78 136 L78 131Z" fill="#ffffff" stroke={outlineColor} strokeWidth="0.8" />
        <line x1="42" y1="134" x2="60" y2="134" stroke={bodyMain} strokeWidth="1.5" />
        <line x1="60" y1="134" x2="78" y2="134" stroke={bodyMain} strokeWidth="1.5" />
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

function lighten(hex, amount) {
  return adjustColor(hex, amount);
}

function darken(hex, amount) {
  return adjustColor(hex, -amount);
}

function adjustColor(hex, amount) {
  const c = hex.replace('#', '');
  const r = Math.min(255, Math.max(0, parseInt(c.substring(0, 2), 16) + Math.round(255 * amount)));
  const g = Math.min(255, Math.max(0, parseInt(c.substring(2, 4), 16) + Math.round(255 * amount)));
  const b = Math.min(255, Math.max(0, parseInt(c.substring(4, 6), 16) + Math.round(255 * amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
