/**
 * RobotAvatar — customizable Maximus robot avatar rendered as inline SVG.
 * Based on the Maximus Sports mascot design: round-headed robot with antenna,
 * visor eyes, and a sports jersey.
 *
 * Props:
 *  - jerseyNumber: string (displayed on jersey, defaults to "M")
 *  - jerseyColor: string (hex color for jersey, defaults to "#1a2d3d")
 *  - robotColor: string (hex color for robot body, defaults to "#4a90c4")
 *  - size: number (pixel size, defaults to 120)
 *  - className: optional additional class
 *  - glow: boolean (adds a subtle glow behind the robot)
 *
 * This component renders everywhere: sidebar, header chip, settings,
 * onboarding, and future public profiles / leaderboards.
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
  const fontSize = displayText.length > 1 ? 22 : 26;
  const isLightJersey = isLight(jerseyColor);
  const textColor = isLightJersey ? '#1a2d3d' : '#ffffff';
  const jerseyStroke = isLightJersey ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.1)';

  const bodyLight = lighten(robotColor, 0.2);
  const bodyDark = darken(robotColor, 0.15);
  const bodyHighlight = lighten(robotColor, 0.35);

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
        {/* Antenna */}
        <line x1="60" y1="8" x2="60" y2="22" stroke={bodyDark} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="60" cy="6" r="4" fill={bodyHighlight} stroke={bodyDark} strokeWidth="1.2" />

        {/* Head */}
        <ellipse cx="60" cy="38" rx="28" ry="22" fill={robotColor} stroke={bodyDark} strokeWidth="1.5" />
        <ellipse cx="60" cy="36" rx="24" ry="16" fill={bodyLight} opacity="0.3" />

        {/* Visor / Eyes */}
        <rect x="38" y="30" width="44" height="14" rx="7" fill={bodyDark} opacity="0.85" />
        <ellipse cx="50" cy="37" rx="5" ry="4" fill="#c0e8ff" />
        <ellipse cx="70" cy="37" rx="5" ry="4" fill="#c0e8ff" />
        <ellipse cx="51" cy="36" rx="2" ry="1.5" fill="#fff" opacity="0.8" />
        <ellipse cx="71" cy="36" rx="2" ry="1.5" fill="#fff" opacity="0.8" />

        {/* Mouth line */}
        <path d="M52 48 Q60 52 68 48" stroke={bodyDark} strokeWidth="1.2" fill="none" strokeLinecap="round" />

        {/* Ear bolts */}
        <circle cx="32" cy="38" r="3.5" fill={bodyDark} />
        <circle cx="32" cy="38" r="1.5" fill={bodyHighlight} />
        <circle cx="88" cy="38" r="3.5" fill={bodyDark} />
        <circle cx="88" cy="38" r="1.5" fill={bodyHighlight} />

        {/* Neck */}
        <rect x="52" y="58" width="16" height="6" rx="2" fill={bodyDark} />

        {/* Jersey / Torso */}
        <path
          d="M30 68 L24 78 L32 82 L32 118 L88 118 L88 82 L96 78 L90 68 L78 74 C72 78 48 78 42 74 Z"
          fill={jerseyColor}
          stroke={jerseyStroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Jersey collar */}
        <path d="M42 74 Q52 80 60 80 Q68 80 78 74" stroke={jerseyStroke} strokeWidth="1.2" fill="none" strokeLinecap="round" />

        {/* Jersey number */}
        <text
          x="60"
          y="102"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={fontSize}
          fontWeight="800"
          fontFamily="'Oswald', 'Impact', sans-serif"
          fill={textColor}
          letterSpacing="0.02em"
        >
          {displayText}
        </text>

        {/* Arms */}
        <path d="M24 78 L16 96 L22 98 L30 84" fill={robotColor} stroke={bodyDark} strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M96 78 L104 96 L98 98 L90 84" fill={robotColor} stroke={bodyDark} strokeWidth="1.2" strokeLinejoin="round" />

        {/* Hands */}
        <circle cx="18" cy="98" r="5" fill={bodyLight} stroke={bodyDark} strokeWidth="1" />
        <circle cx="102" cy="98" r="5" fill={bodyLight} stroke={bodyDark} strokeWidth="1" />

        {/* Jersey stripe detail */}
        <line x1="32" y1="110" x2="88" y2="110" stroke={jerseyStroke} strokeWidth="1" opacity="0.5" />
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
