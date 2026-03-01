/**
 * Targeted error boundary for PinnedTeamsSection.
 *
 * Catches render-time exceptions so a crash in the pinned-teams UI never
 * takes down the whole page.  Emits analytics.track('ui_error') and renders a
 * minimal inline fallback that lets the user retry.
 */
import { Component } from 'react';
import { track } from '../../analytics/index';

export default class PinnedErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMsg: error?.message ?? 'unknown' };
  }

  componentDidCatch(error, info) {
    try {
      const componentHint = info?.componentStack
        ?.split('\n')
        .find((l) => l.trim().startsWith('at '))
        ?.trim()
        ?.slice(0, 100) ?? 'PinnedTeamsSection';

      track('ui_error', {
        component: componentHint,
        message:   (error?.message ?? 'unknown').slice(0, 200),
        stack:     (error?.stack   ?? '').slice(0, 500),
      });

      if (import.meta.env?.DEV) {
        console.error('[PinnedErrorBoundary] caught:', error, info);
      }
    } catch { /* never crash the error handler */ }
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMsg: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <section
          style={{
            padding: '1.5rem',
            border: '1px solid var(--color-border, #2a3a4a)',
            borderRadius: 12,
            margin: '1rem 0',
            textAlign: 'center',
          }}
          role="alert"
        >
          <p style={{ fontWeight: 600, marginBottom: 8 }}>
            Pinned Teams couldn&apos;t load
          </p>
          <p
            style={{
              color: 'var(--color-text-muted, #777)',
              fontSize: '0.85rem',
              marginBottom: 16,
            }}
          >
            {this.state.errorMsg
              ? `Error: ${this.state.errorMsg}`
              : 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              background: 'var(--color-primary, #3c79b4)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            Retry
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}
