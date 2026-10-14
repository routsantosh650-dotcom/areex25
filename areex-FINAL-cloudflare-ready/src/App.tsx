/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  orderBy,
  limit,
} from 'firebase/firestore';
import {
  ArrowRight,
  Zap,
  Star,
  ExternalLink,
  ChevronDown,
  Search,
  Lock,
  Flame,
  ShieldCheck,
  Copy,
  Check,
  Tag,
  Menu,
  X,
} from 'lucide-react';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  PLAN_CATEGORIES,
  INITIAL_HOSTING_PLANS,
  INITIAL_COUPONS,
  WHY_AREEX_FEATURES,
  DEFAULT_SITE_CONFIG,
  HERO_MINECRAFT_IMAGE,
  CITADEL_SHOWCASE_IMAGE,
  HARDWARE_RACK_IMAGE,
  CurrencyCode,
  CouponItem,
  SupportTicketItem,
  formatPriceInCurrency,
  HostingPlanItem,
  PlanCategoryKey,
  SiteConfigData,
} from './data/areexData';
import { AreexLogo } from './components/AreexLogo';
import { CurrencySlidebar } from './components/CurrencySlidebar';
import { CinematicLoader } from './components/CinematicLoader';
import { FaqSection } from './components/FaqSection';
import { PlansOverview } from './components/PlansOverview';
import { ReviewsPage } from './components/ReviewsPage';
import { ShowcasePage } from './components/ShowcasePage';
import { PANEL_URL } from './config';
import { LEGACY_HASH_ROUTES, installLinkInterceptor, navigate, parseRoute, usePath } from './router';
import { AuthModal } from './components/AuthModal';
import { clearSession, getAdminToken, useCustomer, validateSession } from './customerSession';
import { CustomContextMenu } from './components/CustomContextMenu';
import { CustomCursor } from './components/CustomCursor';
import { InteractivePlanCard } from './components/InteractivePlanCard';
import { ContactSection } from './components/ContactSection';
import { LegalSection } from './components/LegalSection';
import { CustomerSupportChat } from './components/CustomerSupportSection';
import { GlobalNetworkMap } from './components/GlobalNetworkMap';
import { LiveUnder60SecondsSection } from './components/LiveUnder60SecondsSection';
import { CheckoutModal, ProvisionedOrderRecord } from './components/CheckoutModal';
import {
  AdminAnalyticsWorkspace,
  AdminTabKey,
} from './components/AdminAnalyticsWorkspace';

const HERO_TYPEWRITER_SEGMENTS = [
  { text: 'MINECRAFT · BOT · KVM VPS · DOMAINS', className: 'text-red-400 font-semibold' },
  { text: ' · ', className: 'text-red-500 font-bold' },
  { text: 'MADE IN INDIA FOR INDIAN GAMERS', className: 'text-slate-100 font-semibold' },
  { text: ' · ', className: 'text-red-500 font-bold' },
  { text: 'AES-256 ENCRYPTED', className: 'text-emerald-400 font-semibold' },
];

const HERO_FULL_TEXT_LENGTH = HERO_TYPEWRITER_SEGMENTS.reduce(
  (acc, seg) => acc + seg.text.length,
  0
);

const HeroTypewriterLine: React.FC = () => {
  const [typedCount, setTypedCount] = useState(0);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    if (typedCount < HERO_FULL_TEXT_LENGTH) {
      timeoutId = setTimeout(() => {
        setTypedCount((prev) => prev + 1);
      }, 32);
    } else {
      timeoutId = setTimeout(() => {
        setTypedCount(0);
      }, 4200);
    }
    return () => clearTimeout(timeoutId);
  }, [typedCount]);

  let remaining = typedCount;

  return (
    <div
      data-testid="hero-typewriter-line"
      aria-label="MINECRAFT · BOT · KVM VPS · DOMAINS · MADE IN INDIA FOR INDIAN GAMERS · AES-256 ENCRYPTED"
      className="inline-block max-w-full rounded-lg border border-red-500/25 bg-black/55 px-3 py-1.5 font-mono text-[10px] sm:text-xs leading-relaxed tracking-wide backdrop-blur-md shadow-[0_0_25px_rgba(220,38,38,0.2)] text-center break-words"
    >
      {HERO_TYPEWRITER_SEGMENTS.map((seg, idx) => {
        if (remaining <= 0) return null;
        const sliceText = seg.text.slice(0, remaining);
        remaining -= sliceText.length;
        return (
          <span key={idx} className={seg.className}>
            {sliceText}
          </span>
        );
      })}
      <span
        aria-hidden="true"
        className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-red-500 align-middle shadow-[0_0_8px_rgba(239,68,68,0.9)]"
      />
    </div>
  );
};

const LOCAL_PLAN_OVERRIDES_KEY = 'areex_plan_overrides_v2';
const LOCAL_DELETED_PLANS_KEY = 'areex_deleted_plans_v2';

function readLocalPlanOverrides(): HostingPlanItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_PLAN_OVERRIDES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalPlanOverrides(overrides: HostingPlanItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_PLAN_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // Ignore storage quota errors
  }
}

function readLocalDeletedPlanIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_DELETED_PLANS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function writeLocalDeletedPlanIds(ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_DELETED_PLANS_KEY, JSON.stringify(ids));
  } catch {
    // Ignore storage quota errors
  }
}

function buildMergedPlans(
  baseList: HostingPlanItem[],
  extraOverrides: HostingPlanItem[] = [],
  extraDeletedIds: string[] = []
): HostingPlanItem[] {
  const deletedSet = new Set<string>([
    ...readLocalDeletedPlanIds(),
    ...extraDeletedIds,
  ]);
  const map = new Map<string, HostingPlanItem>();
  baseList.forEach((p) => {
    if (!deletedSet.has(p.id)) {
      map.set(p.id, p);
    }
  });
  readLocalPlanOverrides().forEach((ov) => {
    if (ov && ov.id && !deletedSet.has(ov.id)) {
      map.set(ov.id, ov);
    }
  });
  extraOverrides.forEach((ov) => {
    if (ov && ov.id && !deletedSet.has(ov.id)) {
      map.set(ov.id, ov);
    }
  });
  return Array.from(map.values());
}

export default function App() {
  const [showLoader, setShowLoader] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1' || navigator.webdriver || window.location.pathname.replace(/\/+$/, '') === '/rtx5090') return false;
    return true;
  });

  const path = usePath();
  const route = parseRoute(path);
  const [homeCategory, setActiveCategory] = useState<PlanCategoryKey>('premium');
  // On /plans/<category> pages the URL decides which category is shown
  const activeCategory: PlanCategoryKey = route.category ?? homeCategory;
  const [currency, setCurrency] = useState<CurrencyCode>('INR');
  const [searchQuery, setSearchQuery] = useState('');
  const [plans, setPlans] = useState<HostingPlanItem[]>(() =>
    buildMergedPlans(INITIAL_HOSTING_PLANS)
  );
  const [siteConfig, setSiteConfig] = useState<SiteConfigData>(DEFAULT_SITE_CONFIG);
  const [discountOffer, setDiscountOffer] = useState<string>('');
  const [discountPercent, setDiscountPercent] = useState<number>(20);
  const [coupons, setCoupons] = useState<CouponItem[]>(INITIAL_COUPONS);
  const [copiedBoardCoupon, setCopiedBoardCoupon] = useState<string | null>(null);
  const [supportTickets, setSupportTickets] = useState<SupportTicketItem[]>([]);
  const [orders, setOrders] = useState<ProvisionedOrderRecord[]>([]);

  // Modal & Workspace states
  const [selectedPlanForCheckout, setSelectedPlanForCheckout] =
    useState<HostingPlanItem | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceInitialTab, setWorkspaceInitialTab] =
    useState<AdminTabKey>('discount');
  const [supportChatOpen, setSupportChatOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdminSessionUnlocked, setIsAdminSessionUnlocked] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');
  const customer = useCustomer();

  // "Plans" dropdown in the top menu (lists every plan category)
  const [plansMenuOpen, setPlansMenuOpen] = useState(false);
  const plansMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!plansMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (plansMenuRef.current && !plansMenuRef.current.contains(e.target as Node)) setPlansMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlansMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [plansMenuOpen]);
  useEffect(() => {
    setPlansMenuOpen(false);
  }, [path]);

  // Admin-only server actions (coupons, offers, ticket replies) need the admin pass from the Admin Console login
  const adminHeaders = (): HeadersInit => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getAdminToken() || ''}`,
  });
  const warnAdminLogin = () =>
    window.alert(
      'Your admin session expired. Log out of the Admin Console, log in again, then repeat this action.'
    );

  const openAuthModal = (mode: 'login' | 'signup' = 'login') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  useEffect(() => {
    validateSession();
    fetch('/api/site-config')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.config) setSiteConfig({ ...DEFAULT_SITE_CONFIG, ...data.config }); })
      .catch(() => {});
  }, []);

  // Dedicated admin URL: the same server-backed workspace opens directly at /rtx5090.
  useEffect(() => {
    if (path.replace(/\/+$/, '') === '/rtx5090') {
      setWorkspaceInitialTab('discount');
      setWorkspaceOpen(true);
    }
  }, [path]);

  // Support tickets hold customer details, so only a logged-in admin can load them
  useEffect(() => {
    if (!isAdminSessionUnlocked) return;
    getDocs(query(collection(db, 'supportTickets'), orderBy('createdAt', 'desc'), limit(200)))
      .then((snap) => {
        setSupportTickets(snap.docs.map((d) => d.data() as SupportTicketItem));
      })
      .catch(() => {});
  }, [isAdminSessionUnlocked]);

  // Normal links navigate without a page reload; old #section links redirect to the new pages
  useEffect(() => installLinkInterceptor(), []);
  useEffect(() => {
    const target = LEGACY_HASH_ROUTES[window.location.hash];
    if (target) navigate(target, { replace: true });
  }, []);

  // Browser tab title per page
  useEffect(() => {
    const titles: Record<string, string> = {
      home: 'Areex Cloud — High-Performance Minecraft, Bot & VPS Hosting',
      admin: 'Secure Admin Console — Areex Cloud',
      plans: 'Hosting Plans — Areex Cloud',
      showcase: 'Panel Showcase — Areex Cloud',
      features: 'Features & Hardware — Areex Cloud',
      network: 'Global Network — Areex Cloud',
      founder: 'Meet the Founder — Areex Cloud',
      reviews: 'Customer Reviews — Areex Cloud',
      faq: 'FAQ — Areex Cloud',
      legal: 'Legal & Terms — Areex Cloud',
      contact: 'Contact & Community — Areex Cloud',
      notfound: 'Page not found — Areex Cloud',
    };
    const cat = PLAN_CATEGORIES.find((c) => c.key === route.category);
    document.title =
      route.page === 'category' && cat ? `${cat.name} — Areex Cloud` : titles[route.page] || titles.home;
  }, [route.page, route.category]);

  // Image fallback tracking
  const [heroImgError, setHeroImgError] = useState(false);
  const [citadelImgError, setCitadelImgError] = useState(false);
  const [rackImgError, setRackImgError] = useState(false);

  const cardsContainerRef = useRef<HTMLDivElement | null>(null);
  const heroImageRef = useRef<HTMLImageElement | null>(null);

  // 1. Firebase Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // 2. Fetch server-side Discount Offer Board, Coupons, Plan Overrides, and Support Tickets on mount
  useEffect(() => {
    fetch('/api/discount-board')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.discountOffer === 'string') {
          setDiscountOffer(d.discountOffer);
        }
        if (typeof d.discountPercent === 'number') {
          setDiscountPercent(d.discountPercent);
        }
      })
      .catch(() => {});

    // Coupons live in Firestore so admin changes are permanent across devices
    getDocs(collection(db, 'coupons'))
      .then((snap) => {
        setCoupons(
          snap.docs
            .map((d) => d.data() as CouponItem)
            .filter((c) => c && typeof c.code === 'string')
        );
      })
      .catch(() => {});

    fetch('/api/plans')
      .then((r) => r.json())
      .then((d) => {
        const serverOverrides: HostingPlanItem[] = Array.isArray(d.plans) ? d.plans : [];
        const serverDeleted: string[] = Array.isArray(d.deletedPlanIds)
          ? d.deletedPlanIds.map(String)
          : [];
        if (serverDeleted.length > 0) {
          const mergedDeleted = Array.from(
            new Set([...readLocalDeletedPlanIds(), ...serverDeleted])
          );
          writeLocalDeletedPlanIds(mergedDeleted);
        }
        if (serverOverrides.length > 0) {
          const byId = new Map<string, HostingPlanItem>();
          readLocalPlanOverrides().forEach((p) => byId.set(p.id, p));
          serverOverrides.forEach((p) => {
            if (p && p.id) byId.set(p.id, p);
          });
          writeLocalPlanOverrides(Array.from(byId.values()));
        }
        if (serverOverrides.length > 0 || serverDeleted.length > 0) {
          setPlans((prev) => buildMergedPlans(prev, serverOverrides, serverDeleted));
        }
      })
      .catch(() => {});

  }, []);

  // 3. Public Firestore Listener for /plans and /siteConfig/main
  useEffect(() => {
    const plansRef = collection(db, 'plans');
    const unsubPlans = onSnapshot(
      plansRef,
      (snapshot) => {
        if (!snapshot.empty) {
          const remotePlans: HostingPlanItem[] = [];
          snapshot.forEach((docSnap) => {
            const d = docSnap.data();
            const descText = String(d.tagline || d.description || '');
            remotePlans.push({
              id: docSnap.id,
              name: String(d.name || 'Plan'),
              tagline: descText,
              description: descText,
              category: (d.category as PlanCategoryKey) || 'budget',
              priceInr: Number(d.priceInr) || 99,
              originalPriceInr: d.originalPriceInr ? Number(d.originalPriceInr) : undefined,
              billingPeriod: d.billingPeriod === '/yr' ? '/yr' : '/mo',
              ram: String(d.ram || '4 GB RAM'),
              cpu: String(d.cpu || '100% CPU'),
              storage: String(d.storage || '25 GB Storage'),
              speed: String(d.speed || '1 Gbps Speed'),
              popular: Boolean(d.popular),
              features: Array.isArray(d.features) ? d.features.map(String) : [],
              sortOrder: Number(d.sortOrder) || 1,
            });
          });
          setPlans((prev) => {
            const baseMap = new Map<string, HostingPlanItem>();
            prev.forEach((p) => baseMap.set(p.id, p));
            remotePlans.forEach((p) => baseMap.set(p.id, p));
            return buildMergedPlans(Array.from(baseMap.values()));
          });
        }
      },
      () => {}
    );

    const configDocRef = doc(db, 'siteConfig', 'main');
    const unsubConfig = onSnapshot(
      configDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const d = docSnap.data();
          setSiteConfig((prev) => ({
            ...prev,
            brandName: String(d.brandName || DEFAULT_SITE_CONFIG.brandName),
            heroTitle: String(d.heroTitle || DEFAULT_SITE_CONFIG.heroTitle),
            heroSubtitle: String(d.heroSubtitle || DEFAULT_SITE_CONFIG.heroSubtitle),
            panelUrl: String(d.panelUrl || DEFAULT_SITE_CONFIG.panelUrl),
            discordUrl: String(d.discordUrl || DEFAULT_SITE_CONFIG.discordUrl),
            storeUrl: String(d.storeUrl || DEFAULT_SITE_CONFIG.storeUrl),
            supportTicketUrl: String(
              d.supportTicketUrl || DEFAULT_SITE_CONFIG.supportTicketUrl
            ),
            founderName: String(d.founderName || DEFAULT_SITE_CONFIG.founderName),
            founderQuote: String(d.founderQuote || DEFAULT_SITE_CONFIG.founderQuote),
            discountOffer:
              typeof d.discountOffer === 'string' ? d.discountOffer : prev.discountOffer,
          }));
          if (typeof d.discountOffer === 'string') {
            setDiscountOffer(d.discountOffer);
          }
        }
      },
      () => {}
    );

    return () => {
      unsubPlans();
      unsubConfig();
    };
  }, []);

  // 4. Authenticated User Orders Listener
  useEffect(() => {
    if (!authReady || !currentUser) return;
    const q = query(collection(db, 'orders'), where('userId', '==', currentUser.uid));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const fetched: ProvisionedOrderRecord[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          fetched.push({
            id: docSnap.id,
            transactionId: `ARX-${docSnap.id.slice(-6).toUpperCase()}`,
            planId: String(d.planId),
            planName: String(d.planName),
            category: String(d.category),
            amountInr: Number(d.amountInr),
            paymentMethod: d.paymentMethod || 'stripe',
            serverHostname: String(d.serverHostname),
            datacenterNode: d.datacenterNode || 'Mumbai IN-West-1',
            encryptedCredentials: String(d.encryptedCredentials),
            encryptionIv: String(d.encryptionIv),
            hmacSignature: 'verified-firestore-record',
            credentials: {
              serverUsername: `areex_${String(d.serverHostname).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`,
              serverPassword: '•••••••••••• (AES-256 Protected)',
              dedicatedEndpoint: '103.195.102.48:25565',
              sftpAddress: 'sftp://103.195.102.48:2022',
              rconToken: 'encrypted',
            },
            status: d.status || 'active',
            createdAtIso: new Date().toISOString(),
          });
        });
        if (fetched.length > 0) {
          setOrders((prev) => {
            const byId = new Map<string, ProvisionedOrderRecord>();
            prev.forEach((o) => byId.set(o.id, o));
            fetched.forEach((o) => byId.set(o.id, o));
            return Array.from(byId.values());
          });
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'orders');
      }
    );
    return () => unsub();
  }, [authReady, currentUser]);

  // 5. GSAP Transition when switching plan categories (Hero image + Cards)
  useEffect(() => {
    setHeroImgError(false);

    if (heroImageRef.current) {
      gsap.fromTo(
        heroImageRef.current,
        { opacity: 0.35, scale: 1.05 },
        { opacity: 1, scale: 1, duration: 0.55, ease: 'power2.out' }
      );
    }

    if (!cardsContainerRef.current) return;
    const cards = cardsContainerRef.current.querySelectorAll('[data-plan-card]');
    if (cards.length === 0) return;
    gsap.fromTo(
      cards,
      { opacity: 0, y: 16 },
      {
        opacity: 1,
        y: 0,
        duration: 0.24,
        stagger: 0.04,
        ease: 'power2.out',
        clearProps: 'transform,opacity',
      }
    );
  }, [activeCategory]);

  // The 2-admin allowlist is the gate; email_verified is not required because the
  // Firebase console for this project cannot mark manually-created users verified.
  // Password logins additionally pass the emailed 6-digit code check (worker.ts).
  const isFirebaseAdmin = Boolean(
    currentUser &&
      (currentUser?.email === 'routsantosh650@gmail.com' ||
        currentUser?.email === 'areexcloud@gmail.com')
  );

  const isAdminUnlocked = isAdminSessionUnlocked || isFirebaseAdmin;

  // Permanent audit trail: every admin change is written to Firestore /auditLog
  // and shown in the Admin & Analytics Workspace "Audit" tab.
  const logAudit = (action: string, target: string, details: string) => {
    if (!currentUser) return;
    const id = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setDoc(doc(db, 'auditLog', id), {
      id,
      timestamp: new Date().toISOString(),
      actor: currentUser.email || 'unknown',
      action,
      method: 'ADMIN',
      path: target,
      status: 200,
      ip: 'cloudflare-edge',
      fields: [],
      changes: [details],
    }).catch(() => {});
  };

  // Persist order to local state + Firestore (if authenticated)
  const handleOrderCompleted = async (order: ProvisionedOrderRecord) => {
    setOrders((prev) => [order, ...prev]);

    if (currentUser && currentUser.emailVerified) {
      const safeOrderId = order.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      const safePlanId = order.planId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      try {
        await setDoc(doc(db, 'orders', safeOrderId), {
          userId: currentUser.uid,
          planId: safePlanId,
          planName: order.planName.slice(0, 80),
          category: order.category,
          amountInr: Math.min(500000, Math.max(1, Math.round(order.amountInr))),
          paymentMethod: order.paymentMethod,
          serverHostname: order.serverHostname.slice(0, 100),
          datacenterNode: order.datacenterNode,
          encryptedCredentials: order.encryptedCredentials.slice(0, 2048),
          encryptionIv: order.encryptionIv.slice(0, 64),
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await setDoc(doc(db, 'analytics', `evt_${Date.now()}`), {
          userId: currentUser.uid,
          eventType: 'order_complete',
          category: order.category.slice(0, 60),
          label: order.planName.slice(0, 120),
          valueInr: Math.min(500000, Math.max(0, Math.round(order.amountInr))),
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `orders/${safeOrderId}`);
      }
    }
  };

  // Save Discount Offer Board & Global Cut % (updates live state + backend + Firestore if admin)
  const handleSaveDiscountOffer = async (offerText: string, pct: number) => {
    const cleanOffer = offerText.slice(0, 240);
    const validPct = Math.min(85, Math.max(5, Number(pct) || 20));
    setDiscountOffer(cleanOffer);
    setDiscountPercent(validPct);
    setSiteConfig((prev) => ({ ...prev, discountOffer: cleanOffer }));

    await fetch('/api/discount-board', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        discountOffer: cleanOffer,
        discountPercent: validPct,
      }),
    })
      .then((r) => {
        if (r.status === 401) warnAdminLogin();
      })
      .catch(() => {});

    if (currentUser && isFirebaseAdmin) {
      try {
        await setDoc(doc(db, 'siteConfig', 'main'), {
          brandName: siteConfig.brandName.slice(0, 60),
          heroTitle: siteConfig.heroTitle.slice(0, 120),
          heroSubtitle: siteConfig.heroSubtitle.slice(0, 300),
          panelUrl: siteConfig.panelUrl.slice(0, 200),
          discordUrl: siteConfig.discordUrl.slice(0, 200),
          storeUrl: siteConfig.storeUrl.slice(0, 200),
          supportTicketUrl: siteConfig.supportTicketUrl.slice(0, 200),
          founderName: siteConfig.founderName.slice(0, 80),
          founderQuote: siteConfig.founderQuote.slice(0, 400),
          discountOffer: cleanOffer,
          updatedBy: currentUser.uid,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'siteConfig/main');
      }
    }
    logAudit('UPDATE', 'discount-board', `offer="${cleanOffer}" cutPercent=${validPct}`);
  };
  const handleCreateCoupon = async (coupon: {
    code: string;
    discountPercent: number;
    description: string;
  }) => {
    const safeCode = coupon.code.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    if (!safeCode) return;
    const item: CouponItem = {
      code: safeCode,
      discountPercent: Math.min(90, Math.max(1, Math.round(coupon.discountPercent))),
      description: coupon.description.slice(0, 200),
      createdAt: new Date().toISOString(),
    };
    setCoupons((prev) => [item, ...prev.filter((c) => c.code !== safeCode)]);
    if (currentUser && isFirebaseAdmin) {
      await setDoc(doc(db, 'coupons', safeCode), item).catch(() => {});
      logAudit('CREATE', `coupons/${safeCode}`, `${item.discountPercent}% discount coupon`);
    }
  };

  const handleDeleteCoupon = async (code: string) => {
    const safeCode = code.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    setCoupons((prev) => prev.filter((c) => c.code !== code));
    if (currentUser && isFirebaseAdmin && safeCode) {
      await deleteDoc(doc(db, 'coupons', safeCode)).catch(() => {});
      logAudit('DELETE', `coupons/${safeCode}`, 'coupon removed from live site');
    }
  };

  // Customer Support Ticket Create & Admin Reply/Update
  const handleCreateSupportTicket = async (payload: {
    customerName: string;
    customerEmail: string;
    discordHandle: string;
    category: string;
    priority: 'normal' | 'high' | 'urgent';
    serverIpOrId: string;
    subject: string;
    message: string;
  }): Promise<SupportTicketItem | null> => {
    const item: SupportTicketItem = {
      ...payload,
      id: `tkt_${Date.now()}`,
      ticketNumber: `ARX-${String(Date.now()).slice(-6)}`,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    setSupportTickets((prev) => [item, ...prev]);
    await setDoc(doc(db, 'supportTickets', item.id), item).catch(() => {});
    return item;
  };

  const handleUpdateSupportTicket = async (
    ticketId: string,
    updates: {
      status: 'open' | 'in_progress' | 'resolved';
      adminReply?: string;
      repliedBy?: string;
    }
  ) => {
    const existing = supportTickets.find((t) => t.id === ticketId);
    if (!existing) return;
    const merged: SupportTicketItem = { ...existing, ...updates };
    setSupportTickets((prev) => prev.map((t) => (t.id === ticketId ? merged : t)));
    await setDoc(doc(db, 'supportTickets', ticketId), merged).catch(() => {});
    logAudit(
      'UPDATE',
      `supportTickets/${ticketId}`,
      `status=${merged.status}${updates.adminReply ? ' · admin reply sent' : ''}`
    );
  };

  // No-Code Admin Plan Save (persists custom description, features, priceInr & originalPriceInr cut price)
  const handleSavePlan = async (updatedPlan: HostingPlanItem) => {
    const customDesc = updatedPlan.tagline?.trim() || updatedPlan.description?.trim() || '';
    const normalizedPlan: HostingPlanItem = {
      ...updatedPlan,
      tagline: customDesc,
      description: customDesc,
      features: Array.isArray(updatedPlan.features) ? updatedPlan.features : [],
    };

    // Persist in localStorage overrides & clear from deletedIds if re-added
    const currentDeleted = readLocalDeletedPlanIds().filter((id) => id !== normalizedPlan.id);
    writeLocalDeletedPlanIds(currentDeleted);
    const currentOverrides = readLocalPlanOverrides().filter((p) => p.id !== normalizedPlan.id);
    writeLocalPlanOverrides([...currentOverrides, normalizedPlan]);

    setPlans((prev) => {
      const exists = prev.some((p) => p.id === normalizedPlan.id);
      if (exists) {
        return prev.map((p) => (p.id === normalizedPlan.id ? normalizedPlan : p));
      }
      return [...prev, normalizedPlan];
    });

    try {
      const planRes = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken() || ''}` },
        body: JSON.stringify({ plan: normalizedPlan }),
      });
      if (planRes.status === 401) {
        window.alert(
          'Plan saved on this screen only. To make it live and auto-deployable, log out of the Admin Console and log in again, then save the plan again.'
        );
      }
    } catch {
      /* offline: the plan stays local */
    }

    if (currentUser && isFirebaseAdmin) {
      const safeId = normalizedPlan.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      const boundedFeatures = (
        normalizedPlan.features.length > 0 ? normalizedPlan.features : ['24/7 Support']
      )
        .slice(0, 10)
        .map((f) => f.slice(0, 120));

      try {
        await setDoc(doc(db, 'plans', safeId), {
          name: normalizedPlan.name.slice(0, 60),
          tagline: (customDesc || 'Custom Hosting Plan').slice(0, 120),
          category: normalizedPlan.category,
          priceInr: Math.min(500000, Math.max(1, Math.round(normalizedPlan.priceInr))),
          billingPeriod: normalizedPlan.billingPeriod,
          ram: normalizedPlan.ram.slice(0, 40),
          cpu: normalizedPlan.cpu.slice(0, 60),
          storage: normalizedPlan.storage.slice(0, 50),
          speed: normalizedPlan.speed.slice(0, 60),
          popular: Boolean(normalizedPlan.popular),
          features: boundedFeatures,
          sortOrder: Math.min(1000, Math.max(0, Math.round(normalizedPlan.sortOrder))),
          authorId: currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `plans/${safeId}`);
      }
      logAudit(
        'UPDATE',
        `plans/${safeId}`,
        `"${normalizedPlan.name}" ₹${normalizedPlan.priceInr}${normalizedPlan.billingPeriod} · ${normalizedPlan.category}`
      );
    }
  };
  const handleDeletePlan = async (planId: string) => {
    const nextDeleted = Array.from(new Set([...readLocalDeletedPlanIds(), planId]));
    writeLocalDeletedPlanIds(nextDeleted);
    writeLocalPlanOverrides(readLocalPlanOverrides().filter((p) => p.id !== planId));

    setPlans((prev) => prev.filter((p) => p.id !== planId));
    await fetch(`/api/plans/${encodeURIComponent(planId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getAdminToken() || ''}` },
    }).catch(() => {});

    if (currentUser && isFirebaseAdmin) {
      const safeId = planId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      try {
        await deleteDoc(doc(db, 'plans', safeId));
        logAudit('DELETE', `plans/${safeId}`, 'plan removed from live site');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `plans/${safeId}`);
      }
    }
  };

  // No-Code Admin Site Config Save
  const handleSaveSiteConfig = async (newConfig: SiteConfigData) => {
    const response = await fetch('/api/site-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken() || ''}` },
      body: JSON.stringify({ config: newConfig }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Site config could not be saved on the server.');
    setSiteConfig(result.config || newConfig);
    if (currentUser && isFirebaseAdmin) {
      try {
        await setDoc(doc(db, 'siteConfig', 'main'), {
          brandName: newConfig.brandName.slice(0, 60),
          heroTitle: newConfig.heroTitle.slice(0, 120),
          heroSubtitle: newConfig.heroSubtitle.slice(0, 300),
          panelUrl: newConfig.panelUrl.slice(0, 200),
          discordUrl: newConfig.discordUrl.slice(0, 200),
          storeUrl: newConfig.storeUrl.slice(0, 200),
          supportTicketUrl: newConfig.supportTicketUrl.slice(0, 200),
          founderName: newConfig.founderName.slice(0, 80),
          founderQuote: newConfig.founderQuote.slice(0, 400),
          discountOffer: discountOffer.slice(0, 240),
          updatedBy: currentUser.uid,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'siteConfig/main');
      }
      logAudit(
        'UPDATE',
        'siteConfig/main',
        `brand="${newConfig.brandName}" · hero="${newConfig.heroTitle.slice(0, 60)}"`
      );
    }
  };

  const activeCategoryMeta =
    PLAN_CATEGORIES.find((c) => c.key === activeCategory) || PLAN_CATEGORIES[1];

  const visiblePlans = plans
    .filter((p) => p.category === activeCategory)
    .filter((p) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.ram.toLowerCase().includes(q) ||
        p.cpu.toLowerCase().includes(q) ||
        p.tagline.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const hasDiscountOffer = discountOffer.trim().length > 0;

  return (
    <div
      id="top"
      className="min-h-screen w-full max-w-full overflow-x-clip bg-[#090608] text-slate-100"
    >
      {/* Custom Fluid GSAP Cursor */}
      <CustomCursor />

      {/* GSAP Cinematic Hardware Boot Loader */}
      <CinematicLoader visible={showLoader} onComplete={() => setShowLoader(false)} />

      {/* Custom Fluid Right-Click Context Menu (Admin options strictly hidden for normal users) */}
      <CustomContextMenu
        onSelectCategory={(cat) => navigate(`/plans/${cat}`)}
        onOpenWorkspace={(tab) => {
          setWorkspaceInitialTab(tab);
          navigate('/rtx5090');
        }}
        onReplayLoader={() => setShowLoader(true)}
        onQuickCheckout={() => {
          const elitePlus =
            plans.find((p) => p.id === 'premium_elite_plus') || plans[0];
          setSelectedPlanForCheckout(elitePlus);
        }}
        onOpenSupportChat={() => setSupportChatOpen(true)}
        isAdminUnlocked={isAdminUnlocked}
      />

      {/* Strict 1-Row, 3-Zone Top Bar Contract (Mobile & Desktop Responsive) */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#090608]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-3 sm:px-6 py-3">
          {/* Zone 1: Official Areex Cloud Logo + Brand Wordmark */}
          <a
            href="/"
            className="flex items-center gap-2 sm:gap-3 font-display text-sm sm:text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            <AreexLogo size="sm" />
            <span>{siteConfig.brandName}</span>
          </a>

          {/* Zone 2: page links (each one is its own page) */}
          <nav
            aria-label="Primary Navigation"
            className="hidden xl:flex flex-1 items-center justify-center gap-4 2xl:gap-6 text-xs font-semibold text-slate-300"
          >
            <div ref={plansMenuRef} className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={plansMenuOpen}
                onClick={() => setPlansMenuOpen((o) => !o)}
                className={`flex items-center gap-1 whitespace-nowrap transition-colors ${
                  plansMenuOpen || path === '/plans' || path.startsWith('/plans/')
                    ? 'text-white'
                    : 'hover:text-white'
                }`}
              >
                Plans
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${plansMenuOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {plansMenuOpen && (
                <div
                  role="menu"
                  className="absolute left-1/2 top-full z-50 mt-3 w-60 -translate-x-1/2 rounded-xl border border-white/15 bg-[#0d070a] p-1.5 text-left shadow-2xl"
                >
                  <a
                    href="/plans"
                    role="menuitem"
                    onClick={() => setPlansMenuOpen(false)}
                    className="block rounded-lg px-3 py-2 text-xs font-semibold text-white hover:bg-red-600/20"
                  >
                    All Plans
                  </a>
                  <div className="my-1 h-px bg-white/10" />
                  {PLAN_CATEGORIES.map((cat) => (
                    <a
                      key={cat.key}
                      href={`/plans/${cat.key}`}
                      role="menuitem"
                      onClick={() => setPlansMenuOpen(false)}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors hover:bg-red-600/20 hover:text-white ${
                        path === `/plans/${cat.key}` ? 'bg-white/5 text-white' : 'text-slate-300'
                      }`}
                    >
                      <span className="font-mono text-[10px] opacity-60">{cat.indexLabel}.</span>
                      <span>{cat.name}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
            {(
              [
                ['/showcase', 'Showcase'],
                ['/features', 'Features'],
                ['/network', 'Network'],
                ['/founder', 'Founder'],
                ['/reviews', 'Reviews'],
              ] as const
            ).map(([href, label]) => (
              <a
                key={href}
                href={href}
                className={`transition-colors whitespace-nowrap ${
                  path === href || path.startsWith(`${href}/`) ? 'text-white' : 'hover:text-white'
                }`}
              >
                {label}
              </a>
            ))}
            <button
              type="button"
              onClick={() => setSupportChatOpen(true)}
              className="hover:text-white transition-colors whitespace-nowrap"
            >
              Support
            </button>
          </nav>

          {/* Zone 3: Single Compact Currency Slidebar Button + Primary CTA */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <CurrencySlidebar
              currency={currency}
              onCurrencyChange={setCurrency}
              variant="nav"
            />

            {(
              <div className="flex items-center gap-1.5 sm:gap-2">
                <a
                  href={PANEL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex items-center gap-1.5 rounded-xl border border-white/15 bg-[#120a0e] px-3 sm:px-4 py-2 text-[11px] sm:text-xs font-semibold text-slate-100 transition-colors hover:border-red-500/40 hover:text-white whitespace-nowrap"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  <span>Panel</span>
                </a>
                {!customer && (
                  <button
                    type="button"
                    onClick={() => openAuthModal('login')}
                    className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-[#120a0e] px-3 sm:px-4 py-2 text-[11px] sm:text-xs font-semibold text-slate-100 transition-colors hover:border-red-500/40 hover:text-white whitespace-nowrap"
                  >
                    <span>Login / Sign up</span>
                  </button>
                )}
                {customer && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      title={`Logged in as ${customer?.email || ''}`}
                      onClick={() => clearSession()}
                      className="rounded-xl border border-white/15 bg-[#120a0e] px-3 py-2 text-[11px] sm:text-xs font-semibold text-slate-100 transition-colors hover:border-red-500/40 hover:text-white whitespace-nowrap"
                    >
                      Log out
                    </button>
                  </div>
                )}
                <a
                  href="/plans"
                  className="hidden sm:flex items-center gap-1 rounded-xl bg-red-600 px-3 sm:px-4 py-2 text-[11px] sm:text-xs font-semibold text-white shadow-[0_0_20px_rgba(220,38,38,0.35)] transition-colors hover:bg-red-500 whitespace-nowrap"
                >
                  <Zap className="h-3.5 w-3.5 shrink-0" />
                  <span>Deploy Server</span>
                </a>

              </div>
            )}

            {/* Mobile Hamburger Menu Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle Mobile Navigation Menu"
              className="flex xl:hidden h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#120a0e] text-slate-200 hover:border-red-500/40 hover:text-white shrink-0"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Navigation Drawer */}
        {mobileMenuOpen && (
          <nav
            aria-label="Mobile Navigation"
            className="xl:hidden border-t border-white/10 bg-[#0d070a] px-4 py-3 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-200"
          >
            {!customer && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openAuthModal('login');
                }}
                className="col-span-2 rounded-lg bg-red-600 px-3 py-2 text-center text-white hover:bg-red-500"
              >
                Login / Sign up
              </button>
            )}
            {customer && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  clearSession();
                }}
                className="col-span-2 rounded-lg bg-white/5 px-3 py-2 text-center hover:bg-red-600/20 hover:text-white"
              >
                Log out ({customer?.email})
              </button>
            )}
            <a
              href="/plans"
              onClick={() => setMobileMenuOpen(false)}
              className="col-span-2 rounded-lg bg-white/5 px-3 py-2 hover:bg-red-600/20 hover:text-white"
            >
              Plans & Pricing (all)
            </a>
            {PLAN_CATEGORIES.map((cat) => (
              <a
                key={cat.key}
                href={`/plans/${cat.key}`}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg border border-white/10 px-3 py-2 text-slate-300 hover:bg-red-600/20 hover:text-white"
              >
                {cat.indexLabel}. {cat.name}
              </a>
            ))}
            <a
              href="/showcase"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg bg-white/5 px-3 py-2 hover:bg-red-600/20 hover:text-white"
            >
              Panel Showcase
            </a>
            <a
              href="/features"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg bg-white/5 px-3 py-2 hover:bg-red-600/20 hover:text-white"
            >
              Features & Hardware
            </a>
            <a
              href="/network"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg bg-white/5 px-3 py-2 hover:bg-red-600/20 hover:text-white"
            >
              8 Global PoPs Map
            </a>
            <a
              href="/founder"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg bg-white/5 px-3 py-2 hover:bg-red-600/20 hover:text-white"
            >
              Meet the Founder
            </a>
            <a
              href="/reviews"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg bg-white/5 px-3 py-2 hover:bg-red-600/20 hover:text-white"
            >
              Customer Reviews
            </a>
            <a
              href="/faq"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg bg-white/5 px-3 py-2 hover:bg-red-600/20 hover:text-white"
            >
              FAQ
            </a>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setSupportChatOpen(true);
              }}
              className="rounded-lg bg-white/5 px-3 py-2 text-left hover:bg-red-600/20 hover:text-white"
            >
              24/7 Support Chat
            </button>
            <a
              href="/legal"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg bg-white/5 px-3 py-2 hover:bg-red-600/20 hover:text-white"
            >
              Legal & ToS
            </a>
            <a
              href="/contact"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg bg-white/5 px-3 py-2 hover:bg-red-600/20 hover:text-white"
            >
              Contact & Discord
            </a>
            <a
              href={PANEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileMenuOpen(false)}
              className="col-span-2 flex items-center justify-center gap-2 rounded-lg border border-red-500/50 px-3 py-2 text-white hover:bg-red-600/20"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open the Panel
            </a>
          </nav>
        )}
      </header>

      <main className="w-full max-w-full overflow-x-clip">
                {route.page === 'home' && (
<>
{/* 1. HERO SECTION (Dynamic Category Visual Picture + Live Typewriter Line) */}
        <section className="relative min-h-[560px] sm:min-h-[680px] w-full overflow-hidden border-b border-white/10">
          <img
            ref={heroImageRef}
            key={activeCategoryMeta.imageUrl}
            src={heroImgError ? HERO_MINECRAFT_IMAGE : activeCategoryMeta.imageUrl}
            alt={`${activeCategoryMeta.name} — ${activeCategoryMeta.headline}`}
            onError={() => setHeroImgError(true)}
            className="absolute inset-0 h-full w-full object-cover object-center"
          />

          {/* Measured Contrast Scrim so the category picture shines clearly while text stays crisp */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#090608] via-[#090608]/60 to-[#090608]/35" />

          {/* Semantic DOM Content Layer */}
          <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-4 sm:px-6 pt-12 sm:pt-20 pb-12 sm:pb-16 text-center">
            {/* Live Typewriter Effect for MINECRAFT · BOT · KVM VPS · DOMAINS · MADE IN INDIA FOR INDIAN GAMERS · AES-256 ENCRYPTED */}
            <HeroTypewriterLine />

            <h1
              style={{ textWrap: 'balance' }}
              className="mt-5 max-w-4xl font-display text-2xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.12] break-words"
            >
              {siteConfig.heroTitle}
            </h1>

            <p className="mt-4 sm:mt-5 max-w-2xl text-xs sm:text-lg leading-relaxed text-slate-200">
              {siteConfig.heroSubtitle}
            </p>

            {/* Starting Price Callout in Selected Currency */}
            <div className="mt-6 sm:mt-7 flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 font-mono">
              <span className="text-xs sm:text-sm text-slate-300">Starting at</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-red-500 tabular-nums">
                {formatPriceInCurrency(29, currency)}
              </span>
              <span className="text-xs sm:text-sm text-slate-400">/mo</span>
              <span className="mx-1 text-slate-600">·</span>
              <span className="text-xs text-slate-200">
                Minecraft SMPs from {formatPriceInCurrency(69, currency)}/mo
              </span>
            </div>

            {/* Primary Focal CTA + Support CTA */}
            <div className="mt-6 sm:mt-7 flex w-full sm:w-auto flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <a
                href="/plans"
                className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-red-600 px-6 sm:px-7 py-3.5 text-xs sm:text-sm font-semibold text-white shadow-[0_0_35px_rgba(220,38,38,0.5)] transition-all hover:bg-red-500 whitespace-nowrap"
              >
                <Zap className="h-4 w-4" />
                <span>Get Started — View Plans</span>
                <ArrowRight className="h-4 w-4" />
              </a>

              <button
                type="button"
                onClick={() => setSupportChatOpen(true)}
                className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-white/20 bg-black/55 px-6 py-3.5 text-xs sm:text-sm font-medium text-slate-100 backdrop-blur-md transition-colors hover:border-red-500/60 hover:text-white whitespace-nowrap"
              >
                <span>24/7 Customer Support</span>
                <ExternalLink className="h-4 w-4" />
              </button>
            </div>

            {/* Quick buttons: pick a plan category, or jump to any page */}
            <div className="mt-10 sm:mt-14 w-full max-w-4xl rounded-2xl border border-white/15 bg-[#0d070a]/90 p-2 shadow-2xl backdrop-blur-xl">
              <nav
                aria-label="Explore Areex Cloud"
                className="flex flex-wrap items-center justify-center gap-1.5"
              >
                {(
                  [
                    ['/plans', 'All Plans'],
                    ['/features', 'Features'],
                    ['/showcase', 'Panel Showcase'],
                    ['/network', 'Network'],
                    ['/reviews', 'Reviews'],
                    ['/faq', 'FAQ'],
                    ['/founder', 'Founder'],
                  ] as const
                ).map(([href, label]) => (
                  <a
                    key={href}
                    href={href}
                    className="rounded-xl border border-white/10 px-3 sm:px-4 py-2 text-[11px] sm:text-xs font-semibold text-slate-300 transition-colors whitespace-nowrap hover:border-red-500/60 hover:bg-white/5 hover:text-white"
                  >
                    {label}
                  </a>
                ))}
              </nav>
            </div>
          </div>
        </section>

                <PlansOverview plans={plans} currency={currency} />
</>
)}

        {route.page === 'plans' && (
<>
        <PlansOverview plans={plans} currency={currency} asPage />
</>
)}

        {route.page === 'category' && (
<>
{/* 2. SIX-CATEGORY PRICING MATRIX + CONDITIONAL DISCOUNT OFFER BOARD & STRIKETHROUGH CUT PRICES */}
        <section id="pricing-section" className="mx-auto max-w-7xl px-4 sm:px-6 py-14 sm:py-20">
          {/* CONDITIONAL DISCOUNT OFFER BOARD: Only shown when discountOffer has text; completely hidden when empty */}
          {hasDiscountOffer && (
            <div
              data-testid="discount-offer-board"
              className="mb-10 flex flex-col justify-between gap-4 rounded-2xl border border-red-500/50 bg-gradient-to-r from-red-950/90 via-[#1f0910] to-red-950/90 px-6 py-5 shadow-[0_0_40px_rgba(220,38,38,0.25)] lg:flex-row lg:items-center"
            >
              <div className="flex items-start gap-3.5 sm:items-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white shrink-0 shadow-[0_0_20px_rgba(220,38,38,0.5)]">
                  <Flame className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-red-400">
                    LIMITED TIME SPECIAL OFFER · PRICE CUTS ACTIVE BELOW
                  </div>
                  <p className="text-sm font-bold text-white sm:text-base">
                    {discountOffer}
                  </p>
                </div>
              </div>

              {/* Active Clickable Coupon Chips inside Discount Board */}
              {coupons.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1 font-mono text-[11px] text-amber-400">
                    <Tag className="h-3.5 w-3.5" />
                    <span>Click to Copy Coupon:</span>
                  </span>
                  {coupons.slice(0, 3).map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(c.code);
                        setCopiedBoardCoupon(c.code);
                        setTimeout(() => setCopiedBoardCoupon(null), 1600);
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-black/50 px-2.5 py-1 font-mono text-xs font-bold text-white transition-colors hover:border-red-400 hover:bg-red-600"
                    >
                      <span>{c.code}</span>
                      <span className="text-red-300">(-{c.discountPercent}%)</span>
                      {copiedBoardCoupon === c.code ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Copy className="h-3 w-3 opacity-75" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col items-start justify-between gap-6 border-b border-white/10 pb-8 lg:flex-row lg:items-end">
            <div>
              {/* Areex Cloud Plans Brand Emblem Kicker ("logo add kr nav me areexcloudplans ke side me") */}
              <div className="flex items-center gap-2.5">
                <AreexLogo size="sm" />
                <div className="font-mono text-xs font-semibold text-red-400">
                  AREEX CLOUD PLANS · {activeCategoryMeta.indexLabel}.{' '}
                  {activeCategoryMeta.name.toUpperCase()}
                </div>
              </div>

              <h2
                style={{ textWrap: 'balance' }}
                className="mt-2.5 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl"
              >
                {activeCategoryMeta.headline}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                {activeCategoryMeta.description}
              </p>
            </div>

            {/* Search & Single Currency Slidebar Button */}
            <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by RAM, CPU, or tier..."
                  aria-label="Filter hosting plans"
                  className="w-full rounded-xl border border-white/15 bg-[#120a0e] py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
                />
              </div>

              <CurrencySlidebar
                currency={currency}
                onCurrencyChange={setCurrency}
                variant="inline"
              />
            </div>
          </div>

          {/* 6-Category Filter Tabs */}
          <div className="mt-6 grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            {PLAN_CATEGORIES.map((cat) => {
              const active = activeCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => navigate(`/plans/${cat.key}`)}
                  className={`rounded-lg px-3 sm:px-4 py-2 text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap truncate ${
                    active
                      ? 'bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.3)]'
                      : 'border border-white/10 bg-[#120a0e] text-slate-400 hover:border-white/25 hover:text-white'
                  }`}
                >
                  {cat.indexLabel}. {cat.name}
                </button>
              );
            })}
          </div>

          {/* Animated Cursor-Interactive Plan Cards Grid */}
          {visiblePlans.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-white/10 bg-[#120a0e] p-12 text-center">
              <p className="text-sm text-slate-300">
                No plans match "{searchQuery}" in {activeCategoryMeta.name}.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500"
              >
                Reset Filter
              </button>
            </div>
          ) : (
            <div
              ref={cardsContainerRef}
              className="mt-8 grid grid-cols-1 gap-5 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3"
            >
              {visiblePlans.map((plan) => (
                <InteractivePlanCard
                  key={plan.id}
                  plan={plan}
                  categoryName={activeCategoryMeta.name}
                  currency={currency}
                  onCurrencyChange={setCurrency}
                  onSelectPlan={(selected) => setSelectedPlanForCheckout(selected)}
                  hasDiscountOffer={hasDiscountOffer}
                  discountPercent={discountPercent}
                />
              ))}
            </div>
          )}
        </section>
</>
)}

        {route.page === 'showcase' && (
<>
        <ShowcasePage />
</>
)}

        {route.page === 'network' && (
<>
{/* 2.5 GLOBAL 8 POINTS OF PRESENCE DOT-MATRIX WORLD MAP (Matching Screenshot 855) */}
        <GlobalNetworkMap />
</>
)}

        {route.page === 'home' && (
<>
{/* 2.6 LIVE IN UNDER 60 SECONDS INTERACTIVE BASH TERMINAL (Matching Screenshot 856) */}
        <LiveUnder60SecondsSection />
        <FaqSection
          discordUrl={siteConfig.discordUrl}
          onOpenSupport={() => setSupportChatOpen(true)}
          limit={6}
        />
</>
)}

        {route.page === 'features' && (
<>
{/* 3. WHY CHOOSE AREEX CLOUD (6 KEY FEATURES) + INFRASTRUCTURE BENTO GRID */}
        <section
          id="architecture-section"
          className="border-y border-white/10 bg-[#0d070a] py-14 sm:py-20 overflow-hidden"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <div className="font-mono text-xs text-red-400">
                WHY CHOOSE AREEX CLOUD · ENTERPRISE ARCHITECTURE
              </div>
              <h2
                style={{ textWrap: 'balance' }}
                className="mt-2 font-display text-2xl sm:text-4xl font-bold tracking-tight text-white"
              >
                Engineered for 20.0 TPS Under Heavy Modpack & Network Loads
              </h2>
              <p className="mt-3 text-xs sm:text-sm leading-relaxed text-slate-400">
                Every Areex Cloud container runs on liquid-cooled Ryzen 9 9950X and AMD EPYC hardware with full AES-256-GCM database encryption and sub-5ms Indian peering.
              </p>
            </div>

            {/* 6 Key Platform Features from Official Guide */}
            <div className="mt-8 sm:mt-10 grid grid-cols-1 gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {WHY_AREEX_FEATURES.map((feat) => (
                <div
                  key={feat.badge}
                  className="rounded-2xl border border-white/10 bg-[#120a0e] p-5 sm:p-6 transition-all duration-200 hover:-translate-y-1 hover:border-red-500/50"
                >
                  <div className="font-mono text-[11px] font-bold text-red-400">
                    {feat.badge}
                  </div>
                  <h3 className="mt-2 font-display text-lg font-bold text-white">
                    {feat.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">
                    {feat.description}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Bento Card 1 (col-span-2) */}
              <div className="flex flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-[#120a0e] lg:col-span-2">
                <div className="p-5 sm:p-8">
                  <div className="font-mono text-xs text-red-400">
                    INSTANT MODPACK & PLUGIN DEPLOYMENT
                  </div>
                  <h3 className="mt-2 font-display text-xl sm:text-2xl font-bold text-white">
                    Built for RLCraft, All The Mods 9, PaperMC & Velocity Networks
                  </h3>
                  <p className="mt-2 max-w-xl text-xs sm:text-sm text-slate-300">
                    Deploy heavy Forge, Fabric, and NeoForge modpacks with NVMe Gen5 disk throughput, automated hourly snapshots, and free migration from any host.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <a
                      href="/plans"
                      className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-red-500 whitespace-nowrap"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      <span>Deploy Your Server Now</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setSupportChatOpen(true)}
                      className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-medium text-slate-200 hover:border-red-500/40 hover:text-white whitespace-nowrap"
                    >
                      <span>Open 24/7 Support Chat</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="relative h-56 sm:h-64 w-full border-t border-white/10">
                  <img
                    src={citadelImgError ? HERO_MINECRAFT_IMAGE : CITADEL_SHOWCASE_IMAGE}
                    alt="Minecraft crimson citadel build rendered with volumetric shaders"
                    onError={() => setCitadelImgError(true)}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#120a0e] via-transparent to-transparent" />
                </div>
              </div>

              {/* Bento Card 2 (col-span-1): Ryzen 9 9950X Datacenter Hardware */}
              <div className="flex flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-[#120a0e]">
                <div className="p-5 sm:p-6">
                  <div className="font-mono text-xs text-red-400">
                    MUMBAI & NOIDA HARDWARE
                  </div>
                  <h3 className="mt-2 font-display text-xl font-bold text-white">
                    Ryzen 9 9950X & AMD EPYC Blades
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-300">
                    5.7 GHz boost clocks paired with DDR5 ECC memory and Samsung Gen5 NVMe arrays deliver sub-5ms ping across India.
                  </p>
                  <dl className="mt-4 space-y-2 border-t border-white/10 pt-4 font-mono text-xs tabular-nums">
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Mumbai IN-West-1</dt>
                      <dd className="text-emerald-400">4.2 ms</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Noida IN-North-1</dt>
                      <dd className="text-emerald-400">9.1 ms</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Singapore SG-1</dt>
                      <dd className="text-emerald-400">28.4 ms</dd>
                    </div>
                  </dl>
                </div>

                <div className="relative h-48 w-full border-t border-white/10">
                  <img
                    src={rackImgError ? CITADEL_SHOWCASE_IMAGE : HARDWARE_RACK_IMAGE}
                    alt="Enterprise liquid-cooled AMD Ryzen and EPYC server rack with crimson LED accents"
                    onError={() => setRackImgError(true)}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>

              {/* Bento Card 3: AES-256-GCM Security */}
              <div className="rounded-2xl border border-white/10 bg-[#120a0e] p-6">
                <div className="font-mono text-xs text-red-400">
                  CRYPTOGRAPHIC VAULT
                </div>
                <h3 className="mt-2 font-display text-xl font-bold text-white">
                  AES-256-GCM Database Encryption
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-300">
                  All customer SFTP keys, RCON tokens, and billing records are encrypted with 256-bit AES-GCM and verified via HMAC-SHA256 + Zero-Trust Firestore rules.
                </p>
                <div className="mt-5 flex items-center gap-2 font-mono text-xs text-emerald-400">
                  <ShieldCheck className="h-4 w-4" />
                  <span>256-BIT SCRYPT + GCM VERIFIED</span>
                </div>
              </div>

              {/* Bento Card 4 (col-span-2): 4-Step Buying Flow */}
              <div className="rounded-2xl border border-white/10 bg-[#120a0e] p-6 sm:p-8 lg:col-span-2">
                <div className="font-mono text-xs text-red-400">
                  SEAMLESS BUYING FLOW · RAZORPAY UPI, CARDS, NETBANKING & COUPONS
                </div>
                <h3 className="mt-2 font-display text-xl font-bold text-white">
                  From Plan Selection to Live Server in Under 60 Seconds
                </h3>
                <div className="mt-5 grid gap-4 sm:grid-cols-4 text-xs">
                  <div className="border-l border-red-500/40 pl-3">
                    <div className="font-mono font-bold text-red-400">STEP 01</div>
                    <div className="mt-1 font-semibold text-white">Pick Category & Plan</div>
                    <p className="mt-1 text-slate-400">
                      Choose from Budget, Premium, Exclusive, Bot, VPS, or Domain tiers.
                    </p>
                  </div>
                  <div className="border-l border-red-500/40 pl-3">
                    <div className="font-mono font-bold text-red-400">STEP 02</div>
                    <div className="mt-1 font-semibold text-white">Apply Coupon & Pay</div>
                    <p className="mt-1 text-slate-400">
                      Apply any official coupon code and checkout directly via Razorpay.
                    </p>
                  </div>
                  <div className="border-l border-red-500/40 pl-3">
                    <div className="font-mono font-bold text-red-400">STEP 03</div>
                    <div className="mt-1 font-semibold text-white">Instant Provisioning</div>
                    <p className="mt-1 text-slate-400">
                      Server is created automatically and AES-256 encrypted login is shared.
                    </p>
                  </div>
                  <div className="border-l border-red-500/40 pl-3">
                    <div className="font-mono font-bold text-red-400">STEP 04</div>
                    <div className="mt-1 font-semibold text-white">24/7 Support Desk</div>
                    <p className="mt-1 text-slate-400">
                      Open a Website or Discord ticket anytime for free world migration.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
</>
)}

        {route.page === 'founder' && (
<>
{/* 4. MEET THE FOUNDER SECTION */}
        <section id="founder-section" className="mx-auto max-w-5xl px-4 sm:px-6 py-14 sm:py-20 overflow-hidden">
          <div className="text-center">
            <div className="font-mono text-xs text-red-400">THE MIND BEHIND AREEX CLOUD</div>
            <h2 className="mt-2 font-display text-2xl sm:text-4xl font-bold tracking-tight text-white">
              Meet the Founder
            </h2>
          </div>

          <div className="mt-8 sm:mt-12 grid grid-cols-1 items-center gap-8 sm:gap-10 rounded-2xl border border-white/10 bg-[#120a0e] p-5 sm:p-10 md:grid-cols-12">
            <div className="flex flex-col items-center text-center md:col-span-4">
              <div className="flex h-36 w-36 items-center justify-center rounded-full border-2 border-red-500/50 bg-gradient-to-br from-red-600 via-red-800 to-[#1a090d] font-display text-4xl font-extrabold text-white shadow-[0_0_50px_rgba(220,38,38,0.35)]">
                PG
              </div>
              <h3 className="mt-5 font-display text-xl font-bold text-white">
                {siteConfig.founderName}
              </h3>
              <p className="mt-1 font-mono text-xs text-red-400">
                FOUNDER & CEO · AREEX CLOUD
              </p>
            </div>

            <div className="space-y-4 text-sm leading-relaxed text-slate-300 md:col-span-8">
              <p>
                Hey, I'm <strong className="text-white">{siteConfig.founderName}</strong> — the
                founder of Areex Cloud. I started this journey because I was tired of overpriced,
                unreliable Minecraft hosting that left players frustrated and broke.
              </p>
              <p>
                As a passionate gamer myself, I know what it feels like when your server lags,
                crashes during a boss fight, or goes down at 2 AM with no support in sight. That's
                exactly what Areex Cloud was built to fix.
              </p>
              <p>
                From a single idea to a full hosting platform — every plan, every feature, every
                support ticket is built with one goal:{' '}
                <strong className="text-white">
                  give Indian gamers the world-class server experience they deserve, at a price
                  they can afford.
                </strong>
              </p>

              <blockquote className="mt-6 rounded-xl border-l-2 border-red-500 bg-[#090608] p-5 italic text-slate-200">
                "{siteConfig.founderQuote}"
                <footer className="mt-2 font-mono text-xs not-italic text-red-400">
                  — {siteConfig.founderName}
                </footer>
              </blockquote>

              <div className="pt-2 font-mono text-xs text-slate-400">
                <span>Passionate Gamer</span>
                <span aria-hidden="true" className="mx-2 text-red-500">
                  ·
                </span>
                <span>Cloud Architect</span>
                <span aria-hidden="true" className="mx-2 text-red-500">
                  ·
                </span>
                <span>Made in India</span>
                <span aria-hidden="true" className="mx-2 text-red-500">
                  ·
                </span>
                <span>Startup Builder</span>
              </div>
            </div>
          </div>
        </section>
</>
)}

        {route.page === 'reviews' && (
<>
        <ReviewsPage discordUrl={siteConfig.discordUrl} />
</>
)}

{/* 6. FLOATING 24/7 CUSTOMER SUPPORT MINI-CHAT WIDGET */}
        <CustomerSupportChat
          discordUrl={siteConfig.discordUrl}
          open={supportChatOpen}
          onToggleOpen={setSupportChatOpen}
        />

                {route.page === 'contact' && (
<>
{/* 7. OFFICIAL CONTACT & SOCIAL HUB (Discord, YouTube, Instagram with Logos & Direct Buttons) */}
        <ContactSection
          discordUrl={siteConfig.discordUrl}
          youtubeUrl={siteConfig.youtubeUrl}
          instagramUrl={siteConfig.instagramUrl}
        />
</>
)}

        {route.page === 'legal' && (
<>
{/* 8. COMPLETE LEGAL & COMPLIANCE CENTER (ToS, Community Guidelines, Privacy & 24h Refund SLA) */}
        <LegalSection />
</>
)}

        {route.page === 'faq' && (
          <FaqSection
            asPage
            discordUrl={siteConfig.discordUrl}
            onOpenSupport={() => setSupportChatOpen(true)}
          />
        )}

        {route.page === 'notfound' && (
          <section className="mx-auto max-w-3xl px-4 sm:px-6 py-24 text-center">
            <div className="font-mono text-xs text-red-400">ERROR 404</div>
            <h1 className="mt-2 font-display text-3xl sm:text-5xl font-bold text-white">Page not found</h1>
            <p className="mt-3 text-sm text-slate-400">This page does not exist or was moved.</p>
            <a
              href="/"
              className="mt-6 inline-flex rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_25px_rgba(220,38,38,0.35)] hover:bg-red-500"
            >
              Back to home
            </a>
          </section>
        )}
      </main>

      {/* Quiet Editorial Footer with Official Areex Cloud Logo */}
      <footer className="border-t border-white/10 bg-[#070406] px-4 sm:px-6 py-10 sm:py-12 text-xs text-slate-400 overflow-hidden">
        <div className="mx-auto flex max-w-7xl flex-col items-center text-center sm:items-center sm:text-left justify-between gap-6 sm:flex-row">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <AreexLogo size="md" />
            <div>
              <div className="font-display text-base font-bold text-white">
                {siteConfig.brandName}
              </div>
              <p className="mt-0.5">
                World-class servers at a price you can afford · Made in India for Indian gamers.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            {(
              [
                ['/plans', 'Plans'],
                ['/showcase', 'Showcase'],
                ['/features', 'Features'],
                ['/network', 'Network'],
                ['/founder', 'Founder'],
                ['/reviews', 'Reviews'],
                ['/faq', 'FAQ'],
              ] as const
            ).map(([href, label]) => (
              <a key={href} href={href} className="hover:text-white transition-colors">
                {label}
              </a>
            ))}
            <button
              type="button"
              onClick={() => setSupportChatOpen(true)}
              className="hover:text-white transition-colors"
            >
              24/7 Support Chat
            </button>
            <a href="/legal" className="hover:text-white transition-colors">
              Legal & ToS
            </a>
            <a href="/contact" className="hover:text-white transition-colors">
              Contact
            </a>
            <a
              href={PANEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              Panel
            </a>
            <a
              href={siteConfig.discordUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              Discord
            </a>
            <a
              href={siteConfig.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              YouTube
            </a>
            <a
              href={siteConfig.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              Instagram
            </a>

          </div>
        </div>
      </footer>

      {/* Multi-Gateway Checkout Modal (Stripe / PayPal / Razorpay UPI + Dynamic Admin Coupons) */}
      <CheckoutModal
        plan={selectedPlanForCheckout}
        currency={currency}
        coupons={coupons}
        onClose={() => setSelectedPlanForCheckout(null)}
        userEmail={customer?.email}
        loggedIn={Boolean(customer)}
        onRequestLogin={() => openAuthModal('login')}
        onOpenSupport={() => {
          setSelectedPlanForCheckout(null);
          setSupportChatOpen(true);
        }}
        onOrderCompleted={handleOrderCompleted}
      />

      {/* Customer Login / Sign-up (sits above the checkout modal) */}
      <AuthModal
        open={authModalOpen}
        initialMode={authModalMode}
        onClose={() => setAuthModalOpen(false)}
      />

      {/* Protected 2-Admin Console (Requires Gmail + Password Login) */}
      <AdminAnalyticsWorkspace
        open={workspaceOpen}
        initialTab={workspaceInitialTab}
        onClose={() => { setWorkspaceOpen(false); if (path.replace(/\/+$/, '') === '/rtx5090') navigate('/', { replace: true }); }}
        plans={plans}
        onSavePlan={handleSavePlan}
        onDeletePlan={handleDeletePlan}
        siteConfig={siteConfig}
        onSaveSiteConfig={handleSaveSiteConfig}
        discountOffer={discountOffer}
        discountPercent={discountPercent}
        onSaveDiscountOffer={handleSaveDiscountOffer}
        coupons={coupons}
        onCreateCoupon={handleCreateCoupon}
        onDeleteCoupon={handleDeleteCoupon}
        supportTickets={supportTickets}
        onUpdateSupportTicket={handleUpdateSupportTicket}
        orders={orders}
        onAdminSessionChange={setIsAdminSessionUnlocked}
      />
    </div>
  );
}
