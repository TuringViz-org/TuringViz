// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

import { setTuringMachineSchema } from '@utils/parsing';

fetch(`${import.meta.env.BASE_URL}turingMachineSchema.json`)
  .then((res) => res.json())
  .then((schema) => setTuringMachineSchema(schema));

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
