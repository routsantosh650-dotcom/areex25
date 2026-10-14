import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORDERS_FILE = path.join(__dirname, '.areex-orders.json');

// ---------------------------------------------------------------------------
// 1. PLAN SPECS  (the SERVER decides price + resources, never the browser)
//    Keep this in sync with src/data/areexData.ts when you change plans.
//    ram / disk are in MB, cpu is in % (100 = 1 core), like Pterodactyl expects.
// ---------------------------------------------------------------------------
export type PlanKind = 'minecraft' | 'bot';
export interface PlanSpec {
  priceInr: number;
  ramMb: number;
  cpuPercent: number;
  diskMb: number;
  kind?: PlanKind; // default: minecraft
}

const GB = 1024;
export const PLAN_SPECS: Record<string, PlanSpec> = {
  budget_pro: { priceInr: 69, ramMb: 4 * GB, cpuPercent: 150, diskMb: 25 * GB },
  budget_max: { priceInr: 129, ramMb: 8 * GB, cpuPercent: 250, diskMb: 50 * GB },
  budget_titan: { priceInr: 199, ramMb: 12 * GB, cpuPercent: 350, diskMb: 80 * GB },
  budget_sudopodia: { priceInr: 279, ramMb: 16 * GB, cpuPercent: 500, diskMb: 120 * GB },
  budget_infinity: { priceInr: 349, ramMb: 24 * GB, cpuPercent: 650, diskMb: 160 * GB },
  budget_omega: { priceInr: 449, ramMb: 32 * GB, cpuPercent: 800, diskMb: 200 * GB },
  premium_elite: { priceInr: 399, ramMb: 24 * GB, cpuPercent: 700, diskMb: 350 * GB },
  premium_elite_plus: { priceInr: 499, ramMb: 32 * GB, cpuPercent: 800, diskMb: 500 * GB },
  premium_enterprise: { priceInr: 649, ramMb: 48 * GB, cpuPercent: 1200, diskMb: 750 * GB },
  premium_enterprise_plus: { priceInr: 799, ramMb: 64 * GB, cpuPercent: 1600, diskMb: 1024 * GB },
  premium_titan: { priceInr: 1299, ramMb: 128 * GB, cpuPercent: 3200, diskMb: 2048 * GB },
  premium_titan_max: { priceInr: 2499, ramMb: 256 * GB, cpuPercent: 6400, diskMb: 4096 * GB },
  exclusive_core: { priceInr: 1499, ramMb: 64 * GB, cpuPercent: 1600, diskMb: 1024 * GB },
  exclusive_matrix: { priceInr: 2799, ramMb: 128 * GB, cpuPercent: 3200, diskMb: 2048 * GB },
  exclusive_apex: { priceInr: 4999, ramMb: 256 * GB, cpuPercent: 6400, diskMb: 4096 * GB },
};
// bot_*, vps_*, domain_* plans are NOT Minecraft servers: they are not in this
// list on purpose, so they are never auto-created. Handle those manually.

// Built-in bot plans (Python / Node.js eggs are auto-detected from your panel).
const BOT_SPECS: Record<string, PlanSpec> = {
  bot_starter: { priceInr: 29, ramMb: 1 * GB, cpuPercent: 100, diskMb: 5 * GB, kind: 'bot' },
  bot_pro: { priceInr: 59, ramMb: 2 * GB, cpuPercent: 200, diskMb: 15 * GB, kind: 'bot' },
  bot_cluster: { priceInr: 119, ramMb: 4 * GB, cpuPercent: 400, diskMb: 35 * GB, kind: 'bot' },
};

// ---------------------------------------------------------------------------
// 1b. PLANS CREATED IN THE ADMIN PAGE
//     server.ts hands us the saved admin plans. Any plan that is not built in
//     is turned into a deployable spec from its own RAM / CPU / storage text.
//     (Saving plans needs a verified admin login, so customers cannot fake one.)
// ---------------------------------------------------------------------------
let customPlansSource: () => any[] = () => [];
let deletedPlansSource: () => string[] = () => [];
export function setPlanSource(plans: () => any[], deleted: () => string[]) {
  customPlansSource = plans;
  deletedPlansSource = deleted;
}

function parseSizeToMb(text: unknown): number {
  const m = String(text || '').match(/([\d.]+)\s*(tb|gb|mb)/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  return Math.round(n * (unit === 'tb' ? 1024 * 1024 : unit === 'gb' ? 1024 : 1));
}
function parseCpuPercent(text: unknown): number {
  const t = String(text || '');
  const pct = t.match(/([\d.]+)\s*%/);
  if (pct) return Math.round(parseFloat(pct[1]));
  const cores = t.match(/([\d.]+)\s*(v?cpu|cores?|threads?)/i);
  if (cores) return Math.round(parseFloat(cores[1]) * 100);
  return 0;
}

/** Returns the price + resources + type for a plan id, or null if it cannot be auto-deployed. */
export function resolvePlanSpec(planId: string): (PlanSpec & { kind: PlanKind }) | null {
  const id = String(planId || '');
  if (PLAN_SPECS[id]) return { ...PLAN_SPECS[id], kind: 'minecraft' };
  if (BOT_SPECS[id]) return { ...BOT_SPECS[id], kind: 'bot' };
  if (deletedPlansSource().includes(id)) return null;

  const plan = customPlansSource().find((p) => p && p.id === id);
  if (!plan || plan.adminVerified !== true) return null; // only plans saved by a logged-in admin
  const category = String(plan.category || '');
  const kind: PlanKind | null =
    category === 'bot' ? 'bot' : ['budget', 'premium', 'exclusive'].includes(category) ? 'minecraft' : null;
  if (!kind) return null; // vps / domain plans are handled manually

  const priceInr = Math.round(Number(plan.priceInr));
  const ramMb = parseSizeToMb(plan.ram);
  const diskMb = parseSizeToMb(plan.storage);
  const cpuPercent = parseCpuPercent(plan.cpu);
  const sane =
    priceInr >= 1 &&
    priceInr <= 500000 &&
    ramMb >= 256 &&
    ramMb <= 512 * GB &&
    diskMb >= 1024 &&
    diskMb <= 8 * 1024 * GB &&
    cpuPercent >= 25 &&
    cpuPercent <= 12800;
  if (!sane) return null;
  return { priceInr, ramMb, cpuPercent, diskMb, kind };
}

// ---------------------------------------------------------------------------
// 2. PANEL SETTINGS (from .env)
// ---------------------------------------------------------------------------
const cfg = () => ({
  url: (process.env.PTERO_URL || '').replace(/\/+$/, ''),
  apiKey: process.env.PTERO_APP_API_KEY || '',
  nestId: Number(process.env.PTERO_NEST_ID || 0),
  eggId: Number(process.env.PTERO_EGG_ID || 0), // default egg (Paper)
  locations: {
    'Mumbai IN-West-1': Number(process.env.PTERO_LOCATION_MUMBAI || 0),
    'Noida IN-North-1': Number(process.env.PTERO_LOCATION_NOIDA || 0),
    'Singapore SG-1': Number(process.env.PTERO_LOCATION_SINGAPORE || 0),
  } as Record<string, number>,
});

// ---------------------------------------------------------------------------
// 2b. EGG DETECTION  (reads the real eggs from your Pterodactyl panel)
// ---------------------------------------------------------------------------
export interface SoftwareOption {
  key: string;
  label: string;
  eggId: number;
  nestId: number;
}
interface PanelEgg {
  id: number;
  nestId: number;
  name: string;
}

let eggCache: { at: number; eggs: PanelEgg[] } | null = null;
async function listPanelEggs(): Promise<PanelEgg[]> {
  if (eggCache && Date.now() - eggCache.at < 5 * 60 * 1000) return eggCache.eggs;
  const data = await ptero('GET', '/nests?include=eggs&per_page=100');
  const eggs: PanelEgg[] = [];
  for (const nest of data?.data || []) {
    for (const egg of nest.attributes?.relationships?.eggs?.data || []) {
      eggs.push({ id: Number(egg.attributes.id), nestId: Number(nest.attributes.id), name: String(egg.attributes.name) });
    }
  }
  eggCache = { at: Date.now(), eggs };
  return eggs;
}

function pickEgg(eggs: PanelEgg[], envId: number, test: RegExp): PanelEgg | undefined {
  if (envId > 0) {
    const forced = eggs.find((e) => e.id === envId);
    if (forced) return forced;
  }
  const matches = eggs.filter((e) => test.test(e.name));
  // prefer the "Generic" egg when there are several
  return matches.find((e) => /generic/i.test(e.name)) || matches[0];
}

/**
 * The software choices a customer sees for a plan type.
 *  - minecraft: Paper (+ any PTERO_EGG_* you set) + every other egg found in your Minecraft nest
 *  - bot: Python and Node.js, found automatically by egg name
 * Set PTERO_EGG_PYTHON / PTERO_EGG_NODEJS to force a specific egg id.
 * Set PTERO_AUTODETECT_MC_EGGS="false" to only offer the eggs you list in .env.
 */
export async function getSoftwareOptions(kind: PlanKind = 'minecraft'): Promise<SoftwareOption[]> {
  const e = process.env;
  const c = cfg();

  if (kind === 'bot') {
    const eggs = await listPanelEggs();
    const out: SoftwareOption[] = [];
    const py = pickEgg(eggs, Number(e.PTERO_EGG_PYTHON || 0), /python/i);
    const node = pickEgg(eggs, Number(e.PTERO_EGG_NODEJS || 0), /node/i);
    if (py) out.push({ key: 'python', label: 'Python', eggId: py.id, nestId: py.nestId });
    if (node) out.push({ key: 'nodejs', label: 'Node.js', eggId: node.id, nestId: node.nestId });
    return out;
  }

  const fromEnv: { key: string; label: string; eggId: number }[] = [
    { key: 'paper', label: 'Paper (recommended)', eggId: Number(e.PTERO_EGG_ID || 0) },
    { key: 'purpur', label: 'Purpur', eggId: Number(e.PTERO_EGG_PURPUR || 0) },
    { key: 'vanilla', label: 'Vanilla', eggId: Number(e.PTERO_EGG_VANILLA || 0) },
    { key: 'fabric', label: 'Fabric', eggId: Number(e.PTERO_EGG_FABRIC || 0) },
    { key: 'forge', label: 'Forge', eggId: Number(e.PTERO_EGG_FORGE || 0) },
  ];
  const out: SoftwareOption[] = fromEnv
    .filter((o) => o.eggId > 0)
    .map((o) => ({ ...o, nestId: c.nestId }));

  if (e.PTERO_AUTODETECT_MC_EGGS !== 'false' && c.url && c.apiKey && c.nestId) {
    try {
      const eggs = await listPanelEggs();
      for (const egg of eggs) {
        if (egg.nestId !== c.nestId || out.some((o) => o.eggId === egg.id)) continue;
        out.push({ key: `egg_${egg.id}`, label: egg.name, eggId: egg.id, nestId: egg.nestId });
      }
    } catch {
      /* panel unreachable: just offer the .env eggs */
    }
  }
  return out;
}

export function provisioningConfigured(): boolean {
  const c = cfg();
  return Boolean(c.url && c.apiKey && c.nestId && c.eggId);
}

async function ptero(method: string, endpoint: string, body?: unknown) {
  const c = cfg();
  const res = await fetch(`${c.url}/api/application${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${c.apiKey}`,
      Accept: 'Application/vnd.pterodactyl.v1+json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* non-json */
  }
  if (!res.ok) {
    const detail = data?.errors?.[0]?.detail || text.slice(0, 200);
    const err: any = new Error(`Pterodactyl ${method} ${endpoint} failed (${res.status}): ${detail}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------------------------------------------------------------------------
// 3. ORDER STORE (makes fulfilment safe to call twice: webhook + browser)
// ---------------------------------------------------------------------------
export interface OrderRecord {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  status: 'processing' | 'fulfilled' | 'failed';
  planId: string;
  uid: string;
  email: string;
  hostname: string;
  datacenterNode: string;
  amountInr: number;
  panelUrl?: string;
  panelEmail?: string;
  panelPassword?: string; // shown once to customer, removed after first read
  serverId?: number;
  serverIdentifier?: string;
  endpoint?: string;
  error?: string;
  createdAt: string;
}

let orders: Record<string, OrderRecord> = {};
try {
  if (fs.existsSync(ORDERS_FILE)) orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
} catch {
  orders = {};
}
const saveOrders = () => {
  try {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
  } catch {
    /* read-only host */
  }
};

export const getOrder = (razorpayOrderId: string) => orders[razorpayOrderId];

// ---------------------------------------------------------------------------
// 4. PANEL ACTIONS
// ---------------------------------------------------------------------------
function cleanUsername(email: string) {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14) || 'user';
  return `${base}${crypto.randomInt(100, 999)}`;
}

async function findPanelUser(email: string) {
  const found = await ptero('GET', `/users?filter[email]=${encodeURIComponent(email)}`);
  return found?.data?.find((u: any) => u.attributes.email.toLowerCase() === email.toLowerCase());
}

/**
 * Website sign-up: create the panel account with the SAME email + password.
 * Never touches a panel account that already exists.
 */
export async function createPanelUserForSignup(email: string, password: string) {
  if (!provisioningConfigured()) return { status: 'skipped' as const };
  if (await findPanelUser(email)) return { status: 'exists' as const };
  const created = await ptero('POST', '/users', {
    email,
    username: cleanUsername(email),
    first_name: 'Areex',
    last_name: 'Customer',
    password,
  });
  return { status: 'created' as const, id: created.attributes.id as number };
}

/** Used at payment time: the panel account normally exists already (made at sign-up). */
async function getOrCreatePanelUser(email: string) {
  const existing = await findPanelUser(email);
  if (existing) return { id: existing.attributes.id as number, password: null as string | null };

  // Fallback (panel was down at sign-up): create it now with a one-time password.
  const password = crypto.randomBytes(12).toString('base64url');
  const created = await ptero('POST', '/users', {
    email,
    username: cleanUsername(email),
    first_name: 'Areex',
    last_name: 'Customer',
    password,
  });
  return { id: created.attributes.id as number, password: password as string | null };
}

async function createMinecraftServer(opts: {
  panelUserId: number;
  spec: PlanSpec;
  kind: PlanKind;
  name: string;
  description: string;
  eggId: number;
  nestId: number;
  version: string;
  locationId: number;
}) {
  // Pull startup command, docker image and default variables from YOUR egg,
  // so we never hard-code things that differ between eggs.
  const egg = await ptero('GET', `/nests/${opts.nestId}/eggs/${opts.eggId}?include=variables`);
  const a = egg.attributes;
  const dockerImage =
    (opts.kind === 'minecraft' && process.env.PTERO_DOCKER_IMAGE) ||
    Object.values(a.docker_images || {})[0] ||
    a.docker_image;
  const environment: Record<string, string> = {};
  for (const v of a.relationships?.variables?.data || []) {
    environment[v.attributes.env_variable] = String(v.attributes.default_value ?? '');
  }
  // Different eggs call the version variable different names; set whichever exists.
  if (opts.kind === 'minecraft') {
    for (const key of ['MINECRAFT_VERSION', 'VANILLA_VERSION', 'MC_VERSION']) {
      if (key in environment) environment[key] = opts.version;
    }
  }

  return ptero('POST', '/servers', {
    name: opts.name.slice(0, 60),
    description: opts.description.slice(0, 200),
    user: opts.panelUserId,
    egg: opts.eggId,
    docker_image: dockerImage,
    startup: a.startup,
    environment,
    limits: {
      memory: opts.spec.ramMb,
      swap: 0,
      disk: opts.spec.diskMb,
      io: 500,
      cpu: opts.spec.cpuPercent,
    },
    feature_limits: { databases: 2, backups: 3, allocations: 1 },
    deploy: { locations: [opts.locationId], dedicated_ip: false, port_range: [] },
    // bots need the customer's files first, so only Minecraft servers auto-start
    start_on_completion: opts.kind === 'minecraft',
  });
}

// ---------------------------------------------------------------------------
// 5. FULFIL ONE PAID ORDER  (call only AFTER Razorpay says it is paid)
// ---------------------------------------------------------------------------
export async function fulfillPaidOrder(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amountPaidPaise: number;
  notes: Record<string, string>;
}): Promise<OrderRecord> {
  const { razorpayOrderId, razorpayPaymentId, amountPaidPaise, notes } = input;

  // Already done (or in progress)? Return it, never create a second server.
  const prior = orders[razorpayOrderId];
  if (prior && (prior.status === 'fulfilled' || prior.status === 'processing')) return prior;

  const spec = resolvePlanSpec(notes.planId);
  if (!spec) throw new Error(`Plan "${notes.planId}" cannot be auto-deployed (check its price, RAM, CPU and storage values).`);

  const record: OrderRecord = {
    razorpayOrderId,
    razorpayPaymentId,
    status: 'processing',
    planId: notes.planId,
    uid: notes.uid,
    email: notes.email,
    hostname: notes.hostname,
    datacenterNode: notes.datacenterNode,
    amountInr: Math.round(amountPaidPaise / 100),
    createdAt: new Date().toISOString(),
  };
  orders[razorpayOrderId] = record;
  saveOrders();

  try {
    if (!provisioningConfigured()) throw new Error('Pterodactyl is not configured in .env');
    const c = cfg();
    const locationId = c.locations[notes.datacenterNode] || Object.values(c.locations).find(Boolean);
    if (!locationId) throw new Error('No Pterodactyl location id configured for this datacenter');

    const options = await getSoftwareOptions(spec.kind);
    const chosen = options.find((o) => o.key === notes.software) || options[0];
    if (!chosen) {
      throw new Error(
        spec.kind === 'bot'
          ? 'No Python / Node.js egg found on the panel. Import them into a nest first.'
          : 'No Minecraft egg available.'
      );
    }

    const user = await getOrCreatePanelUser(notes.email);
    const created = await createMinecraftServer({
      panelUserId: user.id,
      spec,
      kind: spec.kind,
      name: notes.hostname || `Areex ${notes.planId}`,
      description: notes.description || '',
      eggId: chosen.eggId,
      nestId: chosen.nestId,
      version: notes.version || 'latest',
      locationId,
    });

    const attrs = created.attributes;
    // Look up the allocation (ip:port) the panel picked for this server
    let endpoint = '';
    try {
      const full = await ptero('GET', `/servers/${attrs.id}?include=allocations`);
      const alloc = full.attributes.relationships?.allocations?.data?.[0]?.attributes;
      if (alloc) endpoint = `${alloc.alias || alloc.ip}:${alloc.port}`;
    } catch {
      /* not critical */
    }

    record.status = 'fulfilled';
    record.serverId = attrs.id;
    record.serverIdentifier = attrs.identifier;
    record.endpoint = endpoint;
    record.panelUrl = c.url;
    record.panelEmail = notes.email;
    record.panelPassword = user.password || undefined; // undefined if they already had an account
  } catch (e) {
    record.status = 'failed';
    record.error = e instanceof Error ? e.message : String(e);
    console.error('[provisioning] FAILED for order', razorpayOrderId, record.error);
  }
  saveOrders();
  return record;
}

/** Hand the one-time password to the customer, then wipe it from disk. */
export function takeOneTimePassword(razorpayOrderId: string): string | undefined {
  const o = orders[razorpayOrderId];
  if (!o?.panelPassword) return undefined;
  const pw = o.panelPassword;
  delete o.panelPassword;
  saveOrders();
  return pw;
}

/** Orders that were paid but the panel call failed: retry these by hand or on a timer. */
export const failedOrders = () => Object.values(orders).filter((o) => o.status === 'failed');
export function resetFailed(razorpayOrderId: string) {
  if (orders[razorpayOrderId]?.status === 'failed') {
    delete orders[razorpayOrderId];
    saveOrders();
  }
}
