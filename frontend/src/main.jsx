import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { UIProvider } from './context/UIContext';
import './index.css';

// Depois de uma nova publicação os arquivos antigos somem: recarrega uma vez (no máximo 1x por minuto).
window.addEventListener('vite:preloadError', (event) => {
  try {
    const KEY = 'cifren:preload-reload';
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 60000) return;
    sessionStorage.setItem(KEY, String(Date.now()));
    event.preventDefault();
    window.location.reload();
  } catch { /* sem sessionStorage: não recarrega, para evitar laço */ }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <UIProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </UIProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
