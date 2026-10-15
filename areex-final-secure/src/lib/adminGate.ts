/**
 * Admin gate helpers.
 *
 * The console URL and the 2-admin allowlist never exist as readable strings in this bundle —
 * only their SHA-256 digests do, so searching the shipped JS for "admin", a route or an email
 * finds nothing. This is anti-discovery, not authorization: the real gate is Firebase Auth +
 * the emailed 6-digit code + the same allowlist enforced in worker.ts and firestore.rules.
 */

// Rotate the console URL by editing the path below, rehashing it, and replacing this digest.
const CONSOLE_PATH_DIGEST =
  '63b65316757578da5196a513402afc5b6709ea68875e841cd7e73427682c582b';

// digest → what the console may show for that account (names are already public on the site).
const ADMIN_DIGESTS: Array<[string, { name: string; role: string }]> = [
  ['3d42898c99b5059d686de13333e4c2862aa88cd2999cc361b11d9435a0476b7e', { name: 'Santosh Rout', role: 'Lead Developer & Co-Admin' }],
  ['f4fed4e6999964d614bf7a86153b3bca43c52c7df0e4cf41ea9d114afcd924d9', { name: 'Piyush Garai (Areex Cloud)', role: 'Founder & CEO' }],
];

async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) return '';
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizePath(path: string): string {
  return path.replace(/\/+$/, '').toLowerCase() || '/';
}

export async function isConsolePath(path: string): Promise<boolean> {
  return (await sha256Hex(normalizePath(path))) === CONSOLE_PATH_DIGEST;
}

export async function consoleProfileForEmail(
  email: string
): Promise<{ name: string; role: string } | null> {
  const digest = await sha256Hex((email || '').trim().toLowerCase());
  if (!digest) return null;
  return ADMIN_DIGESTS.find(([allowed]) => allowed === digest)?.[1] ?? null;
}
