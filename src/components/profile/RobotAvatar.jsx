/**
 * RobotAvatar — Maximus Sports mascot: a fun-loving basketball-playing toddler
 * robot with big expressive eyes, a wide grin, a headband, and a basketball
 * jersey. Left hand spins a basketball, right hand waves.
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
  const fontSize = displayText.length > 1 ? 18 : 22;
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
      className={`${styles.robotWrap} ${glow ? styles.glow : ''} ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 130 145"
        className={styles.robotSvg}
        aria-hidden
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Antenna stem + ball — bouncy spring feel */}
        <path d="M62 18 Q60 12 62 8 Q64 4 60 3" stroke={outlineColor} strokeWidth="2" fill="none" strokeLinecap="round" />
        <circle cx="60" cy="3" r="3.5" fill={bodyShine} stroke={outlineColor} strokeWidth="1.2" />

        {/* Head dome — larger, rounder, toddler proportions */}
        <ellipse cx="62" cy="36" rx="32" ry="26" fill={bodyMain} stroke={outlineColor} strokeWidth="1.8" />
        {/* Head highlight / shine */}
        <ellipse cx="54" cy="26" rx="18" ry="11" fill={bodyShine} opacity="0.22" />

        {/* Headband — sporty swoosh */}
        <path d="M30 30 Q62 23 94 30 Q94 37 62 33 Q30 37 30 30Z" fill="#ffffff" opacity="0.88" stroke={outlineColor} strokeWidth="0.8" />
        {/* Headband M emblem */}
        <circle cx="62" cy="30.5" r="3.5" fill={bodyLight} stroke={outlineColor} strokeWidth="0.7" />
        <text x="62" y="32" textAnchor="middle" dominantBaseline="middle" fontSize="4.5" fontWeight="900" fill={outlineColor} fontFamily="'Oswald',sans-serif">M</text>

        {/* Eye sockets — big angular, expressive */}
        <path d="M40 35 L50 31 L58 35 L58 44 L50 47 L40 44Z" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />
        <path d="M66 35 L74 31 L84 35 L84 44 L74 47 L66 44Z" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />

        {/* Eyes — big, round, bitmoji-like */}
        <ellipse cx="49" cy="39.5" rx="6" ry="5" fill="#c0e8ff" />
        <ellipse cx="75" cy="39.5" rx="6" ry="5" fill="#c0e8ff" />
        {/* Eye sparkle highlights */}
        <ellipse cx="51" cy="37.5" rx="2.5" ry="2" fill="#ffffff" opacity="0.85" />
        <ellipse cx="77" cy="37.5" rx="2.5" ry="2" fill="#ffffff" opacity="0.85" />
        {/* Pupils — looking slightly up/out for playful feel */}
        <ellipse cx="48" cy="40.5" rx="2.2" ry="2" fill={outlineColor} opacity="0.55" />
        <ellipse cx="74" cy="40.5" rx="2.2" ry="2" fill={outlineColor} opacity="0.55" />

        {/* Eyebrows — raised, excited */}
        <path d="M42 32 Q49 29 56 32" stroke={outlineColor} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M68 32 Q75 29 82 32" stroke={outlineColor} strokeWidth="1.2" fill="none" strokeLinecap="round" />

        {/* Blush cheeks */}
        <ellipse cx="40" cy="47" rx="4" ry="2.5" fill={cheekColor} opacity="0.3" />
        <ellipse cx="84" cy="47" rx="4" ry="2.5" fill={cheekColor} opacity="0.3" />

        {/* Nose hint */}
        <path d="M60 46 L62 48 L64 46" stroke={outlineColor} strokeWidth="0.9" fill="none" strokeLinecap="round" />

        {/* Big smile — wide, joyful, showing teeth */}
        <path d="M48 51 Q55 59 62 59 Q69 59 76 51" stroke={outlineColor} strokeWidth="1.8" fill="none" strokeLinecap="round" />
        {/* Teeth */}
        <path d="M50 52 Q62 60 74 52 Q62 57 50 52Z" fill="#ffffff" opacity="0.9" />

        {/* Side head panels / ear bolts */}
        <rect x="28" y="33" width="5" height="10" rx="2" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />
        <rect x="91" y="33" width="5" height="10" rx="2" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />

        {/* Neck segment */}
        <rect x="53" y="60" width="18" height="7" rx="3" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />
        <line x1="57" y1="62" x2="57" y2="65" stroke={outlineColor} strokeWidth="0.5" opacity="0.4" />
        <line x1="62" y1="62" x2="62" y2="65" stroke={outlineColor} strokeWidth="0.5" opacity="0.4" />
        <line x1="67" y1="62" x2="67" y2="65" stroke={outlineColor} strokeWidth="0.5" opacity="0.4" />

        {/* Jersey / Torso — slightly chunkier toddler proportions */}
        <path
          d="M34 70 L27 80 L34 84 L34 117 L90 117 L90 84 L97 80 L90 70 L78 76 C72 80 52 80 46 76 Z"
          fill={jerseyColor}
          stroke={outlineColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Jersey trim — collar */}
        <path d="M46 76 Q54 82 62 82 Q70 82 78 76" stroke={jerseyTrim} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        {/* Jersey trim — bottom */}
        <line x1="34" y1="115" x2="90" y2="115" stroke={jerseyTrim} strokeWidth="2" />
        {/* Jersey trim — armholes */}
        <path d="M34 84 L34 72" stroke={jerseyTrim} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M90 84 L90 72" stroke={jerseyTrim} strokeWidth="1.5" strokeLinecap="round" />

        {/* Jersey number */}
        <text
          x="62"
          y="101"
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

        {/* ── LEFT ARM: spinning a basketball ── */}
        <path d="M27 80 L16 72 L10 66" fill="none" stroke={outlineColor} strokeWidth="1.3" strokeLinecap="round" />
        <path d="M27 80 L17 73" fill={bodyMain} stroke={outlineColor} strokeWidth="1.3" strokeLinejoin="round" />
        <circle cx="20" cy="76" r="2.5" fill={bodyLight} stroke={outlineColor} strokeWidth="0.8" />
        {/* Hand under ball */}
        <circle cx="10" cy="64" r="4" fill={bodyLight} stroke={outlineColor} strokeWidth="0.8" />
        {/* Fingers supporting ball */}
        <line x1="7" y1="62" x2="6" y2="60" stroke={outlineColor} strokeWidth="0.7" strokeLinecap="round" />
        <line x1="10" y1="61" x2="10" y2="58" stroke={outlineColor} strokeWidth="0.7" strokeLinecap="round" />
        <line x1="13" y1="62" x2="14" y2="60" stroke={outlineColor} strokeWidth="0.7" strokeLinecap="round" />

        {/* Basketball — spinning on left hand */}
        <circle cx="10" cy="52" r="9" fill="#e67e22" stroke="#c0601a" strokeWidth="1.2" />
        <path d="M1 52 Q10 48 19 52" stroke="#c0601a" strokeWidth="0.8" fill="none" />
        <path d="M10 43 Q12 52 10 61" stroke="#c0601a" strokeWidth="0.8" fill="none" />
        <path d="M3 46 Q10 52 17 46" stroke="#c0601a" strokeWidth="0.6" fill="none" opacity="0.5" />
        <path d="M3 58 Q10 52 17 58" stroke="#c0601a" strokeWidth="0.6" fill="none" opacity="0.5" />
        {/* Ball highlight */}
        <ellipse cx="7" cy="48" rx="3" ry="2" fill="#f0a050" opacity="0.5" />

        {/* ── RIGHT ARM: waving ── */}
        <path d="M97 80 L108 68 L116 58" fill="none" stroke={outlineColor} strokeWidth="1.3" strokeLinecap="round" />
        <path d="M97 80 L107 69" fill={bodyMain} stroke={outlineColor} strokeWidth="1.3" strokeLinejoin="round" />
        <circle cx="103" cy="74" r="2.5" fill={bodyLight} stroke={outlineColor} strokeWidth="0.8" />
        {/* Waving hand — open palm */}
        <circle cx="116" cy="56" r="4.5" fill={bodyLight} stroke={outlineColor} strokeWidth="0.8" />
        {/* Spread fingers waving */}
        <line x1="113" y1="53" x2="111" y2="50" stroke={outlineColor} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="115" y1="52" x2="114" y2="48" stroke={outlineColor} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="117" y1="52" x2="117" y2="48" stroke={outlineColor} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="119" y1="53" x2="120" y2="49" stroke={outlineColor} strokeWidth="0.8" strokeLinecap="round" />
        <line x1="120" y1="56" x2="122" y2="54" stroke={outlineColor} strokeWidth="0.7" strokeLinecap="round" />

        {/* Waist / belt */}
        <rect x="44" y="117" width="36" height="5" rx="2" fill={bodyDark} stroke={outlineColor} strokeWidth="0.8" />

        {/* Legs — short, stubby toddler robot legs */}
        <rect x="46" y="122" width="12" height="11" rx="3" fill={bodyMain} stroke={outlineColor} strokeWidth="0.8" />
        <rect x="66" y="122" width="12" height="11" rx="3" fill={bodyMain} stroke={outlineColor} strokeWidth="0.8" />

        {/* Feet / sneakers */}
        <path d="M44 133 L44 138 Q44 140 46 140 L60 140 Q62 140 62 138 L62 133Z" fill="#ffffff" stroke={outlineColor} strokeWidth="0.8" />
        <path d="M62 133 L62 138 Q62 140 64 140 L78 140 Q80 140 80 138 L80 133Z" fill="#ffffff" stroke={outlineColor} strokeWidth="0.8" />
        <line x1="44" y1="136" x2="62" y2="136" stroke={bodyMain} strokeWidth="1.5" />
        <line x1="62" y1="136" x2="80" y2="136" stroke={bodyMain} strokeWidth="1.5" />
        {/* Shoe sole accent */}
        <line x1="46" y1="140" x2="60" y2="140" stroke={outlineColor} strokeWidth="0.6" />
        <line x1="64" y1="140" x2="78" y2="140" stroke={outlineColor} strokeWidth="0.6" />
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
