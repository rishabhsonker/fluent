import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

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
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);