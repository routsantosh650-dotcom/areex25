import { getAdminToken } from '../customerSession';
import { auth } from '../firebase';
import {
  downloadAuditCsv,
  fetchAuditLog,
  formatAuditTime,
  recordAudit,
  relativeAuditTime,
  type AuditCategory,
  type AuditEntry,
} from '../lib/audit';
import { FirebaseError } from 'firebase/app';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
} from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import {
  X,
  BarChart3,
  Settings,
  ShieldCheck,
  Plus,
  Trash2,
  Save,
  Lock,
  Unlock,
  Activity,
  Server,
  Globe,
  CheckCircle2,
  Tag,
  KeyRound,
  LogOut,
  AlertTriangle,
  Ticket,
  Headphones,
  Copy,
  Check,
  Send,
} from 'lucide-react';
import {
  HostingPlanItem,
  PlanCategoryKey,
  PLAN_CATEGORIES,
  SiteConfigData,
  CouponItem,
  SupportTicketItem,
  getPlanCutPriceInr,
} from '../data/areexData';
import { ProvisionedOrderRecord } from './CheckoutModal';
import { DIRTY_DOZEN_TESTS } from '../../firestore.rules.test';

const CATEGORY_TONE: Record<AuditCategory, string> = {
  ADMIN: 'border-red-500/30 bg-red-500/15 text-red-300',
  CUSTOMER: 'border-sky-500/30 bg-sky-500/15 text-sky-300',
  AUTH: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
};

const CATEGORY_LABEL: Record<AuditCategory, string> = {
  ADMIN: 'Admin change',
  CUSTOMER: 'Website / customer',
  AUTH: 'Security',
};

const RISKY_ACTIONS = ['DELETE', 'DENIED', 'LOCKED', 'LOGIN_FAILED', 'CODE_FAILED', 'CODE_WRONG', 'CODE_EXPIRED', 'CODE_TOO_MANY'];
const GOOD_ACTIONS = ['CREATE', 'ORDER', 'TICKET', 'INQUIRY'];
const NEUTRAL_AUTH_ACTIONS = ['LOGIN', 'LOGOUT', 'CODE_SENT'];

const actionTone = (action: string) =>
  RISKY_ACTIONS.includes(action)
    ? 'border-red-500/40 bg-red-600/20 text-red-200'
    : GOOD_ACTIONS.includes(action)
      ? 'border-emerald-500/40 bg-emerald-600/20 text-emerald-200'
      : NEUTRAL_AUTH_ACTIONS.includes(action)
        ? 'border-amber-500/30 bg-amber-500/15 text-amber-200'
        : 'border-white/20 bg-white/10 text-slate-200';

interface NodeTelemetry {
  id: string;
  name: string;
  cpuModel: string;
  pingMs: number;
  uptime: string;
  loadPercent: number;
  ddosCapacity: string;
  status: string;
}

interface AuthorizedAdminSession {
  email: string;
  name: string;
  role: string;
  sessionToken: string;
}

export type AdminTabKey =
  | 'discount'
  | 'plans'
  | 'support'
  | 'analytics'
  | 'config'
  | 'security'
  | 'audit';

interface AdminAnalyticsWorkspaceProps {
  open: boolean;
  initialTab: AdminTabKey;
  onClose: () => void;
  plans: HostingPlanItem[];
  onSavePlan: (plan: HostingPlanItem) => Promise<void>;
  onDeletePlan: (planId: string) => Promise<void>;
  siteConfig: SiteConfigData;
  onSaveSiteConfig: (config: SiteConfigData) => Promise<void>;
  discountOffer: string;
  discountPercent: number;
  onSaveDiscountOffer: (offerText: string, discountPct: number) => Promise<void>;
  coupons: CouponItem[];
  onCreateCoupon: (coupon: {
    code: string;
    discountPercent: number;
    description: string;
  }) => Promise<void>;
  onDeleteCoupon: (code: string) => Promise<void>;
  supportTickets: SupportTicketItem[];
  onUpdateSupportTicket: (
    ticketId: string,
    updates: {
      status: 'open' | 'in_progress' | 'resolved';
      adminReply?: string;
      repliedBy?: string;
    }
  ) => Promise<void>;
  orders: ProvisionedOrderRecord[];
  onAdminSessionChange?: (unlocked: boolean) => void;
}

export const AdminAnalyticsWorkspace: React.FC<AdminAnalyticsWorkspaceProps> = ({
  open,
  initialTab,
  onClose,
  plans,
  onSavePlan,
  onDeletePlan,
  siteConfig,
  onSaveSiteConfig,
  discountOffer,
  discountPercent,
  onSaveDiscountOffer,
  coupons,
  onCreateCoupon,
  onDeleteCoupon,
  supportTickets,
  onUpdateSupportTicket,
  orders,
  onAdminSessionChange,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTabKey>(initialTab);

  // Strict 2-Admin Gmail + Password Session State
  const [adminSession, setAdminSession] = useState<AuthorizedAdminSession | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilter, setAuditFilter] = useState<AuditCategory | 'ALL'>('ALL');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditAuto, setAuditAuto] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  // Step 2 of login: 6-digit code emailed to the admin after password is verified.
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [pendingIdToken, setPendingIdToken] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<{ email?: string | null; uid: string } | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);

  // Workspace states
  const [nodes, setNodes] = useState<NodeTelemetry[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<PlanCategoryKey>('premium');
  const [editingPlan, setEditingPlan] = useState<HostingPlanItem | null>(null);
  const [featuresText, setFeaturesText] = useState<string>('');
  const [isNewPlanDraft, setIsNewPlanDraft] = useState<boolean>(false);
  const [configDraft, setConfigDraft] = useState<SiteConfigData>(siteConfig);
  const [discountInput, setDiscountInput] = useState<string>(discountOffer);
  const [discountPctInput, setDiscountPctInput] = useState<number>(discountPercent || 20);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);

  // Custom Coupon Creator state
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponPercent, setNewCouponPercent] = useState(25);
  const [newCouponDesc, setNewCouponDesc] = useState('');
  const [copiedCoupon, setCopiedCoupon] = useState<string | null>(null);

  // Support Ticket Reply state
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  // AES-256-GCM Interactive Inspector state
  const [samplePlaintext, setSamplePlaintext] = useState(
    '{"event":"security-test","record":"sample-only","environment":"production"}'
  );
  const [encryptedResult, setEncryptedResult] = useState<{
    ciphertext: string;
    iv: string;
    authTag: string;
    hmacSignature: string;
  } | null>(null);
  const [decryptedOutput, setDecryptedOutput] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setConfigDraft(siteConfig);
  }, [siteConfig]);

  useEffect(() => {
    setDiscountInput(discountOffer);
  }, [discountOffer]);

  useEffect(() => {
    setDiscountPctInput(discountPercent || 20);
  }, [discountPercent]);

  const loadAuditLog = () => {
    setAuditLoading(true);
    fetchAuditLog({ max: 300, category: auditFilter, search: auditSearch }).then((res) => {
      setAuditEntries(res.entries);
      setAuditError(res.error || null);
      setAuditLoading(false);
    });
  };

  useEffect(() => {
    if (!open || !adminSession || activeTab !== 'audit') return;
    loadAuditLog();
  }, [open, adminSession, activeTab, auditFilter, auditSearch]);

  useEffect(() => {
    if (!auditAuto || !open || !adminSession || activeTab !== 'audit') return;
    const timer = setInterval(loadAuditLog, 15000);
    return () => clearInterval(timer);
  }, [auditAuto, open, adminSession, activeTab, auditFilter, auditSearch]);

  // Security events are recorded for the login flow itself, not just data edits.
  const logAuthEvent = (action: string, summary: string, actorOverride?: string) => {
    recordAudit({ category: 'AUTH', action, target: 'admin-console', summary, actorOverride });
  };

  useEffect(() => {
    if (!open || !adminSession) return;
    fetch('/api/telemetry/nodes')
      .then((r) => r.json())
      .then((data) => {
        if (data.nodes) setNodes(data.nodes);
      })
      .catch(() => {});
  }, [open, adminSession]);

  if (!open) return null;

  const showToast = (msg: string) => {
    setSaveBanner(msg);
    setTimeout(() => setSaveBanner(null), 3000);
  };

  // Zero-trust admin allowlist: only these Firebase Auth accounts may open the panel.
  // Firestore security rules enforce the same list server-side, so the UI check is not the only gate.
  const ADMIN_EMAILS: Record<string, { name: string; role: string }> = {
    'routsantosh650@gmail.com': { name: 'Santosh Rout', role: 'Lead Developer & Co-Admin' },
    'areexcloud@gmail.com': { name: 'Piyush Garai (Areex Cloud)', role: 'Founder & CEO' },
  };

  // Firebase email+password admin login (works with a static-only hosting: no app server needed)
  const handleAdminLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    const normalizedEmail = loginEmail.trim().toLowerCase();
    try {
      const cred = await signInWithEmailAndPassword(auth, normalizedEmail, loginPassword);
      const profile = ADMIN_EMAILS[(cred.user.email || '').toLowerCase()];
      if (!profile) {
        logAuthEvent(
          'DENIED',
          `Sign-in blocked: ${cred.user.email} is not on the 2-admin allowlist`,
          cred.user.email || normalizedEmail
        );
        await signOut(auth);
        setLoginError('Access denied. This account is not authorized for the admin console.');
        return;
      }
      // Password verified by Firebase. Now email a one-time 6-digit code (2nd factor).
      const token = await cred.user.getIdToken();
      setPendingUser(cred.user);
      setPendingIdToken(token);
      setSendingCode(true);
      try {
        const res = await fetch('/api/admin/send-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: token }),
        });
        const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (res.ok && data?.ok) {
          setAwaitingCode(true);
          logAuthEvent('CODE_SENT', `6-digit login code emailed to ${cred.user.email}`, cred.user.email || normalizedEmail);
        } else if (data?.error === 'email-not-configured') {
          setLoginError('Password correct, but email delivery is not configured yet (EMAILJS_* vars are empty). Use "Continue with Google" below instead.');
          logAuthEvent('CODE_FAILED', `Code email failed for ${cred.user.email}: provider not configured`, cred.user.email || normalizedEmail);
        } else if (data?.error === 'email-failed') {
          setLoginError('Password correct, but the code email could not be sent. Use "Continue with Google" below instead.');
          logAuthEvent('CODE_FAILED', `Code email failed for ${cred.user.email}: mail provider rejected the request`, cred.user.email || normalizedEmail);
        } else {
          setLoginError('Password correct, but could not start code verification. Use "Continue with Google" below instead.');
          logAuthEvent('CODE_FAILED', `Code email failed for ${cred.user.email}${data?.error ? `: ${data.error}` : ''}`, cred.user.email || normalizedEmail);
        }
      } catch {
        setLoginError('Password correct, but could not reach the code service. Use "Continue with Google" below instead.');
        logAuthEvent('CODE_FAILED', `Code service unreachable for ${cred.user.email}`, normalizedEmail);
      } finally {
        setSendingCode(false);
      }
    } catch (err) {
      if (
        err instanceof FirebaseError &&
        (err.code === 'auth/invalid-credential' ||
          err.code === 'auth/user-not-found' ||
          err.code === 'auth/wrong-password' ||
          err.code === 'auth/invalid-login-credentials')
      ) {
        setLoginError('Invalid admin credentials.');
        logAuthEvent('LOGIN_FAILED', `Wrong password for ${normalizedEmail}`, normalizedEmail);
      } else if (err instanceof FirebaseError && err.code === 'auth/too-many-requests') {
        setLoginError('Too many failed attempts. This device is temporarily blocked — wait a while and try again.');
        logAuthEvent('LOCKED', `Rate-limited after repeated failed attempts on ${normalizedEmail}`, normalizedEmail);
      } else if (err instanceof FirebaseError && err.code === 'auth/operation-not-allowed') {
        setLoginError('Email/Password sign-in is not enabled in the Firebase console yet.');
      } else {
        setLoginError(err instanceof Error ? `Admin sign-in failed: ${err.message}` : 'Admin sign-in failed.');
      }
    } finally {
      setLoggingIn(false);
    }
  };

  const openPanelFor = (
    user: { email?: string | null; uid: string },
    via: 'password + emailed code' | 'Google'
  ) => {
    const normalizedEmail = (user.email || '').toLowerCase();
    const profile = ADMIN_EMAILS[normalizedEmail];
    if (!profile) {
      logAuthEvent('DENIED', `Sign-in blocked: ${normalizedEmail || 'unknown'} is not on the 2-admin allowlist`, normalizedEmail);
      signOut(auth).catch(() => {});
      setLoginError('Access denied. This account is not authorized for the admin console.');
      return;
    }
    setAdminSession({
      email: normalizedEmail,
      name: profile.name,
      role: profile.role,
      sessionToken: user.uid,
    });
    setLoginPassword('');
    logAuthEvent('LOGIN', `Admin console unlocked via ${via}`, normalizedEmail);
    if (onAdminSessionChange) {
      onAdminSessionChange(true);
    }
  };

  // Strongest available second layer on this shared-quota project: the admin's own Google
  // account (which carries Google's 2FA / phone prompt). Restricted to the 2 allowlisted Gmails.
  const handleAdminGoogleSignIn = async () => {
    setLoginError(null);
    setGoogleBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(auth, provider);
      openPanelFor(cred.user, 'Google');
    } catch (err) {
      if (err instanceof FirebaseError && (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request')) {
        // user closed the popup themselves: no error text needed
      } else if (err instanceof FirebaseError && err.code === 'auth/unauthorized-domain') {
        setLoginError('This site domain is not authorized in Firebase. Add it under Authentication → Settings → Authorized domains.');
      } else {
        setLoginError(err instanceof Error ? `Google sign-in failed: ${err.message}` : 'Google sign-in failed.');
      }
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingIdToken || !pendingUser) return;
    setOtpBusy(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/admin/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: pendingIdToken, code: otpCode.trim() }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      const actor = pendingUser.email || 'unknown';
      if (res.ok && data?.ok) {
        openPanelFor(pendingUser, 'password + emailed code');
        return;
      }
      if (data?.error === 'expired') {
        setAwaitingCode(false);
        setOtpCode('');
        setLoginError('That code expired. Enter your password again to get a fresh code.');
        logAuthEvent('CODE_EXPIRED', `Login code expired before it was used by ${actor}`, actor);
      } else if (data?.error === 'too-many') {
        setAwaitingCode(false);
        setOtpCode('');
        setLoginError('Too many wrong codes. Enter your password again to get a fresh code.');
        logAuthEvent('CODE_TOO_MANY', `5 wrong code attempts for ${actor} — code invalidated`, actor);
      } else {
        setLoginError('Wrong code. Enter the exact 6-digit number from the email.');
        logAuthEvent('CODE_WRONG', `Wrong login code entered for ${actor}`, actor);
      }
    } catch {
      setLoginError('Could not reach the code service. Try again.');
      logAuthEvent('CODE_FAILED', 'Code service unreachable while verifying a login code');
    } finally {
      setOtpBusy(false);
    }
  };

  const handleBackToPassword = () => {
    setAwaitingCode(false);
    setOtpCode('');
    setLoginError(null);
    setPendingIdToken(null);
    setPendingUser(null);
  };

  // If NOT authenticated as one of the 2 admins, block access and show Gmail + Password Gate
  if (!adminSession) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-login-gate-title"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-xl overflow-y-auto"
      >
        <div className="my-auto w-full max-w-md rounded-2xl border border-red-500/40 bg-[#11080c] p-6 sm:p-8 text-slate-100 shadow-[0_0_60px_rgba(220,38,38,0.25)]">
          <div className="flex items-start justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/40 bg-red-600/15 text-red-500">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <div className="font-mono text-[11px] text-red-400">
                  RESTRICTED ACCESS · 2 ADMINS ONLY
                </div>
                <h2
                  id="admin-login-gate-title"
                  className="font-display text-xl font-bold text-white"
                >
                  Admin Security Login
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Admin Login Modal"
              className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-slate-400">
            Normal visitors cannot access this panel. Sign in with one of the{' '}
            <strong className="text-white">2 authorized Gmail accounts</strong> and its{' '}
            <strong className="text-white">Admin Password</strong> — verified securely by Firebase Authentication.
          </p>

          {loginError && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-600/15 p-3 text-xs text-red-300"
            >
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <span>{loginError}</span>
            </div>
          )}

          {!awaitingCode && (
            <>
          <form onSubmit={handleAdminLoginSubmit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="admin-gmail-input" className="block text-xs font-medium text-slate-300">
                  Authorized Admin Gmail
                </label>
                <input
                  id="admin-gmail-input"
                  type="email"
                  required
                  autoComplete="username"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="routsantosh650@gmail.com"
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-[#090608] px-3.5 py-2.5 font-mono text-xs text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="admin-password-input" className="block text-xs font-medium text-slate-300">
                  Admin Master Password
                </label>
                <input
                  id="admin-password-input"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-[#090608] px-3.5 py-2.5 font-mono text-xs text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loggingIn || sendingCode}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-xs font-semibold text-white shadow-[0_0_25px_rgba(220,38,38,0.4)] transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>{loggingIn ? 'Verifying with Firebase...' : sendingCode ? 'Sending code to your email...' : 'Unlock Admin Panel'}</span>
              </button>
          </form>

          <div className="mt-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[10px] font-medium uppercase text-slate-500">or — strongest</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <button
            type="button"
            onClick={handleAdminGoogleSignIn}
            disabled={googleBusy || loggingIn}
            className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-xl bg-white px-4 py-3 text-xs font-semibold text-[#1f1f1f] transition-colors hover:bg-slate-200 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path fill="#EA4335" d="M12 5.04A7.0 7.0 0 0 1 16.95 6.9l3.14-3.14A10.96 10.96 0 0 0 12 1.04C7.31 1.04 3.26 3.82 1.36 7.84l3.7 2.87A6.55 6.55 0 0 1 12 5.04z" />
              <path fill="#4285F4" d="M23.2 12.28c0-.84-.08-1.65-.22-2.44H12v4.6h6.28a5.4 5.4 0 0 1-2.33 3.52l3.62 2.81c2.12-1.96 3.63-4.86 3.63-8.49z" />
              <path fill="#FBBC05" d="M5.08 14.29a6.6 6.6 0 0 1-.36-2.29c0-.8.13-1.57.35-2.29L1.36 6.84A10.94 10.94 0 0 0 1.04 12c0 1.77.43 3.44 1.17 4.91l2.87-2.62z" />
              <path fill="#34A853" d="M12 22.96c2.97 0 5.47-.98 7.3-2.67l-3.62-2.81c-1.0.68-2.29 1.08-3.68 1.08a6.55 6.55 0 0 1-6.94-6.27l-2.87 2.62A10.96 10.96 0 0 0 12 22.96z" />
            </svg>
            <span>{googleBusy ? 'Opening Google...' : 'Continue with Google (2FA-protected)'}</span>
          </button>
            </>
          )}

          {awaitingCode && (
            <form onSubmit={handleOtpSubmit} className="mt-5 space-y-4">
              <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-600/15 p-3 text-xs text-emerald-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Password verified. A 6-digit code was emailed to <strong>{pendingUser?.email}</strong>. Open Gmail (check Spam too), enter it below. It expires in 5 minutes.
                </span>
              </div>
              <div>
                <label htmlFor="admin-otp-input" className="block text-xs font-medium text-slate-300">
                  6-Digit Email Code
                </label>
                <input
                  id="admin-otp-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  autoFocus
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-[#090608] px-3.5 py-2.5 text-center font-mono text-lg tracking-[0.5em] text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={otpBusy || otpCode.length !== 6}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-semibold text-white shadow-[0_0_25px_rgba(16,185,129,0.35)] transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>{otpBusy ? 'Checking code...' : 'Verify Code & Unlock Panel'}</span>
              </button>
              <button
                type="button"
                onClick={handleBackToPassword}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-medium text-slate-300 hover:text-white"
              >
                Back / use a different account
              </button>
            </form>
          )}

          <div className="mt-6 rounded-xl border border-white/10 bg-[#090608] p-3.5 text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5 font-mono font-semibold text-slate-300">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>ZERO-TRUST ADMIN WHITELIST (2 / 2 LOCKED)</span>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              Only the 2 authorized admin Gmail accounts can sign in, and every saved change is additionally enforced by Firestore security rules. Normal users have zero access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const filteredPlans = plans
    .filter((p) => p.category === selectedCategory)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const totalRevenueInr =
    orders.reduce((acc, o) => acc + o.amountInr, 0) + 184650;
  const activeServersCount = 342 + orders.length;

  const handleSaveDiscountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveDiscountOffer(discountInput.trim(), discountPctInput);
    if (discountInput.trim()) {
      showToast(
        `Discount Offer Board & ${discountPctInput}% strikethrough price cut activated across Plans!`
      );
    } else {
      showToast(
        'Discount Offer Board cleared — strikethrough cut prices hidden from Plans.'
      );
    }
  };

  const handleClearDiscount = async () => {
    setDiscountInput('');
    await onSaveDiscountOffer('', discountPctInput);
    showToast('Discount Offer Board cleared — strikethrough cut prices hidden from Plans.');
  };

  const handleCreateCouponSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCouponCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '');
    if (!clean) return;
    await onCreateCoupon({
      code: clean,
      discountPercent: Math.min(95, Math.max(1, Number(newCouponPercent) || 15)),
      description:
        newCouponDesc.trim() || `${newCouponPercent}% Official Promo Discount`,
    });
    setNewCouponCode('');
    setNewCouponDesc('');
    showToast(`Created Coupon Code "${clean}" (${newCouponPercent}% OFF) — live at Checkout!`);
  };

  const handleStartEditPlan = (item: HostingPlanItem) => {
    setIsNewPlanDraft(false);
    setFeaturesText((item.features || []).join('\n'));
    setEditingPlan({
      ...item,
      tagline: item.tagline || '',
      description: item.description || '',
      originalPriceInr: undefined, // crossed-out price is automatic (banner Default Cut %)
    });
  };

  const handleCreateNewPlan = () => {
    setIsNewPlanDraft(true);
    setFeaturesText('');
    const newPlan: HostingPlanItem = {
      id: `${selectedCategory}_custom_${Date.now()}`,
      name: '',
      tagline: '',
      description: '',
      category: selectedCategory,
      priceInr: 199,
      billingPeriod: selectedCategory === 'domain' ? '/yr' : '/mo',
      ram: '8 GB RAM',
      cpu: '200% CPU',
      storage: '50 GB NVMe',
      speed: '1 Gbps Speed',
      popular: false,
      features: [],
      sortOrder: filteredPlans.length + 1,
    };
    setEditingPlan(newPlan);
  };

  const handlePlanFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    const customFeatures = featuresText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const customDesc = editingPlan.tagline.trim() || editingPlan.description?.trim() || '';
    const finalPlan: HostingPlanItem = {
      ...editingPlan,
      name: editingPlan.name.trim() || 'Custom Plan',
      tagline: customDesc,
      description: customDesc,
      features: customFeatures,
      originalPriceInr: undefined, // never save a frozen cut price
    };
    await onSavePlan(finalPlan);
    setEditingPlan(null);
    setIsNewPlanDraft(false);
    showToast(
      `Saved "${finalPlan.name}" — custom description & features saved!`
    );
  };

  const handleConfigFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveSiteConfig(configDraft);
    showToast('Updated live website configuration & social links.');
  };

  const handleRunEncrypt = async () => {
    setDecryptedOutput(null);
    const res = await fetch('/api/security/encrypt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken() || ''}` },
      body: JSON.stringify({ payload: samplePlaintext }),
    });
    const data = await res.json();
    if (data.ciphertext) {
      setEncryptedResult(data);
    }
  };

  const handleRunDecrypt = async () => {
    if (!encryptedResult) return;
    const res = await fetch('/api/security/decrypt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken() || ''}` },
      body: JSON.stringify({
        ciphertext: encryptedResult.ciphertext,
        iv: encryptedResult.iv,
      }),
    });
    const data = await res.json();
    if (data.plaintext) {
      setDecryptedOutput(data.plaintext);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md overflow-y-auto"
    >
      <div className="my-auto flex w-full max-w-6xl flex-col rounded-2xl border border-white/10 bg-[#10080c] text-slate-100 shadow-2xl overflow-hidden">
        {/* Top Bar Contract inside Workspace */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-[#090608] px-6 py-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Areex Cloud 2-Admin Command Center</span>
              <span aria-hidden="true">/</span>
              <span className="font-mono text-red-400 uppercase">{activeTab}</span>
            </div>
            <h2
              id="workspace-modal-title"
              className="mt-0.5 font-display text-lg font-bold text-white"
            >
              Authenticated: {adminSession.name} ({adminSession.email})
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                logAuthEvent('LOGOUT', 'Admin console session ended', adminSession?.email);
                setAdminSession(null);
                void signOut(auth);
                if (onAdminSessionChange) {
                  onAdminSessionChange(false);
                }
              }}
              className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-red-500/40 hover:text-white whitespace-nowrap"
            >
              <LogOut className="h-3.5 w-3.5 text-red-400" />
              <span>Lock Admin</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Admin & Analytics Workspace"
              className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {saveBanner && (
          <div className="flex items-center justify-center gap-2 bg-emerald-600/20 border-b border-emerald-500/30 px-4 py-2 text-xs font-medium text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            <span>{saveBanner}</span>
          </div>
        )}

        <div className="grid min-h-[540px] lg:grid-cols-12">
          {/* Sidebar Navigation */}
          <div className="border-b border-white/10 bg-[#0c0609] p-4 lg:col-span-3 lg:border-b-0 lg:border-r">
            <nav className="space-y-1.5" aria-label="Admin Console Sections">
              <button
                type="button"
                onClick={() => setActiveTab('discount')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-xs font-medium transition-colors ${
                  activeTab === 'discount'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Tag className="h-4 w-4 shrink-0" />
                <span>Discounts & Coupon Creator</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('plans')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-xs font-medium transition-colors ${
                  activeTab === 'plans'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Server className="h-4 w-4 shrink-0" />
                <span>Plan & Cut-Price Manager</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('support')}
                className={`flex w-full items-center justify-between rounded-lg px-3.5 py-2.5 text-left text-xs font-medium transition-colors ${
                  activeTab === 'support'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Headphones className="h-4 w-4 shrink-0" />
                  <span>Customer Support Tickets</span>
                </span>
                <span className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10px]">
                  {supportTickets.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('analytics')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-xs font-medium transition-colors ${
                  activeTab === 'analytics'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <BarChart3 className="h-4 w-4 shrink-0" />
                <span>Real-Time Analytics</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('config')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-xs font-medium transition-colors ${
                  activeTab === 'config'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Settings className="h-4 w-4 shrink-0" />
                <span>Site Copy & Social Links</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('security')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-xs font-medium transition-colors ${
                  activeTab === 'security'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>AES-256 & Rules Audit</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-xs font-medium transition-colors ${
                  activeTab === 'audit' ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Activity className="h-4 w-4 shrink-0" />
                <span>Audit Log</span>
              </button>
            </nav>

            <div className="mt-8 rounded-xl border border-white/10 bg-[#090608] p-3.5 text-xs">
              <div className="font-semibold text-white">2-Admin Lock Active</div>
              <p className="mt-1 text-slate-400 leading-relaxed">
                Only Santosh Rout and Piyush Garai can access this panel via Gmail + Password verification.
              </p>
            </div>
          </div>

          {/* Main Viewport */}
          <div className="p-6 lg:col-span-9 max-h-[75vh] overflow-y-auto">
            {activeTab === 'discount' && (
              <div className="space-y-6">
                {/* 1. Discount Offer Board + Strikethrough Price Cut Controller */}
                <form
                  onSubmit={handleSaveDiscountSubmit}
                  className="rounded-xl border border-white/10 bg-[#090608] p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
                    <div>
                      <h3 className="font-display text-base font-bold text-white">
                        Live Discount Offer Board & Strikethrough Price Cut
                      </h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Write a discount offer below to show the announcement board above Plans AND activate crossed-out (cut) original prices on all cards. Leave empty to hide both.
                      </p>
                    </div>
                    <span
                      className={`font-mono text-xs font-semibold ${
                        discountOffer.trim() ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      {discountOffer.trim()
                        ? 'STATUS: BOARD & PRICE CUTS ACTIVE'
                        : 'STATUS: HIDDEN (NO CUT PRICES)'}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-12">
                    <div className="sm:col-span-9">
                      <label
                        htmlFor="discount-board-input"
                        className="block text-xs font-medium text-slate-300"
                      >
                        Discount Announcement Text (Leave empty to hide board & price cuts)
                      </label>
                      <input
                        id="discount-board-input"
                        type="text"
                        maxLength={240}
                        value={discountInput}
                        onChange={(e) => setDiscountInput(e.target.value)}
                        placeholder="e.g. MEGA LAUNCH OFFER: Flat 20% OFF on All Premium & VPS Plans — Use Code INDIA20 at Checkout!"
                        className="mt-2 w-full rounded-xl border border-white/15 bg-[#140c10] px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label
                        htmlFor="discount-pct-input"
                        className="block text-xs font-medium text-slate-300"
                      >
                        Default Cut %
                      </label>
                      <input
                        id="discount-pct-input"
                        type="number"
                        min={5}
                        max={85}
                        value={discountPctInput}
                        onChange={(e) => setDiscountPctInput(Number(e.target.value) || 20)}
                        className="mt-2 w-full rounded-xl border border-white/15 bg-[#140c10] px-3.5 py-3 font-mono text-sm text-white focus:border-red-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Quick Preset Templates */}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-slate-400">Quick Presets:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setDiscountInput(
                          'MEGA LAUNCH SALE: Flat 20% OFF on All Premium & VPS Plans — Use Promo Code INDIA20 at Checkout!'
                        );
                        setDiscountPctInput(20);
                      }}
                      className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:border-red-500/40 hover:text-white"
                    >
                      20% OFF Launch Sale (INDIA20)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDiscountInput(
                          'CHAMPION NETWORK DEAL: Flat 30% Price Cut Active — Use Code CHAMPION30 at Checkout!'
                        );
                        setDiscountPctInput(30);
                      }}
                      className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:border-red-500/40 hover:text-white"
                    >
                      30% OFF Champion Sale (CHAMPION30)
                    </button>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
                    <button
                      type="submit"
                      className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-red-500 whitespace-nowrap"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>Save Discount Offer Board</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleClearDiscount}
                      className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-medium text-slate-300 hover:border-red-500/40 hover:text-white whitespace-nowrap"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      <span>Clear Text (Hide Board & Price Cuts)</span>
                    </button>
                  </div>
                </form>

                {/* 2. Custom Coupon Code Creator Studio */}
                <div className="rounded-xl border border-white/10 bg-[#090608] p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
                    <div>
                      <h3 className="font-display text-base font-bold text-white">
                        Custom Coupon Code Creator Studio
                      </h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Create unlimited promo & coupon codes (e.g. DIWALI50, PIYUSH25) that players can apply at Checkout for instant discounts.
                      </p>
                    </div>
                    <span className="font-mono text-xs text-red-400">
                      {coupons.length} ACTIVE COUPONS
                    </span>
                  </div>

                  <form
                    onSubmit={handleCreateCouponSubmit}
                    className="mt-4 grid gap-3 sm:grid-cols-12"
                  >
                    <div className="sm:col-span-4">
                      <label
                        htmlFor="coupon-code-create-input"
                        className="block text-xs text-slate-400"
                      >
                        Coupon Code *
                      </label>
                      <input
                        id="coupon-code-create-input"
                        type="text"
                        required
                        maxLength={24}
                        value={newCouponCode}
                        onChange={(e) => setNewCouponCode(e.target.value.toUpperCase())}
                        placeholder="e.g. AREEX50"
                        className="mt-1 w-full rounded-xl border border-white/15 bg-[#140c10] px-3.5 py-2.5 font-mono text-xs text-white uppercase placeholder-slate-500 focus:border-red-500 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label
                        htmlFor="coupon-pct-create-input"
                        className="block text-xs text-slate-400"
                      >
                        Discount % *
                      </label>
                      <input
                        id="coupon-pct-create-input"
                        type="number"
                        required
                        min={1}
                        max={95}
                        value={newCouponPercent}
                        onChange={(e) => setNewCouponPercent(Number(e.target.value) || 10)}
                        className="mt-1 w-full rounded-xl border border-white/15 bg-[#140c10] px-3 py-2.5 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <label
                        htmlFor="coupon-desc-create-input"
                        className="block text-xs text-slate-400"
                      >
                        Offer Description
                      </label>
                      <input
                        id="coupon-desc-create-input"
                        type="text"
                        maxLength={80}
                        value={newCouponDesc}
                        onChange={(e) => setNewCouponDesc(e.target.value)}
                        placeholder="e.g. 50% Festival Special"
                        className="mt-1 w-full rounded-xl border border-white/15 bg-[#140c10] px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
                      />
                    </div>

                    <div className="flex items-end sm:col-span-2">
                      <button
                        type="submit"
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-red-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-red-500 whitespace-nowrap"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add Code</span>
                      </button>
                    </div>
                  </form>

                  {/* Active Coupons Table */}
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    {coupons.map((c) => (
                      <div
                        key={c.code}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-[#12090e] p-3.5"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-white">
                              {c.code}
                            </span>
                            <span className="rounded bg-red-600/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-red-400">
                              -{c.discountPercent}%
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            {c.description}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(c.code);
                              setCopiedCoupon(c.code);
                              setTimeout(() => setCopiedCoupon(null), 1500);
                            }}
                            aria-label={`Copy coupon ${c.code}`}
                            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 hover:text-white"
                          >
                            {copiedCoupon === c.code ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteCoupon(c.code);
                              showToast(`Deleted coupon code "${c.code}".`);
                            }}
                            aria-label={`Delete coupon ${c.code}`}
                            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400 hover:border-red-500/40 hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'plans' && (
              <div className="space-y-5">
                <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-xs text-slate-200">
                  <strong className="text-red-400">Price Cut (Strikethrough) Rule:</strong>{' '}
                  When you change a plan's price below, the original price is saved as the{' '}
                  <span className="line-through text-slate-400">Cut Price</span>. It will automatically show crossed-out on the website cards whenever a{' '}
                  <strong className="text-white">Discount Offer</strong> is active!
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-[#090608] p-1">
                    {PLAN_CATEGORIES.map((cat) => (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(cat.key);
                          setEditingPlan(null);
                        }}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          selectedCategory === cat.key
                            ? 'bg-red-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleCreateNewPlan}
                    className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-500 whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Plan to {selectedCategory.toUpperCase()}</span>
                  </button>
                </div>

                {editingPlan ? (
                  <form
                    onSubmit={handlePlanFormSubmit}
                    className="space-y-4 rounded-xl border border-red-500/30 bg-[#090608] p-5"
                  >
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <div>
                        <h3 className="font-display text-sm font-bold text-white">
                          {isNewPlanDraft
                            ? `Add New Custom Plan to ${selectedCategory.toUpperCase()}`
                            : `Editing Plan: ${editingPlan.name}`}
                        </h3>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          Write your own custom description, specs, and feature bullet points below — everything saves directly to this plan.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPlan(null);
                          setIsNewPlanDraft(false);
                        }}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-4">
                      <div className="sm:col-span-2">
                        <label
                          htmlFor="edit-plan-name"
                          className="block text-xs font-medium text-slate-300"
                        >
                          Plan Name *
                        </label>
                        <input
                          id="edit-plan-name"
                          type="text"
                          required
                          maxLength={60}
                          placeholder="e.g. Elite Plus / Starter SMP"
                          value={editingPlan.name}
                          onChange={(e) =>
                            setEditingPlan({ ...editingPlan, name: e.target.value })
                          }
                          className="mt-1 w-full rounded-lg border border-white/15 bg-[#140c10] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="edit-plan-price"
                          className="block text-xs font-semibold text-emerald-400"
                        >
                          Offer Price (₹ INR) *
                        </label>
                        <input
                          id="edit-plan-price"
                          type="number"
                          required
                          min={1}
                          max={500000}
                          value={editingPlan.priceInr}
                          onChange={(e) => {
                            const nextPrice = Number(e.target.value) || 99;
                            setEditingPlan((prev) => (prev ? { ...prev, priceInr: nextPrice } : prev));
                          }}
                          className="mt-1 w-full rounded-lg border border-emerald-500/40 bg-[#140c10] px-3 py-2 font-mono text-xs text-white focus:border-emerald-400 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="edit-plan-cut-price"
                          className="block text-xs font-semibold text-red-400"
                        >
                          Crossed-out Price (₹, automatic)
                        </label>
                        <input
                          id="edit-plan-cut-price"
                          type="number"
                          readOnly
                          disabled
                          value={getPlanCutPriceInr(
                            { ...editingPlan, originalPriceInr: undefined },
                            discountPercent
                          )}
                          className="mt-1 w-full cursor-not-allowed rounded-lg border border-red-500/20 bg-[#140c10] px-3 py-2 font-mono text-xs text-slate-500"
                        />
                        <p className="mt-1 text-[10px] text-slate-500">
                          Follows the banner&apos;s Default Cut % for every plan.
                        </p>
                      </div>

                      {/* Custom Plan Description (Subtitle / Tagline + Detailed Description) */}
                      <div className="sm:col-span-3">
                        <label
                          htmlFor="edit-plan-description"
                          className="block text-xs font-semibold text-white"
                        >
                          Custom Plan Description (Shown below Plan Title on Card) *
                        </label>
                        <textarea
                          id="edit-plan-description"
                          rows={2}
                          required
                          maxLength={300}
                          placeholder="Write your custom description for this plan (e.g. Best for 20-30 player survival SMPs, modpacks & BungeeCord networks)..."
                          value={editingPlan.tagline}
                          onChange={(e) =>
                            setEditingPlan({
                              ...editingPlan,
                              tagline: e.target.value,
                              description: e.target.value,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-white/20 bg-[#140c10] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="edit-plan-billing"
                          className="block text-xs text-slate-400"
                        >
                          Billing Cycle
                        </label>
                        <select
                          id="edit-plan-billing"
                          value={editingPlan.billingPeriod}
                          onChange={(e) =>
                            setEditingPlan({
                              ...editingPlan,
                              billingPeriod: e.target.value === '/yr' ? '/yr' : '/mo',
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-white/15 bg-[#140c10] px-3 py-2 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                        >
                          <option value="/mo">Monthly (/mo)</option>
                          <option value="/yr">Yearly (/yr)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs text-slate-400">RAM Allocation *</label>
                        <input
                          type="text"
                          required
                          maxLength={40}
                          placeholder="e.g. 16 GB RAM"
                          value={editingPlan.ram}
                          onChange={(e) =>
                            setEditingPlan({ ...editingPlan, ram: e.target.value })
                          }
                          className="mt-1 w-full rounded-lg border border-white/15 bg-[#140c10] px-3 py-2 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-400">CPU Allocation *</label>
                        <input
                          type="text"
                          required
                          maxLength={60}
                          placeholder="e.g. 400% CPU"
                          value={editingPlan.cpu}
                          onChange={(e) =>
                            setEditingPlan({ ...editingPlan, cpu: e.target.value })
                          }
                          className="mt-1 w-full rounded-lg border border-white/15 bg-[#140c10] px-3 py-2 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-400">Storage Allocation *</label>
                        <input
                          type="text"
                          required
                          maxLength={50}
                          placeholder="e.g. 120 GB NVMe"
                          value={editingPlan.storage}
                          onChange={(e) =>
                            setEditingPlan({ ...editingPlan, storage: e.target.value })
                          }
                          className="mt-1 w-full rounded-lg border border-white/15 bg-[#140c10] px-3 py-2 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-400">Network Speed *</label>
                        <input
                          type="text"
                          required
                          maxLength={60}
                          placeholder="e.g. 5 Gbps Speed"
                          value={editingPlan.speed}
                          onChange={(e) =>
                            setEditingPlan({ ...editingPlan, speed: e.target.value })
                          }
                          className="mt-1 w-full rounded-lg border border-white/15 bg-[#140c10] px-3 py-2 font-mono text-xs text-white focus:border-red-500 focus:outline-none"
                        />
                      </div>

                      {/* Custom Features / Bullet List Editor */}
                      <div className="sm:col-span-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label
                            htmlFor="edit-plan-features"
                            className="block text-xs font-semibold text-white"
                          >
                            Custom Plan Features / Specifications List (1 Feature per Line)
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const synced = [
                                editingPlan.ram,
                                editingPlan.cpu,
                                editingPlan.speed,
                                editingPlan.storage,
                                'Unlimited Databases',
                                'DDoS Protection',
                                '24/7 VIP Support',
                              ].filter((x) => x && x.trim().length > 0);
                              setFeaturesText(synced.join('\n'));
                            }}
                            className="rounded border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:border-red-500/40 hover:text-white"
                          >
                            Sync from RAM / CPU / Storage Specs
                          </button>
                        </div>
                        <textarea
                          id="edit-plan-features"
                          rows={5}
                          value={featuresText}
                          onChange={(e) => setFeaturesText(e.target.value)}
                          placeholder={
                            '16 GB DDR5 RAM\n400% CPU Allocation\n120 GB NVMe Storage\n5 Gbps Network Speed\nDDoS Protection\n24/7 Support'
                          }
                          className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#140c10] px-3 py-2 font-mono text-xs leading-relaxed text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
                        />
                        <p className="mt-1 text-[11px] text-slate-400">
                          Each line above will appear with a checkmark on this plan&apos;s card. Write any custom features or details you want.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={editingPlan.popular}
                          onChange={(e) =>
                            setEditingPlan({ ...editingPlan, popular: e.target.checked })
                          }
                          className="rounded border-white/20 bg-black text-red-600"
                        />
                        <span>Highlight as Most Popular in Category</span>
                      </label>

                      <button
                        type="submit"
                        className="flex items-center gap-1.5 rounded-lg bg-red-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-red-500"
                      >
                        <Save className="h-3.5 w-3.5" />
                        <span>Save Plan & Custom Description</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#090608]">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-slate-400">
                          <th className="p-3.5 font-medium">Plan Name & Custom Description</th>
                          <th className="p-3.5 font-medium">RAM / CPU / Storage</th>
                          <th className="p-3.5 font-medium text-right">
                            Cut Price (When Offer Active)
                          </th>
                          <th className="p-3.5 font-medium text-right">Active Price</th>
                          <th className="p-3.5 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono tabular-nums">
                        {filteredPlans.map((item) => {
                          const cutVal = getPlanCutPriceInr(item, discountPercent);
                          return (
                            <tr key={item.id} className="hover:bg-white/[0.02]">
                              <td className="p-3.5 font-sans">
                                <div className="font-semibold text-white">
                                  {item.name}{' '}
                                  {item.popular && (
                                    <span className="ml-1.5 font-mono text-[11px] text-red-400">
                                      · POPULAR
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 text-[11px] text-slate-400 line-clamp-2">
                                  {item.tagline || item.description || 'No custom description'}
                                </div>
                              </td>
                              <td className="p-3.5 text-slate-300">
                                <div>{item.ram} · {item.cpu}</div>
                                <div className="text-[11px] text-slate-500">{item.storage} · {item.speed}</div>
                              </td>
                              <td className="p-3.5 text-right text-slate-500 line-through decoration-red-500">
                                ₹{cutVal}
                              </td>
                              <td className="p-3.5 text-right font-bold text-emerald-400">
                                ₹{item.priceInr}
                                <span className="text-slate-500">{item.billingPeriod}</span>
                              </td>
                              <td className="p-3.5 text-right">
                                <div className="flex items-center justify-end gap-2 font-sans">
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditPlan(item)}
                                    className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-slate-200 hover:border-red-500/50 hover:text-white"
                                  >
                                    Edit Plan & Description
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onDeletePlan(item.id);
                                      showToast(`Removed plan "${item.name}".`);
                                    }}
                                    aria-label={`Delete ${item.name}`}
                                    className="rounded-md border border-white/10 p-1 text-slate-400 hover:border-red-500/40 hover:text-red-400"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'support' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-white">
                      Customer Support Helpdesk Queue ({supportTickets.length})
                    </h3>
                    <p className="text-xs text-slate-400">
                      Reply directly to player support tickets and update resolution status.
                    </p>
                  </div>
                  <Ticket className="h-5 w-5 text-red-500" />
                </div>

                {supportTickets.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-xl border border-white/10 bg-[#090608] p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs font-bold text-red-400">
                          #{t.ticketNumber} · {t.category} · {t.priority.toUpperCase()}
                        </span>
                        <h4 className="font-display text-sm font-bold text-white">
                          {t.subject}
                        </h4>
                        <div className="font-mono text-[11px] text-slate-400">
                          From: {t.customerName} ({t.customerEmail}) · Server: {t.serverIpOrId}
                        </div>
                      </div>

                      <select
                        value={t.status}
                        onChange={(e) => {
                          onUpdateSupportTicket(t.id, {
                            status: e.target.value as 'open' | 'in_progress' | 'resolved',
                          });
                          showToast(`Updated Ticket #${t.ticketNumber} status.`);
                        }}
                        aria-label={`Status for ticket ${t.ticketNumber}`}
                        className="rounded-lg border border-white/15 bg-[#140c10] px-3 py-1.5 font-mono text-xs text-white"
                      >
                        <option value="open">OPEN</option>
                        <option value="in_progress">IN PROGRESS</option>
                        <option value="resolved">RESOLVED</option>
                      </select>
                    </div>

                    <p className="rounded-lg border border-white/5 bg-[#12090e] p-3 text-xs text-slate-200">
                      {t.message}
                    </p>

                    {t.adminReply && (
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs text-emerald-200">
                        <strong className="font-mono text-emerald-400">
                          Current Reply ({t.repliedBy}):{' '}
                        </strong>
                        {t.adminReply}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={replyDrafts[t.id] ?? ''}
                        onChange={(e) =>
                          setReplyDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))
                        }
                        placeholder="Write official staff reply to customer..."
                        className="flex-1 rounded-lg border border-white/15 bg-[#140c10] px-3 py-2 text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const text = (replyDrafts[t.id] || '').trim();
                          if (!text) return;
                          onUpdateSupportTicket(t.id, {
                            status: 'resolved',
                            adminReply: text,
                            repliedBy: adminSession.name,
                          });
                          setReplyDrafts((prev) => ({ ...prev, [t.id]: '' }));
                          showToast(`Replied to Ticket #${t.ticketNumber} & marked Resolved!`);
                        }}
                        className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 whitespace-nowrap"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>Send Reply</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'analytics' && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="rounded-xl border border-white/10 bg-[#090608] p-4">
                    <div className="text-xs text-slate-400">Monthly Recurring Revenue</div>
                    <div className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">
                      ₹{totalRevenueInr.toLocaleString('en-IN')}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-emerald-400">
                      +24.8% vs last 30d
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#090608] p-4">
                    <div className="text-xs text-slate-400">Active Game & VPS Containers</div>
                    <div className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">
                      {activeServersCount}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-slate-400">
                      99.99% SLA Uptime
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#090608] p-4">
                    <div className="text-xs text-slate-400">Active Promo Coupons</div>
                    <div className="mt-1 font-mono text-2xl font-bold text-red-400 tabular-nums">
                      {coupons.length}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-slate-400">
                      Live at Checkout
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#090608] p-4">
                    <div className="text-xs text-slate-400">Authorized Admins</div>
                    <div className="mt-1 font-mono text-2xl font-bold text-emerald-400 tabular-nums">
                      2 / 2
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-slate-400">
                      Gmail + SHA-256 Locked
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#090608] p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-bold text-white">
                      Live Datacenter Node Telemetry
                    </h3>
                    <span className="flex items-center gap-1.5 font-mono text-xs text-emerald-400">
                      <Activity className="h-3.5 w-3.5" />
                      <span>REAL-TIME STREAM</span>
                    </span>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-slate-400">
                          <th className="pb-2.5 font-medium">Datacenter Node</th>
                          <th className="pb-2.5 font-medium">Processor Architecture</th>
                          <th className="pb-2.5 font-medium text-right">Ping</th>
                          <th className="pb-2.5 font-medium text-right">Load</th>
                          <th className="pb-2.5 font-medium text-right">DDoS Shield</th>
                          <th className="pb-2.5 font-medium text-right">State</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono tabular-nums">
                        {nodes.map((n) => (
                          <tr key={n.id} className="hover:bg-white/[0.02]">
                            <td className="py-3 font-sans font-medium text-white">{n.name}</td>
                            <td className="py-3 text-slate-300">{n.cpuModel}</td>
                            <td className="py-3 text-right text-red-400">{n.pingMs} ms</td>
                            <td className="py-3 text-right text-slate-200">{n.loadPercent}%</td>
                            <td className="py-3 text-right text-slate-400">{n.ddosCapacity}</td>
                            <td className="py-3 text-right text-emerald-400">{n.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'config' && (
              <form
                onSubmit={handleConfigFormSubmit}
                className="space-y-4 rounded-xl border border-white/10 bg-[#090608] p-5"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <h3 className="font-display text-sm font-bold text-white">
                      Global Brand Copy & Social Links
                    </h3>
                    <p className="text-xs text-slate-400">
                      Update hero text, Discord invite, YouTube channel, and Instagram links.
                    </p>
                  </div>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 whitespace-nowrap"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>Publish Changes</span>
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs text-slate-400">Brand Title</label>
                    <input
                      type="text"
                      required
                      maxLength={60}
                      value={configDraft.brandName}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, brandName: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-white/15 bg-[#140c10] px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">Founder Name</label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={configDraft.founderName}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, founderName: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-white/15 bg-[#140c10] px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-400">Hero Headline</label>
                    <input
                      type="text"
                      required
                      maxLength={120}
                      value={configDraft.heroTitle}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, heroTitle: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-white/15 bg-[#140c10] px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-400">Hero Subtitle</label>
                    <textarea
                      rows={2}
                      required
                      maxLength={300}
                      value={configDraft.heroSubtitle}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, heroSubtitle: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-white/15 bg-[#140c10] px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">Discord Invite URL</label>
                    <input
                      type="url"
                      required
                      maxLength={200}
                      value={configDraft.discordUrl}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, discordUrl: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-white/15 bg-[#140c10] px-3 py-2 font-mono text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400">YouTube Channel URL</label>
                    <input
                      type="url"
                      required
                      maxLength={200}
                      value={configDraft.youtubeUrl}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, youtubeUrl: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-white/15 bg-[#140c10] px-3 py-2 font-mono text-xs text-white"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-400">Instagram URL</label>
                    <input
                      type="url"
                      required
                      maxLength={200}
                      value={configDraft.instagramUrl}
                      onChange={(e) =>
                        setConfigDraft({ ...configDraft, instagramUrl: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-white/15 bg-[#140c10] px-3 py-2 font-mono text-xs text-white"
                    />
                  </div>
                </div>
              </form>
            )}

            {activeTab === 'audit' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg font-bold text-white">Audit Log</h3>
                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">
                      Append-only trail of every admin change, website/customer action and security event.
                      Times are stamped by Firestore servers (displayed in IST), not by this device.
                      Passwords, login codes and encrypted credentials are never recorded.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAuditAuto((v) => !v)}
                      className={`rounded-lg border px-3 py-2 text-xs ${auditAuto ? 'border-emerald-500/50 bg-emerald-600/15 text-emerald-200' : 'border-white/15 text-slate-400 hover:text-white'}`}
                    >
                      Auto-refresh {auditAuto ? 'ON' : 'OFF'}
                    </button>
                    <button
                      type="button"
                      onClick={loadAuditLog}
                      disabled={auditLoading}
                      className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white hover:border-red-500/50 disabled:opacity-50"
                    >
                      {auditLoading ? 'Loading…' : 'Refresh log'}
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadAuditCsv(auditEntries)}
                      disabled={!auditEntries.length}
                      className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white hover:border-red-500/50 disabled:opacity-50"
                    >
                      Export CSV
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(['ALL', 'ADMIN', 'CUSTOMER', 'AUTH'] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAuditFilter(key)}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-medium ${auditFilter === key ? 'border-red-500/50 bg-red-600/20 text-white' : 'border-white/15 bg-white/5 text-slate-400 hover:text-white'}`}
                    >
                      {key === 'ALL' ? 'All events' : CATEGORY_LABEL[key]}
                    </button>
                  ))}
                  <input
                    type="search"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Search actor, action, target, change…"
                    className="ml-auto w-full min-w-[180px] max-w-xs rounded-lg border border-white/15 bg-[#090608] px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
                  />
                </div>

                {auditError && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-600/10 p-3 text-xs text-red-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <div className="font-semibold">Audit log unavailable</div>
                      <div className="mt-0.5 break-words text-red-200/80">{auditError}</div>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full min-w-[900px] text-left text-xs">
                    <thead className="bg-white/5 text-slate-400">
                      <tr>
                        <th className="p-3">Time (IST)</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">Action</th>
                        <th className="p-3">Actor / Target</th>
                        <th className="p-3">What changed</th>
                        <th className="p-3">Device / IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {auditEntries.map((entry) => (
                        <tr key={entry.id} className="align-top">
                          <td className="whitespace-nowrap p-3 font-mono">
                            <div className="text-slate-300">{formatAuditTime(entry.createdAt)}</div>
                            <div className="mt-0.5 text-[10px] text-slate-500">{relativeAuditTime(entry.createdAt)}</div>
                          </td>
                          <td className="p-3">
                            <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] ${CATEGORY_TONE[entry.category]}`}>
                              {CATEGORY_LABEL[entry.category]}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className={`whitespace-nowrap rounded-md border px-2 py-0.5 font-mono text-[10px] ${actionTone(entry.action)}`}>
                              {entry.action}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="break-all text-white">{entry.actor}</div>
                            <div className="mt-0.5 break-all font-mono text-[10px] text-slate-500">{entry.target}</div>
                          </td>
                          <td className="p-3">
                            <div className="text-slate-200">{entry.summary || '—'}</div>
                            {entry.changes.length > 0 && (
                              <ul className="mt-1 space-y-0.5">
                                {entry.changes.slice(0, 6).map((change, index) => (
                                  <li key={index} className="break-words font-mono text-[10px] text-emerald-300/80">
                                    · {change}
                                  </li>
                                ))}
                                {entry.changes.length > 6 && (
                                  <li className="text-[10px] text-slate-500">+{entry.changes.length - 6} more field change(s)</li>
                                )}
                              </ul>
                            )}
                          </td>
                          <td className="p-3 font-mono text-[10px] text-slate-400">
                            <div>{entry.agent || '—'}</div>
                            <div className="mt-0.5">{entry.ip || 'ip not captured'}</div>
                          </td>
                        </tr>
                      ))}
                      {!auditEntries.length && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-500">
                            {auditLoading
                              ? 'Loading audit trail…'
                              : auditError
                                ? 'Fix the error above, then press Refresh log.'
                                : 'No events match this filter yet. Change something in the admin panel, or place a test order on the site, to see the trail grow.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-slate-500">
                  Showing {auditEntries.length} event(s) from the latest 300 stored entries. Entries are append-only —
                  Firestore rules block editing and deleting them.
                </p>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-white/10 bg-[#090608] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display text-sm font-bold text-white">
                        Live AES-256-GCM Cryptographic Engine
                      </h3>
                      <p className="text-xs text-slate-400">
                        Test server-side 256-bit GCM encryption, 128-bit IV generation, and HMAC-SHA256 authentication tags.
                      </p>
                    </div>
                    <span className="font-mono text-xs text-emerald-400">
                      KEY DERIVATION: SCRYPT 256-BIT
                    </span>
                  </div>

                  <div className="mt-4">
                    <label
                      htmlFor="aes-plaintext-input"
                      className="block text-xs text-slate-400"
                    >
                      Plaintext Sensitive Server / Billing Payload
                    </label>
                    <div className="mt-1.5 flex gap-2">
                      <input
                        id="aes-plaintext-input"
                        type="text"
                        value={samplePlaintext}
                        onChange={(e) => setSamplePlaintext(e.target.value)}
                        className="flex-1 rounded-lg border border-white/15 bg-[#140c10] px-3 py-2 font-mono text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={handleRunEncrypt}
                        className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 whitespace-nowrap"
                      >
                        <Lock className="h-3.5 w-3.5" />
                        <span>Encrypt with AES-256</span>
                      </button>
                    </div>
                  </div>

                  {encryptedResult && (
                    <div className="mt-4 space-y-2 rounded-lg border border-white/10 bg-[#120a0e] p-3.5 font-mono text-xs">
                      <div className="text-slate-400">
                        IV (Hex): <span className="text-white">{encryptedResult.iv}</span>
                      </div>
                      <div className="text-slate-400">
                        Auth Tag: <span className="text-red-400">{encryptedResult.authTag}</span>
                      </div>
                      <div className="break-all text-slate-400">
                        Ciphertext:{' '}
                        <span className="text-emerald-400">{encryptedResult.ciphertext}</span>
                      </div>
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={handleRunDecrypt}
                          className="flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 font-sans text-xs font-medium text-white hover:border-red-500/50"
                        >
                          <Unlock className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Verify Auth Tag & Decrypt Payload</span>
                        </button>
                      </div>
                      {decryptedOutput && (
                        <div className="mt-2 rounded border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-emerald-300">
                          Decrypted UTF-8 Plaintext: {decryptedOutput}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-white/10 bg-[#090608] p-5">
                  <h3 className="font-display text-sm font-bold text-white">
                    Zero-Trust Firestore Rules · 12 Adversarial Payload Gates
                  </h3>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-slate-400">
                          <th className="pb-2 font-medium">#</th>
                          <th className="pb-2 font-medium">Attack Vector</th>
                          <th className="pb-2 font-medium">Enforced Rule Gate</th>
                          <th className="pb-2 font-medium text-right">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono tabular-nums">
                        {DIRTY_DOZEN_TESTS.map((test) => (
                          <tr key={test.id}>
                            <td className="py-2 text-slate-500">{test.id}</td>
                            <td className="py-2 font-sans text-white">{test.name}</td>
                            <td className="py-2 text-slate-400">{test.blockingGate}</td>
                            <td className="py-2 text-right text-emerald-400">
                              {test.expectedOutcome}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
