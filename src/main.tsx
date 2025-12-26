import { StrictMode, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Global error boundary
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('React Error Boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', fontFamily: 'system-ui' }}>
          <h1 style={{ color: 'red' }}>Application Error</h1>
          <pre style={{ background: '#fee', padding: '10px', overflow: 'auto' }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Catch unhandled errors
window.onerror = (msg, source, line, col, error) => {
  console.error('Global error:', { msg, source, line, col, error });
  const root = document.getElementById('root');
  if (root && !root.hasChildNodes()) {
    root.innerHTML = `<div style="padding:20px;font-family:system-ui"><h1 style="color:red">JavaScript Error</h1><pre style="background:#fee;padding:10px">${msg}\n\nSource: ${source}:${line}:${col}</pre></div>`;
  }
};

window.onunhandledrejection = (event) => {
  console.error('Unhandled promise rejection:', event.reason);
};

console.log('Training Camp: Starting application...');

const rootElement = document.getElementById('root');
if (!rootElement) {
  document.body.innerHTML = '<div style="padding:20px;color:red">Error: #root element not found</div>';
} else {
  try {
    console.log('Training Camp: Creating React root...');
    const root = createRoot(rootElement);
    console.log('Training Camp: Rendering app...');
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>
    );
    console.log('Training Camp: Render complete');
  } catch (e) {
    console.error('Training Camp: Failed to render:', e);
    rootElement.innerHTML = `<div style="padding:20px"><h1 style="color:red">Render Error</h1><pre style="background:#fee;padding:10px">${e}</pre></div>`;
  }
}
