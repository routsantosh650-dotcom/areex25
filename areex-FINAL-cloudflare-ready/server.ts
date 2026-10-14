import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import nodemailer from 'nodemailer';
import 'dotenv/config';
import {
  provisioningConfigured,
  getSoftwareOptions,
  resolvePlanSpec,
  setPlanSource,
  fulfillPaidOrder,
  takeOneTimePassword,
  failedOrders,
  resetFailed,
  getOrder,
} from './provisioning';
import { INITIAL_HOSTING_PLANS, PLAN_CATEGORIES, DEFAULT_SITE_CONFIG } from './src/data/areexData';
import type { HostingPlanItem, SiteConfigData } from './src/data/areexData';
import { FAQ_ITEMS } from './src/data/faq';
import { CUSTOMER_REVIEWS } from './src/data/reviews';
import { parseRoute } from './src/router';
import { renderSeoPage } from './seo';
import {
  AuthError,
  adminFromRequest,
  customerFromRequest,
  issueAdminToken,
  loginCustomer,
  rateLimit,
  registerCustomer,
  verifyCustomerTotp,
} from './customerAuth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_FILE_PATH = path.join(__dirname, '.areex-store.json');
const AUDIT_FILE_PATH = path.join(__dirname, '.areex-audit.jsonl');

// Derive a deterministic 256-bit (32-byte) key for AES-256-GCM encryption
const MASTER_SECRET = process.env.AES_MASTER_KEY || crypto.randomBytes(32).toString('hex');
const AES_KEY = crypto.scryptSync(MASTER_SECRET, 'areex-cloud-kdf-salt-v1', 32);

// Strictly 2 Authorized Admin Accounts (Gmail + Password + emailed one-time code)
const AUTHORIZED_ADMINS = [
  {
    email: 'routsantosh650@gmail.com',
    name: 'Santosh Rout',
    role: 'Lead Developer & Co-Admin',
    passwordHash: crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD_1 || '').digest('hex'),
  },
  {
    email: 'areexcloud@gmail.com',
    name: 'Piyush Garai (Areex Cloud)',
    role: 'Founder & CEO',
    passwordHash: crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD_2 || '').digest('hex'),
  },
];

// In-memory store of pending admin email-OTP challenges (email -> challenge)
interface PendingAdminOtp {
  hash: string;
  expiresAt: number;
  attempts: number;
}
const pendingAdminOtps = new Map<string, PendingAdminOtp>();
const ADMIN_OTP_TTL_MS = 5 * 60 * 1000;
const ADMIN_OTP_MAX_ATTEMPTS = 5;

const sendAdminOtpEmail = async (to: string, otp: string) => {
  const user = process.env.SMTP_EMAIL || '';
  const pass = process.env.SMTP_APP_PASSWORD || '';
  if (!user || !pass) {
    throw new Error('Email OTP service is not configured on the server (SMTP_EMAIL / SMTP_APP_PASSWORD missing).');
  }
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  await transporter.sendMail({
    from: `"Areex Cloud Security" <${user}>`,
    to,
    subject: 'Your Areex Cloud admin sign-in code',
    text:
      `Your admin verification code is: ${otp}\n\n` +
      'It expires in 5 minutes and can only be used once.\n' +
      'If you did not attempt to sign in, change your admin password immediately.',
  });
};

// Server-side live state for Discount Offer Board & Custom Coupon Codes
let serverDiscountOffer = '';
let serverDiscountPercent = 20;
let serverSiteConfig: SiteConfigData = { ...DEFAULT_SITE_CONFIG };

interface CouponRecord {
  code: string;
  discountPercent: number;
  description: string;
  createdAt: string;
}

export interface SupportTicketRecord {
  id: string;
  ticketNumber: string;
  customerName: string;
  customerEmail: string;
  discordHandle: string;
  category: string;
  priority: 'normal' | 'high' | 'urgent';
  serverIpOrId: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved';
  adminReply?: string;
  repliedBy?: string;
  createdAt: string;
  updatedAt: string;
}

let serverCoupons: CouponRecord[] = [
  {
    code: 'AREEX10',
    discountPercent: 10,
    description: '10% Instant Welcome Discount',
    createdAt: new Date().toISOString(),
  },
  {
    code: 'INDIA20',
    discountPercent: 20,
    description: '20% Founder Launch Discount',
    createdAt: new Date().toISOString(),
  },
  {
    code: 'CHAMPION30',
    discountPercent: 30,
    description: '30% Premium & Exclusive Network Offer',
    createdAt: new Date().toISOString(),
  },
];

let serverSupportTickets: SupportTicketRecord[] = [
  {
    id: 'tkt_initial_1',
    ticketNumber: 'ARX-9041',
    customerName: 'Aryan S.',
    customerEmail: 'aryan.smp@gmail.com',
    discordHandle: 'aryan_mc#0001',
    category: 'Free World Migration',
    priority: 'high',
    serverIpOrId: 'play.aryansmp.in',
    subject: 'Migrate 8GB PaperMC 1.21 world to Elite Plus Mumbai Node',
    message: 'Hi Areex team, I just purchased Elite Plus (32GB). Please help migrate my 8GB survival world and LuckPerms database.',
    status: 'resolved',
    adminReply: 'Migration completed to Mumbai IN-West-1 (4ms ping) with all plugins & MySQL data intact! Enjoy 20 TPS.',
    repliedBy: 'Piyush Garai (Founder)',
    createdAt: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
  },
];

let serverPlanOverrides: Record<string, unknown>[] = [];
let serverDeletedPlanIds: string[] = [];
// lets provisioning.ts see plans created in the admin page (so new plans auto-deploy)
setPlanSource(
  () => serverPlanOverrides,
  () => serverDeletedPlanIds
);

function loadServerStore() {
  try {
    if (fs.existsSync(STORE_FILE_PATH)) {
      const raw = fs.readFileSync(STORE_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.planOverrides)) {
        serverPlanOverrides = parsed.planOverrides;
      }
      if (Array.isArray(parsed.deletedPlanIds)) {
        serverDeletedPlanIds = parsed.deletedPlanIds;
      }
      if (typeof parsed.discountOffer === 'string') {
        serverDiscountOffer = parsed.discountOffer;
      }
      if (typeof parsed.discountPercent === 'number') {
        serverDiscountPercent = parsed.discountPercent;
      }
      if (Array.isArray(parsed.coupons)) {
        serverCoupons = parsed.coupons;
      }
      if (parsed.siteConfig && typeof parsed.siteConfig === 'object') {
        serverSiteConfig = { ...DEFAULT_SITE_CONFIG, ...parsed.siteConfig };
      }
      if (Array.isArray(parsed.supportTickets) && parsed.supportTickets.length > 0) {
        serverSupportTickets = parsed.supportTickets;
      }
    }
  } catch {
    // Ignore store load errors on fresh boot
  }
}

function saveServerStore() {
  const tempPath = `${STORE_FILE_PATH}.tmp`;
  try {
    const payload = JSON.stringify(
      {
        planOverrides: serverPlanOverrides,
        deletedPlanIds: serverDeletedPlanIds,
        discountOffer: serverDiscountOffer,
        discountPercent: serverDiscountPercent,
        coupons: serverCoupons,
        supportTickets: serverSupportTickets,
        siteConfig: serverSiteConfig,
      },
      null,
      2
    );
    fs.writeFileSync(tempPath, payload, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, STORE_FILE_PATH);
  } catch (error) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
    console.error('[store] persistent save failed:', error instanceof Error ? error.message : 'unknown error');
    throw new Error('Could not save changes to persistent server storage. Check disk permissions and available space.');
  }
}

loadServerStore();

function encryptAES256GCM(plaintext: string) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', AES_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combinedHex = Buffer.concat([encrypted, authTag]).toString('hex');
  const ivHex = iv.toString('hex');
  const hmacSignature = crypto
    .createHmac('sha256', AES_KEY)
    .update(`${ivHex}:${combinedHex}`)
    .digest('hex');

  return {
    ciphertext: combinedHex,
    iv: ivHex,
    authTag: authTag.toString('hex'),
    hmacSignature,
    algorithm: 'AES-256-GCM',
    keyLengthBits: 256,
  };
}

function decryptAES256GCM(combinedHex: string, ivHex: string) {
  const combined = Buffer.from(combinedHex, 'hex');
  if (combined.length < 16) {
    throw new Error('Invalid AES-256-GCM payload length');
  }
  const authTag = combined.subarray(combined.length - 16);
  const encrypted = combined.subarray(0, combined.length - 16);
  const iv = Buffer.from(ivHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', AES_KEY, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const required = ['SESSION_SECRET', 'AES_MASTER_KEY', 'ADMIN_PASSWORD_1', 'ADMIN_PASSWORD_2', 'SMTP_EMAIL', 'SMTP_APP_PASSWORD'];
    const missing = required.filter((key) => !String(process.env[key] || '').trim());
    if (missing.length) throw new Error(`Missing required production security environment variables: ${missing.join(', ')}`);
    for (const key of ['SESSION_SECRET', 'AES_MASTER_KEY']) {
      if (String(process.env[key]).length < 32) throw new Error(`${key} must be at least 32 characters long.`);
    }
    for (const key of ['ADMIN_PASSWORD_1', 'ADMIN_PASSWORD_2']) {
      if (String(process.env[key]).length < 16) throw new Error(`${key} must be at least 16 characters long.`);
    }
  }
  if (process.env.NODE_ENV === 'production') {
    try {
      fs.appendFileSync(AUDIT_FILE_PATH, '', { encoding: 'utf8', mode: 0o600 });
      fs.chmodSync(AUDIT_FILE_PATH, 0o600);
    } catch {
      throw new Error('Audit log storage is not writable. Configure persistent writable storage before starting production.');
    }
  }
  const app = express();
  app.set('trust proxy', 1); // behind Nginx
  const PORT = Number(process.env.PORT) || 3000;

  // keep the raw body: Razorpay's webhook signature is calculated on it
  app.use(
    express.json({
      limit: '64kb',
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf;
      },
    })
  );

  // ---------------------------------------------------------------------------
  // SECURITY BASICS
  // ---------------------------------------------------------------------------
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    }
    next();
  });

  // CORS: the frontend is hosted separately (Cloudflare), so only allow the listed site origins
  const allowedOrigins = new Set(
    String(process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean)
  );
  app.use((req, res, next) => {
    const origin = String(req.headers.origin || '');
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-admin-token');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // The visitor's IP (set BEHIND_CLOUDFLARE="true" in .env only if the domain is proxied by Cloudflare)
  const clientIp = (req: express.Request) =>
    process.env.BEHIND_CLOUDFLARE === 'true'
      ? String(req.headers['cf-connecting-ip'] || req.ip)
      : String(req.ip);

  // Returns false (and answers 429) when a visitor is doing too many requests
  const withinLimit = (req: express.Request, res: express.Response, key: string, max: number, windowMs: number) => {
    try {
      rateLimit(`${key}:${clientIp(req)}`, max, windowMs);
      return true;
    } catch {
      res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
      return false;
    }
  };

  // Generous limit on the whole API (the Razorpay webhook is exempt)
  app.use('/api', (req, res, next) => {
    if (req.path === '/razorpay/webhook') return next();
    if (!withinLimit(req, res, 'api', 600, 60 * 1000)) return;
    next();
  });

  const safeEqual = (a: string, b: string) => {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  };

  // Only a logged-in admin may change plans, coupons, offers and read / answer support tickets
  const requireAdmin = (req: express.Request, res: express.Response): boolean => {
    if (adminFromRequest(req, AUTHORIZED_ADMINS.map((a) => a.email))) return true;
    res.status(401).json({ error: 'Admin login required. Log out of the Admin Console and log in again.' });
    return false;
  };

  // Append-only JSONL audit trail. Record metadata and changed field names only, never values/secrets.
  app.use('/api', (req, res, next) => {
    if (req.path === '/admin/audit-log') return next();
    const startedAt = new Date().toISOString();
    res.on('finish', () => {
      try {
        const admin = adminFromRequest(req, AUTHORIZED_ADMINS.map((a) => a.email));
        const customer = customerFromRequest(req);
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const attemptedEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 120) : '';
        const actor = admin?.email || customer?.email || (req.path.includes('/login') && attemptedEmail ? `login-attempt:${attemptedEmail}` : 'anonymous');
        const fields: string[] = [];
        const changes: string[] = [];
        const collectFields = (value: unknown, prefix = '', depth = 0) => {
          if (!value || typeof value !== 'object' || depth > 3 || fields.length >= 40) return;
          for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
            if (/password|secret|token|code|otp|authorization|credential/i.test(key)) continue;
            const fieldPath = prefix ? `${prefix}.${key}` : key;
            fields.push(fieldPath.slice(0, 120));
            if (nested === null || ['string', 'number', 'boolean'].includes(typeof nested)) {
              if (!/password|secret|token|code|otp|authorization|credential|email|message|reply|description|hostname|address|phone/i.test(key)) {
                const safeValue = typeof nested === 'string' ? nested.replace(/[\r\n]+/g, ' ').slice(0, 80) : String(nested);
                if (safeValue) changes.push(`${fieldPath.slice(0, 80)}=${safeValue}`);
              }
            }
            if (nested && typeof nested === 'object' && !Array.isArray(nested)) collectFields(nested, fieldPath, depth + 1);
            if (fields.length >= 40) break;
          }
        };
        collectFields(body);
        const event = {
          id: crypto.randomUUID(),
          timestamp: startedAt,
          actor,
          action: `${req.method} ${req.path} ${res.statusCode >= 400 ? 'failed' : 'completed'}`,
          method: req.method,
          path: req.path.slice(0, 200),
          status: res.statusCode,
          ip: String(req.ip || '').slice(0, 80),
          fields,
          changes: changes.slice(0, 40),
          durationMs: Math.max(0, Date.now() - Date.parse(startedAt)),
          userAgent: String(req.headers['user-agent'] || '').slice(0, 240),
        };
        fs.appendFileSync(AUDIT_FILE_PATH, JSON.stringify(event) + '\n', { encoding: 'utf8', mode: 0o600 });
      } catch (err) {
        console.error('[audit] failed to append event:', err instanceof Error ? err.message : 'unknown error');
      }
    });
    next();
  });



  // Admin login step 1: Gmail + Password → sends a one-time 6-digit code to the admin's email
  app.post('/api/admin/login', async (req, res) => {
    // slow down password guessing (10 tries / 15 min per visitor)
    if (!withinLimit(req, res, 'adminlogin', 10, 15 * 60 * 1000)) return;
    try {
      const { email, password } = req.body;
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const rawPassword = String(password || '').trim();

      const matchedAdmin = AUTHORIZED_ADMINS.find((a) => a.email === normalizedEmail);
      if (!matchedAdmin) {
        res.status(403).json({
          error:
            'Access denied. This account is not authorized for the admin console.',
        });
        return;
      }

      const inputHash = crypto.createHash('sha256').update(rawPassword).digest('hex');
      if (!process.env[`ADMIN_PASSWORD_${AUTHORIZED_ADMINS.indexOf(matchedAdmin) + 1}`] || !safeEqual(inputHash, matchedAdmin.passwordHash)) {
        res.status(401).json({
          error: 'Invalid admin credentials.',
        });
        return;
      }

      const otp = String(crypto.randomInt(100000, 1000000));
      pendingAdminOtps.set(normalizedEmail, {
        hash: crypto.createHash('sha256').update(otp).digest('hex'),
        expiresAt: Date.now() + ADMIN_OTP_TTL_MS,
        attempts: 0,
      });
      try {
        await sendAdminOtpEmail(normalizedEmail, otp);
      } catch (err) {
        pendingAdminOtps.delete(normalizedEmail);
        console.error('[admin-otp] email send failed:', err instanceof Error ? err.message : err);
        res.status(502).json({ error: 'Could not send the verification email. Check the server SMTP settings.' });
        return;
      }
      res.json({ otpSent: true, email: matchedAdmin.email });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Admin login failed',
      });
    }
  });

  // Admin login step 2: verify the emailed 6-digit code → issue the admin session token
  app.post('/api/admin/verify-otp', (req, res) => {
    if (!withinLimit(req, res, 'adminotp', 10, 15 * 60 * 1000)) return;
    try {
      const { email, otp } = req.body;
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const fail = () => {
        res.status(401).json({ error: 'Invalid or expired verification code. Start the login again.' });
      };
      const pending = pendingAdminOtps.get(normalizedEmail);
      if (!pending) return fail();
      if (Date.now() > pending.expiresAt) {
        pendingAdminOtps.delete(normalizedEmail);
        return fail();
      }
      pending.attempts += 1;
      const inputHash = crypto.createHash('sha256').update(String(otp || '')).digest('hex');
      if (!safeEqual(inputHash, pending.hash) || pending.attempts >= ADMIN_OTP_MAX_ATTEMPTS) {
        if (pending.attempts >= ADMIN_OTP_MAX_ATTEMPTS) pendingAdminOtps.delete(normalizedEmail);
        return fail();
      }
      pendingAdminOtps.delete(normalizedEmail);
      const matchedAdmin = AUTHORIZED_ADMINS.find((a) => a.email === normalizedEmail);
      if (!matchedAdmin) return fail();

      const tokenPayload = JSON.stringify({
        email: matchedAdmin.email,
        name: matchedAdmin.name,
        role: matchedAdmin.role,
        issuedAt: Date.now(),
      });
      const encryptedSession = encryptAES256GCM(tokenPayload);

      res.json({
        authenticated: true,
        admin: {
          email: matchedAdmin.email,
          name: matchedAdmin.name,
          role: matchedAdmin.role,
        },
        sessionToken: encryptedSession.ciphertext,
        sessionIv: encryptedSession.iv,
        adminToken: issueAdminToken(matchedAdmin.email),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Admin verification failed',
      });
    }
  });

  app.get('/api/admin/audit-log', (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const content = fs.existsSync(AUDIT_FILE_PATH) ? fs.readFileSync(AUDIT_FILE_PATH, 'utf8') : '';
      const entries = content.split('\n').filter(Boolean).slice(-1000).reverse().flatMap((line) => {
        try { return [JSON.parse(line)]; } catch { return []; }
      });
      res.json({ entries, totalReturned: entries.length, storage: 'server JSONL append-only file' });
    } catch {
      res.status(500).json({ error: 'Could not read the audit log.' });
    }
  });

  // Get & Update Discount Offer Board (with discount percentage for strikethrough pricing)
  app.get('/api/discount-board', (_req, res) => {
    res.json({
      discountOffer: serverDiscountOffer,
      discountPercent: serverDiscountPercent,
    });
  });

  app.post('/api/discount-board', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { discountOffer, discountPercent } = req.body;
    serverDiscountOffer = typeof discountOffer === 'string' ? discountOffer.slice(0, 240) : '';
    if (discountPercent !== undefined) {
      serverDiscountPercent = Math.min(90, Math.max(0, Number(discountPercent) || 0));
    }
    saveServerStore();
    res.json({
      success: true,
      discountOffer: serverDiscountOffer,
      discountPercent: serverDiscountPercent,
    });
  });

  app.get('/api/site-config', (_req, res) => {
    res.json({ config: serverSiteConfig });
  });

  app.put('/api/site-config', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const incoming = req.body?.config;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      res.status(400).json({ error: 'A valid site config object is required.' });
      return;
    }
    const bounded = (key: keyof SiteConfigData, max: number) =>
      typeof incoming[key] === 'string' ? String(incoming[key]).trim().slice(0, max) : serverSiteConfig[key];
    const boundedUrl = (key: keyof SiteConfigData, max: number) => {
      const candidate = bounded(key, max);
      try {
        const parsed = new URL(candidate);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString().slice(0, max) : serverSiteConfig[key];
      } catch { return serverSiteConfig[key]; }
    };
    serverSiteConfig = {
      ...serverSiteConfig,
      brandName: bounded('brandName', 60),
      heroTitle: bounded('heroTitle', 120),
      heroSubtitle: bounded('heroSubtitle', 300),
      panelUrl: boundedUrl('panelUrl', 200),
      discordUrl: boundedUrl('discordUrl', 200),
      storeUrl: boundedUrl('storeUrl', 200),
      supportTicketUrl: boundedUrl('supportTicketUrl', 200),
      founderName: bounded('founderName', 80),
      founderQuote: bounded('founderQuote', 400),
      instagramUrl: boundedUrl('instagramUrl', 200),
      youtubeUrl: boundedUrl('youtubeUrl', 200),
      discountOffer: bounded('discountOffer', 240),
    };
    saveServerStore();
    res.json({ success: true, config: serverSiteConfig });
  });

  // Coupon Code Management Endpoints
  app.get('/api/coupons', (_req, res) => {
    res.json({ coupons: serverCoupons });
  });

  app.post('/api/coupons', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { code, discountPercent, description } = req.body;
    const cleanCode = String(code || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '')
      .slice(0, 24);
    const pct = Math.min(95, Math.max(1, Math.round(Number(discountPercent) || 10)));
    if (!cleanCode) {
      res.status(400).json({ error: 'Valid alphanumeric coupon code is required.' });
      return;
    }
    const newCoupon: CouponRecord = {
      code: cleanCode,
      discountPercent: pct,
      description: String(description || `${pct}% Discount Coupon`).slice(0, 100),
      createdAt: new Date().toISOString(),
    };
    serverCoupons = [
      newCoupon,
      ...serverCoupons.filter((c) => c.code !== cleanCode),
    ];
    saveServerStore();
    res.json({ success: true, coupons: serverCoupons, coupon: newCoupon });
  });

  app.delete('/api/coupons/:code', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const target = String(req.params.code || '').trim().toUpperCase();
    serverCoupons = serverCoupons.filter((c) => c.code !== target);
    saveServerStore();
    res.json({ success: true, coupons: serverCoupons });
  });

  // Server-side Live Plans Override Endpoints (supports custom description, features & originalPriceInr)
  app.get('/api/plans', (_req, res) => {
    res.json({ plans: serverPlanOverrides, deletedPlanIds: serverDeletedPlanIds });
  });

  app.post('/api/plans', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { plan } = req.body;
    if (!plan || typeof plan.id !== 'string') {
      res.status(400).json({ error: 'Valid plan object is required.' });
      return;
    }
    const customDesc =
      typeof plan.tagline === 'string' && plan.tagline.trim()
        ? plan.tagline.trim()
        : typeof plan.description === 'string'
        ? plan.description.trim()
        : '';
    const normalizedPlan = {
      ...plan,
      adminVerified: true, // set only here, after the admin login check
      tagline: customDesc,
      description: customDesc,
      features: Array.isArray(plan.features) ? plan.features.map(String) : [],
    };
    serverDeletedPlanIds = serverDeletedPlanIds.filter((id) => id !== plan.id);
    serverPlanOverrides = [
      ...serverPlanOverrides.filter((p) => p.id !== plan.id),
      normalizedPlan,
    ];
    saveServerStore();
    res.json({
      success: true,
      plans: serverPlanOverrides,
      deletedPlanIds: serverDeletedPlanIds,
    });
  });

  app.delete('/api/plans/:id', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const targetId = String(req.params.id || '');
    serverPlanOverrides = serverPlanOverrides.filter((p) => p.id !== targetId);
    if (targetId && !serverDeletedPlanIds.includes(targetId)) {
      serverDeletedPlanIds.push(targetId);
    }
    saveServerStore();
    res.json({
      success: true,
      plans: serverPlanOverrides,
      deletedPlanIds: serverDeletedPlanIds,
    });
  });

  // Customer Support Helpdesk Ticket Endpoints
  // Tickets contain customer names and emails: only admins may read the list
  app.get('/api/support/tickets', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({ tickets: serverSupportTickets });
  });

  app.post('/api/support/tickets', (req, res) => {
    if (!withinLimit(req, res, 'ticket', 5, 10 * 60 * 1000)) return;
    const {
      customerName,
      customerEmail,
      discordHandle,
      category,
      priority,
      serverIpOrId,
      subject,
      message,
    } = req.body;

    if (!customerName || !customerEmail || !subject || !message) {
      res.status(400).json({ error: 'Name, email, subject, and message are required.' });
      return;
    }

    const ticketNumber = `ARX-${crypto.randomInt(1000, 9999)}`;
    const nowIso = new Date().toISOString();
    const newTicket: SupportTicketRecord = {
      id: `tkt_${Date.now()}`,
      ticketNumber,
      customerName: String(customerName).slice(0, 80),
      customerEmail: String(customerEmail).slice(0, 120),
      discordHandle: String(discordHandle || 'Not provided').slice(0, 60),
      category: String(category || 'General Technical Support').slice(0, 60),
      priority:
        priority === 'urgent' || priority === 'high' ? priority : 'normal',
      serverIpOrId: String(serverIpOrId || 'New / Pre-Sales').slice(0, 80),
      subject: String(subject).slice(0, 140),
      message: String(message).slice(0, 1200),
      status: 'open',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    serverSupportTickets = [newTicket, ...serverSupportTickets].slice(0, 1000);
    saveServerStore();
    // only return the visitor's own ticket (never everybody else's)
    res.json({ success: true, ticket: newTicket });
  });

  app.patch('/api/support/tickets/:id', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const ticketId = String(req.params.id || '');
    const { status, adminReply, repliedBy } = req.body;
    const idx = serverSupportTickets.findIndex((t) => t.id === ticketId);
    if (idx === -1) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }

    const existing = serverSupportTickets[idx];
    const updated: SupportTicketRecord = {
      ...existing,
      status:
        status === 'open' || status === 'in_progress' || status === 'resolved'
          ? status
          : existing.status,
      adminReply:
        typeof adminReply === 'string'
          ? adminReply.slice(0, 1000)
          : existing.adminReply,
      repliedBy:
        typeof repliedBy === 'string'
          ? repliedBy.slice(0, 80)
          : existing.repliedBy,
      updatedAt: new Date().toISOString(),
    };

    serverSupportTickets[idx] = updated;
    saveServerStore();
    res.json({ success: true, ticket: updated, tickets: serverSupportTickets });
  });

  // Health & AES-256 Security Status Endpoint
  app.get('/api/security/status', (_req, res) => {
    res.json({
      encryptionStandard: 'AES-256-GCM',
      kdf: 'scrypt (N=16384, r=8, p=1)',
      integrityHmac: 'HMAC-SHA256',
      keyLengthBits: 256,
      authorizedAdminCount: 2,
      zeroTrustRulesActive: true,
      timestamp: new Date().toISOString(),
    });
  });

  // Live AES-256-GCM Encryption Endpoint
  app.post('/api/security/encrypt', (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const { payload } = req.body;
      const text = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
      if (!text || text.length > 4096) {
        res.status(400).json({ error: 'Payload must be between 1 and 4096 characters.' });
        return;
      }
      const result = encryptAES256GCM(text);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Encryption failed',
      });
    }
  });

  // Live AES-256-GCM Decryption Endpoint
  app.post('/api/security/decrypt', (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const { ciphertext, iv } = req.body;
      if (typeof ciphertext !== 'string' || typeof iv !== 'string') {
        res.status(400).json({ error: 'Both ciphertext and iv hex strings are required.' });
        return;
      }
      const plaintext = decryptAES256GCM(ciphertext, iv);
      res.json({
        plaintext,
        verified: true,
        algorithm: 'AES-256-GCM',
      });
    } catch (error) {
      res.status(400).json({
        error: 'AES-256-GCM authentication tag verification failed or invalid ciphertext.',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ======================================================================
  // RAZORPAY + AUTOMATIC PTERODACTYL PROVISIONING
  // Keys come ONLY from .env (never write secrets inside the code).
  // ======================================================================
  const RZP_KEY_ID = () => (process.env.RAZORPAY_KEY_ID || '').trim();
  const RZP_KEY_SECRET = () => (process.env.RAZORPAY_KEY_SECRET || '').trim();
  const rzpAuthHeader = () =>
    `Basic ${Buffer.from(`${RZP_KEY_ID()}:${RZP_KEY_SECRET()}`).toString('base64')}`;

  // Checks the customer's login token -> returns their uid + email.
  async function verifyFirebaseUser(req: express.Request) {
    const c = customerFromRequest(req);
    return c ? { uid: c.uid, email: c.email, emailVerified: true } : null;
  }

  // ---- Customer accounts (email + password, linked to the panel) ----
  app.post('/api/auth/register', async (req, res) => {
    try {
      rateLimit(`reg:${clientIp(req)}`, 8, 15 * 60 * 1000);
      res.json(await registerCustomer(req.body?.email, req.body?.password));
    } catch (e) {
      const status = e instanceof AuthError ? e.status : 500;
      res.status(status).json({ error: e instanceof Error ? e.message : 'Sign-up failed' });
    }
  });
  app.post('/api/auth/login', (req, res) => {
    try {
      rateLimit(`login:${clientIp(req)}`, 15, 15 * 60 * 1000);
      res.json(loginCustomer(req.body?.email, req.body?.password));
    } catch (e) {
      const status = e instanceof AuthError ? e.status : 500;
      res.status(status).json({ error: e instanceof Error ? e.message : 'Login failed' });
    }
  });
  app.post('/api/auth/2fa/verify', (req, res) => {
    try {
      rateLimit(`mfa:${clientIp(req)}`, 10, 10 * 60 * 1000);
      const result = verifyCustomerTotp(req.body?.pendingToken, req.body?.code);
      res.json(result);
    } catch (e) {
      const status = e instanceof AuthError ? e.status : 500;
      res.status(status).json({ error: e instanceof Error ? e.message : 'Two-factor verification failed.' });
    }
  });

  app.get('/api/auth/me', (req, res) => {
    const c = customerFromRequest(req);
    if (!c) {
      res.status(401).json({ error: 'Not logged in' });
      return;
    }
    res.json({ email: c.email });
  });

  const priceAfterCoupon = (priceInr: number, promoCode: unknown) => {
    const code = String(promoCode || '').trim().toUpperCase();
    const coupon = code ? serverCoupons.find((c) => c.code === code) : undefined;
    const pct = coupon ? coupon.discountPercent : 0;
    return Math.max(1, Math.round(priceInr * (1 - pct / 100)));
  };

  app.get('/api/razorpay/config', (_req, res) => {
    const keyId = RZP_KEY_ID();
    res.json({
      configured: keyId.startsWith('rzp_'),
      hasOrderSecret: Boolean(RZP_KEY_SECRET()),
      keyId: keyId.startsWith('rzp_') ? keyId : null,
      mode: keyId.startsWith('rzp_live_') ? 'live' : 'test',
      autoProvisioning: provisioningConfigured(),
    });
  });

  // Tells the checkout page which software choices exist (set by your .env)
  app.get('/api/provisioning/options', async (req, res) => {
    try {
      // ?planId=... picks Minecraft software or Python / Node.js depending on the plan
      const spec = req.query.planId ? resolvePlanSpec(String(req.query.planId)) : null;
      const list = await getSoftwareOptions(spec?.kind || 'minecraft');
      res.json({ kind: spec?.kind || 'minecraft', software: list.map(({ key, label }) => ({ key, label })) });
    } catch (e) {
      console.error('[options]', e);
      res.json({ kind: 'minecraft', software: [] });
    }
  });

  // STEP 1: customer must be logged in. Price is decided HERE, not by the browser.
  app.post('/api/razorpay/create-order', async (req, res) => {
    if (!withinLimit(req, res, 'order', 20, 10 * 60 * 1000)) return;
    try {
      const user = await verifyFirebaseUser(req);
      if (!user) {
        res.status(401).json({ error: 'Please log in (create an account) before paying.' });
        return;
      }
      if (!RZP_KEY_ID() || !RZP_KEY_SECRET()) {
        res.status(500).json({ error: 'Razorpay keys are not configured on the server.' });
        return;
      }
      const { planId, promoCode, serverHostname, datacenterNode, software, version, description } = req.body;
      const spec = resolvePlanSpec(String(planId));
      if (!spec) {
        res.status(400).json({ error: 'This plan cannot be bought automatically. Please open a support ticket.' });
        return;
      }
      const softwareChoices = await getSoftwareOptions(spec.kind);
      const chosenSoftware =
        softwareChoices.find((o) => o.key === String(software || '')) ||
        (!software ? softwareChoices[0] : undefined);
      if (!chosenSoftware) {
        res.status(400).json({ error: 'That server software is not available.' });
        return;
      }
      const chosenVersion = spec.kind === 'minecraft' ? String(version || 'latest').trim() : 'latest';
      if (!/^(latest|\d{1,2}\.\d{1,2}(\.\d{1,2})?)$/.test(chosenVersion)) {
        res.status(400).json({ error: 'Version must look like 1.21.4 or "latest".' });
        return;
      }
      const finalAmountInr = priceAfterCoupon(spec.priceInr, promoCode);

      const rzpResponse = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { Authorization: rzpAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: finalAmountInr * 100,
          currency: 'INR',
          receipt: `arx_${Date.now()}`,
          notes: {
            planId: String(planId),
            uid: user.uid,
            email: user.email,
            hostname: String(serverHostname || 'Areex Server').slice(0, 60),
            datacenterNode: String(datacenterNode || 'Mumbai IN-West-1'),
            software: chosenSoftware.key,
            version: chosenVersion,
            description: String(description || '').replace(/[\r\n]+/g, ' ').slice(0, 200),
          },
        }),
      });
      const rzpData: any = await rzpResponse.json();
      if (!rzpResponse.ok || !rzpData.id) {
        res.status(400).json({ error: rzpData?.error?.description || 'Failed to create Razorpay order.' });
        return;
      }
      res.json({
        orderId: rzpData.id,
        amountPaise: rzpData.amount,
        finalAmountInr,
        currency: 'INR',
        keyId: RZP_KEY_ID(),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Order creation failed' });
    }
  });

  // Shared by the browser callback AND the webhook. Asks Razorpay directly, so it can't be faked.
  async function confirmWithRazorpayAndFulfill(orderId: string, paymentId: string) {
    const headers = { Authorization: rzpAuthHeader() };
    const order: any = await (await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, { headers })).json();
    const payment: any = await (await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, { headers })).json();

    const paid =
      payment?.order_id === orderId &&
      (payment?.status === 'captured' || order?.status === 'paid') &&
      Number(order?.amount_paid) >= Number(order?.amount);
    if (!paid) throw new Error('Razorpay has not confirmed this payment yet.');

    return fulfillPaidOrder({
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      amountPaidPaise: Number(order.amount_paid),
      notes: order.notes || {},
    });
  }

  // STEP 2 (browser): after the Razorpay popup succeeds
  app.post('/api/razorpay/verify-payment', async (req, res) => {
    try {
      const user = await verifyFirebaseUser(req);
      if (!user) {
        res.status(401).json({ error: 'Login expired. Please log in again.' });
        return;
      }
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        res.status(400).json({ error: 'Missing Razorpay payment parameters.' });
        return;
      }
      const expected = crypto
        .createHmac('sha256', RZP_KEY_SECRET())
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');
      if (!safeEqual(expected, String(razorpay_signature))) {
        res.status(400).json({ error: 'Razorpay payment signature verification failed.' });
        return;
      }

      const rec = await confirmWithRazorpayAndFulfill(String(razorpay_order_id), String(razorpay_payment_id));
      if (rec.uid !== user.uid) {
        res.status(403).json({ error: 'This order belongs to another account.' });
        return;
      }
      if (rec.status === 'failed') {
        res.status(202).json({
          success: true,
          provisioned: false,
          transactionId: rec.razorpayPaymentId,
          message:
            'Payment received. Your server is taking longer than usual to set up; our team has been alerted and will finish it shortly.',
        });
        return;
      }

      const oneTimePassword = takeOneTimePassword(rec.razorpayOrderId);
      const credentialsObject = {
        transactionId: rec.razorpayPaymentId,
        serverUsername: rec.panelEmail || rec.email,
        serverPassword: oneTimePassword || 'Your Areex account password (same as website login)',
        dedicatedEndpoint: rec.endpoint || 'assigning...',
        sftpAddress: rec.panelUrl || '',
        panelUrl: rec.panelUrl || '',
        rconToken: '',
        datacenterNode: rec.datacenterNode,
        customerEmail: rec.email,
        provisionedAt: rec.createdAt,
      };
      const vault = encryptAES256GCM(JSON.stringify(credentialsObject));
      res.json({
        success: true,
        provisioned: true,
        transactionId: rec.razorpayPaymentId,
        planId: rec.planId,
        finalAmountInr: rec.amountInr,
        serverHostname: rec.hostname,
        datacenterNode: rec.datacenterNode,
        panelUrl: rec.panelUrl,
        encryptedCredentials: vault.ciphertext,
        encryptionIv: vault.iv,
        hmacSignature: vault.hmacSignature,
        credentials: credentialsObject,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Verification failed' });
    }
  });

  // STEP 2 (backup): Razorpay calls this itself, even if the customer closes the tab.
  // Razorpay Dashboard -> Settings -> Webhooks -> URL: https://YOURDOMAIN/api/razorpay/webhook
  // Events: payment.captured, order.paid     Secret: same as RAZORPAY_WEBHOOK_SECRET
  app.post('/api/razorpay/webhook', async (req, res) => {
    try {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
      const signature = String(req.headers['x-razorpay-signature'] || '');
      const raw: Buffer | undefined = (req as any).rawBody;
      if (!secret || !raw) {
        res.status(400).send('not configured');
        return;
      }
      const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
      const ok =
        expected.length === signature.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
      if (!ok) {
        res.status(400).send('bad signature');
        return;
      }
      const event = req.body?.event;
      const pay = req.body?.payload?.payment?.entity;
      if ((event === 'payment.captured' || event === 'order.paid') && pay?.order_id && pay?.id) {
        await confirmWithRazorpayAndFulfill(pay.order_id, pay.id);
      }
      res.status(200).send('ok');
    } catch (e) {
      console.error('[webhook]', e);
      res.status(500).send('retry'); // Razorpay will retry automatically
    }
  });

  // Fake free "provisioning" removed: it handed out credentials WITHOUT any payment.
  app.post('/api/checkout/process', (_req, res) => {
    res.status(410).json({ error: 'Disabled. Use Razorpay checkout.' });
  });

  // Paid-but-failed orders (you are told here if the panel was down). Needs admin header.
  app.get('/api/admin/failed-orders', (req, res) => {
    if (!requireAdmin(req, res)) return;
    if (!process.env.ADMIN_API_TOKEN || !safeEqual(String(req.headers['x-admin-token'] || ''), process.env.ADMIN_API_TOKEN)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    res.json({ failed: failedOrders() });
  });
  app.post('/api/admin/retry-order/:id', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    if (!process.env.ADMIN_API_TOKEN || !safeEqual(String(req.headers['x-admin-token'] || ''), process.env.ADMIN_API_TOKEN)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    try {
      const old = getOrder(req.params.id);
      if (!old) {
        res.status(404).json({ error: 'unknown order' });
        return;
      }
      resetFailed(req.params.id);
      const rec = await confirmWithRazorpayAndFulfill(req.params.id, old.razorpayPaymentId);
      res.json({ status: rec.status, error: rec.error });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // Real-time Datacenter Node Telemetry Endpoint
  app.get('/api/telemetry/nodes', (_req, res) => {
    res.json({
      nodes: [
        {
          id: 'in-mum-01',
          name: 'Mumbai IN-West-1',
          cpuModel: 'AMD Ryzen 9 9950X (5.7 GHz)',
          pingMs: 4,
          uptime: '99.99%',
          loadPercent: 34,
          ddosCapacity: '17.2 Tbps CosmicGuard',
          status: 'Operational',
        },
        {
          id: 'in-del-01',
          name: 'Noida IN-North-1',
          cpuModel: 'AMD EPYC 7B13 (64-Core)',
          pingMs: 9,
          uptime: '99.98%',
          loadPercent: 41,
          ddosCapacity: '12.0 Tbps Path.net',
          status: 'Operational',
        },
        {
          id: 'sg-sin-01',
          name: 'Singapore SG-1',
          cpuModel: 'AMD Ryzen 9 9950X + NVMe Gen5',
          pingMs: 28,
          uptime: '99.99%',
          loadPercent: 29,
          ddosCapacity: '17.2 Tbps Anycast',
          status: 'Operational',
        },
      ],
    });
  });

  // Always serve /src/assets/images statically in both dev and production builds
  app.use('/src/assets/images', express.static(path.join(__dirname, 'src', 'assets', 'images')));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    // index:false so the home page also goes through the SEO renderer below
    app.use(express.static(distPath, { index: false }));

    let cachedIndexHtml: string | null = null;
    app.use((req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      try {
        if (!cachedIndexHtml) cachedIndexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');

        // current plans = built-in plans, changed by whatever the admin saved, minus deleted ones
        const byId = new Map<string, HostingPlanItem>(INITIAL_HOSTING_PLANS.map((p) => [p.id, p]));
        for (const ov of serverPlanOverrides as unknown as HostingPlanItem[]) {
          if (ov && ov.id) byId.set(ov.id, ov);
        }
        const deleted = new Set(serverDeletedPlanIds);
        const plans = [...byId.values()]
          .filter((p) => !deleted.has(p.id))
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

        const route = parseRoute((req.path.replace(/\/+$/, '') || '/').toLowerCase());
        const page = renderSeoPage({
          html: cachedIndexHtml,
          page: route.page,
          category: route.category,
          plans,
          categories: PLAN_CATEGORIES,
          faq: FAQ_ITEMS,
          reviews: CUSTOMER_REVIEWS,
          site: DEFAULT_SITE_CONFIG,
        });
        res.status(page.status).set('Cache-Control', 'no-cache').type('html').send(page.html);
      } catch (e) {
        console.error('[seo] falling back to plain index.html:', e);
        res.sendFile(path.join(distPath, 'index.html'));
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Areex Cloud server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
