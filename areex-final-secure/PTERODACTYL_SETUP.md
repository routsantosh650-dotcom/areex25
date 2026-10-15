# Areex Cloud: automatic Minecraft server after payment

Flow: customer logs in -> picks plan -> pays on Razorpay -> website asks Razorpay "was it really paid?" -> creates the customer's panel account + Minecraft server with that plan's RAM/CPU/disk -> shows login details.

## One-time setup
1. Copy `.env.example` to `.env` and fill every value (see comments in the file).
2. Razorpay Dashboard -> Settings -> Webhooks -> Add: URL `https://YOURDOMAIN/api/razorpay/webhook`, events `payment.captured` and `order.paid`, secret = RAZORPAY_WEBHOOK_SECRET.
3. In Pterodactyl: make sure your nodes have free allocations (IP + ports) and the egg works when you create a test server by hand.
4. `npm install`, `npm run build`, then `NODE_ENV=production npx tsx server.ts`.

## Test before real money
Use Razorpay TEST keys (rzp_test_...) first. Buy the cheapest plan, confirm the server appears in the panel.

## If panel was down when someone paid
GET  /api/admin/failed-orders   (header: x-admin-token: ADMIN_API_TOKEN)
POST /api/admin/retry-order/<razorpay_order_id>

## Choosing software / version
Checkout asks for server name, description, software and version. Paper is the default (your PTERO_EGG_ID).
To offer Purpur / Vanilla / Fabric / Forge, import that egg in your panel and add its ID as PTERO_EGG_PURPUR etc. in .env.

## Hosting
Do NOT use Vercel (see chat). Use a VPS / Railway / Render with Node 20+. Upload the extracted folder contents to GitHub (never .env).
