/**
 * App-level React Error Boundary.
 * Catches render errors, shows a friendly fallback, and emits a ui_error event.
 * Class component because React error boundaries require lifecycle methods.
 */
import { Component } from 'react';
import { track } from '../analytics/index';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    try {
      // Extract first meaningful frame from componentStack; drop full trace for brevity.
      const componentHint = info?.componentStack
        ?.split('\n')
        .find((line) => line.trim().startsWith('at '))
        ?.trim()
        ?.slice(0, 100) ?? 'unknown';

      track('ui_error', {
        component: componentHint,
        message:   (error?.message ?? 'unknown').slice(0, 200),
        stack:     (error?.stack   ?? '').slice(0, 500),
      });
    } catch { /* never crash the error handler */ }
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            padding: '2rem',
            textAlign: 'center',
            gap: '1rem',
          }}
          role="alert"
        >
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
            Something went wrong
          </h2>
          <p style={{ color: 'var(--color-text-muted, #777)', maxWidth: 360 }}>
            We&apos;re on it. Try refreshing the page or clicking below to recover.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              background: 'var(--color-primary, #3c79b4)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
