// Central place for site-wide links.
export const PANEL_URL = 'https://panel.areexcloud.site';
export const SITE_URL = 'https://areexcloud.site';

// Backend origin for /api calls. Empty = same origin (Express serves the site directly).
// Set VITE_API_BASE_URL at build time when the frontend is hosted separately (e.g. Cloudflare).
export const API_BASE = String((import.meta.env?.VITE_API_BASE_URL as string | undefined) || '').replace(/\/+$/, '');
export const apiUrl = (p: string) => `${API_BASE}${p}`;
