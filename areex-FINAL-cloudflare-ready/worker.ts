interface Env {
  OTP_DO: DurableObjectNamespace;
  ASSETS: Fetcher;
  FIREBASE_API_KEY: string;
  MAIL_FROM: string;
  MAIL_FROM_NAME: string;
}

const ADMIN_EMAILS = ['routsantosh650@gmail.com', 'areexcloud@gmail.com'];
const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Per-admin in-memory OTP store (Durable Object keyed by admin email).
export class OtpStore {
  private rec: { code: string; expires: number; attempts: number } | null = null;

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/set' && req.method === 'POST') {
      const body = (await req.json()) as { code?: string };
      this.rec = { code: body.code || '', expires: Date.now() + CODE_TTL_MS, attempts: 0 };
      return json({ ok: true });
    }
    if (url.pathname === '/check' && req.method === 'POST') {
      const body = (await req.json()) as { code?: string };
      let result = 'expired';
      if (this.rec) {
        if (Date.now() > this.rec.expires) {
          this.rec = null;
          result = 'expired';
        } else if (this.rec.attempts >= MAX_ATTEMPTS) {
          this.rec = null;
          result = 'too-many';
        } else {
          this.rec.attempts += 1;
          result = this.rec.code === (body.code || '') ? 'ok' : 'wrong';
          if (result === 'ok') this.rec = null;
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

async function sendCodeEmail(to: string, code: string, env: Env): Promise<boolean> {
  const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to, name: 'Areex Admin' }] }],
      from: { email: env.MAIL_FROM, name: env.MAIL_FROM_NAME },
      subject: 'Your Areex Cloud admin login code',
      content: [
        {
          type: 'text/plain',
          value: `Your one-time Areex Cloud admin login code is: ${code}\n\nIt expires in 5 minutes. If you did not request this, ignore this email.`,
        },
      ],
    }),
  });
  return res.ok;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/api/admin/send-code' && req.method === 'POST') {
      const body = (await req.json()) as { idToken?: string };
      const email = body.idToken ? await emailFromIdToken(body.idToken, env.FIREBASE_API_KEY) : null;
      if (!email || !ADMIN_EMAILS.includes(email)) return json({ ok: false, error: 'not-admin' }, 403);
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const stub = env.OTP_DO.get(env.OTP_DO.idFromName(email));
      await stub.fetch('https://do/set', { method: 'POST', body: JSON.stringify({ code }) });
      const sent = await sendCodeEmail(email, code, env);
      if (!sent) return json({ ok: false, error: 'email-failed' }, 502);
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

    // Everything else is the static SPA.
    return env.ASSETS.fetch(req);
  },
};
