import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { DialogProvider } from './lib/dialog.jsx';
import './styles/index.css';
import './styles/utilities.css';   // 🎨 one-property classes that replaced fixed inline styles (audit #3)
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill';

// Makes flag emojis (🇨🇦 🇺🇸 …) render on Windows
polyfillCountryFlagEmojis();

/** 🫥 The app has drawn: show the page (it was hidden so the server's search-engine copy never flashed — public/boot.js). */
function Shown({ children }) {
  useEffect(() => { document.documentElement.removeAttribute('data-app-pending'); }, []);
  return children;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DialogProvider>
      <Shown>
        <App />
      </Shown>
    </DialogProvider>
  </React.StrictMode>
);
