import { useSyncExternalStore } from 'react';

// Customer login session (separate from the admin / Firebase code).
const KEY = 'areex_customer_session';

export interface CustomerSession {
  token: string;
  email: string;
}

function load(): CustomerSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CustomerSession) : null;
  } catch {
    return null;
  }
}

let session: CustomerSession | null = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setSession(s: CustomerSession) {
  session = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
  emit();
}

export function clearSession() {
  session = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  emit();
}

export const getToken = () => session?.token ?? null;

export function useCustomer(): CustomerSession | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => session
  );
}

/** Call once on page load: drops the session if the server no longer accepts it. */
export async function validateSession() {
  if (!session) return;
  try {
    const r = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${session.token}` } });
    if (r.status === 401) clearSession();
  } catch {
    /* offline: keep session */
  }
}

// ---- Admin token (kept only for this browser tab; needed to save / delete plans) ----
const ADMIN_KEY = 'areex_admin_token';
export function setAdminToken(token: string | undefined) {
  try {
    if (token) sessionStorage.setItem(ADMIN_KEY, token);
    else sessionStorage.removeItem(ADMIN_KEY);
  } catch {
    /* ignore */
  }
}
export function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_KEY);
  } catch {
    return null;
  }
}
