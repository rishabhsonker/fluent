import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary, errorBoundaryStyles } from './components/ErrorBoundary';

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
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}