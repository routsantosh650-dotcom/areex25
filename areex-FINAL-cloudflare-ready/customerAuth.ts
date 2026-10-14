import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPanelUserForSignup } from './provisioning';
import { generateTotpSecret, totpUri, verifyTotp } from './totp';

// Simple customer accounts (email + password). No Firebase, no Google.
// Registering also creates the SAME login on the Pterodactyl panel.
//fuckoff

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.join(__dirname, '.areex-users.json');

interface UserRec {
  uid: string;
  email: string;
  salt: string;
  hash: string;
  createdAt: string;
  totpSecretEnc?: string;
  mfaEnabled?: boolean;
}

let users: Record<string, UserRec> = {};
try {
  if (fs.existsSync(USERS_FILE)) users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
} catch {
  users = {};
}
const saveUsers = () => {
  const tempPath = `${USERS_FILE}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(users, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, USERS_FILE);
  } catch (error) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
    throw new AuthError(500, 'Could not save account security settings. Check persistent server storage.');
  }
};

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---- tiny in-memory rate limiter (per IP) ----
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new AuthError(429, 'Too many attempts. Please wait a few minutes and try again.');
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    // forget visitors who have been quiet for a while
    for (const [k, v] of hits) {
      if (!v.length || now - v[v.length - 1] > 60 * 60 * 1000) hits.delete(k);
    }
  }
}

// ---- signed session tokens ----
const SECRET = () => process.env.SESSION_SECRET || process.env.AES_MASTER_KEY || 'areex-session-fallback-change-me';
const TTL_MS = 7 * 24 * 3600 * 1000;
const sign = (body: string) => crypto.createHmac('sha256', SECRET()).update(body).digest('base64url');

const TOTP_KEY = () => crypto.scryptSync(SECRET(), 'areex-totp-at-rest-v1', 32);
function encryptTotpSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', TOTP_KEY(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${encrypted.toString('hex')}`;
}
function decryptTotpSecret(value: string): string {
  const [ivHex, tagHex, dataHex] = value.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', TOTP_KEY(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}
function issuePendingToken(email: string, purpose: 'setup' | 'verify') {
  const body = Buffer.from(JSON.stringify({ email, purpose, exp: Date.now() + 10 * 60 * 1000 })).toString('base64url');
  return `${body}.${sign(body)}`;
}
function readPendingToken(token: unknown, purpose: 'setup' | 'verify'): UserRec | null {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(expected); const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.purpose !== purpose || Date.now() > Number(payload.exp)) return null;
    return users[String(payload.email)] || null;
  } catch { return null; }
}


function issueToken(u: UserRec) {
  const body = Buffer.from(JSON.stringify({ uid: u.uid, email: u.email, exp: Date.now() + TTL_MS })).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string): { uid: string; email: string } | null {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!p.uid || !p.email || Date.now() > Number(p.exp)) return null;
    if (!users[p.email] || !users[p.email].mfaEnabled) return null;
    return { uid: String(p.uid), email: String(p.email) };
  } catch {
    return null;
  }
}

export function customerFromRequest(req: { headers: Record<string, unknown> }) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token ? verifyToken(token) : null;
}

// ---- register / login ----
const hashPassword = (password: string, salt: string) => crypto.scryptSync(password, salt, 64).toString('hex');
const cleanEmail = (e: unknown) => String(e || '').trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function registerCustomer(emailRaw: unknown, passwordRaw: unknown) {
  const email = cleanEmail(emailRaw);
  const password = String(passwordRaw || '');
  if (!EMAIL_RE.test(email) || email.length > 120) throw new AuthError(400, 'Please enter a valid email address.');
  if (password.length < 12 || password.length > 72) throw new AuthError(400, 'Password must be 12 to 72 characters.');
  if (users[email]) throw new AuthError(409, 'An account with this email already exists. Please log in.');

  // Create the same login on the panel. If the panel already has this email, refuse.
  try {
    const r = await createPanelUserForSignup(email, password);
    if (r.status === 'exists') {
      throw new AuthError(
        409,
        'This email already has a game-panel account. Please use a different email, or contact support.'
      );
    }
  } catch (e) {
    if (e instanceof AuthError) throw e;
    // panel unreachable: still allow signup; the panel account is created at payment time instead
    console.error('[register] panel account not created:', e instanceof Error ? e.message : e);
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const rec: UserRec = {
    uid: crypto.randomUUID(),
    email,
    salt,
    hash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
    totpSecretEnc: encryptTotpSecret(generateTotpSecret()),
    mfaEnabled: false,
  };
  users[email] = rec;
  saveUsers();
  const secret = decryptTotpSecret(rec.totpSecretEnc!);
  return {
    setupRequired: true,
    pendingToken: issuePendingToken(email, 'setup'),
    email,
    setupSecret: secret,
    otpauthUrl: totpUri(secret, email),
  };
}

export function loginCustomer(emailRaw: unknown, passwordRaw: unknown) {
  const email = cleanEmail(emailRaw);
  const password = String(passwordRaw || '');
  const rec = users[email];
  const wrong = new AuthError(401, 'Wrong email or password.');
  if (!rec) throw wrong;
  const a = Buffer.from(hashPassword(password.slice(0, 72), rec.salt), 'hex');
  const b = Buffer.from(rec.hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw wrong;

  // All accounts must enroll in authenticator-based MFA before receiving a session.
  if (!rec.totpSecretEnc) {
    rec.totpSecretEnc = encryptTotpSecret(generateTotpSecret());
    rec.mfaEnabled = false;
    saveUsers();
  }
  const secret = decryptTotpSecret(rec.totpSecretEnc);
  if (rec.mfaEnabled) {
    return { twoFactorRequired: true, pendingToken: issuePendingToken(email, 'verify'), email };
  }
  return {
    setupRequired: true,
    pendingToken: issuePendingToken(email, 'setup'),
    email,
    setupSecret: secret,
    otpauthUrl: totpUri(secret, email),
  };
}

export function verifyCustomerTotp(pendingToken: unknown, code: unknown) {
  const purpose = readPendingToken(pendingToken, 'setup') ? 'setup' : 'verify';
  const rec = readPendingToken(pendingToken, purpose);
  if (!rec || !rec.totpSecretEnc) throw new AuthError(401, 'Your verification session expired. Please log in again.');
  let secret = '';
  try { secret = decryptTotpSecret(rec.totpSecretEnc); } catch { throw new AuthError(500, 'Unable to read authenticator configuration.'); }
  if (!verifyTotp(secret, code)) throw new AuthError(401, 'Invalid authenticator code. Try the current 6-digit code.');
  if (purpose === 'setup') {
    rec.mfaEnabled = true;
    saveUsers();
  }
  return { token: issueToken(rec), email: rec.email, mfaEnabled: true };
}

// ---- admin tokens (issued by /api/admin/login, required to edit plans) ----
const ADMIN_TTL_MS = 12 * 3600 * 1000;

export function issueAdminToken(email: string) {
  const body = Buffer.from(JSON.stringify({ role: 'admin', email, exp: Date.now() + ADMIN_TTL_MS })).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function adminFromRequest(req: { headers: Record<string, unknown> }, allowedEmails: string[]) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (p.role !== 'admin' || Date.now() > Number(p.exp)) return null;
    if (!allowedEmails.includes(String(p.email).toLowerCase())) return null;
    return { email: String(p.email) };
  } catch {
    return null;
  }
}
