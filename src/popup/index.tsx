import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ReactErrorBoundary, errorBoundaryStyles } from './components/ErrorBoundary';

// Simple CSS reset and base styles
const style = document.createElement('style');
style.textContent = `
  * {
    box-sizing: border-box;
  }
  body {
    margin: 0;
    padding: 0;
  }
  ${errorBoundaryStyles}
`;
document.head.appendChild(style);

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <ReactErrorBoundary>
        <App />
      </ReactErrorBoundary>
    </React.StrictMode>
  );
}