import React, { Component, ReactNode } from 'react';
import { logger } from '../../../../shared/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      errorCount: 0
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('React Error Boundary:', error, errorInfo);
    
    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1
    }));

    // Send error to background for tracking
    chrome.runtime.sendMessage({
      type: 'LOG_ERROR',
      error: {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        component: 'popup'
      }
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      // Default error UI
      return (
        <div className="error-boundary">
          <div className="error-content">
            <h2>Oops! Something went wrong</h2>
            <p>We're sorry, but something unexpected happened.</p>
            
            {/* Show details in development */}
            {import.meta.env.DEV && this.state.error && (
              <details className="error-details">
                <summary>Error details</summary>
                <pre>{this.state.error.toString()}</pre>
                {this.state.errorInfo && (
                  <pre>{this.state.errorInfo.componentStack}</pre>
                )}
              </details>
            )}
            
            <div className="error-actions">
              <button onClick={this.handleReset} className="btn btn-primary">
                Try Again
              </button>
              <button 
                onClick={() => window.close()} 
                className="btn btn-secondary"
              >
                Close
              </button>
            </div>
            
            {this.state.errorCount > 2 && (
              <p className="error-hint">
                If this keeps happening, try disabling and re-enabling the extension.
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// HOC for functional components
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode
): React.ComponentType<P> {
  return (props: P) => (
    <ErrorBoundary fallback={fallback}>
      <Component {...props} />
    </ErrorBoundary>
  );
}

// Error boundary styles (add to popup styles)
export const errorBoundaryStyles = `
.error-boundary {
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.error-content {
  text-align: center;
  max-width: 300px;
}

.error-content h2 {
  color: #dc3545;
  margin-bottom: 10px;
  font-size: 18px;
}

.error-content p {
  color: #666;
  margin-bottom: 20px;
  font-size: 14px;
}

.error-details {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  padding: 10px;
  margin: 15px 0;
  text-align: left;
}

.error-details summary {
  cursor: pointer;
  font-weight: 500;
  margin-bottom: 10px;
}

.error-details pre {
  font-size: 11px;
  overflow-x: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.error-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 20px;
}

.error-actions .btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.error-actions .btn:hover {
  opacity: 0.9;
}

.error-actions .btn-primary {
  background: #3b82f6;
  color: white;
}

.error-actions .btn-secondary {
  background: #6c757d;
  color: white;
}

.error-hint {
  margin-top: 15px;
  font-size: 12px;
  color: #666;
  font-style: italic;
}
`;