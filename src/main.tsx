// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

if (import.meta.env.DEV) {
  import('@utils/printTMState').then(({ printTMState }) => {
    (window as any).printTMState = printTMState;
  });
}

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
