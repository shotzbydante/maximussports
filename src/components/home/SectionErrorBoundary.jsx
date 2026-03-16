/**
 * Reusable sectional error boundary for homepage widgets.
 *
 * Catches render-time exceptions so a crash in one section never takes down
 * the whole page.  Emits both `ui_error` (generic) and `homepage_section_failed`
 * (funnel-specific) analytics events, then renders a minimal inline fallback
 * that lets the user retry.
 */
import { Component } from 'react';
import { track } from '../../analytics/index';

export default class SectionErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    try {
      const componentHint = info?.componentStack
        ?.split('\n')
        .find((line) => line.trim().startsWith('at '))
        ?.trim()
        ?.slice(0, 100) ?? 'unknown';

      const sectionName = this.props.name ?? 'unknown';
      const msg = (error?.message ?? 'unknown').slice(0, 200);

      track('ui_error', {
        component: componentHint,
        section: sectionName,
        message: msg,
        stack: (error?.stack ?? '').slice(0, 500),
      });

      track('homepage_section_failed', {
        section: sectionName,
        error_category: categorizeError(msg),
        fallback_rendered: !this.props.silent,
      });
    } catch { /* never crash the error handler */ }
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.silent) return null;

      return (
        <div
          style={{
            padding: '1.5rem',
            textAlign: 'center',
            color: 'var(--color-text-muted, #888)',
            fontSize: '0.85rem',
          }}
          role="alert"
        >
          <p style={{ margin: '0 0 0.5rem' }}>
            {this.props.name
              ? `${this.props.name} couldn\u2019t load.`
              : 'This section couldn\u2019t load.'}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              background: 'var(--color-primary, #3c79b4)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function categorizeError(msg) {
  const lower = (msg || '').toLowerCase();
  if (lower.includes('undefined') || lower.includes('null'))  return 'null_reference';
  if (lower.includes('map') || lower.includes('foreach'))     return 'iteration_error';
  if (lower.includes('network') || lower.includes('fetch'))   return 'network';
  if (lower.includes('json'))                                  return 'parse_error';
  return 'render_error';
}
