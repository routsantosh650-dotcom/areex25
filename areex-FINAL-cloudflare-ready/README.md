# areex-automation

## Security hardening notes

- Admin console route: `/rtx5090`. The server still authorizes every admin API request; a hidden/unguessable URL is not an authorization control.
- Customer accounts must enroll in authenticator-app TOTP before a customer session is issued. Existing accounts are prompted to enroll at their next login.
- Admin login uses Firebase Authentication (email + password), restricted to the 2 authorized admin Gmail accounts by both the console UI and Firestore security rules. No app server is required for the admin panel when the site is hosted statically (e.g. Cloudflare). The Express backend's emailed one-time-code login (`SMTP_EMAIL`, `SMTP_APP_PASSWORD`) remains available when a backend is hosted.
- Set unique random values for `SESSION_SECRET` and `AES_MASTER_KEY` (at least 32 characters each). Never commit `.env` or real secrets to GitHub. Rotate any credentials that were ever present in source code.
- The server writes request/change metadata to `.areex-audit.jsonl` and displays the latest 1,000 entries under Admin Console → Audit Log. The log intentionally stores field names, not submitted values, passwords, OTP codes, or tokens. It records API requests; it cannot record client-side clicks that never reach the server.
- `.areex-store.json`, `.areex-users.json`, and `.areex-audit.jsonl` must live on persistent, writable server storage and be included in backups. Ephemeral/serverless deployments need a persistent database or mounted volume; otherwise runtime files may disappear on redeploy.
- Use HTTPS, restrict server access, keep dependencies patched, and test login/recovery flows before switching production traffic. No code can guarantee absolute security.


For required production secrets and authenticator setup, follow [`SECURITY_SETUP.md`](./SECURITY_SETUP.md) before redeploying.

## Split hosting: Cloudflare (frontend) + Railway/Render (backend)

1. Deploy this repo to Cloudflare as-is (static site). In the Cloudflare project's **build environment variables**, set `VITE_API_BASE_URL` to the backend URL (e.g. `https://areex-backend.onrender.com`). All `/api` calls then go to the backend.
2. Deploy the same repo to Railway or Render as a Node service:
   - Build command: `npm run build`
   - Start command: `npm start` (runs `tsx server.ts` in production mode, serving the API and the built site)
   - Set all environment variables from `.env.example` (especially `SESSION_SECRET`, `AES_MASTER_KEY`, `ADMIN_PASSWORD_1/2`, `SMTP_EMAIL`, `SMTP_APP_PASSWORD`, `ALLOWED_ORIGINS` with the Cloudflare site origin).
3. On Render only: set `NODE_ENV=production` and add a persistent Disk mounted at the repo root so `.areex-store.json`, `.areex-users.json`, and `.areex-audit.jsonl` survive restarts. Railway volumes are persistent by default.
