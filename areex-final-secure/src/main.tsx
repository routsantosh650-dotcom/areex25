import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {API_BASE} from './config';
import './index.css';

// When the site is hosted apart from the Express backend (Cloudflare),
// route every relative /api call to the backend origin.
if (API_BASE) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    originalFetch(
      typeof input === 'string' && input.startsWith('/api/') ? API_BASE + input : input,
      init
    );
}

createRoot(document.getElementById('root')!).render(<App />);
