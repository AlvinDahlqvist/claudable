import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { StoreProvider } from './store.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </React.StrictMode>,
);
