interface Env {
  OTP_DO: DurableObjectNamespace;
  ASSETS: Fetcher;
  FIREBASE_API_KEY: string;
  EMAILJS_SERVICE_ID: string;
  EMAILJS_TEMPLATE_ID: string;
  EMAILJS_PUBLIC_KEY: string;
  EMAILJS_PRIVATE_KEY: string;
}

const ADMIN_EMAILS = ['routsantosh650@gmail.com', 'areexcloud@gmail.com'];
const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Per-admin OTP record, persisted in the Durable Object's SQLite-backed storage
// so the code survives object eviction while the admin reads their email.
type OtpRecord = { code: string; expires: number; attempts: number };

export class OtpStore {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
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

async function emailFromIdToken(idToken: string, apiKey: string): Promise<string | null> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { users?: Array<{ email?: string }> };
  return data.users?.[0]?.email?.toLowerCase() || null;
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/api/admin/send-code' && req.method === 'POST') {
      const body = (await req.json()) as { idToken?: string };
      const email = body.idToken ? await emailFromIdToken(body.idToken, env.FIREBASE_API_KEY) : null;
      if (!email || !ADMIN_EMAILS.includes(email)) return json({ ok: false, error: 'not-admin' }, 403);
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const sent = await sendCodeEmail(email, code, env);
      if (sent !== 'ok') return json({ ok: false, error: `email-${sent}` }, 502);
      const stub = env.OTP_DO.get(env.OTP_DO.idFromName(email));
      await stub.fetch('https://do/set', { method: 'POST', body: JSON.stringify({ code }) });
      return json({ ok: true });
    }

    if (url.pathname === '/api/admin/verify-code' && req.method === 'POST') {
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
        ip: req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim(),
        country: cf?.country || '',
      });
    }

    // Everything else is the static SPA.
    return env.ASSETS.fetch(req);
  },
};
