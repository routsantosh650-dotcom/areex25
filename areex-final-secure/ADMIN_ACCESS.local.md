# Areex Cloud — private operator notes (DO NOT UPLOAD TO GITHUB)

This file is listed in `.gitignore`. It is the only place the admin console URL and the admin
account emails are written down.

## Admin console

- URL: `https://areex25.routsantosh650.workers.dev/nexus-63vk`
  (same path on `https://areexcloud.site` once that domain points at the Worker)
- Bookmark it. It is not linked anywhere on the site and does not appear in the shipped JS.
- Sign in: admin Gmail + password, then the 6-digit code emailed by the Worker.

## Admin accounts (the allowlist)

- `routsantosh650@gmail.com` — Santosh Rout
- `areexcloud@gmail.com` — Piyush Garai (Areex Cloud)

## Rotating the console URL

1. Pick a new path, e.g. `/nexus-63vk` → `/something-new`.
2. Get its SHA-256 hex digest (any online SHA-256 tool, or:
   `node -e "console.log(require('crypto').createHash('sha256').update('/something-new').digest('hex'))"`).
3. Paste the digest into `CONSOLE_PATH_DIGEST` in `src/lib/adminGate.ts`.
4. Upload the file to GitHub and let the Worker rebuild. Update the notes above.

## Live credentials — where each one lives (never in a file)

| Credential | Where |
| --- | --- |
| `EMAILJS_PRIVATE_KEY` | Cloudflare Worker **Secret** |
| `RAZORPAY_KEY_SECRET` | Cloudflare Worker **Secret** (also keys the AES-256-GCM order vault) |
| `GEMINI_API_KEY` | Cloudflare Worker **Secret** (powers the multilingual 24/7 chat; the chat falls back to built-in answers without it) |
| `RAZORPAY_KEY_ID`, `EMAILJS_*` ids, `FIREBASE_API_KEY` | Cloudflare Worker **Variables** (all public by design) |

Rotate the EmailJS private key and the Razorpay key secret — both were pasted into a chat
window at some point. EmailJS: Account → General → **Refresh Keys** (regenerates the public key
too, so update `EMAILJS_PUBLIC_KEY` in the same pass). Razorpay: Dashboard → Settings → API
Keys → generate a new secret, then replace the Worker Secret.
