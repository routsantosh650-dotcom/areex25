// Admin console token, kept only for this browser tab. The legacy /api plan and coupon
// endpoints still expect it; the Cloudflare Worker ignores those calls.
const ADMIN_KEY = 'areex_admin_token';

export function setAdminToken(token: string | undefined) {
  try {
    if (token) sessionStorage.setItem(ADMIN_KEY, token);
    else sessionStorage.removeItem(ADMIN_KEY);
  } catch {
    /* private mode */
  }
}

export function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_KEY);
  } catch {
    return null;
  }
}
