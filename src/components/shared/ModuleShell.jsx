/**
 * Shared module container primitives for the Home dashboard.
 *
 * ModuleShell  — normalized card wrapper with header, optional badge / right
 *                slot, a skeleton loading state, an empty state, and an
 *                optional footer CTA row.
 * ModuleSkeleton — shimmer loading rows.
 * ModuleEmpty    — intentional empty / no-data message.
 *
 * All Home modules can adopt this language for consistent elevation,
 * header rhythm, and footer CTA treatment.
 */

import styles from './ModuleShell.module.css';

// ─── ModuleSkeleton ────────────────────────────────────────────────────────────

export function ModuleSkeleton({ rows = 3 }) {
  return (
    <div className={styles.skeleton} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={styles.skeletonRow}
          style={{ width: i === 0 ? '100%' : i === 1 ? '85%' : '70%' }}
        />
      ))}
    </div>
  );
}

// ─── ModuleEmpty ───────────────────────────────────────────────────────────────

export function ModuleEmpty({ message = 'No data available' }) {
  return (
    <div className={styles.empty} role="status">
      <span className={styles.emptyMessage}>{message}</span>
    </div>
  );
}

// ─── ModuleShell ───────────────────────────────────────────────────────────────

/**
 * @param {object}            props
 * @param {string}            props.title        - Section header label (uppercased by CSS).
 * @param {React.ReactNode}  [props.badge]       - Pill/badge displayed after the title.
 * @param {React.ReactNode}  [props.headerRight] - Custom content for the right side of the header.
 * @param {boolean}          [props.loading]     - Render skeleton when true.
 * @param {number}           [props.skeletonRows]- Number of skeleton rows (default 3).
 * @param {boolean}          [props.isEmpty]     - Render empty state when true.
 * @param {string}           [props.emptyMessage]
 * @param {React.ReactNode}  [props.footer]      - Footer CTA content; only rendered when truthy.
 * @param {string}           [props.className]   - Extra class on the shell wrapper.
 * @param {React.ReactNode}   props.children
 */
export function ModuleShell({
  title,
  badge,
  headerRight,
  loading = false,
  skeletonRows = 3,
  isEmpty = false,
  emptyMessage,
  footer,
  className = '',
  children,
}) {
  return (
    <div className={`${styles.shell} ${className}`}>
      <div className={styles.shellHeader}>
        <div className={styles.shellTitleRow}>
          <span className={styles.shellTitle}>{title}</span>
          {badge && <span className={styles.shellBadge}>{badge}</span>}
        </div>
        {headerRight && (
          <div className={styles.shellHeaderRight}>{headerRight}</div>
        )}
      </div>

      <div className={styles.shellBody}>
        {loading ? (
          <ModuleSkeleton rows={skeletonRows} />
        ) : isEmpty ? (
          <ModuleEmpty message={emptyMessage} />
        ) : (
          children
        )}
      </div>

      {footer != null && (
        <div className={styles.shellFooter}>{footer}</div>
      )}
    </div>
  );
}
