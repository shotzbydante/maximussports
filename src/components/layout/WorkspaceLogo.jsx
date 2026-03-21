/**
 * Renders the official workspace logo (NCAA / MLB) or falls back to emoji.
 * Single source of truth for workspace identity visuals.
 */
import styles from './WorkspaceLogo.module.css';

export default function WorkspaceLogo({ workspace, size = 20, className = '' }) {
  if (workspace?.logo) {
    return (
      <img
        src={workspace.logo}
        alt={workspace.shortLabel}
        width={size}
        height={size}
        className={`${styles.logo} ${className}`}
        draggable={false}
      />
    );
  }
  return <span className={className}>{workspace?.emoji}</span>;
}
