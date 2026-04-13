import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/notebook.css';
import { initStoragePersistence } from './lib/storage';

// navigator.storage.persist() を起動時に呼び出し（Eviction 対策）
initStoragePersistence();

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
