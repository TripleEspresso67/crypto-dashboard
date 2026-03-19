import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <div className="error-msg">
            <strong>Something went wrong</strong>
            <p style={{ marginTop: 8, fontSize: '0.875rem' }}>
              {this.state.error?.message || 'Unknown error'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/';
              }}
              style={{
                marginTop: 12, padding: '8px 16px',
                background: '#30363d', color: '#e6edf3',
                border: '1px solid #6e7681', borderRadius: 6,
                cursor: 'pointer', fontSize: '0.875rem',
              }}
            >
              Return to Overview
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
