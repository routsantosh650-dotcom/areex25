import { useSyncExternalStore } from 'react';
import type { PlanCategoryKey } from './data/areexData';

// Tiny built-in router: real URLs (/plans/budget, /showcase ...) with no extra packages.
// The Express server already sends index.html for every unknown path, so deep links work.

const NAV_EVENT = 'areex:navigate';

function currentPath(): string {
  const p = window.location.pathname.replace(/\/+$/, '') || '/';
  return p.toLowerCase();
}

function subscribe(cb: () => void) {
  window.addEventListener('popstate', cb);
  window.addEventListener(NAV_EVENT, cb);
  return () => {
    window.removeEventListener('popstate', cb);
    window.removeEventListener(NAV_EVENT, cb);
  };
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, currentPath, () => '/');
}

export function navigate(to: string, opts?: { replace?: boolean }) {
  let url: URL;
  try {
    url = new URL(to, window.location.origin);
  } catch {
    return;
  }
  if (url.origin !== window.location.origin) {
    window.location.href = to;
    return;
  }
  const target = url.pathname + url.search + url.hash;
  if (opts?.replace) window.history.replaceState({}, '', target);
  else if (target !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.pushState({}, '', target);
  }
  window.dispatchEvent(new Event(NAV_EVENT));
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/** Makes every normal <a href="/..."> navigate without a full page reload. */
export function installLinkInterceptor() {
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || a.getAttribute('target') === '_blank' || a.hasAttribute('download')) return;
    if (!href.startsWith('/') || href.startsWith('//')) return;
    e.preventDefault();
    navigate(href);
  };
  document.addEventListener('click', onClick);
  return () => document.removeEventListener('click', onClick);
}

// Old single-page links (/#pricing-section ...) keep working
export const LEGACY_HASH_ROUTES: Record<string, string> = {
  '#pricing-section': '/plans',
  '#network-map-section': '/network',
  '#architecture-section': '/features',
  '#founder-section': '/founder',
  '#reviews-section': '/reviews',
  '#legal-section': '/legal',
  '#contact-section': '/contact',
};

export type PageKey =
  | 'home'
  | 'plans'
  | 'category'
  | 'showcase'
  | 'features'
  | 'network'
  | 'founder'
  | 'reviews'
  | 'faq'
  | 'legal'
  | 'contact'
  | 'notfound';

const CATEGORY_SLUGS: Record<string, PlanCategoryKey> = {
  budget: 'budget',
  premium: 'premium',
  exclusive: 'exclusive',
  bot: 'bot',
  bots: 'bot',
  vps: 'vps',
  domain: 'domain',
  domains: 'domain',
};

export function parseRoute(path: string): { page: PageKey; category?: PlanCategoryKey } {
  if (path === '/' || path === '/index.html') return { page: 'home' };
  if (path === '/plans') return { page: 'plans' };
  if (path.startsWith('/plans/')) {
    const cat = CATEGORY_SLUGS[path.slice('/plans/'.length)];
    return cat ? { page: 'category', category: cat } : { page: 'notfound' };
  }
  const simple: Record<string, PageKey> = {
    '/showcase': 'showcase',
    '/features': 'features',
    '/network': 'network',
    '/founder': 'founder',
    '/reviews': 'reviews',
    '/faq': 'faq',
    '/legal': 'legal',
    '/contact': 'contact',
    // Hidden admin URL renders the home page underneath; App.tsx opens the console modal on top
    '/rtx5090': 'home',
  };
  return simple[path] ? { page: simple[path] } : { page: 'notfound' };
}
