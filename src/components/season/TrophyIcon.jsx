/** Line-style trophy mark (the app is moving off emoji icons). */
export default function TrophyIcon({ size = 22, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H5a1 1 0 0 0-1 1v1a3 3 0 0 0 3 3h1.2" />
      <path d="M16 6h3a1 1 0 0 1 1 1v1a3 3 0 0 1-3 3h-1.2" />
      <path d="M12 13v4" />
      <path d="M8.5 20h7" />
      <path d="M10 17h4v3h-4z" />
    </svg>
  );
}
