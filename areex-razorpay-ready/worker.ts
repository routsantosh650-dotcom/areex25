interface Env {
  OTP_DO: DurableObjectNamespace;
  ASSETS: Fetcher;
  FIREBASE_API_KEY: string;
  EMAILJS_SERVICE_ID: string;
  EMAILJS_TEMPLATE_ID: string;
  EMAILJS_PUBLIC_KEY: string;
  EMAILJS_PRIVATE_KEY: string;
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
}

const ADMIN_EMAILS = ['routsantosh650@gmail.com', 'areexcloud@gmail.com'];
const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

// Public Firebase config (already shipped inside the browser bundle), used here so the
// Worker can price an order straight from Firestore REST without any extra dashboard setup.
const FIREBASE_PROJECT_ID = 'independent-canopy-ljq9c';
const FIRESTORE_DATABASE_ID = 'ai-studio-areexcloudhighpe-c8a7cb9d-2050-47d1-b846-96dec9896db1';
const DATA_CENTER_NODES = ['Mumbai IN-West-1', 'Noida IN-North-1', 'Singapore SG-1'];

// Default price list, mirrored from src/data/areexData.ts. Prices are public (they are
// printed on the site), so keeping them here is not a secret — it just means the Worker,
// not the browser, decides what a plan costs. A document in Firestore /plans/{id} always
// wins over this table, which is exactly how the storefront merges admin price edits.
const FALLBACK_PLAN_PRICES: Record<string, number> = {
  budget_pro: 69,
  budget_max: 129,
  budget_titan: 199,
  budget_sudopodia: 279,
  budget_infinity: 349,
  budget_omega: 449,
  premium_elite: 399,
  premium_elite_plus: 499,
  premium_enterprise: 649,
  premium_enterprise_plus: 799,
  premium_titan: 1299,
  premium_titan_max: 2499,
  exclusive_core: 1499,
  exclusive_matrix: 2799,
  exclusive_apex: 4999,
  bot_starter: 29,
  bot_pro: 59,
  bot_cluster: 119,
  vps_starter: 149,
  vps_micro: 299,
  vps_macro: 499,
  vps_mega: 749,
  vps_large: 999,
  vps_ultra: 1499,
  vps_titan: 1999,
  domain_in: 449,
  domain_com: 899,
  domain_gg: 1299,
};

// Same idea for the promo codes printed on the storefront (src/data/areexData.ts).
const FALLBACK_COUPONS: Record<string, number> = {
  AREEX10: 10,
  INDIA20: 20,
  CHAMPION30: 30,
};

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

// Baseline hardening for every response this Worker serves (free tier, no dashboard setup).
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

function withSecurityHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!out.headers.has(key)) out.headers.set(key, value);
  }
  return out;
}

// Per-admin OTP record, persisted in the Durable Object's SQLite-backed storage
// so the code survives object eviction while the admin reads their email.
type OtpRecord = { code: string; expires: number; attempts: number };
type RateRecord = { start: number; count: number };

export class OtpStore {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    // Fixed-window counter. One instance per bucket name (per IP or per admin email),
    // so a single device cannot spam the email provider or brute-force codes.
    if (url.pathname === '/rate' && req.method === 'POST') {
      const body = (await req.json()) as { max?: number; windowMs?: number };
      const max = body.max || 5;
      const windowMs = body.windowMs || 15 * 60 * 1000;
      const now = Date.now();
      const rec = (await this.state.storage.get<RateRecord>('rate')) || { start: now, count: 0 };
      if (now - rec.start > windowMs) {
        rec.start = now;
        rec.count = 0;
      }
      rec.count += 1;
      await this.state.storage.put('rate', rec);
      const retryAfter = Math.max(1, Math.ceil((windowMs - (now - rec.start)) / 1000));
      return json({ allowed: rec.count <= max, retryAfter });
    }
    if (url.pathname === '/set' && req.method === 'POST') {
      const body = (await req.json()) as { code?: string };
      const rec: OtpRecord = { code: body.code || '', expires: Date.now() + CODE_TTL_MS, attempts: 0 };
      await this.state.storage.put('rec', rec);
      return json({ ok: true });
    }
    if (url.pathname === '/check' && req.method === 'POST') {
      const body = (await req.json()) as { code?: string };
      const rec = (await this.state.storage.get<OtpRecord>('rec')) || null;
      let result = 'expired';
      if (rec) {
        if (Date.now() > rec.expires) {
          await this.state.storage.delete('rec');
        } else if (rec.attempts >= MAX_ATTEMPTS) {
          await this.state.storage.delete('rec');
          result = 'too-many';
        } else {
          rec.attempts += 1;
          result = rec.code === (body.code || '') ? 'ok' : 'wrong';
          if (result === 'ok') await this.state.storage.delete('rec');
          else await this.state.storage.put('rec', rec);
        }
      }
      return json({ result });
    }
    return new Response('not found', { status: 404 });
  }
}

type FirebaseSession = { uid: string; email: string; verified: boolean };

async function sessionFromIdToken(
  idToken: string,
  apiKey: string
): Promise<FirebaseSession | null> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
  };
  const user = data.users?.[0];
  if (!user?.localId || !user.email) return null;
  return { uid: user.localId, email: user.email.toLowerCase(), verified: user.emailVerified === true };
}

async function emailFromIdToken(idToken: string, apiKey: string): Promise<string | null> {
  return (await sessionFromIdToken(idToken, apiKey))?.email ?? null;
}

async function sendCodeEmail(to: string, code: string, env: Env): Promise<'ok' | 'not-configured' | 'failed'> {
  if (!env.EMAILJS_SERVICE_ID || !env.EMAILJS_TEMPLATE_ID || !env.EMAILJS_PUBLIC_KEY) {
    return 'not-configured';
  }
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: env.EMAILJS_SERVICE_ID,
      template_id: env.EMAILJS_TEMPLATE_ID,
      user_id: env.EMAILJS_PUBLIC_KEY,
      accessToken: env.EMAILJS_PRIVATE_KEY || undefined,
      template_params: { to_email: to, code, to_name: 'Areex Admin' },
    }),
  });
  return res.ok ? 'ok' : 'failed';
}

// ---------- helpers for the Razorpay money path ----------

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64(value: string): Uint8Array {
  const bin = atob(value);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function hex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

// Length-independent comparison so a wrong signature cannot be measured byte-by-byte.
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function deriveVaultKeys(secret: string, iv: Uint8Array): Promise<{ aes: CryptoKey; mac: Uint8Array }> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: iv as unknown as BufferSource,
      info: new TextEncoder().encode('areex-order-credentials-v1'),
    },
    base,
    512
  );
  const all = new Uint8Array(bits);
  const aes = await crypto.subtle.importKey('raw', all.slice(0, 32) as unknown as BufferSource, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  return { aes, mac: all.slice(32, 64) };
}

async function encryptCredentials(plaintext: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { aes, mac } = await deriveVaultKeys(secret, iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    aes,
    new TextEncoder().encode(plaintext)
  );
  const ciphertextB64 = toBase64(ciphertext);
  const macKey = await crypto.subtle.importKey(
    'raw',
    mac as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', macKey, new TextEncoder().encode(ciphertextB64));
  return {
    ciphertext: ciphertextB64,
    iv: toBase64(iv.buffer as ArrayBuffer),
    hmacSignature: hex(new Uint8Array(signature)),
  };
}

async function decryptCredentials(ciphertextB64: string, ivB64: string, secret: string): Promise<string | null> {
  try {
    const iv = fromBase64(ivB64);
    const { aes } = await deriveVaultKeys(secret, iv);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      aes,
      fromBase64(ciphertextB64) as unknown as BufferSource
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

type FsValue = { integerValue?: string; doubleValue?: number; stringValue?: string };

// Reads run with the buyer's own Firebase ID token, i.e. exactly the rights the storefront
// already has. Anonymous callers get whatever the rules allow for the public.
async function readFirestoreDoc(
  env: Env,
  idToken: string,
  collection: string,
  id: string
): Promise<Record<string, FsValue> | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}` +
      `/databases/${FIRESTORE_DATABASE_ID}/documents/${collection}/${encodeURIComponent(id)}` +
      `?key=${env.FIREBASE_API_KEY}`,
    {
      headers: {
        'Cache-Control': 'no-store',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
    }
  );
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { fields?: Record<string, FsValue> } | null;
  return data?.fields || null;
}

const fsNum = (field?: FsValue): number | null => {
  if (!field) return null;
  const raw = field.integerValue ?? (field.doubleValue === undefined ? undefined : String(field.doubleValue)) ?? field.stringValue;
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const fsStr = (field?: FsValue): string => (typeof field?.stringValue === 'string' ? field.stringValue : '');

// True while Firestore holds no coupon at all, i.e. the admin never touched coupons and the
// storefront is still showing the built-in codes. Then the Worker may honour those built-ins.
async function couponsManagedInFirestore(env: Env, idToken: string): Promise<boolean> {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}` +
      `/databases/${FIRESTORE_DATABASE_ID}/documents/coupons` +
      `?pageSize=1&key=${env.FIREBASE_API_KEY}`,
    {
      headers: {
        'Cache-Control': 'no-store',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
    }
  );
  if (!res.ok) return false;
  const data = (await res.json().catch(() => null)) as { documents?: unknown[] } | null;
  return Array.isArray(data?.documents) && data.documents.length > 0;
}

// Firestore is authoritative; the mirrored price table covers plans that were never edited.
async function resolvePlan(
  env: Env,
  idToken: string,
  planId: string
): Promise<{ priceInr: number | null; category: string }> {
  const guessedCategory = planId.startsWith('bot_')
    ? 'bot'
    : planId.startsWith('vps_')
      ? 'vps'
      : planId.startsWith('domain_')
        ? 'domain'
        : 'minecraft';
  const fields = await readFirestoreDoc(env, idToken, 'plans', planId);
  if (fields) {
    return { priceInr: fsNum(fields.priceInr), category: fsStr(fields.category) || guessedCategory };
  }
  const fallback = FALLBACK_PLAN_PRICES[planId];
  return { priceInr: fallback === undefined ? null : fallback, category: guessedCategory };
}

async function resolveCoupon(env: Env, idToken: string, code: string): Promise<number | null> {
  const fields = await readFirestoreDoc(env, idToken, 'coupons', code);
  let percent: number | null = null;
  if (fields) {
    percent = fsNum(fields.discountPercent);
  } else if (!(await couponsManagedInFirestore(env, idToken))) {
    percent = FALLBACK_COUPONS[code] ?? null;
  }
  if (percent === null) return null;
  return percent >= 1 && percent <= 90 ? Math.round(percent) : null;
}

async function razorpayApi(env: Env, path: string, body?: Record<string, unknown>) {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: res.ok, status: res.status, data };
}

const isRazorpayConfigured = (env: Env): boolean =>
  Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_KEY_ID.startsWith('rzp_'));

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  return ((await req.json().catch(() => null)) as Record<string, unknown> | null) || {};
}

function bearerToken(req: Request): string {
  const raw = req.headers.get('authorization') || '';
  return raw.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const clientIp =
      req.headers.get('cf-connecting-ip') ||
      (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      'unknown';

    // Fixed-window counter kept in the same Durable Object class, one instance per bucket
    // name. Returns a 429 response once the window budget is used up.
    const limitBy = async (bucket: string, max: number, windowMs: number): Promise<Response | null> => {
      const stub = env.OTP_DO.get(env.OTP_DO.idFromName(bucket));
      const r = await stub.fetch('https://do/rate', {
        method: 'POST',
        body: JSON.stringify({ max, windowMs }),
      });
      const out = (await r.json().catch(() => null)) as { allowed?: boolean; retryAfter?: number } | null;
      if (!out || out.allowed) return null;
      return json({ ok: false, error: 'rate-limited', retryAfter: out.retryAfter || 60 }, 429);
    };

    if (url.pathname === '/api/admin/send-code' && req.method === 'POST') {
      // Every successful call sends a real email, so this is the endpoint that can drain
      // the 200/month EmailJS quota. Device limit first (before any upstream lookup).
      const tooManyDevices = await limitBy(`ip:${clientIp}`, 6, 15 * 60 * 1000);
      if (tooManyDevices) return tooManyDevices;
      const body = (await req.json()) as { idToken?: string };
      const email = body.idToken ? await emailFromIdToken(body.idToken, env.FIREBASE_API_KEY) : null;
      if (!email || !ADMIN_EMAILS.includes(email)) return json({ ok: false, error: 'not-admin' }, 403);
      const tooManyCodes = await limitBy(`code:${email}`, 3, 15 * 60 * 1000);
      if (tooManyCodes) return tooManyCodes;
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const sent = await sendCodeEmail(email, code, env);
      if (sent !== 'ok') return json({ ok: false, error: `email-${sent}` }, 502);
      const stub = env.OTP_DO.get(env.OTP_DO.idFromName(email));
      await stub.fetch('https://do/set', { method: 'POST', body: JSON.stringify({ code }) });
      return json({ ok: true });
    }

    if (url.pathname === '/api/admin/verify-code' && req.method === 'POST') {
      const tooManyTries = await limitBy(`verify:${clientIp}`, 30, 15 * 60 * 1000);
      if (tooManyTries) return tooManyTries;
      const body = (await req.json()) as { idToken?: string; code?: string };
      const email = body.idToken ? await emailFromIdToken(body.idToken, env.FIREBASE_API_KEY) : null;
      if (!email || !ADMIN_EMAILS.includes(email)) return json({ ok: false, error: 'not-admin' }, 403);
      const stub = env.OTP_DO.get(env.OTP_DO.idFromName(email));
      const r = await stub.fetch('https://do/check', {
        method: 'POST',
        body: JSON.stringify({ code: body.code || '' }),
      });
      const out = (await r.json()) as { result?: string };
      if (out.result === 'ok') return json({ ok: true });
      return json({ ok: false, error: out.result || 'wrong' }, 401);
    }

    // Client-facing IP for the audit log's "Device / IP" column. Cloudflare terminates the
    // real client IP here; the browser cannot know it.
    if (url.pathname === '/api/whoami' && req.method === 'GET') {
      const cf = (req as { cf?: { country?: string } }).cf;
      return json({
        ip: clientIp === 'unknown' ? '' : clientIp,
        country: cf?.country || '',
      });
    }

    // Which server software the checkout dropdown should show for this plan.
    if (url.pathname === '/api/provisioning/options' && req.method === 'GET') {
      const planId = url.searchParams.get('planId') || '';
      const isBot = planId ? (await resolvePlan(env, bearerToken(req), planId)).category === 'bot' : false;
      return json({
        kind: isBot ? 'bot' : 'minecraft',
        software: isBot
          ? [
              { key: 'python', label: 'Python bot' },
              { key: 'nodejs', label: 'Node.js bot' },
            ]
          : [
              { key: 'paper', label: 'Paper (recommended)' },
              { key: 'purpur', label: 'Purpur' },
              { key: 'spigot', label: 'Spigot' },
              { key: 'fabric', label: 'Fabric (mods)' },
              { key: 'forge', label: 'Forge (mods)' },
              { key: 'vanilla', label: 'Vanilla' },
            ],
      });
    }

    // Only the public key id is ever returned here; the secret stays in this Worker.
    if (url.pathname === '/api/razorpay/config' && req.method === 'GET') {
      const limited = await limitBy(`cfg:${clientIp}`, 60, 60 * 60 * 1000);
      if (limited) return limited;
      return json({
        configured: isRazorpayConfigured(env),
        keyId: isRazorpayConfigured(env) ? env.RAZORPAY_KEY_ID : '',
        currency: 'INR',
      });
    }

    // STEP 1: price the plan on the server (never trust the browser) and open a Razorpay order.
    if (url.pathname === '/api/razorpay/create-order' && req.method === 'POST') {
      const limited = await limitBy(`order:${clientIp}`, 20, 30 * 60 * 1000);
      if (limited) return limited;
      if (!isRazorpayConfigured(env)) {
        return json({ error: 'Payments are not configured yet. Please contact support.' }, 503);
      }
      const idToken = bearerToken(req);
      const session = await sessionFromIdToken(idToken, env.FIREBASE_API_KEY);
      if (!session) return json({ error: 'Login expired. Please log in again.' }, 401);
      if (!session.verified) {
        return json({ error: 'Please verify your email first, then pay.' }, 403);
      }

      const body = await readJsonBody(req);
      const planId = String(body.planId || '').slice(0, 64);
      const hostname = String(body.serverHostname || '').trim();
      const datacenterNode = String(body.datacenterNode || '').trim();
      if (hostname.length < 3 || hostname.length > 60) {
        return json({ error: 'Server name must be between 3 and 60 characters.' }, 400);
      }
      if (!DATA_CENTER_NODES.includes(datacenterNode)) {
        return json({ error: 'Please pick a valid datacenter location.' }, 400);
      }

      const plan = await resolvePlan(env, idToken, planId);
      const priceInr = plan.priceInr;
      if (priceInr === null || priceInr < 1 || priceInr > 500000) {
        return json({ error: 'This plan is not available for purchase right now.' }, 404);
      }

      let finalAmountInr = Math.round(priceInr);
      const rawCode = String(body.promoCode || '').trim().toUpperCase().slice(0, 64);
      if (rawCode) {
        const percent = await resolveCoupon(env, idToken, rawCode);
        if (percent === null) {
          return json({ error: `Coupon "${rawCode}" is not active. Remove it and pay again.` }, 400);
        }
        finalAmountInr = Math.max(1, Math.round(finalAmountInr * (1 - percent / 100)));
      }

      const created = await razorpayApi(env, '/orders', {
        amount: finalAmountInr * 100,
        currency: 'INR',
        receipt: `arx_${Date.now()}`,
        notes: {
          uid: session.uid,
          email: session.email,
          planId,
          hostname: hostname.slice(0, 100),
          datacenterNode,
          software: String(body.software || 'paper').slice(0, 30),
          version: String(body.version || 'latest').slice(0, 30),
          description: String(body.description || '').slice(0, 200),
        },
      });
      const rzpOrder = created.data as { id?: string; amount?: number } | null;
      if (!created.ok || !rzpOrder?.id) {
        return json({ error: 'Could not start the payment. Please try again.' }, 502);
      }
      return json({
        orderId: rzpOrder.id,
        amountPaise: finalAmountInr * 100,
        finalAmountInr,
        currency: 'INR',
        keyId: env.RAZORPAY_KEY_ID,
      });
    }

    // STEP 2: prove the payment really happened before recording anything.
    // Signature check + a direct lookup at Razorpay, so a fake browser callback cannot pass.
    if (url.pathname === '/api/razorpay/verify-payment' && req.method === 'POST') {
      const limited = await limitBy(`paid:${clientIp}`, 40, 15 * 60 * 1000);
      if (limited) return limited;
      if (!isRazorpayConfigured(env)) {
        return json({ error: 'Payments are not configured yet. Please contact support.' }, 503);
      }
      const session = await sessionFromIdToken(bearerToken(req), env.FIREBASE_API_KEY);
      if (!session) return json({ error: 'Login expired. Please log in again.' }, 401);

      const body = await readJsonBody(req);
      const orderId = String(body.razorpay_order_id || '');
      const paymentId = String(body.razorpay_payment_id || '');
      const signature = String(body.razorpay_signature || '');
      if (!orderId || !paymentId || !signature) {
        return json({ error: 'Missing Razorpay payment parameters.' }, 400);
      }
      const expected = hex(await hmacSha256(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`));
      if (!safeEqualHex(expected, signature)) {
        return json({ error: 'Razorpay payment signature verification failed.' }, 400);
      }

      const [orderRes, paymentRes] = await Promise.all([
        razorpayApi(env, `/orders/${encodeURIComponent(orderId)}`),
        razorpayApi(env, `/payments/${encodeURIComponent(paymentId)}`),
      ]);
      const order = (orderRes.data || {}) as Record<string, unknown>;
      const payment = (paymentRes.data || {}) as Record<string, unknown>;
      const notes = (order.notes || {}) as Record<string, string>;
      const captured =
        payment.order_id === orderId &&
        (payment.status === 'captured' || order.status === 'paid') &&
        Number(order.amount_paid) >= Number(order.amount);
      if (!captured) {
        return json(
          {
            error:
              'Razorpay has not marked this payment as captured yet. If money left your account, do not pay again — the order verifies automatically and we will set your server up.',
          },
          402
        );
      }
      if (notes.uid && notes.uid !== session.uid) {
        return json({ error: 'This order belongs to another account.' }, 403);
      }

      // No Pterodactyl panel is wired to the Worker yet, so the money is confirmed and the
      // server build is queued as 'provisioning' instead of pretending to be live.
      const paidPaise =
        Number(order.amount_paid) > 0 ? Number(order.amount_paid) : Number(order.amount);
      const amountInr = Math.max(1, Math.round(paidPaise / 100));
      const credentials = {
        transactionId: paymentId,
        serverUsername: session.email,
        serverPassword: 'Your Areex account password (same as website login)',
        dedicatedEndpoint: 'assigning...',
        sftpAddress: '',
        panelUrl: '',
        rconToken: '',
        datacenterNode: notes.datacenterNode || 'Mumbai IN-West-1',
        customerEmail: session.email,
        provisionedAt: new Date().toISOString(),
      };
      // A crypto problem must never lose a confirmed payment, so the vault has a fallback.
      let vault: { ciphertext: string; iv: string; hmacSignature: string };
      try {
        vault = await encryptCredentials(JSON.stringify(credentials), env.RAZORPAY_KEY_SECRET);
      } catch {
        vault = {
          ciphertext: `unsealed:${paymentId}:${session.email}`.slice(0, 200),
          iv: `iv-${paymentId}`.slice(0, 40),
          hmacSignature: '',
        };
      }
      return json({
        success: true,
        provisioned: false,
        status: 'provisioning',
        transactionId: paymentId,
        planId: notes.planId || '',
        finalAmountInr: amountInr,
        serverHostname: notes.hostname || '',
        datacenterNode: credentials.datacenterNode,
        panelUrl: '',
        encryptedCredentials: vault.ciphertext,
        encryptionIv: vault.iv,
        hmacSignature: vault.hmacSignature,
        credentials,
        message: `Payment received. Your server is being set up and will be ready within a few hours — we will email ${session.email} with the endpoint and panel login.`,
      });
    }

    // Credential vault tools. The vault key is derived from RAZORPAY_KEY_SECRET, so no
    // payment can be confirmed and nothing can be encrypted until that Secret is set.
    if (url.pathname === '/api/security/encrypt' && req.method === 'POST') {
      const limited = await limitBy(`vault:${clientIp}`, 20, 15 * 60 * 1000);
      if (limited) return limited;
      if (!env.RAZORPAY_KEY_SECRET) return json({ error: 'Vault key not configured.' }, 503);
      const session = await sessionFromIdToken(bearerToken(req), env.FIREBASE_API_KEY);
      if (!session || !ADMIN_EMAILS.includes(session.email)) {
        return json({ error: 'Admin login required.' }, 401);
      }
      const payload = String((await readJsonBody(req)).payload || '').slice(0, 1800);
      if (!payload) return json({ error: 'Nothing to encrypt.' }, 400);
      const vault = await encryptCredentials(payload, env.RAZORPAY_KEY_SECRET);
      return json({ ...vault, algorithm: 'AES-256-GCM', bytes: payload.length });
    }

    // Integrity check used by the checkout receipt: proves the stored vault decrypts.
    // Only an admin gets the plaintext back, so this cannot be used as a decrypt oracle.
    if (url.pathname === '/api/security/decrypt' && req.method === 'POST') {
      const limited = await limitBy(`vault:${clientIp}`, 20, 15 * 60 * 1000);
      if (limited) return limited;
      if (!env.RAZORPAY_KEY_SECRET) return json({ verified: false }, 200);
      const body = await readJsonBody(req);
      const plaintext = await decryptCredentials(
        String(body.ciphertext || ''),
        String(body.iv || ''),
        env.RAZORPAY_KEY_SECRET
      );
      const session = await sessionFromIdToken(bearerToken(req), env.FIREBASE_API_KEY);
      const isAdmin = Boolean(session && ADMIN_EMAILS.includes(session.email));
      return json({
        verified: plaintext !== null,
        algorithm: 'AES-256-GCM',
        plaintext: isAdmin ? plaintext : undefined,
      });
    }

    // Everything else is the static SPA.
    return withSecurityHeaders(await env.ASSETS.fetch(req));
  },
};
